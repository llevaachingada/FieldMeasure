/**
 * `src/ui/ProjectScreen.tsx` — the Project screen: one project's sheets grid (UI §11.2;
 * build spec §20.5(a); D88/D102/D111). **Not yet routed** — the orchestrator wires `App`
 * to the pinned `ProjectScreenProps` below.
 *
 * What this screen is for: seeing every sheet at a glance, adding pages, and exporting.
 * The two add tiles («Take photo» / «Import») come FIRST in the grid, always, in every
 * state — in a field app the add affordance must be the easiest thing on the screen
 * (UI §11.2).
 *
 * SHEET TRASH: the per-card `⋯` → `Delete` affordance (§13.3: recoverable — immediate,
 * then a 10 s «Sheet deleted · Undo» toast via the shipped `ToastHost`), and the top bar's
 * `⋯ → «Trash…»` panel. Both are injected through optional props: absent means no
 * affordance.
 *
 * THE CARD MENU (UI §11.2:720): `Open, Rename, Duplicate, Replace photo, Move earlier,
 * Move later, Delete`. Every item is **live when its callback is injected and omitted when
 * it is not** — never a live-looking no-op (D102). `Move earlier` / `Move later` are the
 * keyboard path to the reorder (WCAG 2.1.1): a long-press drag is unreachable by keyboard.
 *
 * REORDER (UI §11.2:719): long-press (400 ms) a card to lift it, then drag; the order
 * renumbers live and a `«Drop to move»` chip (`role="status"`) follows the pointer. The
 * drop target is resolved GEOMETRICALLY from captured `pointermove` coordinates
 * (`src/ui/sheetReorder.ts`): Chromium implicitly captures the pointer on the card that
 * took `pointerdown`, so `pointerover` on the other cards never fires (D77/F1 — the
 * Layers panel's exact trap). The rects are captured once at gesture start and then
 * SHIFTED by any autoscroll delta, so a 20+ sheet grid can be reordered without lifting
 * the finger (D118 M8: a pointer in the 48 px edge band scrolls `.project-body`).
 *
 * THE CARD MENU IS PORTALED to `document.body` (D118 H2 + the session-22 finding 1
 * coupling): `.project-body` is now the scroll container, and an absolutely positioned
 * popup inside it is clipped by that scroller at the bottom row. The popup's computed
 * position is applied with `element.animate()` — never an inline `style` — the same
 * CSP-safe technique as the drag chip.
 *
 * A11Y (per-slice, non-negotiable):
 *   - every control has an accessible name; 48 px minimum targets with `.hit-slop`;
 *     the global `:focus-visible` ring (styles.css) is untouched.
 *   - the grid is a real `role="list"` with `listitem` children and a stable focus order.
 *   - selection state is conveyed with `aria-pressed`; the selection bar is `role="status"`,
 *     the reorder chip is `role="status"`, and the replace dialog is a real modal with a
 *     focus trap (TrashPanel's pattern).
 *   - mutation controls that are blocked (read-only / unreadable project) say so through the
 *     existing toast bus (`emitToast`, UI §13.4 / §11.2) — never a silent no-op.
 *
 * NO INLINE STYLES: the CSP is `style-src 'self'` and the e2e suite asserts `[style]`
 * count === 0, so every bit of state rides on a class or a data attribute. The one thing
 * that genuinely needs a computed position — the drag chip — uses `element.animate()`
 * (Web Animations is not an inline style and adds no `[style]` attribute); see `followChip`.
 *
 * LAYOUT IS NOT jsdom-VISIBLE (D40): the responsive column counts (4 @ ≥1440, 3 @ ≥1200,
 * 2 @ portrait ≥960, 1 below) live in `projectScreen.css` and are a MANUAL check, not a
 * unit assertion. jsdom runs with no layout engine, so a test here could only ever assert
 * the CSS text, which proves nothing about the rendered columns. The drag arithmetic is
 * unit-tested in `tests/sheetReorder.test.ts` with real rectangles instead.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, ChevronLeft, MoreHorizontal, Share2, Upload } from 'lucide-react';
import { emitToast } from '@/editor/session';
import type { ProjectSheetCard } from '@/fs/projectSheets';
import HelpButton from './HelpButton';
import { STRINGS, t } from './strings';
import StorageChip from './StorageChip';
import TrashPanel, { type TrashedSheet } from './TrashPanel';
import { useSheetReorderDrag } from './useSheetReorderDrag';
import './projectScreen.css';

export type { ProjectSheetCard, TrashedSheet };

/** D141/D142: «1 sheet» / «N sheets». The rule lives in `strings.ts` so Home can use it without
 *  pulling this screen's module graph into its chunk; re-exported here for the grid's callers. */
export { sheetCountLabel } from './strings';
import { sheetCountLabel } from './strings';

export interface ProjectScreenProps {
  projectTitle: string;
  sheetCount: number;
  state: 'loading' | 'ready' | 'empty' | 'error';
  sheets: readonly ProjectSheetCard[];
  readOnly?: boolean;
  selectedIds?: readonly string[];
  onToggleSelected?(id: string): void;
  onClearSelection?(): void;
  onOpenSheet(id: string): void;
  onTakePhoto(): void;
  onImport(): void;
  onExport(selectedIds: readonly string[]): void;
  onBack(): void;
  /** D142: the error state's recovery; absent → no button, never a dead control. */
  onRetry?(): void;

