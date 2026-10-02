/**
 * The sheets grid's card actions (delete / restore / reorder / rename / duplicate / the constrained
 * replace-photo) and the state they own (the trash list and the replace dialog). Moved verbatim out
 * of `App` (beta-readiness plan R2). Every write still goes through the storage modules it went
 * through before; this hook only changes where the code lives.
 *
 * `onChanged` is the grid's refresh (the old `setProjectRefresh((n) => n + 1)`). `onSheetDeleted`
 * lets the shell drop a deleted sheet from its batch selection, which `App` still owns.
 */
import { useRef, useState } from 'react';
import { emitToast } from '@/editor/session';
import { readProjectFile, resolveOpenProjectDir, writeJsonAtomic } from '@/fs/projectStore';
import { deleteSheet, listTrash, restoreSheet, type TrashedSheet } from '@/fs/sheetTrash';
/**
 * The grid's remaining card actions (D111): reorder / rename / duplicate / the
 * constrained replace-photo. `reorderSheetRows` is pure and re-validates the permutation
 * in the shell, so a stale screen (a sheet added in another tab) cannot scramble the file.
 */
import { duplicateSheet, renameSheet, replaceSheetPhoto, reorderSheetRows } from '@/fs/sheetOps';
import { defaultSheetTitle } from '@/fs/sheetIntake';
/** Type-only: the normalizer itself is imported lazily inside the replace handler. */
import type { NormalizedImage } from '@/media/normalizeImage';
import { STRINGS } from '@/ui/strings';
import type { ProjectRef } from '@/ui/appRoute';

