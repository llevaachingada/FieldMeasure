/**
 * `src/media/cameraSession.ts` — R4 (beta readiness fix plan §7), extracted from
 * `src/ui/CameraFlow.tsx`. Owns `getUserMedia` acquisition, track/zoom capability
 * probing, the digital-zoom crop, frame capture (still-capture-first, preview-frame
 * fallback) and stream teardown. UI state (view, overlays, toggles, long-press,
 * the write/commit path) stays in `CameraFlow` — this class is DOM-adjacent (it
 * takes a `<video>` element to attach a stream to and to read frames from) but has
 * no React and no knowledge of the capture/save flow above it.
 *
 * Every behaviour here is moved verbatim from `CameraFlow.tsx`'s `startCamera`,
 * `applyAdvanced`, `chooseZoom`, `takePhoto` and `stopStream` — see the R4 report
 * for the catch-by-catch mapping.
 */

/** `MediaTrackConstraintSet` plus the Chromium-only members we probe best-effort. */
export type ExtendedConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
  pointsOfInterest?: Array<{ x: number; y: number }>;
  focusMode?: string;
  exposureMode?: string;
};

export interface CameraCaps {
  width?: { max?: number };
  height?: { max?: number };
  zoom?: { min?: number; max?: number; step?: number };
}

export type CameraSessionStatus = 'idle' | 'starting' | 'live' | 'unavailable' | 'stopped';

export interface CameraStartResult {
  /** True when a later `start()` landed before this one — the caller must no-op. */
  superseded: boolean;
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  capabilities: CameraCaps;
  /** The HONEST delivered size (only the snapshot fallback reads it). */
  delivered: { width: number; height: number } | null;
  deviceId: string | null;
}

interface ImageCaptureLike {
  getPhotoCapabilities?: () => Promise<{ imageWidth?: { max?: number }; imageHeight?: { max?: number } }>;
  takePhoto: (settings?: { imageWidth: number; imageHeight: number }) => Promise<Blob>;
}

/** Within this ratio a still's aspect is "the same framing as the preview" (no crop needed). */
const ASPECT_TOLERANCE = 0.02;

/* ------------------------------------------------------------------ *
 * Exported pure helpers (unit-testable, no DOM) — moved verbatim
 * ------------------------------------------------------------------ */

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The centre crop of a `srcW × srcH` frame that shows what the viewfinder shows: the preview's
 * aspect (`viewAspect`, width / height) at a digital `zoom` (≥ 1). Digital zoom is a real crop —
 * it costs pixels, and the photo has exactly the pixels the user framed. Pure.
 */
export function cropRectFor(srcW: number, srcH: number, viewAspect: number, zoom: number): CropRect {
  // Largest viewAspect-shaped rectangle inside the source…
  let w = srcW;
  let h = srcW / viewAspect;
  if (h > srcH) {
    h = srcH;
    w = srcH * viewAspect;
  }
  // …then shrunk by the digital zoom.
  const z = Math.max(1, zoom);
  const sw = Math.max(1, Math.round(w / z));
  const sh = Math.max(1, Math.round(h / z));
  return { sx: Math.round((srcW - sw) / 2), sy: Math.round((srcH - sh) / 2), sw, sh };
}

/** Whether a still needs cropping at all (same framing as the preview, and no digital zoom). */
export function needsCrop(srcW: number, srcH: number, viewAspect: number, zoom: number): boolean {
  if (zoom > 1) return true;
  return Math.abs(srcW / srcH / viewAspect - 1) > ASPECT_TOLERANCE;
}

/**
 * How a chip is served. Hardware zoom when the track's reported range covers the step; a digital
 * crop for any step ≥ 1 otherwise; and 0.5× only when the hardware can genuinely go wider.
 * `null` = the step is not offered (a chip that could not do what it says is not drawn).
 */
export function zoomPlan(
  step: number,
  range: { min?: number; max?: number } | undefined,
): { hardware: number | null; digital: number } | null {
  const min = range?.min;
  const max = range?.max;
  const hardwareOk = min !== undefined && max !== undefined && step >= min && step <= max;
  if (hardwareOk) return { hardware: step, digital: 1 };
  if (step < 1) return null;
  return { hardware: null, digital: step };
}

/**
 * The largest photo the camera will give. `ImageCapture.takePhoto` returns the still-capture
 * resolution, which on most cameras exceeds the video stream's; where it is missing or throws
 * (jsdom, Firefox, a driver that refuses), the caller falls back to a frame of the preview.
 */
