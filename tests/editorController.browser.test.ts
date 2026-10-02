/**
 * R6 / D145: a sheet change is `EditorController.loadSheet` on the live canvas, not a remount.
 *
 * Browser project (a real Konva.Stage). Storage is mocked the same way the dimension suite mocks
 * it; the sheets have no photos, so each load settles as `damaged`, which is fine: what is pinned
 * here is WHICH objects survive the switch, not the photo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { readProjectFile } from '../src/fs/projectStore';

function sheet(id: string) {
  return {
    id,
    title: `Sheet ${id}`,
    folder: `sheets/${id}`,
    position: 10,
    imageWidth: 400,
    imageHeight: 300,
    createdAt: '2026-09-25T00:00:00.000Z',
  };
}

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
  readProjectFile: vi.fn(async () => ({
    schemaVersion: 1,
    project: {
      id: 'p',
      title: 'P',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: [sheet('a'), sheet('b')],
  })),
  // No photo on disk: every load reports `damaged` without touching createImageBitmap.
  isPhotoDamaged: vi.fn(async () => true),
  resolveSheetDir: vi.fn(async () => ({ kind: 'directory', name: 'sheet' })),
  resolveAssetsDir: vi.fn(async () => ({ kind: 'directory', name: 'assets' })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  readSheetMarkup: vi.fn(async () => ({ schemaVersion: 1, sheetId: 's', objects: [] })),
}));

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  vi.mocked(readProjectFile).mockClear();
});

afterEach(() => {
  cleanup();
});

const props = { projectId: 'p:f', folderName: 'f', onExit: () => {}, activeTool: 'select' as const };

describe('D145: switching sheets keeps the canvas', () => {
  it('a new sheetId re-reads the project and keeps the SAME Konva stage', async () => {
    const view = render(createElement(SheetEditor, { ...props, sheetId: 'a' }));
    await waitFor(() => expect(vi.mocked(readProjectFile)).toHaveBeenCalledTimes(1));
    const stagesBefore = Konva.stages.length;
    const stage = Konva.stages[stagesBefore - 1];
    // Let the first load settle before switching.
    await new Promise((r) => setTimeout(r, 20));

    view.rerender(createElement(SheetEditor, { ...props, sheetId: 'b' }));
    // The switch re-reads project.json (a capture may have just written the new sheet)...
    await waitFor(() => expect(vi.mocked(readProjectFile)).toHaveBeenCalledTimes(2));
    // ...on the same stage: no new stage was created and the old one was not destroyed.
    expect(Konva.stages.length).toBe(stagesBefore);
    expect(Konva.stages[stagesBefore - 1]).toBe(stage);
  });

  it('re-requesting the sheet that is already loaded does nothing', async () => {
    const view = render(createElement(SheetEditor, { ...props, sheetId: 'a' }));
    await waitFor(() => expect(vi.mocked(readProjectFile)).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    view.rerender(createElement(SheetEditor, { ...props, sheetId: 'a', activeTool: 'pan' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(readProjectFile)).toHaveBeenCalledTimes(1);
  });
});
