/**
 * `src/fs/sheetTrash.ts` — the **storage half** of sheet trash (UI §13.3 line 800; build
 * spec §11.9 line 2029): delete a sheet into `<project>/.trash/`, restore it, and the
 * 14-day prune that runs on project open.
 *
 * A sheet is someone's measurement record, so the rules here are deliberately paranoid:
 *
 *  - **There is no second trash ledger.** The `project.json` row's `deletedAt` IS the trash
 *    state (schema.ts:125, types.ts:80). Delete = copy the folder + set `deletedAt`;
 *    restore = copy the folder back + clear it. `scanProjects`, `sheetIntake` and the grid
 *    loader already skip rows with `deletedAt`.
 *  - **`FileSystemDirectoryHandle` has no `move()`** (files only). The spec says the files
 *    *move*, so the implementation is **copy → verify → only then `removeEntry` the original**.
 *    Nothing is ever removed before its copy is verified, so the user is never left with
 *    neither copy.
 *  - **Only the 14-day rule may remove a trash entry** (build spec §5.8(a): pruning
 *    `.history/`/`.trash/` to make room for a save is a data-loss path). Nothing in this
 *    module is called to free space; `pruneTrash` is the single expiry path.
 *  - **`cleanStaleTmp` skips `.trash/`** (projectStore.ts:463-469) — pinned. A `*.tmp` in
 *    `.trash/` is user-restorable and is never reaped by delete/restore/prune.
 *  - Every write goes through the existing store helpers, including `writeAtomic` (blobs)
 *    and `writeJsonAtomic` (`project.json`), which are the ONLY place `createWritable()` is
 *    called (AGENTS #3). No `createWritable()` here.
 */
import type { ProjectFile } from '@/domain/schema';
import {
  entriesOf,
  readProjectFile,
  resolveOpenProjectDir,
  resolveSheetDir,
  writeAtomic,
  writeJsonAtomic,
} from './projectStore';

/** 14 days (spec) → milliseconds: 14 × 24 × 60 × 60 × 1000 = 1_209_600_000 ms. */
export const TRASH_RETENTION_DAYS = 14;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** One day in ms: 24 × 60 × 60 × 1000 = 86_400_000. */
const DAY_MS = 24 * 60 * 60 * 1000;
const TRASH_DIR = '.trash';
const SHEETS_DIR = 'sheets';

export interface TrashedSheet {
  id: string;
  title: string;
  /** ISO, from the `project.json` row. */
  deletedAt: string;
  /** Whole days until the 14-day prune (see the boundary note on `daysLeft`). */
  daysLeft: number;
  /** The trashed sheet's `thumb.jpg`, or `null`. */
  thumb: Blob | null;
}

function isNotFound(e: unknown): boolean {
  return (e as DOMException)?.name === 'NotFoundError';
}

/** `entries()` walk of a sheet folder → `.trash/<id>/` (or back). Byte-faithful per file.
 *  Exported (D111) so `sheetOps.duplicateSheet` reuses the exact same copy → per-file
 *  size-verify path rather than a second, divergent copier. */
export async function copySheetTree(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
  projectId: string,
): Promise<void> {
  for await (const [name, handle] of entriesOf(src)) {
    if (handle.kind === 'directory') {
      const sub = await dest.getDirectoryHandle(name, { create: true });
      await copySheetTree(handle as FileSystemDirectoryHandle, sub, projectId);
      continue;
    }
    const source = await (handle as FileSystemFileHandle).getFile();
    // The ONE atomic blob writer — tmp → close → move, under the per-project Web Lock.
    // A source `foo.tmp` becomes `foo.tmp.tmp` and is moved to `foo.tmp`, so tmps travel.
    await writeAtomic(dest, name, source, projectId);
    // VERIFY before the caller is allowed to remove the original: the copy must be present
    // and the same size. A partial/failed blob write lands as 0 bytes, so any non-empty
    // source whose copy is empty fails here (this is the "present and non-zero" check).
    const written = await (await dest.getFileHandle(name, { create: false })).getFile();
    if (written.size !== source.size) {
      throw new Error(
        `sheet trash copy verification failed for ${name}: source ${source.size} bytes, copy ${written.size} bytes`,
      );
    }
  }
}

