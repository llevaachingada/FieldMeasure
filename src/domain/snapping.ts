// Snapping — §6.3 of docs/preflight-handoff-v0.3-hardened.md (copied verbatim).

import type { Px } from './types';

export interface SnapTarget { p: Px; kind: 'endpoint' | 'vertex' | 'corner'; }

/** Snap a point to the nearest target within `threshold` image-px (convert screen threshold via zoom first). */
export function snapPoint(p: Px, targets: SnapTarget[], threshold: number): { p: Px; hit: SnapTarget | null } {
  let best: SnapTarget | null = null;
  let bestD = threshold;
  for (const t of targets) {
    const d = Math.hypot(t.p.x - p.x, t.p.y - p.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best ? { p: best.p, hit: best } : { p, hit: null };
}

/** Angle snap: 0/45/90 (and 135/180/...) within `degThreshold`. */
export function snapAngle(deg: number, degThreshold = 5): number {
  const snapped = Math.round(deg / 45) * 45;
  return Math.abs(deg - snapped) <= degThreshold ? snapped : deg;
}
