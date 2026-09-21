/**
 * Input router — `src/editor/inputRouter.ts`
 *
 * TOUCH-PRIMARY (HARDENED). Copied verbatim from build spec §8.2, which is the
 * single authority on input routing (§8.4/§8.5, §11.1 and slice 0.2 defer to it).
 * Design source: `docs/touch-first-interaction-model.md` §1, §3, §9.
 *
 * Intent is decided once, at `pointerdown`, and is sticky for the whole contact.
 * A contact classified `'draw'` stays `'draw'` for its lifetime (a drifting
 * placement never silently becomes a pan); a second concurrent contact is the
 * one documented exception ("second touch wins").
 *
 * classify truth table (must stay in lock-step with the code below):
 *
 * | Pen seen this session? | Contact       | Active pen stroke? | Time since last pen event | Edge-born / burst? | Result |
 * |---|---|---|---|---|---|
 * | yes | pen                | —   | —             | —     | 'draw' (sets penSeen, refreshes the window) |
 * | yes | touch              | yes | —             | —     | 'ignore' (gate 2) |
 * | yes | touch              | no  | < 1200 ms     | —     | 'ignore' (gate 1) |
 * | yes | touch              | no  | ≥ 1200 ms     | no    | 'draw' if a toggle is on, else 'navigate' |
 * | no  | touch              | n/a | n/a           | burst | 'ignore' (all until every pointer lifts) |
 * | no  | touch              | n/a | n/a           | edge-born | 'navigate' (pan at most — never places) |
 * | no  | touch              | n/a | n/a           | no    | 'draw' if a toggle is on, else 'navigate' |
 * | any | mouse/trackpad     | —   | —             | —     | 'draw' (wheel+Ctrl zoom, spacebar+drag pan) |
 *
 * The pen-free path has NO suppression window: `lastPenAt` stays 0 until a pen
 * event actually fires, so touch is never suppressed merely for existing. The
 * only pen-free heuristics are (a) edge rejection and (b) multi-touch debounce;
 * both are probabilistic and undo + `pointercancel` rollback are the real net.
 */

export type InputIntent = 'draw' | 'navigate' | 'ignore';
// 'draw'     = may create/edit geometry with the active tool (pen always; touch per the toggles)
// 'navigate' = pan/zoom only
// 'ignore'   = palm/heel/OS gesture — no action, no state change

export interface InputRouterOptions {
  palmWindowMs?: number;          // default 1200; refreshed by every pen event
  touchPlaces?: () => boolean;    // «Touch places and moves» — default ON
  fingerDraws?: () => boolean;    // «Finger draws (freehand)» — default OFF
}
const EDGE_REJECT_PX = 24;        // pen-free path (a): outer band a contact can never place from
const PALM_BURST_COUNT = 3;       // pen-free path (b): contacts in a burst that read as a palm/heel
const PALM_BURST_MS = 90;         // pen-free path (b): the burst window

export function createInputRouter(o: InputRouterOptions = {}) {
  const palmWindowMs = o.palmWindowMs ?? 1200;
  const touchPlaces = o.touchPlaces ?? (() => true);
  const fingerDraws = o.fingerDraws ?? (() => false);

  let lastPenAt = 0;
  let penStrokeActive = false;
  let penSeenThisSession = false;                    // has ANY pen event fired since load?
  const touchDownAt = new Map<number, number>();      // pointerId → down time
  const touchBornAtEdge = new Map<number, boolean>(); // pointerId → began in the outer band?
  let burstIgnoreUntilLift = false;                   // pen-free multi-touch debounce latch

  const canCreate = () => touchPlaces() || fingerDraws();

  return {
    /** Feed EVERY pen pointer event (down AND move) through here. */
    notePenEvent(): void { penSeenThisSession = true; lastPenAt = performance.now(); },
    penStrokeStart(): void { penStrokeActive = true; },
    penStrokeEnd(): void { penStrokeActive = false; },

    /** Call on every touch pointerdown with whether it began within EDGE_REJECT_PX of the edge. */
    noteTouchDown(pointerId: number, atEdge: boolean, now = performance.now()): void {
      touchDownAt.set(pointerId, now);
      touchBornAtEdge.set(pointerId, atEdge);
      // (b) multi-touch debounce: a burst of ≥3 contacts inside 90 ms is a heel, not intentional use.
      const recent = [...touchDownAt.values()].filter(t => now - t <= PALM_BURST_MS).length;
      if (recent >= PALM_BURST_COUNT) burstIgnoreUntilLift = true;
    },
    noteTouchUp(pointerId: number): void {
      touchDownAt.delete(pointerId);
      touchBornAtEdge.delete(pointerId);
      if (touchDownAt.size === 0) burstIgnoreUntilLift = false;
    },

    classify(e: PointerEvent, now = performance.now()): InputIntent {
      if (e.pointerType === 'pen') {
        penSeenThisSession = true; lastPenAt = now;
        return 'draw';
      }
      if (e.pointerType === 'touch') {
        if (burstIgnoreUntilLift) return 'ignore';                        // pen-free (b)
        if (penStrokeActive) return 'ignore';                             // pen-present gate 2
        // pen-present gate 1 — only meaningful once a pen has actually been seen this session
        if (penSeenThisSession && now - lastPenAt < palmWindowMs) return 'ignore';
        if (!penSeenThisSession && touchBornAtEdge.get(e.pointerId)) return 'navigate'; // pen-free (a)
        return canCreate() ? 'draw' : 'navigate';
      }
      return 'draw';   // mouse or trackpad
    },

    onPenHover(_e: PointerEvent): void { /* pointerType==='pen' && buttons===0 → hover affordances */ },
  };
}
