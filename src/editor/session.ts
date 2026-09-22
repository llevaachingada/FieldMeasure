/**
 * `src/editor/session.ts` — the cross-component command seam for the editor shell
 * (plan slice 1.5, build order step 5).
 *
 * The canvas owns the live `History` + `MarkupScene` (they are imperative and not React
 * state). The shell's chrome — the rail's undo/redo buttons and the top bar — must be
 * able to *invoke* them without the two files importing each other's internals. This
 * module is that one seam: `SheetEditor` registers an `EditorSession` on mount, the
 * chrome reads `editorSession()` in event handlers. It is a plain module-level registry,
 * not a store, so it never triggers React renders and cannot leak into persisted state.
 *
 * Also here: a tiny toast bus. Undo/redo are named in a toast (`toasts.undoAction`), and
 * both the shell's own buttons and the canvas's Delete key need to raise one; the bus
 * keeps the toast UI in `EditorLayout` (the strings owner for interpolation) without a
 * second store field.
 *
 * Slice 1.8 adds the style-system commands the shell needs: apply a style patch / a full
 * style to the CURRENT SELECTION as exactly one undo step (via the live `History` +
 * `MarkupScene.styleCommand`/`patchStyleCommand`), and edit the PROJECT precision / unit
 * format (via `state/projectMeasure`, with the atomic `persistQueue` as the write path).
 * Every method is called from the shell with `editorSession()?.…`, so the seam stays a
 * handful of lines and the canvas remains the only owner of the scene.
 */
import type { AnnotationStyle, UnitFormat } from '@/domain/types';

export interface EditorSession {
  /** Undo one step; returns the undone command's label for the toast, or `null`. */
  undo(): { label: string } | null;
  /** Redo one step; returns the redone command's label for the toast, or `null`. */
  redo(): { label: string } | null;
  /** Delete the current selection; returns the action label, or `null`. */
  deleteSelection(): { label: string } | null;
  /**
   * `Esc` rung 1: cancel the in-progress placement. Discards an uncommitted anchor A,
   * keeps a committed B (the `Valueless` ghost), and clears any pending markup op — the
   * rung must reach the canvas, not only the store flag (D77/F3).
   */
  cancelPending(): void;
  /** `✓ Value` — open the keypad for the committed placement. */
  requestValue(): void;
  /** `Adjust endpoints` — enter RefineEndpoint for the last anchor. */
  adjustEndpoints(): void;
  /**
   * §7.4: merge `patch` into every selected object's style as ONE undo step. A no-op on
   * the canvas when the selection is empty (the caller still updates the tool style).
   * Refreshes the `editorStore` selection-style mirror.
   */
  applyStylePatch(patch: Partial<AnnotationStyle>, label: string): void;
  /**
   * §7.4: REPLACE every selected object's style with `style` (presets / recents / "also
   * set as default") as ONE undo step. A no-op when nothing is selected.
   */
  applyStyle(style: AnnotationStyle, label: string): void;
  /**
   * §7.2 / D31: edit the PROJECT-level precision denominator. Re-derives every label on
   * the scene and queues the atomic `project.json` write; the shell mirrors the new value
   * into `useAppStore`.
   */
  applyProjectPrecision(denominator: number): void;
  /** §7.2 / D31: edit the PROJECT-level unit format (same path as precision). */
  applyProjectUnitFormat(format: UnitFormat): void;
}

let current: EditorSession | null = null;

export function setEditorSession(session: EditorSession | null): void {
  current = session;
}

export function editorSession(): EditorSession | null {
  return current;
}

/* ------------------------------------------------------------------ *
 * Toast bus
 * ------------------------------------------------------------------ */

type ToastListener = (text: string) => void;
const toastListeners = new Set<ToastListener>();

export function emitToast(text: string): void {
  for (const listener of toastListeners) listener(text);
}

export function subscribeToast(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

/** Test helper: drop every listener (module-global, so specs must not leak). */
export function resetToastBus(): void {
  toastListeners.clear();
  current = null;
}
