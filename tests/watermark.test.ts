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
import { formatCaptureStamp, stampLayout, watermarkRect } from '../src/export/watermark';

describe('watermarkRect', () => {
  it('sizes to 24% of the bitmap width for a typical (wide) mark', () => {
    // aspectRatio = 1911/1039 ≈ 1.8393 (the shipped vangarde-full.png).
    const aspectRatio = 1911 / 1039;
    const rect = watermarkRect(4096, 3072, aspectRatio);

    // width = 4096 * 0.24 = 983.04
    expect(rect.width).toBeCloseTo(983.04, 5);
    // height = width / aspectRatio = 983.04 / 1.8393... ≈ 534.4 — under the 18%-of-
    // height cap (3072 * 0.18 = 552.96), so the width-first branch is the one used.
    expect(rect.height).toBeCloseTo(rect.width / aspectRatio, 5);
    expect(rect.height).toBeLessThan(3072 * 0.18);
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
    // 24% of the PAGE at every M, i.e. `rect.width / bitmapWidthPx` is constant.
    const imageWidthPx = 4096;
    const imageHeightPx = 3072;
    const aspectRatio = 1911 / 1039;
    const fractions = [1, 2, 3].map((m) => {
      const rect = watermarkRect(imageWidthPx * m, imageHeightPx * m, aspectRatio);
      return rect.width / (imageWidthPx * m);
    });
    expect(fractions[0]).toBeCloseTo(0.24, 10);
    expect(fractions[1]).toBeCloseTo(fractions[0]!, 10);
    expect(fractions[2]).toBeCloseTo(fractions[0]!, 10);
  });

  it('caps height at 18% of the bitmap height for a very wide/short sheet', () => {
    // A panoramic sheet (aspectRatio here means the SHEET is wide; the mark's own
    // aspect ratio is fixed at 1911/1039 ≈ 1.839 — the cap fires when 24%-of-width
    // would make the mark taller than 18%-of-height. A short bitmap height triggers
    // it directly: height = 4096*0.24/1.839 = 534.5, cap = 200*0.18 = 36.
    const rect = watermarkRect(4096, 200, 1911 / 1039);
    expect(rect.height).toBeCloseTo(200 * 0.18, 5);
    expect(rect.width).toBeCloseTo(rect.height * (1911 / 1039), 5);
    // Still fits inside the bitmap width even though the width-first guess did not.
    expect(rect.x).toBeGreaterThan(0);
  });

  it('keeps the aspect ratio of the source image exactly', () => {
    const rect = watermarkRect(2000, 1500, 1911 / 1039);
    expect(rect.width / rect.height).toBeCloseTo(1911 / 1039, 10);
  });
});

describe('stampLayout — the date/time stamp sits directly above the mark', () => {
  const aspect = 1911 / 1039;

  it('is right-aligned with the logo and a fixed gap above its top edge', () => {
    const logo = watermarkRect(4096, 3072, aspect);
    const stamp = stampLayout(4096, 3072, aspect);
    // font = 4096 * 0.013 = 53.248; gap = 0.5 em = 26.624; pad = 0.45 em = 23.9616.
    expect(stamp.fontPx).toBeCloseTo(53.248, 5);
    expect(stamp.rightX).toBeCloseTo(logo.x + logo.width, 8);
    expect(stamp.bottomY).toBeCloseTo(logo.y - 26.624, 5);
    expect(stamp.padPx).toBeCloseTo(23.9616, 5);
    // The pill's bottom is above the logo's top, so it can never overlap the mark.
    expect(stamp.bottomY).toBeLessThan(logo.y);
  });

  it('stays the same fraction of the page at every export multiplier', () => {
    const fractions = [1, 2, 3].map((m) => stampLayout(4096 * m, 3072 * m, aspect).fontPx / (4096 * m));
    expect(fractions[0]).toBeCloseTo(0.013, 10);
    expect(fractions[1]).toBeCloseTo(fractions[0]!, 10);
    expect(fractions[2]).toBeCloseTo(fractions[0]!, 10);
  });
});

describe('formatCaptureStamp', () => {
  it('formats an ISO time as a short local date and time', () => {
    // Built from LOCAL components so the expectation does not depend on the machine's timezone:
    // 2026-09-23 14:07 local -> "Sep 23, 2026 · 2:07 PM".
    const iso = new Date(2026, 8, 23, 14, 7).toISOString();
    expect(formatCaptureStamp(iso)).toBe('Sep 23, 2026 · 2:07 PM');
  });

  it('formats midnight and noon as 12 AM / 12 PM', () => {
    expect(formatCaptureStamp(new Date(2026, 0, 5, 0, 5).toISOString())).toBe('Jan 5, 2026 · 12:05 AM');
    expect(formatCaptureStamp(new Date(2026, 0, 5, 12, 0).toISOString())).toBe('Jan 5, 2026 · 12:00 PM');
  });

  it('returns null for a missing or unparseable value, so no stamp is drawn', () => {
    expect(formatCaptureStamp(null)).toBeNull();
    expect(formatCaptureStamp(undefined)).toBeNull();
    expect(formatCaptureStamp('')).toBeNull();
    expect(formatCaptureStamp('not a date')).toBeNull();
  });
});
