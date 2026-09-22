/**
 * `src/fs/sheetOps.ts` — the **storage half** of the Project screen's remaining card
 * actions (D111; build spec §20.6:2584, §20.2, UI spec §11.2:720): reorder
 * (`sortIndex`), rename, duplicate, and the constrained replace-photo.
 *
 * This module mirrors `src/fs/sheetTrash.ts` deliberately — it is the model:
 *  - copy → verify → **only then** mutate `project.json`, so a failed copy never
 *    costs the user their source;
 *  - every write goes through the ONE atomic helper pair, `writeAtomic` (blobs) and
 *    `writeJsonAtomic` (`project.json`/`markup.json`). `createWritable()` is called
 *    in `projectStore.ts` and nowhere else (AGENTS #3);
 *  - `projectId` is always the full D51 runtime key `${id}:${folderName}` — never a
 *    bare project id;
 *  - the on-disk folder `sheets/<id>/` is **never renamed** (§20.6:2588): names are
 *    labels, not indices.
 *
 * There is no `label` field anywhere (AGENTS #2): a title is stored once and the
 * render text is derived at render time, so these operations change `title` and
 * `sortIndex` only.
 */
import { newId } from '@/domain/ids';
import { CURRENT_SCHEMA_VERSION } from '@/domain/migrate';
import type { MarkupFile, ProjectFile } from '@/domain/schema';
import {
  readProjectFile,
  resolveOpenProjectDir,
  resolveSheetDir,
  writeAtomic,
  writeJsonAtomic,
} from './projectStore';
import { copySheetTree } from './sheetTrash';

/** One `project.json` sheet row. Exported so callers can share the shape. */
export type SheetRow = ProjectFile['sheets'][number];

/** A sheet folder that is currently live (no `deletedAt`). */
function isLive(row: SheetRow): boolean {
  return !row.deletedAt;
}

/** The bytes of `name` in `dir`, or `null` when it is missing or unreadable. */
async function readFileOrNull(dir: FileSystemDirectoryHandle, name: string): Promise<Blob | null> {
  try {
    return await (await dir.getFileHandle(name, { create: false })).getFile();
  } catch {
    return null;
  }
}

/** Best-effort rollback of a photo a failed replace may have overwritten. */
async function restorePhoto(
  dir: FileSystemDirectoryHandle,
  projectId: string,
  previous: Blob | null,
): Promise<void> {
  if (!previous) return; // nothing to restore (the sheet had no readable photo)
  try {
    await writeAtomic(dir, 'photo.jpg', previous, projectId);
  } catch {
    // Best-effort: the caller's failure is already being reported. A restore that also
    // fails leaves the sheet in the state the failure line describes.
  }
}

/**
 * The next sheet `sortIndex` (§20.6:2584, the §20.2 idiom): `max(sortIndex of LIVE
 * rows) + 10`, or **10** when there are no live rows.
 *
 * Arithmetic: with no live rows the max is defined as 0, so `0 + 10 = 10` — the
 * first position is `10 × (position + 1) = 10 × 1 = 10`. The gap of 10 leaves room
 * to insert a sheet between two neighbours without renumbering.
 *
 * Trashed rows (`deletedAt`) do NOT count: a deleted sheet is not in the grid, and
 * its `sortIndex` is never renumbered (§20.6). Counting one would let a stale high
 * index push the next live sheet past its neighbours.
 */
export function nextSortIndex(sheets: readonly SheetRow[]): number {
  let max = 0;
  for (const sheet of sheets) {
    if (!isLive(sheet)) continue;
    if (sheet.sortIndex > max) max = sheet.sortIndex;
  }
  return max + 10;
}

/**
 * Renumber the LIVE rows after a drag-reorder (UI §11.2; §20.6:2584): each live
 * row's `sortIndex` becomes `10 × (position + 1)` for its 0-based position in
 * `orderedIds` → `10, 20, 30 …`.
 *
 * `orderedIds` MUST be an exact permutation of the file's live sheet ids. A partial
 * list would renumber only a subset and silently scramble the rest, so anything
 * else — a missing id, an unknown id, a trashed id, or a duplicate id — **throws**.
 *
 * Pure: returns a NEW file and never mutates the input. Trashed rows keep their
 * `sortIndex`. The on-disk array order is irrelevant — `listProjectSheets` sorts by
 * `sortIndex` ascending (`projectSheets.ts:102`), so only the numbers matter.
 */
export function reorderSheetRows(
  file: ProjectFile,
  orderedIds: readonly string[],
): ProjectFile {
  const liveIds = new Set(file.sheets.filter(isLive).map((s) => s.id));
  if (orderedIds.length !== liveIds.size) {
    throw new Error(
      `cannot reorder sheets: expected ${liveIds.size} live ids, received ${orderedIds.length}`,
    );
  }
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!liveIds.has(id)) {
      throw new Error(`cannot reorder sheets: ${id} is not a live sheet id`);
    }
    if (seen.has(id)) {
      throw new Error(`cannot reorder sheets: ${id} appears more than once`);
    }
    seen.add(id);
  }

  const indexById = new Map<string, number>();
  orderedIds.forEach((id, position) => {
    // 10 × (position + 1): position 0 → 10, 1 → 20, 2 → 30 …
    indexById.set(id, 10 * (position + 1));
  });

  return {
    ...file,
    sheets: file.sheets.map((sheet) =>
      isLive(sheet) ? { ...sheet, sortIndex: indexById.get(sheet.id)! } : sheet,
    ),
  };
}

