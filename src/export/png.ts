/**
 * src/export/png.ts — slice 1.9, Lane B: 1×/2×/3× PNG export + zip (§9.3).
 *
 * Independent of the render lane: this module takes canvases and bytes the caller
 * already produced (`renderStage.ts` owns the actual Konva rendering). Runtime
 * dependency list is closed (AGENTS.md #5) — only `fflate`, already a dependency.
 */

import { zipSync, type Zippable } from 'fflate';

export interface PngFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Bitmap size of a PNG export: the sheet's working-image size × M.
 *
 * Arithmetic (plan line 1372, "M=2: 4-mu -> 8px"; the doc's own worked example is
 * 4032x3024 at 3x -> 12096x9072 — checked below in tests/png.test.ts):
 *   width  = imageWidthPx  * m
 *   height = imageHeightPx * m
 */
export function pngPixelSize(
  imageWidthPx: number,
  imageHeightPx: number,
  m: 1 | 2 | 3,
): { width: number; height: number } {
  return { width: imageWidthPx * m, height: imageHeightPx * m };
}

/**
 * Encode an already-rendered export canvas to PNG bytes via `toBlob('image/png')`.
 *
 * Needs a real `HTMLCanvasElement` (jsdom has no canvas — decision D40), so this is
 * kept as a thin wrapper: everything node-testable (`pngPixelSize`, `zipPngs`,
 * `readPngSize`) is factored out into functions that take plain bytes/numbers, not a
 * canvas, so they can be unit-tested in the `node` project. Only this function itself
 * needs the `browser` project (tests/png.browser.test.ts).
 */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('canvas.toBlob produced no PNG blob');
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Thrown by `zipPngs` when two `PngFile`s share a name.
 *
 * JUDGEMENT CALL (documented per Lane B brief): `zipSync` silently collapses
 * duplicate-named entries into one — the object literal it's built from simply loses
 * the earlier key. That's not a safe default for an export tool whose whole job is to
 * write every sheet to disk: a silent collapse means a sheet the user thinks they
 * exported is missing with no error anywhere. Filename collisions inside one export
 * batch are supposed to be prevented upstream (filenames.ts's `conflictName`), so
 * seeing one here means that contract was violated by the caller — a bug, not a
 * normal case to paper over with de-duplication. We throw a typed error instead of
 * silently renaming, so the bug surfaces immediately rather than shipping a zip with
 * a sheet quietly missing.
 */
export class DuplicatePngNameError extends Error {
  /** The colliding entry name. NOT `name`: `Error.prototype.name` is the error's own
   *  class tag, and a parameter property called `name` is overwritten by the
   *  `this.name = 'DuplicatePngNameError'` line below — the caller would always read
   *  back the class name instead of the duplicate. */
  readonly entryName: string;
  constructor(entryName: string) {
    super(`zipPngs: duplicate entry name "${entryName}" — caller must de-duplicate names before zipping`);
    this.name = 'DuplicatePngNameError';
    this.entryName = entryName;
  }
}

/**
 * One `.zip` containing every file, via fflate's `zipSync`. PNG is already
 * DEFLATE-compressed, so entries are stored (level 0) — re-compressing costs time and
 * saves nothing.
 *
 * JUDGEMENT CALL (empty list): `zipPngs([])` returns a valid, empty zip archive
 * (fflate's `zipSync({}, ...)` already produces one — an empty End Of Central
 * Directory record) rather than throwing. An empty zip is a well-formed file any
 * unzip tool opens cleanly; refusing outright would just push the "is this scope
 * empty?" check onto every caller for no safety benefit, and the ExportWizard is the
 * right place to stop a genuinely empty scope from reaching this function at all.
 */
export function zipPngs(files: readonly PngFile[]): Uint8Array {
  const seen = new Set<string>();
  const data: Zippable = {};
  for (const file of files) {
    if (seen.has(file.name)) throw new DuplicatePngNameError(file.name);
    seen.add(file.name);
    data[file.name] = file.bytes;
  }
  return zipSync(data, { level: 0 });
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Parse a PNG's IHDR chunk: validate the 8-byte PNG signature, then the first chunk
 * (bytes 8..) — its 4-byte big-endian length, 4-byte ASCII type, which must be
 * "IHDR" — before reading IHDR's own big-endian width/height (bytes 0..3 and 4..7 of
 * its data, per the PNG spec's IHDR layout). Returns `null` for anything that is not
 * a well-formed PNG with IHDR as its first chunk (too short, wrong signature, wrong
 * first chunk type) rather than throwing or returning garbage — the required
 * behaviour for feeding it arbitrary/foreign/truncated bytes (JPEGs, empty buffers).
 */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // Signature (8) + chunk length (4) + chunk type (4) + IHDR data (>=8 for w/h) = 24.
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkType =
    String.fromCharCode(bytes[12]) +
    String.fromCharCode(bytes[13]) +
    String.fromCharCode(bytes[14]) +
    String.fromCharCode(bytes[15]);
  if (chunkType !== 'IHDR') return null;

  const width = view.getUint32(16, false); // false = big-endian
  const height = view.getUint32(20, false);
  return { width, height };
}
