// tests/geometry.test.ts — §6.2
import { describe, it, expect } from 'vitest';
import {
  pixelDistance, angleDeg, readableAngleDeg, rotatePoint, midpoint, pointInRect,
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
