#!/usr/bin/env node
/**
 * Regenerates the ORIGINAL placeholder `icon-512.png` (no dependencies — Node's
 * built-in zlib plus a local CRC-32). The icon is placeholder art and will be
 * replaced with final art before 2.0 (build spec §12 / slice 0.1 step 5).
 *
 * Run:  node public/icons/make-icon.mjs
 *
 * The mark mirrors `icon.svg`: dark background, cyan frame, orange dimension line
 * with end ticks. Committed as a script so the binary is reproducible, not opaque.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;

// RGBA scanlines, each prefixed with filter byte 0 (None).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
const setPixel = (buf, x, y, r, g, b, a) => {
  const i = y * (SIZE * 4 + 1) + 1 + x * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
};

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0x1a;
    let g = 0x1a;
    let b = 0x1a;
    // Cyan frame (48px inset, 12px thick).
    const onFrame =
      x >= 72 && x <= 440 && y >= 72 && y <= 440 &&
      (x <= 84 || x >= 428 || y <= 84 || y >= 428);
    // Orange dimension line + end ticks.
    const onDim = (y >= 290 && y <= 310 && x >= 128 && x <= 384);
    const onTick = (x >= 118 && x <= 138 && y >= 256 && y <= 344)
      || (x >= 374 && x <= 394 && y >= 256 && y <= 344);
    // White upper line.
    const onTop = y >= 153 && y <= 167 && x >= 128 && x <= 384;

    if (onFrame) {
      r = 0x2f; g = 0xd4; b = 0xe0;
    } else if (onDim || onTick) {
      r = 0xff; g = 0x7a; b = 0x18;
    } else if (onTop) {
      r = 0xf5; g = 0xf5; b = 0xf5;
    }
    setPixel(raw, x, y, r, g, b, 0xff);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
};

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); // width
ihdr.writeUInt32BE(SIZE, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = join(dirname(fileURLToPath(import.meta.url)), 'icon-512.png');
writeFileSync(outPath, png);
console.log('Wrote', outPath, `(${png.length} bytes, ${SIZE}x${SIZE})`);
