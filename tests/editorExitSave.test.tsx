/**
 * `tests/editorExitSave.test.tsx` — D137: save-on-exit (jsdom).
 *
 * Root cause proved fixed here (plan §4, L1, review F1): `SheetEditor`'s old cleanup called
 * `void persist.flush()` without awaiting it, then synchronously released the writer lease and
 * closed the broadcast channel. The flush's write resolves the project directory after an
 * `await`, and by the time it got there the lease/channel/registry were already gone, so the
 * coalesced write threw and the last edit was lost (F1: markup.json had 0 objects after ~16 s).
 *
 * This file proves the SHELL half of the fix (`EditorLayout`'s `exitAfterSave`): every exit
 * request — the breadcrumb, the top bar, `Esc` — now AWAITS the editor session's `flush()`
 * before calling `onExit`, times out generously, warns and retries-on-next-tap on failure, and
 * is idempotent against a double tap.
 *
 * `SheetEditor` is stubbed exactly as `tests/editorShell.test.tsx` stubs it: this file is about
 * the shell's exit sequencing, not the canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Fragment, createElement } from 'react';
import ToastHost from '../src/ui/Toast';

// Stub the canvas surface (Konva needs a real canvas; jsdom has none) — copied verbatim from
// `tests/editorShell.test.tsx` so both files stub the same seam identically.
vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: (props: {
      onImportReady?: (trigger: () => void) => void;
      onTakePhoto?: () => void;
    }) => {
      React.useEffect(() => {
        props.onImportReady?.(() => {
          (globalThis as { __fmImportTriggered?: boolean }).__fmImportTriggered = true;
        });
      }, [props.onImportReady]);
      React.useEffect(() => {
        (globalThis as { __fmTakePhotoTrigger?: () => void }).__fmTakePhotoTrigger =
          props.onTakePhoto;
      }, [props.onTakePhoto]);
      return React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' });
    },
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import {
  resetToastBus,
  setEditorSession,
  subscribeToastMessage,
  type EditorSession,
  type ToastMessage,
} from '../src/editor/session';
import { STRINGS } from '../src/ui/strings';

/** jsdom's `innerWidth`/`innerHeight` are read-only getters; redefine them. */
function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

/** Composed exactly as `App` composes it: the toast host lives at the shell root (review F1). */
function renderLayout(overrides: Record<string, unknown> = {}) {
  return render(
    createElement(
      Fragment,
      null,
      createElement(EditorLayout, {
        projectId: 'p:f',
        folderName: 'Riverside',
        onExit: () => {},
        ...overrides,
      }),
      createElement(ToastHost),
    ),
  );
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Every `EditorSession` method as a spy, so a test can override just the one it drives. */
function makeStubSession(overrides: Partial<EditorSession> = {}): EditorSession {
  return {
    undo: vi.fn(() => null),
    redo: vi.fn(() => null),
    deleteSelection: vi.fn(() => null),
    nudgeSelection: vi.fn(() => null),
    cancelPending: vi.fn(),
    requestValue: vi.fn(),
    adjustEndpoints: vi.fn(),
    applyStylePatch: vi.fn(),
    applyStyle: vi.fn(),
    applyProjectPrecision: vi.fn(),
    applyProjectUnitFormat: vi.fn(),
    retrySave: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  setViewport(1240, 908);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setEditorSession(null);
  resetToastBus();
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

const projectsCrumb = (): HTMLElement =>
  screen.getByRole('button', { name: STRINGS.editor.breadcrumbProjects });

describe('D137: save-on-exit (EditorLayout exitAfterSave)', () => {
  it('waits for autosave before leaving', async () => {
    const flushDeferred = deferred<void>();
    setEditorSession(makeStubSession({ flush: () => flushDeferred.promise }));
    const onExit = vi.fn();
    renderLayout({ onExit });

    await act(async () => {
      projectsCrumb().click();
    });
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      flushDeferred.resolve();
    });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('stays and warns when autosave fails, then leaves on the second request', async () => {
    const flushDeferred = deferred<void>();
    setEditorSession(makeStubSession({ flush: () => flushDeferred.promise }));
    const onExit = vi.fn();
    renderLayout({ onExit });

    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));

    await act(async () => {
      projectsCrumb().click();
    });
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      flushDeferred.reject(new Error('write parked'));
      // Let the rejection propagate through the awaited `Promise.race`.
      await Promise.resolve().then(() => Promise.resolve());
    });

    expect(onExit).not.toHaveBeenCalled();
    expect(toasts.some((toast) => toast.text === STRINGS.editor.exitSaveFailed)).toBe(true);

    await act(async () => {
      projectsCrumb().click();
    });
    expect(onExit).toHaveBeenCalledTimes(1);

    off();
  });

  it('a double tap does not exit twice', async () => {
    const flushDeferred = deferred<void>();
    setEditorSession(makeStubSession({ flush: () => flushDeferred.promise }));
    const onExit = vi.fn();
    renderLayout({ onExit });

    await act(async () => {
      projectsCrumb().click();
      projectsCrumb().click();
    });
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      flushDeferred.resolve();
    });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('leaves immediately when there is no editor session', async () => {
    setEditorSession(null);
    const onExit = vi.fn();
    renderLayout({ onExit });

    await act(async () => {
      projectsCrumb().click();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
