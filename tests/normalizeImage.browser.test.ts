/**
 * tests/normalizeImage.browser.test.ts — the decode/encode half (slice 1.3, §7.1).
 *
 * Needs a real `createImageBitmap` + `OffscreenCanvas`, so it runs in the `browser`
 * project (D40). Proves the pipeline on the synthetic 12 MP EXIF-orientation-6 + GPS
 * fixture: upright output dims (orientation baked), JPEG output, and NO EXIF/GPS
 * survives the re-encode.
 */
import { describe, expect, it } from 'vitest';
import bigFixtureUrl from './fixtures/12mp-portrait-exif6.jpg?url';
import tinyFixtureUrl from './fixtures/tiny-2x2.jpg?url';
import { readExifInfo } from '../src/media/exif';
import { normalizeImage, sha256Hex } from '../src/media/normalizeImage';

async function fixtureBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/* ------------------------------------------------------------------ *
 * Byte-level EXIF/GPS re-parse (research verification)
 * ------------------------------------------------------------------ */

interface ExifScan {
  /** An APP1 segment beginning "Exif\0\0" is present. */
  app1Exif: boolean;
  /** IFD0 of that segment carries the GPSInfoIFDPointer tag (0x8825). */
  gpsPointer: boolean;
}

/** Walk JPEG segments (stopping at SOS) and look for EXIF + the GPS pointer tag. */
function scanExif(bytes: Uint8Array): ExifScan {
  const result: ExifScan = { app1Exif: false, gpsPointer: false };
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return result;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) break;
      i += 2;
      continue;
    }
    if (marker === 0xda) break; // start of scan — metadata was before
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;
    const start = i + 4;
    const end = i + 2 + length;
    if (end > bytes.length) break;
    const isExif =
      start + 6 <= end &&
      bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 &&
      bytes[start + 3] === 0x66 && bytes[start + 4] === 0x00 && bytes[start + 5] === 0x00;
    if (marker === 0xe1 && isExif) {
      result.app1Exif = true;
      if (tiffHasGpsPointer(bytes.subarray(start + 6, end))) result.gpsPointer = true;
    }
    i = end;
  }
  return result;
}

/** IFD0 entry scan for tag 0x8825 (GPSInfoIFDPointer), either byte order. */
function tiffHasGpsPointer(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return false;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return false;
  const u16 = (o: number): number =>
    little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1];
  const u32 = (o: number): number =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0;
  if (u16(2) !== 42) return false;
  const ifd0 = u32(4);
  const count = u16(ifd0);
  for (let n = 0; n < count; n += 1) {
    const off = ifd0 + 2 + n * 12;
    if (off + 12 > tiff.length) return false;
    if (u16(off) === 0x8825) return true;
  }
  return false;
}

describe('normalizeImage', () => {
  it('opens a 12 MP EXIF-6 photo upright as a metadata-free JPEG', async () => {
    const input = await fixtureBlob(bigFixtureUrl);

    const before = await readExifInfo(input);
    expect(before.orientation).toBe(6); // the fixture really carries orientation 6
    expect(before.hasGps).toBe(true);

    const out = await normalizeImage(input);
    // Stored 4032×3024 + orientation 6 → decoded/upright 3024×4032. Long edge 4032 is
    // already < the 4096 default, so the DEFAULT call does NOT downscale — the plan's
    // "≤4096" assertion is trivially true here. The real downscale path is exercised by
    // the explicit-maxEdge cases below and by the pure `targetSize` tests (see D58).
    expect(out.width).toBe(3024);
    expect(out.height).toBe(4032);
    expect(Math.max(out.width, out.height)).toBe(4032);
    expect(out.blob.type).toBe('image/jpeg');

    const magic = new Uint8Array(await out.blob.slice(0, 2).arrayBuffer());
    expect([...magic]).toEqual([0xff, 0xd8]);

    // Re-encode strips every APP1 segment: no EXIF, no GPS.
    expect(await readExifInfo(out.blob)).toEqual({
      orientation: null,
      captureTime: null,
      hasGps: false,
    });
  });

  it('canvas re-encode emits no APP1 "Exif\\0\\0" and no GPS pointer tag (0x8825)', async () => {
    const input = await fixtureBlob(bigFixtureUrl);

    // Self-proving scanner: it MUST find both on the source fixture...
    expect(scanExif(new Uint8Array(await input.arrayBuffer()))).toEqual({
      app1Exif: true,
      gpsPointer: true,
    });

    // ...and neither in the canvas re-encode. `convertToBlob` is a fresh Skia encode
    // with no metadata passed, so EXIF (incl. GPS) is dropped in all Chromium builds
    // (no Android/Windows difference). `stripExif` is not involved in this path.
    const out = await normalizeImage(input);
    expect(scanExif(new Uint8Array(await out.blob.arrayBuffer()))).toEqual({
      app1Exif: false,
      gpsPointer: false,
    });
  });

  it('honours maxEdge and preserves the aspect ratio', async () => {
    const input = await fixtureBlob(bigFixtureUrl);
    const out = await normalizeImage(input, 1024);
    // 1024 / 4032 = 0.253968…; 3024 × that = 768.0 → 768 (portrait).
    expect(out.width).toBe(768);
    expect(out.height).toBe(1024);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1024);
  });

  it('produces a stable content hash that differs from the source', async () => {
    const input = await fixtureBlob(bigFixtureUrl);
    const out = await normalizeImage(input, 512);
    const a = await sha256Hex(out.blob);
    const b = await sha256Hex(out.blob);
    expect(a).toBe(b);
    expect(a).not.toBe(await sha256Hex(input));
  });
});

/* ------------------------------------------------------------------ *
 * Fixture integrity
 * ------------------------------------------------------------------ */

async function samplePixel(bitmap: ImageBitmap, x: number, y: number): Promise<number[]> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context');
  ctx.drawImage(bitmap, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

describe('fixture integrity (hand-rolled JPEGs, never SOF-patched)', () => {
  // A patched SOF makes a decoder report the fake size while the entropy stream only
  // covers the seed's MCUs — the missing region is grey/garbage. These assertions prove
  // the hand-rolled generator emits enough MCUs for EVERY fixture size: a real 2×2, and
  // a real 12 MP portrait, both with actual mid-grey pixels (level 128).
  it('tiny-2x2.jpg really decodes as 2×2 mid-grey', async () => {
    const blob = await fixtureBlob(tinyFixtureUrl);
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    expect([bitmap.width, bitmap.height]).toEqual([2, 2]);
    const [r, g, b] = await samplePixel(bitmap, 1, 1);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(4);
    expect(g).toBe(r);
    expect(b).toBe(r);
    bitmap.close();
  });

  it('12mp-portrait-exif6.jpg decodes upright at 3024×4032 with real pixels', async () => {
    const blob = await fixtureBlob(bigFixtureUrl);
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    expect([bitmap.width, bitmap.height]).toEqual([3024, 4032]);
    const [r, g, b] = await samplePixel(bitmap, 10, 10);
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(4);
    expect(g).toBe(r);
    expect(b).toBe(r);
    bitmap.close();
  });
});
