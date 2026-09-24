/**
 * `tests/errorBoundary.test.tsx` — D138 (L2), jsdom.
 *
 * Proves the whole-app / route fallback contract: no crash is ever a blank page,
 * "Back to Projects" only exists for the route variant with `onReset`, and the
 * chunk-load auto-reload fires at most once per `CHUNK_RELOAD_WINDOW_MS`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import {
  AppErrorBoundary,
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isChunkLoadError,
} from '../src/ui/ErrorBoundary';
import { STRINGS } from '../src/ui/strings';

const COPY = STRINGS.errorBoundary;

function Boom(): never {
  throw new Error('boom');
}

function ToggleBoom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="safe-child">ok</div>;
}

function ChunkBoom(): never {
  throw new Error('Failed to fetch dynamically imported module: /assets/x.js');
}

describe('AppErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <AppErrorBoundary variant="app">
        <div data-testid="child">hello</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('shows the fallback with no "Back to Projects" for variant="app"', () => {
    render(
      <AppErrorBoundary variant="app">
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(COPY.title);
    expect(screen.queryByText(COPY.backToProjects)).toBeNull();
  });

  it('variant="route" with onReset shows "Back to Projects" and clicking it resets and re-renders children', () => {
    function Harness() {
      const [shouldThrow, setThrow] = useState(true);
      return (
        <AppErrorBoundary variant="route" onReset={() => setThrow(false)}>
          <ToggleBoom shouldThrow={shouldThrow} />
        </AppErrorBoundary>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert').textContent).toContain(COPY.title);
    const backButton = screen.getByText(COPY.backToProjects);
    fireEvent.click(backButton);
    // onReset flips the flag; the boundary's own reset clears its caught error, so the
    // next render tries children again and now succeeds.
    expect(screen.getByTestId('safe-child')).toBeTruthy();
  });

  it('a chunk error reloads exactly once inside the reload window', () => {
    const reload = vi.fn();
    // A realistic non-zero base: `last` starts unset (0), so the FIRST call must clear
    // `now - 0 >= CHUNK_RELOAD_WINDOW_MS` to actually reload (real `Date.now()` always
    // does; a literal 0 here would not).
    let now = CHUNK_RELOAD_WINDOW_MS * 10;
    const { unmount } = render(
      <AppErrorBoundary variant="app" reload={reload} now={() => now}>
        <ChunkBoom />
      </AppErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(String(now));
    unmount();

    now += 10_000;
    render(
      <AppErrorBoundary variant="app" reload={reload} now={() => now}>
        <ChunkBoom />
      </AppErrorBoundary>,
    );
    // Still inside CHUNK_RELOAD_WINDOW_MS (60s) of the first attempt: no second reload.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('isChunkLoadError recognizes chunk-load failures and rejects an ordinary error', () => {
    const cases: ReadonlyArray<[unknown, boolean]> = [
      [new Error('Failed to fetch dynamically imported module: /assets/x.js'), true],
      [new Error('Importing a module script failed'), true],
      [(() => {
        const e = new Error('chunk load failed');
        e.name = 'ChunkLoadError';
        return e;
      })(), true],
      [new Error('boom'), false],
    ];
    for (const [error, expected] of cases) {
      expect(isChunkLoadError(error)).toBe(expected);
    }
  });
});
