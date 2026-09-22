/**
 * `src/ui/CameraFlow.tsx` — slice 1.4, the capture flow (build spec §11.8; UI spec
 * §10.1/§10.2/§17; implementation plan slice 1.4).
 *
 * WHAT THIS FILE OWNS
 *  - A full-bleed `getUserMedia` viewfinder: torch / grid / level / flip / resolution
 *    toggles, a tap-to-focus reticle, long-press AE/AF lock, an 88 px shutter with a
 *    120 ms flash, and a bottom bar (`Import` · shutter · zoom chips).
 *  - `enumerateDevices()` + a `deviceId` picker + `ondevicechange`. **`facingMode` is
 *    never used for selection** (it is unreliable on Windows — §11.8).
 *  - Capture → `readExifInfo` (BEFORE normalize — the re-encode strips EXIF, §7.2) →
 *    `normalizeImage` → `addSheetFromPhoto` (the frozen `src/fs/sheetIntake.ts` write
 *    path) → schedule `thumb.jpg` via `createThumbnailScheduler` → `onCaptured`.
 *  - A review screen: `Retake · Rotate · Use photo`. Auto-enhance is deliberately NOT
 *    built and NOT reserved (§2.4 defers it).
 *  - The camera-unavailable panel: the exact `capture.embeddedFallback` sentence as
 *    TEXT (never an image), the two fallback buttons, and the OS privacy-setting note.
 *  - A write failure keeps the photo in memory and offers `Save a copy…` (a field photo
 *    is never trapped).
 *
 * WHAT IT DOES NOT OWN
 * The editor shell (`EditorLayout` / `ToolRail` / `TopBar`) is written by a sibling
 * lane. This component must not import it — it mounts and works standalone.
 *
 * COPY
 * Every string comes from `STRINGS` (`src/ui/strings.ts`). Slice 1.4 staged its copy
 * in `./cameraCopy` while the sibling 1.4.5 lane owned that file; the orchestrator
 * folded it into `STRINGS` at integration and the staging module is gone. Nothing is
 * invented here.
 *
 * CSP
 * No inline `style=""` anywhere: overlays are positioned with CSS classes, and the
 * reticle is an SVG whose geometry lives in `cx`/`cy`/`r` ATTRIBUTES, not styles.
 *
 * SCALING NOTE
 * The screen-vs-export scaling rules (§4.2) do not apply here: nothing in this component
 * draws markup units. The captured frame is pixels, and `normalizeImage` fixes the
 * working-image coordinate space (§7.1).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Check,
  FlipHorizontal,
  Image as ImageIcon,
  LayoutGrid,
  Minus,
  RotateCcw,
  RotateCw,
  X,
  Zap,
} from 'lucide-react';
import type { ProjectFile } from '@/domain/schema';
import { readExifInfo } from '@/media/exif';
import { normalizeImage } from '@/media/normalizeImage';
import { createThumbnailScheduler, type ThumbnailScheduler } from '@/media/thumbnails';
import {
  getRootDir,
  readProjectFile,
  resolveOpenProjectDir,
  resolveProjectDir,
  writeAtomic,
} from '@/fs/projectStore';
import { addSheetFromPhoto, defaultSheetTitle } from '@/fs/sheetIntake';
import { STRINGS } from './strings';
import './camera.css';

/* ------------------------------------------------------------------ *
 * Frozen interface (do not widen the three pinned props)
 * ------------------------------------------------------------------ */

export interface CameraFlowProps {
  /** D51 runtime key `${id}:${folderName}` — the Web Lock / queue / registry key. */
  projectId: string;
  /** Called AFTER the atomic write, with the new sheet's id and sort index. */
  onCaptured: (sheet: { id: string; index: number }) => void;
  onCancel: () => void;
  /**
   * Optional: resolves the project directory when no editor session has registered
   * the project in this tab. Derived from the runtime key otherwise.
   */
  folderName?: string;
}

/* ------------------------------------------------------------------ *
 * Constants (all sizes from UI spec §10.1 / §14; ms values from §10.1)
 * ------------------------------------------------------------------ */

