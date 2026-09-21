/**
 * FirstRun component tests (implementation plan slice 0.3).
 *
 * jsdom has no IndexedDB and no File System Access API, so `idb-keyval` is
 * mocked with an in-memory Map and `showDirectoryPicker` is stubbed. No new
 * dependency is added (the dep list is closed, §2.2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirstRun from '../src/ui/FirstRun';
import { STRINGS } from '../src/ui/strings';

const { idbStore } = vi.hoisted(() => ({ idbStore: new Map<string, unknown>() }));

vi.mock('idb-keyval', () => ({
  get: async (key: string) => idbStore.get(key),
  set: async (key: string, value: unknown) => {
    idbStore.set(key, value);
  },
  del: async (key: string) => {
    idbStore.delete(key);
  },
  clear: async () => {
    idbStore.clear();
  },
  keys: async () => Array.from(idbStore.keys()),
  entries: async () => Array.from(idbStore.entries()),
}));

beforeEach(() => {
  idbStore.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FirstRun', () => {
  it('renders step 1 with Right pre-selected', () => {
    render(<FirstRun onDone={() => {}} />);

    expect(
      screen.getByRole('heading', { name: STRINGS.firstRun.handednessQuestion }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: STRINGS.firstRun.handednessRight }).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
    expect(
      screen.getByRole('radio', { name: STRINGS.firstRun.handednessLeft }).getAttribute(
        'aria-checked',
      ),
    ).toBe('false');
  });

  it('is completable by keyboard alone (Tab + Enter advances to step 2)', async () => {
    const user = userEvent.setup();
    render(<FirstRun onDone={() => {}} />);

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: STRINGS.firstRun.handednessRight }),
    );

    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { name: STRINGS.firstRun.projectsFolderQuestion }),
    ).toBeTruthy();
  });

  it('auto-advances and writes handedness when Left is chosen', async () => {
    const user = userEvent.setup();
    render(<FirstRun onDone={() => {}} />);

    await user.click(screen.getByRole('radio', { name: STRINGS.firstRun.handednessLeft }));

    expect(
      await screen.findByRole('heading', { name: STRINGS.firstRun.projectsFolderQuestion }),
    ).toBeTruthy();
    await waitFor(() => expect(idbStore.get('fm:settings:handedness')).toBe('left'));
  });

  it('step 2 shows the folder picker and persists the chosen handle', async () => {
    const handle = { name: 'FieldMeasure' } as unknown as FileSystemDirectoryHandle;
    const picker = vi.fn(async () => handle);
    vi.stubGlobal('showDirectoryPicker', picker);
    const onDone = vi.fn();

    const user = userEvent.setup();
    render(<FirstRun onDone={onDone} />);

    await user.click(screen.getByRole('radio', { name: STRINGS.firstRun.handednessRight }));

    const choose = await screen.findByRole('button', { name: STRINGS.firstRun.chooseFolder });
    expect(choose).toBeTruthy();
    expect(
      screen.getByRole('button', { name: STRINGS.firstRun.useDocumentsFolder }),
    ).toBeTruthy();

    await user.click(choose);

    await waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(picker).toHaveBeenCalledWith({
      id: 'fieldmeasure-projects',
      mode: 'readwrite',
      startIn: 'documents',
    });
    await waitFor(() => expect(idbStore.get('fm:projects-root')).toBe(handle));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
