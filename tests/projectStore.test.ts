/**
 * tests/projectStore.test.ts — slice 1.2 storage core (§5.1/§5.3/§5.5/§5.8).
 *
 * Storage is I/O-bound, so the platform APIs are faked (no dependency is added):
 * `tests/fakes/fsa.ts` provides an in-memory File System Access tree, Web Locks with
 * per-name serialization + `ifAvailable`, and OPFS-over-`navigator.storage`.
 *
 * The four session-4 defects this file exists to pin down:
 *   S1 — `writeAtomic` takes the per-write mutex itself (two concurrent writes serialize).
 *   D121 — that mutex is `fm:project:<id>:write`, NOT `fm:project:<id>`: the latter is the
 *   session writer lease, and sharing one name with it deadlocked every write.
 *   S2 — `cleanStaleTmp` walks recursively (sheets/<n>/ and assets/), bounded, skips `.trash`.
 *   S3 — every I/O failure reaches `.history` recovery; `onMissing` is not corruption.
 *   S4/S5 — `StorageWriteError.kind` classification, tmp kept, `.history`/`.trash` untouched.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StorageReadError,
  StorageWriteError,
  acquireWriterLease,
  cleanStaleTmp,
  getOpenProjectFolder,
  initStore,
  isPhotoDamaged,
  makeProjectSeparate,
  readJsonValidated,
  readProjectCover,
  readProjectFile,
  readSheetMarkup,
  registerOpenProject,
  openProjectChannel,
  resolveOpenProjectDir,
  scanProjects,
  writeAtomic,
  writeHistorySnapshot,
  writeJsonAtomic,
} from '../src/fs/projectStore';
import { parseMarkupFile, parseProjectFile } from '../src/domain/schema';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  validMarkupFile,
  validProjectFile,
  type FakeHooks,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
  vi.useRealTimers();
});

function fakeProject(projectId: string, folderName = 'Riverside', updatedAt?: string): FakeDir {
  const root = new FakeDir('root');
  root.putFile(`${folderName}/project.json`, JSON.stringify(validProjectFile({ id: projectId, updatedAt })));
  return root;
}

/**
 * A fresh fake root wired as OPFS, then re-init the store against it. `initStore()` is
 * called explicitly: the backend is initialised once per session in the app, so the
 * tests must re-init it when they swap the root between cases.
 */
