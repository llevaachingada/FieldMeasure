/**
 * `src/export/renderStage.ts` — the offscreen §4.2 EXPORT stage (plan slice 1.9, build
 * order step 2). **This is the only module in the tree that scales for export.**
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT (slice 1.9's whole acceptance, AGENTS non-negotiable #6)
 * ──────────────────────────────────────────────────────────────────────────────
 * A 4-mu stroke and an 18-mu label must measure the SAME PHYSICAL SIZE in PDFs
 * exported at M = 1, 2 and 3, and `page pt = imagePx × 0.75`.
 *
 *   bitmap  = mu × M px                       (this module)
 *   embedded at 96 × M dpi                    (page pt = imagePx × 0.75, `pdf.ts`)
 *   physical = (mu × M) / (96 × M) in
 *            = mu / 96 in
 *            = mu × 72/96 pt
 *            = 0.75 × mu pt                   ← independent of M. QED.
 *
 *   M = 2:  a 4-mu stroke  →  4 × 2 = 8 px  @ 192 dpi = 8/192 in  = 0.0416̅ in = 3 pt
 *           an 18-mu label → 18 × 2 = 36 px @ 192 dpi = 36/192 in = 0.1875 in = 13.5 pt
 *           and 0.75 × 4 = 3 pt, 0.75 × 18 = 13.5 pt. Both agree.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SCREEN AND EXPORT ARE OPPOSITES (§4.2). Both are load-bearing.
 * ──────────────────────────────────────────────────────────────────────────────
 *   | rule       | screen (`EditorCanvas.applyScreenRules`) | export (here)          |
 *   |------------|------------------------------------------|------------------------|
 *   | strokes    | `strokeScaleEnabled:false`, width = mu   | width = mu × M         |
 *   | text       | `fontSize = mu / s`                      | `fontSize = mu`        |
 *   | ink        | outline regenerated at `mu / s`          | outline at `mu`        |
 *   | pixelRatio | `min(devicePixelRatio, 2)`               | `1`                    |
 *
 * `applyExportRules` is the exact MIRROR of `applyScreenRules` and reads the same node
 * attrs (`strokeWidthMu`, `fontSizeMu`, `inkPoints`, `centerAnchor`, `textBoxFit`,
 * `textPadPx`, `textPill`). **The two paths are never unified and `applyScreenRules` is
 * never called from here** — flattening them is exactly the bug §4.2 exists to prevent.
 *
 * Why the numbers land where they do: the offscreen stage is `imageWidth×M` by
 * `imageHeight×M` with the markup layers at `scaleX/Y = M` and `pixelRatio: 1`. A
 * `strokeScaleEnabled:false` stroke ignores the layer transform, so `mu × M` is written
 * straight into the bitmap as `mu × M` px; a glyph at `fontSize = mu` IS transformed by
 * the layer, so it also lands at `mu × M` bitmap px. Counter-scaling the text (the screen
 * rule) would render it at `mu / M × M = mu` px — constant physical size only at M = 1
 * and shrinking thereafter. `tests/renderStage.browser.test.ts` measures real pixels,
 * not attributes, because attribute arithmetic proves the rule was applied, not that the
 * glyph rasterized at the right size.
 *
 * MEMORY (§19.4b): `bitmapBytes ≈ w × h × M² × 4`. Over `EXPORT_BITMAP_LIMIT_BYTES`
 * (512 MiB) `renderSheet` REFUSES that M with `ExportTooLargeError` rather than
 * attempting it and crashing the tab. The user-facing wording lives in `src/ui/strings.ts`
 * — this module throws a typed error and lets the caller pick the words.
 *
 * DAMAGED PHOTO (§19.4a): `photo === null` renders the markup on a WHITE page at the
 * sheet's stored dimensions and reports `photoMissing: true`. The sheet is never skipped
 * — the markup IS the measurement record — and the export is never aborted.
 *
 * Konva is imported for its TYPES only at module scope (`import type`) and loaded
 * dynamically inside `renderSheet`, so the pure arithmetic below (the invariance
 * contract) is importable from the `node` test project, which has no canvas (D40).
 */
