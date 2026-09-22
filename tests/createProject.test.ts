/**
 * tests/createProject.test.ts — the Home «New project» action's storage half.
 *
 * A human found the Home control dead: `onNewProject` was a no-op stub and no
 * create-project code existed anywhere in `src/`. `createProject` now creates an
 * APP-NAMED subfolder of the projects root (no OS picker, no name prompt) with a
 * valid `project.json`, written through the ONE atomic helper.
 *
 * The assertions here execute the real path against the in-memory File System
 * Access fake (`tests/fakes/fsa.ts`), the same harness `projectStore.test.ts` uses:
 * naming sequence, round-trip of the written envelope, `scanProjects` identity (D51),
 * the explicit-title override, no `*.tmp` survivor, never adopting an existing
 * folder, the bounded probe, and the no-root throw.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_NEW_PROJECT_NAMES,
  createProject,
  initStore,
  readProjectFile,
  scanProjects,
} from '../src/fs/projectStore';
import { STRINGS } from '../src/ui/strings';
import { FakeDir, asDir, createFakeLocks, installFakeNavigator } from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
});

/** A fresh fake root wired as the projects root, then re-init the store against it. */
async function installRoot(root: FakeDir): Promise<void> {
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
}

/** No root: OPFS reports no directory (the app is on FirstRun / Home has no handle). */
async function installNoRoot(): Promise<void> {
  restoreNavigator = installFakeNavigator({ storage: {} });
  await initStore();
}

const BASE = STRINGS.home.newProject; // 'New project' — the approved copy, not a literal

describe('createProject — folder naming', () => {
  it('creates the first project as «New project»', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    const created = await createProject();

    expect(created.folderName).toBe(BASE);
    expect(root.childDir(BASE).has('project.json')).toBe(true);
  });

  it('uniquifies as «New project 2», «New project 3», … against the root', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    const first = await createProject();
    const second = await createProject();
    const third = await createProject();

    // Observed: ['New project', 'New project 2', 'New project 3'].
    expect([first.folderName, second.folderName, third.folderName]).toEqual([
      `${BASE}`,
      `${BASE} 2`,
      `${BASE} 3`,
    ]);
  });

  it('NEVER adopts an existing folder — a pre-existing «New project» is left untouched', async () => {
    const root = new FakeDir('root');
    root.putFile(
      `${BASE}/project.json`,
      JSON.stringify({ schemaVersion: 1, marker: 'existing-work' }),
    );
    await installRoot(root);

    const created = await createProject();

    expect(created.folderName).toBe(`${BASE} 2`);
    // The existing folder's bytes are untouched (not even re-written).
    expect(root.textAt(`${BASE}/project.json`)).toBe(
      JSON.stringify({ schemaVersion: 1, marker: 'existing-work' }),
    );
    expect(root.childDir(BASE).has('project.json.tmp')).toBe(false);
  });

  it('bounds the probe and throws when every candidate name is taken', async () => {
    const root = new FakeDir('root');
    for (let n = 1; n <= MAX_NEW_PROJECT_NAMES; n += 1) {
      root.mkdir(n === 1 ? BASE : `${BASE} ${n}`);
    }
    await installRoot(root);

    await expect(createProject()).rejects.toThrow(
      `could not find a free project folder name after ${MAX_NEW_PROJECT_NAMES} attempts`,
    );
  });
});

describe('createProject — written envelope (§3.5 / D51)', () => {
  it('writes a project.json that round-trips through readProjectFile', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    const created = await createProject();
    const file = await readProjectFile(created.projectDir);

    expect(file).toEqual(created.projectFile);
    expect(file.schemaVersion).toBe(1);
    expect(file.sheets).toEqual([]);
    expect(file.project.id).toBe(created.id);
    expect(file.project.title).toBe(BASE);
    expect(file.project.unitSystem).toBe('imperial');
    expect(file.project.unitFormat).toBe('ft-in');
    expect(file.project.precisionDenominator).toBe(16);
  });

  it('an explicit title overrides the folder-derived title; the folder name stays generated', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    const created = await createProject({ title: 'Riverside Elementary' });

    expect(created.folderName).toBe(BASE);
    const file = await readProjectFile(created.projectDir);
    expect(file.project.title).toBe('Riverside Elementary');
  });

  it('is listed by scanProjects with the D51 key and title', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    const created = await createProject();
    const cards = await scanProjects();

    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe(`${created.id}:${BASE}`);
    expect(cards[0].id).toBe(created.id);
    expect(cards[0].folderName).toBe(BASE);
    expect(cards[0].title).toBe(BASE);
    expect(cards[0].sheetCount).toBe(0);
    expect(cards[0].status).toBe('ok');
  });

  it('leaves no *.tmp survivor (the atomic rename consumed it)', async () => {
    const root = new FakeDir('root');
    await installRoot(root);

    await createProject();

    expect(root.tmpPaths()).toEqual([]);
  });
});

describe('createProject — failure paths', () => {
  it('throws when no projects root is open (the caller treats it as a no-op)', async () => {
    await installNoRoot();

    await expect(createProject()).rejects.toThrow('no projects root is open');
  });
});
