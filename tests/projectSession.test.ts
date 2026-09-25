/**
 * R5 (D144): `ProjectSession`, one owner per open project for the persist queue, the lease, the
 * channel and the open-project registration.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  SessionClosedError,
  acquireProjectSession,
  openProjectSession,
  type ProjectSessionDeps,
} from '@/fs/projectSession';
import { FakeDir, asDir, validProjectFile } from './fakes/fsa';

let n = 0;
/** A fresh key per test: sessions are module-level and refcounted by key. */
const nextKey = () => `p${++n}:Folder${n}`;

function makeDeps(log: string[], projectDir: FakeDir): ProjectSessionDeps {
  return {
    acquireWriterLease: vi.fn(async () => ({
      held: true as const,
      release: () => log.push('lease.release'),
    })),
    openProjectChannel: vi.fn(() => ({ post: vi.fn(), close: () => log.push('channel.close') })),
    resolveOpenProjectDir: vi.fn(async () => asDir(projectDir)),
    registerOpenProject: vi.fn(() => log.push('register')),
    clearOpenProject: vi.fn(() => log.push('clear')),
    // No pagehide/visibilitychange listeners in node.
    queue: { autoAttachFlush: false },
  };
}

describe('ProjectSession (R5)', () => {
  it('close() lands a pending coalesced write BEFORE it releases the lease and deregisters', async () => {
    const log: string[] = [];
    const dir = new FakeDir('Folder');
    const key = nextKey();
    const session = await openProjectSession(key, 'Folder', makeDeps(log, dir));
    expect(session.lease()).not.toBeNull();

    session.persist.queueProject(key, validProjectFile());
    // Still inside the 400 ms coalesce window: nothing on disk yet.
    expect(dir.has('project.json')).toBe(false);

    await session.close();
    expect(dir.has('project.json')).toBe(true);
    expect(log).toEqual(['register', 'channel.close', 'lease.release', 'clear']);
  });

  it('two sessions for one key share ONE queue, and only the last close tears down', async () => {
    const log: string[] = [];
    const dir = new FakeDir('Folder');
    const key = nextKey();
    const deps = makeDeps(log, dir);
    const a = await openProjectSession(key, 'Folder', deps);
    const b = await openProjectSession(key, 'Folder', deps);
    expect(b.persist).toBe(a.persist);
    expect(deps.acquireWriterLease).toHaveBeenCalledTimes(1);
    expect(deps.registerOpenProject).toHaveBeenCalledTimes(1);

    await a.close();
    expect(log).not.toContain('lease.release');
    // Closing the same reference twice must not steal the other reference's count.
    await a.close();
    expect(log).not.toContain('lease.release');

    await b.close();
    expect(log.filter((e) => e === 'lease.release')).toHaveLength(1);
    expect(log).toContain('clear');
  });

  it('after the last close, dir() (and so any write) rejects with a typed error', async () => {
    const log: string[] = [];
    const key = nextKey();
    const session = await openProjectSession(key, 'Folder', makeDeps(log, new FakeDir('Folder')));
    await session.close();
    await expect(session.dir()).rejects.toBeInstanceOf(SessionClosedError);
  });

  it('a re-open racing a close waits for it, gets a fresh queue, and stays registered', async () => {
    const log: string[] = [];
    const dir = new FakeDir('Folder');
    const key = nextKey();
    const deps = makeDeps(log, dir);
    const first = await openProjectSession(key, 'Folder', deps);
    first.persist.queueProject(key, validProjectFile());
    const closing = first.close();
    const second = acquireProjectSession(key, 'Folder', deps);
    expect(second.persist).not.toBe(first.persist);
    await closing;
    await second.ready;
    // The old close did not deregister the key the new session now owns.
    expect(log).not.toContain('clear');
    expect(second.lease()).not.toBeNull();
    await second.close();
    expect(log).toContain('clear');
  });

  it('a lease that arrives after every reference closed is released at once', async () => {
    const log: string[] = [];
    const key = nextKey();
    const deps = makeDeps(log, new FakeDir('Folder'));
    const session = acquireProjectSession(key, 'Folder', deps);
    await session.close();
    expect(log.filter((e) => e === 'lease.release')).toHaveLength(1);
  });
});
