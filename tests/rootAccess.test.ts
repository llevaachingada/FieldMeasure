/**
 * tests/rootAccess.test.ts — the projects-root handle must survive the owner's real loop:
 * take pictures → lose the grant → recover → relaunch, WITHOUT re-choosing the folder in Settings.
 *
 * Covers the three store-side defects behind "I have to reset the folder location every time":
 *   1. `ensureStoreReady` cached a root-less backend forever (a scan before the first pick).
 *   2. The capture overlay's «Re-pick folder» persisted WHATEVER was picked — typically the
 *      project folder itself — silently replacing the projects root (`pickRoot({ mustContain })`).
 *   3. Adopting a picked root now happens in place (and asks for persistent storage), so the
 *      picker's fresh grant is used instead of being thrown away by a reload.
 *
 * `showDirectoryPicker` is installed so `chooseBackend()` picks the FSA backend, which reads the
 * handle from idb-keyval — mocked here as a Map (the same pattern as tests/settings.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { idbStore } = vi.hoisted(() => ({ idbStore: new Map<string, unknown>() }));

vi.mock('idb-keyval', () => ({
  get: async (key: string) => idbStore.get(key),
  set: async (key: string, value: unknown) => {
    idbStore.set(key, value);
  },
}));

import {
  adoptProjectsRoot,
  getRootDir,
  initStore,
  pickRoot,
  RootMismatchError,
} from '../src/fs/projectStore';
import { PROJECTS_ROOT_KEY } from '../src/settings/projectsRoot';
import { FakeDir, asDir, installFakeNavigator, validProjectFile } from './fakes/fsa';

type Picker = (options?: unknown) => Promise<FileSystemDirectoryHandle>;

function installPicker(pick: () => FakeDir): ReturnType<typeof vi.fn> {
  const picker = vi.fn(async () => asDir(pick()));
  (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker = picker as unknown as Picker;
  return picker;
}

/** A projects root holding one project folder, `Riverside`. */
function projectsRoot(name = 'FieldMeasure'): FakeDir {
  const root = new FakeDir(name);
  root.putFile('Riverside/project.json', JSON.stringify(validProjectFile({ id: 'p1' })));
  return root;
}

/** `isSameEntry` by object identity — enough to model "the user picked the same folder". */
function withIdentity(dir: FakeDir): FakeDir {
  Object.assign(dir, { isSameEntry: async (other: unknown) => other === dir });
  return dir;
}

let persistCalls = 0;
let restoreNavigator: (() => void) | null = null;

beforeEach(() => {
  idbStore.clear();
  persistCalls = 0;
  restoreNavigator = installFakeNavigator({
    storage: {
      persisted: async () => false,
      persist: async () => {
        persistCalls += 1;
        return true;
      },
    },
  });
  // `chooseBackend()` only looks for the picker on `window` (absent in the node project).
  (globalThis as { window?: unknown }).window = globalThis;
});

afterEach(() => {
  delete (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  delete (globalThis as { window?: unknown }).window;
  restoreNavigator?.();
  restoreNavigator = null;
});

describe('ensureStoreReady never caches "no root" (a scan before the first pick)', () => {
  it('re-reads the persisted handle once one exists', async () => {
    installPicker(() => projectsRoot());
    await initStore(); // first run: nothing persisted yet
    expect(await getRootDir()).toBeNull();

    const root = projectsRoot();
    idbStore.set(PROJECTS_ROOT_KEY, asDir(root)); // FirstRun persisted a pick

    expect(await getRootDir()).toBe(asDir(root));
  });
});

describe('adoptProjectsRoot — in place, never a reload', () => {
  it('persists the handle, re-inits the store on it, and asks for persistent storage', async () => {
    installPicker(() => projectsRoot());
    const old = projectsRoot('Old');
    idbStore.set(PROJECTS_ROOT_KEY, asDir(old));
    await initStore();

    const next = projectsRoot('New');
    await adoptProjectsRoot(asDir(next));

    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(next));
    expect(await getRootDir()).toBe(asDir(next));
    expect(persistCalls).toBe(1);
  });
});

describe('pickRoot({ mustContain }) — the capture overlay re-pick cannot replace the root', () => {
  it('REFUSES the project folder itself and leaves the saved root untouched', async () => {
    const root = withIdentity(projectsRoot());
    idbStore.set(PROJECTS_ROOT_KEY, asDir(root));
    await initStore();
    // The natural mistake from inside a project: picking `Riverside`, not its parent.
    const projectFolder = new FakeDir('Riverside');
    projectFolder.putFile('project.json', JSON.stringify(validProjectFile({ id: 'p1' })));
    installPicker(() => projectFolder);

    await expect(pickRoot({ mustContain: 'Riverside' })).rejects.toBeInstanceOf(RootMismatchError);

    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(root));
    expect(await getRootDir()).toBe(asDir(root));
  });

  it('accepts the same root folder again (a fresh grant on the same folder)', async () => {
    const root = withIdentity(projectsRoot());
    idbStore.set(PROJECTS_ROOT_KEY, asDir(root));
    await initStore();
    installPicker(() => root);

    await pickRoot({ mustContain: 'Riverside' });

    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(root));
  });

  it('accepts a different folder that contains the open project (the root was moved)', async () => {
    const root = projectsRoot('Old');
    idbStore.set(PROJECTS_ROOT_KEY, asDir(root));
    await initStore();
    const moved = projectsRoot('Moved');
    installPicker(() => moved);

    await pickRoot({ mustContain: 'Riverside' });

    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(moved));
    expect(await getRootDir()).toBe(asDir(moved));
  });

  it('an unguarded pick (Home / Settings) adopts whatever the user chose', async () => {
    idbStore.set(PROJECTS_ROOT_KEY, asDir(projectsRoot('Old')));
    await initStore();
    const other = new FakeDir('Elsewhere');
    installPicker(() => other);

    await pickRoot();

    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(other));
  });
});
