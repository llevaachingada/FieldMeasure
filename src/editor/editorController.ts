/**
 * The editor's live objects and their lifecycle, moved out of `SheetEditor`'s mount effect
 * (beta-readiness plan R6). Step 1 is mechanical: the effect body is verbatim, and its free
 * variables (the component's refs, setters and props) arrive through `EditorControllerDeps`.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { ProjectFile } from '@/domain/schema';
import type { Px } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { Annotation, AnnotationStyle, UnitFormat } from '@/domain/types';
import { EditorCanvas } from '@/editor/EditorCanvas';
import { createInputRouter } from '@/editor/inputRouter';
import { GestureArbiter } from '@/editor/gestureArbiter';
import { History, STYLE_COALESCE_MS } from '@/editor/history';
import { MarkupScene } from '@/editor/shapes/scene';
import { Loupe } from '@/editor/Loupe';
import { DimensionTool, type DimensionSnapshot, type KeypadRequest } from '@/editor/tools/DimensionTool';
import { ShapeTool, type ShapeKind } from '@/editor/tools/ShapeTool';
import { AngleTool, type AngleSheetRequest } from '@/editor/tools/AngleTool';
import { FreehandTool } from '@/editor/tools/FreehandTool';
import { TextTool } from '@/editor/tools/TextTool';
import { EraseTool } from '@/editor/tools/EraseTool';
import { SelectTool } from '@/editor/tools/SelectTool';
import { setEditorSession, emitToast, setPersistenceBusy, type EditorSession } from '@/editor/session';
import type { PersistQueue } from '@/state/persistQueue';
import { acquireProjectSession } from '@/fs/projectSession';
import { selectionScope, selectionStyleState, styleForTool, useStyleByTool } from '@/state/styleByTool';
import {
  applyProjectPrecision as applyProjectPrecisionFn,
  applyProjectUnitFormat as applyProjectUnitFormatFn,
} from '@/state/projectMeasure';
import { HIGHLIGHT_CHISEL_TOUCH_MU } from '@/editor/tools/toolTypes';
import { createInitialSelectionStyle, useEditorStore } from '@/state/editorStore';
import { type ThumbnailScheduler } from '@/media/thumbnails';
import {
  cleanStaleTmp,
  readProjectFile,
  resolveOpenProjectDir,
  resolveSheetDir,
  writeAtomic,
  type ProjectChannel,
  type WriterLease,
} from '@/fs/projectStore';
import { useAppStore } from '@/state/appStore';
import { createSheetThumbWriter } from '@/editor/sheetThumb';
import { InsetTool, type InsetAssetInput } from '@/editor/tools/InsetTool';
import { InsetAssetRegistry, createFocusAwareScene } from '@/ui/insetWiring';
import { STRINGS, t } from '@/ui/strings';

import type { EditorSheetInfo, EditorStatus } from '@/ui/SheetEditor';

type SheetFile = ProjectFile['sheets'][number];
type Ref<T> = { current: T };
type Setter<T> = Dispatch<SetStateAction<T>>;

export interface EditorControllerDeps {
  projectId: string;
  folderName: string;
  sheetId: string | undefined;
  onSceneReady: ((api: { scene: MarkupScene; canvas: EditorCanvas }) => void) | undefined;
  loadSheet: (
    canvas: EditorCanvas,
    projectDir: FileSystemDirectoryHandle,
    sheet: SheetFile,
  ) => Promise<EditorStatus>;
  refs: {
    angleRef: Ref<AngleTool | null>;
    bitmapRef: Ref<ImageBitmap | null>;
    canvasRef: Ref<EditorCanvas | null>;
    channelRef: Ref<ProjectChannel | null>;
    dimRef: Ref<DimensionTool | null>;
    eraseRef: Ref<EraseTool | null>;
    freehandRef: Ref<FreehandTool | null>;
    highlightRef: Ref<FreehandTool | null>;
    historyRef: Ref<History | null>;
    insetAssetsRef: Ref<InsetAssetRegistry>;
    insetRef: Ref<InsetTool | null>;
    leaseRef: Ref<WriterLease | null>;
    persistRef: Ref<PersistQueue | null>;
    projectDirRef: Ref<{ dir: FileSystemDirectoryHandle; file: ProjectFile } | null>;
    readOnlyRef: Ref<boolean>;
    sceneRef: Ref<MarkupScene | null>;
    schedulerRef: Ref<ThumbnailScheduler | null>;
    selectRef: Ref<SelectTool | null>;
    shapeToolsRef: Ref<Map<ShapeKind, ShapeTool>>;
    sheetIdRef: Ref<string | null>;
    textRef: Ref<TextTool | null>;
    toolIdRef: Ref<string>;
    zoomRef: Ref<number>;
    activeToolRef: Ref<'select' | 'pan' | 'place'>;
    placementPendingRef: Ref<boolean>;
  };
  set: {
    setAngleSheet: Setter<AngleSheetRequest | null>;
    setExportSheetId: Setter<string | null>;
    setExportSheets: Setter<readonly EditorSheetInfo[]>;
    setInsetPickerOpen: Setter<boolean>;
    setKeypadRequest: Setter<KeypadRequest | null>;
    setPinnedToolbar: Setter<boolean>;
    setPlacement: Setter<DimensionSnapshot>;
    setPolygon: Setter<{ count: number } | null>;
    setReadOnly: Setter<boolean>;
    setReplacePrompt: Setter<{ key: string; asset: InsetAssetInput } | null>;
    setSceneTick: Setter<number>;
    setSheetCount: Setter<number>;
    setSheetTitle: Setter<string>;
    setStatus: Setter<EditorStatus>;
    setTextAnchor: Setter<Px | null>;
    setTextDraft: Setter<string>;
    setZoomPercent: Setter<number>;
    setInputKind: Setter<string | null>;
  };
}

/** Every editor tool, keyed. The shape kinds are their own ids. */
export type ToolId =
  | ShapeKind
  | 'angle'
  | 'freehand'
  | 'highlight'
  | 'text'
  | 'erase'
  | 'select'
  | 'inset'
  | 'dimension';

