/**
 * tests/persistQueue.test.ts — slice 1.2, build order step 9 (session-4 gap P2).
 *
 * §5.4/§5.8: coalesce 400 ms per (projectId, sheetId) → serialize per key → write →
 * back off 1s/3s/10s → park (never retry forever) → flush on pagehide/visibilitychange.
 * Fake timers drive the 400 ms window and the backoff schedule; the write itself is
 * injected, so no platform API is needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COALESCE_MS,
  RETRY_BACKOFF_MS,
  attachFlushListeners,
  createPersistQueue,
  type FlushEventTarget,
  type PersistStatus,
  type PersistTarget,
} from '../src/state/persistQueue';
import { StorageWriteError } from '../src/fs/projectStore';
import type { MarkupFile } from '../src/domain/schema';
import { validMarkupFile, validProjectFile } from './fakes/fsa';

type WriteFn = (target: PersistTarget, data: unknown) => Promise<void>;

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the chained write promises run (fake timers do not flush those on their own). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** A markup payload tagged with an edit number so the LAST edit is identifiable. */
function edit(n: number): MarkupFile {
  return { ...validMarkupFile('sheet-1'), schemaVersion: n };
}

function okWrite(): ReturnType<typeof vi.fn<WriteFn>> {
  return vi.fn<WriteFn>(async () => undefined);
}

function fakeEventTarget(): FlushEventTarget & {
  fire(type: string): void;
  setVisibility(state: string): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    document: { visibilityState: 'visible' },
    addEventListener(type: string, listener: () => void): void {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void): void {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string): void {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    setVisibility(state: string): void {
      target.document.visibilityState = state;
    },
  };
  return target;
}

describe('coalescing (§5.4)', () => {
  it('10 rapid edits produce exactly ONE write, 400 ms after the last', async () => {
    vi.useFakeTimers();
    const write = okWrite();
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    for (let i = 0; i < 9; i += 1) {
      queue.queueSheet('p1', 'sheet-1', edit(i));
      await vi.advanceTimersByTimeAsync(50); // faster than the coalescing window
    }
    queue.queueSheet('p1', 'sheet-1', edit(9)); // the 10th and last edit

    await vi.advanceTimersByTimeAsync(COALESCE_MS - 1);
    await settle();
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    // The payload is the LAST edit, not the first.
    expect((write.mock.calls[0][1] as MarkupFile).schemaVersion).toBe(9);
  });

  it('two sheets write on two independent chains', async () => {
    vi.useFakeTimers();
    const write = okWrite();
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    queue.queueSheet('p1', 'sheet-2', validMarkupFile('sheet-2'));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();

    expect(write).toHaveBeenCalledTimes(2);
    const keys = write.mock.calls.map((call) => (call[0] as { sheetId?: string }).sheetId);
    expect(new Set(keys)).toEqual(new Set(['sheet-1', 'sheet-2']));
  });

  it('a project meta edit and a sheet edit are separate keys', async () => {
    vi.useFakeTimers();
    const write = okWrite();
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueProject('p1', validProjectFile({ title: 'Renamed' }));
    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();

    expect(write).toHaveBeenCalledTimes(2);
    const kinds = write.mock.calls.map((call) => call[0].kind).sort();
    expect(kinds).toEqual(['project', 'sheet']);
  });
});

describe('status ownership (never «Saved» optimistically)', () => {
  it('reports saving while a write is in flight and saved only after it resolves', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = vi.fn<WriteFn>(() => gate);
    const queue = createPersistQueue({ write, autoAttachFlush: false });
    const seen: PersistStatus[] = [];
    queue.subscribe((status) => seen.push(status));

    expect(queue.status).toBe('saved');
    expect(queue.inFlight).toBe(false);

    queue.queueProject('p1', validProjectFile());
    expect(queue.inFlight).toBe(true); // queued → 1.11's update toast is suppressed

    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.status).toBe('saving');
    expect(seen).not.toContain('saved');

    release();
    await settle();
    expect(queue.status).toBe('saved');
    expect(queue.inFlight).toBe(false);
    expect(seen).toEqual(['saving', 'saved']);
  });

  it('subscribers can unsubscribe', () => {
    const queue = createPersistQueue({ write: async () => undefined, autoAttachFlush: false });
    const seen: PersistStatus[] = [];
    const off = queue.subscribe((status) => seen.push(status));
    off();
    queue.queueProject('p1', validProjectFile());
    expect(seen).toEqual([]);
  });
});

