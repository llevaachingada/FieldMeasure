/**
 * `src/media/exif.ts` — capture time + GPS handling (build spec §7.2).
 *
 * §7.2: read the capture time **before** normalization strips it, bake the
 * orientation by decoding with `imageOrientation: 'from-image'`, and strip GPS from
 * working copies and exports.
 *
 * How each part is delivered:
 *  - **Capture time** — `readCaptureTime` / `readExifInfo` parse the JPEG APP1/EXIF
 *    TIFF by hand (Node built-ins only, no dependency; §2.2). `DateTimeOriginal`
 *    (0x9003, from the Exif sub-IFD) wins over `DateTime` (0x0132, IFD0).
 *  - **Orientation** — `readExifInfo().orientation` reports the tag; the actual
 *    baking happens in `normalizeImage` via `createImageBitmap(file, {
 *    imageOrientation: 'from-image' })` (D40's decode path), not here.
 *  - **GPS strip** — the working copy comes out of `normalizeImage`'s re-encode,
 *    which carries NO metadata segment at all, so GPS can never survive. `stripExif`
 *    is the byte-level equivalent for any JPEG whose *bytes* must be preserved
 *    (it drops every APP1 segment, EXIF and XMP alike, and leaves pixel data
 *    untouched). GPS is never re-embedded; a typed `locationLabel` is the only
 *    location data in v1 (§18.3).
 *
 * Parsing is deliberately defensive: a malformed or absent APP1 returns
 * `{ orientation: null, captureTime: null, hasGps: false }` — it never throws, so a
 * photo import can never be blocked by bad metadata.
 *
 * WHY A MANUAL SCAN, AND WHY IT ONLY READS ~64 KB
 * There is no native "read EXIF" API (neither `createImageBitmap`, `ImageBitmap` nor
 * the File System Access `File` exposes metadata), so walking the JPEG's own marker
 * structure is the only read path. EXIF lives in an APP1 segment near the head of the
 * file, so `readExifInfo` reads only `EXIF_SCAN_BYTES` (64 KB) via `blob.slice` rather
 * than materializing a multi-MB phone photo in memory.
 *
 * The 64 KB bound is safe for the load-bearing case: this parser supplies the
 * **capture time** (cosmetic), never the orientation. Orientation is baked by the
 * decoder in `normalizeImage`/`decodeWorker` via
 * `createImageBitmap(blob, { imageOrientation: 'from-image' })` (D56), which reads the
 * tag internally. So even a pathological JPEG that pushed its APP1 past 64 KB — it
 * would have to precede it with ~64 KB of other APPn data, and cameras emit EXIF
 * before ICC — loses only the default sheet timestamp, never the upright pixels.
 */

export interface ExifInfo {
  /** EXIF Orientation (0x0112) as stored, or `null` when absent/unreadable. */
  orientation: number | null;
  /** Capture timestamp (local, no timezone information exists in EXIF), or `null`. */
  captureTime: Date | null;
  /** A GPS IFD pointer (0x8825) with at least one entry is present. */
  hasGps: boolean;
}

export const NO_EXIF: ExifInfo = { orientation: null, captureTime: null, hasGps: false };

/**
 * Bytes read from the head of a JPEG for metadata. One APP1 segment is capped at
 * 65533 bytes by the JPEG spec, so 64 KB covers a full EXIF block plus the JFIF APP0
 * that normally precedes it.
 */
export const EXIF_SCAN_BYTES = 64 * 1024;

const EXIF_PREFIX = 'Exif\0\0';
/** TIFF field type → byte size (EXIF 2.3, Table 4). Types 1–12 are defined; unknown → 0. */
const TIFF_TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function matchesAscii(bytes: Uint8Array, off: number, text: string): boolean {
  if (off + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[off + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Walk JPEG segments and return the EXIF TIFF block (bytes after "Exif\0\0"), or
 * `null`. Stops at SOS — by then any APP1 has already been seen.
 */
function findExifTiff(bytes: Uint8Array): Uint8Array | null {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Standalone markers carry no length: TEM (0x01), RST0..RST7, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) return null;
      i += 2;
      continue;
    }
    if (marker === 0xda) return null; // start of scan
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    const start = i + 4;
    const end = i + 2 + length;
    if (end > bytes.length) return null;
    if (marker === 0xe1 && matchesAscii(bytes, start, EXIF_PREFIX)) {
      return bytes.subarray(start + EXIF_PREFIX.length, end);
    }
    i = end;
  }
  return null;
}

interface Tiff {
  bytes: Uint8Array;
  little: boolean;
}

function u16(t: Tiff, off: number): number {
  if (off + 2 > t.bytes.length) return 0;
  return t.little
    ? t.bytes[off] | (t.bytes[off + 1] << 8)
    : (t.bytes[off] << 8) | t.bytes[off + 1];
}

