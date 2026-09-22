/**
 * `tests/insetScene.browser.test.ts` — slice 1.7 canvas gates (browser project, D40).
 *
 * These construct a real `Konva.Stage` and read node positions / pixels, so they prove
 * the §8.5 model as RENDERED, not just as pure arithmetic:
 *   - the child round-trip acceptance (scale ×2 + crop move + rotate 30° → save → reload
 *     → the child lands on the same photo content);
 *   - the crop-window glue (children do not slide with the window);
 *   - two insets from one asset have independent children (§8.5:1800);
 *   - Focus dim + one-level nesting, and the clip actually clipping.
 *
 * The scene is given a separate `insetLayer` exactly as the shell must (`canvas.insetLayer`),
 * so the layering rule — markup outside Focus renders above all insets — is real here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Konva from 'konva';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import { assetToInsetLocal, assetToSheet, localInsideCrop, type InsetImageGeometry } from '../src/editor/inset/insetGeometry';
import { InsetFocus } from '../src/editor/inset/InsetFocus';
import { parseMarkupFile } from '../src/domain/schema';

const HOST = 600;
const ASSET = { width: 240, height: 180 };
const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** A solid-colour canvas standing in for a decoded asset. */
function solidCanvas(width: number, height: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return c;
}

function setup(assetColor = '#00CC00'): {
  canvas: EditorCanvas;
  scene: MarkupScene;
  host: HTMLDivElement;
  asset: { image: HTMLCanvasElement; width: number; height: number };
} {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = `${HOST}px`;
  host.style.height = `${HOST}px`;
  document.body.appendChild(host);
  const canvas = new EditorCanvas(host, { markupPixelRatio: () => 1 });
  const asset = { image: solidCanvas(ASSET.width, ASSET.height, assetColor), width: ASSET.width, height: ASSET.height };
  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    insetLayer: canvas.insetLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
    assetProvider: () => asset,
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
  return { canvas, scene, host, asset };
}

function childDimension(id: string, ax: number, ay: number, bx: number, by: number): Annotation {
  return {
    id,
    type: 'dimension',
    geometry: { kind: 'dimension', a: { x: ax, y: ay }, b: { x: bx, y: by } },
    valueMm: 304.8,
    enteredText: '1\'',
    style: { ...DEFAULT_STYLE },
    zIndex: 0,
    source: 'manual',
    assetId: null,
    groupId: null,
    locked: false,
  };
}

const insetAt = (x: number, y: number, width = 240, height = 180): InsetImageGeometry => ({
  kind: 'image',
  x,
  y,
  width,
  height,
  rotation: 0,
});

/** Konva stores `-0` for `-crop.x` when the crop offset is 0; compare numerically. */
function expectPos(node: Konva.Node, x: number, y: number): void {
  expect(node.position().x).toBeCloseTo(x, 6);
  expect(node.position().y).toBeCloseTo(y, 6);
}

describe('child round-trip (the 1.7 acceptance)', () => {
  it('scale ×2 + crop move + rotate 30° survives save → reload at the same photo point', () => {
    const { scene } = setup();
    const inset = scene.addInset('hash-a', insetAt(0, 0)); // crop defaults to the full asset
    const child = childDimension('c1', 12, 20, 22, 20);
    scene.addChildAnnotation(inset.id, child);
    const childKey = `${inset.id}/c1`;

    const fullCrop = { x: 0, y: 0, width: ASSET.width, height: ASSET.height };
    expect(scene.get(childKey)).toBeTruthy();
    expectPos(scene.getNode(childKey)!, 0, 0);
    expect(assetToInsetLocal({ x: 12, y: 20 }, fullCrop)).toEqual({ x: 12, y: 20 });

    // Scale ×2, move the crop window, rotate 30° — children are NEVER rewritten.
    const transformed: InsetImageGeometry = {
      ...insetAt(0, 0, 480, 360),
      rotation: 30,
      crop: { x: 120, y: 0, width: 120, height: 90 },
    };
    scene.setGeometry(inset.id, transformed);

    const stored = scene.get(childKey)!;
    expect(stored.geometry.kind).toBe('dimension');
    if (stored.geometry.kind === 'dimension') {
      expect(stored.geometry.a).toEqual({ x: 12, y: 20 });
      expect(stored.geometry.b).toEqual({ x: 22, y: 20 });
    }
    // Render position = asset − crop, the SAME offset as the asset image.
    expectPos(scene.getNode(childKey)!, -120, 0);
    const cropAfter = { x: 120, y: 0, width: 120, height: 90 };
    expect(assetToInsetLocal({ x: 12, y: 20 }, cropAfter)).toEqual({ x: -108, y: 20 });

    // Save and reload.
    const file = scene.markupFile('sheet-1', 1);
    const json = JSON.stringify(file);
    expect(json).not.toContain('"label"');
    const parsed = JSON.parse(json) as typeof file;

    // The real §3.4 parser accepts the envelope (children are recursive, crop is optional).
    const validated = parseMarkupFile(json);
    expect(validated.success).toBe(true);

    const { scene: restored } = setup();
    restored.load(parsed.objects);
    const restoredInset = restored.get(inset.id)!;
    const restoredChild = restored.get(childKey)!;
    expect(restoredChild).toBeTruthy();
    expect(restoredInset.children).toHaveLength(1);

    if (restoredChild.geometry.kind === 'dimension') {
      expect(restoredChild.geometry.a).toEqual({ x: 12, y: 20 });
    }
    const geom = restoredInset.geometry as InsetImageGeometry;
    const restoredCrop = { x: 120, y: 0, width: 120, height: 90 };
    // The child is glued to the same photo content: same group-local point, and the same
    // asset→sheet mapping because geom + crop round-tripped.
    expect(assetToInsetLocal({ x: 12, y: 20 }, restoredCrop)).toEqual({ x: -108, y: 20 });
    expectPos(restored.getNode(childKey)!, -120, 0);
    // And the visual point is unchanged versus the pre-transform mapping, because the
    // child's ASSET coordinate never moved.
    expect(assetToSheet({ x: 12, y: 20 }, geom, restoredCrop)).toEqual(
      assetToSheet({ x: 12, y: 20 }, transformed, cropAfter),
    );
  });
});