async function takeStillAtMax(track: MediaStreamTrack): Promise<Blob | null> {
  const Ctor = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
  if (!Ctor) return null;
  try {
    const capture = new Ctor(track);
    const caps = await capture.getPhotoCapabilities?.();
    const width = caps?.imageWidth?.max;
    const height = caps?.imageHeight?.max;
    return await capture.takePhoto(width && height ? { imageWidth: width, imageHeight: height } : undefined);
  } catch {
    return null;
  }
}

/** Crop a still to the preview's framing at a digital zoom, re-encoded as a high-quality JPEG. */
async function cropStill(
  blob: Blob,
  viewAspect: number,
  zoom: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    if (!needsCrop(bitmap.width, bitmap.height, viewAspect, zoom)) {
      return { blob, width: bitmap.width, height: bitmap.height };
    }
    const rect = cropRectFor(bitmap.width, bitmap.height, viewAspect, zoom);
    const canvas = document.createElement('canvas');
    canvas.width = rect.sw;
    canvas.height = rect.sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95),
    );
    if (!out) throw new Error('JPEG encode failed');
    return { blob: out, width: rect.sw, height: rect.sh };
  } finally {
    bitmap.close();
  }
}

/**
 * Grab one frame from the live `<video>` as a JPEG. The real size comes from the
 * element (`videoWidth`/`videoHeight`); the fallback is the track's reported settings
 * (a not-yet-painted video element reports 0×0).
 */
export async function snapshotVideoFrame(
  video: HTMLVideoElement,
  fallback: { width: number; height: number },
  digitalZoom = 1,
): Promise<{ blob: Blob; width: number; height: number }> {
  const width = Math.max(1, Math.round(video.videoWidth || fallback.width));
  const height = Math.max(1, Math.round(video.videoHeight || fallback.height));
  // Digital zoom is a centre crop of the frame — the photo is what the preview showed.
  const rect = cropRectFor(width, height, width / height, digitalZoom);
  const canvas = document.createElement('canvas');
  canvas.width = rect.sw;
  canvas.height = rect.sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95),
  );
  if (!blob) throw new Error('JPEG encode failed');
  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * The opening request: far above any webcam, so the browser's "closest to ideal" rule lands on
 * the largest mode the device offers (a 4096×2160 ask used to cap 4:3 sensors below their max).
 * `start()` then reads the track's capabilities and asks for the exact reported maximum.
 */
export const MAX_IDEAL = { width: { ideal: 7680 }, height: { ideal: 4320 } } as const;

/* ------------------------------------------------------------------ *
 * CameraSession
 * ------------------------------------------------------------------ */

export class CameraSession {
  private streamValue: MediaStream | null = null;
  private trackValue: MediaStreamTrack | null = null;
  private capsValue: CameraCaps = {};
  private digitalZoomValue = 1;
  private epoch = 0;
  private statusValue: CameraSessionStatus = 'idle';

  get status(): CameraSessionStatus {
    return this.statusValue;
  }

  get stream(): MediaStream | null {
    return this.streamValue;
  }

  get track(): MediaStreamTrack | null {
    return this.trackValue;
  }

  get caps(): CameraCaps {
    return this.capsValue;
  }

  get digitalZoom(): number {
    return this.digitalZoomValue;
  }

  private stopInternal(): void {
    this.streamValue?.getTracks().forEach((t) => t.stop());
    this.streamValue = null;
    this.trackValue = null;
  }

