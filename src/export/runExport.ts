/**
 * `src/export/runExport.ts` — slice 1.9's orchestration: the ONE place that turns an
 * `ExportPlan` (the wizard's pinned model) into bytes on disk (handoff-session-14 §3).
 *
 * WHY THIS FILE EXISTS
 *   Slice 1.9 shipped every module (`renderStage`, `pdf`, `png`, `filenames`) and the
 *   wizard (`ExportWizard.tsx`) — but nothing connected them. The wizard takes every unit
 *   of real work as an injected prop on purpose (it stays jsdom-testable); this module is
 *   the production implementation of those props, and `EditorLayout` is the only consumer.
 *
 * THE CONTRACT (`ExportWizardProps` in `src/ui/ExportWizard.tsx:106-124` — pinned)
 *   `runExport(plan, onProgress)` resolves `plan.sheetIds` IN ORDER, renders ONE sheet at a
 *   time, writes every file through `projectStore.writeAtomic` (AGENTS non-negotiable #3),
 *   and RESOLVES with a per-file row for every attempted file — including failures AND
 *   `Skip` conflicts (a skip is a row with `skipped: true`, never a silent omission). A
 *   rejection is a whole-run failure with no per-file detail, so per-file write failures
 *   are rows, not a throw. `checkMultiplier` refuses a multiplier the §19.4b budget cannot
 *   hold; `estimate` feeds the approved `Will write …` line.
 *
 * THE ONE MISTAKE THAT SILENTLY BREAKS THE SLICE (handoff-14 §3 trap 2)
 *   `SheetExport.imageWidthPx` is the sheet's WORKING-IMAGE size, NEVER the M-scaled
 *   bitmap. Page pt = `imagePx × 0.75`; that is exactly what makes the physical stroke/font
 *   identical at every M (§4.2). `renderSheetJpeg` already returns the working size it was
 *   given — so we pass `sheet.imageWidth`, and the trap is only reachable by passing the
 *   bitmap dimensions here.
 *
 * LAZY-ENGINE (handoff-14 §3 trap 5)
 *   `pdf-lib` is the heavy dependency; `./pdf` and `./png` are `await import()`ed INSIDE the
 *   handler so they stay out of the main chunk. `renderStage` is a static import: it pulls
 *   no runtime Konva (`import type` only; the ink helpers are dynamically imported there),
 *   and its pure arithmetic (`canExportAt` / `largestMultiplierFor` / `bitmapBytes`) must be
 *   callable SYNCHRONOUSLY by `checkMultiplier`. The wizard component itself is a STATIC
 *   import in `EditorLayout` (handoff-14 §3 trap 5: a new edge into a lazy chunk is exactly
 *   the untested case — the browser project is the gate that can see it).
 *
 * ASSETS (review F3)
 *   Without an `assetProvider` every inset exports as the `#3A3F46` grey placeholder
 *   instead of its photo. The editor's session registry only holds assets it has already
 *   decoded — and only for the CURRENT sheet — so a run over `All sheets` would still
 *   export placeholders. This module therefore builds a DISK-BACKED provider: every asset
 *   referenced by a sheet is decoded from `assets/<assetId>.jpg` BEFORE that sheet renders
 *   (the renderer resolves synchronously, so a late decode would land after the draw). The
 *   session registry is used as a synchronous seed so already-decoded assets are not read
 *   twice. That is why `EditorSheet.source.assetProvider` is passed through.
 *
 * FILENAME CHOICES (not pinned by the spec — reported to the orchestrator)
 *   Per-sheet files (PNG without zip) use the spec's default template
 *   `{project}_{index}-{sheet}` (`appendix-strings.md:376`), index zero-padded 2 digits so
 *   the folder sorts in export order. Aggregate files — a multi-page PDF, or the PNG zip —
 *   carry ONE file, so `{index}`/`{sheet}` have no per-file meaning and the name degrades to
 *   `{project}` (e.g. `Riverside.pdf`). A split PDF uses the fixed `part-01.pdf` … names the
 *   plan names (implementation plan §1.9 step 3b).
 */