describe('crop-window move keeps children glued to the photo content', () => {
  it('matches the packet trace: asset 2400×1800, crop {0,0,2400,1800}→{600,0,1200,900}', () => {
    // Same trace, expressed on a 2400×1800 coordinate space; the geometry uses the
    // real asset's placed size. We assert the group-local position, which is what the
    // renderer sets and what decides whether the child is clipped.
    const { scene } = setup();
    const inset = scene.addInset('hash-a', inser2400());
    scene.addChildAnnotation(inset.id, childDimension('c1', 120, 200, 220, 200));
    const childKey = `${inset.id}/c1`;

    expectPos(scene.getNode(childKey)!, 0, 0);

    // Move the window to {600,0,1200,900}; the placed rect and child are untouched.
    scene.setGeometry(inset.id, {
      ...inser2400(),
      crop: { x: 600, y: 0, width: 1200, height: 900 },
    });

    const crop = { x: 600, y: 0, width: 1200, height: 900 };
    const local = assetToInsetLocal({ x: 120, y: 200 }, crop);
    expect(local).toEqual({ x: -480, y: 200 }); // the packet's worked trace
    expect(localInsideCrop(local, crop)).toBe(false); // clipped out — glued to asset (120,200)
    expectPos(scene.getNode(childKey)!, -600, 0);
    // It is NOT at screen (120, 200): the asset point maps to group-local (−480, 200).
    expect(local).not.toEqual({ x: 120, y: 200 });
  });
});

describe('two insets from one asset have independent children (§8.5:1800)', () => {
  it('removing a child from one leaves the other untouched', () => {
    const { scene } = setup();
    const a = scene.addInset('hash-shared', insetAt(0, 0));
    const b = scene.addInset('hash-shared', insetAt(300, 0));
    scene.addChildAnnotation(a.id, childDimension('ca', 10, 10, 20, 10));
    scene.addChildAnnotation(b.id, childDimension('cb', 30, 30, 40, 30));

    expect(a.assetId).toBe(b.assetId); // same file, deduped by content hash
    expect(scene.childrenOf(a.id)).toHaveLength(1);
    expect(scene.childrenOf(b.id)).toHaveLength(1);

    scene.removeObject(`${a.id}/ca`);
    expect(scene.childrenOf(a.id)).toHaveLength(0);
    expect(scene.childrenOf(b.id)).toHaveLength(1);
    expect(scene.get(`${b.id}/cb`)).toBeTruthy();
  });
});

