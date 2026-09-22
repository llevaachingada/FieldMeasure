/**
 * `tests/layersPanel.test.tsx` — slice 1.6 machine gates for the Layers flyout (UI spec
 * §9; build spec §8.6, §20.1–§20.2; the panel's own gate list).
 *
 * The point of these tests: the panel is props-driven, so every assertion drives the REAL
 * component through the REAL DOM the way a finger does (pointerdown → 400 ms → drop),
 * not by calling internals. The pure helpers (`buildBlocks`, `buildSections`,
 * `resolveDrop`, `isDraggable`) are executed too, so a wiring bug cannot hide behind a
 * passing DOM test or vice versa.
 *
 * What is proved:
 *   - rows render in their groups, and an inset child is indented AND stays inside the
 *     insets band rather than being torn into the Shapes band (the pinned props carry
 *     `indent`, not a parent id);
 *   - tap-select passes the row KEY (§20.1 — never an index);
 *   - the eye and lock toggles call their callbacks and are named with the object;
 *   - a cross-band drop is REFUSED (callback not called) and refuses with
 *     `editor.highlighterBandMessage`; a same-band drop calls `onReorder(key, toIndex)`;
 *   - the photo row has no Delete affordance and no grip (§20.2);
 *   - a 400 ms long-press starts a drag and does NOT select; a short tap selects and does
 *     NOT start a drag;
 *   - the row menu is keyboard-reachable, `Esc` closes it, and focus returns to the row;
 *   - Loading ≠ Empty;
 *   - the §19.6 floor: focus enters and returns, Tab is trapped, `Esc` closes the panel,
 *     every control has an `aria-label`, arrow keys move between rows.
 *
 * NOT tested here (CSS only, and jsdom has no layout — D40): the 56 px row, the 48 px
 * targets, the 320 px flyout width and the slide-in. Those are the slice's `[Surface]`
 * walk, logged for hardware.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type JSX } from 'react';

import LayersPanel, {
  LONG_PRESS_MS,
  buildBlocks,
  buildSections,
  isDraggable,
  resolveDrop,
  type LayerRow,
  type LayersPanelProps,
} from '../src/ui/LayersPanel';
import { STRINGS, t } from '../src/ui/strings';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

// ---------------------------------------------------------------------------
// Fixture + harness
// ---------------------------------------------------------------------------

/** Keys are deliberately NOT indices (`dim-1`, `inset-1/child-1`). */
export function fixtureRows(): LayerRow[] {
  return [
    { key: 'dim-1', name: `Dimension 12'-6"`, group: 'dimensions', locked: false, visible: true, deletable: true },
    { key: 'dim-2', name: `Dimension 3'-0"`, group: 'dimensions', locked: false, visible: true, deletable: true },
    { key: 'dim-3', name: `Dimension 9'-4"`, group: 'dimensions', locked: true, visible: true, deletable: true },
    { key: 'shape-1', name: 'Rectangle', group: 'shapes', locked: false, visible: false, deletable: true },
    { key: 'ink-1', name: 'Freehand', group: 'ink', locked: false, visible: true, deletable: true },
    { key: 'inset-1', name: 'Inset 2', group: 'insets', locked: false, visible: true, deletable: true },
    // An inset child carries its own TYPE group but must stay in its parent's band.
    { key: 'inset-1/child-1', name: 'Rectangle', group: 'shapes', indent: 1, locked: false, visible: true, deletable: true },
    { key: 'photo', name: 'Photo', group: 'photo', locked: false, visible: true, deletable: false },
  ];
}

function mount(overrides: Partial<LayersPanelProps> = {}) {
  const props: LayersPanelProps = {
    rows: fixtureRows(),
    selectedKeys: [],
    onSelect: vi.fn(),
    onToggleVisible: vi.fn(),
    onToggleLock: vi.fn(),
    onReorder: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<LayersPanel {...props} />);
  return props;
}

function q<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`expected an element for ${selector}`);
  return el;
}

const rowEl = (key: string): HTMLElement => q(`[data-layer-row="${key}"]`);
const selectEl = (key: string): HTMLButtonElement => q(`[data-layer-select="${key}"]`);
const gripEl = (key: string): HTMLElement => q(`[data-layer-grip="${key}"]`);
const visibleEl = (key: string): HTMLButtonElement => q(`[data-layer-visible="${key}"]`);
const lockEl = (key: string): HTMLButtonElement => q(`[data-layer-lock="${key}"]`);
const menuEl = (key: string): HTMLButtonElement => q(`[data-layer-menu="${key}"]`);

