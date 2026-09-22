/**
 * tests/sheetOps.test.ts — the STORAGE half of the Project screen's remaining card
 * actions (D111; build spec §20.6:2584; UI spec §11.2:720): reorder (`sortIndex`),
 * rename, duplicate, and the constrained replace-photo.
 *
 * The module is data-critical and mirrors `src/fs/sheetTrash.ts` (copy → verify →
 * only then mutate the ledger; atomic writes only; the D51 `${id}:${folderName}` key),
 * so these tests execute the real copy/verify/write path against the in-memory File
 * System Access fake (`tests/fakes/fsa.ts`) and pin:
 *   - `nextSortIndex` — 10 with no live rows, `max(live) + 10`, trashed rows ignored;
 *   - `reorderSheetRows` — `10 × (position + 1)`, rejects any non-permutation, pure,
 *     trashed rows untouched, and the grid's own reader sees the new order;
 *   - `renameSheet` — trimmed title persisted, blanks/unknown/trashed rejected, the
 *     folder unchanged, `updatedAt` untouched, no `*.tmp` survivors;
 *   - `duplicateSheet` — byte-for-byte folder copy, new id, `max+10`, source intact,
 *     cleanup on a failed copy;
 *   - `replaceSheetPhoto` — new bytes + dims/`updatedAt`, stale thumb gone, the
 *     `'keep'`/`'remove'` markup choice, and a failed verification leaving
 *     `project.json` byte-identical.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  duplicateSheet,
  nextSortIndex,
  renameSheet,
  reorderSheetRows,
  replaceSheetPhoto,
} from '../src/fs/sheetOps';
import { listProjectSheets } from '../src/fs/projectSheets';
import { initStore, registerOpenProject } from '../src/fs/projectStore';
import { DEFAULT_STYLE } from '../src/domain/types';
import { parseMarkupFile, parseProjectFile, type ProjectFile } from '../src/domain/schema';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  type FakeHooks,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
});

/** D51 runtime key — `${id}:${folderName}`, the same key the app registers. */
const PROJECT_KEY = 'p1:Riverside';
const FOLDER = 'Riverside';
const T0 = new Date('2026-09-22T12:00:00.000Z');

function sheetRow(
  id: string,
  title: string,
  sortIndex: number,
  deletedAt?: string,
): Record<string, unknown> {
  return {
    id,
    title,
    sortIndex,
    imageWidth: 4096,
    imageHeight: 3072,
    calibrationPxPerFoot: null,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    ...(deletedAt ? { deletedAt } : {}),
  };
}

function projectJson(sheets: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    schemaVersion: 1,
    project: {
      id: 'p1',
      title: 'Riverside',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets,
  });
}

/** Parse a fixture and narrow the zod union once. */
function parsedProject(sheets: Array<Record<string, unknown>>): ProjectFile {
  const parsed = parseProjectFile(projectJson(sheets));
  if (!parsed.success) throw new Error(`fixture project.json failed to parse: ${parsed.error}`);
  return parsed.data;
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

function markupWith(sheetId: string, objects: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, sheetId, objects });
}

/** Write a full sheet folder: photo, thumb, markup (1 dimension), plus extra files. */
function putSheet(root: FakeDir, id: string): void {
  const base = `${FOLDER}/sheets/${id}`;
  root.putFile(`${base}/photo.jpg`, `PHOTO-${id}`);
  root.putFile(`${base}/thumb.jpg`, `THUMB-${id}`);
  root.putFile(`${base}/markup.json`, markupWith(id, [dimension('d1')]));
  root.putFile(`${base}/meta.json`, JSON.stringify({ capturedAt: T0.toISOString() }));
}

async function openProject(root: FakeDir): Promise<void> {
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  registerOpenProject(PROJECT_KEY, FOLDER);
}

