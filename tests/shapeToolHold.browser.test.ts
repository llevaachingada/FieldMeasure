/**
 * `tests/shapeToolHold.browser.test.ts` — D77/F8 regression gate.
 *
 * The defect: hold-to-constrain armed its `contactStart`/`contactStartAt` baseline only on
 * the FIRST contact (`authoredA`). The `placingB` contact never re-armed them, so
 * `maybeConstrain` measured `travel` from the first contact's point — with B ≠ A the travel
 * always exceeded the hold slop and a held second contact could never constrain. The pure
 * `shouldConstrainShape` test (tests/markupTools.test.ts) could not see this: it feeds a
 * fresh clock and a fresh travel, not the tool's shared state (review-brief Q1).
 *
 * Real canvas + real Konva (browser project, D40). The touch hold windows are 600 ms / 16 px
 * (toolTypes HOLD_SHAPE_TOUCH_MS / _PX), so the test uses real time rather than a mocked
 * clock — the defect was precisely that the real elapsed time was measured from the wrong
 * contact.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { ShapeTool } from '../src/editor/tools/ShapeTool';
import { HOLD_SHAPE_TOUCH_MS } from '../src/editor/tools/toolTypes';

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
    newId: () => `shape-${++idCounter}`,
  });
  const history = new History();
  const tool = new ShapeTool('line', {
    canvas,
    scene,
    history,
    getSettings: () => ({
      precisionDenominator: 16,
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      glovedTouch: false,
      fingerDraws: false,
      touchPlaces: true,
      penOnly: false,
    }),
    onSnapshot: () => {},
    labels: { add: 'Add shape', move: 'Move shape', delete: 'Delete shape' },
  });
  return { host, canvas, scene, history, tool };
}

afterEach(() => {
  for (const canvas of canvases.splice(0)) canvas.destroy();
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe('D77/F8 — hold-to-constrain on the SECOND contact', () => {
  it('tap A, then hold-and-drag from a DIFFERENT B constrains to 45°', async () => {
    const ctx = setup();

    // Contact 1: tap A at the origin.
    ctx.tool.onPointerDown({ x: 100, y: 100 }, 'touch');
    ctx.tool.onPointerUp({ x: 100, y: 100 }, true, 'touch');

    // The hold window (600 ms) must be measured from the SECOND contact, so wait it out
    // BEFORE pressing B — with the first contact's clock already elapsed this is exactly
    // the case that used to be impossible.
    await sleep(HOLD_SHAPE_TOUCH_MS + 120);

    // Contact 2: press at B ≠ A, hold past the window, then drag.
    ctx.tool.onPointerDown({ x: 300, y: 200 }, 'touch');
    await sleep(HOLD_SHAPE_TOUCH_MS + 120);
    expect(ctx.tool.onPointerMove({ x: 310, y: 190 }, true)).toBe('consume');
    ctx.tool.onPointerUp({ x: 310, y: 190 }, true, 'touch');

    expect(ctx.scene.list()).toHaveLength(1);
    const ann = ctx.scene.list()[0];
    expect(ann.geometry.kind).toBe('line');
    if (ann.geometry.kind === 'line') {
      const { a, b } = ann.geometry;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      // snapTo45(A, raw): |dx| == |dy|. Pre-fix the raw point (310,190) → |210| vs |90|.
      expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(0.01);
      // And it is not simply the raw drag point.
      expect(b.x).not.toBeCloseTo(310, 3);
    }
  });
});
