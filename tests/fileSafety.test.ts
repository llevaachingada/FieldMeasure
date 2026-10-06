/**
 * D169: two file-safety nets that existed but were never connected.
 *
 * 1. The schema-version guard. A project or markup file written by a NEWER build is refused,
 *    and the refusal must never fall through to `.history/` recovery (loading an older
 *    snapshot and autosaving would overwrite the newer file).
 * 2. The recovery snapshots. Autosave now writes a `.history/` snapshot on the first save of
 *    a session and then at most every 10 minutes per scope, so a corrupt file has something
 *    to recover from. A failed snapshot never fails the save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NewerFileVersionError,
  StorageReadError,
  readProjectFile,
  readSheetMarkup,
} from '../src/fs/projectStore';
import { CURRENT_SCHEMA_VERSION } from '../src/domain/migrate';
import {
  HISTORY_SNAPSHOT_INTERVAL_MS,
  resetSnapshotClock,
  writeToProjectDir,
} from '../src/state/persistQueue';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  validMarkupFile,
  validProjectFile,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

beforeEach(() => {
  restoreNavigator = installFakeNavigator({ locks: createFakeLocks() });
  resetSnapshotClock();
});

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
  vi.useRealTimers();
});

describe('schema-version guard (D169)', () => {
  const newer = CURRENT_SCHEMA_VERSION + 1; // 1 + 1 = 2: one build ahead

  it('refuses a project.json from a newer build, even with a valid snapshot to recover', async () => {
    const dir = new FakeDir('project');
    dir.putFile('project.json', JSON.stringify({ ...validProjectFile({ id: 'newer' }), schemaVersion: newer }));
    dir.putFile('.history/_project/100-project.json', JSON.stringify(validProjectFile({ id: 'older-snapshot' })));

    const read = readProjectFile(asDir(dir));

    await expect(read).rejects.toBeInstanceOf(NewerFileVersionError);
    // Existing read-failure handling (Retry, the unreadable card) keys on StorageReadError.
    await expect(readProjectFile(asDir(dir))).rejects.toBeInstanceOf(StorageReadError);
  });

  it('refuses a markup.json from a newer build', async () => {
    const dir = new FakeDir('project');
    dir.putFile(
      'sheets/sheet-1/markup.json',
      JSON.stringify({ ...validMarkupFile('sheet-1'), schemaVersion: newer }),
    );
    dir.putFile('.history/sheet-1/100-markup.json', JSON.stringify(validMarkupFile('sheet-1')));

    await expect(readSheetMarkup(asDir(dir), 'sheet-1')).rejects.toBeInstanceOf(NewerFileVersionError);
  });

  it('still reads a current file, and fills pre-v0.3 project defaults', async () => {
    const dir = new FakeDir('project');
    const file = validProjectFile({ id: 'old' });
    const { unitFormat: _f, precisionDenominator: _p, ...projectWithoutDefaults } = file.project;
    dir.putFile('project.json', JSON.stringify({ ...file, project: projectWithoutDefaults }));

    const value = await readProjectFile(asDir(dir));

    expect(value.project.id).toBe('old');
    expect(value.project.unitFormat).toBe('ft-in');
    expect(value.project.precisionDenominator).toBe(16);
    expect(value.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('corrupt JSON still goes to recovery (the guard only refuses parseable newer files)', async () => {
    const dir = new FakeDir('project');
    dir.putFile('project.json', '{"schemaVersion":1,"project":');
    dir.putFile('.history/_project/200-project.json', JSON.stringify(validProjectFile({ id: 'recovered' })));

    expect((await readProjectFile(asDir(dir))).project.id).toBe('recovered');
  });
});

describe('recovery snapshots on autosave (D169)', () => {
  const base = 1_700_000_000_000;
  const projectTarget = { kind: 'project' as const, projectId: 'p1' };
  const sheetTarget = { kind: 'sheet' as const, projectId: 'p1', sheetId: 'sheet-1' };

  function projectWithSheet(): FakeDir {
    const dir = new FakeDir('project');
    dir.putFile('project.json', JSON.stringify(validProjectFile({ id: 'p1' })));
    dir.putFile('sheets/sheet-1/markup.json', JSON.stringify(validMarkupFile('sheet-1')));
    return dir;
  }
  const snapshots = (dir: FakeDir, scope: string): string[] =>
    dir.filePaths().filter((p) => p.includes(`/.history/${scope}/`) && !p.endsWith('.tmp'));

  it('the first save of a session snapshots; saves inside 10 minutes do not; the next one does', async () => {
    vi.useFakeTimers();
    const dir = projectWithSheet();

    vi.setSystemTime(base);
    await writeToProjectDir(asDir(dir), projectTarget, validProjectFile({ id: 'p1' }));
    expect(snapshots(dir, '_project')).toHaveLength(1);

    vi.setSystemTime(base + HISTORY_SNAPSHOT_INTERVAL_MS - 1); // 1 ms short of 10 min
    await writeToProjectDir(asDir(dir), projectTarget, validProjectFile({ id: 'p1' }));
    expect(snapshots(dir, '_project')).toHaveLength(1);

    vi.setSystemTime(base + HISTORY_SNAPSHOT_INTERVAL_MS); // exactly 10 min
    await writeToProjectDir(asDir(dir), projectTarget, validProjectFile({ id: 'p1' }));
    expect(snapshots(dir, '_project')).toHaveLength(2);
  });

  it('sheet saves snapshot under .history/<sheetId>/, independently of the project scope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(base);
    const dir = projectWithSheet();

    await writeToProjectDir(asDir(dir), projectTarget, validProjectFile({ id: 'p1' }));
    await writeToProjectDir(asDir(dir), sheetTarget, validMarkupFile('sheet-1'));

    expect(snapshots(dir, 'sheet-1')).toHaveLength(1);
    expect(snapshots(dir, '_project')).toHaveLength(1);
  });

  it('a corrupted markup.json recovers from the snapshot autosave wrote', async () => {
    const dir = projectWithSheet();
    const saved = validMarkupFile('sheet-1');

    await writeToProjectDir(asDir(dir), sheetTarget, saved);
    dir.putFile('sheets/sheet-1/markup.json', '{"schemaVersion":1,"sheetId":'); // torn file

    expect(await readSheetMarkup(asDir(dir), 'sheet-1')).toEqual(saved);
  });

  it('a failed snapshot never fails the save', async () => {
    const hooks = {
      beforeGetFileHandle: (name: string) => {
        if (/^\d+-markup\.json/.test(name)) throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const dir = new FakeDir('project', hooks);
    dir.putFile('sheets/sheet-1/markup.json', JSON.stringify(validMarkupFile('sheet-1')));
    const next = { ...validMarkupFile('sheet-1'), annotations: [] };

    await expect(writeToProjectDir(asDir(dir), sheetTarget, next)).resolves.toBeUndefined();
    expect(JSON.parse(await (await (await asDir(dir.childDir('sheets/sheet-1')).getFileHandle('markup.json')).getFile()).text())).toEqual(next);
  });
});
