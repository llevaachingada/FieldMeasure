/**
 * tests/exportInvariance.test.ts — slice 1.9's B1 acceptance, as pure arithmetic.
 *
 * Runs in the `node` project: NO canvas, NO `Konva.Stage` (jsdom and node have neither,
 * D40). Everything here is the export-scaling contract expressed as numbers; the real
 * pixels are measured in `tests/renderStage.browser.test.ts`.
 *
 * THE DERIVATION under test (§4.2 / §9.2):
 *   bitmap   = mu × M px
 *   embedded at 96 × M dpi
 *   physical = (mu × M) / (96 × M) in = mu / 96 in = mu × 72/96 pt = 0.75 × mu pt
 *   → independent of M. A 4-mu stroke is 3 pt and an 18-mu label is 13.5 pt at M = 1, 2, 3.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_BITMAP_LIMIT_BYTES,
  bitmapBytes,
  canExportAt,
  exportFontSize,
  exportInkSize,
  exportStrokeWidth,
  largestMultiplierFor,
  pagePtFromImagePx,
  type ExportMultiplier,
} from '../src/export/renderStage';
import { PDF_PART_BYTE_LIMIT, planPdfParts } from '../src/export/pdf';

const MULTIPLIERS: ExportMultiplier[] = [1, 2, 3];

/** The physical size of a bitmap run, in points, when embedded at 96 × M dpi. */
function physicalPt(bitmapPx: number, m: number): number {
  // inches = bitmapPx / (96 × M); points = inches × 72.
  return (bitmapPx / (96 * m)) * 72;
}

describe('§4.2 export scaling — the invariance arithmetic', () => {
  it('a 4-mu stroke is 4 × M bitmap px at every multiplier', () => {
    // 4 × 1 = 4; 4 × 2 = 8; 4 × 3 = 12.
    expect(exportStrokeWidth(4, 1)).toBe(4);
    expect(exportStrokeWidth(4, 2)).toBe(8);
    expect(exportStrokeWidth(4, 3)).toBe(12);
    for (const m of MULTIPLIERS) expect(exportStrokeWidth(4, m)).toBe(4 * m);
  });

  it('an 18-mu label is fontSize 18 at every multiplier — NEVER counter-scaled', () => {
    // The screen rule is `fontSize = mu / s`; the export rule is `fontSize = mu`, and the
    // layer's `scale = M` is what turns 18 into 18 × M bitmap px. A counter-scale here
    // (18 / M) would render 18 / M × M = 18 px at every M — constant BITMAP px, i.e. a
    // label that shrinks physically as M rises. That inversion is the §4.2 bug.
    for (const m of MULTIPLIERS) {
      expect(exportFontSize(18)).toBe(18);
      // The rendered glyph height in bitmap px is fontSize × layer scale:
      expect(exportFontSize(18) * m).toBe(18 * m);
    }
    expect([1, 2, 3].map((m) => exportFontSize(18) * m)).toEqual([18, 36, 54]);
  });

  it('ink outlines are generated at `size = mu`, like text and unlike strokes', () => {
    // A perfect-freehand outline is a FILL in image units, so the layer transform (M)
    // magnifies it: size mu → mu × M bitmap px. Screen's opposite is `mu / s`.
    expect(exportInkSize(4)).toBe(4);
    expect(exportInkSize(24)).toBe(24);
    for (const m of MULTIPLIERS) expect(exportInkSize(4) * m).toBe(4 * m);
  });

  it('physical size is 0.75 × mu pt for BOTH a stroke and a label, at M = 1, 2 and 3', () => {
    for (const m of MULTIPLIERS) {
      // stroke: bitmap 4 × M px @ 96 × M dpi → 4/96 in → 3 pt   (0.75 × 4  = 3)
      const strokePx = exportStrokeWidth(4, m);
      expect(physicalPt(strokePx, m)).toBeCloseTo(0.75 * 4, 10);
      expect(physicalPt(strokePx, m)).toBeCloseTo(3, 10);

      // label: bitmap 18 × M px @ 96 × M dpi → 18/96 in → 13.5 pt (0.75 × 18 = 13.5)
      const labelPx = exportFontSize(18) * m;
      expect(physicalPt(labelPx, m)).toBeCloseTo(0.75 * 18, 10);
      expect(physicalPt(labelPx, m)).toBeCloseTo(13.5, 10);
    }

    // M = 2, spelled out exactly as the plan states it:
    //   4-mu  → 8 px  @ 192 dpi = 8/192 in  = 0.0416666… in × 72 = 3 pt
    //   18-mu → 36 px @ 192 dpi = 36/192 in = 0.1875 in      × 72 = 13.5 pt
    expect(exportStrokeWidth(4, 2)).toBe(8);
    expect(physicalPt(8, 2)).toBeCloseTo(3, 10);
    expect(exportFontSize(18) * 2).toBe(36);
    expect(physicalPt(36, 2)).toBeCloseTo(13.5, 10);
  });

  it('the three multipliers give IDENTICAL physical sizes (the B1 gate, in numbers)', () => {
    const strokePts = MULTIPLIERS.map((m) => physicalPt(exportStrokeWidth(4, m), m));
    const labelPts = MULTIPLIERS.map((m) => physicalPt(exportFontSize(18) * m, m));
    // [3, 3, 3] and [13.5, 13.5, 13.5] — no spread across M.
    expect(strokePts).toEqual([3, 3, 3]);
    expect(labelPts).toEqual([13.5, 13.5, 13.5]);
  });
});