/** `project.json` row lookup in a test — never inferred from a re-read of the type. */
function rowFor(root: FakeDir, id: string): Record<string, unknown> {
  const parsed = parseProjectFile(root.textAt(`${FOLDER}/project.json`));
  if (!parsed.success) throw new Error('fixture project.json failed to parse');
  const row = parsed.data.sheets.find((s) => s.id === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row as unknown as Record<string, unknown>;
}

function sheetDirNames(root: FakeDir): string[] {
  return [...root.childDir(`${FOLDER}/sheets`).children.keys()].sort();
}

describe('nextSortIndex — §20.6 gaps of 10', () => {
  it('returns 10 when there are no sheets at all', () => {
    // No live rows → max is defined as 0 → 0 + 10 = 10 (10 × (position + 1) for position 0).
    expect(nextSortIndex(parsedProject([]).sheets)).toBe(10);
  });

  it('returns max(live) + 10', () => {
    // Live rows at 10 and 20 → max 20 → 20 + 10 = 30.
    const sheets = parsedProject([
      sheetRow('a', 'Sheet 01', 10),
      sheetRow('b', 'Sheet 02', 20),
    ]).sheets;
    expect(nextSortIndex(sheets)).toBe(30);
  });

  it('ignores a trashed row even when it holds the highest index', () => {
    // Live max is 10; the trashed row's 50 must NOT count → 10 + 10 = 20.
    const sheets = parsedProject([
      sheetRow('a', 'Sheet 01', 10),
      sheetRow('gone', 'Sheet 02', 50, T0.toISOString()),
    ]).sheets;
    expect(nextSortIndex(sheets)).toBe(20);
  });

  it('ignores trashed rows when there are no live rows left', () => {
    const sheets = parsedProject([sheetRow('gone', 'Sheet 01', 90, T0.toISOString())]).sheets;
    expect(nextSortIndex(sheets)).toBe(10);
  });
});

describe('reorderSheetRows — 10 × (position + 1), pure', () => {
  const threeLive = () =>
    parsedProject([
      sheetRow('a', 'Sheet 01', 10),
      sheetRow('b', 'Sheet 02', 20),
      sheetRow('c', 'Sheet 03', 30),
    ]);

  it('renumbers a 3-of-3 permutation to 10 / 20 / 30 in the new order', () => {
    const file = threeLive();
    const next = reorderSheetRows(file, ['c', 'a', 'b']);

    const byId = Object.fromEntries(next.sheets.map((s) => [s.id, s.sortIndex]));
    expect(byId).toEqual({ c: 10, a: 20, b: 30 });
    // Returned file is a NEW object; the input is untouched.
    expect(next).not.toBe(file);
    expect(Object.fromEntries(file.sheets.map((s) => [s.id, s.sortIndex]))).toEqual({
      a: 10,
      b: 20,
      c: 30,
    });
  });

  it('the grid’s own reader lists the sheets in the reordered order', async () => {
    const file = threeLive();
    const next = reorderSheetRows(file, ['c', 'a', 'b']);
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, JSON.stringify(next));
    await openProject(root);

    const cards = await listProjectSheets(PROJECT_KEY);
    expect(cards.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    // 1-based positions re-derived by the loader, not stored.
    expect(cards.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('throws on a missing id (partial list)', () => {
    // 2 ids for 3 live sheets — a subset would renumber only part of the file.
    expect(() => reorderSheetRows(threeLive(), ['a', 'b'])).toThrow(/expected 3 live ids/);
  });

  it('throws on an unknown id', () => {
    expect(() => reorderSheetRows(threeLive(), ['a', 'b', 'z'])).toThrow(/not a live sheet id/);
  });

  it('throws when a trashed id is offered in place of a live one', () => {
    // Live: a, b. Trashed: c. Length matches (2) but `c` is not live.
    const file = parsedProject([
      sheetRow('a', 'Sheet 01', 10),
      sheetRow('b', 'Sheet 02', 20),
      sheetRow('c', 'Sheet 03', 30, T0.toISOString()),
    ]);
    expect(() => reorderSheetRows(file, ['a', 'c'])).toThrow(/not a live sheet id/);
  });

  it('throws on a duplicate id', () => {
    expect(() => reorderSheetRows(threeLive(), ['a', 'a', 'b'])).toThrow(/more than once/);
  });

  it('keeps trashed rows’ sortIndex untouched while renumbering live rows', () => {
    const file = parsedProject([
      sheetRow('a', 'Sheet 01', 10),
      sheetRow('b', 'Sheet 02', 20),
      sheetRow('gone', 'Sheet 03', 99, T0.toISOString()),
    ]);
    const next = reorderSheetRows(file, ['b', 'a']);
    const byId = Object.fromEntries(next.sheets.map((s) => [s.id, s.sortIndex]));
    expect(byId).toEqual({ b: 10, a: 20, gone: 99 });
  });
});

describe('renameSheet — title only, trimmed, never the folder', () => {
  function renameFixture(): FakeDir {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 10)]));
    putSheet(root, 'sheet-1');
    return root;
  }

  it('persists the TRIMMED title, leaves the folder and updatedAt alone, and parses', async () => {
    const root = renameFixture();
    await openProject(root);

    await renameSheet(PROJECT_KEY, 'sheet-1', '  Kitchen  ');

    expect(rowFor(root, 'sheet-1').title).toBe('Kitchen');
    // `updatedAt` is the sheet's CONTENT time — a rename must not claim a content change.
    expect(rowFor(root, 'sheet-1').updatedAt).toBe(T0.toISOString());
    // The on-disk folder is `sheets/<id>/`, never the title (§20.6:2588).
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(true);
    expect(sheetDirNames(root)).toEqual(['sheet-1']);
    // Still a valid ProjectFile, and no `*.tmp` survived the atomic write.
    expect(parseProjectFile(root.textAt(`${FOLDER}/project.json`)).success).toBe(true);
    expect(root.tmpPaths()).toEqual([]);
  });

  it('rejects an empty title', async () => {
    const root = renameFixture();
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(renameSheet(PROJECT_KEY, 'sheet-1', '')).rejects.toThrow(/title is empty/);

    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
  });

  it('rejects a whitespace-only title', async () => {
    const root = renameFixture();
    await openProject(root);
    await expect(renameSheet(PROJECT_KEY, 'sheet-1', '   ')).rejects.toThrow(/title is empty/);
    expect(rowFor(root, 'sheet-1').title).toBe('Sheet 01');
  });

  it('rejects an unknown id and leaves the file byte-identical', async () => {
    const root = renameFixture();
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(renameSheet(PROJECT_KEY, 'nope', 'Kitchen')).rejects.toThrow(
      /not found in project\.json/,
    );

    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
  });

  it('rejects a trashed sheet (a deleted sheet is not renameable)', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([sheetRow('sheet-1', 'Sheet 01', 10, T0.toISOString())]),
    );
    await openProject(root);

    await expect(renameSheet(PROJECT_KEY, 'sheet-1', 'Kitchen')).rejects.toThrow(/is deleted/);
    expect(rowFor(root, 'sheet-1').title).toBe('Sheet 01');
  });
});

