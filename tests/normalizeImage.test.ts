/**
 * tests/normalizeImage.test.ts — the pure half of the normalizer (slice 1.3).
 *
 * `targetSize` (long-edge clamp) and `sha256Hex` (content hash, §19.3) run in Node.
 * The decode/encode half needs a real canvas (`createImageBitmap` / `OffscreenCanvas`)
 * and is covered by `normalizeImage.browser.test.ts` (D40).
 */
import { describe, expect, it } from 'vitest';
import { sha256Hex, targetSize } from '../src/media/normalizeImage';

describe('targetSize (long edge ≤ maxEdge, aspect preserved)', () => {
  it('leaves an image already inside the limit untouched', () => {
    expect(targetSize(4032, 3024, 4096)).toEqual({ width: 4032, height: 3024 });
  });

  it('downscales an oversized landscape image by the long edge', () => {
    // 8192 → 4096 = 0.5 ×; 6144 × 0.5 = 3072.
    expect(targetSize(8192, 6144, 4096)).toEqual({ width: 4096, height: 3072 });
  });

  it('downscales a portrait image by its long (vertical) edge', () => {
    // 1024 / 4032 = 0.253968…; 3024 × that = 768.0 → 768.
    expect(targetSize(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('never returns a zero dimension', () => {
    // 1 × 100000 at maxEdge 1: height clamps to 1, width must not become 0.
    const { width, height } = targetSize(1, 100000, 1);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBe(1);
  });
});

describe('sha256Hex', () => {
  it('matches the published SHA-256 of "abc"', async () => {
    // FIPS 180-2 test vector: SHA-256("abc") =
    // ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    const blob = new Blob(['abc']);
    expect(await sha256Hex(blob)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable across repeated calls and 64 hex chars long', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 250, 0, 255])]);
    const a = await sha256Hex(blob);
    const b = await sha256Hex(blob);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different bytes', async () => {
    const a = await sha256Hex(new Blob(['one']));
    const b = await sha256Hex(new Blob(['two']));
    expect(a).not.toBe(b);
  });
});
