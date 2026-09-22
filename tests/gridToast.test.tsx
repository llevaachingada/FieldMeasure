/**
 * tests/gridToast.test.tsx — the ROUTE-LEVEL proof that a toast emitted while the sheets grid is
 * on screen is actually **rendered** (independent review F1, executed).
 *
 * The bug this pins: `ToastHost` was mounted only on the Home route and inside `EditorLayout`, so
 * the Project route rendered **none**. Every grid toast — including «Sheet deleted · Undo», the
 * whole point of the trash slice — was emitted on the bus and swallowed, so the recoverable-delete
 * promise was false in production. The lane's own 28 tests asserted the **bus**, which is exactly
 * why they could not see it: a test that checks what the code emitted cannot notice that nothing
 * rendered it.
 *
 * Only the editor is stubbed (Konva needs a canvas); the grid, the toast host and the real `App`
 * routing are exercised for real against the fake File System Access tree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const harness = vi.hoisted(() => ({ root: undefined as unknown as FileSystemDirectoryHandle }));

// The app boots to Home when a projects-root handle is persisted; supply the fake tree.
vi.mock('@/settings/projectsRoot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/settings/projectsRoot')>();
  return { ...actual, getProjectsRoot: async () => harness.root };
});

// The editor constructs a real Konva.Stage; this file is about the grid's route.
vi.mock('@/ui/EditorLayout', async () => {
  const React = await import('react');
  return { default: () => React.createElement('div', { 'data-testid': 'editor-layout-stub' }) };
});

import App from '../src/App';
import { initStore } from '../src/fs/projectStore';
import { emitToast } from '../src/editor/session';
import { STRINGS } from '../src/ui/strings';
import { FakeDir, asDir, createFakeLocks, installFakeNavigator, validProjectFile } from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreNavigator?.();
  restoreNavigator = null;
});

async function setup(): Promise<void> {
  const root = new FakeDir('root');
  root.putFile(
    'Riverside/project.json',
    JSON.stringify(validProjectFile({ id: 'p1', title: 'Riverside' })),
  );
  harness.root = asDir(root);
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
}

describe('the sheets grid renders the toasts it emits (review F1)', () => {
  it('renders a toast emitted while the Project screen is mounted', async () => {
    await setup();
    const user = userEvent.setup();
    render(<App />);

    // Home → this project's sheets grid (the card is labelled by the project title).
    await user.click(await screen.findByRole('button', { name: 'Riverside' }));
    // The grid is on screen: its primary add tile is the marker.
    expect(await screen.findByRole('button', { name: STRINGS.project.addTakePhoto })).toBeTruthy();
    // …and the editor is NOT (so this is genuinely the grid's route).
    expect(screen.queryByTestId('editor-layout-stub')).toBeNull();

    // A toast emitted on THIS route must be rendered, not swallowed.
    emitToast({
      text: STRINGS.toasts.sheetDeleted,
      action: { label: STRINGS.editor.undo, run: () => undefined },
    });

    const toast = await screen.findByTestId('toast');
    expect(toast.textContent).toContain(STRINGS.toasts.sheetDeleted);
    // The action half matters as much as the text: it is what makes the 10 s undo window real.
    expect(screen.getByTestId('toast-action')).toBeTruthy();
  });

  it('renders a toast on the Home route too (the control this bug hid behind)', async () => {
    await setup();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Riverside' })).toBeTruthy());
    emitToast({ text: STRINGS.errors.projectUnavailable, urgent: true });

    expect(await screen.findByTestId('toast')).toBeTruthy();
  });
});
