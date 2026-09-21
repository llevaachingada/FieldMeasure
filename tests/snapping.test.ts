// tests/snapping.test.ts — §6.3
import { describe, it, expect } from 'vitest';
import { snapPoint, snapAngle, type SnapTarget } from '../src/domain/snapping';

describe('snapPoint', () => {
  const targets: SnapTarget[] = [
    { p: { x: 0, y: 0 }, kind: 'endpoint' },
    { p: { x: 100, y: 0 }, kind: 'vertex' },
    { p: { x: 100, y: 100 }, kind: 'corner' },
  ];

  it('snaps to the nearest target within the threshold', () => {
    const res = snapPoint({ x: 97, y: 2 }, targets, 10);   // distance to (100,0) = √(9+4) ≈ 3.6
    expect(res.hit).not.toBeNull();
    expect(res.p).toEqual({ x: 100, y: 0 });
    expect(res.hit!.kind).toBe('vertex');
  });

  it('picks the nearest of two in-range targets', () => {
    const res = snapPoint({ x: 96, y: 0 }, targets, 10);   // (100,0) d=4 beats (0,0) d=96
    expect(res.p).toEqual({ x: 100, y: 0 });
  });

  it('misses and returns the original point when nothing is within the threshold', () => {
    const res = snapPoint({ x: 50, y: 50 }, targets, 10);
    expect(res.hit).toBeNull();
    expect(res.p).toEqual({ x: 50, y: 50 });
  });

  it('treats the threshold as exclusive (d < threshold, not <=)', () => {
    const res = snapPoint({ x: 10, y: 0 }, [{ p: { x: 0, y: 0 }, kind: 'endpoint' }], 10);
    expect(res.hit).toBeNull();
    expect(res.p).toEqual({ x: 10, y: 0 });
  });

  it('returns a miss for an empty target list', () => {
    const res = snapPoint({ x: 1, y: 2 }, [], 50);
    expect(res.hit).toBeNull();
    expect(res.p).toEqual({ x: 1, y: 2 });
  });
});

describe('snapAngle (0/45/90/… within degThreshold, default 5°)', () => {
  it('snaps nearby angles to 0/45/90', () => {
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(43)).toBe(45);
    expect(snapAngle(47)).toBe(45);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(179)).toBe(180);
  });
  it('leaves angles farther than the threshold untouched', () => {
    expect(snapAngle(20)).toBe(20);   // |20-0|=20 > 5
    expect(snapAngle(55)).toBe(55);   // |55-45|=10 > 5
  });
  it('honours a custom threshold', () => {
    expect(snapAngle(20, 25)).toBe(0);   // |20-0|=20 <= 25
    expect(snapAngle(20, 10)).toBe(20);  // 20 > 10
  });
  it('snaps negatives to the nearest 45° multiple', () => {
    expect(snapAngle(-44)).toBe(-45);
  });
});
