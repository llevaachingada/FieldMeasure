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
  /**
   * Slice 1.10: the autosave chip's `Retry` (UI §13.1). Re-attempts parked writes —
   * `persistQueue.flush()` clears the parked flag and retries at once (§5.4). The chip
   * never sets `storageStatus` itself; this command is the only thing its Retry does.
   */
  retrySave(): void;
  /**
   * Slice 1.11: flush the autosave queue and resolve once every queued write has
   * settled. **Rejects when a write could not land** (the queue parks instead of
   * throwing, so this classifies the parked state) — the update prompt must never
   * reload over unsaved edits. Optional: the chrome's test doubles predate 1.11.
   */
  flush?(): Promise<void>;
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

/**
 * One toast. A toast that carries an `action` lives 10 s; a plain one 8 s (UI §13.4:
 * "8s default (10s when they carry an Undo)"). The `urgent` flag picks the live-region
 * role at the render site — `role="alert"` for errors, `role="status"` otherwise.
 */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastMessage {
  text: string;
  action?: ToastAction;
  urgent?: boolean;
}

type ToastListener = (toast: ToastMessage) => void;
const toastListeners = new Set<ToastListener>();

/**
 * Raise a toast. A bare string is the original text-only form; the object form carries
 * an optional action (recoverable actions toast with Undo — §13.3). A single emission is
 * the whole contract: the consumer is single-instance and each new toast replaces the
 * last, closing the replaced toast's undo window (§13.4).
 */
export function emitToast(input: string | ToastMessage): void {
  const toast: ToastMessage = typeof input === 'string' ? { text: input } : input;
  for (const listener of toastListeners) listener(toast);
}

/** Subscribe to the FULL toast (text + action). The shell's `ToastHost` uses this. */
export function subscribeToastMessage(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

/** Text-only subscription, kept for callers/tests that only care about the wording. */
export function subscribeToast(listener: (text: string) => void): () => void {
  const wrapped: ToastListener = (toast) => listener(toast.text);
  toastListeners.add(wrapped);
  return () => toastListeners.delete(wrapped);
}

/** Test helper: drop every listener (module-global, so specs must not leak). */
export function resetToastBus(): void {
  toastListeners.clear();
  current = null;
}

/* ------------------------------------------------------------------ *
 * Persistence-busy signal (slice 1.11)
 * ------------------------------------------------------------------ */

/**
 * Mirrors `persistQueue.inFlight` (the queue comment names 1.11's update toast as its
 * consumer) so the prompt — mounted at the app-shell root, outside the editor subtree —
 * can suppress itself while a write is queued or in flight without importing the canvas
 * module.
 *
 * `SheetEditor` is the only writer: it bridges the live queue's status subscription and
 * its enqueue points onto this signal, and clears it on unmount. This is a one-value
 * signal, not a store — it holds no state that could leak into persisted data.
 */
let persistenceBusyFlag = false;
const persistenceBusyListeners = new Set<(busy: boolean) => void>();

export function setPersistenceBusy(busy: boolean): void {
  if (persistenceBusyFlag === busy) return;
  persistenceBusyFlag = busy;
  for (const listener of persistenceBusyListeners) listener(busy);
}

export function subscribePersistenceBusy(listener: (busy: boolean) => void): () => void {
  persistenceBusyListeners.add(listener);
  return () => persistenceBusyListeners.delete(listener);
}

export function persistenceBusy(): boolean {
  return persistenceBusyFlag;
}

/** Test helper: reset the busy signal and drop its listeners. */
export function resetPersistenceBusy(): void {
  persistenceBusyFlag = false;
  persistenceBusyListeners.clear();
}
