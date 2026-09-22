/**
 * tests/dimensionLabel.test.ts — the derived label + collision rule (plan slice 1.5).
 *
 * The point of this file is AGENTS #2: labels are DERIVED at render time from
 * `valueMm` + precision + unit format, never stored. Pure logic, node project.
 */
import { describe, expect, it } from 'vitest';
import {
  LABEL_COLLISION_PX,
  LABEL_PUSH_PX,
  derivedDimensionLabel,
  labelLayout,
  type LabelContext,
} from '../src/editor/shapes/dimensionLabel';

const ctx16: LabelContext = { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 };

describe('derivedDimensionLabel — precision is an input, not a stored string', () => {
  it('derives 12\'6 3/8" from the canonical mm value at 1/16', () => {
    // 12 ft 6 in + 3/8 in = 150.375 in = 150.375 × 25.4 = 3819.525 mm
    expect(derivedDimensionLabel(3819.525, ctx16)).toBe(`12'-6 3/8"`);
  });

  it('re-derives the SAME value at 1/2 — no label was stored', () => {
    // 150.4 in = 3819.6 mm; at 1/16 → 12'-6 3/8"; at 1/2 → 12'-6 1/2"
    const valueMm = 150.4 * 25.4;
    expect(derivedDimensionLabel(valueMm, ctx16)).toBe(`12'-6 3/8"`);
    expect(derivedDimensionLabel(valueMm, { ...ctx16, precisionDenominator: 2 })).toBe(`12'-6 1/2"`);
  });

  it('honours the unit format (inches-only / decimal feet)', () => {
    const valueMm = 124.5 * 25.4; // 124 1/2"
    expect(derivedDimensionLabel(valueMm, ctx16)).toBe(`10'-4 1/2"`);
    expect(derivedDimensionLabel(valueMm, { ...ctx16, unitFormat: 'in' })).toBe(`124 1/2"`);
    expect(derivedDimensionLabel(valueMm, { ...ctx16, unitFormat: 'ft-decimal' })).toBe(`10.38'`);
  });

  it('returns null when there is no value (the ghost state)', () => {
    expect(derivedDimensionLabel(null, ctx16)).toBeNull();
    expect(derivedDimensionLabel(undefined, ctx16)).toBeNull();
    expect(derivedDimensionLabel(Number.NaN, ctx16)).toBeNull();
  });
});

describe('labelLayout — the §8.1 collision rule (140 px / 36 px)', () => {
  it('leaves a far label on the midpoint', () => {
    const layout = labelLayout({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 400, y: 300 }, 1);
    expect(layout.pushed).toBe(false);
    expect(layout.at).toEqual({ x: 20, y: 0 });
    expect(layout.leaderFrom).toBeNull();
  });

  it('pushes a short segment label 36 px along the perpendicular with a leader', () => {
    // Midpoint (20,0) is 0 px from the tip → within 140 px → pushed.
    const layout = labelLayout({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 }, 1);
    expect(layout.pushed).toBe(true);
    expect(Math.abs(layout.at.y)).toBeCloseTo(LABEL_PUSH_PX);
    expect(layout.at.x).toBeCloseTo(20);
    expect(layout.leaderFrom).toEqual({ x: 20, y: 0 });
  });

  it('pushes AWAY from the tip (the label never sits under it)', () => {
    // Tip above the segment → the label must go below.
    const layout = labelLayout({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: -10 }, 1);
    expect(layout.at.y).toBeGreaterThan(0);
  });

  it('the 140 px test is screen-space: at 4× a 50 px image gap is 200 px, so no push', () => {
    // Image midpoint (20,0) to tip (70,0) = 50 image px → 200 screen px at scale 4 > 140.
    const layout = labelLayout({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 70, y: 0 }, 4);
    expect(layout.pushed).toBe(false);
    // At scale 1 the same geometry is 50 px → pushed.
    expect(labelLayout({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 70, y: 0 }, 1).pushed).toBe(true);
  });

  it('exposes the collision constants the spec names', () => {
    expect(LABEL_COLLISION_PX).toBe(140);
    expect(LABEL_PUSH_PX).toBe(36);
  });
});