/** The methods every tool already has, and all the lifecycle loops need. */
export interface Tool {
  onToolChange(): void;
  dispose(): void;
}

/**
 * Owns the canvas, scene, history, loupe, tools, input routing and project open for one project
 * mount. A sheet switch is `loadSheet(id)` on the same objects (D145), not a remount.
 */
export class EditorController {
  private readonly m: ReturnType<typeof mount>;

  constructor(host: HTMLDivElement, deps: EditorControllerDeps) {
    this.m = mount(host, deps);
  }

  /** Switch to another sheet on the same canvas. A repeat of the loaded sheet is a no-op. */
  loadSheet(id: string): Promise<void> {
    return this.m.switchSheet(id);
  }

  dispose(): void {
    this.m.teardown();
  }
}

function mount(host: HTMLDivElement, deps: EditorControllerDeps) {
  const { projectId, folderName, sheetId, onSceneReady, loadSheet } = deps;
  const {
    angleRef, bitmapRef, canvasRef, channelRef, dimRef, eraseRef, freehandRef, highlightRef,
    historyRef, insetAssetsRef, insetRef, leaseRef, persistRef, projectDirRef, readOnlyRef,
    sceneRef, schedulerRef, selectRef, shapeToolsRef, sheetIdRef, textRef, toolIdRef, zoomRef,
    activeToolRef, placementPendingRef,
  } = deps.refs;
  const {
    setAngleSheet, setExportSheetId, setExportSheets, setInsetPickerOpen, setKeypadRequest,
    setPinnedToolbar, setPlacement, setPolygon, setReadOnly, setReplacePrompt, setSceneTick,
    setSheetCount, setSheetTitle, setStatus, setTextAnchor, setTextDraft, setZoomPercent,
    setInputKind,
  } = deps.set;
  let alive = true;

  const canvas = new EditorCanvas(host, {
    onZoom: (scale) => {
      sceneRef.current?.setScale(scale);
      const percent = Math.round(scale * 100);
      if (percent !== zoomRef.current) {
        zoomRef.current = percent;
        setZoomPercent(percent);
      }
    },
  });
  canvasRef.current = canvas;

  const resizeObserver = new ResizeObserver(() => {
    canvas.resize(host.clientWidth, host.clientHeight);
  });
  resizeObserver.observe(host);

  const router = createInputRouter({
    touchPlaces: () => {
      const s = useAppStore.getState();
      return s.touchPlaces && !s.penOnly;
    },
    fingerDraws: () => {
      const s = useAppStore.getState();
      return s.fingerDraws && !s.penOnly;
    },
  });

  // ---- the dimension flagship's live objects ----
  const history = new History();
  historyRef.current = history;
  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    // D150: a new dimension takes the Dimension tool's style (slim arrowheads by default).
    dimensionStyle: () => styleForTool(useStyleByTool.getState(), 'dimension'),
    // §8.1/§20.2: insets render BELOW markup, so every object created outside Focus
    // renders above all insets. Without this the layering rule is not guaranteed.
    insetLayer: canvas.insetLayer,
    ctx: appLabelContext(),
    ghostText: STRINGS.dimension.ghostLabel,
    // §19.3: `assets/<sha256hex>.jpg`, decoded once per session and cached.
    assetProvider: insetAssetsRef.current.provider,
  });
  sceneRef.current = scene;
  // Tools draw through a Focus-aware facade: inside Focus their sheet-space geometry
  // becomes children in the inset's ASSET px (§8.5). Transparent otherwise.
  const toolScene = createFocusAwareScene(scene, {
    getFocusId: () => useEditorStore.getState().focusInsetId,
    getAssetSize: (assetId) => insetAssetsRef.current.sizeOf(assetId),
  });
  onSceneReady?.({ scene, canvas });

  // ---- slice 1.8: publish the selection's shared style to the shell -------------
  // The shell (`EditorLayout`) mounts the props-driven `StylePanel`, but the live
  // document lives here, so this file is the only writer of the mirror
  // (`editorStore.selectionStyle`). It recomputes on every selection change, on ANY
  // scene mutation (a style edit / undo / redo fires `onChange`), after a style apply,
  // and on unmount — that is what makes the panel's indeterminate state react to a
  // real edit, not only to a prop the shell guessed.
  const publishSelectionStyle = (): void => {
    const keys = useEditorStore.getState().selection;
    const anns = keys
      .map((key) => scene.get(key))
      .filter((ann): ann is Annotation => ann !== undefined);
    const shared = selectionStyleState(anns.map((ann) => ann.style));
    useEditorStore.getState().setSelectionStyle({
      mode: shared.mode,
      style: shared.style,
      count: anns.length,
      scope: selectionScope(anns),
    });
  };
  publishSelectionStyle();

  // ---- slice 1.6 step 9: markup.json persistence (the D70 carry-in) ----
  // The document is in memory only; this is the writer. Writes are coalesced 400 ms
  // and atomic (tmp → move) inside `persistQueue` / `writeJsonAtomic`, under the
  // per-project Web Lock, addressed by the D51 runtime key `projectId`.
  //
  // Slice 1.10: the queue OWNS the autosave chip's status and the app store is its
  // mirror. A fresh editor starts `saved` (nothing pending — the chip still renders
  // nothing until a write resolves), so a previous project's status cannot leak in.
  //
  // R5 (D144): the queue, the lease and the channel belong to the project's session, not to
  // this mount. The shell holds the session open for as long as the project is, so a sheet
  // switch (a remount) keeps the same queue and a pending write is never orphaned. A bare
  // mount (no shell) holds the only reference and gets the old per-mount lifecycle.
  // The chip starts from the queue's REAL status: a shared queue may still be `pending`.
  const projectSession = acquireProjectSession(projectId, folderName);
  const persist = projectSession.persist;
  useAppStore.getState().setStorageStatus(persist.status);
  const unsubscribeStatus = persist.subscribe((status) => {
    // A read-only project is not a write failure: keep the chip's `Read-only` state
    // instead of letting a queue transition speak for the app (§11.2:688).
    if (readOnlyRef.current) return;
    useAppStore.getState().setStorageStatus(status);
  });
  persistRef.current = persist;
  // Slice 1.11: bridge the queue's busy flag onto the session signal that suppresses
  // the update toast. `subscribe` fires on every status transition; the explicit
  // `setPersistenceBusy` calls after each enqueue also catch a re-arm from a parked
  // state, where the status — and so the subscription — does not fire.
  const unsubscribeBusy = persist.subscribe(() => setPersistenceBusy(persist.inFlight));
  setPersistenceBusy(persist.inFlight);
  // D155: the grid card previews the saved state (photo + markup), re-snapshotted 3 s after
  // the last edit and flushed before a sheet switch or teardown.
  const thumbs = createSheetThumbWriter({
    canvas: () => canvasRef.current,
    target: (sid) => {
      const state = projectDirRef.current;
      const s = state?.file.sheets.find((x) => x.id === sid);
      if (!state || !s || readOnlyRef.current) return null;
      return {
        width: s.imageWidth,
        height: s.imageHeight,
        write: async (blob) => {
          const dir = await resolveSheetDir(state.dir, sid);
          await writeAtomic(dir, 'thumb.jpg', blob, projectId);
        },
      };
    },
  });
  scene.onChange = () => {
    // A style edit, an undo/redo or any other mutation may change the selection's
    // shared style — refresh the mirror BEFORE the early return (the shell's panel must
    // react even before the sheet id is known, e.g. during a restore).
    publishSelectionStyle();
    const sid = sheetIdRef.current;
    if (!sid) return;
    persist.queueSheet(projectId, sid, scene.markupFile(sid, 1));
    setPersistenceBusy(persist.inFlight);
    thumbs.schedule(sid);
    // Re-derive the Layers rows only while the flyout is open (avoids a full
    // SheetEditor re-render on every drag/property tick otherwise).
    if (useEditorStore.getState().layersOpen) setSceneTick((n) => n + 1);
  };
  const loupe = new Loupe({
    layer: canvas.overlayLayer,
    getImage: () => bitmapRef.current,
    getScale: () => canvas.scale,
    screenToImage: (p) => canvas.screenToImage(p),
    getViewport: () => ({ width: host.clientWidth, height: host.clientHeight }),
    getHandedness: () => useAppStore.getState().handedness,
  });
  const tool = new DimensionTool({
    canvas,
    scene: toolScene,
    history,
    loupe,
    getSettings: () => {
      const s = useAppStore.getState();
      return {
        precisionDenominator: s.precisionDenominator,
        unitSystem: s.unitSystem,
        unitFormat: s.unitFormat,
        handedness: s.handedness,
        magnifierOnTap: s.magnifierOnTap,
        glovedTouch: s.glovedTouch,
      };
    },
    onKeypadOpen: (request) => {
      setKeypadRequest(request);
      useEditorStore.getState().setKeypadOpen(request !== null);
    },
    onSnapshot: (snapshot) => {
      setPlacement(snapshot);
      useEditorStore.getState().setPendingOp(snapshot.phase !== 'idle' ? 'dimension' : 'none');
    },
    labels: {
      add: STRINGS.toasts.actionAddDimension,
      move: STRINGS.toasts.actionMoveDimension,
      delete: STRINGS.toasts.actionDeleteDimension,
      setValue: STRINGS.toasts.actionSetValue,
      adjust: STRINGS.toasts.actionAdjustDimension,
    },
  });
  tool.selectedKeys = () => useEditorStore.getState().selection;
  dimRef.current = tool;

  // ---- slice 1.6 markup tools ----
  const mkSettings = () => {
    const s = useAppStore.getState();
    return {
      precisionDenominator: s.precisionDenominator,
      unitSystem: s.unitSystem,
      unitFormat: s.unitFormat,
      glovedTouch: s.glovedTouch,
      fingerDraws: s.fingerDraws,
      touchPlaces: s.touchPlaces,
      penOnly: s.penOnly,
    };
  };
  const markupPending = (pending: boolean): void => {
    // `PendingOp` has no generic-shape member; a generic placement borrows 'polygon'
    // (the plan's sanctioned generic placement precedent) so Escape cancels it instead
    // of exiting the editor. Recorded in DECISIONS.
    const id = toolIdRef.current;
    const op = !pending
      ? 'none'
      : id === 'angle'
        ? 'angle'
        : id === 'text'
          ? 'text'
          : id === 'erase'
            ? 'erase'
            : 'polygon';
    useEditorStore.getState().setPendingOp(op);
  };

  function cancelActiveMarkup(): void {
    for (const shape of shapeToolsRef.current.values()) shape.onToolChange();
    angleRef.current?.onToolChange();
    freehandRef.current?.cancel();
    highlightRef.current?.cancel();
    textRef.current?.cancel();
    eraseRef.current?.onToolChange();
    selectRef.current?.onToolChange();
    insetRef.current?.onToolChange();
    // F5: the dimension machine shares the coarse `'place'` prop with every markup
    // tool, so a dimension→rect switch never changed the prop and its 450 ms settle
    // survived — the keypad then opened over the rectangle tool. `onToolChange` clears
    // the settle timer while keeping a committed B and discarding an uncommitted A.
    dimRef.current?.onToolChange();
  }

  for (const kind of ['line', 'arrow', 'rect', 'ellipse', 'polygon'] as ShapeKind[]) {
    const shape = new ShapeTool(kind, {
      canvas,
      scene: toolScene,
      history,
      getSettings: mkSettings,
      onSnapshot: (pending) => {
        if (kind === 'polygon') setPolygon(pending ? { count: shape.points.length } : null);
        markupPending(pending);
      },
      labels: {
        add: STRINGS.toasts.actionAddShape,
        move: STRINGS.toasts.actionMoveDimension,
        delete: STRINGS.select.delete,
      },
      newId: () => crypto.randomUUID(),
    });
    shapeToolsRef.current.set(kind, shape);
  }

  angleRef.current = new AngleTool({
    canvas,
    scene: toolScene,
    history,
    onSheetOpen: (request) => {
      setAngleSheet(request);
      useEditorStore.getState().setKeypadOpen(request !== null);
    },
    onSnapshot: (phase) => markupPending(phase !== 'idle'),
    labels: {
      add: STRINGS.toasts.actionAddAngle,
      delete: STRINGS.select.delete,
      setValue: STRINGS.toasts.actionSetValue,
    },
    newId: () => crypto.randomUUID(),
  });

  const inkCommon = {
    canvas,
    scene: toolScene,
    history,
    getSettings: mkSettings,
    onSnapshot: markupPending,
    highlightStyle: () => ({
      ...DEFAULT_STYLE,
      strokeColor: '#FFD400',
      strokeWidthMu: HIGHLIGHT_CHISEL_TOUCH_MU,
    }),
    newId: () => crypto.randomUUID(),
  };
  freehandRef.current = new FreehandTool('freehand', {
    ...inkCommon,
    labels: { add: STRINGS.toasts.actionAddInk, delete: STRINGS.select.delete },
  });
  highlightRef.current = new FreehandTool('highlight', {
    ...inkCommon,
    labels: { add: STRINGS.toasts.actionAddHighlight, delete: STRINGS.select.delete },
  });

  textRef.current = new TextTool({
    canvas,
    scene: toolScene,
    history,
    onRequestEntry: (at) => {
      setTextAnchor(at);
      setTextDraft('');
      markupPending(true);
    },
    onSnapshot: markupPending,
    labels: { add: STRINGS.toasts.actionAddText, delete: STRINGS.select.delete },
    newId: () => crypto.randomUUID(),
  });

  eraseRef.current = new EraseTool({
    canvas,
    scene: toolScene,
    history,
    objectName: (ann) => eraseObjectName(ann),
    onDeleteToast: (name, undo) =>
      emitToast({
        // §13.3 recoverable delete: name the object and offer the real undo.
        text: `${STRINGS.select.delete} ${name}`,
        action: { label: STRINGS.editor.undo, run: undo },
      }),
    onSnapshot: markupPending,
    labels: { delete: STRINGS.select.delete, split: STRINGS.toasts.actionSplitStroke },
  });

  selectRef.current = new SelectTool({
    canvas,
    scene: toolScene,
    history,
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (keys) => useEditorStore.getState().setSelection(keys),
    onSelectionChange: (keys) => {
      if (keys.length === 0) setPinnedToolbar(false);
      selectRef.current?.refresh();
    },
    onPinnedToolbar: (pinned) => setPinnedToolbar(pinned),
    labels: {
      move: STRINGS.toasts.actionMoveDimension,
      rotate: STRINGS.a11y.rotate,
      delete: STRINGS.select.delete,
      locked: STRINGS.editor.lockedToast,
    },
    onLockedToast: () => emitToast(STRINGS.editor.lockedToast),
    onDeleteToast: (label, undo) =>
      emitToast({
        // §13.3 recoverable delete: immediate, with a real undo (§13.4 10 s window).
        text: label,
        action: { label: STRINGS.editor.undo, run: undo },
      }),
  });

  // ---- slice 1.7: the image-inset tool (insert flow + §8.5 manipulation + Focus) ----
  insetRef.current = new InsetTool({
    canvas,
    scene: toolScene,
    history,
    getSheetSize: () => {
      const size = canvas.photoSize;
      return { width: size.width || 1, height: size.height || 1 };
    },
    getSelection: () => useEditorStore.getState().selection,
    setSelection: (keys) => useEditorStore.getState().setSelection(keys),
    onRequestPicker: () => {
      setInsetPickerOpen(true);
      useEditorStore.getState().setPendingOp('inset');
    },
    onPickerDismissed: () => {
      setInsetPickerOpen(false);
      useEditorStore.getState().setPendingOp('none');
    },
    onPlaced: () => {
      setInsetPickerOpen(false);
      useEditorStore.getState().setPendingOp('none');
    },
    onFocusChange: (insetId) => useEditorStore.getState().setFocusInsetId(insetId),
    getAssetSize: (assetId) => insetAssetsRef.current.sizeOf(assetId),
  });

  // Track the real tool id (the prop is the coarse seam) and cancel on switch.
  // R6: the tool registry. Teardown goes through it instead of nine hand-written ref calls.
  // Insertion order is the old disposal order (shapes, angle, ink, text, erase, select, inset).
  const tools = new Map<ToolId, Tool>();
  for (const [kind, shape] of shapeToolsRef.current) tools.set(kind, shape);
  tools.set('angle', angleRef.current);
  tools.set('freehand', freehandRef.current);
  tools.set('highlight', highlightRef.current);
  tools.set('text', textRef.current);
  tools.set('erase', eraseRef.current);
  tools.set('select', selectRef.current);
  tools.set('inset', insetRef.current);
  tools.set('dimension', tool);

  toolIdRef.current = useEditorStore.getState().activeTool;
  const unsubscribeTool = useEditorStore.subscribe((state, prev) => {
    if (state.activeTool === prev.activeTool) return;
    cancelActiveMarkup();
    toolIdRef.current = state.activeTool;
    // A pending picker belongs to the inset tool: switching away discards it.
    setInsetPickerOpen(false);
    if (state.activeTool === 'select') selectRef.current?.refresh();
    else {
      selectRef.current?.onToolChange();
      setPinnedToolbar(false);
    }
    // Handles belong to the Inset tool alone (the Select tool draws its own).
    if (state.activeTool === 'inset') insetRef.current?.refresh();
  });
  const unsubscribeSelection = useEditorStore.subscribe((state, prev) => {
    if (state.selection === prev.selection) return;
    publishSelectionStyle();
    if (state.selection.length === 0) setPinnedToolbar(false);
    selectRef.current?.refresh();
    if (useEditorStore.getState().activeTool === 'inset') insetRef.current?.refresh();
  });
  // The store is the mirror; this keeps the InsetFocus owner (the dim + the one-level
  // guard) in lockstep with it, so the shell's Esc rung can exit Focus by name alone.
  const unsubscribeFocus = useEditorStore.subscribe((state, prev) => {
    if (state.focusInsetId === prev.focusInsetId) return;
    const inset = insetRef.current;
    if (!inset) return;
    if (state.focusInsetId === null) {
      if (inset.focusId !== null) inset.exitFocus();
    } else if (inset.focusId !== state.focusInsetId) {
      inset.enterFocus(state.focusInsetId);
    }
  });

  // Bridge the shell's chrome to the imperative canvas (undo/redo/delete/✓/adjust).
  const session: EditorSession = {
    undo: () => {
      const cmd = history.undo();
      return cmd ? { label: cmd.label } : null;
    },
    redo: () => {
      const cmd = history.redo();
      return cmd ? { label: cmd.label } : null;
    },
    deleteSelection: () => {
      const keys = [...useEditorStore.getState().selection];
      if (keys.length === 0) return null;
      return selectRef.current?.deleteSelection() ?? null;
    },
    nudgeSelection: (dx: number, dy: number) => {
      const keys = [...useEditorStore.getState().selection];
      if (keys.length === 0) return null;
      return selectRef.current?.nudgeSelection(dx, dy) ?? null;
    },
    cancelPending: () => {
      // F3: the shell's Esc rung 1 must actually cancel the pending DIMENSION.
      // `tool.cancelPending()` discards an uncommitted A (or keeps a committed B as the
      // Valueless ghost); clearing the store flag alone left the machine in `anchorA`
      // so the next tap committed the dimension the user escaped away from. The markup
      // tools that share the rung are cancelled too (their own Escape path normally
      // wins first, but the rung must be complete on its own).
      tool.cancelPending();
      if (markupToolPending()) cancelActiveMarkup();
    },
    requestValue: () => tool.requestKeypad(),
    adjustEndpoints: () => tool.adjustEndpoints(),
    // Slice 1.10: the autosave chip's Error-state Retry. `flush()` clears the parked
    // flag and re-attempts at once (§5.4). It does not touch `storageStatus` — the
    // queue reports the outcome, and only the queue ever sets that value.
    retrySave: () => {
      void persistRef.current?.flush();
    },
    // Slice 1.11: the update prompt's flush-first reload. `persistQueue.flush()`
    // resolves even when a write failed (the queue parks instead of throwing), so wait
    // for it to stop being busy and classify a parked failure as a rejection — a
    // reload must never run over an edit that did not reach disk.
    flush: async () => {
      const queue = persistRef.current;
      if (!queue) return;
      await queue.flush();
      await new Promise<void>((resolve) => {
        if (!queue.inFlight) {
          resolve();
          return;
        }
        const off = queue.subscribe(() => {
          if (!queue.inFlight) {
            off();
            resolve();
          }
        });
      });
      const settled = queue.status;
      if (settled === 'full' || settled === 'pending' || settled === 'error') {
        throw new Error(`autosave did not settle cleanly (${settled})`);
      }
    },
    // ---- slice 1.8: the style-system commands --------------------------------
    applyStylePatch: (patch, label) => {
      const keys = [...useEditorStore.getState().selection];
      // No selection: the patch belongs to the TOOL style only; the caller owns that.
      if (keys.length === 0) return;
      // §8.3 coalescing: a held scrubber is ONE undo step, not one per input tick
      // (`styleCoalesceKey` above). A full-style apply (`applyStyle`) stays `exec` —
      // a preset/recent tap is a discrete action, not a continuous one.
      history.execCoalesced(
        scene.patchStyleCommand(keys, patch, label),
        styleCoalesceKey(keys, patch),
        STYLE_COALESCE_MS,
      );
      publishSelectionStyle();
    },
    applyStyle: (style, label) => {
      const keys = [...useEditorStore.getState().selection];
      if (keys.length === 0) return;
      history.exec(scene.styleCommand(keys, style, label));
      publishSelectionStyle();
    },
    applyProjectPrecision: (denominator) => {
      // The project file is the source of truth for the project-level value; the loaded
      // one is in `projectDirRef`. No project open → nothing to edit.
      const state = projectDirRef.current;
      if (!state) return;
      const ctx = applyProjectPrecisionFn({
        projectFile: state.file,
        ctx: currentMeasureContext(),
        denominator,
        scene,
        // The atomic, lock-guarded `project.json` write stays owned by `persistQueue`.
        queueProject: (file) => {
          persist.queueProject(projectId, file);
          setPersistenceBusy(persist.inFlight);
        },
      });
      // Keep the in-memory project file fresh so a second change never re-applies from a
      // stale snapshot (the helper returns the next context, not the next file).
      state.file = {
        ...state.file,
        project: {
          ...state.file.project,
          // `applyProject*` validated the denominator against `VALID_DENOMINATORS`, so
          // this narrows a value that is already legal (the domain union has no alias).
          precisionDenominator:
            ctx.precisionDenominator as ProjectFile['project']['precisionDenominator'],
          unitFormat: ctx.unitFormat,
        },
      };
      // Mirror into the app store so every label re-derives (`unsubscribeCtx` below
      // subscribes appStore → `scene.setContext`, and the panel confirms the new value).
      useAppStore.getState().setPrecisionDenominator(ctx.precisionDenominator);
    },
    applyProjectUnitFormat: (format) => {
      const state = projectDirRef.current;
      if (!state) return;
      const ctx = applyProjectUnitFormatFn({
        projectFile: state.file,
        ctx: currentMeasureContext(),
        format,
        scene,
        queueProject: (file) => {
          persist.queueProject(projectId, file);
          setPersistenceBusy(persist.inFlight);
        },
      });
      state.file = {
        ...state.file,
        project: {
          ...state.file.project,
          // `applyProject*` validated the denominator against `VALID_DENOMINATORS`, so
          // this narrows a value that is already legal (the domain union has no alias).
          precisionDenominator:
            ctx.precisionDenominator as ProjectFile['project']['precisionDenominator'],
          unitFormat: ctx.unitFormat,
        },
      };
      useAppStore.getState().setUnitFormat(ctx.unitFormat);
    },
  };
  setEditorSession(session);

  /** The project measurement context as the app currently renders it. */
  function currentMeasureContext(): {
    unitSystem: 'imperial' | 'metric';
    unitFormat: UnitFormat;
    precisionDenominator: number;
  } {
    const s = useAppStore.getState();
    return {
      unitSystem: s.unitSystem,
      unitFormat: s.unitFormat,
      precisionDenominator: s.precisionDenominator,
    };
  }

  // Precision / unit-format changes re-derive every label (no stored labels).
  const unsubscribeCtx = useAppStore.subscribe((state) => {
    scene.setContext({
      unitSystem: state.unitSystem,
      unitFormat: state.unitFormat,
      precisionDenominator: state.precisionDenominator,
    });
  });

  // R1: the pointer gesture engine lives in `gestureArbiter.ts`; the listeners stay here.
  const arbiter = new GestureArbiter({
    host, canvas, scene, router, tool, history, activeToolRef, placementPendingRef, toolIdRef,
    sceneRef, shapeToolsRef, angleRef, freehandRef, highlightRef, textRef, eraseRef, selectRef,
    insetRef, mkSettings, cancelActiveMarkup, setPinnedToolbar, setInputKind,
  });
  const onPointerDown = (e: PointerEvent): void => arbiter.onPointerDown(e);
  const onPointerMove = (e: PointerEvent): void => arbiter.onPointerMove(e);
  const endContact = (e: PointerEvent): void => arbiter.onPointerUp(e);
  const cancelContact = (e: PointerEvent): void => arbiter.onPointerCancel(e);
  const markupToolPending = (): boolean => arbiter.markupToolPending();
  // Keyboard: Escape cancels a markup op; Enter/Backspace drive Polygon; Delete removes
  // the selection (a11y §19.6 — every tool operable from the keyboard).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (useEditorStore.getState().keypadOpen) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    const id = toolIdRef.current;
    if (event.key === 'Escape') {
      if (id !== 'dimension' && markupToolPending()) {
        event.preventDefault();
        cancelActiveMarkup();
        useEditorStore.getState().setPendingOp('none');
      }
      return;
    }
    if (id === 'polygon' && event.key === 'Enter') {
      event.preventDefault();
      shapeToolsRef.current.get('polygon')?.done();
      return;
    }
    // Enter while a single inset is selected enters Focus (UI §9:627).
    if (event.key === 'Enter' && !useEditorStore.getState().focusInsetId) {
      const selected = useEditorStore.getState().selection;
      if (selected.length === 1 && sceneRef.current?.get(selected[0])?.type === 'image') {
        event.preventDefault();
        insetRef.current?.enterFocus(selected[0]);
        return;
      }
    }
    if (id === 'polygon' && event.key === 'Backspace') {
      event.preventDefault();
      shapeToolsRef.current.get('polygon')?.undoPoint();
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const keys = useEditorStore.getState().selection;
    if (keys.length === 0) return;
    event.preventDefault();
    session.deleteSelection();
  };

  // Arrow-key nudge (UI §8.2 #9, touch model §2.6): 1 px per press, 10 px with Shift. This is
  // the keyboard escape hatch for the finger's systematic contact offset — the Nudge Pad's job
  // on glass — and the reason UI §8.2#9 wants the canvas focusable after a TOUCH selection.
  // Scoped to the canvas host, so it cannot steal arrows from the chrome's own controls.
  const onCanvasArrow = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, { dx: number; dy: number }> = {
      ArrowLeft: { dx: -step, dy: 0 },
      ArrowRight: { dx: step, dy: 0 },
      ArrowUp: { dx: 0, dy: -step },
      ArrowDown: { dx: 0, dy: step },
    };
    const move = delta[event.key];
    if (!move) return;
    if (useEditorStore.getState().selection.length === 0) return;
    event.preventDefault();
    session.nudgeSelection(move.dx, move.dy);
  };
  host.addEventListener('keydown', onCanvasArrow);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', endContact);
  host.addEventListener('pointercancel', cancelContact);
  window.addEventListener('keydown', onKeyDown);

  /** The sheet the shell asked for most recently, and the one this canvas last loaded. */
  let requestedSheetId = sheetId;
  let loadedSheetId: string | null = null;

  const opened = (async () => {
    try {
      await projectSession.ready;
      // The session owns the lease; an unmounted editor simply stops here.
      if (!alive) return;
      const lease = projectSession.lease();
      leaseRef.current = lease;
      setReadOnly(!lease);
      readOnlyRef.current = !lease;
      // Slice 1.10: the read-only project case is the chip's `Read-only` state, not a
      // failure — and no later queue transition may overwrite it (see `onStatus`).
      if (!lease) useAppStore.getState().setStorageStatus('readonly');
      channelRef.current = projectSession.channel();

      const projectDir = await resolveOpenProjectDir(projectId);
      await cleanStaleTmp(projectDir, projectId);
      const file = await readProjectFile(projectDir);
      if (!alive) return;
      projectDirRef.current = { dir: projectDir, file };

      const sheets = file.sheets.filter((s) => !s.deletedAt);
      setSheetCount(sheets.length);
      // Slice 1.9: the export seam's sheet list (working-image px, never screen px).
      setExportSheets(
        sheets.map((s) => ({
          id: s.id,
          title: s.title,
          imageWidthPx: s.imageWidth,
          imageHeightPx: s.imageHeight,
        })),
      );
      if (sheets.length === 0) {
        setStatus('empty');
        return;
      }
      const sheet =
        (requestedSheetId ? sheets.find((s) => s.id === requestedSheetId) : undefined) ?? sheets[0];
      setSheetTitle(sheet.title);
      setExportSheetId(sheet.id);
      loadedSheetId = sheet.id;
      const loaded = await loadSheet(canvas, projectDir, sheet);
      if (!alive) return;
      setStatus(loaded);
    } catch {
      if (alive) {
        setStatus('error');
        // Slice 1.10: the chip/toast layer makes the failure visible beyond the
        // inline panel. The same approved wording the panel already shows.
        emitToast({ text: STRINGS.errors.projectUnavailable, urgent: true });
      }
    }
  })();

  /** Switches run one at a time; a request superseded while it waited is skipped. */
  let switching: Promise<void> = opened;

  /**
   * D145: open another sheet on the SAME canvas, scene, tools and persist queue. Before R6 a
   * sheet change remounted all of it. What that remount reset is replayed here, and the undo
   * history is cleared explicitly (one sheet's steps must never undo another's). The project
   * file is re-read, because a capture launched from the editor wrote the new sheet behind
   * this controller's back, exactly as the remount's fresh open used to pick up.
   */
  function switchSheet(id: string): Promise<void> {
    requestedSheetId = id;
    switching = switching.then(() => doSwitch(id));
    return switching;
  }

  async function doSwitch(id: string): Promise<void> {
    if (!alive || requestedSheetId !== id || loadedSheetId === id) return;
    const state = projectDirRef.current;
    // The open failed (the error panel and its Retry own that) or never finished.
    if (!state) return;
    loadedSheetId = id;
    void thumbs.flush();
    sheetIdRef.current = null;
    cancelActiveMarkup();
    history.clear();
    useEditorStore.getState().clearSelection();
    useEditorStore.getState().setKeypadOpen(false);
    useEditorStore.getState().setLayersOpen(false);
    useEditorStore.getState().setFocusInsetId(null);
    useEditorStore.getState().setSelectionStyle(createInitialSelectionStyle());
    useEditorStore.getState().setPendingOp('none');
    setPinnedToolbar(false);
    setInsetPickerOpen(false);
    setReplacePrompt(null);
    schedulerRef.current?.cancel();
    schedulerRef.current = null;
    setStatus('loading');
    try {
      const file = await readProjectFile(state.dir);
      if (!alive) return;
      projectDirRef.current = { dir: state.dir, file };
      const sheets = file.sheets.filter((s) => !s.deletedAt);
      setSheetCount(sheets.length);
      setExportSheets(
        sheets.map((s) => ({
          id: s.id,
          title: s.title,
          imageWidthPx: s.imageWidth,
          imageHeightPx: s.imageHeight,
        })),
      );
      const sheet = sheets.find((s) => s.id === id) ?? sheets[0];
      if (!sheet) {
        setStatus('empty');
        return;
      }
      setSheetTitle(sheet.title);
      setExportSheetId(sheet.id);
      const loaded = await loadSheet(canvas, state.dir, sheet);
      if (!alive) return;
      setStatus(loaded);
    } catch {
      if (alive) {
        setStatus('error');
        emitToast({ text: STRINGS.errors.projectUnavailable, urgent: true });
      }
    }
  }

  const teardown = (): void => {
    void thumbs.flush();
    alive = false;
    resizeObserver.disconnect();
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', endContact);
    host.removeEventListener('pointercancel', cancelContact);
    window.removeEventListener('keydown', onKeyDown);
    host.removeEventListener('keydown', onCanvasArrow);
    unsubscribeCtx();
    unsubscribeTool();
    unsubscribeSelection();
    unsubscribeFocus();
    unsubscribeBusy();
    setPersistenceBusy(false);
    setEditorSession(null);
    // R5 (D144): release this mount's reference. Only the LAST reference (the shell's, when the
    // project closes, or this one for a bare mount) flushes, then releases the lease and channel,
    // then deregisters, in that order (the D137 ordering now lives in `projectSession.ts`).
    unsubscribeStatus();
    leaseRef.current = null;
    channelRef.current = null;
    void projectSession.close();
    scene.onChange = null;
    persistRef.current = null;
    sheetIdRef.current = null;
    // The dimension tool keeps its old place at the very end of the teardown.
    for (const [id, t] of tools) if (id !== 'dimension') t.dispose();
    tools.clear();
    shapeToolsRef.current.clear();
    angleRef.current = null;
    freehandRef.current = null;
    highlightRef.current = null;
    textRef.current = null;
    eraseRef.current = null;
    selectRef.current = null;
    insetRef.current = null;
    insetAssetsRef.current.dispose();
    schedulerRef.current?.cancel();
    schedulerRef.current = null;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    projectDirRef.current = null;
    canvasRef.current = null;
    historyRef.current = null;
    sceneRef.current = null;
    dimRef.current = null;
    useEditorStore.getState().setKeypadOpen(false);
    useEditorStore.getState().setLayersOpen(false);
    useEditorStore.getState().setFocusInsetId(null);
    // The scene is being torn down; the shell must not keep reading its selection style.
    useEditorStore.getState().setSelectionStyle(createInitialSelectionStyle());
    setPinnedToolbar(false);
    setInsetPickerOpen(false);
    setReplacePrompt(null);
    useEditorStore.getState().setPendingOp('none');
    tool.dispose();
    loupe.destroy();
    canvas.destroy();
  };

  return { teardown, switchSheet };
}

