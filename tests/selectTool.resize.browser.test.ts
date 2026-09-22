/**
 * tests/selectTool.resize.browser.test.ts — D77 F9 + F6 guards (real Konva stage).
 *
 * UI §8.6: **corner handle = scale with aspect locked; edge handle = free stretch.**
 * A selection handle is not a move handle — dragging one corner must leave the
 * opposite corner fixed. `SelectTool` shipped translating the whole object for every
 * handle (F9). And a handle drag below the 8 px axis-lock slop mutated the document
 * without recording a history step (F6), so the next undo destroyed the object.
 *
 * Session-13 review adds two more: a cancelled drag left the document mutated with no
 * history step (F1), and the past-the-pivot case was asserted with three predicates that
 * were true by construction (F6) while the box actually grew back through its own pivot.
 *
 * This file drives the real `SelectTool` against a real `EditorCanvas` / `MarkupScene`
 * (browser project — jsdom has no canvas, D40). Both pure-decision halves live in
 * `tests/markupTools.test.ts`; the full kind × handle resize table is
 * `tests/selectResize.test.ts` (node).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { History } from '../src/editor/history';
import { handlePositions, SelectTool, type HandleId } from '../src/editor/tools/SelectTool';
import type { Px } from '../src/domain/types';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** Rect under test: image-space (100,100) 120×80, scale 1 → image px === screen px. */
const RECT = { x: 100, y: 100, width: 120, height: 80 };

interface Rig {
  scene: MarkupScene;
  history: History;
  tool: SelectTool;
  selection: string[];
}

function makeRig(): Rig {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = '900px';
  host.style.height = '900px';
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

  const history = new History();
  const selection: string[] = [];
  const tool = new SelectTool({
    canvas,
    scene,
    history,
    getSelection: () => selection,
    setSelection: (keys) => {
      selection.splice(0, selection.length, ...keys);
    },
    onSelectionChange: () => {},
    onPinnedToolbar: () => {},
    labels: { move: 'Move', rotate: 'Rotate', delete: 'Delete', locked: 'Locked' },
  });
  return { scene, history, tool, selection };
}

/** Add the rect through history so a bare `undo()` mirrors the app: it deletes. */
function addRectThroughHistory(rig: Rig): string {
  const key = 'r1';
  rig.history.exec({
    label: 'Add shape',
    do: () =>
      void rig.scene.addMarkup(
        { type: 'rect', geometry: { kind: 'rect', x: RECT.x, y: RECT.y, width: RECT.width, height: RECT.height } },
        key,
      ),
    undo: () => rig.scene.removeObject(key),
  });
  rig.selection.splice(0, rig.selection.length, key);
  rig.tool.refresh();
  return key;
}

function rectOf(rig: Rig, key: string): { x: number; y: number; width: number; height: number } {
  const g = rig.scene.geometryCopy(key);
  if (!g || g.kind !== 'rect') throw new Error(`expected a rect at ${key}`);
  return { x: g.x, y: g.y, width: g.width, height: g.height };
}

function handlePx(bounds: { x: number; y: number; width: number; height: number }, id: HandleId): Px {
  const h = handlePositions(bounds).find((candidate) => candidate.id === id);
  if (!h) throw new Error(`no handle ${id}`);
  return { ...h.p };
}

/** One real handle drag: down on the handle, move to `target`, up. */
function dragHandle(rig: Rig, target: Px, bounds = RECT): void {
  const start = handlePx(bounds, rigHandle(rig));
  rig.tool.onPointerDown(start, 'touch');
  rig.tool.onPointerMove(target, true);
  rig.tool.onPointerUp(target, true, 'touch');
}

/** The handle being dragged is stashed on the rig by the `it.each` body. */
function rigHandle(rig: Rig): HandleId {
  const id = (rig as Rig & { _handle?: HandleId })._handle;
  if (!id) throw new Error('no handle set on rig');
  return id;
}