async function installRoot(root: FakeDir, locks = createFakeLocks()): Promise<ReturnType<typeof createFakeLocks>> {
  restoreNavigator = installFakeNavigator({
    locks,
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  return locks;
}

const isWriteError = (e: unknown): e is StorageWriteError => e instanceof StorageWriteError;

async function expectKind(promise: Promise<unknown>, kind: StorageWriteError['kind']): Promise<StorageWriteError> {
  try {
    await promise;
  } catch (e) {
    if (!isWriteError(e)) throw e;
    expect(e.kind).toBe(kind);
    return e;
  }
  throw new Error('expected the write to reject');
}

describe('writeAtomic — §5.3 S1 lock coverage', () => {
  it('requests the per-project Web Lock itself (S1)', async () => {
    const locks = createFakeLocks();
    restoreNavigator = installFakeNavigator({ locks });
    const dir = new FakeDir('d');

    await writeAtomic(asDir(dir), 'markup.json', '{"a":1}', 'p1');

    expect(locks.requested).toEqual(['fm:project:p1:write']);
    expect(dir.textAt('markup.json')).toBe('{"a":1}');
  });

  it('serializes two concurrent writes to the same project', async () => {
    const order: string[] = [];
    const hooks: FakeHooks = {
      beforeWrite: (f) => order.push(`write:${f.name}`),
      beforeMove: (f) => order.push(`move:${f.name}`),
    };
    const locks = createFakeLocks();
    restoreNavigator = installFakeNavigator({ locks });
    const dir = new FakeDir('d', hooks);

    // Both are started WITHOUT awaiting the first — the lock must serialize them.
    const first = writeAtomic(asDir(dir), 'a.json', 'first', 'p1');
    const second = writeAtomic(asDir(dir), 'b.json', 'second', 'p1');
    await Promise.all([first, second]);

    expect(order).toEqual([
      'write:a.json.tmp',
      'move:a.json.tmp',
      'write:b.json.tmp',
      'move:b.json.tmp',
    ]);
  });

  it('two different projects never block each other (same-name lock includes the id)', async () => {
    const locks = createFakeLocks();
    restoreNavigator = installFakeNavigator({ locks });
    const dir = new FakeDir('d');

    await Promise.all([
      writeAtomic(asDir(dir), 'a.json', 'a', 'project-a'),
      writeAtomic(asDir(dir), 'b.json', 'b', 'project-b'),
    ]);

    expect(locks.requested).toContain('fm:project:project-a:write');
    expect(locks.requested).toContain('fm:project:project-b:write');
    expect(locks.requested).not.toContain('fm:project:__root__:write');
  });

  it('writeJsonAtomic pretty-prints with the target name and moves over it', async () => {
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const dir = new FakeDir('d');
    dir.putFile('project.json', '{"stale":true}');

    await writeJsonAtomic(asDir(dir), 'project.json', { a: 1 }, 'p1');

    expect(dir.textAt('project.json')).toBe('{\n  "a": 1\n}');
    expect(dir.tmpPaths()).toEqual([]); // the rename consumed the tmp
  });
});

describe('writeAtomic — §5.3 S4/S5 failure classification', () => {
  it('QuotaExceededError → disk-full, tmp KEPT, nothing deleted (§5.8a)', async () => {
    const hooks: FakeHooks = {
      beforeWrite: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const dir = new FakeDir('d', hooks);
    dir.putFile('a.json', '{"good":true}');
    dir.putFile('.history/_project/1-project.json', '{"snapshot":1}');
    dir.putFile('.trash/sheet-1/markup.json', '{"trashed":1}');

    const err = await expectKind(writeAtomic(asDir(dir), 'a.json', '{"new":1}', 'p1'), 'disk-full');

    expect(err.message).toContain('disk-full');
    expect(dir.textAt('a.json')).toBe('{"good":true}'); // previous file intact
    expect(dir.has('a.json.tmp')).toBe(true); // tmp holds the attempted bytes
    // §5.8a: never prune the user's recovery data to make room for a save.
    expect(dir.textAt('.history/_project/1-project.json')).toBe('{"snapshot":1}');
    expect(dir.textAt('.trash/sheet-1/markup.json')).toBe('{"trashed":1}');
  });

  it('NotAllowedError / SecurityError → permission', async () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const hooks: FakeHooks = {
        beforeWrite: () => {
          throw new DOMException(name, name);
        },
      };
      restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
      await expectKind(
        writeAtomic(asDir(new FakeDir('d', hooks)), 'a.json', 'x', 'p1'),
        'permission',
      );
    }
  });

  it('a NotAllowedError resolving the TMP HANDLE is classified permission, not a raw reject (review F2)', async () => {
    // The write grant can be revoked mid-session, and the failure surfaces from
    // `getFileHandle(tmp, { create: true })` itself — before any byte is written. The
    // contract promises a `StorageWriteError` for every I/O failure, so this must
    // classify like the rest (the wizard shows «Re-authorize», not a useless «Retry»).
    const hooks: FakeHooks = {
      beforeGetFileHandle: (name) => {
        if (name.endsWith('.tmp')) throw new DOMException('write grant revoked', 'NotAllowedError');
      },
    };
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const dir = new FakeDir('d', hooks);
    dir.putFile('a.json', '{"good":true}');

    const err = await expectKind(writeAtomic(asDir(dir), 'a.json', '{"new":1}', 'p1'), 'permission');

    expect(err.message).toContain('permission');
    expect(dir.textAt('a.json')).toBe('{"good":true}'); // the target is never touched
    expect(dir.has('a.json.tmp')).toBe(false); // the handle was never created
  });

  it('NoModificationAllowedError / InvalidStateError → target-locked (§5.8b)', async () => {
    for (const name of ['NoModificationAllowedError', 'InvalidStateError']) {
      const hooks: FakeHooks = {
        beforeMove: () => {
          throw new DOMException(name, name);
        },
      };
      restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
      const dir = new FakeDir('d', hooks);
      dir.putFile('a.json', '{"good":true}');

      await expectKind(writeAtomic(asDir(dir), 'a.json', '{"new":1}', 'p1'), 'target-locked');

      expect(dir.textAt('a.json')).toBe('{"good":true}'); // never delete the target
      expect(dir.has('a.json.tmp')).toBe(true); // never delete the tmp
    }
  });

  it('an unknown throw is classified unknown', async () => {
    const hooks: FakeHooks = {
      beforeWrite: () => {
        throw new Error('mystery');
      },
    };
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    await expectKind(writeAtomic(asDir(new FakeDir('d', hooks)), 'a.json', 'x', 'p1'), 'unknown');
  });
});

describe('cleanStaleTmp — §5.3 S2 (recursive, aged, lock-guarded)', () => {
  function agedTree(): { root: FakeDir; hooks: FakeHooks } {
    const hooks: FakeHooks = {};
    const root = new FakeDir('root', hooks);
    const old = Date.now() - 6 * 60_000; // > 5 minutes
    const fresh = Date.now() - 60_000; // < 5 minutes
    root.putFile('sheets/003/markup.json.tmp', '{"partial":', old);
    root.putFile('sheets/003/photo.jpg.tmp', 'partial', old);
    root.putFile('sheets/003/thumb.jpg.tmp', 'partial', fresh);
    root.putFile('assets/deadbeef.jpg.tmp', 'partial', old);
    root.putFile('.trash/sheet-9/markup.json.tmp', '{"trashed":', old);
    return { root, hooks };
  }

  it('removes aged tmp files in sheets/<n>/ and assets/ (the §5.3 S2 gate)', async () => {
    const { root } = agedTree();
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });

    await cleanStaleTmp(asDir(root), 'p1');

    expect(root.tmpPaths()).toEqual(['root/.trash/sheet-9/markup.json.tmp', 'root/sheets/003/thumb.jpg.tmp']);
  });

  it('runs under the per-write mutex, fm:project:<id>:write (D121)', async () => {
    const { root } = agedTree();
    const locks = createFakeLocks();
    restoreNavigator = installFakeNavigator({ locks });

    await cleanStaleTmp(asDir(root), 'p9');

    expect(locks.requested).toEqual(['fm:project:p9:write']);
  });

  it('is bounded (depth ≤ 3): a tmp deeper than the layout survives', async () => {
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const root = new FakeDir('root');
    const old = Date.now() - 60 * 60_000;
    // root(0) / a(1) / b(2) / c(3) / d(4): walking d is refused, so its files are never touched.
    root.putFile('a/b/c/d/deep.tmp', 'x', old);

    await cleanStaleTmp(asDir(root), 'p1');

    expect(root.tmpPaths()).toEqual(['root/a/b/c/d/deep.tmp']);
  });
});

