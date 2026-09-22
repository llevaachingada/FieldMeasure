/**
 * `src/ui/TrashPanel.tsx` — the sheet-trash restore panel (UI §11.2:711; build spec
 * §11.9:2029; UI §13.3:800). Opened from the Project top bar's `⋯ → «Trash…»`.
 *
 * WHAT IT IS: a modal sheet listing the project's `.trash/` entries — name, deleted date
 * and the **days left** before the 14-day prune — with a **read-only preview** (the trashed
 * `thumb.jpg`; no editing) and a `«Restore»` action. It is the "trash is not a write-only
 * graveyard" UI the spec demands.
 *
 * NO SECOND DIALOG (repo scar tissue): this sheet owns the ONLY `role="dialog"` /
 * `aria-modal="true"` for the trash flow, its own focus trap (`Tab` cycles; never a keyboard
 * trap — `Esc` always closes) and its focus return to the invoker. The scrim below is a
 * plain positioning `<div>`, never a second dialog.
 *
 * MODEL: `TrashedSheet` is pinned with the storage lane, which is **in flight** — it is
 * declared here rather than imported, and it is structurally identical, so either module's
 * values are assignable to this prop type. Nothing in this file touches the filesystem.
 *
 * HONESTY: `items === undefined` means "the shell has not loaded `.trash/` yet" → the
 * loading line. An empty array means an empty trash. A restore NEVER claims success: the
 * row's Restore disables and reads `«Restoring…»` until the shell's list drops the row (or
 * `restoreFailed` reports the failure as a `role="alert"` line).
 *
 * NO INLINE STYLES: the CSP is `style-src 'self'` and the e2e suite asserts `[style]`
 * count === 0, so every bit of state rides on a class or a data attribute.
 */
import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { X } from 'lucide-react';

import { STRINGS, t } from './strings';
import type { TrashedSheet } from '@/fs/sheetTrash';
import './projectScreen.css';

/**
 * Pinned with the storage lane (in flight — deliberately NOT imported). Structurally
 * identical to the model the shell will pass, so the values are assignable either way.
 */
/**
 * The trashed-sheet model. The canonical definition lives in the storage module
 * (`src/fs/sheetTrash.ts`); it is imported above and re-exported here so the two can never
 * drift apart (D113).
 */
export type { TrashedSheet };

export interface TrashPanelProps {
  /**
   * The trashed sheets, already loaded by the shell. `undefined` means "not loaded yet"
   * (the loading line) — distinct from `[]` (a real, empty trash).
   */
  items?: readonly TrashedSheet[];
  /** The shell reports a failed restore; the panel shows an honest `role="alert"` line. */
  restoreFailed?: boolean;
  /** Absent ⇒ the Restore controls are disabled (never a dead-looking live button). */
  onRestore?(id: string): void;
  onClose(): void;
}

/** The deep-editor/export-wizard focus-trap query: every control here is a button. */
const FOCUSABLE = 'button:not([disabled])';

/** `Deleted 9/10/2026` — the locale date of an ISO delete stamp (empty when unparseable). */
function deletedOnLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return t(STRINGS.trash.deletedOn, { date: at.toLocaleDateString() });
}

/** The visible 14-day window, per row: `1 day left` / `12 days left` / `Prunes today`. */
function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return STRINGS.trash.daysLeftNone;
  if (daysLeft === 1) return STRINGS.trash.daysLeftOne;
  return t(STRINGS.trash.daysLeft, { daysLeft });
}

/**
 * A trashed `thumb.jpg`, read-only. Mirrors the sheet-card thumbnail (its own object URL,
 * revoked on change/unmount). jsdom has no `createObjectURL`, so there the placeholder shows.
 */
function TrashThumb({ thumb }: { thumb: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumb) {
      setUrl(null);
      return;
    }
    let created = '';
    try {
      created = URL.createObjectURL(thumb);
    } catch {
      created = '';
    }
    setUrl(created || null);
    return () => {
      if (!created) return;
      try {
        URL.revokeObjectURL(created);
      } catch {
        // Best-effort; a leaked URL is not worth a crash.
      }
    };
  }, [thumb]);

  if (!url) return <span className="trash-thumb-placeholder" aria-hidden="true" />;
  // Decorative: the row button and the preview caption already name the sheet.
  return <img className="trash-thumb-image" src={url} alt="" />;
}

