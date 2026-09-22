/**
 * Display-theme runtime tests (slice 1.10; UI §14.2).
 *
 * Proves the root attribute lifecycle that the CSS theme blocks depend on:
 *   - a fresh profile leaves the root on `standard` (no override → shipped look),
 *   - the persisted choice is hydrated and applied on boot,
 *   - a store change (Settings → `setTheme`) re-applies it live,
 *   - remounting after a reload re-applies the persisted choice.
 *
 * jsdom has no IndexedDB, so `idb-keyval` is mocked with an in-memory Map — the
 * same seam `settings.test.tsx` uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import Settings from '../src/ui/Settings';
import { useThemeRuntime } from '../src/ui/themeRuntime';
import { STRINGS } from '../src/ui/strings';
import { createInitialAppState, useAppStore } from '../src/state/appStore';

/** The root attribute is the whole contract; read it the way styles.css matches it. */
const themeAttribute = (): string | null => document.documentElement.getAttribute('data-theme');

function ThemeHost(): null {
  useThemeRuntime();
  return null;
}

beforeEach(() => {
  idbStore.clear();
  useAppStore.setState(createInitialAppState());
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme runtime', () => {
  it('leaves a fresh profile on Standard (the shipped look)', async () => {
    render(<ThemeHost />);
    await waitFor(() => expect(themeAttribute()).toBe('standard'));
    expect(useAppStore.getState().theme).toBe('standard');
  });

  it('hydrates the persisted theme on boot', async () => {
    idbStore.set('fm:settings:theme', 'sunlight');
    render(<ThemeHost />);

    await waitFor(() => expect(themeAttribute()).toBe('sunlight'));
    expect(useAppStore.getState().theme).toBe('sunlight');
  });

  it('re-applies the persisted theme on remount (reload)', async () => {
    idbStore.set('fm:settings:theme', 'dim');
    render(<ThemeHost />);
    await waitFor(() => expect(themeAttribute()).toBe('dim'));

    // Reload: drop in-memory store state, clear the DOM attribute, mount again.
    cleanup();
    useAppStore.setState(createInitialAppState());
    document.documentElement.removeAttribute('data-theme');

    render(<ThemeHost />);
    await waitFor(() => expect(themeAttribute()).toBe('dim'));
  });

  it('re-applies on a store theme change', async () => {
    render(<ThemeHost />);
    await waitFor(() => expect(themeAttribute()).toBe('standard'));

    act(() => useAppStore.getState().setTheme('sunlight'));
    await waitFor(() => expect(themeAttribute()).toBe('sunlight'));

    act(() => useAppStore.getState().setTheme('dim'));
    await waitFor(() => expect(themeAttribute()).toBe('dim'));
  });

  it('applies the root attribute when Settings selects a theme, and persists it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeHost />
        <Settings onBack={() => {}} />
      </>,
    );
    await waitFor(() =>
      expect(document.querySelector('main.settings[data-hydrated="true"]')).toBeTruthy(),
    );

    await user.click(screen.getByRole('radio', { name: STRINGS.settings.themeSunlight }));

    await waitFor(() => expect(themeAttribute()).toBe('sunlight'));
    await waitFor(() => expect(idbStore.get('fm:settings:theme')).toBe('sunlight'));
  });
});
