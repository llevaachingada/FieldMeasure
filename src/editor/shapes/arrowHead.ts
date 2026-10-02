/** Pure geometry for the dimension arrowhead (D150); shared by the renderer and both rule passes. */
import type { Px } from '@/domain/types';

/**
 * D150 (owner request): a slim filled arrowhead at a dimension end, pointing OUT to the tick.
 * Sized in markup units like a stroke, so it keeps its on-screen size at every zoom:
 * length 4 x stroke and half-width 1.1 x stroke (1.8:1 length to width, a slim dart),
 * floored at 10 x 4 mu so a hairline dimension still gets a visible head.
 */
export interface ArrowHeadSpec {
  tip: Px;
  /** Any point back along the line; the head points from it toward `tip`. */
  from: Px;
  lenMu: number;
  halfMu: number;
}

export function arrowHeadSpec(tip: Px, from: Px, strokeWidthMu: number): ArrowHeadSpec {
  return {
    tip,
    from,
    lenMu: Math.max(10, strokeWidthMu * 4),
    halfMu: Math.max(4, strokeWidthMu * 1.1),
  };
}

/** The head's three corners in image px. `unitsPerMu` is `1 / scale` on screen, 1 at export. */
export function arrowHeadPoints(spec: ArrowHeadSpec, unitsPerMu: number): number[] {
  const dx = spec.tip.x - spec.from.x;
  const dy = spec.tip.y - spec.from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const len = spec.lenMu * unitsPerMu;
  const half = spec.halfMu * unitsPerMu;
  const bx = spec.tip.x - ux * len;
  const by = spec.tip.y - uy * len;
  return [spec.tip.x, spec.tip.y, bx - uy * half, by + ux * half, bx + uy * half, by - ux * half];
}
