// tests/keypadCalculator.test.ts — D135: the calculator-style keys (postfix units:
// `1 2 FT 6 IN 3 / 8`), the Construction Master Pro workflow the owner asked for.
// Pure functions from src/domain/units.ts (one of the four highest-stakes modules), so every
// numeric expectation shows its arithmetic and the property test asserts its own coverage.
import { describe, expect, it } from 'vitest';
import {
  composeEnteredText,
  emptyKeypadState,
  hasBadDenominator,
  isCommittableInches,
  isValidDenominator,
  keypadValueInches,
  parseImperialToInches,
  pressBackspace,
  pressClear,
  pressDigit,
  pressFeet,
  pressFraction,
  pressInch,
  pressSlash,
  type KeypadState,
} from '../src/domain/units';

/** '0'-'9' | 'ft' | 'in' | '/' | 'f2' | 'f4' | 'f8' | 'f16' (preset 1/n) | 'bs' | 'c' */
type Key = string;

function keys(seq: Key[], denominator = 16): KeypadState {
  let st = emptyKeypadState(denominator);
  for (const k of seq) {
    if (/^\d$/.test(k)) st = pressDigit(st, k);
    else if (k === 'ft') st = pressFeet(st);
    else if (k === 'in') st = pressInch(st);
    else if (k === '/') st = pressSlash(st);
    else if (k === 'bs') st = pressBackspace(st);
    else if (k === 'c') st = pressClear(st);
    else if (k.startsWith('f')) st = pressFraction(st, 1, Number(k.slice(1)));
  }
  return st;
}
const inches = (seq: Key[], d = 16): number | null => keypadValueInches(keys(seq, d));

describe('calculator keys — worked examples, arithmetic shown', () => {
  it('1 2 FT 6 IN = 12 ft 6 in = 12*12 + 6 = 150 in', () => {
    expect(inches(['1', '2', 'ft', '6', 'in'])).toBe(150);
  });

  it(`1 2 FT 6 IN 3 / 8 = 150 + 3/8 = 150.375 in, composing 12'-6 3/8"`, () => {
    const st = keys(['1', '2', 'ft', '6', 'in', '3', '/', '8']);
    expect(keypadValueInches(st)).toBe(150.375);
    expect(composeEnteredText(st)).toBe(`12'-6 3/8"`);
  });

  it('6 then the 1/2 key = 6 + 1/2 = 6.5 in', () => {
    expect(inches(['6', 'f2'])).toBe(6.5);
  });

  it('3 / with no denominator typed uses the entry denominator: 3/16 = 0.1875 in', () => {
    expect(inches(['3', '/'])).toBe(0.1875);
    expect(inches(['3', '/'], 8)).toBe(0.375); // 3/8 at project precision 1/8
  });

  it('5 / 3 2 = 5/32 = 0.15625 in', () => {
    expect(inches(['5', '/', '3', '2'])).toBe(0.15625);
  });

  it('a third denominator digit is ignored (5 / 3 2 1 stays 5/32)', () => {
    expect(inches(['5', '/', '3', '2', '1'])).toBe(0.15625);
  });

  it('1 2 4 alone is 124 in (bare digits are inches)', () => {
    expect(inches(['1', '2', '4'])).toBe(124);
  });

  it('FT first, prefix style: FT 1 2 IN 6 = 150 in', () => {
    expect(inches(['ft', '1', '2', 'in', '6'])).toBe(150);
  });

  it(`1 2 FT alone is 144 in, composing 12'-0"`, () => {
    const st = keys(['1', '2', 'ft']);
    expect(keypadValueInches(st)).toBe(144);
    expect(composeEnteredText(st)).toBe(`12'-0"`);
  });

  it('a second FT is ignored, not a second foot count', () => {
    expect(inches(['1', '2', 'ft', '6', 'ft'])).toBe(inches(['1', '2', 'ft', '6']));
  });

  it('a preset fraction replaces a numerator already typed (3 IN 5 then 1/4 = 3 1/4, not 3 5/4)', () => {
    const st = keys(['3', 'in', '5', 'f4']);
    expect(st.numerator).toBe('1');
    // 3 whole inches (closed by IN) + 1/4 = 3.25 in; the typed 5 was replaced, not appended.
    expect(keypadValueInches(st)).toBe(3.25);
  });

  it('a preset fraction keeps the pending whole inches (3 then 1/4 = 3 1/4 = 3.25 in)', () => {
    expect(inches(['3', 'f4'])).toBe(3.25);
  });
});

