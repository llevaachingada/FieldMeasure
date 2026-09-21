/**
 * `src/ui/SheetEditor.tsx` — the first real editor screen: photo on an imperative
 * Konva canvas (implementation plan slice 1.3; build spec §7.1–7.3, §8.1, §4.2).
 *
 * What this screen owns:
 *  - **Open flow (D51).** The runtime `projectId` is `ScannedProject.key`
 *    (`id:folderName`), never the bare id: the Web Lock, the open-project registry,
 *    `persistQueue` and the BroadcastChannel are all keyed by it, so two same-id
 *    folders must not collide. `ProjectList.onOpenProject(id, folderName)` gives both
 *    halves; `App.tsx` composes the key.
 *  - **Import → normalize → render.** Capture time is read BEFORE `normalizeImage`
 *    (re-encode strips EXIF, §7.2), the normalized JPEG is written atomically via
 *    `projectStore.writeAtomic` (§5.3), the sheet is appended to `project.json`, and a
 *    640×480 thumbnail is scheduled 3 s later (§7.3).
 *  - **Pan / zoom / fit.** 0.25×–8×, double-tap fit↔100%, pinch and wheel live in
 *    `EditorCanvas`; this file renders the zoom pill and wires the touch-first input
 *    rules via slice 0.2's `inputRouter` (never reimplemented here).
 *  - **The §4.2 screen rules** are applied by `EditorCanvas.applyScreenRules` on every
 *    zoom change; nothing in this file draws geometry.
 *
 * TOUCH-FIRST INPUT (locked — touch model §3.1, plan build order step 3):
 *  - one-finger drag is **object-first** (`decideDragTarget`); on empty canvas it pans;
 *  - **two-finger drag always pans**, and a second finger cancels an in-progress object
 *    drag and **restores the recorded pre-drag position** (`onSecondFinger`);
 *  - the **Pan tool overrides** object-first unconditionally (the tool rail itself is
 *    slice 1.4.5; `activeToolRef` is the seam);
 *  - double-tap fit↔100% is **suspended while a placement tool is armed**;
 *  - tap vs drag is classified on `pointerup` with `TAP_SLOP = 8`, `TAP_MAX_MS = 400`,
 *    `LONG_PRESS_MS = 600` (all from `EditorCanvas`).
 *
 * Sheet chrome is deliberately minimal: the top bar / rail / style panel land in
 * slice 1.4.5. This slice needs only an exit and the zoom pill.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import type { ProjectFile } from '@/domain/schema';
import {
  EditorCanvas,
  decideDragTarget,
  isTap,
  onSecondFinger,
  type DragSession,
  type ScreenPoint,
} from '@/editor/EditorCanvas';
import { createInputRouter, type InputIntent } from '@/editor/inputRouter';
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
 * Tool seam for slice 1.4.5's rail. `'place'` stands for ANY placement tool
 * (dimension/angle/line/…): it arms placement, so double-tap fit is suspended and a
 * pending placement suppresses drag navigation. 1.3 has no rail, so it is a prop.
 */
type EditorTool = 'select' | 'pan' | 'place';

/** Double-tap window for fit↔100%: 320 ms, 24 px (UI §5.4 "double tap"). */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 24;

export interface SheetEditorProps {
  /** D51 runtime key `${projectId}:${folderName}` — NEVER the bare project id. */
  projectId: string;
  folderName: string;
  onExit: () => void;
  /** Active tool (slice 1.4.5's rail drives this). Default `'select'`. */
  activeTool?: EditorTool;
  /**
   * A placement has placed its first anchor and awaits the rest (slice 1.5). While
   * true, a one-finger drag neither pans nor moves an object — the pending placement
   * wins (UI §5.4: object-first is gated on "no placement is pending").
   */
  placementPending?: boolean;
}

interface Contact {
  intent: InputIntent;
  session: DragSession;
  start: ScreenPoint;
  startAt: number;
  /** Last container point, for incremental panning. */
  last: ScreenPoint;
}

function isAtEdge(point: ScreenPoint, host: HTMLElement): boolean {
  // Deliberately generous: the outer 24 px band can never PLACE (touch model §3.1a).
  return point.x < 24 || point.y < 24 || point.x > host.clientWidth - 24 || point.y > host.clientHeight - 24;
}

