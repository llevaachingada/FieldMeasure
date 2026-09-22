/**
 * `src/ui/LayersPanel.tsx` — slice 1.6, the Layers flyout (UI spec §9; build spec §8.6,
 * §20.1–§20.2; touch-first accessibility §14 / §19.6).
 *
 * PROPS-DRIVEN AND SELF-CONTAINED. This component never reads the scene, the tools or a
 * store: the shell passes rows and callbacks and mounts it. That is what keeps the panel
 * disjoint from the tool lanes (BUILD-RUNBOOK §11 "never make one lane import a sibling's
 * in-flight file"). The pinned interface below is the integration seam.
 *
 * WHAT THE SPEC REQUIRES, AND WHERE EACH REQUIREMENT LIVES
 *  - A proper list of 56 px rows (`role="list"` / `role="listitem"`), a type icon, the
 *    already-derived name, an eye toggle, a lock toggle and drag-to-reorder (§9).
 *  - "top = front": the shell supplies the row order; the panel renders it verbatim and
 *    only inserts group headers, so it never re-derives z-order (§8.6 + §20.2).
 *  - A 400 ms long-press starts the drag "so it isn't confused with a tap-to-select" (§9),
 *    and a tap selects. The row **body** long-press opens the row menu (§9) — the grip
 *    and the body are separate 400 ms affordances so both spec sentences are honoured.
 *  - Cross-band drops are REFUSED, not silently applied (§20.2): a drop whose source and
 *    target are not in the same group never reaches `onReorder`, and the panel says why
 *    with `editor.highlighterBandMessage`.
 *  - The photo row is lockable but NEVER deletable (§20.2 / §9), so its menu has no
 *    `Delete` item and it offers no grip.
 *  - Locked rows are selectable but render distinctly (§8.6). The shell owns the
 *    "locked — unlock in Layers" toast; this panel only shows the state.
 *  - Empty ≠ Loading (§9 + the slice gate): `rows: []` shows `editor.layersEmpty`;
 *    `loading: true` shows skeleton rows instead and never the empty message.
 *
 * DELIBERATE, REPORTED SCOPE NOTES (do not read these as spec silence)
 *  1. The pinned props carry no channel for the row menu's `Group` / `Ungroup` actions
 *     (there is no `onGroup` / `onUngroup`), so those two items render **disabled**. Every
 *     other item is wired: `Bring to front` / `Send to back` route through `onReorder`
 *     (front = index 0 of the group, back = last index), `Rename` through `onRename`, and
 *     `Delete` through `onDelete` (absent when `deletable === false`).
 *  2. There is no appendix string for a drag grip, so the grip is **decorative**
 *     (`aria-hidden`, not focusable). Keyboard users reorder with the row menu's
 *     `Bring to front` / `Send to back`, or `Alt`+`ArrowUp`/`ArrowDown` on the focused row
 *     (one position within the row's own group). The grip is therefore pointer-only input,
 *     never the only path to the action.
 *  3. The `insets` band has no group string in either appendix, so it renders header-less
 *     (UI §9 shows `Inset 2` / `Inset 1` with no header) exactly as the copy permits.
 *     `layers.groupPhoto` is the photo ROW's name, so it belongs to the shell, not here.
 *  4. `rows` is expected in display order, grouped (the shell's job). The panel preserves
 *     that order and merges only CONSECUTIVE runs of the same group into one band, so a
 *     mis-ordered input is rendered faithfully rather than silently re-sorted.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Images,
  Lock,
  MoreHorizontal,
  PenTool,
  Ruler,
  Shapes,
  Type,
  Unlock,
  X,
} from 'lucide-react';

import { STRINGS, t } from './strings';
import './layersPanel.css';

// ---------------------------------------------------------------------------
// Pinned interface — the shell is written against EXACTLY this shape.
// ---------------------------------------------------------------------------

export type LayerGroup = 'dimensions' | 'shapes' | 'ink' | 'text' | 'insets' | 'photo';

export interface LayerRow {
  /** `AnnotationPath` key (§20.1) — never an array index. */
  key: string;
  /** Already-derived display name, e.g. `Dimension 12'-6"`. The panel never derives it. */
  name: string;
  group: LayerGroup;
  /** 0 for a top-level row, 1 for an inset child (indented). */
  indent?: number;
  locked: boolean;
  visible: boolean;
  /** §20.2: the photo row is lockable but never deletable. */
  deletable: boolean;
}

