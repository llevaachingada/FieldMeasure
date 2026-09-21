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