export function useProjectActions(
  project: ProjectRef | null,
  onChanged: () => void,
  onSheetDeleted: (id: string) => void,
) {
  const editorTarget = project;
  /** Slice 1.10: the 14-day trash — the panel's list (`undefined` = not loaded yet) and the
   *  shell-reported restore failure the panel renders honestly. */
  const [trashItems, setTrashItems] = useState<readonly TrashedSheet[] | undefined>(undefined);
  const [trashRestoreFailed, setTrashRestoreFailed] = useState(false);
  /**
   * §11.2:720's constrained replace. The SHELL owns the file picker and the dimension
   * decision; the grid owns only the warned dialog. `replacePrompt` is the warned state
   * (the new photo's working-image dimensions differ from the sheet's), and
   * `pendingReplace` holds the normalized photo until the user answers — «Cancel» must
   * leave the sheet exactly as it was.
   */
  const [replacePrompt, setReplacePrompt] = useState<{ sheetId: string; title: string } | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const pendingReplaceRef = useRef<NormalizedImage | null>(null);

  /** Load (or refresh) the project's 14-day trash for the grid's panel. */
  async function loadTrash(projectId: string): Promise<void> {
    try {
      setTrashItems(await listTrash(projectId));
    } catch {
      // An unreadable trash must not take the grid down with it; an empty list is the honest
      // fallback because the panel distinguishes "not loaded" (`undefined`) from "empty".
      setTrashItems([]);
    }
  }

  /**
   * Delete a sheet into `.trash/` (UI §13.3 — recoverable, never a silent no-op). It RESOLVES
   * only once the write has landed: the screen announces «Sheet deleted · Undo» on success and
   * an honest failure line otherwise, so the toast can never claim a deletion that did not
   * happen (D113).
   */
  async function handleDeleteSheet(id: string): Promise<void> {
    if (!editorTarget) return;
    await deleteSheet(editorTarget.projectId, id);
    onSheetDeleted(id);
    onChanged();
    await loadTrash(editorTarget.projectId);
  }

  /** Restore a trashed sheet (§11.9). A failure is reported to the panel, never swallowed. */
  async function handleRestoreSheet(id: string): Promise<void> {
    if (!editorTarget) return;
    try {
      await restoreSheet(editorTarget.projectId, id);
      setTrashRestoreFailed(false);
      onChanged();
      await loadTrash(editorTarget.projectId);
    } catch {
      setTrashRestoreFailed(true);
      // Review F5: this catch used to be silent for the user — `trashRestoreFailed` surfaces
      // only inside the trash panel, which is CLOSED when the delete toast's Undo fires. A
      // failed restore must be visible wherever it was triggered.
      emitToast({ text: STRINGS.trash.restoreFailed, urgent: true });
    }
  }

  // ---- the grid's remaining card actions (D111) ------------------------------

  /**
   * Persist a new sheet order (§20.6: `10 × position`). The screen has already applied the
   * order locally — that IS the drag's live renumber — so a rejection is what makes it walk
   * the order back and say so. The write goes through `projectStore.writeJsonAtomic`, the
   * only atomic JSON path (AGENTS #3).
   */
  async function handleReorderSheets(orderedIds: readonly string[]): Promise<void> {
    if (!editorTarget) throw new Error('no project open');
    const dir = await resolveOpenProjectDir(editorTarget.projectId);
    const file = await readProjectFile(dir);
    const next = reorderSheetRows(file, orderedIds);
    await writeJsonAtomic(dir, 'project.json', next, editorTarget.projectId);
    onChanged();
  }

  /** Rename a sheet's TITLE. Its folder is never renamed — names are labels (§20.6). */
  async function handleRenameSheet(id: string, title: string): Promise<void> {
    if (!editorTarget) throw new Error('no project open');
    await renameSheet(editorTarget.projectId, id, title);
    onChanged();
  }

  /**
   * Duplicate a sheet. The copy is the storage layer's (copy → verify → then the row); the
   * title is the next `Sheet NN`, the same rule a capture uses, so there is one naming
   * convention and not two.
   */
  async function handleDuplicateSheet(id: string): Promise<{ id: string }> {
    if (!editorTarget) throw new Error('no project open');
    const dir = await resolveOpenProjectDir(editorTarget.projectId);
    const file = await readProjectFile(dir);
    const copy = await duplicateSheet(editorTarget.projectId, id, defaultSheetTitle(file));
    onChanged();
    return copy;
  }

  /** «Replace photo» starts here: the picker is a shell control, not the grid's. */
  function handleReplacePhoto(id: string): void {
    replaceTargetRef.current = id;
    const input = replaceInputRef.current;
    if (!input) return;
    // A second pick of the SAME file must still fire `change`.
    input.value = '';
    input.click();
  }

  /**
   * The chosen file, normalized. §2.4's constrained replace: identical working-image
   * dimensions → a **silent** swap with the markup kept; different dimensions → the warned
   * dialog, whose answer the screen collects (a different photo is a different coordinate
   * space, so the markup may land in the wrong place — that is the user's call, not ours).
   */
  async function onReplacePhotoPicked(file: File): Promise<void> {
    const id = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!id || !editorTarget) return;
    try {
      // Canvas work: imported only when a replace actually happens, so the Home route's
      // bundle keeps the media pipeline out (the `CameraFlow` precedent).
      const { normalizeImage } = await import('@/media/normalizeImage');
      const photo = await normalizeImage(file);
      const dir = await resolveOpenProjectDir(editorTarget.projectId);
      const current = await readProjectFile(dir);
      const row = current.sheets.find((sheet) => sheet.id === id);
      if (!row) throw new Error(`sheet ${id} is not in project.json`);
      if (photo.width === row.imageWidth && photo.height === row.imageHeight) {
        await replaceSheetPhoto(editorTarget.projectId, id, photo, 'keep');
        onChanged();
        return;
      }
      pendingReplaceRef.current = photo;
      setReplacePrompt({ sheetId: id, title: row.title });
    } catch {
      // Never a silent no-op: a decode failure, an unknown sheet and a failed write all
      // surface the same honest line (there is no per-cause copy for this action).
      emitToast({ text: STRINGS.sheetMenu.replaceFailed, urgent: true });
    }
  }

  /** The warned dialog's answer. «Cancel» leaves the sheet exactly as it was. */
  async function handleResolveReplace(choice: 'keep' | 'remove' | 'cancel'): Promise<void> {
    const photo = pendingReplaceRef.current;
    const prompt = replacePrompt;
    pendingReplaceRef.current = null;
    setReplacePrompt(null);
    if (choice === 'cancel' || !photo || !prompt || !editorTarget) return;
    try {
      const result = await replaceSheetPhoto(editorTarget.projectId, prompt.sheetId, photo, choice);
      onChanged();
      // Review F1: by the time this resolves, the photo, the dimensions and the thumbnail are
      // all consistently new — the ONLY step that can still have failed is the markup clear,
      // so naming that is the honest report. «Couldn't replace that photo» would claim a
      // failure the system did not have (the inverse of the D110/D114 family).
      if (!result.markupCleared) {
        emitToast({ text: STRINGS.sheetMenu.markupNotRemoved, urgent: true });
      }
    } catch {
      emitToast({ text: STRINGS.sheetMenu.replaceFailed, urgent: true });
    }
  }

  return {
    trashItems,
    trashRestoreFailed,
    setTrashRestoreFailed,
    replacePrompt,
    replaceInputRef,
    loadTrash,
    handleDeleteSheet,
    handleRestoreSheet,
    handleReorderSheets,
    handleRenameSheet,
    handleDuplicateSheet,
    handleReplacePhoto,
    onReplacePhotoPicked,
    handleResolveReplace,
  };
}
