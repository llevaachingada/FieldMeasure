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
import {
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_STEP_PX,
  autoscrollDelta,
  dropIndexFor,
  moveId,
  shiftRectsByScroll,
  type ScrollerMetrics,
  type SheetCardRect,
} from '../src/ui/sheetReorder';

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

// ---------------------------------------------------------------------------
// Autoscroll during a live drag (D118 M8) — pure decision + the rect shift it feeds
// ---------------------------------------------------------------------------

describe('autoscrollDelta — the edge-band decision, clamped at the scroller limits', () => {
  /** A tall scroller: rect 0…800, 2000 px of content, scrolled to 300. maxScroll = 1200. */
  const scroller = (overrides: Partial<ScrollerMetrics> = {}): ScrollerMetrics => ({
    top: 0,
    bottom: 800,
    scrollTop: 300,
    scrollHeight: 2000,
    clientHeight: 800,
    ...overrides,
  });

  it('pins the edge constants', () => {
    // The band and step are behaviour, not magic numbers: 48 px in from either edge.
    expect(AUTOSCROLL_EDGE_PX).toBe(48);
    // 18 px/frame at ~60 Hz ≈ 1080 px/s — about one 894 px screenful a second.
    expect(AUTOSCROLL_STEP_PX).toBe(18);
  });

  it('scrolls toward the top inside the top band', () => {
    // y 0 is the top edge; the band is [0, 48].
    expect(autoscrollDelta(scroller(), 0)).toBe(-AUTOSCROLL_STEP_PX);
  });

  it('treats exactly 48 px from an edge as INSIDE the band (inclusive boundary)', () => {
    // top + 48 = 48 → the last pixel of the top band scrolls up.
    expect(autoscrollDelta(scroller(), 48)).toBe(-AUTOSCROLL_STEP_PX);
    // 49 is one past the band and not near the bottom (bottom band starts at 800 − 48 = 752).
    expect(autoscrollDelta(scroller(), 49)).toBe(0);
  });

  it('scrolls toward the bottom inside the bottom band', () => {
    // The band starts at 800 − 48 = 752; 752 is inclusive, 751 is not.
    expect(autoscrollDelta(scroller(), 752)).toBe(AUTOSCROLL_STEP_PX);
    expect(autoscrollDelta(scroller(), 751)).toBe(0);
    // Past the bottom edge (the finger can leave the scroller) still scrolls down.
    expect(autoscrollDelta(scroller(), 900)).toBe(AUTOSCROLL_STEP_PX);
  });

  it('does not scroll in the middle of the scroller', () => {
    expect(autoscrollDelta(scroller(), 400)).toBe(0);
  });

  it('clamps at the top: already at scrollTop 0 the top band is a no-op', () => {
    // Cannot scroll above 0, so the requested −18 clamps to −0.
    expect(autoscrollDelta(scroller({ scrollTop: 0 }), 10)).toBe(0);
  });

  it('clamps at the bottom: already at the last scroll offset the bottom band is a no-op', () => {
    // maxScroll = 2000 − 800 = 1200; at 1200 the remaining distance is 0.
    expect(autoscrollDelta(scroller({ scrollTop: 1200 }), 790)).toBe(0);
  });

  it('returns the REMAINING distance when less than a full step is left', () => {
    // maxScroll − scrollTop = 1200 − 1195 = 5 < 18: ask for only what is left.
    expect(autoscrollDelta(scroller({ scrollTop: 1195 }), 790)).toBe(5);
  });

  it('returns 0 with no scroller (no layout, or unmounted)', () => {
    expect(autoscrollDelta(null, 10)).toBe(0);
    expect(autoscrollDelta(null, 900)).toBe(0);
  });

  it('a scroller shorter than two bands resolves the overlap deterministically (top wins)', () => {
    // bottom 60 < 2 × 48 = 96: y 30 satisfies BOTH bands; the top band is checked first.
    const short = scroller({ bottom: 60, scrollHeight: 100, clientHeight: 60, scrollTop: 20 });
    expect(autoscrollDelta(short, 30)).toBe(-AUTOSCROLL_STEP_PX);
  });
});

describe('shiftRectsByScroll — the drop target tracks scrolled content', () => {
  it('moves every captured top up by the applied scroll delta', () => {
    const cards: SheetCardRect[] = [{ id: 'a', left: 0, top: 100, width: 320, height: 300 }];
    expect(shiftRectsByScroll(cards, 100)).toEqual([
      { id: 'a', left: 0, top: 0, width: 320, height: 300 },
    ]);
    // A negative delta (scrolled up) moves content down.
    expect(shiftRectsByScroll(cards, -50)[0].top).toBe(150);
  });

  it('never mutates its input', () => {
    const cards: SheetCardRect[] = [{ id: 'a', left: 0, top: 100, width: 320, height: 300 }];
    const out = shiftRectsByScroll(cards, 100);
    expect(out).not.toBe(cards);
    expect(cards[0].top).toBe(100);
  });

  it('resolves a post-scroll drop to the card now under the point', () => {
    // grid4x2 row pitch is 316. Point (496, 150) hits index 1 before any scroll…
    expect(dropIndexFor(grid4x2(), { x: 496, y: 150 }, 0)).toBe(1);
    // …after scrolling one row (316) the row-1 cards sit at viewport y 0…300, so the same
    // point now resolves to row 1, column 1 = index 5. The index keeps meaning SLOT.
    expect(dropIndexFor(shiftRectsByScroll(grid4x2(), 316), { x: 496, y: 150 }, 0)).toBe(5);
  });
});
