/**
 * tests/loupe.test.ts — the loupe numbers, stated once with their arithmetic (D65).
 *
 * The rule this file enforces (caught twice — session-4 F8 and again in D65): a loupe is
 * **magnification (fixed)** + **window (fixed)** + **source (derived)**, and
 * `sourcePx = diameterPx / magnification`. The three are never independent.
 *
 *   Pen:   112 / 3.5 = 32        160 / 3.5 = 45.714…        200 / 3.5 = 57.142…
 *   Touch: 200 / 4   = 50
 *
 * Pure logic, node project (`Loupe.ts` imports Konva at module scope but constructs
 * nothing here — same pattern as `dragPredicate.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  CROSSHAIR_GAP_PX,
  LOUPE_EDGE_PX,
  PEN_LOUPE_MAGNIFICATION,
  PEN_LOUPE_OFFSET_PX,
  TOUCH_CONTACT_DISC_PX,
  TOUCH_FADE_OPACITY,
  TOUCH_FREEZE_MS,
  TOUCH_LOUPE_MAGNIFICATION,
  TOUCH_LOUPE_OFFSET_PX,
  loupeQuadrant,
  loupeSourcePx,
  penLoupeSpec,
  touchLoupeSpec,
} from '../src/editor/Loupe';

describe('the derived source rule: sourcePx = diameterPx / magnification', () => {
  it('pen magnification is fixed at 3.5× at every size setting', () => {
    expect(PEN_LOUPE_MAGNIFICATION).toBe(3.5);
    expect(loupeSourcePx(112, 3.5)).toBeCloseTo(32, 6); // 112 ÷ 3.5 = 32
    expect(loupeSourcePx(160, 3.5)).toBeCloseTo(45.714285, 5); // 160 ÷ 3.5 = 45.7142857…
    expect(loupeSourcePx(200, 3.5)).toBeCloseTo(57.142857, 5); // 200 ÷ 3.5 = 57.1428571…
  });

  it('touch magnification is fixed at 4× of a 50 px source in a 200 px window', () => {
    expect(TOUCH_LOUPE_MAGNIFICATION).toBe(4);
    expect(loupeSourcePx(200, 4)).toBe(50); // 200 ÷ 4 = 50
  });

  it('penLoupeSpec keeps the magnification while deriving the source', () => {
    for (const diameter of [112, 160, 200]) {
      const spec = penLoupeSpec(diameter);
      expect(spec.magnification).toBe(3.5);
      expect(spec.sourcePx).toBeCloseTo(diameter / 3.5, 6);
      expect(spec.diameterPx).toBe(diameter);
    }
  });

  it('touchLoupeSpec carries the locked touch numbers', () => {
    const spec = touchLoupeSpec();
    expect(spec.diameterPx).toBe(200);
    expect(spec.magnification).toBe(4);
    expect(spec.sourcePx).toBe(50);
    expect(spec.offsetPx).toBe(136);
    expect(spec.contactDiscPx).toBe(44);
    expect(spec.leader).toBe(true);
    expect(spec.freezeMs).toBe(700);
    expect(spec.fadeOpacity).toBe(0.4);
    expect(spec.crosshairGapPx).toBe(12);
    expect(spec.edgePx).toBe(24);
  });

  it('exposes the constants the spec names', () => {
    expect(PEN_LOUPE_OFFSET_PX).toBe(112);
    expect(TOUCH_LOUPE_OFFSET_PX).toBe(136);
    expect(TOUCH_CONTACT_DISC_PX).toBe(44);
    expect(TOUCH_FREEZE_MS).toBe(700);
    expect(TOUCH_FADE_OPACITY).toBe(0.4);
    expect(CROSSHAIR_GAP_PX).toBe(12);
    expect(LOUPE_EDGE_PX).toBe(24);
  });
});

describe('loupeQuadrant — up-and-away, edge-aware, never under the point', () => {
  const viewport = { width: 1440, height: 960 };
  const touch = { offsetPx: 136, radiusPx: 100, edgePx: 24, handedness: 'right' as const };

  it('places the loupe up-left for a right-handed user, at exactly offsetPx away', () => {
    const placement = loupeQuadrant({ x: 720, y: 480 }, viewport, touch);
    expect(placement.quadrant).toBe('up-left');
    expect(placement.flipped).toBe(false);
    expect(placement.x).toBeLessThan(720);
    expect(placement.y).toBeLessThan(480);
    expect(Math.hypot(placement.x - 720, placement.y - 480)).toBeCloseTo(136, 6);
  });

  it('mirrors to up-right for a left-handed user', () => {
    const placement = loupeQuadrant({ x: 720, y: 480 }, viewport, { ...touch, handedness: 'left' });
    expect(placement.quadrant).toBe('up-right');
    expect(placement.x).toBeGreaterThan(720);
    expect(placement.y).toBeLessThan(480);
  });

  it('flips away from an edge within 24 px, and still fits', () => {
    const placement = loupeQuadrant({ x: 30, y: 30 }, viewport, touch);
    expect(placement.flipped).toBe(true);
    // Chosen quadrant keeps the circle 24 px inside every edge.
    expect(placement.x - 100).toBeGreaterThanOrEqual(24);
    expect(placement.y - 100).toBeGreaterThanOrEqual(24);
    expect(placement.x + 100).toBeLessThanOrEqual(viewport.width - 24);
    expect(placement.y + 100).toBeLessThanOrEqual(viewport.height - 24);
  });

  it('never places the loupe centre on the contact point', () => {
    for (const point of [
      { x: 720, y: 480 },
      { x: 30, y: 30 },
      { x: 1410, y: 930 },
    ]) {
      const placement = loupeQuadrant(point, viewport, touch);
      expect(Math.hypot(placement.x - point.x, placement.y - point.y)).toBeGreaterThan(100);
    }
  });
});