export interface LayersPanelProps {
  rows: LayerRow[];
  /** Currently selected row keys. */
  selectedKeys: string[];
  /** `null` while the scene is loading; `[]` is a legitimate empty document. */
  loading?: boolean;
  onSelect: (key: string) => void;
  onToggleVisible: (key: string) => void;
  onToggleLock: (key: string) => void;
  /** Drop `key` at `toIndex` within the SAME group (cross-band drops are refused, §20.2). */
  onReorder: (key: string, toIndex: number) => void;
  onRename: (key: string, name: string) => void;
  onDelete: (key: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants + pure helpers (exported so the machine gates can execute them)
// ---------------------------------------------------------------------------

/** §9: "a 400ms long-press starts the drag so it isn't confused with a tap-to-select". */
export const LONG_PRESS_MS = 400;

/** The four bands that UI §9 nests under the `Markup` header. */
export const MARKUP_GROUPS = ['dimensions', 'shapes', 'ink', 'text'] as const;

export function isMarkupGroup(group: LayerGroup): boolean {
  return (MARKUP_GROUPS as readonly string[]).includes(group);
}

/**
 * Group header copy. `insets` is deliberately blank: neither appendix keys an insets
 * group name, and UI §9 draws `Inset 2` / `Inset 1` as bare rows — so the band renders
 * header-less rather than with a builder-invented label.
 */
export const GROUP_LABEL: Record<LayerGroup, string> = {
  dimensions: STRINGS.layers.groupDimensions,
  shapes: STRINGS.layers.groupShapes,
  ink: STRINGS.layers.groupInk,
  text: STRINGS.layers.groupText,
  insets: '',
  photo: '',
};

const GROUP_ICON: Record<LayerGroup, typeof Ruler> = {
  dimensions: Ruler,
  shapes: Shapes,
  ink: PenTool,
  text: Type,
  insets: Images,
  photo: ImageIcon,
};

export interface LayerBlock {
  group: LayerGroup;
  rows: LayerRow[];
}

/**
 * Consecutive runs of the same group. A row with `indent > 0` (an inset child) always
 * attaches to the run it follows, whatever its own `group`, so a child is never torn out
 * of its parent's band — the pinned props carry no parent id, only `indent`.
 */
export function buildBlocks(rows: LayerRow[]): LayerBlock[] {
  const blocks: LayerBlock[] = [];
  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    const isChild = (row.indent ?? 0) > 0;
    if (last && (last.group === row.group || isChild)) {
      last.rows.push(row);
    } else {
      blocks.push({ group: row.group, rows: [row] });
    }
  }
  return blocks;
}

/** The block a row belongs to, or `null` if the key is not present. */
export function blockFor(rows: LayerRow[], key: string): LayerBlock | null {
  return buildBlocks(rows).find((b) => b.rows.some((r) => r.key === key)) ?? null;
}

export type DropResolution =
  | { ok: true; toIndex: number }
  | { ok: false; reason: 'missing' | 'crossBand' | 'noop' };

/**
 * §20.2: a drop is legal only inside the source row's own band. `toIndex` is the index in
 * that band AFTER the dragged row is removed — i.e. the position the row comes to rest at.
 * A cross-band drop returns `{ ok: false, reason: 'crossBand' }` and the caller surfaces
 * `editor.highlighterBandMessage` instead of reordering.
 */
export function resolveDrop(rows: LayerRow[], dragKey: string | null, dropKey: string | null): DropResolution {
  if (dragKey === null || dropKey === null) return { ok: false, reason: 'missing' };
  if (dragKey === dropKey) return { ok: false, reason: 'noop' };
  const blocks = buildBlocks(rows);
  const src = blocks.findIndex((b) => b.rows.some((r) => r.key === dragKey));
  const dst = blocks.findIndex((b) => b.rows.some((r) => r.key === dropKey));
  if (src < 0 || dst < 0) return { ok: false, reason: 'missing' };
  if (src !== dst) return { ok: false, reason: 'crossBand' };
  const block = blocks[src];
  // The photo is the base layer: it is never reordered (§20.2).
  if (block.group === 'photo') return { ok: false, reason: 'crossBand' };
  const reduced = block.rows.filter((r) => r.key !== dragKey);
  const toIndex = reduced.findIndex((r) => r.key === dropKey);
  if (toIndex < 0) return { ok: false, reason: 'noop' };
  return { ok: true, toIndex };
}

/** Rows the panel may drag: never the photo base, never an inset child. */
export function isDraggable(row: LayerRow): boolean {
  return (row.indent ?? 0) === 0 && row.group !== 'photo';
}

/**
 * The row key an element sits inside. `closest` walks up from whatever the hit test
 * returned (the `<li>` itself, or a button/icon child) to the row's stable
 * `data-layer-row` attribute.
 */
export function rowKeyFromElement(element: Element | null): string | null {
  if (element === null || typeof element.closest !== 'function') return null;
  return element.closest('[data-layer-row]')?.getAttribute('data-layer-row') ?? null;
}

/**
 * The drop target at a viewport coordinate.
 *
 * Chromium **implicitly captures** the pointer to the grip (the `pointerdown` target) on
 * touch, so every later event targets the grip and the rows' `pointerover` NEVER fires —
 * leaving `dropKey` null and the drop a silent no-op (D77/F1). A captured `pointermove`
 * still carries the finger's true `clientX`/`clientY`, so the target is resolved
 * geometrically instead. `elementFromPoint` is injected so this is pure and unit-testable
 * without layout.
 */
export function dropKeyAtPoint(
  clientX: number,
  clientY: number,
  elementFromPoint: (x: number, y: number) => Element | null,
): string | null {
  return rowKeyFromElement(elementFromPoint(clientX, clientY));
}

/** `document.elementFromPoint`, guarded for environments without layout (jsdom, D40). */
function elementFromPoint(x: number, y: number): Element | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  try {
    return document.elementFromPoint(x, y);
  } catch {
    return null;
  }
}

