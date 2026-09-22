/**
 * `tests/layersReorder.browser.test.ts` — slice 1.6 reorder-seam fix (orchestrator review
 * of the wiring wave).
 *
 * The defect this file pins: `LayersPanel.resolveDrop` returns `toIndex` as an index inside
 * the dragged row's GROUP block, while the old `MarkupScene.moveInBand` read it as an index
 * inside the object's §20.2 z-BAND. The panel's groups are finer than the two bands
 * (`layerGroupFor` → dimensions|shapes|ink|text|insets|photo), so once the main band holds
 * two groups the row lands in the wrong slot — and an Ink block spans BOTH bands
 * (`freehand` = main, `highlight` = lower), so the cross-band refusal could be bypassed.
 *
 * Browser project only (real `Konva.Stage` → D40). Storage is mocked; no photo is needed.
 *
 * Everything here drives the REAL `SheetEditor` + REAL `LayersPanel` through the DOM
 * (400 ms grip long-press → captured pointermove at the target's coordinates → pointerup),
 * so it proves the shell's `panelReorder` TRANSLATION and the scene primitive together,
 * not a decision in isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { STRINGS } from '../src/ui/strings';
import { subscribeToast, resetToastBus, editorSession } from '../src/editor/session';

vi.mock('@/fs/projectStore', async (importOriginal) => ({
  // Spread the REAL module first (session 15, D90 follow-up): presets.ts resolves its
  // projectStore bindings at use time from this namespace (D84/D91), so any binding the
  // factory omits arrives as `undefined` and loadPresets throws PresetsBindingError at
  // use time. The explicit vi.fn() overrides below replace only what this suite drives;
  // everything else stays real so an incomplete factory can never silently re-create
  // the missing-export failure mode.
  ...(await importOriginal<typeof import('@/fs/projectStore')>()),
  registerOpenProject: vi.fn(),
  // This suite does not exercise presets: report `.fieldmeasure/` as absent so
  // loadPresets resolves to { ok: true, presets: empty } (a fresh project),
  // never a PresetsBindingError from the real resolver spread in above.
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
/** §8.1 layer order: photo(0), inset(1), markup(2), overlay(3), drag(4). */
const MARKUP_LAYER = 2;
/** The panel's 400 ms grip long-press. */
const LONG_PRESS_MS = 400;

function pev(
  type: string,
  target: Element,
  x: number,
  y: number,
  opts: { pointerType?: string; pointerId?: number } = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: opts.pointerId ?? 1,
      pointerType: opts.pointerType ?? 'touch',
      isPrimary: (opts.pointerId ?? 1) === 1,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

async function mountEditor(): Promise<{
  view: ReturnType<typeof render>;
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
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const rect = host.getBoundingClientRect();
  const stage = Konva.stages[Konva.stages.length - 1];
  return { view, host, stage, at: { x: rect.left + 300, y: rect.top + 200 } };
}

/** Touch tap-tap through the real dimension machine, then close the keypad (keeps geometry). */
async function placeDimension(host: HTMLDivElement, a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> {
  pev('pointerdown', host, a.x, a.y);
  pev('pointerup', host, a.x, a.y);
  pev('pointerdown', host, b.x, b.y);
  pev('pointerup', host, b.x, b.y);
  await sleep(520); // 450 ms settle opens the keypad
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(20);
}

/** A pen ink stroke (freehand or highlight) through the real shell dispatch. */
async function placeInk(
  host: HTMLDivElement,
  at: { x: number; y: number },
  kind: 'freehand' | 'highlight',
): Promise<void> {
  useEditorStore.getState().setActiveTool(kind);
  await sleep(10);
  pev('pointerdown', host, at.x, at.y, { pointerType: 'pen' });
  pev('pointermove', host, at.x + 20, at.y + 6, { pointerType: 'pen' });
  pev('pointermove', host, at.x + 40, at.y + 14, { pointerType: 'pen' });
  pev('pointermove', host, at.x + 70, at.y + 10, { pointerType: 'pen' });
  pev('pointerup', host, at.x + 70, at.y + 10, { pointerType: 'pen' });
  await sleep(20);
}

/** Open the panel and return its rows grouped, in DOM (front-first) order. */
async function openLayers(): Promise<{
  rows: Array<{ key: string; group: string; el: HTMLElement }>;
}> {
  useEditorStore.getState().setLayersOpen(true);
  await screen.findByTestId('layers-panel');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-layer-row]')).map((el) => ({
    key: el.getAttribute('data-layer-row') ?? '',
    group: el.getAttribute('data-layer-group') ?? '',
    el,
  }));
  return { rows };
}