describe('readJsonValidated — §5.3 S3 (every I/O failure reaches recovery)', () => {
  it('missing file + onMissing → the default, recovery NOT attempted', async () => {
    const hooks: FakeHooks = {};
    const reads: string[] = [];
    hooks.beforeGetFile = (f) => reads.push(f.name);
    const dir = new FakeDir('sheet', hooks);
    dir.putFile('.history/sheet-1/123-project.json', JSON.stringify(validProjectFile({ id: 'recovered' })));

    const value = await readJsonValidated(
      asDir(dir),
      'project.json',
      parseProjectFile,
      () => validProjectFile({ id: 'default' }),
      { historyDir: asDir(dir.childDir('.history/sheet-1')) },
    );

    expect(value.project.id).toBe('default');
    // The absent file throws at `getFileHandle`, so not even a read happens — and the
    // default wins even though a perfectly good snapshot was available to recover.
    expect(reads).toEqual([]);
  });

  it('missing file WITHOUT onMissing → recovery is attempted', async () => {
    const dir = new FakeDir('sheet');
    dir.putFile('.history/sheet-1/100-markup.json', JSON.stringify(validMarkupFile('sheet-1')));

    const value = await readJsonValidated(
      asDir(dir),
      'markup.json',
      parseMarkupFile,
      undefined,
      { historyDir: asDir(dir.childDir('.history/sheet-1')) },
    );

    expect(value.sheetId).toBe('sheet-1'); // the snapshot's content
  });

  it('NotReadableError from getFile() → recovery is attempted', async () => {
    const hooks: FakeHooks = {
      beforeGetFile: (f) => {
        if (f.name === 'project.json') throw new DOMException('io', 'NotReadableError');
      },
    };
    const dir = new FakeDir('project', hooks);
    dir.putFile('project.json', JSON.stringify(validProjectFile({ id: 'corrupt-on-disk' })));
    dir.putFile('.history/_project/500-project.json', JSON.stringify(validProjectFile({ id: 'recovered' })));

    const value = await readProjectFile(asDir(dir));

    expect(value.project.id).toBe('recovered');
  });

  it('corrupt JSON → recovery (newest snapshot first)', async () => {
    const dir = new FakeDir('project');
    dir.putFile('project.json', '{"schemaVersion":1,"project":');
    dir.putFile('.history/_project/100-project.json', JSON.stringify(validProjectFile({ id: 'older' })));
    dir.putFile('.history/_project/200-project.json', JSON.stringify(validProjectFile({ id: 'newer' })));

    const value = await readProjectFile(asDir(dir));

    expect(value.project.id).toBe('newer');
  });

  it('no valid snapshot → StorageReadError (never a silent default)', async () => {
    const dir = new FakeDir('project');
    dir.putFile('project.json', 'not json');

    await expect(readProjectFile(asDir(dir))).rejects.toBeInstanceOf(StorageReadError);
  });
});

