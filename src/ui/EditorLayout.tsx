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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AnnotationStyle, AnnotationType, UnitFormat } from '@/domain/types';
import type { Handedness } from '@/settings/handedness';
import { useAppStore } from '@/state/appStore';
import { useEditorStore, type PendingOp } from '@/state/editorStore';
import {
  applicableFor,
  recentsForTool,
  styleForTool,
  useStyleByTool,
  STYLE_KEYS,
} from '@/state/styleByTool';
import {
  emptyPresets,
  findPreset,
  loadPresets,
  presetsForTool,
  savePresets,
  upsertPreset,
  type PresetsFile,
} from '@/fs/presets';
import { editorSession, subscribeToast } from '@/editor/session';
import SheetEditor from './SheetEditor';
import StyleEditorSheet, { type StyleEditorSheetProps } from './StyleEditorSheet';
import StylePanel, { type StylePanelProps, type StyleScope } from './StylePanel';
import TopBar from './TopBar';
import ToolRail, { TOOL_HOTKEYS, toolDefById, type ToolId } from './ToolRail';
import { STRINGS, t } from './strings';

export type PanelDock = 'side' | 'bottom';

/** Slice 1.7: the one tool disabled inside Focus (nesting is one level). */
const INSET_DISABLED: ReadonlySet<ToolId> = new Set<ToolId>(['inset']);
const INSET_DISABLED_REASON: Partial<Record<ToolId, string>> = {
  inset: STRINGS.inset.nestedTooltip,
};

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

export type EscapeStep = 'cancelPending' | 'exitFocus' | 'deselect' | 'navigate';

/** The `Esc` ladder state (UI §6.6 / §4.2). */
export interface EscapeState {
  pendingOp: PendingOp;
  hasSelection: boolean;
  focusInsetId: string | null;
}

/**
 * One rung per press — never two.
 *
 * **The order is UI §4.2's, because §4.2 outranks this plan in the authority chain
 * (build spec > UI spec > implementation plan):** `pending → deselect → exit Focus →
 * navigate`. The slice-1.7 gate phrase "Esc exits with selection unchanged" holds in the
 * sense that *exiting Focus does not itself change the selection*: with a selection
 * present the first `Esc` is the deselect rung and the next one exits Focus; with no
 * selection the first `Esc` exits Focus and leaves the (empty) selection alone.
 *
 * (The engine lane first reordered this to exit-Focus-before-deselect on the strength of a
 * handoff brief rather than the spec; corrected in DECISIONS D78.)
 */
export function escapeStep(state: EscapeState): EscapeStep {
  if (state.pendingOp !== 'none') return 'cancelPending';
  if (state.hasSelection) return 'deselect';
  if (state.focusInsetId !== null) return 'exitFocus';
  return 'navigate';
}

