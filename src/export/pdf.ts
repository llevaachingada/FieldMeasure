/**
 * `src/export/pdf.ts` — flatten-only PDF assembly (§9.2, plan slice 1.9 build order 3).
 *
 * ONE PAGE PER SHEET, page size in POINTS = working-image px × 0.75.
 *
 *   The raster is produced by `renderStage.ts` at `mu × M` px and embedded at 96 × M dpi:
 *     physical = (mu × M) / (96 × M) in = mu / 96 in = mu × 72/96 pt = 0.75 × mu pt.
 *   Embedding at 96 × M dpi is not a flag on `embedJpg` — it is exactly what "a page of
 *   `imagePx × 0.75` pt filled by an `imagePx × M` bitmap" MEANS:
 *     dpi = bitmap px / page inches = (imagePx × M) / (imagePx × 0.75 / 72) = 96 × M.
 *   So `imageWidthPx`/`imageHeightPx` below are the WORKING-IMAGE dimensions, never the
 *   bitmap's. Passing bitmap px here would make the page grow with M and destroy the
 *   invariant (the pre-session-1 §9.2 bug: "page = bitmap px").
 *
 * MEMORY, second budget (§19.4b): `doc.save()` materialises the whole document in
 * memory, so accumulated embedded-JPEG bytes over `PDF_PART_BYTE_LIMIT` are split into
 * `part-01.pdf`, `part-02.pdf`, … This is the DESIGNED remedy for the 50-sheet gate,
 * decided in advance — `planPdfParts` is pure so the split is directly testable.
 */
import { PDFDocument } from '@cantoo/pdf-lib';

export interface SheetExport {
  jpg: Uint8Array;
  /** The sheet's WORKING-IMAGE size (NOT the bitmap size). Page pt = this × 0.75, which
   *  is what makes the physical size identical at every M. */
  imageWidthPx: number;
  imageHeightPx: number;
}

/** §9.2: page pt = working-image px × 0.75 (72 pt/in ÷ 96 dpi). */
const PT_PER_IMAGE_PX = 0.75;

/** 250 MiB = 250 × 1024 × 1024 = 262,144,000 bytes (§19.4b). */
export const PDF_PART_BYTE_LIMIT = 250 * 1024 * 1024;

/**
 * Group sheet indices so that no part's accumulated embedded-JPEG bytes exceed `limit`.
 *
 * Pure, ordered, total: the flattened result is always `[0, 1, …, n-1]` — no index is
 * dropped, duplicated or reordered. A single sheet larger than the limit still gets its
 * own part (never drop a sheet; a one-page PDF that is too big is the user's problem to
 * see, not ours to hide).
 *
 * The boundary is INCLUSIVE, matching `renderStage`'s memory guard: a part whose total
 * is exactly `limit` is kept whole; only `acc + size > limit` starts a new part.
 */
export function planPdfParts(
  byteSizes: readonly number[],
  limit: number = PDF_PART_BYTE_LIMIT,
): number[][] {
  const parts: number[][] = [];
  let current: number[] = [];
  let acc = 0;
  for (let i = 0; i < byteSizes.length; i += 1) {
    const size = Math.max(0, byteSizes[i] ?? 0);
    if (current.length > 0 && acc + size > limit) {
      parts.push(current);
      current = [];
      acc = 0;
    }
    current.push(i);
    acc += size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** One flattened PDF: one page per sheet, the bitmap covering the page exactly. */
export async function buildPdf(sheets: readonly SheetExport[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const sheet of sheets) {
    const img = await pdf.embedJpg(sheet.jpg);
    const pageW = sheet.imageWidthPx * PT_PER_IMAGE_PX;
    const pageH = sheet.imageHeightPx * PT_PER_IMAGE_PX;
    const page = pdf.addPage([pageW, pageH]);
    // Cover the page exactly. PDF's origin is bottom-left; moot while we are
    // flatten-only (one full-bleed image), load-bearing the moment vector overlay ships.
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
  }
  return pdf.save();
}

/**
 * The same document split into parts so no part exceeds `limit` embedded-JPEG bytes
 * (§19.4b). `limit` is a parameter only so the split is testable with small fixtures —
 * production callers pass nothing and get `PDF_PART_BYTE_LIMIT`.
 */
export async function buildPdfParts(
  sheets: readonly SheetExport[],
  limit: number = PDF_PART_BYTE_LIMIT,
): Promise<Uint8Array[]> {
  const plan = planPdfParts(
    sheets.map((s) => s.jpg.byteLength),
    limit,
  );
  const parts: Uint8Array[] = [];
  for (const indices of plan) {
    parts.push(await buildPdf(indices.map((i) => sheets[i]!)));
  }
  return parts;
}
