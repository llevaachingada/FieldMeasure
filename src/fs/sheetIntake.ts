/**
 * src/fs/sheetIntake.ts — the single "a photo becomes a sheet" write path.
 *
 * Extracted (verbatim in behaviour) from slice 1.3's `SheetEditor.handleFile`, so
 * that slice 1.4's capture flow and the editor's file-import path cannot drift
 * apart. Each caller hands it an already-normalized photo (slice 1.3
 * `normalizeImage`) plus the destination project; it appends the sheet record to
 * `project.json` and writes `sheets/<id>/photo.jpg`.
 *
 * AGENTS #3: every disk write goes through `projectStore.writeAtomic` /
 * `writeJsonAtomic` (tmp → close → move, under the per-project Web Lock).
 * D51: `projectId` is the runtime key `${id}:${folderName}` everywhere.
 *
 * Thumbnail generation is deliberately absent — `media/thumbnails.ts` is a
 * stateful 3 s debouncer and belongs to the caller that owns the canvas.
 *
 * Write order is photo first, then `project.json`: a crash in between leaves an
 * orphan sheet directory (harmless, and tolerated by `scanProjects`) and never a
 * `project.json` entry pointing at a missing photo.
 */
import { newId } from '@/domain/ids';
import type { ProjectFile } from '@/domain/schema';
import { STRINGS } from '@/ui/strings';
import { resolveSheetDir, writeAtomic, writeJsonAtomic } from './projectStore';

export type SheetFile = ProjectFile['sheets'][number];

export interface SheetIntakeOptions {
  projectDir: FileSystemDirectoryHandle;
  /** The project file as currently read; returned updated on success. */
  projectFile: ProjectFile;
  /** D51 runtime key — `${id}:${folderName}`. NEVER a bare project id. */
  projectId: string;
  /** New sheet's title, e.g. `Sheet 04`. Callers own the copy (strings.ts). */
  title: string;
  /** Sheet `createdAt`: the EXIF capture time when known, else `new Date()`. */
  createdAt: Date;
}

export interface SheetIntakeResult {
  sheet: SheetFile;
  /** The updated project file (callers keep it; it is already on disk). */
  projectFile: ProjectFile;
  sheetDir: FileSystemDirectoryHandle;
}

/** `<prefix> NN`, zero-padded 2, never renumbered (appendix `project.sheetNameExample`). */
export function defaultSheetTitle(projectFile: ProjectFile): string {
  const count = projectFile.sheets.filter((s) => !s.deletedAt).length + 1;
  return `${STRINGS.project.sheetNamePrefix} ${String(count).padStart(2, '0')}`;
}

/** Append one `photo.jpg` sheet to a project. See the module header for write order. */
export async function addSheetFromPhoto(
  photo: { blob: Blob; width: number; height: number },
  options: SheetIntakeOptions,
): Promise<SheetIntakeResult> {
  const { projectDir, projectFile, projectId, title, createdAt } = options;
  const now = new Date();
  const sheet: SheetFile = {
    id: newId(),
    title,
    sortIndex: projectFile.sheets.length,
    imageWidth: photo.width,
    imageHeight: photo.height,
    calibrationPxPerFoot: null,
    createdAt: createdAt.toISOString(),
    updatedAt: now.toISOString(),
  };
  const sheetDir = await resolveSheetDir(projectDir, sheet.id, { create: true });
  await writeAtomic(sheetDir, 'photo.jpg', photo.blob, projectId);
  const nextFile: ProjectFile = { ...projectFile, sheets: [...projectFile.sheets, sheet] };
  await writeJsonAtomic(projectDir, 'project.json', nextFile, projectId);
  return { sheet, projectFile: nextFile, sheetDir };
}