describe('calculator keys — wrong-measurement guards', () => {
  it('6 3 / reads 63/16: the numerator is not smaller than the denominator (the sheet refuses it)', () => {
    const st = keys(['6', '3', '/']);
    expect(st.numerator).toBe('63');
    expect(Number(st.numerator) >= st.denominator).toBe(true); // 63 >= 16
  });

  it('an invalid denominator has NO value (3 / 1 -> null), never a guessed one', () => {
    const st = keys(['3', '/', '1']);
    expect(hasBadDenominator(st)).toBe(true);
    expect(keypadValueInches(st)).toBeNull();
  });

  it('denominator 0 has no value either (no Infinity)', () => {
    expect(keypadValueInches(keys(['3', '/', '0']))).toBeNull();
  });

  it('every allowed denominator typed by digits is valid; 1, 3, 6 and 26 are not', () => {
    for (const d of ['2', '4', '8', '16', '32', '64']) {
      expect(isValidDenominator(Number(d))).toBe(true);
      expect(hasBadDenominator(keys(['1', '/', ...d.split('')]))).toBe(false);
    }
    for (const d of ['1', '3', '6', '26']) {
      expect(hasBadDenominator(keys(['1', '/', ...d.split('')]))).toBe(true);
    }
  });

  it('/ with nothing typed does nothing (no phantom fraction)', () => {
    const st = emptyKeypadState(16);
    expect(pressSlash(st)).toEqual(st);
  });

  it('IN with nothing typed does nothing', () => {
    const st = emptyKeypadState(16);
    expect(pressInch(st)).toEqual(st);
  });
});

describe('calculator keys — backspace steps back through the slots', () => {
  it('un-presses the denominator, then /, the numerator, IN, the inches and FT, in reverse', () => {
    let st = keys(['1', '2', 'ft', '6', 'in', '3', '/', '8']);
    st = pressBackspace(st); // typed denominator 8 -> back to the default 16
    expect(st.denominator).toBe(16);
    expect(st.denominatorTyped).toBe('');
    st = pressBackspace(st); // un-press /
    expect(st.activeSlot).toBe('numerator');
    st = pressBackspace(st); // delete the 3
    expect(st.numerator).toBe('');
    st = pressBackspace(st); // re-open the inches
    expect(st.activeSlot).toBe('inches');
    st = pressBackspace(st); // delete the 6
    expect(st.inches).toBe('');
    st = pressBackspace(st); // un-press FT: 12 is pending inches again
    expect(st.feet).toBe('');
    expect(st.inches).toBe('12');
  });

  it('backspace on an empty entry does nothing', () => {
    const st = emptyKeypadState(16);
    expect(pressBackspace(st)).toEqual(st);
  });

  it("C resets to the entry's STARTING denominator, even after one was typed", () => {
    expect(pressClear(keys(['3', '/', '3', '2'], 8))).toEqual(emptyKeypadState(8));
  });
});

describe('calculator keys — property: what is composed always parses back to the value shown', () => {
  // Deterministic PRNG (mulberry32) so a failure is reproducible.
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ALPHABET: Key[] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'ft', 'in', '/', 'f2', 'f4', 'f8', 'f16', 'bs', 'c',
  ];

  it('2000 random key sequences: any committable entry composes to text that strictly re-parses to it', () => {
    const rand = rng(135);
    let committable = 0;
    let withFeet = 0;
    let withFraction = 0;
    let withTypedDenominator = 0;
    for (let n = 0; n < 2000; n += 1) {
      const len = 1 + Math.floor(rand() * 10);
      const seq: Key[] = [];
      for (let i = 0; i < len; i += 1) seq.push(ALPHABET[Math.floor(rand() * ALPHABET.length)]!);
      const st = keys(seq);
      const v = keypadValueInches(st);
      const fractionOk = st.numerator === '' || Number(st.numerator) < st.denominator;
      if (v === null || !isCommittableInches(v) || !fractionOk) continue;
      committable += 1;
      if (st.feet !== '' && Number(st.feet) > 0) withFeet += 1;
      if (st.numerator !== '' && Number(st.numerator) > 0) withFraction += 1;
      if ((st.denominatorTyped ?? '') !== '') withTypedDenominator += 1;
      const text = composeEnteredText(st);
      expect(text, `sequence ${seq.join(' ')}`).not.toBe('');
      const back = parseImperialToInches(text);
      expect(back, `sequence ${seq.join(' ')} -> "${text}"`).not.toBeNull();
      expect(back as number).toBeCloseTo(v, 9);
    }
    // The generator must actually reach the branches it claims to test (session-4 F5).
    expect(committable).toBeGreaterThan(400);
    expect(withFeet).toBeGreaterThan(40);
    expect(withFraction).toBeGreaterThan(40);
    expect(withTypedDenominator).toBeGreaterThan(20);
  });
});