describe('SelectTool handles resize (§8.6) — D77/F9', () => {
  const cases: Array<{ id: HandleId; target: Px; assert: (g: ReturnType<typeof rectOf>) => void }> = [
    {
      id: 'nw',
      target: { x: RECT.x - 30, y: RECT.y - 30 },
      assert: (g) => {
        // Pivot is the opposite (SE) corner.
        expect(g.x + g.width).toBeCloseTo(RECT.x + RECT.width, 4);
        expect(g.y + g.height).toBeCloseTo(RECT.y + RECT.height, 4);
        expect(g.x).toBeLessThan(RECT.x);
        expect(g.y).toBeLessThan(RECT.y);
      },
    },
    {
      id: 'ne',
      target: { x: RECT.x + RECT.width + 30, y: RECT.y - 30 },
      assert: (g) => {
        // Pivot is the opposite (SW) corner.
        expect(g.x).toBeCloseTo(RECT.x, 4);
        expect(g.y + g.height).toBeCloseTo(RECT.y + RECT.height, 4);
        expect(g.x + g.width).toBeGreaterThan(RECT.x + RECT.width);
        expect(g.y).toBeLessThan(RECT.y);
      },
    },
    {
      id: 'se',
      target: { x: RECT.x + RECT.width + 30, y: RECT.y + RECT.height + 30 },
      assert: (g) => {
        // Pivot is the opposite (NW) corner.
        expect(g.x).toBeCloseTo(RECT.x, 4);
        expect(g.y).toBeCloseTo(RECT.y, 4);
        expect(g.width).toBeGreaterThan(RECT.width);
        expect(g.height).toBeGreaterThan(RECT.height);
      },
    },
    {
      id: 'sw',
      target: { x: RECT.x - 30, y: RECT.y + RECT.height + 30 },
      assert: (g) => {
        // Pivot is the opposite (NE) corner.
        expect(g.x + g.width).toBeCloseTo(RECT.x + RECT.width, 4);
        expect(g.y).toBeCloseTo(RECT.y, 4);
        expect(g.x).toBeLessThan(RECT.x);
        expect(g.height).toBeGreaterThan(RECT.height);
      },
    },
    {
      id: 'n',
      target: { x: RECT.x + RECT.width / 2, y: RECT.y - 30 },
      assert: (g) => {
        // Pivot is the opposite (S) edge; width is untouched.
        expect(g.y + g.height).toBeCloseTo(RECT.y + RECT.height, 4);
        expect(g.width).toBeCloseTo(RECT.width, 4);
        expect(g.x).toBeCloseTo(RECT.x, 4);
        expect(g.y).toBeLessThan(RECT.y);
      },
    },
    {
      id: 's',
      target: { x: RECT.x + RECT.width / 2, y: RECT.y + RECT.height + 30 },
      assert: (g) => {
        expect(g.y).toBeCloseTo(RECT.y, 4);
        expect(g.width).toBeCloseTo(RECT.width, 4);
        expect(g.x).toBeCloseTo(RECT.x, 4);
        expect(g.height).toBeGreaterThan(RECT.height);
      },
    },
    {
      id: 'e',
      target: { x: RECT.x + RECT.width + 30, y: RECT.y + RECT.height / 2 },
      assert: (g) => {
        expect(g.x).toBeCloseTo(RECT.x, 4);
        expect(g.height).toBeCloseTo(RECT.height, 4);
        expect(g.y).toBeCloseTo(RECT.y, 4);
        expect(g.width).toBeGreaterThan(RECT.width);
      },
    },
    {
      id: 'w',
      target: { x: RECT.x - 30, y: RECT.y + RECT.height / 2 },
      assert: (g) => {
        expect(g.x + g.width).toBeCloseTo(RECT.x + RECT.width, 4);
        expect(g.height).toBeCloseTo(RECT.height, 4);
        expect(g.y).toBeCloseTo(RECT.y, 4);
        expect(g.x).toBeLessThan(RECT.x);
      },
    },
  ];

  for (const c of cases) {
    it(`dragging ${c.id} moves that handle and leaves the opposite one fixed`, () => {
      const rig = makeRig();
      (rig as Rig & { _handle?: HandleId })._handle = c.id;
      const key = addRectThroughHistory(rig);
      dragHandle(rig, c.target);
      c.assert(rectOf(rig, key));
    });
  }

  it('corner drag keeps the aspect ratio locked', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    dragHandle(rig, { x: RECT.x - 60, y: RECT.y - 5 }); // deliberately off-diagonal
    const g = rectOf(rig, key);
    // Aspect locked to the original 120:80 = 3:2 …
    expect(g.width / g.height).toBeCloseTo(RECT.width / RECT.height, 5);
    // … with the opposite corner pinned (the pre-fix translation moved it).
    expect(g.x + g.width).toBeCloseTo(RECT.x + RECT.width, 4);
    expect(g.y + g.height).toBeCloseTo(RECT.y + RECT.height, 4);
  });

  it('edge drag is a single-axis stretch: the other dimension is unchanged', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'e';
    const key = addRectThroughHistory(rig);
    // Off-axis dy is deliberately non-zero.
    dragHandle(rig, { x: RECT.x + RECT.width + 30, y: RECT.y + RECT.height / 2 + 20 });
    const g = rectOf(rig, key);
    expect(g.height).toBeCloseTo(RECT.height, 4);
    expect(g.y).toBeCloseTo(RECT.y, 4);
    expect(g.width).toBeCloseTo(RECT.width + 30, 4);
  });

  /**
   * The measured table, replacing three assertions that were true BY CONSTRUCTION
   * (`width > 0`, `height > 0`, pivot pinned): with `factor = Math.max(minScale, ratio)`
   * and `minScale > 0`, no reachable input could ever have failed them, so the test could
   * not see what those drags actually did — the box GREW back past the pivot
   * (120×80 `nw` → (400,400) shipped x = −16.513, w = 236.513: bigger than it started and
   * off-image). The factor is now the projection onto the pivot→handle ray, and every
   * expectation below is derived in-test from that arithmetic, so any change to the factor
   * fails this test.
   *
   * pivot = SE = (220,180); handle − pivot = (100−220, 100−180) = (−120,−80);
   * |handle − pivot|² = 120² + 80² = 20800; minScale = max(1/120, 1/80) = 0.0125.
   */
  const PIVOT = { x: RECT.x + RECT.width, y: RECT.y + RECT.height }; // (220,180)
  const V = { x: RECT.x - PIVOT.x, y: RECT.y - PIVOT.y }; // (−120,−80)
  const DENOM = V.x * V.x + V.y * V.y; // 20800
  const MIN_SCALE = Math.max(1 / RECT.width, 1 / RECT.height); // 0.0125

  const nwFactor = (target: Px): number =>
    Math.max(MIN_SCALE, ((target.x - PIVOT.x) * V.x + (target.y - PIVOT.y) * V.y) / DENOM);

  const pastPivot: Array<{ target: Px; projection: number; shipped: string }> = [
    // (30·−120 + 30·−80)/20800 = −6000/20800 = −0.28846
    { target: { x: 250, y: 210 }, projection: -6000 / 20800, shipped: 'x=184.699 w=35.301 h=23.534' },
    // (80·−120 + 80·−80)/20800 = −16000/20800 = −0.76923
    { target: { x: 300, y: 260 }, projection: -16000 / 20800, shipped: 'x=125.864 w=94.136 h=62.757' },
    // (180·−120 + 220·−80)/20800 = −39200/20800 = −1.88462
    { target: { x: 400, y: 400 }, projection: -39200 / 20800, shipped: 'x=-16.513 w=236.513 h=157.675' },
  ];

  for (const { target, projection, shipped } of pastPivot) {
    it(`nw dragged past the SE pivot to (${target.x},${target.y}) collapses (shipped: ${shipped})`, () => {
      const rig = makeRig();
      (rig as Rig & { _handle?: HandleId })._handle = 'nw';
      const key = addRectThroughHistory(rig);
      dragHandle(rig, target);
      const g = rectOf(rig, key);
      // The pointer is on the far side of the pivot, so the ray projection is negative…
      expect(projection).toBeLessThan(0);
      // …and the factor clamps to minScale: 120×0.0125 = 1.5, 80×0.0125 = 1.
      const factor = nwFactor(target);
      expect(factor).toBeCloseTo(MIN_SCALE, 10);
      expect(g.width).toBeCloseTo(RECT.width * factor, 6); // 1.5
      expect(g.height).toBeCloseTo(RECT.height * factor, 6); // 1
      expect(g.x).toBeCloseTo(PIVOT.x + V.x * factor, 6); // 220 − 1.5 = 218.5
      expect(g.y).toBeCloseTo(PIVOT.y + V.y * factor, 6); // 180 − 1 = 179
      // The pivot is pinned to the last pixel, and the box never grew past it.
      expect(g.x + g.width).toBeCloseTo(PIVOT.x, 9);
      expect(g.y + g.height).toBeCloseTo(PIVOT.y, 9);
      expect(g.width).toBeLessThan(RECT.width);
      expect(g.height).toBeLessThan(RECT.height);
    });
  }

  it('a partial drag toward the pivot shrinks by exactly the projected factor', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    // nw → (200,170), still on the pivot's side:
    // ((200−220)·−120 + (170−180)·−80)/20800 = (2400 + 800)/20800 = 0.1538461…
    const target = { x: 200, y: 170 };
    const factor = nwFactor(target);
    expect(factor).toBeCloseTo(3200 / 20800, 12);
    dragHandle(rig, target);
    const g = rectOf(rig, key);
    expect(g.width).toBeCloseTo(120 * factor, 6); // 18.4615…
    expect(g.height).toBeCloseTo(80 * factor, 6); // 12.3077…
    expect(g.x).toBeCloseTo(220 - 120 * factor, 6); // 201.5385…
    expect(g.y).toBeCloseTo(180 - 80 * factor, 6); // 167.6923…
  });

  it('an outward drag scales by the projected factor, aspect locked', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    // nw → (70,70): ((70−220)·−120 + (70−180)·−80)/20800 = (18000 + 8800)/20800
    //             = 26800/20800 = 1.2884615…  (the old distance ratio read 1.2897…)
    const target = { x: 70, y: 70 };
    const factor = nwFactor(target);
    expect(factor).toBeCloseTo(26800 / 20800, 12);
    dragHandle(rig, target);
    const g = rectOf(rig, key);
    expect(g.width).toBeCloseTo(120 * factor, 6); // 154.6154…
    expect(g.height).toBeCloseTo(80 * factor, 6); // 103.0769…
    expect(g.width / g.height).toBeCloseTo(RECT.width / RECT.height, 9);
    expect(g.x + g.width).toBeCloseTo(PIVOT.x, 9);
    expect(g.y + g.height).toBeCloseTo(PIVOT.y, 9);
  });

  it('an edge handle dragged past its pivot collapses too (F8/2), pivot pinned (F8/1)', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'n';
    const key = addRectThroughHistory(rig);
    // n → y = 400, far below the south pivot at 180:
    // factor = (400 − 180)/(100 − 180) = −2.75 → clamped to 1/80 = 0.0125.
    // Shipped behaviour was x=100 y=180 w=120 h=220 — the north edge 220 px BELOW the
    // old south edge, while `SelectTool` documents that a corner can never flip.
    dragHandle(rig, { x: RECT.x + RECT.width / 2, y: 400 });
    const g = rectOf(rig, key);
    expect(g.height).toBeCloseTo(80 * (1 / 80), 9); // 1
    expect(g.y).toBeCloseTo(180 - 1, 9); // 179
    expect(g.y + g.height).toBeCloseTo(180, 9); // the south pivot, exactly
    expect(g.y).toBeLessThan(180);
    // The cross axis is untouched by an edge stretch.
    expect(g.x).toBeCloseTo(RECT.x, 9);
    expect(g.width).toBeCloseTo(RECT.width, 9);
  });
});