  /**
   * Acquire the camera and attach it to `video` (pass `null` in tests that don't have one).
   * Mirrors `CameraFlow`'s old `startCamera`: a generation counter discards a stream that lost a
   * race to a newer `start()` call (rapid device-flip taps), the track's capabilities are probed
   * and, when the opening request landed below the capability maximum, a best-effort follow-up
   * `applyConstraints` asks for the camera's true maximum (a hint that must never break the
   * viewfinder, so its own failure is swallowed).
   */
  async start(
    video: HTMLVideoElement | null,
    constraints: MediaStreamConstraints,
  ): Promise<CameraStartResult> {
    const generation = ++this.epoch;
    this.stopInternal();
    this.statusValue = 'starting';
    try {
      const media = navigator.mediaDevices;
      if (!media?.getUserMedia) throw new Error('getUserMedia is unavailable');
      const stream = await media.getUserMedia(constraints);
      if (generation !== this.epoch) {
        // A newer start() already won the race — discard this one's tracks silently, exactly
        // as the pre-extraction `if (generation !== generationRef.current)` branch did.
        stream.getTracks().forEach((t) => t.stop());
        return { superseded: true, stream: null, track: null, capabilities: {}, delivered: null, deviceId: null };
      }
      this.streamValue = stream;
      if (video) video.srcObject = stream;

      const track = stream.getVideoTracks()[0] ?? null;
      this.trackValue = track;
      let capabilities: CameraCaps = {};
      let delivered: { width: number; height: number } | null = null;
      let deviceId: string | null = null;
      if (track) {
        capabilities = (track.getCapabilities?.() ?? {}) as unknown as CameraCaps;
        // Highest resolution the camera offers: if the opening request landed below the
        // capability maximum (a browser may weigh aspect over size), ask for the maximum outright.
        const first = track.getSettings();
        const capW = capabilities.width?.max ?? 0;
        const capH = capabilities.height?.max ?? 0;
        if (capW > 0 && capH > 0 && ((first.width ?? 0) < capW || (first.height ?? 0) < capH)) {
          try {
            await track.applyConstraints({ width: { ideal: capW }, height: { ideal: capH } });
          } catch {
            // Keep whatever the camera settled on: a hint must never break the viewfinder.
          }
        }
        const settings = track.getSettings();
        const width = settings.width ?? 0;
        const height = settings.height ?? 0;
        delivered = width > 0 && height > 0 ? { width, height } : null;
        deviceId = settings.deviceId ?? null;
      }
      this.capsValue = { zoom: capabilities.zoom };
      this.digitalZoomValue = 1;
      this.statusValue = 'live';
      return { superseded: false, stream, track, capabilities, delivered, deviceId };
    } catch (e) {
      // Only claim `unavailable` if nothing newer superseded this attempt in the meantime —
      // matches the old `if (generation === generationRef.current) setView('unavailable')`.
      if (generation === this.epoch) {
        this.statusValue = 'unavailable';
        throw e;
      }
      return { superseded: true, stream: null, track: null, capabilities: {}, delivered: null, deviceId: null };
    }
  }

  /**
   * Best-effort hardware hint. Returns whether the device actually ACCEPTED it. A rejected or
   * unsupported constraint must never break the viewfinder (the catch stays), but a control that
   * reports success when the hardware refused is a lie — see D108. Callers that only want the
   * hint ignore the return value.
   */
  async applyAdvanced(set: ExtendedConstraintSet): Promise<boolean> {
    const active = this.trackValue;
    if (!active?.applyConstraints) return false;
    try {
      await active.applyConstraints({ advanced: [set] });
      return true;
    } catch {
      // Unsupported constraints reject — the viewfinder must never break over a hint.
      return false;
    }
  }

  /**
   * Zoom that works on every camera. A step is served by the hardware when its range covers it,
   * and by a digital centre crop otherwise. Returns `null` when the step is not offered at all
   * (`zoomPlan` returned `null`) or when the hardware advertised the range but the driver refused
   * it for a step below 1× — in both cases the caller must leave its own zoom state unchanged,
   * matching the old `chooseZoom`'s bare `return;`.
   */
  async setZoom(step: number): Promise<{ digitalZoom: number } | null> {
    const plan = zoomPlan(step, this.capsValue.zoom);
    if (!plan) return null;
    if (plan.hardware !== null) {
      const applied = await this.applyAdvanced({ zoom: plan.hardware });
      if (applied) {
        this.digitalZoomValue = 1;
        return { digitalZoom: 1 };
      }
      // The hardware refused (the range was advertised, the driver disagreed): crop instead.
      if (step < 1) return null;
      this.digitalZoomValue = step;
      return { digitalZoom: step };
    }
    // A digital step: hand the hardware back to its minimum first, or the crop would compound.
    if (this.capsValue.zoom?.min !== undefined) void this.applyAdvanced({ zoom: this.capsValue.zoom.min });
    this.digitalZoomValue = plan.digital;
    return { digitalZoom: plan.digital };
  }

  /**
   * Grab a photo at the session's current digital zoom: the still-capture path first (the
   * camera's true maximum), falling back to a frame of the preview. Any failure in the
   * still/crop path falls back rather than throwing; only `snapshotVideoFrame`'s own failure
   * propagates — matches the old `takePhoto`'s inner try/catch around `cropStill`.
   */
  async capture(
    video: HTMLVideoElement,
    fallbackSize: { width: number; height: number },
  ): Promise<{ blob: Blob; width: number; height: number }> {
    const active = this.trackValue;
    let shot: { blob: Blob; width: number; height: number } | null = null;
    const still = active ? await takeStillAtMax(active) : null;
    if (still) {
      try {
        const viewAspect =
          (video.videoWidth || fallbackSize.width) / (video.videoHeight || fallbackSize.height);
        shot = await cropStill(still, viewAspect, this.digitalZoomValue);
      } catch {
        shot = null;
      }
    }
    if (!shot) shot = await snapshotVideoFrame(video, fallbackSize, this.digitalZoomValue);
    return shot;
  }

  /** Stop every track exactly once (idempotent — a second call finds nothing left to stop). */
  stop(): void {
    this.stopInternal();
    this.statusValue = 'stopped';
  }
}
