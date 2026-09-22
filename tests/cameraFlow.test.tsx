/**
 * tests/cameraFlow.test.tsx — slice 1.4: capture → review → Use, write failure, import.
 *
 * jsdom project. The camera, the canvas frame-grab and the three media modules that need
 * a real browser (`createImageBitmap` / `OffscreenCanvas` / `Worker`) are mocked here;
 * everything downstream of `addSheetFromPhoto` is the REAL storage stack writing into the
 * in-memory File System Access tree (`tests/fakes/fsa.ts`), so "the sheet lands on disk"
 * is asserted on actual bytes, not on a spy.
 *
 * Not tested here (needs a real browser, D40 or a [Surface] pen/touch walk): actual video
 * frames, torch/zoom hardware constraints, rotation baking (`bakeRotation`, which decodes
 * via `createImageBitmap`). The rotate CONTROL's state change is asserted instead.
 */
import { STRINGS } from '../src/ui/strings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createThumbnailScheduler } from '@/media/thumbnails';
import { normalizeImage } from '@/media/normalizeImage';
import CameraFlow from '../src/ui/CameraFlow';
import { initStore } from '../src/fs/projectStore';
import { parseProjectFile, type ProjectFile } from '../src/domain/schema';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  validProjectFile,
  type FakeHooks,
} from './fakes/fsa';

/* ------------------------------------------------------------------ *
 * Module mocks (hoisted)
 * ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn() }));

vi.mock('@/media/thumbnails', () => ({
  createThumbnailScheduler: vi.fn(() => ({
    schedule: hoisted.schedule,
    flush: vi.fn(async () => {}),
    cancel: hoisted.cancel,
    pending: false,
  })),
}));

vi.mock('@/media/normalizeImage', () => ({
  normalizeImage: vi.fn(async () => ({
    blob: new Blob(['normalized-photo'], { type: 'image/jpeg' }),
    width: 4000,
    height: 3000,
  })),
}));

vi.mock('@/media/exif', () => ({
  readExifInfo: vi.fn(async () => ({
    orientation: null,
    captureTime: new Date('2026-09-21T14:12:00.000Z'),
    hasGps: false,
  })),
}));

/* ------------------------------------------------------------------ *
 * Camera / canvas fakes
 * ------------------------------------------------------------------ */

function fakeTrack(width: number, height: number, deviceId: string) {
  return {
    kind: 'video' as const,
    getSettings: () => ({ width, height, deviceId }),
    getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 4, step: 0.25 } }),
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

let root: FakeDir;
let restoreNavigator: (() => void) | null = null;

/** Fresh fake root + fake navigator + canvas stubs. Call at the top of every test. */
async function setup(testHooks: FakeHooks = {}): Promise<void> {
  root = new FakeDir('root', testHooks);
  root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ sheetCount: 1 })));
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['frame'], { type: 'image/jpeg' }));
  });
  // jsdom has no createObjectURL.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
}

beforeEach(() => {
  hoisted.schedule.mockClear();
  hoisted.cancel.mockClear();
  vi.mocked(createThumbnailScheduler).mockClear();
});

afterEach(() => {
  cleanup();
  restoreNavigator?.();
  restoreNavigator = null;
  vi.restoreAllMocks();
});

function renderFlow(onCaptured = vi.fn(), onCancel = vi.fn()) {
  render(
    <CameraFlow
      projectId="proj-1:Riverside"
      folderName="Riverside"
      onCaptured={onCaptured}
      onCancel={onCancel}
    />,
  );
  return { onCaptured, onCancel };
}

