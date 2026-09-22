/**
 * tests/projectScreen.test.tsx — the Project screen (the sheets grid), UI §11.2;
 * build spec §20.5(a); D88/D102.
 *
 * **Layout is NOT asserted here (D40).** jsdom has no layout engine, so the responsive
 * column counts (4 @ ≥1440 / 3 @ ≥1200 / 2 @ portrait ≥960 / 1 below) live only in
 * `projectScreen.css` and are a **MANUAL check**, not a claim this file can make. What is
 * asserted is the model, the copy contract, the interaction contract and the a11y contract.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectScreen, { type ProjectScreenProps, type TrashedSheet } from '../src/ui/ProjectScreen';
import type { ProjectSheetCard } from '../src/fs/projectSheets';
import { STRINGS, t } from '../src/ui/strings';
import { resetToastBus, subscribeToastMessage, type ToastMessage } from '../src/editor/session';

afterEach(() => {
  cleanup();
  resetToastBus();
});

const CARDS: ProjectSheetCard[] = [
  { id: 's1', title: 'Sheet 01', index: 1, updatedAtLabel: '2:14 PM', dimensionCount: 3, insetCount: 0, thumb: null },
  { id: 's2', title: 'Sheet 02', index: 2, updatedAtLabel: '2:20 PM', dimensionCount: 0, insetCount: 2, thumb: null },
  { id: 's3', title: 'Sheet 03', index: 3, updatedAtLabel: '2:31 PM', dimensionCount: 1, insetCount: 0, thumb: null },
];

function baseProps(overrides: Partial<ProjectScreenProps> = {}): ProjectScreenProps {
  return {
    projectTitle: 'Riverside Elementary',
    sheetCount: CARDS.length,
    state: 'ready',
    sheets: CARDS,
    onOpenSheet: vi.fn(),
    onTakePhoto: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

function renderScreen(overrides: Partial<ProjectScreenProps> = {}): ProjectScreenProps {
  const props = baseProps(overrides);
  render(<ProjectScreen {...props} />);
  return props;
}

describe('add tiles come first and are always usable (UI §11.2)', () => {
  for (const state of ['ready', 'loading', 'empty'] as const) {
    it(`renders the two add tiles first, enabled, in the ${state} state`, () => {
      const props = renderScreen({ state, sheets: state === 'ready' ? CARDS : [] });

      const grid = screen.getByRole('list', { name: STRINGS.project.sheetsRegion });
      const firstTwo = [...grid.children].slice(0, 2);

      const photo = firstTwo[0].querySelector('button') as HTMLButtonElement;
      const importTile = firstTwo[1].querySelector('button') as HTMLButtonElement;

      expect(photo.textContent).toContain(STRINGS.project.addTakePhoto);
      expect(importTile.textContent).toContain(STRINGS.capture.importButton);
      expect(photo.disabled).toBe(false);
      expect(importTile.disabled).toBe(false);
      expect(photo.getAttribute('aria-disabled')).toBeNull();
      expect(importTile.getAttribute('aria-disabled')).toBeNull();

      // ...and they are wired, not decoration.
      fireEvent.click(photo);
      fireEvent.click(importTile);
      expect(props.onTakePhoto).toHaveBeenCalledTimes(1);
      expect(props.onImport).toHaveBeenCalledTimes(1);

      cleanup();
    });
  }
});

describe('states (UI §11.2)', () => {
  it('loading: 8 skeleton cards + the two real tiles, marked busy', () => {
    renderScreen({ state: 'loading', sheets: [] });
    const grid = screen.getByRole('list', { name: STRINGS.project.sheetsRegion });
    expect(grid.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('.sheet-card-skeleton')).toHaveLength(8);
    // The tiles never skeleton.
    expect(screen.getByRole('button', { name: STRINGS.project.addTakePhoto })).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.capture.importButton })).toBeTruthy();
  });

  it('empty: the centred «No sheets yet…» line plus the two tiles', () => {
    renderScreen({ state: 'empty', sheets: [], sheetCount: 0 });
    expect(screen.getByText(STRINGS.project.noSheetsEmpty)).toBeTruthy();
    expect(document.querySelectorAll('.sheet-card')).toHaveLength(0);
    expect(screen.getByRole('button', { name: STRINGS.project.addTakePhoto })).toBeTruthy();
  });

  it('error: the honest unreadable line, announced', () => {
    renderScreen({ state: 'error', sheets: [] });
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.project.loadError);
    // A mutation cannot be saved here either — the tiles say so rather than looking live.
    expect(
      screen.getByRole('button', { name: STRINGS.project.addTakePhoto }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('ready: one open control per sheet, named by its title', () => {
    renderScreen();
    for (const card of CARDS) {
      expect(screen.getByRole('button', { name: card.title })).toBeTruthy();
    }
  });

  it('shows the top-bar sheet count and the project name', () => {
    renderScreen({ projectTitle: 'Elm Street Footings', sheetCount: 12 });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Elm Street Footings');
    expect(screen.getByText(t(STRINGS.project.sheetCount, { sheetCount: 12 }))).toBeTruthy();
  });
});

describe('cards open and select', () => {
  it('tapping a card calls onOpenSheet with that sheet id', async () => {
    const user = userEvent.setup();
    const props = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Sheet 02' }));

    expect(props.onOpenSheet).toHaveBeenCalledTimes(1);
    expect(props.onOpenSheet).toHaveBeenCalledWith('s2');
  });

  it('a card is selectable, and the toggle reports its state with aria-pressed', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ onToggleSelected: vi.fn(), selectedIds: ['s2'] });

    const toggle = screen.getByRole('button', {
      name: t(STRINGS.project.selectToggle, { title: 'Sheet 01' }),
    });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(props.onToggleSelected).toHaveBeenCalledWith('s1');

    const selectedToggle = screen.getByRole('button', {
      name: t(STRINGS.project.selectToggle, { title: 'Sheet 02' }),
    });
    expect(selectedToggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('the selection bar counts, exports the selection, and clears', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ onToggleSelected: vi.fn(), onClearSelection: vi.fn(), selectedIds: ['s2'] });

    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain(t(STRINGS.project.selectionCount, { count: 1 }));

    // Two Export buttons exist (top bar + bar); the bar's is the last in DOM order.
    const exportButtons = screen.getAllByRole('button', { name: STRINGS.a11y.export });
    expect(exportButtons).toHaveLength(2);
    await user.click(exportButtons[1]);
    expect(props.onExport).toHaveBeenCalledWith(['s2']);

    await user.click(screen.getByRole('button', { name: STRINGS.project.clearSelection }));
    expect(props.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('Export passes [] when nothing is selected (meaning: every sheet)', async () => {
    const user = userEvent.setup();
    const props = renderScreen();

    // No selection → no bar → exactly one Export control.
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.export }));

    expect(props.onExport).toHaveBeenCalledWith([]);
  });

  it('the top-bar Export also carries the current selection', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ onToggleSelected: vi.fn(), selectedIds: ['s1', 's3'] });

    await user.click(screen.getAllByRole('button', { name: STRINGS.a11y.export })[0]);

    // Sheet order, not click order.
    expect(props.onExport).toHaveBeenCalledWith(['s1', 's3']);
  });
});

describe('read-only (UI §11.2 error/read-only)', () => {
  it('shows the persistent chip and surfaces a blocked mutation as a toast, not silence', async () => {
    const user = userEvent.setup();
    const toasts: string[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast.text));
    const props = renderScreen({ readOnly: true });

    expect(screen.getByText(STRINGS.project.readOnlyChip)).toBeTruthy();

    const photo = screen.getByRole('button', { name: STRINGS.project.addTakePhoto });
    expect(photo.getAttribute('aria-disabled')).toBe('true');
    await user.click(photo);
    await user.click(screen.getByRole('button', { name: STRINGS.capture.importButton }));

    expect(props.onTakePhoto).not.toHaveBeenCalled();
    expect(props.onImport).not.toHaveBeenCalled();
    expect(toasts).toEqual([STRINGS.project.notSavedToast, STRINGS.project.notSavedToast]);

    off();
  });

  it('still allows opening a sheet (the editor opens it read-only)', async () => {
    const user = userEvent.setup();
    const props = renderScreen({ readOnly: true });

    await user.click(screen.getByRole('button', { name: 'Sheet 01' }));

    expect(props.onOpenSheet).toHaveBeenCalledWith('s1');
  });
});

describe('thumbnail rendering', () => {
  it('renders cached thumb.jpg bytes as an image and revokes the object URL on unmount', () => {
    const create = vi.fn(() => 'blob:mock');
    const revoke = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    try {
      const thumb = new Blob(['x']);
      render(<ProjectScreen {...baseProps({ sheets: [{ ...CARDS[0], thumb }] })} />);

      const img = document.querySelector('img.sheet-card-image') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('blob:mock');

      cleanup();
      expect(revoke).toHaveBeenCalledWith('blob:mock');
    } finally {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('shows the honest placeholder when there is no thumbnail (jsdom has no createObjectURL)', () => {
    renderScreen({ sheets: [{ ...CARDS[0], thumb: null }] });
    expect(document.querySelector('.sheet-card-placeholder')).toBeTruthy();
    expect(document.querySelector('img.sheet-card-image')).toBeNull();
  });
});

describe('accessibility', () => {
  it('every control has an accessible name, open or closed', async () => {
    const user = userEvent.setup();
    renderScreen({ onToggleSelected: () => {}, selectedIds: ['s1'] });

    // Open the ⋯ menu so its items are in the tree too.
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.moreActions }));

    for (const button of [...document.querySelectorAll('button')]) {
      const named =
        button.getAttribute('aria-label')?.trim() || button.textContent?.trim() || '';
      expect(named, `unnamed control: ${button.outerHTML}`).not.toBe('');
    }
  });

  it('renders unbuilt ⋯ items disabled + aria-disabled, never as live affordances (D102)', async () => {
    const user = userEvent.setup();
    renderScreen({ onToggleSelected: () => {} });

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.moreActions }));

    const disabled = document.querySelectorAll('.project-menu-item[aria-disabled="true"]');
    // Rename, Copy path, Reveal folder, Trash…, Delete project, Project settings.
    expect(disabled).toHaveLength(6);
    for (const item of disabled) {
      expect((item as HTMLButtonElement).disabled).toBe(true);
    }
    // Export is the one wired item.
    const exportItem = document.querySelector('.project-menu-item[data-menu-item="export"]');
    expect(exportItem?.getAttribute('aria-disabled')).toBeNull();
    expect((exportItem as HTMLButtonElement).disabled).toBe(false);
  });

  it('the grid is a list of listitems, with the tiles as the first two', () => {
    renderScreen();
    const grid = screen.getByRole('list', { name: STRINGS.project.sheetsRegion });
    expect(grid.tagName).toBe('UL');
    const items = screen.getAllByRole('listitem');
    // 2 tiles + 3 cards.
    expect(items).toHaveLength(5);
    expect(items[0].querySelector('.sheet-tile-photo')).toBeTruthy();
    expect(items[1].querySelector('.sheet-tile-import')).toBeTruthy();
  });
});

describe('sheet delete — recoverable, never a silent no-op (UI §13.3:800)', () => {
  it('renders NO card menu when onDeleteSheet is absent (absent prop → no affordance)', () => {
    renderScreen();
    expect(document.querySelectorAll('.sheet-card-menu-button')).toHaveLength(0);
    expect(document.querySelectorAll('.sheet-card-menu')).toHaveLength(0);
  });

  it('deletes only after two deliberate taps, then offers the real 10 s Undo', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    // D113: the handler resolves — the screen announces only what the shell's write did.
    const onDeleteSheet = vi.fn(async () => {});
    const onRestoreSheet = vi.fn();
    renderScreen({ onDeleteSheet, onRestoreSheet });

    // Not a bare one-tap: the card ⋯ first…
    await user.click(screen.getByTestId('sheet-card-menu-s2'));
    expect(onDeleteSheet).not.toHaveBeenCalled();

    // …then Delete.
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.deleteNamed, { title: 'Sheet 02' }),
      }),
    );

    expect(onDeleteSheet).toHaveBeenCalledTimes(1);
    expect(onDeleteSheet).toHaveBeenCalledWith('s2');
    // The toast appears only once the shell's write has resolved.
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.toasts.sheetDeleted);
    expect(toasts[0].action?.label).toBe(STRINGS.editor.undo);

    // The Undo is real, not decoration: it routes to the injected restore.
    toasts[0].action?.run();
    expect(onRestoreSheet).toHaveBeenCalledWith('s2');

    off();
  });

  it('never announces the delete before the shell confirms it (no optimistic toast)', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    // Definite assignment: TS cannot see the assignment inside the promise executor, so the
    // plain `let … | null` form narrows to `never` at the call site.
    let release!: () => void;
    const onDeleteSheet = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    renderScreen({ onDeleteSheet });

    await user.click(screen.getByTestId('sheet-card-menu-s2'));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.deleteNamed, { title: 'Sheet 02' }),
      }),
    );

    expect(onDeleteSheet).toHaveBeenCalledTimes(1);
    // The write is still in flight: claiming «Sheet deleted» here would be a lie whenever it
    // failed (the rule the autosave chip follows, §13.1).
    expect(toasts).toHaveLength(0);

    release?.();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.toasts.sheetDeleted);
    off();
  });

  it('a failed delete says so, claims no success, and offers no undo', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    const onDeleteSheet = vi.fn(async () => {
      throw new Error('write failed');
    });
    const onRestoreSheet = vi.fn();
    renderScreen({ onDeleteSheet, onRestoreSheet });

    await user.click(screen.getByTestId('sheet-card-menu-s2'));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.deleteNamed, { title: 'Sheet 02' }),
      }),
    );

    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.trash.deleteFailed);
    expect(toasts[0].urgent).toBe(true);
    expect(toasts[0].action).toBeUndefined();
    expect(onRestoreSheet).not.toHaveBeenCalled();
    off();
  });

  it('the card ⋯ is keyboard-operable and Esc returns focus to its trigger', async () => {
    const user = userEvent.setup();
    renderScreen({ onDeleteSheet: vi.fn() });

    const trigger = screen.getByTestId('sheet-card-menu-s1');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // Focus moves onto the FIRST item — `Open` leads the §11.2:720 menu.
    expect(document.activeElement?.getAttribute('data-card-menu-item')).toBe('open');

    await user.keyboard('{Escape}');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('⋯ → «Trash…» (UI §11.2:711; build spec §11.9:2029)', () => {
  const TRASHED: TrashedSheet[] = [
    { id: 't1', title: 'Sheet 09', deletedAt: '2026-09-20T15:00:00.000Z', daysLeft: 12, thumb: null },
  ];

  it('stays disabled when the shell cannot load the trash (D102, never hidden)', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: STRINGS.a11y.moreActions }));

    const item = document.querySelector(
      '.project-menu-item[data-menu-item="trash"]',
    ) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it('opens the trash panel, tells the shell, and closes honestly', async () => {
    const user = userEvent.setup();
    const onOpenTrash = vi.fn();
    const onCloseTrash = vi.fn();
    renderScreen({ onOpenTrash, onRestoreSheet: vi.fn(), trash: TRASHED, onCloseTrash });

    await user.click(screen.getByRole('button', { name: STRINGS.a11y.moreActions }));
    const item = document.querySelector(
      '.project-menu-item[data-menu-item="trash"]',
    ) as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    await user.click(item);

    expect(onOpenTrash).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: STRINGS.trash.open })).toBeTruthy();
    // One dialog only — this repo has been bitten by nested same-named modals.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByTestId('trash-row-t1')).toBeTruthy();

    await user.click(screen.getByTestId('trash-close'));
    expect(onCloseTrash).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('trash-panel')).toBeNull();
  });

  it('keeps the panel closed until the user opens it (no trash prop leaks onto the screen)', () => {
    renderScreen({ onOpenTrash: vi.fn(), trash: TRASHED, onRestoreSheet: vi.fn() });
    expect(screen.queryByTestId('trash-panel')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The card menu, rename, duplicate, replace photo and reorder (UI §11.2:719-720)
// ---------------------------------------------------------------------------

/**
 * jsdom has no `PointerEvent`, and @testing-library's `fireEvent.pointerDown` silently
 * DROPS `clientX`/`clientY` when the constructor is missing — which would make every
 * geometric assertion below vacuously true. Dispatch a real bubbling `Event` and attach
 * the pointer fields the handlers read, so the coordinates genuinely arrive.
 */
