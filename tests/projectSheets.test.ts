/**
 * tests/projectSheets.test.ts — the READ-ONLY loader behind the Project screen's sheets
 * grid (UI §11.2; build spec §20.5(a); D88).
 *
 * The loader is I/O-bound, so the File System Access APIs are faked with the in-memory tree
 * from `tests/fakes/fsa.ts` (no dependency is added). Asserted here: `sortIndex` order,
 * 1-based index, a missing `thumb.jpg` → `null` (never a throw), counts derived from the
 * REAL `markup.json`, and a sheet-less project → `[]`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { listProjectSheets, clockLabel } from '../src/fs/projectSheets';
import { initStore, registerOpenProject } from '../src/fs/projectStore';
import { DEFAULT_STYLE } from '../src/domain/types';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
});

/** A local-clock ISO so `clockLabel` (local-time based) is deterministic in the test. */
function localIso(h: number, m: number): string {
  return new Date(2026, 8, 21, h, m, 0, 0).toISOString();
}

function projectFileWith(
  sheets: Array<{ id: string; title: string; sortIndex: number; updatedAt: string; deletedAt?: string }>,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    project: {
      id: 'p1',
      title: 'Riverside',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: sheets.map((s) => ({
      id: s.id,
      title: s.title,
      sortIndex: s.sortIndex,
      imageWidth: 4096,
      imageHeight: 3072,
      calibrationPxPerFoot: null,
      createdAt: s.updatedAt,
      updatedAt: s.updatedAt,
      ...(s.deletedAt ? { deletedAt: s.deletedAt } : {}),
    })),
  });
}

function markupWith(sheetId: string, objects: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, sheetId, objects });
}

