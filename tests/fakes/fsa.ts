/**
 * In-memory fakes for the platform APIs the storage layer uses (File System Access,
 * Web Locks, OPFS). Test-only: the runtime dependency list is closed (§2.2), so these
 * are hand-rolled rather than mocked via a new package.
 *
 * Fidelity notes (deliberate, documented):
 *  - `createWritable()` stages writes and commits them on `close()` (the real stream
 *    writes to a swap file and replaces the target on close).
 *  - `move(name)` is a same-directory rename with POSIX overwrite (Chromium M109+).
 *  - `getFile()` returns a real `File`, so `.text()`, `.size` and `.lastModified` are real.
 *  - Fake Web Locks run the granted callback SYNCHRONOUSLY (real locks are async). The
 *    ordering guarantees that matter here — serialize per name, `ifAvailable` bail-out,
 *    no reentrancy — are preserved and made deterministic.
 */
import type { MarkupFile, ProjectFile } from '../../src/domain/schema';

export interface FakeHooks {
  /** Throw here to simulate QuotaExceededError etc. during `write()`. */
  beforeWrite?: (file: FakeFile) => void;
  /** Throw here to simulate a failure during `close()`. */
  beforeClose?: (file: FakeFile) => void;
  /** Throw here to simulate a locked rename target (NoModificationAllowedError). */
  beforeMove?: (file: FakeFile, name: string) => void;
  /** Throw here to simulate `getFile()` throwing (NotReadableError). */
  beforeGetFile?: (file: FakeFile) => void;
  /**
   * Throw here to simulate the HANDLE RESOLUTION itself failing — e.g. a revoked
   * write grant surfacing as `NotAllowedError` from `getFileHandle(name, {create:true})`.
   * Distinct from `beforeGetFile`, which fires once the handle exists and `getFile()`
   * is called. Added for the export-wave review F2 (`writeAtomic`'s tmp handle).
   */
  beforeGetFileHandle?: (name: string) => void;
}

export type FakeEntry = FakeFile | FakeDir;

export class FakeFile {
  readonly kind = 'file' as const;
  content: string;
  lastModified: number;
  parent: FakeDir | null = null;
  private _name: string;

  constructor(
    name: string,
    content = '',
    lastModified = Date.now(),
    private hooks: FakeHooks = {},
  ) {
    this._name = name;
    this.content = content;
    this.lastModified = lastModified;
  }

  get name(): string {
    return this._name;
  }

  get path(): string {
    return this.parent ? `${this.parent.path}/${this._name}` : this._name;
  }

  get size(): number {
    return this.content.length;
  }

  async getFile(): Promise<File> {
    this.hooks.beforeGetFile?.(this);
    return new File([this.content], this._name, { lastModified: this.lastModified });
  }

  async createWritable(): Promise<{
    write: (data: string | Blob | ArrayBuffer) => Promise<void>;
    close: () => Promise<void>;
  }> {
    const file = this;
    let staged = this.content;
    return {
      async write(data) {
        file.hooks.beforeWrite?.(file);
        // Blob/File payloads (photo.jpg, thumb.jpg, markup.json copies) must round-trip as
        // their BYTES, not `String(blob)` ('[object Blob]'). Sheet trash verifies an
        // identical-size copy, so the previous coercion made blob writes unrepresentable.
        // `Blob.text()` is exact for the text-representable fixtures the node tests use;
        // a non-Blob BufferSource keeps the old string coercion.
        if (typeof data === 'string') staged = data;
        else if (typeof (data as Blob).text === 'function') staged = await (data as Blob).text();
        else staged = String(data);
      },
      async close() {
        file.hooks.beforeClose?.(file);
        file.content = staged;
        file.lastModified = Date.now();
      },
    };
  }

  /** `FileSystemFileHandle.move()` — same-dir rename, overwrite-on-move (M109+). */
  async move(name: string): Promise<void> {
    this.hooks.beforeMove?.(this, name);
    const dir = this.parent;
    if (!dir) throw new Error('fake file has no parent directory');
    dir.children.delete(this._name);
    dir.children.delete(name); // POSIX: rename over the target
    this._name = name;
    dir.children.set(name, this);
  }
}

export class FakeDir {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, FakeEntry>();
  parent: FakeDir | null = null;
  private _name: string;

