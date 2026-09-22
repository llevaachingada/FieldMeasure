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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectScreen, { type ProjectScreenProps } from '../src/ui/ProjectScreen';
import type { ProjectSheetCard } from '../src/fs/projectSheets';
import { STRINGS, t } from '../src/ui/strings';
import { resetToastBus, subscribeToastMessage } from '../src/editor/session';

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
