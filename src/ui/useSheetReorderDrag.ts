/**
 * `src/ui/useSheetReorderDrag.ts` — the sheets grid's long-press drag-reorder gesture
 * (UI §11.2:719), extracted out of `ProjectScreen.tsx` (R3, beta-readiness-fix-plan.md §7).
 *
 * This is the DOM/React half: refs, effects and pointer handlers. The geometry decisions
 * (autoscroll, drop target, list-splice) stay pure in `src/ui/sheetReorder.ts` and are
 * reused here, not duplicated.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  autoscrollDelta,
  dropIndexFor,
  moveId,
  shiftRectsByScroll,
  type Point,
  type SheetCardRect,
} from './sheetReorder';

export type SheetReorderDragPhase = 'idle' | 'pressing' | 'dragging';

/** UI §11.2:719 — hold a card for 400 ms and it lifts into a drag. */
const LONG_PRESS_MS = 400;

/** The drag chip's offset from the fingertip, in CSS px (above and right of it). */
const CHIP_DX = 16;
const CHIP_DY = -44;
/** The chip's fallback width when `offsetWidth` is unavailable (jsdom has no layout). */
const CHIP_FALLBACK_WIDTH = 115;

/**
 * The chip's transform — the only place its position lives (no inline styles, so the CSP's
 * `style-src 'self'` and the e2e `[style]` count === 0 assertion both hold). The offsets put
 * it just above the fingertip; the clamp keeps it fully on screen, because at the last
 * column of a 4-across grid the unclamped chip ran 35–75 px past the right edge and clipped
 * the label it exists to show (measured in the session-22 UI review).
 */
function chipTranslate(x: number, y: number, width: number = CHIP_FALLBACK_WIDTH): string {
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const left = Math.min(Math.max(8, x + CHIP_DX), maxX);
  const top = Math.max(8, y + CHIP_DY);
  return `translate(${left}px, ${top}px)`;
}

/** Order equality, so a lift that changed nothing never becomes a disk write. */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export interface UseSheetReorderDragArgs {
  /** The grid's own scrollable list element — where card rects are read from. */
  gridRef: RefObject<HTMLUListElement | null>;
  /** The grid's scroll container (`.project-body`) — the autoscroll target (D118 M8). */
  bodyRef: RefObject<HTMLDivElement | null>;
  /** The shell's order (e.g. `sheets.map((s) => s.id)`). */
  order: readonly string[];
  /** Persist a new order. MUST reject (or throw) on failure so the gesture rolls back. */
  onCommit(next: readonly string[]): Promise<void> | void;
  /** Whether the drag/reorder affordance is live at all (`typeof onReorderSheets === 'function'`). */
  enabled: boolean;
  /** A rename field is open on a card: a press on the grid must not start a lift. */
  renamingId: string | null;
}

export interface UseSheetReorderDragResult {
  /** The order to render: `order`, live-overridden while a gesture (or its optimistic
   *  write) is in flight. */
  renderOrder: readonly string[];
  dragPhase: SheetReorderDragPhase;
  dragId: string | null;
  /** The floating «Drop to move» chip's element ref. */
  chipRef: RefObject<HTMLDivElement | null>;
  onGridPointerDown(event: ReactPointerEvent<HTMLUListElement>): void;
  onGridClickCapture(event: ReactMouseEvent<HTMLUListElement>): void;
  /** The keyboard path: one live position, in the direction asked for. */
  moveCard(id: string, direction: 'earlier' | 'later'): void;
}

