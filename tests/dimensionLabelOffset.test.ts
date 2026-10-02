/** D151: a dimension's label can sit a user-chosen distance off its line. */
import { describe, expect, it } from 'vitest';
import { labelLayout, perpendicularOffset } from '@/editor/shapes/dimensionLabel';
import { arrowHeadPoints, arrowHeadSpec } from '@/editor/shapes/arrowHead';

describe('labelLayout offset', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  it('places the label offset px along the left-hand normal, without a collision push', () => {
    const l = labelLayout(a, b, b, 1, 25);
    expect(l.at).toEqual({ x: 50, y: 25 });
    expect(l.pushed).toBe(false);
  });
  it('perpendicularOffset is the inverse of that placement', () => {
    expect(perpendicularOffset(a, b, { x: 10, y: 25 })).toBeCloseTo(25);
    expect(perpendicularOffset(a, b, { x: 90, y: -12 })).toBeCloseTo(-12);
  });
  it('offset 0 keeps the original midpoint layout', () => {
    expect(labelLayout(a, b, b, 1).at).toEqual(labelLayout(a, b, b, 1, 0).at);
  });
});

describe('D150 arrowhead', () => {
  it('is a slim dart pointing at the tip, sized in markup units', () => {
    const spec = arrowHeadSpec({ x: 100, y: 0 }, { x: 0, y: 0 }, 4);
    const [tx, ty, x1, y1, x2, y2] = arrowHeadPoints(spec, 1);
    expect([tx, ty]).toEqual([100, 0]);
    // Base 16 px back from the tip, 4.4 px either side: length / width ≈ 1.8, a slim head.
    expect(x1).toBeCloseTo(84);
    expect(x2).toBeCloseTo(84);
    expect(Math.abs(y1 - y2)).toBeCloseTo(8.8);
  });
  it('keeps its screen size at any zoom (image size = mu / scale)', () => {
    const spec = arrowHeadSpec({ x: 0, y: 0 }, { x: -10, y: 0 }, 4);
    const p = arrowHeadPoints(spec, 1 / 0.25);
    expect(p[2]).toBeCloseTo(-64);
  });
});
