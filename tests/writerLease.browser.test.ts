/**
 * `tests/writerLease.browser.test.ts` — the session writer lease vs the per-write mutex.
 *
 * THE DEFECT THIS PINS. `acquireWriterLease` holds `fm:project:<id>` **exclusively for the whole
 * editor session** (build spec §5.8d), and `writeAtomic` / `cleanStaleTmp` requested **the same
 * lock name** (§5.3). Web Locks are not reentrant and a request for a held lock queues, so the
 * moment the editor is mounted, every atomic write for that project waits forever: no rejection,
 * no timeout, nothing to report. Found while chasing an owner-reported capture that hung on
 * «Adding…» — a hang, not a failure, which is exactly what a queued lock looks like from the UI.
 *
 * WHY THE SUITE COULD NOT SEE IT. Six browser suites mock `acquireWriterLease` away
 * (`vi.fn(async () => ({ held: true, release: vi.fn() }))`), and the only real test of the lease
 * (`tests/projectStore.test.ts`) exercises two leases against each other — never a lease plus a
 * write. So nothing ever held the real lock while writing. This file uses the REAL store against
 * a real OPFS directory and real Web Locks: **no mocks at all**.
 */
import { describe, expect, it } from 'vitest';
import {
  acquireWriterLease,
  cleanStaleTmp,
  withWriteLock,
  writeAtomic,
  writeLockName,
} from '../src/fs/projectStore';

const BUDGET_MS = 2000;

async function probeDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('writer-lease-probe', { create: true });
}

/** `'settled'` if `promise` settles within the budget, else `'TIMEOUT'`. */
async function within(promise: Promise<unknown>): Promise<'settled' | 'TIMEOUT'> {
  return Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise<'TIMEOUT'>((resolve) => window.setTimeout(() => resolve('TIMEOUT'), BUDGET_MS)),
  ]);
}

describe('the session writer lease must not block the writes it guards', () => {
  it('a write settles while the lease is held (before the fix: queued forever)', async () => {
    const dir = await probeDir();
    const scope = 'lease-probe:one';

    // Control: with no lease held the same write settles, so the assertion below is not vacuous.
    expect(await within(writeAtomic(dir, 'control.txt', 'x', scope))).toBe('settled');

    const lease = await acquireWriterLease(scope);
    expect(lease?.held).toBe(true);
    try {
      // THE DEADLOCK: the write asked for the very lock the lease holds for the session.
      expect(await within(writeAtomic(dir, 'under-lease.txt', 'x', scope))).toBe('settled');
      // …and the same for the tmp reaper the editor runs immediately after taking the lease.
      expect(await within(cleanStaleTmp(dir, scope))).toBe('settled');
    } finally {
      lease?.release();
    }
  });

  it('a write that cannot get the mutex gives up — and never runs late', async () => {
    // The other half of the D121 shape: `navigator.locks.request` queues silently, so a write
    // that cannot get the mutex used to wait forever and report nothing. The acquisition is now
    // bounded AND aborted — aborting matters, because a queued write that was reported as failed
    // and then ran would land behind the caller's back (duplicating work the caller retried).
    const scope = 'lease-probe:three';
    void navigator.locks.request(writeLockName(scope), () => new Promise(() => {})); // a stuck holder

    let ran = false;
    await expect(
      withWriteLock(
        scope,
        async () => {
          ran = true;
        },
        150,
      ),
    ).rejects.toMatchObject({ kind: 'target-locked' });
    expect(ran).toBe(false);

    // The control: with no holder the same call runs, so the assertion above is not vacuous.
    expect(await withWriteLock(scope + ':free', async () => 'ok', 150)).toBe('ok');
  });

  it('the lease is CROSS-TAB arbitration: a same-client re-request is granted (executed fact)', async () => {
    // Chromium grants an `ifAvailable` re-request from the client that already holds the lock,
    // so `acquireWriterLease` twice inside ONE tab yields two leases. That is harmless (one tab
    // is one writer) and it is pinned here because §5.8d's exclusion is about what a SECOND TAB
    // sees: the store's intent (second acquire → null) is pinned against the fake in
    // tests/projectStore.test.ts, and the real cross-tab case is a hardware/browser check. This
    // records the real API's same-client behaviour so nobody "fixes" the store on a wrong
    // assumption — the probe below is the executed evidence.
    const scope = 'lease-probe:two';
    const first = await acquireWriterLease(scope);
    expect(first?.held).toBe(true);
    try {
      const probe = await navigator.locks.request(
        'fm:project:' + scope,
        { mode: 'exclusive', ifAvailable: true },
        () => 'GRANTED',
      );
      expect(probe).toBe('GRANTED');

      const second = await acquireWriterLease(scope);
      expect(second?.held).toBe(true);
      second?.release();
    } finally {
      first?.release();
    }
  });
});
