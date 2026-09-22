/**
 * Export watermark placement (UI/GUI handoff pass, 2026-09-22).
 *
 * `watermarkRect` is pure arithmetic — no canvas — so it is testable in the `node`
 * project exactly like `pagePtFromImagePx` (`renderStage.ts`). The invariant under
 * test: sizing is a FRACTION of the bitmap, so the mark is the same fraction of the
 * PAGE at every export multiplier M (the bitmap is `imagePx × M`, and page pt is
 * `imagePx × 0.75`, independent of M — §4.2's own reasoning, applied to the mark).
 */
import { describe, expect, it } from 'vitest';
import { watermarkRect } from '../src/export/watermark';

describe('watermarkRect', () => {
  it('sizes to 16% of the bitmap width for a typical (wide) mark', () => {
    // aspectRatio = 1911/1039 ≈ 1.8393 (the shipped vangarde-full.png).
    const aspectRatio = 1911 / 1039;
    const rect = watermarkRect(4096, 3072, aspectRatio);

    // width = 4096 * 0.16 = 655.36
    expect(rect.width).toBeCloseTo(655.36, 5);
    // height = width / aspectRatio = 655.36 / 1.8393... ≈ 356.28 — under the 12%-of-
    // height cap (3072 * 0.12 = 368.64), so the width-first branch is the one used.
    expect(rect.height).toBeCloseTo(rect.width / aspectRatio, 5);
    expect(rect.height).toBeLessThan(3072 * 0.12);
  });

  it('is anchored to the bottom-right corner with a 3% margin', () => {
    const rect = watermarkRect(4096, 3072, 1911 / 1039);
    // marginX = 4096 * 0.03 = 122.88; marginY = 3072 * 0.03 = 92.16.
    expect(rect.x).toBeCloseTo(4096 - rect.width - 122.88, 5);
    expect(rect.y).toBeCloseTo(3072 - rect.height - 92.16, 5);
    // Entirely inside the bitmap.
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThan(4096);
    expect(rect.y + rect.height).toBeLessThan(3072);
  });

  it('scales the mark proportionally at every export multiplier (M-independent fraction of the page)', () => {
    // A 4096×3072 sheet's bitmap at M=1, 2, 3 is (imagePx × M); the mark must stay
    // 16% of the PAGE at every M, i.e. `rect.width / bitmapWidthPx` is constant.
    const imageWidthPx = 4096;
    const imageHeightPx = 3072;
    const aspectRatio = 1911 / 1039;
    const fractions = [1, 2, 3].map((m) => {
      const rect = watermarkRect(imageWidthPx * m, imageHeightPx * m, aspectRatio);
      return rect.width / (imageWidthPx * m);
    });
    expect(fractions[0]).toBeCloseTo(0.16, 10);
    expect(fractions[1]).toBeCloseTo(fractions[0]!, 10);
    expect(fractions[2]).toBeCloseTo(fractions[0]!, 10);
  });

  it('caps height at 12% of the bitmap height for a very wide/short sheet', () => {
    // A panoramic sheet (aspectRatio here means the SHEET is wide; the mark's own
    // aspect ratio is fixed at 1911/1039 ≈ 1.839 — the cap fires when 16%-of-width
    // would make the mark taller than 12%-of-height. A short bitmap height triggers
    // it directly: height = 4096*0.16/1.839 = 356.4, cap = 200*0.12 = 24.
    const rect = watermarkRect(4096, 200, 1911 / 1039);
    expect(rect.height).toBeCloseTo(200 * 0.12, 5);
    expect(rect.width).toBeCloseTo(rect.height * (1911 / 1039), 5);
    // Still fits inside the bitmap width even though the width-first guess did not.
    expect(rect.x).toBeGreaterThan(0);
  });

  it('keeps the aspect ratio of the source image exactly', () => {
    const rect = watermarkRect(2000, 1500, 1911 / 1039);
    expect(rect.width / rect.height).toBeCloseTo(1911 / 1039, 10);
  });
});