describe('duplicateSheet — copy → verify → append (the §20.2 create rule)', () => {
  function duplicateFixture(hooks: FakeHooks = {}): FakeDir {
    const root = new FakeDir('root', hooks);
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 10)]));
    putSheet(root, 'sheet-1');
    return root;
  }

  it('mints a new id, copies the folder byte-for-byte, and appends at max+10', async () => {
    const root = duplicateFixture();
    await openProject(root);
    const sourceBytes = new Map(
      ['photo.jpg', 'thumb.jpg', 'markup.json', 'meta.json'].map((name) => [
        name,
        root.textAt(`${FOLDER}/sheets/sheet-1/${name}`),
      ]),
    );

    const { id } = await duplicateSheet(PROJECT_KEY, 'sheet-1', 'Sheet 01 copy');

    expect(id).not.toBe('sheet-1');
    // The copy carries every file byte-for-byte (copy → per-file size verify).
    for (const [name, bytes] of sourceBytes) {
      expect(root.textAt(`${FOLDER}/sheets/${id}/${name}`)).toBe(bytes);
    }
    // `markup.json` is still a valid envelope.
    const markup = parseMarkupFile(root.textAt(`${FOLDER}/sheets/${id}/markup.json`));
    expect(markup.success).toBe(true);
    expect(markup.success && markup.data.objects).toHaveLength(1);

    // New row: copied dims, max(live)+10 = 10+10 = 20, no deletedAt, fresh times.
    const row = rowFor(root, id);
    expect(row).toMatchObject({
      id,
      title: 'Sheet 01 copy',
      sortIndex: 20,
      imageWidth: 4096,
      imageHeight: 3072,
    });
    expect(row.deletedAt).toBeUndefined();
    expect(row.createdAt).not.toBe(T0.toISOString());

    // Both rows present; the source is untouched.
    const parsed = parseProjectFile(root.textAt(`${FOLDER}/project.json`));
    expect(parsed.success && parsed.data.sheets.map((s) => s.id).sort()).toEqual(
      ['sheet-1', id].sort(),
    );
    expect(rowFor(root, 'sheet-1')).toMatchObject({ title: 'Sheet 01', sortIndex: 10 });
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    // The grid shows both, source first.
    expect((await listProjectSheets(PROJECT_KEY)).map((c) => c.id)).toEqual(['sheet-1', id]);
    expect(root.tmpPaths()).toEqual([]);
  });

  it('a failed copy leaves the source untouched, cleans its own folder, and writes no row', async () => {
    const hooks: FakeHooks = {
      beforeWrite: (f) => {
        // Fail only the NEW sheet folder's writes — `sheets/sheet-1/` is the source.
        if (f.path.includes('/sheets/') && !f.path.includes('/sheets/sheet-1/')) {
          throw new Error('simulated copy failure');
        }
      },
    };
    const root = duplicateFixture(hooks);
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(duplicateSheet(PROJECT_KEY, 'sheet-1', 'Sheet 01 copy')).rejects.toThrow();

    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    // The half-created destination folder was removed; only the source remains.
    expect(sheetDirNames(root)).toEqual(['sheet-1']);
  });

  it('rejects a trashed source', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([sheetRow('sheet-1', 'Sheet 01', 10, T0.toISOString())]),
    );
    await openProject(root);
    await expect(duplicateSheet(PROJECT_KEY, 'sheet-1', 'Copy')).rejects.toThrow(/is deleted/);
  });
});

