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
import ProjectList, { cardTimeLabel } from '../src/ui/ProjectList';
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
    // D141: adoption is unbuilt, so the empty-state's secondary button is hidden rather than
    // shown disabled — a permanently disabled control on the first screen read as broken.
    expect(screen.queryByRole('button', { name: STRINGS.home.openExistingFolderEmpty })).toBeNull();
  });

  it('still accepts the slice-0.3 projects/state overrides', () => {
    render(<ProjectList state="loading" />);
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(6);
  });
});

describe('project cards (§5.6 identity, §5.8c duplicates)', () => {
  it('renders one card per folder and keys them by id + folderName', async () => {
    render(<ProjectList scan={async () => [newest, olderCopy, solo]} />);

    // D141: the disabled secondary «Open existing folder…» card is gone (adoption is unbuilt),
    // so the count is exactly the scanned folders — no "+ secondary" any more.
    await waitFor(() => expect(document.querySelectorAll('.project-card')).toHaveLength(3));
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

  it('does not render the unbuilt «Open existing folder…» card (D141)', async () => {
    // D141: adopting an existing folder is NOT built; the disabled secondary card read as
    // broken on first use (review F5), so it is hidden instead of shown disabled.
    render(<ProjectList scan={async () => [solo]} onOpenFolder={vi.fn()} />);

    await screen.findByText('Elm Street Footings');
    expect(screen.queryByRole('button', { name: STRINGS.home.openExistingFolder })).toBeNull();
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

describe('card meta and cover (D141)', () => {
  it('shows "1 sheet" for a single sheet and "3 sheets" for three', async () => {
    const one: ScannedProject = {
      ...solo,
      key: 'one',
      id: 'one',
      folderName: 'One',
      title: 'One Sheet',
      sheetCount: 1,
    };
    const three: ScannedProject = {
      ...solo,
      key: 'three',
      id: 'three',
      folderName: 'Three',
      title: 'Three Sheets',
      sheetCount: 3,
    };
    render(<ProjectList scan={async () => [one, three]} />);

    await screen.findByText('One Sheet');
    expect(
      document.querySelector('[data-project-key="one"] .project-card-meta')?.textContent,
    ).toContain('1 sheet');
    expect(
      document.querySelector('[data-project-key="one"] .project-card-meta')?.textContent,
    ).not.toContain('1 sheets');
    expect(
      document.querySelector('[data-project-key="three"] .project-card-meta')?.textContent,
    ).toContain('3 sheets');
  });

  describe('cardTimeLabel', () => {
    it('the same day renders the clock label', () => {
      const now = new Date(2026, 8, 24, 14, 5);
      const sameDay = new Date(2026, 8, 24, 9, 0).getTime();
      expect(cardTimeLabel(sameDay, now)).toBe('9:00 AM');
    });

    it('another day renders a short date', () => {
      const now = new Date(2026, 8, 24, 14, 5);
      const earlier = new Date(2026, 8, 20, 9, 0).getTime();
      expect(cardTimeLabel(earlier, now)).toBe('Sep 20');
    });

    it('0 renders an empty string', () => {
      expect(cardTimeLabel(0)).toBe('');
    });
  });

  it('a loadCover resolving a Blob renders the cover image, and unmount revokes its URL', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:cover-1');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    try {
      const loadCover = vi.fn(async () => new Blob(['x']));
      const { unmount } = render(<ProjectList scan={async () => [solo]} loadCover={loadCover} />);

      const img = await waitFor(() => {
        const found = document.querySelector('.project-card-cover');
        if (!found) throw new Error('cover image not rendered');
        return found as HTMLImageElement;
      });
      expect(img.getAttribute('src')).toBe('blob:cover-1');
      expect(loadCover).toHaveBeenCalledWith('Elm Street');

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1');
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe('a lapsed projects-folder grant (the relaunch that looked like a lost setting)', () => {
  // After a relaunch the saved folder HANDLE is intact but its grant is not (§5.2), so the scan
  // throws. That used to render the EMPTY state — Home looked as if the folder had never been
  // chosen, and the owner re-picked it in Settings every time. It is now named, with its fix.
  const notAllowed = () => Promise.reject(new DOMException('no grant', 'NotAllowedError'));

  it('`prompt`: names the lapse, hides the misleading empty state, and «Re-authorize» rescans', async () => {
    let granted = false;
    const access = {
      query: vi.fn(async () => (granted ? ('granted' as const) : ('prompt' as const))),
      request: vi.fn(async () => {
        granted = true;
        return true;
      }),
      repick: vi.fn(async () => {}),
    };
    const scan = vi.fn(() => (granted ? Promise.resolve([solo]) : notAllowed()));
    render(<ProjectList scan={scan} access={access} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(STRINGS.errors.folderPermissionExpired);
    expect(screen.queryByText(STRINGS.home.emptyHeadline)).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: STRINGS.errors.reAuthorize }));

    await waitFor(() => expect(screen.getByText('Elm Street Footings')).toBeTruthy());
    expect(access.request).toHaveBeenCalledTimes(1);
    expect(access.repick).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('`denied`: offers «Re-pick folder» (a denied grant cannot be re-asked for)', async () => {
    let picked = false;
    const access = {
      query: vi.fn(async () => (picked ? ('granted' as const) : ('denied' as const))),
      request: vi.fn(async () => false),
      repick: vi.fn(async () => {
        picked = true;
      }),
    };
    const scan = vi.fn(() => (picked ? Promise.resolve([solo]) : notAllowed()));
    render(<ProjectList scan={scan} access={access} />);

    await userEvent.setup().click(await screen.findByRole('button', { name: STRINGS.storage.rePickFolder }));

    await waitFor(() => expect(screen.getByText('Elm Street Footings')).toBeTruthy());
    expect(access.repick).toHaveBeenCalledTimes(1);
    expect(access.request).not.toHaveBeenCalled();
  });

  it('a refused prompt that the browser now reports `denied` switches to «Re-pick folder»', async () => {
    let refused = false;
    const access = {
      query: vi.fn(async () => (refused ? ('denied' as const) : ('prompt' as const))),
      request: vi.fn(async () => {
        refused = true;
        return false;
      }),
      repick: vi.fn(async () => {}),
    };
    render(<ProjectList scan={notAllowed} access={access} />);

    await userEvent.setup().click(await screen.findByRole('button', { name: STRINGS.errors.reAuthorize }));

    expect(await screen.findByRole('button', { name: STRINGS.storage.rePickFolder })).toBeTruthy();
  });

  it('a held grant shows no banner', async () => {
    const access = {
      query: vi.fn(async () => 'granted' as const),
      request: vi.fn(async () => true),
      repick: vi.fn(async () => {}),
    };
    render(<ProjectList scan={async () => [solo]} access={access} />);
    await screen.findByText('Elm Street Footings');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
