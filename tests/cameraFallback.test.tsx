/**
 * tests/cameraFallback.test.tsx — slice 1.4: the camera-unavailable panel, the §21.7
 * fallback-copy table, and the honest resolution label.
 *
 * jsdom project. Only `getUserMedia`/`enumerateDevices` and the fake File System Access
 * root are stubbed; CameraFlow is the real component.
 *
 * The gates this file makes machine-checkable:
 *  - Camera-denied → the fallback panel renders the EXACT `capture.embeddedFallback` copy
 *    (as text), both fallback buttons, and the OS privacy-setting note.
 *  - The §21.7 promoted-copy row: only a measured max ≤ 1080p promotes
 *    `«Use the Windows Camera app for detail shots»`. C3 could not measure (no camera on
 *    the build machine), so the provisional panel must NOT promote.
 *  - The resolution toggle shows the HONEST delivered max (track settings), never the
 *    sensor's marketing megapixels.
 */
import { STRINGS } from '../src/ui/strings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CameraFlow, {
  cropRectFor,
  fallbackCopyForDeviceMax,
  needsCrop,
  zoomPlan,
} from '../src/ui/CameraFlow';
import { initStore } from '../src/fs/projectStore';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  validProjectFile,
} from './fakes/fsa';

/* ------------------------------------------------------------------ *
 * Camera fakes
 * ------------------------------------------------------------------ */

function fakeTrack(
  width: number,
  height: number,
  deviceId: string,
  capabilities: Record<string, unknown> = { zoom: { min: 1, max: 4, step: 0.25 } },
) {
  return {
    kind: 'video' as const,
    getSettings: () => ({ width, height, deviceId }),
    getCapabilities: () => capabilities,
    applyConstraints: vi.fn(async () => {}),
    stop: vi.fn(),
  };
}

function fakeStream(track: ReturnType<typeof fakeTrack>) {
  return { getVideoTracks: () => [track], getTracks: () => [track] };
}

function installMedia(getUserMedia: ReturnType<typeof vi.fn>) {
  const media = {
    getUserMedia,
    enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-back', label: 'Back camera' },
      { kind: 'videoinput', deviceId: 'cam-front', label: 'Front camera' },
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: media, configurable: true });
  return media;
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

let restoreNavigator: (() => void) | null = null;

async function setup(): Promise<void> {
  const root = new FakeDir('root');
  root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ sheetCount: 1 })));
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  restoreNavigator?.();
  restoreNavigator = null;
});

function renderFlow(): void {
  render(
    <CameraFlow
      projectId="proj-1:Riverside"
      folderName="Riverside"
      onCaptured={() => {}}
      onCancel={() => {}}
    />,
  );
}

/* ------------------------------------------------------------------ *
 * §21.7 fallback-copy table (pure)
 * ------------------------------------------------------------------ */

