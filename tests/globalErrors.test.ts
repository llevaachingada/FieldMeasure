/**
 * `tests/globalErrors.test.ts` — D138 (L2), node.
 *
 * Proves `installGlobalErrorHandlers`: one toast per rejection burst (deduped over
 * `GLOBAL_ERROR_DEDUPE_MS`), a cancelled operation (`AbortError`) raises nothing, and
 * the returned cleanup detaches the listener.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GLOBAL_ERROR_DEDUPE_MS, installGlobalErrorHandlers } from '../src/ui/globalErrors';
import { STRINGS } from '../src/ui/strings';

const ERROR_BOUNDARY_COPY = STRINGS.errorBoundary;
import { resetToastBus, subscribeToastMessage } from '../src/editor/session';

/** A fake `window` good enough for one event type, backed by a `Map` of listener sets. */
function createFakeTarget() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type: string, listener: EventListener): void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener): void {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string, event: unknown): void {
      for (const listener of listeners.get(type) ?? []) {
        (listener as (e: unknown) => void)(event);
      }
    },
    count(type: string): number {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

describe('installGlobalErrorHandlers', () => {
  afterEach(() => {
    resetToastBus();
  });

  it('raises one toast for a single unhandled rejection', () => {
    const target = createFakeTarget();
    const toasts: string[] = [];
    subscribeToastMessage((toast) => toasts.push(toast.text));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    installGlobalErrorHandlers(target, () => 1000);
    target.dispatch('unhandledrejection', { reason: new Error('boom') });

    expect(toasts).toEqual([ERROR_BOUNDARY_COPY.unexpected]);
    consoleErrorSpy.mockRestore();
  });

  it('an AbortError reason raises no toast', () => {
    const target = createFakeTarget();
    const toasts: string[] = [];
    subscribeToastMessage((toast) => toasts.push(toast.text));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    installGlobalErrorHandlers(target, () => 1000);
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    target.dispatch('unhandledrejection', { reason: abort });

    expect(toasts).toEqual([]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('two rejections 1s apart give one toast (deduped)', () => {
    const target = createFakeTarget();
    const toasts: string[] = [];
    subscribeToastMessage((toast) => toasts.push(toast.text));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let now = 0;
    installGlobalErrorHandlers(target, () => now);
    now = 1000;
    target.dispatch('unhandledrejection', { reason: new Error('one') });
    now = 2000; // 1s later, well under GLOBAL_ERROR_DEDUPE_MS (5s)
    target.dispatch('unhandledrejection', { reason: new Error('two') });

    expect(toasts).toEqual([ERROR_BOUNDARY_COPY.unexpected]);
    consoleErrorSpy.mockRestore();
  });

  it('two rejections 6s apart give two toasts', () => {
    const target = createFakeTarget();
    const toasts: string[] = [];
    subscribeToastMessage((toast) => toasts.push(toast.text));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let now = 0;
    installGlobalErrorHandlers(target, () => now);
    now = 1000;
    target.dispatch('unhandledrejection', { reason: new Error('one') });
    now = 1000 + GLOBAL_ERROR_DEDUPE_MS + 1000; // 6s later
    target.dispatch('unhandledrejection', { reason: new Error('two') });

    expect(toasts).toEqual([ERROR_BOUNDARY_COPY.unexpected, ERROR_BOUNDARY_COPY.unexpected]);
    consoleErrorSpy.mockRestore();
  });

  it('the returned cleanup detaches the listener', () => {
    const target = createFakeTarget();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const detach = installGlobalErrorHandlers(target, () => 1000);
    expect(target.count('unhandledrejection')).toBe(1);
    detach();
    expect(target.count('unhandledrejection')).toBe(0);

    consoleErrorSpy.mockRestore();
  });
});
