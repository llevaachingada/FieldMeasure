/**
 * `tests/appGridReturn.test.tsx` — D137: the shell owns the open-project registry (jsdom).
 *
 * Root cause proved fixed here (plan §4, L1): before D137, only `SheetEditor`'s unmount
 * cleanup ever called `clearOpenProject`, and only its mount IIFE ever called
 * `registerOpenProject`. The grid's own load effect trusted whatever registration state
 * the editor happened to leave behind, so returning from the editor raced the editor's own
 * (unawaited) autosave flush and the grid saw «project … is not open in this tab» (review F2).
 *
 * What is proved here:
 *   - `App`'s project-load effect re-registers the full `${id}:${folderName}` runtime key
 *     EVERY time the grid loads — including a return trip from the editor — independent of
 *     whatever the editor's own lifecycle does;
 *   - the grid's `onBack` (→ Home) is the one place that ends the registration.
 *
 * `@/fs/projectStore` is mocked PARTIALLY: `registerOpenProject` / `clearOpenProject` /
 * `resolveOpenProjectDir` / `readProjectFile` are spies (the two resolvers are irrelevant to
 * this file, which only cares about the registry calls; the stubbed `ProjectScreen` never
 * reads their result). Every other export — `createProject`, `writeJsonAtomic`, `initStore`,
 * etc. — stays real, so the «New project» flow this file rides in on (identical to
 * `tests/appNewProject.test.tsx`) still writes to the fake FSA tree for real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const harness = vi.hoisted(() => ({
  root: undefined as unknown as FileSystemDirectoryHandle,
}));

// The app boots to Home when a root handle is persisted; supply the fake tree.
vi.mock('@/settings/projectsRoot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/settings/projectsRoot')>();
  return { ...actual, getProjectsRoot: async () => harness.root };
});

// The registry calls under test. Every other export (createProject, writeJsonAtomic,
// initStore, …) is the real implementation — only these four are spies.
vi.mock('@/fs/projectStore', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('../src/fs/projectStore')>)();
  return {
    ...actual,
    registerOpenProject: vi.fn(),
    clearOpenProject: vi.fn(),
    resolveOpenProjectDir: vi.fn(),
    readProjectFile: vi.fn(),
  };
});

// Partial: `ProjectList` (rendered for real on the Home route this file passes through)
// still needs the real `clockLabel` et al.
vi.mock('@/fs/projectSheets', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('../src/fs/projectSheets')>)();
  return { ...actual, listProjectSheets: vi.fn(async () => []) };
});

// The editor constructs a real Konva.Stage; stub it with a button that fires `onExit`, so
// this file can drive a "return to the grid" trip without mounting the canvas.
vi.mock('@/ui/EditorLayout', async () => {
  const React = await import('react');
  return {
    default: (props: { onExit?: () => void }) =>
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'editor-exit', onClick: () => props.onExit?.() },
        'exit editor',
      ),
  };
});

// The grid itself has its own behaviour tests (`tests/projectScreen.test.tsx`); this stub
// exposes only the two seams this file drives: opening a sheet (→ editor) and «back» (→ Home).
// Partial mock: «back» lands on the real Home route (`ProjectList`), which imports
// `sheetCountLabel` from this module, so every other export must stay real.
vi.mock('@/ui/ProjectScreen', async (orig) => {
  const React = await import('react');
  const actual = await (orig as () => Promise<typeof import('../src/ui/ProjectScreen')>)();
  return {
    ...actual,
    default: (props: { onOpenSheet?: (id: string) => void; onBack?: () => void }) =>
      React.createElement(
        'div',
        { 'data-testid': 'project-screen-stub' },
        React.createElement(
          'button',
          { type: 'button', onClick: () => props.onOpenSheet?.('s1') },
          'open sheet',
        ),
        React.createElement('button', { type: 'button', onClick: () => props.onBack?.() }, 'back to home'),
      ),
  };
});

import App from '../src/App';
import { clearOpenProject, initStore, registerOpenProject } from '../src/fs/projectStore';
import { STRINGS } from '../src/ui/strings';
import { FakeDir, asDir, createFakeLocks, installFakeNavigator, type FakeHooks } from './fakes/fsa';

let root: FakeDir;
let restoreNavigator: (() => void) | null = null;

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
  vi.mocked(registerOpenProject).mockClear();
  vi.mocked(clearOpenProject).mockClear();
});

/** Open the name pop-up from Home's button, type a name and confirm — lands on the grid. */
async function createAndOpenProject(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: STRINGS.home.newProject }));
  const field = await screen.findByRole('textbox', { name: STRINGS.home.projectNameLabel });
  await user.type(field, NAME);
  await user.click(screen.getByRole('button', { name: STRINGS.home.createProjectConfirm }));
  await screen.findByTestId('project-screen-stub');
}

describe('D137: the shell (App) owns open-project registration', () => {
  it('registers the full runtime key every time the grid loads, including a return from the editor', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await createAndOpenProject(user);

    const registerMock = vi.mocked(registerOpenProject);
    await waitFor(() => expect(registerMock.mock.calls.length).toBeGreaterThan(0));
    const [key, folderName] = registerMock.mock.calls[registerMock.mock.calls.length - 1]!;
    expect(key).toContain(':');
    expect(key.endsWith(`:${folderName}`)).toBe(true);
    const callsBeforeReturn = registerMock.mock.calls.length;

    // Grid → editor → (stubbed) exit → grid again. The re-load must re-register.
    await user.click(screen.getByRole('button', { name: 'open sheet' }));
    const exitButton = await screen.findByTestId('editor-exit');
    await user.click(exitButton);

    await screen.findByTestId('project-screen-stub');
    await waitFor(() => expect(registerMock.mock.calls.length).toBeGreaterThan(callsBeforeReturn));
    const lastCall = registerMock.mock.calls[registerMock.mock.calls.length - 1]!;
    expect(lastCall).toEqual([key, folderName]);
  });

  it('onBack (→ Home) clears the registration for the project that was open', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    await createAndOpenProject(user);

    const registerMock = vi.mocked(registerOpenProject);
    const [key] = registerMock.mock.calls[registerMock.mock.calls.length - 1]!;

    await user.click(screen.getByRole('button', { name: 'back to home' }));

    expect(vi.mocked(clearOpenProject)).toHaveBeenCalledWith(key);
  });
});
