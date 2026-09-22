/**
 * `tests/layersWire.browser.test.ts` — slice 1.6 wiring, the machine half of A1/A2/A3.
 *
 * Runs in the `browser` project: it drives the real `EditorCanvas` / Konva stage and the
 * real `SheetEditor` pointer listeners (D40 — a `Konva.Stage` test must not run in jsdom).
 *
 * A1 (scene):  `setVisible` / `setLocked` persist through `markupFile()` → `load()`;
 *              `moveInBandBefore` reorders inside a §20.2 band; `rename` is a documented
 *              no-op.
 * A1 (mount):  the panel mounts from `layersOpen`, renders one row per annotation, the
 *              eye toggle hides the Konva node and is ONE undo step.
 * A2:          marquee selects the enclosed annotations; a handle drag translates and is
 *              ONE undo step; a rotate commit lands the snapped angle; a long-press pins
 *              the mini-toolbar; a drag that STARTS on a hit object does not marquee.
 * A3:          a 600 ms press shows the `--err` preview and deletes nothing; a short tap
 *              deletes and toasts; moving cancels.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import EditorLayout from '../src/ui/EditorLayout';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE } from '../src/domain/types';
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const MARKUP_LAYER = 2;
const OVERLAY_LAYER = 3;

function pointer(
  type: string,
  target: Element,
  x: number,
  y: number,
  pointerType = 'pen',
  pointerId = 1,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType,
      isPrimary: pointerId === 1,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

function tap(host: HTMLDivElement, p: { x: number; y: number }): void {
  pointer('pointerdown', host, p.x, p.y);
  pointer('pointerup', host, p.x, p.y);
}

async function mountEditor(propTool: 'select' | 'pan' | 'place' = 'place') {
  const view = render(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool: propTool,
    }),
  );
  await screen.findByText(STRINGS.project.noSheetsEmpty);
  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  host.style.width = '800px';
  host.style.height = '600px';
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const rect = host.getBoundingClientRect();
  const stage = Konva.stages[Konva.stages.length - 1];
  return { view, host, stage, at: { x: rect.left + 300, y: rect.top + 200 } };
}

/** Switch the real tool to Select (prop is the coarse seam; the store is the real id). */
function toSelect(view: { rerender: (el: ReturnType<typeof createElement>) => void }): void {
  useEditorStore.getState().setActiveTool('select');
  view.rerender(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool: 'select',
    }),
  );
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

// ---------------------------------------------------------------------------
// A1 — scene persistence + band-safe reorder
// ---------------------------------------------------------------------------

describe('A1 — scene visibility / lock / reorder / rename', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function setup(): { canvas: EditorCanvas; scene: MarkupScene } {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = '600px';
    host.style.height = '600px';
    document.body.appendChild(host);
    const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
    let n = 0;
    const scene = new MarkupScene({
      layer: canvas.markupLayer,
      ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
      ghostText: 'tap to enter value',
      newId: () => `id-${++n}`,
    });
    cleanups.push(() => {
      scene.load([]);
      canvas.destroy();
      host.remove();
    });
    return { canvas, scene };
  }

  it('setVisible hides the node and persists through markupFile() → load()', () => {
    const { scene } = setup();
    const a = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 40, height: 40 } });
    scene.setVisible(a.id, false);
    expect(scene.getNode(a.id)!.visible()).toBe(false);
    expect(scene.list()[0].visible).toBe(false);

    const file = scene.markupFile('s', 1);
    const { scene: restored } = setup();
    restored.load(file.objects);
    expect(restored.list()[0].visible).toBe(false);
    expect(restored.getNode(a.id)!.visible()).toBe(false);
  });

  it('setLocked persists and re-syncs the locked treatment', () => {
    const { scene } = setup();
    const a = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 40, height: 40 } });
    scene.setLocked(a.id, true);
    expect(scene.list()[0].locked).toBe(true);
    expect(scene.getNode(a.id)!.getAttr('locked')).toBe(true);
    const file = scene.markupFile('s', 1);
    const { scene: restored } = setup();
    restored.load(file.objects);
    expect(restored.list()[0].locked).toBe(true);
  });

  it('moveInBandBefore reorders inside the main band front-first and never crosses into the highlight band', () => {
    const { scene } = setup();
    const first = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 } });
    const second = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 } });
    const third = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 } });
    const highlight = scene.addMarkup({
      type: 'highlight',
      geometry: { kind: 'highlight', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], pressure: [0.5, 0.5] },
      style: { ...DEFAULT_STYLE, strokeColor: '#FFD400', strokeWidthMu: 24 },
    });

    // Display order front-first is [third, second, first]; `null` = front of the band.
    expect(scene.moveInBandBefore(first.id, null)).toBe(true);
    const kinds = scene.entries().map((e) => e.key);
    // The highlight stays below every main-band object (§20.2).
    expect(kinds[0]).toBe(highlight.id);
    expect(kinds[kinds.length - 1]).toBe(first.id);
    expect(scene.list().every((o) => (o.type === 'highlight' ? o.zIndex < 1000 : o.zIndex >= 1000))).toBe(true);

    // A cross-band anchor is refused and changes nothing.
    const snapshot = scene.entries().map((e) => e.key);
    expect(scene.moveInBandBefore(first.id, highlight.id)).toBe(false);
    expect(scene.entries().map((e) => e.key)).toEqual(snapshot);
  });

  it('rename is a documented no-op and does not emit a change', () => {
    const { scene } = setup();
    const a = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 } });
    let changes = 0;
    scene.onChange = () => {
      changes += 1;
    };
    expect(() => scene.rename(a.id, 'Footing A')).not.toThrow();
    expect(changes).toBe(0);
    expect(scene.list()[0]).not.toHaveProperty('name');
  });
});

