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
import CameraFlow, { fallbackCopyForDeviceMax, formatResolution } from '../src/ui/CameraFlow';
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
  capabilities: Record<string, unknown> = { torch: true, zoom: { min: 1, max: 4, step: 0.25 } },
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
 * Honest resolution label
 * ------------------------------------------------------------------ */

describe('resolution toggle — the honest delivered max', () => {
  it('labels the modes as approved and shows the delivered pixels, never the sensor MP', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();

    const readout = await screen.findByTestId('camera-resolution');
    // 1920×1080 delivered by the (fake) track → the readout is the real number.
    expect(readout.textContent).toBe(formatResolution(1920, 1080));

    const high = screen.getByRole('button', { name: STRINGS.capture.resolutionHigh });
    const fast = screen.getByRole('button', { name: STRINGS.capture.resolutionFast });
    expect(high.textContent).toBe('High (device max)');
    expect(fast.textContent).toBe('Fast');
    expect(high.getAttribute('aria-pressed')).toBe('true');
    expect(fast.getAttribute('aria-pressed')).toBe('false');

    // The label must not promise sensor megapixels.
    expect(high.textContent).not.toMatch(/\d+\s*MP|megapixel/i);
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

  it('switching to Fast restarts the stream with the fast (720p-class) constraints', async () => {
    await setup();
    const getUserMedia = vi.fn(async (_constraints?: unknown) =>
      fakeStream(fakeTrack(1920, 1080, 'cam-back')),
    );
    installMedia(getUserMedia);
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.capture.resolutionFast }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));

    const constraints = getUserMedia.mock.calls[1][0] as unknown as {
      video: { width: { ideal: number }; height: { ideal: number } };
    };
    // FAST_IDEAL from CameraFlow: 1280×720 (UI §10.1).
    expect(constraints.video.width.ideal).toBe(1280);
    expect(constraints.video.height.ideal).toBe(720);
    expect(screen.getByRole('button', { name: STRINGS.capture.resolutionFast }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

/* ------------------------------------------------------------------ *
 * Zoom — disabled when the device cannot zoom
 * ------------------------------------------------------------------ */

describe('zoom chips', () => {
  it('applies the zoom constraint when the track supports zoom', async () => {
    await setup();
    const track = fakeTrack(1920, 1080, 'cam-back');
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.capture.zoomTwo }));
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] });
  });

  it('disables the chips when the track reports no zoom capability', async () => {
    await setup();
    // torch only — no `zoom` in the capabilities.
    installMedia(
      vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back', { torch: false }))),
    );
    renderFlow();
    await screen.findByTestId('camera-resolution');

    const chip = screen.getByRole('button', { name: STRINGS.capture.zoomOne });
    expect((chip as HTMLButtonElement).disabled).toBe(true);
  });
});
