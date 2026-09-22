/**
 * `src/ui/EditorLayout.tsx` — the editor shell: top bar, tool rail, canvas and the
 * docked style container (implementation plan slice 1.4.5, build order step 4; build
 * spec §11.3, UI spec §5.1–§5.3).
 *
 * **The one layout geometry rule lives here** (build spec §11.3):
 *
 *     aspect = viewportW / viewportH
 *     aspect >= 1.2  →  the style container docks to the SIDE opposite the rail
 *     aspect <  1.2  →  it docks to the BOTTOM as a 72 px horizontal bar
 *
 * 1.2 is the **inclusive** boundary (UI §5.3) and `panelDockFor` is the single
 * predicate everything else reads — the `compact` top bar and the test table both
 * call it, so there is one number, not three.
 *
 * **The rail never moves on rotation.** Its side is `railSideFor(handedness)` and
 * nothing else: the viewport is not an input. Rotation flips the dock, and because
 * the canvas is never remounted the zoom, tool, selection and open panels survive
 * (the reflow itself is a 180 ms CSS transition, `styles.css`).
 *
 * The style panel is slice 1.8 — this slice renders only the dock container and the
 * Style Chip slot, whose copy already exists in the appendices.
 *
 * Everything the pointer/keyboard does here is a **store action**, so slice 1.5 wires
 * `history.ts` without touching this file:
 *   - `Esc` ladder — pending → deselect → exit Focus → navigate, one rung per press.
 *   - tool hotkeys per UI §6.6 (unimplemented tools are a no-op, like the rail).
 *   - arrow-key nudge is 1.10's; it is deliberately not built here.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Handedness } from '@/settings/handedness';
import { useAppStore } from '@/state/appStore';
import { useEditorStore, type PendingOp } from '@/state/editorStore';
import { editorSession, subscribeToast } from '@/editor/session';
import SheetEditor from './SheetEditor';
import TopBar from './TopBar';
import ToolRail, { TOOL_HOTKEYS, toolDefById, type ToolId } from './ToolRail';
import { STRINGS, t } from './strings';

export type PanelDock = 'side' | 'bottom';

/** UI §5.3: aspect ≥ 1.2 → side; < 1.2 → bottom. The boundary is inclusive. */
export const DOCK_ASPECT_THRESHOLD = 1.2;

/**
 * The §11.3 docking rule as one pure predicate. `1240/908 = 1.3656 → side`;
 * `960/1388 = 0.6916 → bottom`; `1200/1000 = 1.2 → side` (inclusive).
 * A zero/negative viewport (before first layout) docks to the bottom rather than
 * dividing by zero.
 */
export function panelDockFor(viewportW: number, viewportH: number): PanelDock {
  if (viewportW <= 0 || viewportH <= 0) return 'bottom';
  return viewportW / viewportH >= DOCK_ASPECT_THRESHOLD ? 'side' : 'bottom';
}

/**
 * Rail side is **handedness only** (UI §5.1/§14.8): right-handed → rail on the
 * right; left-handed → mirrored to the left. `rotation never moves the rail`.
 */
export function railSideFor(handedness: Handedness): 'left' | 'right' {
  return handedness === 'left' ? 'left' : 'right';
}

/**
 * `editorStore.activeTool` → `SheetEditor`'s coarser seam (D61). `'place'` stands
 * for ANY placement tool, so 1.5 flips `dimension` without touching this mapping.
 */
export function sheetEditorToolFor(tool: ToolId): 'select' | 'pan' | 'place' {
  if (tool === 'select') return 'select';
  if (tool === 'pan') return 'pan';
  return 'place';
}

export type EscapeStep = 'cancelPending' | 'deselect' | 'exitFocus' | 'navigate';

/** The `Esc` ladder state (UI §6.6): pending → deselect → exit Focus → navigate. */
export interface EscapeState {
  pendingOp: PendingOp;
  hasSelection: boolean;
  focusInsetId: string | null;
}

/** One rung per press — never two (plan build order step 6). */
export function escapeStep(state: EscapeState): EscapeStep {
  if (state.pendingOp !== 'none') return 'cancelPending';
  if (state.hasSelection) return 'deselect';
  if (state.focusInsetId !== null) return 'exitFocus';
  return 'navigate';
}

