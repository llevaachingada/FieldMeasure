/**
 * tests/appNewProject.test.tsx — the WIRING of Home's «New project» control.
 *
 * The storage half is proved in `tests/createProject.test.ts`; this file drives the
 * real `App` handler in jsdom and proves the human-visible bug is gone:
 *   - clicking «New project» creates `root/New project/project.json` and lands on the
 *     **Project screen** (the sheets grid, UI §11.2) with the capture flow launched;
 *   - a double-tap does not mint two projects;
 *   - a write failure stays on Home and surfaces an honest toast (slice 1.10 closed D103).
 *
 * Only the canvas shell and the grid are stubbed (both draw real surfaces this file is not
 * testing — the grid has its own 20 jsdom tests) — and the persisted root is provided
 * through the fake File System Access tree: the same approach as `editorShell.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';

const harness = vi.hoisted(() => ({
  root: undefined as unknown as FileSystemDirectoryHandle,
}));

// The app boots to Home when a root handle is persisted; supply the fake tree.
vi.mock('@/settings/projectsRoot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/settings/projectsRoot')>();
  return { ...actual, getProjectsRoot: async () => harness.root };
});

// The editor constructs a real Konva.Stage; stub the chrome-independent seam.
vi.mock('@/ui/EditorLayout', async () => {
  const React = await import('react');
  return {
    default: (props: { projectId?: string; folderName?: string }) =>
      React.createElement('div', {
        'data-testid': 'editor-layout-stub',
        'data-project-id': props.projectId,
        'data-folder-name': props.folderName,
      }),
  };
});

/**
 * The grid is the landing after «New project», so it is stubbed here too — this file checks
 * the WIRING, and `tests/projectScreen.test.tsx` owns its behaviour. The stub exposes the two
 * props that prove the wiring: the title it was handed, and its state. **`state === 'empty'`
 * is the transitive D51 proof**: the loader resolves the project through the open-project
 * registry, which only matches when `App` registered the full `${id}:${folderName}` key.
 */
vi.mock('@/ui/ProjectScreen', async () => {
  const React = await import('react');
  return {
    default: (props: { projectTitle?: string; state?: string; sheetCount?: number }) =>
      React.createElement('div', {
        'data-testid': 'project-screen-stub',
        'data-title': props.projectTitle,
        'data-state': props.state,
        'data-sheet-count': String(props.sheetCount ?? ''),
      }),
  };
});

import App from '../src/App';
import { initStore } from '../src/fs/projectStore';
import { STRINGS } from '../src/ui/strings';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  type FakeHooks,
} from './fakes/fsa';

let root: FakeDir;
let restoreNavigator: (() => void) | null = null;

const BASE = STRINGS.home.newProject;

async function setup(hooks: FakeHooks = {}): Promise<void> {
  root = new FakeDir('root', hooks);
  harness.root = asDir(root);
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
}

afterEach(() => {
  cleanup();
  restoreNavigator?.();
  restoreNavigator = null;
});

function projectDirs(): string[] {
  return [...root.children.values()]
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => entry.name);
}

describe('Home «New project» wiring', () => {
  it('creates the folder and opens its editor', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    const newProject = await screen.findByRole('button', { name: BASE });
    await user.click(newProject);

    await waitFor(() => expect(root.childDir(BASE).has('project.json')).toBe(true));

    // «New project» now lands on the PROJECT SCREEN — the sheets grid (UI §11.2) — with the
    // capture overlay launched over it, which is the owner's D102 flow.
    const grid = await screen.findByTestId('project-screen-stub');
    expect(grid.getAttribute('data-title')).toBe(BASE);
    // `empty` is the transitive D51 proof: the grid's loader resolves the project through the
    // open-project registry, which only matches when App registered `${id}:${folderName}`.
    await waitFor(() => expect(grid.getAttribute('data-state')).toBe('empty'));

    // The capture flow was launched: jsdom has no `getUserMedia`, so `CameraFlow` renders its
    // camera-unavailable panel — that surface's presence is the proof (it is the only source
    // of this copy here).
    expect(await screen.findByText(STRINGS.capture.embeddedFallback)).toBeTruthy();

    const written = JSON.parse(root.textAt(`${BASE}/project.json`)) as {
      project: { id: string; title: string };
      sheets: unknown[];
    };
    expect(written.project.title).toBe(BASE);
    expect(written.sheets).toEqual([]);
    expect(root.tmpPaths()).toEqual([]);
    expect(projectDirs()).toEqual([BASE]);
  });

  it('a double-tap creates only one project', async () => {
    await setup();
    render(<App />);
    const newProject = await screen.findByRole('button', { name: BASE });

    // Two synchronous dispatches: the second lands while the first create is in flight.
    fireEvent.click(newProject);
    fireEvent.click(newProject);

    await waitFor(() => expect(root.childDir(BASE).has('project.json')).toBe(true));
    expect(projectDirs()).toEqual([BASE]);
    expect(await screen.findByTestId('project-screen-stub')).toBeTruthy();
  });

  it('stays on Home and surfaces the failure in a toast (slice 1.10 closes D103)', async () => {
    await setup({
      beforeWrite: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    const user = userEvent.setup();
    render(<App />);

    const newProject = await screen.findByRole('button', { name: BASE });
    await user.click(newProject);

    // The atomic write failed, so the tmp survives and neither surface was entered.
    await waitFor(() => expect(root.childDir(BASE).has('project.json.tmp')).toBe(true));
    expect(screen.queryByTestId('editor-layout-stub')).toBeNull();
    expect(screen.queryByTestId('project-screen-stub')).toBeNull();
    // Nothing was created, so the capture overlay was never launched either.
    expect(screen.queryByText(STRINGS.capture.embeddedFallback)).toBeNull();
    expect(screen.getByRole('button', { name: BASE })).toBeTruthy();
    // The failure is now visible — an honest, urgent toast (never silent again).
    expect(await screen.findByText(STRINGS.errors.projectUnavailable)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.errors.projectUnavailable);
  });
});
