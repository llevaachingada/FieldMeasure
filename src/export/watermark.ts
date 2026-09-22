/**
 * `src/export/watermark.ts` — the VANGARDE mark composited onto exported sheets
 * (UI/GUI handoff pass, 2026-09-22, owner request; `Settings › Display › Watermark`
 * gates it, `getWatermarkEnabled` in `src/settings/watermark.ts`).
 *
 * Sizing is a FRACTION of the sheet's working-image size, never an absolute pixel
 * count: `renderStage.ts` draws it straight onto the `imageWidthPx × M` bitmap
 * (`renderSheet`'s `ctx2d`), so a size expressed as a fraction of `bitmapWidthPx`
 * keeps the mark the same fraction of the PAGE at every M — the same reasoning as
 * §4.2's `pagePtFromImagePx` (page pt = image px × 0.75, independent of M). An
 * absolute px size would make the mark 3× larger on the page at M=3 than at M=1.
 */

/** Bottom-right corner, 16% of the sheet width, 3% margin, capped so a very wide/
 *  narrow source image never grows past 12% of the sheet HEIGHT either. */
const WIDTH_FRACTION = 0.16;
const MAX_HEIGHT_FRACTION = 0.12;
const MARGIN_FRACTION = 0.03;

/** How present the mark reads on an exported (usually light) photo — subtle, not a
 *  logo slapped on top: low enough that no measurement or annotation is ever hard
 *  to read through it. */
export const EXPORT_WATERMARK_OPACITY = 0.32;

export interface WatermarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The mark's placement in bitmap px, given the sheet's rendered bitmap size and the
 * source image's aspect ratio (width / height). Pure — no canvas, no image — so it is
 * unit-testable in the `node` project exactly like `pagePtFromImagePx`.
 */
export function watermarkRect(
  bitmapWidthPx: number,
  bitmapHeightPx: number,
  aspectRatio: number,
): WatermarkRect {
  let width = bitmapWidthPx * WIDTH_FRACTION;
  let height = width / aspectRatio;

  const maxHeight = bitmapHeightPx * MAX_HEIGHT_FRACTION;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  const marginX = bitmapWidthPx * MARGIN_FRACTION;
  const marginY = bitmapHeightPx * MARGIN_FRACTION;

  return {
    x: bitmapWidthPx - width - marginX,
    y: bitmapHeightPx - height - marginY,
    width,
    height,
  };
}

/** Draws the mark at `EXPORT_WATERMARK_OPACITY` without disturbing the caller's
 *  context state (paired save/restore) — `renderSheet` calls this AFTER the photo
 *  and every markup layer are composited, so the mark sits on top like a real
 *  watermark, never under the annotations it would otherwise be indistinguishable
 *  from. */
export function drawWatermark(
  ctx2d: CanvasRenderingContext2D,
  image: CanvasImageSource,
  bitmapWidthPx: number,
  bitmapHeightPx: number,
  aspectRatio: number,
): void {
  const rect = watermarkRect(bitmapWidthPx, bitmapHeightPx, aspectRatio);
  ctx2d.save();
  ctx2d.globalAlpha = EXPORT_WATERMARK_OPACITY;
  ctx2d.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx2d.restore();
}

/** The full VANGARDE WOODWORKS lockup (dark ink), sized for export use — the exported
 *  page is expected to be light (the photo, or the §19.4a white damaged-photo page),
 *  unlike the app's own always-dark chrome (`WatermarkOverlay.tsx` uses the light-ink
 *  compact mark instead). Traced from the client-supplied vector PDF at 600 dpi. */
export const EXPORT_WATERMARK_SRC = '/branding/vangarde-full.png';
/** `vangarde-full.png` is 1911×1039 px (measured at build time from the source PNG). */
export const EXPORT_WATERMARK_ASPECT_RATIO = 1911 / 1039;

let cachedImage: Promise<ImageBitmap> | null = null;

/** Loads (and caches) the export watermark image once per session — every sheet in a
 *  multi-sheet export run reuses the same decoded bitmap rather than re-fetching. */
export function loadExportWatermarkImage(): Promise<ImageBitmap> {
  if (!cachedImage) {
    cachedImage = fetch(EXPORT_WATERMARK_SRC)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob));
  }
  return cachedImage;
}
