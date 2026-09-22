/**
 * tests/sheetReorder.test.ts — the pure arithmetic behind the sheets grid's long-press
 * drag-reorder (UI §11.2:719), executed against REAL rectangles.
 *
 * Why this file exists (review-brief Q1: "could it pass without the behaviour it names?"):
 * jsdom has no layout engine (D40), so a component test can only ever see zero-size rects.
 * The drop decision is therefore a pure function of the card rectangles and the pointer
 * point, and it is pinned HERE, where a 4-across grid's geometry is real arithmetic rather
 * than a stubbed `getBoundingClientRect`. `tests/projectScreen.test.tsx` then proves the
 * component actually FEEDS it (a stubbed rect grid, a real pointer sequence).
 */
import { describe, expect, it } from 'vitest';
import { dropIndexFor, moveId, type SheetCardRect } from '../src/ui/sheetReorder';

/**
 * A 4-across grid of 320 × 300 cards with a 16 px gap, two rows.
 * Column c starts at `c × 336`; row r starts at `r × 316`.
 * Arithmetic: gap 16 → column pitch 320 + 16 = 336; row pitch 300 + 16 = 316.
 * Right edge of column 3 = 3 × 336 + 320 = 1328. Bottom edge of row 1 = 316 + 300 = 616.
 */
function grid4x2(): SheetCardRect[] {
  const cards: SheetCardRect[] = [];
  for (let i = 0; i < 8; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    cards.push({ id: `c${i}`, left: col * 336, top: row * 316, width: 320, height: 300 });
  }
  return cards;
}

describe('moveId — lift one id out and put it down at an index', () => {
  it('moves a card later within the list', () => {
    // [a,b,c,d] — take a (index 0), rest is [b,c,d], insert before index 2 → [b,c,a,d].
    expect(moveId(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a card earlier within the list', () => {
    // [a,b,c] — take c, rest is [a,b], insert at 0 → [c,a,b].
    expect(moveId(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op when from === to', () => {
    expect(moveId(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('never mutates its input, even for a no-op', () => {
    const ids = ['a', 'b', 'c'];
    const out = moveId(ids, 1, 1);
    expect(out).not.toBe(ids);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('clamps a "past the end" drop to the last slot', () => {
    // [a,b,c] — take a, rest is [b,c], 99 clamps to 2 → [b,c,a]: a is last.
    expect(moveId(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });

  it('clamps a negative drop to the front', () => {
    expect(moveId(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });

  it('returns a copy when the source index is unknown', () => {
    expect(moveId(['a', 'b'], 7, 0)).toEqual(['a', 'b']);
    expect(moveId([], 0, 0)).toEqual([]);
  });
});

describe('dropIndexFor — the target from captured rects + the pointer point', () => {
  it('resolves to the card the point is inside', () => {
    // Inside c1: left 336, so 336 + 160 = 496; row 0 centre y = 150.
    expect(dropIndexFor(grid4x2(), { x: 496, y: 150 }, 0)).toBe(1);
  });

  it('drag right within a row lands on the card under the finger', () => {
    // Inside c2: 2 × 336 + 160 = 832.
    expect(dropIndexFor(grid4x2(), { x: 832, y: 150 }, 0)).toBe(2);
  });

  it('wraps down into the next row', () => {
    // c5 is row 1, column 1: left 336 + 160 = 496, top 316 + 150 = 466.
    expect(dropIndexFor(grid4x2(), { x: 496, y: 466 }, 0)).toBe(5);
  });

  it('a drop past the last card in the row resolves to that last card', () => {
    // x 1400 is 72 px right of column 3's right edge (1328); the nearest other card is a
    // whole row away (dy 316 - 150 = 166), so column 3 wins.
    expect(dropIndexFor(grid4x2(), { x: 1400, y: 150 }, 0)).toBe(3);
  });

  it('a drop below the last row resolves to the nearest card of that row', () => {
    // Straight below column 1 (x 496): the clamped distance is the row-1 gap only.
    expect(dropIndexFor(grid4x2(), { x: 496, y: 900 }, 0)).toBe(5);
  });

  it('a drop entirely outside the grid still resolves (nearest card wins)', () => {
    // Up and to the left of everything → the first card.
    expect(dropIndexFor(grid4x2(), { x: -500, y: -500 }, 3)).toBe(0);
  });

  it('dropping on the dragged card itself is from === to', () => {
    // Point inside c2 while c2 is the dragged card (fromIndex 2).
    expect(dropIndexFor(grid4x2(), { x: 832, y: 150 }, 2)).toBe(2);
  });

  it('an empty grid returns the dragged index (never NaN)', () => {
    expect(dropIndexFor([], { x: 10, y: 10 }, 0)).toBe(0);
    expect(dropIndexFor([], { x: 10, y: 10 }, 4)).toBe(4);
  });

  it('an out-of-range fallback index degrades to the first card, not a bogus index', () => {
    expect(dropIndexFor(grid4x2(), { x: -500, y: -500 }, 99)).toBe(0);
  });
});
