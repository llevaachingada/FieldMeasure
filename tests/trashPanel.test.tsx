/**
 * `tests/trashPanel.test.tsx` — the sheet-trash restore panel (UI §11.2:711; build spec
 * §11.9:2029; UI §13.3:800). jsdom project.
 *
 * **Layout is NOT asserted here (D40).** jsdom has no layout engine, so the two-pane
 * list/preview arrangement, the real focus ring and the 48 px boxes live only in
 * `projectScreen.css` and are a MANUAL check. What is asserted is the model, the copy, the
 * interaction contract and the a11y contract — including the honest states and the fact
 * that a restore never claims success before the shell's list says so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrashPanel, { type TrashedSheet } from '../src/ui/TrashPanel';
import { STRINGS, t } from '../src/ui/strings';

afterEach(cleanup);

const ITEMS: TrashedSheet[] = [
  { id: 't1', title: 'Sheet 09', deletedAt: '2026-09-20T15:00:00.000Z', daysLeft: 12, thumb: null },
  { id: 't2', title: 'Sheet 10', deletedAt: '2026-09-21T09:30:00.000Z', daysLeft: 1, thumb: null },
  { id: 't3', title: 'Sheet 11', deletedAt: '2026-09-01T09:30:00.000Z', daysLeft: 0, thumb: null },
];

interface Overrides {
  items?: readonly TrashedSheet[];
  restoreFailed?: boolean;
  onRestore?: (id: string) => void;
  onClose?: () => void;
}

function renderPanel(overrides: Overrides = {}): {
  items: readonly TrashedSheet[] | undefined;
  onRestore: (id: string) => void;
  onClose: () => void;
} {
  const items = 'items' in overrides ? overrides.items : ITEMS;
  const onRestore: (id: string) => void =
    'onRestore' in overrides ? (overrides.onRestore as (id: string) => void) : vi.fn();
  const onClose: () => void = overrides.onClose ?? vi.fn();
  render(
    <TrashPanel
      items={items}
      restoreFailed={overrides.restoreFailed ?? false}
      onRestore={onRestore}
      onClose={onClose}
    />,
  );
  return { items, onRestore, onClose };
}

/** The same locale call the panel makes, so the assertion is locale-independent. */
function deletedOn(iso: string): string {
  return t(STRINGS.trash.deletedOn, { date: new Date(iso).toLocaleDateString() });
}

