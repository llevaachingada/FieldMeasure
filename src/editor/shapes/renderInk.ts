/**
 * `src/editor/shapes/renderInk.ts` — freehand + highlighter renderer (plan slice 1.6
 * build order step 1).
 *
 * Ink is a **filled outline**, not a stroke: `getStroke(points, {size: strokeWidthMu / s})`
 * → `getSvgPathFromStroke(outline, true)` → `Konva.Path`. A fill ignores
 * `strokeScaleEnabled`, so the outline MUST be regenerated at `size = strokeWidthMu / s`
 * on every zoom change — that is the §4.2 seam and the `size` drift is exactly the bug
 * the "ink zoom constancy" gate catches. `EditorCanvas.applyScreenRules` regenerates the
 * node's `data` from the raw `inkPoints` + `pressure` stored on the node (never the
 * derived path).
 *
 * Highlighter: 30 % alpha, `multiply` blend, a constant-width bar (thinning 0 — a
 * chisel is a flat, un-tapered bar; perfect-freehand has no chisel tip, so the
 * straight-line tap-tap path is the true chisel and the freehand path is a constant
 * bar), and it is inserted into the `Z_HIGHLIGHT_BASE` band by the scene (below all
 * other markup, above the photo).
 */
import Konva from 'konva';
import type { AnnotationStyle, Px } from '@/domain/types';
import {
  getSvgPathFromStroke,
  strokeOutline,
  type InkParams,
} from './svgPath';

/** Highlight §8.5: 30 % alpha, multiply blend. */
export const HIGHLIGHT_ALPHA = 0.3;
export const HIGHLIGHT_BLEND: GlobalCompositeOperation = 'multiply';
/** §4.3 touch model: the highlighter's chisel width default. */
export const HIGHLIGHT_CHISEL_TOUCH_MU = 24;

/** The node attrs `EditorCanvas.applyScreenRules` reads to regenerate the outline. */
export interface InkNodeAttrs {
  inkPoints: Px[];
  pressure: number[];
  strokeWidthMu: number;
  inkThinning: number;
  inkSmoothing: number;
  inkStreamline: number;
}

export function inkParamsFor(style: AnnotationStyle, scale: number, chisel: boolean): InkParams {
  return {
    size: style.strokeWidthMu / scale,
    thinning: chisel ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  };
}

export function inkPathData(
  points: readonly Px[],
  pressure: readonly number[],
  params: InkParams,
): string {
  return getSvgPathFromStroke(strokeOutline(points, pressure, { ...params, last: true }), true);
}

export interface InkRenderInput {
  id: string;
  kind: 'freehand' | 'highlight';
  points: Px[];
  pressure: number[];
  style: AnnotationStyle;
  scale: number;
  /** True when the stroke came from a touch contact (constant width; no taper). */
  touch?: boolean;
  locked?: boolean;
}

/** Build a fresh `Konva.Path` ink group for a stroke annotation. */
export function buildInkGroup(input: InkRenderInput): Konva.Group {
  const { style, scale, kind } = input;
  const isHighlight = kind === 'highlight';
  const params = inkParamsFor(style, scale, isHighlight);
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', input.id);
  group.setAttr('locked', input.locked ?? false);
  group.setAttr('kind', kind);

  const path = new Konva.Path({
    data: inkPathData(input.points, input.pressure, params),
    fill: style.strokeColor,
    strokeEnabled: false,
    opacity: isHighlight ? HIGHLIGHT_ALPHA : 1,
    // A fill ignores `strokeScaleEnabled`; the tag below is what regeneration reads.
    strokeScaleEnabled: false,
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 2),
  });
  path.setAttr('strokeWidthMu', style.strokeWidthMu);
  path.setAttr('inkPoints', input.points.map((p) => ({ ...p })));
  path.setAttr('pressure', [...input.pressure]);
  path.setAttr('inkThinning', params.thinning);
  path.setAttr('inkSmoothing', params.smoothing);
  path.setAttr('inkStreamline', params.streamline);
  path.setAttr('inkKind', kind);
  path.setAttr('inkTouch', input.touch === true);
  if (isHighlight) {
    path.globalCompositeOperation(HIGHLIGHT_BLEND);
  }
  group.add(path);
  return group;
}

/** Re-derive an ink path's `data` at a new zoom (§4.2) — the zoom-constancy seam. */
export function regenerateInkNode(path: Konva.Path, scale: number): void {
  const points = path.getAttr('inkPoints') as Px[] | undefined;
  const pressure = path.getAttr('pressure') as number[] | undefined;
  const strokeWidthMu = path.getAttr('strokeWidthMu') as number | undefined;
  if (!Array.isArray(points) || !Array.isArray(pressure) || typeof strokeWidthMu !== 'number') return;
  const params: InkParams = {
    size: strokeWidthMu / scale,
    thinning: (path.getAttr('inkThinning') as number) ?? 0.5,
    smoothing: (path.getAttr('inkSmoothing') as number) ?? 0.5,
    streamline: (path.getAttr('inkStreamline') as number) ?? 0.5,
  };
  path.data(inkPathData(points, pressure, params));
}
