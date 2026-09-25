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

/** Bottom-right corner, 24% of the sheet width (owner: larger; was 16%), 3% margin, capped so
 *  a very wide/narrow source image never grows past 18% (was 12%) of the sheet HEIGHT either. */
// Owner (session 29, D159): 25% smaller. Were 0.24 / 0.18 / 0.013.
const WIDTH_FRACTION = 0.18;
const MAX_HEIGHT_FRACTION = 0.135;
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

/** The capture stamp's text height, as a fraction of the bitmap width: small (owner: "a small
 *  watermark"), but 1.3% of a 4096 px sheet is ~53 px, legible on a printed page. */
const STAMP_FONT_FRACTION = 0.00975;
/** Padding round the text inside its backing pill, and the gap between pill and logo, in em. */
const STAMP_PAD_EM = 0.45;
const STAMP_GAP_EM = 0.5;

export interface StampLayout {
  /** Text size in bitmap px. */
  fontPx: number;
  /** The pill's right edge = the logo's right edge (right-aligned above it). */
  rightX: number;
  /** The pill's bottom edge, `STAMP_GAP_EM` above the logo's top. */
  bottomY: number;
  padPx: number;
}

/**
 * Where the date/time stamp goes: directly ABOVE the VANGARDE mark, right-aligned with it.
 * Pure arithmetic like `watermarkRect`, and a fraction of the bitmap so it is the same fraction
 * of the PAGE at every export multiplier M.
 */
export function stampLayout(
  bitmapWidthPx: number,
  bitmapHeightPx: number,
  aspectRatio: number,
): StampLayout {
  const logo = watermarkRect(bitmapWidthPx, bitmapHeightPx, aspectRatio);
  const fontPx = bitmapWidthPx * STAMP_FONT_FRACTION;
  return {
    fontPx,
    rightX: logo.x + logo.width,
    bottomY: logo.y - fontPx * STAMP_GAP_EM,
    padPx: fontPx * STAMP_PAD_EM,
  };
}

/**
 * The stamp text for an ISO capture time, in the device's local time: `Sep 23, 2026 · 2:07 PM`.
 * `null` for a missing or unparseable value, so a sheet without a capture time simply has no stamp.
 */
export function formatCaptureStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** Draws the mark at `EXPORT_WATERMARK_OPACITY` without disturbing the caller's
 *  context state (paired save/restore) — `renderSheet` calls this AFTER the photo
 *  and every markup layer are composited, so the mark sits on top like a real
 *  watermark, never under the annotations it would otherwise be indistinguishable
 *  from. When `stamp` is given, the capture date/time is drawn on a soft dark pill
 *  directly above the mark (readable on any photo). */
export function drawWatermark(
  ctx2d: CanvasRenderingContext2D,
  image: CanvasImageSource,
  bitmapWidthPx: number,
  bitmapHeightPx: number,
  aspectRatio: number,
  stamp?: string | null,
): void {
  const rect = watermarkRect(bitmapWidthPx, bitmapHeightPx, aspectRatio);
  ctx2d.save();
  ctx2d.globalAlpha = EXPORT_WATERMARK_OPACITY;
  ctx2d.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx2d.restore();

  if (stamp) {
    const layout = stampLayout(bitmapWidthPx, bitmapHeightPx, aspectRatio);
    ctx2d.save();
    ctx2d.font = `600 ${layout.fontPx}px 'Archivo', system-ui, sans-serif`;
    ctx2d.textAlign = 'right';
    ctx2d.textBaseline = 'alphabetic';
    const textWidth = ctx2d.measureText(stamp).width;
    const pillW = textWidth + layout.padPx * 2;
    const pillH = layout.fontPx + layout.padPx * 2;
    const pillX = layout.rightX - pillW;
    const pillY = layout.bottomY - pillH;
    ctx2d.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx2d.beginPath();
    ctx2d.roundRect(pillX, pillY, pillW, pillH, layout.padPx);
    ctx2d.fill();
    ctx2d.fillStyle = 'rgba(255, 255, 255, 0.95)';
    // Alphabetic baseline sits ~0.8em below the top of the caps: centre the glyphs in the pill.
    ctx2d.fillText(stamp, layout.rightX - layout.padPx, pillY + layout.padPx + layout.fontPx * 0.82);
    ctx2d.restore();
  }
}

/** The full VANGARDE WOODWORKS lockup (dark ink), sized for export use — the exported
 *  page is expected to be light (the photo, or the §19.4a white damaged-photo page),
 *  unlike the app's own always-dark chrome (`WatermarkOverlay.tsx` uses the light-ink
 *  compact mark instead). Traced from the client-supplied vector PDF at 600 dpi. */
export const EXPORT_WATERMARK_SRC = `${import.meta.env.BASE_URL}branding/vangarde-full.png`;
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
