/**
 * tests/editorCanvas.browser.test.ts — the §4.2 SCREEN scaling gate (slice 1.3).
 *
 * This constructs a real `Konva.Stage`, so it MUST run in the `browser` Vitest
 * project, never jsdom (D40: jsdom's canvas is a stub, so the test would pass without
 * a canvas). It renders a test stroke (`strokeWidthMu: 4`), a freehand stroke
 * (`strokeWidthMu: 4`) and a label (`fontSizeMu: 18`) at 1× / 4× / 8× and asserts the
 * CSS-pixel widths are constant while geometry scales — the invariant four later
 * slices build on.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Konva from 'konva';
import {
  EditorCanvas,
  screenInkConfig,
  screenStrokeConfig,
  screenTextConfig,
} from '../src/editor/EditorCanvas';

const HOST_SIZE = 400;
const STROKE_MU = 4;
const INK_MU = 4;
const TEXT_MU = 18;
const STROKE_POINTS = [2, 10, 40, 10];
const INK_POINTS = [
  { x: 2, y: 24 },
  { x: 20, y: 24 },
  { x: 40, y: 24 },
];

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function setup(options?: ConstructorParameters<typeof EditorCanvas>[1]): {
  host: HTMLDivElement;
  canvas: EditorCanvas;
} {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = `${HOST_SIZE}px`;
  host.style.height = `${HOST_SIZE}px`;
  document.body.appendChild(host);
  const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1, ...options });
  cleanups.push(() => {
    canvas.destroy();
    host.remove();
  });
  return { host, canvas };
}

/**
 * Count opaque pixels in a vertical column through `yCenter`. With pixelRatio 1 these
 * are CSS px, so the count IS the rendered stroke/ink thickness.
 */
function columnThickness(
  canvasElement: HTMLCanvasElement,
  x: number,
  yCenter: number,
  span = 6,
): number {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the layer canvas');
  const y0 = Math.max(0, Math.round(yCenter - span));
  const height = span * 2;
  const data = ctx.getImageData(Math.round(x), y0, 1, height).data;
  let count = 0;
  for (let i = 0; i < height; i += 1) {
    if (data[i * 4 + 3] > 128) count += 1;
  }
  return count;
}

function addTestMarkup(canvas: EditorCanvas, scale: number) {
  const stroke = new Konva.Line({
    points: STROKE_POINTS,
    stroke: '#ffffff',
    ...screenStrokeConfig(STROKE_MU),
  });
  const ink = new Konva.Line({
    fill: '#ffffff',
    ...screenInkConfig(INK_POINTS, INK_MU, scale),
  });
  const text = new Konva.Text({
    text: '18',
    fill: '#ffffff',
    x: 2,
    y: 36,
    fontFamily: 'Arial',
    ...screenTextConfig(TEXT_MU, scale),
  });
  canvas.markupLayer.add(stroke, ink, text);
  return { stroke, ink, text };
}

/**
 * Rendered glyph ink width in canvas px: scan the label's own client rect for opaque
 * pixels and return maxX − minX + 1. This measures actual rasterized glyphs, not the
 * `fontSize` attribute.
 */
function inkBBoxWidth(
  canvasElement: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): number {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the layer canvas');
  const margin = 2;
  const x0 = Math.max(0, Math.floor(rect.x) - margin);
  const y0 = Math.max(0, Math.floor(rect.y) - margin);
  const x1 = Math.min(canvasElement.width, Math.ceil(rect.x + rect.width) + margin);
  const y1 = Math.min(canvasElement.height, Math.ceil(rect.y + rect.height) + margin);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return 0;
  const data = ctx.getImageData(x0, y0, w, h).data;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < minX) return 0;
  return maxX - minX + 1;
}

