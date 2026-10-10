/**
 * `src/editor/shapes/renderDimension.ts` — imperative Konva renderer for one
 * dimension annotation (AGENTS #4: imperative Konva only; never react-konva).
 *
 * Screen scaling (§4.2 / D54): the line and ticks are strokes with
 * `strokeScaleEnabled:false` and `strokeWidth = strokeWidthMu`; the label is a Text
 * tagged `fontSizeMu` so `EditorCanvas.applyScreenRules` re-applies
 * `fontSize = fontSizeMu / scale` on every zoom. Nothing here pre-multiplies.
 *
 * The label is the **derived** dual-outline label: a dark halo (4 px each side) plus a
 * 1 px `--sel` inner hairline, whose text comes from `derivedDimensionLabel`. The ghost
 * state (`«tap to enter value»`) is the same node with the ghost text.
 */
import Konva from 'konva';
import type { AnnotationStyle, Px } from '@/domain/types';
import { screenFontSize } from '@/editor/EditorCanvas';
import { arrowHeadPoints, arrowHeadSpec } from './arrowHead';
import {
  derivedDimensionLabel,
  labelLayout,
  type LabelContext,
} from './dimensionLabel';

/** Site Slate tokens (§3.1) used by the label halo. */
export const LABEL_HALO = '#0B0E12'; // rgba(11,14,18,.85) flattened onto the mat
export const SEL = '#2FD4E0';
export const LABEL_FILL = '#FFFFFF';

/**
 * The font of every measurement readout on the drawing (dimension labels, the angle readout).
 * JetBrains Mono is the face; the generic `monospace` is the safety net. A Konva `Text` with a
 * single unlisted family falls to the browser default when the @font-face has not loaded, which
 * on Windows is Times New Roman, a serif on the numbers a cabinet is cut from. With the list, a
 * font that fails to load degrades to the system monospace instead.
 */
export const MEASURE_LABEL_FONT_FAMILY = "'JetBrains Mono', ui-monospace, monospace";

export interface DimensionRenderInput {
  id: string;
  a: Px;
  b: Px;
  valueMm: number | null;
  /** D151: the user-dragged label offset from the line (image px, signed). */
  labelOffset?: number;
  /** Set when the user typed a value — the raw text, stored verbatim (§3.3). */
  enteredText?: string | null;
  style: AnnotationStyle;
  ctx: LabelContext;
  scale: number;
  /** `dimension.ghostLabel` — supplied by the caller so this module owns no copy. */
  ghostText: string;
  selected?: boolean;
  locked?: boolean;
}

interface LabelNodes {
  halo: Konva.Text;
  main: Konva.Text;
  /** The 1 px line from a pushed label back to the dimension; `null` while the label is on the line. */
  leader: Konva.Line | null;
}

/** The part of a dimension's geometry the label layout reads (image px, or asset px in an inset). */
export interface DimensionLabelGeometry {
  a: Px;
  b: Px;
  labelOffset?: number;
}

/**
 * Centre the glyph box on the anchor. `width()/height()` are measured from the CURRENT
 * `fontSize`, so this MUST be re-run whenever the counter-scaled font changes (F7): a
 * one-time offset keeps its old half-width while the glyphs shrink/grow, drifting the
 * label off its midpoint on every zoom change. `EditorCanvas.applyScreenRules` re-centres
 * every node tagged `centerAnchor` after it re-applies `fontSize = fontSizeMu / s`.
 */
function centerOnAnchor(node: Konva.Text): void {
  node.offsetX(node.width() / 2);
  node.offsetY(node.height() / 2);
}

function placeText(node: Konva.Text, at: Px, rotationDeg: number): void {
  node.x(at.x);
  node.y(at.y);
  node.rotation(rotationDeg);
  // Tagged so the §4.2 chokepoint re-centres this node after every zoom change.
  node.setAttr('centerAnchor', true);
  centerOnAnchor(node);
}

function tickPoints(a: Px, b: Px, len: number, at: 'a' | 'b'): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * (len / 2);
  const ny = (dx / d) * (len / 2);
  const p = at === 'a' ? a : b;
  return [p.x - nx, p.y - ny, p.x + nx, p.y + ny];
}

/**
 * Lay the label out at `scale` and bring its leader into step: position, rotation, and whether the
 * §8.1 collision push applies (36 screen px off the line, 140 px radius). The push is a SCREEN-px
 * rule, so its image-space answer depends on the zoom; this runs at build and again on every
 * scale change, which keeps a reopened sheet's labels where the editor would have drawn them had
 * the sheet been built at the fitted zoom (and where the export draws them, D154).
 *
 * The three label nodes are never rebuilt: only the leader is created when a label becomes
 * pushed and destroyed when it stops being so; while pushed, its points just follow the label.
 */
function layOutLabel(group: Konva.Group, nodes: LabelNodes, geometry: DimensionLabelGeometry, scale: number): void {
  const { a, b } = geometry;
  const layout = labelLayout(a, b, b, scale, geometry.labelOffset ?? 0);
  placeText(nodes.halo, layout.at, layout.rotationDeg);
  placeText(nodes.main, layout.at, layout.rotationDeg);

  if (!layout.pushed) {
    if (nodes.leader) {
      nodes.leader.destroy();
      nodes.leader = null;
    }
    return;
  }
  const points = [layout.at.x, layout.at.y, layout.leaderFrom!.x, layout.leaderFrom!.y];
  if (nodes.leader) {
    nodes.leader.points(points);
    return;
  }
  const leader = new Konva.Line({
    points,
    stroke: SEL,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
  });
  leader.setAttr('strokeWidthMu', 1);
  // Read by the export (D173): a valueless dimension's label is dropped, and so is this line.
  leader.setAttr('labelLeader', true);
  group.add(leader);
  nodes.leader = leader;
}

