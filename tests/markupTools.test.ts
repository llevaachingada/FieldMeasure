/**
 * tests/markupTools.test.ts — slice 1.6 pure decisions (node project).
 *
 * Importing the tool modules pulls Konva in at module scope but constructs nothing, so
 * this stays in node (D40 gates `Konva.Stage` construction, not the import). Every
 * fixture here is arithmetic, not a screenshot.
 */
import { describe, expect, it } from 'vitest';
import {
  getSvgPathFromStroke,
  strokeInputPoints,
  strokeOutline,
  TOUCH_INK_FLOOR_MU,
  touchInkParams,
  TOUCH_THINNING,
  TOUCH_SMOOTHING,
} from '../src/editor/shapes/svgPath';
import {
  rectFromCentre,
  rectFromCorners,
  constrainSquare,
  shouldConstrainShape,
  shouldClosePolygon,
  isDegenerateShape,
  snapTo45,
  shapeReadout,
} from '../src/editor/tools/ShapeTool';
import {
  angleCommitGate,
  angleChips,
  formatAngleReadout,
  isVertexCancel,
  rayTooShort,
} from '../src/editor/tools/AngleTool';
import {
  effectiveEraseMode,
  eraseNameKey,
  isErasePreview,
  splitStrokeAt,
  strokeModeAvailable,
} from '../src/editor/tools/EraseTool';
import {
  axisLockDelta,
  handlePositions,
  handleHitPx,
  handleVisualPx,
  marqueeRect,
  nearestHandle,
  rotateGeometry,
  rotateSnapDeg,
  visibleHandles,
} from '../src/editor/tools/SelectTool';
import {
  freehandParamsFor,
  isFingerInkAllowed,
  pressureForSource,
  strokeIsStraight,
} from '../src/editor/tools/FreehandTool';
import { DEFAULT_STYLE } from '../src/domain/types';
import { parseMarkupFile } from '../src/domain/schema';

/* ------------------------------------------------------------------ *
 * svgPath — the parallel-array trap (session-4 F7)
 * ------------------------------------------------------------------ */

