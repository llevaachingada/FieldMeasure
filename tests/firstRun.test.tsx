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
  // D139: FirstRun shows an unsupported-browser notice when the File System Access picker is
  // missing, and jsdom has none. The real target (Edge/Chromium) always does, so every case gets a
  // cancelling picker by default; a case that needs a pick or the unsupported path overrides it.
  // Scoped to this file, not tests/setup.ts: the storage layer picks its backend on the same probe.
  vi.stubGlobal('showDirectoryPicker', vi.fn(async () => {
    throw new DOMException('The user aborted a request.', 'AbortError');
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FirstRun', () => {
  it('renders step 1 with Right pre-selected, and Left is the LEFT-hand card', () => {
    render(<FirstRun onDone={() => {}} />);

    expect(
      screen.getByRole('heading', { name: STRINGS.firstRun.handednessQuestion }),
    ).toBeTruthy();
    // Order is part of the design (owner decision, session 13): the card for a hand sits on that
    // hand's side of the screen. jsdom has no layout, so the DOM order IS the assertion — the
    // visual order follows it, and so does the focus order (which is exactly why the elements are
    // ordered rather than flipped with CSS `row-reverse`).
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      STRINGS.firstRun.handednessLeft,
      STRINGS.firstRun.handednessRight,
    ]);
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

  it('is completable by keyboard alone (Tab reaches the first card, Enter advances to step 2)', async () => {
    const user = userEvent.setup();
    render(<FirstRun onDone={() => {}} />);

    // The first Tab lands on the FIRST card in DOM order — which is the LEFT-hand card, so the
    // focus ring travels left-to-right with the reading order.
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: STRINGS.firstRun.handednessLeft }),
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

  // D139 (L3): added cases only — the suite above is unchanged.

  it('shows the unsupported-browser notice and no step buttons when showDirectoryPicker is undefined', () => {
    // The file-level default picker (beforeEach) is removed here: this case IS the unsupported path.
    vi.stubGlobal('showDirectoryPicker', undefined);
    render(<FirstRun onDone={() => {}} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: "This browser can't save to folders" }),
    ).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows pickFailed and stays on step 2 when the picker rejects with a real error', async () => {
    const picker = vi.fn(async () => {
      throw new Error('disk error');
    });
    vi.stubGlobal('showDirectoryPicker', picker);
    const onDone = vi.fn();

    const user = userEvent.setup();
    render(<FirstRun onDone={onDone} />);

    await user.click(screen.getByRole('radio', { name: STRINGS.firstRun.handednessRight }));
    const choose = await screen.findByRole('button', { name: STRINGS.firstRun.chooseFolder });
    await user.click(choose);

    expect(
      await screen.findByText("Couldn't use that folder. Choose a different one."),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: STRINGS.firstRun.projectsFolderQuestion }),
    ).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not show pickFailed when the picker is cancelled (AbortError)', async () => {
    const picker = vi.fn(async () => {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    });
    vi.stubGlobal('showDirectoryPicker', picker);
    const onDone = vi.fn();

    const user = userEvent.setup();
    render(<FirstRun onDone={onDone} />);

    await user.click(screen.getByRole('radio', { name: STRINGS.firstRun.handednessRight }));
    const choose = await screen.findByRole('button', { name: STRINGS.firstRun.chooseFolder });
    await user.click(choose);

    await waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't use that folder. Choose a different one."),
    ).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
