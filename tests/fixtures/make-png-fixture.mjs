#!/usr/bin/env node
/**
 * tests/fixtures/make-png-fixture.mjs — deterministic PNG test fixture (slice 1.9,
 * Lane B: export/png.ts). Follows the pattern of tests/fixtures/make-fixtures.mjs:
 * hand-rolled, byte-exact, dependency-free (Node built-ins only — `zlib` for the
 * DEFLATE/zlib stream PNG itself requires, nothing else).
 *
 * Run:  node tests/fixtures/make-png-fixture.mjs
 *
 * Writes, next to this file:
 *   tiny-3x2.png — a valid 3×2 truecolor-without-alpha (RGB, bit depth 8) PNG.
 *
 * WHY hand-roll rather than draw-and-encode: this fixture exists to prove
 * `readPngSize` parses a REAL PNG's IHDR chunk (signature check, chunk-type check,
 * big-endian width/height) rather than trusting an asserted size. A hand-rolled file
 * with a known, small, odd (3×2, so a stray ×2 in the reader can't hide) size is the
 * most direct proof of that. It uses Node's own `zlib.deflateSync` for the IDAT
 * stream (zlib format, RFC 1950 — the format PNG's IDAT chunk requires) and Node's
 * `zlib.crc32` is not used; CRC-32 is computed by a small local implementation below
 * (PNG's CRC is the standard ISO 3309 / ITU-T V.42 polynomial, same as zip/gzip).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

// --- CRC-32 (ISO 3309), the algorithm PNG chunk CRCs use --------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

/** One PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC (over type+data). */
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))]);
}

/**
 * A valid PNG of `width × height`, 8-bit RGB (colour type 2, no alpha, no filter
 * variety — every scanline uses filter type 0 / "None" for simplicity).
 */
function buildRgbPng(width, height) {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.concat([
    u32be(width),
    u32be(height),
    Buffer.from([8, 2, 0, 0, 0]), // bit depth 8, color type 2 (RGB), compression/filter/interlace 0
  ]);

  // Raw scanlines: 1 filter-type byte (0 = None) + width×3 RGB bytes, per row.
  // A small gradient so the pixel data isn't all-zero (draw-something equivalent).
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    raw[o] = 0; // filter type: None
    o += 1;
    for (let x = 0; x < width; x += 1) {
      raw[o] = (x * 40) % 256; // R
      raw[o + 1] = (y * 80) % 256; // G
      raw[o + 2] = 128; // B
      o += 3;
    }
  }
  const idatData = deflateSync(raw); // zlib (RFC 1950) stream, as PNG's IDAT requires

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const WIDTH = 3;
const HEIGHT = 2;
const png = buildRgbPng(WIDTH, HEIGHT);
writeFileSync(join(outDir, 'tiny-3x2.png'), png);

console.log('Fixture written to', outDir);
console.log(`  tiny-3x2.png  ${png.length} bytes  (${WIDTH}×${HEIGHT} RGB8)`);
