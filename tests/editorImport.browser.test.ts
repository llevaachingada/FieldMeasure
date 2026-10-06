/**
 * D170: «Import file» from INSIDE the editor opens the new sheet properly.
 *
 * Before D170 the in-editor import only swapped the photo: the old sheet's marks stayed on
 * screen, the autosave target stayed on the OLD sheet, and every later edit was written into
 * the old sheet's markup.json (or, from an empty project, never saved at all).
 *
 * Browser project (real Konva stage, real createImageBitmap). Storage is mocked like
 * `editorController.browser.test.ts`; sheet `b` has a real PNG so it loads as `ready` and
 * autosave is armed for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import SheetEditor from '../src/ui/SheetEditor';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { readProjectFile, writeJsonAtomic } from '../src/fs/projectStore';
import type { MarkupScene } from '../src/editor/shapes/scene';

function sheet(id: string) {
  return {
    id,
    title: `Sheet ${id}`,
    folder: `sheets/${id}`,
    position: 10,
    imageWidth: 40,
    imageHeight: 30,
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

const project = {
  file: {
    schemaVersion: 1,
    project: { id: 'p', title: 'P', unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    sheets: [sheet('a')] as ReturnType<typeof sheet>[],
  },
};

let pngBlob: Blob;
async function makePng(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 30;
  c.getContext('2d')!.fillRect(0, 0, 40, 30);
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
}

const sheetDirFor = (id: string) => ({
  kind: 'directory',
  name: id,
  getFileHandle: async () => ({ getFile: async () => pngBlob }),
});

vi.mock('@/fs/projectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/fs/projectStore')>()),
  registerOpenProject: vi.fn(),
  resolveFieldMeasureDir: vi.fn(async () => {
    throw new DOMException('no .fieldmeasure dir in this suite', 'NotFoundError');
  }),
  clearOpenProject: vi.fn(),
  acquireWriterLease: vi.fn(async () => ({ held: true, release: vi.fn() })),
  openProjectChannel: vi.fn(() => null),
  resolveOpenProjectDir: vi.fn(async () => ({ kind: 'directory', name: 'f' })),
  cleanStaleTmp: vi.fn(async () => undefined),
  readProjectFile: vi.fn(async () => structuredClone(project.file)),
  isPhotoDamaged: vi.fn(async () => false),
  resolveSheetDir: vi.fn(async (_dir: unknown, id: string) => sheetDirFor(id)),
  resolveAssetsDir: vi.fn(async () => ({ kind: 'directory', name: 'assets' })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  // Sheet `a` already has a dimension; the new sheet `b` has none.
  readSheetMarkup: vi.fn(async (_dir: unknown, id: string) => ({
    schemaVersion: 1,
    sheetId: id,
    objects:
      id === 'a'
        ? [
            {
              id: 'dim-a',
              type: 'dimension',
              geometry: { kind: 'dimension', a: { x: 1, y: 1 }, b: { x: 20, y: 1 }, offsetMu: 0 },
              valueMm: 304.8,
              enteredText: '1',
              style: { strokeColor: '#ff0000', strokeWidthMu: 4, textSizeMu: 18 },
              locked: false,
              visible: true,
              name: null,
              z: 0,
            },
          ]
        : [],
  })),
}));

vi.mock('@/fs/sheetIntake', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/fs/sheetIntake')>()),
  addSheetFromPhoto: vi.fn(async () => {
    const added = sheet('b');
    project.file = { ...project.file, sheets: [...project.file.sheets, added] };
    return { sheet: added, projectFile: structuredClone(project.file), sheetDir: sheetDirFor('b') };
  }),
}));
vi.mock('@/media/exif', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/media/exif')>()),
  readExifInfo: vi.fn(async () => ({ captureTime: null })),
}));
vi.mock('@/media/normalizeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/media/normalizeImage')>()),
  normalizeImage: vi.fn(async () => ({ blob: pngBlob, width: 40, height: 30 })),
}));

beforeEach(async () => {
  pngBlob = await makePng();
  project.file = { ...project.file, sheets: [sheet('a')] };
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  vi.mocked(readProjectFile).mockClear();
  vi.mocked(writeJsonAtomic).mockClear();
});

afterEach(() => cleanup());

function markupWrites(): Array<{ sheetId: string }> {
  return vi
    .mocked(writeJsonAtomic)
    .mock.calls.filter((c) => c[1] === 'markup.json')
    .map((c) => c[2] as { sheetId: string });
}

describe('D170: «Import file» inside the editor', () => {
  it('opens the new sheet: old marks leave the canvas and later edits save to the NEW sheet', async () => {
    let scene: MarkupScene | null = null;
    const onSheetAdded = vi.fn();
    const view = render(
      createElement(SheetEditor, {
        projectId: 'p:f',
        folderName: 'f',
        onExit: () => {},
        activeTool: 'select',
        sheetId: 'a',
        onSheetAdded,
        onSceneReady: (api) => {
          scene = api.scene;
        },
      }),
    );
    // Sheet a loads with its one dimension.
    await waitFor(() => expect(scene?.list()).toHaveLength(1));

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File([pngBlob], 'site.png', { type: 'image/png' }));
    Object.defineProperty(input, 'files', { configurable: true, value: dt.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(onSheetAdded).toHaveBeenCalledWith('b'));
    // The old sheet's mark is gone from the canvas (it belongs to sheet a).
    await waitFor(() => expect(scene!.list()).toHaveLength(0));

    vi.mocked(writeJsonAtomic).mockClear();
    scene!.addDimension({ x: 2, y: 2 }, { x: 30, y: 2 });

    // The edit autosaves into sheet b's markup.json, and never into sheet a's.
    await waitFor(() => expect(markupWrites().length).toBeGreaterThan(0), { timeout: 3000 });
    expect(markupWrites().every((m) => m.sheetId === 'b')).toBe(true);
  });
});
