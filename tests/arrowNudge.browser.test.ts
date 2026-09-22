/**
 * `tests/arrowNudge.browser.test.ts` — the **arrow-key nudge** (UI §8.2 #9, touch model §2.6),
 * the owed item on this project's list since slice 1.5.
 *
 * WHY THIS TEST IS IN THE BROWSER PROJECT (D40). The nudge is a geometry edit: it moves a real
 * selection on a real canvas and must land as exactly one history step. jsdom's Konva stage cannot
 * hit-test (`getIntersection` returns `null`) and its `toDataURL` is a stub, so a jsdom test would
 * pass without moving anything.
 *
 * The rule the spec pins: **arrow keys nudge a selection 1 px (10 px with Shift)** — image pixels —
 * and it is the **keyboard escape hatch** for the finger's systematic contact offset (the same job
 * the Offset Nudge Pad does on glass). Measured here against a real `MarkupScene`:
 *   1. a nudge moves the selection by exactly the step — 1 px, and 10 px with Shift;
 *   2. it is **one undo step**, and `undo()` restores the exact pre-nudge geometry;
 *   3. a **held** key (autorepeat) coalesces into a single step rather than burying the previous
 *      edit under hundreds of 1 px entries;
 *   4. a nudge with an empty selection is a **no-op**, not an error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { SelectTool } from '../src/editor/tools/SelectTool';
import { DEFAULT_STYLE, type Px } from '../src/domain/types';

const labels = {
  move: 'Move',
  rotate: 'Rotate',
  delete: 'Delete',
  locked: 'Locked',
};

let idCounter = 0;
const hosts: HTMLDivElement[] = [];
const canvases: EditorCanvas[] = [];

/** A real scene + real `SelectTool` over a real Konva canvas, with one committed dimension. */
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
    newId: () => `obj-${++idCounter}`,
  });
  const history = new History();

  let selection: string[] = [];
  const tool = new SelectTool({
    canvas,
    scene,
    history,
    labels,
    getSelection: () => selection,
    setSelection: (next: string[]) => {
      selection = next;
    },
    onSelectionChange: () => {},
    onDeleteToast: () => {},
    onPinnedToolbar: () => {},
  });

  const ann = scene.addAnnotation({
    id: 'dim-1',
    type: 'dimension',
    geometry: { kind: 'dimension', a: { x: 100, y: 100 }, b: { x: 300, y: 100 } },
    valueMm: 304.8,
    enteredText: '12"',
    style: { ...DEFAULT_STYLE },
    zIndex: 1000,
    source: 'manual',
    locked: false,
  });

  const anchors = (): { a: Px; b: Px } => scene.geometryAt('dim-1')!;
  return { canvas, scene, history, tool, ann, anchors, select: () => (selection = ['dim-1']) };
}

afterEach(() => {
  for (const canvas of canvases.splice(0)) canvas.destroy();
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

describe('arrow-key nudge (UI §8.2 #9)', () => {
  it('moves the selection by exactly 1 image px, and 10 px with Shift', () => {
    const ctx = setup();
    ctx.select();
    const before = ctx.anchors();

    ctx.tool.nudgeSelection(1, 0); // ArrowRight
    expect(ctx.anchors().a).toEqual({ x: before.a.x + 1, y: before.a.y });
    expect(ctx.anchors().b).toEqual({ x: before.b.x + 1, y: before.b.y });

    ctx.tool.nudgeSelection(0, -10); // Shift+ArrowUp
    const after = ctx.anchors();
    expect(after.a).toEqual({ x: before.a.x + 1, y: before.a.y - 10 });
  });

  it('is exactly one undo step, and undo restores the pre-nudge geometry', () => {
    const ctx = setup();
    ctx.select();
    const before = ctx.anchors();

    ctx.tool.nudgeSelection(5, 0);
    expect(ctx.anchors().a.x).toBe(before.a.x + 5);

    const undone = ctx.history.undo();
    expect(undone).not.toBeNull();
    // The whole nudge comes back in one step — not five 1 px steps.
    expect(ctx.anchors().a).toEqual(before.a);
    expect(ctx.anchors().b).toEqual(before.b);
  });

  it('coalesces a held key (autorepeat) into ONE step', () => {
    const ctx = setup();
    ctx.select();
    const before = ctx.anchors();

    // A held ArrowRight: many repeats inside the coalesce window.
    for (let i = 0; i < 12; i += 1) ctx.tool.nudgeSelection(1, 0);
    expect(ctx.anchors().a.x).toBe(before.a.x + 12);

    // ONE undo returns to the start: the repeats were one edit, not twelve.
    ctx.history.undo();
    expect(ctx.anchors().a).toEqual(before.a);

    // …and a DIFFERENT direction starts a new step rather than folding into that one: after the
    // held-horizontal burst is undone, one vertical nudge and one horizontal nudge are TWO steps,
    // so a single undo removes only the horizontal one and the vertical move survives.
    ctx.tool.nudgeSelection(0, 1);
    ctx.tool.nudgeSelection(1, 0);
    expect(ctx.anchors().a).toEqual({ x: before.a.x + 1, y: before.a.y + 1 });

    ctx.history.undo();
    expect(ctx.anchors().a).toEqual({ x: before.a.x, y: before.a.y + 1 });
    ctx.history.undo();
    expect(ctx.anchors().a).toEqual(before.a);
  });

  it('is a no-op with an empty selection', () => {
    const ctx = setup();
    const before = ctx.anchors();
    expect(ctx.tool.nudgeSelection(10, 10)).toBeNull();
    expect(ctx.anchors()).toEqual(before);
  });
});