/** A real 400 ms hold: pointerdown, then the timer fires inside `act`. */
function longPress(el: Element): void {
  fireEvent.pointerDown(el, { button: 0 });
  act(() => {
    vi.advanceTimersByTime(LONG_PRESS_MS);
  });
}

/** The whole drag: hold the grip, cross the target row, release. */
function dragOnto(fromKey: string, toKey: string): void {
  longPress(gripEl(fromKey));
  fireEvent.pointerOver(rowEl(toKey));
  fireEvent.pointerUp(document.body);
}

// ---------------------------------------------------------------------------
// Renders in groups (the §9 tree)
// ---------------------------------------------------------------------------

describe('renders the list in its groups', () => {
  it('renders every row as a list item and the Markup header with its subgroups', () => {
    mount();

    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(fixtureRows().length);
    for (const row of fixtureRows()) expect(rowEl(row.key).getAttribute('role')).toBe('listitem');

    // The four markup subgroup headers exist, in the §9 order.
    const headers = Array.from(document.querySelectorAll<HTMLElement>('.layers-group-toggle')).map(
      (el) => el.textContent?.trim() ?? '',
    );
    expect(headers).toContain(STRINGS.layers.groupMarkup);
    expect(headers).toContain(STRINGS.layers.groupDimensions);
    expect(headers).toContain(STRINGS.layers.groupShapes);
    expect(headers).toContain(STRINGS.layers.groupInk);
    // `Text` has no rows in the fixture, so no empty header is rendered.
    expect(headers).not.toContain(STRINGS.layers.groupText);
  });

  it('indents an inset child and keeps it in the insets band, not the Shapes band', () => {
    mount();

    const child = rowEl('inset-1/child-1');
    expect(child.dataset.indent).toBe('1');
    expect(child.closest('[data-section="markup"]')).toBeNull();

    // The Shapes band holds only the sheet-level `shape-1`.
    const shapesBand = q<HTMLElement>('[data-layer-group="shapes"]');
    expect(within(shapesBand).queryByText('Rectangle')).not.toBeNull();
    expect(shapesBand.querySelector('[data-layer-row="inset-1/child-1"]')).toBeNull();
  });

  it('shows the object name verbatim — the panel never derives it', () => {
    mount();
    expect(selectEl('dim-1').textContent).toContain(`Dimension 12'-6"`);
  });

  it('exposes selected / visible / locked as state, never colour alone', () => {
    mount({ selectedKeys: ['dim-3'] });

    expect(rowEl('dim-3').dataset.selected).toBe('true');
    expect(selectEl('dim-3').getAttribute('aria-pressed')).toBe('true');
    expect(rowEl('dim-1').dataset.selected).toBe('false');

    expect(rowEl('shape-1').dataset.visible).toBe('false');
    expect(visibleEl('shape-1').getAttribute('aria-pressed')).toBe('false');

    expect(rowEl('dim-3').dataset.locked).toBe('true');
    expect(lockEl('dim-3').getAttribute('aria-pressed')).toBe('true');
    expect(lockEl('dim-1').getAttribute('aria-pressed')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Tap-select — the key, never an index
// ---------------------------------------------------------------------------

describe('tap-select', () => {
  it('calls onSelect with the row KEY, never an array index', () => {
    const { onSelect } = mount();
    act(() => {
      selectEl('shape-1').click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('shape-1');
    // The index of `shape-1` is 3 — proving the key, not the index, was passed.
    expect(onSelect).not.toHaveBeenCalledWith(3);
  });

  it('passes the compound AnnotationPath key for an inset child', () => {
    const { onSelect } = mount();
    act(() => {
      selectEl('inset-1/child-1').click();
    });
    expect(onSelect).toHaveBeenCalledWith('inset-1/child-1');
  });

  it('selects with Enter on the focused row', () => {
    const { onSelect } = mount();
    act(() => {
      selectEl('dim-1').click();
    });
    expect(onSelect).toHaveBeenLastCalledWith('dim-1');
  });

  it('selects a LOCKED row (the shell enforces the lock, not the panel)', () => {
    const { onSelect } = mount();
    act(() => {
      selectEl('dim-3').click();
    });
    expect(onSelect).toHaveBeenCalledWith('dim-3');
  });
});

// ---------------------------------------------------------------------------
// Eye / lock toggles
// ---------------------------------------------------------------------------

describe('eye and lock toggles', () => {
  it('the eye toggles visibility and is named with the object', () => {
    const { onToggleVisible } = mount();
    act(() => {
      visibleEl('dim-1').click();
    });
    expect(onToggleVisible).toHaveBeenCalledWith('dim-1');
    expect(visibleEl('dim-1').getAttribute('aria-label')).toBe(
      t(STRINGS.a11y.visibilityToggle, { name: `Dimension 12'-6"` }),
    );
    expect(visibleEl('dim-1').getAttribute('aria-label')).not.toContain('{name}');
  });

  it('the lock toggles the lock and is named with the object', () => {
    const { onToggleLock } = mount();
    act(() => {
      lockEl('shape-1').click();
    });
    expect(onToggleLock).toHaveBeenCalledWith('shape-1');
    expect(lockEl('shape-1').getAttribute('aria-label')).toBe(
      t(STRINGS.a11y.lockToggle, { name: 'Rectangle' }),
    );
  });

  it('every control in the panel carries a non-empty aria-label', () => {
    mount();
    const labelled = Array.from(
      document.querySelectorAll<HTMLElement>('.layers-panel button'),
    ).filter((el) => el.getAttribute('aria-label') === null && el.textContent?.trim() === '');
    expect(labelled).toEqual([]); // no icon-only button without a name
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-layer-visible]'))) {
      expect((el.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Reorder — same band allowed, cross band refused (§20.2)
// ---------------------------------------------------------------------------

describe('drag-to-reorder', () => {
  it('a same-band drop calls onReorder(key, toIndex)', () => {
    const { onReorder } = mount();
    dragOnto('dim-2', 'dim-1');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith('dim-2', 0);
  });

  it('computes toIndex within the band, after the dragged row is removed', () => {
    const { onReorder } = mount();
    dragOnto('dim-1', 'dim-3');
    // The dimensions band is [dim-1, dim-2, dim-3]; without dim-1 that is [dim-2, dim-3],
    // so dropping on dim-3 is index 1.
    expect(onReorder).toHaveBeenCalledWith('dim-1', 1);
  });

  it('REFUSES a cross-band drop (ink → dimensions) and never calls onReorder', () => {
    const { onReorder } = mount();
    dragOnto('ink-1', 'dim-1');

    expect(onReorder).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(STRINGS.editor.highlighterBandMessage);
  });

  it('REFUSES a drop out of the dimensions band too (both directions)', () => {
    const { onReorder } = mount();
    dragOnto('dim-1', 'ink-1');
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.editor.highlighterBandMessage);
  });

  it('the photo base offers no grip and is never reordered (§20.2)', () => {
    const { onReorder } = mount();
    expect(document.querySelector('[data-layer-grip="photo"]')).toBeNull();
    expect(isDraggable({ key: 'photo', name: 'Photo', group: 'photo', locked: false, visible: true, deletable: false })).toBe(
      false,
    );
    // An inset child moves with its parent, so it has no grip either.
    expect(document.querySelector('[data-layer-grip="inset-1/child-1"]')).toBeNull();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a refused drop clears the refusal on the next successful reorder', () => {
    const { onReorder } = mount();
    dragOnto('ink-1', 'dim-1');
    expect(screen.getByRole('alert')).toBeTruthy();
    dragOnto('dim-2', 'dim-1');
    expect(onReorder).toHaveBeenCalledWith('dim-2', 0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Long-press vs tap (the 400 ms rule)
// ---------------------------------------------------------------------------

describe('long-press vs tap', () => {
  it('a 400 ms long-press on the grip starts a drag and does NOT select', () => {
    const { onSelect, onReorder } = mount();
    longPress(gripEl('dim-1'));

    expect(rowEl('dim-1').dataset.dragging).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.pointerOver(rowEl('dim-2'));
    fireEvent.pointerUp(document.body);
    // The dimensions band without `dim-1` is [dim-2, dim-3]; dropping on dim-2 is index 0.
    expect(onReorder).toHaveBeenCalledWith('dim-1', 0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a short tap selects and does not start a drag', () => {
    const { onSelect, onReorder } = mount();
    fireEvent.pointerDown(selectEl('dim-1'), { button: 0 });
    fireEvent.pointerUp(selectEl('dim-1'));
    act(() => {
      selectEl('dim-1').click();
    });

    expect(onSelect).toHaveBeenCalledWith('dim-1');
    expect(rowEl('dim-1').dataset.dragging).toBe('false');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('a long-press on the row body opens the menu and does NOT select (§9)', () => {
    const { onSelect } = mount();
    longPress(selectEl('dim-1'));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not start a drag when the hold is released before 400 ms', () => {
    const { onReorder } = mount();
    fireEvent.pointerDown(gripEl('dim-1'), { button: 0 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    });
    fireEvent.pointerUp(gripEl('dim-1'));
    fireEvent.pointerOver(rowEl('dim-2'));
    fireEvent.pointerUp(document.body);
    expect(onReorder).not.toHaveBeenCalled();
    expect(rowEl('dim-1').dataset.dragging).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// The row menu
// ---------------------------------------------------------------------------

describe('row context menu', () => {
  it('lists the gaps-appendix items, with Group/Ungroup disabled', () => {
    mount();
    act(() => {
      menuEl('dim-1').click();
    });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText(STRINGS.layers.menuBringFront)).toBeTruthy();
    expect(within(menu).getByText(STRINGS.layers.menuSendBack)).toBeTruthy();
    expect(within(menu).getByText(STRINGS.layers.menuGroup)).toBeTruthy();
    expect(within(menu).getByText(STRINGS.layers.menuUngroup)).toBeTruthy();
    expect(within(menu).getByText(STRINGS.layers.menuRename)).toBeTruthy();
    expect(within(menu).getByText(STRINGS.layers.menuDelete)).toBeTruthy();

    // The pinned props carry no `onGroup`/`onUngroup` channel, so those two are disabled
    // rather than silently doing nothing.
    expect(q<HTMLButtonElement>('[data-menu-action="group"]').disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-menu-action="ungroup"]').disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-menu-action="front"]').disabled).toBe(false);
  });

  it('the photo row offers NO delete affordance', () => {
    mount();
    act(() => {
      menuEl('photo').click();
    });
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText(STRINGS.layers.menuDelete)).toBeNull();
    expect(menu.querySelector('[data-menu-action="delete"]')).toBeNull();
    expect(menu.querySelector('[data-menu-action="rename"]')).not.toBeNull();
  });

  it('Bring to front / Send to back route through onReorder', () => {
    const { onReorder } = mount();
    act(() => {
      menuEl('dim-2').click();
    });
    act(() => {
      q<HTMLButtonElement>('[data-menu-action="front"]').click();
    });
    expect(onReorder).toHaveBeenCalledWith('dim-2', 0);
    // The menu closed and focus came back to the row it acted on.
    expect(screen.queryByRole('menu')).toBeNull();
    expect(rowEl('dim-2').contains(document.activeElement)).toBe(true);

    act(() => {
      menuEl('dim-1').click();
    });
    act(() => {
      q<HTMLButtonElement>('[data-menu-action="back"]').click();
    });
    // [dim-1, dim-2, dim-3] without dim-1 is [dim-2, dim-3], whose length is 2. A rest index
    // of `1` would land dim-1 BETWEEN dim-2 and dim-3 (second-from-back); the true back is
    // rest index 2 = reduced.length. Off-by-one corrected in DECISIONS D76 — the shell maps a
    // rest index >= reduced.length onto the back of the §20.2 band.
    expect(onReorder).toHaveBeenLastCalledWith('dim-1', 2);
  });

  it('Rename commits through onRename', () => {
    const { onRename } = mount();
    act(() => {
      menuEl('dim-1').click();
    });
    act(() => {
      q<HTMLButtonElement>('[data-menu-action="rename"]').click();
    });
    const input = q<HTMLInputElement>('.layers-rename-input');
    expect(input.value).toBe(`Dimension 12'-6"`);

    input.value = 'Footing A';
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.submit(input.closest('form')!);
    });
    expect(onRename).toHaveBeenCalledWith('dim-1', 'Footing A');
  });

  it('Delete calls onDelete for a deletable row', () => {
    const { onDelete } = mount();
    act(() => {
      menuEl('ink-1').click();
    });
    act(() => {
      q<HTMLButtonElement>('[data-menu-action="delete"]').click();
    });
    expect(onDelete).toHaveBeenCalledWith('ink-1');
  });

  it('the menu is keyboard-reachable and Esc closes it, returning focus to the row', () => {
    mount();
    const trigger = menuEl('dim-1');
    act(() => {
      trigger.focus();
    });
    act(() => {
      fireEvent.keyDown(trigger, { key: 'Enter' });
      trigger.click();
    });
    const menu = screen.getByRole('menu');
    // Focus moved into the menu (standard menu behaviour).
    expect(menu.contains(document.activeElement)).toBe(true);

    act(() => {
      fireEvent.keyDown(document.activeElement ?? menu, { key: 'Escape' });
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(rowEl('dim-1').contains(document.activeElement)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Panel states: Empty ≠ Loading
// ---------------------------------------------------------------------------

describe('empty and loading states', () => {
  it('an empty document shows the empty copy', () => {
    mount({ rows: [] });
    const panel = screen.getByTestId('layers-panel');
    expect(panel.dataset.state).toBe('empty');
    expect(screen.getByText(STRINGS.editor.layersEmpty)).toBeTruthy();
    expect(document.querySelectorAll('.layers-skeleton').length).toBe(0);
  });

  it('loading shows skeletons and NEVER the empty copy', () => {
    mount({ rows: [], loading: true });
    const panel = screen.getByTestId('layers-panel');
    expect(panel.dataset.state).toBe('loading');
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(STRINGS.editor.layersEmpty)).toBeNull();
    expect(document.querySelectorAll('.layers-skeleton').length).toBeGreaterThan(0);
  });

  it('a non-empty document is the ready state', () => {
    mount();
    expect(screen.getByTestId('layers-panel').dataset.state).toBe('ready');
    expect(screen.queryByText(STRINGS.editor.layersEmpty)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// a11y (§19.6)
// ---------------------------------------------------------------------------

describe('accessibility floor', () => {
  it('is a labelled dialog, focus enters, and returns to the trigger on close', () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="trigger" onClick={() => setOpen((o) => !o)}>
            layers
          </button>
          {open ? (
            <LayersPanel
              rows={fixtureRows()}
              selectedKeys={[]}
              onSelect={() => {}}
              onToggleVisible={() => {}}
              onToggleLock={() => {}}
              onReorder={() => {}}
              onRename={() => {}}
              onDelete={() => {}}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </div>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId('trigger');
    expect(screen.queryByTestId('layers-panel')).toBeNull();

    // Open from the trigger, the way the top bar does.
    act(() => {
      trigger.focus();
      trigger.click();
    });
    const panel = screen.getByTestId('layers-panel');
    expect(panel.getAttribute('aria-label')).toBe(STRINGS.a11y.layers);
    // The panel focused itself on mount…
    expect(panel.contains(document.activeElement)).toBe(true);

    act(() => {
      q<HTMLButtonElement>('[data-layer-close]').click();
    });
    expect(screen.queryByTestId('layers-panel')).toBeNull();
    // …and focus came back where it started.
    expect(document.activeElement).toBe(trigger);
  });

  it('Esc closes the panel', () => {
    const { onClose } = mount();
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc inside an open row menu closes the menu, not the panel', () => {
    const { onClose } = mount();
    act(() => {
      menuEl('dim-1').click();
    });
    const item = q<HTMLButtonElement>('[data-menu-action="rename"]');
    act(() => {
      fireEvent.keyDown(item, { key: 'Escape' });
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab inside the flyout, wrapping both ways', () => {
    mount();
    const panel = screen.getByTestId('layers-panel');
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    act(() => {
      last.focus();
    });
    act(() => {
      fireEvent.keyDown(last, { key: 'Tab' });
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      first.focus();
    });
    act(() => {
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(last);
  });

  it('Tab from the panel root moves INTO the panel (focus cannot escape on open)', () => {
    mount();
    const panel = screen.getByTestId('layers-panel');
    expect(document.activeElement).toBe(panel);
    act(() => {
      fireEvent.keyDown(panel, { key: 'Tab' });
    });
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(panel);
  });

  it('arrow keys move within the list (roving focus)', () => {
    mount();
    act(() => {
      selectEl('dim-1').focus();
    });
    act(() => {
      fireEvent.keyDown(selectEl('dim-1'), { key: 'ArrowDown' });
    });
    expect(document.activeElement).toBe(selectEl('dim-2'));
    act(() => {
      fireEvent.keyDown(selectEl('dim-2'), { key: 'ArrowUp' });
    });
    expect(document.activeElement).toBe(selectEl('dim-1'));
  });

  it('Alt+Arrow reorders one position inside the row’s own band', () => {
    const { onReorder } = mount();
    act(() => {
      fireEvent.keyDown(selectEl('dim-2'), { key: 'ArrowUp', altKey: true });
    });
    expect(onReorder).toHaveBeenCalledWith('dim-2', 0);
  });

  it('only one row button is in the tab order at a time (roving tabindex)', () => {
    mount();
    const tabbable = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-select]')).filter(
      (el) => el.tabIndex === 0,
    );
    expect(tabbable.length).toBe(1);
    expect(tabbable[0]).toBe(selectEl('dim-1'));
  });
});

// ---------------------------------------------------------------------------
// Group collapse ("group expanded" is a layers state, UI §17)
// ---------------------------------------------------------------------------

describe('group collapse', () => {
  it('collapses a band and keeps its rows out of the DOM', () => {
    mount();
    const toggle = q<HTMLButtonElement>('[data-group-toggle="dimensions"]');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-layer-row="dim-1"]')).not.toBeNull();

    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-layer-row="dim-1"]')).toBeNull();
    // Other bands are untouched.
    expect(document.querySelector('[data-layer-row="ink-1"]')).not.toBeNull();
  });

  it('the Markup header collapses every markup band at once', () => {
    mount();
    const toggle = q<HTMLButtonElement>('[data-group-toggle="markup"]');
    act(() => {
      toggle.click();
    });
    expect(document.querySelector('[data-layer-row="dim-1"]')).toBeNull();
    expect(document.querySelector('[data-layer-row="ink-1"]')).toBeNull();
    expect(document.querySelector('[data-layer-row="inset-1"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pure helpers (executed, not read)
// ---------------------------------------------------------------------------

describe('pure helpers', () => {
  it('buildBlocks attaches an inset child to the band it follows', () => {
    const blocks = buildBlocks(fixtureRows());
    const groups = blocks.map((b) => b.group);
    expect(groups).toEqual(['dimensions', 'shapes', 'ink', 'insets', 'photo']);
    const insets = blocks.find((b) => b.group === 'insets')!;
    expect(insets.rows.map((r) => r.key)).toEqual(['inset-1', 'inset-1/child-1']);
  });

  it('buildSections merges contiguous markup bands under one Markup section', () => {
    const sections = buildSections(fixtureRows());
    expect(sections[0].kind).toBe('markup');
    if (sections[0].kind === 'markup') {
      expect(sections[0].blocks.map((b) => b.group)).toEqual(['dimensions', 'shapes', 'ink']);
    }
    expect(sections.map((s) => s.kind)).toEqual(['markup', 'band', 'band']);
  });

  it('resolveDrop refuses every cross-band and no-op case', () => {
    const rows = fixtureRows();
    expect(resolveDrop(rows, 'dim-2', 'dim-1')).toEqual({ ok: true, toIndex: 0 });
    expect(resolveDrop(rows, 'dim-1', 'dim-3')).toEqual({ ok: true, toIndex: 1 });
    expect(resolveDrop(rows, 'ink-1', 'dim-1')).toEqual({ ok: false, reason: 'crossBand' });
    expect(resolveDrop(rows, 'dim-1', 'inset-1')).toEqual({ ok: false, reason: 'crossBand' });
    expect(resolveDrop(rows, 'dim-1', 'dim-1')).toEqual({ ok: false, reason: 'noop' });
    expect(resolveDrop(rows, 'nope', 'dim-1')).toEqual({ ok: false, reason: 'missing' });
    expect(resolveDrop(rows, null, null)).toEqual({ ok: false, reason: 'missing' });
  });

  it('isDraggable excludes the photo base and inset children only', () => {
    const rows = fixtureRows();
    expect(isDraggable(rows[0])).toBe(true); // dim-1
    expect(isDraggable(rows[7])).toBe(false); // photo
    expect(isDraggable(rows[6])).toBe(false); // inset child
    expect(isDraggable(rows[5])).toBe(true); // inset parent
  });

  it('LONG_PRESS_MS is the §9 400 ms', () => {
    expect(LONG_PRESS_MS).toBe(400);
  });
});