describe('replaceSheetPhoto — the §11.2:720 constrained replace', () => {
  function replaceFixture(hooks: FakeHooks = {}): FakeDir {
    const root = new FakeDir('root', hooks);
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 10)]));
    putSheet(root, 'sheet-1');
    return root;
  }

  const NEW_PHOTO = {
    blob: new Blob(['NEW-PHOTO-BYTES']), // 16 chars
    width: 2048,
    height: 1536,
  };

  it('writes the new bytes, updates dims + updatedAt, and drops the stale thumb (keep)', async () => {
    const root = replaceFixture();
    await openProject(root);

    await replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'keep');

    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('NEW-PHOTO-BYTES');
    const row = rowFor(root, 'sheet-1');
    expect(row).toMatchObject({ imageWidth: 2048, imageHeight: 1536 });
    expect(row.updatedAt).not.toBe(T0.toISOString());
    // The cached composite is of the OLD photo — it must not survive.
    expect(root.has(`${FOLDER}/sheets/sheet-1/thumb.jpg`)).toBe(false);
    // `'keep'` leaves the markup exactly as it was (still 1 dimension).
    const markup = parseMarkupFile(root.textAt(`${FOLDER}/sheets/sheet-1/markup.json`));
    expect(markup.success && markup.data.objects).toHaveLength(1);
    expect(root.tmpPaths()).toEqual([]);
  });

  it("'remove' empties markup.json.objects (schemaVersion + sheetId preserved)", async () => {
    const root = replaceFixture();
    await openProject(root);

    await replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'remove');

    const markup = parseMarkupFile(root.textAt(`${FOLDER}/sheets/sheet-1/markup.json`));
    expect(markup.success).toBe(true);
    expect(markup.success && markup.data).toMatchObject({ schemaVersion: 1, sheetId: 'sheet-1' });
    expect(markup.success && markup.data.objects).toEqual([]);
  });

  it('a verification failure rolls the photo back and leaves project.json byte-identical', async () => {
    // Corrupt the photo AT RENAME TIME: `beforeMove(file, name)` fires with the tmp file
    // and the TARGET name, so mutating the tmp's bytes when the target is `photo.jpg`
    // lands a wrong-sized photo.jpg — the partial-write case verification must catch.
    let first = true;
    const root = replaceFixture({
      beforeMove: (file, name) => {
        // Only the FIRST write of the target is corrupted; the rollback write that follows
        // must land intact or the test would be measuring its own hook, not the code.
        if (name === 'photo.jpg' && first) {
          first = false;
          file.content = 'short'; // 5 chars vs the blob's 16
        }
      },
    });
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'keep')).rejects.toThrow(
      /verification failed/,
    );

    // The ledger was never touched: the row still describes the old dims and time.
    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    expect(rowFor(root, 'sheet-1')).toMatchObject({
      imageWidth: 4096,
      imageHeight: 3072,
      updatedAt: T0.toISOString(),
    });
    // The unverified bytes were replaced by the photo they were meant to replace, so the
    // bytes on disk and the row's dimensions can never describe two different pictures.
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    // The stale composite was dropped first (step 2), so the card shows the honest
    // placeholder rather than a composite of a photo the sheet no longer has.
    expect(root.has(`${FOLDER}/sheets/sheet-1/thumb.jpg`)).toBe(false);
  });

  it('an unremovable thumb aborts the replace before anything the user can see changes', async () => {
    // A directory in `thumb.jpg`'s place is the fake's way to make `removeEntry` fail with
    // something other than NotFoundError (the locked-file case in the field). We cannot
    // guarantee the card stops showing the OLD photo, so the replace must not proceed:
    // a card advertising the previous picture under a new sheet is exactly the lie D110
    // and D114 were.
    const root = replaceFixture();
    const sheetDir = root.childDir(`${FOLDER}/sheets/sheet-1`);
    await sheetDir.removeEntry('thumb.jpg');
    root.mkdir(`${FOLDER}/sheets/sheet-1/thumb.jpg`);
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'keep')).rejects.toThrow();

    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    expect(rowFor(root, 'sheet-1')).toMatchObject({ imageWidth: 4096, imageHeight: 3072 });
  });

  it('a failed project.json rename rolls the photo back (locked-target case)', async () => {
    // The D114/F2 case, retargeted at this write: the photo replace succeeds and
    // verifies, then the atomic `project.json` rename fails (another app / lock). The row
    // still describes the previous photo, so the photo must be restored with it — a new
    // photo under the old dimensions is a wrong-measurement state, not just an untidy one.
    let locked = true;
    const root = replaceFixture({
      beforeMove: (_file, name) => {
        if (locked && name === 'project.json') {
          throw new DOMException('locked by another app', 'NoModificationAllowedError');
        }
      },
    });
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'keep')).rejects.toThrow();

    // Rolled back: the sheet is exactly as it was, minus the cache (rebuilt on the next save).
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    expect(rowFor(root, 'sheet-1')).toMatchObject({ imageWidth: 4096, imageHeight: 3072 });
    expect(root.has(`${FOLDER}/sheets/sheet-1/thumb.jpg`)).toBe(false);
  });

  it('rejects an unknown or trashed sheet', async () => {
    const root = replaceFixture();
    await openProject(root);
    await expect(replaceSheetPhoto(PROJECT_KEY, 'nope', NEW_PHOTO, 'keep')).rejects.toThrow(
      /not found in project\.json/,
    );

    const trashedRoot = new FakeDir('root');
    trashedRoot.putFile(
      `${FOLDER}/project.json`,
      projectJson([sheetRow('sheet-1', 'Sheet 01', 10, T0.toISOString())]),
    );
    await openProject(trashedRoot);
    await expect(
      replaceSheetPhoto(PROJECT_KEY, 'sheet-1', NEW_PHOTO, 'keep'),
    ).rejects.toThrow(/is deleted/);
  });
});
