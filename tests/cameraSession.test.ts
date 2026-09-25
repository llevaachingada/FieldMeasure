/**
 * `tests/cameraSession.test.ts` — R4 (beta readiness fix plan §7), node project.
 *
 * `CameraSession` (`src/media/cameraSession.ts`) is DOM-adjacent but has no React; these
 * tests fake just `navigator.mediaDevices.getUserMedia` and a `MediaStreamTrack` (only the
 * fields the class actually reads), matching the "build `PointerEvent`-like plain objects
 * with only the fields the code reads" style used elsewhere in this suite.
 *
 * Covers: zoom clamping (a hardware range that the driver refuses below 1× must leave the
 * zoom unchanged, never go negative/sub-1 digitally), the digital-zoom fallback when the
 * track advertises no `zoom` capability at all, and `stop()` stopping every track exactly
 * once (including a second, idempotent call).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraSession, pickRearDeviceId } from '../src/media/cameraSession';

/* ------------------------------------------------------------------ *
 * Fakes — only the members CameraSession reads
 * ------------------------------------------------------------------ */

interface FakeCaps {
  width?: { max?: number };
  height?: { max?: number };
  zoom?: { min?: number; max?: number; step?: number };
}

class FakeTrack {
  stopCount = 0;
  applyCalls: Array<MediaTrackConstraints | undefined> = [];
  /** Set to make the next `applyConstraints({ advanced })` call reject (hardware refusal). */
  rejectAdvancedZoom = false;

  constructor(
    private readonly caps: FakeCaps,
    private settings: { width?: number; height?: number; deviceId?: string } = {},
  ) {}

  getCapabilities(): FakeCaps {
    return this.caps;
  }

  getSettings(): { width?: number; height?: number; deviceId?: string } {
    return this.settings;
  }

  async applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    this.applyCalls.push(constraints);
    const advanced = (constraints as { advanced?: Array<{ zoom?: number }> }).advanced;
    if (advanced?.some((set) => set.zoom !== undefined) && this.rejectAdvancedZoom) {
      throw new Error('zoom rejected by driver');
    }
  }

  stop(): void {
    this.stopCount += 1;
  }
}

class FakeStream {
  constructor(private readonly tracks: FakeTrack[]) {}
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks;
  }
}

/** Installs a fake `navigator.mediaDevices.getUserMedia` returning `stream` (or throwing). */
function installFakeMediaDevices(resolve: () => FakeStream | never): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: vi.fn(async () => resolve()),
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Zoom clamping
 * ------------------------------------------------------------------ */

