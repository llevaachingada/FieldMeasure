/**
 * `src/ui/TopBar.tsx` — the 52 px Editor top bar (implementation plan slice 1.4.5,
 * build order step 5; build spec §11.3, UI spec §5.1–§5.3).
 *
 * Zones (UI §5.2, non-negotiable):
 *   - Left   — breadcrumb `‹ Projects › «Project» › «Sheet»` (48 px targets).
 *   - Centre — the **autosave chip slot**. Slice 1.10 fills it with `AutosaveChip`; if
 *     no chip is supplied the slot renders **nothing at all** — never an optimistic
 *     "Saved" (do-not-simplify #14).
 *   - Right  — `⌗ Layers · ⇧ Export · ⋯ Overflow` (UI §5.2). Layers/Export are
 *     present-but-disabled until the shell supplies their handler (slice 1.6 / 1.9); the
 *     Overflow holds the wired `Export` row plus the nine items keyed in
 *     `appendix-strings-gaps.md` §9.
 *
 * Undo/redo are NOT here: UI §5.1 says they live at the bottom of the tool rail,
 * directly under the drawing hand, and are "not duplicated in the top bar" (build
 * spec §11.4 agrees). See `ToolRail`.
 *
 * In portrait the Export label collapses to its icon and the breadcrumb collapses to
 * a single `‹ Sheet` chip (UI §5.2); that is the `compact` prop, driven by the same
 * `panelDockFor` predicate as the style dock.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Layers, MoreHorizontal, Share2 } from 'lucide-react';
import { STRINGS } from './strings';

export interface TopBarProps {
  /** Shown in the middle breadcrumb segment; falls back to the appendix placeholder. */
  projectName?: string;
  /** Shown in the last breadcrumb segment; falls back to the appendix placeholder. */
  sheetName?: string;
  /** `‹ Projects` — returns to the project list (the Escape ladder's last rung). */
  onExit?: () => void;
  /** Overflow → Add sheet. Optional: absent = a labelled no-op (1.4 camera lane wires it). */
  onAddSheet?: () => void;
  /** Overflow → Import file. Optional. */
  onImportFile?: () => void;
  /**
   * The autosave chip, supplied by `EditorLayout` (slice 1.10 mounts `AutosaveChip`).
   * Default `undefined` → the slot renders nothing (a placeholder that never lies).
   */
  autosaveChip?: ReactNode;
  /** Portrait: Export collapses to icon-only, the breadcrumb to a single chip. */
  compact?: boolean;
  /**
   * Slice 1.6 wiring: the Layers flyout toggle. Absent = the button stays disabled
   * (a labelled no-op, never a lie).
   */
  onToggleLayers?: () => void;
  /** Current Layers flyout state, for `aria-expanded`. Ignored without `onToggleLayers`. */
  layersOpen?: boolean;
  /**
   * Slice 1.9 wiring: opens the export wizard (UI §12:740 — the top-bar entry point).
   * Absent = the button stays disabled and the menu row is a labelled no-op, exactly
   * like every other not-yet-wired control here.
   */
  onExport?: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  run?: () => void;
}

export default function TopBar({
  projectName,
  sheetName,
  onExit,
  onAddSheet,
  onImportFile,
  autosaveChip,
  compact = false,
  onToggleLayers,
  layersOpen = false,
  onExport,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The overflow items (UI §5.2 right zone; copy from gaps §9). Items whose feature does
  // not exist yet are still present and labelled — a no-op, not a dead end and not a
  // crash. `Export` is the third §12:740 entry point (`⋯ → Export`); its label is the
  // already-approved `a11y.export`, not new copy.
  const items: MenuItem[] = [
    { key: 'export', label: STRINGS.a11y.export, run: onExport },
    { key: 'duplicateSheet', label: STRINGS.editor.menuDuplicateSheet },
    { key: 'insertImage', label: STRINGS.editor.menuInsertImage },
    { key: 'addSheet', label: STRINGS.editor.menuAddSheet, run: onAddSheet },
    { key: 'importFile', label: STRINGS.editor.menuImportFile, run: onImportFile },
    { key: 'sheetInfo', label: STRINGS.editor.menuSheetInfo },
    { key: 'projectSettings', label: STRINGS.editor.menuProjectSettings },
    { key: 'settings', label: STRINGS.editor.menuSettings },
    { key: 'help', label: STRINGS.editor.menuHelp },
    { key: 'keyboardShortcuts', label: STRINGS.editor.menuKeyboardShortcuts },
  ];

  // Focus the first item when the menu opens (standard menu behaviour), and close on
  // an outside pointer press. Escape closes and returns focus to the trigger.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
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
      // Swallow it so the layout's Escape ladder does not also advance a rung.
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu(false);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
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
    <header className="editor-topbar" data-testid="editor-topbar" data-compact={compact ? 'true' : 'false'}>
      <nav className="topbar-breadcrumb" aria-label={STRINGS.a11y.breadcrumb} data-compact={compact ? 'true' : 'false'}>
        <button
          type="button"
          className="crumb crumb-back hit-slop"
          aria-label={STRINGS.editor.breadcrumbProjects}
          onClick={onExit}
        >
          <ChevronLeft aria-hidden="true" />
          <span className="crumb-text">{STRINGS.editor.breadcrumbProjects}</span>
        </button>
        <ChevronRight className="crumb-sep" aria-hidden="true" />
        <span className="crumb crumb-project">
          {projectName || STRINGS.editor.breadcrumbProjectSegment}
        </span>
        <ChevronRight className="crumb-sep" aria-hidden="true" />
        <span className="crumb crumb-sheet">
          {sheetName || STRINGS.editor.breadcrumbSheetSegment}
        </span>
      </nav>

      {/* Autosave slot: filled by `EditorLayout` (slice 1.10); empty when none is
          supplied (do-not-simplify #14 — never an optimistic "Saved"). */}
      <div className="topbar-autosave" data-testid="autosave-slot">
        {autosaveChip ?? null}
      </div>

      <div className="topbar-actions">
        {/* Slice 1.6 wiring: real when the shell supplies a toggle, otherwise the
            labelled disabled no-op it has always been. */}
        <button
          type="button"
          className="topbar-action"
          aria-label={STRINGS.a11y.layers}
          aria-expanded={onToggleLayers ? layersOpen : undefined}
          disabled={!onToggleLayers}
          onClick={onToggleLayers}
        >
          <Layers aria-hidden="true" />
          <span className="topbar-action-label">{STRINGS.a11y.layers}</span>
        </button>
        <button
          type="button"
          className="topbar-action"
          aria-label={STRINGS.a11y.export}
          disabled={!onExport}
          onClick={onExport}
        >
          <Share2 aria-hidden="true" />
          <span className="topbar-action-label">{STRINGS.a11y.export}</span>
        </button>
        <div className="topbar-overflow" ref={overflowRef}>
          <button
            ref={triggerRef}
            type="button"
            className="topbar-action topbar-overflow-trigger hit-slop"
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
              className="topbar-menu"
              role="menu"
              aria-label={STRINGS.a11y.moreActions}
              onKeyDown={onMenuKeyDown}
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item"
                  data-menu-item={item.key}
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
      </div>
    </header>
  );
}
