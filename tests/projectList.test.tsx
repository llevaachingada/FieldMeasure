/**
 * tests/projectList.test.tsx — slice 1.2 step 8 (Home rewire) + §5.8c duplicate ids.
 *
 * jsdom has no File System Access API, so the scan and the "make this a separate
 * project" action are injected (`scan` / `separate` props). Everything asserted here is
 * the card model and the a11y contract: identity by `project.json` id, one card per
 * folder, the «Copy» badge on non-most-recent duplicate folders, `id + folderName`
 * keys, and a focusable/labelled control for every action.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectList from '../src/ui/ProjectList';
import { STRINGS } from '../src/ui/strings';
import type { ScannedProject } from '../src/fs/projectStore';

afterEach(cleanup);

const newest: ScannedProject = {
  key: 'dup:Riverside',
  id: 'dup',
  folderName: 'Riverside',
  title: 'Riverside Elementary',
  sheetCount: 12,
  path: '…\\Riverside',
  updatedAtMs: 300,
  isDuplicate: true,
  isMostRecent: true,
  status: 'ok',
};

const olderCopy: ScannedProject = {
  key: 'dup:Riverside - Copy',
  id: 'dup',
  folderName: 'Riverside - Copy',
  title: 'Riverside Elementary',
  sheetCount: 12,
  path: '…\\Riverside - Copy',
  updatedAtMs: 200,
  isDuplicate: true,
  isMostRecent: false,
  status: 'ok',
};

const solo: ScannedProject = {
  key: 'solo:Elm Street',
  id: 'solo',
  folderName: 'Elm Street',
  title: 'Elm Street Footings',
  sheetCount: 5,
  path: '…\\Elm Street',
  updatedAtMs: 100,
  isDuplicate: false,
  isMostRecent: true,
  status: 'ok',
};

describe('Home states (§11.1)', () => {
  it('shows 6 skeletons while the scan runs, then the cards', async () => {
    let release!: (entries: ScannedProject[]) => void;
    const scan = vi.fn(
      () =>
        new Promise<ScannedProject[]>((resolve) => {
          release = resolve;
        }),
    );
    render(<ProjectList scan={scan} />);

    expect(screen.getByRole('region', { name: STRINGS.home.loading })).toBeTruthy();
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(6);

    release([solo]);
    await waitFor(() => expect(screen.getByText('Elm Street Footings')).toBeTruthy());
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(0);
  });

  it('shows the honest empty state when the folder holds no projects', async () => {
    render(<ProjectList scan={async () => []} />);

    expect(await screen.findByText(STRINGS.home.emptyHeadline)).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS.home.createProject })).toBeTruthy();
    // Beta: adoption is unbuilt, so the empty-state variant is visible but honestly disabled —
    // the first screen a tester sees must never carry a dead affordance.
    const openFolder = screen.getByRole('button', {
      name: STRINGS.home.openExistingFolderEmpty,
    }) as HTMLButtonElement;
    expect(openFolder.disabled).toBe(true);
    expect(openFolder.getAttribute('aria-disabled')).toBe('true');
  });

  it('still accepts the slice-0.3 projects/state overrides', () => {
    render(<ProjectList state="loading" />);
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(6);
  });
});

describe('project cards (§5.6 identity, §5.8c duplicates)', () => {
  it('renders one card per folder and keys them by id + folderName', async () => {
    render(<ProjectList scan={async () => [newest, olderCopy, solo]} />);

    await waitFor(() => expect(document.querySelectorAll('.project-card')).toHaveLength(4)); // 3 + secondary
    const keys = [...document.querySelectorAll('[data-project-key]')].map((el) =>
      el.getAttribute('data-project-key'),
    );
    expect(new Set(keys)).toEqual(new Set(['dup:Riverside', 'dup:Riverside - Copy', 'solo:Elm Street']));
  });

  it('badges only the non-most-recent duplicate folder «Copy»', async () => {
    render(<ProjectList scan={async () => [newest, olderCopy, solo]} />);

    await waitFor(() => expect(document.querySelector('[data-copy-badge]')).toBeTruthy());
    expect(document.querySelectorAll('[data-copy-badge]')).toHaveLength(1);
    expect(document.querySelector('[data-copy-badge]')?.textContent).toBe('Copy');
    // The badge sits on the copy's card, not the most-recent folder's card.
    const badgeCard = document.querySelector('[data-copy-badge]')?.closest('[data-project-key]');
    expect(badgeCard?.getAttribute('data-project-key')).toBe('dup:Riverside - Copy');
  });

  it('opens each folder with its own id + folderName (never a merged project)', async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    render(
      <ProjectList scan={async () => [newest, olderCopy]} onOpenProject={onOpenProject} />,
    );

    const copyCard = await waitFor(() => {
      const card = document.querySelector('[data-project-key="dup:Riverside - Copy"]');
      if (!card) throw new Error('copy card not rendered');
      return card;
    });
    const openButton = copyCard.querySelector('button.project-card-open') as HTMLButtonElement;
    expect(openButton.getAttribute('aria-label')).toBe('Riverside Elementary');

    await user.click(openButton);
    expect(onOpenProject).toHaveBeenCalledWith('dup', 'Riverside - Copy');
  });

  it('offers «Make this a separate project» on a copy and rewrites only that folder', async () => {
    const user = userEvent.setup();
    const separate = vi.fn(async (_entry: ScannedProject) => undefined);
    const after: ScannedProject = {
      ...olderCopy,
      id: 'fresh-id',
      key: 'fresh-id:Riverside - Copy',
      isDuplicate: false,
      isMostRecent: true,
    };
    const scan = vi
      .fn<() => Promise<ScannedProject[]>>()
      .mockResolvedValueOnce([newest, olderCopy])
      .mockResolvedValue([newest, after]);

    render(<ProjectList scan={scan} separate={separate} />);

    const control = await screen.findByRole('button', {
      name: /Make this a separate project/,
    });
    await user.click(control);

    await waitFor(() => expect(separate).toHaveBeenCalledTimes(1));
    expect(separate.mock.calls[0][0].folderName).toBe('Riverside - Copy');
    // Re-scanned afterwards: the new id is no longer a duplicate, so the badge is gone.
    await waitFor(() => expect(document.querySelector('[data-copy-badge]')).toBeNull());
  });

  it('never offers «Make this a separate project» on a non-duplicate card', async () => {
    render(<ProjectList scan={async () => [solo]} />);

    await waitFor(() => expect(screen.getByText('Elm Street Footings')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Make this a separate project/ })).toBeNull();
  });

  it('renders the «Open existing folder…» card disabled and inert (beta: adoption unbuilt)', async () => {
    // D88/§2.4: adopting an existing folder is NOT built; `App.onOpenFolder` is a
    // no-op. The card must read as honestly unavailable, not as a live affordance.
    const user = userEvent.setup();
    const onOpenFolder = vi.fn();
    render(<ProjectList scan={async () => [solo]} onOpenFolder={onOpenFolder} />);

    const card = (await screen.findByRole('button', {
      name: STRINGS.home.openExistingFolder,
    })) as HTMLButtonElement;

    expect(card.disabled).toBe(true);
    expect(card.getAttribute('aria-disabled')).toBe('true');
    // Still visible (not hidden) and still carries its approved copy.
    expect(card.textContent).toBe(STRINGS.home.openExistingFolder);

    // Not actionable: even asking userEvent for a real click fires nothing.
    await user.click(card);
    expect(onOpenFolder).not.toHaveBeenCalled();
  });

  it('shows the missing-folder affordance for an unreadable folder', async () => {
    render(
      <ProjectList
        scan={async () => [
          { ...solo, id: '', key: 'Broken', folderName: 'Broken', title: 'Broken', status: 'unreadable' },
        ]}
      />,
    );

    expect(await screen.findByText(STRINGS.home.folderNotFound)).toBeTruthy();
    // «Locate…» is the same unbuilt adoption path: the state is shown, the affordance is not
    // faked (a moved folder is recovered in Explorer until adoption ships).
    const locate = screen.getByRole('button', { name: STRINGS.home.locate }) as HTMLButtonElement;
    expect(locate.disabled).toBe(true);
    expect(locate.getAttribute('aria-disabled')).toBe('true');
  });

  it('every control has an accessible name (a11y §19.6)', async () => {
    render(
      <ProjectList
        scan={async () => [newest, olderCopy, solo]}
        onOpenProject={() => {}}
        onOpenFolder={() => {}}
        onNewProject={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    await waitFor(() => expect(document.querySelectorAll('[data-project-key]')).toHaveLength(3));
    for (const button of [...document.querySelectorAll('button')]) {
      const named =
        button.getAttribute('aria-label')?.trim() ||
        button.textContent?.trim() ||
        '';
      expect(named, `unnamed control: ${button.outerHTML}`).not.toBe('');
    }
  });
});