export type Section =
  | { kind: 'markup'; blocks: LayerBlock[] }
  | { kind: 'band'; group: LayerGroup; rows: LayerRow[] };

/**
 * Render sections. Contiguous markup blocks merge under one `Markup` header; every other
 * group is its own band. Order is the input order (the shell owns z-order).
 */
export function buildSections(rows: LayerRow[]): Section[] {
  const sections: Section[] = [];
  for (const block of buildBlocks(rows)) {
    if (isMarkupGroup(block.group)) {
      const last = sections[sections.length - 1];
      if (last && last.kind === 'markup') last.blocks.push(block);
      else sections.push({ kind: 'markup', blocks: [block] });
    } else {
      const last = sections[sections.length - 1];
      if (last && last.kind === 'band' && last.group === block.group) last.rows.push(...block.rows);
      else sections.push({ kind: 'band', group: block.group, rows: [...block.rows] });
    }
  }
  return sections;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export default function LayersPanel({
  rows,
  selectedKeys,
  loading = false,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onReorder,
  onRename,
  onDelete,
  onClose,
}: LayersPanelProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const dropKeyRef = useRef<string | null>(null);

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const sections = useMemo(() => buildSections(rows), [rows]);

  /** Row keys in render order, honouring collapsed groups — the arrow-key walk order. */
  const visibleRowKeys = useMemo<string[]>(() => {
    const keys: string[] = [];
    for (const section of sections) {
      if (section.kind === 'markup') {
        if (collapsed.has('markup')) continue;
        for (const block of section.blocks) {
          if (collapsed.has(block.group)) continue;
          for (const row of block.rows) keys.push(row.key);
        }
      } else {
        for (const row of section.rows) keys.push(row.key);
      }
    }
    return keys;
  }, [collapsed, sections]);

  const activeRowKey =
    focusedKey !== null && visibleRowKeys.includes(focusedKey) ? focusedKey : (visibleRowKeys[0] ?? null);

  // ---- long-press plumbing -------------------------------------------------
  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armLongPress = useCallback(
    (action: () => void, event: ReactPointerEvent<HTMLElement>): void => {
      clearTimer();
      suppressClickRef.current = false;
      pressRef.current = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        suppressClickRef.current = true;
        action();
      }, LONG_PRESS_MS);
    },
    [clearTimer],
  );

  /**
   * A jittering hold must not become a drag/menu: >8 px of travel cancels the 400 ms timer.
   * (`pointerleave` is kept as well, but it only fires for a mouse — touch gets implicit
   * pointer capture, so a fingertip's own drift is what this threshold is for.)
   */
  const onPressMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const start = pressRef.current;
      if (start === null || timerRef.current === null) return;
      const dx = (event.clientX ?? 0) - start.x;
      const dy = (event.clientY ?? 0) - start.y;
      if (dx * dx + dy * dy > 64) clearTimer();
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  // ---- row menu ------------------------------------------------------------
  const openMenu = useCallback((key: string): void => {
    setRenamingKey(null);
    setMenuFor(key);
  }, []);

  // Kept side-effect free on purpose: React double-invokes state updaters under
  // <StrictMode>, so focusing inside the updater would focus twice (see the sibling
  // keypad's StrictMode note).
  const closeMenu = useCallback(
    (returnFocus: boolean): void => {
      if (returnFocus && menuFor !== null) rowRefs.current.get(menuFor)?.focus();
      setMenuFor(null);
    },
    [menuFor],
  );

  useEffect(() => {
    if (menuFor === null) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [menuFor]);

  const menuItems = useCallback(
    (): HTMLButtonElement[] =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []),
    [],
  );

  const runMenuAction = useCallback(
    (row: LayerRow, action: 'front' | 'back' | 'rename' | 'delete'): void => {
      const block = blockFor(rows, row.key);
      if (action === 'front' && block) onReorder(row.key, 0);
      else if (action === 'back' && block) {
        // `toIndex` is the REST index inside the row's own group block, counted with the
        // row removed. The true back of the group is `reduced.length` — a rest index one
        // past the last remaining row. `reduced.length - 1` leaves the row SECOND-from-back
        // (for [a,b,c] minus `a` that is a rest index of 1, i.e. between b and c). The shell
        // maps a rest index >= `reduced.length` onto the back of the §20.2 band
        // (`moveInBandToBack`). Guarded so a single-row group is a no-op.
        const toIndex = block.rows.filter((r) => r.key !== row.key).length;
        if (toIndex > 0) onReorder(row.key, toIndex);
      } else if (action === 'rename') {
        setRenamingKey(row.key);
        closeMenu(false); // the rename field takes focus, so do not return it to the row
        return;
      } else if (action === 'delete') onDelete(row.key);
      closeMenu(true);
    },
    [closeMenu, onDelete, onReorder, rows],
  );

  const onMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
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
      const items = menuItems();
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.findIndex((b) => b === document.activeElement);
      const next =
        event.key === 'ArrowDown'
          ? (index + 1 + items.length) % items.length
          : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    },
    [closeMenu, menuItems],
  );

  // ---- drag-to-reorder -----------------------------------------------------
  const setDrop = useCallback((key: string): void => {
    dropKeyRef.current = key;
    setDropKey(key);
  }, []);

  useEffect(() => {
    if (dragKey === null) return;
    const finish = (commit: boolean): void => {
      const res = commit ? resolveDrop(rows, dragKey, dropKeyRef.current) : { ok: false as const, reason: 'missing' as const };
      dropKeyRef.current = null;
      suppressClickRef.current = false;
      setDragKey(null);
      setDropKey(null);
      if (res.ok) {
        setRefusal(null);
        onReorder(dragKey, res.toIndex);
      } else if (res.reason === 'crossBand') {
        // §20.2: refuse, and say why — never apply a band-crossing drop.
        setRefusal(STRINGS.editor.highlighterBandMessage);
      }
    };
    const onUp = (): void => finish(true);
    // A cancelled pointer (a browser scroll takeover) must not commit a reorder.
    const onCancel = (): void => finish(false);
    // Chromium implicitly captures the pointer to the grip on touch, so `pointerover` on
    // the rows never fires (D77/F1). The captured move still carries true coordinates, so
    // the drop target is resolved from them.
    const onMove = (event: PointerEvent): void => {
      const key = dropKeyAtPoint(event.clientX, event.clientY, elementFromPoint);
      if (key !== null) setDrop(key);
    };
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('pointermove', onMove);
    };
  }, [dragKey, onReorder, rows, setDrop]);

  // ---- group collapse ------------------------------------------------------
  const toggleGroup = useCallback((id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- rename --------------------------------------------------------------
  const commitRename = useCallback(
    (row: LayerRow, value: string): void => {
      const name = value.trim();
      setRenamingKey(null);
      if (name !== '' && name !== row.name) onRename(row.key, name);
      rowRefs.current.get(row.key)?.focus();
    },
    [onRename],
  );

  // ---- keyboard: rows ------------------------------------------------------
  const focusRow = useCallback((key: string | undefined): void => {
    if (key === undefined) return;
    rowRefs.current.get(key)?.focus();
    setFocusedKey(key);
  }, []);

  const onRowKeyDown = useCallback(
    (row: LayerRow, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.altKey) {
          // Keyboard reorder (§8.6 layer order): one position inside the row's own group.
          const block = blockFor(rows, row.key);
          if (!block || !isDraggable(row)) return;
          const index = block.rows.findIndex((r) => r.key === row.key);
          const next = event.key === 'ArrowUp' ? index - 1 : index + 1;
          if (next >= 0 && next < block.rows.length) onReorder(row.key, next);
          return;
        }
        const index = visibleRowKeys.indexOf(row.key);
        const next =
          event.key === 'ArrowDown'
            ? Math.min(index + 1, visibleRowKeys.length - 1)
            : Math.max(index - 1, 0);
        focusRow(visibleRowKeys[next]);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        focusRow(event.key === 'Home' ? visibleRowKeys[0] : visibleRowKeys[visibleRowKeys.length - 1]);
      }
    },
    [focusRow, onReorder, rows, visibleRowKeys],
  );

  // ---- global keys: Escape closes, Tab is trapped --------------------------
  const trapTab = useCallback((event: KeyboardEvent): void => {
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    // The root itself is focusable (tabIndex -1) and is focused on open. Without excluding
    // it, the first Tab would follow the browser's default out of the panel.
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
      // Bubble phase deliberately: React handlers (the row menu, the rename field) run at
      // the root BEFORE this, so their `stopPropagation` wins — while this still preempts
      // `EditorLayout`'s window-level Escape ladder.
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'Tab') trapTab(event);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, trapTab]);

  // ---- focus: in on open, back where it came from on close (§19.6) ---------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // The cross-band refusal is a short-lived acknowledgement, not a state.
  useEffect(() => {
    if (refusal === null) return;
    const id = window.setTimeout(() => setRefusal(null), 4000);
    return () => window.clearTimeout(id);
  }, [refusal]);

  // ---- render helpers ------------------------------------------------------
  const renderRow = (row: LayerRow): JSX.Element => {
    const selected = selectedKeys.includes(row.key);
    const indent = row.indent ?? 0;
    const Icon = GROUP_ICON[row.group];
    const draggable = isDraggable(row);
    const menuOpen = menuFor === row.key;
    const renaming = renamingKey === row.key;

    return (
      <li
        key={row.key}
        role="listitem"
        className="layers-row"
        data-layer-row={row.key}
        data-layer-group={row.group}
        data-indent={String(indent)}
        data-selected={selected ? 'true' : 'false'}
        data-locked={row.locked ? 'true' : 'false'}
        data-visible={row.visible ? 'true' : 'false'}
        data-dragging={dragKey === row.key ? 'true' : 'false'}
        data-drop-target={dropKey === row.key ? 'true' : 'false'}
      >
        {draggable ? (
          // Decorative pointer-only grip (no appendix string exists for a labelled handle).
          // Keyboard reorder lives on the row: the menu and Alt+Arrow. See scope note 2.
          <span
            className="layers-grip"
            aria-hidden="true"
            data-layer-grip={row.key}
            onPointerDown={(event: ReactPointerEvent<HTMLSpanElement>) => {
              if (event.button > 0) return;
              event.preventDefault();
              armLongPress(() => {
                setMenuFor(null);
                dropKeyRef.current = null;
                setDragKey(row.key);
                setDropKey(null);
              }, event);
            }}
            onPointerMove={onPressMove}
            onPointerUp={clearTimer}
            onPointerLeave={clearTimer}
            onPointerCancel={clearTimer}
          >
            <GripVertical />
          </span>
        ) : (
          <span className="layers-grip layers-grip--absent" aria-hidden="true" />
        )}

        {renaming ? (
          <form
            className="layers-rename"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.querySelector<HTMLInputElement>('input');
              commitRename(row, input?.value ?? '');
            }}
          >
            <input
              className="layers-rename-input"
              type="text"
              defaultValue={row.name}
              aria-label={STRINGS.layers.menuRename}
              autoCapitalize="none"
              autoCorrect="off"
              ref={(el) => {
                if (el && document.activeElement !== el) {
                  el.focus();
                  el.select();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setRenamingKey(null);
                  rowRefs.current.get(row.key)?.focus();
                }
              }}
              onBlur={(event) => commitRename(row, event.currentTarget.value)}
            />
          </form>
        ) : (
          <button
            type="button"
            ref={(el) => {
              if (el) rowRefs.current.set(row.key, el);
              else rowRefs.current.delete(row.key);
            }}
            className="layers-select"
            data-layer-select={row.key}
            aria-pressed={selected}
            tabIndex={row.key === activeRowKey ? 0 : -1}
            onFocus={() => setFocusedKey(row.key)}
            onPointerDown={(event) => {
              if (event.button > 0) return;
              armLongPress(() => openMenu(row.key), event);
            }}
            onPointerMove={onPressMove}
            onPointerUp={clearTimer}
            onPointerLeave={clearTimer}
            onPointerCancel={clearTimer}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect(row.key);
            }}
            onKeyDown={(event) => onRowKeyDown(row, event)}
          >
            <Icon className="layers-icon" aria-hidden="true" />
            <span className="layers-name">{row.name}</span>
          </button>
        )}

        <button
          type="button"
          className="layers-toggle"
          data-layer-visible={row.key}
          aria-label={t(STRINGS.a11y.visibilityToggle, { name: row.name })}
          aria-pressed={row.visible}
          onClick={() => onToggleVisible(row.key)}
        >
          {row.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="layers-toggle"
          data-layer-lock={row.key}
          aria-label={t(STRINGS.a11y.lockToggle, { name: row.name })}
          aria-pressed={row.locked}
          onClick={() => onToggleLock(row.key)}
        >
          {row.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="layers-menu-trigger"
          data-layer-menu={row.key}
          aria-label={STRINGS.a11y.moreActions}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => (menuOpen ? closeMenu(true) : openMenu(row.key))}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>

        {menuOpen ? (
          <div
            ref={menuRef}
            className="layers-menu"
            role="menu"
            aria-label={row.name}
            onKeyDown={onMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              className="layers-menu-item"
              data-menu-action="front"
              disabled={!draggable}
              onClick={() => runMenuAction(row, 'front')}
            >
              {STRINGS.layers.menuBringFront}
            </button>
            <button
              type="button"
              role="menuitem"
              className="layers-menu-item"
              data-menu-action="back"
              disabled={!draggable}
              onClick={() => runMenuAction(row, 'back')}
            >
              {STRINGS.layers.menuSendBack}
            </button>
            {/* No `onGroup`/`onUngroup` channel exists in the pinned interface. */}
            <button type="button" role="menuitem" className="layers-menu-item" data-menu-action="group" disabled>
              {STRINGS.layers.menuGroup}
            </button>
            <button type="button" role="menuitem" className="layers-menu-item" data-menu-action="ungroup" disabled>
              {STRINGS.layers.menuUngroup}
            </button>
            <button
              type="button"
              role="menuitem"
              className="layers-menu-item"
              data-menu-action="rename"
              onClick={() => runMenuAction(row, 'rename')}
            >
              {STRINGS.layers.menuRename}
            </button>
            {row.deletable ? (
              <button
                type="button"
                role="menuitem"
                className="layers-menu-item layers-menu-item--destructive"
                data-menu-action="delete"
                onClick={() => runMenuAction(row, 'delete')}
              >
                {STRINGS.layers.menuDelete}
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const renderRows = (list: LayerRow[]): JSX.Element => (
    <ul className="layers-rows" role="list">
      {list.map(renderRow)}
    </ul>
  );

  const state = loading ? 'loading' : rows.length === 0 ? 'empty' : 'ready';

  return (
    <section
      ref={rootRef}
      className="layers-panel"
      data-testid="layers-panel"
      data-state={state}
      role="dialog"
      aria-modal="true"
      aria-label={STRINGS.a11y.layers}
      aria-busy={loading}
      tabIndex={-1}
    >
      <header className="layers-header">
        <h2 className="layers-title">{STRINGS.a11y.layers}</h2>
        <button
          type="button"
          className="layers-close hit-slop"
          data-layer-close="true"
          aria-label={STRINGS.a11y.close}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="layers-body">
        {refusal !== null ? (
          <p className="layers-refusal" role="alert">
            {refusal}
          </p>
        ) : null}

        {loading ? (
          <ul className="layers-skeletons" role="list" aria-hidden="true">
            <li className="layers-skeleton">
              <span className="layers-skeleton-bar" />
            </li>
            <li className="layers-skeleton">
              <span className="layers-skeleton-bar" />
            </li>
            <li className="layers-skeleton">
              <span className="layers-skeleton-bar" />
            </li>
            <li className="layers-skeleton">
              <span className="layers-skeleton-bar" />
            </li>
          </ul>
        ) : rows.length === 0 ? (
          <p className="layers-empty" role="status">
            {STRINGS.editor.layersEmpty}
          </p>
        ) : (
          <ul className="layers-list" role="list" aria-label={STRINGS.a11y.layers}>
            {sections.map((section, index) =>
              section.kind === 'markup' ? (
                <li
                  key={`markup-${index}`}
                  role="listitem"
                  className="layers-section"
                  data-section="markup"
                >
                  <button
                    type="button"
                    className="layers-group-toggle layers-group-toggle--outer"
                    data-group-toggle="markup"
                    aria-expanded={!collapsed.has('markup')}
                    onClick={() => toggleGroup('markup')}
                  >
                    {collapsed.has('markup') ? (
                      <ChevronRight aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                    <span>{STRINGS.layers.groupMarkup}</span>
                  </button>
                  {collapsed.has('markup') ? null : (
                    <ul className="layers-sublist" role="list" aria-label={STRINGS.layers.groupMarkup}>
                      {section.blocks.map((block) => (
                        <li
                          key={block.group}
                          role="listitem"
                          className="layers-subsection"
                          data-layer-group={block.group}
                        >
                          <button
                            type="button"
                            className="layers-group-toggle"
                            data-group-toggle={block.group}
                            aria-expanded={!collapsed.has(block.group)}
                            onClick={() => toggleGroup(block.group)}
                          >
                            {collapsed.has(block.group) ? (
                              <ChevronRight aria-hidden="true" />
                            ) : (
                              <ChevronDown aria-hidden="true" />
                            )}
                            <span>{GROUP_LABEL[block.group]}</span>
                          </button>
                          {collapsed.has(block.group) ? null : renderRows(block.rows)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ) : (
                <li
                  key={`band-${section.group}-${index}`}
                  role="listitem"
                  className="layers-section layers-section--band"
                  data-layer-group={section.group}
                >
                  {renderRows(section.rows)}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
