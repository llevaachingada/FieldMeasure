/**
 * `src/fs/projectStore.ts` — the ONE atomic, lock-guarded, self-healing write path
 * (§5; implementation plan slice 1.2, build order steps 2–6). Every disk write in
 * the app — JSON and blobs alike — goes through here (§2.4 / AGENTS #3).
 *
 * WHAT IS VERBATIM FROM §5.3
 * `writeAtomic`, `writeJsonAtomic`, `readJsonValidated`, `cleanStaleTmp`,
 * `StorageWriteError`, `classifyWriteError`, `initStore`, `pickRoot`, `ensureDir`
 * are the §5.3 reference code (session-4 fixes S1–S5 included: the lock is taken
 * INSIDE `writeAtomic`; `projectId` is required; `cleanStaleTmp` is recursive and
 * bounded; every I/O failure routes to `.history` recovery with an `onMissing`
 * default for genuinely-absent files).
 *
 * Deliberate additions, all of them necessary for the slice gate (each carries a
 * comment below): `recoverFromHistory` (referenced by §5.3 but not given),
 * history snapshotting (§5.5/§5.8e), path helpers for the §3.1 layout,
 * `readProjectFile`/`readSheetMarkup` wrappers, `isPhotoDamaged` (§5.3), the
 * deterministic writer lease + BroadcastChannel (§5.8d/§5.4), `scanProjects`
 * (§5.6/§5.8c), and `createProject` (Home «New project»: a subfolder named from the pop-up's project name).
 *
 * SPEC DELTAS (reported, not silently taken):
 *  - `pickRoot` persists through `src/settings/projectsRoot.ts` instead of the
 *    literal `set('rootHandle', …)` from §5.3, because slice 0.3 already owns the
 *    root handle under the key `fm:projects-root` and FirstRun writes it there. A
 *    second key would make first-run's folder invisible to `initStore`.
 *  - `readJsonValidated` gained an optional 5th `opts.historyDir`; §5.3's
 *    `recoverFromHistory(dir, name)` cannot locate `.history/` from a SHEET
 *    directory handle (File System Access has no parent navigation), so the caller
 *    passes the resolved scope directory. The plan's 4-parameter signature is
 *    unchanged and still valid.
 *  - `initStore`'s backend import is `chooseBackend` (verbatim); `readText`/
 *    `writeTextAtomic` relative paths are relative to the ROOT (see backend.ts).
 */
import { setProjectsRoot } from '../settings/projectsRoot';
import { ensurePersistentStorage } from '../data/storage';
import { newId } from '../domain/ids';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PRECISION_DENOMINATOR,
  DEFAULT_UNIT_FORMAT,
} from '../domain/migrate';
import {
  parseMarkupFile,
  parseProjectFile,
  type MarkupFile,
  type ProjectFile,
} from '../domain/schema';
// The new-project folder name is the APPROVED Home copy (`STRINGS.home.newProject`,
// 'New project') — there is no new copy and no name prompt (§2.4).
import { STRINGS } from '../ui/strings';
import { sanitizeToken } from '../export/filenames';
import { chooseBackend, ROOT_LOCK_SCOPE, type MovableFileHandle, type StorageBackend } from './backend';

type MaybePromise<T> = T | Promise<T>;

let backend: StorageBackend;

/** §5.3 `initStore` — QUERY permission only. NEVER calls `requestPermission`. */
export async function initStore(): Promise<void> {
  backend = chooseBackend();
  await backend.init(); // QUERY permission only — requestAccess() is separate, gesture-driven
}

/**
 * The lazily-initialised backend (imported by the UI/queue without a boot step).
 *
 * A backend that initialised BEFORE a root existed (a scan during first run) cached `null`
 * forever, so every later caller saw "no projects root" although one was persisted. A root-less
 * backend therefore re-reads the persisted handle (one IndexedDB read) instead of trusting it.
 */
export async function ensureStoreReady(): Promise<StorageBackend> {
  if (!backend || backend.getProjectDir() === null) await initStore();
  return backend;
}

/** A recovery re-pick landed on a folder that is not the projects root (see `pickRoot`). */
export class RootMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RootMismatchError';
  }
}

/**
 * Adopt a freshly-picked projects root IN PLACE: persist it, re-init the backend on it, and ask
 * for persistent storage so the persisted handle is never evicted with the origin's data.
 *
 * In place — never `location.reload()`. A picker hands back a handle that is GRANTED for this
 * page; a reload restores the handle but not the grant (§5.2), so reloading to "adopt" a folder
 * threw away the grant the user had just given and landed on a Home that could not read it —
 * which looked exactly like "the folder setting did not save".
 */
export async function adoptProjectsRoot(handle: FileSystemDirectoryHandle): Promise<void> {
  await setProjectsRoot(handle);
  await initStore();
  try {
    await ensurePersistentStorage();
  } catch {
    // Best-effort: an unprotected origin still works; it is only evictable under pressure.
  }
}

/** `a.isSameEntry(b)`; false when the API is missing or throws. */
async function isSameFolder(a: FileSystemHandle, b: FileSystemHandle): Promise<boolean> {
  try {
    return typeof a.isSameEntry === 'function' && (await a.isSameEntry(b));
  } catch {
    return false;
  }
}