/** Build a fresh group for a dimension. Re-render by rebuilding (scene keeps identity). */
export function buildDimensionGroup(input: DimensionRenderInput): Konva.Group {
  const { id, a, b, style, scale, locked = false } = input;
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', id);
  group.setAttr('locked', locked);
  group.setAttr('kind', 'dimension');

  const tickLen = style.strokeWidthMu * 3;

  const line = new Konva.Line({
    points: [a.x, a.y, b.x, b.y],
    stroke: style.strokeColor,
    strokeWidth: style.strokeWidthMu,
    strokeScaleEnabled: false,
    lineCap: 'round',
    dash: style.lineStyle === 'dashed' ? [8, 6] : style.lineStyle === 'dotted' ? [1, 5] : undefined,
    // Touch hit slop (touch model §3.1: 16 px general, 24 px thin stroke).
    hitStrokeWidth: Math.max(16, style.strokeWidthMu * 4),
  });
  line.setAttr('strokeWidthMu', style.strokeWidthMu);
  group.add(line);

  for (const which of ['a', 'b'] as const) {
    const tick = new Konva.Line({
      points: tickPoints(a, b, tickLen, which),
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidthMu,
      strokeScaleEnabled: false,
      lineCap: 'round',
      listening: false,
    });
    tick.setAttr('strokeWidthMu', style.strokeWidthMu);
    group.add(tick);
  }

  const ends = style.arrowheads;
  for (const which of ['a', 'b'] as const) {
    const wanted = ends === 'both' || (which === 'a' ? ends === 'start' : ends === 'end');
    if (!wanted) continue;
    const spec = arrowHeadSpec(which === 'a' ? a : b, which === 'a' ? b : a, style.strokeWidthMu);
    const head = new Konva.Line({
      points: arrowHeadPoints(spec, 1 / scale),
      closed: true,
      fill: style.strokeColor,
      stroke: style.strokeColor,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      lineJoin: 'miter',
      listening: false,
    });
    // Re-sized on every zoom (applyScreenRules) and at export (applyExportRules).
    head.setAttr('arrowHead', spec);
    group.add(head);
  }

  const fontSize = screenFontSize(style.fontSizeMu, scale);
  const fontStyle = style.bold ? '700' : '400';
  const text = dimensionText(input);

  const halo = new Konva.Text({
    text,
    fontSize,
    fontFamily: MEASURE_LABEL_FONT_FAMILY,
    fontStyle,
    fill: LABEL_HALO,
    stroke: LABEL_HALO,
    strokeWidth: 8,
    strokeScaleEnabled: false,
    lineJoin: 'round',
    listening: false,
  });
  halo.setAttr('fontSizeMu', style.fontSizeMu);
  // The halo is the label's readability guarantee, so it is a markup-unit size like every
  // other stroke (§4.2). Without this tag `applyExportRules` leaves it at 8 bitmap px while
  // the glyphs scale mu x M, so the outline is physically THINNER at 2x and 3x and the
  // "same physical size at every M" invariant fails for the label. On screen the value is
  // unchanged: applyScreenRules re-applies strokeWidth = strokeWidthMu = 8.
  halo.setAttr('strokeWidthMu', 8);
  const main = new Konva.Text({
    text,
    fontSize,
    fontFamily: MEASURE_LABEL_FONT_FAMILY,
    fontStyle,
    fill: LABEL_FILL,
    stroke: SEL,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    lineJoin: 'round',
    listening: false,
  });
  main.setAttr('fontSizeMu', style.fontSizeMu);
  // Same reasoning for the --sel hairline: tagged so export scales it to 1 x M.
  main.setAttr('strokeWidthMu', 1);

  group.add(halo, main);
  const nodes: LabelNodes = { halo, main, leader: null };
  layOutLabel(group, nodes, { a, b, labelOffset: input.labelOffset }, scale);
  group.setAttr('labelNodes', nodes);
  group.setAttr('ctxSnapshot', input.ctx);
  group.setAttr('ghostText', input.ghostText);
  return group;
}

/** The exact text a dimension should show (derived; never stored). */
export function dimensionText(input: Pick<DimensionRenderInput, 'valueMm' | 'ctx' | 'ghostText'>): string {
  return derivedDimensionLabel(input.valueMm, input.ctx) ?? input.ghostText;
}

/**
 * Re-derive the label text and font on an existing group (precision/unit change or a
 * committed value). Proves the label is derived: this is the ONLY way text changes.
 *
 * With `geometry` it also re-lays the label for `scale` (position, rotation, push and leader),
 * because the collision push is decided from the zoom: a font re-size alone would leave a label
 * that was built unpushed sitting on the line after the sheet is fit-zoomed out. The scene passes
 * it on every scale change; without it only the text and font are refreshed.
 */
export function applyDimensionLabel(
  group: Konva.Group,
  input: Pick<DimensionRenderInput, 'valueMm' | 'ctx' | 'ghostText' | 'style' | 'scale'> & {
    geometry?: DimensionLabelGeometry;
  },
): void {
  const nodes = group.getAttr('labelNodes') as LabelNodes | undefined;
  if (!nodes) return;
  const text = dimensionText(input);
  const fontSize = screenFontSize(input.style.fontSizeMu, input.scale);
  for (const node of [nodes.halo, nodes.main]) {
    node.text(text);
    node.fontSize(fontSize);
    centerOnAnchor(node);
  }
  // After the font: `placeText` re-centres on the glyph box it now has.
  if (input.geometry) layOutLabel(group, nodes, input.geometry, input.scale);
  group.setAttr('ctxSnapshot', input.ctx);
}