const dimension = (id: string) => ({
  id,
  type: 'dimension',
  geometry: { kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
  valueMm: 100,
  style: DEFAULT_STYLE,
  zIndex: 0,
  source: 'manual',
  locked: false,
});

const inset = (id: string) => ({
  id,
  type: 'image',
  geometry: { kind: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
  style: DEFAULT_STYLE,
  zIndex: 1,
  source: 'manual',
  locked: false,
});

async function openProject(root: FakeDir, id = 'p1', folder = 'Riverside'): Promise<void> {
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  registerOpenProject(id, folder);
}

describe('listProjectSheets — read-only model (UI §11.2)', () => {
  it('returns sheets in sortIndex order with a 1-based index', async () => {
    const root = new FakeDir('root');
    // Deliberately out of order on disk: sheet-b sorts after sheet-a.
    root.putFile(
      'Riverside/project.json',
      projectFileWith([
        { id: 'sheet-b', title: 'Sheet 02', sortIndex: 20, updatedAt: localIso(14, 20) },
        { id: 'sheet-a', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(14, 14) },
      ]),
    );
    root.putFile('Riverside/sheets/sheet-a/markup.json', markupWith('sheet-a', []));
    root.putFile('Riverside/sheets/sheet-b/markup.json', markupWith('sheet-b', []));
    await openProject(root);

    const cards = await listProjectSheets('p1');

    expect(cards.map((c) => c.id)).toEqual(['sheet-a', 'sheet-b']);
    expect(cards.map((c) => c.index)).toEqual([1, 2]);
    expect(cards.map((c) => c.title)).toEqual(['Sheet 01', 'Sheet 02']);
    expect(cards[0].updatedAtLabel).toBe('2:14 PM');
  });

  it('yields thumb = null when thumb.jpg is missing, and a Blob when it exists', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      projectFileWith([
        { id: 'no-thumb', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(14, 14) },
        { id: 'has-thumb', title: 'Sheet 02', sortIndex: 20, updatedAt: localIso(14, 20) },
      ]),
    );
    root.putFile('Riverside/sheets/no-thumb/markup.json', markupWith('no-thumb', []));
    root.putFile('Riverside/sheets/has-thumb/markup.json', markupWith('has-thumb', []));
    root.putFile('Riverside/sheets/has-thumb/thumb.jpg', 'JPEGBYTES');
    await openProject(root);

    const cards = await listProjectSheets('p1');

    expect(cards[0].thumb).toBeNull();
    expect(cards[1].thumb).toBeInstanceOf(Blob);
    expect(cards[1].thumb?.size).toBe('JPEGBYTES'.length);
  });

  it('treats a zero-byte thumb.jpg as missing (null), not an empty image', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      projectFileWith([{ id: 'empty', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(9, 5) }]),
    );
    root.putFile('Riverside/sheets/empty/markup.json', markupWith('empty', []));
    root.putFile('Riverside/sheets/empty/thumb.jpg', '');
    await openProject(root);

    const cards = await listProjectSheets('p1');
    expect(cards[0].thumb).toBeNull();
  });

  it('derives dimensionCount and insetCount from the real markup.json', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      projectFileWith([
        { id: 'mixed', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(14, 14) },
        { id: 'empty', title: 'Sheet 02', sortIndex: 20, updatedAt: localIso(14, 20) },
      ]),
    );
    root.putFile(
      'Riverside/sheets/mixed/markup.json',
      markupWith('mixed', [dimension('d1'), inset('i1'), dimension('d2'), inset('i2'), dimishOther()]),
    );
    // `empty`'s directory exists but has NO markup.json — the onMissing path, not a parse of `[]`.
    root.mkdir('Riverside/sheets/empty');
    await openProject(root);

    const cards = await listProjectSheets('p1');

    expect(cards[0].dimensionCount).toBe(2);
    expect(cards[0].insetCount).toBe(2);
    // A brand-new sheet with no markup.json at all lists with honest zero counts.
    expect(cards[1].dimensionCount).toBe(0);
    expect(cards[1].insetCount).toBe(0);
  });

  it('returns [] for a project that has no sheets', async () => {
    const root = new FakeDir('root');
    root.putFile('Riverside/project.json', projectFileWith([]));
    await openProject(root);

    expect(await listProjectSheets('p1')).toEqual([]);
  });

  it('tolerates a project.json entry whose sheet folder is gone (lists it, empty counts)', async () => {
    const root = new FakeDir('root');
    // The entry exists but `sheets/orphan/` was never created — an orphan entry must not
    // take the whole grid down with it.
    root.putFile(
      'Riverside/project.json',
      projectFileWith([{ id: 'orphan', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(14, 14) }]),
    );
    await openProject(root);

    const cards = await listProjectSheets('p1');
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('orphan');
    expect(cards[0].dimensionCount).toBe(0);
    expect(cards[0].insetCount).toBe(0);
    expect(cards[0].thumb).toBeNull();
  });

  it('excludes trashed sheets and re-bases the index over the live list', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      projectFileWith([
        { id: 'gone', title: 'Sheet 01', sortIndex: 10, updatedAt: localIso(14, 10), deletedAt: localIso(15, 0) },
        { id: 'kept', title: 'Sheet 02', sortIndex: 20, updatedAt: localIso(14, 20) },
      ]),
    );
    root.putFile('Riverside/sheets/kept/markup.json', markupWith('kept', []));
    await openProject(root);

    const cards = await listProjectSheets('p1');
    expect(cards.map((c) => c.id)).toEqual(['kept']);
    expect(cards[0].index).toBe(1);
    expect(cards[0].title).toBe('Sheet 02');
  });
});

describe('clockLabel', () => {
  it('formats a local time as h:mm AM/PM with no leading hour zero', () => {
    expect(clockLabel(localIso(14, 14))).toBe('2:14 PM');
    expect(clockLabel(localIso(9, 5))).toBe('9:05 AM');
    expect(clockLabel(localIso(0, 0))).toBe('12:00 AM');
    expect(clockLabel(localIso(12, 30))).toBe('12:30 PM');
  });

  it('returns an empty label for an unparseable date', () => {
    expect(clockLabel('not-a-date')).toBe('');
  });
});

/** A non-dimension, non-image object — proves the counts filter by type. */
function dimishOther() {
  return {
    id: 'line-1',
    type: 'line',
    geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 5, y: 5 } },
    style: DEFAULT_STYLE,
    zIndex: 2,
    source: 'manual',
    locked: false,
  };
}
