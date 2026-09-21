/**
 * tests/dragPredicate.test.ts — the touch-first drag predicate (slice 1.3).
 *
 * Pure logic only (touch model §3.1 / UI §5.4): no Konva.Stage is constructed, so
 * this belongs in the `node` project (D40 keeps Konva.Stage tests in the browser).
 * `EditorCanvas.ts` imports Konva at module scope but constructs nothing here.
 */
import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  decideDragTarget,
  isTap,
  onSecondFinger,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../src/editor/EditorCanvas';

const unlocked = { id: 'a', locked: false };
const locked = { id: 'a', locked: true };

describe('decideDragTarget (object-first one-finger drag)', () => {
  it('moves a grabbable, unlocked object', () => {
    expect(decideDragTarget({ panTool: false, intent: 'draw', hit: unlocked })).toBe('object');
  });

  it('pans on a locked object', () => {
    expect(decideDragTarget({ panTool: false, intent: 'draw', hit: locked })).toBe('pan');
  });

  it('pans on empty canvas', () => {
    expect(decideDragTarget({ panTool: false, intent: 'draw', hit: null })).toBe('pan');
  });

  it('The Pan tool overrides object-first unconditionally', () => {
    expect(decideDragTarget({ panTool: true, intent: 'draw', hit: unlocked })).toBe('pan');
  });

  it('a navigate intent never grabs an object', () => {
    expect(decideDragTarget({ panTool: false, intent: 'navigate', hit: unlocked })).toBe('pan');
  });

  it('an ignore intent never grabs an object', () => {
    expect(decideDragTarget({ panTool: false, intent: 'ignore', hit: unlocked })).toBe('pan');
  });
});

describe('isTap (TAP_SLOP = 8 px AND TAP_MAX_MS = 400 ms)', () => {
  it('a zero-travel quick contact is a tap', () => {
    expect(isTap(0, 0, 100)).toBe(true);
  });

  it('travel exactly at the slop boundary is still a tap', () => {
    expect(isTap(8, 0, 400)).toBe(true);
  });

  it('travel past the slop is a drag even when quick', () => {
    expect(isTap(9, 0, 100)).toBe(false);
  });

  it('a hold past the ceiling is not a tap even with no travel', () => {
    expect(isTap(0, 0, 401)).toBe(false);
  });

  it('a fast long pan is a drag (the AND reading; a plain OR would call it a tap)', () => {
    expect(isTap(100, 100, 300)).toBe(false);
  });

  it('diagonal travel uses Euclidean distance (6,6 is 8.49 px > 8)', () => {
    expect(isTap(6, 6, 200)).toBe(false);
    expect(isTap(5, 6, 200)).toBe(true); // hypot ≈ 7.81 ≤ 8
  });
});

describe('onSecondFinger (second finger always wins)', () => {
  it('cancels an object drag and restores the recorded pre-drag position', () => {
    const pre = { x: 512, y: 256 };
    expect(onSecondFinger({ target: 'object', preDragPosition: pre })).toEqual({
      cancelled: true,
      restoreTo: pre,
    });
  });

  it('does nothing to a pan', () => {
    expect(onSecondFinger({ target: 'pan', preDragPosition: null })).toEqual({
      cancelled: false,
      restoreTo: null,
    });
  });

  it('cancels safely when no pre-drag position was recorded', () => {
    expect(onSecondFinger({ target: 'object', preDragPosition: null })).toEqual({
      cancelled: true,
      restoreTo: null,
    });
  });
});

describe('clampZoom (0.25×–8×, UI §5.4)', () => {
  it('clamps both ends', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('treats a non-finite scale as the minimum rather than producing NaN', () => {
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
  });
});