export default function TrashPanel({
  items,
  restoreFailed = false,
  onRestore,
  onClose,
}: TrashPanelProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const loading = items === undefined;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The row whose Restore is in flight; cleared only by the shell's source of truth. */
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Keep the preview selection valid as the list changes (and default to the newest row).
  useEffect(() => {
    if (!items || items.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current !== null && items.some((item) => item.id === current) ? current : items[0].id,
    );
  }, [items]);

  // The restore stops being "in flight" only when the truth arrives: the row leaves the
  // list (success) or the shell reports a failure. Never on a timer, never optimistically.
  useEffect(() => {
    setPendingId((current) => {
      if (current === null || restoreFailed) return null;
      if (!items || !items.some((item) => item.id === current)) return null;
      return current;
    });
  }, [items, restoreFailed]);

  // ---- Esc closes; Tab cycles inside (§19.6) --------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && active !== root && root.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // ---- focus in on open, back to the invoker on close (§19.6) ---------------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const selected = selectedId !== null ? (items ?? []).find((i) => i.id === selectedId) : undefined;
  const selectedPending = selected !== undefined && selected.id === pendingId;
  const restoreDisabled = typeof onRestore !== 'function';

  return (
    <div className="trash-scrim">
      <div
        ref={rootRef}
        className="trash-sheet"
        data-testid="trash-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="trash-header">
          {/* Reuses the approved `trash.open` («Trash…») — no second name for the feature. */}
          <h2 className="trash-title" id={titleId}>
            {STRINGS.trash.open}
          </h2>
          <button
            type="button"
            className="trash-close hit-slop"
            data-testid="trash-close"
            aria-label={STRINGS.a11y.close}
            onClick={onClose}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{STRINGS.a11y.close}</span>
          </button>
        </header>

        <div className="trash-body">
          {/* The in-flight announcement — the only live region that is not the error. */}
          <div className="visually-hidden" role="status" data-testid="trash-status">
            {pendingId !== null ? STRINGS.trash.restoring : ''}
          </div>

          {restoreFailed ? (
            <p className="trash-error-line" role="alert" data-testid="trash-error">
              {STRINGS.trash.restoreFailed}
            </p>
          ) : null}

          {loading ? (
            <p className="trash-state-line" data-testid="trash-loading">
              {STRINGS.trash.loading}
            </p>
          ) : items.length === 0 ? (
            <p className="trash-state-line" data-testid="trash-empty">
              {STRINGS.trash.empty}
            </p>
          ) : (
            <div className="trash-columns">
              <ul
                className="trash-list"
                role="list"
                aria-label={STRINGS.trash.open}
                data-testid="trash-list"
              >
                {items.map((item) => {
                  const isSelected = item.id === selectedId;
                  const isPending = item.id === pendingId;
                  return (
                    <li key={item.id} className="trash-row-item" role="listitem">
                      <button
                        type="button"
                        className="trash-row"
                        data-testid={`trash-row-${item.id}`}
                        data-pending={isPending ? 'true' : 'false'}
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="trash-row-thumb">
                          <TrashThumb thumb={item.thumb} />
                        </span>
                        <span className="trash-row-text">
                          <span className="trash-row-name">{item.title}</span>
                          <span className="trash-row-meta mono">
                            {deletedOnLabel(item.deletedAt)} · {daysLeftLabel(item.daysLeft)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Read-only preview — no editing, no second dialog (P §11.9:2029). */}
              <section className="trash-preview" aria-label={STRINGS.trash.previewLabel}>
                {selected ? (
                  <>
                    <figure className="trash-preview-figure">
                      <span className="trash-preview-thumb">
                        <TrashThumb thumb={selected.thumb} />
                      </span>
                      <figcaption className="trash-preview-name">{selected.title}</figcaption>
                    </figure>
                    <p className="trash-preview-meta mono">
                      {deletedOnLabel(selected.deletedAt)} · {daysLeftLabel(selected.daysLeft)}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary hit-slop trash-restore"
                      data-testid={`trash-restore-${selected.id}`}
                      aria-label={
                        selectedPending
                          ? STRINGS.trash.restoring
                          : t(STRINGS.trash.restoreNamed, { title: selected.title })
                      }
                      disabled={selectedPending || restoreDisabled}
                      onClick={() => {
                        if (typeof onRestore !== 'function') return;
                        setPendingId(selected.id);
                        onRestore(selected.id);
                      }}
                    >
                      {selectedPending ? STRINGS.trash.restoring : STRINGS.trash.restore}
                    </button>
                  </>
                ) : null}
              </section>
            </div>
          )}

          <p className="trash-note">{STRINGS.trash.pruneNote}</p>
        </div>
      </div>
    </div>
  );
}
