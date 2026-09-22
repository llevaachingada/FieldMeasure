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
import { buildDimensionGroup } from '../src/editor/shapes/renderDimension';
import { buildShapeGroup } from '../src/editor/shapes/renderShape';
import { buildTextGroup } from '../src/editor/shapes/renderText';
import { DEFAULT_STYLE } from '../src/domain/types';

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

/**
 * F7 helpers: the opaque-pixel bounding box of a colour class inside a screen-space
 * region. `region` is in CSS px (pixelRatio 1 in these tests), so the result IS the
 * rendered extent — not a node attribute.
 */
interface PixelBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

function pixelBBox(
  canvasElement: HTMLCanvasElement,
  region: { x0: number; y0: number; x1: number; y1: number },
  matches: (r: number, g: number, b: number) => boolean,
): PixelBBox | null {
  const ctx = canvasElement.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the layer canvas');
  const x0 = Math.max(0, Math.floor(region.x0));
  const y0 = Math.max(0, Math.floor(region.y0));
  const x1 = Math.min(canvasElement.width, Math.ceil(region.x1));
  const y1 = Math.min(canvasElement.height, Math.ceil(region.y1));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const data = ctx.getImageData(x0, y0, w, h).data;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 128 && matches(data[i], data[i + 1], data[i + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return {
    minX: x0 + minX,
    minY: y0 + minY,
    maxX: x0 + maxX,
    maxY: y0 + maxY,
    cx: x0 + (minX + maxX) / 2,
    cy: y0 + (minY + maxY) / 2,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/** The dimension label's `--sel` outline `#2FD4E0` (47,212,224) — present at every size. */
const isCyan = (r: number, g: number, b: number): boolean => r < 180 && g > 150 && b > 180;
/** The halo / dark ring the label and text-note glyphs sit inside. */
const isDark = (r: number, g: number, b: number): boolean => r < 70 && g < 70 && b < 90;
/** Rasterized glyph fill (white) of a text note. */
const isWhite = (r: number, g: number, b: number): boolean => r > 200 && g > 200 && b > 200;

const LABEL_ANCHORING_TOLERANCE_PX = 2;
const ZOOMS = [1, 4, 0.5] as const;

describe('§4.2 anchored labels and text boxes track zoom (F7)', () => {
  /**
   * F7: `offsetX/offsetY = width()/2` was computed ONCE at build time, but `fontSize`
   * is re-applied on every zoom (`fontSizeMu / s`). The offset therefore kept the OLD
   * half-width while the glyphs shrank/grew, drifting the label off its midpoint. At
   * 4× a dimension label drifted 58.8 CSS px and at 0.5× a text note's glyphs overflowed
   * its box by 162 px — while the §4.2 size-constancy assertions above stayed green.
   */
  it('a centred dimension label keeps its rendered midpoint at 1× / 4× / 0.5×', () => {
    const { canvas } = setup();
    // The label is NOT pushed by the 140-px collision rule (mid↔tip = 140, so
    // `140 < 140` is false), so the geometric anchor is exactly midpoint(a, b).
    const a = { x: -80, y: 40 };
    const b = { x: 200, y: 40 };
    const anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; // (60, 40)
    const group = buildDimensionGroup({
      id: 'dim',
      a,
      b,
      valueMm: 304.8, // 1 ft
      style: { ...DEFAULT_STYLE },
      ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
      scale: 1,
      ghostText: 'tap',
    });
    canvas.markupLayer.add(group);

    for (const s of ZOOMS) {
      // `regenerateInk: false` is the pinch path: the expensive ink outline is deferred,
      // but label anchoring / box fitting must still be correct (F7).
      canvas.zoomAt(s, { x: 0, y: 0 }, { regenerateInk: false });
      canvas.markupLayer.draw();
      const el = canvas.markupLayer.getNativeCanvasElement();
      const expected = { x: anchor.x * s, y: anchor.y * s };
      const bb = pixelBBox(
        el,
        { x0: expected.x - 90, y0: expected.y - 60, x1: expected.x + 90, y1: expected.y + 60 },
        isCyan,
      );
      expect(bb, `no label pixels at ${s}×`).not.toBeNull();
      const drift = Math.hypot(bb!.cx - expected.x, bb!.cy - expected.y);
      expect(drift, `label midpoint drifted ${drift.toFixed(2)} px at ${s}×`).toBeLessThanOrEqual(
        LABEL_ANCHORING_TOLERANCE_PX,
      );
    }
  });

  it('an angle readout keeps its rendered midpoint at 1× / 4× / 0.5×', () => {
    const { canvas } = setup();
    const geometry = {
      kind: 'angle' as const,
      a: { x: 140, y: 40 },
      vertex: { x: 60, y: 40 },
      c: { x: 60, y: 120 },
    };
    const group = buildShapeGroup({
      id: 'angle',
      kind: 'angle',
      geometry,
      style: { ...DEFAULT_STYLE },
      ctx: { scale: 1 },
    });
    canvas.markupLayer.add(group);
    const label = group.findOne('Text') as Konva.Text;
    // The angle readout is the only dark-outlined node; the rays/arc are stroke-coloured.
    const anchor = label.position();

    for (const s of ZOOMS) {
      // `regenerateInk: false` is the pinch path: the expensive ink outline is deferred,
      // but label anchoring / box fitting must still be correct (F7).
      canvas.zoomAt(s, { x: 0, y: 0 }, { regenerateInk: false });
      canvas.markupLayer.draw();
      const el = canvas.markupLayer.getNativeCanvasElement();
      const expected = { x: anchor.x * s, y: anchor.y * s };
      const bb = pixelBBox(
        el,
        { x0: expected.x - 70, y0: expected.y - 60, x1: expected.x + 70, y1: expected.y + 60 },
        isDark,
      );
      expect(bb, `no angle readout pixels at ${s}×`).not.toBeNull();
      const drift = Math.hypot(bb!.cx - expected.x, bb!.cy - expected.y);
      expect(drift, `angle midpoint drifted ${drift.toFixed(2)} px at ${s}×`).toBeLessThanOrEqual(
        LABEL_ANCHORING_TOLERANCE_PX,
      );
    }
  });

  it("a text note keeps its glyphs inside its box at 1× / 4× / 0.5×", () => {
    const { canvas } = setup();
    const text = 'Cracked sill along the north wall of the annex';
    const group = buildTextGroup({
      id: 'note',
      at: { x: 30, y: 40 },
      text,
      background: 'pill',
      style: { ...DEFAULT_STYLE, strokeWidthMu: 4 },
      scale: 1,
    });
    canvas.markupLayer.add(group);
    const box = group.find('Rect')[0] as Konva.Rect;
    const glyphs = group.find('Text')[0] as Konva.Text;
    const padPx = Math.max(4, DEFAULT_STYLE.fontSizeMu * 0.35); // 6.3 CSS px

    for (const s of ZOOMS) {
      // `regenerateInk: false` is the pinch path: the expensive ink outline is deferred,
      // but label anchoring / box fitting must still be correct (F7).
      canvas.zoomAt(s, { x: 0, y: 0 }, { regenerateInk: false });
      canvas.markupLayer.draw();
      const el = canvas.markupLayer.getNativeCanvasElement();
      const gb = glyphs.getClientRect();
      const bb = box.getClientRect();
      const x0 = Math.min(gb.x, bb.x) - 40;
      const y0 = Math.min(gb.y, bb.y) - 40;
      const x1 = Math.max(gb.x + gb.width, bb.x + bb.width) + 40;
      const y1 = Math.max(gb.y + gb.height, bb.y + bb.height) + 40;
      const boxPx = pixelBBox(el, { x0, y0, x1, y1 }, isDark);
      const glyphPx = pixelBBox(el, { x0, y0, x1, y1 }, isWhite);
      expect(boxPx, `no box pixels at ${s}×`).not.toBeNull();
      expect(glyphPx, `no glyph pixels at ${s}×`).not.toBeNull();

      // Containment: every glyph pixel lies inside the box (small antialias slack).
      expect(glyphPx!.minX).toBeGreaterThanOrEqual(boxPx!.minX - 1);
      expect(glyphPx!.maxX).toBeLessThanOrEqual(boxPx!.maxX + 1);
      expect(glyphPx!.minY).toBeGreaterThanOrEqual(boxPx!.minY - 1);
      expect(glyphPx!.maxY).toBeLessThanOrEqual(boxPx!.maxY + 1);

      // The box tracks the glyphs rather than being a stale build-time size on one side
      // or an always-huge box on the other: it is glyph width + the 2× pad.
      expect(boxPx!.width - glyphPx!.width).toBeLessThanOrEqual(padPx * 2 + 10);
      expect(boxPx!.height).toBeLessThanOrEqual(glyphPx!.height + padPx * 2 + 10);
    }
  });
});

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
