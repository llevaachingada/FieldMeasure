/**
 * `src/state/persistQueue.ts` — the §5.4 autosave pipeline (implementation plan slice
 * 1.2, build order step 9; session-4 gap P2).
 *
 * §10 says "the command history and persistence queue live in dedicated modules, not in
 * the stores", and §5.4 fully specifies the pipeline — coalesce 400 ms → serialize per
 * sheet → 1s/3s/10s backoff → park → flush on `pagehide`/`visibilitychange` — but no
 * earlier slice listed the module.
 *
 * It is the ONLY caller of `writeJsonAtomic` for markup, and it OWNS the autosave chip
 * state: the chip (slice 1.10) subscribes and never sets state itself. That is how
 * "never show Saved optimistically" is enforced structurally instead of by discipline.
 *
 * Failure classification comes from `StorageWriteError.kind` (§5.3):
 *   'disk-full'     → the §5.8a «Disk full» state, parks with NO backoff budget and NO
 *                     automatic pruning of `.history/`/`.trash/` (a data-loss path).
 *   'permission'    → the §5.2 reconnect state (chip: «Pending — folder offline»).
 *   'target-locked' → §5.4 backoff 1s/3s/10s, then park («File is open in another
 *                     app — Retry», §5.8b).
 *   'unknown'       → same backoff, then park in 'pending' (§5.4).
 *
 * SPEC RECONCILIATION (slice 1.2 review): `AppState['storageStatus']` (appStore.ts) is now
 * `'saved' | 'saving' | 'pending' | 'readonly' | 'offline' | 'full' | 'error'`. This module's
 * `PersistStatus` is that union MINUS the UI-only `'offline'` (a one-time reassurance the queue
 * never emits — the app sets it directly), so it is a subtype of `StorageStatus` and the 1.10
 * chip can subscribe and forward without mapping.
 */
import type { MarkupFile, ProjectFile } from '../domain/schema';
import {
  resolveOpenProjectDir,
  resolveSheetDir,
  StorageWriteError,
  writeJsonAtomic,
} from '../fs/projectStore';

/** Autosave chip states (UI §13.1) plus the §5.8a disk-full state. */
export type PersistStatus = 'saved' | 'saving' | 'pending' | 'readonly' | 'error' | 'full';

/** Coalescing window: writes happen 400 ms after the LAST edit (§5.4). */
export const COALESCE_MS = 400;

/** §5.4 backoff schedule. Exhausted → park in 'pending' (never retry forever). */
export const RETRY_BACKOFF_MS = [1000, 3000, 10000] as const;

export type PersistTarget =
  | { kind: 'sheet'; projectId: string; sheetId: string }
  | { kind: 'project'; projectId: string };

export interface PersistQueue {
  /** Coalesced 400 ms per (projectId, sheetId). */
  queueSheet(projectId: string, sheetId: string, data: MarkupFile): void;
  queueProject(projectId: string, data: ProjectFile): void;
  /** Write everything pending NOW and resolve only once those writes settle. */
  flush(): Promise<void>;
  subscribe(fn: (status: PersistStatus) => void): () => void;
  /** True while anything is queued or in flight — suppresses 1.11's update toast. */
  readonly inFlight: boolean;
  readonly status: PersistStatus;
}

export interface FlushEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  /** Present on `window`; used to gate visibilitychange on `hidden`. */
  readonly document?: { readonly visibilityState: string };
}

export interface PersistQueueDeps {
  /** The write itself. Default: `projectStore.writeJsonAtomic` into the open project. */
  write: (target: PersistTarget, data: unknown) => Promise<void>;
  /** Optional extra sink (the app mirrors the status into a store). */
  onStatus: (status: PersistStatus) => void;
  /** Attach pagehide/visibilitychange flush listeners (default when a window exists). */
  autoAttachFlush: boolean;
}

interface Chain {
  key: string;
  target: PersistTarget;
  /** The newest data not yet written; `hasLatest` distinguishes "no edit" from `undefined`. */
  latest: unknown;
  hasLatest: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Per-key serialisation tail: two writes for one key never overlap (§5.4). */
  tail: Promise<void>;
  /** Failed attempts consumed from RETRY_BACKOFF_MS. */
  attempt: number;
  /** Gave up auto-retrying; only `flush()` (the chip's Retry) or a new edit resumes. */
  parked: boolean;
}