describe('§9.2 page geometry', () => {
  it('page pt = working-image px × 0.75', () => {
    expect(pagePtFromImagePx(4096)).toBe(3072); // 4096 × 0.75 = 3072
    expect(pagePtFromImagePx(3072)).toBe(2304); // 3072 × 0.75 = 2304
    expect(pagePtFromImagePx(2)).toBe(1.5); //    2 × 0.75 = 1.5
  });

  it('page pt is independent of M — M only sets raster fidelity', () => {
    // The page is computed from the WORKING-IMAGE px, so it never sees M. If a caller
    // ever passed the bitmap size (imagePx × M) the page would grow with M: 3072 /
    // 6144 / 9216 pt. That is the old, wrong §9.2 ("page = bitmap px").
    const pagePt = MULTIPLIERS.map(() => pagePtFromImagePx(4096));
    expect(pagePt).toEqual([3072, 3072, 3072]);
    const wrong = MULTIPLIERS.map((m) => pagePtFromImagePx(4096 * m));
    expect(wrong).toEqual([3072, 6144, 9216]);
    expect(new Set(wrong).size).toBe(3); // proves the two are genuinely different models
  });
});

describe('§19.4b memory guard', () => {
  it('bitmapBytes = w × h × M² × 4, matching the plan table', () => {
    // 4096 × 3072 × 4       =  50,331,648 B (50 MB decimal)
    expect(bitmapBytes(4096, 3072, 1)).toBe(50_331_648);
    // × 2² = × 4            = 201,326,592 B (201 MB)
    expect(bitmapBytes(4096, 3072, 2)).toBe(201_326_592);
    // × 3² = × 9            = 452,984,832 B (453 MB)
    expect(bitmapBytes(4096, 3072, 3)).toBe(452_984_832);
    // 4096 × 4096 × 4       =  67,108,864 B (67 MB)
    expect(bitmapBytes(4096, 4096, 1)).toBe(67_108_864);
    expect(bitmapBytes(4096, 4096, 2)).toBe(268_435_456); // 268 MB
    expect(bitmapBytes(4096, 4096, 3)).toBe(603_979_776); // 604 MB
  });

  it('the limit is 512 MiB', () => {
    // 512 × 1024 × 1024 = 536,870,912 bytes.
    expect(EXPORT_BITMAP_LIMIT_BYTES).toBe(536_870_912);
  });

  it('refuses 4096 × 4096 at 3× (604 MB > 512 MB) and allows 4096 × 3072 at 2× (201 MB)', () => {
    expect(bitmapBytes(4096, 4096, 3)).toBeGreaterThan(EXPORT_BITMAP_LIMIT_BYTES);
    expect(canExportAt(4096, 4096, 3)).toBe(false);

    expect(bitmapBytes(4096, 3072, 2)).toBeLessThan(EXPORT_BITMAP_LIMIT_BYTES);
    expect(canExportAt(4096, 3072, 2)).toBe(true);
  });

  it('the boundary is INCLUSIVE — a bitmap of exactly the limit is allowed', () => {
    // CONVENTION: the plan says "if bitmapBytes > 512 MB, refuse that M", so the
    // comparison is strictly-greater-than and the exact boundary PASSES. Chosen to match
    // the spec text literally: making it exclusive would refuse an M the gate requires,
    // and an off-by-one-byte refusal is un-diagnosable in the field.
    //
    // Construct the exact boundary: w × h × M² × 4 = 536,870,912
    //   → w × h × M² = 134,217,728 = 2^27
    //   → at M = 1: 16384 × 8192 = 2^14 × 2^13 = 2^27 ✓
    expect(bitmapBytes(16_384, 8_192, 1)).toBe(EXPORT_BITMAP_LIMIT_BYTES);
    expect(canExportAt(16_384, 8_192, 1)).toBe(true);

    // One pixel-row more is over the limit and is refused:
    //   16384 × 8193 × 4 = 536,936,448 > 536,870,912
    expect(bitmapBytes(16_384, 8_193, 1)).toBe(536_936_448);
    expect(canExportAt(16_384, 8_193, 1)).toBe(false);

    // The same boundary reached through M: 8192 × 4096 × 2² × 4 = 536,870,912.
    expect(bitmapBytes(8_192, 4_096, 2)).toBe(EXPORT_BITMAP_LIMIT_BYTES);
    expect(canExportAt(8_192, 4_096, 2)).toBe(true);
  });

  it('largestMultiplierFor steps down to the next lower M', () => {
    // 4096 × 4096: 3× is 604 MB (refused) → 2× is 268 MB (allowed).
    expect(largestMultiplierFor(4096, 4096)).toBe(2);
    // 4096 × 3072: 3× is 453 MB — still under the limit, so 3× stands.
    expect(largestMultiplierFor(4096, 3072)).toBe(3);
    // Even 1× over the limit → null (no multiplier is offerable):
    // 16384 × 16384 × 4 = 1,073,741,824 B > 536,870,912.
    expect(bitmapBytes(16_384, 16_384, 1)).toBe(1_073_741_824);
    expect(largestMultiplierFor(16_384, 16_384)).toBeNull();
  });
});

