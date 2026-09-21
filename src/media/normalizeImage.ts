/**
 * `src/media/normalizeImage.ts` — the import normalizer (build spec §7.1).
 *
 * Decode with orientation applied, downscale so the long edge is ≤ `maxEdge`
 * (default 4096), re-encode as JPEG. This fixes the working-image size **forever**:
 * it is the coordinate space every annotation is stored in (§4.1). v1 keeps no
 * original, so a future "re-import at higher resolution" invalidates all annotation
 * coordinates and is deliberately unsupported (§7.1).
 *
 * Metadata is not a separate step here: `createImageBitmap(file, {
 * imageOrientation: 'from-image' })` bakes the EXIF rotation into the pixels, and the
 * canvas re-encode writes a fresh JPEG with **no** APP1 segment — so GPS (and every
 * other EXIF tag) is gone by construction. `readCaptureTime` must therefore be called
 * BEFORE this function (the import path does).
 *
 * `targetSize` is exported pure so the downscale arithmetic is unit-testable in Node
 * even though the decode/encode half needs a real browser (D40).
 */

export interface NormalizedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Long-edge clamp arithmetic. Rounds like the spec's reference code (no zero-size). */
export function targetSize(
  width: number,
  height: number,
  maxEdge = 4096,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** EXIF-orientation-aware decode (`from-image` honours the stored orientation). */
export async function decodeOriented(file: Blob): Promise<ImageBitmap> {
  // EXIF ORIENTATION — invariant, confirmed by dedicated research (D56):
  //   * always `imageOrientation: 'from-image'`. Chromium's Blob default already applies
  //     orientation, but we state it explicitly so no future edit can silently change it.
  //   * NEVER `'none'` (flag-disabled → un-baked orientation → every stored dimension
  //     lands rotated) and NEVER `'flipY'` (a mirror, not an orientation).
  //   * NEVER rotate the bitmap by hand afterwards — `from-image` has already baked the
  //     orientation into the pixels; a manual rotate would double-rotate.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export async function normalizeImage(
  file: Blob,
  maxEdge = 4096,
  quality = 0.88,
): Promise<NormalizedImage> {
  const bitmap = await decodeOriented(file);
  const { width, height } = targetSize(bitmap.width, bitmap.height, maxEdge);
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas context unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      return { blob, width, height };
    }
    // HTMLCanvas fallback (no OffscreenCanvas). toBlob is callback-based.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob) throw new Error('JPEG encode failed');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Content hash used for §19.3 asset dedupe (a duplicate inset photo must not be
 * stored twice). Stable across runs and platforms — SHA-256 of the blob bytes.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
