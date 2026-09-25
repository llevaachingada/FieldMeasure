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
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { ProjectFile } from '@/domain/schema';
import type { Px } from '@/domain/types';
import type { Annotation, AnnotationStyle } from '@/domain/types';
import { EditorCanvas } from '@/editor/EditorCanvas';
import { createInsetActions } from '@/ui/insetActions';
import { createSceneActions } from '@/editor/sceneActions';
import { EditorController, styleCoalesceKey } from '@/editor/editorController';
export { styleCoalesceKey };
import { History } from '@/editor/history';
import { MarkupScene } from '@/editor/shapes/scene';
import { Loupe } from '@/editor/Loupe';
import { DimensionTool, type DimensionSnapshot, type KeypadRequest } from '@/editor/tools/DimensionTool';
import { ShapeTool, type ShapeKind } from '@/editor/tools/ShapeTool';
import { AngleTool, type AngleSheetRequest } from '@/editor/tools/AngleTool';
import { FreehandTool } from '@/editor/tools/FreehandTool';
import { TextTool } from '@/editor/tools/TextTool';
import { EraseTool, strokeModeAvailable, type EraseMode } from '@/editor/tools/EraseTool';
import { ROTATE_STOPS, SelectTool } from '@/editor/tools/SelectTool';
import type { PersistQueue } from '@/state/persistQueue';
import DimensionKeypadSheet from '@/ui/DimensionKeypadSheet';
import LayersPanel from '@/ui/LayersPanel';
import { annotationName, buildLayerRows } from '@/ui/layersRows';
import { useEditorStore } from '@/state/editorStore';
import { readExifInfo } from '@/media/exif';
import { normalizeImage } from '@/media/normalizeImage';
import { createThumbnailScheduler, type ThumbnailScheduler } from '@/media/thumbnails';
import {
  isPhotoDamaged,
  readSheetMarkup,
  resolveSheetDir,
  writeAtomic,
  type ProjectChannel,
  type WriterLease,
} from '@/fs/projectStore';
import { useAppStore } from '@/state/appStore';
import { addSheetFromPhoto, defaultSheetTitle } from '@/fs/sheetIntake';
import { InsetTool, type InsetAssetInput } from '@/editor/tools/InsetTool';
import { storeInsetAsset } from '@/editor/inset/insetAssets';
import type { InsetAssetImage } from '@/editor/inset/renderInset';
import ImageInsetPickerSheet from '@/ui/ImageInsetPickerSheet';
import { InsetAssetRegistry } from '@/ui/insetWiring';
import './insetWire.css';
import { STRINGS, t } from './strings';

type SheetFile = ProjectFile['sheets'][number];
export type EditorStatus = 'loading' | 'ready' | 'empty' | 'damaged' | 'error';
/**
 * Tool seam for the rail. `'place'` stands for ANY placement tool
 * (dimension/angle/line/…): it arms placement, so double-tap fit is suspended and a
 * pending placement suppresses drag navigation.
 */
type EditorTool = 'select' | 'pan' | 'place';


/** D134 (§4.2 anchor): the mini-toolbar's touch-first sizing/placement numbers, verbatim
 *  from the brief ("64 px tall … anchored 16 px above the selection, flipping below when
 *  headroom < 160 px"). */
const MINI_TOOLBAR_HEIGHT_PX = 64;
const MINI_TOOLBAR_GAP_PX = 16;
const MINI_TOOLBAR_FLIP_HEADROOM_PX = 160;



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
  /**
   * The empty-state primary «Take photo» action (UI §11.2:684, the D88 pair). The shell
   * owns the camera overlay — `EditorLayout` hands its `onAddSheet` down here, which is
   * the exact path the top bar's «Add sheet» already uses. Absent (e.g. a bare mount),
   * the empty state simply renders the secondary «Import» affordance.
   */
  onTakePhoto?: () => void;
  onSheetTitleChange?: (title: string) => void;
  sheetId?: string;
  /**
   * Slice 1.7 integration seam (the `onImportReady` precedent): the live imperative
   * scene + canvas, handed out once they exist. Lets an in-browser test drive geometry
   * through the REAL editor without reaching into Konva globals.
   */
  onSceneReady?: (api: { scene: MarkupScene; canvas: EditorCanvas }) => void;
  /**
   * Slice 1.9 additive seam: the document half of export. The shell owns the wizard but
   * not the document, so this hands out the sheet list, the current sheet id, the LIVE
   * markup of the open sheet (its `markup.json` may still be coalescing), the session's
   * decoded-asset provider and a persist-queue flush. `null` while no sheet is open.
   *
   * The shape is structural and deliberately tiny — it mirrors `ExportDocumentSource` in
   * `src/export/runExport.ts`, which is the only consumer.
   */
  onExportSource?: (source: EditorExportSource | null) => void;
}

