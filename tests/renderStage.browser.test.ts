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
 * white glyph fill, and a 1 px `--sel` hairline. Konva's `Text` cannot disable stroke
 * scaling (see the F1 note at the bottom of this file), so the halo's and hairline's
 * widths scale with the layer exactly like the glyphs: the whole readout grows 1 : 2 : 3.
 * The invariant is about the GLYPH, and the near-WHITE fill is not a usable detector — at
 * M = 1 the main Text's 1-px `--sel` stroke blends with essentially every fill pixel and
 * NONE reaches r,g,b > 200 (measured; see "The label's HALO ink" below). The measurement
 * is therefore the bounding box of the HALO pixels — the same glyph outline, grown by
 * 8 × M px — over a black photo. See the report's "seams".
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

/* ------------------------------------------------------------------ *
 * §4.2 ANGLE-LABEL halo scaling — its own fixture, so the dimension
 * measurements in the suite above are untouched.
 *
 * Raised as F1: "the angle label's halo has no `strokeWidthMu`, so `applyExportRules`
 * leaves it at 4 bitmap px while the glyphs scale, shrinking the outline 3× from M=1
 * to 3." Executed, that defect does NOT reproduce — see the describe block below. The
 * test is kept as the guard for the real invariant.
 * ------------------------------------------------------------------ */

/**
 * The angle fixture. `vertex → a` is straight up and `vertex → c` straight right, so the
 * derived readout is `90.0°` and `buildAngle` centres it near (236, 184) image px —
 * inside the arc (radius 64), clear of both rays.
 */
const ANGLE_VERTEX = { x: 200, y: 220 };
/**
 * 72, not the suite's 18. The angle label's halo is 4 mu either side of the glyph outline;
 * at 18 mu a JetBrains Mono stem is ≈1–2 px, so the 2 px inner stroke consumes the fill
 * and the readout rasterises as a solid dark blob — there is no halo BAND to measure. At
 * 72 mu the stems are ≈7 px, the white fill survives, and each side of a stem is an
 * isolated dark run of exactly `strokeWidth` px between two fill pixels.
 */
const ANGLE_FONT_MU = 72;

function angleAnnotations(): Annotation[] {
  return [
    {
      id: 'angle-1',
      type: 'angle',
      geometry: {
        kind: 'angle',
        a: { x: ANGLE_VERTEX.x, y: 60 },
        vertex: { ...ANGLE_VERTEX },
        c: { x: 360, y: ANGLE_VERTEX.y },
      },
      valueMm: null,
      valueDeg: 90,
      enteredText: null,
      style: { ...style(), fontSizeMu: ANGLE_FONT_MU },
      zIndex: 1000,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    },
  ];
}

function angleSheetInput(photo: CanvasImageSource | null): ExportSheetInput {
  return {
    sheetId: 'sheet-1',
    imageWidthPx: SHEET_W,
    imageHeightPx: SHEET_H,
    annotations: angleAnnotations(),
    ctx: CTX,
    ghostText: 'tap to enter value',
    photo,
  };
}

const isWhiteFill = (p: [number, number, number, number]): boolean =>
  p[0] > 200 && p[1] > 200 && p[2] > 200;

/**
 * Every contiguous run of halo pixels on ONE row, across the label's halo bounding box.
 * A horizontal scan across a glyph stem meets: dark halo band (outer half + inner half,
 * total = the layer-scaled `strokeWidth`) → white fill → dark halo band. The white fill
 * breaks the run, so the run length IS the halo band width. (Vertically, a column through
 * a stem runs the glyph's whole height inside the halo band, so the measurement is
 * horizontal.)
 */
