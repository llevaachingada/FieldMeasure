/**
 * `src/ui/CameraFlow.tsx` — slice 1.4, the capture flow (build spec §11.8; UI spec
 * §10.1/§10.2/§17; implementation plan slice 1.4).
 *
 * WHAT THIS FILE OWNS
 *  - A full-bleed `getUserMedia` viewfinder: grid / level / flip toggles, a tap-to-focus
 *    reticle, long-press AE/AF lock, an 88 px shutter with a 120 ms flash, and a bottom
 *    bar (`Import` · shutter). The zoom chips sit above the bottom-right corner, clear of
 *    the VANGARDE watermark. The camera ALWAYS runs at the highest resolution it offers
 *    (owner decision: no High/Fast toggle, no torch, no resolution readout).
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
} from 'lucide-react';
import type { ProjectFile } from '@/domain/schema';
import { readExifInfo } from '@/media/exif';
import { normalizeImage } from '@/media/normalizeImage';
import { createThumbnailScheduler, type ThumbnailScheduler } from '@/media/thumbnails';
import {
  ensureRootAccess,
  getRootDir,
  pickRoot,
  queryRootWritePermission,
  readProjectFile,
  resolveOpenProjectDir,
  resolveProjectDir,
  StorageWriteError,
  writeAtomic,
} from '@/fs/projectStore';
import { addSheetFromPhoto, defaultSheetTitle } from '@/fs/sheetIntake';
import {
  CameraSession,
  MAX_IDEAL,
  cropRectFor,
  needsCrop,
  pickRearDeviceId,
  snapshotVideoFrame,
  zoomPlan,
  type ExtendedConstraintSet,
} from '@/media/cameraSession';
import { getAeAfLockEnabled } from '@/settings/capture';
import { useAppStore } from '@/state/appStore';
import { STRINGS } from './strings';
import './camera.css';

/* ------------------------------------------------------------------ *
 * Frozen interface (do not widen the three pinned props)
 * ------------------------------------------------------------------ */

export interface CameraFlowProps {
  /** D51 runtime key `${id}:${folderName}` — the Web Lock / queue / registry key. */
  projectId: string;
  /** Called AFTER the atomic write, with the new sheet's id and sort index. */
  onCaptured: (sheet: { id: string; index: number; title: string }) => void;
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

/** Zoom chips (UI §10.1: 0.5× / 1× / 2×). 0.5× only exists when the hardware can go wider. */
const ZOOM_STEPS = [0.5, 1, 2] as const;
type ZoomStep = (typeof ZOOM_STEPS)[number];

/* ------------------------------------------------------------------ *
 * Re-exported pure helpers — moved to `src/media/cameraSession.ts` (R4). Kept as
 * re-exports because `tests/cameraFallback.test.tsx` imports them from this module
 * and must stay unmodified.
 * ------------------------------------------------------------------ */
export { cropRectFor, needsCrop, zoomPlan, type CropRect } from '@/media/cameraSession';

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
  width?: { max?: number };
  height?: { max?: number };
  zoom?: { min?: number; max?: number; step?: number };
}