/**
 * The coalescing key for a style patch (§8.3: "style edits coalesce within a **600 ms**
 * window into one step").
 *
 * `StyleEditorSheet`'s HSL / transparency / font-size controls are `type="range"`
 * scrubbers that fire `onChange` on EVERY input tick, so without coalescing one drag of
 * the transparency slider pushes ~100 undo steps onto a 100-step stack — it erases the
 * session's history. `History.execCoalesced` existed for exactly this since slice 1.5 but
 * had no production caller (session-13 review F4); `applyStylePatch` below is it.
 *
 * The key is (selection, patched style keys): a different control, a different selection,
 * or a gap wider than the window each start a NEW step, which is what makes an undo mean
 * "that one control's drag" and not "everything I touched in the last second".
 */
export function styleCoalesceKey(
  keys: readonly string[],
  patch: Partial<AnnotationStyle>,
): string {
  return `style:${keys.join('|')}:${Object.keys(patch).sort().join('+')}`;
}

/**
 * The erase object-mode name (plan step 6: the undo toast names the object). Every
 * branch uses appendix copy; nothing is invented. A dimension carries its measurement
 * in the name (the appendix's `editor.eraseNameDimension` template).
 */
export function eraseObjectName(ann: Annotation): string {
  switch (ann.type) {
    case 'dimension':
      return t(STRINGS.editor.eraseNameDimension, {
        measurement: ann.enteredText ?? '',
      });
    case 'rect':
      return STRINGS.editor.eraseNameRectangle;
    case 'freehand':
      return STRINGS.editor.layersNameFreehand;
    case 'highlight':
      return STRINGS.tool.highlighter;
    case 'line':
      return STRINGS.tool.line;
    case 'arrow':
      return STRINGS.tool.arrowLeader;
    case 'ellipse':
      return STRINGS.tool.ellipse;
    case 'polygon':
      return STRINGS.tool.polygon;
    case 'angle':
      return STRINGS.tool.angle;
    case 'text':
      return STRINGS.tool.textNote;
    case 'image':
      return STRINGS.tool.imageInset;
  }
}

/** The app's current measurement context, read at call time. */
export function appLabelContext(): {
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  precisionDenominator: number;
} {
  const s = useAppStore.getState();
  return {
    unitSystem: s.unitSystem,
    unitFormat: s.unitFormat,
    precisionDenominator: s.precisionDenominator,
  };
}