/** `thumb.jpg` from a trash folder — `null` (missing / unreadable / zero-byte), never a throw. */
async function readTrashThumb(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
): Promise<Blob | null> {
  try {
    const trashRoot = await projectDir.getDirectoryHandle(TRASH_DIR, { create: false });
    const trashDir = await trashRoot.getDirectoryHandle(sheetId, { create: false });
    const handle = await trashDir.getFileHandle('thumb.jpg', { create: false });
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

/**
 * Delete a sheet into `<project>/.trash/<id>/` (UI §13.3).
 *
 * Order is **copy → verify → remove original → mark the row** — the copy is verified before
 * anything is removed, and the row is marked only once its files are safely under `.trash/`.
 * If the copy fails at any point the original is untouched and the error propagates: the
 * sheet stays live.
 *
 * Tolerances:
 *  - the sheet's folder is already gone → mark the row and copy nothing;
 *  - the `id` is not in `project.json` → honest throw (never mark a row that is not there);
 *  - the sheet is already deleted → idempotent no-op (a double undo/double tap is safe).
 */
export async function deleteSheet(
  projectId: string,
  sheetId: string,
  now: Date = new Date(),
): Promise<void> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const row = file.sheets.find((s) => s.id === sheetId);
  if (!row) throw new Error(`cannot delete sheet ${sheetId}: not found in project.json`);
  if (row.deletedAt) return; // already in the trash — nothing to do

  let sheetDir: FileSystemDirectoryHandle | null = null;
  try {
    sheetDir = await resolveSheetDir(projectDir, sheetId, { create: false });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    // The folder is already gone (an orphan row). Nothing to copy — just mark the row.
  }

  if (sheetDir) {
    const trashRoot = await projectDir.getDirectoryHandle(TRASH_DIR, { create: true });
    // If `.trash/<id>/` did not pre-exist, a failed copy may clean up after itself below,
    // without ever touching a legitimate earlier trash entry.
    let preExisting = true;
    try {
      await trashRoot.getDirectoryHandle(sheetId, { create: false });
    } catch {
      preExisting = false;
    }
    const trashDir = await trashRoot.getDirectoryHandle(sheetId, { create: true });
    try {
      await copySheetTree(sheetDir, trashDir, projectId);
    } catch (e) {
      if (!preExisting) {
        try {
          await trashRoot.removeEntry(sheetId, { recursive: true });
        } catch {
          // best-effort cleanup of our own partial copy; the original is untouched
        }
      }
      throw e;
    }
  }

  // Review F2 — mark the row BEFORE removing the original. The earlier order (remove, then
  // write) left a half-deleted sheet whenever the atomic `project.json` write failed — the S5
  // locked/another-app case: the folder gone from `sheets/`, its files in `.trash/`, and the
  // row still live, so the grid showed a card for a sheet whose folder no longer existed, the
  // trash panel could not see it, and Restore refused it as "already live". Marking first makes
  // that same failure the harmless state: the ledger says deleted, the files are safely in the
  // trash, and any leftover folder in `sheets/` is inert (a later Restore simply copies over it).
  const next: ProjectFile = {
    ...file,
    sheets: file.sheets.map((s) =>
      s.id === sheetId ? { ...s, deletedAt: now.toISOString() } : s,
    ),
  };
  await writeJsonAtomic(projectDir, 'project.json', next, projectId);

  if (sheetDir) {
    // The copy is verified and the ledger is written. Only now remove the original folder,
    // recursively; "already gone" is fine.
    const sheetsDir = await projectDir.getDirectoryHandle(SHEETS_DIR, { create: false });
    try {
      await sheetsDir.removeEntry(sheetId, { recursive: true });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

/**
 * Restore a sheet from `.trash/<id>/` back into `sheets/<id>/` and clear `deletedAt`
 * (UI §13.3, build spec line 2029).
 *
 * If the trash copy is missing this **fails honestly** and never clears the row — clearing
 * `deletedAt` without the files would make the grid list a sheet whose folder is gone.
 *
 * The row is cleared **before** the trash copy is removed, deliberately: if the atomic
 * `project.json` write fails after the trash copy were gone, the only copy of the sheet
 * would be stranded behind a `deletedAt` that the 14-day prune would later erase. Clearing
 * the row first means the worst case is a harmless duplicate (files in both places).
 */
export async function restoreSheet(projectId: string, sheetId: string): Promise<void> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const row = file.sheets.find((s) => s.id === sheetId);
  if (!row) throw new Error(`cannot restore sheet ${sheetId}: not found in project.json`);
  if (!row.deletedAt) return; // already live — idempotent no-op

  // Resolve the trash copy FIRST: a missing copy must not create an empty `sheets/<id>/`
  // and must not clear the row.
  let trashRoot: FileSystemDirectoryHandle;
  let trashDir: FileSystemDirectoryHandle;
  try {
    trashRoot = await projectDir.getDirectoryHandle(TRASH_DIR, { create: false });
    trashDir = await trashRoot.getDirectoryHandle(sheetId, { create: false });
  } catch (e) {
    throw new Error(`cannot restore sheet ${sheetId}: its trash copy is missing`, { cause: e });
  }

  // Copy → verify. `copySheetTree` throws before anything is written back if verification
  // fails, so the trash copy remains the authority until the row write succeeds.
  const sheetDir = await resolveSheetDir(projectDir, sheetId, { create: true });
  await copySheetTree(trashDir, sheetDir, projectId);

  const next: ProjectFile = {
    ...file,
    sheets: file.sheets.map((s) => (s.id === sheetId ? { ...s, deletedAt: null } : s)),
  };
  await writeJsonAtomic(projectDir, 'project.json', next, projectId);

  // The sheet is live again; removing the trash copy is now cleanup, not recovery. A failure
  // here (a lock, a permission hiccup) leaves a duplicate — it never costs the user a copy,
  // and it must not be reported as a failed restore when the restore itself succeeded.
  try {
    await trashRoot.removeEntry(sheetId, { recursive: true });
  } catch {
    // best-effort cleanup; the sheet is already restored and the row already cleared
  }
}

/**
 * `daysLeft` — whole days until the 14-day prune, computed as
 * `ceil((deletedAt + 14d − now) / 1d)`, clamped at 0.
 *
 * Arithmetic at the boundary: just deleted → 14; 13 days old → 1; exactly 14 days old →
 * remaining 0 → 0 (and the entry is KEPT — see `pruneTrash`); older → negative → 0.
 */
function daysLeftFor(deletedAt: string, now: Date): number {
  const at = Date.parse(deletedAt);
  if (!Number.isFinite(at)) return 0;
  const remaining = at + TRASH_RETENTION_MS - now.getTime();
  return Math.max(0, Math.ceil(remaining / DAY_MS));
}

/** List the trashed sheets of an open project, newest deletion first. */
export async function listTrash(
  projectId: string,
  now: Date = new Date(),
): Promise<TrashedSheet[]> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const trashed = file.sheets
    .filter((s): s is typeof s & { deletedAt: string } => !!s.deletedAt)
    .slice()
    .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt) || a.id.localeCompare(b.id));
  return Promise.all(
    trashed.map(async (s): Promise<TrashedSheet> => ({
      id: s.id,
      title: s.title,
      deletedAt: s.deletedAt,
      daysLeft: daysLeftFor(s.deletedAt, now),
      thumb: await readTrashThumb(projectDir, s.id),
    })),
  );
}