interface Captured {
  /** The shutter moment: recorded when the photo is TAKEN, not when «Use photo» is tapped. */
  at: Date;
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

interface ProjectState {
  dir: FileSystemDirectoryHandle;
  file: ProjectFile;
}

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

/**
 * What the capture flow must SAY when a photo cannot be filed (D103's lesson applied to the
 * capture path): the pre-fix screen showed two buttons and **no message at all**, and its
 * «Retry» re-ran the identical failing path, so a user could sit in it forever. Owner-reported
 * from a real run — the exact gap the handoff predicted only a real run would find.
 */
export interface CaptureFailure {
  /** Approved copy, or a marked `⚠ PROPOSED` line — never a blank `role="alert"`. */
  message: string;
  /** The recovery must re-ask for the folder write grant inside the click (§5.2). */
  needsGrant: boolean;
  /** The project folder never resolved, so the recovery must re-resolve it first. */
  needsResolve: boolean;
  /**
   * The grant is **denied** for this handle, which no prompt can fix — the recovery must re-pick
   * the folder (a fresh pick mints a fresh grant). Offering «Re-authorize» here would be a
   * button that cannot work.
   */
  needsRepick: boolean;
}

/** The recovery action's label — the action the cause actually needs. */
export function failureActionLabel(failure: CaptureFailure | null): string {
  if (failure?.needsRepick) return STRINGS.storage.rePickFolder;
  if (failure?.needsGrant) return STRINGS.errors.reAuthorize;
  return STRINGS.errors.retry;
}

/**
 * Where the save has got to. Shown while it runs, so a save that never finishes NAMES the step
 * it is stuck on instead of spinning («Adding…» covers the image work; «Saving…» the folder
 * write) — a real run reported being "stuck on adding…", and the two have different causes.
 */
export type SaveStage = 'idle' | 'prepare' | 'write';

/** The saving overlay's label for a stage (approved copy only — no new strings). */
export function savingLabel(stage: SaveStage): string {
  return stage === 'write' ? STRINGS.storage.saving : STRINGS.capture.adding;
}

/**
 * How long a save may run before the app stops claiming progress. A write CAN hang rather than
 * fail — a Web Lock held by an earlier stuck write, or an OS-level lock in another app — and a
 * pending promise never reaches the `catch`, so without this the photo stays trapped behind a
 * spinner forever (`navigator.locks.request` has no timeout and queues silently). Generous on
 * purpose: a slow disk is not a failure.
 */
export const SAVE_TIMEOUT_MS = 30_000;

/**
 * How long «Use photo» waits on the browser's folder-permission prompt before going ahead with
 * the write anyway (which then fails honestly and offers the recovery). 60 s = 2 × the save
 * watchdog: reading a permission prompt is a person deciding, not a stuck disk.
 */
export const GRANT_PROMPT_TIMEOUT_MS = 60_000;

/**
 * Arm the bounded-wait timer for a save. Returns the cancel function.
 *
 * Extracted so the mechanism is testable WITHOUT the camera flow: the first attempt to test it
 * end to end had to fight the capture's own async path under fake timers (and a queued mock
 * leaked into the next test), which is the trap `docs/review-brief.md` §8 names — a test that
 * depends on an environment which cannot exercise the path. The DOM half (the stage label and
 * the photo staying on screen) is pinned with real timers instead.
 */
export function createSaveWatchdog(onTimeout: () => void, ms: number = SAVE_TIMEOUT_MS): () => void {
  const id = window.setTimeout(onTimeout, ms);
  return () => window.clearTimeout(id);
}

/** The `StorageWriteError` kind, duck-typed so a duplicated class identity cannot defeat it. */
function writeFailureKind(e: unknown): 'permission' | 'target-locked' | 'disk-full' | 'unknown' {
  const kind = (e as { kind?: unknown } | null)?.kind;
  if (kind === 'permission' || kind === 'target-locked' || kind === 'disk-full') return kind;
  return 'unknown';
}

/** Map a thrown write failure to the copy and the recovery it actually needs. */
export function describeWriteFailure(e: unknown): CaptureFailure {
  const kind = writeFailureKind(e);
  if (kind === 'permission') {
    // The one case a bare «Retry» cannot fix: the grant has to be re-asked for (§5.2/§5.3) — or,
    // if the browser reports it `denied`, re-picked (the caller decides once it has queried).
    return {
      message: STRINGS.errors.folderPermissionExpired,
      needsGrant: true,
      needsResolve: false,
      needsRepick: false,
    };
  }
  if (kind === 'target-locked') {
    return {
      message: STRINGS.errors.fileOpenAnotherApp,
      needsGrant: false,
      needsResolve: false,
      needsRepick: false,
    };
  }
  if (kind === 'disk-full') {
    return {
      message: STRINGS.errors.notEnoughDiskSpace,
      needsGrant: false,
      needsResolve: false,
      needsRepick: false,
    };
  }
  return {
    message: STRINGS.capture.saveFailed,
    needsGrant: false,
    needsResolve: false,
    needsRepick: false,
  };
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */export default function CameraFlow({
  projectId,
  onCaptured,
  onCancel,
  folderName,
}: CameraFlowProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** R4: one `CameraSession` per mount — owns acquisition, zoom and capture (`src/media/cameraSession.ts`). */
  const sessionRef = useRef<CameraSession | null>(null);
  if (sessionRef.current === null) sessionRef.current = new CameraSession();
  const session = sessionRef.current;
  const projectRef = useRef<ProjectState | null>(null);
  /** The armed bounded-wait timer for an in-flight save (cleared on unmount, not left behind). */
  const watchdogRef = useRef<(() => void) | null>(null);
  /** True while a save's promise is unsettled — even after the bounded wait stopped waiting. */
  const inFlightRef = useRef(false);
  const schedulerRef = useRef<ThumbnailScheduler | null>(null);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  const reticleTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<View>('starting');
  const [write, setWrite] = useState<WriteState>('idle');
  /** Why the last write failed — the overlay must never be a blank `role="alert"`. */
  const [failure, setFailure] = useState<CaptureFailure | null>(null);
  /** Which step of the save is running, so a hang names itself. */
  const [stage, setStage] = useState<SaveStage>('idle');
  /** Whether a save is still unsettled (drives whether an in-place retry is safe to offer). */
  const [inFlight, setInFlight] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<Delivered | null>(null);
  const [caps, setCaps] = useState<CameraCaps>({});
  const [zoom, setZoom] = useState<ZoomStep>(1);
  /** The crop the preview shows for the chosen zoom (1 when the hardware did the zooming). */
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [gridOn, setGridOn] = useState(false);
  const [levelOn, setLevelOn] = useState(false);
  const [levelOk, setLevelOk] = useState(false);
  const [locked, setLocked] = useState(false);
  const [reticle, setReticle] = useState<{ x: number; y: number; key: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const [flying, setFlying] = useState(false);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [rotation, setRotation] = useState(0);

  /**
   * D146: AE/AF lock default off (owner request). The store may already know the answer
   * (`aeAfLockEnabled` — set elsewhere in the session, e.g. Settings just toggled it); the
   * persisted value is also read on mount in case the store hasn't hydrated yet. Either
   * source turning it on is enough — a long-press does nothing until one does.
   */
  const storeAeAfLockEnabled = useAppStore((s) => s.aeAfLockEnabled);
  const [persistedAeAfLockEnabled, setPersistedAeAfLockEnabled] = useState(false);
  const aeAfLockEnabled = storeAeAfLockEnabled || persistedAeAfLockEnabled;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const enabled = await getAeAfLockEnabled();
        if (alive && enabled) setPersistedAeAfLockEnabled(true);
      } catch {
        // No IndexedDB (or a read failure): keep the safe default (off).
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- project resolution (once per project) ----------------------------- */

  /**
   * Resolve the project folder. Extracted from the effect below so «Retry» can genuinely
   * re-run it: before this, a folder that failed to resolve left `projectRef.current === null`
   * forever, so every subsequent «Use photo» / «Retry» threw `'project is not open'` and the
   * user sat in the same failure — owner-reported from a real run.
   */
  const resolveProject = useCallback(async (): Promise<ProjectState | null> => {
    try {
      const dir = await resolveProjectFolder(projectId, folderName);
      const file = await readProjectFile(dir);
      return { dir, file };
    } catch {
      // No project folder (moved, renamed, a revoked handle, an unreadable project.json): the
      // camera still works and the photo is never trapped, but nothing can be filed — which
      // the UI now says out loud instead of offering a Retry that cannot work.
      return null;
    }
  }, [projectId, folderName]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const state = await resolveProject();
      if (alive) projectRef.current = state;
    })();
    return () => {
      alive = false;
    };
  }, [resolveProject]);

