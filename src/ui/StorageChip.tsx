/**
 * `src/ui/StorageChip.tsx` — the Project (sheets-grid) top bar's storage pill, UI §11.4's
 * normal state: `● Local · 48 MB · Saved 2:14 PM` with an `--ok` dot.
 *
 * HONESTY RULES (this chip exists to avoid a seventh "the UI said something the system had
 * not done" bug — CONTINUITY D110/D114):
 *   - **Pending** (the measurement promise has not settled): render **nothing** — not a
 *     spinner, not a placeholder `0 B`, not a guessed size.
 *   - **Failed** (the promise rejected): render **nothing** and say nothing. The grid's own
 *     `error` state owns unreadability; a second, quieter claim here would only compete.
 *   - **Measured but no real save time** (`savedAt === null`): render **nothing**. The
 *     approved template (`storage.local`) needs BOTH `{size}` and `{time}`; printing it with
 *     an empty time would read `Local · 176 MB · Saved ` — a save the system never recorded.
 *     Strictest honest behaviour: stay silent until there is a real save time.
 *   - **Measured**: the pill, with the size from `formatBytes(bytes)` and the time from
 *     `clockLabel(savedAt)` — both real, neither derived from `Date.now()`.
 *
 * The size and time are passed in from `measureProjectSize` (real disk facts). This component
 * never measures, estimates, or fabricates; it only renders what it was given and re-measures
 * when `projectId`/`refreshKey` change. A stale in-flight measurement is dropped by an
 * effect-local `alive` flag so a slow old result cannot overwrite a newer one.
 *
 * ACCESSIBILITY: `role="status"` on the pill announces its text when it appears. The
 * accessible name is the whole rendered string (`aria-label` mirrors the visible text; the
 * `role` does not compute a name from content), and the `--ok` dot is decorative
 * (`aria-hidden`), so it never pollutes the name.
 *
 * NO INLINE STYLES — CSP `style-src 'self'`, and the e2e suite asserts `[style]` count === 0.
 * Everything is in `src/ui/storageChip.css` (global tokens `--g800/--g700/--g100/--ok`).
 */
import { useEffect, useState, type JSX } from 'react';
import { formatBytes, measureProjectSize, type ProjectSize } from '@/fs/projectSize';
import { clockLabel } from '@/fs/projectSheets';
import { STRINGS, t } from './strings';
import './storageChip.css';

export interface StorageChipProps {
  /** D51 runtime key `${id}:${folderName}`. */
  projectId: string;
  /** Bump to re-measure (the shell does it after any sheet write). */
  refreshKey?: number;
}

export default function StorageChip({ projectId, refreshKey }: StorageChipProps): JSX.Element | null {
  // `null` means "nothing true to say yet" — pending, failed, or no real save time.
  const [measured, setMeasured] = useState<ProjectSize | null>(null);

  useEffect(() => {
    // A new measurement target: drop the previous value so the old size/time cannot sit on
    // screen while the new walk runs.
    setMeasured(null);
    let alive = true;
    measureProjectSize(projectId).then(
      (size) => {
        if (alive) setMeasured(size);
      },
      () => {
        // Failed measurement → say nothing (the grid's error state owns unreadability).
        if (alive) setMeasured(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey]);

  if (measured === null) return null;

  const time = measured.savedAt === null ? '' : clockLabel(measured.savedAt);
  // No real save time (or an unparseable one) → nothing honest to render.
  if (time === '') return null;

  const text = t(STRINGS.storage.local, { size: formatBytes(measured.bytes), time });

  return (
    <span
      className="storage-chip mono"
      data-testid="storage-chip"
      role="status"
      aria-label={text}
    >
      <span className="storage-chip-dot" aria-hidden="true" />
      {text}
    </span>
  );
}