describe('failure handling (§5.4 / §5.8a-b)', () => {
  it('backoff is 1s/3s/10s, then the write parks and never retries again', async () => {
    vi.useFakeTimers();
    const write = vi.fn<WriteFn>(async () => {
      throw new StorageWriteError('target-locked', new Error('locked'));
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    await vi.advanceTimersByTimeAsync(COALESCE_MS); // attempt 1 (after the 400 ms coalesce)
    await settle();
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0]); // attempt 2 (+1 s)
    await settle();
    expect(write).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[1]); // attempt 3 (+3 s)
    await settle();
    expect(write).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[2]); // attempt 4 (+10 s)
    await settle();
    expect(write).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(10 * 60_000); // parked: no 5th attempt, ever
    await settle();
    expect(write).toHaveBeenCalledTimes(4);
    // §5.8b: a locked rename target ends in the chip's «File is open in another app — Retry».
    expect(queue.status).toBe('error');
  });

  it('an unknown failure parks in pending after the backoff budget (§5.4)', async () => {
    vi.useFakeTimers();
    const write = vi.fn<WriteFn>(async () => {
      throw new Error('mystery');
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    await vi.advanceTimersByTimeAsync(
      COALESCE_MS + RETRY_BACKOFF_MS[0] + RETRY_BACKOFF_MS[1] + RETRY_BACKOFF_MS[2],
    );
    await settle();

    expect(write).toHaveBeenCalledTimes(4);
    expect(queue.status).toBe('pending');

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settle();
    expect(write).toHaveBeenCalledTimes(4);
  });

  it('disk full parks IMMEDIATELY — no backoff budget is consumed (§5.8a)', async () => {
    vi.useFakeTimers();
    const write = vi.fn<WriteFn>(async () => {
      throw new StorageWriteError('disk-full', new Error('quota'));
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();

    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.status).toBe('full');

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settle();
    expect(write).toHaveBeenCalledTimes(1); // parked, not retried
  });

  it('a permission failure parks in the §5.2 reconnect state without retrying', async () => {
    vi.useFakeTimers();
    const write = vi.fn<WriteFn>(async () => {
      throw new StorageWriteError('permission', new Error('denied'));
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueProject('p1', validProjectFile());
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();

    expect(queue.status).toBe('pending'); // chip: «Pending — folder offline» + Locate folder…
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('a failed edit is never dropped: flush() retries it and can then succeed', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const write = vi.fn<WriteFn>(async () => {
      attempts += 1;
      if (attempts === 1) throw new StorageWriteError('disk-full', new Error('quota'));
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueProject('p1', validProjectFile({ title: 'Kept' }));
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await settle();
    expect(queue.status).toBe('full');

    await queue.flush(); // the chip's Retry
    await settle();

    expect(write).toHaveBeenCalledTimes(2);
    expect((write.mock.calls[1][1] as { project: { title: string } }).project.title).toBe('Kept');
    expect(queue.status).toBe('saved');
  });
});

describe('flush()', () => {
  it('writes immediately (no 400 ms wait) and resolves only after the write settles', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = vi.fn<WriteFn>(() => gate);
    const queue = createPersistQueue({ write, autoAttachFlush: false });

    queue.queueProject('p1', validProjectFile());
    expect(write).not.toHaveBeenCalled();

    const flushing = queue.flush();
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(write).toHaveBeenCalledTimes(1); // immediate, well before COALESCE_MS

    let settled = false;
    void flushing.then(() => {
      settled = true;
    });
    await settle();
    expect(settled).toBe(false); // still waiting on the write promise

    release();
    await flushing;
    expect(settled).toBe(true);
    expect(queue.status).toBe('saved');
  });

  it('resolves even when the write fails (pagehide must never throw)', async () => {
    vi.useFakeTimers();
    const write = vi.fn<WriteFn>(async () => {
      throw new StorageWriteError('disk-full', new Error('quota'));
    });
    const queue = createPersistQueue({ write, autoAttachFlush: false });
    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));

    await expect(queue.flush()).resolves.toBeUndefined();
    expect(queue.status).toBe('full');
  });
});

describe('pagehide / visibilitychange flush (§5.4)', () => {
  it('flushes on visibilitychange→hidden, not on visible, and detaches', async () => {
    const write = okWrite();
    const queue = createPersistQueue({ write, autoAttachFlush: false });
    const target = fakeEventTarget();
    const detach = attachFlushListeners(queue, target);

    queue.queueSheet('p1', 'sheet-1', validMarkupFile('sheet-1'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(write).not.toHaveBeenCalled(); // still inside the coalescing window

    target.fire('visibilitychange'); // document is 'visible' → no flush
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(write).not.toHaveBeenCalled();

    target.setVisibility('hidden');
    target.fire('visibilitychange');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(write).toHaveBeenCalledTimes(1);

    detach();
    target.fire('pagehide');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(write).toHaveBeenCalledTimes(1); // detached
  });

  it('pagehide flushes the last debounced edit', async () => {
    const write = okWrite();
    const queue = createPersistQueue({ write, autoAttachFlush: false });
    const target = fakeEventTarget();
    attachFlushListeners(queue, target);

    queue.queueProject('p1', validProjectFile());
    target.fire('pagehide');
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(write).toHaveBeenCalledTimes(1);
  });
});