export function useSheetReorderDrag({
  gridRef,
  bodyRef,
  order,
  onCommit,
  enabled,
  renamingId,
}: UseSheetReorderDragArgs): UseSheetReorderDragResult {
  const [dragPhase, setDragPhase] = useState<SheetReorderDragPhase>('idle');
  const [dragId, setDragId] = useState<string | null>(null);
  /** The order to render. `null` means "whatever the caller handed us". */
  const [liveOrder, setLiveOrder] = useState<readonly string[] | null>(null);

  // ---- the reorder gesture's mutable state (refs: no re-render per pointermove) -----
  const longPressRef = useRef<number | null>(null);
  const pressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const rectsRef = useRef<readonly SheetCardRect[]>([]);
  const fromIndexRef = useRef(0);
  const pressOrderRef = useRef<readonly string[]>([]);
  const liveOrderRef = useRef<readonly string[] | null>(null);
  /** Set when the lift fires; swallows the one `click` the drop would otherwise send. */
  const suppressClickRef = useRef(false);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const chipAnimRef = useRef<Animation | null>(null);
  const lastChipRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** The last pointer position, so the autoscroll loop can run while the finger is still. */
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });
  const autoscrollFrameRef = useRef<number | null>(null);

  const renderOrder = liveOrder ?? order;

  // Latest-value mirror for the gesture's document-level handlers (they outlive a render).
  liveOrderRef.current = liveOrder;

  // The caller's order changed identity (a completed reorder, an add, a delete): its order
  // is the truth again. Comparing identity means an unrelated parent re-render cannot yank
  // the order out from under a live gesture.
  const prevOrderRef = useRef(order);
  useEffect(() => {
    if (prevOrderRef.current === order) return;
    prevOrderRef.current = order;
    setLiveOrder(null);
  }, [order]);

  /**
   * Persist an order. The list is updated locally FIRST (the drag's live renumber), and only
   * a rejection walks it back — with the caller's `onCommit` responsible for surfacing that
   * failure (a toast, say). While the write is in flight the local order is kept; the
   * caller's next `order` change adopts it.
   */
  const commit = useCallback(
    (next: readonly string[]): void => {
      const before = liveOrderRef.current;
      setLiveOrder(next);
      void (async () => {
        try {
          await onCommit(next);
        } catch {
          setLiveOrder(before);
        }
      })();
    },
    [onCommit],
  );

  /** The keyboard path: one live position, in the direction asked for. */
  const moveCard = useCallback(
    (id: string, direction: 'earlier' | 'later'): void => {
      const current = liveOrder ?? order;
      const from = current.indexOf(id);
      if (from < 0) return;
      const to = direction === 'earlier' ? from - 1 : from + 1;
      if (to < 0 || to >= current.length) return;
      commit(moveId(current, from, to));
    },
    [liveOrder, order, commit],
  );

  const clearLongPress = useCallback((): void => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // Never leave an armed lift behind on unmount.
  useEffect(() => clearLongPress, [clearLongPress]);

  // ---- autoscroll while a drag is live (D118 M8) -----------------------------

  const stopAutoscroll = useCallback((): void => {
    if (autoscrollFrameRef.current !== null) {
      cancelAnimationFrame(autoscrollFrameRef.current);
      autoscrollFrameRef.current = null;
    }
  }, []);

  /** Never leave an autoscroll frame running past the gesture. */
  useEffect(() => stopAutoscroll, [stopAutoscroll]);

  /**
   * One autoscroll step per animation frame for as long as the drag is live. The DECISION
   * is the pure `autoscrollDelta` (see `sheetReorder.ts`); this shell only reads the
   * scroller's live metrics, applies the delta, and shifts the captured card rects by the
   * delta the browser ACTUALLY applied — so a drop after scrolling still resolves to the
   * card under the finger (`shiftRectsByScroll` documents why a shift, not a re-capture).
   * A frame is always re-armed: the loop runs for the whole gesture and the finger does not
   * have to move for the grid to keep scrolling (a stationary finger at the edge is the
   * whole point).
   */
  const runAutoscrollFrame = useCallback((): void => {
    autoscrollFrameRef.current = null;
    const scroller = bodyRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const delta = autoscrollDelta(
      {
        top: rect.top,
        bottom: rect.bottom,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      },
      lastPointerRef.current.y,
    );
    if (delta !== 0) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + delta;
      // Use the ACTUAL movement: the browser clamps at the ends, and rects must shift by
      // what really happened, not by what was asked for.
      const applied = scroller.scrollTop - before;
      if (applied !== 0) rectsRef.current = shiftRectsByScroll(rectsRef.current, applied);
    }
    autoscrollFrameRef.current = requestAnimationFrame(runAutoscrollFrame);
  }, [bodyRef]);

  const startAutoscroll = useCallback((): void => {
    if (autoscrollFrameRef.current !== null) return;
    autoscrollFrameRef.current = requestAnimationFrame(runAutoscrollFrame);
  }, [runAutoscrollFrame]);

  /**
   * The 400 ms timer elapsed: lift the card. The rects are captured ONCE, here, because
   * Chromium captures the pointer to this card and the other cards never see hover events
   * (D77/F1) — the drop target is later resolved from these rectangles and the pointer's
   * captured coordinates.
   */
  const activateDrag = useCallback(
    (id: string): void => {
      longPressRef.current = null;
      const grid = gridRef.current;
      if (!grid) return;
      const items = Array.from(grid.querySelectorAll<HTMLElement>('.sheet-grid-item[data-sheet-id]'));
      const rects: SheetCardRect[] = [];
      for (const item of items) {
        const rectId = item.getAttribute('data-sheet-id');
        if (!rectId) continue;
        const box = item.getBoundingClientRect();
        rects.push({ id: rectId, left: box.left, top: box.top, width: box.width, height: box.height });
      }
      const from = rects.findIndex((rect) => rect.id === id);
      if (from < 0) return;
      rectsRef.current = rects;
      fromIndexRef.current = from;
      pressOrderRef.current = rects.map((rect) => rect.id);
      // Seed the autoscroll with the lift point, then keep scrolling while the finger stays
      // in an edge band (D118 M8).
      lastPointerRef.current = { x: pressRef.current?.x ?? 0, y: pressRef.current?.y ?? 0 };
      // Set on the LIFT, not on the drop: a lift that is released without moving must not
      // also open the sheet (the brief's "after a drag or a lift").
      suppressClickRef.current = true;
      setDragId(id);
      setLiveOrder(pressOrderRef.current);
      setDragPhase('dragging');
      startAutoscroll();
    },
    [gridRef, startAutoscroll],
  );

  /** Walk the chip to the pointer. Web Animations is CSP-safe (no `[style]` attribute). */
  const followChip = useCallback((x: number, y: number): void => {
    const chip = chipRef.current;
    if (!chip || typeof chip.animate !== 'function') return;
    const from = lastChipRef.current;
    lastChipRef.current = { x, y };
    const animation = chip.animate(
      [
        { transform: chipTranslate(from.x, from.y, chip.offsetWidth) },
        { transform: chipTranslate(x, y, chip.offsetWidth) },
      ],
      { duration: 100, easing: 'linear', fill: 'forwards' },
    );
    const previous = chipAnimRef.current;
    chipAnimRef.current = animation;
    // Cancelling the previous one AFTER starting the new one: the new animation owns the
    // transform, so there is no jump back to the origin.
    previous?.cancel();
  }, []);

  // Seed the chip under the pointer the moment it appears. `useLayoutEffect`, not
  // `useEffect`: the chip mounts with no transform (its CSS origin is `left:0;top:0`), so a
  // passive effect lets it paint once at the viewport corner before the seed animation
  // lands — finding 13 of the session-22 UI review.
  useLayoutEffect(() => {
    if (dragPhase !== 'dragging') return;
    const chip = chipRef.current;
    const start = pressRef.current;
    if (!chip || !start || typeof chip.animate !== 'function') return;
    lastChipRef.current = { x: start.x, y: start.y };
    chipAnimRef.current = chip.animate(
      [{ transform: chipTranslate(start.x, start.y, chip.offsetWidth) }],
      {
        duration: 0,
        fill: 'forwards',
      },
    );
    return () => {
      chipAnimRef.current?.cancel();
      chipAnimRef.current = null;
    };
  }, [dragPhase]);

  // ---- the gesture: pressed (armed) → dragging (live) -------------------------

  useEffect(() => {
    if (dragPhase !== 'pressing') return;
    const onMove = (event: PointerEvent): void => {
      const start = pressRef.current;
      if (!start || longPressRef.current === null) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      // >8 px of travel is a scroll or a drag of the grid, not a deliberate hold: cancel the
      // lift so the grid keeps scrolling (the Layers panel's 8 px slop, D77/F1).
      if (dx * dx + dy * dy > 64) clearLongPress();
    };
    const onEnd = (): void => {
      clearLongPress();
      pressRef.current = null;
      setDragPhase('idle');
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };
  }, [clearLongPress, dragPhase]);

  useEffect(() => {
    if (dragPhase !== 'dragging') return;
    const finish = (commitDrop: boolean): void => {
      const startOrder = pressOrderRef.current;
      const current = liveOrderRef.current ?? startOrder;
      pressRef.current = null;
      stopAutoscroll();
      setDragId(null);
      setDragPhase('idle');
      if (!commitDrop) {
        // Escape / pointercancel: the pre-drag order comes back.
        setLiveOrder(startOrder);
        return;
      }
      if (sameOrder(current, startOrder)) {
        // A lift with no move is not a write.
        setLiveOrder(startOrder);
        return;
      }
      commit(current);
    };
    const onMove = (event: PointerEvent): void => {
      const cards = rectsRef.current;
      if (cards.length === 0) return;
      // The autoscroll loop reads this between pointermoves — a stationary finger at the
      // edge must keep scrolling.
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const to = dropIndexFor(cards, { x: event.clientX, y: event.clientY }, fromIndexRef.current);
      setLiveOrder(moveId(pressOrderRef.current, fromIndexRef.current, to));
      followChip(event.clientX, event.clientY);
    };
    const onUp = (): void => finish(true);
    const onCancel = (): void => {
      // A cancelled pointer produces NO click, so do not leave the one-shot suppression
      // armed for an unrelated later one (a keyboard Enter on a focused card, say).
      suppressClickRef.current = false;
      finish(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // Escape produces no `click`, so the one-shot suppression must be released here too
      // (exactly the `pointercancel` case below): leaving it armed would swallow the NEXT,
      // unrelated click anywhere in the grid — a card that will not open.
      suppressClickRef.current = false;
      finish(false);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [commit, dragPhase, followChip, stopAutoscroll]);

  /** Arm the lift. The `⋯` trigger, the select toggle and the rename field are not handles. */
  const onGridPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLUListElement>): void => {
      if (!enabled || dragPhase !== 'idle') return;
      if (event.button > 0) return;
      const target = event.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      const item = target.closest('.sheet-grid-item[data-sheet-id]');
      if (!item) return;
      if (target.closest('.sheet-card-menu-button, .sheet-card-select, .sheet-rename-input')) return;
      if (renamingId !== null) return;
      const id = item.getAttribute('data-sheet-id');
      if (!id) return;

      suppressClickRef.current = false;
      pressRef.current = { id, x: event.clientX, y: event.clientY };
      clearLongPress();
      setDragPhase('pressing');
      longPressRef.current = window.setTimeout(() => activateDrag(id), LONG_PRESS_MS);
    },
    [activateDrag, clearLongPress, dragPhase, enabled, renamingId],
  );

  /** Swallow the ONE click that follows a lift or a drag — it must never open the sheet. */
  const onGridClickCapture = useCallback((event: ReactMouseEvent<HTMLUListElement>): void => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return {
    renderOrder,
    dragPhase,
    dragId,
    chipRef,
    onGridPointerDown,
    onGridClickCapture,
    moveCard,
  };
}
