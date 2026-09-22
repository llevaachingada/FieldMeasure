/**
 * tests/sceneStyleCommand.browser.test.ts — closes the review-brief Q1 gap for slice 1.8
 * lane C1: `MarkupScene.styleCommand` / `patchStyleCommand` were covered by `tsc` only.
 *
 * It runs in the **browser** Vitest project and constructs a real `EditorCanvas` +
 * `MarkupScene`, then drives the REAL delegation path (`scene.styleCommand(...)` →
 * `History.exec`), NOT the factory directly and NOT the model directly. It proves:
 *   (a) the model changes AND the rendered Konva nodes reflect them (and the node is
 *       actually rebuilt, so `syncOwner` ran);
 *   (b) a multi-object style change is exactly one undo step and undo restores each
 *       object's OWN previous style (not a uniform default);
 *   (c) `patchStyleCommand` touches only the named key, in one step;
 *   (d) the command works across targets that started identical and targets that started
 *       different (converges, then un-mixes).
 */
import { afterEach, describe, expect, it } from 'vitest';
import Konva from 'konva';

import { EditorCanvas } from '../src/editor/EditorCanvas';
import { History } from '../src/editor/history';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE, type AnnotationStyle } from '../src/domain/types';
import { selectionStyleState } from '../src/state/styleByTool';

const HOST_SIZE = 900;
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function setup(): { canvas: EditorCanvas; scene: MarkupScene } {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = `${HOST_SIZE}px`;
  host.style.height = `${HOST_SIZE}px`;
  document.body.appendChild(host);
  const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  cleanups.push(() => {
    scene.load([]);
    canvas.destroy();
    host.remove();
  });
  return { canvas, scene };
}

const style = (patch: Partial<AnnotationStyle>): AnnotationStyle => ({ ...DEFAULT_STYLE, ...patch });

const KEYS = ['id-1', 'id-2', 'id-3'] as const;

/** Three annotations with pairwise-different styles: two rects and one line. */
function addThree(scene: MarkupScene): void {
  scene.addMarkup({
    type: 'rect',
    geometry: { kind: 'rect', x: 10, y: 10, width: 40, height: 30 },
    style: style({ strokeColor: '#FF7A18', strokeWidthMu: 4 }),
  });
  scene.addMarkup({
    type: 'rect',
    geometry: { kind: 'rect', x: 80, y: 10, width: 40, height: 30 },
    style: style({ strokeColor: '#2FD4E0', strokeWidthMu: 8 }),
  });
  scene.addMarkup({
    type: 'line',
    geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 50, y: 50 } },
    style: style({ strokeColor: '#FFD400', strokeWidthMu: 12, lineStyle: 'dashed' }),
  });
}

