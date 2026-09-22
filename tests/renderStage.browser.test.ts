/**
 * tests/renderStage.browser.test.ts — the §4.2 export gate, MEASURED IN REAL PIXELS.
 *
 * Runs in the `browser` Vitest project because it needs a real `Konva.Stage` and a real
 * rasteriser (jsdom and node have no canvas, D40).
 *
 * WHY THIS FILE EXISTS. The review brief's prior catch: "the label half of the §4.2 gate
 * was attribute arithmetic — it proved the rule was applied, not that the glyph rendered
 * at the right size." `tests/exportInvariance.test.ts` pins the arithmetic; this file
 * rasterises a sheet at M = 1, 2, 3 and reads the bitmap back with `getImageData`:
 *
 *   - the stroke's opaque run is measured in bitmap px  → must be 4 × M  (1 : 2 : 3)
 *   - the label's glyph-ink bounding box is measured    → must scale 1 : 2 : 3
 *
 * If the export path ever counter-scaled the text (the SCREEN rule, `fontSize = mu / s`),
 * the glyph box would be CONSTANT in bitmap px across M — 1 : 1 : 1 — while the stroke
 * still grew 1 : 2 : 3. Only a pixel measurement separates those two worlds.
 *
 * HOW THE LABEL IS MEASURED — and why not "all non-background pixels". The dimension
 * label is three overlapping nodes: a dark halo `Konva.Text` (`strokeWidth: 8`), the
 * white glyph fill, and a 1 px `--sel` hairline. The halo's and hairline's widths are
 * NOT tagged `strokeWidthMu`, so — exactly as on screen — they are not multiplied by M;
 * a bounding box over every non-background pixel would therefore measure
 * `glyph + a constant halo` (≈ 18M + 8) and could not be 1 : 2 : 3 by construction.
 * The invariant is about the GLYPH, so the measurement is the bounding box of the
 * near-WHITE pixels (the `#FFFFFF` fill) over a black photo. See the report's "seams".
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import {
  renderSheet,
  type ExportMultiplier,
  type ExportSheetInput,
} from '../src/export/renderStage';

/** Working-image size of the fake sheet. 400 × 300 → 1200 × 900 at the largest M. */
const SHEET_W = 400;
const SHEET_H = 300;
/** §4.2's two sizes under test. */
const STROKE_MU = 4;
const FONT_MU = 18;
/** Where the measured line lives, in working-image px. */
const LINE_Y = 60;

const CTX = { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 } as const;

function style(): Annotation['style'] {
  return { ...DEFAULT_STYLE, strokeWidthMu: STROKE_MU, fontSizeMu: FONT_MU, strokeColor: '#FF7A18' };
}

/**
 * Two annotations, deliberately far apart so each can be measured without the other:
 *   - a horizontal 4-mu line across y = 60   (the stroke measurement)
 *   - a dimension across y = 220 whose label is DERIVED from `valueMm` (AGENTS #2)
 * 3048 mm = 10 ft exactly, so the derived label is short and unambiguous.
 */
function annotations(): Annotation[] {
  return [
    {
      id: 'line-1',
      type: 'line',
      geometry: { kind: 'line', a: { x: 40, y: LINE_Y }, b: { x: 360, y: LINE_Y } },
      valueMm: null,
      enteredText: null,
      style: style(),
      zIndex: 1000,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    },
    {
      id: 'dim-1',
      type: 'dimension',
      // The label sits at the midpoint (200, 220); |mid → b| = 160 image px ≥ the 140 px
      // collision radius, so `labelLayout` does NOT push it off the midpoint.
      geometry: { kind: 'dimension', a: { x: 40, y: 220 }, b: { x: 360, y: 220 } },
      valueMm: 3048,
      enteredText: null,
      style: style(),
      zIndex: 1010,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    },
  ];
}

/** A solid-black "photo" so the white glyph fill is the only near-white thing on it. */
function blackPhoto(): HTMLCanvasElement {
  const photo = document.createElement('canvas');
  photo.width = SHEET_W;
  photo.height = SHEET_H;
  const ctx = photo.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the fake photo');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  return photo;
}

function sheetInput(photo: CanvasImageSource | null): ExportSheetInput {
  return {
    sheetId: 'sheet-1',
    imageWidthPx: SHEET_W,
    imageHeightPx: SHEET_H,
    annotations: annotations(),
    ctx: CTX,
    ghostText: 'tap to enter value',
    photo,
  };
}

function readPixels(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the rendered canvas');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function at(img: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
}

/** Anything that is not the black photo: any channel clearly above black. */
function isInk(p: [number, number, number, number]): boolean {
  return p[0] > 40 || p[1] > 40 || p[2] > 40;
}

