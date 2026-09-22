/**
 * Editor state store (build spec §10; implementation plan slice 1.4.5 step 1).
 *
 * **Registry only — no tool logic lives here.** This is the shared state the tool
 * rail, the layout and (from 1.5) the tools read and write:
 *
 *   - `activeTool`   — the tool the user is holding (a `ToolId`; the rail owns the
 *                      "unimplemented tool is a no-op" rule, not this store).
 *   - `pendingOp`    — an in-progress placement/op; `'none'` when idle. The Escape
 *                      ladder's first rung and the update-toast gate (§19.2) read it.
 *   - `selection`    — annotation addresses, `AnnotationPath` keys (§20.1). Never
 *                      array indices: a reorder invalidates an index (§20.1).
 *   - `viewTransform`— the canvas `{ scale, x, y }`. The live canvas keeps its own
 *                      copy; this is the store's mirror so rotation can re-mount
 *                      without losing the view.
 *   - `focusInsetId` — `null` when not in Focus mode (§8.5 inset focus).
 *
 * NOT here yet (each is owned by the slice that builds it, per the closed-scope
 * rule — do not add ahead of the slice):
 *   - `styleByTool`   — slice 1.8 (Shape/Ink style system).
 *   - `radialRecents` — the 8-slot recents radial (a later tool slice).
 *
 * `activeTool` is typed as `ToolId` from `@/ui/ToolRail` via `import type` only, so
 * this module has no runtime dependency on React and stays importable by pure node
 * tests.
 */
import { create } from 'zustand';
import { DEFAULT_STYLE, type AnnotationStyle, type AnnotationType } from '@/domain/types';
import type { ToolId } from '@/ui/ToolRail';

/** Build spec §10. `'none'` = idle; the rest are the ops the update toast waits on. */
export type PendingOp = 'none' | 'dimension' | 'angle' | 'polygon' | 'inset' | 'text' | 'erase';

/** §7.4 #3: one annotation type and how many of it are selected (mirrors `StyleScope`). */
export interface SelectionScope {
  type: AnnotationType;
  count: number;
}

/**
 * Slice 1.8 — the live mirror of the canvas selection's style, following the established
 * shell pattern (`keypadOpen`/`layersOpen`). `SheetEditor` owns the `MarkupScene` and
 * publishes this (computed with `selectionStyleState` + `selectionScope`); `EditorLayout`
 * reads it to drive the panel's `selection` / `selectionCount` / `selectionScope` props.
 *
 * `style` is authoritative ONLY when `mode === 'single'`. In `mixed` mode it is the
 * `DEFAULT_STYLE` placeholder — never a merged guess (§7.4 #2).
 */
export interface SelectionStyleMirror {
  mode: 'none' | 'single' | 'mixed';
  style: AnnotationStyle;
  count: number;
  scope: SelectionScope[];
}

/** Canvas view transform: `scale` is the zoom factor, `x`/`y` the stage translation. */
export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export interface EditorState {
  /** The held tool. Default `'select'` (slice 1.3's default). */
  activeTool: ToolId;
  pendingOp: PendingOp;
  /** `AnnotationPath` keys (§20.1) — `id` or `insetId/id`, never indices. */
  selection: string[];
  viewTransform: ViewTransform;
  /** `null` = not in Focus mode. */
  focusInsetId: string | null;
  /**
   * Slice 1.5: the dimension value sheet is open. The shell dims the rail/style to 40%
   * and makes them non-interactive while it is true (touch model §5.1); the canvas
   * stays live for pan/pinch only.
   */
  keypadOpen: boolean;
  /**
   * Slice 1.6 wiring: the Layers flyout is open. Mirrors `keypadOpen` exactly — the
   * shell reads it for `data-layers-open` and the Escape ladder; the panel itself is
   * mounted by `SheetEditor`, which owns the scene.
   */
  layersOpen: boolean;
  /**
   * Slice 1.8: the selection's shared style, published by `SheetEditor` (the scene owner)
   * and read by `EditorLayout` to drive the style panel. Reset on editor unmount so a
   * stale selection style can never outlive the canvas it described.
   */
  selectionStyle: SelectionStyleMirror;
}

export interface EditorActions {
  setActiveTool: (tool: ToolId) => void;
  setPendingOp: (op: PendingOp) => void;
  setSelection: (keys: string[]) => void;
  clearSelection: () => void;
  setViewTransform: (transform: ViewTransform) => void;
  setFocusInsetId: (insetId: string | null) => void;
  setKeypadOpen: (open: boolean) => void;
  setLayersOpen: (open: boolean) => void;
  /** Publish the canvas selection's shared style (the scene owner is the only writer). */
  setSelectionStyle: (mirror: SelectionStyleMirror) => void;
  /** Back to fresh defaults (test helper + "new sheet" reset). */
  resetEditorState: () => void;
}

export type EditorStore = EditorState & EditorActions;

/** The empty selection mirror — `mode:'none'`, `DEFAULT_STYLE`, count 0, no scope. */
export function createInitialSelectionStyle(): SelectionStyleMirror {
  return { mode: 'none', style: { ...DEFAULT_STYLE }, count: 0, scope: [] };
}

/** Fresh defaults — exported so tests can reset the module-global store. */
export function createInitialEditorState(): EditorState {
  return {
    activeTool: 'select',
    pendingOp: 'none',
    selection: [],
    viewTransform: { scale: 1, x: 0, y: 0 },
    focusInsetId: null,
    keypadOpen: false,
    layersOpen: false,
    selectionStyle: createInitialSelectionStyle(),
  };
}

export const useEditorStore = create<EditorStore>((set) => ({
  ...createInitialEditorState(),

  setActiveTool: (activeTool) => set({ activeTool }),
  setPendingOp: (pendingOp) => set({ pendingOp }),
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: [] }),
  setViewTransform: (viewTransform) => set({ viewTransform }),
  setFocusInsetId: (focusInsetId) => set({ focusInsetId }),
  setKeypadOpen: (keypadOpen) => set({ keypadOpen }),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  setSelectionStyle: (selectionStyle) => set({ selectionStyle }),
  resetEditorState: () => set(createInitialEditorState()),
}));
