/**
 * Projects-root folder handle (implementation plan slice 0.3 step 3).
 *
 * The first-run folder picker persists a `FileSystemDirectoryHandle` so the app
 * can reach the user's projects folder again after a reload. This is a SETTING
 * (the chosen root), not a project write — the atomic write path (§2.4 / AGENTS
 * non-negotiable 3, `src/fs/projectStore.ts`) is slice 1.2.
 *
 * `showDirectoryPicker` is Chromium-only and is NOT in TypeScript 5.9's
 * `lib.dom`; the ambient declaration below is the minimal shim (the same
 * approach `src/env.d.ts` takes for `process`).
 */
import { get, set } from 'idb-keyval';

export const PROJECTS_ROOT_KEY = 'fm:projects-root';

/** Suggested default shown in first-run step 2 (UI §4.4). This is a PATH, not copy. */
export const SUGGESTED_PROJECTS_PATH = 'Documents\\FieldMeasure';

/** D139: the child folder «Use Documents\FieldMeasure» creates/reuses. Matches
 *  `SUGGESTED_PROJECTS_PATH`'s leaf. */
export const PROJECTS_CHILD_FOLDER = 'FieldMeasure';

/** True when this browser can pick a folder (File System Access, Chromium-only). */
export function supportsFolderPicker(): boolean {
  return typeof globalThis.showDirectoryPicker === 'function';
}

export interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?:
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos'
    | FileSystemHandle;
}

declare global {
  // eslint-disable-next-line no-var
  var showDirectoryPicker:
    | ((options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>)
    | undefined;
}

export async function getProjectsRoot(): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(PROJECTS_ROOT_KEY);
}

export async function setProjectsRoot(handle: FileSystemDirectoryHandle): Promise<void> {
  await set(PROJECTS_ROOT_KEY, handle);
}

/**
 * Open the folder picker seeded at Documents and persist the chosen handle.
 * Returns `null` when the user cancels or the browser has no File System Access
 * API (both are non-fatal — the screen stays on step 2).
 */
export async function pickProjectsFolder(
  options?: { ensureChild?: string },
): Promise<FileSystemDirectoryHandle | null> {
  const picker = globalThis.showDirectoryPicker;
  if (typeof picker !== 'function') return null;
  try {
    const handle = await picker({
      id: 'fieldmeasure-projects',
      mode: 'readwrite',
      startIn: 'documents',
    });
    let root = handle;
    // D139: «Use Documents\FieldMeasure» must really use a FieldMeasure folder. When the user picks
    // its parent (the picker opens in Documents, so «Select Folder» picks Documents itself), create
    // or reuse the named child instead of scanning every folder in Documents as a project.
    if (options?.ensureChild && handle.name.toLowerCase() !== options.ensureChild.toLowerCase()) {
      root = await handle.getDirectoryHandle(options.ensureChild, { create: true });
    }
    await setProjectsRoot(root);
    return root;
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === 'AbortError') return null;
    throw err;
  }
}
