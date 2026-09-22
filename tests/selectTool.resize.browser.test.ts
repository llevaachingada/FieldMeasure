/**
 * tests/selectTool.resize.browser.test.ts — D77 F9 + F6 guards (real Konva stage).
 *
 * UI §8.6: **corner handle = scale with aspect locked; edge handle = free stretch.**
 * A selection handle is not a move handle — dragging one corner must leave the
 * opposite corner fixed. `SelectTool` shipped translating the whole object for every
 * handle (F9). And a handle drag below the 8 px axis-lock slop mutated the document
 * without recording a history step (F6), so the next undo destroyed the object.
 *
 * This file drives the real `SelectTool` against a real `EditorCanvas` / `MarkupScene`
 * (browser project — jsdom has no canvas, D40). Both pure-decision halves live in
 * `tests/markupTools.test.ts`.
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

  it('a corner dragged past the pivot never flips the box (no negative/zero edge)', () => {
    const rig = makeRig();
    (rig as Rig & { _handle?: HandleId })._handle = 'nw';
    const key = addRectThroughHistory(rig);
    // Target is beyond the SE pivot (220,180): the distance ratio stays positive.
    dragHandle(rig, { x: 400, y: 400 });
    const g = rectOf(rig, key);
    expect(g.width).toBeGreaterThan(0);
    expect(g.height).toBeGreaterThan(0);
    // Pivot still pinned — the box grew past it rather than turning inside out.
    expect(g.x + g.width).toBeCloseTo(RECT.x + RECT.width, 4);
    expect(g.y + g.height).toBeCloseTo(RECT.y + RECT.height, 4);
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
