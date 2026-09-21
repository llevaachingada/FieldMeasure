#!/usr/bin/env node
/**
 * Deterministic test-fixture generator (implementation plan slice 0.1 step 12,
 * checkpoint C2; slice 1.3 adds the EXIF fixture). No new dependencies — Node
 * built-ins only.
 *
 * Run:  node tests/fixtures/make-fixtures.mjs
 *
 * Writes, next to this file:
 *   tiny-2x2.jpg                 — a hand-rolled, valid 2×2 baseline grayscale JPEG.
 *   truncated.jpg                — 0 bytes. Slice 1.2's truncated-photo detection.
 *   corrupt-markup.json          — valid JSON, invalid schema. Recovery path.
 *   v02-markup.json              — v0.2 shape: carries a stale `label` key.
 *   12mp-portrait-exif6.jpg      — 4032×3024 (12.19 MP) JPEG, EXIF orientation 6 +
 *                                  DateTimeOriginal + a GPS IFD. Slice 1.3's fixture.
 *
 * HOW THE JPEGs ARE MADE — hand-rolled, byte-exact
 * A solid mid-grey image has DC = 8 × (128 − 128) = 0 in EVERY 8×8 block, so its
 * baseline entropy stream is just the DC-category-0 code followed by EOB, repeated
 * for every MCU (`ceil(w/8) × ceil(h/8)` of them), with `0xFF → 0xFF00` stuffing.
 * `buildSolidGrayJpeg` emits a complete, valid baseline JPEG that way: SOI, (optional
 * APP1), DQT, SOF0 (1 component), the standard Annex-K DHTs, SOS, the entropy stream,
 * EOI. This is byte-exact, dependency-free, deterministic, decodes at any size, and
 * carries a meaningful mid-grey (level 128) instead of solid white.
 *
 * WHY: never "fake" a larger image by patching SOF dimensions of a small seed. A
 * decoder honours the patched size while the entropy stream only covers the seed's
 * MCUs, so the rest of the image is missing/garbage. Hand-rolling avoids that footgun
 * entirely. TO BE CLEAR: the OLD committed `tiny-2x2.jpg` (631 bytes) was NOT such a
 * patch — an independent extraction and parse found a genuine encoder JPEG of a 2×2
 * solid-white image (JFIF APP0, 2 DQTs, 4 DHTs, SOF0 2×2, 3 components) that decoded
 * cleanly in Chromium and GDI+. Replacing it here is hygiene (deterministic,
 * dependency-free, mid-grey), not a bug fix. Both sizes are verified to decode in
 * Chromium by `tests/normalizeImage.browser.test.ts`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

/* ==================================================================================
 * Hand-rolled baseline JPEG builder (constant luma, 1 component, no subsampling)
 * ================================================================================== */

// Standard JPEG Annex K luminance Huffman tables (baseline, no optimisation).
const DC_LUMA_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUMA_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUMA_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
  0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
  0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
  0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
if (AC_LUMA_VALS.length !== 162 || AC_LUMA_BITS.reduce((a, b) => a + b, 0) !== 162) {
  throw new Error('AC luminance Huffman table is malformed');
}
if (DC_LUMA_VALS.length !== 12 || DC_LUMA_BITS.reduce((a, b) => a + b, 0) !== 12) {
  throw new Error('DC luminance Huffman table is malformed');
}

/** Canonical Huffman code assignment (JPEG Annex C). */
function buildHuffmanCodes(bits, vals) {
  const codes = new Map();
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < bits[length - 1]; i += 1) {
      codes.set(vals[k], { code, length });
      k += 1;
      code += 1;
    }
    code <<= 1;
  }
  if (k !== vals.length) throw new Error('huffman table mismatch');
  return codes;
}

function jpegMarker(code, payload) {
  const len = payload.length + 2;
  return [0xff, code, (len >> 8) & 0xff, len & 0xff, ...payload];
}

/**
 * A valid baseline 8-bit grayscale JPEG of `width × height` at a solid `level`.
 * Dimensions need not be multiples of 8: padding MCUs are emitted (DC0 + EOB, the
 * same as every other block for a constant image) and the decoder crops to the frame.
 */
