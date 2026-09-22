/**
 * `src/ui/ProjectScreen.tsx` — the Project screen: one project's sheets grid (UI §11.2;
 * build spec §20.5(a); D88/D102). **Not yet routed** — the orchestrator wires `App` to the
 * pinned `ProjectScreenProps` below.
 *
 * What this screen is for: seeing every sheet at a glance, adding pages, and exporting.
 * The two add tiles («Take photo» / «Import») come FIRST in the grid, always, in every
 * state — in a field app the add affordance must be the easiest thing on the screen
 * (UI §11.2).
 *
 * SHEET TRASH (this lane): the per-card `⋯` → `Delete` affordance (§13.3: recoverable —
 * immediate, then a 10 s «Sheet deleted · Undo» toast via the shipped `ToastHost`), and the
 * top bar's `⋯ → «Trash…»` panel (list + read-only preview + `«Restore»`, §11.2:711 /
 * P §11.9:2029). Both are injected through optional props: absent means no affordance.
 * DELETE IS NEVER A SILENT NO-OP and never a bare one-tap — it is a two-tap card menu with
 * a real undo window.
 *
 * A11Y (per-slice, non-negotiable):
 *   - every control has an accessible name; 48 px minimum targets with `.hit-slop`;
 *     the global `:focus-visible` ring (styles.css) is untouched.
 *   - the grid is a real `role="list"` with `listitem` children and a stable focus order.
 *   - selection state is conveyed with `aria-pressed`; the selection bar is `role="status"`,
 *     so a screen reader hears the selected count change.
 *   - mutation controls that are blocked (read-only / unreadable project) say so through the
 *     existing toast bus (`emitToast`, UI §13.4 / §11.2) — never a silent no-op.
 *
 * NO INLINE STYLES: the CSP is `style-src 'self'` and the e2e suite asserts `[style]`
 * count === 0, so every bit of state rides on a class or a data attribute.
 *
 * LAYOUT IS NOT jsdom-VISIBLE (D40): the responsive column counts (4 @ ≥1440, 3 @ ≥1200,
 * 2 @ portrait ≥960, 1 below) live in `projectScreen.css` and are a MANUAL check, not a
 * unit assertion. jsdom runs with no layout engine, so a test here could only ever assert
 * the CSS text, which proves nothing about the rendered columns.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, MoreHorizontal, Share2, Upload } from 'lucide-react';
import { emitToast } from '@/editor/session';
import type { ProjectSheetCard } from '@/fs/projectSheets';
import { STRINGS, t } from './strings';
import TrashPanel, { type TrashedSheet } from './TrashPanel';
import './projectScreen.css';

export type { ProjectSheetCard, TrashedSheet };

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
}

/** UI §11.2 loading state: 8 skeleton cards, plus the two real add tiles. */
const SKELETON_COUNT = 8;

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

interface SheetCardRowProps {
  card: ProjectSheetCard;
  selected: boolean;
  selectable: boolean;
  /** True when `onDeleteSheet` is injected — the card's ⋯ menu (delete affordance) renders. */
  deletable: boolean;
  onOpen(id: string): void;
  onToggle(id: string): void;
  onDelete(id: string): void;
}

/**
 * One sheet card (320 × 300). The card itself opens the sheet; a per-card `⋯` opens the
 * §11.2 card menu. This lane builds only the item it owns — `Delete` (§13.3: recoverable,
 * immediate + the 10 s undo toast). The rest of the §11.2 card menu (Rename, Duplicate,
 * Replace photo) is owed by other slices and is deliberately NOT faked here: rendering
 * disabled copies would stage copy and markup those lanes also touch, and the pinned props
 * carry no callbacks for them.
 *
 * The popup is a SIBLING of `.sheet-card`, inside the `.sheet-grid-item` wrapper: the card
 * clips its own contents (`overflow: hidden`, for the thumbnail's rounded corners), so a
 * menu nested inside it would be clipped away.
 */
function SheetCardRow({
  card,
  selected,
  selectable,
  deletable,
  onOpen,
  onToggle,
  onDelete,
}: SheetCardRowProps) {
  // The «04» badge — 1-based, mono. Runtime number, never a persisted string (appendix
  // excludes `04` as an example value).
  const badge = String(card.index).padStart(2, '0');

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLLIElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuName = t(STRINGS.sheetMenu.moreNamed, { title: card.title });

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

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
      <div className="sheet-card" data-selected={selected ? 'true' : 'false'}>
        <button
          type="button"
          className="sheet-card-open"
          aria-label={card.title}
          onClick={() => onOpen(card.id)}
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
        {deletable ? (
          <button
            ref={triggerRef}
            type="button"
            className="sheet-card-menu-button hit-slop"
            data-testid={`sheet-card-menu-${card.id}`}
            aria-label={menuName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {deletable && menuOpen ? (
        <div
          ref={menuRef}
          className="sheet-card-menu"
          role="menu"
          aria-label={menuName}
          onKeyDown={onMenuKeyDown}
        >
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
        </div>
      ) : null}
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
  onDeleteSheet,
  trash,
  trashRestoreFailed,
  onOpenTrash,
  onRestoreSheet,
  onCloseTrash,
}: ProjectScreenProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  // A read-only project (UI §11.2) and an unreadable one (state `error`) can't take a write.
  const blocked = readOnly || state === 'error';
  // The delete affordance exists only when the shell injects the real callback — never a
  // silent no-op, never a dead-looking control (D102).
  const deletable = typeof onDeleteSheet === 'function';
  const trashAvailable = typeof onOpenTrash === 'function';

  // The selection in sheet order — `[]` means "every sheet" (onExport contract).
  const selectedInOrder = useMemo(
    () => sheets.filter((s) => selected.has(s.id)).map((s) => s.id),
    [sheets, selected],
  );

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!overflowRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

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

  /**
   * §13.3 destructive policy: a sheet delete is RECOVERABLE — immediate, then a toast with a
   * real 10 s Undo window (§13.4's action-carrying timing). The toast is emitted **after the
   * shell's write resolves**, never optimistically: a screen that announced «Sheet deleted»
   * before the write landed would be claiming something the system may not have done — the
   * same rule that keeps the autosave chip from ever being optimistic (§13.1).
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
        <span className="project-count mono">{t(STRINGS.project.sheetCount, { sheetCount })}</span>

        {readOnly ? (
          <span className="project-readonly-chip" role="status">
            {STRINGS.project.readOnlyChip}
          </span>
        ) : null}

        <div className="project-bar-spacer" />

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

      <div className="project-body">
        <div className="project-body-inner">
          {state === 'error' ? (
            <p className="project-error-line" role="alert">
              {STRINGS.project.loadError}
            </p>
          ) : null}

          <ul
            className="sheet-grid"
            role="list"
            aria-label={STRINGS.project.sheetsRegion}
            aria-busy={state === 'loading' ? 'true' : undefined}
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
                ? sheets.map((card) => (
                    <SheetCardRow
                      key={card.id}
                      card={card}
                      selected={selected.has(card.id)}
                      selectable={typeof onToggleSelected === 'function'}
                      deletable={deletable}
                      onOpen={onOpenSheet}
                      onToggle={onToggleSelected ?? (() => {})}
                      onDelete={handleDeleteSheet}
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

      {/* The trash restore UI (§11.2:711; P §11.9:2029). The panel owns its own
          `role="dialog"`/focus trap; this is the only mount point. */}
      {trashOpen ? (
        <TrashPanel
          items={trash}
          restoreFailed={trashRestoreFailed ?? false}
          onRestore={onRestoreSheet}
          onClose={closeTrash}
        />
      ) : null}
    </main>
  );
}
