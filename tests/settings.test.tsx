/**
 * Settings component tests (implementation plan slice 0.3).
 *
 * jsdom has no IndexedDB, so `idb-keyval` is mocked with an in-memory Map. The
 * zustand store is a module global, so it is reset between tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../src/ui/Settings';
import { STRINGS } from '../src/ui/strings';
import { createInitialAppState, useAppStore } from '../src/state/appStore';

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
  useAppStore.setState(createInitialAppState());
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Render Settings and wait for the persisted values to hydrate. */
async function renderSettings(): Promise<void> {
  const { container } = render(<Settings onBack={() => {}} />);
  await waitFor(() =>
    expect(container.querySelector('main.settings')?.getAttribute('data-hydrated')).toBe('true'),
  );
}

const switchFor = (label: string) => screen.getByRole('switch', { name: label });

describe('Settings', () => {
  it('renders the five input toggles with their documented defaults', async () => {
    await renderSettings();

    expect(switchFor(STRINGS.settings.touchPlaces).getAttribute('aria-checked')).toBe('true');
    expect(switchFor(STRINGS.settings.fingerDraws).getAttribute('aria-checked')).toBe('false');
    expect(switchFor(STRINGS.settings.magnifierOnTap).getAttribute('aria-checked')).toBe('true');
    expect(switchFor(STRINGS.settings.glovedTouch).getAttribute('aria-checked')).toBe('false');
    expect(switchFor(STRINGS.settings.penOnly).getAttribute('aria-checked')).toBe('false');
  });

  it('persists handedness and reads it back on reload', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.click(screen.getByRole('radio', { name: STRINGS.firstRun.handednessLeft }));
    await waitFor(() => expect(idbStore.get('fm:settings:handedness')).toBe('left'));

    // Simulate a reload: drop in-memory store state and re-hydrate from idb.
    cleanup();
    useAppStore.setState(createInitialAppState());
    await renderSettings();

    expect(
      screen.getByRole('radio', { name: STRINGS.firstRun.handednessLeft }).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
  });

  it('persists the five toggles and reads them back on reload', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.click(switchFor(STRINGS.settings.fingerDraws));
    await waitFor(() => expect(idbStore.get('fm:settings:input:fingerDraws')).toBe(true));

    await user.click(switchFor(STRINGS.settings.touchPlaces));
    await waitFor(() => expect(idbStore.get('fm:settings:input:touchPlaces')).toBe(false));

    // Simulate a reload: drop in-memory store state and re-hydrate from idb.
    cleanup();
    useAppStore.setState(createInitialAppState());
    await renderSettings();

    expect(switchFor(STRINGS.settings.fingerDraws).getAttribute('aria-checked')).toBe('true');
    expect(switchFor(STRINGS.settings.touchPlaces).getAttribute('aria-checked')).toBe('false');
    expect(switchFor(STRINGS.settings.magnifierOnTap).getAttribute('aria-checked')).toBe('true');
    expect(switchFor(STRINGS.settings.glovedTouch).getAttribute('aria-checked')).toBe('false');
    expect(switchFor(STRINGS.settings.penOnly).getAttribute('aria-checked')).toBe('false');
  });

  // ── Slice 1.10 — the Display → Theme control (UI §14.2) ────────────────────

  const themeRadio = (label: string) => screen.getByRole('radio', { name: label });
  const themeChecked = (label: string) => themeRadio(label).getAttribute('aria-checked');

  it('exposes Theme as one exclusive radio group, defaulting to Standard', async () => {
    await renderSettings();

    // The group is labelled and its three options report their own state to AT.
    expect(screen.getByRole('radiogroup', { name: STRINGS.settings.rowTheme })).toBeTruthy();
    expect(themeChecked(STRINGS.settings.themeStandard)).toBe('true');
    expect(themeChecked(STRINGS.settings.themeSunlight)).toBe('false');
    expect(themeChecked(STRINGS.settings.themeDim)).toBe('false');
  });

  it('persists the chosen theme and reports it after a reload', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.click(themeRadio(STRINGS.settings.themeSunlight));
    await waitFor(() => expect(idbStore.get('fm:settings:theme')).toBe('sunlight'));

    // Exclusive: selecting Sunlight clears Standard and Dim.
    expect(themeChecked(STRINGS.settings.themeSunlight)).toBe('true');
    expect(themeChecked(STRINGS.settings.themeStandard)).toBe('false');
    expect(themeChecked(STRINGS.settings.themeDim)).toBe('false');

    // Simulate a reload: drop in-memory store state and re-hydrate from idb.
    cleanup();
    useAppStore.setState(createInitialAppState());
    await renderSettings();

    expect(themeChecked(STRINGS.settings.themeSunlight)).toBe('true');
    expect(themeChecked(STRINGS.settings.themeStandard)).toBe('false');
    expect(themeChecked(STRINGS.settings.themeDim)).toBe('false');
  });
});
