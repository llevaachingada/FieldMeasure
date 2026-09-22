/**
 * `tests/clickthru/gestures.ts` — REAL input, over CDP.
 *
 * WHY CDP AND NOT `page.touchscreen`
 *   `page.touchscreen.tap()` is **single-touch only** and cannot express the interaction model
 *   this app implements (two-finger pan, pinch, palm + tap, pen pressure/barrel). Every gesture
 *   here goes through `Input.dispatchTouchEvent` / `Input.dispatchMouseEvent(pointerType:'pen')`
 *   on a CDP session — the same mechanism `tests/e2e/layersReorderTouch.spec.ts` uses and the
 *   repo already proved works in this Chromium.
 *
 * NEVER synthetic `dispatchEvent`. D77/F1 proved synthetic pointer events diverge from real
 *   input (Chromium's implicit pointer capture), and this repo treats them as non-evidence.
 *
 * Timings come from `docs/touch-first-interaction-model.md`:
 *   §1.4 settle 450 ms · §3.1 TAP_SLOP 8 / TAP_MAX_MS 400 / LONG_PRESS_MS 600.
 *
 * MULTI-TOUCH NOTE: CDP identifies a touch point by its index in `touchPoints`, so a finger is
 *   added by sending `touchStart` with the full active set. Sequences here end with
 *   `touchEnd: []` (release all) — a reliable primitive; there is no clean "lift one of N".
 */
import type { BrowserContext, CDPSession, Page } from '@playwright/test';

export interface Point {
  x: number;
  y: number;
}

/** `touchPoints` entries as CDP wants them. */
interface TouchPoint {
  x: number;
  y: number;
}

export interface DragOptions {
  /** Interpolated move steps (jitter-free but still a real gesture). */
  steps?: number;
  /** Hold at the start point before moving (e.g. settle-time contact). */
  holdMs?: number;
  /** Per-step pause so the app's move handlers see distinct frames. */
  stepMs?: number;
}

export class Gestures {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  /** Enable touch emulation and bind a CDP session to this page. */
  static async attach(page: Page, context: BrowserContext): Promise<Gestures> {
    const cdp = await context.newCDPSession(page);
    // `Input.dispatchTouchEvent` is only honoured as real touch when emulation is on; the
    // layers-reorder gate does exactly this (maxTouchPoints large enough for palm + finger).
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return new Gestures(page, cdp);
  }