describe('svgPath: pressure is a PARALLEL ARRAY', () => {
  it('indexes pressure by position, never from the Px object', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(strokeInputPoints(points, [0.1, 0.9])).toEqual([
      [1, 2, 0.1],
      [3, 4, 0.9],
    ]);
  });

  it('falls back to the constant 0.5 when the pressure array is short (touch)', () => {
    expect(strokeInputPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }], [])).toEqual([
      [1, 2, 0.5],
      [3, 4, 0.5],
    ]);
  });

  it('getSvgPathFromStroke closes the outline and refuses < 4 points', () => {
    expect(getSvgPathFromStroke([[0, 0]], true)).toBe('');
    const d = getSvgPathFromStroke(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      true,
    );
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Ink width: pen pressure varies the outline; touch is constant
 * ------------------------------------------------------------------ */

/** Vertical spread of outline points in an x-window (the local stroke width). */
function spreadNear(outline: number[][], x0: number, tol = 6): number {
  const ys = outline.filter(([x]) => Math.abs(x - x0) <= tol).map(([, y]) => y);
  if (ys.length === 0) return 0;
  return Math.max(...ys) - Math.min(...ys);
}

describe('ink width (the CI counterpart of the [Surface — pen] gate)', () => {
  const POINTS = Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: 100 }));

  it('a ramped pen pressure (0.1→1.0) makes the outline materially wider at the end', () => {
    const pressure = POINTS.map((_, i) => 0.1 + (0.9 * i) / (POINTS.length - 1));
    const outline = strokeOutline(POINTS, pressure, { size: 8, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
    const start = spreadNear(outline, 10);
    const end = spreadNear(outline, 90);
    expect(end).toBeGreaterThan(start * 1.5);
    expect(start).toBeGreaterThan(0);
  });

  it('a synthetic touch stroke (all 0.5) is constant-width — no per-point width from a non-pen source', () => {
    const pressure = POINTS.map(() => 0.5);
    const params = touchInkParams(1);
    expect(params.size).toBe(TOUCH_INK_FLOOR_MU);
    expect(params.thinning).toBe(TOUCH_THINNING);
    const outline = strokeOutline(POINTS, pressure, params);
    const start = spreadNear(outline, 10);
    const end = spreadNear(outline, 90);
    expect(Math.abs(end - start)).toBeLessThanOrEqual(1.5);
    // Constant width == the 8-mu floor at scale 1 (the rendered outline spans ~size).
    expect(start).toBeGreaterThanOrEqual(TOUCH_INK_FLOOR_MU - 3);
  });

  it('touch params: width floor 8, thinning 0, smoothing 60% (0.6)', () => {
    const p = freehandParamsFor('touch', DEFAULT_STYLE);
    expect(p.widthMu).toBe(8);
    expect(p.thinning).toBe(0);
    expect(p.smoothing).toBeCloseTo(TOUCH_SMOOTHING, 6);
    expect(p.constantWidth).toBe(true);
    const pen = freehandParamsFor('pen', DEFAULT_STYLE);
    expect(pen.widthMu).toBe(DEFAULT_STYLE.strokeWidthMu);
    expect(pen.thinning).toBe(0.5);
    expect(pen.constantWidth).toBe(false);
  });

  it('a non-pen source never yields a per-point pressure', () => {
    expect(pressureForSource('touch', 0.87)).toBe(0.5);
    expect(pressureForSource('mouse', 0.87)).toBe(0.5);
    expect(pressureForSource('pen', 0.87)).toBeCloseTo(0.87, 6);
    expect(pressureForSource('pen', 0)).toBe(0.5);
  });

  it('finger freehand is gated behind the setting and penOnly', () => {
    expect(isFingerInkAllowed({ fingerDraws: false, penOnly: false })).toBe(false);
    expect(isFingerInkAllowed({ fingerDraws: true, penOnly: false })).toBe(true);
    expect(isFingerInkAllowed({ fingerDraws: true, penOnly: true })).toBe(false);
  });

  it('strokeIsStraight accepts a straight sample and rejects a bent one', () => {
    expect(strokeIsStraight([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], 2)).toBe(true);
    expect(strokeIsStraight([{ x: 0, y: 0 }, { x: 5, y: 9 }, { x: 10, y: 0 }], 2)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * ShapeTool
 * ------------------------------------------------------------------ */

describe('ShapeTool pure decisions', () => {
  it('rect corner-to-corner vs centre-out', () => {
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 30, y: 5 })).toEqual({
      x: 10,
      y: 5,
      width: 20,
      height: 15,
    });
    // Centre (50,50), corner (60,40): half 10/10 → a centred 20×20 box.
    expect(rectFromCentre({ x: 50, y: 50 }, { x: 60, y: 40 })).toEqual({
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
  });

  it('hold-to-constrain uses 400ms/8px for pen and 600ms/16px for touch', () => {
    expect(shouldConstrainShape(400, 8, 'pen')).toBe(true);
    expect(shouldConstrainShape(399, 8, 'pen')).toBe(false);
    expect(shouldConstrainShape(400, 9, 'pen')).toBe(false);
    expect(shouldConstrainShape(600, 16, 'touch')).toBe(true);
    expect(shouldConstrainShape(400, 8, 'touch')).toBe(false); // finger jitter defeats 400/8
  });

  it('constrainSquare takes the larger side', () => {
    expect(constrainSquare({ x: 5, y: 5, width: 20, height: 12 })).toEqual({
      x: 5,
      y: 5,
      width: 20,
      height: 20,
    });
  });

  it('snapTo45 locks a near-horizontal drag onto the axis', () => {
    const snapped = snapTo45({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(snapped.y).toBeCloseTo(0, 6);
    expect(snapped.x).toBeGreaterThan(9);
  });

  it('polygon closes within 32 screen px of its start (scale 1 and 2)', () => {
    expect(shouldClosePolygon({ x: 0, y: 0 }, { x: 30, y: 0 }, 1)).toBe(true);
    expect(shouldClosePolygon({ x: 0, y: 0 }, { x: 33, y: 0 }, 1)).toBe(false);
    // At 2×, 16 image px is 32 screen px — closes.
    expect(shouldClosePolygon({ x: 0, y: 0 }, { x: 16, y: 0 }, 2)).toBe(true);
  });

  it('a degenerate shape is a mis-tap', () => {
    expect(isDegenerateShape({ x: 0, y: 0 }, { x: 2, y: 0 }, 4, 1)).toBe(true);
    expect(isDegenerateShape({ x: 0, y: 0 }, { x: 10, y: 0 }, 4, 1)).toBe(false);
  });

  it('readout carries both rectangle dimensions', () => {
    const ctx = { unitSystem: 'imperial' as const, unitFormat: 'ft-in' as const, precisionDenominator: 16 };
    expect(shapeReadout('rect', { x: 0, y: 0 }, { x: 25.4, y: 50.8 }, ctx, 1)).toContain('×');
  });
});

/* ------------------------------------------------------------------ *
 * AngleTool — the degenerate-ray refusal (§19.5)
 * ------------------------------------------------------------------ */

describe('AngleTool pure decisions', () => {
  it('a right angle reads 90 with complement 0 and supplement 90', () => {
    const gate = angleCommitGate({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }, 1);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.degrees).toBeCloseTo(90, 6);
      expect(gate.complement).toBeCloseTo(0, 6);
      expect(gate.supplement).toBeCloseTo(90, 6);
    }
  });

  it('refuses a ray shorter than 8 screen px instead of committing 0°', () => {
    expect(rayTooShort({ x: 0, y: 0 }, { x: 7, y: 0 }, 1)).toBe(true);
    expect(rayTooShort({ x: 0, y: 0 }, { x: 8, y: 0 }, 1)).toBe(false);
    const gate = angleCommitGate({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }, 1);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('rayTooShort');
  });

  it('the 8 px floor is screen-space: 4 image px at 3× is 12 px, accepted', () => {
    expect(rayTooShort({ x: 0, y: 0 }, { x: 4, y: 0 }, 3)).toBe(false);
  });

  it('a tap within 44 px of the vertex cancels', () => {
    expect(isVertexCancel({ x: 40, y: 0 }, { x: 0, y: 0 }, 1)).toBe(true);
    expect(isVertexCancel({ x: 50, y: 0 }, { x: 0, y: 0 }, 1)).toBe(false);
  });

  it('readout is the honest convention and chips are complements', () => {
    expect(formatAngleReadout(43.2)).toBe('≈ 43.2°');
    expect(angleChips(43.2)).toEqual({ complement: 46.8, supplement: 136.8 });
  });
});

/* ------------------------------------------------------------------ *
 * EraseTool
 * ------------------------------------------------------------------ */

describe('EraseTool pure decisions', () => {
  it('stroke-scope is pen-only; touch falls back to object mode', () => {
    expect(effectiveEraseMode('stroke', 'touch')).toBe('object');
    expect(effectiveEraseMode('stroke', 'pen')).toBe('stroke');
    expect(strokeModeAvailable('touch')).toBe(false);
    expect(strokeModeAvailable('pen')).toBe(true);
  });

  it('long-press preview fires at 600 ms', () => {
    expect(isErasePreview(599)).toBe(false);
    expect(isErasePreview(600)).toBe(true);
  });

  it('names objects with appendix copy keys', () => {
    expect(eraseNameKey({ type: 'rect' } as never)).toBe('eraseNameRectangle');
    expect(eraseNameKey({ type: 'dimension' } as never)).toBe('eraseNameDimension');
    expect(eraseNameKey({ type: 'freehand' } as never)).toBe('layersNameFreehand');
  });

  it('splits at the nearest raw point (never a polygon boolean)', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0 }));
    const pressure = points.map(() => 0.5);
    const split = splitStrokeAt(points, pressure, { x: 31, y: 0 }, 5);
    expect(split).not.toBeNull();
    expect(split!.index).toBe(3);
    expect(split!.first.points).toHaveLength(4);
    expect(split!.second.points).toHaveLength(3);
    // The halves overlap on the split sample, so the stroke is continuous.
    expect(split!.first.points[3]).toEqual(split!.second.points[0]);
  });

  it('refuses to split at an endpoint or outside the radius', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0 }));
    const pressure = points.map(() => 0.5);
    expect(splitStrokeAt(points, pressure, { x: 0, y: 0 }, 5)).toBeNull();
    expect(splitStrokeAt(points, pressure, { x: 50, y: 0 }, 5)).toBeNull();
    expect(splitStrokeAt(points, pressure, { x: 30, y: 40 }, 5)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * SelectTool
 * ------------------------------------------------------------------ */

describe('SelectTool pure decisions', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 50 };

  it('has 8 handles; edge handles are suppressed under 96 screen px', () => {
    expect(handlePositions(bounds)).toHaveLength(8);
    // 100 image px at 1× is 100 → all 8.
    expect(visibleHandles(bounds, 1)).toHaveLength(8);
    // 100 image px at 0.5× is 50 < 96 → corners only (the 0 px-overlap invariant).
    const small = visibleHandles(bounds, 0.5);
    expect(small).toHaveLength(4);
    expect(small.every((h) => h.id.length === 2)).toBe(true);
  });

  it('handle sizes: 28 visual / 72 hit under touch, 24/56 with the pen', () => {
    expect(handleVisualPx('touch')).toBe(28);
    expect(handleHitPx('touch')).toBe(72);
    expect(handleVisualPx('pen')).toBe(24);
    expect(handleHitPx('pen')).toBe(56);
  });

  it('finds the nearest handle within the hit radius', () => {
    const handles = handlePositions(bounds);
    expect(nearestHandle(handles, { x: 2, y: 2 }, 72, 1)).toBe('nw');
    expect(nearestHandle(handles, { x: 102, y: 25 }, 72, 1)).toBe('e');
    expect(nearestHandle(handles, { x: 50, y: 25 }, 10, 1)).toBeNull();
  });

  it('rotates snap to the 15° stops (0/15/30/45/90 included)', () => {
    expect(rotateSnapDeg(48)).toBe(45);
    expect(rotateSnapDeg(88)).toBe(90);
    expect(rotateSnapDeg(37)).toBe(30); // nearest 15° stop
    expect(rotateSnapDeg(8)).toBe(15);
    expect(rotateSnapDeg(2)).toBe(0);
  });

  it('axis lock engages after 8 px within 20° of the handle axis', () => {
    expect(axisLockDelta('n', 20, 3, 20, 1)).toEqual({ dx: 20, dy: 0, locked: true });
    expect(axisLockDelta('e', 3, 20, 20, 1)).toEqual({ dx: 0, dy: 20, locked: true });
    // Before the 8 px threshold nothing locks.
    expect(axisLockDelta('n', 3, 1, 3, 1).locked).toBe(false);
    // 30° off-axis is free.
    expect(axisLockDelta('n', 40, 23, 46, 1).locked).toBe(false);
  });

  it('marquee rect normalises any drag direction', () => {
    expect(marqueeRect({ x: 30, y: 40 }, { x: 10, y: 5 })).toEqual({
      x: 10,
      y: 5,
      width: 20,
      height: 35,
    });
  });

  it('rotateGeometry rotates a line about a pivot', () => {
    const g = rotateGeometry({ kind: 'line', a: { x: 1, y: 0 }, b: { x: 2, y: 0 } }, { x: 0, y: 0 }, 90);
    expect(g.kind).toBe('line');
    if (g.kind === 'line') {
      expect(g.a.x).toBeCloseTo(0, 6);
      expect(g.a.y).toBeCloseTo(1, 6);
    }
  });
});

/* ------------------------------------------------------------------ *
 * markup.json persistence envelope (schema-validated, D70)
 * ------------------------------------------------------------------ */

describe('markup.json envelope', () => {
  it('is schema-valid for a new slice-1.6 kind and carries no label', () => {
    const file = {
      schemaVersion: 1,
      sheetId: 'sheet-1',
      objects: [
        {
          id: 'a1',
          type: 'highlight',
          geometry: {
            kind: 'highlight',
            points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
            pressure: [0.5, 0.5],
          },
          valueMm: null,
          valueDeg: null,
          enteredText: null,
          style: DEFAULT_STYLE,
          zIndex: 0,
          source: 'manual',
          assetId: null,
          groupId: null,
          locked: false,
        },
      ],
    };
    const parsed = parseMarkupFile(JSON.stringify(file));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.objects).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain('"label"');
    expect(parsed.success && 'label' in (parsed.data.objects[0] as object)).toBe(false);
  });
});
