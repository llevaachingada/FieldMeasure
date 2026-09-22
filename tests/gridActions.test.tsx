/**
 * `tests/gridActions.test.tsx` — the ROUTE-LEVEL proof that the grid's five new card actions
 * actually **write through the real shell** (independent review F2, `ora-1`, session 22).
 *
 * The gap this closes is the one the previous wave's worst bug lived in. D114/F1 was a route
 * that emitted a toast nothing rendered; the pinned lesson was that the **wiring seam** — the
 * `App` handlers — is where this project's real defects appear, not inside any lane's module.
 * Every one of this wave's five actions has a tested storage half (`tests/sheetOps.test.ts`)
 * and a tested screen half (`tests/projectScreen.test.tsx`), and the layer BETWEEN them — the
 * shell handlers that re-read `project.json`, call the storage op and bump the refresh — had
 * no test at all. So this file mounts the real `App`, walks Home → the sheets grid, and drives
 * each action through the DOM, asserting the bytes that land on the fake disk.
 *
 * Only the editor shell (Konva needs a canvas) and the image normalizer (canvas work) are
 * stubbed; the grid, the menus, the dialogs, the routing, the toast host and every `fs` write
 * are real.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const harness = vi.hoisted(() => ({
  root: undefined as unknown as FileSystemDirectoryHandle,
  /** What the stubbed normalizer returns; each test picks its dimensions. */
  photo: { blob: new Blob(['NEW-PHOTO']), width: 4096, height: 3072 } as {
    blob: Blob;
    width: number;
    height: number;
  },
  /** Test 6 only: make the markup clear fail (§13.3's "another app has it open" case). */
  lockMarkup: false,
}));

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

// `normalizeImage` is canvas work. The shell's DECISION (identical dims → silent swap,
// different dims → the warned dialog) is what this file is about, so the bytes it returns are
// controlled here; that the real normalizer produces them is proven in its own browser suite.
vi.mock('@/media/normalizeImage', () => ({
  normalizeImage: async () => harness.photo,
}));

import App from '../src/App';
import { initStore } from '../src/fs/projectStore';
import type { ProjectFile } from '../src/domain/schema';
import { STRINGS, t } from '../src/ui/strings';
import { FakeDir, asDir, createFakeLocks, installFakeNavigator, validProjectFile } from './fakes/fsa';

const FOLDER = 'Riverside';
const SHEETS = ['sheet-1', 'sheet-2'] as const;

let root: FakeDir;
let restoreNavigator: (() => void) | null = null;

function project(): ProjectFile {
  return JSON.parse(root.textAt(`${FOLDER}/project.json`)) as ProjectFile;
}

function row(id: string): ProjectFile['sheets'][number] {
  const found = project().sheets.find((s) => s.id === id);
  if (!found) throw new Error(`no row for ${id}`);
  return found;
}

/** In sortIndex order — what the grid actually shows (§20.6). */
function orderedIds(): string[] {
  return [...project().sheets].sort((a, b) => a.sortIndex - b.sortIndex).map((s) => s.id);
}

async function setup(): Promise<void> {
  root = new FakeDir('root', {
    beforeMove: (_file, name) => {
      if (harness.lockMarkup && name === 'markup.json') {
        throw new DOMException('locked by another app', 'NoModificationAllowedError');
      }
    },
  });
  root.putFile(
    `${FOLDER}/project.json`,
    JSON.stringify(validProjectFile({ id: 'p1', title: 'Riverside', sheetCount: 2 })),
  );
  for (const id of SHEETS) {
    root.putFile(`${FOLDER}/sheets/${id}/photo.jpg`, `PHOTO-${id}`);
    root.putFile(`${FOLDER}/sheets/${id}/thumb.jpg`, `THUMB-${id}`);
    root.putFile(`${FOLDER}/sheets/${id}/markup.json`, JSON.stringify({ schemaVersion: 1, sheetId: id, objects: [] }));
  }
  harness.root = asDir(root);
  harness.lockMarkup = false;
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

/** Home → this project's sheets grid. Returns a user bound to the (real) timers. */
async function openGrid(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Riverside' }));
  // The grid is on screen (its primary add tile is the marker) and the editor is not.
  await screen.findByRole('button', { name: STRINGS.project.addTakePhoto });
  expect(screen.queryByTestId('editor-layout-stub')).toBeNull();
  return user;
}

/** Open a card's ⋯ menu and click one item by its accessible name. */
async function cardMenu(
  user: ReturnType<typeof userEvent.setup>,
  sheetId: string,
  itemName: string,
): Promise<void> {
  await user.click(screen.getByTestId(`sheet-card-menu-${sheetId}`));
  await user.click(screen.getByRole('menuitem', { name: itemName }));
}

/** Feed the shell's hidden replace picker a file (jsdom has no DataTransfer). */
function pickReplaceFile(): void {
  const input = screen.getByLabelText(STRINGS.sheetMenu.replacePhoto) as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })],
    configurable: true,
  });
  fireEvent.change(input);
}

