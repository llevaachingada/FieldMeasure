/**
 * `src/fs/projectSheets.ts` — the **read-only** loader behind the Project screen's sheets
 * grid (UI §11.2; build spec §20.5(a); D88).
 *
 * This module READS. It never writes: every access goes through the existing
 * `src/fs/projectStore.ts` helpers (`resolveOpenProjectDir` → `readProjectFile` →
 * `readSheetMarkup` / `resolveSheetDir`), so there is no second write path, no new storage
 * key, and no `createWritable()` anywhere near it (AGENTS #3).
 *
 * Model notes:
 *   - Sheets come back in `sortIndex` order (build spec §20.6: integers, renumbered
 *     `10 × position`; the grid's `index` is the 1-based position in that order, used for
 *     the card's «04» badge).
 *   - Trashed sheets (`deletedAt`) are excluded — a deleted sheet is in `.trash/`, not the
 *     grid — and the 1-based `index` is computed over the LIVE list, never renumbered on
 *     disk (§20.6: names are labels, not indices).
 *   - A missing `thumb.jpg` is `null` (the card's honest placeholder), never an error: a
 *     sheet that has never been saved with a cached composite still lists.
 *   - `dimensionCount` / `insetCount` are derived from the sheet's REAL `markup.json`:
 *     dimensions are `type === 'dimension'`, insets are `type === 'image'` (§3.3).
 */
import { CURRENT_SCHEMA_VERSION } from '@/domain/migrate';
import type { MarkupFile } from '@/domain/schema';
import {
  readProjectFile,
  readSheetMarkup,
  resolveOpenProjectDir,
  resolveSheetDir,
} from '@/fs/projectStore';

export interface ProjectSheetCard {
  id: string;
  title: string;
  /** 1-based position in `sortIndex` order — the «04» badge value. */
  index: number;
  /** Clock label for `sheet.updatedAt`, e.g. `2:14 PM`. */
  updatedAtLabel: string;
  /** Number of `type === 'dimension'` objects in the sheet's `markup.json`. */
  dimensionCount: number;
  /** Number of `type === 'image'` (inset) objects in the sheet's `markup.json`. */
  insetCount: number;
  /** `thumb.jpg` bytes, or `null` when the sheet has no cached thumbnail yet. */
  thumb: Blob | null;
}

/** `2:14 PM` — 12-hour clock, no leading zero on the hour (UI §11.2's meta example). */
export function clockLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const h24 = at.getHours();
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(at.getMinutes()).padStart(2, '0')} ${suffix}`;
}

function emptyMarkup(sheetId: string): MarkupFile {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, sheetId, objects: [] };
}

/**
 * A sheet whose `sheets/<id>/` folder is gone (an orphan `project.json` entry) must not
 * take the whole grid down with it — the screen's job is to list what exists. A missing
 * folder is tolerated as empty markup; genuine corruption (a `StorageReadError` after the
 * `.history` recovery walk has failed) propagates to the screen's error state, because
 * reporting «0 dimensions» for an unreadable sheet would be a lie.
 */
async function readMarkupOrEmpty(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
): Promise<MarkupFile> {
  try {
    return await readSheetMarkup(projectDir, sheetId, () => emptyMarkup(sheetId));
  } catch (e) {
    if ((e as DOMException)?.name === 'NotFoundError') return emptyMarkup(sheetId);
    throw e;
  }
}

/** `thumb.jpg` bytes, or `null` (missing / unreadable / zero-byte) — never a throw. */
async function readThumb(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
): Promise<Blob | null> {
  try {
    const sheetDir = await resolveSheetDir(projectDir, sheetId);
    const handle = await sheetDir.getFileHandle('thumb.jpg', { create: false });
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

/** Build the Project screen's card model from an OPEN project folder (read-only). */
export async function listProjectSheets(projectId: string): Promise<ProjectSheetCard[]> {
  const projectDir = await resolveOpenProjectDir(projectId);
  const projectFile = await readProjectFile(projectDir);

  const live = projectFile.sheets
    .filter((sheet) => !sheet.deletedAt)
    .slice()
    .sort((a, b) => a.sortIndex - b.sortIndex);

  return Promise.all(
    live.map(async (sheet, i): Promise<ProjectSheetCard> => {
      const markup = await readMarkupOrEmpty(projectDir, sheet.id);
      return {
        id: sheet.id,
        title: sheet.title,
        index: i + 1,
        updatedAtLabel: clockLabel(sheet.updatedAt),
        dimensionCount: markup.objects.filter((o) => o.type === 'dimension').length,
        insetCount: markup.objects.filter((o) => o.type === 'image').length,
        thumb: await readThumb(projectDir, sheet.id),
      };
    }),
  );
}
