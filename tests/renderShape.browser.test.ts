/**
 * `tests/renderShape.browser.test.ts` — D133 (UI/GUI handoff pass): the arrow elbow
 * reaches the actual Konva node, not just the pure `elbowPoints` helper
 * (`tests/geometry.test.ts` already pins that arithmetic). Browser project because
 * `Konva.Arrow` needs a real canvas to construct its pointer geometry (D40).
 */
import { describe, expect, it } from 'vitest';
import Konva from 'konva';
import { DEFAULT_STYLE } from '../src/domain/types';
import { elbowPoints } from '../src/domain/geometry';
import { buildShapeGroup, shapeBounds } from '../src/editor/shapes/renderShape';

const A = { x: 20, y: 30 };
const B = { x: 220, y: 90 };
const CTX = { scale: 1 };

function arrowNode(elbow?: 'straight' | 'right' | 'curved'): Konva.Arrow {
  const group = buildShapeGroup({
    id: 'arrow-1',
    kind: 'arrow',
    geometry: { kind: 'arrow', a: A, b: B, elbow },
    style: DEFAULT_STYLE,
    ctx: CTX,
  });
  return group.getChildren()[0] as Konva.Arrow;
}

describe('buildShapeGroup — arrow elbow (D133)', () => {
  it('straight (absent) is the plain two-point arrow — unchanged from before D133', () => {
    const node = arrowNode();
    expect(node.points()).toEqual([A.x, A.y, B.x, B.y]);
    expect(node.tension()).toBe(0);
  });

  for (const elbow of ['right', 'curved'] as const) {
    it(`${elbow} elbow's Konva node carries exactly what elbowPoints computes`, () => {
      const node = arrowNode(elbow);
      const expected = elbowPoints({ a: A, b: B, elbow });
      expect(node.points()).toEqual(expected.points);
      expect(node.tension()).toBe(expected.tension);
    });
  }

  it('a right elbow still points its arrowhead at B (last-segment direction)', () => {
    // pointerAtEnding defaults true when arrowheads is 'none' (buildArrow's own fallback
    // — an arrow with literally no visible head would be indistinguishable from a line).
    const node = arrowNode('right');
    expect(node.pointerAtEnding()).toBe(true);
    // Konva.Arrow computes the end pointer from the LAST TWO points — corner→B here,
    // i.e. the vertical segment (corner.x === B.x) — checked via the points array
    // itself rather than a private Konva angle API.
    const pts = node.points();
    expect(pts.slice(-4)).toEqual([B.x, A.y, B.x, B.y]);
  });
});

describe('shapeBounds — arrow (D133)', () => {
  it('straight/right elbow bounds equal the plain a/b box', () => {
    const straight = shapeBounds({ kind: 'arrow', a: A, b: B });
    const right = shapeBounds({ kind: 'arrow', a: A, b: B, elbow: 'right' });
    const expected = {
      x: Math.min(A.x, B.x),
      y: Math.min(A.y, B.y),
      width: Math.abs(B.x - A.x),
      height: Math.abs(B.y - A.y),
    };
    expect(straight).toEqual(expected);
    expect(right).toEqual(expected);
  });

  it('a curved elbow bounds is strictly taller than the a/b box (the control point bows out)', () => {
    const straightBox = shapeBounds({ kind: 'arrow', a: A, b: B });
    const curvedBox = shapeBounds({ kind: 'arrow', a: A, b: B, elbow: 'curved' });
    expect(curvedBox.height).toBeGreaterThan(straightBox.height);
    // Still contains the straight box (the curve never moves the endpoints).
    expect(curvedBox.x).toBeLessThanOrEqual(straightBox.x);
    expect(curvedBox.x + curvedBox.width).toBeGreaterThanOrEqual(straightBox.x + straightBox.width);
  });
});
