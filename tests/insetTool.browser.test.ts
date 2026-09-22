/**
 * `tests/insetTool.browser.test.ts` — slice 1.7 insert flow + manipulation + Focus
 * (browser project, D40: it constructs a real `Konva.Stage` for the overlay handles).
 *
 * Proves the tool CONSUMES the pure grammar: a tap raises the picker request, a pick
 * places at 40% of the sheet width with a 24 px cascade and is one undo step, a corner
 * handle scales (aspect-locked), an edge handle crops, and Focus refuses nesting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Px } from '../src/domain/types';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { InsetTool, type InsetAssetInput } from '../src/editor/tools/InsetTool';
import type { InsetImageGeometry } from '../src/editor/inset/insetGeometry';

const SHEET = { width: 1000, height: 800 };
const ASSET = { width: 240, height: 180 };
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

interface Harness {
  canvas: EditorCanvas;
  scene: MarkupScene;
  tool: InsetTool;
  history: History;
  pickerAt: Px[];
  placed: string[][];
  focus: Array<string | null>;
  ids: InsetAssetInput[];
}

function setup(): Harness {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = '600px';
  host.style.height = '500px';
  document.body.appendChild(host);
  const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    insetLayer: canvas.insetLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
    assetProvider: () => ({ image: document.createElement('canvas'), width: ASSET.width, height: ASSET.height }),
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const history = new History();
  let selection: string[] = [];
  const pickerAt: Px[] = [];
  const placed: string[][] = [];
  const focus: Array<string | null> = [];
  const ids: InsetAssetInput[] = [
    { assetId: 'hash-a', width: ASSET.width, height: ASSET.height },
    { assetId: 'hash-b', width: ASSET.width, height: ASSET.height },
  ];
  const tool = new InsetTool({
    canvas,
    scene,
    history,
    getSheetSize: () => SHEET,
    getSelection: () => selection,
    setSelection: (keys) => {
      selection = keys;
    },
    onRequestPicker: (at) => pickerAt.push(at),
    onPlaced: (keys) => placed.push(keys),
    onFocusChange: (id) => focus.push(id),
    getAssetSize: () => ASSET,
  });
  cleanups.push(() => {
    tool.dispose();
    scene.load([]);
    canvas.destroy();
    host.remove();
  });
  return { canvas, scene, tool, history, pickerAt, placed, focus, ids };
}

describe('insert flow (UI §9:610–618)', () => {
  it('a tap raises the picker request and leaves the placement pending', () => {
    const h = setup();
    expect(h.tool.onPointerUp({ x: 500, y: 400 }, true, 'touch')).toBeUndefined();
    expect(h.tool.pickerOpen).toBe(true);
    expect(h.tool.pending).toBe(true);
    expect(h.pickerAt).toEqual([{ x: 500, y: 400 }]);
  });

  it('places at 40% of the sheet width, aspect preserved, centred on the tap', () => {
    const h = setup();
    h.tool.requestInsert({ x: 500, y: 400 });
    const [key] = h.tool.placeFromAssets([h.ids[0]]);
    const ann = h.scene.get(key)!;
    const geom = ann.geometry as InsetImageGeometry;
    expect(ann.type).toBe('image');
    expect(geom.width).toBeCloseTo(400, 9); // 1000 × 0.40
    expect(geom.height).toBeCloseTo(300, 9); // 400 × 0.75
    expect(geom.x).toBeCloseTo(300, 9);
    expect(geom.y).toBeCloseTo(250, 9);
    expect(geom.rotation).toBe(0);
    expect(h.tool.pending).toBe(false);
    expect(h.placed).toEqual([[key]]);
  });

  it('cascades a multi-select 24 px down-right as ONE undo step', () => {
    const h = setup();
    h.tool.requestInsert({ x: 500, y: 400 });
    const keys = h.tool.placeFromAssets([h.ids[0], h.ids[1]]);
    expect(keys).toHaveLength(2);
    const first = h.scene.get(keys[0])!.geometry as InsetImageGeometry;
    const second = h.scene.get(keys[1])!.geometry as InsetImageGeometry;
    expect(second.x - first.x).toBeCloseTo(24, 9);
    expect(second.y - first.y).toBeCloseTo(24, 9);

    expect(h.history.depth).toBe(1);
    h.history.undo();
    expect(h.scene.list()).toHaveLength(0);
  });

  it('inside Focus, an insert request is refused (nesting is one level)', () => {
    const h = setup();
    h.tool.requestInsert({ x: 500, y: 400 });
    const [key] = h.tool.placeFromAssets([h.ids[0]]);
    expect(h.tool.enterFocus(key)).toBe(true);
    expect(h.tool.canPlaceInset()).toBe(false);
    expect(h.tool.requestInsert({ x: 100, y: 100 })).toBe(false);
    expect(h.pickerAt).toHaveLength(1); // the second request never reached the shell
    expect(h.focus).toEqual([key]);
    h.tool.exitFocus();
    expect(h.focus).toEqual([key, null]);
    expect(h.tool.canPlaceInset()).toBe(true);
  });
});

describe('manipulation (UI §9:621)', () => {
  function placedOne(h: Harness): string {
    h.tool.requestInsert({ x: 500, y: 400 });
    const [key] = h.tool.placeFromAssets([h.ids[0]]);
    return key;
  }

  it('a corner handle scales, aspect-locked, as one undo step', () => {
    const h = setup();
    const key = placedOne(h);
    const before = h.history.depth;
    // se corner of x=300,y=250,w=400,h=300 is (700,550); drag to (900,700) = ×1.5.
    expect(h.tool.hitHandle({ x: 700, y: 550 })).toBe('se');
    expect(h.tool.onPointerDown({ x: 700, y: 550 }, 'touch')).toBe('consume');
    h.tool.onPointerMove({ x: 900, y: 700 }, true);
    h.tool.onPointerUp({ x: 900, y: 700 }, false, 'touch');
    const geom = h.scene.get(key)!.geometry as InsetImageGeometry;
    expect(geom.width).toBeCloseTo(600, 6);
    expect(geom.height).toBeCloseTo(450, 6);
    expect(h.history.depth).toBe(before + 1);
  });

  it('an edge handle adjusts the crop window instead of stretching', () => {
    const h = setup();
    const key = placedOne(h);
    // e handle is at (700, 400); drag left to 600.
    expect(h.tool.hitHandle({ x: 700, y: 400 })).toBe('e');
    h.tool.onPointerDown({ x: 700, y: 400 }, 'touch');
    h.tool.onPointerMove({ x: 600, y: 400 }, true);
    h.tool.onPointerUp({ x: 600, y: 400 }, false, 'touch');
    const geom = h.scene.get(key)!.geometry as InsetImageGeometry;
    expect(geom.width).toBeCloseTo(300, 6);
    expect(geom.crop?.width).toBeCloseTo(180, 6); // 240 × (300/400)
    expect(geom.x).toBeCloseTo(300, 6); // west edge fixed
  });
});
