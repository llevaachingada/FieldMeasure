/**
 * Watermark runtime tests (UI/GUI handoff pass, 2026-09-22). Mirrors
 * `themeRuntime.test.tsx`: proves the hydrate-once-at-boot lifecycle
 * `WatermarkOverlay` depends on, and that the overlay renders nothing (not even a
 * hidden node) once the value is known to be off — a settings-off watermark must
 * be an absent node, not a display:none one, so it can never be mistaken for live
 * chrome by anything that queries the DOM.
 *
 * jsdom has no IndexedDB, so `idb-keyval` is mocked with an in-memory Map — the
 * same seam `settings.test.tsx`/`themeRuntime.test.tsx` use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

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

import { useWatermarkRuntime } from '../src/ui/watermarkRuntime';
import WatermarkOverlay from '../src/ui/WatermarkOverlay';
import { createInitialAppState, useAppStore } from '../src/state/appStore';

function WatermarkHost() {
  useWatermarkRuntime();
  return <WatermarkOverlay />;
}

const overlay = () => document.querySelector('.watermark-overlay');

beforeEach(() => {
  idbStore.clear();
  useAppStore.setState(createInitialAppState());
});

afterEach(() => {
  cleanup();
});

describe('watermark runtime', () => {
  it('renders the mark on a fresh profile (default on)', async () => {
    render(<WatermarkHost />);
    await waitFor(() => expect(overlay()).toBeTruthy());
    expect(useAppStore.getState().watermarkEnabled).toBe(true);
  });

  it('is a decorative, non-interactive node', async () => {
    render(<WatermarkHost />);
    await waitFor(() => expect(overlay()).toBeTruthy());
    expect(overlay()!.getAttribute('aria-hidden')).toBe('true');
    const img = overlay()!.querySelector('img')!;
    // Alt text is empty (aria-hidden already removes it from the tree) — a non-empty
    // alt on a purely decorative image would be read aloud if aria-hidden were ever
    // dropped, which is exactly the trap this asserts against.
    expect(img.getAttribute('alt')).toBe('');
  });

  it('hydrates a persisted "off" choice and renders nothing at all', async () => {
    idbStore.set('fm:settings:watermark', false);
    render(<WatermarkHost />);

    await waitFor(() => expect(useAppStore.getState().watermarkEnabled).toBe(false));
    expect(overlay()).toBeNull();
  });

  it('reacts live to a store change (Settings toggling it off, then back on)', async () => {
    render(<WatermarkHost />);
    await waitFor(() => expect(overlay()).toBeTruthy());

    act(() => useAppStore.getState().setWatermarkEnabled(false));
    await waitFor(() => expect(overlay()).toBeNull());

    act(() => useAppStore.getState().setWatermarkEnabled(true));
    await waitFor(() => expect(overlay()).toBeTruthy());
  });
});
