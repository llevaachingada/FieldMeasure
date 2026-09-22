// tests/geometry.test.ts — §6.2
import { describe, it, expect } from 'vitest';
import {
  pixelDistance, angleDeg, readableAngleDeg, rotatePoint, midpoint, pointInRect, elbowPoints,
} from '../src/domain/geometry';

describe('pixelDistance', () => {
  it('is the Euclidean distance in image px', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    expect(pixelDistance({ x: 3, y: 4 }, { x: 0, y: 0 })).toBeCloseTo(5); // symmetric
    expect(pixelDistance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
});

describe('angleDeg (interior angle at the vertex, 0..180)', () => {
  it('measures a right angle', () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });
  it('measures a straight angle', () => {
    expect(angleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });
  it('measures 45 degrees', () => {
    expect(angleDeg({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(45);
  });
  it('returns 0 for a degenerate vertex (§19.5 — callers must treat it as "no angle yet")', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(0);
    expect(angleDeg({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
  });
});

describe('readableAngleDeg (keeps labels upright)', () => {
  it('leaves an upright angle alone', () => {
    expect(readableAngleDeg({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45);
  });
  it('flips an upside-down angle by 180', () => {
    // atan2(-1,-1) = -135° → +180 = 45°
    expect(readableAngleDeg({ x: 0, y: 0 }, { x: -1, y: -1 })).toBeCloseTo(45);
    // atan2(0,-1) = 180° → > 90 → +180 = 360° (still upright)
    expect(readableAngleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(360);
  });
});

describe('rotatePoint', () => {
  it('rotates 90° about the origin', () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
  it('rotates 180° about a non-origin point', () => {
    const p = rotatePoint({ x: 2, y: 3 }, { x: 1, y: 1 }, 180);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-1);
  });
  it('is a no-op at 0°', () => {
    const p = rotatePoint({ x: 7, y: -3 }, { x: 2, y: 2 }, 0);
    expect(p.x).toBeCloseTo(7);
    expect(p.y).toBeCloseTo(-3);
  });
});

describe('midpoint', () => {
  it('is the average of the endpoints', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual({ x: 2, y: 1 });
  });
});

describe('pointInRect', () => {
  const r = { x: 10, y: 10, width: 100, height: 50 };
  it('accepts interior and edge points (inclusive bounds)', () => {
    expect(pointInRect({ x: 50, y: 30 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);   // top-left corner
    expect(pointInRect({ x: 110, y: 60 }, r)).toBe(true);  // bottom-right corner
  });
  it('rejects outside points', () => {
    expect(pointInRect({ x: 9, y: 30 }, r)).toBe(false);
    expect(pointInRect({ x: 111, y: 30 }, r)).toBe(false);
    expect(pointInRect({ x: 50, y: 61 }, r)).toBe(false);
  });
});

// D133 (UI/GUI handoff pass): the arrow elbow's routed points. Shared by
// `renderShape.ts` (the Konva node) and its `shapeBounds` (the selection frame), so
// this is pure geometry rather than a renderer concern.
describe('elbowPoints', () => {
  it('straight (absent/explicit) is just the two endpoints, no tension', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 40 };
    expect(elbowPoints({ a, b })).toEqual({ points: [0, 0, 100, 40], tension: 0 });
    expect(elbowPoints({ a, b, elbow: 'straight' })).toEqual({ points: [0, 0, 100, 40], tension: 0 });
  });

  it('right routes through a corner at (b.x, a.y) — an L, not a diagonal', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 40 };
    const { points, tension } = elbowPoints({ a, b, elbow: 'right' });
    expect(points).toEqual([0, 0, 100, 0, 100, 40]);
    expect(tension).toBe(0);
  });

  it('right elbow corner is always inside the a/b bounding box (so shapeBounds needs no padding for it)', () => {
    const cases: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
      [{ x: 0, y: 0 }, { x: 100, y: 40 }],
      [{ x: 50, y: 60 }, { x: -20, y: 10 }],
      [{ x: -10, y: -10 }, { x: -10, y: 30 }], // a.x === b.x (vertical)
    ];
    for (const [a, b] of cases) {
      const { points } = elbowPoints({ a, b, elbow: 'right' });
      const xs = [points[0]!, points[2]!, points[4]!];
      const ys = [points[1]!, points[3]!, points[5]!];
      expect(Math.min(...xs)).toBeCloseTo(Math.min(a.x, b.x));
      expect(Math.max(...xs)).toBeCloseTo(Math.max(a.x, b.x));
      expect(Math.min(...ys)).toBeCloseTo(Math.min(a.y, b.y));
      expect(Math.max(...ys)).toBeCloseTo(Math.max(a.y, b.y));
    }
  });

  it('curved offsets a control point perpendicular to a→b by 18% of its length, with tension 0.5', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 }; // horizontal, so the perpendicular offset is purely vertical
    const { points, tension } = elbowPoints({ a, b, elbow: 'curved' });
    expect(tension).toBe(0.5);
    expect(points[0]).toBe(0);
    expect(points[1]).toBe(0);
    expect(points[4]).toBe(100);
    expect(points[5]).toBe(0);
    // control = midpoint (50, 0) offset by 18% of len=100 = 18, perpendicular to (1,0) is
    // (0,1)/(0,-1) — the implementation's sign puts it at y = +18 for a left-to-right a→b.
    expect(points[2]).toBeCloseTo(50);
    expect(Math.abs(points[3]!)).toBeCloseTo(18);
  });

  it('curved control point can fall outside the straight a/b bounding box (why shapeBounds includes every routed point for arrows)', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const { points } = elbowPoints({ a, b, elbow: 'curved' });
    const ys = [points[1]!, points[3]!, points[5]!];
    // The straight a/b box has height 0 (both y=0); the control point's y is not.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
  });

  it('curved on a degenerate (zero-length) segment falls back to the midpoint, never NaN', () => {
    const a = { x: 5, y: 5 };
    const { points } = elbowPoints({ a, b: { ...a }, elbow: 'curved' });
    expect(points.every((n) => Number.isFinite(n))).toBe(true);
    expect(points[2]).toBeCloseTo(5);
    expect(points[3]).toBeCloseTo(5);
  });
});