function u32(t: Tiff, off: number): number {
  if (off + 4 > t.bytes.length) return 0;
  const b = t.bytes;
  return t.little
    ? (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0
    : ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Offset of the 12-byte entry (for inline value reads). */
  entryOff: number;
}

function readEntries(t: Tiff, ifdOff: number): IfdEntry[] {
  if (ifdOff + 2 > t.bytes.length) return [];
  const count = u16(t, ifdOff);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const entryOff = ifdOff + 2 + i * 12;
    if (entryOff + 12 > t.bytes.length) break;
    entries.push({
      tag: u16(t, entryOff),
      type: u16(t, entryOff + 2),
      count: u32(t, entryOff + 4),
      entryOff,
    });
  }
  return entries;
}

/** Byte offset of an entry's value (inline when it fits in 4 bytes). */
function valueOffset(t: Tiff, e: IfdEntry): number {
  const size = (TIFF_TYPE_SIZE[e.type] ?? 0) * e.count;
  return size <= 4 ? e.entryOff + 8 : u32(t, e.entryOff + 8);
}

function readAscii(t: Tiff, e: IfdEntry): string | null {
  if (e.type !== 2) return null;
  const off = valueOffset(t, e);
  const end = Math.min(t.bytes.length, off + e.count);
  if (off >= end) return null;
  let out = '';
  for (let i = off; i < end; i += 1) {
    if (t.bytes[i] === 0) break; // NUL-terminated
    out += String.fromCharCode(t.bytes[i]);
  }
  return out;
}

function readShort(t: Tiff, e: IfdEntry): number | null {
  if (e.type !== 3 || e.count < 1) return null;
  return u16(t, valueOffset(t, e));
}

/**
 * EXIF timestamps are `"YYYY:MM:DD HH:MM:SS"` with no timezone. Parsed as a LOCAL
 * wall-clock Date (the only honest interpretation — we cannot know the offset).
 */
export function parseExifDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTiff(tiff: Uint8Array): ExifInfo | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return null;
  const t: Tiff = { bytes: tiff, little };
  if (u16(t, 2) !== 42) return null;

  const ifd0 = readEntries(t, u32(t, 4));
  const find = (tag: number): IfdEntry | undefined => ifd0.find((e) => e.tag === tag);

  let orientation: number | null = null;
  const orientationEntry = find(0x0112);
  if (orientationEntry) orientation = readShort(t, orientationEntry);

  let captureRaw = find(0x0132) ? readAscii(t, find(0x0132)!) : null;

  const exifPointer = find(0x8769);
  if (exifPointer) {
    const exifIfd = readEntries(t, u32(t, exifPointer.entryOff + 8));
    const dto = exifIfd.find((e) => e.tag === 0x9003);
    const dtoRaw = dto ? readAscii(t, dto) : null;
    if (dtoRaw) captureRaw = dtoRaw; // DateTimeOriginal wins
  }

  let hasGps = false;
  const gpsPointer = find(0x8825);
  if (gpsPointer) {
    hasGps = readEntries(t, u32(t, gpsPointer.entryOff + 8)).length > 0;
  }

  return { orientation, captureTime: parseExifDate(captureRaw), hasGps };
}

/** Read EXIF orientation, capture time and GPS presence from a JPEG Blob. */
export async function readExifInfo(blob: Blob): Promise<ExifInfo> {
  try {
    // Bounded head read — never materialize the whole photo just for metadata.
    const bytes = new Uint8Array(await blob.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
    if (!isJpeg(bytes)) return { ...NO_EXIF };
    const tiff = findExifTiff(bytes);
    if (!tiff) return { ...NO_EXIF };
    return parseTiff(tiff) ?? { ...NO_EXIF };
  } catch {
    return { ...NO_EXIF };
  }
}

/** Convenience wrapper: the capture time only (for default sheet naming, §7.2). */
export async function readCaptureTime(blob: Blob): Promise<Date | null> {
  return (await readExifInfo(blob)).captureTime;
}

/**
 * Byte-level GPS/metadata strip: drop every APP1 segment (EXIF and XMP live there)
 * and keep APP0 (JFIF) and the pixel scan untouched. Used when a JPEG must keep its
 * original bytes; the normal working copy drops metadata simply by re-encoding
 * (`normalizeImage` — `convertToBlob` is a fresh Skia encode, D56).
 *
 * Unlike `readExifInfo`, this one must read the whole blob: it rewrites the file, so
 * it cannot work on a 64 KB head.
 */
export async function stripExif(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isJpeg(bytes)) return blob;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      out.push(bytes[i]);
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      out.push(bytes[i]);
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      out.push(bytes[i], bytes[i + 1]);
      i += 2;
      if (marker === 0xd9) break;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) {
      for (let k = i; k < bytes.length; k += 1) out.push(bytes[k]);
      break;
    }
    if (marker !== 0xe1) {
      for (let k = i; k < end; k += 1) out.push(bytes[k]);
    }
    if (marker === 0xda) {
      // Everything after SOS is entropy-coded scan data — copy verbatim.
      for (let k = end; k < bytes.length; k += 1) out.push(bytes[k]);
      break;
    }
    i = end;
  }
  return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
}
