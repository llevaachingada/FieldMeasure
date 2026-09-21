/**
 * Decode worker — `src/media/decodeWorker.ts` (build spec §7.3).
 *
 * §7.3: "Konva cannot run in a worker: **decode in a worker**, render on the main
 * thread throttled to idle." Slice 0.1 proved the Vite worker build with an echo
 * stub; slice 1.3 replaces the body with the real decode and keeps the convention
 * verbatim:
 *
 *   new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' })
 *
 * The worker resolves an `ImageBitmap` (orientation applied) and transfers it back,
 * so the photo decode never blocks the canvas main thread. `decodedIn` is a
 * deliberate provenance marker: `tests/thumbnails.browser.test.ts` asserts it, so a
 * future refactor that silently drops the worker fails a machine gate instead of
 * passing on an assumption (slice 1.3 gate, session 4).
 *
 * This file is compiled with the DOM lib, not WebWorker, so `self` is widened to the
 * worker global just for `postMessage` (a dedicated worker takes one argument; the
 * DOM Window overload does not).
 */

export interface DecodeRequest {
  id: number;
  blob: Blob;
}

export interface DecodeResult {
  id: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
  /** Provenance proof that the decode ran here, not on the main thread. */
  decodedIn: 'decodeWorker.ts';
}

export interface DecodeFailure {
  id: number;
  error: string;
}

type WorkerScope = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const worker = self as unknown as WorkerScope;
  const { id, blob } = event.data;
  try {
    // Same EXIF-orientation invariant as `normalizeImage.decodeOriented` (D56): explicit
    // `from-image`, never `none`/`flipY`, and no manual rotation (that double-rotates).
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const result: DecodeResult = {
      id,
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
      decodedIn: 'decodeWorker.ts',
    };
    worker.postMessage(result, [bitmap]);
  } catch (e) {
    const failure: DecodeFailure = { id, error: e instanceof Error ? e.message : String(e) };
    worker.postMessage(failure);
  }
};
