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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    // Focus moves onto the menu item.
    expect(document.activeElement?.getAttribute('data-card-menu-item')).toBe('delete');

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