describe('MarkupScene.styleCommand — real delegation, end to end', () => {
  it('converges all three objects AND the rendered nodes reflect the new style', () => {
    const { canvas, scene } = setup();
    addThree(scene);

    // Sanity: they start different, and grab the pre-command node to prove a rebuild.
    expect(scene.get('id-1')!.style.strokeColor).toBe('#FF7A18');
    expect(scene.get('id-2')!.style.strokeColor).toBe('#2FD4E0');
    expect(scene.get('id-3')!.style.strokeColor).toBe('#FFD400');
    const nodeBefore = scene.getNode('id-1');

    const newStyle = style({
      strokeColor: '#000000',
      strokeWidthMu: 6,
      fillColor: '#35A7FF',
      fillAlpha: 0.5,
      lineStyle: 'dotted',
      arrowheads: 'both',
    });

    const history = new History();
    const cmd = scene.styleCommand([...KEYS], newStyle, 'Change style');
    expect(cmd.label).toBe('Change style');
    history.exec(cmd);

    // Model: all three carry the new style exactly.
    for (const key of KEYS) expect(scene.get(key)!.style).toEqual(newStyle);

    // Rendered: the group was rebuilt (syncOwner ran) and the Konva nodes carry it.
    expect(scene.getNode('id-1')).not.toBe(nodeBefore);
    canvas.markupLayer.draw();
    const rect1 = scene.getNode('id-1')!.findOne<Konva.Rect>('Rect')!;
    expect(rect1.stroke()).toBe('#000000');
    expect(rect1.strokeWidth()).toBe(6);
    expect(rect1.fill()).toBe('#35A7FF');
    expect(rect1.fillEnabled()).toBe(true);
    expect(rect1.dash()).toEqual([1, 5]); // dotted
    const line3 = scene.getNode('id-3')!.findOne<Konva.Line>('Line')!;
    expect(line3.stroke()).toBe('#000000');
    expect(line3.strokeWidth()).toBe(6);
    expect(line3.dash()).toEqual([1, 5]);
  });

  it('is exactly one undo step, restoring each object OWN previous style', () => {
    const { canvas, scene } = setup();
    addThree(scene);

    const before = KEYS.map((key) => ({ key, style: { ...scene.get(key)!.style } }));
    const history = new History();
    history.exec(scene.styleCommand([...KEYS], style({ strokeColor: '#FFFFFF' }), 'Change style'));
    expect(history.depth).toBe(1);

    const undone = history.undo();
    expect(undone?.label).toBe('Change style');
    expect(history.depth).toBe(0);

    // Per-object restore: not a uniform default — each is its own captured start.
    for (const entry of before) expect(scene.get(entry.key)!.style).toEqual(entry.style);
    expect(scene.get('id-1')!.style.strokeColor).toBe('#FF7A18');
    expect(scene.get('id-2')!.style.strokeColor).toBe('#2FD4E0');
    expect(scene.get('id-3')!.style.strokeColor).toBe('#FFD400');

    // The nodes were rebuilt back too.
    canvas.markupLayer.draw();
    expect(scene.getNode('id-3')!.findOne<Konva.Line>('Line')!.stroke()).toBe('#FFD400');

    // A second undo does nothing and does not touch the styles again.
    const snapshot = KEYS.map((key) => JSON.stringify(scene.get(key)!.style));
    const second = history.undo();
    expect(second).toBeNull();
    expect(KEYS.map((key) => JSON.stringify(scene.get(key)!.style))).toEqual(snapshot);
  });

  it('patchStyleCommand changes ONLY the named key, in one step, and the node follows', () => {
    const { canvas, scene } = setup();
    addThree(scene);

    const before = new Map(KEYS.map((key) => [key, { ...scene.get(key)!.style }]));
    const history = new History();
    history.exec(scene.patchStyleCommand([...KEYS], { strokeWidthMu: 16 }, 'Change width'));
    expect(history.depth).toBe(1);

    for (const key of KEYS) {
      const next = scene.get(key)!.style;
      expect(next.strokeWidthMu).toBe(16);
      // Every other key is byte-for-byte the object's own previous value.
      expect(next).toEqual({ ...before.get(key)!, strokeWidthMu: 16 });
      expect(next.strokeColor).toBe(before.get(key)!.strokeColor);
    }

    canvas.markupLayer.draw();
    expect(scene.getNode('id-1')!.findOne<Konva.Rect>('Rect')!.strokeWidth()).toBe(16);
    // The color was not part of the patch and is untouched in the render.
    expect(scene.getNode('id-2')!.findOne<Konva.Rect>('Rect')!.stroke()).toBe('#2FD4E0');

    history.undo();
    for (const key of KEYS) expect(scene.get(key)!.style).toEqual(before.get(key)!);
  });
});

describe('MarkupScene.styleCommand — identical + different starts (§7.4 #2)', () => {
  it('converges a mixed set, undoes to each own start, then un-mixes again', () => {
    const { scene } = setup();
    const shared = style({ strokeColor: '#FF7A18', strokeWidthMu: 4 });
    const other = style({ strokeColor: '#2FD4E0', strokeWidthMu: 8 });
    scene.addMarkup({
      type: 'rect',
      geometry: { kind: 'rect', x: 10, y: 10, width: 40, height: 30 },
      style: shared,
    });
    scene.addMarkup({
      type: 'rect',
      geometry: { kind: 'rect', x: 80, y: 10, width: 40, height: 30 },
      style: shared,
    });
    scene.addMarkup({
      type: 'rect',
      geometry: { kind: 'rect', x: 150, y: 10, width: 40, height: 30 },
      style: other,
    });

    const keys = [...KEYS];
    const stylesNow = () => keys.map((key) => scene.get(key)!.style);

    // Two identical, one different.
    expect(selectionStyleState([scene.get('id-1')!.style, scene.get('id-2')!.style]).mode).toBe('single');
    expect(selectionStyleState(stylesNow()).mode).toBe('mixed');

    const history = new History();
    history.exec(scene.styleCommand(keys, style({ strokeColor: '#000000', strokeWidthMu: 6 }), 'Change style'));
    expect(selectionStyleState(stylesNow()).mode).toBe('single'); // converged

    // Undo restores the "identical" pair together and the odd one to itself.
    history.undo();
    expect(scene.get('id-1')!.style).toEqual(shared);
    expect(scene.get('id-2')!.style).toEqual(shared);
    expect(scene.get('id-3')!.style).toEqual(other);
    expect(selectionStyleState(stylesNow()).mode).toBe('mixed');

    // A key-scoped patch on a SUBSET makes the previously-identical pair mixed again.
    history.exec(scene.patchStyleCommand(['id-1'], { strokeColor: '#FFFFFF' }, 'Change color'));
    expect(selectionStyleState([scene.get('id-1')!.style, scene.get('id-2')!.style]).mode).toBe('mixed');
    expect(scene.get('id-2')!.style.strokeColor).toBe('#FF7A18'); // the subset only
  });
});