/**
 * The label's HALO ink (#0B0E12 = 11,14,18) over the black photo.
 *
 * NOT the white glyph fill, and that choice is measured rather than assumed. At M = 1 an
 * 18-mu label's stems are ~1 px wide, so the main Text's 1-px `--sel` stroke blends with
 * essentially every fill pixel and NONE reaches r,g,b > 200. Executed, on a black page,
 * same node, `fill:#FFFFFF` + `stroke:#2FD4E0 1px`:
 *     fontSize 18 -> 0 px over 200, 15 px over 150, 43 px over 100
 *     fontSize 54 -> 599 px over 200
 * So a `> 200` detector reports "no label" at M = 1 and a real label at M = 3 — it would
 * fail the ratio for a reason that has nothing to do with the export rules. The halo is
 * the same glyph outline at 8 x M px and is unambiguous at every M.
 *
 * Excludes: the black photo (0,0,0), the orange line/ticks (r dominant) and their
 * antialiasing, and the cyan hairline (r = 47 > 40).
 */
function isLabelInk(p: [number, number, number, number]): boolean {
  const [r, g, b] = p;
  if (r === 0 && g === 0 && b === 0) return false; // the photo
  if (r > 40) return false; // orange ink, cyan hairline, white fill
  return b >= r && g >= r; // #0B0E12 is blue-dominant; orange AA is red-dominant
}

