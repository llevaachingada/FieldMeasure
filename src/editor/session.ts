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
 */

export interface EditorSession {
  /** Undo one step; returns the undone command's label for the toast, or `null`. */
  undo(): { label: string } | null;
  /** Redo one step; returns the redone command's label for the toast, or `null`. */
  redo(): { label: string } | null;
  /** Delete the current selection; returns the action label, or `null`. */
  deleteSelection(): { label: string } | null;
  /** `✓ Value` — open the keypad for the committed placement. */
  requestValue(): void;
  /** `Adjust endpoints` — enter RefineEndpoint for the last anchor. */
  adjustEndpoints(): void;
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
