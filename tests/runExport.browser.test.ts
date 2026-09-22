/**
 * `tests/runExport.browser.test.ts` — slice 1.9's export, END TO END in a real browser.
 *
 * This is the only project with a real canvas, a real Konva rasteriser and Web Locks, so
 * it is the only place the orchestration can be executed rather than read:
 *
 *   - **PDF page size = working-image px × 0.75** (the slice's stated trap). At M = 2 the
 *     bitmap is 800 × 600, so a page built from the bitmap would be 600 × 450 pt. The test
 *     asserts 300 × 225 pt for a 400 × 300 sheet — 400 × 0.75 = 300, 300 × 0.75 = 225.
 *   - **one sheet at a time**, PNG zip / no-zip, per-file progress, damaged-photo counting.
 *   - **the conflict policy against the destination's real listing** (`add` → ` (1)`).
 *   - **the current sheet is read LIVE, not from its on-disk `markup.json`** — the mocked
 *     loader THROWS for the live sheet, so a run that reads disk fails loudly.
 *   - **an inset's asset is decoded from `assets/` before rendering** (review F3): without
 *     the provider every inset is a grey placeholder. Proven by counting decodes — one for
 *     `photo.jpg`, one for `assets/<id>.jpg`; without the provider there is only one.
 *
 * HOW THE WRITES ARE FAKED. `writeAtomic` is the REAL one (the imported module is spread
 * from the original), so every byte still goes through tmp → close → `move()` under the
 * per-project Web Lock. Only the DIRECTORY RESOLUTION is faked: an in-memory
 * `FileSystemDirectoryHandle` clone. That is the closest a headless browser can get to a
 * real folder — `showDirectoryPicker` needs a user gesture and a real disk directory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { PDFDocument } from '@cantoo/pdf-lib';

import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import type { MarkupFile, ProjectFile } from '../src/domain/schema';
import { readPngSize } from '../src/export/png';
import {
  createExportSession,
  type ExportSheetSource,
} from '../src/export/runExport';
import type { ExportPlan, ExportProgress } from '../src/ui/ExportWizard';

/* ------------------------------------------------------------------ *
 * An in-memory File System Access stand-in
 * ------------------------------------------------------------------ */

interface FakeFile {
  name: string;
  data: Uint8Array;
}

class FakeWritable {
  constructor(private readonly target: FakeFile) {}
  async write(data: string | Blob | ArrayBufferView): Promise<void> {
    if (typeof data === 'string') {
      this.target.data = new TextEncoder().encode(data);
    } else if (data instanceof Blob) {
      this.target.data = new Uint8Array(await data.arrayBuffer());
    } else {
      const view = data as ArrayBufferView;
      this.target.data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
    }
  }
  async close(): Promise<void> {
    // flush — nothing to do for an in-memory store
  }
}

class FakeFileHandle {
  readonly kind = 'file' as const;
  constructor(
    public name: string,
    private readonly file: FakeFile,
    private readonly dir: FakeDirHandle,
  ) {}
  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this.file);
  }
  /** Mirrors Chromium's overwrite-on-move: the tmp entry is renamed in place. */
  async move(name: string): Promise<void> {
    this.dir.files.delete(this.name);
    this.file.name = name;
    this.dir.files.set(name, this.file);
    this.name = name;
  }
  async getFile(): Promise<File> {
    return new File([this.file.data as unknown as BlobPart], this.name);
  }
}

class FakeDirHandle {
  readonly kind = 'directory' as const;
  readonly files = new Map<string, FakeFile>();
  readonly dirs = new Map<string, FakeDirHandle>();
  constructor(public readonly name: string) {}
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    let file = this.files.get(name);
    if (!file) {
      if (!options?.create) throw new DOMException(`not found: ${name}`, 'NotFoundError');
      file = { name, data: new Uint8Array() };
      this.files.set(name, file);
    }
    return new FakeFileHandle(name, file, this);
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirHandle> {
    let dir = this.dirs.get(name);
    if (!dir) {
      if (!options?.create) throw new DOMException(`not found: ${name}`, 'NotFoundError');
      dir = new FakeDirHandle(name);
      this.dirs.set(name, dir);
    }
    return dir;
  }
  async *entries(): AsyncGenerator<[string, { kind: string }]> {
    for (const name of this.files.keys()) yield [name, { kind: 'file' }];
    for (const name of this.dirs.keys()) yield [name, { kind: 'directory' }];
  }
}

