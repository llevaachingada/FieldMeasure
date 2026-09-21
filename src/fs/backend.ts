/**
 * Storage backend (§5.1) — implementation plan slice 1.2, build order step 1.
 *
 * Two implementations behind one interface:
 *   - `FsaBackend`  — File System Access API (`showDirectoryPicker`, §5.2).
 *   - `OpfsBackend` — Origin Private File System (`navigator.storage.getDirectory()`).
 *
 * LAYOUT DECISION (spec ambiguity, slice 1.2 — see the slice report / DECISIONS):
 * §5.1's `getProjectDir()` is loose about whether the backend is scoped to the
 * ROOT (the folder the user picked, which CONTAINS projects) or to one project
 * folder. §3.1 is explicit that a project is `<Project folder>/{project.json,
 * sheets/, assets/, …}` and that a root holds many projects, and the plan's
 * authoritative signatures pass an explicit `dir` to `writeAtomic` /
 * `readJsonValidated`, so the caller resolves the project folder. Therefore:
 *
 *   BACKEND ROOT == the ROOT projects folder (per §5.2, the picked handle).
 *   `getProjectDir()` returns that ROOT (name kept verbatim from §5.1).
 *   Project folders are resolved by the caller as `root/<projectFolder>/…`
 *   via `getDir(path, { create })` / `ensureDir(path)` (§5.1's own note that
 *   "operations below the project root need subdir helpers").
 *
 * `readText`/`writeTextAtomic`/`readFile` take a path RELATIVE TO THE BACKEND ROOT
 * (they accept `a/b/c`); the app only ever uses them through `projectStore`, which
 * always resolves an explicit project/sheet directory handle first.
 *
 * ATOMIC WRITES: the tmp→close→move primitive lives in ONE place,
 * `projectStore.writeAtomic` (§5.3), which also takes the per-project Web Lock.
 * These backend methods delegate to it so no other module ever calls
 * `createWritable()` (AGENTS non-negotiable 3). The delegation is a dynamic
 * import purely to avoid a static import cycle (projectStore → backend).
 */
import { getProjectsRoot } from '../settings/projectsRoot';

export interface StorageBackend {
  init(): Promise<void>; // load persisted handle / open OPFS; QUERY permission only
  requestAccess(): Promise<boolean>; // user-gesture permission (re)acquisition
  getProjectDir(): FileSystemDirectoryHandle | null;
  readText(name: string): Promise<string>; // relative to the backend root
  writeTextAtomic(name: string, text: string): Promise<void>;
  writeBlobAtomic(name: string, blob: Blob): Promise<void>; // SAME tmp→close→move pattern — mandatory for photos/assets/thumbs
  readFile(name: string): Promise<Blob>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
  // Note: operations below the root need subdir helpers:
  getDir(path: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  ensureDir(path: string): Promise<FileSystemDirectoryHandle>;
}

/** Directory handed back when a write has no project id (root-level files only). */
export const ROOT_LOCK_SCOPE = '__root__';

/** Picker id — must match first-run / §5.2 so Chromium remembers the folder. */
export const PICKER_ID = 'fieldmeasure-projects';

/**
 * `FileSystemFileHandle.move()` is real in Chromium (M109+ overwrite-on-move) but
 * is absent from TypeScript 5.9's `lib.dom.d.ts`, so it is reached through this
 * narrow structural shim rather than `any`.
 */
export interface MovableFileHandle {
  move(name: string): Promise<void>;
}

/** `FileSystemDirectoryHandle.entries()` is likewise missing from lib.dom. */
export interface IterableDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface DirectoryPicker {
  (options?: { id?: string; mode?: 'read' | 'write' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}

/** Splits `a/b/c` and walks from `from`. Single-segment paths are the common case. */
async function walkDir(
  from: FileSystemDirectoryHandle,
  path: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  let dir = from;
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    dir = await dir.getDirectoryHandle(part, options);
  }
  return dir;
}

async function resolveFile(
  from: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter((p) => p && p !== '.');
  const name = parts.pop();
  if (!name) throw new Error(`invalid storage path: ${path}`);
  const dir = await walkDir(from, parts.join('/'));
  return dir.getFileHandle(name, { create: false });
}

/** File System Access implementation (§5.1/§5.2). */
export class FsaBackend implements StorageBackend {
  private root: FileSystemDirectoryHandle | null = null;

