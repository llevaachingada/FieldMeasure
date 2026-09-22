/**
 * `src/ui/AutosaveChip.tsx` — the §13.1 Autosave chip (implementation plan slice 1.10,
 * build order step 1).
 *
 * "There is no Save button, so the Autosave chip is the most important 200 pixels in
 * the app." It is presentational: it renders the status it is given and calls the one
 * action its Error state owns. It **never sets the status itself** — the source of
 * truth is `persistQueue`'s `storageStatus`, mirrored by `SheetEditor` into
 * `useAppStore` (persistQueue is the ONLY writer of that value). That is how "never
 * show `Saved` optimistically" is enforced structurally instead of by discipline.
 *
 * The five §13.1 states are `saved · saving · pending · readonly · error`; the store's
 * union also carries `full` (§5.8a disk full) and `offline` (the UI-only one-time
 * reassurance), so every member is rendered honestly rather than falling through.
 *
 * **No optimistic `Saved`.** Before the first write resolves there is nothing true to
 * say, so the chip renders nothing at all (do-not-simplify #14). The "Saved {time}"
 * form only appears after a real `… → saved` transition — i.e. after the write
 * promise resolved — and the time is that resolution's clock.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import type { StorageStatus } from '@/state/appStore';
import { STRINGS, t } from './strings';

export interface AutosaveChipProps {
  /** The queue-owned status (never written by this component). */
  status: StorageStatus;
  /**
   * Error state's `Retry` (UI §13.1) — re-attempts parked writes. Absent = the button
   * is not rendered (a labelled no-op is a lie; a missing affordance is not).
   */
  onRetry?: () => void;
}

/** `2:14 PM` — the appendix example's shape (12-hour, no leading hour zero). */
export function formatClock(date: Date): string {
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = date.getHours() >= 12 ? 'PM' : 'AM';
  const hour12 = date.getHours() % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function Glyph({ children }: { children: string }): JSX.Element {
  return (
    <span className="autosave-glyph" aria-hidden="true">
      {children}
    </span>
  );
}

export default function AutosaveChip({ status, onRetry }: AutosaveChipProps): JSX.Element | null {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Seeded with the initial status so the FIRST `saved` (mount) does not fabricate a
  // time. Only a real transition into `saved` records the write's resolution.
  const previous = useRef<StorageStatus>(status);

  useEffect(() => {
    if (previous.current !== status && status === 'saved') setLastSavedAt(new Date());
    previous.current = status;
  }, [status]);

  if (status === 'saved') {
    if (lastSavedAt === null) return null;
    return (
      <span className="autosave-chip mono" data-state="saved" data-testid="autosave-chip">
        <Glyph>✓</Glyph>
        <span role="status">{t(STRINGS.storage.saved, { time: formatClock(lastSavedAt) })}</span>
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="autosave-chip mono" data-state="saving" data-testid="autosave-chip">
        <Glyph>◐</Glyph>
        <span role="status">{STRINGS.storage.saving}</span>
      </span>
    );
  }

  if (status === 'pending') {
    return (
      <span className="autosave-chip mono" data-state="pending" data-testid="autosave-chip">
        <Glyph>◐</Glyph>
        <span role="status">{STRINGS.storage.pending}</span>
      </span>
    );
  }

  if (status === 'readonly') {
    // Not a failure: the project is opened read-only (no writer lease, §5.8d). The chip
    // stays calm and never offers a Retry that could not succeed.
    return (
      <span className="autosave-chip mono" data-state="readonly" data-testid="autosave-chip">
        <Glyph>⊘</Glyph>
        <span role="status">{STRINGS.storage.readOnly}</span>
      </span>
    );
  }

  if (status === 'full') {
    return (
      <span className="autosave-chip mono" data-state="full" data-testid="autosave-chip">
        <Glyph>!</Glyph>
        <span role="alert">{STRINGS.storage.diskFull}</span>
      </span>
    );
  }

  if (status === 'offline') {
    return (
      <span className="autosave-chip mono" data-state="offline" data-testid="autosave-chip">
        <Glyph>●</Glyph>
        <span role="status">{STRINGS.storage.offline}</span>
      </span>
    );
  }

  // 'error' — the §5.8b target-locked / exhausted-backoff state: the honest failure,
  // with the single Retry inside the chip (§13.1).
  return (
    <span className="autosave-chip mono" data-state="error" data-testid="autosave-chip">
      <Glyph>!</Glyph>
      <span role="alert">{STRINGS.storage.couldntSave}</span>
      {onRetry ? (
        <button
          type="button"
          className="autosave-chip-retry hit-slop"
          data-testid="autosave-retry"
          onClick={onRetry}
        >
          {STRINGS.errors.retry}
        </button>
      ) : null}
    </span>
  );
}