/** Longest contiguous run of ink down one column, within [y0, y1). */
function longestColumnRun(
  img: ImageData,
  x: number,
  y0: number,
  y1: number,
  pred: (p: [number, number, number, number]) => boolean,
): number {
  let best = 0;
  let run = 0;
  for (let y = y0; y < y1; y += 1) {
    if (pred(at(img, x, y))) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Bounding box of every pixel matching `pred` over the whole bitmap. */
function boundingBox(
  img: ImageData,
  pred: (p: [number, number, number, number]) => boolean,
): { top: number; bottom: number; left: number; right: number; height: number; width: number; count: number } {
  let top = Number.POSITIVE_INFINITY;
  let bottom = -1;
  let left = Number.POSITIVE_INFINITY;
  let right = -1;
  let count = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (!pred(at(img, x, y))) continue;
      count += 1;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (count === 0) return { top: 0, bottom: -1, left: 0, right: -1, height: 0, width: 0, count: 0 };
  return { top, bottom, left, right, height: bottom - top + 1, width: right - left + 1, count };
}

interface Measured {
  canvasWidth: number;
  canvasHeight: number;
  bitmapWidthPx: number;
  bitmapHeightPx: number;
  strokeThickness: number;
  glyphHeight: number;
  photoMissing: boolean;
}

async function measure(m: ExportMultiplier): Promise<Measured> {
  const rendered = await renderSheet(sheetInput(blackPhoto()), m);
  try {
    const img = readPixels(rendered.canvas);
    // The line lives at y = 60 image px; scan a column well inside its span (x = 200)
    // over the top third only, so the dimension (y = 220) and its label cannot leak in.
    const strokeThickness = longestColumnRun(img, 200 * m, 0, 120 * m, isInk);
    // Over a black photo the ONLY near-white pixels in the whole bitmap are the label's
    // glyph fill: the line is orange, the halo is #0B0E12, the hairline is #2FD4E0.
    const glyph = boundingBox(img, isLabelInk);
    expect(glyph.count).toBeGreaterThan(0); // the label really rendered
    return {
      canvasWidth: rendered.canvas.width,
      canvasHeight: rendered.canvas.height,
      bitmapWidthPx: rendered.bitmapWidthPx,
      bitmapHeightPx: rendered.bitmapHeightPx,
      strokeThickness,
      glyphHeight: glyph.height,
      photoMissing: rendered.photoMissing,
    };
  } finally {
    rendered.canvas.width = 0;
    rendered.canvas.height = 0;
  }
}

describe('§4.2 export stage — measured in real pixels', () => {
  it('the bitmap is exactly imageWidth × M by imageHeight × M, at pixelRatio 1', async () => {
    for (const m of [1, 2, 3] as ExportMultiplier[]) {
      const measured = await measure(m);
      // 400 × 1 = 400 / 400 × 2 = 800 / 400 × 3 = 1200
      expect(measured.canvasWidth).toBe(SHEET_W * m);
      // 300 × 1 = 300 / 300 × 2 = 600 / 300 × 3 = 900
      expect(measured.canvasHeight).toBe(SHEET_H * m);
      expect(measured.bitmapWidthPx).toBe(SHEET_W * m);
      expect(measured.bitmapHeightPx).toBe(SHEET_H * m);
      expect(measured.photoMissing).toBe(false);
      // pixelRatio 1 is what makes canvas.width === stage width. `min(dpr, 2)` (the
      // SCREEN rule) would give 800 / 1600 / 2400 on a 2× display.
    }
  });

  it('a 4-mu stroke rasterises at 4 × M bitmap px (1 : 2 : 3)', async () => {
    const runs: number[] = [];
    for (const m of [1, 2, 3] as ExportMultiplier[]) {
      const measured = await measure(m);
      runs.push(measured.strokeThickness);
      // The line is at y = 60 image px, so at bitmap scale M its centre is 60M and the
      // 4M-wide stroke spans [60M − 2M, 60M + 2M) — whole rows, no partial coverage.
      // Expected: 4 / 8 / 12 px. Tolerance ±1 px for the rasteriser's edge rule.
      expect(Math.abs(measured.strokeThickness - STROKE_MU * m)).toBeLessThanOrEqual(1);
    }
    // The ratio itself, stated as the gate states it: 1 : 2 : 3.
    expect(runs[1]! / runs[0]!).toBeCloseTo(2, 1);
    expect(runs[2]! / runs[0]!).toBeCloseTo(3, 1);
  });

  it('an 18-mu label’s GLYPHS rasterise 1 : 2 : 3 — the text is never counter-scaled', async () => {
    const heights: number[] = [];
    for (const m of [1, 2, 3] as ExportMultiplier[]) {
      heights.push((await measure(m)).glyphHeight);
    }
    const [h1, h2, h3] = heights as [number, number, number];

    // Sanity: the measured ink is the HALO box — the glyph ink (the font's cap/ascender
    // height, ≈ 0.5–1.0 × 18 px) grown by the 8-px halo stroke, ≈ 9..18 + 8 = 17..26.
    // A generous 12..36 still excludes both failure modes that matter: "nothing rendered"
    // (0) and "the whole 300-px-tall page matched" (a detector that caught the photo).
    expect(h1).toBeGreaterThanOrEqual(12);
    expect(h1).toBeLessThanOrEqual(36);

    // TOLERANCE ARITHMETIC. A thresholded bounding box can gain or lose at most one
    // antialiased row at each of its two edges, so each measurement carries ±2 px:
    //   h1 = H ± 2 (H the true ink height), and h_M = M·H ± 2.
    //   ⇒ |h_M − M·h1| ≤ 2 + 2M   →  ≤ 6 px at M = 2, ≤ 8 px at M = 3.
    // With h1 ≈ 13, that is 26 ± 6 and 39 ± 8 — and the counter-scaled bug (13 at every
    // M) misses both bands by a wide margin, which is the point of the bound.
    expect(Math.abs(h2 - 2 * h1)).toBeLessThanOrEqual(2 + 2 * 2);
    expect(Math.abs(h3 - 3 * h1)).toBeLessThanOrEqual(2 + 2 * 3);

    // The explicit anti-regression: if `applyExportRules` ever divided fontSize by M
    // (the screen rule), these would all be equal.
    expect(h2).toBeGreaterThan(h1);
    expect(h3).toBeGreaterThan(h2);
    expect(h3).toBeGreaterThan(2 * h1);
  });

  it('stroke and glyph scale TOGETHER — one physical size at every multiplier', async () => {
    // The whole invariant in one assertion: both marks grow linearly with M, so
    // (mark px) / (96 × M) is constant — 0.75 × mu pt. Ratios are compared rather than
    // absolute px because the glyph ink height depends on the browser's font.
    const m1 = await measure(1);
    const m3 = await measure(3);
    const strokeRatio = m3.strokeThickness / m1.strokeThickness; // ≈ 3
    const glyphRatio = m3.glyphHeight / m1.glyphHeight; //           ≈ 3
    expect(strokeRatio).toBeCloseTo(3, 1);
    // ±0.25 on the glyph ratio: h1 ≈ 13 ± 2 and h3 ≈ 39 ± 2 give 37/15 = 2.47 … 41/11 =
    // 3.73 in the worst case; the realistic ±1 px band is 38/14 = 2.71 … 40/12 = 3.33.
    expect(Math.abs(glyphRatio - 3)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(glyphRatio - strokeRatio)).toBeLessThanOrEqual(0.4);
  });
});

describe('§19.4a damaged photo', () => {
  it('renders a WHITE page at the sheet’s stored dimensions, markup intact', async () => {
    const m: ExportMultiplier = 2;
    const rendered = await renderSheet(sheetInput(null), m);
    try {
      expect(rendered.photoMissing).toBe(true);
      // Stored dimensions × M: 400 × 2 = 800, 300 × 2 = 600. The sheet is NEVER skipped
      // and never resized to "no photo" — the markup IS the measurement record.
      expect(rendered.canvas.width).toBe(SHEET_W * m);
      expect(rendered.canvas.height).toBe(SHEET_H * m);

      const img = readPixels(rendered.canvas);
      // Corners are page-white and fully opaque (no transparent PDF page).
      for (const [x, y] of [
        [0, 0],
        [img.width - 1, 0],
        [0, img.height - 1],
        [img.width - 1, img.height - 1],
      ] as const) {
        expect(at(img, x, y)).toEqual([255, 255, 255, 255]);
      }

      // The markup is still there and still 4 × M px thick: the orange line is the only
      // non-white thing in the top third of the page.
      const notWhite = (p: [number, number, number, number]): boolean =>
        p[0] < 240 || p[1] < 240 || p[2] < 240;
      const thickness = longestColumnRun(img, 200 * m, 0, 120 * m, notWhite);
      expect(Math.abs(thickness - STROKE_MU * m)).toBeLessThanOrEqual(1); // 8 ± 1
    } finally {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  });
});