describe('§19.4b PDF part planning', () => {
  it('the limit is 250 MiB', () => {
    // 250 × 1024 × 1024 = 262,144,000 bytes.
    expect(PDF_PART_BYTE_LIMIT).toBe(262_144_000);
  });

  it('empty input yields no parts', () => {
    expect(planPdfParts([])).toEqual([]);
  });

  it('a single sheet larger than the limit still gets its own part — never dropped', () => {
    // 300 MB > 250 MB, but the sheet is the measurement record; it ships alone.
    expect(planPdfParts([300 * 1024 * 1024])).toEqual([[0]]);
    // …and an oversize sheet does not swallow its neighbours.
    expect(planPdfParts([300, 10, 10], 100)).toEqual([[0], [1, 2]]);
  });

  it('splits exactly when the accumulated bytes exceed the limit (inclusive boundary)', () => {
    // limit 100: 60 + 40 = 100 → exactly the limit → kept whole.
    expect(planPdfParts([60, 40], 100)).toEqual([[0, 1]]);
    // limit 100: 60 + 41 = 101 → over → split.
    expect(planPdfParts([60, 41], 100)).toEqual([[0], [1]]);
    // limit 100: 50 + 50 = 100 (whole), + 1 → 101 → third sheet starts part 2.
    expect(planPdfParts([50, 50, 1], 100)).toEqual([[0, 1], [2]]);
  });

  it('preserves order and neither drops nor duplicates an index', () => {
    const sizes = [90, 30, 30, 200, 5, 5, 5, 400, 1];
    const plan = planPdfParts(sizes, 100);
    // Walk it: 90 | 30+30=60 (+200 over) | 200 | 5+5+5=15 (+400 over) | 400 | 1
    expect(plan).toEqual([[0], [1, 2], [3], [4, 5, 6], [7], [8]]);
    const flat = plan.flat();
    expect(flat).toEqual(sizes.map((_, i) => i)); // [0..8] in order
    expect(new Set(flat).size).toBe(sizes.length); // no duplicates
    for (const part of plan) expect(part.length).toBeGreaterThan(0); // no empty parts
  });
});
