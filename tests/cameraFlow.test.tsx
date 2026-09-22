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

// A permission failure is only recoverable in place if the browser can still ASK. This suite
// overrides the two store functions that decide that; everything else stays real (the fsa fake).
vi.mock('@/fs/projectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/fs/projectStore')>()),
  queryRootWritePermission: vi.fn(async () => 'granted'),
  pickRoot: vi.fn(async () => undefined),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createThumbnailScheduler } from '@/media/thumbnails';
import { normalizeImage } from '@/media/normalizeImage';
import CameraFlow, {
  createSaveWatchdog,
  failureActionLabel,
  SAVE_TIMEOUT_MS,
  savingLabel,
} from '../src/ui/CameraFlow';
import { pickRoot, queryRootWritePermission } from '../src/fs/projectStore';
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

const hoisted = vi.hoisted(() => ({
  schedule: vi.fn(),
  flush: vi.fn(async () => {}),
  cancel: vi.fn(),
}));

vi.mock('@/media/thumbnails', () => ({
  createThumbnailScheduler: vi.fn(() => ({
    schedule: hoisted.schedule,
    flush: hoisted.flush,
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
  hoisted.flush.mockClear();
  hoisted.cancel.mockClear();
  vi.mocked(createThumbnailScheduler).mockClear();
});

afterEach(() => {
  cleanup();
  restoreNavigator?.();
  restoreNavigator = null;
  vi.restoreAllMocks();
});

function renderFlow(
  onCaptured = vi.fn(),
  onCancel = vi.fn(),
  folderName = 'Riverside',
) {
  render(
    <CameraFlow
      projectId="proj-1:Riverside"
      folderName={folderName}
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
      // §20.6 gaps of 10: the fixture's one existing sheet is at `10 × (0 + 1) = 10`, so
      // the append is `max(live) + 10 = 20`. (Until session 22 the fixture was 0-based and
      // this pin said `1`; `nextSortIndex` is now the single place that decides.)
      sortIndex: 20,
      createdAt: '2026-09-21T14:12:00.000Z',
    });
    // The payload carries the written sheet's title as well as its id/index: the Project
    // screen's «Added …» toast (UI §11.8) names the sheet, and re-deriving the name from the
    // index would be a second source of truth.
    expect(onCaptured).toHaveBeenCalledWith({ id: added.id, index: 20, title: added.title });

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

    // …and the overlay SAYS what failed. Before this fix it was a blank `role="alert"` with
    // two buttons, which is exactly why a real run read as "stuck" (owner-reported).
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(STRINGS.errors.fileOpenAnotherApp);
    expect(screen.getByRole('button', { name: STRINGS.errors.retry })).toBeTruthy();

    // The photo is still in memory (the review preview survives the failure).
    expect(document.querySelector('.camera-review-image')).not.toBeNull();

    // No partial photo on disk, and no sheet added.
    expect(root.filePaths().filter((p) => p.endsWith('/photo.jpg'))).toHaveLength(0);
    const parsed = readProject(root.textAt('Riverside/project.json'));
    expect(parsed.sheets).toHaveLength(1);
  });

  it('a refused write grant says so and offers Re-authorize — a bare Retry could never fix it', async () => {
    await setup({
      beforeWrite: (file) => {
        if (file.name === 'photo.jpg.tmp') {
          throw new DOMException('the write grant was refused', 'NotAllowedError');
        }
      },
    });
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(STRINGS.errors.folderPermissionExpired);
    // The action matches the cause: a lost grant must be re-asked for inside the click (§5.2),
    // which is why the label is «Re-authorize» and not the generic «Retry».
    expect(screen.getByRole('button', { name: STRINGS.errors.reAuthorize })).toBeTruthy();
    expect(screen.queryByRole('button', { name: STRINGS.errors.retry })).toBeNull();
  });

  it('a project folder that never resolved says so, and Retry is a real second attempt', async () => {
    // The owner-reported dead end: the folder failed to resolve, everything after it threw
    // `'project is not open'`, and the overlay repeated the identical failure forever — with
    // no message on screen. This pins the honest message AND that the recovery works.
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow(vi.fn(), vi.fn(), 'Nope'); // not in the root, not registered
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(STRINGS.errors.projectUnavailable);
    // The photo is kept, not trapped.
    expect(document.querySelector('.camera-review-image')).not.toBeNull();
    expect(onCaptured).not.toHaveBeenCalled();

    // The folder is there now (the user reconnected/re-picked it): «Retry» must re-resolve it
    // and file the photo rather than repeating the failure.
    root.putFile('Nope/project.json', JSON.stringify(validProjectFile({ sheetCount: 0 })));
    await user.click(screen.getByRole('button', { name: STRINGS.errors.retry }));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    expect(readProject(root.textAt('Nope/project.json')).sheets).toHaveLength(1);
    expect(root.filePaths().filter((p) => p.endsWith('/photo.jpg'))).toHaveLength(1);
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

  it('the torch toggle reverts when the device refuses the constraint (D108)', async () => {
    await setup();
    const track = fakeTrack(1920, 1080, 'cam-back');
    // A Windows tablet: the platform does not expose `torch`, so the advanced constraint rejects.
    (track.applyConstraints as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Unsupported constraint'),
    );
    installMedia(vi.fn(async () => fakeStream(track)));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.torch }));

    await waitFor(() =>
      expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] }),
    );
    // The button must NOT claim the LED is on when the hardware refused it.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: STRINGS.a11y.torch }).getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });

  it('the torch toggle stays pressed when the hardware accepts it', async () => {
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.torch }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: STRINGS.a11y.torch }).getAttribute('aria-pressed'),
      ).toBe('true'),
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
describe('a save that never finishes names its stage and gives the photo back (owner-reported hang)', () => {
  it('labels the two stages with approved copy, and bounds the wait', () => {
    // The real run could not say WHICH step it was stuck on: «Adding…» is the image work and
    // «Saving…» is the folder write, and the two have different causes. Both lines are
    // already-approved copy, so naming the stage costs no new wording.
    expect(savingLabel('prepare')).toBe(STRINGS.capture.adding);
    expect(savingLabel('write')).toBe(STRINGS.storage.saving);
    // The bounded wait is finite and generous: a slow disk is not a failure, but an app that
    // claims progress forever is worse than one that admits it is waiting.
    expect(Number.isFinite(SAVE_TIMEOUT_MS)).toBe(true);
    expect(SAVE_TIMEOUT_MS).toBeGreaterThan(5000);
  });

  it('the bounded-wait timer fires once, and not at all when the save settles first', () => {
    // Pinned WITHOUT the camera flow on purpose: driving the capture under fake timers fights
    // the component own async path (and leaves a queued mock behind), which is the trap
    // review-brief §8 names. The mechanism is a timer; it is tested as one.
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const stop = createSaveWatchdog(onTimeout, 1000);

      vi.advanceTimersByTime(999);
      expect(onTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onTimeout).toHaveBeenCalledTimes(1);

      // A save that settles first cancels it: no stale timeout can fire at a finished save.
      const cancelled = vi.fn();
      const stopSecond = createSaveWatchdog(cancelled, 1000);
      stopSecond();
      vi.advanceTimersByTime(5000);
      expect(cancelled).not.toHaveBeenCalled();
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a hung pipeline keeps saying which step it is on, and never traps the photo', async () => {
    // The owner-reported symptom: the promise never settles, so nothing reaches the catch —
    // the app has to keep SAYING what it is waiting on, and keep the photo in reach.
    await setup();
    // Consumed by this test only, so it cannot leak into the next one.
    vi.mocked(normalizeImage).mockImplementationOnce(() => new Promise(() => {}));
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    // The save is in flight and names its stage (the image work), not a bare spinner.
    await waitFor(() => expect(document.querySelector('.camera-progress-label')).not.toBeNull());
    expect(document.querySelector('.camera-progress-label')?.textContent).toBe(
      STRINGS.capture.adding,
    );
    // The photo is still on screen and the escape hatch is one tap away — nothing is trapped.
    expect(document.querySelector('.camera-review-image')).not.toBeNull();
    expect(screen.getByRole('button', { name: STRINGS.capture.retake })).toBeTruthy();
  });

  it('a primary attempt files the sheet without waiting on any permission request', async () => {
    // The primary path must never BLOCK on the write grant: a browser may never answer the
    // request, and a pending request would hang the save instead of reporting it. Only the
    // recovery path asks (the button reading «Re-authorize»), which is where a user expects a
    // prompt. The fake handles expose no permission API, so the observable half is pinned
    // here: the primary attempt reaches the write and the sheet lands.
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    expect(readProject(root.textAt('Riverside/project.json')).sheets).toHaveLength(2);
  });
});

