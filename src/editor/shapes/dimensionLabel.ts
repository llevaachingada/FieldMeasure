/**
 * `src/editor/shapes/dimensionLabel.ts` — **the derived label** (AGENTS #2).
 *
 * There is **no `label` field** anywhere (types.ts, schema.ts, §20). A dimension's
 * displayed text is computed here from `valueMm` + the project's unit system /
 * format / precision at RENDER time. Change the precision from 1/16 to 1/2 and every
 * label re-derives; nothing is stored, so nothing can go stale.
 *
 * Also here: the §8.1 **collision rule** as a pure function — if the midpoint is
 * within 140 px (screen) of the live tip, push the label 36 px along the perpendicular
 * with a 1 px leader back to the midpoint. It is screen-px logic, so the image-space
 * offset is `36 / scale` and the collision distance is `140 / scale`.
 */
import { formatLength } from '@/domain/units';
import { midpoint, readableAngleDeg } from '@/domain/geometry';
import type { Px } from '@/domain/types';

export interface LabelContext {
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  precisionDenominator: number;
}

/** §8.1 collision rule numbers. */
export const LABEL_COLLISION_PX = 140;
export const LABEL_PUSH_PX = 36;

/** The label text for a value, or `null` when there is no value (ghost state). */
export function derivedDimensionLabel(valueMm: number | null | undefined, ctx: LabelContext): string | null {
  if (valueMm === null || valueMm === undefined || !Number.isFinite(valueMm)) return null;
  return formatLength(valueMm, ctx.unitSystem, ctx.precisionDenominator, ctx.unitFormat);
}

export interface LabelLayout {
  /** Image-space position for the label's anchor (its midpoint-relative centre). */
  at: Px;
  /** True when the 140 px rule pushed the label off the midpoint. */
  pushed: boolean;
  /** Image-space endpoint for the 1 px leader, or `null` when not pushed. */
  leaderFrom: Px | null;
  /** Label rotation so glyphs stay upright (`readableAngleDeg`). */
  rotationDeg: number;
}

/**
 * Place the label for segment `a→b` given the live tip. Pure and testable.
 *
 * `tip` is the point the label must not sit under (the finger/pen contact); when the
 * midpoint is within `LABEL_COLLISION_PX` of it on screen, push perpendicular away
 * from the tip by `LABEL_PUSH_PX` screen px (÷ `scale` to image px).
 */
export function labelLayout(a: Px, b: Px, tip: Px, scale: number): LabelLayout {
  const mid = midpoint(a, b);
  const rotationDeg = readableAngleDeg(a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const tooClose = Math.hypot(mid.x - tip.x, mid.y - tip.y) * scale < LABEL_COLLISION_PX;
  if (!tooClose || len === 0) {
    return { at: mid, pushed: false, leaderFrom: null, rotationDeg };
  }
  // Perpendicular unit vector; choose the side away from the tip.
  let nx = -dy / len;
  let ny = dx / len;
  if ((mid.x - tip.x) * nx + (mid.y - tip.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const push = LABEL_PUSH_PX / scale;
  return {
    at: { x: mid.x + nx * push, y: mid.y + ny * push },
    pushed: true,
    leaderFrom: mid,
    rotationDeg,
  };
}
