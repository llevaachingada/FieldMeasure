/**
 * `tests/updateToast.test.tsx` — slice 1.11 (jsdom project).
 *
 * Proves the two things the slice exists for:
 *   1. **The update prompt never interrupts a measurement.** It is suppressed while a
 *      write is in flight, while a placement op is pending, and while the keypad sheet
 *      is open — and re-appears when each clears.
 *   2. **Reload is flush-first and honest.** `onReload` is called once; when it rejects
 *      (the flush could not land) the prompt stays and says so rather than pretending a
 *      reload happened.
 *
 * The real `onReload` (flush → settle → `updateServiceWorker`) is proved in
 * `tests/updateReload.test.ts`; the SW itself is a `[Surface]` gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { UpdateToast } from '../src/ui/UpdateToast';
import { STRINGS } from '../src/ui/strings';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { resetPersistenceBusy, setPersistenceBusy } from '../src/editor/session';

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  resetPersistenceBusy();
});

afterEach(() => {
  cleanup();
  useEditorStore.setState(createInitialEditorState());
  resetPersistenceBusy();
});

function renderToast(onReload: () => Promise<void> = async () => {}, needRefresh = true) {
  return render(createElement(UpdateToast, { needRefresh, onReload }));
}

describe('UpdateToast — suppression matrix (§19.2)', () => {
  it('renders a polite prompt when nothing is pending, with the approved body', () => {
    renderToast();

    const toast = screen.getByTestId('update-toast');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText(STRINGS.toasts.updateReady)).toBeTruthy();
    expect(screen.getByTestId('update-reload').textContent).toBe(STRINGS.toasts.updateReload);
    expect(screen.getByTestId('update-later').textContent).toBe(STRINGS.toasts.updateLater);
  });

  it('is suppressed while a placement op is pending and returns when it clears', () => {
    renderToast();
    expect(screen.getByTestId('update-toast')).toBeTruthy();

    act(() => useEditorStore.getState().setPendingOp('dimension'));
    expect(screen.queryByTestId('update-toast')).toBeNull();

    act(() => useEditorStore.getState().setPendingOp('none'));
    expect(screen.getByTestId('update-toast')).toBeTruthy();
  });

  it('is suppressed while a write is in flight and returns when it settles', () => {
    renderToast();
    expect(screen.getByTestId('update-toast')).toBeTruthy();

    act(() => setPersistenceBusy(true));
    expect(screen.queryByTestId('update-toast')).toBeNull();

    act(() => setPersistenceBusy(false));
    expect(screen.getByTestId('update-toast')).toBeTruthy();
  });

  it('is suppressed while the keypad sheet is open', () => {
    renderToast();

    act(() => useEditorStore.getState().setKeypadOpen(true));
    expect(screen.queryByTestId('update-toast')).toBeNull();

    act(() => useEditorStore.getState().setKeypadOpen(false));
    expect(screen.getByTestId('update-toast')).toBeTruthy();
  });

  it('shows nothing when there is no waiting worker', () => {
    renderToast(async () => {}, false);
    expect(screen.queryByTestId('update-toast')).toBeNull();
  });
});

describe('UpdateToast — Reload is flush-first and honest on failure', () => {
  it('runs onReload exactly once when Reload is tapped', async () => {
    const onReload = vi.fn(async () => {});
    renderToast(onReload);

    fireEvent.click(screen.getByTestId('update-reload'));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
  });

  it('keeps the prompt and says so when the flush rejects — it does not pretend to reload', async () => {
    const onReload = vi.fn(async () => {
      throw new Error('autosave did not settle cleanly (full)');
    });
    renderToast(onReload);

    fireEvent.click(screen.getByTestId('update-reload'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(STRINGS.storage.couldntSave),
    );
    expect(screen.getByTestId('update-toast')).toBeTruthy();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('Later dismisses the prompt without reloading', () => {
    const onReload = vi.fn(async () => {});
    renderToast(onReload);

    fireEvent.click(screen.getByTestId('update-later'));

    expect(screen.queryByTestId('update-toast')).toBeNull();
    expect(onReload).not.toHaveBeenCalled();
  });
});