  // ---- sheet trash (UI §11.2:711; build spec §11.9:2029; UI §13.3:800) --------
  // Every prop is additive and optional. ABSENT means the affordance does not render
  // (D102 honesty: nothing dead-looking).
  /**
   * The user confirmed «Delete» on a card (§13.3: recoverable — immediate + undo toast).
   * Returns when the SHELL's write has resolved, so the screen can announce only what really
   * happened: resolve → «Sheet deleted · Undo» (10 s); reject → an urgent failure line, and no
   * claim of success.
   */
  onDeleteSheet?(id: string): Promise<void> | void;
  /** The ⋯ panel's list, already loaded by the shell. `undefined` = "not loaded yet". */
  trash?: readonly TrashedSheet[];
  /** The shell reports a failed restore; the panel shows an honest failure line. */
  trashRestoreFailed?: boolean;
  /** Load/refresh the trash list when the panel opens. */
  onOpenTrash?(): void;
  /** «Restore» in the panel — and the «Undo» half of the delete toast. */
  onRestoreSheet?(id: string): void;
  onCloseTrash?(): void;

  // ---- the sheets grid's owed behaviour (D111) -------------------------------
  /** D51 runtime key `${id}:${folderName}` — the storage chip measures this project. */
  projectId?: string;
  /** Re-measure trigger for the storage chip (the shell bumps it after any sheet write). */
  refreshKey?: number;
  /** Persist a new sheet order (§20.6: 10 × position). MUST reject on failure. */
  onReorderSheets?(orderedIds: readonly string[]): Promise<void> | void;
  /** Rename a sheet's title (never its folder). Rejects on failure. */
  onRenameSheet?(id: string, title: string): Promise<void> | void;
  /** Duplicate a sheet (folder tree + row). Resolves with the new sheet's id. */
  onDuplicateSheet?(id: string): Promise<{ id: string }> | void;
  /** Begin «Replace photo» — the SHELL picks + normalizes the file and decides silent-vs-warned. */
  onReplacePhoto?(id: string): void;
  /** The shell's warned-dialog state (§11.2:720) when the new photo has different dimensions. */
  replacePrompt?: { sheetId: string; title: string } | null;
  /** The user's answer: keep markup, remove markup, or cancel. */
  onResolveReplace?(choice: 'keep' | 'remove' | 'cancel'): void;
}

/** UI §11.2 loading state: 8 skeleton cards, plus the two real add tiles. */
const SKELETON_COUNT = 8;

/**
 * §11.2:720 — hold-to-confirm on «Remove markup», the destructive half of the replace
 * dialog. Deliberately a LOCAL constant: it is the same 600 ms as the editor's
 * `LONG_PRESS_MS` (`@/editor`), but importing any `@/editor/**` module from here would pull
 * Konva into the Project screen's chunk, which is not lazy-loaded (the grid ships in the
 * main chunk; Konva is deliberately split out).
 */
const REPLACE_HOLD_MS = 600;

/**
 * The card menu's full height: 7 items × 48 + 6 gaps × 2 + 12 padding + 4 border = 364.
 * Above the trigger there is only 300 − 68 = 232 px inside the card, so the menu cannot be
 * flipped for every case — the CSS `max-height`/`overflow-y` backstop is what guarantees it
 * is never taller than the viewport (see the review: at the bottom row, 5 of the 7 items
 * used to render below the fold, which made «Delete» the least reachable action).
 */
export const MENU_MAX_HEIGHT = 364;

/**
 * Which way the card menu must open to be readable where the card actually is: downward
 * unless the viewport has less than the menu's full height below the card. Exactly
 * `MENU_MAX_HEIGHT` counts as "fits" (an inclusive threshold — the CSS backstop has 0 px of
 * slack there, not negative slack). Exported so its arithmetic is pinned by a test: jsdom has
 * no layout, so only a stubbed rect can exercise it there.
 */
export function menuDirectionFor(el: HTMLElement | null): 'up' | 'down' {
  if (!el) return 'down';
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  return spaceBelow < MENU_MAX_HEIGHT ? 'up' : 'down';
}

/** The menu's downward offset from the item's top edge (was CSS `top: 236px`). */
export const MENU_DOWN_TOP_PX = 236;
/** The gap above the item's bottom edge when the menu opens upward. */
export const MENU_UP_GAP_PX = 68;
/** The menu's inset from the item's right edge (was CSS `right: 8px`). */
export const MENU_RIGHT_INSET_PX = 8;
/** The minimum inset from any viewport edge, so a clamped menu is never flush. */
export const MENU_VIEWPORT_INSET_PX = 8;
/** Fallback menu width when `offsetWidth` is unavailable (jsdom has no layout). */
export const MENU_FALLBACK_WIDTH = 168;

/**
 * Where the portaled menu's top-left must sit so it hangs off the card the way the CSS
 * used to, without ever leaving the viewport.
 *
 * `item` is the `.sheet-grid-item`'s real viewport rect (the card fills it, so item top /
 * bottom / right are the card's). Downward: the menu's top pins `MENU_DOWN_TOP_PX` below
 * the item's top. Upward: its bottom pins `MENU_UP_GAP_PX` above the item's bottom (8 px
 * clear of the ⋯ trigger at `bottom: 76px`). Right-aligned with an 8 px inset, then the
 * whole box is clamped into `[8, viewport − size − 8]` on both axes — the guarantee the
 * session-22 review could not give an absolutely positioned menu, and the reason the
 * browser suite can assert the box is fully on screen.
 *
 * Exported and pure so its arithmetic is pinned in jsdom (D40: no layout there).
 */