export default function SheetEditor({
  projectId,
  folderName,
  onExit,
  activeTool = 'select',
  placementPending = false,
}: SheetEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<EditorCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const projectDirRef = useRef<{ dir: FileSystemDirectoryHandle; file: ProjectFile } | null>(null);
  const leaseRef = useRef<WriterLease | null>(null);
  const channelRef = useRef<ProjectChannel | null>(null);
  const schedulerRef = useRef<ThumbnailScheduler | null>(null);
  // Handlers live in a mount-time effect, so the tool/placement state is read through
  // refs that stay in sync with the props (the rail will update the props in 1.4.5).
  const activeToolRef = useRef<EditorTool>(activeTool);
  const placementPendingRef = useRef(placementPending);
  const zoomRef = useRef(100);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  useEffect(() => {
    placementPendingRef.current = placementPending;
  }, [placementPending]);

  const [status, setStatus] = useState<EditorStatus>('loading');
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetCount, setSheetCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // ---- canvas lifecycle + input routing + project open -------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;

    const canvas = new EditorCanvas(host, {
      onZoom: (scale) => {
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

    const contacts = new Map<number, Contact>();
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
      const session: DragSession = {
        target: decideDragTarget({ panTool, intent, hit }),
        // OWED BY 1.5, NOT WIRED. 1.3 has no grabbable object model, so nothing is
        // grabbable and the pre-drag position is never recorded (always null). When
        // objects land, record the hit node's position here so the second-finger
        // cancel can put it back.
        preDragPosition: null,
      };
      contacts.set(e.pointerId, { intent, session, start: point, startAt: performance.now(), last: point });

      if (contacts.size >= 2) {
        // Second finger always wins: cancel an object drag, then hand navigation to
        // EditorCanvas's pinch/pan. `onSecondFinger(...).restoreTo` — the recorded
        // pre-drag position — is NOT consumed here: 1.3 has no object model, so
        // `preDragPosition` is always null. 1.5 must apply `restoreTo` to the dragged
        // node at this point. This is owed, not live.
        for (const contact of contacts.values()) {
          const resolution = onSecondFinger(contact.session);
          if (resolution.cancelled) contact.session.target = 'pan';
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
      // Consume `decideDragTarget`'s result for ANY one-finger contact (F1): a 'pan'
      // target pans whether the router called the contact 'draw' (touch with «Touch
      // places and moves» ON, or mouse/pen) or 'navigate'. A pending placement takes
      // precedence and suppresses movement. With ≥2 contacts EditorCanvas owns pinch/pan.
      if (contacts.size === 1 && !placementPendingRef.current) {
        if (contact.session.target === 'pan') {
          canvas.panBy(point.x - contact.last.x, point.y - contact.last.y);
        }
        // 'object': 1.5 owns the move (dragLayer reparent + node position).
      }
      contact.last = point;
    };

    const endContact = (e: PointerEvent): void => {
      const contact = contacts.get(e.pointerId);
      if (!contact) return;
      const point = canvas.pointerPosition(e);
      const duration = performance.now() - contact.startAt;
      const tapped = isTap(point.x - contact.start.x, point.y - contact.start.y, duration);
      contacts.delete(e.pointerId);
      if (e.pointerType === 'pen') router.penStrokeEnd();
      if (e.pointerType === 'touch') router.noteTouchUp(e.pointerId);

      // A palm/heel ('ignore') contact is never a tap. Both 'draw' and 'navigate' may
      // double-tap fit↔100% (F2): UI §5.4 makes it unconditional for touch, so it must
      // not depend on the «Touch places and moves» toggle.
      if (!tapped || contact.intent === 'ignore') return;
      // Tap precedence (touch §3.1): overlay > placement > action > select > empty.
      if (placementArmed()) return; // a tap would place a point — never deferred
      const now = performance.now();
      if (
        lastTap &&
        now - lastTap.at <= DOUBLE_TAP_MS &&
        Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) <= DOUBLE_TAP_SLOP
      ) {
        lastTap = null;
        canvas.toggleFitOrFull(); // fit ↔ 100%
      } else {
        lastTap = { point, at: now };
      }
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', endContact);
    host.addEventListener('pointercancel', endContact);

    void (async () => {
      try {
        // D51: the runtime key, not the bare id.
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
        const sheet = sheets[0];
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
      host.removeEventListener('pointercancel', endContact);
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
      canvas.destroy();
      clearOpenProject(projectId);
    };
  }, [projectId, folderName, retryToken]);

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
    input.value = ''; // allow re-importing the same file
    if (!file || !canvasRef.current) return;
    const canvas = canvasRef.current;
    setBusy(true);
    try {
      const state = projectDirRef.current;
      if (!state) throw new Error('project is not open');
      // §7.2: capture time is read BEFORE normalize strips EXIF. The Sheet schema has
      // no capture-time field (§3.4), so the value is used as the new sheet's
      // `createdAt` (better than "now" for a photo taken earlier in the day) and is
      // otherwise not persisted — see DECISIONS.
      const exif = await readExifInfo(file);
      const normalized = await normalizeImage(file);
      const now = new Date();
      // The single "photo → sheet" write path (shared with slice 1.4's capture flow).
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

      // §7.3: thumbnail regenerates 3 s after the last edit (decode in the worker).
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

  // ---- render -------------------------------------------------------------------
  return (
    <main className="editor">
      <header className="editor-bar">
        <button type="button" className="btn btn-secondary hit-slop" onClick={onExit}>
          {STRINGS.editor.back}
        </button>
        <h1 className="editor-title">{sheetTitle || STRINGS.home.appName}</h1>
        {readOnly ? (
          <p className="editor-readonly" role="status">
            {STRINGS.project.readOnlyChip}
          </p>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            className="btn btn-primary hit-slop"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {STRINGS.capture.importButton}
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          className="editor-file-input"
          type="file"
          accept="image/*"
          aria-label={STRINGS.capture.importAPhoto}
          onChange={(e) => void handleFile(e)}
        />
      </header>

      <div className="editor-stage">
        {/* role=application mirrors the canvas object tree (§19.6). It is focusable so
            arrow-nudge can land later, and it is NOT a keyboard trap: no key handler
            swallows Tab/Escape (a11y §19.6). */}
        <div
          ref={hostRef}
          className="editor-canvas"
          role="application"
          aria-label={STRINGS.a11y.canvas}
          tabIndex={0}
          data-sheet-count={sheetCount}
        />

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

        {/* Zoom pill: floating, bottom-left (UI §5.4). 52 px buttons ≥48 px floor. */}
        <div className="zoom-pill" role="group" aria-label={STRINGS.a11y.zoom}>
          <button
            type="button"
            className="zoom-pill-button"
            aria-label={STRINGS.a11y.zoomOut}
            onClick={() => canvasRef.current?.zoomBy(1 / 1.2)}
          >
            <Minus aria-hidden="true" />
          </button>
          <span className="zoom-pill-value mono">
            {t(STRINGS.editor.zoomPercent, { zoomPercent })}
          </span>
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
    </main>
  );
}
