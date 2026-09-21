/**
 * tests/exif.test.ts — the JPEG APP1/EXIF reader (slice 1.3, §7.2).
 *
 * Pure byte parsing → `node` project. The fixtures are imported `?inline` (Vite
 * hands back a base64 data URL) so no filesystem access or `@types/node` is needed.
 * The synthetic 12 MP fixture is built by `tests/fixtures/make-fixtures.mjs`; the
 * browser test also proves Chromium decodes it, which is what makes it a real fixture
 * rather than bytes that merely parse.
 */
import { describe, expect, it } from 'vitest';
import bigFixture from './fixtures/12mp-portrait-exif6.jpg?inline';
import tinyFixture from './fixtures/tiny-2x2.jpg?inline';
import {
  EXIF_SCAN_BYTES,
  NO_EXIF,
  parseExifDate,
  readCaptureTime,
  readExifInfo,
  stripExif,
} from '../src/media/exif';

function dataUrlToBlob(dataUrl: string, type = 'image/jpeg'): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

const bigJpeg = dataUrlToBlob(bigFixture);
const tinyJpeg = dataUrlToBlob(tinyFixture);

describe('readExifInfo on the 12 MP orientation-6 + GPS fixture', () => {
  it('reads the EXIF orientation tag (6)', async () => {
    const info = await readExifInfo(bigJpeg);
    expect(info.orientation).toBe(6);
  });

  it('reads DateTimeOriginal before normalization strips it', async () => {
    const info = await readExifInfo(bigJpeg);
    // Fixture stores "2026:09:20 14:03:11" (local wall clock; EXIF has no offset).
    expect(info.captureTime).toEqual(new Date(2026, 8, 20, 14, 3, 11));
  });

  it('detects the GPS IFD', async () => {
    const info = await readExifInfo(bigJpeg);
    expect(info.hasGps).toBe(true);
  });

  it('readCaptureTime is the captureTime convenience', async () => {
    expect(await readCaptureTime(bigJpeg)).toEqual(new Date(2026, 8, 20, 14, 3, 11));
  });
});

describe('readExifInfo reads only a bounded head (~64 KB)', () => {
  it('never materializes more than EXIF_SCAN_BYTES of a multi-MB source', async () => {
    // The fixture is 143 KB with EXIF at the very start; the reader must slice, not
    // read all 143 KB. Spy on `Blob.prototype.arrayBuffer` to observe the largest
    // blob it is called on.
    const original = Blob.prototype.arrayBuffer;
    let maxBytesRead = 0;
    Blob.prototype.arrayBuffer = function arrayBufferSpy(this: Blob) {
      maxBytesRead = Math.max(maxBytesRead, this.size);
      return original.call(this);
    };
    try {
      const info = await readExifInfo(bigJpeg);
      expect(info.orientation).toBe(6); // still parsed from the head
      expect(maxBytesRead).toBeLessThanOrEqual(EXIF_SCAN_BYTES);
      expect(bigJpeg.size).toBeGreaterThan(EXIF_SCAN_BYTES); // the source is bigger
    } finally {
      Blob.prototype.arrayBuffer = original;
    }
  });
});

describe('readExifInfo is defensive', () => {
  it('returns NO_EXIF for a JPEG with no APP1 (the tiny fixture)', async () => {
    expect(await readExifInfo(tinyJpeg)).toEqual(NO_EXIF);
  });

  it('returns NO_EXIF for non-JPEG bytes rather than throwing', async () => {
    expect(await readExifInfo(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]))).toEqual(NO_EXIF);
  });

  it('returns NO_EXIF for a truncated JPEG', async () => {
    expect(await readExifInfo(new Blob([new Uint8Array([0xff, 0xd8])]))).toEqual(NO_EXIF);
  });

  it('returns NO_EXIF for a JPEG whose APP1 is not EXIF (XMP)', async () => {
    // SOI + APP1 whose payload is "http://ns.adobe..." + EOI.
    const xmp = new Blob([
      new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a, 0x68, 0x74, 0x74, 0x70, 0x00, 0x00, 0xff, 0xd9]),
    ]);
    expect(await readExifInfo(xmp)).toEqual(NO_EXIF);
  });
});

describe('parseExifDate', () => {
  it('parses the EXIF colon format as local time', () => {
    expect(parseExifDate('2026:09:20 14:03:11')).toEqual(new Date(2026, 8, 20, 14, 3, 11));
  });

  it('rejects a malformed or empty value', () => {
    expect(parseExifDate('not a date')).toBeNull();
    expect(parseExifDate('')).toBeNull();
    expect(parseExifDate(null)).toBeNull();
  });
});

describe('stripExif (§7.2 GPS strip)', () => {
  it('removes every APP1 segment and keeps a decodable JPEG header', async () => {
    const stripped = await stripExif(bigJpeg);
    const bytes = new Uint8Array(await stripped.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    // No APP1 marker can survive (byte stuffing keeps 0xFF out of the scan data).
    for (let i = 2; i + 1 < bytes.length; i += 1) {
      if (bytes[i] === 0xff) {
        expect(bytes[i + 1]).not.toBe(0xe1);
      }
    }
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
  });

  it('leaves no GPS, orientation or capture time readable', async () => {
    const stripped = await stripExif(bigJpeg);
    expect(await readExifInfo(stripped)).toEqual(NO_EXIF);
  });

  it('is a no-op for a JPEG with no APP1 (tiny fixture)', async () => {
    const stripped = await stripExif(tinyJpeg);
    expect(new Uint8Array(await stripped.arrayBuffer())).toEqual(await tinyJpeg.arrayBuffer().then((b) => new Uint8Array(b)));
  });

  it('passes non-JPEG bytes through unchanged', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])]);
    expect(await stripExif(png)).toBe(png);
  });
});
