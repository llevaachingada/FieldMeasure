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
import { MarkupScene } from '@/editor/shapes/scene';
import { Loupe } from '@/editor/Loupe';
import {
  DimensionTool,
  type DimensionSnapshot,
  type KeypadRequest,
} from '@/editor/tools/DimensionTool';
import { setEditorSession, type EditorSession } from '@/editor/session';
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
}

interface ObjectDrag {
  key: string;
  from: { a: Px; b: Px };
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
        for (const key of keys) tool.deleteDimension(key);
        useEditorStore.getState().clearSelection();
        return { label: STRINGS.toasts.actionDeleteDimension };
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

    const onPointerDown = (e: PointerEvent): void => {
      const point = canvas.pointerPosition(e);
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
      };
      contacts.set(e.pointerId, contact);

      const imagePoint = canvas.screenToImage(point);
      const keypadOpen = useEditorStore.getState().keypadOpen;

      // Keypad-open (touch model §5.1): pan + pinch only; taps do nothing.
      if (keypadOpen) {
        contact.forcePan = true;
        contact.session.target = 'pan';
      } else if (intent !== 'ignore' && (placementArmed() || tool.state.phase !== 'idle')) {
        const action = tool.onPointerDown(imagePoint, e.pointerType);
        contact.toolAction = action;
        contact.forcePan = true;
        if (action === 'pan') contact.session.target = 'pan';
      } else if (contact.session.target === 'object' && hit) {
        const key = scene.keyForAnnotationId(hit.id);
        const from = key ? scene.geometryAt(key) : null;
        if (key && from) {
          contact.objectKey = key;
          objectDrags.set(e.pointerId, {
            key,
            from,
            startImage: imagePoint,
            moved: false,
          });
          // D63: record the pre-drag position for the second-finger restore.
          contact.session.preDragPosition = canvas.imageToScreen(from.a);
        }
      }

      if (contacts.size >= 2) {
        for (const [pointerId, other] of contacts) {
          const resolution = onSecondFinger(other.session);
          if (!resolution.cancelled) continue;
          // D63 — restore the object's pre-drag position; never commit at the displaced spot.
          const drag = objectDrags.get(pointerId);
          if (drag) {
            scene.setAnchor(drag.key, 'a', drag.from.a);
            scene.setAnchor(drag.key, 'b', drag.from.b);
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

      if (contact.toolAction !== 'none') {
        const action = tool.onPointerMove(imagePoint, moved);
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
            scene.setAnchor(drag.key, 'a', { x: drag.from.a.x + dx, y: drag.from.a.y + dy });
            scene.setAnchor(drag.key, 'b', { x: drag.from.b.x + dx, y: drag.from.b.y + dy });
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
      if (contact.toolAction === 'consume') {
        tool.onPointerUp(imagePoint, tapped, e.pointerType);
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
            tool.moveDimension(drag.key, drag.from, dx, dy);
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
      if (contact.toolAction !== 'none') tool.onPointerCancel(e.pointerType);
    };

    // Delete the current selection (keyboard path; touch uses the mini-toolbar later).
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (useEditorStore.getState().keypadOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
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
      setEditorSession(null);
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
