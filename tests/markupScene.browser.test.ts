/**
 * tests/markupScene.browser.test.ts — slice 1.6 canvas gates.
 *
 * Runs in the `browser` Vitest project: it constructs a real `Konva.Stage` and reads
 * pixels, so jsdom would pass without testing anything (D40).
 *
 *   - **Ink zoom constancy:** a freehand stroke drawn at 100 % then zoomed to 8× renders
 *     the same CSS-px width (`size = strokeWidthMu / s` regeneration works — a fill
 *     ignores `strokeScaleEnabled`).
 *   - **Highlighter z-band:** inserted below all other markup, above the photo.
 *   - **Persistence round-trip:** `markupFile()` → `load()` restores the document, with
 *     no stored `label` anywhere.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Konva from 'konva';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE } from '../src/domain/types';

const HOST_SIZE = 900;
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function setup(): { canvas: EditorCanvas; scene: MarkupScene; host: HTMLDivElement } {
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
  return { canvas, scene, host };
}

function columnThickness(
  canvasElement: HTMLCanvasElement,
  x: number,
  yCenter: number,
  span = 12,
): number {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) throw new Error('no 2D context');
  const y0 = Math.max(0, Math.round(yCenter - span));
  const data = ctx.getImageData(Math.round(x), y0, 1, span * 2).data;
  let count = 0;
  for (let i = 0; i < span * 2; i += 1) if (data[i * 4 + 3] > 128) count += 1;
  return count;
}

describe('ink zoom constancy (§4.2)', () => {
  it('a freehand stroke keeps its CSS-px width from 100% to 8×', () => {
    const { canvas, scene } = setup();
    const points = Array.from({ length: 25 }, (_, i) => ({ x: 10 + i * 3, y: 100 }));
    const pressure = points.map(() => 0.5);
    scene.addMarkup({
      type: 'freehand',
      geometry: { kind: 'freehand', points, pressure },
      style: { ...DEFAULT_STYLE, strokeColor: '#FFFFFF', strokeWidthMu: 8 },
    });

    const node = scene.getNode('id-1');
    expect(node).toBeTruthy();
    const path = node!.findOne<Konva.Path>('Path');
    expect(path).toBeTruthy();
    const rect1 = path!.getSelfRect().height;

    canvas.markupLayer.draw();
    const el = canvas.markupLayer.getNativeCanvasElement();
    const thickness1 = columnThickness(el, 50, 100);

    // Zoom to 8× about the origin and regenerate the outline (§4.2 zoomend).
    canvas.zoomAt(8, { x: 0, y: 0 });
    canvas.regenerateInk();
    canvas.markupLayer.draw();
    const thickness8 = columnThickness(el, 400, 800);
    const rect8 = path!.getSelfRect().height;

    // Constant rendered width...
    expect(thickness1).toBeGreaterThan(0);
    expect(thickness8).toBe(thickness1);
    // ...because the outline is regenerated smaller in image space.
    expect(rect8).toBeLessThan(rect1);
  });
});

describe('highlighter z-band (§20.2)', () => {
  it('sits below all other markup and above the photo', () => {
    const { scene } = setup();
    scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 10, y: 10, width: 40, height: 40 } });
    scene.addMarkup({
      type: 'highlight',
      geometry: { kind: 'highlight', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], pressure: [0.5, 0.5] },
      style: { ...DEFAULT_STYLE, strokeColor: '#FFD400', strokeWidthMu: 24 },
    });

    const kinds = scene.entries().map((e) => e.kind);
    expect(kinds[0]).toBe('highlight');
    expect(kinds[1]).toBe('rect');

    const layerKinds = scene
      .list()
      .slice()
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((a) => a.type);
    expect(layerKinds[0]).toBe('highlight');
    expect(scene.list().every((a) => (a.type === 'highlight' ? a.zIndex < 1000 : a.zIndex >= 1000))).toBe(true);
  });

  it('renders multiply at 30% alpha', () => {
    const { scene } = setup();
    scene.addMarkup({
      type: 'highlight',
      geometry: { kind: 'highlight', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], pressure: [0.5, 0.5] },
      style: { ...DEFAULT_STYLE, strokeColor: '#FFD400', strokeWidthMu: 24 },
    });
    const path = scene.getNode('id-1')!.findOne<Konva.Path>('Path')!;
    expect(path.globalCompositeOperation()).toBe('multiply');
    expect(path.opacity()).toBeCloseTo(0.3, 6);
  });
});

describe('markup persistence (§5.4 / D70)', () => {
  it('round-trips the document through markupFile() → load(), with no stored label', () => {
    const { scene } = setup();
    scene.addMarkup({ type: 'line', geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } } });
    scene.addMarkup({
      type: 'freehand',
      geometry: { kind: 'freehand', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], pressure: [0.5, 0.5] },
    });

    const file = scene.markupFile('sheet-1', 1);
    expect(file.sheetId).toBe('sheet-1');
    expect(file.objects).toHaveLength(2);
    expect(JSON.stringify(file)).not.toContain('"label"');

    const { scene: restored } = setup();
    restored.load(file.objects);
    expect(restored.list()).toHaveLength(2);
    expect(restored.list().map((a) => a.type).sort()).toEqual(['freehand', 'line']);
  });
});
