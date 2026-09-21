/**
 * tests/thumbnails.browser.test.ts — decode-in-worker + 640×480 composite (slice 1.3,
 * §7.3; session-4 gate).
 *
 * The session-4 gate says "the thumbnail decode actually runs in `decodeWorker.ts` —
 * confirm on the Performance panel that decode is off the main thread, don't assume the
 * import wired it up." The Performance-panel half is a human check; the machine half is
 * here: the worker returns a `decodedIn: 'decodeWorker.ts'` provenance marker, and this
 * test asserts it. A refactor that silently drops the worker fails this test.
 */
import { afterEach, describe, expect, it } from 'vitest';
import bigFixtureUrl from './fixtures/12mp-portrait-exif6.jpg?url';
import {
  decodeInWorker,
  renderThumbnail,
  terminateDecodeWorker,
  THUMB_HEIGHT,
  THUMB_WIDTH,
} from '../src/media/thumbnails';

afterEach(() => {
  terminateDecodeWorker();
});

async function fixtureBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

describe('decodeInWorker', () => {
  it('decodes in decodeWorker.ts and applies EXIF orientation', async () => {
    const blob = await fixtureBlob(bigFixtureUrl);
    const decoded = await decodeInWorker(blob);
    expect(decoded.decodedIn).toBe('decodeWorker.ts');
    // Orientation 6 baked: stored 4032×3024 → 3024×4032.
    expect(decoded.width).toBe(3024);
    expect(decoded.height).toBe(4032);
    decoded.bitmap.close();
  });
});

describe('renderThumbnail', () => {
  it('renders a 640×480 JPEG with the mat visible behind a contain-fitted photo', async () => {
    const blob = await fixtureBlob(bigFixtureUrl);
    const decoded = await decodeInWorker(blob);
    const thumb = await renderThumbnail(decoded.bitmap);
    decoded.bitmap.close();

    expect(thumb.type).toBe('image/jpeg');

    // Explicit `from-image` for consistency (D56): never rely on a decode default that
    // could be `none`. This thumbnail has no EXIF, so the result is unchanged.
    const bitmap = await createImageBitmap(thumb, { imageOrientation: 'from-image' });
    expect(bitmap.width).toBe(THUMB_WIDTH);
    expect(bitmap.height).toBe(THUMB_HEIGHT);

    // Portrait photo contain-fitted into 640×480: drawW = 360, centred at x = 140.
    // The top-left corner is therefore the --mat letterbox, not the photo.
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D context');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    // --mat #0b0e12 ≈ (11, 14, 18); JPEG tolerance ±6.
    expect(Math.abs(r - 0x0b)).toBeLessThanOrEqual(6);
    expect(Math.abs(g - 0x0e)).toBeLessThanOrEqual(6);
    expect(Math.abs(b - 0x12)).toBeLessThanOrEqual(6);
  });
});
