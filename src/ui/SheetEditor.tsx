/**
 * `src/ui/SheetEditor.tsx` — the editor canvas screen (slice 1.3; dimension wiring added
 * in slice 1.5).
 *
 * 1.3 shipped the photo, the imperative `EditorCanvas`, pan/zoom/fit and the import path.
 * Slice 1.5 adds the **dimension flagship**: the placement machine
 * (`src/editor/tools/DimensionTool.ts`), the derived-label renderer
 * (`src/editor/shapes/`), the loupe (`src/editor/Loupe.ts`), undo/redo
 * (`src/editor/history.ts`), the settle window and the keypad mount.
 *
 * **Object-first drag is now live** (was owed/`null` in 1.3): a one-finger drag on a
 * grabbable unlocked object moves it, and a second finger **restores the pre-drag
 * position** (D63 — `onSecondFinger(...).restoreTo` is consumed here).
 *
 * **Keypad-open state** (touch model §5.1): while the value sheet is open the rail/style
 * are dimmed and non-interactive by `EditorLayout`; the canvas stays live for pan/pinch
 * only and taps do nothing. `Esc`/`✕` keep the geometry.
 *
 * The sheet chrome is the shell's (`EditorLayout`); this file remains independently
 * mountable with the frozen `SheetEditorProps` surface, and owns the canvas, the zoom
 * pill, the status panels, the placement HUD and the keypad mount point.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { ProjectFile } from '@/domain/schema';
import type { Px } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { Annotation, Geometry, UnitFormat } from '@/domain/types';
import {
  EditorCanvas,
  LONG_PRESS_MS,
  TAP_SLOP,
  decideDragTarget,
  isTap,
  onSecondFinger,
  type DragSession,
  type ScreenPoint,
} from '@/editor/EditorCanvas';
import { createInputRouter, type InputIntent } from '@/editor/inputRouter';
import { History } from '@/editor/history';
import { MarkupScene, translateGeometry } from '@/editor/shapes/scene';
import { Loupe } from '@/editor/Loupe';
import {
  DimensionTool,
  type DimensionSnapshot,
  type KeypadRequest,
} from '@/editor/tools/DimensionTool';
import { ShapeTool, type ShapeKind } from '@/editor/tools/ShapeTool';
import { AngleTool, type AngleSheetRequest } from '@/editor/tools/AngleTool';
import { FreehandTool, isFingerInkAllowed } from '@/editor/tools/FreehandTool';
import { TextTool } from '@/editor/tools/TextTool';
import { EraseTool, effectiveEraseMode, eraseNameKey, isErasePreview, strokeModeAvailable, type EraseMode } from '@/editor/tools/EraseTool';
import { ROTATE_STOPS, SelectTool } from '@/editor/tools/SelectTool';
import { setEditorSession, emitToast, type EditorSession } from '@/editor/session';
import { createPersistQueue, type PersistQueue } from '@/state/persistQueue';
import { selectionScope, selectionStyleState } from '@/state/styleByTool';
import {
  applyProjectPrecision as applyProjectPrecisionFn,
  applyProjectUnitFormat as applyProjectUnitFormatFn,
} from '@/state/projectMeasure';
import { HIGHLIGHT_CHISEL_TOUCH_MU } from '@/editor/tools/toolTypes';
import DimensionKeypadSheet from '@/ui/DimensionKeypadSheet';
import LayersPanel, { blockFor } from '@/ui/LayersPanel';
import { annotationName, buildLayerRows, PHOTO_ROW_KEY } from '@/ui/layersRows';
import { createInitialSelectionStyle, useEditorStore } from '@/state/editorStore';
import { readExifInfo } from '@/media/exif';
import { normalizeImage } from '@/media/normalizeImage';
import {
  createThumbnailScheduler,
  type ThumbnailScheduler,
} from '@/media/thumbnails';
import {
  acquireWriterLease,
  cleanStaleTmp,
  clearOpenProject,
  isPhotoDamaged,
  openProjectChannel,
  readProjectFile,
  readSheetMarkup,
  registerOpenProject,
  resolveOpenProjectDir,
  resolveSheetDir,
  writeAtomic,
  type ProjectChannel,
  type WriterLease,
} from '@/fs/projectStore';
import { useAppStore } from '@/state/appStore';
import { addSheetFromPhoto, defaultSheetTitle } from '@/fs/sheetIntake';
import { InsetTool, replacePhotoDecision, type InsetAssetInput } from '@/editor/tools/InsetTool';
import { storeInsetAsset } from '@/editor/inset/insetAssets';
import ImageInsetPickerSheet from '@/ui/ImageInsetPickerSheet';
import { InsetAssetRegistry, createFocusAwareScene } from '@/ui/insetWiring';
import './insetWire.css';
import { STRINGS, t } from './strings';

type SheetFile = ProjectFile['sheets'][number];
type EditorStatus = 'loading' | 'ready' | 'empty' | 'damaged' | 'error';
/**
 * Tool seam for the rail. `'place'` stands for ANY placement tool
 * (dimension/angle/line/…): it arms placement, so double-tap fit is suspended and a
 * pending placement suppresses drag navigation.
 */
type EditorTool = 'select' | 'pan' | 'place';

/** Double-tap window for fit↔100%: 320 ms, 24 px (UI §5.4 "double tap"). */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 24;

/**
 * The keypad sheet is owned by a parallel lane; its pinned interface is exactly the
 * shape this file mounts. `tests/sheetEditor.browser.test.ts` proves the mount.
 */

export interface SheetEditorProps {
  /** D51 runtime key `${projectId}:${folderName}` — NEVER the bare project id. */
  projectId: string;
  folderName: string;
  /** Part of the frozen surface; the shell owns navigation. */
  onExit: () => void;
  activeTool?: EditorTool;
  placementPending?: boolean;
  onImportReady?: (trigger: () => void) => void;
  onSheetTitleChange?: (title: string) => void;
  sheetId?: string;
  /**
   * Slice 1.7 integration seam (the `onImportReady` precedent): the live imperative
   * scene + canvas, handed out once they exist. Lets an in-browser test drive geometry
   * through the REAL editor without reaching into Konva globals.
   */
  onSceneReady?: (api: { scene: MarkupScene; canvas: EditorCanvas }) => void;
}

/**
 * The erase object-mode name (plan step 6: the undo toast names the object). Every
 * branch uses appendix copy; nothing is invented. A dimension carries its measurement
 * in the name (the appendix's `editor.eraseNameDimension` template).
 */