describe('the panel is one real dialog with a real name (§19.6, no nested modals)', () => {
  it('is role="dialog", announced by the reused «Trash…» title', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: STRINGS.trash.open })).toBeTruthy();
  });

  it('renders exactly ONE dialog and zero inline styles (CSP)', () => {
    renderPanel();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(document.querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('honest states — nothing is claimed before the truth arrives', () => {
  it('loading: `items` undefined means the shell has not read .trash/ yet', () => {
    renderPanel({ items: undefined });
    expect(screen.getByTestId('trash-loading').textContent).toBe(STRINGS.trash.loading);
    expect(screen.queryByTestId('trash-list')).toBeNull();
    expect(screen.queryByTestId('trash-empty')).toBeNull();
  });

  it('empty: a loaded, empty trash says so', () => {
    renderPanel({ items: [] });
    expect(screen.getByTestId('trash-empty').textContent).toBe(STRINGS.trash.empty);
    expect(screen.queryByTestId('trash-list')).toBeNull();
  });

  it('failure: a shell-reported restore failure is an assertive alert', () => {
    renderPanel({ restoreFailed: true });
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.trash.restoreFailed);
  });
});

describe('rows show the name, the deleted date and the days left (the 14-day promise)', () => {
  it('lists every trashed sheet as a real listitem', () => {
    renderPanel();
    const list = screen.getByRole('list', { name: STRINGS.trash.open });
    expect(list.tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('trash-row-t1').tagName).toBe('BUTTON');
  });

  it('shows the deleted date plus the singular / plural / last-day forms', () => {
    renderPanel();

    const row1 = screen.getByTestId('trash-row-t1');
    expect(row1.textContent).toContain('Sheet 09');
    expect(row1.textContent).toContain(deletedOn('2026-09-20T15:00:00.000Z'));
    expect(row1.textContent).toContain('12 days left');

    expect(screen.getByTestId('trash-row-t2').textContent).toContain(STRINGS.trash.daysLeftOne);
    expect(screen.getByTestId('trash-row-t3').textContent).toContain(STRINGS.trash.daysLeftNone);
  });

  it('makes the 14-day window explicit in the footer too', () => {
    renderPanel();
    expect(screen.getByText(STRINGS.trash.pruneNote)).toBeTruthy();
  });
});

describe('read-only preview + Restore (P §11.9:2029)', () => {
  it('previews the newest row by default and switches on selection', async () => {
    const user = userEvent.setup();
    renderPanel();

    const preview = screen.getByRole('region', { name: STRINGS.trash.previewLabel });
    expect(preview.textContent).toContain('Sheet 09');

    await user.click(screen.getByTestId('trash-row-t2'));
    expect(
      screen.getByRole('region', { name: STRINGS.trash.previewLabel }).textContent,
    ).toContain('Sheet 10');
    expect(screen.getByTestId('trash-row-t2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('trash-row-t1').getAttribute('aria-current')).toBeNull();
  });

  it('Restore names the sheet and calls the injected callback', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    const restore = screen.getByTestId('trash-restore-t1');
    expect(restore.getAttribute('aria-label')).toBe(
      t(STRINGS.trash.restoreNamed, { title: 'Sheet 09' }),
    );
    expect(restore.textContent).toBe(STRINGS.trash.restore);

    await user.click(restore);
    expect(props.onRestore).toHaveBeenCalledWith('t1');
  });

  it('enters an honest restoring state and does NOT claim success on its own', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId('trash-restore-t1'));

    const restore = screen.getByTestId('trash-restore-t1') as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    expect(restore.textContent).toBe(STRINGS.trash.restoring);
    // Announced too (§19.6 live region).
    expect(screen.getByRole('status').textContent).toBe(STRINGS.trash.restoring);
    // The row is still listed — the shell's list has not confirmed anything.
    expect(screen.getByTestId('trash-row-t1')).toBeTruthy();
  });

  it('a shell-reported failure clears the restoring state (never a stuck spinner)', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <TrashPanel items={ITEMS} restoreFailed={false} onRestore={onRestore} onClose={onClose} />,
    );

    await user.click(screen.getByTestId('trash-restore-t1'));
    expect((screen.getByTestId('trash-restore-t1') as HTMLButtonElement).disabled).toBe(true);

    rerender(<TrashPanel items={ITEMS} restoreFailed onRestore={onRestore} onClose={onClose} />);
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.trash.restoreFailed);
    expect((screen.getByTestId('trash-restore-t1') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Restore when the shell injects no restore callback (no dead-looking button)', () => {
    renderPanel({ onRestore: undefined });
    expect((screen.getByTestId('trash-restore-t1') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('focus & keyboard (§19.6)', () => {
  it('Esc closes — so the Tab cycle is never a keyboard trap', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button closes', async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    await user.click(screen.getByTestId('trash-close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus in on open, traps Tab, and returns focus to the invoker on close', async () => {
    const user = userEvent.setup();
    const invoker = document.createElement('button');
    invoker.textContent = 'invoker';
    document.body.appendChild(invoker);
    invoker.focus();

    const { unmount } = render(
      <TrashPanel items={ITEMS} onRestore={vi.fn()} onClose={vi.fn()} />,
    );
    const panel = screen.getByTestId('trash-panel');
    expect(document.activeElement).toBe(panel);

    screen.getByTestId('trash-close').focus();
    await user.tab({ shift: true });
    // Shift+Tab from the first control wraps to the last, inside the dialog.
    expect(panel.contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(invoker);
    invoker.remove();
  });
});

describe('thumbnail rendering', () => {
  it('renders a trashed thumb.jpg as an image and revokes the URL on unmount', () => {
    const create = vi.fn(() => 'blob:trash');
    const revoke = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    try {
      render(
        <TrashPanel
          items={[{ ...ITEMS[0], thumb: new Blob(['x']) }]}
          onRestore={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const img = document.querySelector('.trash-thumb-image') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('blob:trash');

      cleanup();
      expect(revoke).toHaveBeenCalledWith('blob:trash');
    } finally {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it('shows the honest placeholder when there is no thumbnail', () => {
    renderPanel();
    expect(document.querySelector('.trash-thumb-placeholder')).toBeTruthy();
    expect(document.querySelector('.trash-thumb-image')).toBeNull();
  });
});
