/**
 * tests/dimensionTool.browser.test.ts — the placement machine's WIRING (plan slice 1.5).
 *
 * The pure decisions are unit-tested in `tests/dimensionMachine.test.ts`. The lesson of
 * the F1 review finding is that a passing predicate proves nothing about the caller, so
 * this file drives the real `DimensionTool` against a real `EditorCanvas` (real
 * `Konva.Stage` → browser project, D40) and asserts the observable outcomes:
 *
 *   - tap-tap A→B commits at tap B;
 *   - the keypad auto-opens after 450 ms only if no contact occurred;
 *   - a contact during the settle window cancels the auto-open PERMANENTLY and the
 *     geometry survives (and ✓ Value re-opens it);
 *   - Chain starts the next dimension locked at the previous B;
 *   - labels are derived (no stored `label`), re-derived when precision changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Konva from 'konva';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { Loupe } from '../src/editor/Loupe';
import { DimensionTool } from '../src/editor/tools/DimensionTool';
import type { Px } from '../src/domain/types';

const LABELS = {
  add: 'Add dimension',
  move: 'Move dimension',
  delete: 'Delete dimension',
  setValue: 'Set dimension value',
  adjust: 'Adjust dimension',
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let idCounter = 0;
const hosts: HTMLDivElement[] = [];
const canvases: EditorCanvas[] = [];

function setup() {
  idCounter = 0;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:800px;height:600px;';
  document.body.appendChild(host);
  hosts.push(host);

  const canvas = new EditorCanvas(host);
  canvas.resize(800, 600);
  canvases.push(canvas);

  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
    newId: () => `dim-${++idCounter}`,
  });
  const history = new History();
  const loupe = new Loupe({
    layer: canvas.overlayLayer,
    getImage: () => null,
    getScale: () => canvas.scale,
    screenToImage: (p) => canvas.screenToImage(p),
    getViewport: () => ({ width: 800, height: 600 }),
    getHandedness: () => 'right',
  });
  const keypad = vi.fn();
  const tool = new DimensionTool({
    canvas,
    scene,
    history,
    loupe,
    getSettings: () => ({
      precisionDenominator: 16,
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      handedness: 'right',
      magnifierOnTap: true,
      glovedTouch: false,
    }),
    onKeypadOpen: keypad,
    onSnapshot: () => {},
    labels: LABELS,
  });
  return { kind: 'ok' as const, host, canvas, scene, history, tool, keypad };
}

/** Tap-tap A→B, leaving the settle window running. */
function tapTap(context: ReturnType<typeof setup>, a: Px, b: Px): void {
  context.tool.onPointerDown(a, 'touch');
  context.tool.onPointerUp(a, true, 'touch');
  context.tool.onPointerDown(b, 'touch');
  context.tool.onPointerUp(b, true, 'touch');
}

