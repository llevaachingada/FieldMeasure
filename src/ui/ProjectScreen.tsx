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
import './projectScreen.css';

export type { ProjectSheetCard };

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
  onOpen(id: string): void;
  onToggle(id: string): void;
}

function SheetCardRow({ card, selected, selectable, onOpen, onToggle }: SheetCardRowProps) {
  // The «04» badge — 1-based, mono. Runtime number, never a persisted string (appendix
  // excludes `04` as an example value).
  const badge = String(card.index).padStart(2, '0');
  return (
    <li className="sheet-card" data-selected={selected ? 'true' : 'false'} data-sheet-id={card.id}>
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
}: ProjectScreenProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  // A read-only project (UI §11.2) and an unreadable one (state `error`) can't take a write.
  const blocked = readOnly || state === 'error';

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
    { key: 'trash', label: STRINGS.trash.open, disabled: true },
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
                      onOpen={onOpenSheet}
                      onToggle={onToggleSelected ?? (() => {})}
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
    </main>
  );
}