describe('history snapshots — §5.5 / §5.8e', () => {
  it('caps at 20 per scope, pruning oldest-first', async () => {
    vi.useFakeTimers();
    const base = 1_700_000_000_000;
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const projectDir = new FakeDir('project');

    for (let i = 0; i < 25; i += 1) {
      vi.setSystemTime(base + i * 1000);
      await writeHistorySnapshot(
        asDir(projectDir),
        '_project',
        'project.json',
        validProjectFile({ id: `p${i}` }),
        'p1',
      );
    }

    const files = projectDir.childDir('.history/_project').filePaths();
    expect(files).toHaveLength(20);
    expect(projectDir.has(`.history/_project/${base}-project.json`)).toBe(false); // oldest pruned
    expect(projectDir.has(`.history/_project/${base + 5000}-project.json`)).toBe(true); // 21st kept
  });

  it('readSheetMarkup recovers from .history/<sheetId>/ (project-root history)', async () => {
    const projectDir = new FakeDir('project');
    projectDir.putFile('sheets/sheet-1/markup.json', '{"schemaVersion":1,"sheetId":');
    projectDir.putFile(
      '.history/sheet-1/900-markup.json',
      JSON.stringify(validMarkupFile('sheet-1')),
    );

    const value = await readSheetMarkup(asDir(projectDir), 'sheet-1');

    expect(value.sheetId).toBe('sheet-1');
    expect(parseMarkupFile(JSON.stringify(value)).success).toBe(true);
  });
});

