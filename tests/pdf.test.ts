/**
 * tests/pdf.test.ts — §9.2 page geometry, built from a REAL JPEG and read back out of a
 * REAL PDF (the `node` project; `@cantoo/pdf-lib` needs no canvas).
 *
 * The contract: page pt = WORKING-IMAGE px × 0.75, never the bitmap's size. That is what
 * makes `0.75 × mu` pt hold at every multiplier — the bitmap grows with M, the page does
 * not, so the embed dpi is 96 × M and the physical size cancels M out.
 */
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import jpegFixture from './fixtures/tiny-2x2.jpg?inline';
import {
  PDF_PART_BYTE_LIMIT,
  buildPdf,
  buildPdfParts,
  planPdfParts,
  type SheetExport,
} from '../src/export/pdf';

/**
 * A hand-rolled, valid 2×2 baseline JPEG (tests/fixtures/make-fixtures.mjs), imported
 * `?inline` (Vite hands back a base64 data URL). The repo pins `types: ["vite/client"]`
 * and does not install `@types/node`, so `node:fs` does not type-check in a `.ts` test —
 * `tests/exif.test.ts` established this same convention for the same fixture.
 */
const JPG = Uint8Array.from(
  atob(jpegFixture.slice(jpegFixture.indexOf(',') + 1)),
  (c) => c.charCodeAt(0),
);

function sheet(imageWidthPx: number, imageHeightPx: number): SheetExport {
  // The JPEG's own 2×2 size is irrelevant to the page: the raster is stretched to cover
  // the page, and the page comes from the sheet's working-image dimensions.
  return { jpg: JPG, imageWidthPx, imageHeightPx };
}

/** `%PDF` = 0x25 0x50 0x44 0x46. */
function startsWithPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  );
}

describe('buildPdf — §9.2', () => {
  it('produces a real PDF whose page is imageWidthPx × 0.75 pt', async () => {
    const bytes = await buildPdf([sheet(4096, 3072)]);
    expect(startsWithPdfHeader(bytes)).toBe(true);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    // 4096 × 0.75 = 3072 pt; 3072 × 0.75 = 2304 pt.
    expect(width).toBeCloseTo(3072, 6);
    expect(height).toBeCloseTo(2304, 6);
  });

  it('the page size does not depend on the multiplier the bitmap was rendered at', async () => {
    // Three sheets of the SAME working image, as if rendered at 1×, 2× and 3×: the
    // caller passes the working-image size every time, so all three pages are 1536 ×
    // 1152 pt (2048 × 0.75 = 1536; 1536 × 0.75 = 1152). Had the bitmap size been passed,
    // the pages would be 1536 / 3072 / 4608 pt and the physical mu size would change.
    const bytes = await buildPdf([sheet(2048, 1536), sheet(2048, 1536), sheet(2048, 1536)]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    for (let i = 0; i < 3; i += 1) {
      const { width, height } = doc.getPage(i).getSize();
      expect(width).toBeCloseTo(1536, 6);
      expect(height).toBeCloseTo(1152, 6);
    }
  });

  it('one page per sheet, in order, with each sheet’s own page size', async () => {
    const bytes = await buildPdf([sheet(800, 600), sheet(1200, 900), sheet(400, 400)]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3); // page count === sheet count
    // 800 × 0.75 = 600 / 600 × 0.75 = 450
    expect(doc.getPage(0).getSize().width).toBeCloseTo(600, 6);
    expect(doc.getPage(0).getSize().height).toBeCloseTo(450, 6);
    // 1200 × 0.75 = 900 / 900 × 0.75 = 675
    expect(doc.getPage(1).getSize().width).toBeCloseTo(900, 6);
    expect(doc.getPage(1).getSize().height).toBeCloseTo(675, 6);
    // 400 × 0.75 = 300
    expect(doc.getPage(2).getSize().width).toBeCloseTo(300, 6);
    expect(doc.getPage(2).getSize().height).toBeCloseTo(300, 6);
  });

  it('EXECUTED, NOT ASSUMED: an empty sheet list saves as ONE BLANK A4 PAGE', async () => {
    // `@cantoo/pdf-lib` substitutes a blank A4 page when a page-less document is saved:
    // `getPageCount()` is 0 before `save()` and 1 after `load()`, at 595.28 × 841.89 pt.
    // This is library behaviour, not ours — pinned here so the wizard never ships a
    // "blank page" export by calling `buildPdf([])`. `buildPdfParts([])` returns [] and
    // produces no file at all, which is the correct empty-scope behaviour.
    const bytes = await buildPdf([]);
    expect(startsWithPdfHeader(bytes)).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 2); // A4, not a sheet
    expect(await buildPdfParts([])).toEqual([]);
  });
});

describe('buildPdfParts — §19.4b', () => {
  it('is one document while the byte budget holds', async () => {
    const parts = await buildPdfParts([sheet(800, 600), sheet(800, 600)]);
    // 2 × 313 bytes of JPEG is nowhere near 262,144,000, so nothing splits.
    expect(parts).toHaveLength(1);
    expect((await PDFDocument.load(parts[0]!)).getPageCount()).toBe(2);
  });

  it('splits into parts when the accumulated embedded-JPEG bytes exceed the limit', async () => {
    // The fixture is 313 bytes. With an injected limit of 700:
    //   313 + 313 = 626 ≤ 700 → sheets 0,1 share part 1
    //   626 + 313 = 939 > 700 → sheet 2 starts part 2
    expect(JPG.byteLength).toBe(313);
    const sheets = [sheet(800, 600), sheet(800, 600), sheet(800, 600)];
    expect(planPdfParts(sheets.map((s) => s.jpg.byteLength), 700)).toEqual([[0, 1], [2]]);

    const parts = await buildPdfParts(sheets, 700);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts).toHaveLength(2);
    for (const part of parts) expect(startsWithPdfHeader(part)).toBe(true);
    expect((await PDFDocument.load(parts[0]!)).getPageCount()).toBe(2);
    expect((await PDFDocument.load(parts[1]!)).getPageCount()).toBe(1);
    // Every sheet survives the split: 2 + 1 === 3.
    const pages = await Promise.all(
      parts.map(async (p) => (await PDFDocument.load(p)).getPageCount()),
    );
    expect(pages.reduce((a, b) => a + b, 0)).toBe(sheets.length);
  });

  it('defaults to the 250 MiB production budget', () => {
    expect(PDF_PART_BYTE_LIMIT).toBe(250 * 1024 * 1024); // 262,144,000
  });
});