/** `parseProjectFile`'s zod result is a discriminated union — narrow it once. */
function readProject(raw: string): ProjectFile {
  const parsed = parseProjectFile(raw);
  if (!parsed.success) throw new Error(`invalid project.json: ${parsed.error}`);
  return parsed.data;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('capture → review → Use photo', () => {
  it('writes photo.jpg, appends one sheet, schedules the thumbnail, and fires onCaptured', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow();
    const user = userEvent.setup();

    // The stream is live once the honest resolution readout appears.
    expect(await screen.findByTestId('camera-resolution')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));

    // Review screen: the three actions, no auto-enhance slot.
    expect(await screen.findByRole('button', { name: STRINGS.capture.usePhoto })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.capture.retake })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.a11y.rotate })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: STRINGS.capture.usePhoto }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));

    // photo.jpg landed on disk.
    const sheetsDir = root.childDir('Riverside/sheets');
    const ids = [...sheetsDir.children.keys()];
    expect(ids).toHaveLength(1);
    const sheetId = ids[0];
    expect(root.has(`Riverside/sheets/${sheetId}/photo.jpg`)).toBe(true);

    // project.json gained exactly one sheet with the normalized dimensions + EXIF time.
    const parsed = readProject(root.textAt('Riverside/project.json'));
    const sheets = parsed.sheets;
    expect(sheets).toHaveLength(2); // 1 pre-existing + 1 captured
    const added = sheets[1];
    expect(added).toMatchObject({
      imageWidth: 4000,
      imageHeight: 3000,
      sortIndex: 1,
      createdAt: '2026-09-21T14:12:00.000Z',
    });
    expect(onCaptured).toHaveBeenCalledWith({ id: added.id, index: 1 });

    // The thumbnail was scheduled, and its write targets sheets/<id>/thumb.jpg.
    expect(hoisted.schedule).toHaveBeenCalledTimes(1);
    const options = vi.mocked(createThumbnailScheduler).mock.calls[0][0];
    await options.write(new Blob(['thumb'], { type: 'image/jpeg' }));
    expect(root.has(`Riverside/sheets/${sheetId}/thumb.jpg`)).toBe(true);
  });

  it('Import uses the same intake path (a File → one sheet)', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow();
    await screen.findByTestId('camera-resolution');

    const input = screen.getByLabelText(STRINGS.capture.importAPhoto) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'site.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    expect(root.filePaths().filter((p) => p.endsWith('/photo.jpg'))).toHaveLength(1);
  });

  it('shows the inline «Adding…» progress while the capture is written', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    // Hold the normalize step open so the write is observably in flight.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(normalizeImage).mockImplementationOnce(async () => {
      await gate;
      return { blob: new Blob(['normalized'], { type: 'image/jpeg' }), width: 4000, height: 3000 };
    });

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    expect(await screen.findByText(STRINGS.capture.adding)).toBeTruthy();

    await act(async () => {
      release();
    });
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
  });
});

describe('write failure — a field photo is never trapped', () => {
  it('keeps the photo in memory, offers Save a copy…, and leaves project.json unchanged', async () => {
    await setup({
      beforeWrite: (file) => {
        if (file.name === 'photo.jpg.tmp') {
          throw new DOMException('target locked', 'NoModificationAllowedError');
        }
      },
    });
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    // Save a copy… is offered.
    expect(
      await screen.findByRole('button', { name: STRINGS.storage.saveACopy }),
    ).toBeTruthy();

    // The photo is still in memory (the review preview survives the failure).
    expect(document.querySelector('.camera-review-image')).not.toBeNull();

    // No partial photo on disk, and no sheet added.
    expect(root.filePaths().filter((p) => p.endsWith('/photo.jpg'))).toHaveLength(0);
    const parsed = readProject(root.textAt('Riverside/project.json'));
    expect(parsed.sheets).toHaveLength(1);
  });
});

describe('a11y — keyboard operability and labelling', () => {
  it('the shutter is keyboard-operable with Enter', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();

    const shutter = await screen.findByRole('button', { name: STRINGS.a11y.shutter });
    shutter.focus();
    expect(document.activeElement).toBe(shutter);

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: STRINGS.capture.usePhoto })).toBeTruthy();
  });

  it('every viewfinder control is a labelled button (aria-label / aria-pressed)', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();

    expect(await screen.findByRole('button', { name: STRINGS.a11y.shutter })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.capture.close })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.a11y.torch })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.a11y.grid })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.a11y.level })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.a11y.cameraFlip })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.capture.importButton })).toBeTruthy();

    // The three viewfinder toggles are pressed-state switches.
    for (const label of [STRINGS.a11y.torch, STRINGS.a11y.grid, STRINGS.a11y.level]) {
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    }
  });

  it('the grid overlay appears when the Grid toggle is pressed', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    expect(document.querySelector('.camera-grid')).toBeNull();
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.grid }));
    expect(document.querySelector('.camera-grid')).not.toBeNull();
    expect(screen.getByRole('button', { name: STRINGS.a11y.grid }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('tap-to-focus shows a reticle; long-press shows the AE/AF lock chip', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    await screen.findByTestId('camera-resolution');

    const surface = document.querySelector('.camera-surface') as HTMLElement;
    expect(surface).not.toBeNull();

    // Tap → reticle layer with a circle.
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 90 });
    fireEvent.pointerUp(surface, { clientX: 120, clientY: 90 });
    expect(document.querySelector('.camera-reticle circle')).not.toBeNull();

    // Long-press → AE/AF lock chip (a labelled button, so it is keyboard-reachable too).
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(surface, { clientX: 60, clientY: 60 });
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
      expect(screen.getByRole('button', { name: STRINGS.capture.aeAfLock })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the review Rotate control changes the stored rotation state', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await screen.findByRole('button', { name: STRINGS.capture.usePhoto });

    const image = document.querySelector('.camera-review-image') as HTMLElement;
    expect(image.getAttribute('data-rotation')).toBe('0');
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.rotate }));
    expect(image.getAttribute('data-rotation')).toBe('90');
  });
});