describe('isPhotoDamaged — §5.3 truncated-photo detection', () => {
  it('missing and 0-byte photos are damaged; a real photo is not', async () => {
    const sheet = new FakeDir('sheet-1');
    expect(await isPhotoDamaged(asDir(sheet))).toBe(true);

    sheet.putFile('photo.jpg', '');
    expect(await isPhotoDamaged(asDir(sheet))).toBe(true);

    sheet.putFile('photo.jpg', 'JPEGBYTES');
    expect(await isPhotoDamaged(asDir(sheet))).toBe(false);
  });
});

describe('two-tab arbitration — §5.8d (deterministic)', () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('exactly one of two simultaneous attempts wins, 10 runs out of 10', async () => {
    for (let run = 0; run < 10; run += 1) {
      restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
      const [first, second] = await Promise.all([
        acquireWriterLease('p1'),
        acquireWriterLease('p1'),
      ]);
      expect([first, second].filter(Boolean)).toHaveLength(1);
      first?.release();
      await settle();
      restoreNavigator();
      restoreNavigator = null;
    }
  });

  it('«Take over» succeeds once the first tab releases', async () => {
    restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
    const first = await acquireWriterLease('p1');
    expect(first).not.toBeNull();
    expect(await acquireWriterLease('p1')).toBeNull();

    first!.release();
    await settle();

    const taken = await acquireWriterLease('p1');
    expect(taken).not.toBeNull();
    taken!.release();
  });

  it('invalidates the other tab over fm:project:<id>, namespaced per project (§5.4)', async () => {
    const received: string[] = [];
    const writer = openProjectChannel('p1', (m) => received.push(`writer:${m}`));
    const reader = openProjectChannel('p1', (m) => received.push(`reader:${m}`));
    const otherProject = openProjectChannel('p2', () => received.push('other-project'));
    expect(writer).not.toBeNull();

    writer!.post('write');
    // A channel never receives its own message; the OTHER tab on the SAME project hears it,
    // and a tab on a DIFFERENT project never does (that would false-conflict two projects).
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(received).toEqual(['reader:write']);

    writer!.close();
    reader!.close();
    otherProject?.close();
  });
});