  constructor(
    name: string,
    readonly hooks: FakeHooks = {},
  ) {
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  get path(): string {
    return this.parent ? `${this.parent.path}/${this._name}` : this._name;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeDir> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') {
        throw new DOMException(`not a directory: ${name}`, 'TypeMismatchError');
      }
      return existing;
    }
    if (!options?.create) throw new DOMException(`not found: ${name}`, 'NotFoundError');
    const dir = new FakeDir(name, this.hooks);
    dir.parent = this;
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
    this.hooks.beforeGetFileHandle?.(name);
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw new DOMException(`not a file: ${name}`, 'TypeMismatchError');
      return existing;
    }
    if (!options?.create) throw new DOMException(`not found: ${name}`, 'NotFoundError');
    const file = new FakeFile(name, '', Date.now(), this.hooks);
    file.parent = this;
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const entry = this.children.get(name);
    if (!entry) throw new DOMException(`not found: ${name}`, 'NotFoundError');
    if (entry.kind === 'directory' && !options?.recursive) {
      throw new DOMException(`directory not empty: ${name}`, 'InvalidModificationError');
    }
    this.children.delete(name);
  }

  async *entries(): AsyncGenerator<[string, FakeEntry]> {
    for (const entry of [...this.children.entries()]) yield entry;
  }

  /* ---------- test helpers ---------- */

  childDir(path: string): FakeDir {
    let dir: FakeDir = this;
    for (const part of path.split('/').filter(Boolean)) {
      const next = dir.children.get(part);
      if (!next || next.kind !== 'directory') throw new Error(`no such directory: ${dir.path}/${part}`);
      dir = next;
    }
    return dir;
  }

  mkdir(path: string): FakeDir {
    let dir: FakeDir = this;
    for (const part of path.split('/').filter(Boolean)) {
      const next = dir.children.get(part);
      if (next) {
        if (next.kind !== 'directory') throw new Error(`not a directory: ${next.path}`);
        dir = next;
        continue;
      }
      const created = new FakeDir(part, this.hooks);
      created.parent = dir;
      dir.children.set(part, created);
      dir = created;
    }
    return dir;
  }

  fileAt(path: string): FakeFile {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`invalid path: ${path}`);
    const dir = parts.length ? this.childDir(parts.join('/')) : this;
    const entry = dir.children.get(name);
    if (!entry || entry.kind !== 'file') throw new Error(`no such file: ${path}`);
    return entry;
  }

  /** Create/overwrite a file with optional `lastModified`. */
  putFile(path: string, content: string, lastModified = Date.now()): FakeFile {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`invalid path: ${path}`);
    const dir = parts.length ? this.mkdir(parts.join('/')) : this;
    const existing = dir.children.get(name);
    if (existing && existing.kind === 'file') {
      existing.content = content;
      existing.lastModified = lastModified;
      return existing;
    }
    const file = new FakeFile(name, content, lastModified, this.hooks);
    file.parent = dir;
    dir.children.set(name, file);
    return file;
  }

  textAt(path: string): string {
    return this.fileAt(path).content;
  }

  has(path: string): boolean {
    try {
      this.fileAt(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Every file path in the tree, sorted. */
  filePaths(): string[] {
    const out: string[] = [];
    for (const entry of this.children.values()) {
      if (entry.kind === 'file') out.push(entry.path);
      else out.push(...(entry as FakeDir).filePaths());
    }
    return out.sort();
  }

  /** Every `*.tmp` path in the tree — the kill-switch gate's "no survivors" predicate. */
  tmpPaths(): string[] {
    return this.filePaths().filter((p) => p.endsWith('.tmp'));
  }
}

/* ------------------------------------------------------------------ *
 * Web Locks
 * ------------------------------------------------------------------ */

export interface FakeLocks {
  request: (
    name: string,
    optionsOrCallback?: unknown,
    maybeCallback?: unknown,
  ) => Promise<unknown>;
  /** Every lock name requested, in order (asserts §5.3 S1 lock coverage). */
  requested: string[];
  isHeld(name: string): boolean;
}

interface LockState {
  held: boolean;
  /** Waiters for an exclusive (non-ifAvailable) request: each receives the release fn. */
  queue: Array<(release: () => void) => void>;
}

export function createFakeLocks(): FakeLocks {
  const states = new Map<string, LockState>();
  const requested: string[] = [];

  const stateFor = (name: string): LockState => {
    let state = states.get(name);
    if (!state) {
      state = { held: false, queue: [] };
      states.set(name, state);
    }
    return state;
  };

  const release = (name: string): void => {
    const state = stateFor(name);
    const next = state.queue.shift();
    if (next) next(() => release(name)); // hand the lock straight to the next waiter
    else state.held = false;
  };

  const request = (
    name: string,
    optionsOrCallback?: unknown,
    maybeCallback?: unknown,
  ): Promise<unknown> => {
    requested.push(name);
    const options = (typeof optionsOrCallback === 'function' ? {} : optionsOrCallback ?? {}) as {
      mode?: string;
      ifAvailable?: boolean;
    };
    const callback = (
      typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
    ) as (lock: { name: string; mode: string }) => unknown;
    const state = stateFor(name);
    const info = { name, mode: options.mode ?? 'exclusive' };

    if (state.held) {
      if (options.ifAvailable) return Promise.resolve(undefined); // not granted, no callback
      return new Promise((resolve, reject) => {
        state.queue.push((releaseFn) => {
          let result: unknown;
          try {
            result = callback(info);
          } catch (e) {
            releaseFn();
            reject(e);
            return;
          }
          Promise.resolve(result).then(
            (value) => {
              releaseFn();
              resolve(value);
            },
            (e) => {
              releaseFn();
              reject(e);
            },
          );
        });
      });
    }

    state.held = true;
    let result: unknown;
    try {
      result = callback(info);
    } catch (e) {
      release(name);
      return Promise.reject(e);
    }
    return Promise.resolve(result).then(
      (value) => {
        release(name);
        return value;
      },
      (e) => {
        release(name);
        throw e;
      },
    );
  };

  return {
    request,
    requested,
    isHeld: (name) => stateFor(name).held,
  };
}

/* ------------------------------------------------------------------ *
 * navigator (locks + OPFS)
 * ------------------------------------------------------------------ */

/** Install a fake `navigator`; returns a restore function. */
export function installFakeNavigator(nav: {
  locks?: FakeLocks;
  storage?: {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    persisted?: () => Promise<boolean>;
    persist?: () => Promise<boolean>;
  };
}): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...(nav.locks ? { locks: nav.locks } : {}), ...(nav.storage ? { storage: nav.storage } : {}) },
    configurable: true,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** The fakes are structurally FSA-ish; the app's signatures take the real DOM types. */
export const asDir = (dir: FakeDir): FileSystemDirectoryHandle =>
  dir as unknown as FileSystemDirectoryHandle;
export const asFile = (file: FakeFile): FileSystemFileHandle =>
  file as unknown as FileSystemFileHandle;

export function validProjectFile(overrides?: {
  id?: string;
  title?: string;
  sheetCount?: number;
  updatedAt?: string;
}): ProjectFile {
  const id = overrides?.id ?? 'project-1';
  const updatedAt = overrides?.updatedAt ?? '2026-09-21T14:12:00.000Z';
  const sheetCount = overrides?.sheetCount ?? 1;
  return {
    schemaVersion: 1,
    project: {
      id,
      title: overrides?.title ?? 'Riverside Elementary',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: Array.from({ length: sheetCount }, (_, i) => ({
      id: `sheet-${i + 1}`,
      title: `Sheet ${String(i + 1).padStart(2, '0')}`,
      // §20.6:2584 — sheet indices are integers with gaps of 10, `10 × (position + 1)`.
      // This fixture used `i` (0-based, gap 1) until session 22, which contradicted the
      // spec and produced a false expectation in `cameraFlow.test.tsx` (an appended sheet
      // appeared to sort *before* every existing sheet once a reorder renumbered them).
      // A fixture that disagrees with the convention under test is a wrong-measurement
      // factory: `nextSortIndex` reads `max(live) + 10`.
      sortIndex: (i + 1) * 10,
      imageWidth: 4096,
      imageHeight: 3072,
      createdAt: '2026-09-21T14:12:00.000Z',
      updatedAt,
    })),
  };
}

export function validMarkupFile(sheetId = 'sheet-1', objects: MarkupFile['objects'] = []): MarkupFile {
  return { schemaVersion: 1, sheetId, objects };
}
