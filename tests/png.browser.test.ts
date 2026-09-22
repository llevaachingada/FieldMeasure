/**
 * tests/png.browser.test.ts — src/export/png.ts's `canvasToPngBytes` (slice 1.9,
 * Lane B). Needs a real `HTMLCanvasElement` (jsdom has no canvas — decision D40), so
 * this lives in the `browser` Vitest project (real Chromium via Playwright).
 *
 * NOT RUN BY THIS LANE — the browser project's Chromium download was in progress at
 * the time this file was written; the orchestrator runs `--project browser` at
 * integration. Written carefully against the pinned signatures and cross-checked
 * against the node-side `readPngSize`/`zipPngs` behaviour proven in tests/png.test.ts,
 * but unexecuted by this agent.
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { canvasToPngBytes, readPngSize, zipPngs } from '../src/export/png';

// A deliberately odd, small size: 7x5. Not a multiple of any common export
// multiplier (1x/2x/3x all leave 7x5 as non-round numbers: 7,14,21 / 5,10,15), so a
// stray x2 or a transposed width/height cannot coincidentally produce the right
// number and hide a bug.
const WIDTH = 7;
const HEIGHT = 5;

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  // Draw something (not just a blank canvas) — a couple of filled rects in
  // different colours, so the encoded PNG has real, non-uniform pixel data.
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, 3, 2);
  return canvas;
}

describe('canvasToPngBytes', () => {
  it('encodes a real 7x5 canvas to PNG bytes whose IHDR reports exactly 7x5', async () => {
    const canvas = makeCanvas();
    const bytes = await canvasToPngBytes(canvas);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const size = readPngSize(bytes);
    expect(size).toEqual({ width: WIDTH, height: HEIGHT });
  });

  it('round-trips those bytes through zipPngs + unzipSync and still parses to 7x5', async () => {
    const canvas = makeCanvas();
    const bytes = await canvasToPngBytes(canvas);

    const zipped = zipPngs([{ name: 'sheet-7x5.png', bytes }]);
    const unzipped = unzipSync(zipped);

    expect(Object.keys(unzipped)).toEqual(['sheet-7x5.png']);
    const extracted = unzipped['sheet-7x5.png'];
    expect(extracted).toEqual(bytes); // stored (level 0), so bytes are unchanged

    const size = readPngSize(extracted);
    expect(size).toEqual({ width: WIDTH, height: HEIGHT });
  });
});
