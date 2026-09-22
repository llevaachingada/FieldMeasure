import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInputRouter } from '../src/editor/inputRouter';

/**
 * Slice 0.2 — input router unit table.
 *
 * Pure node-project test: NO Konva, NO jsdom, NO DOM. Pointer events are
 * synthetic `{ pointerType, pointerId }` objects — the router only reads those
 * two fields, so a real `PointerEvent` is never needed.
 *
 * Time determinism: the router reads `performance.now()` internally
 * (`notePenEvent`, and as the default for `noteTouchDown`/`classify`). We
 * shadow it with a controllable clock and also pass explicit `now` values, so
 * no assertion depends on wall-clock time.
 */

let now = 0;
const originalNow = globalThis.performance.now;

function setNow(ms: number): void {
  now = ms;
}

// A pen TIP contact: `button === 0`, `buttons === 1` (the primary contact).
const pen = (id = 1): PointerEvent =>
  ({ pointerType: 'pen', pointerId: id, button: 0, buttons: 1 }) as unknown as PointerEvent;
// A pen BARREL-button press: the secondary button (`button === 2`, `buttons === 2`).
const penBarrel = (id = 1): PointerEvent =>
  ({ pointerType: 'pen', pointerId: id, button: 2, buttons: 2 }) as unknown as PointerEvent;
const touch = (id = 1): PointerEvent =>
  ({ pointerType: 'touch', pointerId: id }) as unknown as PointerEvent;
const mouse = (id = 1): PointerEvent =>
  ({ pointerType: 'mouse', pointerId: id }) as unknown as PointerEvent;