function rowRuns(img: ImageData, y: number): number[] {
  const bb = boundingBox(img, isLabelInk);
  const runs: number[] = [];
  let run = 0;
  for (let x = Math.max(0, bb.left - 2); x <= Math.min(img.width - 1, bb.right + 2); x += 1) {
    if (isLabelInk(at(img, x, y))) run += 1;
    else {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

/** Median of a numeric list; even length → mean of the middle two. */
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The halo band width, measured as the median run of a band of rows through the label's
 * vertical centre. The centre row crosses the vertical strokes of `9`, `0`, `0` — stems —
 * not the baseline `.` or the superscript `°`. The median rejects the few long runs where
 * a row grazes a curve, and the few 1–2 px antialiasing slivers at glyph corners.
 */
function haloRunThickness(img: ImageData): number {
  const bb = boundingBox(img, isLabelInk);
  const yc = Math.floor((bb.top + bb.bottom) / 2);
  const pooled: number[] = [];
  for (let y = yc - 3; y <= yc + 3; y += 1) pooled.push(...rowRuns(img, y));
  return medianOf(pooled);
}

/**
 * F1, measured rather than read. Konva's `Text` overrides `getStrokeScaleEnabled()` to
 * return `true` unconditionally (`node_modules/konva/lib/shapes/Text.js`: "for text we
 * can't disable stroke scaling"), so a Text node's stroke is ALWAYS scaled by the
 * enclosing transform — here the export layer's `scale = M`. The angle label's halo
 * therefore rasterises at 4 × M bitmap px with or without a `strokeWidthMu` tag, and
 * `applyExportRules`'s `strokeScaleEnabled() === false` guard can never fire for a Text.
 *
 * Verified by execution: adding `strokeWidthMu: 4` to the label left its `strokeWidth()`
 * at 4 after `applyExportRules(group, 3)` and produced identical pixel runs (5 / 8 / 13).
 * Physical size is constant either way: 4M px @ 96M dpi = 4/96 in = 3 pt at every M.
 *
 * So the assertions below pass before AND after the proposed F1 tag: this is a regression
 * guard, not a defect-reproducer. It fails if the halo ever stops tracking the glyphs
 * (e.g. a future Konva that honours `strokeScaleEnabled:false` while the label is untagged).
 */
describe('§4.2 angle-label halo scales with M', () => {
  it('the 4-mu halo run is 4 × M bitmap px (1 : 2 : 3)', async () => {
    const thickness: number[] = [];
    let fillPixelsAtM1 = 0;
    for (const m of [1, 2, 3] as ExportMultiplier[]) {
      const rendered = await renderSheet(angleSheetInput(blackPhoto()), m);
      try {
        const img = readPixels(rendered.canvas);
        if (m === 1) {
          // Guards the measurement's premise: if the fill did not survive, every stem
          // would be one merged run and the number below would measure the glyph.
          fillPixelsAtM1 = boundingBox(img, isWhiteFill).count;
        }
        thickness.push(haloRunThickness(img));
      } finally {
        rendered.canvas.width = 0;
        rendered.canvas.height = 0;
      }
    }
    const [t1, t2, t3] = thickness as [number, number, number];
    expect(fillPixelsAtM1).toBeGreaterThan(0); // the white fill really renders at M = 1

    // 4 × M = 4 / 8 / 12, ±1 for the antialiased outer edge of the halo (measured
    // 5 / 8 / 13: one partial pixel at each dark/photo boundary).
    expect(Math.abs(t1 - 4 * 1)).toBeLessThanOrEqual(1);
    expect(Math.abs(t2 - 4 * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(t3 - 4 * 3)).toBeLessThanOrEqual(1);

    // The scaling itself, not just the absolute sizes: the halo tracks the glyphs.
    expect(t2).toBeGreaterThan(t1);
    expect(t3).toBeGreaterThan(t2);
  });
});

/**
 * UI/GUI handoff pass (2026-09-22) — the export watermark, measured in real pixels.
 *
 * A synthetic solid-white square stands in for the shipped mark (no network fetch in a
 * unit test): over a solid-black photo, `EXPORT_WATERMARK_OPACITY` (0.32) blended white
 * onto black is exactly `round(255 * 0.32) = 82` per channel — arithmetic, not a fixture
 * value pulled from a screenshot.
 */
describe('export watermark — composited onto the flattened bitmap', () => {
  async function whiteSquareBitmap(size: number): Promise<ImageBitmap> {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D context for the synthetic watermark');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    return createImageBitmap(canvas);
  }

  it('is absent when no watermark is passed (the existing renderSheet contract)', async () => {
    const rendered = await renderSheet(sheetInput(blackPhoto()), 1);
    try {
      const img = readPixels(rendered.canvas);
      const i = (273 * img.width + 370) * 4;
      // (370, 273) — inside where a watermark WOULD land (see the next test's
      // `watermarkRect` derivation) — stays pure black photo, untouched.
      expect([img.data[i], img.data[i + 1], img.data[i + 2]]).toEqual([0, 0, 0]);
    } finally {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  });

  it('composites into the bottom-right corner at the computed opacity, and leaves the top-left untouched', async () => {
    const image = await whiteSquareBitmap(64);
    const input: ExportSheetInput = { ...sheetInput(blackPhoto()), watermark: { image, aspectRatio: 1 } };
    const rendered = await renderSheet(input, 1);
    try {
      const img = readPixels(rendered.canvas);
      const at = (x: number, y: number) => {
        const i = (y * img.width + x) * 4;
        return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] as const;
      };

      // watermarkRect(400, 300, 1): width = 400*0.16 = 64, height = 64 (aspect 1, under
      // the 300*0.12=36 cap? No — 64 > 36, so the height-cap branch applies: height=36,
      // width=36. margin = 400*0.03=12 / 300*0.03=9. rect = x:352..388, y:255..291.
      // A point well inside that rect (370, 273) must show the blended white.
      const inside = at(370, 273);
      // round(255 * 0.32) = 82 (white blended onto black at the fixed opacity).
      expect(inside[0]).toBeGreaterThanOrEqual(74);
      expect(inside[0]).toBeLessThanOrEqual(90);
      expect(inside[0]).toBe(inside[1]);
      expect(inside[0]).toBe(inside[2]);

      // Top-left corner is nowhere near the mark — still pure black.
      const outside = at(10, 10);
      expect(outside).toEqual([0, 0, 0]);
    } finally {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  });
});