export function menuAnchorFor(
  item: { top: number; bottom: number; right: number },
  direction: 'up' | 'down',
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const clamp = (value: number, lo: number, hi: number): number =>
    Math.min(Math.max(value, lo), Math.max(lo, hi));
  const left = clamp(
    item.right - MENU_RIGHT_INSET_PX - menu.width,
    MENU_VIEWPORT_INSET_PX,
    viewport.width - menu.width - MENU_VIEWPORT_INSET_PX,
  );
  const desiredTop =
    direction === 'up'
      ? item.bottom - MENU_UP_GAP_PX - menu.height
      : item.top + MENU_DOWN_TOP_PX;
  const top = clamp(
    desiredTop,
    MENU_VIEWPORT_INSET_PX,
    viewport.height - menu.height - MENU_VIEWPORT_INSET_PX,
  );
  return { left, top };
}

/** The deep-editor/export-wizard/trash focus-trap query: every control here is a button. */
const FOCUSABLE = 'button:not([disabled])';

/** A card's thumbnail: the cached `thumb.jpg` bytes, or the honest placeholder. */
function SheetThumb({ thumb }: { thumb: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!thumb) {
      setUrl(null);
      return;
    }
    let created = '';
    try {
      // jsdom has no `createObjectURL`; there the card simply shows the placeholder.
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
        // Revoking is best-effort; a leaked URL is not worth a crash.
      }
    };
  }, [thumb]);

  if (!url) return <span className="sheet-card-placeholder" aria-hidden="true" />;
  // Decorative: the card's open button already carries the sheet name as its label.
  return <img className="sheet-card-image" src={url} alt="" />;
}

interface ReplaceDialogProps {
  /** The sheet whose photo is being replaced — names the dialog's subject. */
  sheetTitle: string;
  onResolve(choice: 'keep' | 'remove' | 'cancel'): void;
}

/**
 * The §11.2:720 warned dialog: the new photo has different working-image dimensions, so
 * the user chooses whether the old coordinates' markup is kept. Exact copy is pinned by the
 * spec; the buttons are `Keep markup` (default focus) / `Remove markup` (hold-to-confirm
 * 600 ms) / `Cancel`.
 *
 * This is a REAL modal — focus moves in on open, Escape cancels, Tab cycles inside. It
 * deliberately does NOT reuse `insetWire.css`'s `.replace-photo*` (that file belongs to the
 * editor's inset flow); its classes are local `.sheet-replace*`.
 */