/** One sheet as the export engine needs it: identity, title, WORKING-IMAGE size. */
export interface EditorSheetInfo {
  id: string;
  title: string;
  imageWidthPx: number;
  imageHeightPx: number;
}

/** The document half of export (see `onExportSource`). */
export interface EditorExportSource {
  sheets: readonly EditorSheetInfo[];
  currentSheetId: string | null;
  currentAnnotations: () => readonly Annotation[];
  assetProvider?: (assetId: string) => InsetAssetImage | null;
  flush: () => Promise<void>;
}


export default function SheetEditor({
  projectId,
  folderName,
  activeTool = 'select',
  placementPending = false,
  onImportReady,
  onTakePhoto,
  onSheetTitleChange,
  sheetId,
  onSceneReady,
  onExportSource,
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
  /**
   * Slice 1.10: once the writer lease resolves absent the project is READ-ONLY
   * (§5.8d, second tab). That is the chip's `Read-only` case, not a write failure, so
   * the queue must not overwrite it with a transient `saving`/`pending`.
   */
  const readOnlyRef = useRef(false);
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
  const miniToolbarRef = useRef<HTMLDivElement | null>(null);
  /** D133 (§4.2): the mini-toolbar's «Copy style»/«Paste style» — one slot, session-only
   *  (no persistence seam; a clipboard is not document state). `null` disables Paste. */
  const [styleClipboard, setStyleClipboard] = useState<AnnotationStyle | null>(null);
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
  // Slice 1.9 export seam: the shell needs the sheet list + which one is open. Held in
  // state (not only the ref below) so the emit effect re-runs when either changes.
  const [exportSheets, setExportSheets] = useState<readonly EditorSheetInfo[]>([]);
  const [exportSheetId, setExportSheetId] = useState<string | null>(null);
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

  // ---- slice 1.9: publish the export document source (additive seam) -----------
  // The callbacks read live refs, so a run always sees the current scene/registry even
  // though the object is emitted only when the sheet list or the open sheet changes.
  useEffect(() => {
    if (!onExportSource) return;
    if (exportSheets.length === 0) {
      onExportSource(null);
      return;
    }
    const currentId = exportSheetId;
    onExportSource({
      sheets: exportSheets,
      currentSheetId: currentId,
      currentAnnotations: () => {
        const scene = sceneRef.current;
        if (!scene || currentId === null) return [];
        return scene.markupFile(currentId, 1).objects;
      },
      assetProvider: (assetId) => insetAssetsRef.current.provider(assetId),
      flush: () => persistRef.current?.flush() ?? Promise.resolve(),
    });
    return () => onExportSource(null);
  }, [onExportSource, exportSheets, exportSheetId]);

  // ---- canvas lifecycle + input routing + project open (R6: `EditorController`) ----
  const controllerRef = useRef<EditorController | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new EditorController(host, {
      projectId,
      folderName,
      sheetId,
      onSceneReady,
      loadSheet,
      refs: {
        angleRef, bitmapRef, canvasRef, channelRef, dimRef, eraseRef, freehandRef, highlightRef,
        historyRef, insetAssetsRef, insetRef, leaseRef, persistRef, projectDirRef, readOnlyRef,
        sceneRef, schedulerRef, selectRef, shapeToolsRef, sheetIdRef, textRef, toolIdRef, zoomRef,
        activeToolRef, placementPendingRef,
      },
      set: {
        setAngleSheet, setExportSheetId, setExportSheets, setInsetPickerOpen, setKeypadRequest,
        setPinnedToolbar, setPlacement, setPolygon, setReadOnly, setReplacePrompt, setSceneTick,
        setSheetCount, setSheetTitle, setStatus, setTextAnchor, setTextDraft, setZoomPercent,
        setInputKind,
      },
    });
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
    // D145: `sheetId` is deliberately NOT a dependency. The mount reads it once for the first
    // sheet; later changes go through `controller.loadSheet` below, on the same canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, folderName, retryToken]);

  // D145: a sheet change is a load on the live controller, not a remount.
  useEffect(() => {
    if (sheetId) void controllerRef.current?.loadSheet(sheetId);
  }, [sheetId]);

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

  // R6: the inset handlers live in `src/ui/insetActions.ts`.
  const {
    syncRecents, ensureInsetAsset, hydrateInsetAssets, placePickedFiles, handleInsetDeviceChange, handleInsetCameraChange, pickRecent, enterFocusInset, exitFocusInset, cancelReplacePrompt, applyReplace, startReplaceHold, cancelReplaceHold, handleReplaceChange, beginReplace,
  } = createInsetActions({
    projectId, sceneRef, insetRef, insetAssetsRef, projectDirRef, replaceHoldTimerRef, replacePrompt,
    setReplacePrompt, setReplaceHolding, setInsetRecents,
  });


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
          // The photo's own moment: EXIF, else the file's date (an import was not taken "now").
          capturedAt: exif.captureTime ?? new Date(file.lastModified),
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
      // Slice 1.9: the added sheet joins the export seam's list and becomes current.
      setExportSheets(
        nextFile.sheets
          .filter((s) => !s.deletedAt)
          .map((s) => ({
            id: s.id,
            title: s.title,
            imageWidthPx: s.imageWidth,
            imageHeightPx: s.imageHeight,
          })),
      );
      setExportSheetId(sheet.id);
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

  // R6: the Layers panel and mini-toolbar actions live in `src/editor/sceneActions.ts`.
  const {
    panelSelect, panelToggleVisible, panelToggleLock, panelReorder, panelRename, panelDelete,
    closeLayers, toolbarRotate, toolbarDelete, toolbarToggleLock, toolbarDuplicate,
    reorderSelection, toolbarCopyStyle, toolbarPasteStyle,
  } = createSceneActions({
    sceneRef, historyRef, canvasRef, selectRef, labelCtx, layerRows, styleClipboard,
    setStyleClipboard, setPinnedToolbar, setSceneTick,
  });

  const showMiniToolbar = pinnedToolbar && selection.length > 0 && !keypadOpen && activeToolId === 'select';

  /**
   * §4.2's owed anchor fix. `.placement-hud` cannot carry a computed position via inline
   * `style=""` (the CSP forbids it) — `element.animate()` is the sanctioned CSP-safe
   * pattern this codebase already uses for a computed position (`ProjectScreen.tsx`'s
   * drag chip / portalled card menu), so it is used here too. 16 px above the selection's
   * screen-space top edge; flips BELOW when the headroom above is under 160 px (the
   * touch-first spec's own number).
   *
   * SIMPLIFICATION, recorded in D134: this repositions on every selection change and
   * whenever the toolbar is (re)pinned, but does NOT track a live pan/zoom while it
   * stays open — panning with the toolbar pinned can leave it trailing the selection
   * until the next reposition trigger. A continuous per-frame anchor (a stage
   * `dragmove`/wheel listener re-running this effect) is real, additional scope this
   * pass did not take on; the toolbar is still fully FUNCTIONAL either way — every
   * button acts on the real selection regardless of where the pill is drawn.
   */
  useLayoutEffect(() => {
    if (!showMiniToolbar) return;
    const el = miniToolbarRef.current;
    const canvas = canvasRef.current;
    const stageEl = hostRef.current;
    const bounds = selectRef.current?.selectionBounds(selection) ?? null;
    if (!el || !canvas || !stageEl || !bounds || typeof el.animate !== 'function') return;

    const topLeft = canvas.imageToScreen({ x: bounds.x, y: bounds.y });
    const bottomRight = canvas.imageToScreen({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });
    const centerX = (topLeft.x + bottomRight.x) / 2;
    const top = Math.min(topLeft.y, bottomRight.y);
    const bottom = Math.max(topLeft.y, bottomRight.y);

    const stageRect = stageEl.getBoundingClientRect();
    // `offsetWidth` is 0 before the pill's first paint (a fresh pin); fall back to a
    // conservative estimate rather than mis-centring at x=0 for that one frame.
    const toolbarWidth = el.offsetWidth || 360;
    const halfWidth = toolbarWidth / 2;
    const margin = 8;
    const clampedX = Math.min(
      Math.max(centerX, halfWidth + margin),
      Math.max(halfWidth + margin, stageRect.width - halfWidth - margin),
    );

    const flipBelow = top < MINI_TOOLBAR_FLIP_HEADROOM_PX;
    const y = flipBelow
      ? bottom + MINI_TOOLBAR_GAP_PX
      : top - MINI_TOOLBAR_GAP_PX - MINI_TOOLBAR_HEIGHT_PX;

    el.animate(
      [{ transform: `translate(${(clampedX - halfWidth).toFixed(1)}px, ${Math.max(margin, y).toFixed(1)}px)` }],
      { duration: 0, fill: 'forwards' },
    );
  }, [showMiniToolbar, selection]);

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
            {/* The editor loads a SHEET, not a project list: borrowing Home's line named the wrong
                thing (D129's audit of every chrome string). */}
            {STRINGS.editor.loadingSheet}
          </p>
        ) : null}

        {status === 'empty' ? (
          <div className="editor-panel" role="status">
            <p>{STRINGS.project.noSheetsEmpty}</p>
            {!readOnly ? (
              // The UI §11.2:684 add pair: primary «Take photo» (opens the camera
              // overlay through the shell seam) then secondary «Import» (the same
              // `addSheetFromPhoto` file input as before). D88's recorded option B/C.
              // Both are direct `.editor-panel` children: its column flex + 16 px gap
              // already stacks and spaces them, so no new stylesheet rule is needed.
              <>
                <button
                  type="button"
                  className="btn btn-primary hit-slop"
                  onClick={onTakePhoto}
                >
                  {STRINGS.project.addTakePhoto}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary hit-slop"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {STRINGS.capture.importButton}
                </button>
              </>
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

        {/* Select mini-toolbar (touch model §3.3; plan step 7; D133/D134 §4.2: the full
            pill, computed-anchor position). Pinned by the 600 ms long-press; shown while
            a selection exists. The position is applied by the `useLayoutEffect` above via
            `element.animate()` — the CSP forbids inline `style=""`, so a computed anchor
            cannot be a plain `style={{left,top}}`; `.placement-hud--anchored` clears the
            shared class's static `left/bottom` so the animated `transform` is the only
            thing placing it. */}
        {showMiniToolbar ? (
          <div
            ref={miniToolbarRef}
            className="placement-hud placement-hud--wrap placement-hud--anchored"
            role="toolbar"
            aria-label={STRINGS.tool.select}
            data-testid="mini-toolbar"
            data-pinned={pinnedToolbar ? 'true' : 'false'}
          >
            <button
              type="button"
              className="placement-hud-button"
              data-testid="mini-toolbar-duplicate"
              aria-label={STRINGS.select.duplicate}
              onClick={toolbarDuplicate}
            >
              {STRINGS.select.duplicate}
            </button>
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
              className="placement-hud-button"
              data-testid="mini-toolbar-bring-front"
              aria-label={STRINGS.select.bringFront}
              onClick={() => reorderSelection('front')}
            >
              {STRINGS.select.bringFront}
            </button>
            <button
              type="button"
              className="placement-hud-button"
              data-testid="mini-toolbar-send-back"
              aria-label={STRINGS.select.sendBack}
              onClick={() => reorderSelection('back')}
            >
              {STRINGS.select.sendBack}
            </button>
            <button
              type="button"
              className="placement-hud-button"
              data-testid="mini-toolbar-copy-style"
              aria-label={STRINGS.select.copyStyle}
              onClick={toolbarCopyStyle}
            >
              {STRINGS.select.copyStyle}
            </button>
            <button
              type="button"
              className="placement-hud-button"
              data-testid="mini-toolbar-paste-style"
              aria-label={
                styleClipboard ? STRINGS.select.pasteStyle : `${STRINGS.select.pasteStyle}. ${STRINGS.select.noStyleCopied}`
              }
              title={styleClipboard ? undefined : STRINGS.select.noStyleCopied}
              disabled={!styleClipboard}
              onClick={toolbarPasteStyle}
            >
              {STRINGS.select.pasteStyle}
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