beforeEach(() => {
  now = 0;
  Object.defineProperty(globalThis.performance, 'now', {
    value: () => now,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis.performance, 'now', {
    value: originalNow,
    configurable: true,
    writable: true,
  });
});

describe('inputRouter — pen', () => {
  it("classifies a pen TIP as 'draw' regardless of the touch toggles", () => {
    const r = createInputRouter({ touchPlaces: () => false, fingerDraws: () => false });
    expect(r.classify(pen())).toBe('draw');
  });

  it("classifies a pen barrel-button press (button === 2) as 'ignore' — never a draw", () => {
    const r = createInputRouter({ touchPlaces: () => true });
    // §11.4/§20.6: the barrel hold is only an *optional accelerator* for the radial
    // quick-menu, which is not built — the documented degrade is a no-op. If this
    // returned 'draw' the barrel press would leave an unintended ink stroke.
    expect(r.classify(penBarrel())).toBe('ignore');
  });

  it("classifies a non-tip pen contact (eraser end, button === 5) as 'ignore' too", () => {
    const r = createInputRouter({ touchPlaces: () => true });
    expect(r.classify({ pointerType: 'pen', pointerId: 1, button: 5, buttons: 32 } as unknown as PointerEvent)).toBe(
      'ignore',
    );
  });

  it('still classifies a pen TIP (button === 0) as draw when both toggles are off', () => {
    const r = createInputRouter({ touchPlaces: () => false, fingerDraws: () => false });
    expect(r.classify(pen())).toBe('draw');
  });

  it('refreshes the palm window on a pen classify (down)', () => {
    const r = createInputRouter();
    setNow(1000);
    expect(r.classify(pen())).toBe('draw');
    // A touch 1100 ms later is inside the 1200 ms window set by that pen event.
    expect(r.classify(touch(), 2100)).toBe('ignore'); // 2100 - 1000 = 1100 < 1200
  });

  it('refreshes the palm window on a pen barrel press too (it is still a pen event)', () => {
    const r = createInputRouter();
    setNow(1000);
    expect(r.classify(penBarrel())).toBe('ignore');
    // The barrel press is a real pen-in-range event, so the 1200 ms palm window re-arms.
    expect(r.classify(touch(), 2100)).toBe('ignore'); // 2100 - 1000 = 1100 < 1200
  });

  it('refreshes the palm window on notePenEvent (a move)', () => {
    const r = createInputRouter();
    setNow(1000);
    r.notePenEvent();
    setNow(1500);
    r.notePenEvent(); // the move re-arms the window
    // Without the move, lastPenAt would be 1000 and this touch (t=2600) would be
    // 1600 ms out — past the window. With the refresh it is only 1100 ms out.
    expect(r.classify(touch(), 2600)).toBe('ignore'); // 2600 - 1500 = 1100 < 1200
  });
});

describe('inputRouter — pen-free path (no pen ever seen)', () => {
  it("lets touch draw when «Touch places and moves» is ON, and never claims a suppression window", () => {
    const r = createInputRouter({ touchPlaces: () => true });
    r.noteTouchDown(1, false, 500);
    expect(r.classify(touch(1), 500)).toBe('draw');

    // No pen has ever been seen, so lastPenAt stays 0 and there is NO window:
    // a later, separate contact is still un-suppressed.
    r.noteTouchUp(1);
    r.noteTouchDown(2, false, 10_000_000);
    expect(r.classify(touch(2), 10_000_000)).toBe('draw');
  });

  it("classifies touch as 'navigate' when BOTH toggles are off", () => {
    const r = createInputRouter({ touchPlaces: () => false, fingerDraws: () => false });
    r.noteTouchDown(1, false, 500);
    expect(r.classify(touch(1), 500)).toBe('navigate');
  });

  it("classifies touch as 'draw' when only «Finger draws (freehand)» is ON", () => {
    const r = createInputRouter({ touchPlaces: () => false, fingerDraws: () => true });
    r.noteTouchDown(1, false, 500);
    expect(r.classify(touch(1), 500)).toBe('draw');
  });

  it("never lets an edge-born touch place without a pen — 'navigate' at most", () => {
    const r = createInputRouter({ touchPlaces: () => true });
    r.noteTouchDown(1, true, 500);
    expect(r.classify(touch(1), 500)).toBe('navigate');
  });
});

describe('inputRouter — pen-present palm gates', () => {
  it("ignores touch within palmWindowMs of a pen event (gate 1)", () => {
    const r = createInputRouter({ touchPlaces: () => true });
    setNow(1000);
    r.notePenEvent();
    r.noteTouchDown(1, false, 1500);
    expect(r.classify(touch(1), 1500)).toBe('ignore'); // 500 < 1200
  });

  it("lets touch through once palmWindowMs has elapsed with no active stroke", () => {
    const on = createInputRouter({ touchPlaces: () => true });
    setNow(1000);
    on.notePenEvent();
    on.noteTouchDown(1, false, 2200);
    expect(on.classify(touch(1), 2200)).toBe('draw'); // 1200 >= 1200, toggle ON

    const off = createInputRouter({ touchPlaces: () => false });
    setNow(1000);
    off.notePenEvent();
    off.noteTouchDown(1, false, 2200);
    expect(off.classify(touch(1), 2200)).toBe('navigate'); // 1200 >= 1200, toggles OFF
  });

  it('ignores touch while a pen stroke is active, even long after palmWindowMs (gate 2, no mid-stroke reopen)', () => {
    const r = createInputRouter({ touchPlaces: () => true });
    setNow(1000);
    r.notePenEvent();
    r.penStrokeStart();
    r.noteTouchDown(1, false, 5000);
    // 5000 - 1000 = 4000 ms — gate 1 is long open, but gate 2 must still catch it.
    expect(r.classify(touch(1), 5000)).toBe('ignore');

    r.penStrokeEnd();
    // With the stroke over and the window long expired, the contact may place.
    expect(r.classify(touch(1), 5000)).toBe('draw');
  });

  it('honours a custom palmWindowMs', () => {
    const r = createInputRouter({ palmWindowMs: 200, touchPlaces: () => true });
    setNow(1000);
    r.notePenEvent();
    r.noteTouchDown(1, false, 1150);
    expect(r.classify(touch(1), 1150)).toBe('ignore'); // 150 < 200
    r.noteTouchDown(2, false, 1200);
    expect(r.classify(touch(2), 1200)).toBe('draw'); // 200 >= 200
  });
});

describe('inputRouter — pen-free multi-touch debounce', () => {
  it('ignores a >=3-contact burst until every pointer lifts, then resumes', () => {
    const r = createInputRouter({ touchPlaces: () => true });
    r.noteTouchDown(1, false, 1000);
    r.noteTouchDown(2, false, 1040);
    r.noteTouchDown(3, false, 1080); // third contact inside 90 ms → latch
    expect(r.classify(touch(1), 1080)).toBe('ignore');

    r.noteTouchUp(1);
    r.noteTouchUp(2);
    expect(r.classify(touch(3), 1080)).toBe('ignore'); // one pointer still down → still latched

    r.noteTouchUp(3); // all pointers up → latch clears
    r.noteTouchDown(4, false, 2000);
    expect(r.classify(touch(4), 2000)).toBe('draw');
  });

  it('does not latch on only two contacts', () => {
    const r = createInputRouter({ touchPlaces: () => true });
    r.noteTouchDown(1, false, 1000);
    r.noteTouchDown(2, false, 1040); // 2 < PALM_BURST_COUNT
    expect(r.classify(touch(1), 1040)).toBe('draw');
  });

  it('does not latch when contacts are slower than the 90 ms burst window', () => {
    const r = createInputRouter({ touchPlaces: () => true });
    r.noteTouchDown(1, false, 1000); // at t=1200: 200 ms old → outside the burst window
    r.noteTouchDown(2, false, 1100); // 100 ms old → outside
    r.noteTouchDown(3, false, 1200); // 0 ms → only 1 inside
    expect(r.classify(touch(3), 1200)).toBe('draw');
  });
});

describe('inputRouter — mouse / trackpad', () => {
  it("always classifies mouse as 'draw' (wheel+Ctrl zoom, spacebar+drag pan)", () => {
    const r = createInputRouter({ touchPlaces: () => false, fingerDraws: () => false });
    expect(r.classify(mouse())).toBe('draw');
  });
});
