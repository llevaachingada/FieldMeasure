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
