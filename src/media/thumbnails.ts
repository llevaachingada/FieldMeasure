/**
 * `src/media/thumbnails.ts` — the 640×480 sheet composite (build spec §7.3).
 *
 * §7.3: "Generate 640×480 composites (photo + markup). Konva cannot run in a worker:
 * **decode in a worker, render on the main thread throttled to idle**. Regenerate 3 s
 * after the last edit; cache as `sheets/<n>/thumb.jpg` (written atomically, §5.3)."
 *
 * Split of responsibilities:
 *  - `decodeInWorker` runs `createImageBitmap` inside `decodeWorker.ts` (the module
 *    the slice-0.1 stub left behind — slice 1.3 replaces the body, not the URL
 *    convention). It resolves with the worker's `decodedIn` provenance marker so the
 *    "decode is actually off the main thread" gate is machine-checkable.
 *  - `renderThumbnail` draws the decoded bitmap on the MAIN thread into a 640×480
 *    offscreen canvas. Fit is **contain** on the `--mat` colour: a sheet thumbnail
 *    must show the whole photo, never crop it (the alternative, cover, hides exactly
 *    the edges a dimension might be near). Recorded in DECISIONS.
 *  - `createThumbnailScheduler` owns the 3 s debounce and the serialized
 *    generate→write chain. The write callback is injected so the caller supplies
 *    `projectStore.writeAtomic` (the ONLY disk writer, AGENTS #3) and tests supply a
 *    spy.
 *
 * Markup compositing is a no-op in 1.3 (no markup exists yet); `renderThumbnail`
 * takes an optional `drawMarkup` hook that slice 1.5+ will pass.
 */

/** 640×480 per §7.3. */
export const THUMB_WIDTH = 640;
export const THUMB_HEIGHT = 480;
/** Regenerate 3 s after the last edit (§7.3). */
export const THUMB_DEBOUNCE_MS = 3000;

import type { DecodeFailure, DecodeResult } from './decodeWorker';

/** Mat colour (`--mat`, UI §3.1) — the letterbox behind a contain-fitted photo. */
const MAT_COLOR = '#0b0e12';

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Set by the worker; absent when a test injects a decoder. */
  decodedIn?: string;
}

/* ------------------------------------------------------------------ *
 * Worker client
 * ------------------------------------------------------------------ */

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<
  number,
  { resolve: (value: DecodedImage) => void; reject: (reason: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  // The slice-0.1 convention, verbatim: a module worker from this module's URL.
  worker = new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<DecodeResult | DecodeFailure>) => {
    const data = event.data;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if ('error' in data) entry.reject(new Error(data.error));
    else entry.resolve(data);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'decode worker failed');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Decode a photo off the main thread. Resolves with the worker's provenance marker. */
export function decodeInWorker(blob: Blob): Promise<DecodedImage> {
  const id = nextRequestId;
  nextRequestId += 1;
  return new Promise<DecodedImage>((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    pending.set(id, { resolve, reject });
    w.postMessage({ id, blob });
  });
}

/** Tear the worker down (tests / teardown). Idempotent. */
export function terminateDecodeWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}

/* ------------------------------------------------------------------ *
 * Main-thread render
 * ------------------------------------------------------------------ */

export type DrawMarkup = (
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

/** Contain-fit into a 640×480 mat. Main thread only (Konva is not worker-safe, §7.3). */
export async function renderThumbnail(
  bitmap: ImageBitmap,
  width = THUMB_WIDTH,
  height = THUMB_HEIGHT,
  drawMarkup?: DrawMarkup,
): Promise<Blob> {
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  const dx = (width - drawW) / 2;
  const dy = (height - drawH) / 2;

  const paint = (
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  ): void => {
    ctx.fillStyle = MAT_COLOR;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, dx, dy, drawW, drawH);
    drawMarkup?.(ctx, width, height);
  };

  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    paint(ctx);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  paint(ctx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
  );
  if (!blob) throw new Error('thumbnail JPEG encode failed');
  return blob;
}

/* ------------------------------------------------------------------ *
 * Debounced scheduler
 * ------------------------------------------------------------------ */

export interface ThumbnailTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const defaultTimers: ThumbnailTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface ThumbnailSchedulerOptions {
  /** The atomic write (§5.3). Callers pass `projectStore.writeAtomic`. */
  write: (blob: Blob) => Promise<void>;
  /** Decode + render. Defaults to `decodeInWorker` → `renderThumbnail`. */
  generate?: (photo: Blob) => Promise<Blob>;
  debounceMs?: number;
  timers?: ThumbnailTimers;
}

export interface ThumbnailScheduler {
  /** (Re)arm the 3 s debounce with the newest photo. */
  schedule(photo: Blob): void;
  /** Run any pending generation NOW and resolve once it settles. */
  flush(): Promise<void>;
  cancel(): void;
  readonly pending: boolean;
}

async function defaultGenerate(photo: Blob): Promise<Blob> {
  const decoded = await decodeInWorker(photo);
  try {
    return await renderThumbnail(decoded.bitmap);
  } finally {
    decoded.bitmap.close();
  }
}

export function createThumbnailScheduler(
  options: ThumbnailSchedulerOptions,
): ThumbnailScheduler {
  const debounceMs = options.debounceMs ?? THUMB_DEBOUNCE_MS;
  const timers = options.timers ?? defaultTimers;
  const generate = options.generate ?? defaultGenerate;
  const write = options.write;

  let timer: unknown = null;
  let latest: Blob | null = null;
  let running: Promise<void> = Promise.resolve();

  function clearTimer(): void {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  }

  function run(): Promise<void> {
    const photo = latest;
    latest = null;
    if (!photo) return running;
    running = running.then(async () => {
      try {
        const blob = await generate(photo);
        await write(blob);
      } catch {
        // A thumbnail is a cache: a failure must never break the sheet. The next
        // edit re-arms the debounce; no retry storm is started here.
      }
    });
    return running;
  }

  return {
    schedule(photo: Blob): void {
      latest = photo;
      clearTimer();
      timer = timers.setTimeout(() => {
        timer = null;
        void run();
      }, debounceMs);
    },
    async flush(): Promise<void> {
      clearTimer();
      await run();
      await running;
    },
    cancel(): void {
      clearTimer();
      latest = null;
    },
    get pending(): boolean {
      return timer !== null || latest !== null;
    },
  };
}