/* ------------------------------------------------------------------ *
 * Project-store mock — only the directory RESOLUTION is replaced
 * ------------------------------------------------------------------ */

const h = vi.hoisted(() => ({
  projectDir: null as unknown,
  projectFile: null as unknown,
  markup: new Map<string, unknown>(),
  sheetDirs: new Map<string, unknown>(),
  damaged: new Set<string>(),
  liveSheets: new Set<string>(),
  noAssets: true,
  assetsDir: null as unknown,
}));

vi.mock('@/fs/projectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/projectStore')>();
  return {
    ...actual,
    resolveOpenProjectDir: async () => h.projectDir as FileSystemDirectoryHandle,
    readProjectFile: async () => h.projectFile as ProjectFile,
    readSheetMarkup: async (_dir: unknown, sheetId: string) => {
      if (h.liveSheets.has(sheetId)) {
        throw new Error(`runExport read ${sheetId} from disk instead of using the live scene`);
      }
      return {
        schemaVersion: 1,
        sheetId,
        objects: h.markup.get(sheetId) ?? [],
      } as MarkupFile;
    },
    resolveSheetDir: async (_dir: unknown, sheetId: string) =>
      h.sheetDirs.get(sheetId) as unknown as FileSystemDirectoryHandle,
    isPhotoDamaged: async (dir: { name: string }) => h.damaged.has(dir.name),
    resolveAssetsDir: async () => {
      if (h.noAssets) throw new DOMException('no assets dir', 'NotFoundError');
      return h.assetsDir as FileSystemDirectoryHandle;
    },
  };
});

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SHEETS: ExportSheetSource[] = [
  { id: 'a', title: 'North wall', imageWidthPx: 400, imageHeightPx: 300 },
  { id: 'b', title: 'East footing', imageWidthPx: 400, imageHeightPx: 300 },
];

const STAMP = '2026-09-22_1530';

async function jpegBytes(color: string, w = 8, h = 8): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the fixture JPEG');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function insetAnnotation(assetId: string): Annotation {
  return {
    id: 'inset-1',
    type: 'image',
    geometry: { kind: 'image', x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    style: { ...DEFAULT_STYLE },
    zIndex: 1000,
    source: 'manual',
    assetId,
    locked: false,
  };
}