/** §8.1 grip drag: 400 ms hold, move over the target row's real coordinates, release. */
async function dragRowOnto(fromKey: string, toKey: string): Promise<void> {
  const grip = document.querySelector(`[data-layer-grip="${fromKey}"]`) as HTMLElement;
  const target = document.querySelector(`[data-layer-row="${toKey}"]`) as HTMLElement;
  pev('pointerdown', grip, 10, 10, { pointerType: 'touch' });
  await sleep(LONG_PRESS_MS + 40);
  // Real touch is implicitly captured to the grip, so the move still TARGETS the grip
  // (D77/F1). Aim at the target row's real centre so the panel's coordinate → row-key
  // resolution finds it — `pointerover` never fires under capture.
  const rect = target.getBoundingClientRect();
  pev('pointermove', grip, rect.left + rect.width / 2, rect.top + rect.height / 2, {
    pointerType: 'touch',
  });
  pev('pointerup', document.body, 10, 10, { pointerType: 'touch' });
  await sleep(20);
}

/** Painter order of the markup layer's nodes, by annotation key. */
function painterOrder(stage: Konva.Stage): string[] {
  return stage
    .getLayers()[MARKUP_LAYER]
    .getChildren()
    .map((c: Konva.Node) => c.getAttr('annotationId') as string | undefined)
    .filter((k): k is string => typeof k === 'string');
}