describe('SelectTool sub-slop drag is one undoable step — D77/F6', () => {
  it('a 3 px handle drag is undoable and does not remove the object', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    const before = rectOf(rig, key);

    // 3 px of screen travel < the 8 px axis-lock slop.
    rig.tool.onPointerDown(handlePx(before, 'nw'), 'touch');
    rig.tool.onPointerMove({ x: before.x + 3, y: before.y + 2 }, false);
    rig.tool.onPointerUp({ x: before.x + 3, y: before.y + 2 }, false, 'touch');

    // The drag changed geometry, so it must be exactly one undoable step…
    const undone = rig.history.undo();
    expect(undone).not.toBeNull();
    // … and one undo restores the pre-drag geometry without deleting the object.
    expect(rig.scene.get(key)).toBeTruthy();
    expect(rectOf(rig, key)).toEqual(before);
  });

  it('a handle press that never moves records no step', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    const before = rectOf(rig, key);
    const depthBefore = rig.history.depth;

    rig.tool.onPointerDown(handlePx(before, 'nw'), 'touch');
    rig.tool.onPointerUp(handlePx(before, 'nw'), true, 'touch');

    expect(rig.history.depth).toBe(depthBefore);
    expect(rectOf(rig, key)).toEqual(before);
  });
});

describe('F1 — an interrupted handle drag restores geometry and records NOTHING', () => {
  /**
   * `updateTransform` writes every intermediate frame through `scene.setGeometry`, which
   * `SheetEditor` persists to markup.json via `scene.onChange`; only `endTransform`
   * records a history step. So a `pointercancel` (palm rejection, browser interrupt — a
   * gloved hand on a Surface) used to leave a mutation that undo could not reach, and
   * `onToolChange` left `transform` set so the NEXT press captured the mutated geometry
   * as its baseline and made the orphan permanent.
   */
  for (const via of ['onPointerCancel', 'onToolChange'] as const) {
    it(`${via}: geometry is byte-identical to the pre-drag geometry and depth is unchanged`, () => {
      const rig = makeRig();
      (rig as Rig & { _handle?: HandleId })._handle = 'nw';
      const key = addRectThroughHistory(rig);
      const before = JSON.stringify(rig.scene.geometryCopy(key));
      const depthBefore = rig.history.depth;

      rig.tool.onPointerDown(handlePx(RECT, 'nw'), 'touch');
      rig.tool.onPointerMove({ x: RECT.x - 40, y: RECT.y - 40 }, true);
      // The live drag really did mutate the document — without this the guard would be
      // vacuous (it would pass on a tool that never wrote anything at all).
      expect(JSON.stringify(rig.scene.geometryCopy(key))).not.toBe(before);
      expect(rig.tool.pending).toBe(true);

      if (via === 'onPointerCancel') rig.tool.onPointerCancel();
      else rig.tool.onToolChange();

      expect(JSON.stringify(rig.scene.geometryCopy(key))).toBe(before);
      expect(rig.history.depth).toBe(depthBefore);
      // `transform` is cleared, so the next press cannot inherit the cancelled drag.
      expect(rig.tool.pending).toBe(false);
    });
  }

  it('the drag AFTER a cancel is measured from the original geometry, not the orphan', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);

    // Drag, then cancel.
    rig.tool.onPointerDown(handlePx(RECT, 'nw'), 'touch');
    rig.tool.onPointerMove({ x: RECT.x - 40, y: RECT.y - 40 }, true);
    rig.tool.onPointerCancel();

    // A fresh drag to (70,70): factor = ((70−220)·−120 + (70−180)·−80)/20800
    //                                = 26800/20800 = 1.2884615… of the ORIGINAL 120×80.
    dragHandle(rig, { x: 70, y: 70 });
    const factor = 26800 / 20800;
    const g = rectOf(rig, key);
    expect(g.width).toBeCloseTo(RECT.width * factor, 6); // 154.6154…
    expect(g.height).toBeCloseTo(RECT.height * factor, 6); // 103.0769…
    // Exactly one step for the whole episode: the cancelled drag recorded none.
    expect(rig.history.depth).toBe(2); // 1 = "Add shape", 2 = this drag
    rig.history.undo();
    expect(rectOf(rig, key)).toEqual(RECT);
  });
});