async function setup(
  sheets: Array<{ id: string; title: string; damaged?: boolean }> = [
    { id: 'a', title: 'North wall' },
    { id: 'b', title: 'East footing' },
  ],
): Promise<void> {
  h.projectDir = new FakeDirHandle('Riverside');
  h.projectFile = {
    schemaVersion: 1,
    project: {
      id: 'p',
      title: 'Riverside',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: sheets.map((sheet, index) => ({
      id: sheet.id,
      title: sheet.title,
      sortIndex: index,
      imageWidth: 400,
      imageHeight: 300,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  } satisfies ProjectFile;
  h.markup.clear();
  h.sheetDirs.clear();
  h.damaged.clear();
  h.liveSheets.clear();
  h.noAssets = true;
  h.assetsDir = null;
  for (const sheet of sheets) {
    const dir = new FakeDirHandle(sheet.id);
    if (sheet.damaged) {
      h.damaged.add(sheet.id);
    } else {
      dir.files.set('photo.jpg', { name: 'photo.jpg', data: await jpegBytes('#FFFFFF', 400, 300) });
    }
    h.sheetDirs.set(sheet.id, dir);
  }
}

function makeSession(
  opts: {
    currentSheetId?: string | null;
    live?: Annotation[];
    assetProvider?: (assetId: string) => { image: CanvasImageSource; width: number; height: number } | null;
  } = {},
): ReturnType<typeof createExportSession> {
  return createExportSession({
    projectId: 'p:Riverside',
    folderName: 'Riverside',
    getSource: () => ({
      sheets: SHEETS,
      currentSheetId: opts.currentSheetId ?? null,
      currentAnnotations: () => opts.live ?? [],
      assetProvider: opts.assetProvider,
      flush: async () => {},
    }),
    getContext: () => ({ unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 }),
    ghostText: 'tap to enter value',
    now: () => new Date(2026, 8, 22, 15, 30),
  });
}

function basePlan(overrides: Partial<ExportPlan> = {}): ExportPlan {
  return {
    scope: 'all',
    sheetIds: ['a', 'b'],
    format: 'pdf',
    multiplier: 2,
    zip: false,
    includeSheetNames: false,
    conflictPolicy: 'add',
    rememberDestination: false,
    ...overrides,
  };
}

/** The default destination the session creates under the fake project folder. */
function destDir(): FakeDirHandle {
  const exportsDir = (h.projectDir as FakeDirHandle).dirs.get('exports');
  const stamped = exportsDir?.dirs.get(STAMP);
  if (!stamped) throw new Error('the default destination was never created');
  return stamped;
}

/** Decode a PNG byte array to pixels (real canvas — this is the browser project). */
async function decodeToImageData(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([bytes as unknown as BlobPart]));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** RGBA at (x, y) — index arithmetic: pixel `(y * width + x)` × 4 channels. */
function pixelAt(img: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!];
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('runExport — PDF', () => {
  it('page size is working-image px × 0.75, NOT the M-scaled bitmap (the slice’s trap)', async () => {
    await setup();
    const result = await makeSession().runExport(basePlan(), () => {});

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.error).toBeUndefined();
    expect(result.parts).toBe(1);

    const file = destDir().files.get(result.files[0]!.name);
    expect(file).toBeTruthy();
    const doc = await PDFDocument.load(file!.data);
    expect(doc.getPageCount()).toBe(2);
    // 400 px × 0.75 = 300 pt; 300 px × 0.75 = 225 pt. At M = 2 the bitmap is 800 × 600,
    // so a page built from the bitmap would measure 600 × 450 — a 2× physical size.
    const page = doc.getPages()[0]!;
    expect(page.getWidth()).toBeCloseTo(300, 4);
    expect(page.getHeight()).toBeCloseTo(225, 4);
  });

  it('reads the OPEN sheet’s live annotations, never its on-disk markup', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    // The mocked loader THROWS for a live sheet: a disk read here fails the run.
    h.liveSheets.add('a');
    const plan = basePlan({ sheetIds: ['a'] });
    const result = await makeSession({ currentSheetId: 'a', live: [] }).runExport(plan, () => {});
    expect(result.files).toHaveLength(1);
  });

  it('counts a damaged-photo sheet and still exports it on a white page (§19.4a)', async () => {
    await setup([{ id: 'a', title: 'North wall', damaged: true }]);
    const plan = basePlan({ sheetIds: ['a'] });
    const result = await makeSession().runExport(plan, () => {});
    expect(result.sheetsWithoutPhoto).toBe(1);
    expect(result.files).toHaveLength(1);
  });
});

describe('runExport — PNG', () => {
  it('zip: one archive, one entry per sheet, at bitmap px = image × M', async () => {
    await setup();
    const plan = basePlan({ format: 'png', zip: true, multiplier: 1 });
    const result = await makeSession().runExport(plan, () => {});

    expect(result.files.map((f) => f.name)).toEqual(['Riverside.zip']);
    const archive = destDir().files.get('Riverside.zip');
    const zip = unzipSync(archive!.data);
    expect(Object.keys(zip).sort()).toEqual([
      'Riverside_01-North wall.png',
      'Riverside_02-East footing.png',
    ]);
    // 400 × 1 = 400, 300 × 1 = 300.
    expect(readPngSize(zip['Riverside_01-North wall.png']!)).toEqual({ width: 400, height: 300 });
  });

  it('no zip: one file per sheet and per-file progress', async () => {
    await setup();
    const plan = basePlan({ format: 'png', zip: false, multiplier: 1 });
    const progress: ExportProgress[] = [];
    const result = await makeSession().runExport(plan, (p) => progress.push(p));

    expect(result.files.map((f) => f.name)).toEqual([
      'Riverside_01-North wall.png',
      'Riverside_02-East footing.png',
    ]);
    expect(progress.map((p) => p.done)).toEqual([1, 2]);
    expect(progress.every((p) => p.total === 2)).toBe(true);
    expect(progress.every((p) => p.currentName === '')).toBe(false);
  });
});

describe('runExport — conflicts against the destination’s real listing', () => {
  it('Add does not overwrite an existing archive', async () => {
    await setup();
    const plan = basePlan({ format: 'png', zip: true, multiplier: 1 });
    const first = await makeSession().runExport(plan, () => {});
    expect(first.files[0]!.name).toBe('Riverside.zip');

    const second = await makeSession().runExport(plan, () => {});
    expect(second.files[0]!.name).toBe('Riverside (1).zip');
    expect(destDir().files.has('Riverside.zip')).toBe(true);
    expect(destDir().files.has('Riverside (1).zip')).toBe(true);
  });

  it('Skip writes nothing and reports the skip honestly — a row + progress (review F4)', async () => {
    await setup();
    await makeSession().runExport(basePlan({ format: 'png', zip: true, multiplier: 1 }), () => {});
    const progress: ExportProgress[] = [];
    const skipped = await makeSession().runExport(
      basePlan({ format: 'png', zip: true, multiplier: 1, conflictPolicy: 'skip' }),
      (p) => progress.push(p),
    );
    // Nothing is written (the existing archive is left in place)…
    expect(destDir().files.size).toBe(1);
    // …but the skip is NOT silent: a row the result view can show, and a progress event.
    expect(skipped.files).toHaveLength(1);
    expect(skipped.files[0]).toMatchObject({ name: 'Riverside.zip', bytes: 0, skipped: true });
    expect(progress.map((p) => p.done)).toEqual([1]);
    expect(progress[0]!.currentName).toBe('Riverside.zip');
  });

  it('a per-sheet skip is reported the same way without zip (review F4)', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    await makeSession().runExport(
      basePlan({ sheetIds: ['a'], format: 'png', zip: false, multiplier: 1 }),
      () => {},
    );
    const skipped = await makeSession().runExport(
      basePlan({ sheetIds: ['a'], format: 'png', zip: false, multiplier: 1, conflictPolicy: 'skip' }),
      () => {},
    );
    expect(skipped.files).toHaveLength(1);
    expect(skipped.files[0]).toMatchObject({
      name: 'Riverside_01-North wall.png',
      bytes: 0,
      skipped: true,
    });
  });

  it('an emptied scope writes NOTHING — never a 22-byte empty archive (review F3)', async () => {
    await setup();
    // Every plan id is gone (deleted in another tab between wizard-open and run).
    const result = await makeSession().runExport(
      basePlan({ sheetIds: ['ghost'], format: 'png', zip: true, multiplier: 1 }),
      () => {},
    );
    // The PDF branch already writes nothing here; the zip branch must mirror it rather
    // than save a valid-but-empty `Riverside.zip` and report it as a success row.
    expect(result.files).toHaveLength(0);
    expect(destDir().files.size).toBe(0);
  });
});

describe('runExport — assets (review F3)', () => {
  it('decodes an inset’s asset from disk before rendering it', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    const assets = new FakeDirHandle('assets');
    assets.files.set('asset-1.jpg', { name: 'asset-1.jpg', data: await jpegBytes('#FF0000') });
    h.assetsDir = assets;
    h.noAssets = false;
    h.markup.set('a', [insetAnnotation('asset-1')]);

    const spy = vi.spyOn(globalThis, 'createImageBitmap');
    const plan = basePlan({ sheetIds: ['a'] });
    const result = await makeSession().runExport(plan, () => {});

    expect(result.files).toHaveLength(1);
    // One decode for `photo.jpg`, one for `assets/asset-1.jpg`. Without the provider the
    // inset would have rendered the `#3A3F46` placeholder and there would be ONE decode.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never closes a bitmap borrowed from the editor session (dispose is scoped to its own decodes)', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    h.markup.set('a', [insetAnnotation('asset-1')]);

    // The session registry already holds a decoded asset — a canvas, so a `close` spy is
    // observable. `runExport` must borrow it, and must NOT close it at the end of the run.
    const borrowed = document.createElement('canvas');
    const borrowedClose = vi.fn();
    (borrowed as unknown as { close: () => void }).close = borrowedClose;
    const decodedClose = vi.spyOn(ImageBitmap.prototype, 'close');

    const plan = basePlan({ sheetIds: ['a'] });
    const result = await makeSession({
      assetProvider: (assetId) =>
        assetId === 'asset-1' ? { image: borrowed, width: 4, height: 4 } : null,
    }).runExport(plan, () => {});

    expect(result.files).toHaveLength(1);
    expect(borrowedClose).not.toHaveBeenCalled();
    // The sheet photo WAS decoded by this run, so its bitmap is closed as normal.
    expect(decodedClose).toHaveBeenCalled();
  });

  /**
   * THE OWED PIXEL PROOF (discharges D106's owed item permanently). The two tests above
   * prove the asset is DECODED and the borrowed bitmap survives; neither samples the
   * exported pixels. This pair does: a red `assets/<id>.jpg` must appear in the inset's
   * region of the exported PNG, and the missing-asset control must be the `#3A3F46`
   * placeholder in the same region. Measured values from the review: asset present
   * [254,0,0,255] (JPEG-lossy near #FF0000), missing [58,63,70,255] (≈ #3A3F46).
   */
  it('an inset exports its PHOTO into the PNG pixels (not the grey placeholder)', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    const assets = new FakeDirHandle('assets');
    assets.files.set('asset-1.jpg', {
      name: 'asset-1.jpg',
      data: await jpegBytes('#FF0000', 100, 100),
    });
    h.assetsDir = assets;
    h.noAssets = false;
    h.markup.set('a', [insetAnnotation('asset-1')]);

    const result = await makeSession().runExport(
      basePlan({ sheetIds: ['a'], format: 'png', zip: true, multiplier: 1 }),
      () => {},
    );
    const archive = destDir().files.get(result.files[0]!.name)!;
    const png = Object.values(unzipSync(archive.data))[0]!;
    const img = await decodeToImageData(png);

    // The inset is 100×100 at the origin, so (50, 50) is its centre.
    const centre = pixelAt(img, 50, 50);
    console.log('INSET CENTRE PIXEL (asset present):', centre);
    expect(centre[0]).toBeGreaterThan(180); // red asset
    expect(centre[1]).toBeLessThan(90);
    expect(centre[2]).toBeLessThan(90);
    // Outside the inset, the white sheet photo is untouched.
    const outside = pixelAt(img, 150, 150);
    expect(outside[0]).toBeGreaterThan(200);
    expect(outside[1]).toBeGreaterThan(200);
    expect(outside[2]).toBeGreaterThan(200);
  });

  it('with NO asset on disk the SAME region is the #3A3F46 placeholder (control)', async () => {
    await setup([{ id: 'a', title: 'North wall' }]);
    // The assets directory is missing (`noAssets = true`), so the provider returns null.
    h.markup.set('a', [insetAnnotation('asset-1')]);

    const result = await makeSession().runExport(
      basePlan({ sheetIds: ['a'], format: 'png', zip: true, multiplier: 1 }),
      () => {},
    );
    const archive = destDir().files.get(result.files[0]!.name)!;
    const png = Object.values(unzipSync(archive.data))[0]!;
    const img = await decodeToImageData(png);

    const centre = pixelAt(img, 50, 50);
    console.log('INSET CENTRE PIXEL (asset MISSING):', centre);
    // #3A3F46 = rgb(58, 63, 70). ±8 per channel absorbs JPEG/PNG round-trip.
    expect(Math.abs(centre[0] - 58)).toBeLessThanOrEqual(8);
    expect(Math.abs(centre[1] - 63)).toBeLessThanOrEqual(8);
    expect(Math.abs(centre[2] - 70)).toBeLessThanOrEqual(8);
  });
});
