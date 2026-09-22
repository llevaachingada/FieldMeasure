// Geometry — §6.2 of docs/preflight-handoff-v0.3-hardened.md (copied verbatim).
// All geometry is in WORKING-IMAGE PIXEL space.

import type { Px } from './types';

/** Distance between two image-space points, in image pixels. */
export function pixelDistance(a: Px, b: Px): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Interior angle at the vertex, degrees (0..180). */
export function angleDeg(a: Px, v: Px, c: Px): number {
  const v1x = a.x - v.x, v1y = a.y - v.y;
  const v2x = c.x - v.x, v2y = c.y - v.y;
  return Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)) * 180 / Math.PI;
}

/** Keep labels upright: flip text that would render upside down. */
export function readableAngleDeg(a: Px, b: Px): number {
  const deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return deg > 90 || deg < -90 ? deg + 180 : deg;
}

/** Rotate a point around an origin (image space). */
export function rotatePoint(p: Px, origin: Px, degrees: number): Px {
  const r = degrees * Math.PI / 180;
  const dx = p.x - origin.x, dy = p.y - origin.y;
  return { x: origin.x + dx * Math.cos(r) - dy * Math.sin(r), y: origin.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

export function midpoint(a: Px, b: Px): Px { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

export function pointInRect(p: Px, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * D133 (UI/GUI handoff pass): an arrow's elbow routing, in image px — pure, so it is
 * node-testable and shared between `renderShape.ts` (build the Konva node) and
 * `shapeBounds` (the selection frame), which both need the SAME routed points.
 *
 * `'right'`: an L via a corner at `(b.x, a.y)` — always inside the a/b bounding box.
 * `'curved'`: a control point offset perpendicular to `a→b` by 18% of its length,
 * meant to be drawn with `tension` — this CAN bow outside the straight a/b box.
 */
const ELBOW_CURVE_OFFSET_FRACTION = 0.18;

function elbowControlPoint(a: Px, b: Px): Px {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return midpoint(a, b);
  const offset = len * ELBOW_CURVE_OFFSET_FRACTION;
  const mid = midpoint(a, b);
  return { x: mid.x - (dy / len) * offset, y: mid.y + (dx / len) * offset };
}

export function elbowPoints(geometry: { a: Px; b: Px; elbow?: 'straight' | 'right' | 'curved' }): {
  points: number[];
  tension: number;
} {
  const { a, b, elbow } = geometry;
  if (elbow === 'right') {
    const corner = { x: b.x, y: a.y };
    return { points: [a.x, a.y, corner.x, corner.y, b.x, b.y], tension: 0 };
  }
  if (elbow === 'curved') {
    const control = elbowControlPoint(a, b);
    return { points: [a.x, a.y, control.x, control.y, b.x, b.y], tension: 0.5 };
  }
  return { points: [a.x, a.y, b.x, b.y], tension: 0 };
}