describe('layering (§8.1 / §20.2)', () => {
  it('markup lives on the markup layer, insets below it, and a child inside its inset', () => {
    const { canvas, scene } = setup();
    const rect = scene.addMarkup({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 } });
    const inset = scene.addInset('hash-a', insetAt(100, 100));
    scene.addChildAnnotation(inset.id, childDimension('c1', 1, 1, 2, 1));

    expect(scene.getNode(rect.id)!.getParent()).toBe(canvas.markupLayer);
    expect(scene.getNode(inset.id)!.getParent()).toBe(canvas.insetLayer);
    // A child lives INSIDE its inset's group — so it is clipped and scales with it, and
    // it is never a member of a sheet z-band (§20.2).
    expect(scene.getNode(`${inset.id}/c1`)!.getParent()).toBe(scene.getNode(inset.id));
    expect(scene.entries().some((e) => e.key.includes('/'))).toBe(false);
  });

  it('addChildMarkup does the Focus coordinate conversion and refuses a nested inset', () => {
    const { scene } = setup();
    const inset = scene.addInset('hash-a', insetAt(0, 0, 240, 180)); // scale 1, crop full
    const child = scene.addChildMarkup(inset.id, {
      type: 'rect',
      geometry: { kind: 'rect', x: 5, y: 5, width: 10, height: 10 },
    });
    expect(child).toBeTruthy();
    expect(scene.get(`${inset.id}/${child!.id}`)).toBeTruthy();
    // §8.5 hit-test path: sheet → inverse transform → group-local → + crop → asset px.
    expect(scene.assetPointAt(inset.id, { x: 30, y: 40 })).toEqual({ x: 30, y: 40 });
    // One level only: an inset child is refused.
    expect(
      scene.addChildMarkup(inset.id, { type: 'image', geometry: insetAt(0, 0) }),
    ).toBeNull();
  });
});

describe('Focus mode (UI §9:626–634)', () => {
  it('dims everything outside to 35% and only ever holds one inset', () => {
    const { canvas, scene } = setup();
    const a = scene.addInset('hash-a', insetAt(0, 0));
    const b = scene.addInset('hash-b', insetAt(300, 0));
    const focus = new InsetFocus({ canvas, scene, onChange: () => {} });

    expect(focus.enter(a.id)).toBe(true);
    expect(focus.focusedId).toBe(a.id);
    expect(canvas.photoLayer.opacity()).toBeCloseTo(0.35, 6);
    expect(canvas.markupLayer.opacity()).toBeCloseTo(0.35, 6);
    expect(scene.getNode(a.id)!.opacity()).toBeCloseTo(1, 6);
    expect(scene.getNode(b.id)!.opacity()).toBeCloseTo(0.35, 6);

    // One level deep: a second enter changes nothing.
    expect(focus.enter(b.id)).toBe(false);
    expect(focus.focusedId).toBe(a.id);

    focus.exit();
    expect(focus.focusedId).toBeNull();
    expect(canvas.photoLayer.opacity()).toBeCloseTo(1, 6);
    expect(canvas.markupLayer.opacity()).toBeCloseTo(1, 6);
    expect(scene.getNode(b.id)!.opacity()).toBeCloseTo(1, 6);
  });
});

describe('the clip actually clips (draw inside is bounded by the crop window)', () => {
  const countRed = (el: HTMLCanvasElement, x: number, y: number, w: number, h: number): number => {
    const ctx = el.getContext('2d')!;
    const data = ctx.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 180 && data[i + 1] < 100 && data[i + 2] < 100 && data[i + 3] > 128) n += 1;
    }
    return n;
  };

  it('a child outside the crop window does not paint inside the placed rect', () => {
    const { canvas, scene } = setup();
    const inset = scene.addInset('hash-a', insetAt(0, 0, 240, 180)); // 1:1 with the asset
    scene.addChildAnnotation(inset.id, {
      ...childDimension('outsider', -200, 0, -100, 100),
      type: 'rect',
      geometry: { kind: 'rect', x: -200, y: 0, width: 100, height: 100 },
      style: { ...DEFAULT_STYLE, strokeColor: '#FF0000', fillColor: '#FF0000', fillAlpha: 1 },
    });
    canvas.insetLayer.draw();
    const el = canvas.insetLayer.getNativeCanvasElement();
    expect(countRed(el, 0, 0, 240, 180)).toBe(0);

    scene.addChildAnnotation(inset.id, {
      ...childDimension('insider', 20, 20, 60, 60),
      type: 'rect',
      geometry: { kind: 'rect', x: 20, y: 20, width: 40, height: 40 },
      style: { ...DEFAULT_STYLE, strokeColor: '#FF0000', fillColor: '#FF0000', fillAlpha: 1 },
    });
    canvas.insetLayer.draw();
    expect(countRed(el, 0, 0, 240, 180)).toBeGreaterThan(0);
    // The inside child painted only where the asset content is (within the placed rect).
    expect(countRed(el, 24, 24, 32, 32)).toBeGreaterThan(0);
  });
});

/** The packet's 2400×1800 trace, scaled to a 400×300 placed rect. */
function inser2400(): InsetImageGeometry {
  return { kind: 'image', x: 0, y: 0, width: 400, height: 300, rotation: 0 };
}