  private async dispatchTouch(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: TouchPoint[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /** One real finger tap. */
  async tap(p: Point, holdMs = 30): Promise<void> {
    await this.dispatchTouch('touchStart', [{ x: p.x, y: p.y }]);
    try {
      await this.page.waitForTimeout(holdMs);
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /** Tap A, then tap B — the placement verb (caller owns the gap; see TSettle). */
  async tapTap(a: Point, b: Point, gapMs = 280): Promise<void> {
    await this.tap(a);
    await this.page.waitForTimeout(gapMs);
    await this.tap(b);
  }

  /** Hold one finger still for `ms` (600 = mini-toolbar; 400 = the shorter hold windows). */
  async longPress(p: Point, ms = 650): Promise<void> {
    await this.dispatchTouch('touchStart', [{ x: p.x, y: p.y }]);
    try {
      await this.page.waitForTimeout(ms);
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /** One-finger drag with interpolated moves. */
  async drag(from: Point, to: Point, options: DragOptions = {}): Promise<void> {
    const steps = options.steps ?? 8;
    const stepMs = options.stepMs ?? 16;
    await this.dispatchTouch('touchStart', [{ x: from.x, y: from.y }]);
    try {
      if (options.holdMs) await this.page.waitForTimeout(options.holdMs);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await this.dispatchTouch('touchMove', [
          { x: this.lerp(from.x, to.x, t), y: this.lerp(from.y, to.y, t) },
        ]);
        await this.page.waitForTimeout(stepMs);
      }
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /** Two fingers moving together — always pans, in every state (UI §5.4). */
  async twoFingerDrag(a: Point, b: Point, dx: number, dy: number, options: DragOptions = {}): Promise<void> {
    const steps = options.steps ?? 8;
    const stepMs = options.stepMs ?? 16;
    await this.dispatchTouch('touchStart', [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ]);
    try {
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await this.dispatchTouch('touchMove', [
          { x: a.x + dx * t, y: a.y + dy * t },
          { x: b.x + dx * t, y: b.y + dy * t },
        ]);
        await this.page.waitForTimeout(stepMs);
      }
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /** Two fingers moving apart/together along X — pinch zoom, centred on `center`. */
  async pinch(
    center: Point,
    fromSpread: number,
    toSpread: number,
    options: DragOptions = {},
  ): Promise<void> {
    const steps = options.steps ?? 10;
    const stepMs = options.stepMs ?? 16;
    await this.dispatchTouch('touchStart', [
      { x: center.x - fromSpread / 2, y: center.y },
      { x: center.x + fromSpread / 2, y: center.y },
    ]);
    try {
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const spread = this.lerp(fromSpread, toSpread, t);
        await this.dispatchTouch('touchMove', [
          { x: center.x - spread / 2, y: center.y },
          { x: center.x + spread / 2, y: center.y },
        ]);
        await this.page.waitForTimeout(stepMs);
      }
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /**
   * Start an object drag, then land a **second finger** mid-drag. §3.1: the second finger
   * cancels the object drag, restores the pre-drag position, and starts pan/zoom.
   *
   * `holdAfterFirstMoveMs` lets the caller pause mid-drag so an OPFS read can observe the
   * displaced position before the second finger lands (evidence that the grab actually moved
   * the object, not just panned). The touch is ALWAYS released, even if the callback throws.
   */
  async secondFingerCancel(
    start: Point,
    firstMove: Point,
    secondPoint: Point,
    finalFirst: Point,
    finalSecond: Point,
    holdAfterFirstMoveMs = 0,
    /** Runs after the first finger moves and before the second finger lands (for evidence). */
    onFirstMove?: () => Promise<void>,
  ): Promise<void> {
    await this.dispatchTouch('touchStart', [{ x: start.x, y: start.y }]);
    try {
      await this.page.waitForTimeout(40);
      await this.dispatchTouch('touchMove', [{ x: firstMove.x, y: firstMove.y }]);
      if (holdAfterFirstMoveMs > 0) await this.page.waitForTimeout(holdAfterFirstMoveMs);
      if (onFirstMove) await onFirstMove();
      // A second contact lands: `touchStart` with the full active set adds the new point.
      await this.dispatchTouch('touchStart', [
        { x: firstMove.x, y: firstMove.y },
        { x: secondPoint.x, y: secondPoint.y },
      ]);
      await this.page.waitForTimeout(40);
      await this.dispatchTouch('touchMove', [
        { x: finalFirst.x, y: finalFirst.y },
        { x: finalSecond.x, y: finalSecond.y },
      ]);
      await this.page.waitForTimeout(40);
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /**
   * A stationary extra touch point (the palm) plus a finger tap — the H1b shape.
   *
   * Emulation limit: CDP has no clean "lift one of N fingers", so the sequence is
   * palm-down → finger-down → release-all. Real palm physics cannot be reproduced here.
   */
  async palmThenTap(palm: Point, finger: Point): Promise<void> {
    await this.dispatchTouch('touchStart', [{ x: palm.x, y: palm.y }]);
    try {
      await this.page.waitForTimeout(150);
      await this.dispatchTouch('touchStart', [
        { x: palm.x, y: palm.y },
        { x: finger.x, y: finger.y },
      ]);
      await this.page.waitForTimeout(80);
    } finally {
      await this.dispatchTouch('touchEnd', []);
    }
  }

  /* ---- pen (real `pointerType: 'pen'`) ---------------------------------- */

  /** A pen stroke through `points`, with pressure (`force`) applied to every sample. */
  async penStroke(points: readonly Point[], options: { force?: number; stepMs?: number } = {}): Promise<void> {
    if (points.length === 0) return;
    const force = options.force ?? 0.6;
    const stepMs = options.stepMs ?? 16;
    const first = points[0]!;
    // `mousePressed` with `pointerType: 'pen'` → a real `pointerdown` with `pointerType==='pen'`
    // and `pressure === force`. `buttons: 1` = primary contact (the tip drawing).
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: first.x,
      y: first.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      force,
      pointerType: 'pen',
    });
    for (const p of points.slice(1)) {
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: p.x,
        y: p.y,
        button: 'left',
        buttons: 1,
        force,
        pointerType: 'pen',
      });
      await this.page.waitForTimeout(stepMs);
    }
    const last = points[points.length - 1]!;
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: last.x,
      y: last.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      force: 0,
      pointerType: 'pen',
    });
  }

  /** Pen hover: a pen move with no button held (`buttons: 0`) — the pen's proximity signal. */
  async penHover(p: Point): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x,
      y: p.y,
      buttons: 0,
      pointerType: 'pen',
      force: 0,
    });
  }

  /** Pen barrel button = the secondary button (`buttons: 2`) with `pointerType: 'pen'`. */
  async penBarrelClick(p: Point): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: p.x,
      y: p.y,
      button: 'right',
      buttons: 2,
      clickCount: 1,
      pointerType: 'pen',
    });
    await this.page.waitForTimeout(40);
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x,
      y: p.y,
      button: 'right',
      buttons: 0,
      clickCount: 1,
      pointerType: 'pen',
    });
  }
}

/**
 * Timings from `docs/touch-first-interaction-model.md` §1.4 / §3.1 — the values the app
 * implements, exported here so the spec's comments can cite a single source.
 */
export const TSettle = {
  /** Dimension auto-open settle window. */
  SETTLE_MS: 450,
  /** Long-press → select + pin the mini-toolbar. */
  LONG_PRESS_MS: 600,
  /** The shorter hold-to-shape / autosave-coalesce window. */
  HOLD_MS: 400,
  /** Tap drift and duration ceilings. */
  TAP_SLOP_PX: 8,
  TAP_MAX_MS: 400,
} as const;