describe('§21.7 — the promoted fallback copy row', () => {
  it('does not promote an UNMEASURED device (the C3 provisional case)', () => {
    const row = fallbackCopyForDeviceMax(null);
    expect(row.promoted).toBe(false);
    expect(row.title).toBe(STRINGS.capture.unavailable);
    expect(row.body).toBe(STRINGS.capture.embeddedFallback);
  });

  it('promotes only when the measured max is ≤ 1080p', () => {
    // §21.7: "Max is ≤ 1080p → Drop the toggle AND promote …". Boundary is inclusive.
    expect(fallbackCopyForDeviceMax(1080).promoted).toBe(true);
    expect(fallbackCopyForDeviceMax(720).promoted).toBe(true);
    // 2160p (4K) is above the boundary → no promotion.
    expect(fallbackCopyForDeviceMax(2160).promoted).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Camera denied
 * ------------------------------------------------------------------ */

describe('camera denied → the fallback panel', () => {
  it('renders the exact fallback copy, both buttons and the OS privacy note', async () => {
    await setup();
    installMedia(
      vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError');
      }),
    );
    renderFlow();

    // The exact UI-spec sentence, as TEXT.
    expect(
      await screen.findByText(STRINGS.capture.embeddedFallback),
    ).toBeTruthy();
    expect(screen.getByText(STRINGS.capture.unavailable)).toBeTruthy();

    // The two fallback buttons.
    expect(
      screen.getByRole('button', { name: STRINGS.capture.openWindowsCamera }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.capture.importAPhoto })).toBeTruthy();

    // The OS privacy-setting note (the #1 cause on managed devices).
    expect(screen.getByText(STRINGS.capture.cameraPrivacyNote)).toBeTruthy();

    // C3 is provisional (unmeasured) → the promoted line must NOT appear.
    expect(screen.queryByText(STRINGS.capture.useWindowsCameraPromoted)).toBeNull();
  });

  it('treats a missing getUserMedia implementation as unavailable, not a crash', async () => {
    await setup();
    // No mediaDevices at all, as in a non-secure context.
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });
    renderFlow();
    expect(await screen.findByText(STRINGS.capture.embeddedFallback)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ *
 * Resolution — always the camera's maximum; no High/Fast toggle, no readout
 * ------------------------------------------------------------------ */

describe('resolution — always the highest the camera offers', () => {
  it('has no High/Fast buttons, no torch and no resolution readout (owner decision)', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();

    await screen.findByRole('button', { name: STRINGS.a11y.shutter });
    expect(screen.queryByTestId('camera-resolution')).toBeNull();
    expect(screen.queryByRole('button', { name: /High \(device max\)|^Fast$|Torch/ })).toBeNull();
  });

  it('opens the stream asking far above any webcam so the browser lands on the device maximum', async () => {
    await setup();
    const getUserMedia = vi.fn(async (_constraints?: unknown) =>
      fakeStream(fakeTrack(1920, 1080, 'cam-back')),
    );
    installMedia(getUserMedia);
    renderFlow();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    const constraints = getUserMedia.mock.calls[0][0] as unknown as {
      video: { width: { ideal: number }; height: { ideal: number } };
    };
    // MAX_IDEAL in CameraFlow: 7680x4320, well above any webcam mode.
    expect(constraints.video.width.ideal).toBe(7680);
    expect(constraints.video.height.ideal).toBe(4320);
  });

  it('asks for the reported capability maximum when the opening request landed below it', async () => {
    await setup();
    // Delivers 1920x1080 although the camera reports up to 3264x2448 (a 4:3 sensor mode).
    const track = fakeTrack(1920, 1080, 'cam-back', {
      width: { min: 160, max: 3264 },
      height: { min: 120, max: 2448 },
    });
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    expect(track.applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 3264 },
      height: { ideal: 2448 },
    });
  });

  it('does not re-request when the camera already delivers its maximum', async () => {
    await setup();
    const track = fakeTrack(3264, 2448, 'cam-back', {
      width: { min: 160, max: 3264 },
      height: { min: 120, max: 2448 },
    });
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  it('offers the deviceId picker once the OS exposes camera labels', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();

    const picker = await screen.findByRole('combobox', { name: STRINGS.a11y.cameraFlip });
    expect(picker).toBeTruthy();
    expect(picker.textContent).toContain('Back camera');
    expect(picker.textContent).toContain('Front camera');
  });
});

/* ------------------------------------------------------------------ *
 * Zoom — hardware when the range covers it, a digital crop when not
 * ------------------------------------------------------------------ */

describe('zoomPlan (pure)', () => {
  it('uses the hardware when its reported range covers the step', () => {
    expect(zoomPlan(2, { min: 1, max: 4 })).toEqual({ hardware: 2, digital: 1 });
    expect(zoomPlan(1, { min: 1, max: 4 })).toEqual({ hardware: 1, digital: 1 });
  });

  it('crops digitally when there is no hardware zoom (the Surface webcam case that was dead)', () => {
    expect(zoomPlan(2, undefined)).toEqual({ hardware: null, digital: 2 });
    expect(zoomPlan(1, undefined)).toEqual({ hardware: null, digital: 1 });
  });

  it('crops digitally when the step is beyond the hardware max', () => {
    expect(zoomPlan(2, { min: 1, max: 1.5 })).toEqual({ hardware: null, digital: 2 });
  });

  it('never offers 0.5x unless the hardware can go wider than 1x', () => {
    expect(zoomPlan(0.5, undefined)).toBeNull();
    expect(zoomPlan(0.5, { min: 1, max: 4 })).toBeNull();
    expect(zoomPlan(0.5, { min: 0.5, max: 4 })).toEqual({ hardware: 0.5, digital: 1 });
  });
});

describe('cropRectFor / needsCrop (pure)', () => {
  it('2x digital zoom of a 4000x3000 frame is the centre 2000x1500', () => {
    // 4:3 view of a 4:3 frame: w=4000, h=3000; /2 -> 2000x1500; offset (4000-2000)/2=1000, (3000-1500)/2=750.
    expect(cropRectFor(4000, 3000, 4 / 3, 2)).toEqual({ sx: 1000, sy: 750, sw: 2000, sh: 1500 });
  });

  it('1x of a 4:3 still viewed as 16:9 is the centre 16:9 band', () => {
    // 16:9 inside 4000x3000: w=4000, h=4000/(16/9)=2250; offset y=(3000-2250)/2=375.
    expect(cropRectFor(4000, 3000, 16 / 9, 1)).toEqual({ sx: 0, sy: 375, sw: 4000, sh: 2250 });
  });

  it('needs no crop at 1x when the aspect already matches, and always crops when zoomed', () => {
    expect(needsCrop(1920, 1080, 16 / 9, 1)).toBe(false);
    expect(needsCrop(4000, 3000, 16 / 9, 1)).toBe(true);
    expect(needsCrop(1920, 1080, 16 / 9, 2)).toBe(true);
  });
});

describe('zoom chips', () => {
  it('applies the hardware zoom constraint when the track supports it', async () => {
    await setup();
    const track = fakeTrack(1920, 1080, 'cam-back');
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    await user.click(screen.getByRole('button', { name: STRINGS.capture.zoomTwo }));
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: STRINGS.capture.zoomTwo }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    expect(document.querySelector('.camera-video')?.className).not.toContain('is-digital-zoom');
  });

  it('WORKS with no hardware zoom: the chips are enabled and 2x is a digital crop', async () => {
    await setup();
    // No `zoom` capability at all - the Surface webcam case. The chips used to be disabled here.
    const track = fakeTrack(1920, 1080, 'cam-back', {});
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    const two = screen.getByRole('button', { name: STRINGS.capture.zoomTwo }) as HTMLButtonElement;
    expect(two.disabled).toBe(false);
    await user.click(two);

    await waitFor(() => expect(two.getAttribute('aria-pressed')).toBe('true'));
    expect(document.querySelector('.camera-video')?.className).toContain('is-digital-zoom-2');

    // Back to 1x removes the crop.
    await user.click(screen.getByRole('button', { name: STRINGS.capture.zoomOne }));
    await waitFor(() =>
      expect(document.querySelector('.camera-video')?.className).not.toContain('is-digital-zoom'),
    );
  });

  it('does not draw a 0.5x chip when the camera cannot go wider', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back', {}))));
    renderFlow();
    await screen.findByRole('button', { name: STRINGS.a11y.shutter });

    expect(screen.queryByRole('button', { name: STRINGS.capture.zoomHalf })).toBeNull();
    expect(screen.getByRole('button', { name: STRINGS.capture.zoomOne })).toBeTruthy();
  });
});