/** 120 ms black screen flash — mimics a shutter (UI §10.1). */
const FLASH_MS = 120;
/** The reticle's 300 ms contract is CSS; it then HOLDS for 2 s (UI §10.1). */
const RETICLE_HOLD_MS = 2000;
/** Long-press = AE/AF lock (UI §10.1). 600 ms is the app's standard long-press. */
const LONG_PRESS_MS = 600;
const LONG_PRESS_SLOP = 8;
/** Horizon turns `--ok` within ±1.5° (UI §10.1). */
const LEVEL_TOLERANCE_DEG = 1.5;

/** `High` requests the full sensor/NPU path; the browser clamps to the real max. */
const HIGH_IDEAL = { width: { ideal: 4096 }, height: { ideal: 2160 } } as const;
/** `Fast` is a 720p-class preview/encode (UI §10.1). */
const FAST_IDEAL = { width: { ideal: 1280 }, height: { ideal: 720 } } as const;

/** Zoom chips (UI §10.1: 0.5× / 1× / 2×). */
const ZOOM_STEPS = [0.5, 1, 2] as const;
type ZoomStep = (typeof ZOOM_STEPS)[number];

/**
 * C3 (§21.7 provisional). The build machine reports **no usable camera**
 * (`docs/DECISIONS.md` "Checkpoint C3"), so no max resolution was measured and the
 * §21.7 row could not be read. The provisional row is "modes differ ≥ 1.5×" → keep the
 * toggle. `null` = unmeasured, which is why the fallback copy is NOT promoted here.
 * Re-checked on hardware (H10).
 */
const PROVISIONAL_DEVICE_MAX: { width: number; height: number } | null = null;

/* ------------------------------------------------------------------ *
 * Exported pure helpers (unit-testable, no DOM)
 * ------------------------------------------------------------------ */

/**
 * D51: the runtime key is `${id}:${folderName}`. A Windows folder name cannot contain
 * `:`, so everything after the first `:` is the folder name.
 */
export function folderNameFromProjectId(projectId: string): string {
  return projectId.split(':').slice(1).join(':');
}

/**
 * The §21.7 decision table's fallback-copy half. The promoted `«Use the Windows Camera
 * app for detail shots»` line appears ONLY when the device's measured max is ≤ 1080p;
 * an unmeasured device (`null`, the C3 provisional case) is not ≤ 1080p and does not
 * promote. Exported so both rows are machine-checkable without a camera.
 */
export function fallbackCopyForDeviceMax(maxHeightPx: number | null): {
  title: string;
  body: string;
  promoted: boolean;
} {
  const promoted = maxHeightPx !== null && maxHeightPx <= 1080;
  return {
    title: STRINGS.capture.unavailable,
    body: STRINGS.capture.embeddedFallback,
    promoted,
  };
}

/** `1920×1080` — a numeral readout, not copy (never a sensor marketing MP). */
export function formatResolution(width: number, height: number): string {
  return `${width}×${height}`;
}

/**
 * Grab one frame from the live `<video>` as a JPEG. The real size comes from the
 * element (`videoWidth`/`videoHeight`); the fallback is the track's reported settings
 * (a not-yet-painted video element reports 0×0).
 */