/**
 * Rename a live sheet. The **title only** changes:
 *  - the on-disk folder `sheets/<id>/` is never renamed (§20.6:2588) — names are
 *    labels, not indices;
 *  - `sortIndex` is untouched;
 *  - `updatedAt` is **deliberately NOT changed**. `updatedAt` is the sheet's CONTENT
 *    time (the grid's «2:14 PM» meta line, and the newest-sheet sort in
 *    `scanProjects`); a rename is not a content change and must not claim to be one.
 *
 * `title.trim()` must be non-empty — a blank title would render a nameless card, and
 * there is no `label` field anywhere to fall back on (AGENTS #2). The UI also guards
 * this, but the storage layer must never persist `''`.
 *
 * Throws for an unknown id or a trashed one: a sheet in `.trash/` is not renameable.
 */
export async function renameSheet(
  projectId: string,
  sheetId: string,
  title: string,
): Promise<void> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const row = file.sheets.find((s) => s.id === sheetId);
  if (!row) throw new Error(`cannot rename sheet ${sheetId}: not found in project.json`);
  if (row.deletedAt) throw new Error(`cannot rename sheet ${sheetId}: it is deleted`);

  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new Error(`cannot rename sheet ${sheetId}: the title is empty`);
  }

  const next: ProjectFile = {
    ...file,
    sheets: file.sheets.map((s) => (s.id === sheetId ? { ...s, title: trimmed } : s)),
  };
  await writeJsonAtomic(projectDir, 'project.json', next, projectId);
}

/**
 * Duplicate a live sheet (UI §11.2 card menu). New id via `crypto.randomUUID()`
 * (`newId`, no package — AGENTS #5), then the sheet folder is copied
 * `sheets/<srcId>/` → `sheets/<newId>/` with `copySheetTree`, which is
 * **copy → per-file size verify** and throws before the caller proceeds on any
 * mismatch.
 *
 * Order is copy → verify → **then** append the row: a failed copy leaves the source
 * untouched, `project.json` unchanged, and cleans up only the folder THIS call
 * created (a fresh UUID cannot collide with an existing folder).
 *
 * The new row copies `imageWidth`/`imageHeight`/`calibrationPxPerFoot` from the
 * source and gets `createdAt = updatedAt = now`, **no `deletedAt`**. Placement is the
 * END of the list — the §20.2 create rule — via `nextSortIndex`, i.e.
 * `max(live) + 10`. The copy includes `photo.jpg`, `thumb.jpg` and `markup.json`
 * byte-for-byte (plus any other file the folder carries). The caller owns the title
 * copy (`strings.ts`).
 */
export async function duplicateSheet(
  projectId: string,
  sheetId: string,
  title: string,
): Promise<{ id: string }> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const source = file.sheets.find((s) => s.id === sheetId);
  if (!source) throw new Error(`cannot duplicate sheet ${sheetId}: not found in project.json`);
  if (source.deletedAt) throw new Error(`cannot duplicate sheet ${sheetId}: it is deleted`);

  const newSheetId = newId();
  const sourceDir = await resolveSheetDir(projectDir, sheetId, { create: false });

  // `newId()` is a fresh UUID, so this folder cannot pre-exist; a failed copy may
  // clean it up without ever touching a legitimate folder.
  const destDir = await resolveSheetDir(projectDir, newSheetId, { create: true });
  try {
    await copySheetTree(sourceDir, destDir, projectId);
  } catch (e) {
    try {
      const sheetsDir = await projectDir.getDirectoryHandle('sheets', { create: false });
      await sheetsDir.removeEntry(newSheetId, { recursive: true });
    } catch {
      // best-effort cleanup of our own partial copy; the source is untouched
    }
    throw e;
  }

  const now = new Date();
  const row: SheetRow = {
    id: newSheetId,
    title,
    sortIndex: nextSortIndex(file.sheets),
    imageWidth: source.imageWidth,
    imageHeight: source.imageHeight,
    calibrationPxPerFoot: source.calibrationPxPerFoot ?? null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const next: ProjectFile = { ...file, sheets: [...file.sheets, row] };
  await writeJsonAtomic(projectDir, 'project.json', next, projectId);
  return { id: newSheetId };
}

