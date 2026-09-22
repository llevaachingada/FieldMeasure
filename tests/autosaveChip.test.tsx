/**
 * `tests/autosaveChip.test.tsx` — slice 1.10 build order step 1 (jsdom).
 *
 * Proves the §13.1 chip states from the queue-owned status, and the two rules that
 * matter most:
 *   - it renders NOTHING before a write resolves (never an optimistic "Saved",
 *     do-not-simplify #14) and shows "Saved {time}" only after a `saving → saved`
 *     transition — i.e. the write promise resolved;
 *   - the Error state offers an actionable Retry (48 px + hit-slop) and does nothing
 *     itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

import AutosaveChip, { formatClock } from '../src/ui/AutosaveChip';
import type { StorageStatus } from '../src/state/appStore';
import { STRINGS, t } from '../src/ui/strings';

afterEach(cleanup);

describe('AutosaveChip — the §13.1 states', () => {
  it('renders nothing for the initial `saved` (no write has resolved yet)', () => {
    const { container } = render(createElement(AutosaveChip, { status: 'saved' }));
    expect(container.querySelector('[data-testid="autosave-chip"]')).toBeNull();
    expect(container.textContent).not.toMatch(/saved/i);
  });

  it('shows "Saved {time}" only after a real saving → saved transition', () => {
    const { container, rerender } = render(createElement(AutosaveChip, { status: 'saved' }));
    expect(container.querySelector('[data-testid="autosave-chip"]')).toBeNull();

    rerender(createElement(AutosaveChip, { status: 'saving' }));
    expect(screen.getByText(STRINGS.storage.saving)).toBeTruthy();

    rerender(createElement(AutosaveChip, { status: 'saved' }));
    const shown = screen.getByRole('status');
    expect(shown.textContent).toMatch(/^Saved \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('renders the four truthful non-saved states', () => {
    const cases: ReadonlyArray<[StorageStatus, string, string]> = [
      ['pending', STRINGS.storage.pending, 'pending'],
      ['readonly', STRINGS.storage.readOnly, 'readonly'],
      ['full', STRINGS.storage.diskFull, 'full'],
      ['offline', STRINGS.storage.offline, 'offline'],
    ];
    for (const [status, copy, state] of cases) {
      const { container, unmount } = render(createElement(AutosaveChip, { status }));
      const chip = container.querySelector('[data-testid="autosave-chip"]');
      expect(chip?.getAttribute('data-state'), status).toBe(state);
      expect(chip?.textContent).toContain(copy);
      unmount();
    }
  });

  it('Error offers an actionable Retry; Read-only is not an error', () => {
    const onRetry = vi.fn();
    const { container, unmount } = render(
      createElement(AutosaveChip, { status: 'error', onRetry }),
    );
    const chip = container.querySelector('[data-testid="autosave-chip"]');
    expect(chip?.getAttribute('data-state')).toBe('error');
    expect(chip?.textContent).toContain(STRINGS.storage.couldntSave);
    // The error is an alert; the Retry is a real 48 px button with hit slop.
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.storage.couldntSave);
    const retry = screen.getByRole('button', { name: STRINGS.errors.retry });
    expect(retry.className).toContain('hit-slop');
    expect(retry.getAttribute('data-testid')).toBe('autosave-retry');
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    // Read-only is its own calm case: no Retry, no alert role.
    const ro = render(createElement(AutosaveChip, { status: 'readonly' })).container;
    expect(ro.querySelector('[data-state="readonly"]')?.textContent).toContain(
      STRINGS.storage.readOnly,
    );
    expect(ro.querySelector('button')).toBeNull();
    expect(ro.querySelector('[role="alert"]')).toBeNull();
  });

  it('formatClock renders the appendix example shape (12-hour, no leading hour zero)', () => {
    // 14:14 → "2:14 PM" (the appendix's `Saved 2:14 PM`).
    expect(formatClock(new Date(2026, 8, 22, 14, 14))).toBe('2:14 PM');
    expect(formatClock(new Date(2026, 8, 22, 0, 5))).toBe('12:05 AM');
    expect(formatClock(new Date(2026, 8, 22, 12, 0))).toBe('12:00 PM');
  });

  it('uses the approved `storage.saved` template verbatim', () => {
    expect(t(STRINGS.storage.saved, { time: '2:14 PM' })).toBe('Saved 2:14 PM');
  });
});
