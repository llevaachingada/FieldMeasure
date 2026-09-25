/**
 * `src/editor/sheetThumb.ts`: the grid card's composite thumbnail (owner request, session 29,
 * D155). §7.3 always meant `thumb.jpg` to be "photo + markup"; until now only the capture path
 * wrote it, from the bare photo, so a card never showed the dimensions drawn on it.
 *
 * The editor already has the photo and the markup on screen, so the thumbnail is a snapshot of
 * those three layers (photo, insets, markup; never the overlay with its handles and loupe),
 * cropped to the image and contain-fitted into the 640×480 mat. It is what the user sees, which
 * is the point: the card previews the saved state.
 *
 * Debounced (3 s after the last edit, §7.3) and flushed on a sheet switch or teardown. A
 * failure is swallowed: a thumbnail is a cache, never a failed save.
 */
import type { EditorCanvas } from './EditorCanvas';
import { THUMB_DEBOUNCE_MS, THUMB_HEIGHT, THUMB_WIDTH } from '@/media/thumbnails';

const MAT_COLOR = '#0b0e12';

/** Snapshot the sheet as shown into a 640×480 JPEG. `null` when there is nothing to draw. */
export async function snapshotSheetThumb(
  canvas: EditorCanvas,
  imageWidth: number,
  imageHeight: number,
): Promise<Blob | null> {
  const s = canvas.scale;
  if (!(s > 0) || imageWidth <= 0 || imageHeight <= 0) return null;
  const pos = canvas.stage.position();
  const width = imageWidth * s;
  const height = imageHeight * s;
  const fit = Math.min(THUMB_WIDTH / width, THUMB_HEIGHT / height);
  const region = { x: pos.x, y: pos.y, width, height, pixelRatio: fit };

  const out = document.createElement('canvas');
  out.width = THUMB_WIDTH;
  out.height = THUMB_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = MAT_COLOR;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  const drawW = width * fit;
  const drawH = height * fit;
  const dx = (THUMB_WIDTH - drawW) / 2;
  const dy = (THUMB_HEIGHT - drawH) / 2;
  for (const layer of [canvas.photoLayer, canvas.insetLayer, canvas.markupLayer]) {
    const layerCanvas = layer.toCanvas(region);
    ctx.drawImage(layerCanvas, dx, dy, drawW, drawH);
  }
  return new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
}

export interface SheetThumbWriter {
  /** (Re)arm the debounce for `sheetId`. */
  schedule(sheetId: string): void;
  /** Snapshot now (if pending). Call BEFORE the canvas changes sheet or is destroyed. */
  flush(): Promise<void>;
  cancel(): void;
}

export function createSheetThumbWriter(deps: {
  canvas: () => EditorCanvas | null;
  /** Resolved SYNCHRONOUSLY at flush time (the editor may be tearing down right after). */
  target: (
    sheetId: string,
  ) => { width: number; height: number; write: (blob: Blob) => Promise<void> } | null;
  debounceMs?: number;
}): SheetThumbWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingId: string | null = null;

  function run(): Promise<void> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const id = pendingId;
    pendingId = null;
    const canvas = deps.canvas();
    const target = id ? deps.target(id) : null;
    if (!id || !canvas || !target) return Promise.resolve();
    // The snapshot is taken synchronously here (the layers are rasterised before any await),
    // so a sheet switch right after a flush cannot leak the next sheet into this thumbnail.
    let snapshot: Promise<Blob | null>;
    try {
      snapshot = snapshotSheetThumb(canvas, target.width, target.height);
    } catch {
      return Promise.resolve();
    }
    return snapshot
      .then((blob) => (blob ? target.write(blob) : undefined))
      .catch(() => undefined);
  }

  return {
    schedule(sheetId) {
      if (pendingId !== null && pendingId !== sheetId) void run();
      pendingId = sheetId;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void run(), deps.debounceMs ?? THUMB_DEBOUNCE_MS);
    },
    flush: run,
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingId = null;
    },
  };
}