function eraseObjectName(ann: Annotation): string {
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

interface Contact {
  intent: InputIntent;
  session: DragSession;
  start: ScreenPoint;
  /** The contact's start in image space (the marquee anchor). */
  startImage: Px;
  startAt: number;
  last: ScreenPoint;
  /** The tool owns this contact's movement (rubber-band / refine). */
  toolAction: 'consume' | 'pan' | 'none';
  /** Pan even while a placement is pending (settle-time contact → pan, §1.4). */
  forcePan: boolean;
  objectKey: string | null;
  /** Set while a freehand/highlighter ink stroke is being sampled. */
  freehandKind: 'freehand' | 'highlight' | null;
  /** Which machine owns this contact's lift: the dimension tool or a 1.6 markup tool. */
  owner: 'dimension' | 'markup' | null;
  /** Raw `PointerEvent.pressure` for the ink path (pen-only signal; touch is 0.5). */
  pressure: number;
  /** Select tool: this contact may become a marquee if it moves beyond the slop. */
  marqueeCandidate: boolean;
  /** Select tool: the 600 ms long-press-to-pin timer. */
  longPressTimer: number | null;
  /** Erase tool (object mode): preview is deferred to the 600 ms timer. */
  eraseObject: boolean;
  /** Erase: the contact moved beyond the slop, which cancels the preview/delete. */
  eraseMoved: boolean;
  /** Erase: the 600 ms `--err` preview timer. */
  eraseTimer: number | null;
}

interface ObjectDrag {
  key: string;
  /** Geometry captured at drag start (any kind). */
  geometry: Geometry;
  startImage: Px;
}

function isAtEdge(point: ScreenPoint, host: HTMLElement): boolean {
  return point.x < 24 || point.y < 24 || point.x > host.clientWidth - 24 || point.y > host.clientHeight - 24;
}

export default function SheetEditor({
  projectId,
  folderName,
  activeTool = 'select',
  placementPending = false,
  onImportReady,
  onSheetTitleChange,
  sheetId,
  onSceneReady,
}: SheetEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const keypadMountRef = useRef<HTMLDivElement | null>(null);
  const layersMountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<EditorCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const projectDirRef = useRef<{ dir: FileSystemDirectoryHandle; file: ProjectFile } | null>(null);
  const leaseRef = useRef<WriterLease | null>(null);
  const channelRef = useRef<ProjectChannel | null>(null);
  const schedulerRef = useRef<ThumbnailScheduler | null>(null);
  const historyRef = useRef<History | null>(null);
  const sceneRef = useRef<MarkupScene | null>(null);
  const dimRef = useRef<DimensionTool | null>(null);
  const activeToolRef = useRef<EditorTool>(activeTool);
  const placementPendingRef = useRef(placementPending);
  const zoomRef = useRef(100);
  // The REAL tool id lives in the store; `activeTool` (the prop) is the coarse seam.
  const toolIdRef = useRef<string>('select');
  const shapeToolsRef = useRef<Map<ShapeKind, ShapeTool>>(new Map());
  const angleRef = useRef<AngleTool | null>(null);
  const freehandRef = useRef<FreehandTool | null>(null);
  const highlightRef = useRef<FreehandTool | null>(null);
  const textRef = useRef<TextTool | null>(null);
  const eraseRef = useRef<EraseTool | null>(null);
  const selectRef = useRef<SelectTool | null>(null);
  const persistRef = useRef<PersistQueue | null>(null);
  const sheetIdRef = useRef<string | null>(null);
  // ---- slice 1.7 (image insets) ----
  const insetRef = useRef<InsetTool | null>(null);
  const insetAssetsRef = useRef<InsetAssetRegistry>(new InsetAssetRegistry());
  const insetDeviceInputRef = useRef<HTMLInputElement | null>(null);
  const insetCameraInputRef = useRef<HTMLInputElement | null>(null);
  const replacePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [polygon, setPolygon] = useState<{ count: number } | null>(null);
  const [angleSheet, setAngleSheet] = useState<AngleSheetRequest | null>(null);
  const [textAnchor, setTextAnchor] = useState<Px | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [eraseMode, setEraseMode] = useState<EraseMode>('object');
  /** Select tool: the mini-toolbar was pinned by a 600 ms long-press. */
  const [pinnedToolbar, setPinnedToolbar] = useState(false);
  /** Bumped when the scene changes while the Layers flyout is open, to re-derive rows. */
  const [, setSceneTick] = useState(0);
  // ---- slice 1.7 state ----
  const [insetPickerOpen, setInsetPickerOpen] = useState(false);
  const [insetRecents, setInsetRecents] = useState<
    Array<{ assetId: string; thumbUrl: string; name: string }>
  >([]);
  /** A warned Replace-photo decision awaiting the user's explicit choice. */
  const [replacePrompt, setReplacePrompt] = useState<{ key: string; asset: InsetAssetInput } | null>(
    null,
  );
  /** True while the warned dialog's hold-to-confirm button is armed. */
  const [replaceHolding, setReplaceHolding] = useState(false);
  const replaceHoldTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<EditorStatus>('loading');
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetCount, setSheetCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [keypadRequest, setKeypadRequest] = useState<KeypadRequest | null>(null);
  const [placement, setPlacement] = useState<DimensionSnapshot>({
    phase: 'idle',
    hasGeometry: false,
    key: null,
  });
  const precisionDenominator = useAppStore((s) => s.precisionDenominator);
  const unitSystem = useAppStore((s) => s.unitSystem);
  const unitFormat = useAppStore((s) => s.unitFormat);
  const activeToolId = useEditorStore((s) => s.activeTool);
  const selection = useEditorStore((s) => s.selection);
  const layersOpen = useEditorStore((s) => s.layersOpen);
  const [inputKind, setInputKind] = useState<string | null>(null);

  useEffect(() => {
    activeToolRef.current = activeTool;
    if (activeTool !== 'place') dimRef.current?.onToolChange();
  }, [activeTool]);
  useEffect(() => {
    placementPendingRef.current = placementPending;
  }, [placementPending]);

  useEffect(() => {
    onImportReady?.(() => fileInputRef.current?.click());
  }, [onImportReady]);

  useEffect(() => {
    onSheetTitleChange?.(sheetTitle);
  }, [onSheetTitleChange, sheetTitle]);

  // ---- canvas lifecycle + input routing + project open -------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
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
    const persist = createPersistQueue({
      onStatus: (status) => useAppStore.getState().setStorageStatus(status),
    });
    persistRef.current = persist;
    scene.onChange = () => {
      // A style edit, an undo/redo or any other mutation may change the selection's
      // shared style — refresh the mirror BEFORE the early return (the shell's panel must
      // react even before the sheet id is known, e.g. during a restore).
      publishSelectionStyle();
      const sid = sheetIdRef.current;
      if (!sid) return;
      persist.queueSheet(projectId, sid, scene.markupFile(sid, 1));
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
      onDeleteToast: (name) => emitToast(t(STRINGS.toasts.undoAction, { actionName: `${STRINGS.select.delete} ${name}` })),
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
      // ---- slice 1.8: the style-system commands --------------------------------
      applyStylePatch: (patch, label) => {
        const keys = [...useEditorStore.getState().selection];
        // No selection: the patch belongs to the TOOL style only; the caller owns that.
        if (keys.length === 0) return;
        history.exec(scene.patchStyleCommand(keys, patch, label));
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
          queueProject: (file) => persist.queueProject(projectId, file),
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
          queueProject: (file) => persist.queueProject(projectId, file),
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

    const contacts = new Map<number, Contact>();
    const objectDrags = new Map<number, ObjectDrag>();
    let lastTap: { point: ScreenPoint; at: number } | null = null;

    const placementArmed = (): boolean =>
      activeToolRef.current !== 'select' && activeToolRef.current !== 'pan';

    /**
     * Slice 1.6 dispatch. The coarse `activeTool` prop says "some placement tool"; the
     * store's real `activeTool` says which. Returns `'none'` when the contact is not the
     * markup layer's (the dimension machine and the object-first drag keep their paths).
     */
    const markupPointerDown = (
      imagePoint: Px,
      pointerType: string,
      pressure: number,
      contact: Contact,
    ): 'consume' | 'pan' | 'none' => {
      const id = toolIdRef.current;
      if (id === 'select') {
        // Only handle drags are routed here; taps/marquee keep the existing path.
        return selectRef.current?.hitHandleAt(imagePoint, pointerType)
          ? selectRef.current!.onPointerDown(imagePoint, pointerType)
          : 'none';
      }
      const shape = shapeToolsRef.current.get(id as ShapeKind);
      if (shape) return shape.onPointerDown(imagePoint, pointerType);
      if (id === 'angle') return angleRef.current!.onPointerDown(imagePoint, pointerType);
      if (id === 'text') return textRef.current!.onPointerDown(imagePoint);
      if (id === 'erase') {
        const erase = eraseRef.current!;
        // Object mode (the only mode touch gets): the `--err` preview is driven by the
        // shell's 600 ms timer (A3), not shown eagerly. Stroke mode (pen) is unchanged.
        if (effectiveEraseMode(erase.eraseMode, pointerType) === 'object') {
          contact.eraseObject = true;
          return 'consume';
        }
        return erase.onPointerDown(imagePoint, pointerType);
      }
      if (id === 'inset') {
        // The tool returns `'pan'` for a non-handle contact, but its TAP must still reach
        // `onPointerUp` (the one-tap insert). Take the contact; a real drag is released
        // back to the pan path by `onPointerMove` returning `'pan'`.
        insetRef.current!.onPointerDown(imagePoint, pointerType);
        return 'consume';
      }
      if (id === 'freehand' || id === 'highlight') {
        const ink = id === 'freehand' ? freehandRef.current! : highlightRef.current!;
        if (id === 'freehand' && pointerType === 'touch' && !isFingerInkAllowed(mkSettings())) {
          return 'pan';
        }
        if (ink.usePlacementMachine(pointerType)) {
          return ink.placement().onPointerDown(imagePoint, pointerType);
        }
        ink.begin(imagePoint, pressure, pointerType);
        contact.freehandKind = id;
        return 'consume';
      }
      return 'none';
    };

    const markupPointerMove = (imagePoint: Px, moved: boolean): 'consume' | 'pan' | null => {
      const id = toolIdRef.current;
      const shape = shapeToolsRef.current.get(id as ShapeKind);
      if (shape) return shape.onPointerMove(imagePoint, moved);
      if (id === 'angle') return angleRef.current!.onPointerMove(imagePoint);
      if (id === 'erase') return eraseRef.current!.onPointerMove();
      if (id === 'select') return selectRef.current!.onPointerMove(imagePoint, moved);
      if (id === 'inset') return insetRef.current!.onPointerMove(imagePoint, moved);
      if (id === 'text') return textRef.current!.onPointerMove();
      return null;
    };

    const markupPointerUp = (imagePoint: Px, tapped: boolean, pointerType: string): void => {
      const id = toolIdRef.current;
      const shape = shapeToolsRef.current.get(id as ShapeKind);
      if (shape) {
        shape.onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'angle') {
        angleRef.current!.onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'erase') {
        eraseRef.current!.onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'select') {
        selectRef.current!.onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'inset') {
        insetRef.current!.onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'freehand' || id === 'highlight') {
        const ink = id === 'freehand' ? freehandRef.current! : highlightRef.current!;
        if (ink.usePlacementMachine(pointerType)) ink.placement().onPointerUp(imagePoint, tapped, pointerType);
        return;
      }
      if (id === 'text') textRef.current!.onPointerUp();
    };

    const onPointerDown = (e: PointerEvent): void => {
      const point = canvas.pointerPosition(e);
      setInputKind(e.pointerType);
      if (e.pointerType === 'pen') router.notePenEvent();
      if (e.pointerType === 'touch') {
        router.noteTouchDown(e.pointerId, isAtEdge(point, host));
      }
      const intent = router.classify(e);
      const panTool = activeToolRef.current === 'pan';
      const hit = canvas.hitObject(point);
      const dragSession: DragSession = {
        target: decideDragTarget({ panTool, intent, hit }),
        preDragPosition: null,
      };
      const contact: Contact = {
        intent,
        session: dragSession,
        start: point,
        startImage: { x: 0, y: 0 },
        startAt: performance.now(),
        last: point,
        toolAction: 'none',
        forcePan: false,
        objectKey: null,
        freehandKind: null,
        owner: null,
        pressure: e.pressure,
        marqueeCandidate: false,
        longPressTimer: null,
        eraseObject: false,
        eraseMoved: false,
        eraseTimer: null,
      };
      contacts.set(e.pointerId, contact);

      const imagePoint = canvas.screenToImage(point);
      contact.startImage = { ...imagePoint };
      const keypadOpen = useEditorStore.getState().keypadOpen;

      // Select + a real object + long press (600 ms) → select and pin the mini-toolbar
      // (touch model §3.3). Locked objects only shake + toast; they never pin.
      if (intent !== 'ignore' && !keypadOpen && toolIdRef.current === 'select' && hit) {
        const key = scene.keyForAnnotationId(hit.id);
        if (key && hit.locked) {
          emitToast(STRINGS.editor.lockedToast);
        } else if (key) {
          contact.longPressTimer = window.setTimeout(() => {
            contact.longPressTimer = null;
            selectRef.current?.longPress(key);
          }, LONG_PRESS_MS);
        }
      }

      // Select on EMPTY canvas with a non-touch pointer (pen/mouse) is a marquee
      // candidate; touch keeps one-finger pan (tests/sheetEditor.browser F1). It only
      // becomes a marquee once the contact actually moves (so taps still clear/double-tap).
      if (
        intent !== 'ignore' &&
        !keypadOpen &&
        toolIdRef.current === 'select' &&
        !hit &&
        e.pointerType !== 'touch'
      ) {
        contact.marqueeCandidate = true;
      }

      // Keypad-open (touch model §5.1): pan + pinch only; taps do nothing.
      if (keypadOpen) {
        contact.forcePan = true;
        contact.session.target = 'pan';
      } else if (
        intent !== 'ignore' &&
        toolIdRef.current === 'select' &&
        selectRef.current?.hitHandleAt(imagePoint, e.pointerType)
      ) {
        selectRef.current.onPointerDown(imagePoint, e.pointerType);
        contact.toolAction = 'consume';
        contact.forcePan = true;
        contact.owner = 'markup';
      } else if (intent !== 'ignore' && placementArmed()) {
        const dispatched = markupPointerDown(imagePoint, e.pointerType, e.pressure, contact);
        if (dispatched !== 'none') {
          contact.toolAction = dispatched;
          contact.forcePan = true;
          contact.owner = 'markup';
          if (dispatched === 'pan') contact.session.target = 'pan';
        } else {
          // The dimension machine (the coarse `'place'` prop's original owner).
          const action = tool.onPointerDown(imagePoint, e.pointerType);
          contact.toolAction = action;
          contact.forcePan = true;
          contact.owner = 'dimension';
          if (action === 'pan') contact.session.target = 'pan';
        }
      } else if (intent !== 'ignore' && tool.state.phase !== 'idle') {
        const action = tool.onPointerDown(imagePoint, e.pointerType);
        contact.toolAction = action;
        contact.forcePan = true;
        contact.owner = 'dimension';
        if (action === 'pan') contact.session.target = 'pan';
      } else if (contact.session.target === 'object' && hit) {
        const key = scene.keyForAnnotationId(hit.id);
        const geometry = key ? scene.geometryCopy(key) : null;
        const bounds = key ? scene.boundsAt(key) : null;
        if (key && geometry && bounds) {
          contact.objectKey = key;
          objectDrags.set(e.pointerId, {
            key,
            geometry,
            startImage: imagePoint,
          });
          // D63: record the pre-drag position for the second-finger restore.
          contact.session.preDragPosition = canvas.imageToScreen({ x: bounds.x, y: bounds.y });
        }
      }

      // Erase object mode (A3): reveal the `--err` outline only after a 600 ms hold.
      if (contact.eraseObject) {
        contact.eraseTimer = window.setTimeout(() => {
          contact.eraseTimer = null;
          eraseRef.current?.beginPreview(imagePoint);
        }, LONG_PRESS_MS);
      }

      if (contacts.size >= 2) {
        for (const [pointerId, other] of contacts) {
          const resolution = onSecondFinger(other.session);
          if (!resolution.cancelled) continue;
          // D63 — restore the object's pre-drag position; never commit at the displaced spot.
          const drag = objectDrags.get(pointerId);
          if (drag) {
            scene.setGeometry(drag.key, drag.geometry);
            objectDrags.delete(pointerId);
          }
          other.session.target = 'pan';
          other.forcePan = true;
          other.toolAction = 'none';
        }
      }
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is a nicety; the handlers still work without it.
      }
    };

    const onPointerMove = (e: PointerEvent): void => {
      const contact = contacts.get(e.pointerId);
      if (!contact) return;
      const point = canvas.pointerPosition(e);
      const imagePoint = canvas.screenToImage(point);
      const moved = Math.hypot(point.x - contact.start.x, point.y - contact.start.y) > TAP_SLOP;

      if (contact.freehandKind) {
        const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
        ink.extend(imagePoint, e.pressure);
        contact.last = point;
        return;
      }

      // Any real movement cancels a pending select long-press (A2).
      if (contact.longPressTimer !== null && moved) {
        window.clearTimeout(contact.longPressTimer);
        contact.longPressTimer = null;
      }

      // Erase object mode (A3): moving beyond the slop cancels the preview and the delete.
      if (contact.eraseObject) {
        if (moved && !contact.eraseMoved) {
          contact.eraseMoved = true;
          if (contact.eraseTimer !== null) {
            window.clearTimeout(contact.eraseTimer);
            contact.eraseTimer = null;
          }
          eraseRef.current?.onPointerCancel();
        }
        contact.last = point;
        return;
      }

      if (contact.toolAction !== 'none') {
        const markupAction =
          contact.owner === 'markup' ? markupPointerMove(imagePoint, moved) : null;
        const action = markupAction ?? tool.onPointerMove(imagePoint, moved);
        if (action === 'consume') {
          contact.last = point;
          return;
        }
        contact.toolAction = 'none';
        contact.session.target = 'pan';
      }

      // Select marquee: arm the tool on the first real move across empty canvas (A2).
      // Arming on move (not down) keeps a tap's clear-selection/double-tap intact.
      if (
        contact.toolAction === 'none' &&
        contact.marqueeCandidate &&
        moved &&
        toolIdRef.current === 'select'
      ) {
        const select = selectRef.current;
        if (select) {
          select.onPointerDown(contact.startImage, e.pointerType);
          select.onPointerMove(imagePoint, true);
          contact.toolAction = 'consume';
          contact.forcePan = true;
          contact.owner = 'markup';
          contact.last = point;
          return;
        }
      }

      if (contacts.size === 1) {
        if (contact.session.target === 'pan' && (contact.forcePan || !placementPendingRef.current)) {
          canvas.panBy(point.x - contact.last.x, point.y - contact.last.y);
        } else if (
          contact.session.target === 'object' &&
          !placementPendingRef.current &&
          contact.objectKey
        ) {
          const drag = objectDrags.get(e.pointerId);
          if (drag) {
            const dx = imagePoint.x - drag.startImage.x;
            const dy = imagePoint.y - drag.startImage.y;
            scene.setGeometry(drag.key, translateGeometry(drag.geometry, dx, dy));
          }
        }
      }
      contact.last = point;
    };

    const endContact = (e: PointerEvent): void => {
      const contact = contacts.get(e.pointerId);
      if (!contact) return;
      const point = canvas.pointerPosition(e);
      const imagePoint = canvas.screenToImage(point);
      const duration = performance.now() - contact.startAt;
      const tapped = isTap(point.x - contact.start.x, point.y - contact.start.y, duration);
      contacts.delete(e.pointerId);
      if (e.pointerType === 'pen') router.penStrokeEnd();
      if (e.pointerType === 'touch') router.noteTouchUp(e.pointerId);

      // Clear any pending select long-press.
      if (contact.longPressTimer !== null) {
        window.clearTimeout(contact.longPressTimer);
        contact.longPressTimer = null;
      }

      // The tool owns this contact's lift (commit B / end refine).
      if (contact.freehandKind) {
        const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
        ink.end(tapped);
        return;
      }

      // Erase object mode (A3): a short press deletes and toasts; a 600 ms hold (preview)
      // or a move cancels. The tool's own `onPointerUp` already owns the delete + toast.
      if (contact.eraseObject) {
        if (contact.eraseTimer !== null) {
          window.clearTimeout(contact.eraseTimer);
          contact.eraseTimer = null;
        }
        const erase = eraseRef.current;
        if (erase) {
          if (!contact.eraseMoved && !isErasePreview(duration)) {
            erase.beginPreview(imagePoint);
            erase.onPointerUp(imagePoint, true, e.pointerType);
          } else {
            erase.onPointerCancel();
          }
        }
        return;
      }

      if (contact.toolAction === 'consume') {
        if (contact.owner === 'markup') markupPointerUp(imagePoint, tapped, e.pointerType);
        else tool.onPointerUp(imagePoint, tapped, e.pointerType);
        return;
      }

      // Object-first move: commit one undo step, or treat a tap as a selection.
      if (contact.objectKey) {
        const drag = objectDrags.get(e.pointerId);
        objectDrags.delete(e.pointerId);
        if (drag) {
          const dx = imagePoint.x - drag.startImage.x;
          const dy = imagePoint.y - drag.startImage.y;
          const to = translateGeometry(drag.geometry, dx, dy);
          // F6: the pointermove path already mutated the geometry on EVERY move,
          // including moves below the 8 px tap slop. Record a step whenever the geometry
          // ACTUALLY changed (pre-drag vs. current), not only once `drag.moved` cleared
          // the slop — otherwise the mutation is persisted but unreachable by history,
          // and the first undo deletes the object instead of restoring it. A contact
          // that never moved keeps the tap/selection behaviour and creates no step.
          const current = scene.geometryCopy(drag.key);
          const changed =
            current !== null && JSON.stringify(current) !== JSON.stringify(drag.geometry);
          if (changed) {
            history.exec({
              label: STRINGS.toasts.actionMoveDimension,
              do: () => scene.setGeometry(drag.key, to),
              undo: () => scene.setGeometry(drag.key, drag.geometry),
            });
          } else if (tapped) {
            // A second tap on an already-selected object opens its actions (A2). For an
            // inset it enters Focus (UI §9:588/627).
            if (selectRef.current?.tapObject(drag.key) === 'action') {
              if (sceneRef.current?.get(drag.key)?.type === 'image') insetRef.current?.enterFocus(drag.key);
              else setPinnedToolbar(true);
            }
          }
        }
      }

      if (!tapped || contact.intent === 'ignore') return;
      if (contact.toolAction !== 'none') return;
      if (placementArmed()) return; // a tap would place a point — never deferred

      // Select tool: tap an object selects it (locked objects only toast); empty clears.
      if (activeToolRef.current === 'select') {
        const hit = canvas.hitObject(point);
        const key = hit ? scene.keyForAnnotationId(hit.id) : null;
        if (key) {
          // A locked object already toasted on pointerdown (touch model §3.3 shake);
          // selecting it is still allowed so it can be unlocked in Layers.
          if (selectRef.current?.tapObject(key) === 'action') {
            if (sceneRef.current?.get(key)?.type === 'image') insetRef.current?.enterFocus(key);
            else setPinnedToolbar(true);
          }
          return;
        }
        useEditorStore.getState().clearSelection();
        setPinnedToolbar(false);
      }

      const now = performance.now();
      if (
        lastTap &&
        now - lastTap.at <= DOUBLE_TAP_MS &&
        Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) <= DOUBLE_TAP_SLOP
      ) {
        lastTap = null;
        canvas.toggleFitOrFull();
      } else {
        lastTap = { point, at: now };
      }
    };

    const cancelContact = (e: PointerEvent): void => {
      const contact = contacts.get(e.pointerId);
      if (!contact) return;
      contacts.delete(e.pointerId);
      objectDrags.delete(e.pointerId);
      if (e.pointerType === 'pen') router.penStrokeEnd();
      if (e.pointerType === 'touch') router.noteTouchUp(e.pointerId);
      if (contact.longPressTimer !== null) {
        window.clearTimeout(contact.longPressTimer);
        contact.longPressTimer = null;
      }
      if (contact.eraseTimer !== null) {
        window.clearTimeout(contact.eraseTimer);
        contact.eraseTimer = null;
      }
      if (contact.eraseObject) {
        eraseRef.current?.onPointerCancel();
        return;
      }
      if (contact.freehandKind) {
        const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
        ink.cancel();
        return;
      }
      if (contact.toolAction !== 'none') {
        if (contact.owner === 'markup') cancelActiveMarkup();
        else tool.onPointerCancel(e.pointerType);
      }
    };

    const markupToolPending = (): boolean => {
      for (const shape of shapeToolsRef.current.values()) if (shape.pending) return true;
      return Boolean(
        angleRef.current?.pending ||
          freehandRef.current?.pending ||
          highlightRef.current?.pending ||
          textRef.current?.pending ||
          eraseRef.current?.pending ||
          insetRef.current?.pending,
      );
    };

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

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endContact);
    host.addEventListener('pointercancel', cancelContact);
    window.addEventListener('keydown', onKeyDown);

    void (async () => {
      try {
        registerOpenProject(projectId, folderName);
        const lease = await acquireWriterLease(projectId);
        if (!alive) {
          lease?.release();
          return;
        }
        leaseRef.current = lease;
        setReadOnly(!lease);
        channelRef.current = openProjectChannel(projectId);

        const projectDir = await resolveOpenProjectDir(projectId);
        await cleanStaleTmp(projectDir, projectId);
        const file = await readProjectFile(projectDir);
        if (!alive) return;
        projectDirRef.current = { dir: projectDir, file };

        const sheets = file.sheets.filter((s) => !s.deletedAt);
        setSheetCount(sheets.length);
        if (sheets.length === 0) {
          setStatus('empty');
          return;
        }
        const sheet = (sheetId ? sheets.find((s) => s.id === sheetId) : undefined) ?? sheets[0];
        setSheetTitle(sheet.title);
        const loaded = await loadSheet(canvas, projectDir, sheet);
        if (!alive) return;
        setStatus(loaded);
      } catch {
        if (alive) setStatus('error');
      }
    })();

    return () => {
      alive = false;
      resizeObserver.disconnect();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', endContact);
      host.removeEventListener('pointercancel', cancelContact);
      window.removeEventListener('keydown', onKeyDown);
      unsubscribeCtx();
      unsubscribeTool();
      unsubscribeSelection();
      unsubscribeFocus();
      setEditorSession(null);
      // Land any coalesced markup write before the scene is torn down.
      void persist.flush();
      scene.onChange = null;
      persistRef.current = null;
      sheetIdRef.current = null;
      for (const shape of shapeToolsRef.current.values()) shape.dispose();
      shapeToolsRef.current.clear();
      angleRef.current?.dispose();
      angleRef.current = null;
      freehandRef.current?.dispose();
      freehandRef.current = null;
      highlightRef.current?.dispose();
      highlightRef.current = null;
      textRef.current?.dispose();
      textRef.current = null;
      eraseRef.current?.dispose();
      eraseRef.current = null;
      selectRef.current?.dispose();
      selectRef.current = null;
      insetRef.current?.dispose();
      insetRef.current = null;
      insetAssetsRef.current.dispose();
      schedulerRef.current?.cancel();
      schedulerRef.current = null;
      channelRef.current?.close();
      channelRef.current = null;
      leaseRef.current?.release();
      leaseRef.current = null;
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
      clearOpenProject(projectId);
    };
  }, [projectId, folderName, retryToken, sheetId]);

  // --- keypad focus management (a11y §19.6) -------------------------------------
  const keypadOpen = keypadRequest !== null;
  useEffect(() => {
    if (!keypadOpen) return;
    const mount = keypadMountRef.current;
    const focusables = (): HTMLElement[] =>
      Array.from(
        mount?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dimRef.current?.cancelValue();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      hostRef.current?.focus();
    };
  }, [keypadOpen]);

  // ---- slice 1.7 (image insets): asset decode, picker callbacks, Focus, replace ----
  const focusInsetId = useEditorStore((s) => s.focusInsetId);

  const syncRecents = (): void => {
    setInsetRecents(insetAssetsRef.current.recentsList());
  };

  /**
   * Decode + cache one stored asset (`assets/<sha256hex>.jpg`). Off the main thread via
   * the shipped decode worker; a miss is swallowed (the placeholder stays).
   */
  async function ensureInsetAsset(assetId: string, name?: string): Promise<void> {
    const state = projectDirRef.current;
    if (!state || insetAssetsRef.current.has(assetId)) return;
    const entry = await insetAssetsRef.current.load(state.dir, assetId, name);
    if (entry) sceneRef.current?.refreshInsets();
    syncRecents();
  }

  /** §8.5: a restored `markup.json` may already contain insets — decode their assets. */
  async function hydrateInsetAssets(objects: readonly Annotation[]): Promise<void> {
    const state = projectDirRef.current;
    if (!state) return;
    const ids = new Set<string>();
    for (const object of objects) {
      if (object.type === 'image' && object.assetId) ids.add(object.assetId);
    }
    for (const id of ids) await ensureInsetAsset(id);
  }

  /** Store + decode every picked file, then insert them as one cascaded batch. */
  async function placePickedFiles(files: File[]): Promise<void> {
    const state = projectDirRef.current;
    if (!state) return;
    const assets: InsetAssetInput[] = [];
    for (const file of files) {
      let stored: { assetId: string; width: number; height: number };
      try {
        stored = await storeInsetAsset(state.dir, projectId, file);
      } catch {
        continue;
      }
      // Decode the STORED bytes (normalized JPEG), not the picked file (may be HEIC).
      await ensureInsetAsset(stored.assetId, file.name);
      assets.push({ assetId: stored.assetId, width: stored.width, height: stored.height });
    }
    syncRecents();
    if (assets.length > 0) insetRef.current?.placeFromAssets(assets);
  }

  const handleInsetDeviceChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void placePickedFiles(files);
  };

  const handleInsetCameraChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) void placePickedFiles([file]);
  };

  const pickRecent = (assetId: string): void => {
    void (async () => {
      let size = insetAssetsRef.current.sizeOf(assetId);
      if (!size) {
        await ensureInsetAsset(assetId);
        size = insetAssetsRef.current.sizeOf(assetId);
      }
      if (!size) return;
      insetRef.current?.placeFromAssets([{ assetId, width: size.width, height: size.height }]);
    })();
  };

  const enterFocusInset = (key: string): void => {
    // Inside Focus the user draws with any markup tool; the Inset tool is unavailable.
    useEditorStore.getState().setActiveTool('select');
    insetRef.current?.enterFocus(key);
  };

  /** Exits Focus WITHOUT touching the selection (UI §9:633 / the 1.7 gate). */
  const exitFocusInset = (): void => {
    insetRef.current?.exitFocus();
    useEditorStore.getState().setFocusInsetId(null);
  };

  const cancelReplacePrompt = (): void => {
    cancelReplaceHold();
    setReplacePrompt(null);
  };

  const applyReplace = (choice: 'keep' | 'remove'): void => {
    const prompt = replacePrompt;
    if (!prompt) return;
    insetRef.current?.replacePhoto(prompt.key, prompt.asset, choice);
    setReplacePrompt(null);
  };

  const startReplaceHold = (): void => {
    if (replaceHoldTimerRef.current !== null) return;
    setReplaceHolding(true);
    replaceHoldTimerRef.current = window.setTimeout(() => {
      replaceHoldTimerRef.current = null;
      setReplaceHolding(false);
      applyReplace('remove');
    }, LONG_PRESS_MS);
  };

  function cancelReplaceHold(): void {
    if (replaceHoldTimerRef.current !== null) {
      window.clearTimeout(replaceHoldTimerRef.current);
      replaceHoldTimerRef.current = null;
    }
    setReplaceHolding(false);
  }

  const handleReplaceChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) void beginReplace(file);
  };

  /** Replace-photo: identical dimensions swap silently; a different size warns. */
  async function beginReplace(file: File): Promise<void> {
    const state = projectDirRef.current;
    const scene = sceneRef.current;
    const key = useEditorStore.getState().selection[0];
    if (!state || !scene || !key) return;
    const ann = scene.get(key);
    if (!ann || ann.type !== 'image') return;
    let stored: { assetId: string; width: number; height: number };
    try {
      stored = await storeInsetAsset(state.dir, projectId, file);
    } catch {
      return;
    }
    await ensureInsetAsset(stored.assetId, file.name);
    syncRecents();
    const newAsset: InsetAssetInput = {
      assetId: stored.assetId,
      width: stored.width,
      height: stored.height,
    };
    const oldAsset = insetAssetsRef.current.sizeOf(ann.assetId ?? '') ?? { width: 0, height: 0 };
    if (replacePhotoDecision(oldAsset, newAsset) === 'swap') {
      insetRef.current?.replacePhoto(key, newAsset, 'keep');
    } else {
      setReplacePrompt({ key, asset: newAsset });
    }
  }

  // The warned Replace-photo dialog is a real modal (§19.6): focus in on open, back on
  // close, Escape cancels (never a keyboard trap). Mirrors the keypad-sheet pattern.
  const replaceOpen = replacePrompt !== null;
  useEffect(() => {
    if (!replaceOpen) return;
    const first = document.querySelector<HTMLElement>('[data-replace-photo] [data-replace-default]');
    first?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelReplacePrompt();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceOpen]);

  // ---- actions ------------------------------------------------------------------
  async function loadSheet(
    canvas: EditorCanvas,
    projectDir: FileSystemDirectoryHandle,
    sheet: SheetFile,
  ): Promise<EditorStatus> {
    const sheetDir = await resolveSheetDir(projectDir, sheet.id);
    if (await isPhotoDamaged(sheetDir)) return 'damaged';
    try {
      const handle = await sheetDir.getFileHandle('photo.jpg', { create: false });
      const file = await handle.getFile();
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      const width = sheet.imageWidth || bitmap.width;
      const height = sheet.imageHeight || bitmap.height;
      canvas.setPhoto(bitmap, width, height);
      canvas.fit();
      // Restore this sheet's markup (D70). The scene is cleared for the new sheet first,
      // then re-populated; `sheetIdRef` gates the persistence seam so the restore itself
      // never queues a redundant write.
      sheetIdRef.current = null;
      const markup = await readSheetMarkup(projectDir, sheet.id, () => ({
        schemaVersion: 1,
        sheetId: sheet.id,
        objects: [],
      }));
      sceneRef.current?.load(markup.objects);
      sheetIdRef.current = sheet.id;
      // §8.5: a restored sheet may already contain insets. Decode their assets off the
      // main thread and refresh so the placeholder is replaced (never left blank).
      void hydrateInsetAssets(markup.objects);
      return 'ready';
    } catch {
      return 'damaged';
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !canvasRef.current) return;
    const canvas = canvasRef.current;
    setBusy(true);
    try {
      const state = projectDirRef.current;
      if (!state) throw new Error('project is not open');
      const exif = await readExifInfo(file);
      const normalized = await normalizeImage(file);
      const now = new Date();
      const { sheet, projectFile: nextFile, sheetDir } = await addSheetFromPhoto(
        { blob: normalized.blob, width: normalized.width, height: normalized.height },
        {
          projectDir: state.dir,
          projectFile: state.file,
          projectId,
          title: defaultSheetTitle(state.file),
          createdAt: exif.captureTime ?? now,
        },
      );
      state.file = nextFile;

      schedulerRef.current?.cancel();
      schedulerRef.current = createThumbnailScheduler({
        write: (blob) => writeAtomic(sheetDir, 'thumb.jpg', blob, projectId),
      });
      schedulerRef.current.schedule(normalized.blob);

      const bitmap = await createImageBitmap(normalized.blob, { imageOrientation: 'from-image' });
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      canvas.setPhoto(bitmap, normalized.width, normalized.height);
      canvas.fit();
      setSheetTitle(sheet.title);
      setSheetCount(nextFile.sheets.filter((s) => !s.deletedAt).length);
      setStatus('ready');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  const retry = (): void => {
    setStatus('loading');
    setRetryToken((n) => n + 1);
  };

  // ---- slice 1.6 sheet/HUD handlers ------------------------------------------
  const commitText = (): void => {
    if (textAnchor) textRef.current?.commit(textDraft);
    setTextAnchor(null);
    setTextDraft('');
    useEditorStore.getState().setPendingOp('none');
  };
  const cancelText = (): void => {
    textRef.current?.cancel();
    setTextAnchor(null);
    setTextDraft('');
    useEditorStore.getState().setPendingOp('none');
  };
  const commitAngle = (chain: boolean): void => {
    const request = angleSheet;
    if (!request) return;
    angleRef.current?.commitValue({
      valueDeg: request.degrees,
      enteredText: request.degrees.toFixed(1),
      chain,
    });
    setAngleSheet(null);
    useEditorStore.getState().setKeypadOpen(false);
  };
  const cancelAngle = (): void => {
    angleRef.current?.cancelValue();
    setAngleSheet(null);
    useEditorStore.getState().setKeypadOpen(false);
  };

  const eraseAvailable = activeToolId === 'erase';
  const strokeMode = strokeModeAvailable(inputKind ?? 'pen');

  // ---- slice 1.6 wiring: Layers flyout + select mini-toolbar ------------------
  const labelCtx = { unitSystem, unitFormat, precisionDenominator };
  const layerRows = sceneRef.current
    ? buildLayerRows(sceneRef.current.list(), { ctx: labelCtx, hasPhoto: status === 'ready' })
    : [];

  const panelSelect = (key: string): void => {
    if (key === PHOTO_ROW_KEY) return;
    useEditorStore.getState().setSelection([key]);
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const bounds = scene.boundsAt(key);
    if (!bounds) return;
    const scale = canvas.scale;
    canvas.stage.position({
      x: canvas.stage.width() / 2 - (bounds.x + bounds.width / 2) * scale,
      y: canvas.stage.height() / 2 - (bounds.y + bounds.height / 2) * scale,
    });
    canvas.stage.batchDraw();
  };

  const panelToggleVisible = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const next = ann.visible === false; // hidden → show, otherwise hide
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.layers.actionToggleVisible} ${name}`.trim(),
      do: () => scene.setVisible(key, next),
      undo: () => scene.setVisible(key, !next),
    });
    setSceneTick((n) => n + 1); // refresh the row/eye regardless of the persistence seam
  };

  const panelToggleLock = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const next = !ann.locked;
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.layers.actionToggleLock} ${name}`.trim(),
      do: () => scene.setLocked(key, next),
      undo: () => scene.setLocked(key, !next),
    });
    setSceneTick((n) => n + 1);
  };

  /**
   * The Layers panel's reorder seam. `toIndex` is the panel's rest index INSIDE the row's
   * own group block (front-first, after the dragged row is removed) — the contract of
   * `LayersPanel.resolveDrop`, the row menu and `Alt`+`Arrow` (`onReorder(key, toIndex)`).
   *
   * TRANSLATION (the crux). The panel's groups (`layerGroupFor` → dimensions|shapes|ink|
   * text|insets|photo) are finer than §20.2's two z-bands, so the index cannot be handed
   * to the scene as-is. Re-express it as an ANCHOR ROW of the same block:
   *   - `toIndex < reduced.length`: anchor on the row currently at that index; the dragged
   *     row is placed immediately IN FRONT of it, so it comes to rest at `toIndex` and the
   *     anchor moves one slot back. Because the anchor is a row of the SAME group, a row
   *     dragged to the top of its group can never jump over another group's rows (the
   *     defect this replaces: the old index-based primitive read `toIndex` in band space,
   *     so with ≥2 groups in a band the row landed in the wrong slot).
   *   - `toIndex >= reduced.length`: "at/after the end of the group" → the back of it.
   * If the scene refuses (the anchor is in the other §20.2 band) nothing has changed and we
   * raise the same approved copy the panel itself uses. That path exists because a single
   * `ink` block spans `freehand` (main band) and `highlight` (lower band).
   */
  const panelReorder = (key: string, toIndex: number): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const block = blockFor(layerRows, key);
    if (!block) return;
    const reduced = block.rows.filter((r) => r.key !== key);
    if (reduced.length === 0) return; // nothing else in the group to reorder against

    // Snapshot both sides through serialize/load so undo restores the exact z-order.
    const before = scene.serialize();
    const applied =
      toIndex >= reduced.length
        ? scene.moveInBandToBack(key)
        : scene.moveInBandBefore(key, reduced[Math.max(0, toIndex)].key);
    if (!applied) {
      // §20.2: cross-band target — change nothing, say why (never apply the drop).
      emitToast(STRINGS.editor.highlighterBandMessage);
      return;
    }
    const after = scene.serialize();
    if (JSON.stringify(after) === JSON.stringify(before)) {
      // A legal but no-op reorder (e.g. dropping a row onto the row directly behind it):
      // leave the document alone and do not fabricate an undo step.
      setSceneTick((n) => n + 1);
      return;
    }
    history.exec({
      label: annotationName(ann, labelCtx),
      do: () => scene.load(after),
      undo: () => scene.load(before),
    });
    setSceneTick((n) => n + 1);
  };

  const panelRename = (key: string, name: string): void => {
    // Annotations carry no name field (AGENTS #2): a documented no-op. The editable
    // title lives on `SheetFile.title`, never on an annotation. Reported as owed.
    sceneRef.current?.rename(key, name);
  };

  const panelDelete = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const snapshot = JSON.parse(JSON.stringify(ann)) as Annotation;
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.select.delete} ${name}`.trim(),
      do: () => scene.removeObject(key),
      undo: () => scene.addAnnotation(snapshot),
    });
    setSceneTick((n) => n + 1);
  };

  const closeLayers = (): void => {
    useEditorStore.getState().setLayersOpen(false);
  };

  const toolbarRotate = (deg: number): void => {
    selectRef.current?.rotateBy(deg);
  };

  const toolbarDelete = (): void => {
    selectRef.current?.deleteSelection();
    setPinnedToolbar(false);
  };

  const toolbarToggleLock = (): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history) return;
    const keys = useEditorStore.getState().selection;
    if (keys.length === 0) return;
    const captures = keys
      .map((k) => scene.get(k))
      .filter((a): a is Annotation => Boolean(a))
      .map((a) => ({ key: a.id, locked: a.locked, name: annotationName(a, labelCtx) }));
    if (captures.length === 0) return;
    const next = !captures[0].locked;
    history.exec({
      label: `${STRINGS.layers.actionToggleLock} ${captures[0].name}`.trim(),
      do: () => captures.forEach((c) => scene.setLocked(c.key, next)),
      undo: () => captures.forEach((c) => scene.setLocked(c.key, c.locked)),
    });
  };

  const showMiniToolbar = pinnedToolbar && selection.length > 0 && !keypadOpen && activeToolId === 'select';

  // ---- slice 1.7 derived render state ----
  const focusedInsetAnn = focusInsetId ? sceneRef.current?.get(focusInsetId) : undefined;
  const breadcrumbText = focusInsetId
    ? t(STRINGS.inset.focusBreadcrumb, {
        sheetName: sheetTitle || STRINGS.editor.breadcrumbSheetSegment,
        insetName: focusedInsetAnn ? annotationName(focusedInsetAnn, labelCtx) : STRINGS.tool.imageInset,
      })
    : '';
  // Entry announces where you are (the breadcrumb); exit announces where you are now.
  const focusAnnouncement = focusInsetId ? breadcrumbText : status === 'ready' ? sheetTitle : '';
  const selectedInsetKey =
    selection.length === 1 && sceneRef.current?.get(selection[0])?.type === 'image'
      ? selection[0]
      : null;
  const showInsetActions = selectedInsetKey !== null && !focusInsetId && !keypadOpen;

  const placementAnnouncement =
    placement.phase === 'anchorA'
      ? STRINGS.placement.secondPoint
      : placement.phase === 'anchorB'
        ? STRINGS.placement.adjusting
        : placementArmedAnnouncement(activeTool);

  // ---- render -------------------------------------------------------------------
  return (
    <div className="editor">
      <div className="editor-stage" aria-busy={busy}>
        <div
          ref={hostRef}
          className="editor-canvas"
          role="application"
          aria-label={STRINGS.a11y.canvas}
          tabIndex={0}
          data-sheet-count={sheetCount}
          data-placement-phase={placement.phase}
        />

        <p className="visually-hidden" role="status" aria-live="polite">
          {placementAnnouncement}
        </p>

        {/* Focus mode announces entry/exit (§19.6). Entry: the breadcrumb; exit: the sheet. */}
        <p className="visually-hidden" role="status" aria-live="polite" data-testid="focus-announcement">
          {focusAnnouncement}
        </p>

        {/* Focus breadcrumb chip (UI §9:630). The path is a real control (tap to go up a
            level); `Done` is the approved exit. */}
        {focusInsetId ? (
          <div className="focus-breadcrumb" role="group" aria-label={STRINGS.a11y.breadcrumb}>
            <button
              type="button"
              className="focus-breadcrumb-path hit-slop"
              data-testid="focus-breadcrumb"
              aria-label={breadcrumbText}
              onClick={exitFocusInset}
            >
              {breadcrumbText}
            </button>
            <button
              type="button"
              className="focus-breadcrumb-done hit-slop"
              data-testid="focus-done"
              onClick={exitFocusInset}
            >
              {STRINGS.editor.done}
            </button>
          </div>
        ) : null}

        {/* Inset actions while a single inset is selected (2nd tap / Enter also enters
            Focus). `Replace photo` is the §8.5 M7 flow. */}
        {showInsetActions ? (
          <div className="placement-hud" role="toolbar" aria-label={STRINGS.tool.imageInset}>
            <button
              type="button"
              className="placement-hud-button"
              data-testid="inset-focus"
              onClick={() => selectedInsetKey && enterFocusInset(selectedInsetKey)}
            >
              {STRINGS.inset.focusControl}
            </button>
            <button
              type="button"
              className="placement-hud-button"
              data-testid="inset-replace"
              onClick={() => replacePhotoInputRef.current?.click()}
            >
              {STRINGS.inset.actionReplace}
            </button>
          </div>
        ) : null}

        {readOnly ? (
          <p className="editor-readonly" role="status">
            {STRINGS.project.readOnlyChip}
          </p>
        ) : null}

        {status === 'loading' ? (
          <p className="editor-panel" role="status">
            {STRINGS.home.loading}
          </p>
        ) : null}

        {status === 'empty' ? (
          <div className="editor-panel" role="status">
            <p>{STRINGS.project.noSheetsEmpty}</p>
            {!readOnly ? (
              <button
                type="button"
                className="btn btn-primary hit-slop"
                onClick={() => fileInputRef.current?.click()}
              >
                {STRINGS.capture.importAPhoto}
              </button>
            ) : null}
          </div>
        ) : null}

        {status === 'damaged' ? (
          <div className="editor-panel editor-panel-error" role="alert">
            <p>{STRINGS.errors.photoDamaged}</p>
            {!readOnly ? (
              <button
                type="button"
                className="btn btn-primary hit-slop"
                onClick={() => fileInputRef.current?.click()}
              >
                {STRINGS.capture.importAPhoto}
              </button>
            ) : null}
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="editor-panel editor-panel-error" role="alert">
            <p>{STRINGS.errors.projectUnavailable}</p>
            <button type="button" className="btn btn-secondary hit-slop" onClick={retry}>
              {STRINGS.errors.retry}
            </button>
          </div>
        ) : null}

        {/* Placement HUD (touch model §1.4): live during the settle window and after a
            cancelled auto-open, so `✓ Value` is always the explicit re-entry. */}
        {placement.phase === 'anchorB' && !keypadOpen ? (
          <div className="placement-hud" role="group" aria-label={STRINGS.placement.adjusting}>
            <button
              type="button"
              className="placement-hud-button"
              aria-label={STRINGS.a11y.close}
              onClick={() => dimRef.current?.cancelPending()}
            >
              ✕
            </button>
            <button
              type="button"
              className="placement-hud-button"
              onClick={() => dimRef.current?.adjustEndpoints()}
            >
              {STRINGS.placement.adjustEndpoints}
            </button>
            <button
              type="button"
              className="placement-hud-button placement-hud-primary"
              onClick={() => dimRef.current?.requestKeypad()}
            >
              {STRINGS.keypad.useThisValue}
            </button>
          </div>
        ) : null}

        {/* Polygon HUD (plan step 2): `«Undo point»` replaces Backspace, `✓ Done`
            (approved `editor.done`) replaces Enter — every control on screen. */}
        {activeToolId === 'polygon' && polygon ? (
          <div className="placement-hud" role="group" aria-label={STRINGS.tool.polygon}>
            <button
              type="button"
              className="placement-hud-button"
              onClick={() => shapeToolsRef.current.get('polygon')?.undoPoint()}
            >
              {STRINGS.placement.undoPoint}
            </button>
            <button
              type="button"
              className="placement-hud-button placement-hud-primary"
              onClick={() => shapeToolsRef.current.get('polygon')?.done()}
            >
              {`✓ ${STRINGS.editor.done}`}
            </button>
          </div>
        ) : null}

        {/* Erase panel (plan step 6 / touch model §4.1): under touch stroke-scope is
            hidden and the pen-required note is shown. */}
        {eraseAvailable ? (
          <div className="erase-panel" role="group" aria-label={STRINGS.tool.erase}>
            {strokeMode ? (
              <div className="erase-modes" role="radiogroup" aria-label={STRINGS.tool.erase}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={eraseMode === 'object'}
                  className={eraseMode === 'object' ? 'is-active' : undefined}
                  onClick={() => {
                    setEraseMode('object');
                    eraseRef.current?.setMode('object');
                  }}
                >
                  {STRINGS.erase.modeObject}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={eraseMode === 'stroke'}
                  className={eraseMode === 'stroke' ? 'is-active' : undefined}
                  onClick={() => {
                    setEraseMode('stroke');
                    eraseRef.current?.setMode('stroke');
                  }}
                >
                  {STRINGS.erase.modeStroke}
                </button>
              </div>
            ) : (
              <p className="erase-pen-note" role="note">
                {STRINGS.erase.strokeNeedsPen}
              </p>
            )}
          </div>
        ) : null}

        {/* Select mini-toolbar (touch model §3.3; plan step 7). Pinned by the 600 ms
            long-press; shown while a selection exists. Reuses the HUD slot — the CSP
            forbids inline styles, so it cannot carry a computed anchor (reported owed). */}
        {showMiniToolbar ? (
          <div
            className="placement-hud"
            role="toolbar"
            aria-label={STRINGS.tool.select}
            data-testid="mini-toolbar"
            data-pinned={pinnedToolbar ? 'true' : 'false'}
          >
            {ROTATE_STOPS.filter((deg) => deg !== 0).map((deg) => (
              <button
                key={deg}
                type="button"
                className="placement-hud-button"
                data-rotate={deg}
                aria-label={`${STRINGS.a11y.rotate} ${deg}°`}
                onClick={() => toolbarRotate(deg)}
              >
                {`${deg}°`}
              </button>
            ))}
            <button
              type="button"
              className="placement-hud-button"
              aria-label={STRINGS.select.lock}
              onClick={toolbarToggleLock}
            >
              {STRINGS.select.lock}
            </button>
            <button
              type="button"
              className="placement-hud-button placement-hud-primary"
              aria-label={STRINGS.select.delete}
              onClick={toolbarDelete}
            >
              {STRINGS.select.delete}
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          aria-label={STRINGS.capture.importAPhoto}
          onChange={(e) => void handleFile(e)}
        />

        {/* Inset sources: device (multi-select, §9:615) and a capture-capable camera
            input (the "Take a photo" row). Both route through `storeInsetAsset`. */}
        <input
          ref={insetDeviceInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          multiple
          data-testid="inset-device-input"
          aria-label={STRINGS.inset.chooseFromDevice}
          onChange={handleInsetDeviceChange}
        />
        <input
          ref={insetCameraInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="inset-camera-input"
          aria-label={STRINGS.inset.takePhoto}
          onChange={handleInsetCameraChange}
        />
        <input
          ref={replacePhotoInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          data-testid="inset-replace-input"
          aria-label={STRINGS.inset.actionReplace}
          onChange={handleReplaceChange}
        />

        <div className="zoom-pill" role="group" aria-label={STRINGS.a11y.zoom}>
          <button
            type="button"
            className="zoom-pill-button"
            aria-label={STRINGS.a11y.zoomOut}
            onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}
          >
            <Minus aria-hidden="true" />
          </button>
          <span className="zoom-pill-value mono">{t(STRINGS.editor.zoomPercent, { zoomPercent })}</span>
          <button
            type="button"
            className="zoom-pill-button"
            aria-label={STRINGS.a11y.zoomIn}
            onClick={() => canvasRef.current?.zoomBy(1.2)}
          >
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            className="zoom-pill-button zoom-pill-fit"
            aria-label={STRINGS.a11y.zoomFit}
            onClick={() => canvasRef.current?.fit()}
          >
            <Maximize aria-hidden="true" />
            <span>{STRINGS.editor.fit}</span>
          </button>
        </div>
      </div>

      {/* Layers flyout (slice 1.6 wiring, A1). Positioning wrapper only — the panel is
          `position: fixed` and supplies its own role="dialog"; adding a second dialog
          wrapper here would nest two same-named modals (the 1.5 integration defect). */}
      {layersOpen ? (
        <div ref={layersMountRef} data-testid="layers-panel-mount">
          <LayersPanel
            rows={layerRows}
            selectedKeys={selection}
            onSelect={panelSelect}
            onToggleVisible={panelToggleVisible}
            onToggleLock={panelToggleLock}
            onReorder={panelReorder}
            onRename={panelRename}
            onDelete={panelDelete}
            onClose={closeLayers}
          />
        </div>
      ) : null}

      {keypadOpen ? (
        // Positioning wrapper only. The sheet itself is the modal: it supplies
        // role="dialog" / aria-modal / its accessible name and owns the focus trap.
        // (A second dialog wrapper here would nest two same-named modals — an a11y
        // defect and an ambiguity for getByRole('dialog').)
        <div ref={keypadMountRef} className="keypad-sheet-mount" data-testid="keypad-sheet">
          <DimensionKeypadSheet
            precisionDenominator={precisionDenominator}
            initialValueMm={keypadRequest?.initialValueMm ?? null}
            onCommit={(result) => dimRef.current?.commitValue(result)}
            onCancel={() => dimRef.current?.cancelValue()}
          />
        </div>
      ) : null}

      {/* Angle commit sheet (plan step 3): `≈ 43.2°` readout, complement/supplement
          chips, chain. Opened by the tool's 450 ms settle rule. */}
      {angleSheet ? (
        <div className="keypad-sheet-mount" data-testid="angle-sheet">
          <div className="angle-sheet" role="dialog" aria-modal="true" aria-label={STRINGS.tool.angle}>
            <p className="angle-readout mono">
              {t(STRINGS.dimension.angleReadout, { angle: angleSheet.degrees.toFixed(1) })}
            </p>
            <div className="angle-chips">
              <button type="button" onClick={() => commitAngle(false)}>
                {t(STRINGS.dimension.complementChip, { angle: angleSheet.complement.toFixed(1) })}
              </button>
              <button type="button" onClick={() => commitAngle(false)}>
                {t(STRINGS.dimension.supplementChip, { angle: angleSheet.supplement.toFixed(1) })}
              </button>
            </div>
            <div className="angle-actions">
              <button type="button" className="btn btn-secondary hit-slop" onClick={cancelAngle}>
                {STRINGS.editor.cancel}
              </button>
              <button type="button" className="btn btn-secondary hit-slop" onClick={() => commitAngle(true)}>
                {STRINGS.keypad.chain}
              </button>
              <button type="button" className="btn btn-primary hit-slop" onClick={() => commitAngle(false)}>
                {STRINGS.editor.done}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Text entry sheet (plan step 4): tap-to-type at the anchor. */}
      {textAnchor ? (
        <div className="keypad-sheet-mount" data-testid="text-entry">
          <div className="text-entry" role="dialog" aria-modal="true" aria-label={STRINGS.tool.textNote}>
            <label className="visually-hidden" htmlFor="text-note-input">
              {STRINGS.tool.textNote}
            </label>
            <input
              id="text-note-input"
              className="text-entry-input"
              autoFocus
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText();
                else if (e.key === 'Escape') cancelText();
              }}
            />
            <div className="text-entry-actions">
              <button type="button" className="btn btn-secondary hit-slop" onClick={cancelText}>
                {STRINGS.editor.cancel}
              </button>
              <button type="button" className="btn btn-primary hit-slop" onClick={commitText}>
                {STRINGS.editor.done}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Image-inset picker (slice 1.7). Positioning wrapper ONLY — the sheet supplies its
          own role="dialog"/focus trap; a second dialog wrapper would nest two modals. */}
      {insetPickerOpen ? (
        <div className="inset-picker-mount" data-testid="inset-picker-mount">
          <ImageInsetPickerSheet
            recents={insetRecents}
            onPickCamera={() => insetCameraInputRef.current?.click()}
            onPickDevice={() => insetDeviceInputRef.current?.click()}
            onPickRecent={pickRecent}
            onCancel={() => insetRef.current?.cancelPicker()}
          />
        </div>
      ) : null}

      {/* Replace-photo warned dialog (§8.5 M7): different dimensions → explicit choice.
          A real modal: focus in on open, Escape cancels, hold-to-confirm on Remove. */}
      {replaceOpen ? (
        <div className="keypad-sheet-mount" data-testid="replace-photo-dialog">
          <div
            className="replace-photo"
            role="dialog"
            aria-modal="true"
            aria-label={STRINGS.inset.actionReplace}
            data-replace-photo=""
          >
            <p className="replace-photo-warn">{STRINGS.project.replacePhotoWarn}</p>
            <div className="replace-photo-actions">
              <button
                type="button"
                className="btn btn-secondary hit-slop"
                data-replace-default=""
                onClick={() => applyReplace('keep')}
              >
                {STRINGS.project.replacePhotoKeep}
              </button>
              <button
                type="button"
                className={`btn hit-slop ${replaceHolding ? 'is-holding' : 'btn-danger'}`}
                data-testid="replace-remove"
                aria-pressed={replaceHolding}
                onPointerDown={startReplaceHold}
                onPointerUp={cancelReplaceHold}
                onPointerLeave={cancelReplaceHold}
                onPointerCancel={cancelReplaceHold}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') startReplaceHold();
                }}
                onKeyUp={cancelReplaceHold}
              >
                {STRINGS.project.replacePhotoRemove}
              </button>
              <button
                type="button"
                className="btn btn-secondary hit-slop"
                onClick={cancelReplacePrompt}
              >
                {STRINGS.editor.cancel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function placementArmedAnnouncement(activeTool: EditorTool): string {
  return activeTool === 'place' ? STRINGS.placement.firstPoint : '';
}

function appLabelContext(): {
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
