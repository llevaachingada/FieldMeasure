/**
 * tests/appNewProject.test.tsx — the WIRING of Home's «New project» control.
 *
 * The storage half is proved in `tests/createProject.test.ts`; this file drives the
 * real `App` handler in jsdom and proves the human-visible bug is gone:
 *   - clicking «New project» creates `root/New project/project.json` and enters the
 *     (stubbed) editor for exactly that folder;
 *   - a double-tap does not mint two projects;
 *   - a write failure stays on Home and surfaces nothing (slice 1.10 owns errors).
 *
 * Only the canvas shell is stubbed (Konva needs a real canvas; jsdom has none) and
 * the persisted root is provided through the fake File System Access tree — the same
 * approach as `editorShell.test.tsx` / `cameraFlow.test.tsx`.
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
    const editor = await screen.findByTestId('editor-layout-stub');
    expect(editor.getAttribute('data-folder-name')).toBe(BASE);

    // «New project» lands on the CAMERA, not a nearly-empty editor: the capture
    // overlay mounts over the editor. jsdom has no `getUserMedia`, so `CameraFlow`
    // renders its camera-unavailable panel — that surface's presence is the proof
    // the capture flow was launched (it is the only source of this copy here).
    expect(await screen.findByText(STRINGS.capture.embeddedFallback)).toBeTruthy();

    const written = JSON.parse(root.textAt(`${BASE}/project.json`)) as {
      project: { id: string; title: string };
      sheets: unknown[];
    };
    // D51: the editor is handed `id:folderName`, not the bare id.
    expect(editor.getAttribute('data-project-id')).toBe(`${written.project.id}:${BASE}`);
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
    expect(await screen.findByTestId('editor-layout-stub')).toBeTruthy();
  });

  it('stays on Home and surfaces nothing when creation fails (slice 1.10 owns errors)', async () => {
    await setup({
      beforeWrite: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    const user = userEvent.setup();
    render(<App />);

    const newProject = await screen.findByRole('button', { name: BASE });
    await user.click(newProject);

    // The atomic write failed, so the tmp survives and the editor was never entered.
    await waitFor(() => expect(root.childDir(BASE).has('project.json.tmp')).toBe(true));
    expect(screen.queryByTestId('editor-layout-stub')).toBeNull();
    // Nothing was created, so the capture overlay was never launched either.
    expect(screen.queryByText(STRINGS.capture.embeddedFallback)).toBeNull();
    expect(screen.getByRole('button', { name: BASE })).toBeTruthy();
  });
});