import type Konva from 'konva';
import type { Annotation, Px } from '@/domain/types';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';
import type { InsetAssetImage } from '@/editor/inset/renderInset';
import type { SheetExport } from './pdf';
import { drawWatermark } from './watermark';
import { arrowHeadPoints, type ArrowHeadSpec } from '@/editor/shapes/arrowHead';

/** §4.2 / §9.3: the only three export multipliers. */
export type ExportMultiplier = 1 | 2 | 3;

export interface ExportSheetInput {
  sheetId: string;
  /** The sheet's WORKING-IMAGE size — never multiplied by M. */
  imageWidthPx: number;
  imageHeightPx: number;
  annotations: readonly Annotation[];
  ctx: LabelContext;
  /** `dimension.ghostLabel`; owned by strings.ts, passed in — never copy wording here. */
  ghostText: string;
  /** Decoded sheet photo, or `null` for a damaged photo → white page (§19.4a). */
  photo: CanvasImageSource | null;
  assetProvider?: (assetId: string) => InsetAssetImage | null;
  /** UI/GUI handoff pass (2026-09-22): the VANGARDE mark, decided ONCE per export run
   *  by `runExport.ts` (reads `Settings › Display › Watermark`) and threaded through
   *  rather than read here — `renderSheet` stays a pure rendering function with no
   *  settings/idb dependency of its own. Absent/`null` = no watermark. */
  watermark?: { image: CanvasImageSource; aspectRatio: number } | null;
  /** The photo's date/time, ready to print (`formatCaptureStamp`), drawn above the watermark.
   *  Only ever drawn WITH the watermark: it follows the same Settings switch. */
  captureStamp?: string | null;
}

export interface RenderedSheet {
  canvas: HTMLCanvasElement;
  /** = imageWidthPx × M */
  bitmapWidthPx: number;
  bitmapHeightPx: number;
  photoMissing: boolean;
}

/* ------------------------------------------------------------------ *
 * §19.4b memory guard — pure arithmetic
 * ------------------------------------------------------------------ */

/**
 * 512 MiB = 512 × 1024 × 1024 = 536,870,912 bytes.
 *
 * The plan's table (decimal MB) against this limit:
 *   4096 × 3072 × 4 =  50,331,648 B (50 MB)  M=1 ✓ | ×4 = 201,326,592 (201 MB) M=2 ✓
 *                                                  | ×9 = 452,984,832 (453 MB) M=3 ✓
 *   4096 × 4096 × 4 =  67,108,864 B (67 MB)  M=1 ✓ | ×4 = 268,435,456 (268 MB) M=2 ✓
 *                                                  | ×9 = 603,979,776 (604 MB) M=3 ✗ refused
 */
export const EXPORT_BITMAP_LIMIT_BYTES = 512 * 1024 * 1024;

/** `w × h × M² × 4` — one RGBA bitmap of the export raster. */
export function bitmapBytes(imageWidthPx: number, imageHeightPx: number, m: number): number {
  return imageWidthPx * imageHeightPx * m * m * 4;
}

/**
 * INCLUSIVE limit: a sheet whose bitmap is EXACTLY `EXPORT_BITMAP_LIMIT_BYTES` is
 * allowed. The plan's wording is "if `bitmapBytes` > 512 MB, refuse that M", so the
 * refusal is strictly-greater-than and the boundary itself passes. Chosen to match the
 * spec text literally rather than to be "safe by one byte": a silent off-by-one here
 * would refuse an M the gate says must work.
 */
export function canExportAt(imageWidthPx: number, imageHeightPx: number, m: number): boolean {
  return bitmapBytes(imageWidthPx, imageHeightPx, m) <= EXPORT_BITMAP_LIMIT_BYTES;
}

/** The largest M this sheet can be rendered at, or `null` when even 1× is refused. */
export function largestMultiplierFor(
  imageWidthPx: number,
  imageHeightPx: number,
): ExportMultiplier | null {
  const candidates: ExportMultiplier[] = [3, 2, 1];
  for (const m of candidates) {
    if (canExportAt(imageWidthPx, imageHeightPx, m)) return m;
  }
  return null;
}

