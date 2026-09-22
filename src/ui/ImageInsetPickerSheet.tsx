/**
 * `src/ui/ImageInsetPickerSheet.tsx` — slice 1.7 (lane B2) the image-inset picker sheet.
 * UI spec §9 (insert flow step 2); implementation plan §1.7 build-order step 1.
 *
 * WHAT THIS IS
 *   The bottom sheet the Image-inset tool opens after its one tap. It offers the three
 *   entry points the UI spec names — **Take a photo**, **Choose from device**, **Recent
 *   photos** — and reports the pick upward. It owns NO engine work: no file input, no
 *   decode, no placement, no cascade. Those belong to lane B1 (`InsetTool` / `src/editor/
 *   inset/**`). The caller cascades multi-select placements 24 px down-right; this sheet
 *   only says *which* source was chosen.
 *
 * PINNED INTERFACE (verbatim in both lanes' briefs — do not rename, do not add/remove props)
 *   `recents`, `onPickCamera`, `onPickDevice`, `onPickRecent(assetId)`, `onCancel`.
 *   B1 mounts this on a clean seam and must not create or stub it.
 *
 * MODAL SHELL (§19.6) — this file provides its OWN, so callers wrap it in a
 *   positioning-only div and never add a second `role="dialog"`:
 *     - `role="dialog"` + `aria-modal="true"` + an accessible name;
 *     - a real focus trap (Tab / Shift+Tab cycle inside; never a keyboard trap — `Esc`
 *       always cancels);
 *     - focus moves INTO the sheet on open and RETURNS to the previously focused element
 *       on close, mirroring `DimensionKeypadSheet` / `LayersPanel`.
 *
 * COPY DISCIPLINE
 *   No wording is invented here. The three section labels come from the approved appendix
 *   rows staged in `./insetCopy`; the ✕ reuses the approved `editor.cancel`; the dialog's
 *   accessible name reuses `tool.imageInset` (the feature that opened it).
 *
 * CSP / TARGETS
 *   Every bit of state is a `data-` attribute dressed in `imageInsetPicker.css` — never an
 *   inline `style=""` (the e2e suite asserts `[style]` count === 0). Touch-primary targets
 *   are 48 px minimum (the three option rows are 64 px, the thumbnails ~96 px) with
 *   `.hit-slop` on the one control that has room for 16 px of it.
 */

import { useCallback, useEffect, useId, useRef, type JSX } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

import { STRINGS } from './strings';
import './imageInsetPicker.css';

// ---------------------------------------------------------------------------
// Pinned interface — the machine lane (B1) mounts against EXACTLY this shape.
// ---------------------------------------------------------------------------

export interface ImageInsetPickerSheetProps {
  /** 'camera' | 'device' | 'recents' — the sheet renders all three sections. */
  recents: Array<{ assetId: string; thumbUrl: string; name: string }>;
  onPickCamera: () => void;
  onPickDevice: () => void;          // multi-select; the caller cascades placements 24 px down-right
  onPickRecent: (assetId: string) => void;
  onCancel: () => void;
}

/** The "Recent photos" grid shows the last 8 (UI §9:614 — a 4×2 grid of the last 8). */
export const RECENTS_MAX = 8;
/** 4 columns, 2 rows (exported so the test can assert the 4×2 shape without magic numbers). */
export const RECENTS_COLUMNS = 4;

/** Every focusable in this sheet is a button, so this selector is exact — and it works in
 *  jsdom, where layout-based visibility filters do not (mirrors `DimensionKeypadSheet`). */
const FOCUSABLE = 'button:not([disabled])';

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export default function ImageInsetPickerSheet({
  recents,
  onPickCamera,
  onPickDevice,
  onPickRecent,
  onCancel,
}: ImageInsetPickerSheetProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recentsHeadingId = useId();
  const copy = STRINGS.inset;

  // "the last 8": `recents` is supplied most-recent-first by the caller, so the grid is its
  // head. Taking the head (not the tail) means an unbounded list never reorders in the UI.
  const shownRecents = recents.slice(0, RECENTS_MAX);

  // ---- Escape cancels; Tab is trapped (§19.6) ------------------------------
  const trapTab = useCallback((event: KeyboardEvent): void => {
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // The root itself is focusable (tabIndex -1) and takes focus on open. Excluding it is
    // what makes the FIRST Tab land on the first control instead of following the browser
    // default out of the sheet (the same defect `LayersPanel` fixed; `root !== active`).
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
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // `Esc` always cancels, wherever focus is — this is what keeps the trap from being a
      // keyboard trap. Capture phase: `EditorLayout`'s window-level Esc ladder must not fire
      // first (the sheet is the topmost modal).
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key === 'Tab') trapTab(event);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel, trapTab]);

  // ---- focus: in on open, back where it came from on close (§19.6) ---------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The dialog takes focus, not the ✕: focus on a button would make Space activate it.
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const recentsLabel = copy.recentPhotos;

  return (
    <div className="inset-picker-scrim">
      <div
        ref={rootRef}
        className="inset-picker-sheet"
        data-testid="image-inset-picker"
        role="dialog"
        aria-modal="true"
        aria-label={STRINGS.tool.imageInset}
        tabIndex={-1}
      >
        <header className="inset-picker-header">
          <h2 className="inset-picker-title">{STRINGS.tool.imageInset}</h2>
          <button
            type="button"
            className="inset-picker-close hit-slop"
            data-inset-picker="cancel"
            aria-label={STRINGS.editor.cancel}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {/* The two single-pick sources. Each row IS the control (no separate heading), so
            there is no duplicated announcement for a screen reader. */}
        <div className="inset-picker-options">
          <button
            type="button"
            className="inset-picker-option"
            data-inset-picker="camera"
            aria-label={copy.takePhoto}
            onClick={onPickCamera}
          >
            <Camera className="inset-picker-option-icon" aria-hidden="true" />
            <span className="inset-picker-option-label">{copy.takePhoto}</span>
          </button>
          <button
            type="button"
            className="inset-picker-option"
            data-inset-picker="device"
            aria-label={copy.chooseFromDevice}
            onClick={onPickDevice}
          >
            <ImageIcon className="inset-picker-option-icon" aria-hidden="true" />
            <span className="inset-picker-option-label">{copy.chooseFromDevice}</span>
          </button>
        </div>

        <section className="inset-picker-recents" aria-labelledby={recentsHeadingId}>
          <h3 className="inset-picker-recents-heading" id={recentsHeadingId}>
            {recentsLabel}
          </h3>
          {shownRecents.length === 0 ? (
            // Honest empty state: no phantom thumbnails, no fake "recent" — just the truth.
            <p className="inset-picker-recents-empty">{copy.recentsEmpty}</p>
          ) : (
            <ul className="inset-picker-grid" role="list">
              {shownRecents.map((item) => (
                <li className="inset-picker-thumb" key={item.assetId}>
                  <button
                    type="button"
                    className="inset-picker-thumb-button"
                    data-inset-picker-recent={item.assetId}
                    // The asset's own name is the control's name; a nameless asset falls
                    // back to the section label so no control is ever unlabelled.
                    aria-label={item.name !== '' ? item.name : recentsLabel}
                    onClick={() => onPickRecent(item.assetId)}
                  >
                    {/* Decorative: the button carries the accessible name. */}
                    <img className="inset-picker-thumb-image" src={item.thumbUrl} alt="" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
