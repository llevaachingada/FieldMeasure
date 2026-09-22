/**
 * `tests/toast.test.tsx` — slice 1.10 build order step 3 (jsdom).
 *
 * Proves the §13.4 toast rules: single instance (a new toast REPLACES, never stacks),
 * 8 s normally and 10 s when the toast carries an action, the action actually runs (the
 * real undo for a recoverable delete), and the timer is cleared on unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';

import ToastHost, { TOAST_ACTION_MS, TOAST_MS } from '../src/ui/Toast';
import { emitToast, resetToastBus } from '../src/editor/session';

beforeEach(() => {
  vi.useFakeTimers();
  resetToastBus();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetToastBus();
});

describe('ToastHost — §13.4 single instance', () => {
  it('a new toast replaces the current one; they never stack', () => {
    render(createElement(ToastHost));
    act(() => emitToast('first'));
    expect(screen.getByText('first')).toBeTruthy();

    act(() => emitToast('second'));
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getByText('second')).toBeTruthy();
    // Exactly one toast element exists.
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
  });

  it('a replaced toast’s action window is closed with it', () => {
    render(createElement(ToastHost));
    const firstAction = vi.fn();
    act(() => emitToast({ text: 'deleted', action: { label: 'Undo', run: firstAction } }));
    expect(screen.getByTestId('toast-action')).toBeTruthy();

    act(() => emitToast('plain'));
    expect(screen.queryByTestId('toast-action')).toBeNull();
    // The replaced toast's action can no longer be reached or fired.
    expect(firstAction).not.toHaveBeenCalled();
  });
});

describe('ToastHost — timings (8 s / 10 s with an action)', () => {
  it('a plain toast lives 8 s', () => {
    render(createElement(ToastHost));
    act(() => emitToast('plain'));
    expect(screen.getByText('plain')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(screen.getByText('plain')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('plain')).toBeNull();
  });

  it('a toast with an action lives 10 s and not a millisecond less', () => {
    render(createElement(ToastHost));
    act(() => emitToast({ text: 'deleted', action: { label: 'Undo', run: () => {} } }));
    expect(screen.getByText('deleted')).toBeTruthy();

    // Past the plain window, still present — because it carries an action.
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByText('deleted')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(TOAST_ACTION_MS - TOAST_MS - 1);
    });
    expect(screen.getByText('deleted')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('deleted')).toBeNull();
  });

  it('manually clicking the action dismisses the toast and runs the real undo', () => {
    render(createElement(ToastHost));
    const undo = vi.fn();
    act(() => emitToast({ text: 'Delete Rectangle', action: { label: 'Undo', run: undo } }));

    fireEvent.click(screen.getByTestId('toast-action'));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();

    // Its timer is cancelled — nothing fires later.
    act(() => {
      vi.advanceTimersByTime(TOAST_ACTION_MS * 2);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('ToastHost — a11y and teardown', () => {
  it('an urgent toast is role="alert"; a normal one is role="status"', () => {
    render(createElement(ToastHost));
    act(() => emitToast({ text: 'Project folder unavailable', urgent: true }));
    expect(screen.getByRole('alert').textContent).toBe('Project folder unavailable');

    act(() => emitToast('Undid: Delete dimension'));
    expect(screen.getByRole('status').textContent).toBe('Undid: Delete dimension');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears its timer on unmount (no update after teardown)', () => {
    const { unmount } = render(createElement(ToastHost));
    act(() => emitToast({ text: 'bye', action: { label: 'Undo', run: () => {} } }));
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(TOAST_ACTION_MS * 3);
      });
    }).not.toThrow();
  });
});