/**
 * §19.4b: the typed refusal. The copy (`«This sheet is too large to export at 3× on this
 * device»`) lives in `src/ui/strings.ts` — never here (AGENTS working rule).
 */
export class ExportTooLargeError extends Error {
  constructor(
    public readonly multiplier: number,
    public readonly suggested: ExportMultiplier | null,
  ) {
    super(`export refused at ${multiplier}x: bitmap exceeds ${EXPORT_BITMAP_LIMIT_BYTES} bytes`);
    this.name = 'ExportTooLargeError';
  }
}

/* ------------------------------------------------------------------ *
 * §4.2 export scaling helpers (pure — the mirror of the screen* helpers)
 * ------------------------------------------------------------------ */

/**
 * Strokes: `strokeScaleEnabled` stays FALSE (as on screen) and the width is
 * pre-multiplied by M, so the stroke lands at `mu × M` bitmap px.
 * Screen's opposite: `strokeWidth = mu` (the layer scale is the zoom, not M).
 */
export function exportStrokeWidth(strokeWidthMu: number, m: number): number {
  return strokeWidthMu * m;
}

/**
 * Text: `fontSize = mu`, **never counter-scaled**. The layer's `scale = M` magnifies the
 * glyph to `mu × M` bitmap px. Screen's opposite: `fontSize = mu / s`.
 */
export function exportFontSize(fontSizeMu: number): number {
  return fontSizeMu;
}

/**
 * Ink: the perfect-freehand outline is a FILL in image units, so a fill ignores
 * `strokeScaleEnabled` and the outline is generated at `size = mu`; the layer's `scale = M`
 * magnifies it to `mu × M` bitmap px. Screen's opposite: `size = mu / s`.
 */
export function exportInkSize(strokeWidthMu: number): number {
  return strokeWidthMu;
}

/**
 * The ink helpers take a SCALE and divide (`size = mu / scale`). Export wants `size = mu`,
 * so the scale passed to them is 1 — the magnification is the layer transform, not the
 * outline. `exportInkSize(mu) === mu / EXPORT_INK_SCALE` by construction.
 */
const EXPORT_INK_SCALE = 1;

/**
 * D154 (owner, session 29): «exports must look like what is rendered in the app». On screen a
 * label is `mu` CSS px at every zoom, so at the fitted view a 4000 px photo shows it about three
 * times larger, relative to the photo, than a literal `mu` image px. The export therefore draws
 * every mark at `mu × k` image units, where `k` is the photo's long edge over the editor's
 * reference fitted width. `k` never depends on M, so the §4.2 invariance across M still holds;
 * photos no larger than the reference keep `k = 1` (the old behaviour, and every existing test).
 */
export const EXPORT_REFERENCE_VIEW_PX = 1280;

export function exportMarkupScale(imageWidthPx: number, imageHeightPx: number): number {
  return Math.max(1, Math.max(imageWidthPx, imageHeightPx) / EXPORT_REFERENCE_VIEW_PX);
}

/** §9.2: page pt = working-image px × 0.75 (96 dpi photo). Independent of M. */
export function pagePtFromImagePx(imagePx: number): number {
  return imagePx * 0.75;
}

/** JPEG quality for the flattened export raster (see the note in the report/DECISIONS). */
export const EXPORT_JPEG_QUALITY = 0.92;

/* ------------------------------------------------------------------ *
 * applyExportRules — the mirror of EditorCanvas.applyScreenRules
 * ------------------------------------------------------------------ */

/**
 * Konva classes are discriminated by `getClassName()` rather than `instanceof`, so this
 * module needs no value-level `konva` import and the `node` test project can import the
 * arithmetic above without a canvas. `Arrow` extends `Line`, so it is matched where
 * `applyScreenRules` uses `instanceof Konva.Line`.
 */
const LINE_CLASSES = new Set(['Line', 'Arrow']);

function classOf(node: unknown): string {
  const fn = (node as { getClassName?: () => string }).getClassName;
  return typeof fn === 'function' ? fn.call(node) : '';
}

interface InkLineNode {
  points(value: number[]): void;
}
interface TextNode {
  fontSize(value: number): void;
  width(): number;
  height(): number;
  offsetX(value: number): void;
  offsetY(value: number): void;
}
interface StrokeNode {
  strokeScaleEnabled(): boolean;
  strokeWidth(value: number): void;
}

