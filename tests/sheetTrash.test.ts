/**
 * tests/sheetTrash.test.ts — the STORAGE half of sheet trash (UI §13.3 line 800; build spec
 * §11.9 line 2029; plan slice 1.10 build-order item 2): delete a sheet into
 * `<project>/.trash/`, restore it, and the 14-day prune that runs on project open.
 *
 * A sheet is a measurement record, so these tests execute the real copy/verify/remove path
 * against the in-memory File System Access fake (`tests/fakes/fsa.ts`) and pin:
 *   - delete → folder gone from `sheets/`, present under `.trash/` with identical bytes,
 *     the row carries `deletedAt`, and `listProjectSheets` no longer lists it;
 *   - restore → identical bytes back, `deletedAt` cleared, the grid lists it with markup;
 *   - the plan gate: delete → 13-day clock → prune (kept) → restore returns the markup;
 *   - prune → 13-day survives, exactly-14-day survives (pinned boundary), 15-day removed,
 *     nothing else touched; a `*.tmp` in `.trash/` is never reaped;
 *   - failure paths: a copy failure leaves the original and the row untouched; a missing
 *     trash copy makes restore throw honestly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
  deleteSheet,
  listTrash,
  pruneTrash,
  restoreSheet,
} from '../src/fs/sheetTrash';
import { listProjectSheets } from '../src/fs/projectSheets';
import { cleanStaleTmp, initStore, registerOpenProject } from '../src/fs/projectStore';
import { DEFAULT_STYLE } from '../src/domain/types';
import { parseProjectFile } from '../src/domain/schema';
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
/** 24 × 60 × 60 × 1000 = 86_400_000. */
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Write a full sheet folder: photo, thumb, markup (1 dimension), meta, and an extra file. */
function putSheet(root: FakeDir, id: string): void {
  const base = `${FOLDER}/sheets/${id}`;
  root.putFile(`${base}/photo.jpg`, `PHOTO-${id}`);
  root.putFile(`${base}/thumb.jpg`, `THUMB-${id}`);
  root.putFile(`${base}/markup.json`, markupWith(id, [dimension('d1')]));
  root.putFile(`${base}/meta.json`, JSON.stringify({ capturedAt: T0.toISOString() }));
  root.putFile(`${base}/notes.txt`, `notes-${id}`);
}

async function openProject(root: FakeDir): Promise<void> {
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  registerOpenProject(PROJECT_KEY, FOLDER);
}