/** Register pagehide/visibilitychange flushes (§5.4). Returns a detach function. */
export function attachFlushListeners(
  queue: Pick<PersistQueue, 'flush'>,
  target: FlushEventTarget,
): () => void {
  const onPageHide = (): void => {
    void queue.flush();
  };
  const onVisibilityChange = (): void => {
    if (target.document?.visibilityState === 'hidden') void queue.flush();
  };
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

function keyFor(target: PersistTarget): string {
  return target.kind === 'project'
    ? `${target.projectId}\u0000project`
    : `${target.projectId}\u0000${target.sheetId}`;
}

async function defaultWrite(target: PersistTarget, data: unknown): Promise<void> {
  const projectDir = await resolveOpenProjectDir(target.projectId);
  if (target.kind === 'project') {
    await writeJsonAtomic(projectDir, 'project.json', data, target.projectId);
    return;
  }
  const sheetDir = await resolveSheetDir(projectDir, target.sheetId);
  await writeJsonAtomic(sheetDir, 'markup.json', data, target.projectId);
}

export function createPersistQueue(deps?: Partial<PersistQueueDeps>): PersistQueue {
  const write = deps?.write ?? defaultWrite;
  const chains = new Map<string, Chain>();
  const listeners = new Set<(status: PersistStatus) => void>();
  let status: PersistStatus = 'saved';
  let activeWrites = 0;

  function setStatus(next: PersistStatus): void {
    if (status === next) return;
    status = next;
    for (const fn of listeners) fn(status);
    deps?.onStatus?.(status);
  }

  function chainFor(target: PersistTarget): Chain {
    const key = keyFor(target);
    let chain = chains.get(key);
    if (!chain) {
      chain = {
        key,
        target,
        latest: undefined,
        hasLatest: false,
        timer: null,
        tail: Promise.resolve(),
        attempt: 0,
        parked: false,
      };
      chains.set(key, chain);
    }
    return chain;
  }

  /** Anything queued or in flight? (parked data does not count — it is not progressing) */
  function busy(): boolean {
    if (activeWrites > 0) return true;
    for (const c of chains.values()) {
      if (c.timer !== null) return true;
      if (c.hasLatest && !c.parked) return true;
    }
    return false;
  }

  function schedule(c: Chain, delayMs: number): void {
    if (c.timer !== null) clearTimeout(c.timer);
    c.timer = setTimeout(() => {
      c.timer = null;
      void writeNow(c);
    }, delayMs);
  }

  async function attempt(c: Chain): Promise<void> {
    if (!c.hasLatest) return;
    const data = c.latest;
    c.latest = undefined;
    c.hasLatest = false;
    activeWrites += 1;
    if (status === 'saved') setStatus('saving');
    let succeeded = false;
    try {
      await write(c.target, data);
      c.attempt = 0;
      c.parked = false;
      succeeded = true;
    } catch (e) {
      // Never drop the edit: it stays queued so a Retry/flush can still land it.
      c.latest = data;
      c.hasLatest = true;
      const kind = e instanceof StorageWriteError ? e.kind : 'unknown';
      if (kind === 'disk-full') {
        // §5.8a: park immediately — do NOT consume the backoff budget and give up silently.
        c.parked = true;
        setStatus('full');
      } else if (kind === 'permission') {
        // §5.2/§5.8b: retrying cannot help until the user re-picks the folder.
        c.parked = true;
        setStatus('pending');
      } else if (c.attempt < RETRY_BACKOFF_MS.length) {
        const delay = RETRY_BACKOFF_MS[c.attempt];
        c.attempt += 1;
        setStatus('saving');
        schedule(c, delay);
      } else {
        // §5.4: backoff exhausted → park, never retry forever. §5.8b is more specific for a
        // locked rename target: the chip shows «File is open in another app — Retry», i.e.
        // the Error state with Retry, not the offline/pending state.
        c.parked = true;
        setStatus(kind === 'target-locked' ? 'error' : 'pending');
      }
    } finally {
      activeWrites -= 1;
    }
    // Settled only after the counter dropped, so "saved" means "no write is in flight".
    if (succeeded) setStatus(busy() ? 'saving' : 'saved');
  }

  /** Serialise per key: this key's next attempt runs after the current one settles. */
  function writeNow(c: Chain): Promise<void> {
    const run = c.tail.then(
      () => attempt(c),
      () => attempt(c),
    );
    c.tail = run.catch(() => undefined);
    return run;
  }

  function enqueue(target: PersistTarget, data: unknown): void {
    const c = chainFor(target);
    c.latest = data;
    c.hasLatest = true;
    // A new edit is a fresh retry budget and re-arms a parked chain (the chip's Retry
    // is `flush()`, which does the same thing explicitly).
    c.attempt = 0;
    c.parked = false;
    if (status === 'saved') setStatus('saving');
    schedule(c, COALESCE_MS);
  }

  const queue: PersistQueue = {
    queueSheet: (projectId, sheetId, data) => enqueue({ kind: 'sheet', projectId, sheetId }, data),
    queueProject: (projectId, data) => enqueue({ kind: 'project', projectId }, data),

    async flush(): Promise<void> {
      const all = [...chains.values()];
      for (const c of all) {
        if (c.timer !== null) {
          clearTimeout(c.timer);
          c.timer = null;
        }
        if (c.hasLatest) {
          c.parked = false;
          c.attempt = 0;
        }
      }
      await Promise.all(all.map((c) => (c.hasLatest ? writeNow(c) : c.tail)));
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    get inFlight() {
      return busy();
    },

    get status() {
      return status;
    },
  };

  if (deps?.autoAttachFlush ?? typeof window !== 'undefined') {
    if (typeof window !== 'undefined') attachFlushListeners(queue, window);
  }
  return queue;
}
