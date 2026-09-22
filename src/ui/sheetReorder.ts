/**
 * `src/ui/sheetReorder.ts` — the pure decision helpers behind the sheets grid's
 * long-press drag-reorder (UI §11.2:719). **No DOM, no React, no layout**: every
 * function here is a total function of its arguments and is unit-tested in
 * `tests/sheetReorder.test.ts`.
 *
 * WHY THE GEOMETRY IS HERE AND NOT IN THE COMPONENT (D77/F1): Chromium **implicitly
 * captures** the pointer to the element that received `pointerdown`, so while a drag is
 * live every later event targets that one card and `pointerover` / `pointerenter` never
 * fire on the others. A reorder built on hover events shipped as a silent no-op once
 * already (the Layers panel, D77/F1). The target is therefore resolved **geometrically**
 * from the captured `pointermove` coordinates against card rectangles captured ONCE at
 * gesture start — which is exactly the arithmetic below.
 */

/** One card's viewport rectangle (a `DOMRect`'s four numbers, no DOM dependency). */
export interface SheetCardRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A viewport point (a `PointerEvent`'s `clientX` / `clientY`). */
export interface Point {
  x: number;
  y: number;
}

/**
 * The edge band, in CSS px, in which a live drag autoscrolls the grid (D118 M8).
 * The band is measured from the SCROLLING ELEMENT's viewport rect, not the window:
 * once the grid body is the scroller (D118 H2) the two coincide, but reading the
 * element's own rect is what keeps the arithmetic true if a bar ever changes height.
 */
export const AUTOSCROLL_EDGE_PX = 48;

/**
 * How far one autoscroll frame advances the scroller, in CSS px. Constant on purpose:
 * a proportional (faster-nearer-the-edge) curve is a "do not simplify" behaviour the
 * spec does not pin, and any guess would be unverifiable without a real pen. 18 px at
 * ~60 Hz is ~1080 px/s — about one screenful a second, which is enough for 20+ sheets.
 */
export const AUTOSCROLL_STEP_PX = 18;

/**
 * The scroller's viewport rect plus its current scroll offsets — everything the pure
 * autoscroll decision needs. No DOM in the type: `getBoundingClientRect()` and the
 * three scroll properties are read by the caller.
 */
export interface ScrollerMetrics {
  /** The scroller's viewport rect top / bottom (a `DOMRect`'s `top` / `bottom`). */
  top: number;
  bottom: number;
  /** The scroller's current scroll offsets. */
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * How far a LIVE drag should scroll the grid this frame: negative = up, positive = down,
 * `0` = do not scroll.
 *
 * A pointer within {@link AUTOSCROLL_EDGE_PX} of the scroller's top or bottom edge
 * scrolls one {@link AUTOSCROLL_STEP_PX} step toward that edge. The decision is CLAMPED
 * against the scroller's real limits, so it never asks for a scroll the browser would
 * refuse: at `scrollTop === 0` the top band returns `0`, and at
 * `scrollTop === scrollHeight − clientHeight` the bottom band returns `0`. That clamp is
 * what lets the caller apply the returned delta and treat it as the ACTUAL scroll (the
 * card rects are shifted by exactly this value).
 *
 * Boundaries are INCLUSIVE: a pointer exactly `AUTOSCROLL_EDGE_PX` from an edge is in the
 * band and scrolls. When the scroller is shorter than `2 × AUTOSCROLL_EDGE_PX` the two
 * bands overlap and the TOP band wins (checked first) — an arbitrary but deterministic
 * resolution of an under-specified case. A `null` scroller (no layout yet, or unmounted)
 * returns `0`.
 */
export function autoscrollDelta(scroller: ScrollerMetrics | null, pointerY: number): number {
  if (!scroller) return 0;
  const { top, bottom, scrollTop, scrollHeight, clientHeight } = scroller;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (pointerY <= top + AUTOSCROLL_EDGE_PX) {
    // Cannot scroll above the top: at the limit the answer is exactly 0 (not `-0`, which
    // `Object.is` equality and a `toBe(0)` pin would reject).
    if (scrollTop <= 0) return 0;
    return Math.max(-AUTOSCROLL_STEP_PX, -scrollTop);
  }
  if (pointerY >= bottom - AUTOSCROLL_EDGE_PX) {
    // Cannot scroll past the bottom: the remaining distance is 0 at the limit.
    return Math.min(AUTOSCROLL_STEP_PX, maxScrollTop - scrollTop);
  }
  return 0;
}

/**
 * Shift captured card rectangles by a real scroll delta, so the drop target stays correct
 * while the grid autoscrolls (D118 M8).
 *
 * WHY SHIFT, NOT RE-CAPTURE: `dropIndexFor`'s array index is a SLOT (its geometry was
 * captured against the press order), while a re-`getBoundingClientRect()` after the live
 * renumber would map slots to the *current* ids and silently change the meaning of the
 * index handed to `moveId`. Scrolling moves content, not slots, so `top − delta` keeps the
 * index↔slot mapping intact: a positive delta (scrolled down) moves every card up.
 */
export function shiftRectsByScroll(
  cards: readonly SheetCardRect[],
  scrollDelta: number,
): SheetCardRect[] {
  return cards.map((card) => ({ ...card, top: card.top - scrollDelta }));
}

/**
 * Move `ids[from]` so it comes to rest at index `to` in the RESULTING list.
 *
 * `to` is the destination index **after** the moved id has been lifted out, which is the
 * conventional drop semantics: dragging a card onto the last card's slot (`to = len - 1`)
 * puts it last. Out-of-range indices clamp; an unknown `from` is a no-op that returns a
 * copy (never the same array, so a caller can rely on identity change).
 */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const out = ids.slice();
  if (from < 0 || from >= out.length) return out;
  const [moved] = out.splice(from, 1);
  const clamped = Math.max(0, Math.min(to, out.length));
  out.splice(clamped, 0, moved);
  return out;
}

function containsPoint(rect: SheetCardRect, point: Point): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/**
 * The squared distance from `point` to the nearest edge of `rect` — zero when the point
 * is inside it. Used as the tie-break for a drop that lands in a gap, past the last card,
 * or entirely outside the grid: the nearest card wins, so a drop never returns nothing.
 */
function distanceToRect(rect: SheetCardRect, point: Point): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
  const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
  return dx * dx + dy * dy;
}

/**
 * The index, in the ORIGINAL card order, that the dragged card should be dropped at.
 *
 * `cards` is the screen order captured at gesture start (the same array whose ids the
 * gesture hands to `moveId`); `fromIndex` is the dragged card's own index in it and is
 * only the fallback when nothing else is nearer. A point inside a card resolves to that
 * card's index (drag right within a row, or wrap down into the next row); a point in a
 * gap, past the last card or outside the grid resolves to the nearest card, so the
 * gesture always has a well-defined target. An empty grid returns the fallback index —
 * clamped to `0`, because a negative index is not a position (review F5).
 */
export function dropIndexFor(
  cards: readonly SheetCardRect[],
  point: Point,
  fromIndex: number,
): number {
  if (cards.length === 0) return Math.max(0, fromIndex);

  const hit = cards.findIndex((card) => containsPoint(card, point));
  if (hit >= 0) return hit;

  let best = fromIndex >= 0 && fromIndex < cards.length ? fromIndex : 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cards.length; i += 1) {
    const distance = distanceToRect(cards[i], point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