function dispatchPointer(
  target: EventTarget,
  type: string,
  init: Record<string, unknown> = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
}

/**
 * jsdom has no layout, so every `getBoundingClientRect()` is 0 × 0 at (0, 0) and any drop
 * would resolve to the fallback index. This hands the component the same 4-across geometry
 * `tests/sheetReorder.test.ts` uses for real (320 × 300 cards, 16 px gap), so the drag path
 * is exercised against actual rectangles rather than a vacuous one.
 */
function stubCardRects(ids: readonly string[]): () => void {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element): DOMRect {
      const id = this.getAttribute('data-sheet-id');
      const index = id === null ? -1 : ids.indexOf(id);
      const left = index < 0 ? 0 : index * 336;
      return {
        left,
        top: 0,
        width: 320,
        height: 300,
        right: left + 320,
        bottom: 300,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  return () => spy.mockRestore();
}

function cardMenuItem(id: string): HTMLElement {
  return screen.getByTestId(`sheet-card-menu-${id}`);
}

function menuItemKeys(): (string | null)[] {
  return [...document.querySelectorAll('[data-card-menu-item]')].map((el) =>
    el.getAttribute('data-card-menu-item'),
  );
}

/**
 * The «04» badge of ONE card. The badge is the card's live position, so in DOM order the
 * numbers always read 01…0N — the renumber is only visible per CARD (s1's badge going
 * 01 → 03 as it is dragged to the end), which is exactly what this reads.
 */
function badgeFor(id: string): string | null {
  const item = document.querySelector(`.sheet-grid-item[data-sheet-id="${id}"]`);
  return item?.querySelector('.sheet-card-index')?.textContent ?? null;
}

describe('the card menu: live when injected, omitted when not (D102)', () => {
  it('with only Delete injected, the menu is Open + Delete and nothing is faked', async () => {
    const user = userEvent.setup();
    renderScreen({ onDeleteSheet: vi.fn() });

    await user.click(cardMenuItem('s1'));

    expect(menuItemKeys()).toEqual(['open', 'delete']);
  });

  it('with every callback injected, the §11.2:720 items render in order and are live', async () => {
    const user = userEvent.setup();
    const onOpenSheet = vi.fn();
    renderScreen({
      onOpenSheet,
      onDeleteSheet: vi.fn(),
      onRenameSheet: vi.fn(),
      onDuplicateSheet: vi.fn(),
      onReplacePhoto: vi.fn(),
      onReorderSheets: vi.fn(),
    });

    await user.click(cardMenuItem('s2'));
    expect(menuItemKeys()).toEqual([
      'open',
      'rename',
      'duplicate',
      'replace',
      'moveEarlier',
      'moveLater',
      'delete',
    ]);

    // `Open` is the menu's own route to the sheet, wired to the real callback.
    await user.click(
      screen.getByRole('menuitem', { name: t(STRINGS.sheetMenu.openNamed, { title: 'Sheet 02' }) }),
    );
    expect(onOpenSheet).toHaveBeenCalledWith('s2');
  });

  it('a partial injection omits exactly the absent affordances', async () => {
    const user = userEvent.setup();
    renderScreen({ onRenameSheet: vi.fn(), onReorderSheets: vi.fn() });

    await user.click(cardMenuItem('s1'));

    // No delete, no duplicate, no replace — those callbacks were not injected.
    expect(menuItemKeys()).toEqual(['open', 'rename', 'moveEarlier', 'moveLater']);
  });
});

describe('rename — inline on the card, honest about failure', () => {
  async function openRename(user: ReturnType<typeof userEvent.setup>, id = 's1'): Promise<HTMLElement> {
    await user.click(cardMenuItem(id));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.renameNamed, { title: id === 's1' ? 'Sheet 01' : 'Sheet 02' }),
      }),
    );
    return screen.getByRole('textbox', { name: STRINGS.sheetMenu.renameLabel });
  }

  it('opens a focused, selected field seeded with the real title', async () => {
    const user = userEvent.setup();
    renderScreen({ onRenameSheet: vi.fn() });

    const field = await openRename(user);

    expect((field as HTMLInputElement).value).toBe('Sheet 01');
    expect(document.activeElement).toBe(field);
  });

  it('Enter commits the trimmed value to the shell', async () => {
    const user = userEvent.setup();
    const onRenameSheet = vi.fn(async () => {});
    renderScreen({ onRenameSheet });

    const field = await openRename(user);
    await user.clear(field);
    await user.type(field, '  Front porch  ');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onRenameSheet).toHaveBeenCalledWith('s1', 'Front porch'));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: STRINGS.sheetMenu.renameLabel })).toBeNull(),
    );
  });

  it('Escape cancels without calling the shell', async () => {
    const user = userEvent.setup();
    const onRenameSheet = vi.fn();
    renderScreen({ onRenameSheet });

    const field = await openRename(user);
    await user.type(field, 'Typed but abandoned');
    await user.keyboard('{Escape}');

    expect(onRenameSheet).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: STRINGS.sheetMenu.renameLabel })).toBeNull();
  });

  it('a blank commit is a cancel, never a call with an empty title', async () => {
    const user = userEvent.setup();
    const onRenameSheet = vi.fn();
    renderScreen({ onRenameSheet });

    const field = await openRename(user);
    await user.clear(field);
    await user.keyboard('{Enter}');

    expect(onRenameSheet).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: STRINGS.sheetMenu.renameLabel })).toBeNull();
  });

  it('an unchanged value is a cancel, not a pointless write', async () => {
    const user = userEvent.setup();
    const onRenameSheet = vi.fn();
    renderScreen({ onRenameSheet });

    await openRename(user);
    await user.keyboard('{Enter}');

    expect(onRenameSheet).not.toHaveBeenCalled();
  });

  it('a rejected rename keeps the field open on the old title and says so', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    const onRenameSheet = vi.fn(async () => {
      throw new Error('write failed');
    });
    renderScreen({ onRenameSheet });

    const field = await openRename(user);
    await user.clear(field);
    await user.type(field, 'Renamed');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.sheetMenu.renameFailed);
    expect(toasts[0].urgent).toBe(true);

    // The screen did not claim a rename that did not happen: the real title is back.
    const after = screen.getByRole('textbox', { name: STRINGS.sheetMenu.renameLabel });
    expect((after as HTMLInputElement).value).toBe('Sheet 01');
    off();
  });
});