describe('scanProjects — §5.6 identity + §5.8c duplicate ids', () => {
  it('keys by project.json id, never by folder name', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'WhateverTheFolderIsCalled/project.json',
      JSON.stringify(validProjectFile({ id: 'id-from-file', title: 'Riverside' })),
    );
    await installRoot(root);

    const cards = await scanProjects();

    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('id-from-file');
    expect(cards[0].folderName).toBe('WhateverTheFolderIsCalled');
    expect(cards[0].key).toBe('id-from-file:WhateverTheFolderIsCalled');
    expect(cards[0].title).toBe('Riverside');
    expect(cards[0].isDuplicate).toBe(false);
  });

  it('shows every folder of a duplicated id as its own card and badges the older «Copy»', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      JSON.stringify(validProjectFile({ id: 'dup', updatedAt: '2026-09-21T15:00:00.000Z' })),
    );
    root.putFile(
      'Riverside - Copy/project.json',
      JSON.stringify(validProjectFile({ id: 'dup', updatedAt: '2026-09-20T09:00:00.000Z' })),
    );
    await installRoot(root);

    const cards = await scanProjects();
    const byFolder = Object.fromEntries(cards.map((c) => [c.folderName, c]));

    expect(cards).toHaveLength(2); // never merged
    expect(byFolder['Riverside'].isDuplicate).toBe(true);
    expect(byFolder['Riverside'].isMostRecent).toBe(true);
    expect(byFolder['Riverside - Copy'].isDuplicate).toBe(true);
    expect(byFolder['Riverside - Copy'].isMostRecent).toBe(false); // the «Copy» badge
    expect(byFolder['Riverside'].key).not.toBe(byFolder['Riverside - Copy'].key);
  });

  it('reports a corrupt project as a card and hides non-project folders (D140)', async () => {
    // D140 supersedes the NotAProject half: a folder with neither `project.json` nor
    // `.history/_project/` cannot be opened by the app today either, so it is hidden rather
    // than shown as an unreadable card.
    const root = new FakeDir('root');
    root.putFile('Broken/project.json', '{not json');
    root.mkdir('NotAProject');
    await installRoot(root);

    const cards = await scanProjects();

    expect(cards.map((c) => c.folderName)).toEqual(['Broken']);
    expect(cards.every((c) => c.status === 'unreadable')).toBe(true);
  });

  it('a folder with only .history/_project/ (no project.json) is still listed (D140)', async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Recovered/.history/_project/100-project.json',
      JSON.stringify(validProjectFile({ id: 'recovered-id' })),
    );
    await installRoot(root);

    const cards = await scanProjects();

    expect(cards.map((c) => c.folderName)).toEqual(['Recovered']);
    expect(cards[0].status).toBe('ok');
    expect(cards[0].id).toBe('recovered-id');
  });

  it('dot-folders are never scanned or shown (D140)', async () => {
    const root = new FakeDir('root');
    root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ id: 'p1' })));
    root.mkdir('.trash');
    root.mkdir('.fieldmeasure-tmp');
    await installRoot(root);

    const cards = await scanProjects();

    expect(cards.map((c) => c.folderName)).toEqual(['Riverside']);
  });

  it('scans 20 project folders with bounded concurrency and returns them all, sorted', async () => {
    const root = new FakeDir('root');
    const names: string[] = [];
    const base = 1_700_000_000_000; // well before the sheet's own (older) updatedAt is irrelevant: the file mtime dominates
    for (let i = 0; i < 20; i += 1) {
      const name = `Project ${String(i).padStart(2, '0')}`;
      names.push(name);
      root.putFile(
        `${name}/project.json`,
        JSON.stringify(validProjectFile({ id: `id-${i}`, updatedAt: '2000-01-01T00:00:00.000Z' })),
        base + i * 1000, // increasing file mtime: index 19 is newest
      );
    }
    await installRoot(root);

    const cards = await scanProjects();

    expect(cards).toHaveLength(20);
    expect(cards.map((c) => c.folderName).sort()).toEqual(names.sort());
    // Sorted newest-first by `updatedAtMs` (the fixtures' file mtime increases with i).
    expect(cards[0].folderName).toBe('Project 19');
    expect(cards[cards.length - 1].folderName).toBe('Project 00');
  });

  it('returns [] when no root folder has been chosen', async () => {
    restoreNavigator = installFakeNavigator({ storage: {} });
    await initStore();
    await expect(scanProjects()).resolves.toEqual([]);
  });
});

describe('readProjectCover — D141 (Home card thumbnail)', () => {
  function projectFileWithSheets(
    sheets: Array<{ id: string; sortIndex: number; deletedAt?: string }>,
  ): object {
    return {
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
        title: s.id,
        sortIndex: s.sortIndex,
        imageWidth: 4096,
        imageHeight: 3072,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...(s.deletedAt ? { deletedAt: s.deletedAt } : {}),
      })),
    };
  }

  it("returns the first-by-sortIndex LIVE sheet's thumb bytes, skipping a deleted lower-sortIndex sheet", async () => {
    const root = new FakeDir('root');
    root.putFile(
      'Riverside/project.json',
      JSON.stringify(
        projectFileWithSheets([
          { id: 'deleted-sheet', sortIndex: 5, deletedAt: '2026-01-02T00:00:00.000Z' },
          { id: 'sheet-b', sortIndex: 10 },
          { id: 'sheet-a', sortIndex: 20 },
        ]),
      ),
    );
    root.putFile('Riverside/sheets/sheet-b/thumb.jpg', 'THUMB-B');
    root.putFile('Riverside/sheets/sheet-a/thumb.jpg', 'THUMB-A');
    await installRoot(root);

    const blob = await readProjectCover('Riverside');

    expect(blob).not.toBeNull();
    expect(await blob!.text()).toBe('THUMB-B');
  });

  it('returns null when the project has no sheets', async () => {
    const root = new FakeDir('root');
    root.putFile('Empty/project.json', JSON.stringify(projectFileWithSheets([])));
    await installRoot(root);

    expect(await readProjectCover('Empty')).toBeNull();
  });

  it('returns null when the first sheet has no thumb.jpg', async () => {
    const root = new FakeDir('root');
    root.putFile('NoThumb/project.json', JSON.stringify(projectFileWithSheets([{ id: 'sheet-1', sortIndex: 10 }])));
    await installRoot(root);

    expect(await readProjectCover('NoThumb')).toBeNull();
  });

  it('returns null when the folder does not exist', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    expect(await readProjectCover('DoesNotExist')).toBeNull();
  });
});

