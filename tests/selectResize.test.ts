/**
 * tests/selectResize.test.ts — the resize table for EVERY geometry kind (node project).
 *
 * `scaleGeometryForHandle` was module-private and the only rig that could reach it
 * (`tests/selectTool.resize.browser.test.ts`) used a `rect` in all 11 of its cases, so no
 * non-box kind was covered anywhere. Two defects lived in that gap (session-13 review):
 *
 *   F2 — every vertex kind teleported one vertex onto the bounding box on the first pixel
 *        of drag (the handle sits on the BOX, not on a vertex, and the old code assigned
 *        the absolute `target` to the nearest vertex). 1 px of `n` drag on the dimension
 *        a(100,100) b(300,200) moved `a` to (199,99) — a 99.005 px jump — and on a
 *        freehand it yanked one RAW input point out of the stroke while `pressure[]`
 *        (a parallel array) stayed aligned to where the pen no longer was.
 *   F6 — a corner dragged PAST its pivot grew the box again, because the factor was a raw
 *        distance ratio that ignores direction.
 *
 * Everything here is arithmetic on a pure function: no Konva.Stage, hence node (D40).
 *
 * The shared fixture bounds are **{x:100, y:100, width:200, height:100}** for every kind,
 * so one target table drives them all:
 *
 *   handle  pivot (opposite handle)   target                       factor
 *   nw      (300,200)                 (0,50)   = 300−200·1.5, 200−100·1.5      1.5
 *   n       y=200                     (200,50)                                 1.5 (y only)
 *   ne      (100,200)                 (400,50) = 100+200·1.5, 200−100·1.5      1.5
 *   e       x=100                     (400,150)                                1.5 (x only)
 *   se      (100,100)                 (400,250)= 100+200·1.5, 100+100·1.5      1.5
 *   s       y=100                     (200,250)                                1.5 (y only)
 *   sw      (300,100)                 (0,250)  = 300−200·1.5, 100+100·1.5      1.5
 *   w       x=300                     (0,150)                                  1.5 (x only)
 *
 * Each target sits ON the pivot→handle ray, so the projection factor is exactly 1.5:
 * f = ((target−pivot)·(handle−pivot)) / |handle−pivot|², and for a target = pivot + v·1.5
 * that is (1.5·|v|²)/|v|² = 1.5 exactly. Off-ray, clamped and degenerate inputs are pinned
 * in their own blocks below.
 */
import { describe, expect, it } from 'vitest';
import {
  resizeScaleFor,
  scaleGeometryForHandle,
  HANDLE_IDS,
  type Bounds,
  type HandleId,
} from '../src/editor/tools/SelectTool';
import type { Geometry, Px } from '../src/domain/types';

/** The bounds every fixture below spans. */
const B: Bounds = { x: 100, y: 100, width: 200, height: 100 };

/** Handle → the drag target that scales `B` by exactly 1.5 about the opposite handle. */
const TARGET_1_5: Record<HandleId, Px> = {
  nw: { x: 0, y: 50 },
  n: { x: 200, y: 50 },
  ne: { x: 400, y: 50 },
  e: { x: 400, y: 150 },
  se: { x: 400, y: 250 },
  s: { x: 200, y: 250 },
  sw: { x: 0, y: 250 },
  w: { x: 0, y: 150 },
};

/** Handle → the pivot and the per-axis factors that drag must produce. */
const SCALE_1_5: Record<HandleId, { pivot: Px; sx: number; sy: number }> = {
  nw: { pivot: { x: 300, y: 200 }, sx: 1.5, sy: 1.5 },
  n: { pivot: { x: 100, y: 200 }, sx: 1, sy: 1.5 },
  ne: { pivot: { x: 100, y: 200 }, sx: 1.5, sy: 1.5 },
  e: { pivot: { x: 100, y: 100 }, sx: 1.5, sy: 1 },
  se: { pivot: { x: 100, y: 100 }, sx: 1.5, sy: 1.5 },
  s: { pivot: { x: 100, y: 100 }, sx: 1, sy: 1.5 },
  sw: { pivot: { x: 300, y: 100 }, sx: 1.5, sy: 1.5 },
  w: { pivot: { x: 300, y: 100 }, sx: 1.5, sy: 1 },
};