afterEach(() => {
  for (const canvas of canvases.splice(0)) canvas.destroy();
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe('tap-tap placement commits at tap B', () => {
  it('the first tap places A only; the second commits the geometry at B', () => {
    const ctx = setup();
    ctx.tool.onPointerDown({ x: 100, y: 100 }, 'touch');
    ctx.tool.onPointerUp({ x: 100, y: 100 }, true, 'touch');
    expect(ctx.tool.state.phase).toBe('anchorA');
    expect(ctx.scene.list()).toHaveLength(0);

    ctx.tool.onPointerDown({ x: 300, y: 150 }, 'touch');
    ctx.tool.onPointerUp({ x: 300, y: 150 }, true, 'touch');
    expect(ctx.scene.list()).toHaveLength(1);
    expect(ctx.tool.state.phase).toBe('anchorB');
    const geometry = ctx.scene.geometryAt(ctx.tool.pendingAnnotationKey!)!;
    expect(geometry.a).toEqual({ x: 100, y: 100 });
    expect(geometry.b).toEqual({ x: 300, y: 150 });
  });

  it('a pen drag is the SAME machine: A on down, B on up', () => {
    const ctx = setup();
    ctx.tool.onPointerDown({ x: 50, y: 50 }, 'pen');
    ctx.tool.onPointerMove({ x: 200, y: 50 }, true);
    ctx.tool.onPointerUp({ x: 250, y: 60 }, false, 'pen');
    expect(ctx.scene.list()).toHaveLength(1);
  });
});

describe('the 450 ms settle window (touch model §1.4)', () => {
  it('auto-opens the keypad when no contact occurs', async () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    expect(ctx.keypad).not.toHaveBeenCalled(); // not instantly
    await sleep(520);
    expect(ctx.keypad).toHaveBeenCalledTimes(1);
    expect(ctx.keypad.mock.calls[0][0]).toMatchObject({ key: ctx.scene.list()[0].id });
  });

  it('a canvas contact cancels the auto-open PERMANENTLY and the geometry survives', async () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    // Contact 400 px away from both anchors → pan (and cancel the auto-open).
    const action = ctx.tool.onPointerDown({ x: 500, y: 400 }, 'touch');
    expect(action).toBe('pan');
    await sleep(520);
    expect(ctx.keypad).not.toHaveBeenCalled();
    // Geometry survived: still one dimension, still committed at B.
    expect(ctx.scene.list()).toHaveLength(1);
    expect(ctx.tool.state.phase).toBe('anchorB');
    // The keypad then opens only via the explicit ✓ Value.
    ctx.tool.requestKeypad();
    expect(ctx.keypad).toHaveBeenCalledWith({
      key: ctx.scene.list()[0].id,
      initialValueMm: null,
    });
  });

  it('a contact within 40 px of an anchor enters RefineEndpoint, and refining does not re-arm', async () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    const action = ctx.tool.onPointerDown({ x: 320, y: 100 }, 'touch'); // 20 px from B
    expect(action).toBe('consume');
    expect(ctx.tool.state.phase).toBe('refine');
    await sleep(520);
    expect(ctx.keypad).not.toHaveBeenCalled();
  });
});

describe('chain', () => {
  it('starts the next dimension locked at the previous B', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    ctx.tool.commitValue({ valueMm: 150 * 25.4, enteredText: `12'-6"`, chain: true });
    expect(ctx.tool.state.phase).toBe('anchorA');
    expect(ctx.tool.provisionalPoint).toEqual({ x: 300, y: 100 });

    // The next tap commits a second dimension starting at B.
    ctx.tool.onPointerDown({ x: 500, y: 100 }, 'touch');
    ctx.tool.onPointerUp({ x: 500, y: 100 }, true, 'touch');
    expect(ctx.scene.list()).toHaveLength(2);
    const second = ctx.scene.list()[1];
    expect(second.geometry.kind).toBe('dimension');
    if (second.geometry.kind === 'dimension') {
      expect(second.geometry.a).toEqual({ x: 300, y: 100 });
      expect(second.geometry.b).toEqual({ x: 500, y: 100 });
    }
  });

  it('cancelling the value keeps the geometry (Valueless ghost)', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    ctx.tool.cancelValue();
    expect(ctx.scene.list()).toHaveLength(1);
    expect(ctx.tool.state.phase).toBe('idle');
    expect(ctx.scene.list()[0].valueMm).toBeNull();
  });
});

describe('labels are derived, never stored', () => {
  function scanForLabel(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(scanForLabel);
    if (node && typeof node === 'object') {
      return Object.entries(node as Record<string, unknown>).some(
        ([key, value]) => key === 'label' || scanForLabel(value),
      );
    }
    return false;
  }

  it('the serialized document has no `label` key anywhere', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    ctx.tool.commitValue({ valueMm: 3819.525, enteredText: `12'-6 3/8"`, chain: false });
    const serialized = ctx.scene.serialize();
    expect(serialized).toHaveLength(1);
    expect(scanForLabel(serialized)).toBe(false);
  });

  it('a precision change re-derives the rendered label text', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    ctx.tool.commitValue({ valueMm: 150.4 * 25.4, enteredText: `12'-6 3/8"`, chain: false });

    const readLabels = (): string[] => {
      const group = ctx.canvas.markupLayer.getChildren()[0] as Konva.Group;
      return (group.find('Text') as Konva.Text[]).map((node) => node.text());
    };
    const at16 = readLabels();
    expect(at16.every((text) => text === `12'-6 3/8"`)).toBe(true);

    ctx.scene.setContext({
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 2,
    });
    const at2 = readLabels();
    expect(at2.every((text) => text === `12'-6 1/2"`)).toBe(true);
    expect(at2[0]).not.toBe(at16[0]);
  });
});