function buildSolidGrayJpeg(width, height, level = 128, app1Segment = []) {
  if (width < 1 || height < 1) throw new Error('JPEG dimensions must be positive');
  const dc = buildHuffmanCodes(DC_LUMA_BITS, DC_LUMA_VALS);
  const ac = buildHuffmanCodes(AC_LUMA_BITS, AC_LUMA_VALS);
  const dcZero = dc.get(0);
  const eob = ac.get(0);
  if (!dcZero || !eob) throw new Error('missing DC0/EOB huffman symbol');

  const bytes = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (entry) => {
    for (let i = entry.length - 1; i >= 0; i -= 1) {
      bitBuffer = (bitBuffer << 1) | ((entry.code >> i) & 1);
      bitCount += 1;
      if (bitCount === 8) {
        bytes.push(bitBuffer & 0xff);
        if ((bitBuffer & 0xff) === 0xff) bytes.push(0x00); // byte stuffing
        bitBuffer = 0;
        bitCount = 0;
      }
    }
  };

  // Solid level 128 ⇒ DC = 8 × (128 − 128) = 0 in every block (so does the inter-block
  // DC difference), and every block is DC-only ⇒ EOB. 1 component ⇒ MCU = 8×8.
  const mcus = Math.ceil(width / 8) * Math.ceil(height / 8);
  for (let i = 0; i < mcus; i += 1) {
    emit(dcZero);
    emit(eob);
  }
  if (bitCount > 0) {
    const pad = 8 - bitCount;
    bitBuffer = (bitBuffer << pad) | ((1 << pad) - 1); // pad with 1-bits
    bytes.push(bitBuffer & 0xff);
    if ((bitBuffer & 0xff) === 0xff) bytes.push(0x00);
  }

  return [
    0xff, 0xd8, // SOI
    ...app1Segment,
    ...jpegMarker(0xdb, [0x00, ...new Array(64).fill(1)]), // DQT: all-1 quant (id 0)
    ...jpegMarker(0xc0, [
      8,
      (height >> 8) & 0xff, height & 0xff,
      (width >> 8) & 0xff, width & 0xff,
      1, // one component
      1, 0x11, 0, // id 1, no subsampling, quant table 0
    ]),
    ...jpegMarker(0xc4, [0x00, ...DC_LUMA_BITS, ...DC_LUMA_VALS]),
    ...jpegMarker(0xc4, [0x10, ...AC_LUMA_BITS, ...AC_LUMA_VALS]),
    ...jpegMarker(0xda, [1, 1, 0x00, 0, 63, 0]), // SOS
    ...bytes,
    0xff, 0xd9, // EOI
  ];
}

/* ==================================================================================
 * EXIF APP1 builder (TIFF little-endian)
 * ================================================================================== */

function setU16(buf, off, value) {
  buf[off] = value & 0xff;
  buf[off + 1] = (value >> 8) & 0xff;
}
function setU32(buf, off, value) {
  buf[off] = value & 0xff;
  buf[off + 1] = (value >> 8) & 0xff;
  buf[off + 2] = (value >> 16) & 0xff;
  buf[off + 3] = (value >> 24) & 0xff;
}
function setEntry(buf, off, tag, type, count, valueField) {
  setU16(buf, off, tag);
  setU16(buf, off + 2, type);
  setU32(buf, off + 4, count);
  if (Array.isArray(valueField)) {
    for (let i = 0; i < 4; i += 1) buf[off + 8 + i] = valueField[i] ?? 0;
  } else {
    setU32(buf, off + 8, valueField);
  }
  return off + 12;
}
/** EXIF ASCII timestamps are exactly 19 chars + NUL. */
function ascii20(text) {
  const out = new Uint8Array(20);
  for (let i = 0; i < text.length && i < 19; i += 1) out[i] = text.charCodeAt(i);
  out[19] = 0;
  return out;
}

/**
 * APP1/EXIF segment: little-endian TIFF with
 *   IFD0      : Orientation = 6, DateTime = "2026:09:20 14:03:11",
 *               ExifIFD pointer, GPS IFD pointer
 *   Exif IFD  : DateTimeOriginal = "2026:09:20 14:03:11"
 *   GPS IFD   : GPSLatitudeRef = "N", GPSLatitude = 37/1, 48/1, 30/1
 */
function buildExifApp1() {
  const IFD0_N = 4;
  const EXIF_N = 1;
  const GPS_N = 2;
  const ifd0Off = 8;
  const ifd0Size = 2 + IFD0_N * 12 + 4;
  const exifOff = ifd0Off + ifd0Size;
  const exifSize = 2 + EXIF_N * 12 + 4;
  const gpsOff = exifOff + exifSize;
  const gpsSize = 2 + GPS_N * 12 + 4;
  let dataOff = gpsOff + gpsSize;
  const dtOff = dataOff; dataOff += 20;
  const dtoOff = dataOff; dataOff += 20;
  const latOff = dataOff; dataOff += 24;

  const tiff = new Uint8Array(dataOff);
  // TIFF header: "II", 42, offset-to-IFD0 = 8.
  tiff[0] = 0x49; tiff[1] = 0x49;
  tiff[2] = 0x2a; tiff[3] = 0x00;
  setU32(tiff, 4, ifd0Off);

  // IFD0 (entries ascending by tag).
  setU16(tiff, ifd0Off, IFD0_N);
  let p = ifd0Off + 2;
  p = setEntry(tiff, p, 0x0112, 3, 1, [6, 0, 0, 0]); // Orientation = 6
  p = setEntry(tiff, p, 0x0132, 2, 20, dtOff); // DateTime
  p = setEntry(tiff, p, 0x8769, 4, 1, exifOff); // ExifIFD pointer
  p = setEntry(tiff, p, 0x8825, 4, 1, gpsOff); // GPS IFD pointer
  setU32(tiff, p, 0); // next IFD

  // Exif sub-IFD.
  let q = exifOff;
  setU16(tiff, q, EXIF_N); q += 2;
  q = setEntry(tiff, q, 0x9003, 2, 20, dtoOff); // DateTimeOriginal
  setU32(tiff, q, 0);

  // GPS IFD.
  let r = gpsOff;
  setU16(tiff, r, GPS_N); r += 2;
  r = setEntry(tiff, r, 0x0001, 2, 2, [0x4e, 0x00, 0, 0]); // GPSLatitudeRef "N"
  r = setEntry(tiff, r, 0x0002, 5, 3, latOff); // GPSLatitude RATIONAL×3
  setU32(tiff, r, 0);

  // Data area.
  tiff.set(ascii20('2026:09:20 14:03:11'), dtOff);
  tiff.set(ascii20('2026:09:20 14:03:11'), dtoOff);
  setU32(tiff, latOff, 37); setU32(tiff, latOff + 4, 1);
  setU32(tiff, latOff + 8, 48); setU32(tiff, latOff + 12, 1);
  setU32(tiff, latOff + 16, 30); setU32(tiff, latOff + 20, 1);

  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const len = payload.length + 2;
  return [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload];
}