/**
 * The §11.2:720 **constrained replace**: swap a sheet's base photo, keeping the
 * markup only if the caller says so.
 *
 * ORDER — and why (every step is a crash window, and the order is chosen so that the
 * worst available outcome is never a lie and never a wrong-measurement state):
 *  1. Read the photo we are about to overwrite. `writeAtomic` writes a tmp file and then
 *     `move`s it, so a partial write cannot land at `photo.jpg` — but the ledger write
 *     below can still fail (a locked `project.json`, §5.8 S5), and the row would then
 *     describe the *previous* photo. Restoring is what makes a failed replace leave the
 *     sheet as it was. This is `sheetTrash`'s "never lose the source" principle applied
 *     to an in-place overwrite, which has no "copy somewhere else first" escape.
 *  2. **Remove the stale `thumb.jpg` first.** It is the one step that can fail for a
 *     reason we cannot work around (a locked `thumb.jpg`), and doing it first means the
 *     "cannot proceed" case changes nothing the user can see: the card falls back to the
 *     honest placeholder instead of showing a composite of a photo the sheet no longer
 *     has. The cached composite is of the OLD photo either way, so if this fails we must
 *     NOT carry on — a card showing the previous photo under a new sheet is exactly the
 *     class of defect this project keeps fixing (D110/D114).
 *  3. Write the new `photo.jpg` atomically, then **verify** it (re-read, compare `size`
 *     to the blob's — the `copySheetTree` idiom, which also catches a zero-byte write).
 *  4. Write the row's new `imageWidth`/`imageHeight` and `updatedAt` (a replaced photo IS
 *     a content change). Nothing else on the row changes. A failure here restores the
 *     photo from step 1, so the sheet is left exactly as it was.
 *  5. **Last**, on `'remove'`, overwrite `markup.json` with an empty object list. A
 *     failure at this point leaves the photo and the row consistently new and the markup
 *     still on disk — the user can see the coordinates they chose to drop. The opposite
 *     order would let a ledger failure destroy markup the user never got a new photo
 *     for, which is a silent loss; this order's worst case is markup they already asked
 *     to discard.
 *
 * `choice` is honoured **as given** — this function never re-derives it. The caller
 * only passes `'remove'` when the working-image dimensions differ; identical dims are
 * a silent swap with `'keep'` (the §2.4 constrained-replace rule).
 */
export async function replaceSheetPhoto(
  projectId: string,
  sheetId: string,
  photo: { blob: Blob; width: number; height: number },
  choice: 'keep' | 'remove',
): Promise<void> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const file = await readProjectFile(projectDir);
  const row = file.sheets.find((s) => s.id === sheetId);
  if (!row) throw new Error(`cannot replace photo for sheet ${sheetId}: not found in project.json`);
  if (row.deletedAt) throw new Error(`cannot replace photo for sheet ${sheetId}: it is deleted`);

  // `{ create: false }`: an orphan row (a live row whose folder is gone) is NOT
  // resurrected here. A replace swaps the photo of a sheet that exists; re-creating the
  // folder would leave a half-sheet — a photo, no markup — behind a card that looks
  // healthy. The honest outcome is the failure line the shell already renders.
  const sheetDir = await resolveSheetDir(projectDir, sheetId, { create: false });

  // 1. Keep the bytes we are about to overwrite (see the order note above).
  const previousPhoto = await readFileOrNull(sheetDir, 'photo.jpg');

  // 2. Drop the stale cached composite BEFORE anything else can be lost.
  try {
    await sheetDir.removeEntry('thumb.jpg');
  } catch (e) {
    // A missing thumb is normal (a sheet that was never saved has none); any other
    // failure means we cannot guarantee the card stops showing the old photo, so the
    // whole replace aborts with the photo, the row and the markup untouched.
    if ((e as DOMException)?.name !== 'NotFoundError') throw e;
  }

  let photoWritten = false;
  try {
    // 3. New photo bytes, atomically, then verify before the ledger changes.
    await writeAtomic(sheetDir, 'photo.jpg', photo.blob, projectId);
    photoWritten = true;
    const written = await (await sheetDir.getFileHandle('photo.jpg', { create: false })).getFile();
    if (written.size !== photo.blob.size) {
      throw new Error(
        `replace photo verification failed for sheet ${sheetId}: ` +
          `source ${photo.blob.size} bytes, wrote ${written.size} bytes`,
      );
    }

    // 4. The row's dimensions and content time. Nothing else changes.
    const now = new Date();
    const next: ProjectFile = {
      ...file,
      sheets: file.sheets.map((s) =>
        s.id === sheetId
          ? { ...s, imageWidth: photo.width, imageHeight: photo.height, updatedAt: now.toISOString() }
          : s,
      ),
    };
    await writeJsonAtomic(projectDir, 'project.json', next, projectId);
  } catch (e) {
    // Roll back the photo whenever it may have landed, so the row's dimensions and the
    // bytes on disk can never describe two different pictures.
    if (photoWritten) await restorePhoto(sheetDir, projectId, previousPhoto);
    throw e;
  }

  // 5. The user's explicit choice on the markup — last, deliberately (see the order note).
  if (choice === 'remove') {
    const empty: MarkupFile = { schemaVersion: CURRENT_SCHEMA_VERSION, sheetId, objects: [] };
    await writeJsonAtomic(sheetDir, 'markup.json', empty, projectId);
  }
}