describe('duplicate — the shell writes, the screen only reports (no optimistic card)', () => {
  it('routes the id to the shell and inserts nothing', async () => {
    const user = userEvent.setup();
    const onDuplicateSheet = vi.fn(async () => ({ id: 'copy-1' }));
    renderScreen({ onDuplicateSheet });

    await user.click(cardMenuItem('s2'));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.duplicateNamed, { title: 'Sheet 02' }),
      }),
    );

    expect(onDuplicateSheet).toHaveBeenCalledWith('s2');
    // Three cards still — the shell's refresh is what will add the copy.
    expect(document.querySelectorAll('.sheet-card')).toHaveLength(3);
  });

  it('a rejected duplicate emits the honest failure line', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    const onDuplicateSheet = vi.fn(async () => {
      throw new Error('write failed');
    });
    renderScreen({ onDuplicateSheet });

    await user.click(cardMenuItem('s1'));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.duplicateNamed, { title: 'Sheet 01' }),
      }),
    );

    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.sheetMenu.duplicateFailed);
    expect(toasts[0].urgent).toBe(true);
    off();
  });
});

describe('replace photo — the warned dialog (UI §11.2:720)', () => {
  const PROMPT = { sheetId: 's1', title: 'Sheet 01' };

  it('the menu item hands off to the shell, and no dialog renders without a prompt', async () => {
    const user = userEvent.setup();
    const onReplacePhoto = vi.fn();
    renderScreen({ onReplacePhoto });

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(cardMenuItem('s1'));
    await user.click(
      screen.getByRole('menuitem', {
        name: t(STRINGS.sheetMenu.replaceNamed, { title: 'Sheet 01' }),
      }),
    );

    expect(onReplacePhoto).toHaveBeenCalledWith('s1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the warned dialog with the pinned copy and the default focus on Keep', () => {
    renderScreen({ onResolveReplace: vi.fn(), replacePrompt: PROMPT });

    expect(screen.getByRole('dialog', { name: STRINGS.sheetMenu.replacePhoto })).toBeTruthy();
    expect(screen.getByText(STRINGS.project.replacePhotoWarn)).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: STRINGS.project.replacePhotoKeep }),
    );
  });

  it('Keep and Cancel wire the right answers; Escape cancels', async () => {
    const user = userEvent.setup();
    const onResolveReplace = vi.fn();
    renderScreen({ onResolveReplace, replacePrompt: PROMPT });

    await user.click(screen.getByRole('button', { name: STRINGS.project.replacePhotoKeep }));
    expect(onResolveReplace).toHaveBeenCalledWith('keep');

    onResolveReplace.mockClear();
    await user.keyboard('{Escape}');
    expect(onResolveReplace).toHaveBeenCalledWith('cancel');

    onResolveReplace.mockClear();
    await user.click(screen.getByRole('button', { name: STRINGS.editor.cancel }));
    expect(onResolveReplace).toHaveBeenCalledWith('cancel');
  });

  it('Remove markup does NOT fire before 600 ms and fires when the hold completes', () => {
    vi.useFakeTimers();
    try {
      const onResolveReplace = vi.fn();
      renderScreen({ onResolveReplace, replacePrompt: PROMPT });

      const remove = screen.getByTestId('sheet-replace-remove');
      dispatchPointer(remove, 'pointerdown');

      // One millisecond short of the hold: firing here would be a wrong-measurement bug
      // (the markup would be thrown away by a tap).
      act(() => {
        vi.advanceTimersByTime(599);
      });
      expect(onResolveReplace).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onResolveReplace).toHaveBeenCalledWith('remove');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a released hold is cancelled — a tap on Remove never removes', () => {
    vi.useFakeTimers();
    try {
      const onResolveReplace = vi.fn();
      renderScreen({ onResolveReplace, replacePrompt: PROMPT });

      const remove = screen.getByTestId('sheet-replace-remove');
      dispatchPointer(remove, 'pointerdown');
      dispatchPointer(remove, 'pointerup');
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(onResolveReplace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reorder — the keyboard path (WCAG 2.1.1) and the drag', () => {
  it('Move earlier / Move later call onReorderSheets with the live order', async () => {
    const user = userEvent.setup();
    const onReorderSheets = vi.fn(async () => {});
    renderScreen({ onReorderSheets });

    // s1 moves one place later: [s1,s2,s3] → [s2,s1,s3].
    await user.click(cardMenuItem('s1'));
    await user.click(screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveLater }));
    expect(onReorderSheets).toHaveBeenLastCalledWith(['s2', 's1', 's3']);

    // The list re-rendered in the new order; s3 (now last) moves one place earlier.
    await user.click(cardMenuItem('s3'));
    await user.click(screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveEarlier }));
    expect(onReorderSheets).toHaveBeenLastCalledWith(['s2', 's3', 's1']);
  });

  it('Move earlier is disabled at the first live position, Move later at the last', async () => {
    const user = userEvent.setup();
    renderScreen({ onReorderSheets: vi.fn() });

    await user.click(cardMenuItem('s1'));
    expect((screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveEarlier }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveEarlier }).getAttribute('aria-disabled'),
    ).toBe('true');

    await user.keyboard('{Escape}');
    await user.click(cardMenuItem('s3'));
    expect((screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveLater }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveLater }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('a rejected reorder restores the pre-drag order and says so', async () => {
    const user = userEvent.setup();
    const toasts: ToastMessage[] = [];
    const off = subscribeToastMessage((toast) => toasts.push(toast));
    const onReorderSheets = vi.fn(async () => {
      throw new Error('write failed');
    });
    renderScreen({ onReorderSheets });

    await user.click(cardMenuItem('s2'));
    await user.click(screen.getByRole('menuitem', { name: STRINGS.sheetMenu.moveEarlier }));

    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].text).toBe(STRINGS.sheetMenu.reorderFailed);
    expect(toasts[0].urgent).toBe(true);

    // Order back to s1, s2, s3 — s2 is back at its middle position.
    await waitFor(() => expect(badgeFor('s2')).toBe('02'));
    off();
  });

  it('a 400 ms lift shows the «Drop to move» chip and marks the card as dragging', () => {
    vi.useFakeTimers();
    try {
      renderScreen({ onReorderSheets: vi.fn() });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 40, clientY: 40 });
      expect(screen.queryByTestId('sheet-reorder-chip')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(400);
      });

      const chip = screen.getByTestId('sheet-reorder-chip');
      expect(chip.textContent).toBe(STRINGS.project.reorderChip);
      // A live region, so a screen reader hears the drop affordance.
      expect(chip.getAttribute('role')).toBe('status');
      expect(document.querySelector('.sheet-card[data-dragging="true"]')).toBeTruthy();

      dispatchPointer(document, 'pointercancel');
      expect(screen.queryByTestId('sheet-reorder-chip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the grid renumbers live while dragging and persists the final order', () => {
    vi.useFakeTimers();
    const restoreRects = stubCardRects(['s1', 's2', 's3']);
    try {
      const onReorderSheets = vi.fn(async () => {});
      renderScreen({ onReorderSheets });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // Over the third card's rectangle (2 × 336 + 10 = 682) — a real drop decision.
      dispatchPointer(document, 'pointermove', { clientX: 682, clientY: 10 });
      // The dragged card's own badge renumbers live: s1 has moved from position 1 to 3.
      expect(badgeFor('s1')).toBe('03');
      expect(badgeFor('s2')).toBe('01');

      dispatchPointer(document, 'pointerup', { clientX: 682, clientY: 10 });
      expect(onReorderSheets).toHaveBeenCalledWith(['s2', 's3', 's1']);
    } finally {
      restoreRects();
      vi.useRealTimers();
    }
  });

  it('Escape aborts a drag and restores the pre-drag order', () => {
    vi.useFakeTimers();
    const restoreRects = stubCardRects(['s1', 's2', 's3']);
    try {
      const onReorderSheets = vi.fn(async () => {});
      renderScreen({ onReorderSheets });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      dispatchPointer(document, 'pointermove', { clientX: 682, clientY: 10 });
      expect(badgeFor('s1')).toBe('03');
      dispatchPointer(document, 'keydown', { key: 'Escape' });

      expect(onReorderSheets).not.toHaveBeenCalled();
      expect(badgeFor('s1')).toBe('01');
      expect(badgeFor('s2')).toBe('02');
    } finally {
      restoreRects();
      vi.useRealTimers();
    }
  });

  it('a drag never opens the sheet: the click that follows is swallowed once', () => {
    vi.useFakeTimers();
    const restoreRects = stubCardRects(['s1', 's2', 's3']);
    try {
      const onOpenSheet = vi.fn();
      renderScreen({ onOpenSheet, onReorderSheets: vi.fn() });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      dispatchPointer(document, 'pointermove', { clientX: 682, clientY: 10 });
      dispatchPointer(document, 'pointerup', { clientX: 682, clientY: 10 });

      fireEvent.click(card);
      expect(onOpenSheet).not.toHaveBeenCalled();

      // …and the very next tap is an ordinary open again.
      fireEvent.click(card);
      expect(onOpenSheet).toHaveBeenCalledWith('s1');
    } finally {
      restoreRects();
      vi.useRealTimers();
    }
  });

  it('a cancelled pointer leaves no stale click-suppression behind', () => {
    vi.useFakeTimers();
    const restoreRects = stubCardRects(['s1', 's2', 's3']);
    try {
      const onOpenSheet = vi.fn();
      renderScreen({ onOpenSheet, onReorderSheets: vi.fn() });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      dispatchPointer(document, 'pointercancel');

      // No click EVER follows a cancelled pointer, so the next one is an ordinary open.
      fireEvent.click(card);
      expect(onOpenSheet).toHaveBeenCalledWith('s1');
    } finally {
      restoreRects();
      vi.useRealTimers();
    }
  });

  it('an Escape-cancelled drag leaves no stale click-suppression behind', () => {
    // Escape is the same shape as `pointercancel`: a lift is abandoned without any click,
    // so the armed suppression must be released — otherwise the next ordinary tap on a
    // card opens nothing (a dead card, the D102 class).
    vi.useFakeTimers();
    const restoreRects = stubCardRects(['s1', 's2', 's3']);
    try {
      const onOpenSheet = vi.fn();
      renderScreen({ onOpenSheet, onReorderSheets: vi.fn() });
      const card = screen.getByRole('button', { name: 'Sheet 01' });

      dispatchPointer(card, 'pointerdown', { clientX: 10, clientY: 10 });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      dispatchPointer(document, 'keydown', { key: 'Escape' });

      fireEvent.click(card);
      expect(onOpenSheet).toHaveBeenCalledWith('s1');
    } finally {
      restoreRects();
      vi.useRealTimers();
    }
  });

  it('a press on the ⋯ trigger or the select toggle never arms the drag', () => {
    vi.useFakeTimers();
    try {
      renderScreen({ onReorderSheets: vi.fn(), onToggleSelected: vi.fn() });

      dispatchPointer(cardMenuItem('s1'), 'pointerdown', { clientX: 40, clientY: 40 });
      dispatchPointer(document.querySelector('.sheet-card-select') as Element, 'pointerdown');
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(document.querySelector('.sheet-card[data-dragging="true"]')).toBeNull();
      expect(screen.queryByTestId('sheet-reorder-chip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('with no onReorderSheets the grid is not draggable and the move items are absent', async () => {
    const user = userEvent.setup();
    renderScreen({ onDeleteSheet: vi.fn() });

    await user.click(cardMenuItem('s1'));
    expect(menuItemKeys()).toEqual(['open', 'delete']);
  });
});