describe('§4.2 screen scaling is constant across zoom', () => {
  it('stroke and ink stay 4 CSS px, glyph fontSizeMu stays 18 CSS px, geometry scales', () => {
    const { canvas } = setup();
    const { stroke, ink, text } = addTestMarkup(canvas, 1);
    const zooms = [1, 4, 8];
    const strokeThickness: number[] = [];
    const inkThickness: number[] = [];
    const inkLocalHeights: number[] = [];
    const textInkWidths: number[] = [];

    for (const s of zooms) {
      // Pivot at the image origin so image (x, y) maps to screen (x·s, y·s).
      canvas.zoomAt(s, { x: 0, y: 0 });
      canvas.markupLayer.draw();
      const el = canvas.markupLayer.getNativeCanvasElement();

      strokeThickness.push(columnThickness(el, 20 * s, 10 * s));
      inkThickness.push(columnThickness(el, 20 * s, 24 * s));
      inkLocalHeights.push(ink.getSelfRect().height);
      textInkWidths.push(inkBBoxWidth(el, text.getClientRect()));

      // Text: fontSize is counter-scaled so the rendered glyph is fontSizeMu CSS px.
      expect(text.fontSize() * canvas.scale).toBeCloseTo(TEXT_MU, 6);
      // Strokes: the config is never touched; strokeScaleEnabled:false does the work.
      expect(stroke.strokeWidth()).toBe(STROKE_MU);
      expect(stroke.strokeScaleEnabled()).toBe(false);

      // Geometry itself scales with zoom (§4.1).
      const back = canvas.screenToImage({ x: 20 * s, y: 10 * s });
      expect(back.x).toBeCloseTo(20, 6);
      expect(back.y).toBeCloseTo(10, 6);
    }

    // Constant thickness (allow ±1 px of antialiasing, but equal across zooms).
    expect(new Set(strokeThickness).size).toBe(1);
    expect(strokeThickness[0]).toBeGreaterThanOrEqual(3);
    expect(strokeThickness[0]).toBeLessThanOrEqual(5);
    expect(new Set(inkThickness).size).toBe(1);
    expect(inkThickness[0]).toBeGreaterThanOrEqual(3);
    expect(inkThickness[0]).toBeLessThanOrEqual(5);

    // The ink OUTLINE is regenerated in image space: it shrinks as zoom grows, which is
    // exactly how a constant CSS-px width is achieved for a filled path.
    expect(inkLocalHeights[0]).toBeGreaterThan(inkLocalHeights[2]);

    // F5: the TEXT rule is proven by rendered glyph pixels, not the attribute alone —
    // the label's opaque ink bounding box is identical at 1×/4×/8× (the counter-scaled
    // fontSize makes the rasterized glyphs the same CSS-px size at every zoom).
    expect(textInkWidths[0]).toBeGreaterThanOrEqual(8); // a real "18" glyph box, not a stray pixel
    expect(textInkWidths[0]).toBeLessThanOrEqual(30);
    expect(new Set(textInkWidths).size).toBe(1);
  });
});

describe('§8.1.1 pixel ratio', () => {
  it('photo layer is 1; markup/inset/overlay/drag are min(devicePixelRatio, 2)', () => {
    const { canvas } = setup({ markupPixelRatio: undefined });
    const expected = Math.min(window.devicePixelRatio || 1, 2);
    expect(canvas.photoLayer.getCanvas().getPixelRatio()).toBe(1);
    for (const layer of [canvas.markupLayer, canvas.insetLayer, canvas.overlayLayer, canvas.dragLayer]) {
      expect(layer.getCanvas().getPixelRatio()).toBe(expected);
    }
  });

  it('photo layer stays listening:false (§8.1)', () => {
    const { canvas } = setup();
    expect(canvas.photoLayer.listening()).toBe(false);
    for (const layer of [canvas.markupLayer, canvas.insetLayer, canvas.overlayLayer, canvas.dragLayer]) {
      expect(layer.listening()).toBe(true);
    }
  });
});