/* ==================================================================================
 * Fixture writes
 * ================================================================================== */

// --- tiny-2x2.jpg -----------------------------------------------------------------
// Hand-rolled 2×2 (one 8×8 MCU, cropped by the decoder) — NOT a patched header.
const tinyJpeg = Buffer.from(buildSolidGrayJpeg(2, 2, 128));
writeFileSync(join(outDir, 'tiny-2x2.jpg'), tinyJpeg);

// --- truncated.jpg (0 bytes) ------------------------------------------------------
writeFileSync(join(outDir, 'truncated.jpg'), Buffer.alloc(0));

// --- corrupt-markup.json (valid JSON, invalid schema) -----------------------------
const corruptMarkup = {
  schemaVersion: 1,
  sheetId: 42, // wrong type: schema wants string
  objects: 'not-an-array', // wrong type: schema wants Annotation[]
};
writeFileSync(
  join(outDir, 'corrupt-markup.json'),
  `${JSON.stringify(corruptMarkup, null, 2)}\n`,
);

// --- v02-markup.json (v0.2 shape: stale `label`, no `unitFormat`) -----------------
// `label` was persisted in v0.2 and is derived-only from v0.3 (build spec §3.2, M5).
// zod strips the unknown key on load. `unitFormat` lives in project.json, not
// markup.json, so it is simply absent here; the migration test (slice 1.1) must
// normalise it to 'ft-in' on the project side. `precisionDenominator` likewise
// (default 16) lives in project.json.
const v02Markup = {
  schemaVersion: 1,
  sheetId: '0199b0c4-1111-7c2b-9d0e-3f4a5b6c7d8e',
  objects: [
    {
      id: '0199b0c5-2222-7c2b-9d0e-3f4a5b6c7d8e',
      type: 'dimension',
      geometry: {
        kind: 'dimension',
        a: { x: 820, y: 1280 },
        b: { x: 2920, y: 1290 },
      },
      valueMm: 3162.3,
      enteredText: '10\'-4 1/2"',
      label: '10\'-4 1/2"', // stale v0.2 key — must be stripped, never trusted
      style: {
        strokeColor: '#FF7A18',
        strokeWidthMu: 4,
        fillColor: null,
        fillAlpha: 1,
        lineStyle: 'solid',
        arrowheads: 'both',
        fontSizeMu: 18,
        bold: true,
      },
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    },
  ],
};
writeFileSync(
  join(outDir, 'v02-markup.json'),
  `${JSON.stringify(v02Markup, null, 2)}\n`,
);

// --- 12mp-portrait-exif6.jpg ------------------------------------------------------
// 4032 × 3024 = 12.19 MP, stored landscape with EXIF Orientation 6 → upright portrait
// 3024×4032. The APP1 is spliced in as a normal marker argument (no header patching).
const EXIF_W = 4032;
const EXIF_H = 3024;
const exifJpeg = Buffer.from(
  buildSolidGrayJpeg(EXIF_W, EXIF_H, 128, buildExifApp1()),
);
writeFileSync(join(outDir, '12mp-portrait-exif6.jpg'), exifJpeg);

console.log('Fixtures written to', outDir);
console.log('  tiny-2x2.jpg              ', tinyJpeg.length, 'bytes  (hand-rolled 2×2)');
console.log('  truncated.jpg              0 bytes');
console.log('  corrupt-markup.json        valid JSON, invalid schema');
console.log('  v02-markup.json            stale `label`, no `unitFormat`');
console.log(
  '  12mp-portrait-exif6.jpg   ',
  exifJpeg.length,
  `bytes  (${EXIF_W}×${EXIF_H} stored, EXIF orientation 6, GPS IFD)`,
);