describe('a DENIED folder grant offers a re-pick, not an impossible re-authorize', () => {
  it('labels the recovery by what the cause actually allows', () => {
    // Pure mapping, so the wiring can be checked without a camera: a `prompt` grant can be
    // re-asked for; a `denied` one cannot (Chromium never re-prompts that handle), so it must
    // offer a fresh pick instead of a button that cannot work.
    expect(failureActionLabel({ message: 'm', needsGrant: true, needsResolve: false, needsRepick: false })).toBe(STRINGS.errors.reAuthorize);
    expect(failureActionLabel({ message: 'm', needsGrant: true, needsResolve: false, needsRepick: true })).toBe(STRINGS.storage.rePickFolder);
    expect(failureActionLabel({ message: 'm', needsGrant: false, needsResolve: false, needsRepick: false })).toBe(STRINGS.errors.retry);
    expect(failureActionLabel(null)).toBe(STRINGS.errors.retry);
  });

  it('shows «Re-pick folder» and re-picks when the browser reports denied', async () => {
    await setup({
      beforeWrite: (file) => {
        if (file.name === 'photo.jpg.tmp') {
          throw new DOMException('the write grant was refused', 'NotAllowedError');
        }
      },
    });
    vi.mocked(queryRootWritePermission).mockResolvedValue('denied');
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));

    // The message still names the cause, but the ACTION is now the one that can work.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(STRINGS.errors.folderPermissionExpired);
    const repick = screen.getByRole('button', { name: STRINGS.storage.rePickFolder });
    expect(screen.queryByRole('button', { name: STRINGS.errors.reAuthorize })).toBeNull();

    // Pressing it re-picks the folder (a fresh pick mints a fresh grant) and tries again.
    await user.click(repick);
    await waitFor(() => expect(vi.mocked(pickRoot)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(queryRootWritePermission)).toHaveBeenCalled();
  });
});

describe('the card thumbnail is written before the sheet is handed off (D125)', () => {
  it('flushes the scheduler BEFORE onCaptured, because this component unmounts on capture', async () => {
    // The defect the clickthru harness found by reading the sheet directory on disk: `thumb.jpg`
    // was never written for a captured sheet. The component unmounts the instant `onCaptured`
    // fires and its cleanup cancels the scheduler, so the armed 3 s debounce died with it — and
    // this suite only ever asserted that `schedule()` was CALLED (a call is not an effect).
    await setup();
    installMedia(vi.fn(async () => fakeStream(fakeTrack(1920, 1080, 'cam-back'))));
    const { onCaptured } = renderFlow();
    const user = userEvent.setup();
    await screen.findByTestId('camera-resolution');

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.shutter }));
    await user.click(await screen.findByRole('button', { name: STRINGS.capture.usePhoto }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));

    expect(hoisted.schedule).toHaveBeenCalledTimes(1);
    expect(hoisted.flush).toHaveBeenCalledTimes(1);
    // The ORDER is the whole point: after the hand-off there is no component left to flush.
    expect(hoisted.flush.mock.invocationCallOrder[0]).toBeLessThan(
      onCaptured.mock.invocationCallOrder[0]!,
    );
  });
});