export async function snapshotVideoFrame(
  video: HTMLVideoElement,
  fallback: { width: number; height: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  const width = video.videoWidth || fallback.width;
  const height = video.videoHeight || fallback.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('JPEG encode failed');
  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Bake a quarter-turn into the pixels (the review screen's `↻ Rotate`). A silent
 * no-op would store a photo that disagrees with the preview, so a failure propagates
 * to the caller and lands in the `Save a copy…` path instead.
 */
export async function bakeRotation(blob: Blob, degrees: number): Promise<Blob> {
  if (degrees % 360 === 0) return blob;
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const swap = degrees % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? bitmap.height : bitmap.width;
    canvas.height = swap ? bitmap.width : bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
    );
    if (!out) throw new Error('JPEG encode failed');
    return out;
  } finally {
    bitmap.close();
  }
}

/* ------------------------------------------------------------------ *
 * Internal types
 * ------------------------------------------------------------------ */

type View = 'starting' | 'viewfinder' | 'review' | 'unavailable';
type WriteState = 'idle' | 'saving' | 'failed';

interface Delivered {
  width: number;
  height: number;
}

interface CameraCaps {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
}

interface Captured {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

interface ProjectState {
  dir: FileSystemDirectoryHandle;
  file: ProjectFile;
}

/** `MediaTrackConstraintSet` plus the Chromium-only members we probe best-effort. */
type ExtendedConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
  zoom?: number;
  pointsOfInterest?: Array<{ x: number; y: number }>;
  focusMode?: string;
  exposureMode?: string;
};

function safeObjectUrl(blob: Blob): string {
  try {
    // jsdom has no createObjectURL; the preview simply renders without an image there.
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
}

function safeRevoke(url: string): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

/**
 * Resolve the project folder. `resolveOpenProjectDir` first (the 1.3/D51 open flow);
 * otherwise root + folderName (derived from the runtime key when not supplied).
 */
async function resolveProjectFolder(
  projectId: string,
  folderName?: string,
): Promise<FileSystemDirectoryHandle> {
  try {
    return await resolveOpenProjectDir(projectId);
  } catch {
    const root = await getRootDir();
    if (!root) throw new Error('no projects root is open');
    const folder = folderName ?? folderNameFromProjectId(projectId);
    if (!folder) throw new Error('cannot resolve the project folder');
    return resolveProjectDir(root, folder, { create: false });
  }
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export default function CameraFlow({
  projectId,
  onCaptured,
  onCancel,
  folderName,
}: CameraFlowProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const projectRef = useRef<ProjectState | null>(null);
  const schedulerRef = useRef<ThumbnailScheduler | null>(null);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const reticleTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<View>('starting');
  const [write, setWrite] = useState<WriteState>('idle');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [high, setHigh] = useState(true);
  const [delivered, setDelivered] = useState<Delivered | null>(null);
  const [caps, setCaps] = useState<CameraCaps>({});
  const [zoom, setZoom] = useState<ZoomStep>(1);
  const [torchOn, setTorchOn] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [levelOn, setLevelOn] = useState(false);
  const [levelOk, setLevelOk] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reticle, setReticle] = useState<{ x: number; y: number; key: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const [flying, setFlying] = useState(false);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [rotation, setRotation] = useState(0);

  /* ---- project resolution (once per project) ----------------------------- */

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const dir = await resolveProjectFolder(projectId, folderName);
        const file = await readProjectFile(dir);
        if (alive) projectRef.current = { dir, file };
      } catch {
        // No project folder: the camera still works, but a commit will land in the
        // Save-a-copy path rather than trapping the photo. Never silently lost.
        if (alive) projectRef.current = null;
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, folderName]);

  /* ---- camera lifecycle -------------------------------------------------- */

  const stopStream = useCallback((): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const refreshDevices = useCallback(async (): Promise<void> => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    try {
      const all = await media.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch {
      setDevices([]);
    }
  }, []);

  const startCamera = useCallback(
    async (nextDeviceId: string | null, nextHigh: boolean): Promise<void> => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      stopStream();
      setDelivered(null);
      try {
        const media = navigator.mediaDevices;
        if (!media?.getUserMedia) throw new Error('getUserMedia is unavailable');
        const stream = await media.getUserMedia({
          audio: false,
          video: {
            ...(nextDeviceId ? { deviceId: { exact: nextDeviceId } } : {}),
            ...(nextHigh ? HIGH_IDEAL : FAST_IDEAL),
          },
        });
        if (generation !== generationRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) video.srcObject = stream;

        const track = stream.getVideoTracks()[0] ?? null;
        if (track) {
          const settings = track.getSettings();
          const width = settings.width ?? 0;
          const height = settings.height ?? 0;
          // The HONEST max: what the track actually delivers, never the sensor's MP.
          setDelivered(width > 0 && height > 0 ? { width, height } : null);
          const capabilities = (track.getCapabilities?.() ?? {}) as unknown as CameraCaps;
          setCaps({ torch: !!capabilities.torch, zoom: capabilities.zoom });
          if (!nextDeviceId && settings.deviceId) setDeviceId(settings.deviceId);
        }
        setView('viewfinder');
        await refreshDevices();
      } catch {
        if (generation === generationRef.current) setView('unavailable');
      }
    },
    [refreshDevices, stopStream],
  );

  useEffect(() => {
    void startCamera(null, true);
    return () => {
      generationRef.current += 1;
      stopStream();
    };
  }, [startCamera, stopStream]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onDeviceChange = (): void => void refreshDevices();
    media.addEventListener('devicechange', onDeviceChange);
    return () => media.removeEventListener('devicechange', onDeviceChange);
  }, [refreshDevices]);

  // The capture ref is updated on every capture; teardown must not re-run per capture.
  const capturedRef = useRef<Captured | null>(null);
  useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  // Teardown: preview URL + scheduler + a pending reticle timer.
  useEffect(
    () => () => {
      schedulerRef.current?.cancel();
      schedulerRef.current = null;
      if (reticleTimerRef.current !== null) window.clearTimeout(reticleTimerRef.current);
      const current = capturedRef.current;
      if (current) safeRevoke(current.url);
    },
    [],
  );

  /* ---- level (best-effort; the sensor may not exist) --------------------- */

  useEffect(() => {
    if (!levelOn || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const onOrientation = (event: DeviceOrientationEvent): void => {
      if (event.gamma === null) return;
      setLevelOk(Math.abs(event.gamma) <= LEVEL_TOLERANCE_DEG);
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [levelOn]);

  /* ---- best-effort hardware hints --------------------------------------- */

  const track = (): MediaStreamTrack | null => streamRef.current?.getVideoTracks()[0] ?? null;

  const applyAdvanced = useCallback(async (set: ExtendedConstraintSet): Promise<void> => {
    const active = track();
    if (!active?.applyConstraints) return;
    try {
      await active.applyConstraints({ advanced: [set] });
    } catch {
      // Unsupported constraints reject — the viewfinder must never break over a hint.
    }
  }, []);

  const clearReticle = useCallback((): void => {
    if (reticleTimerRef.current !== null) window.clearTimeout(reticleTimerRef.current);
    reticleTimerRef.current = window.setTimeout(() => {
      reticleTimerRef.current = null;
      setReticle(null);
    }, RETICLE_HOLD_MS);
  }, []);

  const focusAt = useCallback(
    (x: number, y: number): void => {
      setReticle({ x, y, key: Date.now() });
      clearReticle();
      void applyAdvanced({ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' });
    },
    [applyAdvanced, clearReticle],
  );

  const lockFocusExposure = useCallback(
    (x: number, y: number): void => {
      setLocked(true);
      setReticle({ x, y, key: Date.now() });
      clearReticle();
      void applyAdvanced({ focusMode: 'manual', exposureMode: 'manual' });
    },
    [applyAdvanced, clearReticle],
  );

  const cancelLongPress = useCallback((): void => {
    const pending = longPressRef.current;
    if (pending) {
      window.clearTimeout(pending.timer);
      longPressRef.current = null;
    }
  }, []);

  const surfacePoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const host = surfaceRef.current;
    if (!host) return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const point = surfacePoint(event.clientX, event.clientY);
    const timer = window.setTimeout(() => {
      longPressRef.current = null;
      lockFocusExposure(point.x, point.y);
    }, LONG_PRESS_MS);
    longPressRef.current = { timer, x: point.x, y: point.y };
  };

  const onSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pending = longPressRef.current;
    if (!pending) return;
    const point = surfacePoint(event.clientX, event.clientY);
    if (Math.hypot(point.x - pending.x, point.y - pending.y) > LONG_PRESS_SLOP) cancelLongPress();
  };

  const onSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pending = longPressRef.current;
    if (!pending) return;
    cancelLongPress();
    focusAt(pending.x, pending.y);
  };

  /* ---- toggles ----------------------------------------------------------- */

  const toggleTorch = (): void => {
    const next = !torchOn;
    setTorchOn(next);
    void applyAdvanced({ torch: next });
  };

  const flipCamera = (): void => {
    if (devices.length === 0) return;
    const index = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(index + 1 + devices.length) % devices.length];
    setDeviceId(next.deviceId);
    void startCamera(next.deviceId, high);
  };

  const chooseDevice = (value: string): void => {
    setDeviceId(value);
    void startCamera(value, high);
  };

  const chooseResolution = (nextHigh: boolean): void => {
    if (nextHigh === high) return;
    setHigh(nextHigh);
    void startCamera(deviceId, nextHigh);
  };

  const chooseZoom = (value: ZoomStep): void => {
    setZoom(value);
    void applyAdvanced({ zoom: value });
  };

  const zoomSupported = Boolean(caps.zoom);

  /* ---- capture ----------------------------------------------------------- */

  const takePhoto = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    setFlash(true);
    try {
      const shot = await snapshotVideoFrame(video, delivered ?? { width: 1280, height: 720 });
      const url = safeObjectUrl(shot.blob);
      const next: Captured = { blob: shot.blob, url, width: shot.width, height: shot.height };
      capturedRef.current = next;
      setCaptured(next);
      setRotation(0);
      setFlying(true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, FLASH_MS));
      setView('review');
      window.setTimeout(() => setFlying(false), 360);
    } catch {
      // A frame grab failure is not a write failure: stay on the viewfinder.
    } finally {
      setFlash(false);
    }
  };

  const retake = (): void => {
    const current = capturedRef.current;
    if (current) safeRevoke(current.url);
    capturedRef.current = null;
    setCaptured(null);
    setRotation(0);
    setWrite('idle');
    setView('viewfinder');
  };

  const rotate = (): void => setRotation((value) => (value + 90) % 360);

  /* ---- write path -------------------------------------------------------- */

  const commit = useCallback(
    async (blob: Blob): Promise<void> => {
      setWrite('saving');
      try {
        const state = projectRef.current;
        if (!state) throw new Error('project is not open');
        // §7.2: capture time is read BEFORE normalize strips EXIF.
        const exif = await readExifInfo(blob);
        const oriented = rotation % 360 === 0 ? blob : await bakeRotation(blob, rotation);
        const normalized = await normalizeImage(oriented);
        const { sheet, projectFile: nextFile, sheetDir } = await addSheetFromPhoto(
          { blob: normalized.blob, width: normalized.width, height: normalized.height },
          {
            projectDir: state.dir,
            projectFile: state.file,
            projectId, // D51: the runtime key, never the bare id
            title: defaultSheetTitle(state.file),
            createdAt: exif.captureTime ?? new Date(),
          },
        );
        state.file = nextFile;

        // §7.3: 640×480 composite, written atomically into the sheet folder.
        schedulerRef.current?.cancel();
        schedulerRef.current = createThumbnailScheduler({
          write: (thumb) => writeAtomic(sheetDir, 'thumb.jpg', thumb, projectId),
        });
        schedulerRef.current.schedule(normalized.blob);

        setWrite('idle');
        onCaptured({ id: sheet.id, index: sheet.sortIndex });
      } catch {
        // A field photo is never trapped: keep the blob, offer Save a copy….
        setWrite('failed');
      }
    },
    [onCaptured, projectId, rotation],
  );

  const usePhoto = (): void => {
    const current = capturedRef.current;
    if (current) void commit(current.blob);
  };

  const retryWrite = (): void => {
    const current = capturedRef.current;
    if (current) void commit(current.blob);
  };

  const saveACopy = (): void => {
    const current = capturedRef.current;
    if (!current) return;
    const anchor = document.createElement('a');
    if (current.url) anchor.href = current.url;
    anchor.download = 'photo.jpg';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // allow re-importing the same file
    if (!file) return;
    await commit(file);
  };

  const openWindowsCamera = (): void => {
    // A web page cannot launch a desktop app. Best-effort protocol launch; verified on
    // hardware (the button's job is to not be a dead end — UI §10.1).
    try {
      window.open('ms-camera:', '_blank', 'noopener');
    } catch {
      // ignore
    }
  };

  /* ---- render ------------------------------------------------------------ */

  const fileInput = (
    <input
      ref={fileInputRef}
      className="camera-file-input"
      type="file"
      accept="image/*"
      aria-label={STRINGS.capture.importAPhoto}
      onChange={(e) => void handleImport(e)}
    />
  );

  const savingOverlay =
    write === 'saving' ? (
      <div className="camera-progress" role="status" aria-live="polite">
        <p className="camera-progress-label">{STRINGS.capture.adding}</p>
        <div className="camera-progress-track" aria-hidden="true">
          <div className="camera-progress-fill" />
        </div>
      </div>
    ) : null;

  const failureOverlay =
    write === 'failed' ? (
      <div className="camera-failure" role="alert">
        <div className="camera-failure-actions">
          <button type="button" className="btn btn-primary hit-slop" onClick={saveACopy}>
            {STRINGS.storage.saveACopy}
          </button>
          <button type="button" className="btn btn-secondary hit-slop" onClick={retryWrite}>
            {STRINGS.errors.retry}
          </button>
        </div>
      </div>
    ) : null;

  if (view === 'unavailable') {
    const fallback = fallbackCopyForDeviceMax(PROVISIONAL_DEVICE_MAX?.height ?? null);
    return (
      <main className="camera camera-panel-host">
        <div className="camera-panel" role="alert">
          <h1 className="camera-panel-title">{fallback.title}</h1>
          <p className="camera-panel-body">{fallback.body}</p>
          {fallback.promoted ? (
            <p className="camera-panel-promoted">{STRINGS.capture.useWindowsCameraPromoted}</p>
          ) : null}
          <div className="camera-panel-actions">
            <button type="button" className="btn btn-secondary hit-slop" onClick={openWindowsCamera}>
              {STRINGS.capture.openWindowsCamera}
            </button>
            <button
              type="button"
              className="btn btn-primary hit-slop"
              onClick={() => fileInputRef.current?.click()}
            >
              {STRINGS.capture.importAPhoto}
            </button>
          </div>
          <p className="camera-panel-privacy mono">{STRINGS.capture.cameraPrivacyNote}</p>
        </div>
        {fileInput}
        {savingOverlay}
        {failureOverlay}
      </main>
    );
  }

  if (view === 'review' && captured) {
    return (
      <main className="camera camera-review">
        <img
          className={`camera-review-image is-r${rotation}`}
          src={captured.url || undefined}
          alt=""
          data-rotation={rotation}
        />
        <div className="camera-review-actions">
          <button type="button" className="btn btn-secondary hit-slop" onClick={retake}>
            <RotateCcw aria-hidden="true" />
            <span>{STRINGS.capture.retake}</span>
          </button>
          <button
            type="button"
            className="camera-review-rotate hit-slop"
            aria-label={STRINGS.a11y.rotate}
            onClick={rotate}
          >
            <RotateCw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="camera-review-primary hit-slop"
            onClick={usePhoto}
            disabled={write === 'saving'}
          >
            <Check aria-hidden="true" />
            <span>{STRINGS.capture.usePhoto}</span>
          </button>
        </div>
        {fileInput}
        {savingOverlay}
        {failureOverlay}
      </main>
    );
  }

  /* ---- viewfinder -------------------------------------------------------- */

  const showDevicePicker = devices.length > 0 && devices.some((d) => d.label);

  return (
    <main className="camera">
      <video
        ref={videoRef}
        className="camera-video"
        autoPlay
        playsInline
        muted
        aria-hidden="true"
      />

      {gridOn ? <div className="camera-grid" aria-hidden="true" /> : null}
      {levelOn ? (
        <div className={`camera-level${levelOk ? ' is-ok' : ''}`} aria-hidden="true" />
      ) : null}
      {flying && captured ? (
        <div className="camera-fly" aria-hidden="true">
          <img className="camera-fly-image" src={captured.url || undefined} alt="" />
        </div>
      ) : null}

      {/* Pointer target for tap-to-focus / long-press AE-AF lock. Chrome sits above it. */}
      <div
        ref={surfaceRef}
        className="camera-surface"
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
      />

      {reticle ? (
        <svg className="camera-reticle-layer" aria-hidden="true">
          <g key={reticle.key} className="camera-reticle">
            <circle cx={reticle.x} cy={reticle.y} r={36} />
            <line x1={reticle.x - 48} y1={reticle.y} x2={reticle.x - 16} y2={reticle.y} />
            <line x1={reticle.x + 16} y1={reticle.y} x2={reticle.x + 48} y2={reticle.y} />
            <line x1={reticle.x} y1={reticle.y - 48} x2={reticle.x} y2={reticle.y - 16} />
            <line x1={reticle.x} y1={reticle.y + 16} x2={reticle.x} y2={reticle.y + 48} />
          </g>
        </svg>
      ) : null}

      {locked ? (
        <button
          type="button"
          className="camera-lock-chip hit-slop"
          onClick={() => setLocked(false)}
        >
          {STRINGS.capture.aeAfLock}
        </button>
      ) : null}

      <header className="camera-top">
        <button
          type="button"
          className="camera-close hit-slop"
          aria-label={STRINGS.capture.close}
          onClick={onCancel}
        >
          <X aria-hidden="true" />
          <span>{STRINGS.capture.close}</span>
        </button>
      </header>

      <div className="camera-toggles">
        <button
          type="button"
          className="camera-toggle hit-slop"
          aria-pressed={torchOn}
          aria-label={STRINGS.a11y.torch}
          onClick={toggleTorch}
        >
          <Zap aria-hidden="true" />
          <span className="camera-toggle-label">{STRINGS.capture.torch}</span>
        </button>
        <button
          type="button"
          className="camera-toggle hit-slop"
          aria-pressed={gridOn}
          aria-label={STRINGS.a11y.grid}
          onClick={() => setGridOn((value) => !value)}
        >
          <LayoutGrid aria-hidden="true" />
          <span className="camera-toggle-label">{STRINGS.capture.grid}</span>
        </button>
        <button
          type="button"
          className="camera-toggle hit-slop"
          aria-pressed={levelOn}
          aria-label={STRINGS.a11y.level}
          onClick={() => setLevelOn((value) => !value)}
        >
          <Minus aria-hidden="true" />
          <span className="camera-toggle-label">{STRINGS.capture.level}</span>
        </button>
        <button
          type="button"
          className="camera-toggle hit-slop"
          aria-label={STRINGS.a11y.cameraFlip}
          onClick={flipCamera}
        >
          <FlipHorizontal aria-hidden="true" />
          <span className="camera-toggle-label">{STRINGS.capture.flip}</span>
        </button>

        <div className="camera-res">
          <button
            type="button"
            className="camera-toggle hit-slop"
            aria-pressed={high}
            aria-label={STRINGS.capture.resolutionHigh}
            onClick={() => chooseResolution(true)}
          >
            <span className="camera-toggle-label">{STRINGS.capture.resolutionHigh}</span>
          </button>
          <button
            type="button"
            className="camera-toggle hit-slop"
            aria-pressed={!high}
            aria-label={STRINGS.capture.resolutionFast}
            onClick={() => chooseResolution(false)}
          >
            <span className="camera-toggle-label">{STRINGS.capture.resolutionFast}</span>
          </button>
          {delivered ? (
            <p className="camera-res-value mono" data-testid="camera-resolution">
              {formatResolution(delivered.width, delivered.height)}
            </p>
          ) : null}
        </div>

        {showDevicePicker ? (
          <select
            className="camera-device-hit mono"
            aria-label={STRINGS.a11y.cameraFlip}
            value={deviceId ?? ''}
            onChange={(e) => chooseDevice(e.currentTarget.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || device.deviceId}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="camera-bottom">
        <button
          type="button"
          className="camera-import hit-slop"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon aria-hidden="true" />
          <span>{STRINGS.capture.importButton}</span>
        </button>

        <button
          type="button"
          className="camera-shutter"
          aria-label={STRINGS.a11y.shutter}
          onClick={() => void takePhoto()}
        />

        <div className="camera-zoom">
          {ZOOM_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className="camera-zoom-chip hit-slop"
              aria-pressed={zoom === step}
              disabled={!zoomSupported}
              onClick={() => chooseZoom(step)}
            >
              {step === 0.5
                ? STRINGS.capture.zoomHalf
                : step === 1
                  ? STRINGS.capture.zoomOne
                  : STRINGS.capture.zoomTwo}
            </button>
          ))}
        </div>
      </div>

      {flash ? <div className="camera-flash" aria-hidden="true" /> : null}

      {fileInput}
      {savingOverlay}
      {failureOverlay}
    </main>
  );
}