import type { Annotation } from '@/domain/types';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';
import type { InsetAssetImage } from '@/editor/inset/renderInset';
import { assetFileName } from '@/editor/inset/insetAssets';
import {
  StorageWriteError,
  entriesOf,
  isPhotoDamaged,
  readProjectFile,
  readSheetMarkup,
  resolveAssetsDir,
  resolveOpenProjectDir,
  resolveSheetDir,
  writeAtomic,
} from '@/fs/projectStore';
import { conflictName, joinFilename } from './filenames';
import {
  canExportAt,
  largestMultiplierFor,
  renderSheet,
  renderSheetJpeg,
} from './renderStage';
import {
  EXPORT_WATERMARK_ASPECT_RATIO,
  formatCaptureStamp,
  loadExportWatermarkImage,
} from './watermark';
import { getWatermarkEnabled } from '@/settings/watermark';
import { DEFAULT_EXPORT_LOCATION, type ExportLocation } from '@/settings/exportLocation';
import { useAppStore } from '@/state/appStore';
import type {
  ConflictPolicy,
  ExportFileResult,
  ExportMultiplier,
  ExportPlan,
  ExportProgress,
  ExportResult,
} from '@/ui/ExportWizard';
import type { SheetExport } from './pdf';

/* ------------------------------------------------------------------ *
 * Pure helpers — the node-testable half (`tests/runExport.test.ts`)
 * ------------------------------------------------------------------ */

/** A sheet as the export needs it: identity, title, WORKING-IMAGE size. */
export interface ExportSheetSource {
  id: string;
  title: string;
  imageWidthPx: number;
  imageHeightPx: number;
}

/** `2` → `02`. The index sorts the folder in export order. */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * `<project>/exports/<timestamp>/` display stamp — the spec's own example is
 * `2026-09-21_1412` (build spec §9.5), i.e. `YYYY-MM-DD_HHmm`.
 */
