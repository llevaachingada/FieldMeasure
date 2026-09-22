/**
 * tests/sheetIntake.test.ts — slice 1.4: the FROZEN `src/fs/sheetIntake.ts` write path.
 *
 * `sheetIntake.ts` is the single "a photo becomes a sheet" write path, shared by the
 * capture flow (1.4) and the editor's file import (1.3). It is frozen — this slice must
 * not modify it — so this file pins its observable contract:
 *
 *   1. `photo.jpg` is written into `sheets/<id>/`.
 *   2. `project.json` gains EXACTLY ONE sheet with the right
 *      `imageWidth`/`imageHeight`/`sortIndex`/`createdAt`.
 *   3. The write order is photo first, then `project.json` (module header): a crash in
 *      between leaves a harmless orphan sheet folder, never a `project.json` entry
 *      pointing at a missing photo.
 *   4. A failure BEFORE `project.json` leaves NO half-sheet entry.
 *
 * The platform APIs are faked with `tests/fakes/fsa.ts` (no new dependency) — the same
 * in-memory File System Access tree + Web Locks as `tests/projectStore.test.ts`.
 *
 * The "tmp cleaned" half of the slice gate is covered here too: `projectStore.writeAtomic`
 * deliberately KEEPS a `.tmp` on failure (§5.3 S5 — when only `move()` failed the tmp
 * holds the good bytes), so the flow must not delete it; orphan tmps are aged out by
 * `cleanStaleTmp` (5-minute cutoff) on the next project open.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { addSheetFromPhoto, defaultSheetTitle } from '../src/fs/sheetIntake';
import { cleanStaleTmp } from '../src/fs/projectStore';
import { parseProjectFile, type ProjectFile } from '../src/domain/schema';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  validProjectFile,
  type FakeHooks,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
});

/** D51 runtime key — always `${id}:${folderName}`, never the bare id. */
const PROJECT_ID = 'proj-1:Riverside';

const PHOTO = {
  blob: new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' }),
  width: 4096,
  height: 3072,
};

/** EXIF capture time; the value the sheet's `createdAt` must be, verbatim ISO. */
const CAPTURED_AT = new Date('2026-09-21T14:12:00.000Z');

function freshRoot(hooks: FakeHooks = {}): { root: FakeDir; projectDir: FileSystemDirectoryHandle } {
  const root = new FakeDir('root', hooks);
  root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ sheetCount: 0 })));
  return { root, projectDir: asDir(root.childDir('Riverside')) };
}

function locks(): ReturnType<typeof createFakeLocks> {
  const locks = createFakeLocks();
  restoreNavigator = installFakeNavigator({ locks });
  return locks;
}

/** `parseProjectFile`'s zod result is a discriminated union — narrow it once. */
function readProject(raw: string): ProjectFile {
  const parsed = parseProjectFile(raw);
  if (!parsed.success) throw new Error(`invalid project.json: ${parsed.error}`);
  return parsed.data;
}