function viewportSize(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** The Style Chip slot (UI §7.1). Slice 1.8 fills the panel; the chip is the slot. */
function StyleDock({ activeTool, horizontal = false }: { activeTool: ToolId; horizontal?: boolean }) {
  const def = toolDefById(activeTool);
  const Icon = def?.Icon;
  return (
    <aside
      className="style-dock"
      data-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={STRINGS.editor.styleChip}
    >
      <div className="style-chip">
        <span className="style-chip-icon" aria-hidden="true">
          {Icon ? <Icon /> : null}
        </span>
        <span className={horizontal ? 'style-chip-name' : 'style-chip-name visually-hidden'}>
          {def?.label ?? ''}
        </span>
      </div>
    </aside>
  );
}

export interface EditorLayoutProps {
  /** D51 runtime key `${projectId}:${folderName}` — never the bare id. */
  projectId: string;
  folderName: string;
  onExit: () => void;
  /** Breadcrumb middle segment. Defaults to the folder name. */
  projectName?: string;
  /** Overflow → Add sheet. Optional (1.4's capture lane wires it). */
  onAddSheet?: () => void;
  /** Overflow → Import file. Defaults to the canvas's own import affordance. */
  onImportFile?: () => void;
  /** The autosave chip slot content; slice 1.10 supplies it. Default: nothing. */
  autosaveChip?: ReactNode;
  /**
   * Slice 1.4 integration seam: the sheet `SheetEditor` should open. Set by the
   * capture flow's `onCaptured` so the new sheet is the one shown.
   */
  sheetId?: string;
}

export default function EditorLayout({
  projectId,
  folderName,
  onExit,
  projectName,
  onAddSheet,
  onImportFile,
  autosaveChip,
  sheetId,
}: EditorLayoutProps) {
  const handedness = useAppStore((s) => s.handedness);
  const activeTool = useEditorStore((s) => s.activeTool);
  const pendingOp = useEditorStore((s) => s.pendingOp);
  const keypadOpen = useEditorStore((s) => s.keypadOpen);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => subscribeToast(setToast), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const [viewport, setViewport] = useState(viewportSize);
  useEffect(() => {
    const onViewportChange = (): void => setViewport(viewportSize());
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, []);

  const dock = panelDockFor(viewport.w, viewport.h);
  const railSide = railSideFor(handedness);
  const compact = dock === 'bottom';

  // The canvas owns the real project state; these two seams let the shell show the
  // sheet name in the breadcrumb and press the canvas's own hidden file input from
  // the top bar — without duplicating a second import path.
  const importTriggerRef = useRef<(() => void) | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');
  const onImportReady = useCallback((trigger: () => void) => {
    importTriggerRef.current = trigger;
  }, []);
  const onSheetTitleChange = useCallback((title: string) => {
    setSheetTitle(title);
  }, []);

  const selectTool = useCallback((id: ToolId) => {
    const def = toolDefById(id);
    // No-op unless the tool is implemented — the same rule as the rail.
    if (!def || !def.implemented) return;
    useEditorStore.getState().setActiveTool(id);
  }, []);

  // Undo/redo name the action in a toast (UI §13.2). The commands live on the canvas
  // session; the label is interpolated by the strings owner here.
  const showUndoToast = useCallback((label: string) => {
    setToast(t(STRINGS.toasts.undoAction, { actionName: label }));
  }, []);
  const undo = useCallback(() => {
    const cmd = editorSession()?.undo();
    if (cmd) showUndoToast(cmd.label);
  }, [showUndoToast]);
  const redo = useCallback(() => {
    const cmd = editorSession()?.redo();
    if (cmd) showUndoToast(cmd.label);
  }, [showUndoToast]);

  // Esc ladder + §6.6 tool hotkeys. One window listener; never a keyboard trap.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      // While the value sheet is open it owns Escape (touch model §5.1: «keeps the
      // geometry»); the ladder must not also advance a rung.
      if (useEditorStore.getState().keypadOpen) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        const store = useEditorStore.getState();
        const step = escapeStep({
          pendingOp: store.pendingOp,
          hasSelection: store.selection.length > 0,
          focusInsetId: store.focusInsetId,
        });
        if (step === 'cancelPending') store.setPendingOp('none');
        else if (step === 'deselect') store.clearSelection();
        else if (step === 'exitFocus') store.setFocusInsetId(null);
        else onExit();
        return;
      }
      const tool = TOOL_HOTKEYS[event.key.toUpperCase()];
      if (tool) selectTool(tool);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit, selectTool, undo, redo]);

  return (
    <div
      className="editor-layout"
      data-dock={dock}
      data-rail={railSide}
      data-keypad-open={keypadOpen ? 'true' : 'false'}
    >
      <div className="editor-main">
        <ToolRail
          activeTool={activeTool}
          onSelectTool={selectTool}
          side={railSide}
          onUndo={undo}
          onRedo={redo}
        />
        <div className="editor-center">
          <SheetEditor
            projectId={projectId}
            folderName={folderName}
            onExit={onExit}
            activeTool={sheetEditorToolFor(activeTool)}
            placementPending={pendingOp !== 'none'}
            onImportReady={onImportReady}
            onSheetTitleChange={onSheetTitleChange}
            sheetId={sheetId}
          />
          {dock === 'bottom' ? <StyleDock activeTool={activeTool} horizontal /> : null}
        </div>
        {dock === 'side' ? <StyleDock activeTool={activeTool} /> : null}
      </div>
      <TopBar
        projectName={projectName ?? folderName}
        sheetName={sheetTitle || undefined}
        onExit={onExit}
        onAddSheet={onAddSheet}
        onImportFile={onImportFile ?? (() => importTriggerRef.current?.())}
        autosaveChip={autosaveChip}
        compact={compact}
      />
      {toast ? (
        <output className="editor-toast" role="status">
          {toast}
        </output>
      ) : null}
    </div>
  );
}