/** `project.json` row lookup in a test — never infer from a re-read of the type. */
function rowFor(root: FakeDir, id: string): Record<string, unknown> {
  const parsed = parseProjectFile(root.textAt(`${FOLDER}/project.json`));
  if (!parsed.success) throw new Error('fixture project.json failed to parse');
  const row = parsed.data.sheets.find((s) => s.id === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row as unknown as Record<string, unknown>;
}

function hasTrashFolder(root: FakeDir, id: string): boolean {
  return root.has(`${FOLDER}/.trash/${id}/photo.jpg`);
}

describe('deleteSheet — copy → verify → remove → mark (UI §13.3)', () => {
  it('moves the folder to .trash, marks deletedAt, and the grid stops listing it', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    // Original folder gone; trash folder holds the identical bytes.
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(false);
    expect(hasTrashFolder(root, 'sheet-1')).toBe(true);
    expect(root.textAt(`${FOLDER}/.trash/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    // Row carries the injected timestamp verbatim.
    expect(rowFor(root, 'sheet-1').deletedAt).toBe(T0.toISOString());
    // The grid excludes it.
    expect(await listProjectSheets(PROJECT_KEY)).toEqual([]);
    // No *.tmp survivor from the atomic copy.
    expect(root.tmpPaths()).toEqual([]);
  });

  it('copies every file present, byte-for-byte', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);
    // Snapshot the source bytes BEFORE the move (afterwards the source is gone).
    const sourceBytes = new Map(
      ['photo.jpg', 'thumb.jpg', 'meta.json', 'notes.txt', 'markup.json'].map((name) => [
        name,
        root.textAt(`${FOLDER}/sheets/sheet-1/${name}`),
      ]),
    );

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    for (const [name, bytes] of sourceBytes) {
      expect(root.textAt(`${FOLDER}/.trash/sheet-1/${name}`)).toBe(bytes);
    }
  });

  it('tolerates a sheet whose folder is already missing: mark the row, copy nothing', async () => {
    const root = new FakeDir('root');
    // The row exists but `sheets/sheet-1/` was never created.
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    await openProject(root);

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    expect(rowFor(root, 'sheet-1').deletedAt).toBe(T0.toISOString());
    expect(root.has(`${FOLDER}/.trash/sheet-1/photo.jpg`)).toBe(false);
    // It still lists in the trash (thumb null — nothing to read).
    const trash = await listTrash(PROJECT_KEY, T0);
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ id: 'sheet-1', thumb: null, daysLeft: 14 });
  });

  it('throws for an id that is not in project.json and changes nothing', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(deleteSheet(PROJECT_KEY, 'nope', T0)).rejects.toThrow(/not found in project\.json/);

    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(true);
  });

  it('a second delete is an idempotent no-op (the trash copy and the row are unchanged)', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);
    const afterFirst = root.textAt(`${FOLDER}/project.json`);

    await expect(deleteSheet(PROJECT_KEY, 'sheet-1', new Date(T0.getTime() + DAY_MS))).resolves.toBeUndefined();

    expect(root.textAt(`${FOLDER}/project.json`)).toBe(afterFirst);
    expect(root.textAt(`${FOLDER}/.trash/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
  });

  it('a failed copy leaves the original and the row untouched and cleans its partial copy', async () => {
    const hooks: FakeHooks = {
      beforeWrite: (f) => {
        if (f.path.includes('/.trash/')) throw new Error('simulated copy failure');
      },
    };
    const root = new FakeDir('root', hooks);
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);
    const before = root.textAt(`${FOLDER}/project.json`);

    await expect(deleteSheet(PROJECT_KEY, 'sheet-1', T0)).rejects.toThrow();

    // Original intact, row unchanged, and no half-copied trash entry was left behind.
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/project.json`)).toBe(before);
    expect(root.has(`${FOLDER}/.trash/sheet-1/photo.jpg`)).toBe(false);
  });

  it('never touches .history/, assets/, or a *.tmp in .trash/', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    root.putFile(`${FOLDER}/.history/sheet-1/123-markup.json`, 'SNAPSHOT');
    root.putFile(`${FOLDER}/assets/deadbeef.jpg`, 'ASSET');
    root.putFile(`${FOLDER}/.trash/loose.tmp`, 'STRAY');
    await openProject(root);

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    expect(root.textAt(`${FOLDER}/.history/sheet-1/123-markup.json`)).toBe('SNAPSHOT');
    expect(root.textAt(`${FOLDER}/assets/deadbeef.jpg`)).toBe('ASSET');
    expect(root.textAt(`${FOLDER}/.trash/loose.tmp`)).toBe('STRAY');
  });
});

describe('restoreSheet — copy back → clear the row → drop the trash copy', () => {
  it('brings the folder back with identical bytes, clears deletedAt, and the grid shows the markup', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);
    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    await restoreSheet(PROJECT_KEY, 'sheet-1');

    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/thumb.jpg`)).toBe('THUMB-sheet-1');
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/markup.json`)).toBe(
      markupWith('sheet-1', [dimension('d1')]),
    );
    expect(rowFor(root, 'sheet-1').deletedAt).toBeNull();
    // Trash copy consumed.
    expect(root.has(`${FOLDER}/.trash/sheet-1/photo.jpg`)).toBe(false);
    // Back in the grid, with its markup.
    const cards = await listProjectSheets(PROJECT_KEY);
    expect(cards).toHaveLength(1);
    expect(cards[0].dimensionCount).toBe(1);
    expect(root.tmpPaths()).toEqual([]);
  });

  it('the plan gate: delete → 13-day clock → prune (kept) → restore returns it with markup', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);

    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);
    // 13 days later the entry is still inside its 14-day window.
    const plus13 = new Date(T0.getTime() + 13 * DAY_MS);
    expect(await pruneTrash(PROJECT_KEY, plus13)).toEqual([]);
    expect(hasTrashFolder(root, 'sheet-1')).toBe(true);

    await restoreSheet(PROJECT_KEY, 'sheet-1');

    const cards = await listProjectSheets(PROJECT_KEY);
    expect(cards).toHaveLength(1);
    expect(cards[0].dimensionCount).toBe(1);
    expect(cards[0].thumb).toBeInstanceOf(Blob);
  });

  it('throws honestly when the trash copy is missing and does not clear the row', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([sheetRow('sheet-1', 'Sheet 01', 0, T0.toISOString())]),
    );
    // No `.trash/sheet-1/` at all.
    await openProject(root);

    await expect(restoreSheet(PROJECT_KEY, 'sheet-1')).rejects.toThrow(/trash copy is missing/);

    expect(rowFor(root, 'sheet-1').deletedAt).toBe(T0.toISOString());
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(false);
  });

  it('is a no-op for a live sheet (a double restore must not throw)', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    await openProject(root);

    await expect(restoreSheet(PROJECT_KEY, 'sheet-1')).resolves.toBeUndefined();
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(true);
  });

  it('never touches .history/ or a *.tmp in .trash/', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('sheet-1', 'Sheet 01', 0)]));
    putSheet(root, 'sheet-1');
    root.putFile(`${FOLDER}/.history/sheet-1/123-markup.json`, 'SNAPSHOT');
    root.putFile(`${FOLDER}/.trash/loose.tmp`, 'STRAY');
    await openProject(root);
    await deleteSheet(PROJECT_KEY, 'sheet-1', T0);

    await restoreSheet(PROJECT_KEY, 'sheet-1');

    expect(root.textAt(`${FOLDER}/.history/sheet-1/123-markup.json`)).toBe('SNAPSHOT');
    expect(root.textAt(`${FOLDER}/.trash/loose.tmp`)).toBe('STRAY');
  });
});

describe('listTrash — the restore UI model (build spec line 2029)', () => {
  it('lists trashed rows with title, deletedAt, daysLeft and the thumb blob', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([
        sheetRow('sheet-1', 'Sheet 01', 0, T0.toISOString()),
        sheetRow('sheet-2', 'Sheet 02', 1),
      ]),
    );
    root.putFile(`${FOLDER}/.trash/sheet-1/thumb.jpg`, 'TRASHED-THUMB');
    await openProject(root);

    const trash = await listTrash(PROJECT_KEY, T0);

    expect(trash).toHaveLength(1); // only rows with deletedAt
    expect(trash[0].id).toBe('sheet-1');
    expect(trash[0].title).toBe('Sheet 01');
    expect(trash[0].deletedAt).toBe(T0.toISOString());
    expect(trash[0].daysLeft).toBe(TRASH_RETENTION_DAYS); // just deleted → 14 whole days
    expect(trash[0].thumb?.size).toBe('TRASHED-THUMB'.length);
  });

  it('daysLeft is 0 at the 14-day boundary and clamps for older entries', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([
        sheetRow('edge', 'Edge', 0, new Date(T0.getTime() - 14 * DAY_MS).toISOString()),
        sheetRow('older', 'Older', 1, new Date(T0.getTime() - 20 * DAY_MS).toISOString()),
      ]),
    );
    await openProject(root);

    const trash = await listTrash(PROJECT_KEY, T0);
    const byId = new Map(trash.map((t) => [t.id, t.daysLeft]));
    expect(byId.get('edge')).toBe(0); // exactly 14 days → 0 days left (kept; see pruneTrash)
    expect(byId.get('older')).toBe(0); // negative → clamped at 0
  });
});

describe('pruneTrash — the ONLY path that removes a trash entry (14 days)', () => {
  it('keeps a 13-day-old entry and removes a 15-day-old entry, touching nothing else', async () => {
    const now = T0;
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([
        sheetRow('old-15', 'Old 15', 0, new Date(now.getTime() - 15 * DAY_MS).toISOString()),
        sheetRow('old-13', 'Old 13', 1, new Date(now.getTime() - 13 * DAY_MS).toISOString()),
        sheetRow('live', 'Live', 2),
      ]),
    );
    root.putFile(`${FOLDER}/.trash/old-15/markup.json`, 'OLD15');
    root.putFile(`${FOLDER}/.trash/old-13/markup.json`, 'OLD13');
    root.putFile(`${FOLDER}/.trash/loose.tmp`, 'STRAY');
    root.putFile(`${FOLDER}/.trash/old-13/scratch.tmp`, 'SCRATCH');
    root.putFile(`${FOLDER}/sheets/live/photo.jpg`, 'LIVE-PHOTO');
    root.putFile(`${FOLDER}/.history/old-15/123-markup.json`, 'SNAPSHOT');
    root.putFile(`${FOLDER}/assets/deadbeef.jpg`, 'ASSET');
    await openProject(root);

    const removed = await pruneTrash(PROJECT_KEY, now);

    expect(removed).toEqual(['old-15']);
    // 15-day entry fully gone (folder + row); 13-day entry intact.
    expect(root.has(`${FOLDER}/.trash/old-15/markup.json`)).toBe(false);
    expect(root.textAt(`${FOLDER}/.trash/old-13/markup.json`)).toBe('OLD13');
    expect(rowFor(root, 'old-13')).toBeDefined();
    // The live sheet and everything outside .trash/<id>/ is untouched.
    expect(root.textAt(`${FOLDER}/sheets/live/photo.jpg`)).toBe('LIVE-PHOTO');
    expect(root.textAt(`${FOLDER}/.history/old-15/123-markup.json`)).toBe('SNAPSHOT');
    expect(root.textAt(`${FOLDER}/assets/deadbeef.jpg`)).toBe('ASSET');
    // *.tmp inside .trash/ is never reaped.
    expect(root.textAt(`${FOLDER}/.trash/loose.tmp`)).toBe('STRAY');
    expect(root.textAt(`${FOLDER}/.trash/old-13/scratch.tmp`)).toBe('SCRATCH');
  });

  it('pins the boundary: exactly 14 days old is KEPT, 14 days + 1 ms is removed', async () => {
    // Expiry is `Date.parse(deletedAt) < now − 14d` (strict). Arithmetic: at now = T0, a row
    // deleted at T0 − 1_209_600_000 ms has age === 1_209_600_000 → NOT < → kept; one
    // millisecond older (T0 − 1_209_600_001) → pruned.
    expect(TRASH_RETENTION_MS).toBe(1_209_600_000);
    const now = T0;
    const edgeIso = new Date(now.getTime() - TRASH_RETENTION_MS).toISOString();
    const root = new FakeDir('root');
    root.putFile(
      `${FOLDER}/project.json`,
      projectJson([sheetRow('edge', 'Edge', 0, edgeIso)]),
    );
    root.putFile(`${FOLDER}/.trash/edge/markup.json`, 'EDGE');
    await openProject(root);

    expect(await pruneTrash(PROJECT_KEY, now)).toEqual([]); // exactly 14d → kept
    expect(root.has(`${FOLDER}/.trash/edge/markup.json`)).toBe(true);
    expect(rowFor(root, 'edge').deletedAt).toBe(edgeIso);

    // 1 ms later the entry is strictly older than 14 days → removed.
    expect(await pruneTrash(PROJECT_KEY, new Date(now.getTime() + 1))).toEqual(['edge']);
    expect(root.has(`${FOLDER}/.trash/edge/markup.json`)).toBe(false);
  });

  it('returns [] when nothing is expired and never removes a row without deletingAt', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([sheetRow('live', 'Live', 0)]));
    root.putFile(`${FOLDER}/sheets/live/photo.jpg`, 'LIVE');
    await openProject(root);

    expect(await pruneTrash(PROJECT_KEY, new Date(T0.getTime() + 365 * DAY_MS))).toEqual([]);
    expect(root.has(`${FOLDER}/sheets/live/photo.jpg`)).toBe(true);
    expect(rowFor(root, 'live').deletedAt).toBeUndefined();
  });

  it('is the only reaper: a *.tmp in .trash/ survives cleanStaleTmp too (pinned)', async () => {
    const root = new FakeDir('root');
    root.putFile(`${FOLDER}/project.json`, projectJson([]));
    // Aged well past the 5-minute cleanStaleTmp cutoff.
    const old = Date.now() - 60 * 60_000;
    root.putFile(`${FOLDER}/.trash/loose.tmp`, 'STRAY', old);
    root.putFile(`${FOLDER}/.trash/sheet-9/markup.json.tmp`, 'PARTIAL', old);
    await openProject(root);

    await cleanStaleTmp(asDir(root.childDir(FOLDER)), PROJECT_KEY);

    expect(root.textAt(`${FOLDER}/.trash/loose.tmp`)).toBe('STRAY');
    expect(root.textAt(`${FOLDER}/.trash/sheet-9/markup.json.tmp`)).toBe('PARTIAL');
    expect(root.tmpPaths()).toEqual([
      `root/${FOLDER}/.trash/loose.tmp`,
      `root/${FOLDER}/.trash/sheet-9/markup.json.tmp`,
    ]);
  });
});
