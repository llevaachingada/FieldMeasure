/**
 * `src/editor/snapTargets.ts`: what an end point can snap to, and what the loupe draws over the
 * photo (owner request, session 29, D161: «snap to other end points; the loupe shows the existing
 * dimensions and markup», MyMeasures-style).
 *
 * Snap targets are the END POINTS and CORNERS of every visible mark: dimension / line / arrow
 * ends, an angle's three points, a polygon's vertices, a rectangle's corners. The mark being
 * edited is excluded, so a dragged end can never stick to its own old position.
 *
 * The loupe overlay is the same marks as thin vector paths in image space; `Loupe` maps them into
 * its magnified window, so they stay crisp at any zoom instead of magnifying on-screen strokes.
 */
import type { Annotation, Px } from '@/domain/types';
import type { SnapTarget } from '@/domain/snapping';

export interface OverlayPath {
  points: Px[];
  closed: boolean;
  color: string;
}

export interface LoupeOverlay {
  paths: OverlayPath[];
  /** Snap targets, drawn as small rings so the user can see where an end will land. */
  targets: Px[];
}

function visible(a: Annotation): boolean {
  return a.visible !== false;
}

/** Every snappable point of every visible mark except `excludeKey`. */
export function collectSnapTargets(list: readonly Annotation[], excludeKey: string | null = null): SnapTarget[] {
  const out: SnapTarget[] = [];
  for (const ann of list) {
    if (ann.id === excludeKey || !visible(ann)) continue;
    const g = ann.geometry;
    switch (g.kind) {
      case 'dimension':
      case 'line':
      case 'arrow':
        out.push({ p: g.a, kind: 'endpoint' }, { p: g.b, kind: 'endpoint' });
        break;
      case 'angle':
        out.push({ p: g.a, kind: 'endpoint' }, { p: g.vertex, kind: 'vertex' }, { p: g.c, kind: 'endpoint' });
        break;
      case 'polygon':
        for (const p of g.points) out.push({ p, kind: 'vertex' });
        break;
      case 'rect':
        out.push(
          { p: { x: g.x, y: g.y }, kind: 'corner' },
          { p: { x: g.x + g.width, y: g.y }, kind: 'corner' },
          { p: { x: g.x + g.width, y: g.y + g.height }, kind: 'corner' },
          { p: { x: g.x, y: g.y + g.height }, kind: 'corner' },
        );
        break;
      default:
        break;
    }
  }
  return out;
}

function ellipsePoints(x: number, y: number, w: number, h: number): Px[] {
  const pts: Px[] = [];
  for (let i = 0; i < 32; i += 1) {
    const t = (i / 32) * Math.PI * 2;
    pts.push({ x: x + w / 2 + (w / 2) * Math.cos(t), y: y + h / 2 + (h / 2) * Math.sin(t) });
  }
  return pts;
}

/** The marks as thin paths for the loupe, plus the snap targets as rings. */
export function loupeOverlayFor(list: readonly Annotation[], excludeKey: string | null = null): LoupeOverlay {
  const paths: OverlayPath[] = [];
  for (const ann of list) {
    if (!visible(ann)) continue;
    const g = ann.geometry;
    const color = ann.style.strokeColor;
    switch (g.kind) {
      case 'dimension':
      case 'line':
      case 'arrow':
        paths.push({ points: [g.a, g.b], closed: false, color });
        break;
      case 'angle':
        paths.push({ points: [g.a, g.vertex, g.c], closed: false, color });
        break;
      case 'polygon':
        paths.push({ points: g.points, closed: g.closed, color });
        break;
      case 'freehand':
      case 'highlight':
        paths.push({ points: g.points, closed: false, color });
        break;
      case 'rect':
        paths.push({
          points: [
            { x: g.x, y: g.y },
            { x: g.x + g.width, y: g.y },
            { x: g.x + g.width, y: g.y + g.height },
            { x: g.x, y: g.y + g.height },
          ],
          closed: true,
          color,
        });
        break;
      case 'ellipse':
        paths.push({ points: ellipsePoints(g.x, g.y, g.width, g.height), closed: true, color });
        break;
      default:
        break;
    }
  }
  return { paths, targets: collectSnapTargets(list, excludeKey).map((t) => t.p) };
}
