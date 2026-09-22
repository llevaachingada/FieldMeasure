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
import type { Annotation, Geometry } from '@/domain/types';
import {
  EditorCanvas,
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
import { EraseTool, effectiveEraseMode, eraseNameKey, strokeModeAvailable, type EraseMode } from '@/editor/tools/EraseTool';
import { SelectTool } from '@/editor/tools/SelectTool';
import { setEditorSession, emitToast, type EditorSession } from '@/editor/session';
import { createPersistQueue, type PersistQueue } from '@/state/persistQueue';
import { HIGHLIGHT_CHISEL_TOUCH_MU } from '@/editor/tools/toolTypes';
import DimensionKeypadSheet from '@/ui/DimensionKeypadSheet';
import { useEditorStore } from '@/state/editorStore';
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
}

interface ObjectDrag {
  key: string;
  /** Geometry captured at drag start (any kind). */
  geometry: Geometry;
  startImage: Px;
  moved: boolean;
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
}: SheetEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const keypadMountRef = useRef<HTMLDivElement | null>(null);
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

  const [polygon, setPolygon] = useState<{ count: number } | null>(null);
  const [angleSheet, setAngleSheet] = useState<AngleSheetRequest | null>(null);
  const [textAnchor, setTextAnchor] = useState<Px | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [eraseMode, setEraseMode] = useState<EraseMode>('object');

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
  const activeToolId = useEditorStore((s) => s.activeTool);
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
      ctx: appLabelContext(),
      ghostText: STRINGS.dimension.ghostLabel,
    });
    sceneRef.current = scene;

    // ---- slice 1.6 step 9: markup.json persistence (the D70 carry-in) ----
    // The document is in memory only; this is the writer. Writes are coalesced 400 ms
    // and atomic (tmp → move) inside `persistQueue` / `writeJsonAtomic`, under the
    // per-project Web Lock, addressed by the D51 runtime key `projectId`.
    const persist = createPersistQueue({
      onStatus: (status) => useAppStore.getState().setStorageStatus(status),
    });
    persistRef.current = persist;
    scene.onChange = () => {
      const sid = sheetIdRef.current;
      if (!sid) return;
      persist.queueSheet(projectId, sid, scene.markupFile(sid, 1));
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
      scene,
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
      selectRef.current?.onToolChange();
    }

    for (const kind of ['line', 'arrow', 'rect', 'ellipse', 'polygon'] as ShapeKind[]) {
      const shape = new ShapeTool(kind, {
        canvas,
        scene,
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
      scene,
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
      scene,
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
      scene,
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
      scene,
      history,
      objectName: (ann) => eraseObjectName(ann),
      onDeleteToast: (name) => emitToast(t(STRINGS.toasts.undoAction, { actionName: `${STRINGS.select.delete} ${name}` })),
      onSnapshot: markupPending,
      labels: { delete: STRINGS.select.delete, split: STRINGS.toasts.actionSplitStroke },
    });

    selectRef.current = new SelectTool({
      canvas,
      scene,
      history,
      getSelection: () => useEditorStore.getState().selection,
      setSelection: (keys) => useEditorStore.getState().setSelection(keys),
      onSelectionChange: () => selectRef.current?.refresh(),
      onPinnedToolbar: () => undefined,
      labels: {
        move: STRINGS.toasts.actionMoveDimension,
        rotate: STRINGS.a11y.rotate,
        delete: STRINGS.select.delete,
        locked: STRINGS.editor.lockedToast,
      },
    });

    // Track the real tool id (the prop is the coarse seam) and cancel on switch.
    toolIdRef.current = useEditorStore.getState().activeTool;
    const unsubscribeTool = useEditorStore.subscribe((state, prev) => {
      if (state.activeTool === prev.activeTool) return;
      cancelActiveMarkup();
      toolIdRef.current = state.activeTool;
      if (state.activeTool === 'select') selectRef.current?.refresh();
      else selectRef.current?.onToolChange();
    });
    const unsubscribeSelection = useEditorStore.subscribe((state, prev) => {
      if (state.selection === prev.selection) return;
      selectRef.current?.refresh();
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
      requestValue: () => tool.requestKeypad(),
      adjustEndpoints: () => tool.adjustEndpoints(),
    };
    setEditorSession(session);

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
      if (id === 'erase') return eraseRef.current!.onPointerDown(imagePoint, pointerType);
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
        startAt: performance.now(),
        last: point,
        toolAction: 'none',
        forcePan: false,
        objectKey: null,
        freehandKind: null,
        owner: null,
        pressure: e.pressure,
      };
      contacts.set(e.pointerId, contact);

      const imagePoint = canvas.screenToImage(point);
      const keypadOpen = useEditorStore.getState().keypadOpen;

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
            moved: false,
          });
          // D63: record the pre-drag position for the second-finger restore.
          contact.session.preDragPosition = canvas.imageToScreen({ x: bounds.x, y: bounds.y });
        }
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
            drag.moved = drag.moved || moved;
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

      // The tool owns this contact's lift (commit B / end refine).
      if (contact.freehandKind) {
        const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
        ink.end(tapped);
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
          if (drag.moved && !tapped) {
            const dx = imagePoint.x - drag.startImage.x;
            const dy = imagePoint.y - drag.startImage.y;
            const to = translateGeometry(drag.geometry, dx, dy);
            history.exec({
              label: STRINGS.toasts.actionMoveDimension,
              do: () => scene.setGeometry(drag.key, to),
              undo: () => scene.setGeometry(drag.key, drag.geometry),
            });
          } else if (tapped) {
            useEditorStore.getState().setSelection([drag.key]);
          }
        }
      }

      if (!tapped || contact.intent === 'ignore') return;
      if (contact.toolAction !== 'none') return;
      if (placementArmed()) return; // a tap would place a point — never deferred

      // Select tool: tap an object selects it; empty canvas clears.
      if (activeToolRef.current === 'select') {
        const hit = canvas.hitObject(point);
        const key = hit ? scene.keyForAnnotationId(hit.id) : null;
        if (key) {
          useEditorStore.getState().setSelection([key]);
          return;
        }
        useEditorStore.getState().clearSelection();
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
          eraseRef.current?.pending,
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

        <input
          ref={fileInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          aria-label={STRINGS.capture.importAPhoto}
          onChange={(e) => void handleFile(e)}
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
