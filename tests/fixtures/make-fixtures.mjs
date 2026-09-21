#!/usr/bin/env node
/**
 * Deterministic test-fixture generator (implementation plan slice 0.1 step 12,
 * checkpoint C2). No new dependencies — Node built-ins only.
 *
 * Run:  node tests/fixtures/make-fixtures.mjs
 *
 * Writes, next to this file:
 *   tiny-2x2.jpg       — a tiny, valid JPEG (2×2). Used as a cheap decode/round-trip input.
 *   truncated.jpg      — 0 bytes. Slice 1.2's truncated-photo detection.
 *   corrupt-markup.json— valid JSON, invalid schema. Slice 1.1/1.2 recovery path.
 *   v02-markup.json    — v0.2 shape: carries a stale `label` key on annotations.
 *
 * TODO(C2, slice 1.3): 12mp-portrait-exif6.jpg (EXIF orientation 6 + GPS) is NOT
 * generated here. Producing real EXIF requires either a real phone photo (ask the
 * human once — cheapest, best fixture) or a synthetic APP1-segment injector. Until
 * then, slice 1.3's EXIF gate is PROVISIONAL (logged to the hardware checklist).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

// --- tiny-2x2.jpg -----------------------------------------------------------------
// A canonical minimal 1×1 baseline JPEG. We decode it, locate the SOF0 frame header,
// and patch its height/width to 2 so the on-disk fixture really is 2×2 (the encoded
// 8×8 block is cropped by the decoder to the frame dimensions, so this stays valid).
const ONE_BY_ONE_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const jpeg = Buffer.from(ONE_BY_ONE_JPEG_B64, 'base64');
if (jpeg.readUInt16BE(0) !== 0xffd8) {
  throw new Error('tiny-2x2.jpg seed is not a JPEG (missing SOI).');
}
const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
if (sof === -1) {
  throw new Error('tiny-2x2.jpg seed has no SOF0 marker.');
}
// SOF0 layout: FF C0 | length(2) | precision(1) | height(2) | width(2) | …
jpeg.writeUInt16BE(2, sof + 5); // height = 2
jpeg.writeUInt16BE(2, sof + 7); // width  = 2
writeFileSync(join(outDir, 'tiny-2x2.jpg'), jpeg);

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

console.log('Fixtures written to', outDir);
console.log('  tiny-2x2.jpg        ', jpeg.length, 'bytes');
console.log('  truncated.jpg       0 bytes');
console.log('  corrupt-markup.json  valid JSON, invalid schema');
console.log('  v02-markup.json      stale `label`, no `unitFormat`');
console.log('  (skipped) 12mp-portrait-exif6.jpg — see TODO in this script header');