describe('the grid writes through the real shell (review F2)', () => {
  it('renames a sheet: the title reaches project.json and the folder is not touched', async () => {
    await setup();
    const user = await openGrid();

    await cardMenu(user, 'sheet-1', t(STRINGS.sheetMenu.renameNamed, { title: 'Sheet 01' }));
    const field = screen.getByLabelText(STRINGS.sheetMenu.renameLabel);
    await user.clear(field);
    await user.type(field, 'Front porch');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(row('sheet-1').title).toBe('Front porch'));
    // §20.6: names are labels, not indices — the on-disk folder is never renamed.
    expect(root.has(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe(true);
    // …and a rename is not a content change, so the meta line's time must not move.
    expect(row('sheet-1').updatedAt).toBe(validProjectFile().sheets[0].updatedAt);
  });

  it('reorders from the card menu and renumbers the file 10 × position (§20.6)', async () => {
    await setup();
    const user = await openGrid();
    expect(orderedIds()).toEqual(['sheet-1', 'sheet-2']);

    await cardMenu(user, 'sheet-1', STRINGS.sheetMenu.moveLater);

    await waitFor(() => expect(orderedIds()).toEqual(['sheet-2', 'sheet-1']));
    const sorted = [...project().sheets].sort((a, b) => a.sortIndex - b.sortIndex);
    expect(sorted.map((s) => s.sortIndex)).toEqual([10, 20]);
  });

  it('duplicates a sheet: a real folder copy plus a row, under the next `Sheet NN`', async () => {
    await setup();
    const user = await openGrid();

    await cardMenu(user, 'sheet-1', t(STRINGS.sheetMenu.duplicateNamed, { title: 'Sheet 01' }));

    await waitFor(() => expect(project().sheets).toHaveLength(3));
    const copy = project().sheets.find((s) => !SHEETS.includes(s.id as 'sheet-1'));
    expect(copy).toBeTruthy();
    // Byte-for-byte, and the copy is a live sheet (no `deletedAt`).
    expect(root.textAt(`${FOLDER}/sheets/${copy!.id}/photo.jpg`)).toBe('PHOTO-sheet-1');
    expect(root.textAt(`${FOLDER}/sheets/${copy!.id}/thumb.jpg`)).toBe('THUMB-sheet-1');
    expect(root.textAt(`${FOLDER}/sheets/${copy!.id}/markup.json`)).toBe(
      root.textAt(`${FOLDER}/sheets/sheet-1/markup.json`),
    );
    expect(copy!.deletedAt ?? null).toBeNull();
    // One naming convention: the next `Sheet NN` (§20.6), and the source is untouched.
    expect(copy!.title).toBe('Sheet 03');
    expect(row('sheet-1').title).toBe('Sheet 01');
  });

  it('replaces a photo of the same size silently: the bytes swap, no dialog, no stale thumbnail', async () => {
    await setup();
    const user = await openGrid();
    harness.photo = { blob: new Blob(['NEW-PHOTO']), width: 4096, height: 3072 };

    await cardMenu(user, 'sheet-1', t(STRINGS.sheetMenu.replaceNamed, { title: 'Sheet 01' }));
    pickReplaceFile();

    await waitFor(() => expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('NEW-PHOTO'));
    // §2.4's silent half: identical working-image dimensions, markup kept, no question asked.
    expect(screen.queryByTestId('sheet-replace-dialog')).toBeNull();
    expect(row('sheet-1').imageWidth).toBe(4096);
    // The cached composite was of the OLD photo: it must not survive to show it.
    expect(root.has(`${FOLDER}/sheets/sheet-1/thumb.jpg`)).toBe(false);
  });

  it('asks before a different-size replace, and `Keep markup` preserves the coordinates', async () => {
    await setup();
    const user = await openGrid();
    harness.photo = { blob: new Blob(['BIGGER-PHOTO']), width: 2048, height: 1536 };

    await cardMenu(user, 'sheet-1', t(STRINGS.sheetMenu.replaceNamed, { title: 'Sheet 01' }));
    pickReplaceFile();

    // The dialog appears and NOTHING has been written yet: the decision is the user's.
    expect(await screen.findByTestId('sheet-replace-dialog')).toBeTruthy();
    expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('PHOTO-sheet-1');

    await user.click(screen.getByRole('button', { name: STRINGS.project.replacePhotoKeep }));

    await waitFor(() => expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('BIGGER-PHOTO'));
    expect(row('sheet-1').imageWidth).toBe(2048);
    expect(row('sheet-1').imageHeight).toBe(1536);
    // No markup.json in the fixture has objects, so assert the file still parses as the
    // sheet's own markup rather than that it is empty: «keep» means untouched.
    expect(JSON.parse(root.textAt(`${FOLDER}/sheets/sheet-1/markup.json`)).sheetId).toBe('sheet-1');
  });

  it('says the markup was not removed when only that last step fails (review F1, through the shell)', async () => {
    await setup();
    harness.lockMarkup = true; // the clear will fail; the photo swap is unaffected
    const user = await openGrid();
    harness.photo = { blob: new Blob(['BIGGER-PHOTO']), width: 2048, height: 1536 };

    await cardMenu(user, 'sheet-1', t(STRINGS.sheetMenu.replaceNamed, { title: 'Sheet 01' }));
    pickReplaceFile();
    await screen.findByTestId('sheet-replace-dialog');

    // The hold-to-confirm is a real 600 ms timer, so wait it out rather than faking time.
    fireEvent.pointerDown(screen.getByTestId('sheet-replace-remove'));

    await waitFor(
      () => expect(root.textAt(`${FOLDER}/sheets/sheet-1/photo.jpg`)).toBe('BIGGER-PHOTO'),
      { timeout: 2000 },
    );
    // The honest line — NOT «Couldn't replace that photo», which would deny a swap that
    // happened. This is the inverse of the D110/D114 family and the reason for `ReplacePhotoResult`.
    const toast = await screen.findByTestId('toast');
    expect(toast.textContent).toContain(STRINGS.sheetMenu.markupNotRemoved);
    expect(toast.textContent).not.toContain(STRINGS.sheetMenu.replaceFailed);
  });
});