export function exportTimestamp(date: Date): string {
  const p = (n: number): string => pad2(n);
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `_${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/**
 * Owner request D147 item 2: the session's default destination follows
 * `src/settings/exportLocation.ts`'s `ExportLocation`.
 *   - `'dated'`   → `<project>/exports/<stamp>/` (the original default, unchanged).
 *   - `'project'` → straight into `<project>/` — no `exports/<stamp>` subfolder at all.
 * The PWA cannot show an absolute path (File System Access exposes names only), so both
 * forms keep the existing `…\<folderName>\…` display convention.
 */
export function defaultDestinationPath(
  location: ExportLocation,
  folderName: string,
  stamp: string,
): string {
  return location === 'project' ? `…\\${folderName}\\` : `…\\${folderName}\\exports\\${stamp}\\`;
}

/** `part-01.pdf`, `part-02.pdf`, … (implementation plan §1.9 step 3b). */
export function pdfPartName(oneBased: number): string {
  return `part-${pad2(oneBased)}.pdf`;
}

/**
 * The names a PDF export will attempt, given how many 250 MB parts `buildPdfParts`
 * produced. One part keeps the plan's aggregate name; a split replaces it with the fixed
 * `part-NN.pdf` names (the file the user sees is then one of several, not the whole run).
 */
export function pdfFileNames(
  partCount: number,
  plan: Pick<ExportPlan, 'format' | 'zip'>,
  projectTitle: string,
  sheets: readonly ExportSheetSource[],
): string[] {
  if (partCount > 1) return Array.from({ length: partCount }, (_, index) => pdfPartName(index + 1));
  return planFileNames(plan, projectTitle, sheets);
}

/**
 * Resolve `plan.sheetIds` IN ORDER against the known sheets, dropping ids that are no
 * longer present (a sheet deleted in another tab). Never reorders, never duplicates.
 */
export function resolvePlanSheets(
  plan: Pick<ExportPlan, 'sheetIds'>,
  sheets: readonly ExportSheetSource[],
): ExportSheetSource[] {
  const byId = new Map<string, ExportSheetSource>();
  for (const sheet of sheets) byId.set(sheet.id, sheet);
  const out: ExportSheetSource[] = [];
  for (const id of plan.sheetIds) {
    const sheet = byId.get(id);
    if (sheet) out.push(sheet);
  }
  return out;
}

/** Per-sheet name from the spec's default template `{project}_{index}-{sheet}`. */
export function sheetFileNames(
  projectTitle: string,
  sheets: readonly ExportSheetSource[],
  ext: 'png' | 'jpg',
): string[] {
  return sheets.map((sheet, index) =>
    joinFilename([projectTitle, `${pad2(index + 1)}-${sheet.title}`], ext),
  );
}

/**
 * The file names a plan will attempt, BEFORE conflict resolution.
 *   - PDF: one aggregate file (`{project}.pdf`); a 250 MB split replaces it with
 *     `part-NN.pdf` at write time, which is why the split count is not knowable here.
 *   - PNG + zip: one aggregate `{project}.zip`.
 *   - PNG without zip: one file per sheet.
 */
export function planFileNames(
  plan: Pick<ExportPlan, 'format' | 'zip'>,
  projectTitle: string,
  sheets: readonly ExportSheetSource[],
): string[] {
  if (plan.format === 'pdf') return [joinFilename([projectTitle], 'pdf')];
  if (plan.zip) return [joinFilename([projectTitle], 'zip')];
  return sheetFileNames(projectTitle, sheets, 'png');
}

/**
 * Apply the plan's conflict policy to an ordered name list against the destination's
 * ACTUAL listing, so a name is never reused within the same run either (two sheets may
 * sanitize to the same name — `zipPngs` throws on a duplicate entry, and the folder would
 * silently lose one).
 *
 * Returns `null` for a name the `skip` policy refuses; the caller must not write it.
 */
export function applyConflictPolicy(
  names: readonly string[],
  existing: readonly string[],
  policy: ConflictPolicy,
): (string | null)[] {
  const taken: string[] = [...existing];
  const out: (string | null)[] = [];
  for (const name of names) {
    const resolved = conflictName(taken, name, policy);
    if (resolved !== null) taken.push(resolved);
    out.push(resolved);
  }
  return out;
}

/**
 * Estimate for the approved `Will write {fileCount} files ({size}) to: …` line.
 *
 * Arithmetic — bitmaps are `w × h × M² × 4` bytes (RGBA; `renderStage.bitmapBytes`).
 *   PNG  (lossless, photographic): ≈ 2 bytes / bitmap px  → 50 % of the raw RGBA bitmap.
 *   PDF  (single JPEG @ `EXPORT_JPEG_QUALITY = 0.92`): ≈ 0.5 bytes / bitmap px.
 * These are ESTIMATES, not measurements: the line must never promise LESS disk than the run
 * needs, so both factors sit at the upper end of their range. A real number needs a Surface
 * (reported as owed — the surface measurement is the one that decides).
 */
export const ESTIMATED_PNG_BYTES_PER_PX = 2;
export const ESTIMATED_JPEG_BYTES_PER_PX = 0.5;

export function estimatePlan(
  plan: Pick<ExportPlan, 'format' | 'zip' | 'multiplier'>,
  sheets: readonly ExportSheetSource[],
): { fileCount: number; bytes: number } {
  const fileCount = plan.format === 'pdf' ? 1 : plan.zip ? 1 : sheets.length;
  const bytesPerPx =
    plan.format === 'pdf' ? ESTIMATED_JPEG_BYTES_PER_PX : ESTIMATED_PNG_BYTES_PER_PX;
  let bytes = 0;
  for (const sheet of sheets) {
    // w × h × M² × bytesPerPx — the guard's own bitmap arithmetic, scaled by the codec.
    bytes += Math.round(
      sheet.imageWidthPx * sheet.imageHeightPx * plan.multiplier * plan.multiplier * bytesPerPx,
    );
  }
  return { fileCount, bytes };
}

/**
 * The §19.4b budget across the plan's sheets. The plan's multiplier applies to EVERY sheet,
 * so one sheet that cannot hold `M` refuses `M` for the whole run, and the offer is the
 * largest M every sheet can hold (`min` of each sheet's `largestMultiplierFor`). `null`
 * means even 1× is refused for some sheet.
 *
 * `bitmapBytes = w × h × M² × 4`; the boundary is INCLUSIVE (D96): `> 512 MiB` refuses.
 */
export function checkMultiplierFor(
  plan: Pick<ExportPlan, 'multiplier'>,
  sheets: readonly ExportSheetSource[],
): { ok: true } | { ok: false; largest: ExportMultiplier | null } {
  let allowed = true;
  let largest: ExportMultiplier | null = 3;
  for (const sheet of sheets) {
    if (!canExportAt(sheet.imageWidthPx, sheet.imageHeightPx, plan.multiplier)) allowed = false;
    const sheetLargest = largestMultiplierFor(sheet.imageWidthPx, sheet.imageHeightPx);
    if (sheetLargest === null) largest = null;
    else if (largest !== null && sheetLargest < largest) largest = sheetLargest;
  }
  return allowed ? { ok: true } : { ok: false, largest };
}

/** Every `assetId` an annotation tree references (top level and image-inset children). */
export function collectAssetIds(annotations: readonly Annotation[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly Annotation[]): void => {
    for (const ann of list) {
      if (ann.type === 'image' && ann.assetId) ids.push(ann.assetId);
      if (ann.children && ann.children.length > 0) walk(ann.children);
    }
  };
  walk(annotations);
  return ids;
}

/* ------------------------------------------------------------------ *
 * The document source the shell supplies (EditorLayout → SheetEditor seam)
 * ------------------------------------------------------------------ */

/**
 * What the export needs from the open editor. `currentAnnotations` is the LIVE scene for the
 * current sheet (its `markup.json` may still be coalescing in the persist queue);
 * every other sheet is read from disk. `assetProvider` is the session registry (an optional
 * speed-up — the disk-backed provider below is the correctness path). `flush` lands any
 * coalesced write so the on-disk `markup.json` is never the stale half.
 */
export interface ExportDocumentSource {
  sheets: readonly ExportSheetSource[];
  currentSheetId: string | null;
  currentAnnotations: () => readonly Annotation[];
  assetProvider?: (assetId: string) => InsetAssetImage | null;
  flush: () => Promise<void>;
}

export interface ExportDestination {
  /** Folder name as shown (`exports`, or the picked folder's name). */
  name: string;
  /** Display path. File System Access exposes no absolute path — the PWA limit. */
  path: string;
  handle: FileSystemDirectoryHandle | null;
}

export interface ExportSessionDeps {
  /** D51 runtime key `${projectId}:${folderName}` — the per-project Web Lock scope. */
  projectId: string;
  folderName: string;
  getSource: () => ExportDocumentSource | null;
  getContext: () => LabelContext;
  ghostText: string;
  /** Injectable clock so the default destination is deterministic in tests. */
  now?: () => Date;
  /**
   * Injectable override for `useAppStore.getState().exportLocation` (D147 item 2), so a
   * node test can pin `'dated'` / `'project'` without a DOM or a live store.
   */
  getExportLocation?: () => ExportLocation;
}

export interface ExportSession {
  initialDestination: { name: string; path: string };
  chooseDestination(): Promise<{ name: string; path: string } | null>;
  estimate(plan: ExportPlan): { fileCount: number; bytes: number };
  checkMultiplier(plan: ExportPlan): { ok: true } | { ok: false; largest: ExportMultiplier | null };
  runExport(plan: ExportPlan, onProgress: (progress: ExportProgress) => void): Promise<ExportResult>;
  retryFile(name: string): Promise<ExportFileResult>;
  revealFolder(): Promise<void>;
  copyPath(path: string): Promise<void>;
  /** D147 item 3: open one exported file, by name, in a new browser tab. */
  openFile(name: string): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Asset decoding (review F3)
 * ------------------------------------------------------------------ */

interface AssetProvider {
  provider: (assetId: string) => InsetAssetImage | null;
  /** Decode every id not already cached — call BEFORE rendering a sheet. */
  loadAll(assetIds: readonly string[]): Promise<void>;
  dispose(): void;
}

function createAssetProvider(
  projectDir: FileSystemDirectoryHandle,
  seed?: (assetId: string) => InsetAssetImage | null,
): AssetProvider {
  const cache = new Map<string, InsetAssetImage>();
  /** Assets THIS run decoded — the only ones `dispose()` may close. A seeded entry is the
   *  editor session registry's own live `ImageBitmap`; closing it would blank the canvas. */
  const owned = new Set<string>();
  const provider = (assetId: string): InsetAssetImage | null => {
    const hit = cache.get(assetId);
    if (hit) return hit;
    const seeded = seed?.(assetId);
    if (seeded) {
      cache.set(assetId, seeded);
      return seeded;
    }
    return null;
  };
  const loadAll = async (assetIds: readonly string[]): Promise<void> => {
    const unique = [...new Set(assetIds)];
    await Promise.all(
      unique.map(async (assetId) => {
        if (provider(assetId)) return;
        try {
          const dir = await resolveAssetsDir(projectDir, { create: false });
          const handle = await dir.getFileHandle(assetFileName(assetId), { create: false });
          const blob = await handle.getFile();
          const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          cache.set(assetId, { image: bitmap, width: bitmap.width, height: bitmap.height });
          owned.add(assetId);
        } catch {
          // Missing/corrupt asset → the renderer's grey placeholder. Never abort the export.
        }
      }),
    );
  };
  const dispose = (): void => {
    for (const assetId of owned) (cache.get(assetId)?.image as ImageBitmap | undefined)?.close?.();
    cache.clear();
    owned.clear();
  };
  return { provider, loadAll, dispose };
}

/* ------------------------------------------------------------------ *
 * Small IO helpers
 * ------------------------------------------------------------------ */

async function listFileNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of entriesOf(dir)) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

/**
 * `photo.jpg` as a decoded bitmap, or `null` for the §19.4a damaged-photo state (the run
 * renders the markup on a white page and counts it — never skips the sheet).
 */
async function loadPhoto(
  projectDir: FileSystemDirectoryHandle,
  sheetId: string,
): Promise<ImageBitmap | null> {
  try {
    const sheetDir = await resolveSheetDir(projectDir, sheetId);
    if (await isPhotoDamaged(sheetDir)) return null;
    const handle = await sheetDir.getFileHandle('photo.jpg', { create: false });
    return await createImageBitmap(await handle.getFile(), { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
}

/** `StorageWriteError` → the wizard's per-file cause (§12:728). */
function toFileError(e: unknown): NonNullable<ExportFileResult['error']> {
  if (e instanceof StorageWriteError) {
    if (e.kind === 'disk-full') return { kind: 'disk-full' };
    if (e.kind === 'target-locked') return { kind: 'locked' };
    if (e.kind === 'permission') return { kind: 'permission' };
  }
  return { kind: 'unknown' };
}

/* ------------------------------------------------------------------ *
 * The session — the wizard's injected props
 * ------------------------------------------------------------------ */

/**
 * Build the production implementation of `ExportWizardProps`'s action half.
 *
 * A session owns: the destination (default `<project>/exports/<stamp>/`, or the gesture-
 * picked handle), the per-file retry bytes of the last run, and the run itself. Created by
 * `EditorLayout` when the wizard opens and discarded when it closes.
 */
export function createExportSession(deps: ExportSessionDeps): ExportSession {
  const now = deps.now ?? (() => new Date());
  const stamp = exportTimestamp(now());
  // D147 item 2: read once at session creation (the wizard's mount reads this same
  // instant), from the LIVE app store rather than `getExportLocation()`'s idb-keyval
  // promise — `createExportSession` must stay synchronous for `EditorLayout` to hand the
  // wizard an `initialDestination` on the render that opens it. `Settings.tsx` keeps this
  // store field current on every change, so it is never stale by more than one render.
  const location: ExportLocation = deps.getExportLocation
    ? deps.getExportLocation()
    : (useAppStore.getState().exportLocation ?? DEFAULT_EXPORT_LOCATION);

  let destination: ExportDestination = {
    name: location === 'project' ? deps.folderName : 'exports',
    path: defaultDestinationPath(location, deps.folderName, stamp),
    handle: null,
  };

  /** Failed writes' exact bytes, keyed by the name the user is retrying. */
  const retryData = new Map<string, { dir: FileSystemDirectoryHandle; name: string; data: Uint8Array }>();

  async function ensureDestination(): Promise<ExportDestination> {
    if (destination.handle) return destination;
    const projectDir = await resolveOpenProjectDir(deps.projectId);
    // 'project' writes straight into the project folder — no `exports/<stamp>` subfolder
    // to create (D147 item 2). 'dated' is the original behaviour, unchanged.
    const handle =
      location === 'project'
        ? projectDir
        : await (await projectDir.getDirectoryHandle('exports', { create: true })).getDirectoryHandle(
            stamp,
            { create: true },
          );
    destination = { ...destination, handle };
    return destination;
  }

  async function chooseDestination(): Promise<{ name: string; path: string } | null> {
    const picker = globalThis.showDirectoryPicker;
    if (typeof picker !== 'function') return null;
    try {
      // GESTURE-DRIVEN: the caller must invoke this from a real user activation or
      // Chromium rejects it (`NotAllowedError`, surfaced here as a cancel).
      const handle = await picker({ id: 'fieldmeasure-export', mode: 'readwrite' });
      destination = { name: handle.name, path: `…\\${handle.name}\\`, handle };
      return { name: destination.name, path: destination.path };
    } catch {
      return null; // user cancel — the wizard keeps its previous destination
    }
  }

  function estimate(plan: ExportPlan): { fileCount: number; bytes: number } {
    const source = deps.getSource();
    const sheets = source ? resolvePlanSheets(plan, source.sheets) : [];
    return estimatePlan(plan, sheets);
  }

  function checkMultiplier(
    plan: ExportPlan,
  ): { ok: true } | { ok: false; largest: ExportMultiplier | null } {
    const source = deps.getSource();
    const sheets = source ? resolvePlanSheets(plan, source.sheets) : [];
    return checkMultiplierFor(plan, sheets);
  }

  async function writeFile(
    dir: FileSystemDirectoryHandle,
    name: string,
    data: Uint8Array,
    files: ExportFileResult[],
  ): Promise<void> {
    const blob = new Blob([data as unknown as BlobPart]);
    try {
      await writeAtomic(dir, name, blob, deps.projectId);
      files.push({ name, bytes: data.byteLength });
    } catch (e) {
      // PER-FILE failure: a row with a cause, never a rejected run (handoff-14 §3). The
      // exact bytes are kept so the result view's Retry can write the same file again.
      files.push({ name, bytes: 0, error: toFileError(e) });
      retryData.set(name, { dir, name, data });
    }
  }

  async function runExport(
    plan: ExportPlan,
    onProgress: (progress: ExportProgress) => void,
  ): Promise<ExportResult> {
    const source = deps.getSource();
    if (!source) throw new Error('export: no document is open');
    // Land any coalesced markup write first; the CURRENT sheet's live objects are used
    // directly below, but a flush keeps the on-disk state coherent for every other reader.
    await source.flush();

    const projectDir = await resolveOpenProjectDir(deps.projectId);
    const projectFile = await readProjectFile(projectDir);
    const projectTitle = projectFile.project.title || deps.folderName || 'untitled';
    const planSheets = resolvePlanSheets(plan, source.sheets);
    const dest = await ensureDestination();
    if (!dest.handle) throw new Error('export: no destination is available');
    const listing = await listFileNames(dest.handle);
    const ctx = deps.getContext();
    const assets = createAssetProvider(projectDir, source.assetProvider);
    // UI/GUI handoff pass (2026-09-22): decided ONCE per run, not per sheet — a
    // storage failure or a decode failure both mean "no watermark this run" rather
    // than aborting the export the user asked for.
    const watermark = await (async (): Promise<{ image: CanvasImageSource; aspectRatio: number } | null> => {
      try {
        if (!(await getWatermarkEnabled())) return null;
        return { image: await loadExportWatermarkImage(), aspectRatio: EXPORT_WATERMARK_ASPECT_RATIO };
      } catch {
        return null;
      }
    })();

    // Each sheet's photo date/time, printed above the watermark (only when the watermark is on).
    const stampBySheet = new Map<string, string | null>(
      projectFile.sheets.map((row) => [row.id, formatCaptureStamp(row.capturedAt)]),
    );

    const files: ExportFileResult[] = [];
    let sheetsWithoutPhoto = 0;
    let totalBytes = 0;
    let parts: number | undefined;

    /** The annotations for one sheet: live for the open sheet, on-disk for the rest. */
    const annotationsFor = async (sheet: ExportSheetSource): Promise<readonly Annotation[]> => {
      if (sheet.id === source.currentSheetId) return source.currentAnnotations();
      const markup = await readSheetMarkup(projectDir, sheet.id, () => ({
        schemaVersion: 1,
        sheetId: sheet.id,
        objects: [],
      }));
      return markup.objects;
    };

    try {
      if (plan.format === 'pdf') {
        const { buildPdfParts } = await import('./pdf');
        const sheetExports: SheetExport[] = [];

        // ONE sheet at a time. `renderSheetJpeg` frees its bitmap before returning (§9.5).
        for (const sheet of planSheets) {
          onProgress({ done: 0, total: Math.max(1, planSheets.length), currentName: sheet.title });
          const annotations = await annotationsFor(sheet);
          await assets.loadAll(collectAssetIds(annotations));
          const photo = await loadPhoto(projectDir, sheet.id);
          // The WORKING-IMAGE size — the trap. `renderSheetJpeg` echoes this back as
          // `SheetExport.imageWidthPx`, and `pdf.ts` does page pt = this × 0.75. Passing
          // bitmap px here would make the page grow with M.
          const imageWidthPx = sheet.imageWidthPx || photo?.width || 0;
          const imageHeightPx = sheet.imageHeightPx || photo?.height || 0;
          try {
            const rendered = await renderSheetJpeg(
              {
                sheetId: sheet.id,
                imageWidthPx,
                imageHeightPx,
                annotations,
                ctx,
                ghostText: deps.ghostText,
                photo,
                assetProvider: assets.provider,
                watermark,
                captureStamp: stampBySheet.get(sheet.id) ?? null,
              },
              plan.multiplier,
            );
            if (rendered.photoMissing) sheetsWithoutPhoto += 1;
            sheetExports.push({
              jpg: rendered.jpg,
              imageWidthPx: rendered.imageWidthPx,
              imageHeightPx: rendered.imageHeightPx,
            });
          } finally {
            photo?.close();
          }
        }

        // Never `buildPdf([])` — a page-less document saves as one blank A4 (pinned in
        // tests/pdf.test.ts). `buildPdfParts([])` returns `[]` and is the safe path.
        const partBytes = await buildPdfParts(sheetExports);
        parts = partBytes.length;
        const baseNames = pdfFileNames(partBytes.length, plan, projectTitle, planSheets);
        const resolved = applyConflictPolicy(baseNames, listing, plan.conflictPolicy);
        const total = Math.max(1, partBytes.length);

        for (let index = 0; index < partBytes.length; index += 1) {
          const name = resolved[index];
          if (name === null) {
            onProgress({ done: index + 1, total, currentName: baseNames[index] ?? '' });
            continue;
          }
          await writeFile(dest.handle, name, partBytes[index]!, files);
          onProgress({ done: index + 1, total, currentName: name });
        }
      } else {
        const { canvasToPngBytes, zipPngs } = await import('./png');
        const entryNames = sheetFileNames(projectTitle, planSheets, 'png');
        const entries: Array<{ name: string; bytes: Uint8Array }> = [];

        for (const [index, sheet] of planSheets.entries()) {
          const annotations = await annotationsFor(sheet);
          await assets.loadAll(collectAssetIds(annotations));
          const photo = await loadPhoto(projectDir, sheet.id);
          try {
            const rendered = await renderSheet(
              {
                sheetId: sheet.id,
                imageWidthPx: sheet.imageWidthPx || photo?.width || 0,
                imageHeightPx: sheet.imageHeightPx || photo?.height || 0,
                annotations,
                ctx,
                ghostText: deps.ghostText,
                photo,
                assetProvider: assets.provider,
                watermark,
                captureStamp: stampBySheet.get(sheet.id) ?? null,
              },
              plan.multiplier,
            );
            if (rendered.photoMissing) sheetsWithoutPhoto += 1;
            try {
              entries.push({ name: entryNames[index]!, bytes: await canvasToPngBytes(rendered.canvas) });
            } finally {
              // Free this sheet's raster before the next (`renderSheet` does not).
              rendered.canvas.width = 0;
              rendered.canvas.height = 0;
            }
          } finally {
            photo?.close();
          }
        }

        if (plan.zip) {
          // REVIEW F3: an emptied-mid-flight scope (every `plan.sheetIds` entry gone) renders
          // no entries. The PDF branch already writes nothing in that case; without this
          // guard `zipPngs([])` writes a valid-but-empty (22-byte) archive and reports it as
          // a success row. Mirror the PDF branch: nothing to archive → nothing written.
          if (entries.length > 0) {
            // `zipPngs` throws on a duplicate entry name (a silent collapse would drop a
            // sheet) — apply the `add` policy internally so two identically-titled sheets
            // still both ship. There is no "existing" listing inside a brand-new zip.
            const uniqueEntries = applyConflictPolicy(
              entries.map((entry) => entry.name),
              [],
              'add',
            );
            const zipped = zipPngs(
              entries.map((entry, index) => ({ name: uniqueEntries[index] ?? entry.name, bytes: entry.bytes })),
            );
            const name = planFileNames(plan, projectTitle, planSheets)[0]!;
            const resolved = applyConflictPolicy([name], listing, plan.conflictPolicy)[0];
            if (resolved !== null) {
              await writeFile(dest.handle, resolved, zipped, files);
            } else {
              // REVIEW F4: a «Skip» conflict writes nothing, but must not report NOTHING —
              // the result view gets a row, and the progress line advances, so the user
              // never sees an unexplained "0 files".
              files.push({ name, bytes: 0, skipped: true });
            }
            onProgress({ done: 1, total: 1, currentName: resolved ?? name });
          }
        } else {
          const resolved = applyConflictPolicy(entryNames, listing, plan.conflictPolicy);
          const total = Math.max(1, entries.length);
          for (const [index, entry] of entries.entries()) {
            const name = resolved[index];
            if (name === null) {
              // REVIEW F4: report the skip (progress + a row) instead of dropping it.
              files.push({ name: entry.name, bytes: 0, skipped: true });
              onProgress({ done: index + 1, total, currentName: entry.name });
              continue;
            }
            await writeFile(dest.handle, name, entry.bytes, files);
            onProgress({ done: index + 1, total, currentName: name });
          }
        }
      }
    } finally {
      assets.dispose();
    }

    for (const file of files) totalBytes += file.bytes;
    const result: ExportResult = {
      files,
      path: dest.path,
      totalBytes,
      sheetsWithoutPhoto,
    };
    if (parts !== undefined) result.parts = parts;
    return result;
  }

  async function retryFile(name: string): Promise<ExportFileResult> {
    const entry = retryData.get(name);
    if (!entry) return { name, bytes: 0, error: { kind: 'unknown' } };
    try {
      await writeAtomic(entry.dir, entry.name, new Blob([entry.data as unknown as BlobPart]), deps.projectId);
      retryData.delete(name);
      return { name, bytes: entry.data.byteLength };
    } catch (e) {
      return { name, bytes: 0, error: toFileError(e) };
    }
  }

  async function revealFolder(): Promise<void> {
    const picker = globalThis.showDirectoryPicker;
    if (typeof picker !== 'function') return;
    const dest = await ensureDestination();
    if (!dest.handle) return;
    try {
      // The spec's own approximation of «Reveal folder» from a PWA:
      // `showDirectoryPicker({ startIn })` opens the picker AT the folder.
      await picker({ id: 'fieldmeasure-export', startIn: dest.handle });
    } catch {
      // User cancel is not an error.
    }
  }

  /**
   * D147 item 3: never fails silently. `navigator.clipboard` missing (no secure context,
   * an older WebView) or `writeText` rejecting (permission refused) both REJECT this
   * promise — never swallowed — so the wizard's caller can fall back to a selectable
   * read-only field instead of reporting a false success.
   */
  async function copyPath(path: string): Promise<void> {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      throw new Error('export: clipboard is unavailable');
    }
    await clipboard.writeText(path);
  }

  /**
   * D147 item 3: "Open" on a result row. A browser cannot open Windows Explorer, so the
   * accepted alternative is opening the file itself in a new tab —
   * `FileSystemFileHandle` → `getFile()` → `URL.createObjectURL` → `window.open`. The
   * object URL is revoked after a delay long enough for the new tab to have loaded it
   * (immediately if the tab never opened — e.g. a blocked popup — since nothing will read
   * the URL in that case).
   */
  async function openFile(name: string): Promise<void> {
    const dest = await ensureDestination();
    if (!dest.handle) return;
    try {
      const handle = await dest.handle.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      const opened = globalThis.open?.(url, '_blank');
      if (opened) {
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        URL.revokeObjectURL(url);
      }
    } catch {
      // The file may have moved or been renamed since the run finished — nothing to
      // recover from here; the row itself is the record that it was written.
    }
  }

  return {
    initialDestination: { name: destination.name, path: destination.path },
    chooseDestination,
    estimate,
    checkMultiplier,
    runExport,
    retryFile,
    revealFolder,
    copyPath,
    openFile,
  };
}