function viewportSize(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * `AnnotationType` → the tool that creates it, for the §7.4 #4 applicability intersection.
 * Mirrors `StylePanel`'s private `TYPE_TOOL` map (which is not exported) — the appendices
 * key no `annotationType.*` copy, and this is the same one-to-one the scope chip uses.
 */
const TOOL_FOR_TYPE: Readonly<Record<AnnotationType, ToolId>> = {
  dimension: 'dimension',
  angle: 'angle',
  line: 'line',
  arrow: 'arrow',
  rect: 'rect',
  ellipse: 'ellipse',
  polygon: 'polygon',
  freehand: 'freehand',
  highlight: 'highlight',
  text: 'text',
  image: 'inset',
};

/**
 * The panel's `applicable` map (§7.2 per-tool control table, §7.4 #4). With no selection
 * it is the ACTIVE tool's table. With a selection it is derived from the SELECTED types:
 * a single type's table, or — for a heterogeneous selection — the intersection across
 * every selected type's tool, so "Text size is disabled because Dimensions aren't text
 * objects" holds. The Select tool's own table is all-false (it creates nothing), so
 * deriving from the selection is also what lets Select edit a selected object's style.
 */
export function applicabilityForSelection(
  activeTool: ToolId,
  scope: readonly StyleScope[],
): Partial<Record<keyof AnnotationStyle, boolean>> {
  if (scope.length === 0) return applicableFor(activeTool);
  const tools = scope.map((entry) => TOOL_FOR_TYPE[entry.type]);
  const out: Partial<Record<keyof AnnotationStyle, boolean>> = {};
  for (const key of STYLE_KEYS) {
    out[key] = tools.every((tool) => applicableFor(tool)[key] === true);
  }
  return out;
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
  const layersOpen = useEditorStore((s) => s.layersOpen);
  const focusInsetId = useEditorStore((s) => s.focusInsetId);

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
    // Slice 1.7: the Inset tool is unavailable inside Focus (nesting is one level).
    if (id === 'inset' && useEditorStore.getState().focusInsetId !== null) return;
    useEditorStore.getState().setActiveTool(id);
  }, []);

  // ---- slice 1.8: the style panel wiring -----------------------------------------
  // The panel is props-driven; every value below is read from a store or derived, and
  // every write is a store action or an `editorSession()` command. Nothing here touches
  // the canvas directly.
  const precisionDenominator = useAppStore((s) => s.precisionDenominator);
  const appUnitFormat = useAppStore((s) => s.unitFormat);
  const selectionStyle = useEditorStore((s) => s.selectionStyle);
  const toolStyle = useStyleByTool((s) => styleForTool(s, activeTool));
  const recents = useStyleByTool((s) => s.recents);

  const toolRecents = useMemo(() => recentsForTool(recents, activeTool), [recents, activeTool]);
  const applicable = useMemo(
    () => applicabilityForSelection(activeTool, selectionStyle.scope),
    [activeTool, selectionStyle.scope],
  );
  /**
   * §7.4: with a single selection the panel shows the selection's shared style; otherwise
   * the per-tool memory. `mixed` never reads a value as truth (the panel hatches it).
   */
  const panelStyle: AnnotationStyle =
    selectionStyle.mode === 'single' ? selectionStyle.style : toolStyle;

  // Presets (§7.3): loaded once for the open project (the D51 runtime key), retried on demand.
  const [presetsFile, setPresetsFile] = useState<PresetsFile>(() => emptyPresets());
  const [presetsUnavailable, setPresetsUnavailable] = useState(false);
  const presetLoadToken = useRef(0);
  const reloadPresets = useCallback(() => {
    const token = presetLoadToken.current + 1;
    presetLoadToken.current = token;
    void loadPresets(projectId).then((result) => {
      if (presetLoadToken.current !== token) return;
      if (result.ok) {
        setPresetsFile(result.presets);
        setPresetsUnavailable(false);
      } else {
        setPresetsFile(emptyPresets());
        setPresetsUnavailable(true);
      }
    });
  }, [projectId]);
  useEffect(() => {
    reloadPresets();
    return () => {
      // Discard any in-flight load when the project changes or the shell unmounts.
      presetLoadToken.current += 1;
    };
  }, [reloadPresets]);
  const toolPresets = useMemo(
    () => presetsForTool(presetsFile, activeTool),
    [presetsFile, activeTool],
  );

  // §7.4 #3: synchronous mode, default ON. §7.3: the applied-to hint clears after 4 s.
  const [applyToSelection, setApplyToSelection] = useState(true);
  const [appliedToCount, setAppliedToCount] = useState<number | null>(null);
  const appliedTimerRef = useRef<number | null>(null);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const showApplied = useCallback((count: number) => {
    setAppliedToCount(count);
    if (appliedTimerRef.current !== null) window.clearTimeout(appliedTimerRef.current);
    appliedTimerRef.current = window.setTimeout(() => {
      appliedTimerRef.current = null;
      setAppliedToCount(null);
    }, 4000);
  }, []);
  useEffect(
    () => () => {
      if (appliedTimerRef.current !== null) window.clearTimeout(appliedTimerRef.current);
    },
    [],
  );

  /**
   * §7.4: a control change ALWAYS updates the current tool's style, and — when objects are
   * selected and synchronous mode is on — applies to the selection as ONE undo step, then
   * shows the §7.3 applied-to hint.
   */
  const onChange = useCallback(
    (patch: Partial<AnnotationStyle>) => {
      const styleStore = useStyleByTool.getState();
      const tool = useEditorStore.getState().activeTool;
      styleStore.setToolStyle(tool, patch);
      // `setToolStyle` already records the merged style; this explicit call is the
      // brief's requirement and is deduped by value inside `pushRecent`.
      styleStore.recordRecent({ ...styleForTool(styleStore, tool), ...patch });
      const mirror = useEditorStore.getState().selectionStyle;
      if (mirror.count > 0 && applyToSelection) {
        editorSession()?.applyStylePatch(patch, STRINGS.toasts.actionChangeStyle);
        showApplied(mirror.count);
      }
    },
    [applyToSelection, showApplied],
  );

  /** §7.4: apply a FULL style (preset / recent) to the tool and the selection, one step. */
  const applyFullStyle = useCallback(
    (style: AnnotationStyle) => {
      const styleStore = useStyleByTool.getState();
      const tool = useEditorStore.getState().activeTool;
      styleStore.replaceToolStyle(tool, style);
      styleStore.recordRecent(style);
      const mirror = useEditorStore.getState().selectionStyle;
      if (mirror.count > 0 && applyToSelection) {
        editorSession()?.applyStyle(style, STRINGS.toasts.actionChangeStyle);
        showApplied(mirror.count);
      }
    },
    [applyToSelection, showApplied],
  );

  const onApplyRecent = useCallback(
    (style: AnnotationStyle) => applyFullStyle(style),
    [applyFullStyle],
  );
  const onApplyPreset = useCallback(
    (name: string) => {
      const tool = useEditorStore.getState().activeTool;
      const preset = findPreset(presetsFile, tool, name);
      if (preset) applyFullStyle(preset.style);
    },
    [presetsFile, applyFullStyle],
  );
  const onAlsoSetDefault = useCallback(() => {
    const styleStore = useStyleByTool.getState();
    const tool = useEditorStore.getState().activeTool;
    const mirror = useEditorStore.getState().selectionStyle;
    // Pin the shared selection style when there is exactly one; otherwise the tool style.
    const style = mirror.mode === 'single' ? mirror.style : styleForTool(styleStore, tool);
    styleStore.replaceToolStyle(tool, style);
  }, []);
  const onDeselect = useCallback(() => {
    useEditorStore.getState().clearSelection();
  }, []);
  const onToggleApplyToSelection = useCallback((next: boolean) => setApplyToSelection(next), []);
  const onPrecisionChange = useCallback((denominator: number) => {
    editorSession()?.applyProjectPrecision(denominator);
  }, []);
  const onUnitFormatChange = useCallback((format: UnitFormat) => {
    editorSession()?.applyProjectUnitFormat(format);
  }, []);
  const onOpenEditorSheet = useCallback(() => setStyleEditorOpen(true), []);
  const onSavePreset = useCallback(
    (name: string) => {
      const tool = useEditorStore.getState().activeTool;
      const next = upsertPreset(presetsFile, tool, { name, style: { ...panelStyle } });
      setPresetsFile(next);
      // A failed write still keeps the session preset; surface the §7.5 warn strip.
      void savePresets(projectId, next).catch(() => setPresetsUnavailable(true));
    },
    [presetsFile, projectId, panelStyle],
  );
  const onRetryPresets = useCallback(() => reloadPresets(), [reloadPresets]);

  /**
   * The one prop set both mounts share (the side panel and the deep editor sheet). The
   * sheet's props are the panel's minus `tool`/`applicable`, plus `onClose`.
   */
  const stylePanelProps = {
    tool: activeTool,
    style: panelStyle,
    selection: selectionStyle.mode,
    applicable,
    projectPrecision: precisionDenominator,
    unitFormat: appUnitFormat,
    onChange,
    onPrecisionChange,
    onUnitFormatChange,
    onOpenEditorSheet,
    presets: toolPresets,
    onSavePreset,
    onApplyPreset,
    selectionCount: selectionStyle.count,
    selectionScope: selectionStyle.scope,
    applyToSelection,
    recents: toolRecents,
    presetsUnavailable,
    appliedToCount,
    onApplyRecent,
    onToggleApplyToSelection,
    onAlsoSetDefault,
    onDeselect,
    onRetryPresets,
  } satisfies StylePanelProps;

  const styleEditorProps = {
    style: panelStyle,
    selection: selectionStyle.mode,
    projectPrecision: precisionDenominator,
    unitFormat: appUnitFormat,
    onChange,
    onPrecisionChange,
    onUnitFormatChange,
    // The sheet's type is `Omit<StylePanelProps,'tool'|'applicable'> & {onClose}`; it
    // renders its own `More styles…` affordance, so the seam keeps the prop present.
    onOpenEditorSheet,
    presets: toolPresets,
    onSavePreset,
    onApplyPreset,
    selectionCount: selectionStyle.count,
    selectionScope: selectionStyle.scope,
    applyToSelection,
    recents: toolRecents,
    presetsUnavailable,
    appliedToCount,
    onApplyRecent,
    onToggleApplyToSelection,
    onAlsoSetDefault,
    onDeselect,
    onRetryPresets,
    onClose: () => setStyleEditorOpen(false),
  } satisfies StyleEditorSheetProps;

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
        // The Layers flyout closes on Escape rather than advancing a rung (keypad first,
        // which already returned above). Ctrl+Z / hotkeys are deliberately NOT swallowed.
        if (store.layersOpen) {
          store.setLayersOpen(false);
          return;
        }
        const step = escapeStep({
          pendingOp: store.pendingOp,
          hasSelection: store.selection.length > 0,
          focusInsetId: store.focusInsetId,
        });
        if (step === 'cancelPending') {
          store.setPendingOp('none');
          // The rung must cancel the tool, not only the store flag (D77/F3): the shell
          // owns the session, the canvas owns the placement machine.
          editorSession()?.cancelPending();
        } else if (step === 'deselect') store.clearSelection();
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
      data-layers-open={layersOpen ? 'true' : 'false'}
      data-focus-inset={focusInsetId ?? 'false'}
    >
      <div className="editor-main">
        <ToolRail
          activeTool={activeTool}
          onSelectTool={selectTool}
          side={railSide}
          onUndo={undo}
          onRedo={redo}
          disabledTools={focusInsetId ? INSET_DISABLED : undefined}
          disabledReason={focusInsetId ? INSET_DISABLED_REASON : undefined}
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
          {dock === 'bottom' ? (
            <div className="style-dock" data-orientation="horizontal">
              <StylePanel {...stylePanelProps} />
            </div>
          ) : null}
        </div>
        {dock === 'side' ? (
          <div className="style-dock" data-orientation="vertical">
            <StylePanel {...stylePanelProps} />
          </div>
        ) : null}
      </div>
      <TopBar
        projectName={projectName ?? folderName}
        sheetName={sheetTitle || undefined}
        onExit={onExit}
        onAddSheet={onAddSheet}
        onImportFile={onImportFile ?? (() => importTriggerRef.current?.())}
        autosaveChip={autosaveChip}
        compact={compact}
        onToggleLayers={() => useEditorStore.getState().setLayersOpen(!layersOpen)}
        layersOpen={layersOpen}
      />
      {/* §7.5: the deep editor sheet, toggled by `More styles…`/`Custom…` and closed by
          `Esc`/`✕`/`Done` (the sheet owns its own focus trap and focus return). */}
      {styleEditorOpen ? <StyleEditorSheet {...styleEditorProps} /> : null}
      {toast ? (
        <output className="editor-toast" role="status">
          {toast}
        </output>
      ) : null}
    </div>
  );
}