function bounds(points: readonly Px[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function vertices(g: Geometry): Px[] {
  switch (g.kind) {
    case 'dimension':
    case 'line':
    case 'arrow':
      return [g.a, g.b];
    case 'angle':
      return [g.a, g.vertex, g.c];
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return g.points;
    case 'rect':
    case 'ellipse':
    case 'image':
      return [
        { x: g.x, y: g.y },
        { x: g.x + g.width, y: g.y + g.height },
      ];
    case 'text':
      return [g.at];
  }
}

/* ------------------------------------------------------------------ *
 * The scale itself (pivot + factors), handle by handle
 * ------------------------------------------------------------------ */

describe('resizeScaleFor — pivot and factor per handle (§8.6)', () => {
  for (const handle of HANDLE_IDS) {
    it(`${handle}: the opposite handle is the pivot and the on-ray factor is 1.5`, () => {
      const scale = resizeScaleFor(B, handle, TARGET_1_5[handle]);
      expect(scale).not.toBeNull();
      const expected = SCALE_1_5[handle];
      expect(scale!.sx).toBeCloseTo(expected.sx, 10);
      expect(scale!.sy).toBeCloseTo(expected.sy, 10);
      // Only the scaled axes need the pivot pinned; an edge handle leaves the cross axis
      // at factor 1, where any pivot coordinate is inert (p + (v−p)·1 === v).
      if (expected.sx !== 1) expect(scale!.pivot.x).toBeCloseTo(expected.pivot.x, 10);
      if (expected.sy !== 1) expect(scale!.pivot.y).toBeCloseTo(expected.pivot.y, 10);
    });
  }
});

/* ------------------------------------------------------------------ *
 * Literal ground truth: rect, dimension, angle — all 8 handles
 * ------------------------------------------------------------------ */

describe('scaleGeometryForHandle — rect, every handle (literal expectations)', () => {
  const rect: Geometry = { kind: 'rect', x: 100, y: 100, width: 200, height: 100 };
  // x' = pivotX + (100 − pivotX)·sx, y' = pivotY + (100 − pivotY)·sy, w' = 200·sx, h' = 100·sy.
  const expected: Record<HandleId, { x: number; y: number; width: number; height: number }> = {
    // pivot (300,200): x = 300 − 200·1.5 = 0, y = 200 − 100·1.5 = 50
    nw: { x: 0, y: 50, width: 300, height: 150 },
    // pivot y=200, sx=1: x stays 100, y = 200 − 100·1.5 = 50
    n: { x: 100, y: 50, width: 200, height: 150 },
    // pivot (100,200): x = 100 + 0·1.5 = 100, y = 50
    ne: { x: 100, y: 50, width: 300, height: 150 },
    // pivot x=100, sy=1: y and height untouched
    e: { x: 100, y: 100, width: 300, height: 100 },
    // pivot (100,100): the NW corner is the fixed point
    se: { x: 100, y: 100, width: 300, height: 150 },
    // pivot y=100
    s: { x: 100, y: 100, width: 200, height: 150 },
    // pivot (300,100): x = 300 − 200·1.5 = 0, y stays 100
    sw: { x: 0, y: 100, width: 300, height: 150 },
    // pivot x=300: x = 300 − 200·1.5 = 0
    w: { x: 0, y: 100, width: 300, height: 100 },
  };
  for (const handle of HANDLE_IDS) {
    it(`${handle}`, () => {
      const g = scaleGeometryForHandle(rect, B, handle, TARGET_1_5[handle]);
      expect(g).toEqual({ kind: 'rect', ...expected[handle] });
    });
  }
});

describe('scaleGeometryForHandle — dimension, every handle (literal expectations)', () => {
  // a is the NW corner of the bounds, b the SE corner — so every handle moves at least one
  // of them, and the pre-fix code had a vertex to teleport in every case.
  const dim: Geometry = { kind: 'dimension', a: { x: 100, y: 100 }, b: { x: 300, y: 200 } };
  const expected: Record<HandleId, { a: Px; b: Px }> = {
    // pivot (300,200) = b, so b is pinned; a = (300 − 200·1.5, 200 − 100·1.5)
    nw: { a: { x: 0, y: 50 }, b: { x: 300, y: 200 } },
    // pivot y=200, sx=1: a.y = 200 − 100·1.5 = 50, b is on the pivot line
    n: { a: { x: 100, y: 50 }, b: { x: 300, y: 200 } },
    // pivot (100,200): a.x = 100 (on the pivot), a.y = 50; b = (100 + 200·1.5, 200)
    ne: { a: { x: 100, y: 50 }, b: { x: 400, y: 200 } },
    // pivot x=100, sy=1: only b.x moves → 100 + 200·1.5 = 400
    e: { a: { x: 100, y: 100 }, b: { x: 400, y: 200 } },
    // pivot (100,100) = a, so a is pinned; b = (100 + 200·1.5, 100 + 100·1.5)
    se: { a: { x: 100, y: 100 }, b: { x: 400, y: 250 } },
    // pivot y=100: b.y = 100 + 100·1.5 = 250
    s: { a: { x: 100, y: 100 }, b: { x: 300, y: 250 } },
    // pivot (300,100): a = (300 − 200·1.5, 100), b = (300, 100 + 100·1.5)
    sw: { a: { x: 0, y: 100 }, b: { x: 300, y: 250 } },
    // pivot x=300, sy=1: a.x = 300 − 200·1.5 = 0
    w: { a: { x: 0, y: 100 }, b: { x: 300, y: 200 } },
  };
  for (const handle of HANDLE_IDS) {
    it(`${handle}`, () => {
      const g = scaleGeometryForHandle(dim, B, handle, TARGET_1_5[handle]);
      expect(g).toEqual({ kind: 'dimension', ...expected[handle] });
    });
  }
});

describe('scaleGeometryForHandle — angle, every handle (literal expectations)', () => {
  // a(100,200) vertex(100,100) c(300,100): the same bounds, with a THIRD point so a
  // per-vertex rule cannot hide behind a two-point fixture.
  const angle: Geometry = {
    kind: 'angle',
    a: { x: 100, y: 200 },
    vertex: { x: 100, y: 100 },
    c: { x: 300, y: 100 },
  };
  const expected: Record<HandleId, { a: Px; vertex: Px; c: Px }> = {
    // pivot (300,200): a = (300 − 200·1.5, 200), vertex = (0, 200 − 100·1.5), c = (300, 50)
    nw: { a: { x: 0, y: 200 }, vertex: { x: 0, y: 50 }, c: { x: 300, y: 50 } },
    // pivot y=200, sx=1: a is on the pivot line, vertex/c rise to 200 − 100·1.5 = 50
    n: { a: { x: 100, y: 200 }, vertex: { x: 100, y: 50 }, c: { x: 300, y: 50 } },
    // pivot (100,200): x=100 is pinned, c.x = 100 + 200·1.5 = 400
    ne: { a: { x: 100, y: 200 }, vertex: { x: 100, y: 50 }, c: { x: 400, y: 50 } },
    // pivot x=100, sy=1: only c.x moves
    e: { a: { x: 100, y: 200 }, vertex: { x: 100, y: 100 }, c: { x: 400, y: 100 } },
    // pivot (100,100) = vertex, so the vertex is pinned
    se: { a: { x: 100, y: 250 }, vertex: { x: 100, y: 100 }, c: { x: 400, y: 100 } },
    // pivot y=100: a.y = 100 + 100·1.5 = 250
    s: { a: { x: 100, y: 250 }, vertex: { x: 100, y: 100 }, c: { x: 300, y: 100 } },
    // pivot (300,100) = c
    sw: { a: { x: 0, y: 250 }, vertex: { x: 0, y: 100 }, c: { x: 300, y: 100 } },
    // pivot x=300, sy=1
    w: { a: { x: 0, y: 200 }, vertex: { x: 0, y: 100 }, c: { x: 300, y: 100 } },
  };
  for (const handle of HANDLE_IDS) {
    it(`${handle}`, () => {
      const g = scaleGeometryForHandle(angle, B, handle, TARGET_1_5[handle]);
      expect(g).toEqual({ kind: 'angle', ...expected[handle] });
    });
  }
});

/* ------------------------------------------------------------------ *
 * Every remaining kind × every handle, against the same pivot/factor table
 * ------------------------------------------------------------------ */

describe('scaleGeometryForHandle — every kind scales EVERY vertex about the pivot', () => {
  const FREEHAND_POINTS: Px[] = [
    { x: 100, y: 100 },
    { x: 150, y: 180 },
    { x: 200, y: 140 },
    { x: 250, y: 200 },
    { x: 300, y: 150 },
  ];
  const PRESSURE = [0.1, 0.4, 0.6, 0.8, 0.5];
  const fixtures: Array<{ name: string; geometry: Geometry }> = [
    { name: 'line', geometry: { kind: 'line', a: { x: 100, y: 100 }, b: { x: 300, y: 200 } } },
    {
      name: 'arrow',
      geometry: { kind: 'arrow', a: { x: 100, y: 200 }, b: { x: 300, y: 100 }, elbow: 'right' },
    },
    { name: 'ellipse', geometry: { kind: 'ellipse', x: 100, y: 100, width: 200, height: 100 } },
    {
      name: 'image',
      geometry: { kind: 'image', x: 100, y: 100, width: 200, height: 100, rotation: 0 },
    },
    {
      name: 'polygon',
      geometry: {
        kind: 'polygon',
        // The second point is INTERIOR to the bounds: a per-vertex rule would leave it put.
        points: [
          { x: 100, y: 100 },
          { x: 200, y: 120 },
          { x: 300, y: 100 },
          { x: 300, y: 200 },
          { x: 100, y: 200 },
        ],
        closed: true,
      },
    },
    {
      name: 'freehand',
      geometry: { kind: 'freehand', points: FREEHAND_POINTS.map((p) => ({ ...p })), pressure: [...PRESSURE] },
    },
    {
      name: 'highlight',
      geometry: { kind: 'highlight', points: FREEHAND_POINTS.map((p) => ({ ...p })), pressure: [...PRESSURE] },
    },
  ];

  for (const { name, geometry } of fixtures) {
    for (const handle of HANDLE_IDS) {
      it(`${name} — ${handle}`, () => {
        const before = vertices(geometry).map((p) => ({ ...p }));
        expect(bounds(before)).toEqual(B); // the fixture really does span the table's bounds
        const { pivot, sx, sy } = SCALE_1_5[handle];
        const out = scaleGeometryForHandle(geometry, B, handle, TARGET_1_5[handle]);
        const after = vertices(out);
        expect(after).toHaveLength(before.length);
        after.forEach((p, i) => {
          // v' = pivot + (v − pivot)·factor, with the literal pivot/factor of the table.
          expect(p.x).toBeCloseTo(pivot.x + (before[i].x - pivot.x) * sx, 9);
          expect(p.y).toBeCloseTo(pivot.y + (before[i].y - pivot.y) * sy, 9);
        });
        // The input geometry is never mutated in place.
        expect(vertices(geometry)).toEqual(before);
      });
    }
  }

  it('freehand pressure[] is untouched by a pure coordinate scale (parallel array)', () => {
    const g: Geometry = {
      kind: 'freehand',
      points: FREEHAND_POINTS.map((p) => ({ ...p })),
      pressure: [...PRESSURE],
    };
    for (const handle of HANDLE_IDS) {
      const out = scaleGeometryForHandle(g, B, handle, TARGET_1_5[handle]);
      if (out.kind !== 'freehand') throw new Error('kind changed');
      expect(out.pressure).toEqual(PRESSURE);
      expect(out.points).toHaveLength(out.pressure.length);
    }
  });

  it('arrow/polygon keep their non-geometry channels', () => {
    const arrow: Geometry = {
      kind: 'arrow',
      a: { x: 100, y: 100 },
      b: { x: 300, y: 200 },
      elbow: 'curved',
    };
    const out = scaleGeometryForHandle(arrow, B, 'se', TARGET_1_5.se);
    expect(out).toEqual({
      kind: 'arrow',
      // pivot (100,100), factor 1.5: b = (100 + 200·1.5, 100 + 100·1.5)
      a: { x: 100, y: 100 },
      b: { x: 400, y: 250 },
      elbow: 'curved',
    });
  });
});

/* ------------------------------------------------------------------ *
 * F2 — no vertex teleport on the first pixel of drag
 * ------------------------------------------------------------------ */

describe('F2 — one pixel of drag moves no vertex more than ~1.5 px', () => {
  const dim: Geometry = { kind: 'dimension', a: { x: 100, y: 100 }, b: { x: 300, y: 200 } };
  const angle: Geometry = {
    kind: 'angle',
    a: { x: 100, y: 200 },
    vertex: { x: 100, y: 100 },
    c: { x: 300, y: 100 },
  };

  function maxJump(before: Geometry, after: Geometry): number {
    const a = vertices(before);
    const b = vertices(after);
    return Math.max(...a.map((p, i) => Math.hypot(b[i].x - p.x, b[i].y - p.y)));
  }

  for (const handle of HANDLE_IDS) {
    it(`${handle}: dimension and angle both stay within 1.5 px`, () => {
      const at = {
        nw: { x: 100, y: 100 },
        n: { x: 200, y: 100 },
        ne: { x: 300, y: 100 },
        e: { x: 300, y: 150 },
        se: { x: 300, y: 200 },
        s: { x: 200, y: 200 },
        sw: { x: 100, y: 200 },
        w: { x: 100, y: 150 },
      }[handle];
      const target = { x: at.x - 1, y: at.y - 1 };
      // Pre-fix numbers for the same inputs (executed): nw 1.414, n 99.005, ne 101.005,
      // e 51.010 — the handle sits on the bounding BOX, so assigning `target` to the
      // nearest vertex snapped that vertex onto the box on the very first pixel.
      expect(maxJump(dim, scaleGeometryForHandle(dim, B, handle, target))).toBeLessThanOrEqual(1.5);
      expect(maxJump(angle, scaleGeometryForHandle(angle, B, handle, target))).toBeLessThanOrEqual(1.5);
    });
  }

  it('the exact 1 px `n` drag on the dimension moves `a` by exactly 1 px', () => {
    // n: pivot y=200, v = 100 − 200 = −100, target.y = 99 → sy = (99 − 200)/(−100) = 1.01.
    // a.y = 200 + (100 − 200)·1.01 = 200 − 101 = 99 (a 1.000 px move, was a 99.005 px jump).
    const out = scaleGeometryForHandle(dim, B, 'n', { x: 199, y: 99 });
    expect(out).toEqual({ kind: 'dimension', a: { x: 100, y: 99 }, b: { x: 300, y: 200 } });
  });

  it('one interior freehand point is not yanked out of the stroke', () => {
    const g: Geometry = {
      kind: 'freehand',
      points: [
        { x: 100, y: 100 },
        { x: 150, y: 180 },
        { x: 200, y: 140 },
        { x: 250, y: 200 },
        { x: 300, y: 150 },
      ],
      pressure: [0.1, 0.4, 0.6, 0.8, 0.5],
    };
    // se handle at (300,200), dragged 1 px to (299,199). pivot (100,100), v = (200,100),
    // |v|² = 50000; f = ((199·200) + (99·100))/50000 = (39800 + 9900)/50000 = 0.994.
    const out = scaleGeometryForHandle(g, B, 'se', { x: 299, y: 199 });
    if (out.kind !== 'freehand') throw new Error('kind changed');
    // Interior point (200,140) → (100 + 100·0.994, 100 + 40·0.994) = (199.4, 139.76):
    // a 0.62 px move, not the 1-vertex spike the old code put in the stroke.
    expect(out.points[2].x).toBeCloseTo(199.4, 9);
    expect(out.points[2].y).toBeCloseTo(139.76, 9);
    expect(Math.hypot(out.points[2].x - 200, out.points[2].y - 140)).toBeLessThan(1);
    expect(out.pressure).toEqual([0.1, 0.4, 0.6, 0.8, 0.5]);
  });
});

/* ------------------------------------------------------------------ *
 * F6 / F8 — the projection clamp, on every kind
 * ------------------------------------------------------------------ */

describe('F6 — a corner dragged past its pivot collapses, never grows', () => {
  const rect: Geometry = { kind: 'rect', x: 100, y: 100, width: 120, height: 80 };
  const RB: Bounds = { x: 100, y: 100, width: 120, height: 80 };
  // minScale = max(1/120, 1/80) = 0.0125 → 120·0.0125 = 1.5 wide, 80·0.0125 = 1 high.
  const COLLAPSED = { kind: 'rect', x: 218.5, y: 179, width: 1.5, height: 1 };

  const past: Array<{ target: Px; projection: number; was: string }> = [
    // proj = ((t−pivot)·(handle−pivot))/|handle−pivot|², pivot SE (220,180),
    // handle−pivot = (−120,−80), |·|² = 20800.
    // (30·−120 + 30·−80)/20800 = −6000/20800 = −0.2885
    { target: { x: 250, y: 210 }, projection: -6000 / 20800, was: 'x=184.699 w=35.301' },
    // (80·−120 + 80·−80)/20800 = −16000/20800 = −0.7692
    { target: { x: 300, y: 260 }, projection: -16000 / 20800, was: 'x=125.864 w=94.136' },
    // (180·−120 + 220·−80)/20800 = −39200/20800 = −1.8846
    { target: { x: 400, y: 400 }, projection: -39200 / 20800, was: 'x=-16.513 w=236.513' },
  ];

  for (const { target, projection, was } of past) {
    it(`nw → (${target.x},${target.y}) — projection ${projection.toFixed(4)} (was ${was})`, () => {
      expect(projection).toBeLessThan(0); // past the pivot ⇒ the ray projection is negative
      const scale = resizeScaleFor(RB, 'nw', target);
      expect(scale!.sx).toBeCloseTo(0.0125, 10); // clamped to minScale, not the projection
      const g = scaleGeometryForHandle(rect, RB, 'nw', target);
      expect(g).toEqual(COLLAPSED);
      // The SE pivot is pinned to the last pixel: 218.5 + 1.5 = 220, 179 + 1 = 180.
      if (g.kind !== 'rect') throw new Error('kind changed');
      expect(g.x + g.width).toBeCloseTo(220, 10);
      expect(g.y + g.height).toBeCloseTo(180, 10);
    });
  }

  it('a drag perpendicular to the diagonal leaves the box unchanged (projection 1)', () => {
    // pivot (220,180), handle (100,100), v = (−120,−80). A step along (−80,120) — the
    // perpendicular — adds ((−80)(−120) + 120(−80)) = 9600 − 9600 = 0 to the dot product,
    // so f = 20800/20800 = 1. The old distance ratio GREW the box here
    // (hypot(200,−40)/hypot(120,80) = 203.96/144.22 = 1.414).
    const g = scaleGeometryForHandle(rect, RB, 'nw', { x: 20, y: 220 });
    expect(g).toEqual(rect);
  });

  it('an in-line drag away from the pivot still scales normally', () => {
    // nw → (70,70): f = ((70−220)(−120) + (70−180)(−80))/20800 = (18000 + 8800)/20800
    //             = 26800/20800 = 1.288461538…  (the raw distance ratio read 1.28975)
    const f = 26800 / 20800;
    const g = scaleGeometryForHandle(rect, RB, 'nw', { x: 70, y: 70 });
    if (g.kind !== 'rect') throw new Error('kind changed');
    expect(g.width).toBeCloseTo(120 * f, 9); // 154.6153…
    expect(g.height).toBeCloseTo(80 * f, 9); // 103.0769…
    expect(g.width / g.height).toBeCloseTo(120 / 80, 12); // aspect still locked
    expect(g.x + g.width).toBeCloseTo(220, 9);
    expect(g.y + g.height).toBeCloseTo(180, 9);
  });

  it('the same clamp applies to a vertex kind (no growing dimension either)', () => {
    const dim: Geometry = { kind: 'dimension', a: { x: 100, y: 100 }, b: { x: 300, y: 200 } };
    // nw past the SE pivot (300,200); minScale = max(1/200, 1/100) = 0.01.
    const out = scaleGeometryForHandle(dim, B, 'nw', { x: 500, y: 400 });
    expect(out).toEqual({
      kind: 'dimension',
      // a = (300 + (100−300)·0.01, 200 + (100−200)·0.01) = (298, 199)
      a: { x: 298, y: 199 },
      b: { x: 300, y: 200 },
    });
  });
});

describe('F8 — the edge branch obeys the corner rules', () => {
  const RB: Bounds = { x: 100, y: 100, width: 120, height: 80 };
  const rect: Geometry = { kind: 'rect', x: 100, y: 100, width: 120, height: 80 };

  it('1 — the pivot stays pinned when the min clamp bites', () => {
    // n dragged to y = 179.5 with the south pivot at 180. Raw factor
    // (179.5 − 180)/(100 − 180) = 0.00625 < minScale 1/80 = 0.0125 → clamped.
    // y = 180 + (100 − 180)·0.0125 = 179, h = 80·0.0125 = 1 → south edge 179 + 1 = 180.
    // (The old pair `y = min(pivot, target)` / `h = max(1, |target − pivot|)` gave
    //  y = 179.5, h = 1 → a south edge at 180.5, 0.5 px off its own pivot.)
    const g = scaleGeometryForHandle(rect, RB, 'n', { x: 160, y: 179.5 });
    if (g.kind !== 'rect') throw new Error('kind changed');
    expect(g.y).toBeCloseTo(179, 10);
    expect(g.height).toBeCloseTo(1, 10);
    expect(g.y + g.height).toBeCloseTo(180, 10); // the pivot, exactly
    expect(g.x).toBe(100);
    expect(g.width).toBe(120);
  });

  it('2 — an edge cannot flip through its pivot (the corner rule)', () => {
    // n dragged to y = 400, far BELOW the south pivot at 180:
    // raw factor = (400 − 180)/(100 − 180) = −2.75 → negative → clamped to 0.0125.
    // (Shipped behaviour was x=100 y=180 w=120 h=220: the north edge ended up 220 px
    //  below the old south edge, the opposite of the documented corner rule.)
    const g = scaleGeometryForHandle(rect, RB, 'n', { x: 160, y: 400 });
    if (g.kind !== 'rect') throw new Error('kind changed');
    expect(g.y).toBeCloseTo(179, 10);
    expect(g.height).toBeCloseTo(1, 10);
    expect(g.y + g.height).toBeCloseTo(180, 10);
    expect(g.y).toBeLessThan(180); // north edge still north of the south edge
  });

  it('2b — the same for `w` dragged past the east pivot', () => {
    // w → x = 400, east pivot 220: raw = (400 − 220)/(100 − 220) = −1.5 → clamp
    // minScale = 1/120 → w = 1, x = 220 + (100 − 220)/120 = 219.
    const g = scaleGeometryForHandle(rect, RB, 'w', { x: 400, y: 140 });
    if (g.kind !== 'rect') throw new Error('kind changed');
    expect(g.x).toBeCloseTo(219, 10);
    expect(g.width).toBeCloseTo(1, 10);
    expect(g.x + g.width).toBeCloseTo(220, 10);
    expect(g.y).toBe(100);
    expect(g.height).toBe(80);
  });

  it('a normal edge stretch is unchanged by the rewrite', () => {
    // n → y = 70: factor = (70 − 180)/(100 − 180) = 1.375 → h = 80·1.375 = 110,
    // y = 180 − 110 = 70. Same numbers the |target − pivot| form gave.
    const g = scaleGeometryForHandle(rect, RB, 'n', { x: 160, y: 70 });
    expect(g).toEqual({ kind: 'rect', x: 100, y: 70, width: 120, height: 110 });
  });
});

/* ------------------------------------------------------------------ *
 * Degenerate inputs
 * ------------------------------------------------------------------ */

describe('degenerate geometry', () => {
  it('an empty points array is returned unchanged for every handle', () => {
    const g: Geometry = { kind: 'polygon', points: [], closed: false };
    const zero: Bounds = { x: 0, y: 0, width: 0, height: 0 }; // geometryBounds of no points
    for (const handle of HANDLE_IDS) {
      expect(scaleGeometryForHandle(g, zero, handle, { x: 50, y: 50 })).toEqual(g);
      expect(resizeScaleFor(zero, handle, { x: 50, y: 50 })).toBeNull();
    }
  });

  it('a single point has no extent to scale: unchanged for every handle', () => {
    const g: Geometry = { kind: 'freehand', points: [{ x: 100, y: 100 }], pressure: [0.5] };
    const point: Bounds = { x: 100, y: 100, width: 0, height: 0 };
    for (const handle of HANDLE_IDS) {
      expect(scaleGeometryForHandle(g, point, handle, { x: 400, y: 400 })).toEqual(g);
    }
  });

  it('a 2-point HORIZONTAL polygon (zero-height bounds) still scales along x', () => {
    const g: Geometry = {
      kind: 'polygon',
      points: [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
      ],
      closed: false,
    };
    const flat: Bounds = { x: 100, y: 100, width: 200, height: 0 };
    // se: pivot (100,100); v = (200, 0), |v|² = 40000; target (400,100) → f = 200·200/40000
    // = 1.5 … and 1.5 again from the y term, which is 0·0. minScale = max(1/200, 0) = 0.005.
    const out = scaleGeometryForHandle(g, flat, 'se', { x: 400, y: 100 });
    expect(out).toEqual({
      kind: 'polygon',
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
      ],
      closed: false,
    });
    // An EDGE handle on the flat axis has no factor to compute (division by a zero
    // extent), so it is a no-op rather than an infinite stretch.
    expect(resizeScaleFor(flat, 'n', { x: 200, y: 50 })).toBeNull();
    expect(scaleGeometryForHandle(g, flat, 'n', { x: 200, y: 50 })).toEqual(g);
    // The live axis still stretches from an edge handle.
    expect(scaleGeometryForHandle(g, flat, 'e', { x: 400, y: 100 })).toEqual({
      kind: 'polygon',
      points: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
      ],
      closed: false,
    });
  });

  it('a zero-width BOX cannot be scaled into a positive one', () => {
    // A box with a zero edge is degenerate (`ShapeTool` rejects anything under
    // SHAPE_MIN_PX = 4 px at commit, so this cannot be authored); `0 × f` is still 0, so
    // the geometry is returned untouched rather than emitting a zero/negative edge.
    const g: Geometry = { kind: 'rect', x: 100, y: 100, width: 0, height: 80 };
    const flat: Bounds = { x: 100, y: 100, width: 0, height: 80 };
    for (const handle of HANDLE_IDS) {
      expect(scaleGeometryForHandle(g, flat, handle, { x: 400, y: 400 })).toEqual(g);
    }
  });

  it('text has no size channel: it translates by the handle delta (box scaling owed)', () => {
    const g: Geometry = { kind: 'text', at: { x: 100, y: 100 }, text: 'x', background: 'none' };
    // se handle of B is (300,200); dragging it to (400,250) is a (+100,+50) delta.
    expect(scaleGeometryForHandle(g, B, 'se', { x: 400, y: 250 })).toEqual({
      kind: 'text',
      at: { x: 200, y: 150 },
      text: 'x',
      background: 'none',
    });
  });
});
