/**
 * tests/projectsRoot.test.ts — `pickProjectsFolder` (D139, L3).
 *
 * `showDirectoryPicker` is stubbed directly on `globalThis` and `idb-keyval` is mocked as an
 * in-memory Map so persistence is observable (same pattern as `tests/rootAccess.test.ts`).
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
  pickProjectsFolder,
  supportsFolderPicker,
  PROJECTS_ROOT_KEY,
  PROJECTS_CHILD_FOLDER,
} from '../src/settings/projectsRoot';
import { FakeDir, asDir } from './fakes/fsa';

type Picker = (options?: unknown) => Promise<FileSystemDirectoryHandle>;

beforeEach(() => {
  idbStore.clear();
});

afterEach(() => {
  delete (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
});

describe('pickProjectsFolder', () => {
  it('creates a FieldMeasure child when ensureChild is given and the picked folder is not it', async () => {
    const documents = new FakeDir('Documents');
    globalThis.showDirectoryPicker = (async () => asDir(documents)) as unknown as typeof globalThis.showDirectoryPicker;

    const result = await pickProjectsFolder({ ensureChild: PROJECTS_CHILD_FOLDER });

    expect(result?.name).toBe('FieldMeasure');
    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(result);
    // The child really was created under the picked folder.
    expect(documents.childDir('FieldMeasure')).toBeTruthy();
  });

  it('persists a folder already named FieldMeasure (any case) with no child created', async () => {
    const picked = new FakeDir('fieldmeasure');
    globalThis.showDirectoryPicker = (async () => asDir(picked)) as unknown as typeof globalThis.showDirectoryPicker;

    const result = await pickProjectsFolder({ ensureChild: PROJECTS_CHILD_FOLDER });

    expect(result?.name).toBe('fieldmeasure');
    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(picked));
    expect(picked.children.size).toBe(0);
  });

  it('with no options, persists the picked folder as-is', async () => {
    const picked = new FakeDir('Whatever');
    globalThis.showDirectoryPicker = (async () => asDir(picked)) as unknown as typeof globalThis.showDirectoryPicker;

    const result = await pickProjectsFolder();

    expect(result).toBe(asDir(picked));
    expect(idbStore.get(PROJECTS_ROOT_KEY)).toBe(asDir(picked));
  });

  it('returns null on AbortError', async () => {
    globalThis.showDirectoryPicker = (async () => {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    }) as unknown as typeof globalThis.showDirectoryPicker;

    const result = await pickProjectsFolder();

    expect(result).toBeNull();
    expect(idbStore.has(PROJECTS_ROOT_KEY)).toBe(false);
  });

  it('rethrows any other error', async () => {
    globalThis.showDirectoryPicker = (async () => {
      throw new Error('boom');
    }) as unknown as typeof globalThis.showDirectoryPicker;

    await expect(pickProjectsFolder()).rejects.toThrow('boom');
  });
});

describe('supportsFolderPicker', () => {
  it('is false when showDirectoryPicker is undefined', () => {
    delete (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
    expect(supportsFolderPicker()).toBe(false);
  });

  it('is true when showDirectoryPicker is a function', () => {
    globalThis.showDirectoryPicker = (async () => asDir(new FakeDir('x'))) as unknown as typeof globalThis.showDirectoryPicker;
    expect(supportsFolderPicker()).toBe(true);
  });
});
