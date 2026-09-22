/**
 * `src/editor/shapes/renderShape.ts` — imperative Konva renderers for the geometry
 * shapes: line, arrow, rect, ellipse, polygon and angle (plan slice 1.6 build order
 * step 2/3). AGENTS #4: imperative Konva only.
 *
 * §4.2 SCREEN SCALING (D54 — never flatten): every stroke is a Konva stroke with
 * `strokeScaleEnabled:false` and `strokeWidth = strokeWidthMu`, tagged `strokeWidthMu`
 * so `EditorCanvas.applyScreenRules` can re-apply it at any zoom. Text (the angle
 * readout, segment labels) carries `fontSizeMu` and is counter-scaled. Nothing here
 * pre-multiplies or bakes a screen size.
 */
import Konva from 'konva';
import type { AnnotationStyle, Px } from '@/domain/types';
import { angleDeg, midpoint, readableAngleDeg } from '@/domain/geometry';
import { screenFontSize } from '@/editor/EditorCanvas';

/** Shared per-annotation render context. */
export interface RenderCtx {
  scale: number;
  selected?: boolean;
}

/** Site Slate tokens (§3.1). */
export const SEL = '#2FD4E0';
export const LABEL_HALO = '#0B0E12';
export const INK_DEFAULT = '#FF7A18';

const LINE_DASH: Record<AnnotationStyle['lineStyle'], number[] | undefined> = {
  solid: undefined,
  dashed: [8, 6],
  dotted: [1, 5],
};

function strokeTagged(node: Konva.Shape, style: AnnotationStyle): void {
  node.strokeScaleEnabled(false);
  node.setAttr('strokeWidthMu', style.strokeWidthMu);
}

function dashOf(style: AnnotationStyle): number[] | undefined {
  return LINE_DASH[style.lineStyle];
}

function arrowheadConfig(style: AnnotationStyle): { pointerAtBeginning: boolean; pointerAtEnding: boolean } {
  return {
    pointerAtBeginning: style.arrowheads === 'start' || style.arrowheads === 'both',
    pointerAtEnding: style.arrowheads === 'end' || style.arrowheads === 'both',
  };
}