  /** §5.2 step 2: load the persisted handle and QUERY permission — never request. */
  async init(): Promise<void> {
    this.root = (await getProjectsRoot()) ?? null;
  }

  /** §5.2 step 3: (re-)acquire permission. MUST be called from a user gesture. */
  async requestAccess(): Promise<boolean> {
    const root = this.root;
    if (!root) return false;
    const request = (
      root as FileSystemDirectoryHandle & {
        requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
      }
    ).requestPermission;
    if (typeof request !== 'function') return false;
    return (await request.call(root, { mode: 'readwrite' })) === 'granted';
  }

  getProjectDir(): FileSystemDirectoryHandle | null {
    return this.root;
  }

  private requireRoot(): FileSystemDirectoryHandle {
    if (!this.root) throw new Error('storage backend is not initialised (no projects root)');
    return this.root;
  }

  async getDir(path: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    return walkDir(this.requireRoot(), path, options);
  }

  async ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
    return walkDir(this.requireRoot(), path, { create: true });
  }

  async readText(name: string): Promise<string> {
    const fh = await resolveFile(this.requireRoot(), name);
    return (await fh.getFile()).text();
  }

  async writeTextAtomic(name: string, text: string): Promise<void> {
    const { writeAtomic } = await import('./projectStore');
    await writeAtomic(this.requireRoot(), name, text, ROOT_LOCK_SCOPE);
  }

  async writeBlobAtomic(name: string, blob: Blob): Promise<void> {
    const { writeAtomic } = await import('./projectStore');
    await writeAtomic(this.requireRoot(), name, blob, ROOT_LOCK_SCOPE);
  }

  async readFile(name: string): Promise<Blob> {
    const fh = await resolveFile(this.requireRoot(), name);
    return fh.getFile();
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const dir = this.requireRoot() as unknown as IterableDirectoryHandle;
    for await (const [name] of dir.entries()) out.push(name);
    return out;
  }

  async remove(name: string): Promise<void> {
    await this.requireRoot().removeEntry(name);
  }
}

/** Origin Private File System implementation (§5.1) — the non-FSA fallback. */
export class OpfsBackend implements StorageBackend {
  private root: FileSystemDirectoryHandle | null = null;

  async init(): Promise<void> {
    const storage = navigator.storage as
      | { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
      | undefined;
    this.root = typeof storage?.getDirectory === 'function' ? await storage.getDirectory() : null;
  }

  /** OPFS has no permission prompt: a usable root is the whole grant. */
  async requestAccess(): Promise<boolean> {
    return this.root !== null;
  }

  getProjectDir(): FileSystemDirectoryHandle | null {
    return this.root;
  }

  private requireRoot(): FileSystemDirectoryHandle {
    if (!this.root) throw new Error('OPFS backend is not initialised');
    return this.root;
  }

  async getDir(path: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    return walkDir(this.requireRoot(), path, options);
  }

  async ensureDir(path: string): Promise<FileSystemDirectoryHandle> {
    return walkDir(this.requireRoot(), path, { create: true });
  }

  async readText(name: string): Promise<string> {
    const fh = await resolveFile(this.requireRoot(), name);
    return (await fh.getFile()).text();
  }

  async writeTextAtomic(name: string, text: string): Promise<void> {
    const { writeAtomic } = await import('./projectStore');
    await writeAtomic(this.requireRoot(), name, text, ROOT_LOCK_SCOPE);
  }

  async writeBlobAtomic(name: string, blob: Blob): Promise<void> {
    const { writeAtomic } = await import('./projectStore');
    await writeAtomic(this.requireRoot(), name, blob, ROOT_LOCK_SCOPE);
  }

  async readFile(name: string): Promise<Blob> {
    const fh = await resolveFile(this.requireRoot(), name);
    return fh.getFile();
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const dir = this.requireRoot() as unknown as IterableDirectoryHandle;
    for await (const [name] of dir.entries()) out.push(name);
    return out;
  }

  async remove(name: string): Promise<void> {
    await this.requireRoot().removeEntry(name);
  }
}

/**
 * §5.1 verbatim, plus a `typeof window` guard so the module can be imported in
 * Node (unit tests, any non-DOM context) instead of throwing a ReferenceError.
 */
export function chooseBackend(): StorageBackend {
  const picker = typeof window === 'undefined' ? undefined : (window as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return typeof picker === 'function' ? new FsaBackend() : new OpfsBackend();
}
