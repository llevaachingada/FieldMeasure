/**
 * `tests/dimensionRefine.browser.test.ts` — D77/F2 + D77/F4 regression gate.
 *
 * Both defects live in the WIRING between the placement HUD's «Adjust endpoints» button,
 * the refine drag, the scene's live anchors and Chain — none of it is visible to a pure
 * predicate test (review-brief Q1), so this file drives the real `DimensionTool` against
 * a real `EditorCanvas` + `MarkupScene` (real `Konva.Stage`, browser project per D40).
 *
 *   F2 — «Adjust endpoints» set `phase='refine'` but left `contactRole='none'`, so the
 *        next drag returned `'pan'` and panned the canvas; B never moved. The button path
 *        now enters the SAME refine state as the 40 px-contact path (`beginRefine`).
 *   F4 — after a refine drag moved B via `scene.setAnchor`, `commitValue` still read the
 *        stale `this.b`, so Chain locked the next dimension at the ORIGINAL B. It now
 *        reads the live anchor from the scene at commit time.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  return { host, canvas, scene, history, tool, keypad };
}

/** Touch tap-tap A→B (leaves the settle window running). */
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

describe('D77/F2 — «Adjust endpoints» arms the refine state', () => {
  it('the button path lets a subsequent drag move B, and it is ONE undo step', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    const key = ctx.tool.pendingAnnotationKey!;
    expect(ctx.scene.geometryAt(key)!.b).toEqual({ x: 300, y: 100 });
    const depthBefore = ctx.history.depth; // 1 (the add)

    // The HUD button (SheetEditor:1949 → session.adjustEndpoints).
    ctx.tool.adjustEndpoints();
    expect(ctx.tool.state.phase).toBe('refine');

    // A subsequent drag — the button's contact is already live, so the down must be owned.
    expect(ctx.tool.onPointerDown({ x: 300, y: 100 }, 'touch')).toBe('consume');
    // Pre-fix this returned 'pan' because `contactRole` stayed 'none'.
    expect(ctx.tool.onPointerMove({ x: 300, y: 200 }, true)).toBe('consume');
    ctx.tool.onPointerUp({ x: 300, y: 200 }, false, 'touch');

    // The anchor moved…
    expect(ctx.scene.geometryAt(key)!.b).toEqual({ x: 300, y: 200 });
    // …in exactly one undo step for the whole drag.
    expect(ctx.history.depth).toBe(depthBefore + 1);
    const undone = ctx.history.undo();
    expect(undone?.label).toBe(LABELS.adjust);
    expect(ctx.scene.geometryAt(key)!.b).toEqual({ x: 300, y: 100 });
  });
});

describe('D77/F4 — Chain locks at the refined B', () => {
  it('after a refine, the next dimension starts at the REFINED B, not the original', () => {
    const ctx = setup();
    tapTap(ctx, { x: 100, y: 100 }, { x: 300, y: 100 });
    const key = ctx.tool.pendingAnnotationKey!;

    // Refine B (300,100) → (300,200) through the working 40 px-contact path.
    expect(ctx.tool.onPointerDown({ x: 300, y: 110 }, 'touch')).toBe('consume');
    ctx.tool.onPointerMove({ x: 300, y: 200 }, true);
    ctx.tool.onPointerUp({ x: 300, y: 200 }, false, 'touch');
    expect(ctx.scene.geometryAt(key)!.b).toEqual({ x: 300, y: 200 });

    // Commit with Chain. Pre-fix `commitValue` read the stale `this.b` = (300,100).
    ctx.tool.commitValue({ valueMm: 200 * 25.4, enteredText: `16'-8"`, chain: true });
    expect(ctx.tool.provisionalPoint).toEqual({ x: 300, y: 200 });

    // The next placement's locked A must equal the refined B.
    ctx.tool.onPointerDown({ x: 500, y: 200 }, 'touch');
    ctx.tool.onPointerUp({ x: 500, y: 200 }, true, 'touch');
    expect(ctx.scene.list()).toHaveLength(2);
    const second = ctx.scene.list()[1];
    expect(second.geometry.kind).toBe('dimension');
    if (second.geometry.kind === 'dimension') {
      expect(second.geometry.a).toEqual({ x: 300, y: 200 });
      expect(second.geometry.b).toEqual({ x: 500, y: 200 });
    }
  });
});