/**
 * Remove only the entries whose `deletedAt` is **strictly older than 14 days**; returns the
 * ids removed. This is the ONLY thing that may remove a trash entry — it is run on project
 * open (build spec line 2029), never to free space for a save (§5.8(a)).
 *
 * Boundary (pinned): expiry requires `deletedAtMs < now − 14d`, i.e. `Date.parse(deletedAt)
 * < now.getTime() − 1_209_600_000`. An entry deleted EXACTLY 14 days ago has `age === 14d`,
 * which is not `< 14d` → **kept**. A row with an unparseable `deletedAt` is kept (NaN
 * comparisons are false), never pruned on garbage.
 *
 * Nothing outside `.trash/<id>/` and the matching `project.json` row is touched: `.history/`,
 * `assets/`, other sheets and any `*.tmp` are left alone.
 */
export async function pruneTrash(
  projectId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const cutoff = now.getTime() - TRASH_RETENTION_MS;
  const expired = file.sheets.filter((s) => {
    if (!s.deletedAt) return false;
    const at = Date.parse(s.deletedAt);
    return Number.isFinite(at) && at < cutoff; // strictly older than 14 days
  });
  if (expired.length === 0) return [];
  const expiredIds = expired.map((s) => s.id);
  const expiredSet = new Set(expiredIds);

  // Remove the `.trash/<id>/` folders first, tolerating an already-missing folder, then rewrite
  // the rows once. ORDER IS DELIBERATE, and the honest description of its failure mode is this:
  // a failure part-way through a MULTI-entry prune can leave a row whose folder is already gone
  // (the panel lists the name, Restore reports the missing copy honestly, and the next prune
  // clears the ghost row). The alternatives are worse — rows-first would strand un-prunable
  // orphan folders with no ledger, and a per-entry rewrite would multiply the failure windows.
  // Review F3 corrected this comment: the earlier text claimed "fully pruned or untouched —
  // never listed with its files gone", which execution disproved.
  let trashRoot: FileSystemDirectoryHandle | null = null;
  try {
    trashRoot = await projectDir.getDirectoryHandle(TRASH_DIR, { create: false });
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  if (trashRoot) {
    for (const id of expiredIds) {
      try {
        await trashRoot.removeEntry(id, { recursive: true });
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }
  }

  const next: ProjectFile = {
    ...file,
    sheets: file.sheets.filter((s) => !expiredSet.has(s.id)),
  };
  await writeJsonAtomic(projectDir, 'project.json', next, projectId);
  return expiredIds;
}
