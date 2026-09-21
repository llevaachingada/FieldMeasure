// tests/keypad.test.ts — §6.1.1 keypad slot model (the fuzzy layer over the strict
// parser). Carries the spec's §6.1.1 test block verbatim, including the property
// test with its coverage assertions and the session-4 commit guards.
import { describe, it, expect } from 'vitest';
import {
  parseImperialToInches,
  parseLooseToSlots,
  keypadValueInches,
  composeEnteredText,
  emptyKeypadState,
  pressDigit,
  pressDot,
  isCommittableInches,
  type KeypadState,
} from '../src/domain/units';

describe('keypad slot model (fuzzy layer)', () => {
  it('12 6 → 12 ft 6 in = 150 in (hardware fast path)', () => {
    const { slots } = parseLooseToSlots('12 6', 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150);
  });
  it('12 6 3 → 12 ft 6 in + 3/16 (denominator = project precision)', () => {
    const { slots } = parseLooseToSlots('12 6 3', 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150 + 3/16);
  });
  it(`12' 6 3 → same (explicit feet + loose numerator)`, () => {
    const { slots } = parseLooseToSlots(`12' 6 3`, 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150 + 3/16);
  });
  it(`10 ft 4 in and 4-1/2 parse (unit words + dash forms)`, () => {
    expect(keypadValueInches(parseLooseToSlots(`10 ft 4 in`, 16)!.slots)).toBeCloseTo(124);
    expect(keypadValueInches(parseLooseToSlots(`4-1/2`, 16)!.slots)).toBeCloseTo(4.5);
  });
  it('bare decimal stays decimal inches (raw preserved)', () => {
    const r = parseLooseToSlots('124.5', 16)!;
    expect(r.rawDecimal).toBe('124.5');
    expect(r.slots.inchesMode).toBe(true);
  });
  it.each([
    // [slots, expected text] — compose invariants
    [{ feet: '10', inches: '4', numerator: '1', denominator: 2 },  `10'-4 1/2"`],
    [{ feet: '10', inches: '4', numerator: '', denominator: 16 },   `10'-4"`],
    [{ feet: '10', inches: '', numerator: '1', denominator: 2 },    `10'-0 1/2"`],
    [{ feet: '10', inches: '', numerator: '', denominator: 16 },    `10'-0"`],
    [{ feet: '', inches: '4', numerator: '1', denominator: 2 },     `4 1/2"`],
    [{ feet: '', inches: '', numerator: '3', denominator: 16 },      `3/16"`],
    [{ feet: '', inches: '124', numerator: '', denominator: 16 },    `124"`],
  ] as const)('composeEnteredText %j → %s', (st, expected) => {
    expect(composeEnteredText(st as unknown as KeypadState)).toBe(expected);
  });
  it('explicit string round-trips through the strict parser', () => {
    const { slots } = parseLooseToSlots(`12' 6 3/8`, 16)!;
    const text = composeEnteredText(slots);
    expect(text).toBe(`12'-6 3/8"`);
    expect(parseImperialToInches(text)).toBeCloseTo(150.375);   // 12 ft 6 3/8 = 12×12 + 6 + 3/8 = 150.375 in
  });
  it('digit routing + dot-as-fraction', () => {
    let st = emptyKeypadState(16);
    st = pressDigit(st, '1'); st = pressDigit(st, '2');   // 12 (inches-mode default start)
    st = pressDot(st);        // → numerator slot, denominator UNCHANGED (16)
    st = pressDigit(st, '8');
    expect(keypadValueInches(st)).toBeCloseTo(12 + 8/16);   // 12 8/16" = 12.5"
  });

  // SESSION-4 FIX (F5): the old generator drew every slot from `String(Math.floor(rand*n))`,
  // which NEVER produces ''. It also drew numerator==='0' ~5% of the time, composing junk
  // like `12'-6 0/16"` that still value-round-trips, so the assertion passed on garbage.
  // Draw '' explicitly, and assert on the SHAPE of the composed text as well as its value.
  const slot = (max: number) => {
    const r = Math.random();
    if (r < 0.2) return '';                                  // empty slot — 20% of draws
    if (r < 0.3) return '0';                                 // zero slot  — 10% of draws
    return String(Math.floor(Math.random() * max) + 1);
  };
  it('composeEnteredText round-trips by VALUE and is well-formed (property, 500 combos)', () => {
    let sawEmptyFeet = 0, sawEmptyInches = 0, sawEmptyNum = 0;
    for (let i = 0; i < 500; i++) {
      const st: KeypadState = {
        feet: slot(30), inches: slot(11), numerator: slot(15),
        denominator: 16, activeSlot: 'inches',
        inchesMode: Math.random() < 0.5,
      };
      if (st.feet === '') sawEmptyFeet++;
      if (st.inches === '') sawEmptyInches++;
      if (st.numerator === '') sawEmptyNum++;
      const text = composeEnteredText(st);
      if (!text) continue;
      // Shape: never a zero numerator, never a leading-zero feet mark.
      expect(text).not.toMatch(/\b0\/\d+/);
      expect(text).not.toMatch(/^0'/);
      const parsed = parseImperialToInches(text);
      expect(parsed).not.toBeNull();
      expect(parsed!).toBeCloseTo(keypadValueInches(st)!);   // value round-trip, not just parseability
    }
    // The generator must actually reach the branches it claims to cover.
    expect(sawEmptyFeet).toBeGreaterThan(20);
    expect(sawEmptyInches).toBeGreaterThan(20);
    expect(sawEmptyNum).toBeGreaterThan(20);
  });

  // SESSION-4: the commit gate (F3/F4) — these are wrong-measurement guards, not niceties.
  it('rejects a zero-length commit', () => {
    expect(isCommittableInches(keypadValueInches(parseLooseToSlots('0', 16)!.slots))).toBe(false);
  });
  it('rejects numerator >= denominator (typo, not a measurement)', () => {
    expect(parseLooseToSlots('12 6 20', 16)).toBeNull();     // was 151.25 in, silently
    expect(parseLooseToSlots('12 6 16', 16)).toBeNull();
    expect(parseLooseToSlots('12 6 15', 16)).not.toBeNull(); // 15/16 is valid
  });
  it('rejects a denominator outside the precision enum', () => {
    expect(parseLooseToSlots(`10' 4 99/100`, 16)).toBeNull();  // was 124.99 in, silently
    expect(parseLooseToSlots(`10' 4 3/8`, 16)).not.toBeNull();
  });
  it('rejects an absurd length', () => {
    expect(isCommittableInches(12001)).toBe(false);          // > 1000 ft
    expect(isCommittableInches(12000)).toBe(true);
  });
  it('a zero slot is not a present slot (F6)', () => {
    expect(composeEnteredText({ feet: '12', inches: '6', numerator: '0', denominator: 16,
      activeSlot: 'numerator', inchesMode: false })).toBe(`12'-6"`);   // was `12'-6 0/16"`
    expect(composeEnteredText({ feet: '0', inches: '4', numerator: '', denominator: 16,
      activeSlot: 'inches', inchesMode: false })).toBe(`4"`);           // was `0'-4"`
    // inches-mode with no whole inches and a zero numerator was a bare `"`.
    expect(composeEnteredText({ feet: '', inches: '', numerator: '0', denominator: 16,
      activeSlot: 'numerator', inchesMode: true })).toBe('');           // was `"`
  });
});