function ReplaceDialog({ sheetTitle, onResolve }: ReplaceDialogProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  /** Whatever had focus when the dialog opened — restored when it closes (§19.6). */
  const invokerRef = useRef<HTMLElement | null>(null);
  const [holding, setHolding] = useState(false);

  const cancelHold = useCallback((): void => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  }, []);

  const startHold = useCallback((): void => {
    if (holdTimerRef.current !== null) return;
    setHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setHolding(false);
      onResolve('remove');
    }, REPLACE_HOLD_MS);
  }, [onResolve]);

  // A dialog dismissed mid-hold must not fire its timer afterwards.
  useEffect(() => cancelHold, [cancelHold]);

  // Esc cancels; Tab cycles inside (§19.6) — the TrashPanel trap, verbatim.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelHold();
        onResolve('cancel');
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
      const inside = active !== null && root.contains(active);
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
  }, [cancelHold, onResolve]);

  // §13.3:808: initial focus is the SAFE action («Cancel»), never the destructive one, and
  // it RETURNS to whatever had focus when the dialog closes (the `TrashPanel` pattern) —
  // a dismissed dialog must not drop focus onto `<body>`. The first build focused
  // «Keep markup»; the session-22 UI review measured that against the spec clause.
  useEffect(() => {
    invokerRef.current = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLButtonElement>('[data-replace-cancel]')?.focus();
    return () => {
      const invoker = invokerRef.current;
      if (invoker && document.contains(invoker) && typeof invoker.focus === 'function') {
        invoker.focus();
      }
    };
  }, []);

  return (
    <div className="sheet-replace-scrim">
      <div
        ref={rootRef}
        className="sheet-replace"
        data-testid="sheet-replace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-replace-title"
      >
        {/* The dialog's NAME is the action; the sheet it concerns is the subject line. An
            `aria-label` that disagreed with the visible heading was finding 14 of the
            session-22 UI review. */}
        <h2 className="sheet-replace-title" id="sheet-replace-title">
          {STRINGS.sheetMenu.replacePhoto}
        </h2>
        <p className="sheet-replace-subject">{sheetTitle}</p>
        <p className="sheet-replace-warn">{STRINGS.project.replacePhotoWarn}</p>
        <div className="sheet-replace-actions">
          <button
            type="button"
            className="btn btn-secondary hit-slop"
            onClick={() => {
              cancelHold();
              onResolve('keep');
            }}
          >
            {STRINGS.project.replacePhotoKeep}
          </button>
          {/* §13.3:808 — 64 px tall, the label inside a progress track that fills left→right
              with `--err` over the hold, so the wait is visible rather than a red flash that
              "does nothing" (the first build). `data-holding` drives the fill. */}
          <button
            type="button"
            className="btn hit-slop sheet-replace-remove"
            data-testid="sheet-replace-remove"
            data-holding={holding ? 'true' : 'false'}
            onPointerDown={(event) => {
              event.preventDefault();
              startHold();
            }}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              startHold();
            }}
            onKeyUp={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              cancelHold();
            }}
          >
            <span className="sheet-replace-remove-label">{STRINGS.project.replacePhotoRemove}</span>
          </button>
          {/* The safe action, and the dialog's initial focus (§13.3:808). */}
          <button
            type="button"
            className="btn btn-secondary hit-slop"
            data-replace-cancel=""
            onClick={() => {
              cancelHold();
              onResolve('cancel');
            }}
          >
            {STRINGS.editor.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SheetCardRowProps {
  card: ProjectSheetCard;
  /** 1-based LIVE position — the «04» badge renumbers as the order changes. */
  displayIndex: number;
  selected: boolean;
  selectable: boolean;
  /** Any card-menu affordance is injected; otherwise the `⋯` trigger does not render. */
  menuable: boolean;
  deletable: boolean;
  renamable: boolean;
  duplicable: boolean;
  replaceable: boolean;
  reorderable: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  dragging: boolean;
  renaming: boolean;
  /** Bumped when a rename write rejected: the field re-opens on the card's real title. */
  renameFailedNonce: number;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onReplacePhoto(id: string): void;
  onBeginRename(id: string): void;
  onCommitRename(id: string, title: string): void;
  onCancelRename(): void;
  onMove(id: string, direction: 'earlier' | 'later'): void;
}

/**
 * One sheet card (320 × 300). The card itself opens the sheet; a per-card `⋯` opens the
 * §11.2:720 card menu. The menu is a SIBLING of `.sheet-card`'s content, inside the
 * `.sheet-grid-item` wrapper: the card clips its own contents (`overflow: hidden`, for the
 * thumbnail's rounded corners), so a menu nested inside it would be clipped away.
 *
 * The rename field is also a sibling of the open button (an `<input>` inside a `<button>`
 * is invalid HTML and would make every click on the field also open the sheet). It is
 * absolutely positioned over the name row; the open button is guarded while it is open.
 */
function SheetCardRow({
  card,
  displayIndex,
  selected,
  selectable,
  menuable,
  deletable,
  renamable,
  duplicable,
  replaceable,
  reorderable,
  canMoveEarlier,
  canMoveLater,
  dragging,
  renaming,
  renameFailedNonce,
  onOpen,
  onToggle,
  onDelete,
  onDuplicate,
  onReplacePhoto,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onMove,
}: SheetCardRowProps): JSX.Element {
  // The «04» badge — 1-based, mono. Runtime number, never a persisted string (appendix
  // excludes `04` as an example value).
  const badge = String(displayIndex).padStart(2, '0');

  const [menuOpen, setMenuOpen] = useState(false);
  /** Which way the popup opens where THIS card sits (finding 1 of the session-22 UI review). */
  const [menuDirection, setMenuDirection] = useState<'up' | 'down'>('down');
  const [draft, setDraft] = useState(card.title);
  const rootRef = useRef<HTMLLIElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** The menu's anchor animation — cancelled when it closes or the direction changes. */
  const menuAnimRef = useRef<Animation | null>(null);
  const menuName = t(STRINGS.sheetMenu.moreNamed, { title: card.title });

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      // The menu is PORTALED to `document.body`, so it is NOT inside `rootRef`: without
      // this second check a press on a menu item would close the menu before its `click`
      // could fire (the item became unreachable — the D102 class).
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    // A portaled menu is fixed to the VIEWPORT, so a wheel/trackpad scroll of the grid
    // would leave it floating over the wrong card. Touch scrolling already closes it via
    // the pointerdown guard above; this covers the pointer-less scroll. `capture` because
    // element `scroll` events do not bubble; the menu's OWN scroll is exempt so an
    // overflowing menu stays open while it is scrolled.
    const onScroll = (event: Event): void => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menuOpen]);

  // Place the portaled menu where the card actually is. `useLayoutEffect` so the seed
  // animation lands BEFORE paint: the menu's CSS origin is `left:0; top:0`, and a passive
  // effect would paint one frame at the viewport corner (the chip's finding 13). Web
  // Animations is the only CSP-safe computed position (`style-src 'self'`; no `[style]`).
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const menu = menuRef.current;
    const item = rootRef.current;
    // jsdom has no `element.animate`; the real browsers all do (the `gridReorder` suite
    // proves the same guard for the chip).
    if (!menu || !item || typeof menu.animate !== 'function') return;
    const rect = item.getBoundingClientRect();
    const { left, top } = menuAnchorFor(
      { top: rect.top, bottom: rect.bottom, right: rect.right },
      menuDirection,
      { width: menu.offsetWidth || MENU_FALLBACK_WIDTH, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menuAnimRef.current?.cancel();
    menuAnimRef.current = menu.animate([{ transform: `translate(${left}px, ${top}px)` }], {
      duration: 0,
      fill: 'forwards',
    });
    return () => {
      menuAnimRef.current?.cancel();
      menuAnimRef.current = null;
    };
  }, [menuOpen, menuDirection]);

  // Opening the rename field seeds it with the real title and takes focus + select. Keyed on
  // `renaming` alone: the title is read at open time (a later title change IS the commit).
  useEffect(() => {
    if (!renaming) return;
    setDraft(card.title);
    const field = inputRef.current;
    if (field && document.activeElement !== field) {
      field.focus();
      field.select();
    }
  }, [renaming, card.title]);

  // A REJECTED rename re-opens on the card's real title: the shell never took the new one.
  useEffect(() => {
    if (renameFailedNonce === 0) return;
    setDraft(card.title);
    const field = inputRef.current;
    if (field) {
      field.focus();
      field.select();
    }
  }, [renameFailedNonce, card.title]);

  function closeMenu(returnFocus: boolean): void {
    setMenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1 + buttons.length) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return (
    <li className="sheet-grid-item" data-sheet-id={card.id} ref={rootRef}>
      <div
        className="sheet-card"
        data-selected={selected ? 'true' : 'false'}
        data-dragging={dragging ? 'true' : 'false'}
      >
        <button
          type="button"
          className="sheet-card-open"
          aria-label={card.title}
          onClick={() => {
            // While the rename field is open the card is an editor, not a link.
            if (renaming) return;
            onOpen(card.id);
          }}
        >
          <span className="sheet-card-thumb">
            <SheetThumb thumb={card.thumb} />
            {selected ? (
              <span className="sheet-card-check" aria-hidden="true">
                <Check />
              </span>
            ) : (
              <span className="sheet-card-index mono" aria-hidden="true">
                {badge}
              </span>
            )}
            {card.insetCount > 0 ? (
              <span className="sheet-card-insets mono" aria-hidden="true">
                {t(STRINGS.project.insetBadge, { insetCount: card.insetCount })}
              </span>
            ) : null}
          </span>
          <span className="sheet-card-bottom">
            <span className="sheet-card-name">{card.title}</span>
            <span className="sheet-card-meta mono">
              {t(STRINGS.project.sheetMeta, {
                time: card.updatedAtLabel,
                dimensionCount: card.dimensionCount,
              })}
            </span>
          </span>
        </button>

        {renaming ? (
          <input
            ref={inputRef}
            className="sheet-rename-input"
            type="text"
            value={draft}
            aria-label={STRINGS.sheetMenu.renameLabel}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onCommitRename(card.id, draft);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCancelRename();
              }
            }}
            // Blur cancels: the field is a transient editor, never a form that lingers.
            onBlur={() => onCancelRename()}
          />
        ) : null}

        {selectable ? (
          <button
            type="button"
            className="sheet-card-select hit-slop"
            aria-pressed={selected}
            aria-label={t(STRINGS.project.selectToggle, { title: card.title })}
            onClick={() => onToggle(card.id)}
          >
            {selected ? <Check aria-hidden="true" /> : null}
          </button>
        ) : null}

        {menuable ? (
          <button
            ref={triggerRef}
            type="button"
            className="sheet-card-menu-button hit-slop"
            data-testid={`sheet-card-menu-${card.id}`}
            aria-label={menuName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              // The popup is 364 px tall (7 × 48 + gaps + padding) with no room to flip
              // inside a 300 px card, so open toward whichever side of the viewport has
              // space; the CSS `max-height`/`overflow-y` is the backstop. Measured in the
              // session-22 UI review: opening downward unconditionally at the bottom row
              // showed 102 px of 364 and made «Delete» the least reachable item.
              if (!menuOpen) setMenuDirection(menuDirectionFor(rootRef.current));
              setMenuOpen((open) => !open);
            }}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {menuable && menuOpen
        ? createPortal(
            <div
              ref={menuRef}
              className="sheet-card-menu"
              data-direction={menuDirection}
              role="menu"
              aria-label={menuName}
              onKeyDown={onMenuKeyDown}
            >
          <button
            type="button"
            role="menuitem"
            className="project-menu-item"
            data-card-menu-item="open"
            aria-label={t(STRINGS.sheetMenu.openNamed, { title: card.title })}
            onClick={() => {
              closeMenu(true);
              onOpen(card.id);
            }}
          >
            {STRINGS.sheetMenu.open}
          </button>
          {renamable ? (
            <button
              type="button"
              role="menuitem"
              className="project-menu-item"
              data-card-menu-item="rename"
              aria-label={t(STRINGS.sheetMenu.renameNamed, { title: card.title })}
              onClick={() => {
                // The field takes focus, so do not return it to the ⋯ trigger.
                closeMenu(false);
                onBeginRename(card.id);
              }}
            >
              {STRINGS.sheetMenu.rename}
            </button>
          ) : null}
          {duplicable ? (
            <button
              type="button"
              role="menuitem"
              className="project-menu-item"
              data-card-menu-item="duplicate"
              aria-label={t(STRINGS.sheetMenu.duplicateNamed, { title: card.title })}
              onClick={() => {
                closeMenu(true);
                onDuplicate(card.id);
              }}
            >
              {STRINGS.sheetMenu.duplicate}
            </button>
          ) : null}
          {replaceable ? (
            <button
              type="button"
              role="menuitem"
              className="project-menu-item"
              data-card-menu-item="replace"
              aria-label={t(STRINGS.sheetMenu.replaceNamed, { title: card.title })}
              onClick={() => {
                closeMenu(true);
                onReplacePhoto(card.id);
              }}
            >
              {STRINGS.sheetMenu.replacePhoto}
            </button>
          ) : null}
          {/* The keyboard path to the drag (WCAG 2.1.1). Disabled — a real `disabled` plus
              `aria-disabled` — at the first / last LIVE position, so the ends read as ends. */}
          {reorderable ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="project-menu-item"
                data-card-menu-item="moveEarlier"
                disabled={!canMoveEarlier}
                aria-disabled={!canMoveEarlier ? 'true' : undefined}
                onClick={() => {
                  closeMenu(true);
                  onMove(card.id, 'earlier');
                }}
              >
                {STRINGS.sheetMenu.moveEarlier}
              </button>
              <button
                type="button"
                role="menuitem"
                className="project-menu-item"
                data-card-menu-item="moveLater"
                disabled={!canMoveLater}
                aria-disabled={!canMoveLater ? 'true' : undefined}
                onClick={() => {
                  closeMenu(true);
                  onMove(card.id, 'later');
                }}
              >
                {STRINGS.sheetMenu.moveLater}
              </button>
            </>
          ) : null}
          {deletable ? (
            <button
              type="button"
              role="menuitem"
              className="project-menu-item"
              data-card-menu-item="delete"
              aria-label={t(STRINGS.sheetMenu.deleteNamed, { title: card.title })}
              onClick={() => {
                // Return focus to the trigger before the shell removes the card.
                closeMenu(true);
                onDelete(card.id);
              }}
            >
              {STRINGS.sheetMenu.delete}
            </button>
          ) : null}
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}

interface OverflowItem {
  key: string;
  label: string;
  /** Unbuilt in v1 → rendered disabled with `aria-disabled` (D102), never hidden. */
  disabled: boolean;
  run?: () => void;
}

export default function ProjectScreen({
  projectTitle,
  sheetCount,
  state,
  sheets,
  readOnly = false,
  selectedIds,
  onToggleSelected,
  onClearSelection,
  onOpenSheet,
  onTakePhoto,
  onImport,
  onExport,
  onBack,
  onRetry,
  onDeleteSheet,
  trash,
  trashRestoreFailed,
  onOpenTrash,
  onRestoreSheet,
  onCloseTrash,
  projectId,
  refreshKey,
  onReorderSheets,
  onRenameSheet,
  onDuplicateSheet,
  onReplacePhoto,
  replacePrompt,
  onResolveReplace,
}: ProjectScreenProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameFailedNonce, setRenameFailedNonce] = useState(0);

  const overflowRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLUListElement | null>(null);
  /** The grid's scroll container (`.project-body`) — the autoscroll target (D118 M8). */
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  // A read-only project (UI §11.2) and an unreadable one (state `error`) can't take a write.
  const blocked = readOnly || state === 'error';

  // Every affordance exists only when the shell injects the real callback — never a silent
  // no-op, never a dead-looking control (D102).
  const deletable = typeof onDeleteSheet === 'function';
  const trashAvailable = typeof onOpenTrash === 'function';
  const renamable = typeof onRenameSheet === 'function';
  const duplicable = typeof onDuplicateSheet === 'function';
  const replaceable = typeof onReplacePhoto === 'function';
  const reorderable = typeof onReorderSheets === 'function';
  const menuable = deletable || renamable || duplicable || replaceable || reorderable;

  /** The shell's order, and the rendered order (which the drag may override locally). */
  const propOrder = useMemo(() => sheets.map((sheet) => sheet.id), [sheets]);
  const byId = useMemo(() => new Map(sheets.map((sheet) => [sheet.id, sheet])), [sheets]);

  /**
   * Persist an order. The list is updated locally FIRST by the hook (the drag's live
   * renumber), and only a rejection walks it back — with an honest toast, never a silent
   * snap-back (§13.4). While the write is in flight the local order is kept; the shell's
   * reload adopts it.
   */
  const commitReorder = useCallback(
    async (next: readonly string[]): Promise<void> => {
      const write = onReorderSheets;
      if (typeof write !== 'function') return;
      try {
        await write(next);
      } catch {
        emitToast({ text: STRINGS.sheetMenu.reorderFailed, urgent: true });
        throw new Error('reorder failed');
      }
    },
    [onReorderSheets],
  );

  const reorderDrag = useSheetReorderDrag({
    gridRef,
    bodyRef,
    order: propOrder,
    onCommit: commitReorder,
    enabled: reorderable,
    renamingId,
  });
  const { renderOrder: displayOrder, dragPhase, dragId, chipRef, onGridPointerDown, onGridClickCapture, moveCard } =
    reorderDrag;

  const orderedSheets = useMemo(
    () =>
      displayOrder
        .map((id) => byId.get(id))
        .filter((card): card is ProjectSheetCard => card !== undefined),
    [displayOrder, byId],
  );

  // The top bar's ⋯ menu: `Trash…` is live once the shell can load `.trash/`.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!overflowRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // The replace dialog and the trash panel are never both open: the newest one wins.
  useEffect(() => {
    if (replacePrompt) setTrashOpen(false);
  }, [replacePrompt]);

  function closeMenu(returnFocus: boolean): void {
    setMenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1 + buttons.length) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  /** A blocked mutation is surfaced honestly, never swallowed (UI §11.2 error/read-only). */
  function noteBlocked(): void {
    emitToast({ text: STRINGS.project.notSavedToast, urgent: true });
  }

  // ---- delete (unchanged) ----------------------------------------------------

  /**
   * §13.3 destructive policy: a sheet delete is RECOVERABLE — immediate, then a toast with a
   * real 10 s Undo window (§13.4's action-carrying timing). The toast is emitted **after the
   * shell's write resolves**, never optimistically.
   */
  async function handleDeleteSheet(id: string): Promise<void> {
    const remove = onDeleteSheet;
    if (typeof remove !== 'function') return;
    try {
      await remove(id);
    } catch {
      // The write failed: say so, and do NOT claim a deletion or offer an undo for one.
      emitToast({ text: STRINGS.trash.deleteFailed, urgent: true });
      return;
    }
    emitToast({
      text: STRINGS.toasts.sheetDeleted,
      action:
        typeof onRestoreSheet === 'function'
          ? { label: STRINGS.editor.undo, run: () => onRestoreSheet(id) }
          : undefined,
    });
  }

  // ---- duplicate / replace ---------------------------------------------------

  /**
   * `Duplicate` never inserts a card optimistically: the SHELL owns the copy and refreshes
   * the list from disk. Here we only report a rejection — the one thing the screen knows.
   */
  async function handleDuplicateSheet(id: string): Promise<void> {
    const duplicate = onDuplicateSheet;
    if (typeof duplicate !== 'function') return;
    try {
      await duplicate(id);
    } catch {
      emitToast({ text: STRINGS.sheetMenu.duplicateFailed, urgent: true });
    }
  }

  function handleReplacePhoto(id: string): void {
    // Fire-and-forget: the shell owns the picker and decides silent-vs-warned.
    onReplacePhoto?.(id);
  }

  // ---- rename ----------------------------------------------------------------

  function beginRename(id: string): void {
    setRenamingId(id);
  }

  function cancelRename(): void {
    setRenamingId(null);
  }

  /**
   * Commit a rename. Blank or unchanged is a CANCEL — the shell is never called with `''`
   * (a stored blank title is a nameless card). A rejection keeps the field open on the
   * card's real title and says so: the screen must not claim a rename that did not happen.
   */
  async function commitRename(id: string, value: string): Promise<void> {
    const rename = onRenameSheet;
    const card = byId.get(id);
    const title = value.trim();
    if (typeof rename !== 'function' || card === undefined || title === '' || title === card.title) {
      setRenamingId(null);
      return;
    }
    try {
      await rename(id, title);
      setRenamingId(null);
    } catch {
      setRenameFailedNonce((nonce) => nonce + 1);
      emitToast({ text: STRINGS.sheetMenu.renameFailed, urgent: true });
    }
  }

  // ---- trash -----------------------------------------------------------------

  /** Open the trash panel: return focus to the ⋯ trigger first, then tell the shell to load. */
  function openTrash(): void {
    triggerRef.current?.focus();
    setTrashOpen(true);
    onOpenTrash?.();
  }

  function closeTrash(): void {
    setTrashOpen(false);
    onCloseTrash?.();
  }

  // The selection in display order — `[]` means "every sheet" (onExport contract).
  const selectedInOrder = useMemo(
    () => orderedSheets.filter((sheet) => selected.has(sheet.id)).map((sheet) => sheet.id),
    [orderedSheets, selected],
  );

  const menuItems: OverflowItem[] = [
    {
      key: 'export',
      label: STRINGS.export.button,
      disabled: false,
      run: () => onExport(selectedInOrder),
    },
    { key: 'rename', label: STRINGS.projectMenu.rename, disabled: true },
    { key: 'copyPath', label: STRINGS.projectMenu.copyPath, disabled: true },
    { key: 'revealFolder', label: STRINGS.export.revealFolder, disabled: true },
    {
      // UI §11.2:711 — `Trash…` is live once the shell can load `.trash/` (D102: disabled
      // and labelled otherwise, never hidden).
      key: 'trash',
      label: STRINGS.trash.open,
      disabled: !trashAvailable,
      run: openTrash,
    },
    { key: 'deleteProject', label: STRINGS.projectMenu.deleteProject, disabled: true },
    { key: 'projectSettings', label: STRINGS.editor.menuProjectSettings, disabled: true },
  ];

  return (
    <main className="project-screen" data-state={state}>
      <header className="project-bar">
        <button
          type="button"
          className="crumb crumb-back hit-slop"
          aria-label={STRINGS.a11y.backToProjects}
          onClick={onBack}
        >
          <ChevronLeft aria-hidden="true" />
          <span className="crumb-text">{STRINGS.editor.breadcrumbProjects}</span>
        </button>

        <h1 className="project-title">{projectTitle}</h1>
        {state !== 'error' ? (
          <span className="project-count mono">{sheetCountLabel(sheetCount)}</span>
        ) : null}

        {/* §11.4's storage chip. Only meaningful for a real, open project (D51 runtime key). */}
        {projectId ? <StorageChip projectId={projectId} refreshKey={refreshKey} /> : null}

        {readOnly ? (
          <span className="project-readonly-chip" role="status">
            {STRINGS.project.readOnlyChip}
          </span>
        ) : null}

        <div className="project-bar-spacer" />

        {/* D152: Help, just left of Export. */}
        <HelpButton />
        <button
          type="button"
          className="btn btn-primary project-export hit-slop"
          aria-label={STRINGS.a11y.export}
          onClick={() => onExport(selectedInOrder)}
        >
          <Share2 aria-hidden="true" />
          <span>{STRINGS.export.button}</span>
        </button>

        <div className="project-overflow" ref={overflowRef}>
          <button
            ref={triggerRef}
            type="button"
            className="project-icon-button hit-slop"
            aria-label={STRINGS.a11y.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div
              ref={menuRef}
              className="project-menu"
              role="menu"
              aria-label={STRINGS.a11y.moreActions}
              onKeyDown={onMenuKeyDown}
            >
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="project-menu-item"
                  data-menu-item={item.key}
                  disabled={item.disabled}
                  aria-disabled={item.disabled ? 'true' : undefined}
                  onClick={() => {
                    closeMenu(false);
                    item.run?.();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="project-body" ref={bodyRef}>
        <div className="project-body-inner">
          {state === 'error' ? (
            <p className="project-error-line" role="alert">
              {STRINGS.project.loadError}
              {onRetry ? (
                <button
                  type="button"
                  className="btn btn-secondary hit-slop project-error-retry"
                  onClick={onRetry}
                >
                  {STRINGS.errors.retry}
                </button>
              ) : null}
            </p>
          ) : null}

          <ul
            ref={gridRef}
            className="sheet-grid"
            role="list"
            aria-label={STRINGS.project.sheetsRegion}
            aria-busy={state === 'loading' ? 'true' : undefined}
            onPointerDown={onGridPointerDown}
            onClickCapture={onGridClickCapture}
          >
            {/* The two add tiles: FIRST, always, in every state — never skeletonised. */}
            <li className="sheet-grid-item">
              <button
                type="button"
                className="sheet-tile sheet-tile-photo hit-slop"
                aria-disabled={blocked ? 'true' : undefined}
                onClick={() => {
                  if (blocked) {
                    noteBlocked();
                    return;
                  }
                  onTakePhoto();
                }}
              >
                <Camera aria-hidden="true" />
                <span>{STRINGS.project.addTakePhoto}</span>
              </button>
            </li>
            <li className="sheet-grid-item">
              <button
                type="button"
                className="sheet-tile sheet-tile-import hit-slop"
                aria-disabled={blocked ? 'true' : undefined}
                onClick={() => {
                  if (blocked) {
                    noteBlocked();
                    return;
                  }
                  onImport();
                }}
              >
                <Upload aria-hidden="true" />
                <span>{STRINGS.capture.importButton}</span>
              </button>
            </li>

            {state === 'loading'
              ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <li
                    key={`skeleton-${i}`}
                    className="sheet-card sheet-card-skeleton"
                    aria-hidden="true"
                  />
                ))
              : state === 'ready'
                ? orderedSheets.map((card, position) => (
                    <SheetCardRow
                      key={card.id}
                      card={card}
                      displayIndex={position + 1}
                      selected={selected.has(card.id)}
                      selectable={typeof onToggleSelected === 'function'}
                      menuable={menuable}
                      deletable={deletable}
                      renamable={renamable}
                      duplicable={duplicable}
                      replaceable={replaceable}
                      reorderable={reorderable}
                      canMoveEarlier={position > 0}
                      canMoveLater={position < orderedSheets.length - 1}
                      dragging={dragId === card.id}
                      renaming={renamingId === card.id}
                      renameFailedNonce={renameFailedNonce}
                      onOpen={onOpenSheet}
                      onToggle={onToggleSelected ?? (() => {})}
                      // UI §11.2:722: in a read-only — or unreadable — project, a mutation
                      // says «Not saved to disk» instead of attempting a write that cannot
                      // land. The add tiles above already do exactly this; before this, the
                      // new card actions were live on the grid's `error` state.
                      onDelete={blocked ? noteBlocked : handleDeleteSheet}
                      onDuplicate={blocked ? noteBlocked : handleDuplicateSheet}
                      onReplacePhoto={blocked ? noteBlocked : handleReplacePhoto}
                      onBeginRename={blocked ? noteBlocked : beginRename}
                      onCommitRename={commitRename}
                      onCancelRename={cancelRename}
                      onMove={blocked ? noteBlocked : moveCard}
                    />
                  ))
                : null}
          </ul>

          {state === 'empty' ? (
            <p className="sheet-empty-line">{STRINGS.project.noSheetsEmpty}</p>
          ) : null}
        </div>
      </div>

      {selectedInOrder.length > 0 ? (
        <div className="project-selection-bar" role="status">
          <span className="project-selection-count mono">
            {t(STRINGS.project.selectionCount, { count: selectedInOrder.length })}
          </span>
          <button
            type="button"
            className="btn btn-primary hit-slop"
            aria-label={STRINGS.a11y.export}
            onClick={() => onExport(selectedInOrder)}
          >
            {STRINGS.export.button}
          </button>
          <button
            type="button"
            className="btn btn-secondary hit-slop"
            onClick={() => onClearSelection?.()}
          >
            {STRINGS.project.clearSelection}
          </button>
        </div>
      ) : null}

      {/* The replace-photo warned dialog (§11.2:720). Newest-open wins over the trash panel:
          both are modals and only one may ever be in the tree. */}
      {replacePrompt ? (
        <ReplaceDialog
          sheetTitle={replacePrompt.title}
          onResolve={(choice) => onResolveReplace?.(choice)}
        />
      ) : null}

      {/* The trash restore UI (§11.2:711; P §11.9:2029). The panel owns its own
          `role="dialog"`/focus trap; this is the only mount point. */}
      {!replacePrompt && trashOpen ? (
        <TrashPanel
          items={trash}
          restoreFailed={trashRestoreFailed ?? false}
          onRestore={onRestoreSheet}
          onClose={closeTrash}
        />
      ) : null}

      {/* «Drop to move» follows the card (§11.2:719). A `role="status"` so a screen reader
          hears it; positioned by `element.animate`, never an inline style. */}
      {dragPhase === 'dragging' ? (
        <div ref={chipRef} className="sheet-reorder-chip" data-testid="sheet-reorder-chip" role="status">
          {STRINGS.project.reorderChip}
        </div>
      ) : null}
    </main>
  );
}