describe('CameraSession.setZoom — hardware clamping', () => {
  it('applies a hardware zoom when the track range covers the step', async () => {
    const track = new FakeTrack({ zoom: { min: 1, max: 3 } });
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(2);

    expect(result).toEqual({ digitalZoom: 1 });
    expect(session.digitalZoom).toBe(1);
    expect(track.applyCalls).toEqual([{ advanced: [{ zoom: 2 }] }]);
  });

  it('leaves the zoom unchanged (never a sub-1 digital crop) when the hardware advertises a range but the driver refuses a step below 1x', async () => {
    const track = new FakeTrack({ zoom: { min: 0.5, max: 3 } });
    track.rejectAdvancedZoom = true;
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(0.5);

    expect(result).toBeNull();
    // digitalZoom stays at the value `start()` set (1) — no clamp to a negative/sub-1 crop.
    expect(session.digitalZoom).toBe(1);
  });

  it('falls back to a digital crop (>= the requested step) when the hardware advertises the range but the driver refuses a step >= 1x', async () => {
    const track = new FakeTrack({ zoom: { min: 1, max: 3 } });
    track.rejectAdvancedZoom = true;
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(2);

    expect(result).toEqual({ digitalZoom: 2 });
    expect(session.digitalZoom).toBe(2);
  });

  it('a step the hardware range does not cover, and that is below 1x, is not offered at all', async () => {
    const track = new FakeTrack({ zoom: { min: 1, max: 3 } });
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(0.5);

    expect(result).toBeNull();
    expect(session.digitalZoom).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Digital-zoom fallback with no zoom capability
 * ------------------------------------------------------------------ */

describe('CameraSession.setZoom — no hardware zoom capability', () => {
  it('serves every step >= 1x as a digital crop when the track reports no zoom capability', async () => {
    const track = new FakeTrack({}); // no `zoom` key at all — e.g. most Surface webcams
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(2);

    expect(result).toEqual({ digitalZoom: 2 });
    expect(session.digitalZoom).toBe(2);
    // No hardware zoom was ever attempted — only the initial capability probe's constraints
    // call (none here, since width/height already matched), so `applyConstraints` was never
    // reached for zoom.
    expect(track.applyCalls.some((c) => (c as { advanced?: unknown[] })?.advanced)).toBe(false);
  });

  it('does not offer a step below 1x when there is no hardware zoom to serve it', async () => {
    const track = new FakeTrack({});
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    const result = await session.setZoom(0.5);

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * stop() — every track stopped exactly once
 * ------------------------------------------------------------------ */

describe('CameraSession.stop', () => {
  it('stops every track in the stream exactly once', async () => {
    const trackA = new FakeTrack({});
    const trackB = new FakeTrack({});
    installFakeMediaDevices(() => new FakeStream([trackA, trackB]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    session.stop();

    expect(trackA.stopCount).toBe(1);
    expect(trackB.stopCount).toBe(1);
    expect(session.status).toBe('stopped');
    expect(session.stream).toBeNull();
    expect(session.track).toBeNull();
  });

  it('is idempotent: a second stop() call does not stop the tracks again', async () => {
    const track = new FakeTrack({});
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();
    await session.start(null, { video: true });

    session.stop();
    session.stop();

    expect(track.stopCount).toBe(1);
  });

  it('a new start() stops the previous stream exactly once before acquiring the next', async () => {
    const first = new FakeTrack({});
    const second = new FakeTrack({});
    let call = 0;
    installFakeMediaDevices(() => {
      call += 1;
      return (call === 1 ? new FakeStream([first]) : new FakeStream([second])) as unknown as FakeStream;
    });
    const session = new CameraSession();
    await session.start(null, { video: true });
    await session.start(null, { video: true });

    expect(first.stopCount).toBe(1);
    expect(second.stopCount).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * pickRearDeviceId — rear camera by default (owner request, D146)
 * ------------------------------------------------------------------ */

describe('pickRearDeviceId', () => {
  it('picks the device whose label matches back/rear/environment/world (case-insensitive)', () => {
    expect(
      pickRearDeviceId([
        { deviceId: 'cam-front', label: 'Front Camera' },
        { deviceId: 'cam-back', label: 'Back Camera' },
      ]),
    ).toBe('cam-back');
    expect(pickRearDeviceId([{ deviceId: 'x', label: 'REAR facing camera' }])).toBe('x');
    expect(pickRearDeviceId([{ deviceId: 'x', label: 'World Facing 0' }])).toBe('x');
    expect(pickRearDeviceId([{ deviceId: 'x', label: 'camera2 0, facing environment' }])).toBe(
      'x',
    );
  });

  it('returns the first match when more than one label matches', () => {
    expect(
      pickRearDeviceId([
        { deviceId: 'a', label: 'Rear camera 1' },
        { deviceId: 'b', label: 'Rear camera 2' },
      ]),
    ).toBe('a');
  });

  it('returns null when no label matches (including empty labels — no permission yet)', () => {
    expect(pickRearDeviceId([])).toBeNull();
    expect(pickRearDeviceId([{ deviceId: 'a', label: '' }])).toBeNull();
    expect(pickRearDeviceId([{ deviceId: 'a', label: 'Integrated Webcam' }])).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * start() basics (acquisition + capability probe), to pin the seam the UI relies on
 * ------------------------------------------------------------------ */

describe('CameraSession.start', () => {
  it('reports the delivered size and zoom capability from the track', async () => {
    const track = new FakeTrack({ zoom: { min: 1, max: 3 } }, { width: 1920, height: 1080 });
    installFakeMediaDevices(() => new FakeStream([track]) as unknown as FakeStream);
    const session = new CameraSession();

    const result = await session.start(null, { video: true });

    expect(result.superseded).toBe(false);
    expect(result.delivered).toEqual({ width: 1920, height: 1080 });
    expect(result.capabilities.zoom).toEqual({ min: 1, max: 3 });
    expect(session.status).toBe('live');
  });

  it('marks the session unavailable and rethrows when getUserMedia is missing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: {} },
    });
    const session = new CameraSession();

    await expect(session.start(null, { video: true })).rejects.toThrow('getUserMedia is unavailable');
    expect(session.status).toBe('unavailable');
  });
});