describe('zoom range and fit (UI §5.4)', () => {
  it('clamps setZoom to 0.25×–8×', () => {
    const { canvas } = setup();
    canvas.setZoom(100);
    expect(canvas.scale).toBe(8);
    canvas.setZoom(0.01);
    expect(canvas.scale).toBe(0.25);
  });

  it('fit centres the photo; double-tap toggles fit ↔ 100%', () => {
    const { canvas } = setup();
    const source = document.createElement('canvas');
    source.width = 800;
    source.height = 600;
    canvas.setPhoto(source, 800, 600);

    canvas.fit();
    // min(400/800, 400/600) = 0.5; centred: y = (400 − 600×0.5)/2 = 50.
    expect(canvas.scale).toBeCloseTo(0.5, 5);
    expect(canvas.imageToScreen({ x: 0, y: 0 })).toEqual({ x: 0, y: 50 });

    canvas.setZoom(1);
    canvas.toggleFitOrFull(); // at 100% → fit
    expect(canvas.scale).toBeCloseTo(0.5, 5);
    canvas.toggleFitOrFull(); // at fit → 100%
    expect(canvas.scale).toBeCloseTo(1, 5);
  });

  it('panBy moves the stage position', () => {
    const { canvas } = setup();
    canvas.panBy(12, -7);
    expect(canvas.stage.position()).toEqual({ x: 12, y: -7 });
  });

  it('hitObject is null with no annotations (and does not throw)', () => {
    const { canvas } = setup();
    expect(canvas.hitObject({ x: 10, y: 10 })).toBeNull();
  });
});

describe('pinch (hand-rolled in touchmove, Konva has none)', () => {
  function touch(id: number, target: EventTarget, x: number, y: number): Touch {
    return new Touch({ identifier: id, target, clientX: x, clientY: y });
  }
  function gesture(
    type: string,
    target: EventTarget,
    touches: Array<[number, number, number]>,
    changed: Array<[number, number, number]> = touches,
  ): TouchEvent {
    const toTouches = (points: Array<[number, number, number]>): Touch[] =>
      points.map(([id, x, y]) => touch(id, target, x, y));
    return new TouchEvent(type, {
      touches: toTouches(touches),
      targetTouches: toTouches(touches),
      // A real touchend carries the lifted finger in `changedTouches` with an empty
      // `touches`; Konva's `_pointerup` requires a non-empty changed list.
      changedTouches: toTouches(changed),
      bubbles: true,
      cancelable: true,
    });
  }

  it('zooms by the finger-distance ratio about the midpoint and preventDefaults', () => {
    const { canvas } = setup();
    const content = canvas.stage.content;
    content.dispatchEvent(gesture('touchstart', content, [[1, 150, 200], [2, 250, 200]]));

    // 100 px apart → 200 px apart = 2×; midpoint stays (200, 200).
    const move = gesture('touchmove', content, [[1, 100, 200], [2, 300, 200]]);
    content.dispatchEvent(move);
    expect(canvas.scale).toBeCloseTo(2, 3);
    expect(move.defaultPrevented).toBe(true);

    // Pivot = pinch midpoint: the image point under the midpoint never moves.
    const pivotBefore = canvas.screenToImage({ x: 200, y: 200 });
    content.dispatchEvent(gesture('touchmove', content, [[1, 150, 200], [2, 250, 200]]));
    expect(canvas.scale).toBeCloseTo(1, 3);
    const pivotAfter = canvas.screenToImage({ x: 200, y: 200 });
    expect(pivotAfter.x).toBeCloseTo(pivotBefore.x, 3);
    expect(pivotAfter.y).toBeCloseTo(pivotBefore.y, 3);

    content.dispatchEvent(gesture('touchend', content, [], [[1, 150, 200], [2, 250, 200]]));
  });

  it('a single-finger touchmove is ignored (no preventDefault, no zoom)', () => {
    const { canvas } = setup();
    const content = canvas.stage.content;
    content.dispatchEvent(gesture('touchstart', content, [[1, 150, 200]]));
    const move = gesture('touchmove', content, [[1, 100, 200]]);
    content.dispatchEvent(move);
    expect(canvas.scale).toBe(1);
    expect(move.defaultPrevented).toBe(false);
    content.dispatchEvent(gesture('touchend', content, [], [[1, 100, 200]]));
  });
});
