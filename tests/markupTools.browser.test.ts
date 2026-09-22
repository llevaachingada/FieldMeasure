/**
 * tests/markupTools.browser.test.ts — slice 1.6 WIRING gate (real canvas).
 *
 * The pure decisions are unit-tested in `tests/markupTools.test.ts`; this file proves
 * the SheetEditor dispatch actually calls them: Line commits on the second tap, Polygon
 * closes on `✓ Done`, and the Angle sheet opens on the same 450 ms settle rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { STRINGS } from '../src/ui/strings';
import { subscribeToast, resetToastBus, editorSession } from '../src/editor/session';

vi.mock('@/fs/projectStore', () => ({
  registerOpenProject: vi.fn(),
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
    sheets: [],
  })),
  isPhotoDamaged: vi.fn(async () => false),
  resolveSheetDir: vi.fn(async () => ({ kind: 'directory', name: 'sheet' })),
  resolveAssetsDir: vi.fn(async () => ({ kind: 'directory', name: 'assets' })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  readSheetMarkup: vi.fn(async () => ({ schemaVersion: 1, sheetId: 's', objects: [] })),
  StorageWriteError: class StorageWriteError extends Error {
    kind: string;
    constructor(kind: string, cause?: unknown) {
      super('write failed');
      this.kind = kind;
      this.cause = cause;
    }
  },
}));

function pointer(type: string, target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 1,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

async function mountEditor(): Promise<{
  host: HTMLDivElement;
  stage: Konva.Stage;
  at: { x: number; y: number };
}> {
  const view = render(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool: 'place',
    }),
  );
  await screen.findByText(STRINGS.project.noSheetsEmpty);
  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  host.style.width = '800px';
  host.style.height = '600px';
  // Let the ResizeObserver resize the Konva stage before any hit-testing (the hit canvas
  // is only as large as the stage).
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const rect = host.getBoundingClientRect();
  const stage = Konva.stages[Konva.stages.length - 1];
  return { host, stage, at: { x: rect.left + 300, y: rect.top + 200 } };
}

function tap(host: HTMLDivElement, p: { x: number; y: number }): void {
  pointer('pointerdown', host, p.x, p.y);
  pointer('pointerup', host, p.x, p.y);
}

function markupChildren(stage: Konva.Stage): Konva.Node[] {
  return stage.getLayers()[2].getChildren();
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetToastBus();
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

describe('slice 1.6 tool wiring through SheetEditor', () => {
  it('Line commits on the second tap', async () => {
    useEditorStore.getState().setActiveTool('line');
    const { host, stage, at } = await mountEditor();
    tap(host, at);
    tap(host, { x: at.x + 120, y: at.y + 60 });
    expect(markupChildren(stage)).toHaveLength(1);
    expect(markupChildren(stage)[0].getAttr('kind')).toBe('line');
  });

  it('Rectangle commits on the second tap and carries W×H geometry', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { host, stage, at } = await mountEditor();
    tap(host, at);
    tap(host, { x: at.x + 100, y: at.y + 80 });
    const group = markupChildren(stage)[0] as Konva.Group;
    expect(group.getAttr('kind')).toBe('rect');
    const rect = group.findOne<Konva.Rect>('Rect')!;
    expect(rect.width()).toBeCloseTo(100, 0);
    expect(rect.height()).toBeCloseTo(80, 0);
  });

  it('Polygon closes on ✓ Done after three taps', async () => {
    useEditorStore.getState().setActiveTool('polygon');
    const { host, stage, at } = await mountEditor();
    tap(host, at);
    tap(host, { x: at.x + 120, y: at.y });
    tap(host, { x: at.x + 60, y: at.y + 100 });
    expect(markupChildren(stage)).toHaveLength(0); // nothing committed yet
    expect(useEditorStore.getState().pendingOp).toBe('polygon');
    const done = await screen.findByRole('button', { name: /Done/ });
    done.click();
    await waitFor(() => expect(markupChildren(stage)).toHaveLength(1));
    expect(markupChildren(stage)[0].getAttr('kind')).toBe('polygon');
  });

  it('Angle: three taps open the commit sheet with a ≈ readout', async () => {
    useEditorStore.getState().setActiveTool('angle');
    const { host, at } = await mountEditor();
    tap(host, at); // vertex
    tap(host, { x: at.x + 100, y: at.y }); // ray 1
    tap(host, { x: at.x, y: at.y + 100 }); // ray 2 → right angle
    const sheet = await screen.findByTestId('angle-sheet', {}, { timeout: 2000 });
    expect(sheet.textContent).toContain('≈');
    expect(sheet.textContent).toContain('90.0');
    // Complement/supplement chips are present.
    expect(sheet.textContent).toContain('Complement 0.0°');
    expect(sheet.textContent).toContain('Supplement 90.0°');
  });

  it('Erase: object mode deletes on tap, the toast names the object, and undo restores it', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { host, stage, at } = await mountEditor();
    tap(host, at);
    tap(host, { x: at.x + 80, y: at.y + 60 });
    expect(markupChildren(stage)).toHaveLength(1);
    // The hit graph is built on draw; `batchDraw` is rAF-scheduled, so force it before
    // hit-testing in this synchronous test.
    stage.getLayers()[2].draw();

    const toasts: string[] = [];
    const off = subscribeToast((text) => toasts.push(text));

    const hit = stage.getLayers()[2].getIntersection({ x: 300, y: 230 });
    expect(hit, 'rect edge is hittable').not.toBeNull();

    useEditorStore.getState().setActiveTool('erase');
    // An unfilled rect is grabbable on its stroke, not its interior — tap the left edge.
    tap(host, { x: at.x, y: at.y + 30 });
    expect(markupChildren(stage)).toHaveLength(0);
    expect(toasts.some((text) => text.includes('Rectangle'))).toBe(true);

    // One logical action = one undo step, and it restores the object.
    const undone = editorSession()?.undo() ?? null;
    expect(undone?.label).toContain('Rectangle');
    await waitFor(() => expect(markupChildren(stage)).toHaveLength(1));
    off();
  });

  it('Erase: stroke mode is hidden under touch and the pen-required note is shown', async () => {
    useEditorStore.getState().setActiveTool('erase');
    const { host, at } = await mountEditor();
    // First touch contact: the panel reports the input kind.
    pointer('pointerdown', host, at.x, at.y);
    pointer('pointerup', host, at.x, at.y);
    const note = await screen.findByRole('note');
    expect(note.textContent).toBe(STRINGS.erase.strokeNeedsPen);
    expect(screen.queryByRole('radio', { name: STRINGS.erase.modeStroke })).toBeNull();
  });
});