  // A save interrupted by a route change must not leave its timer behind to fire setState on
  // an unmounted component (and the sheet it may still write is the shell's business, not a
  // stale overlay's).
  useEffect(
    () => () => {
      watchdogRef.current?.();
      watchdogRef.current = null;
    },
    [],
  );

  /* ---- camera lifecycle -------------------------------------------------- */

  const stopStream = useCallback((): void => {
    session.stop();
  }, [session]);

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
    async (nextDeviceId: string | null): Promise<void> => {
      setDelivered(null);
      try {
        // D146: rear camera by default. `nextDeviceId` is only `null` on the initial mount
        // (a flip or the device picker always passes an explicit id, which is "honour the
        // remembered device" — unchanged below). `facingMode` is never used for selection
        // (unreliable on Windows, §11.8) — `enumerateDevices()` labels decide.
        let requestDeviceId = nextDeviceId;
        let useFacingHint = false;
        if (!nextDeviceId) {
          const media = navigator.mediaDevices;
          let candidates: MediaDeviceInfo[] = [];
          if (media?.enumerateDevices) {
            try {
              candidates = (await media.enumerateDevices()).filter((d) => d.kind === 'videoinput');
            } catch {
              candidates = [];
            }
          }
          const rearId = pickRearDeviceId(candidates);
          if (rearId) {
            requestDeviceId = rearId;
          } else {
            // No label matched (most likely no permission yet, so labels are empty): pass
            // `facingMode` only as a HINT for the opening request, then re-select by label
            // once real labels exist below.
            useFacingHint = true;
          }
        }
        const result = await session.start(videoRef.current, {
          audio: false,
          video: {
            ...(requestDeviceId ? { deviceId: { exact: requestDeviceId } } : {}),
            ...(useFacingHint ? { facingMode: { ideal: 'environment' } } : {}),
            ...MAX_IDEAL,
          },
        });
        if (result.superseded) return;
        if (result.track) {
          // The HONEST size: what the track actually delivers (only the snapshot fallback reads it).
          setDelivered(result.delivered);
          setCaps({ zoom: result.capabilities.zoom });
          setZoom(1);
          setDigitalZoom(1);
          if (!nextDeviceId && result.deviceId) setDeviceId(result.deviceId);
        }
        setView('viewfinder');
        await refreshDevices();
        // Labels may only exist now that permission was just granted: if the opening request
        // could only use the facingMode hint, re-check by label and switch to the rear device
        // if the hint didn't land on it.
        if (!nextDeviceId && useFacingHint) {
          const media = navigator.mediaDevices;
          if (media?.enumerateDevices) {
            try {
              const after = (await media.enumerateDevices()).filter((d) => d.kind === 'videoinput');
              const rearId = pickRearDeviceId(after);
              if (rearId && rearId !== result.deviceId) {
                await startCamera(rearId);
                return;
              }
            } catch {
              // Best-effort re-select: keep whatever the facingMode hint delivered.
            }
          }
        }
      } catch {
        // `session.start` only throws when this attempt is still the current one (an older,
        // superseded attempt resolves instead of throwing) — see `CameraSession.start`.
        setView('unavailable');
      }
    },
    [refreshDevices, session],
  );

  useEffect(() => {
    void startCamera(null);
    return () => {
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

  /**
   * Best-effort hardware hint (D108: a control must never report success when the hardware
   * refused). Delegates to `CameraSession.applyAdvanced`, which keeps the same never-throw
   * contract.
   */
  const applyAdvanced = useCallback(
    (set: ExtendedConstraintSet): Promise<boolean> => session.applyAdvanced(set),
    [session],
  );

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
    // D146: AE/AF lock default off (owner request). With the setting off, no timer is armed
    // to lock — no lock, no chip, no announcement — but `longPressRef` still tracks the point
    // so a quick tap still reaches `onSurfacePointerUp`'s tap-to-focus below.
    const timer = aeAfLockEnabled
      ? window.setTimeout(() => {
          longPressRef.current = null;
          lockFocusExposure(point.x, point.y);
        }, LONG_PRESS_MS)
      : -1;
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

  const flipCamera = (): void => {
    if (devices.length === 0) return;
    const index = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(index + 1 + devices.length) % devices.length];
    setDeviceId(next.deviceId);
    void startCamera(next.deviceId);
  };

  const chooseDevice = (value: string): void => {
    setDeviceId(value);
    void startCamera(value);
  };

  /**
   * Zoom that works on every camera. The chips used to be `disabled` unless the track reported a
   * hardware zoom range, and Surface webcams do not, so all three were permanently dead. Now a step
   * is served by the hardware when its range covers it, and by a digital centre crop (the preview
   * scales, the captured frame is cropped identically) when it does not. The pressed chip is set
   * from what actually applied, never from the intent (D108's lesson).
   */
  const chooseZoom = async (value: ZoomStep): Promise<void> => {
    // `CameraSession.setZoom` runs the exact plan this used to compute inline (hardware when the
    // range covers the step, else a digital crop) and returns `null` for the two "leave state
    // alone" cases: a step not offered at all, or a hardware range that the driver refused below 1×.
    const result = await session.setZoom(value);
    if (!result) return;
    setZoom(value);
    setDigitalZoom(result.digitalZoom);
  };

  const visibleZoomSteps = ZOOM_STEPS.filter((step) => zoomPlan(step, caps.zoom) !== null);

  /* ---- capture ----------------------------------------------------------- */

  const takePhoto = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    const shutterAt = new Date();
    setFlash(true);
    try {
      const fallbackSize = delivered ?? { width: 1280, height: 720 };
      // The still-capture path first (the camera's true maximum), then a frame of the preview —
      // `CameraSession.capture` runs both at the session's current digital zoom.
      const shot = await session.capture(video, fallbackSize);
      const url = safeObjectUrl(shot.blob);
      const next: Captured = { at: shutterAt, blob: shot.blob, url, width: shot.width, height: shot.height };
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
    async (
      blob: Blob,
      options: { askGrant?: boolean; repick?: boolean; capturedAt?: Date } = {},
    ): Promise<void> => {
      setWrite('saving');
      setStage('prepare');
      setFailure(null);
      // ONE save in flight at a time. After the bounded wait below the visible state is
      // `failed` while the write is still PENDING, so without this guard a «Retry» (or a second
      // «Use photo») would queue a second write behind the stuck one — and if the first ever
      // lands, the project gets two sheets. A ref for the guard, state for the render.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setInFlight(true);

      // PRIMARY path: re-acquire the folder grant NOW, while the «Use photo» tap's activation
      // window is still open. The grant does not survive a reload (§5.2) — and the camera is the
      // heaviest thing this app does, so a tab discard or renderer restart after a capture is
      // exactly when it gets lost. Before this, the first save after that always failed and the
      // owner fell into «Re-authorize» / «Re-pick folder» (and from there into Settings). It
      // queries first, so a held grant costs nothing and never prompts; it never throws, and a
      // refusal is reported honestly by the write itself below. Asked BEFORE the watchdog so time
      // spent reading the browser's prompt is not counted as a stuck folder.
      if (options.repick !== true && options.askGrant !== true) {
        // Bounded, so a prompt the browser never settles can still never trap the photo.
        let timer = 0;
        try {
          await Promise.race([
            ensureRootAccess({ request: true }),
            new Promise<void>((resolve) => {
              timer = window.setTimeout(resolve, GRANT_PROMPT_TIMEOUT_MS);
            }),
          ]);
        } catch {
          // Not fatal: the write below reports the real cause.
        } finally {
          window.clearTimeout(timer);
        }
      }

      // A save can HANG — a Web Lock held by an earlier stuck write, or an OS lock held by
      // another app — and a pending promise never reaches the `catch` below, so without this
      // the photo stays trapped behind a spinner forever (`navigator.locks.request` has no
      // timeout and queues silently). Generous on purpose: a slow disk is not a failure.
      const stopWatchdog = createSaveWatchdog(() => {
        setFailure({
          message: STRINGS.capture.folderNotResponding,
          needsGrant: false,
          needsResolve: false,
          needsRepick: false,
        });
        setWrite('failed');
      });
      watchdogRef.current = stopWatchdog;

      try {
        // §5.2: the write grant does not survive a page load and can only be re-asked for
        // inside a user gesture. The primary path asked above, bounded and non-throwing; the
        // recovery buttons below are the stricter forms: «Re-authorize» (`askGrant`) treats a
        // refusal as the failure, and «Re-pick folder» (`repick`) mints a fresh grant.
        if (options.repick === true) {
          // A `denied` grant cannot be re-asked for, so re-pick the folder: a fresh pick mints a
          // fresh grant (`pickRoot` persists the handle and re-inits the store). A cancelled
          // picker throws `AbortError` — nothing changed, so the failure goes back on screen.
          //
          // GUARDED: from inside a project the natural mistake is to pick the PROJECT folder, and
          // adopting that silently replaced the projects root (Home then listed the wrong folder
          // and the owner re-chose it in Settings). `mustContain` refuses any folder that is not
          // the root and does not hold this project, and leaves the saved root untouched.
          try {
            await pickRoot({ mustContain: folderName ?? folderNameFromProjectId(projectId) });
          } catch (e) {
            if ((e as { name?: unknown } | null)?.name === 'RootMismatchError') {
              setFailure({
                message: STRINGS.errors.projectUnavailable,
                needsGrant: false,
                needsResolve: false,
                needsRepick: true,
              });
            } else {
              // Cancelled picker: the grant is still `denied`, so put the SAME recovery back. The
              // failure was cleared at the top of this call; leaving it null here offered a plain
              // «Retry» that re-asked a `denied` grant — a button that cannot work.
              setFailure({
                message: STRINGS.errors.folderPermissionExpired,
                needsGrant: true,
                needsResolve: false,
                needsRepick: true,
              });
            }
            setWrite('failed');
            return;
          }
          // The project handle resolved before the re-pick belongs to the old grant.
          projectRef.current = null;
        } else if (options.askGrant === true) {
          if (!(await ensureRootAccess({ request: true }))) {
            throw new StorageWriteError('permission', new Error('the folder write grant was refused'));
          }
        }

        let state = projectRef.current;
        if (!state) {
          // Re-resolve ONCE, so «Retry» is a real second attempt rather than a guaranteed
          // repeat — the loop the owner was stuck in.
          state = await resolveProject();
          projectRef.current = state;
          if (!state) {
            setFailure({
              message: STRINGS.errors.projectUnavailable,
              needsGrant: false,
              needsResolve: true,
              needsRepick: false,
            });
            setWrite('failed');
            return;
          }
        }

        // §7.2: capture time is read BEFORE normalize strips EXIF.
        const exif = await readExifInfo(blob);
        const oriented = rotation % 360 === 0 ? blob : await bakeRotation(blob, rotation);
        const normalized = await normalizeImage(oriented);
        // The folder work starts here: the overlay's label follows the stage, so a save that
        // never finishes says WHICH step it is on.
        setStage('write');
        const { sheet, projectFile: nextFile, sheetDir } = await addSheetFromPhoto(
          { blob: normalized.blob, width: normalized.width, height: normalized.height },
          {
            projectDir: state.dir,
            projectFile: state.file,
            projectId, // D51: the runtime key, never the bare id
            title: defaultSheetTitle(state.file),
            createdAt: exif.captureTime ?? new Date(),
            capturedAt: options.capturedAt ?? exif.captureTime ?? new Date(),
          },
        );
        state.file = nextFile;

        // §7.3: 640×480 composite, written atomically into the sheet folder.
        //
        // FLUSHED BEFORE THE HAND-OFF, not left to the debounce. This component unmounts the
        // moment `onCaptured` fires (the shell closes the capture overlay), and its cleanup
        // cancels the scheduler — so the pending 3 s debounce died with it and `thumb.jpg` was
        // NEVER written for a captured sheet: every grid card could only show its placeholder.
        // Found by the clickthru harness reading the sheet directory on disk (D125); the unit
        // test had only asserted that `schedule()` was *called*. The debounce still serves
        // repeated edits — a one-shot capture flushes.
        const scheduler = createThumbnailScheduler({
          write: (thumb) => writeAtomic(sheetDir, 'thumb.jpg', thumb, projectId),
        });
        schedulerRef.current?.cancel();
        schedulerRef.current = scheduler;
        scheduler.schedule(normalized.blob);
        try {
          await scheduler.flush();
        } catch {
          // Best-effort: the photo and the row are already durable, and a thumbnail that could
          // not be generated is the card's honest placeholder — never a failed save.
        }

        setWrite('idle');
        onCaptured({ id: sheet.id, index: sheet.sortIndex, title: sheet.title });
      } catch (e) {
        // A field photo is never trapped: keep the blob and offer Save a copy… — and SAY why
        // it could not be filed, with the action the cause actually needs (§13.4, D103).
        const base = describeWriteFailure(e);
        // A permission failure is only recoverable IN PLACE if the browser can still ask. Once
        // the grant is `denied` for this handle, `requestPermission` resolves `denied` without a
        // prompt (executed: the owner's profile reported `denied`), so «Re-authorize» would be a
        // button that cannot work — the honest action is a re-pick, which mints a fresh grant.
        const needsRepick =
          base.needsGrant && (await queryRootWritePermission()) === 'denied';
        setFailure({ ...base, needsRepick });
        setWrite('failed');
      } finally {
        stopWatchdog();
        watchdogRef.current = null;
        inFlightRef.current = false;
        setInFlight(false);
        setStage('idle');
      }
    },
    [folderName, onCaptured, projectId, resolveProject, rotation],
  );

  const usePhoto = (): void => {
    const current = capturedRef.current;
    if (current) void commit(current.blob, { capturedAt: current.at });
  };

  const retryWrite = (): void => {
    const current = capturedRef.current;
    // The recovery is the gesture that may prompt — or, when the grant is `denied`, re-pick the
    // folder (only a fresh pick can mint a new grant). §5.2.
    if (current) {
      void commit(current.blob, {
        askGrant: true,
        repick: failure?.needsRepick === true,
        capturedAt: current.at,
      });
    }
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
    // An import's capture time: its EXIF, else the file's own date (never "now": it was not taken now).
    const exif = await readExifInfo(file);
    await commit(file, { capturedAt: exif.captureTime ?? new Date(file.lastModified) });
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
        {/* The label follows the STAGE: «Adding…» is the image work, «Saving…» is the folder
            write — so a save that never finishes names the step it is stuck on (both lines are
            already-approved copy; a real run could not tell which one it was in). */}
        <p className="camera-progress-label">{savingLabel(stage)}</p>
        <div className="camera-progress-track" aria-hidden="true">
          <div className="camera-progress-fill" />
        </div>
      </div>
    ) : null;

  const failureOverlay =
    write === 'failed' ? (
      <div className="camera-failure" role="alert">
        {/* The reason FIRST. The pre-fix overlay was a blank `role="alert"` holding two
            buttons, which is exactly why a real run reported being "stuck": nothing on
            screen said what had failed, and «Retry» re-ran the same failing path. */}
        <p className="camera-failure-message">{failure?.message ?? STRINGS.capture.saveFailed}</p>
        <div className="camera-failure-actions">
          {/* The recovery the cause needs: a lost folder grant must be re-asked for inside
              this click (§5.2) — a plain «Retry» can never fix it. While the write is STILL
              pending (the bounded wait gave up, not the write) no in-place retry is offered at
              all: queuing a second write behind a stuck one is how a project ends up with two
              sheets. Save a copy… is always safe. */}
          {inFlight ? null : (
            <button type="button" className="btn btn-primary hit-slop" onClick={retryWrite}>
              {failureActionLabel(failure)}
            </button>
          )}
          <button type="button" className="btn btn-secondary hit-slop" onClick={saveACopy}>
            {STRINGS.storage.saveACopy}
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
        className={`camera-video${digitalZoom > 1 ? ` is-digital-zoom-${digitalZoom}` : ''}`}
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
          {visibleZoomSteps.map((step) => (
            <button
              key={step}
              type="button"
              className="camera-zoom-chip hit-slop"
              aria-pressed={zoom === step}
              onClick={() => void chooseZoom(step)}
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