/** Line `a→b`. */
function buildLine(geometry: { a: Px; b: Px }, style: AnnotationStyle): Konva.Shape {
  const node = new Konva.Line({
    points: [geometry.a.x, geometry.a.y, geometry.b.x, geometry.b.y],
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    lineCap: 'round',
    dash: dashOf(style),
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  strokeTagged(node, style);
  return node;
}

/** Arrow `a→b` (Konva.Arrow; pointer size scales with stroke width). */
function buildArrow(geometry: { a: Px; b: Px }, style: AnnotationStyle): Konva.Shape {
  const heads = arrowheadConfig(
    style.arrowheads === 'none' ? { ...style, arrowheads: 'end' as const } : style,
  );
  const node = new Konva.Arrow({
    points: [geometry.a.x, geometry.a.y, geometry.b.x, geometry.b.y],
    stroke: style.strokeColor,
    fill: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    lineCap: 'round',
    dash: dashOf(style),
    pointerLength: style.strokeWidthMu * 3,
    pointerWidth: style.strokeWidthMu * 3,
    pointerAtBeginning: heads.pointerAtBeginning,
    pointerAtEnding: heads.pointerAtEnding,
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  strokeTagged(node, style);
  return node;
}

/** Rectangle: geometry is top-left + size. */
function buildRect(
  geometry: { x: number; y: number; width: number; height: number; cornerRadius?: number },
  style: AnnotationStyle,
): Konva.Shape {
  const node = new Konva.Rect({
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    cornerRadius: geometry.cornerRadius ?? 0,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    fill: style.fillColor ?? undefined,
    fillEnabled: style.fillColor !== null,
    opacity: style.fillColor !== null ? style.fillAlpha : 1,
    dash: dashOf(style),
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  strokeTagged(node, style);
  return node;
}

/** Ellipse: geometry is top-left + size; Konva wants centre + radii. */
function buildEllipse(
  geometry: { x: number; y: number; width: number; height: number },
  style: AnnotationStyle,
): Konva.Shape {
  const node = new Konva.Ellipse({
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
    radiusX: geometry.width / 2,
    radiusY: geometry.height / 2,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    fill: style.fillColor ?? undefined,
    fillEnabled: style.fillColor !== null,
    opacity: style.fillColor !== null ? style.fillAlpha : 1,
    dash: dashOf(style),
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  strokeTagged(node, style);
  return node;
}

/** Polygon / open polyline. */
function buildPolygon(
  geometry: { points: Px[]; closed: boolean },
  style: AnnotationStyle,
): Konva.Shape {
  const flat = geometry.points.flatMap((p) => [p.x, p.y]);
  const node = new Konva.Line({
    points: flat,
    closed: geometry.closed,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    lineCap: 'round',
    lineJoin: 'round',
    fill: geometry.closed ? style.fillColor ?? undefined : undefined,
    fillEnabled: geometry.closed && style.fillColor !== null,
    dash: dashOf(style),
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  strokeTagged(node, style);
  return node;
}

/**
 * Angle: two rays from `vertex` (to `a` and `c`) plus an arc between them. The arc
 * starts at the `vertex→a` bearing and sweeps to the `vertex→c` bearing in the shorter
 * direction. Konva.Arc draws CLOCKWISE from `rotation`; a negative `angle` therefore
 * sweeps counter-clockwise.
 */
function buildAngle(
  geometry: { a: Px; vertex: Px; c: Px },
  style: AnnotationStyle,
  ctx: RenderCtx,
): Konva.Group {
  const { a, vertex, c } = geometry;
  const group = new Konva.Group({ listening: true });

  for (const tip of [a, c]) {
    const ray = new Konva.Line({
      points: [vertex.x, vertex.y, tip.x, tip.y],
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidthMu,
      lineCap: 'round',
      dash: dashOf(style),
      hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
    });
    strokeTagged(ray, style);
    group.add(ray);
  }

  const r1 = Math.hypot(a.x - vertex.x, a.y - vertex.y);
  const r2 = Math.hypot(c.x - vertex.x, c.y - vertex.y);
  const radius = Math.max(12 / ctx.scale, Math.min(r1, r2) * 0.4);
  const startDeg = (Math.atan2(a.y - vertex.y, a.x - vertex.x) * 180) / Math.PI;
  const endDeg = (Math.atan2(c.y - vertex.y, c.x - vertex.x) * 180) / Math.PI;
  let sweep = endDeg - startDeg;
  while (sweep <= -180) sweep += 360;
  while (sweep > 180) sweep -= 360;

  const arc = new Konva.Arc({
    x: vertex.x,
    y: vertex.y,
    innerRadius: radius,
    outerRadius: radius,
    angle: sweep,
    rotation: startDeg,
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    lineCap: 'round',
    listening: false,
  });
  strokeTagged(arc, style);
  group.add(arc);

  // The live readout, derived from the geometry (never stored). `°` only — the `≈`
  // prefix belongs to the sheet's commit copy, not the on-canvas badge.
  const deg = angleDeg(a, vertex, c);
  const text = `${deg.toFixed(1)}°`;
  const at = midpoint(
    { x: vertex.x + Math.cos(((startDeg + sweep / 2) * Math.PI) / 180) * radius * 1.6,
      y: vertex.y + Math.sin(((startDeg + sweep / 2) * Math.PI) / 180) * radius * 1.6 },
    vertex,
  );
  const label = new Konva.Text({
    text,
    fontSize: screenFontSize(style.fontSizeMu, ctx.scale),
    fontFamily: 'JetBrains Mono',
    fontStyle: style.bold ? '700' : '400',
    fill: '#FFFFFF',
    stroke: LABEL_HALO,
    strokeWidth: 4,
    strokeScaleEnabled: false,
    lineJoin: 'round',
    listening: false,
  });
  label.setAttr('fontSizeMu', style.fontSizeMu);
  label.position(at);
  label.offsetX(label.width() / 2);
  label.offsetY(label.height() / 2);
  group.add(label);

  return group;
}

export interface ShapeRenderInput {
  id: string;
  kind: 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'angle';
  geometry: Extract<
    import('@/domain/types').Geometry,
    { kind: 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'angle' }
  >;
  style: AnnotationStyle;
  ctx: RenderCtx;
  locked?: boolean;
}

/** Build a fresh Konva group for a shape annotation. */
export function buildShapeGroup(input: ShapeRenderInput): Konva.Group {
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', input.id);
  group.setAttr('locked', input.locked ?? false);
  group.setAttr('kind', input.kind);

  let node: Konva.Shape | Konva.Group;
  switch (input.geometry.kind) {
    case 'line':
      node = buildLine(input.geometry, input.style);
      break;
    case 'arrow':
      node = buildArrow(input.geometry, input.style);
      break;
    case 'rect':
      node = buildRect(input.geometry, input.style);
      break;
    case 'ellipse':
      node = buildEllipse(input.geometry, input.style);
      break;
    case 'polygon':
      node = buildPolygon(input.geometry, input.style);
      break;
    case 'angle':
      node = buildAngle(input.geometry, input.style, input.ctx);
      break;
  }
  group.add(node);
  return group;
}

/**
 * The axis-aligned bounds of a shape in image space — the selection/frame base.
 * Rotation is not applied (selection rotates by transforming the live group).
 */
export function shapeBounds(
  geometry: ShapeRenderInput['geometry'],
): { x: number; y: number; width: number; height: number } {
  switch (geometry.kind) {
    case 'line':
    case 'arrow': {
      const x = Math.min(geometry.a.x, geometry.b.x);
      const y = Math.min(geometry.a.y, geometry.b.y);
      return {
        x,
        y,
        width: Math.abs(geometry.b.x - geometry.a.x),
        height: Math.abs(geometry.b.y - geometry.a.y),
      };
    }
    case 'rect':
    case 'ellipse':
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    case 'polygon': {
      const xs = geometry.points.map((p) => p.x);
      const ys = geometry.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case 'angle': {
      const xs = [geometry.a.x, geometry.vertex.x, geometry.c.x];
      const ys = [geometry.a.y, geometry.vertex.y, geometry.c.y];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
  }
}

/** Text rotation so a segment label stays upright — re-export for callers. */
export function labelRotation(a: Px, b: Px): number {
  return readableAngleDeg(a, b);
}