// ---------------------------------------------------------------------------
// A1 — the panel mounts and its eye toggle is one undo step
// ---------------------------------------------------------------------------

describe('A1 — Layers flyout mounts from SheetEditor', () => {
  it('renders one row per annotation and the eye toggle hides the node in one undo step', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 80, y: at.y + 60 });
    stage.getLayers()[MARKUP_LAYER].draw();
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(1);

    useEditorStore.getState().setLayersOpen(true);
    const rowEl = await screen.findByTestId('layers-panel');
    expect(rowEl.dataset.state).toBe('ready');
    const key = document.querySelector('[data-layer-row]')?.getAttribute('data-layer-row');
    expect(key).toBeTruthy();
    const node = stage.getLayers()[MARKUP_LAYER].getChildren()[0];
    expect(node.visible()).toBe(true);

    // Eye toggle (A1): hides the Konva node…
    (document.querySelector(`[data-layer-visible="${key}"]`) as HTMLButtonElement).click();
    await waitFor(() => expect(stage.getLayers()[MARKUP_LAYER].getChildren()[0].visible()).toBe(false));

    // …and ONE undo restores it (the toggle is a single history step).
    const undone = editorSession()?.undo() ?? null;
    expect(undone?.label).toContain('Show or hide');
    await waitFor(() => expect(stage.getLayers()[MARKUP_LAYER].getChildren()[0].visible()).toBe(true));
  });

  it('the lock toggle is one undo step and the photo row is absent without a photo', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 60, y: at.y + 40 });
    stage.getLayers()[MARKUP_LAYER].draw();

    useEditorStore.getState().setLayersOpen(true);
    await screen.findByTestId('layers-panel');
    const key = document.querySelector('[data-layer-row]')?.getAttribute('data-layer-row') as string;

    const lockedAttr = (): unknown =>
      (stage.getLayers()[MARKUP_LAYER].getChildren()[0] as Konva.Group).getAttr('locked');
    (document.querySelector(`[data-layer-lock="${key}"]`) as HTMLButtonElement).click();
    await waitFor(() => expect(lockedAttr()).toBe(true));
    expect(editorSession()?.undo()?.label).toContain('Lock or unlock');
    await waitFor(() => expect(lockedAttr()).toBe(false));

    // No photo is loaded in this empty-state project → no synthetic photo row.
    expect(document.querySelector('[data-layer-row="photo"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A1 — the TopBar opens the panel; Escape closes it and returns focus
// ---------------------------------------------------------------------------

describe('A1 — panel opens from the TopBar and restores focus', () => {
  it('focus enters the panel, Escape closes it, focus returns to the Layers button', async () => {
    const view = render(
      createElement(EditorLayout, { projectId: 'p:f', folderName: 'f', onExit: () => {} }),
    );
    await screen.findByText(STRINGS.project.noSheetsEmpty);

    const layersButton = screen.getByRole('button', {
      name: STRINGS.a11y.layers,
    }) as HTMLButtonElement;
    expect(layersButton.disabled).toBe(false);
    layersButton.focus();
    layersButton.click();

    const panel = await screen.findByTestId('layers-panel');
    expect(panel.contains(document.activeElement)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(screen.queryByTestId('layers-panel')).toBeNull());
    expect(document.activeElement).toBe(layersButton);
    view.unmount();
  });
});

// ---------------------------------------------------------------------------
// A2 — SelectTool is shell-driven
// ---------------------------------------------------------------------------

describe('A2 — marquee, handle drag, rotate, long-press pin', () => {
  it('a marquee on empty canvas selects the enclosed annotations', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { view, host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 60, y: at.y + 40 });
    tap(host, { x: at.x + 160, y: at.y });
    tap(host, { x: at.x + 220, y: at.y + 40 });
    stage.getLayers()[MARKUP_LAYER].draw();
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(2);

    toSelect(view);
    await sleep(10);

    // Pen drag across empty canvas enclosing both rects.
    pointer('pointerdown', host, at.x - 60, at.y - 60);
    pointer('pointermove', host, at.x + 140, at.y + 60);
    pointer('pointermove', host, at.x + 320, at.y + 140);
    pointer('pointerup', host, at.x + 320, at.y + 140);
    await sleep(10);

    expect(useEditorStore.getState().selection).toHaveLength(2);
  });

  it('a drag that STARTS on a hit object does not marquee', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { view, host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 100, y: at.y + 60 });
    stage.getLayers()[MARKUP_LAYER].draw();

    toSelect(view);
    await sleep(10);
    useEditorStore.getState().clearSelection();

    // Start on the rect's left edge (a hit), drag far — object-first move, no marquee.
    pointer('pointerdown', host, at.x, at.y + 30);
    pointer('pointermove', host, at.x + 200, at.y + 30);
    pointer('pointerup', host, at.x + 200, at.y + 30);
    await sleep(10);
    expect(useEditorStore.getState().selection).toHaveLength(0);
  });

  it('a handle drag translates the selection and is one undo step', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { view, host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 120, y: at.y + 80 });
    stage.getLayers()[MARKUP_LAYER].draw();

    toSelect(view);
    await sleep(10);
    // Select via a tap on the left edge (sets selection + draws handles).
    tap(host, { x: at.x, y: at.y + 40 });
    await sleep(10);
    expect(useEditorStore.getState().selection).toHaveLength(1);

    const rectBefore = stage.getLayers()[MARKUP_LAYER].findOne<Konva.Rect>('Rect')!;
    const x0 = rectBefore.x();

    // The nw handle sits at the selection's top-left corner in image space; with no photo
    // (scale 1, stage at 0) that is the same as the client-relative point `at`.
    pointer('pointerdown', host, at.x, at.y);
    pointer('pointermove', host, at.x + 50, at.y + 30);
    pointer('pointerup', host, at.x + 50, at.y + 30);
    await sleep(10);

    const rectAfter = stage.getLayers()[MARKUP_LAYER].findOne<Konva.Rect>('Rect')!;
    expect(rectAfter.x()).toBeCloseTo(x0 + 50, 1);

    const undone = editorSession()?.undo() ?? null;
    expect(undone).not.toBeNull();
    await sleep(10);
    const rectRestored = stage.getLayers()[MARKUP_LAYER].findOne<Konva.Rect>('Rect')!;
    expect(rectRestored.x()).toBeCloseTo(x0, 1);
  });

  it('a rotate commit lands the snapped angle', async () => {
    useEditorStore.getState().setActiveTool('line');
    const { view, host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 120, y: at.y });
    stage.getLayers()[MARKUP_LAYER].draw();

    toSelect(view);
    await sleep(10);

    // Long-press the line's midpoint (600 ms) → select + pin the mini-toolbar.
    pointer('pointerdown', host, at.x + 60, at.y);
    await sleep(650);
    pointer('pointerup', host, at.x + 60, at.y);
    await sleep(10);

    const toolbar = await screen.findByTestId('mini-toolbar');
    expect(toolbar.dataset.pinned).toBe('true');
    expect(useEditorStore.getState().selection).toHaveLength(1);

    // Rotate 90° about the midpoint → the horizontal line becomes vertical.
    (toolbar.querySelector('[data-rotate="90"]') as HTMLButtonElement).click();
    await sleep(10);

    const line = stage.getLayers()[MARKUP_LAYER].findOne<Konva.Line>('Line')!;
    const pts = line.points();
    expect(Math.abs(pts[0] - pts[2])).toBeLessThan(1);
    expect(Math.abs(pts[1] - pts[3])).toBeCloseTo(120, 0);
  });

  it('a long-press pins the mini-toolbar', async () => {
    useEditorStore.getState().setActiveTool('rect');
    const { view, host, stage, at } = await mountEditor('place');
    tap(host, at);
    tap(host, { x: at.x + 100, y: at.y + 60 });
    stage.getLayers()[MARKUP_LAYER].draw();

    toSelect(view);
    await sleep(10);
    useEditorStore.getState().clearSelection();
    await sleep(10);
    expect(screen.queryByTestId('mini-toolbar')).toBeNull();

    pointer('pointerdown', host, at.x, at.y + 30);
    await sleep(650);
    pointer('pointerup', host, at.x, at.y + 30);
    await sleep(10);

    const toolbar = await screen.findByTestId('mini-toolbar');
    expect(toolbar.dataset.pinned).toBe('true');
    expect(useEditorStore.getState().selection).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A3 — the erase 600 ms preview
// ---------------------------------------------------------------------------

describe('A3 — erase long-press preview', () => {
  async function placeRect() {
    useEditorStore.getState().setActiveTool('rect');
    const mounted = await mountEditor('place');
    tap(mounted.host, mounted.at);
    tap(mounted.host, { x: mounted.at.x + 80, y: mounted.at.y + 60 });
    mounted.stage.getLayers()[MARKUP_LAYER].draw();
    return mounted;
  }

  it('a 600 ms press shows the --err preview and deletes nothing', async () => {
    const { host, stage, at } = await placeRect();
    useEditorStore.getState().setActiveTool('erase');

    const overlayBefore = stage.getLayers()[OVERLAY_LAYER].getChildren().length;
    pointer('pointerdown', host, at.x, at.y + 30);
    await sleep(650);
    // Preview outline drawn, object intact.
    expect(stage.getLayers()[OVERLAY_LAYER].getChildren().length).toBeGreaterThan(overlayBefore);
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(1);

    pointer('pointerup', host, at.x, at.y + 30);
    await sleep(10);
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(1);
    expect(stage.getLayers()[OVERLAY_LAYER].getChildren().length).toBe(overlayBefore);
  });

  it('a short tap deletes and toasts', async () => {
    const { host, stage, at } = await placeRect();
    // Force the hit graph before erase hit-testing.
    stage.getLayers()[MARKUP_LAYER].draw();
    const toasts: string[] = [];
    const off = subscribeToast((text) => toasts.push(text));

    useEditorStore.getState().setActiveTool('erase');
    tap(host, { x: at.x, y: at.y + 30 });
    await sleep(10);

    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(0);
    expect(toasts.some((text) => text.includes('Rectangle'))).toBe(true);
    // One logical action = one undo step.
    expect(editorSession()?.undo()?.label).toContain('Rectangle');
    await sleep(10);
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(1);
    off();
  });

  it('moving the finger cancels the preview', async () => {
    const { host, stage, at } = await placeRect();
    useEditorStore.getState().setActiveTool('erase');
    const overlayBefore = stage.getLayers()[OVERLAY_LAYER].getChildren().length;

    pointer('pointerdown', host, at.x, at.y + 30);
    pointer('pointermove', host, at.x + 40, at.y + 30);
    await sleep(650);
    expect(stage.getLayers()[OVERLAY_LAYER].getChildren().length).toBe(overlayBefore);

    pointer('pointerup', host, at.x + 40, at.y + 30);
    await sleep(10);
    expect(stage.getLayers()[MARKUP_LAYER].getChildren()).toHaveLength(1);
  });
});