/**
 * §5.3 `pickRoot` — MUST be called from a user gesture (§5.2).
 *
 * `mustContain` guards a RECOVERY re-pick made from inside an open project (the capture
 * overlay's «Re-pick folder»). There the natural mistake is to pick the PROJECT folder itself,
 * and persisting that silently replaced the projects root: Home then listed the wrong folder and
 * the user was back in Settings re-choosing it. A guarded re-pick is adopted only if it is the
 * current root or a folder that contains the open project; anything else throws
 * `RootMismatchError` and the persisted root is left untouched.
 */
export async function pickRoot(options?: { mustContain?: string }): Promise<void> {
  const picker = (
    globalThis as {
      showDirectoryPicker?: (options?: {
        id?: string;
        mode?: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (typeof picker !== 'function') throw new Error('showDirectoryPicker is unavailable');
  const handle = await picker({ id: 'fieldmeasure-projects', mode: 'readwrite' });
  const mustContain = options?.mustContain;
  if (mustContain) {
    const current = (await ensureStoreReady()).getProjectDir();
    let ok = current !== null && (await isSameFolder(handle, current));
    if (!ok) {
      try {
        await handle.getDirectoryHandle(mustContain, { create: false });
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      throw new RootMismatchError(`the picked folder does not contain the project "${mustContain}"`);
    }
  }
  // §5.3 wrote `set('rootHandle', handle)`; slice 0.3's settings module already owns
  // this handle under `fm:projects-root` (FirstRun persists there) — one key, not two.
  await adoptProjectsRoot(handle);
}

/** The root projects folder handle, or `null` before a root has been chosen. */
export async function getRootDir(): Promise<FileSystemDirectoryHandle | null> {
  const b = await ensureStoreReady();
  return b.getProjectDir();
}

/**
 * §5.2 step 3 — (re-)acquire READWRITE permission on the projects root.
 *
 * Chromium restores a persisted directory HANDLE across page loads but **not** its write
 * grant: after a reload `queryPermission()` returns `'prompt'` and the first filesystem
 * call throws `NotAllowedError`. The grant can only be asked for from a **user gesture**,
 * which is why this is called at the top of the gesture-driven entry points (creating a
 * project, opening one) and never at boot — `initStore` deliberately queries only.
 *
 * `request: true` is the asking form (must run inside a click's activation window); the
 * plain form only reports. Backend-agnostic on purpose: a root with no permission API
 * (OPFS, non-Chromium) reports `true`, so this can never become a new failure mode there.
 * Asking twice is free — the query short-circuits while the grant is held.
 */
export async function ensureRootAccess(options?: { request?: boolean }): Promise<boolean> {
  const root = await getRootDir();
  if (!root) return false;
  const handle = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  if (typeof handle.queryPermission !== 'function') return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (options?.request !== true || typeof handle.requestPermission !== 'function') return false;
  try {
    const granted = (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    // Still inside the gesture: protect the origin's storage (where the persisted root handle
    // lives) for installs that chose their folder before `adoptProjectsRoot` asked. Best-effort.
    if (granted) void ensurePersistentStorage().catch(() => false);
    return granted;
  } catch {
    // No transient activation (a non-gesture caller) — Chromium rejects rather than
    // prompting. Not an error here: the caller's own filesystem call will surface it.
    return false;
  }
}

/**
 * The root's READWRITE permission state, as the browser reports it.
 *
 * `ensureRootAccess` answers "may I write?" as a boolean, which is enough to gate a call but not
 * enough to choose a RECOVERY: `prompt` can still be asked for inside a gesture, while `denied`
 * cannot — Chromium resolves `requestPermission()` to `denied` without showing a prompt ever
 * again for that handle. Offering «Re-authorize» there is a button that cannot work (owner hit
 * exactly this: the stored projects folder reported `denied` and the app offered only
 * «Re-authorize»); the honest recovery for `denied` is a re-pick, which mints a fresh grant.
 */
export async function queryRootWritePermission(): Promise<
  'granted' | 'prompt' | 'denied' | 'unknown'
> {
  const root = await getRootDir();
  if (!root) return 'unknown';
  const handle = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  // A backend with no permission API (OPFS, non-Chromium) can always write.
  if (typeof handle.queryPermission !== 'function') return 'granted';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'unknown';
  }
}

/** §5.3 `ensureDir` (verbatim). */
export async function ensureDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

/** §3.1 layout resolution: everything below the root is addressed from a project folder. */
export async function resolveProjectDir(
  root: FileSystemDirectoryHandle,
  folderName: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(folderName, options);
}

export async function resolveSheetDir(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  const sheets = await projectDir.getDirectoryHandle('sheets', options);
  return sheets.getDirectoryHandle(sheetId, options);
}

export async function resolveAssetsDir(
  projectDir: FileSystemDirectoryHandle,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  return projectDir.getDirectoryHandle('assets', options);
}

/**
 * `.fieldmeasure/` — user data that is NOT markup: style presets live in
 * `.fieldmeasure/presets.json` so they travel with the folder (§7.3). Slice 1.8, lane C1.
 */
export async function resolveFieldMeasureDir(
  projectDir: FileSystemDirectoryHandle,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  return projectDir.getDirectoryHandle('.fieldmeasure', options);
}

/** `.history/<scope>/` — scope is `_project` or a sheetId (§3.1/§5.5). */
export async function resolveHistoryDir(
  projectDir: FileSystemDirectoryHandle,
  scope: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  const history = await projectDir.getDirectoryHandle('.history', options);
  return history.getDirectoryHandle(scope, options);
}

/* ------------------------------------------------------------------ *
 * §5.3 atomic write
 * ------------------------------------------------------------------ */

/** Atomic write (text or blob): tmp → close → rename over the real file.
 *  SESSION-4 FIX (S1): the previous version's doc comment said "hold the per-project Web
 *  Lock for the whole write" but the body NEVER TOOK A LOCK. cleanStaleTmp's stated safety
 *  property ("runs under the same lock as writers") was therefore false — the lock excluded
 *  other cleaners, not writers, so cleanup could still race an in-flight write. The lock is
 *  taken HERE, and `projectId` is now a required parameter so it cannot be forgotten.
 *
 *  SESSION-4 FIX (S5): `move()` fails with a locked target on Windows (Dropbox, antivirus,
 *  the search indexer). The tmp is KEPT on failure (it holds the good bytes; cleanStaleTmp
 *  will age it out) and the error is re-thrown tagged so the autosave layer can show
 *  «File is open in another app — Retry» instead of a generic failure.
 *
 *  SESSION-4 FIX (S4): a full disk surfaces as QuotaExceededError (OPFS) or
 *  NotAllowedError/NotReadableError (FSA). It is tagged 'disk-full' so the Autosave chip
 *  can enter the dedicated «Disk full» state (§5.8) rather than a silent generic error. */
export class StorageWriteError extends Error {
  constructor(
    public kind: 'disk-full' | 'target-locked' | 'permission' | 'unknown',
    cause: unknown,
  ) {
    super(`storage write failed: ${kind}`);
    this.cause = cause;
  }
}

function classifyWriteError(e: unknown): StorageWriteError['kind'] {
  const name = (e as DOMException)?.name ?? '';
  if (name === 'QuotaExceededError') return 'disk-full';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') return 'target-locked';
  return 'unknown';
}

/**
 * The name of the **per-write mutex**.
 *
 * DELIBERATELY different from the session writer lease's name (`fm:project:<id>`, §5.8d).
 * Web Locks are not reentrant and a plain `request` for a name the same page already holds
 * **queues forever** — no rejection, no timeout, nothing the UI can report. While both used one
 * name, the editor's session-long lease made *every* atomic write for that project hang, and the
 * editor's own open sequence died at `cleanStaleTmp`. Found while chasing an owner-reported
 * capture stuck on «Adding…»; proven in `tests/writerLease.browser.test.ts` — which the browser
 * suites could not see because six of them mock `acquireWriterLease` away (D121).
 */
export function writeLockName(projectId: string): string {
  return 'fm:project:' + projectId + ':write';
}

/**
 * How long a write may wait for the per-write mutex before it gives up.
 *
 * `navigator.locks.request` queues **silently and without a timeout**, so a write that cannot get
 * the mutex waits forever and reports nothing — the same shape as the D121 deadlock, from the
 * other direction. 20 s is deliberately far above a real write on a field device: this exists to
 * turn a STUCK holder into an honest error, not to police slow disks.
 */
export const WRITE_LOCK_TIMEOUT_MS = 20_000;

/**
 * Run `fn` under the per-write mutex, refusing to wait forever.
 *
 * The acquisition is **aborted**, never merely abandoned: a queued request that was reported as
 * failed but later ran would write behind the caller's back (and duplicate work that the caller
 * already retried). Aborting guarantees `fn` never runs. A timeout is classified `target-locked`
 * — the honest reading is that something else holds the folder busy.
 */
export async function withWriteLock<T>(
  projectId: string,
  fn: () => Promise<T>,
  timeoutMs: number = WRITE_LOCK_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await navigator.locks.request(
      writeLockName(projectId),
      { signal: controller.signal },
      fn,
    );
  } catch (e) {
    if ((e as DOMException | undefined)?.name === 'AbortError') {
      throw new StorageWriteError('target-locked', e);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function writeAtomic(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: string | Blob,
  projectId: string,
): Promise<void> {
  await withWriteLock(projectId, async () => {
    const tmpName = `${name}.tmp`;
    // REVIEW F2: `getFileHandle(tmp, { create: true })` was OUTSIDE this `try`, so a
    // revoked write grant (`NotAllowedError`) escaped as a RAW DOMException instead of the
    // `StorageWriteError('permission')` this function promises — the exporter's
    // `toFileError` then reported `kind: 'unknown'` and the wizard offered a useless
    // «Retry» instead of «Re-authorize». Resolving the handle is an I/O failure like any
    // other and must classify here. Semantics are unchanged: the tmp is kept on failure,
    // the target is never deleted, and no error is swallowed.
    let tmp: FileSystemFileHandle;
    try {
      tmp = await dir.getFileHandle(tmpName, { create: true });
      const w = await tmp.createWritable();
      await w.write(data); // accepts string | Blob | BufferSource
      await w.close(); // flush; then atomic rename
    } catch (e) {
      throw new StorageWriteError(classifyWriteError(e), e);
    }
    try {
      // FileSystemFileHandle.move() exists in Chromium (files only — NOT on directories).
      // Overwrite-on-move matches POSIX (M109+). Verified on target build in slice 1.2
      // (tests/e2e/kill-switch.spec.ts). It is absent from TS 5.9's lib.dom, hence the shim.
      const movable = tmp as unknown as Partial<MovableFileHandle>;
      if (typeof movable.move !== 'function') {
        // §5.6: an improvised copy+delete "equivalent" is a data-loss path and is forbidden —
        // fail loudly instead. The tmp is kept.
        throw new StorageWriteError('unknown', new Error('FileSystemFileHandle.move is unavailable'));
      }
      await movable.move(name);
    } catch (e) {
      // Keep the tmp — it holds the good bytes and the target is still the previous
      // (valid) file. NEVER delete the target or the tmp here.
      throw e instanceof StorageWriteError ? e : new StorageWriteError(classifyWriteError(e), e);
    }
  });
}

export const writeJsonAtomic = (
  dir: FileSystemDirectoryHandle,
  name: string,
  data: unknown,
  projectId: string,
): Promise<void> => writeAtomic(dir, name, JSON.stringify(data, null, 2), projectId);

/**
 * Slice 1.8 (lane C1) — atomic write of `.fieldmeasure/presets.json` (§7.3). This stays
 * the ONE module that calls `createWritable()`: presets go through `writeJsonAtomic`
 * (tmp → close → `move()`), under the same per-project Web Lock as every other write.
 * The `.fieldmeasure/` directory is created on demand.
 */
export async function writePresetsFile(
  projectDir: FileSystemDirectoryHandle,
  data: unknown,
  projectId: string,
): Promise<void> {
  const dir = await resolveFieldMeasureDir(projectDir, { create: true });
  await writeJsonAtomic(dir, 'presets.json', data, projectId);
}

/* ------------------------------------------------------------------ *
 * §5.3 read + validate + recover
 * ------------------------------------------------------------------ */

export interface ReadJsonOptions {
  /**
   * Resolved `.history/<scope>/` directory (§3.1). Recovery is impossible without it:
   * a sheet directory handle cannot reach the project folder (`..` does not exist in
   * File System Access), so the caller — which knows the project folder and the scope —
   * passes it. Omitted when the project has no `.history/` yet (a fresh project).
   */
  historyDir?: FileSystemDirectoryHandle;
}

/** Thrown when a file is unreadable AND no `.history/` snapshot can be recovered.
 *  Never silently returns a default: that would be a wrong-measurement path. */
export class StorageReadError extends Error {
  constructor(public name_: string, public kind: 'missing' | 'corrupt' = 'corrupt', cause?: unknown) {
    super(`storage read failed: ${name_}`);
    this.cause = cause;
  }
}

export async function readJsonValidated<T>(
  dir: FileSystemDirectoryHandle,
  name: string,
  parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>, // see §3.4 parseJson — never throws
  onMissing?: () => T, // SESSION-4 (S3)
  opts?: ReadJsonOptions,
): Promise<T> {
  // SESSION-4 FIX (S3): only the PARSE was guarded. `getFileHandle(name, {create:false})`
  // throws NotFoundError for a missing file and `getFile()/text()` throws NotReadableError
  // on a truncated or externally-locked file — so every I/O failure BYPASSED the .history
  // recovery path and surfaced as an unhandled rejection. Both now route correctly, and a
  // genuinely absent file (a brand-new sheet has no markup.json yet) is NOT corruption.
  let raw: string;
  try {
    const fh = await dir.getFileHandle(name, { create: false });
    raw = await (await fh.getFile()).text();
  } catch (e) {
    if ((e as DOMException)?.name === 'NotFoundError') {
      if (onMissing) return onMissing(); // expected absence → caller's default
      return recoverFromHistory<T>(name, parse, opts, 'missing'); // should exist → try recovery
    }
    return recoverFromHistory<T>(name, parse, opts, 'corrupt'); // NotReadableError etc. → recovery
  }
  const res = await parse(raw);
  if (!res.success) return recoverFromHistory<T>(name, parse, opts, 'corrupt');
  return res.data!;
}

/**
 * Walk `.history/<scope>/` newest→oldest and parse the first snapshot that validates
 * (§5.5). Snapshot file names are `<epochMs>-<originalName>` — §3.1 draws a single
 * `markup.json` in the tree, but §5.5/§5.8e require a 20-snapshot cap per scope, which
 * needs one file per snapshot; the original name is kept as the suffix so recovery and
 * the (1.10) History flyout stay self-describing.
 */
async function recoverFromHistory<T>(
  name: string,
  parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>,
  opts: ReadJsonOptions | undefined,
  kind: 'missing' | 'corrupt',
): Promise<T> {
  const history = opts?.historyDir;
  const candidates: Array<{ entry: string; at: number }> = [];
  if (history) {
    try {
      for await (const [entry, h] of entriesOf(history)) {
        if (h.kind !== 'file' || !entry.endsWith(name)) continue;
        const at = Number.parseInt(entry, 10);
        candidates.push({ entry, at: Number.isFinite(at) ? at : 0 });
      }
    } catch {
      // No `.history/` directory (fresh project) — nothing to recover from.
    }
  }
  candidates.sort((a, b) => b.at - a.at);
  for (const c of candidates) {
    try {
      const fh = await history!.getFileHandle(c.entry, { create: false });
      const raw = await (await fh.getFile()).text();
      const res = await parse(raw);
      if (res.success) return res.data!;
    } catch {
      // Snapshot unreadable → try the next-newest.
    }
  }
  throw new StorageReadError(name, kind);
}

/** Read `project.json` for a project folder and validate it, recovering from
 *  `.history/_project/` when corrupt (§5.5). */
export async function readProjectFile(
  projectDir: FileSystemDirectoryHandle,
  onMissing?: () => ProjectFile,
): Promise<ProjectFile> {
  const historyDir = await tryResolveHistoryDir(projectDir, '_project');
  return readJsonValidated<ProjectFile>(projectDir, 'project.json', parseProjectFile, onMissing, {
    historyDir,
  });
}

/**
 * Read `<projectDir>/sheets/<sheetId>/markup.json`, recovering from
 * `<projectDir>/.history/<sheetId>/` (§3.1/§5.5). The PROJECT directory is the
 * parameter because `.history/` lives at the project root, not inside the sheet.
 */
export async function readSheetMarkup(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
  onMissing?: () => MarkupFile,
): Promise<MarkupFile> {
  const sheetDir = await resolveSheetDir(projectDir, sheetId);
  const historyDir = await tryResolveHistoryDir(projectDir, sheetId);
  return readJsonValidated<MarkupFile>(sheetDir, 'markup.json', parseMarkupFile, onMissing, {
    historyDir,
  });
}

/** `.history/<scope>/` if it exists, else `undefined` (never creates it on a read). */
export async function tryResolveHistoryDir(
  dir: FileSystemDirectoryHandle,
  scope: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const history = await dir.getDirectoryHandle('.history', { create: false });
    return await history.getDirectoryHandle(scope, { create: false });
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * §5.5 / §5.8e history snapshots
 * ------------------------------------------------------------------ */

/** 20 snapshots per sheet AND per `_project` (§5.8e), oldest-first pruning. */
export const HISTORY_SNAPSHOT_CAP = 20;

/** Snapshot JSON ONLY — never photos/assets/thumbnails (§5.8e). */
export async function writeHistorySnapshot(
  projectDir: FileSystemDirectoryHandle,
  scope: string,
  name: 'project.json' | 'markup.json',
  data: unknown,
  projectId: string,
): Promise<void> {
  const scopeDir = await resolveHistoryDir(projectDir, scope, { create: true });
  // The snapshot write itself uses the atomic path, lock included.
  await writeJsonAtomic(scopeDir, `${Date.now()}-${name}`, data, projectId);
  // Prune under its own (sequential, never nested — Web Locks are NOT reentrant) request.
  await navigator.locks.request('fm:project:' + projectId, async () => {
    const snapshots: Array<{ entry: string; at: number }> = [];
    for await (const [entry, h] of entriesOf(scopeDir)) {
      if (h.kind !== 'file' || !entry.endsWith(name)) continue;
      const at = Number.parseInt(entry, 10);
      snapshots.push({ entry, at: Number.isFinite(at) ? at : 0 });
    }
    snapshots.sort((a, b) => a.at - b.at); // oldest first
    for (const stale of snapshots.slice(0, Math.max(0, snapshots.length - HISTORY_SNAPSHOT_CAP))) {
      await scopeDir.removeEntry(stale.entry);
    }
  });
}

/* ------------------------------------------------------------------ *
 * §5.3 stale-tmp cleanup
 * ------------------------------------------------------------------ */

/** Delete stale *.tmp files left by a crash. Call once on project open.
 *  SAFETY (round-2): a tmp file can be another tab's write IN FLIGHT — the write lock
 *  doesn't protect this unless cleanup takes it too. So: run under the same per-project
 *  Web Lock AND only delete tmp files whose lastModified is older than 5 minutes. */
export async function cleanStaleTmp(
  dir: FileSystemDirectoryHandle,
  projectId: string,
): Promise<void> {
  // SESSION-4 FIX (S2): the previous version iterated the PROJECT ROOT ONLY. Every tmp file
  // this app actually writes lives in a subdirectory — `sheets/<n>/markup.json.tmp`,
  // `sheets/<n>/photo.jpg.tmp`, `sheets/<n>/thumb.jpg.tmp`, `assets/<hash>.jpg.tmp` — so
  // orphaned tmp files accumulated forever and slice 1.2's "no *.tmp survivors" gate could
  // never pass. Walk recursively, bounded, and skip `.trash/` entirely (its contents are
  // user-restorable). `.history/` IS recursed — a crashed snapshot write leaves an orphaned
  // `<epochMs>-<name>.tmp` there that must be cleaned like any other tmp; valid snapshots
  // never end in `.tmp`, so they are protected by the suffix filter below.
  await withWriteLock(projectId, async () => {
    const cutoff = Date.now() - 5 * 60_000;
    const SKIP = new Set(['.trash']);
    const walk = async (d: FileSystemDirectoryHandle, depth: number): Promise<void> => {
      if (depth > 3) return; // root / sheets / <sheet> — nothing deeper
      for await (const [name, h] of entriesOf(d)) {
        if (h.kind === 'directory') {
          if (SKIP.has(name)) continue;
          await walk(h as FileSystemDirectoryHandle, depth + 1);
          continue;
        }
        if (!name.endsWith('.tmp')) continue;
        const file = await (h as FileSystemFileHandle).getFile();
        if (file.lastModified < cutoff) await d.removeEntry(name);
      }
    };
    await walk(dir, 0);
  });
}

/** `entries()` with the lib.dom gap cast out (see backend.ts `IterableDirectoryHandle`). */
export function entriesOf(
  dir: FileSystemDirectoryHandle,
): AsyncIterableIterator<[string, FileSystemHandle]> {
  return (dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries();
}

/* ------------------------------------------------------------------ *
 * §5.3 truncated-photo detection
 * ------------------------------------------------------------------ */

/**
 * §5.3: a missing or 0-byte `photo.jpg` is the damaged-photo state — the markup is
 * preserved and MUST NOT be deleted (the user can replace the photo, §8.5).
 * `createImageBitmap` decode failure is checked by the loader (slice 1.3), which owns
 * the bitmap decode path; this is the filesystem half.
 */
export async function isPhotoDamaged(
  sheetDir: FileSystemDirectoryHandle,
  name = 'photo.jpg',
): Promise<boolean> {
  try {
    const fh = await sheetDir.getFileHandle(name, { create: false });
    return (await fh.getFile()).size === 0;
  } catch {
    return true; // missing entirely → same UI state (§5.3)
  }
}

/* ------------------------------------------------------------------ *
 * §5.8d two-tab arbitration + §5.4 BroadcastChannel invalidation
 * ------------------------------------------------------------------ */

export interface WriterLease {
  readonly held: true;
  release(): void;
}

/**
 * §5.8d: on project open a tab attempts to hold `fm:project:<id>` exclusively for the
 * session. The holder is the writer; any tab that does NOT get it is read-only
 * immediately (`null`). Deterministic — no polling, no timer, no race.
 */
export function acquireWriterLease(projectId: string): Promise<WriterLease | null> {
  return new Promise((resolve) => {
    let granted = false;
    let releaseLock: () => void = () => {};
    void navigator.locks
      .request('fm:project:' + projectId, { mode: 'exclusive', ifAvailable: true }, () => {
        granted = true;
        resolve({ held: true, release: () => releaseLock() });
        // Holding the lock for the whole session: the request settles on release().
        return new Promise<void>((res) => {
          releaseLock = res;
        });
      })
      .then(() => {
        // With `ifAvailable`, an unavailable lock resolves WITHOUT invoking the callback.
        if (!granted) resolve(null);
      });
  });
}

export interface ProjectChannel {
  post(message: 'write' | 'close'): void;
  close(): void;
}

/**
 * §5.4: `fm:project:<id>` — names include the project id, so two tabs editing two
 * DIFFERENT projects never false-conflict (Home explicitly supports that).
 */
export function openProjectChannel(
  projectId: string,
  onMessage?: (message: 'write' | 'close') => void,
): ProjectChannel | null {
  if (typeof BroadcastChannel !== 'function') return null;
  const channel = new BroadcastChannel('fm:project:' + projectId);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as 'write' | 'close';
    if (data === 'write' || data === 'close') onMessage?.(data);
  };
  return {
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}

/* ------------------------------------------------------------------ *
 * Open-project registry (what the persistence queue writes to)
 * ------------------------------------------------------------------ */

const openProjects = new Map<string, string>(); // projectId → project folder name

/** Record which folder an open project lives in (the app does this on project open). */
export function registerOpenProject(projectId: string, folderName: string): void {
  openProjects.set(projectId, folderName);
}

export function getOpenProjectFolder(projectId: string): string | undefined {
  return openProjects.get(projectId);
}

export function clearOpenProject(projectId: string): void {
  openProjects.delete(projectId);
}

/** Resolve the on-disk directory of an OPEN project (`root/<folderName>`). */
export async function resolveOpenProjectDir(
  projectId: string,
): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDir();
  if (!root) throw new Error('no projects root is open');
  // §5.2 step 3, best-effort. Opening a project is the other gesture-driven entry point:
  // after a reload the handle survives but the grant does not, so without this the first
  // read of an existing project throws NotAllowedError (the editor's error state is the
  // fallback, and its «Retry» re-runs this path — which is itself a gesture). Deliberately
  // non-throwing: a non-gesture caller (the persist queue) must keep today's behaviour, and
  // a genuine refusal surfaces from the caller's own filesystem call.
  await ensureRootAccess({ request: true });
  const folderName = openProjects.get(projectId);
  if (!folderName) throw new Error(`project ${projectId} is not open in this tab`);
  return root.getDirectoryHandle(folderName, { create: false });
}

/* ------------------------------------------------------------------ *
 * §5.6 / §5.8c project scan + duplicate ids
 * ------------------------------------------------------------------ */

export interface ScannedProject {
  /** In-memory key: id + folderName (§5.8c) — NEVER the id alone. */
  key: string;
  id: string;
  folderName: string;
  title: string;
  sheetCount: number;
  /** Display path: `…\<folderName>` (the on-disk folder name is cosmetic, §5.6). */
  path: string;
  /** Newest sheet `updatedAt` (or `project.json`'s mtime for a sheet-less project). */
  updatedAtMs: number;
  /** Another folder under this root carries the same id. */
  isDuplicate: boolean;
  /** Most recently modified folder within its id group (the one NOT badged «Copy»). */
  isMostRecent: boolean;
  status: 'ok' | 'unreadable';
}

function annotateDuplicates(projects: ScannedProject[]): void {
  const byId = new Map<string, ScannedProject[]>();
  for (const p of projects) {
    if (!p.id) continue;
    const group = byId.get(p.id);
    if (group) group.push(p);
    else byId.set(p.id, [p]);
  }
  for (const group of byId.values()) {
    if (group.length < 2) continue;
    let newest = group[0];
    for (const p of group) if (p.updatedAtMs > newest.updatedAtMs) newest = p;
    for (const p of group) {
      p.isDuplicate = true;
      p.isMostRecent = p === newest;
    }
  }
}

function cardPath(folderName: string): string {
  return `…\\${folderName}`;
}

/** D140: a root subfolder is a project candidate only if it has `project.json` or its
 *  `.history/_project/` recovery folder. Anything else (Documents' "My Music", "Zoom", …) is not
 *  ours and is not shown. A folder with a CORRUPT project.json is still a candidate. */
async function isProjectCandidate(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await dir.getFileHandle('project.json', { create: false });
    return true;
  } catch {
    // fall through
  }
  try {
    const history = await dir.getDirectoryHandle('.history', { create: false });
    await history.getDirectoryHandle('_project', { create: false });
    return true;
  } catch {
    return false;
  }
}

async function scanOne(
  folderName: string,
  dir: FileSystemDirectoryHandle,
): Promise<ScannedProject> {
  let updatedAtMs = 0;
  try {
    const fh = await dir.getFileHandle('project.json', { create: false });
    updatedAtMs = (await fh.getFile()).lastModified;
  } catch {
    // Fall through to the unreadable branch; recovery may still succeed.
  }
  const historyDir = await tryResolveHistoryDir(dir, '_project');
  try {
    const file = await readJsonValidated<ProjectFile>(
      dir,
      'project.json',
      parseProjectFile,
      undefined, // no onMissing: a folder in the root SHOULD have project.json (§5.5)
      { historyDir },
    );
    let newestSheet = 0;
    let sheetCount = 0;
    for (const sheet of file.sheets) {
      if (sheet.deletedAt) continue;
      sheetCount += 1;
      const at = Date.parse(sheet.updatedAt);
      if (Number.isFinite(at) && at > newestSheet) newestSheet = at;
    }
    return {
      key: `${file.project.id}:${folderName}`,
      id: file.project.id,
      folderName,
      title: file.project.title,
      sheetCount,
      path: cardPath(folderName),
      updatedAtMs: Math.max(updatedAtMs, newestSheet),
      isDuplicate: false,
      isMostRecent: true,
      status: 'ok',
    };
  } catch {
    return {
      key: folderName,
      id: '',
      folderName,
      title: folderName,
      sheetCount: 0,
      path: cardPath(folderName),
      updatedAtMs,
      isDuplicate: false,
      isMostRecent: true,
      status: 'unreadable',
    };
  }
}

/** Parallel folder reads during the Home scan: enough to hide per-folder latency on a large root,
 *  small enough not to flood the File System Access backend (8). */
export const SCAN_CONCURRENCY = 8;

/**
 * §5.6: scan the ROOT folder, read every subfolder's `project.json`, and key projects by
 * the file's `id` — never by folder name (an Explorer rename is cosmetic). §5.8c: a group
 * of folders sharing one id is reported as-is (every folder its own card); nothing is ever
 * merged, and nothing is ever written into a folder the user did not open.
 *
 * D140: a root subfolder that is neither a project (`project.json`) nor recoverable
 * (`.history/_project/`) is hidden entirely, as is any dot-folder. Candidates are scanned with
 * bounded concurrency (`SCAN_CONCURRENCY`) instead of one at a time.
 */
export async function scanProjects(): Promise<ScannedProject[]> {
  const root = await getRootDir();
  if (!root) return [];
  const entries: Array<[string, FileSystemDirectoryHandle]> = [];
  for await (const [folderName, handle] of entriesOf(root)) {
    if (handle.kind !== 'directory') continue;
    if (folderName.startsWith('.')) continue;
    entries.push([folderName, handle as FileSystemDirectoryHandle]);
  }
  const projects: ScannedProject[] = [];
  for (let i = 0; i < entries.length; i += SCAN_CONCURRENCY) {
    const chunk = entries.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ([folderName, dir]) => {
        if (!(await isProjectCandidate(dir))) return null;
        return scanOne(folderName, dir);
      }),
    );
    for (const result of results) if (result) projects.push(result);
  }
  annotateDuplicates(projects);
  projects.sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.folderName.localeCompare(b.folderName));
  return projects;
}

/** D141: the Home card's cover, the `thumb.jpg` of the project's first live sheet by `sortIndex`.
 *  Read-only, resolves by FOLDER NAME from the root (Home has no open project), and is `null` on
 *  any failure: a missing cover is never an error. */
export async function readProjectCover(folderName: string): Promise<Blob | null> {
  try {
    const root = await getRootDir();
    if (!root) return null;
    const dir = await root.getDirectoryHandle(folderName, { create: false });
    const file = await readProjectFile(dir);
    const first = [...file.sheets]
      .filter((s) => !s.deletedAt)
      .sort((a, b) => a.sortIndex - b.sortIndex)[0];
    if (!first) return null;
    const sheetDir = await resolveSheetDir(dir, first.id);
    const handle = await sheetDir.getFileHandle('thumb.jpg', { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

/**
 * §5.8c «Make this a separate project»: mint a new id and rewrite THIS folder's
 * `project.json` atomically. It writes only the folder that was opened; the lock is the
 * folder's EXISTING project id so it serialises with any tab editing that project.
 * Returns the new project id.
 */
export async function makeProjectSeparate(
  folderName: string,
  projectId: string,
): Promise<string> {
  const root = await getRootDir();
  if (!root) throw new Error('no projects root is open');
  const projectDir = await root.getDirectoryHandle(folderName, { create: false });
  const file = await readProjectFile(projectDir);
  const nextId = newId();
  const updated: ProjectFile = { ...file, project: { ...file.project, id: nextId } };
  await writeJsonAtomic(projectDir, 'project.json', updated, projectId);
  registerOpenProject(nextId, folderName);
  return nextId;
}

/* ------------------------------------------------------------------ *
 * Create a new project folder (Home «New project»)
 * ------------------------------------------------------------------ */

/** Bound on folder-name probing — a pathological root cannot hang the button. */
export const MAX_NEW_PROJECT_NAMES = 200;

export interface CreatedProject {
  /** Fresh `crypto.randomUUID()` project id. */
  id: string;
  /** The generated, free folder name under the projects root. */
  folderName: string;
  /** The exact envelope written to `project.json`. */
  projectFile: ProjectFile;
  /** The created folder handle (`root/<folderName>`). */
  projectDir: FileSystemDirectoryHandle;
}

/**
 * Create a new project as an APP-NAMED subfolder of the projects root (product
 * decision: «New project» creates a folder — no OS picker; D135 later added the name pop-up).
 *
 * Naming: the typed project name (sanitized), or with none the approved Home copy
 * `STRINGS.home.newProject` ('New project'); then '<name> 2', '<name> 3', … A name is free when `getDirectoryHandle(name,
 * { create: false })` throws NotFoundError. An EXISTING folder is NEVER adopted by a
 * "new project" action (that would silently reopen old work). The probe is bounded by
 * `MAX_NEW_PROJECT_NAMES` and throws when exhausted.
 *
 * `title` defaults to the chosen folder name; the user may rename the TITLE later,
 * which (per its own copy) does not rename the folder on disk.
 *
 * The write goes through the ONE atomic helper, `writeJsonAtomic`, keyed by the D51
 * runtime key `${id}:${folderName}` (also the per-project Web Lock key).
 * Callers (Home) treat a throw as a silent no-op — error surfacing is slice 1.10.
 */
export async function createProject(options?: { title?: string }): Promise<CreatedProject> {
  const typedTitle = options?.title?.trim() ? options.title.trim() : null;
  const root = await getRootDir();
  if (!root) throw new Error('no projects root is open');
  // §5.2 step 3. After a reload the projects-root handle is restored but its write grant is
  // not, so the first `getDirectoryHandle` below would throw `NotAllowedError` — and because
  // the caller surfaces nothing yet (1.10 owns error surfacing) the «New project» button
  // would simply look dead. This runs inside the click's activation window, which is the only
  // place the grant can be asked for. A refusal is a typed error, never a silent no-op.
  if (!(await ensureRootAccess({ request: true }))) {
    throw new StorageWriteError('permission', new Error('projects-root write access was not granted'));
  }

  // The folder is named from what the user typed (D135: the «New project» pop-up), made safe for
  // NTFS by the export filename sanitizer (illegal characters, reserved device names, trailing
  // dots, a 48-character cap). With no name it is the approved «New project» as before.
  const base = typedTitle ? sanitizeToken(typedTitle) : STRINGS.home.newProject;
  let folderName: string | null = null;
  for (let n = 1; n <= MAX_NEW_PROJECT_NAMES; n += 1) {
    const candidate = n === 1 ? base : `${base} ${n}`;
    try {
      // `create: false` THROWS NotFoundError when the name is free; resolving means
      // the folder already exists, so this candidate is skipped (never adopted).
      await root.getDirectoryHandle(candidate, { create: false });
    } catch (e) {
      if ((e as DOMException)?.name === 'NotFoundError') {
        folderName = candidate;
        break;
      }
      throw e; // TypeMismatchError etc. — a real filesystem problem, not a taken name
    }
  }
  if (folderName === null) {
    throw new Error(
      `could not find a free project folder name after ${MAX_NEW_PROJECT_NAMES} attempts`,
    );
  }

  const id = newId();
  const projectFile: ProjectFile = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      id,
      // The title keeps exactly what the user typed (the folder name may be a sanitized form).
      title: typedTitle ?? folderName,
      unitSystem: 'imperial',
      unitFormat: DEFAULT_UNIT_FORMAT,
      precisionDenominator: DEFAULT_PRECISION_DENOMINATOR,
    },
    sheets: [],
  };

  const projectDir = await root.getDirectoryHandle(folderName, { create: true });
  await writeJsonAtomic(projectDir, 'project.json', projectFile, `${id}:${folderName}`);

  return { id, folderName, projectFile, projectDir };
}

export { ROOT_LOCK_SCOPE };
