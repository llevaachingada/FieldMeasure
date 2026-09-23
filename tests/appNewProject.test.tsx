/**
 * tests/appNewProject.test.tsx — the WIRING of Home's «New project» control.
 *
 * The storage half is proved in `tests/createProject.test.ts`; this file drives the
 * real `App` handler in jsdom. D135: the button no longer creates anything by itself — it
 * opens a pop-up that asks for the project's name, and the create runs on confirm:
 *   - nothing is created until a non-blank name is confirmed, and Cancel creates nothing;
 *   - confirming creates `root/<name>/project.json` and lands on the **Project screen**
 *     (the sheets grid, UI §11.2) with the capture flow launched;
 *   - the folder name is sanitized while the title keeps exactly what was typed;
 *   - a double-tap does not mint two projects;
 *   - a write failure stays on Home, keeps the pop-up (and the typed name) and toasts.
 *
 * Only the canvas shell and the grid are stubbed (both draw real surfaces this file is not
 * testing — the grid has its own 20 jsdom tests) — and the persisted root is provided
 * through the fake File System Access tree: the same approach as `editorShell.test.tsx`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
const NAME = 'Smith kitchen';

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

/** Open the name pop-up from Home's button and type a name into it. */
async function openAndType(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(await screen.findByRole('button', { name: BASE }));
  const field = await screen.findByRole('textbox', { name: STRINGS.home.projectNameLabel });
  if (name) await user.type(field, name);
}

const createButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: STRINGS.home.createProjectConfirm }) as HTMLButtonElement;

describe('Home «New project» wiring (name pop-up, D135)', () => {
  it('asks for a name first, and creates nothing until it is confirmed', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, '');
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Nothing on disk yet, and Create is disabled for an empty name.
    expect(projectDirs()).toEqual([]);
    expect(createButton().disabled).toBe(true);

    await user.type(screen.getByRole('textbox', { name: STRINGS.home.projectNameLabel }), '   ');
    expect(createButton().disabled).toBe(true); // whitespace is not a name
    expect(projectDirs()).toEqual([]);
  });

  it('creates the folder from the typed name and opens the project screen with the camera', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, NAME);
    await user.click(createButton());

    await waitFor(() => expect(root.childDir(NAME).has('project.json')).toBe(true));
    const grid = await screen.findByTestId('project-screen-stub');
    expect(grid.getAttribute('data-title')).toBe(NAME);
    // `empty` is the transitive D51 proof (the loader resolves through the registry key).
    await waitFor(() => expect(grid.getAttribute('data-state')).toBe('empty'));
    // The capture flow was launched (jsdom has no getUserMedia, so its fallback panel shows).
    expect(await screen.findByText(STRINGS.capture.embeddedFallback)).toBeTruthy();
    // The dialog closed.
    expect(screen.queryByRole('dialog')).toBeNull();

    const written = JSON.parse(root.textAt(`${NAME}/project.json`)) as {
      project: { title: string };
      sheets: unknown[];
    };
    expect(written.project.title).toBe(NAME);
    expect(written.sheets).toEqual([]);
    expect(root.tmpPaths()).toEqual([]);
    expect(projectDirs()).toEqual([NAME]);
  });

  it('keeps the typed title but makes the folder name safe', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    // userEvent gives `<` and `/` special meaning in some contexts; a change event is the honest path.
    await user.click(await screen.findByRole('button', { name: BASE }));
    const field = await screen.findByRole('textbox', { name: STRINGS.home.projectNameLabel });
    fireEvent.change(field, { target: { value: 'Job: 12/4 <north>' } });
    await user.click(createButton());

    // sanitizeToken strips the illegal characters : / < > (it keeps the spaces and digits).
    await waitFor(() => expect(projectDirs()).toEqual(['Job 124 north']));
    const written = JSON.parse(root.textAt('Job 124 north/project.json')) as { project: { title: string } };
    expect(written.project.title).toBe('Job: 12/4 <north>');
  });

  it('Cancel closes the pop-up and creates nothing', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, NAME);
    await user.click(screen.getByRole('button', { name: STRINGS.editor.cancel }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(projectDirs()).toEqual([]);
  });

  it('Escape closes the pop-up too', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, NAME);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(projectDirs()).toEqual([]);
  });

  it('a double-tap on Create makes only one project', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, NAME);
    const create = createButton();
    // Two synchronous dispatches: the second lands while the first create is in flight.
    fireEvent.click(create);
    fireEvent.click(create);

    await waitFor(() => expect(root.childDir(NAME).has('project.json')).toBe(true));
    expect(projectDirs()).toEqual([NAME]);
    expect(await screen.findByTestId('project-screen-stub')).toBeTruthy();
  });

  it('a write failure keeps the pop-up open, stays on Home and shows a toast (slice 1.10 closes D103)', async () => {
    await setup({
      beforeWrite: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await openAndType(user, NAME);
    await user.click(createButton());

    // The atomic write failed, so the tmp survives and neither surface was entered.
    await waitFor(() => expect(root.childDir(NAME).has('project.json.tmp')).toBe(true));
    expect(screen.queryByTestId('editor-layout-stub')).toBeNull();
    expect(screen.queryByTestId('project-screen-stub')).toBeNull();
    // Nothing was created, so the capture overlay was never launched either.
    expect(screen.queryByText(STRINGS.capture.embeddedFallback)).toBeNull();
    // The failure is visible - an honest, urgent toast - and the typed name is still there to retry.
    expect(await screen.findByText(STRINGS.errors.projectUnavailable)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    const field = screen.getByRole('textbox', { name: STRINGS.home.projectNameLabel }) as HTMLInputElement;
    expect(field.value).toBe(NAME);
  });
});
