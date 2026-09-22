/**
 * `tests/storageChip.test.tsx` (jsdom) — the UI §11.4 normal-state storage pill.
 *
 * `@/fs/projectSize` is mocked so the component is driven by controlled measurements; the
 * REAL `formatBytes` is kept (via `importOriginal`) so the rendered `{size}` is the shipped
 * formatter's output, not a test-local stub.
 *
 * Pins the honesty contract: the pill exists only for a real measurement that carries a real
 * save time; pending and failed measurements render NOTHING (no spinner, no `0 B`, no
 * fabricated time). Also pins re-measure-on-`refreshKey`, stale-result rejection, and the
 * no-inline-styles rule (`[style]` count === 0).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

vi.mock('@/fs/projectSize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/projectSize')>();
  return { ...actual, measureProjectSize: vi.fn() };
});

import StorageChip from '../src/ui/StorageChip';
import { measureProjectSize, type ProjectSize } from '@/fs/projectSize';
import { STRINGS, t } from '../src/ui/strings';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 176 MB — the chip example's size (`184549376 / 1048576 = 176`). */
const BYTES = 184549376;
/** A local-time ISO with no zone: `clockLabel` reads local hours, so this is `2:14 PM` anywhere. */
const SAVED = '2026-09-22T14:14:00';

const MEASURED: ProjectSize = { bytes: BYTES, savedAt: SAVED, fileCount: 7 };

const expectedText = (size: string, time: string): string =>
  t(STRINGS.storage.local, { size, time });

describe('StorageChip — UI §11.4 normal state', () => {
  it('renders the measured size and the real save time, with no inline styles', async () => {
    vi.mocked(measureProjectSize).mockResolvedValue(MEASURED);
    const { container } = render(
      createElement(StorageChip, { projectId: 'p1:Riverside', refreshKey: 0 }),
    );

    const pill = await screen.findByRole('status');
    const expected = expectedText('176 MB', '2:14 PM');
    expect(pill.textContent).toBe(expected);
    // The whole text is the accessible name; the dot is decorative.
    expect(pill.getAttribute('aria-label')).toBe(expected);
    const dot = pill.querySelector('.storage-chip-dot');
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    // CSP `style-src 'self'` — the e2e suite asserts this too.
    expect(container.querySelectorAll('[style]').length).toBe(0);
  });

  it('renders nothing while the measurement is pending', () => {
    vi.mocked(measureProjectSize).mockReturnValue(new Promise<ProjectSize>(() => {}));
    const { container } = render(createElement(StorageChip, { projectId: 'p1:Riverside' }));

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the measurement fails', async () => {
    vi.mocked(measureProjectSize).mockRejectedValue(new Error('folder unreadable'));
    const { container } = render(createElement(StorageChip, { projectId: 'p1:Riverside' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when there is no real save time (never invents one)', async () => {
    vi.mocked(measureProjectSize).mockResolvedValue({ bytes: BYTES, savedAt: null, fileCount: 7 });
    const { container } = render(createElement(StorageChip, { projectId: 'p1:Riverside' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('re-measures when refreshKey changes and ignores a stale resolution', async () => {
    const first = deferred<ProjectSize>();
    const second = deferred<ProjectSize>();
    vi.mocked(measureProjectSize).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender } = render(
      createElement(StorageChip, { projectId: 'p1:Riverside', refreshKey: 0 }),
    );
    expect(vi.mocked(measureProjectSize)).toHaveBeenCalledTimes(1);

    rerender(createElement(StorageChip, { projectId: 'p1:Riverside', refreshKey: 1 }));
    expect(vi.mocked(measureProjectSize)).toHaveBeenCalledTimes(2);

    // The NEW measurement resolves first: 1048576 bytes → '1 MB', 09:05 → '9:05 AM'.
    await act(async () => {
      second.resolve({ bytes: 1048576, savedAt: '2026-09-22T09:05:00', fileCount: 1 });
    });
    expect(screen.getByRole('status').textContent).toBe(expectedText('1 MB', '9:05 AM'));

    // ...then the STALE one arrives; it must not overwrite the fresh value.
    await act(async () => {
      first.resolve(MEASURED);
    });
    expect(screen.getByRole('status').textContent).toBe(expectedText('1 MB', '9:05 AM'));
  });
});