describe('makeProjectSeparate — §5.8c (never write into a folder you did not open)', () => {
  it('mints a new id and rewrites ONLY that folder', async () => {
    const root = new FakeDir('root');
    const shared = validProjectFile({ id: 'dup', title: 'Riverside' });
    root.putFile('Riverside/project.json', JSON.stringify(shared));
    root.putFile('Riverside - Copy/project.json', JSON.stringify(shared));
    const locks = await installRoot(root);
    await scanProjects(); // ensures initStore() ran against this root

    const nextId = await makeProjectSeparate('Riverside - Copy', 'dup');

    expect(nextId).not.toBe('dup');
    const rewritten = JSON.parse(root.textAt('Riverside - Copy/project.json')) as {
      project: { id: string; title: string };
    };
    expect(rewritten.project.id).toBe(nextId);
    expect(rewritten.project.title).toBe('Riverside'); // meta preserved
    const untouched = JSON.parse(root.textAt('Riverside/project.json')) as { project: { id: string } };
    expect(untouched.project.id).toBe('dup'); // the other folder is untouched
    expect(locks.requested).toContain('fm:project:dup:write'); // the folder's existing id, per-write mutex
    expect(root.tmpPaths()).toEqual([]);
  });
});

describe('open-project registry (what persistQueue writes through)', () => {
  it('resolves root/<folderName> for an open project', async () => {
    const root = fakeProject('p1', 'Riverside');
    await installRoot(root);
    await scanProjects();

    registerOpenProject('p1', 'Riverside');

    expect(getOpenProjectFolder('p1')).toBe('Riverside');
    const dir = (await resolveOpenProjectDir('p1')) as unknown as FakeDir;
    expect(dir.name).toBe('Riverside');
  });
});

describe('open-project §5.2 gesture re-grant (the reloaded-page «open a project» path)', () => {
  it('asks for the root write grant, then resolves the folder', async () => {
    const root = fakeProject('p1', 'Riverside');
    const calls: string[] = [];
    let granted = false;
    Object.assign(root, {
      queryPermission: async (): Promise<PermissionState> => (granted ? 'granted' : 'prompt'),
      requestPermission: async (): Promise<PermissionState> => {
        calls.push('requestPermission');
        granted = true;
        return 'granted';
      },
    });
    await installRoot(root);
    registerOpenProject('p1', 'Riverside');

    const dir = (await resolveOpenProjectDir('p1')) as unknown as FakeDir;

    expect(calls).toEqual(['requestPermission']);
    expect(dir.name).toBe('Riverside');
  });

  it('a non-gesture caller stays quiet: a rejected requestPermission is not an error here', async () => {
    const root = fakeProject('p1', 'Riverside');
    Object.assign(root, {
      queryPermission: async (): Promise<PermissionState> => 'prompt',
      // Chromium rejects rather than prompting when there is no transient activation.
      requestPermission: async (): Promise<PermissionState> => {
        throw new DOMException('user activation is required', 'NotAllowedError');
      },
    });
    await installRoot(root);
    registerOpenProject('p1', 'Riverside');

    const dir = (await resolveOpenProjectDir('p1')) as unknown as FakeDir;

    expect(dir.name).toBe('Riverside');
  });
});