describe('addSheetFromPhoto — the frozen photo→sheet write path', () => {
  it('writes photo.jpg and appends exactly one sheet with the right fields', async () => {
    const { root, projectDir } = freshRoot();
    locks();

    const result = await addSheetFromPhoto(PHOTO, {
      projectDir,
      projectFile: validProjectFile({ sheetCount: 0 }),
      projectId: PROJECT_ID,
      title: 'Sheet 01',
      createdAt: CAPTURED_AT,
    });

    expect(root.has(`Riverside/sheets/${result.sheet.id}/photo.jpg`)).toBe(true);

    const parsed = readProject(root.textAt('Riverside/project.json'));
    const sheets = parsed.sheets;
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({
      id: result.sheet.id,
      title: 'Sheet 01',
      // `sortIndex` = the sheet count BEFORE the append: 0 existing → 0.
      sortIndex: 0,
      imageWidth: 4096,
      imageHeight: 3072,
      createdAt: '2026-09-21T14:12:00.000Z', // CAPTURED_AT.toISOString()
    });
    // The returned handles are the ones on disk, not a second read.
    expect(result.projectFile.sheets).toHaveLength(1);
    expect(result.sheetDir.name).toBe(result.sheet.id);
  });

  it('appends (not inserts): sortIndex equals the current sheet count', async () => {
    const { root, projectDir } = freshRoot();
    locks();
    const oneSheet = validProjectFile({ sheetCount: 1 });

    const result = await addSheetFromPhoto(PHOTO, {
      projectDir,
      projectFile: oneSheet,
      projectId: PROJECT_ID,
      title: 'Sheet 02',
      createdAt: CAPTURED_AT,
    });

    // 1 sheet existed → the new one is index 1 (0-based, append).
    expect(result.sheet.sortIndex).toBe(1);
    const parsed = readProject(root.textAt('Riverside/project.json'));
    expect(parsed.sheets.map((s) => s.sortIndex)).toEqual([0, 1]);
  });

  it('writes photo.jpg BEFORE project.json (module-header write order)', async () => {
    const order: string[] = [];
    const { projectDir } = freshRoot({
      beforeWrite: (f) => order.push(`write:${f.name}`),
      beforeMove: (f) => order.push(`move:${f.name}`),
    });
    locks();

    await addSheetFromPhoto(PHOTO, {
      projectDir,
      projectFile: validProjectFile({ sheetCount: 0 }),
      projectId: PROJECT_ID,
      title: 'Sheet 01',
      createdAt: CAPTURED_AT,
    });

    expect(order).toEqual([
      'write:photo.jpg.tmp',
      'move:photo.jpg.tmp',
      'write:project.json.tmp',
      'move:project.json.tmp',
    ]);
  });

  it('a failure BEFORE project.json leaves no half-sheet entry (project.json unchanged)', async () => {
    const { root, projectDir } = freshRoot({
      beforeWrite: (f) => {
        if (f.name === 'project.json.tmp') {
          throw new DOMException('target locked', 'NoModificationAllowedError');
        }
      },
    });
    locks();
    const before = root.textAt('Riverside/project.json');

    await expect(
      addSheetFromPhoto(PHOTO, {
        projectDir,
        projectFile: validProjectFile({ sheetCount: 0 }),
        projectId: PROJECT_ID,
        title: 'Sheet 01',
        createdAt: CAPTURED_AT,
      }),
    ).rejects.toBeTruthy();

    // project.json is byte-identical: no sheet entered the file.
    expect(root.textAt('Riverside/project.json')).toBe(before);
    expect(readProject(root.textAt('Riverside/project.json')).sheets).toHaveLength(0);
    // The photo itself did land (orphan sheet folder is tolerated, §5.3 S5).
    expect(root.filePaths().some((p) => p.endsWith('/photo.jpg'))).toBe(true);
    // ...and no `photo.jpg.tmp` is left masquerading as the target photo.
    expect(root.filePaths().some((p) => p.endsWith('/photo.jpg.tmp'))).toBe(false);
  });

  it('a failure WRITING the photo leaves project.json unchanged and no photo.jpg', async () => {
    const { root, projectDir } = freshRoot({
      beforeWrite: (f) => {
        if (f.name === 'photo.jpg.tmp') {
          throw new DOMException('disk full', 'QuotaExceededError');
        }
      },
    });
    locks();

    await expect(
      addSheetFromPhoto(PHOTO, {
        projectDir,
        projectFile: validProjectFile({ sheetCount: 0 }),
        projectId: PROJECT_ID,
        title: 'Sheet 01',
        createdAt: CAPTURED_AT,
      }),
    ).rejects.toBeTruthy();

    expect(root.filePaths().some((p) => p.endsWith('/photo.jpg'))).toBe(false);
    expect(readProject(root.textAt('Riverside/project.json')).sheets).toHaveLength(0);
  });
});

describe('cleanStaleTmp — the "tmp cleaned" half of the capture gate', () => {
  it('ages out an orphan capture tmp on the next project open (5-minute cutoff)', async () => {
    const root = new FakeDir('root');
    root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ sheetCount: 0 })));
    // A tmp left by a crashed write: created 10 minutes ago.
    //   cutoff = now − 5 min  →  10 min old IS older than the cutoff → removed.
    root.putFile('Riverside/sheets/sheet-x/photo.jpg.tmp', 'partial', Date.now() - 10 * 60_000);
    locks();

    await cleanStaleTmp(asDir(root), PROJECT_ID);

    expect(root.has('Riverside/sheets/sheet-x/photo.jpg.tmp')).toBe(false);
  });

  it('does NOT delete a fresh tmp (it may be another tab’s in-flight write)', async () => {
    const root = new FakeDir('root');
    root.putFile('Riverside/sheets/sheet-x/photo.jpg.tmp', 'in-flight', Date.now());
    locks();

    await cleanStaleTmp(asDir(root), PROJECT_ID);

    expect(root.has('Riverside/sheets/sheet-x/photo.jpg.tmp')).toBe(true);
  });
});

describe('defaultSheetTitle — zero-padded, never renumbered', () => {
  it('counts live sheets (excluding deleted) and pads to 2', () => {
    // 0 existing sheets → count+1 = 1 → 'Sheet 01'.
    expect(defaultSheetTitle(validProjectFile({ sheetCount: 0 }))).toBe('Sheet 01');
    // 11 existing → 12 → 'Sheet 12' (no renumbering of the existing 11).
    expect(defaultSheetTitle(validProjectFile({ sheetCount: 11 }))).toBe('Sheet 12');
  });
});
