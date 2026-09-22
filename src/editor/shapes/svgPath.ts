/**
 * `src/editor/shapes/svgPath.ts` — the LOCAL perfect-freehand → SVG path helper
 * (plan slice 1.6 build order step 1).
 *
 * **`perfect-freehand` does NOT export `getSvgPathFromStroke`.** The steveruizok recipe
 * is inlined here (MIT) rather than pulled from a dependency the closed §2.2 list does
 * not include. It turns a `getStroke` outline (an array of `[x, y]` points) into a
 * closed SVG path string suitable for a `Konva.Path`'s `data` — a FILLED outline, which
 * is the only way ink gets a real stroke width.
 *
 * **The parallel-array trap (session 4, F7).** `Geometry.freehand` / `Geometry.highlight`
 * store `points: Px[]` and `pressure: number[]` as **two parallel arrays** (§3.3/§3.4).
 * `Px` has NO `pressure` member, so `points.map((p) => [p.x, p.y, p.pressure ?? 0.5])`
 * does not compile under `strict:true` — and a cast around it silently makes every point
 * `0.5`, killing pressure/tilt ink width while looking like it works. `strokeInputPoints`
 * below indexes the parallel array (`pressure[i] ?? 0.5`) and is the ONLY place that
 * builds the freehand input.
 *
 * **Touch is constant-width by design.** Browser `PointerEvent.pressure` is constant
 * (`0.5`) for touch and `width`/`height` default to `1` when hardware cannot report
 * contact geometry, so a finger never produces a varying-pressure stroke. Under touch we
 * pass `thinning: 0` (pressure plays no part in width) and the §4.2 floor of 8 mu
 * (`TOUCH_INK_FLOOR_MU`); the `?? 0.5` fallback remains only so the outline is well
 * formed, never to imply variation.
 */
import { getStroke } from 'perfect-freehand';
import type { Px } from '@/domain/types';

/** §4.2 touch model: finger ink is a constant 8-mu width (no pressure→width). */
export const TOUCH_INK_FLOOR_MU = 8;
/**
 * §4.2 touch model: "smoothing raised to 60". `perfect-freehand`'s `smoothing` is a
 * 0..1 fraction (README: "how much to soften the stroke's edges"), so the spec's 60 is
 * the percent form: 60 / 100 = 0.6. The pen default is 0.5. Recorded in DECISIONS.
 */
export const TOUCH_SMOOTHING = 60 / 100;
/** §4.2 touch model: finger ink is constant-width, so pressure→width is OFF. */
export const TOUCH_THINNING = 0;
/** Pen defaults (plan build order step 1). */
export const PEN_SMOOTHING = 0.5;
export const PEN_THINNING = 0.5;
export const PEN_STREAMLINE = 0.5;

/** The constant the browser reports for a touch's `PressureEvent.pressure`. */
export const TOUCH_PRESSURE = 0.5;

export interface InkParams {
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
}

/**
 * Pen stroke params at a given CSS stroke width (image units). Pressure varies width
 * (thinning 0.5).
 */
export function penInkParams(strokeWidthMu: number, scale: number): InkParams {
  return {
    size: strokeWidthMu / scale,
    thinning: PEN_THINNING,
    smoothing: PEN_SMOOTHING,
    streamline: PEN_STREAMLINE,
  };
}

/**
 * Touch/finger stroke params: constant width floor `TOUCH_INK_FLOOR_MU`, smoothing 0.6,
 * thinning 0. `size = floorMu / scale` keeps the rendered ink constant in CSS px (§4.2).
 */
export function touchInkParams(scale: number): InkParams {
  return {
    size: TOUCH_INK_FLOOR_MU / scale,
    thinning: TOUCH_THINNING,
    smoothing: TOUCH_SMOOTHING,
    streamline: PEN_STREAMLINE,
  };
}

/**
 * The `getStroke` input from the two parallel arrays. Pressure is read by INDEX, never
 * from the `Px` object. A missing pressure falls back to the constant 0.5 (touch).
 */
export function strokeInputPoints(points: readonly Px[], pressure: readonly number[]): number[][] {
  return points.map((p, i) => [p.x, p.y, pressure[i] ?? TOUCH_PRESSURE]);
}

export interface StrokeOutlineOptions extends Partial<InkParams> {
  last?: boolean;
}

/** The raw `getStroke` outline for a stroke (image-space points). */
export function strokeOutline(
  points: readonly Px[],
  pressure: readonly number[],
  options: StrokeOutlineOptions = {},
): number[][] {
  return getStroke(strokeInputPoints(points, pressure), {
    size: options.size ?? 4,
    thinning: options.thinning ?? PEN_THINNING,
    smoothing: options.smoothing ?? PEN_SMOOTHING,
    streamline: options.streamline ?? PEN_STREAMLINE,
    simulatePressure: false,
    last: options.last ?? true,
  });
}

function avg(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * perfect-freehand → SVG path. MIT, steveruizok's recipe (inlined; the package does not
 * export it). `closed` appends `Z`, producing the filled outline a `Konva.Path` needs.
 */
export function getSvgPathFromStroke(points: number[][], closed = true): string {
  const len = points.length;
  if (len < 4) return '';
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)}Q${b[0].toFixed(2)},${b[1].toFixed(
    2,
  )} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)}T`;
  for (let i = 2, max = len - 1; i < max; i += 1) {
    a = points[i];
    b = points[i + 1];
    result += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  if (closed) result += 'Z';
  return result;
}

/** Convenience: the SVG `data` string for a stroke at the supplied params. */
export function strokePathData(
  points: readonly Px[],
  pressure: readonly number[],
  options: StrokeOutlineOptions = {},
): string {
  return getSvgPathFromStroke(strokeOutline(points, pressure, options), true);
}
