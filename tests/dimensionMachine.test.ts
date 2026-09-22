/**
 * tests/dimensionMachine.test.ts — the pure decisions of the dimension placement machine
 * (plan slice 1.5, machine gate 1: "make the tap-vs-drag / settle-window /
 * contact-cancels-auto-open / chain / refine-within-40px decisions pure functions with
 * unit tests").
 *
 * Importing `DimensionTool.ts` pulls in Konva at module scope (for the imperative half)
 * but constructs nothing, so this stays in the node project (D40 gates only
 * `Konva.Stage` construction, not the import).
 */
import { describe, expect, it } from 'vitest';
import {
  DEGENERATE_MIN_PX,
  REFINE_RADIUS_PX,
  SETTLE_MS,
  chainAnchor,
  commitGate,
  decideContact,
  defaultSnapStrength,
  isDegenerateSegment,
  shouldAutoOpenKeypad,
  shouldCommitOnUp,
  snapAcquirePx,
} from '../src/editor/tools/DimensionTool';

describe('settle window (§1.4)', () => {
  it('is 450 ms', () => {
    expect(SETTLE_MS).toBe(450);
  });

  it('auto-opens only when no contact occurred during the window', () => {
    expect(shouldAutoOpenKeypad(false)).toBe(true);
    expect(shouldAutoOpenKeypad(true)).toBe(false);
  });
});

describe('tap-vs-drag for a placement contact', () => {
  it('a contact that authored A commits B only when it DRAGGED (pen A-down/B-up)', () => {
    expect(shouldCommitOnUp({ role: 'authoredA', tapped: false })).toBe(true);
    expect(shouldCommitOnUp({ role: 'authoredA', tapped: true })).toBe(false);
  });

  it('a contact that authored B commits only on a TAP; a drag pans (UI AnchorA row)', () => {
    expect(shouldCommitOnUp({ role: 'placingB', tapped: true })).toBe(true);
    expect(shouldCommitOnUp({ role: 'placingB', tapped: false })).toBe(false);
  });

  it('a refine contact never commits geometry on lift', () => {
    expect(shouldCommitOnUp({ role: 'refining', tapped: true })).toBe(false);
  });
});

describe('refine-within-40px (§1.4/§8.5)', () => {
  const anchors = { a: { x: 100, y: 100 }, b: { x: 300, y: 100 } };

  it('refines the nearest anchor inside the radius', () => {
    expect(decideContact({ x: 110, y: 100 }, anchors, REFINE_RADIUS_PX, 1)).toBe('a');
    expect(decideContact({ x: 290, y: 100 }, anchors, REFINE_RADIUS_PX, 1)).toBe('b');
  });

  it('pans when the contact is outside the radius', () => {
    expect(decideContact({ x: 200, y: 100 }, anchors, REFINE_RADIUS_PX, 1)).toBeNull();
  });

  it('the radius is screen-space: at 2× a 25 image-px gap is 50 px → no refine', () => {
    expect(decideContact({ x: 125, y: 100 }, anchors, REFINE_RADIUS_PX, 2)).toBeNull();
    expect(decideContact({ x: 115, y: 100 }, anchors, REFINE_RADIUS_PX, 2)).toBe('a'); // 30 px
  });

  it('the radius is the spec value 40', () => {
    expect(REFINE_RADIUS_PX).toBe(40);
  });
});

describe('chain (§8.1) and degenerate segments', () => {
  it('chains the next dimension locked at the previous B (a copy)', () => {
    const b = { x: 12, y: 34 };
    const a = chainAnchor(b);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('treats an A≈B contact as a mis-tap, not a dimension', () => {
    expect(isDegenerateSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, DEGENERATE_MIN_PX, 1)).toBe(true);
    expect(isDegenerateSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, DEGENERATE_MIN_PX, 1)).toBe(false);
    // Screen-space: 3 image px at 2× is 6 screen px → not degenerate.
    expect(isDegenerateSegment({ x: 0, y: 0 }, { x: 3, y: 0 }, DEGENERATE_MIN_PX, 2)).toBe(false);
  });
});

describe('snapping (touch model §2.2)', () => {
  it('acquires at 32 px under touch and 20 px with a pen', () => {
    expect(snapAcquirePx('touch', false)).toBe(32);
    expect(snapAcquirePx('pen', false)).toBe(20);
    expect(snapAcquirePx('mouse', false)).toBe(20);
  });

  it('gloved touch gains the +4 px acquire bonus', () => {
    expect(snapAcquirePx('touch', true)).toBe(36);
  });

  it('defaults to Strong under touch and Normal with a pen', () => {
    expect(defaultSnapStrength('touch')).toBe('strong');
    expect(defaultSnapStrength('pen')).toBe('normal');
  });
});

describe('commitGate — the F3/F4 refusal table, via the real domain primitives', () => {
  it('accepts a normal entry and returns valueMm + enteredText', () => {
    const result = commitGate('12 6', 16); // 12 ft 6 in = 150 in
    expect(result).toEqual({
      ok: true,
      valueInches: 150,
      enteredText: `12'-6"`,
      valueMm: 150 * 25.4,
    });
  });

  it('refuses a bare 0 (was a 0" dimension) with the "enter a length" reason', () => {
    expect(commitGate('0', 16)).toEqual({ ok: false, reason: 'enterLength' });
  });

  it('refuses 12 6 20 (was 151.25") with the fraction reason', () => {
    expect(commitGate('12 6 20', 16)).toEqual({ ok: false, reason: 'fractionTooBig' });
  });

  it('refuses -5 (was silently +5") with the "enter a length" reason', () => {
    expect(commitGate('-5', 16)).toEqual({ ok: false, reason: 'enterLength' });
  });

  it('refuses a 1001-ft value with the "too large" reason', () => {
    // 1001 ft = 1001 × 12 = 12012 in, over MAX_LENGTH_IN (12000 = 1000 ft)
    expect(commitGate(`1001'`, 16)).toEqual({ ok: false, reason: 'tooLarge' });
    expect(commitGate(`1000'`, 16).ok).toBe(true); // the boundary itself commits
  });
});
