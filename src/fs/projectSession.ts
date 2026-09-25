/**
 * One owner per open project (beta-readiness plan R5, D144): the persist queue, the writer lease,
 * the BroadcastChannel and the open-project registration live here, not in an editor mount.
 *
 * Before this, every `SheetEditor` mount built its own queue, took its own lease and deregistered
 * the project on unmount. Leaving the editor could therefore drop a coalesced write (F1) or strand
 * the grid on an unregistered project (F2). A session is refcounted per D51 key: the shell holds a
 * reference for as long as the project is open, each editor mount holds one too, and only the
 * LAST release flushes, releases the lease, closes the channel and deregisters. With the shell
 * holding its reference, an editor remount (a sheet switch) tears nothing down.
 *
 * A caller with no shell (a bare `SheetEditor` in a test) holds the only reference, so its
 * unmount gives exactly the old per-mount lifecycle.
 */
import {
  acquireWriterLease,
  clearOpenProject,
  openProjectChannel,
  registerOpenProject,
  resolveOpenProjectDir,
  type ProjectChannel,
  type WriterLease,
} from '@/fs/projectStore';
import {
  createPersistQueue,
  writeToProjectDir,
  type PersistQueue,
  type PersistQueueDeps,
} from '@/state/persistQueue';

/** Thrown by `dir()` (and so by any queued write) once the session has fully closed. */
export class SessionClosedError extends Error {
  constructor(key: string) {
    super(`project session ${key} is closed`);
    this.name = 'SessionClosedError';
  }
}

export interface ProjectSession {
  /** D51 runtime key `${id}:${folderName}`. */
  readonly key: string;
  readonly folderName: string;
  dir(): Promise<FileSystemDirectoryHandle>;
  /** ONE queue per open project, not per editor mount. */
  readonly persist: PersistQueue;
  /** Settles once the lease request has been answered (granted or refused). */
  readonly ready: Promise<void>;
  /** The writer lease, or `null` before `ready` settles or when another tab holds it (read-only). */
  lease(): WriterLease | null;
  /** The cross-tab channel, or `null` before `ready` or where BroadcastChannel is missing. */
  channel(): ProjectChannel | null;
  /** Release THIS reference. The last one flushes → releases the lease → closes the channel → deregisters. */
  close(): Promise<void>;
}

/** Test seam: everything the session does to the outside world. */
export interface ProjectSessionDeps {
  acquireWriterLease: typeof acquireWriterLease;
  openProjectChannel: typeof openProjectChannel;
  resolveOpenProjectDir: typeof resolveOpenProjectDir;
  registerOpenProject: typeof registerOpenProject;
  clearOpenProject: typeof clearOpenProject;
  /** Queue options other than `write` (the session owns the write). */
  queue?: Partial<Omit<PersistQueueDeps, 'write'>>;
}

// Resolved at call time rather than captured at import, so a test's `vi.mock('@/fs/projectStore')`
// reaches the session exactly as it reached the editor before.
const defaultDeps = (): ProjectSessionDeps => ({
  acquireWriterLease,
  openProjectChannel,
  resolveOpenProjectDir,
  registerOpenProject,
  clearOpenProject,
});

interface Core {
  readonly key: string;
  readonly folderName: string;
  readonly persist: PersistQueue;
  readonly ready: Promise<void>;
  refs: number;
  lease: WriterLease | null;
  channel: ProjectChannel | null;
  /** Set once the final close has flushed: from then on `dir()` rejects. */
  closed: boolean;
  dir(): Promise<FileSystemDirectoryHandle>;
}

/** The live core per key. A closing core leaves this map at once, so a re-open starts fresh. */
const cores = new Map<string, Core>();
/** A key's in-progress final close; a fresh core waits for it before asking for the lease. */
const closing = new Map<string, Promise<void>>();

function createCore(key: string, folderName: string, deps: ProjectSessionDeps): Core {
  deps.registerOpenProject(key, folderName);
  let cachedDir: FileSystemDirectoryHandle | null = null;
  const core: Core = {
    key,
    folderName,
    refs: 0,
    lease: null,
    channel: null,
    closed: false,
    // Resolved once and cached, so the final flush on close never depends on the module registry
    // (the shell may deregister synchronously on «Back»). A failed resolve is NOT cached: the
    // next write retries it, as the per-write resolve did before.
    async dir() {
      if (core.closed) throw new SessionClosedError(key);
      if (cachedDir) return cachedDir;
      const dir = await deps.resolveOpenProjectDir(key);
      cachedDir = dir;
      return dir;
    },
    persist: null as unknown as PersistQueue,
    ready: Promise.resolve(),
  };
  (core as { persist: PersistQueue }).persist = createPersistQueue({
    ...deps.queue,
    write: async (target, data) => writeToProjectDir(await core.dir(), target, data),
  });
  const prior = closing.get(key) ?? Promise.resolve();
  (core as { ready: Promise<void> }).ready = (async () => {
    await prior;
    const lease = await deps.acquireWriterLease(key);
    if (core.refs === 0) {
      // Every reference closed before the lease arrived; the close path could not release it.
      lease?.release();
      return;
    }
    core.lease = lease;
    core.channel = deps.openProjectChannel(key);
  })();
  // Nobody may be awaiting `ready` (the shell only holds its reference). Mark the rejection handled;
  // an editor that awaits it still sees the failure and shows its error state, as before.
  core.ready.catch(() => undefined);
  return core;
}

async function finalClose(core: Core, deps: ProjectSessionDeps): Promise<void> {
  if (cores.get(core.key) === core) cores.delete(core.key);
  try {
    await core.ready;
  } catch {
    // A failed lease request leaves nothing to release; the flush below still runs.
  }
  try {
    await core.persist.flush();
  } finally {
    core.closed = true;
    core.channel?.close();
    core.channel = null;
    core.lease?.release();
    core.lease = null;
    // A re-open that raced this close has already registered the same key; leave it registered.
    if (!cores.has(core.key)) deps.clearOpenProject(core.key);
  }
}

/**
 * Take a reference to the project's session, creating it on first use. Synchronous: the queue
 * and `dir()` are usable at once, and the lease arrives with `ready`.
 */
export function acquireProjectSession(
  key: string,
  folderName: string,
  deps: ProjectSessionDeps = defaultDeps(),
): ProjectSession {
  let core = cores.get(key);
  if (!core) {
    core = createCore(key, folderName, deps);
    cores.set(key, core);
  }
  core.refs += 1;
  const c = core;
  let released = false;
  return {
    key,
    folderName: c.folderName,
    persist: c.persist,
    ready: c.ready,
    dir: () => c.dir(),
    lease: () => c.lease,
    channel: () => c.channel,
    close: async () => {
      if (released) return;
      released = true;
      c.refs -= 1;
      if (c.refs > 0) return;
      const done = finalClose(c, deps);
      // Tracked without its outcome: a later open only needs to know the close is over.
      const settled: Promise<void> = done.then(
        () => undefined,
        () => undefined,
      );
      closing.set(c.key, settled);
      void settled.then(() => {
        if (closing.get(c.key) === settled) closing.delete(c.key);
      });
      await done;
    },
  };
}

/** The plan's async entry point: a reference whose lease request has already been answered. */
export async function openProjectSession(
  key: string,
  folderName: string,
  deps?: ProjectSessionDeps,
): Promise<ProjectSession> {
  const session = acquireProjectSession(key, folderName, deps);
  await session.ready;
  return session;
}