function indexOfKey(stage: Konva.Stage, key: string): number {
  return painterOrder(stage).indexOf(key);
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
// (a) + (c): a same-group drop must not jump the row over another group
// ---------------------------------------------------------------------------

describe('Layers reorder — group-index translation and undo', () => {
  it('dragging a dimension onto another dimension keeps it inside Dimensions (not above the Rect), in one undo step', async () => {
    const { host, stage, at } = await mountEditor();

    // Create order = z order: Dim A 1000, Dim B 1010, Rect R 1020. Main-band members are
    // therefore [R, B, A] front-first and the panel blocks are [{shapes:[R]},{dimensions:[B,A]}].
    await placeDimension(host, at, { x: at.x + 120, y: at.y });
    await placeDimension(host, at, { x: at.x + 120, y: at.y + 120 });
    useEditorStore.getState().setActiveTool('rect');
    await sleep(10);
    pev('pointerdown', host, at.x + 400, at.y + 300);
    pev('pointerup', host, at.x + 400, at.y + 300);
    pev('pointerdown', host, at.x + 500, at.y + 400);
    pev('pointerup', host, at.x + 500, at.y + 400);
    await sleep(20);

    const { rows } = await openLayers();
    const dims = rows.filter((r) => r.group === 'dimensions');
    const shapes = rows.filter((r) => r.group === 'shapes');
    expect(dims).toHaveLength(2);
    expect(shapes).toHaveLength(1);
    const dimFront = dims[0].key; // B (z 1010)
    const dimBack = dims[1].key; // A (z 1000)
    const rectKey = shapes[0].key; // R (z 1020)

    const before = painterOrder(stage);
    expect(before).toEqual([dimBack, dimFront, rectKey]); // [A, B, R]

    // Drag A onto B — the panel calls onReorder(A, 0): index 0 WITHIN the dimensions block.
    await dragRowOnto(dimBack, dimFront);

    // The fixed translation puts A immediately in front of B (still inside Dimensions),
    // never into the Shapes band. Paint order back→front: [B, A, R].
    const order = painterOrder(stage);
    expect(order.indexOf(dimBack)).toBe(order.indexOf(dimFront) + 1); // A adjacent to B, in front
    expect(order.indexOf(dimBack)).toBeLessThan(order.indexOf(rectKey)); // A still behind R
    expect(order).toEqual([dimFront, dimBack, rectKey]);

    // (c) Exactly one undo step for the reorder, and undo restores the exact z-order.
    const undone = editorSession()?.undo() ?? null;
    expect(undone).not.toBeNull();
    await sleep(10);
    expect(painterOrder(stage)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// The other two entry points: the end-of-group branch and Bring to front
// ---------------------------------------------------------------------------

describe('Layers reorder — keyboard end-of-group and Bring to front', () => {
  /** Dim A (z 1000), Dim B (z 1010), Rect R (z 1020) → blocks [shapes:[R], dimensions:[B,A]]. */
  async function dimsAndRect(): Promise<{
    stage: Konva.Stage;
    dimFront: string;
    dimBack: string;
    rectKey: string;
  }> {
    const { host, stage, at } = await mountEditor();
    await placeDimension(host, at, { x: at.x + 120, y: at.y });
    await placeDimension(host, at, { x: at.x + 120, y: at.y + 120 });
    useEditorStore.getState().setActiveTool('rect');
    await sleep(10);
    pev('pointerdown', host, at.x + 400, at.y + 300);
    pev('pointerup', host, at.x + 400, at.y + 300);
    pev('pointerdown', host, at.x + 500, at.y + 400);
    pev('pointerup', host, at.x + 500, at.y + 400);
    await sleep(20);

    const { rows } = await openLayers();
    const dims = rows.filter((r) => r.group === 'dimensions');
    return {
      stage,
      dimFront: dims[0].key, // B (z 1010)
      dimBack: dims[1].key, // A (z 1000)
      rectKey: rows.find((r) => r.group === 'shapes')!.key, // R (z 1020)
    };
  }

  it('Alt+ArrowDown past the end of the group moves the row to the back of the band', async () => {
    const { stage, dimFront, dimBack, rectKey } = await dimsAndRect();
    const button = document.querySelector(`[data-layer-select="${dimFront}"]`) as HTMLButtonElement;
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    await sleep(20);
    // `dimFront` is at full-block index 0; +1 == reduced.length → "at/after the end" → back.
    expect(painterOrder(stage)).toEqual([dimFront, dimBack, rectKey]);
  });

  it('Bring to front moves the row to the front of its own group, never over another group', async () => {
    const { stage, dimFront, dimBack, rectKey } = await dimsAndRect();
    (document.querySelector(`[data-layer-menu="${dimBack}"]`) as HTMLButtonElement).click();
    await sleep(10);
    (document.querySelector('[data-menu-action="front"]') as HTMLButtonElement).click();
    await sleep(20);
    // The panel passes `toIndex = 0`, shared with a drop on the group's front row, so
    // "front" is the front of the ROW'S GROUP: A is front-most of Dimensions, still
    // behind the unrelated Rect (§20.2 stays intact).
    expect(painterOrder(stage)).toEqual([dimFront, dimBack, rectKey]);
  });
});


describe('Layers reorder — the Ink block spans two bands', () => {
  it('a freehand→highlight drop changes nothing and surfaces the approved copy', async () => {
    const { host, stage, at } = await mountEditor();
    await placeInk(host, at, 'freehand');
    await placeInk(host, { x: at.x + 200, y: at.y + 100 }, 'highlight');

    const { rows } = await openLayers();
    const ink = rows.filter((r) => r.group === 'ink');
    expect(ink).toHaveLength(2);
    // front-first within Ink: freehand (main band, z 1000) then highlight (lower, z 0).
    const freehandKey = ink[0].key;
    const highlightKey = ink[1].key;

    const toasts: string[] = [];
    const off = subscribeToast((text) => toasts.push(text));
    const before = painterOrder(stage);

    // The panel ACCEPTS this drop (both rows are the same `ink` block), so the refusal
    // must come from the shell/scene, not the panel.
    await dragRowOnto(freehandKey, highlightKey);

    expect(painterOrder(stage)).toEqual(before); // nothing moved
    expect(toasts).toContain(STRINGS.editor.highlighterBandMessage);
    off();
  });
});