/**
 * Walk a layer/group tree and apply the §4.2 EXPORT rules at multiplier `m`:
 * text `fontSize = mu` (NOT counter-scaled), stroke `strokeWidth = mu × M`, ink outline
 * regenerated at `size = mu`. Node-for-node the mirror of `applyScreenRules`, reading
 * the same attrs. Never call `applyScreenRules` on an export tree.
 */
export function applyExportRules(root: Konva.Container, m: number, k = 1): void {
  for (const node of root.getChildren()) {
    const className = classOf(node);

    if (className === 'Text') {
      const mu = node.getAttr('fontSizeMu');
      if (typeof mu === 'number') (node as unknown as TextNode).fontSize(exportFontSize(mu) * k);
      // Mirrors applyScreenRules' F7 re-centring: a centred label's offset is a function
      // of its CURRENT glyph box, and the box just changed with the fontSize.
      if (node.getAttr('centerAnchor') === true) {
        const text = node as unknown as TextNode;
        text.offsetX(text.width() / 2);
        text.offsetY(text.height() / 2);
      }
    }

    const strokeWidthMu = node.getAttr('strokeWidthMu');
    if (typeof strokeWidthMu === 'number' && typeof (node as unknown as StrokeNode).strokeScaleEnabled === 'function') {
      const shape = node as unknown as StrokeNode;
      // `strokeScaleEnabled:false` is KEPT (same as screen): the width below is already
      // in bitmap px, so the layer's `scale = M` must NOT multiply it a second time.
      if (shape.strokeScaleEnabled() === false) {
        shape.strokeWidth(exportStrokeWidth(strokeWidthMu, m) * k);
      }
    }

    if (LINE_CLASSES.has(className)) {
      // D150: a dimension arrowhead at export is `mu` image px, the same as ink (scale 1).
      const head = node.getAttr('arrowHead') as ArrowHeadSpec | undefined;
      if (head) (node as unknown as InkLineNode).points(arrowHeadPoints(head, EXPORT_INK_SCALE / k));
      const inkPoints = node.getAttr('inkPoints');
      if (Array.isArray(inkPoints) && typeof strokeWidthMu === 'number') {
        // `size = mu / EXPORT_INK_SCALE = mu` — the live-draw ink shape (Konva.Line).
        (node as unknown as InkLineNode).points(
          inkOutlinePointsRef(inkPoints as Px[], strokeWidthMu, EXPORT_INK_SCALE / k),
        );
      }
    }

    if (className === 'Path' && typeof node.getAttr('strokeWidthMu') === 'number') {
      // Committed freehand / highlighter ink is a FILLED Konva.Path: a fill ignores
      // `strokeScaleEnabled`, so the outline itself is regenerated at `size = mu`.
      regenerateInkNodeRef(node as unknown as Konva.Path, EXPORT_INK_SCALE / k);
    }

    if (className === 'Group') {
      applyExportRules(node as Konva.Container, m, k);
      // Mirrors applyScreenRules: re-fit a text note's background box AFTER the glyphs'
      // fontSize has been re-applied. Screen divides the pad by the zoom so it renders
      // at `textPadPx` CSS px; export leaves it in image units (`/ 1`) so the layer's
      // `scale = M` renders it at `textPadPx × M` bitmap px — the same physical pad.
      const fit = node.getAttr('textBoxFit') as { box?: unknown; glyphs?: unknown } | undefined;
      if (fit && classOf(fit.box) === 'Rect' && classOf(fit.glyphs) === 'Text') {
        const glyphs = fit.glyphs as Konva.Text;
        const box = fit.box as Konva.Rect;
        const padPx = node.getAttr('textPadPx');
        const pad = (typeof padPx === 'number' ? padPx : 0) / (EXPORT_INK_SCALE / k);
        box.x(glyphs.x() - pad);
        box.y(glyphs.y() - pad);
        box.width(glyphs.width() + pad * 2);
        box.height(glyphs.height() + pad * 2);
        box.cornerRadius(node.getAttr('textPill') === true ? glyphs.height() / 2 + pad : 4);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Lazily-bound ink helpers
 * ------------------------------------------------------------------ *
 * `applyExportRules` is synchronous, but `renderStage` must not pull the editor's
 * module graph into the node test project. `renderSheet` binds the two shipped helpers
 * (the SAME ones the screen path uses — the outline maths is not re-implemented here)
 * before it calls `applyExportRules`; a caller that walks a tree it built itself binds
 * them the same way by calling `renderSheet`. */

type InkOutlinePoints = (points: Px[], strokeWidthMu: number, scale: number) => number[];
type RegenerateInkNode = (path: Konva.Path, scale: number) => void;

let inkOutlinePointsImpl: InkOutlinePoints | null = null;
let regenerateInkNodeImpl: RegenerateInkNode | null = null;

function inkOutlinePointsRef(points: Px[], strokeWidthMu: number, scale: number): number[] {
  return inkOutlinePointsImpl ? inkOutlinePointsImpl(points, strokeWidthMu, scale) : [];
}

function regenerateInkNodeRef(path: Konva.Path, scale: number): void {
  regenerateInkNodeImpl?.(path, scale);
}

/** Load (once) the ink helpers the screen path uses. */
async function loadInkHelpers(): Promise<void> {
  if (inkOutlinePointsImpl && regenerateInkNodeImpl) return;
  const [{ inkOutlinePoints }, { regenerateInkNode }] = await Promise.all([
    import('@/editor/EditorCanvas'),
    import('@/editor/shapes/renderInk'),
  ]);
  inkOutlinePointsImpl = inkOutlinePoints as unknown as InkOutlinePoints;
  regenerateInkNodeImpl = regenerateInkNode as unknown as RegenerateInkNode;
}

/* ------------------------------------------------------------------ *
 * renderSheet — one sheet, one bitmap, freed before the next
 * ------------------------------------------------------------------ */

/** White page for a damaged photo (§19.4a). */
const DAMAGED_PHOTO_PAGE_FILL = '#FFFFFF';

/**
 * Render one sheet to a flattened bitmap at `imageWidthPx × M` by `imageHeightPx × M`.
 *
 * Throws `ExportTooLargeError` (never attempts the allocation) when the §19.4b guard
 * refuses `m`. The caller renders ONE sheet at a time and must drop the returned canvas
 * before the next (`renderSheetJpeg` does that for you).
 */
export async function renderSheet(
  input: ExportSheetInput,
  m: ExportMultiplier,
): Promise<RenderedSheet> {
  const { imageWidthPx: w, imageHeightPx: h } = input;
  if (!canExportAt(w, h, m)) {
    throw new ExportTooLargeError(m, largestMultiplierFor(w, h));
  }

  const bitmapWidthPx = w * m;
  const bitmapHeightPx = h * m;

  const [{ default: KonvaLib }, { MarkupScene }] = await Promise.all([
    import('konva'),
    import('@/editor/shapes/scene'),
    loadInkHelpers(),
  ]);

  // The destination bitmap. The photo is composited straight into it (never through a
  // Konva layer) so the render holds one fewer full-size bitmap.
  const canvas = document.createElement('canvas');
  canvas.width = bitmapWidthPx;
  canvas.height = bitmapHeightPx;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('renderSheet: no 2D context for the export bitmap');

  const photoMissing = input.photo === null;
  if (input.photo) {
    ctx2d.drawImage(input.photo, 0, 0, bitmapWidthPx, bitmapHeightPx);
  } else {
    // §19.4a: a white page at the sheet's STORED dimensions; the markup still renders.
    ctx2d.fillStyle = DAMAGED_PHOTO_PAGE_FILL;
    ctx2d.fillRect(0, 0, bitmapWidthPx, bitmapHeightPx);
  }

  const container = document.createElement('div');
  // Built at 1×1 and resized after `pixelRatio` is pinned to 1: a layer allocates its
  // bitmap at construction from `devicePixelRatio`, so sizing first would transiently
  // allocate `(w·M·dpr) × (h·M·dpr)` — up to 4× the guarded budget on a 2× display.
  const stage = new KonvaLib.Stage({ container, width: 1, height: 1 });

  // Insets sit BELOW all other markup (§8.1/§20.2), exactly as on screen. The layer is
  // only created when the sheet actually has one, so the common case holds one bitmap.
  const hasInsets = input.annotations.some((a) => a.type === 'image');
  const insetLayer = hasInsets ? new KonvaLib.Layer({ listening: false }) : null;
  const markupLayer = new KonvaLib.Layer({ listening: false });
  const layers = insetLayer ? [insetLayer, markupLayer] : [markupLayer];
  for (const layer of layers) stage.add(layer);
  for (const layer of layers) {
    // §4.2 export: pixelRatio is 1 — NOT `min(devicePixelRatio, 2)` (the screen rule).
    layer.getCanvas().setPixelRatio(1);
    // `listening:false` also keeps each layer's hit canvas at 0×0 (no second bitmap).
    layer.scale({ x: m, y: m });
  }
  stage.size({ width: bitmapWidthPx, height: bitmapHeightPx });

  const scene = new MarkupScene({
    layer: markupLayer,
    insetLayer: insetLayer ?? markupLayer,
    ctx: input.ctx,
    ghostText: input.ghostText,
    assetProvider: input.assetProvider,
  });
  if (input.assetProvider) scene.setAssetProvider(input.assetProvider);
  scene.load(input.annotations);
  // Labels are DERIVED here and now from `valueMm` + the project context (AGENTS #2).
  // `setScale` is the SCREEN path and is never called on an export tree.
  scene.setContext(input.ctx);
  // D154: lay the dimension labels out for the `mu × k` glyphs (the label gap and collision
  // push are functions of the drawn size). This is the scene's label layout, not the screen rules.
  const k = exportMarkupScale(w, h);
  if (k !== 1) scene.setScale(1 / k);

  for (const layer of layers) applyExportRules(layer, m, k);

  // Draw and composite one layer at a time, releasing each layer's bitmap as soon as it
  // has been merged — the peak is the destination plus one layer.
  for (const layer of layers) {
    layer.drawScene();
    ctx2d.drawImage(layer.getCanvas()._canvas, 0, 0);
    layer.getCanvas().setSize(0, 0);
  }

  // UI/GUI handoff pass: drawn straight onto the flattened bitmap, on top of every
  // layer just composited — same as a real watermark sits on top of a printed page.
  if (input.watermark) {
    drawWatermark(
      ctx2d,
      input.watermark.image,
      bitmapWidthPx,
      bitmapHeightPx,
      input.watermark.aspectRatio,
      input.captureStamp ?? null,
    );
  }

  // Free everything: destroy the nodes, the stage (Konva releases the layer canvases on
  // destroy) and the detached container. Nothing but `canvas` survives this call.
  scene.load([]);
  stage.destroy();
  container.innerHTML = '';

  return { canvas, bitmapWidthPx, bitmapHeightPx, photoMissing };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('renderSheetJpeg: canvas.toBlob produced no blob'));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Render one sheet and encode it as the JPEG `pdf.ts` embeds.
 *
 * `imageWidthPx/HeightPx` in the result are the WORKING-IMAGE dimensions, not the
 * bitmap's: the page is `imagePx × 0.75` pt at every M, which is what makes the physical
 * size identical across multipliers (§9.2). The bitmap is freed before returning, so a
 * 50-sheet export never holds two sheets' rasters at once (§9.5 memory guidance).
 */
export async function renderSheetJpeg(
  input: ExportSheetInput,
  m: ExportMultiplier,
  quality: number = EXPORT_JPEG_QUALITY,
): Promise<SheetExport & { photoMissing: boolean }> {
  const rendered = await renderSheet(input, m);
  try {
    const jpg = await canvasToJpeg(rendered.canvas, quality);
    return {
      jpg,
      imageWidthPx: input.imageWidthPx,
      imageHeightPx: input.imageHeightPx,
      photoMissing: rendered.photoMissing,
    };
  } finally {
    // Free this sheet's bitmap before the next sheet is rendered (§9.5).
    rendered.canvas.width = 0;
    rendered.canvas.height = 0;
  }
}
