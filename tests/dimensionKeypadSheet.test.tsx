/**
 * `tests/dimensionKeypadSheet.test.tsx` — slice 1.5 machine gates for the ft-in keypad
 * sheet (implementation plan §1.5 step 4 + its Tests/Gate rows).
 *
 * The point of these tests: every expectation is built from the REAL frozen primitives in
 * `src/domain/units.ts` (`parseLooseToSlots`, `keypadValueInches`, `composeEnteredText`,
 * `formatLength`, `parseImperialToInches`, `MM_PER_IN`), and the sheet is driven the way
 * the field drives it — hardware keystrokes and taps on the real controls. A passing test
 * here therefore proves the *wiring*, not just a decision: an `isCommittableInches` the
 * button never consulted would fail these.
 *
 * What is proved:
 *   - the §6.1.1 truth table (`12 6`, `12 6 3`, `10'-4 1/2"`) end to end: preview →
 *     committed `valueMm` → committed `enteredText` → strict-parser round trip;
 *   - the session-4 refusal table (`0`, `12 6 20`, `-5`, 1001 ft) each REFUSED WITH ITS
 *     REASON SHOWN, plus the 1000 ft committable boundary;
 *   - `Esc` / `✕` call `onCancel` and commit nothing;
 *   - the fraction chips are entry-scoped (D31) and leave `precisionDenominator` alone;
 *   - the preview is a pure function of the slots, NOT of the composed `enteredText`
 *     (AGENTS #2 — a stored label would be a wrong-measurement bug);
 *   - `initialValueMm` seeds losslessly (wrong-measurement guard);
 *   - the §19.6 a11y floor: focus enters, is trapped, returns on close; every key has an
 *     `aria-label`; the preview is an `aria-live="polite"` region; `Esc` always works.
 *
 * NOT tested here, and why: pixel sizes (72 px keys, the 48 px floor) and the 180 ms slide
 * are CSS — jsdom has no layout, so a number read out of it would prove nothing. The sheet
 * contains no `Konva.Stage`, so jsdom is the honest environment here (D40).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState, type JSX } from 'react';

import DimensionKeypadSheet, {
  FRACTION_CHIPS,
  backspace,
  badFractionInRaw,
  cycleDenominator,
  KEYPAD_KEY_IDS,
  refusalReason,
  scopeToInches,
  seedSlots,
  type DimensionKeypadSheetProps,
} from '../src/ui/DimensionKeypadSheet';
import {
  MAX_LENGTH_IN,
  MM_PER_IN,
  VALID_DENOMINATORS,
  composeEnteredText,
  emptyKeypadState,
  formatLength,
  keypadValueInches,
  parseImperialToInches,
  parseLooseToSlots,
} from '../src/domain/units';
import { STRINGS } from '../src/ui/strings';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Harness — drive the sheet exactly as the field does
// ---------------------------------------------------------------------------

interface Commit {
  valueMm: number;
  enteredText: string;
  chain: boolean;
}

function mountSheet(overrides: Partial<DimensionKeypadSheetProps> = {}) {
  const onCommit = vi.fn<(r: Commit) => void>();
  const onCancel = vi.fn();
  const props: DimensionKeypadSheetProps = {
    precisionDenominator: 16,
    onCommit,
    onCancel,
    ...overrides,
  };
  render(<DimensionKeypadSheet {...props} />);
  return { onCommit, onCancel, props };
}

/** A real key press targets whatever has focus (that is what the browser does). */
function press(key: string, shiftKey = false): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  act(() => {
    fireEvent.keyDown(target, { key, shiftKey });
  });
}

/** §8.1: "just type 12 6 3 and press Enter. No focus required." */
function type(raw: string): void {
  for (const ch of raw) press(ch);
}

function keyEl(id: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`[data-keypad-key="${id}"]`);
  if (!el) throw new Error(`no keypad key "${id}"`);
  return el;
}

function clickKey(id: string): void {
  act(() => {
    keyEl(id).click();
  });
}

const preview = (): HTMLElement => document.querySelector<HTMLElement>('.keypad-preview')!;
const previewText = (): string => preview().textContent ?? '';
const commitButton = (): HTMLButtonElement => keyEl('commit');
const chainButton = (): HTMLButtonElement => keyEl('chain');
const expectedMm = (inches: number): number => inches * MM_PER_IN;

// ---------------------------------------------------------------------------
// Truth table (§6.1.1) — through the real primitives
// ---------------------------------------------------------------------------

describe('truth table — hardware keys, real primitives', () => {
  it(`12 6 → preview 12'-6" and commits exactly 150 in`, () => {
    const { onCommit } = mountSheet();
    type('12 6');

    // Derived with the same pipeline the component runs, not copied from its output.
    const { slots } = parseLooseToSlots('12 6', 16)!;
    const valueIn = keypadValueInches(slots)!;
    expect(valueIn).toBe(150); // 12 × 12 + 6
    expect(previewText()).toContain(
      formatLength(valueIn * MM_PER_IN, 'imperial', slots.denominator, 'ft-in'),
    );
    expect(previewText()).toContain(`12'-6"`);

    act(() => {
      commitButton().click();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const result = onCommit.mock.calls[0][0];
    expect(result.chain).toBe(false);
    expect(result.valueMm).toBeCloseTo(expectedMm(150), 9); // 3810 mm
    expect(result.enteredText).toBe(`12'-6"`);
    // The committed pair agrees: enteredText must round-trip to the value committed.
    expect(parseImperialToInches(result.enteredText)! * MM_PER_IN).toBeCloseTo(result.valueMm, 9);
  });

  it(`12 6 3 → preview 12'-6 3/16" (denominator = project precision)`, () => {
    const { onCommit } = mountSheet();
    type('12 6 3');

    const { slots } = parseLooseToSlots('12 6 3', 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150 + 3 / 16, 12); // 12×12 + 6 + 3/16
    expect(slots.denominator).toBe(16);
    expect(previewText()).toContain(`12'-6 3/16"`);

    act(() => {
      commitButton().click();
    });
    const result = onCommit.mock.calls[0][0];
    expect(result.valueMm).toBeCloseTo(expectedMm(150.1875), 9);
    expect(result.enteredText).toBe(`12'-6 3/16"`);
    expect(parseImperialToInches(result.enteredText)! * MM_PER_IN).toBeCloseTo(result.valueMm, 9);
  });

  it(`10'-4 1/2" → exact, typed the way a crew types it`, () => {
    const { onCommit } = mountSheet();
    type(`10'-4 1/2"`);

    const { slots } = parseLooseToSlots(`10'-4 1/2"`, 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(124.5, 12); // 10×12 + 4 + 1/2
    // The parse keeps the fraction the user wrote, so the preview rounds at 2 and shows
    // 1/2" — not 8/16".
    expect(slots.denominator).toBe(2);
    expect(previewText()).toContain(`10'-4 1/2"`);

    act(() => {
      commitButton().click();
    });
    const result = onCommit.mock.calls[0][0];
    expect(result.valueMm).toBeCloseTo(expectedMm(124.5), 9);
    expect(result.enteredText).toBe(`10'-4 1/2"`);
    expect(parseImperialToInches(result.enteredText)).toBeCloseTo(124.5, 12);
  });

  it('a bare decimal keeps its raw enteredText and its decimal value', () => {
    const { onCommit } = mountSheet();
    type('124.5');

    expect(previewText()).toContain(`10'-4 1/2"`); // the derived label
    act(() => {
      commitButton().click();
    });
    const result = onCommit.mock.calls[0][0];
    // `rawDecimal` is preserved verbatim (§6.1.1 step 2), NOT recomposed as `124 1/2"`.
    expect(result.enteredText).toBe('124.5');
    expect(result.valueMm).toBeCloseTo(expectedMm(124.5), 9);
  });

  // D135 (spec expectation corrected, not weakened): this test drove the OLD prefix model — digits
  // first into the inches slot, then `ft` and MORE digits into feet. The pad is now a calculator
  // pad, where a unit key claims the digits typed BEFORE it: `1 2 FT 6 IN` = 12'-6". Arithmetic:
  // 12 ft x 12 = 144 in, + 6 in = 150 in.
  it('the on-screen keys are postfix, like a calculator: 1 2 FT 6 IN = 12\'-6"', () => {
    const { onCommit } = mountSheet();
    clickKey('digit-1');
    clickKey('digit-2');
    clickKey('ft'); // the 12 becomes FEET
    clickKey('digit-6');
    clickKey('in'); // the 6 becomes whole INCHES

    expect(previewText()).toContain(`12'-6"`);
    act(() => {
      commitButton().click();
    });
    expect(onCommit.mock.calls[0][0]).toEqual({
      valueMm: expectedMm(150),
      enteredText: `12'-6"`,
      chain: false,
    });
  });

  it('1 2 FT 6 IN 3 / 8 = 12\'-6 3/8" and stores exactly what was keyed', () => {
    const { onCommit } = mountSheet();
    for (const k of ['digit-1', 'digit-2', 'ft', 'digit-6', 'in', 'digit-3', 'slash', 'digit-8']) {
      clickKey(k);
    }
    // 12 x 12 = 144, + 6 = 150, + 3/8 = 0.375  ->  150.375 in.
    expect(previewText()).toContain(`12'-6 3/8"`);
    act(() => {
      commitButton().click();
    });
    expect(onCommit.mock.calls[0][0].enteredText).toBe(`12'-6 3/8"`);
    expect(onCommit.mock.calls[0][0].valueMm).toBeCloseTo(expectedMm(150.375), 9);
  });

  it('a preset fraction key enters a whole fraction in one tap, keeping pending whole inches', () => {
    const { onCommit } = mountSheet();
    clickKey('digit-6');
    clickKey('fraction-2'); // 6 then 1/2
    // 6 + 1/2 = 6.5 in.
    expect(previewText()).toContain(`6 1/2"`);
    act(() => {
      commitButton().click();
    });
    expect(onCommit.mock.calls[0][0].enteredText).toBe(`6 1/2"`);
    expect(onCommit.mock.calls[0][0].valueMm).toBeCloseTo(expectedMm(6.5), 9);
  });

  it('/ with no denominator typed uses the project precision (3 / = 3/16 at 1/16)', () => {
    mountSheet({ precisionDenominator: 16 });
    clickKey('digit-3');
    clickKey('slash');
    expect(previewText()).toContain(`3/16"`);
    expect(commitButton().disabled).toBe(false);
  });

  it('a typed denominator is checked: 5 / 3 2 = 5/32, but 3 / 1 is refused with its reason', () => {
    mountSheet();
    for (const k of ['digit-5', 'slash', 'digit-3', 'digit-2']) clickKey(k);
    expect(previewText()).toContain(`5/32"`);
    expect(commitButton().disabled).toBe(false);

    clickKey('clear');
    for (const k of ['digit-3', 'slash', 'digit-1']) clickKey(k); // denominator 1 is not 2/4/8/16/32/64
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorDenominator);
  });

  it('whole inches need IN first: 6 3 / reads 63/16 and is refused, not guessed', () => {
    mountSheet();
    for (const k of ['digit-6', 'digit-3', 'slash']) clickKey(k);
    // numerator 63 >= denominator 16.
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorFractionTooBig);
  });

  it('FT with nothing typed still works prefix-style: FT 1 2 IN 6 = 12\'-6"', () => {
    mountSheet();
    for (const k of ['ft', 'digit-1', 'digit-2', 'in', 'digit-6']) clickKey(k);
    // 6 lands in the inches slot after IN; 12*12 + 6 = 150 in.
    expect(previewText()).toContain(`12'-6"`);
  });

  it('C clears the whole entry', () => {
    mountSheet();
    for (const k of ['digit-1', 'digit-2', 'ft', 'digit-6', 'in']) clickKey(k);
    clickKey('clear');
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorEnterLength);
  });

  it('the typed-entry line shows what was keyed, with the active part marked', () => {
    mountSheet();
    for (const k of ['digit-1', 'digit-2', 'ft', 'digit-6']) clickKey(k);
    const entry = document.querySelector('[data-testid="keypad-entry"]')!;
    expect(entry.textContent).toBe(`12'6"`);
    // The 6 is pending in the inches slot: that is the active (underlined) segment.
    expect(entry.querySelector('.is-active')?.textContent).toBe('6');
  });

  it('⌫ deletes the last character of the slot the next digit would land in', () => {
    mountSheet();
    clickKey('digit-1');
    clickKey('digit-2');
    clickKey('digit-3');
    clickKey('backspace');
    expect(previewText()).toContain(`1'-0"`); // 12 in
    expect(backspace({ ...emptyKeypadState(16), inches: '12' }).inches).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Refusals (session-4 F3/F4) — refused WITH a reason, never a silent disable
// ---------------------------------------------------------------------------

describe('refusal table — the reason is shown, never a silently disabled button', () => {
  it('0 → "Enter a length"', () => {
    mountSheet();
    type('0');
    expect(commitButton().disabled).toBe(true);
    expect(chainButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorEnterLength);
  });

  it('12 6 20 → "Fraction must be smaller than 1/16" (was 151.25" silently)', () => {
    const { onCommit } = mountSheet();
    expect(parseLooseToSlots('12 6 20', 16)).toBeNull(); // the primitive itself refuses
    type('12 6 20');
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorFractionTooBig);
    act(() => {
      commitButton().click();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('-5 → refused with a reason (negatives are not lengths, session-4 F2)', () => {
    const { onCommit } = mountSheet();
    type('-5');
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorEnterLength);
    act(() => {
      commitButton().click();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('1001 ft → "Too large"; 1000 ft is the committable boundary', () => {
    const first = mountSheet();
    type(`1001'`);
    const parsed = parseLooseToSlots(`1001'`, 16)!;
    expect(parsed.slots.feet).toBe('1001');
    expect(keypadValueInches(parsed.slots)).toBe(12012); // 1001 × 12
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorTooLarge);
    expect(first.onCommit).not.toHaveBeenCalled();
    cleanup();

    const second = mountSheet();
    type(`1000'`);
    expect(commitButton().disabled).toBe(false); // exactly MAX_LENGTH_IN = 12000 in
    act(() => {
      commitButton().click();
    });
    expect(second.onCommit.mock.calls[0][0].valueMm).toBeCloseTo(expectedMm(MAX_LENGTH_IN), 9);
  });

  it('a numerator ≥ denominator typed on the pad is refused too', () => {
    mountSheet();
    // 1 5 / 2: numerator 15, denominator 2 (a VALID denominator).
    for (const k of ['digit-1', 'digit-5', 'slash', 'digit-2']) clickKey(k);
    // 15/2 = 7.5 in is arithmetically fine, and `isCommittableInches` says yes. It is still
    // a typo (§6.1.1) — which is exactly why the fraction rule exists on top of the primitive.
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorFractionTooBig);
  });

  it('refusalReason is the only gate the button consults', () => {
    const overFull = { ...emptyKeypadState(16), numerator: '20' };
    expect(
      refusalReason({ buffer: null, slots: overFull, value: keypadValueInches(overFull), denominator: 16 }),
    ).toBe('badFraction');
    expect(refusalReason({ buffer: 'abc', slots: null, value: null, denominator: 16 })).toBe('empty');
    expect(refusalReason({ buffer: '-5', slots: null, value: null, denominator: 16 })).toBe('empty');
    expect(refusalReason({ buffer: '12 6 20', slots: null, value: null, denominator: 16 })).toBe(
      'badFraction',
    );
    expect(
      refusalReason({
        buffer: null,
        slots: parseLooseToSlots('12 6', 16)!.slots,
        value: 150,
        denominator: 16,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cancel semantics (touch model §5.1 — keep the geometry, commit no value)
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('✕ calls onCancel once and commits nothing', () => {
    const { onCommit, onCancel } = mountSheet();
    type('12 6');
    clickKey('cancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Esc cancels from a focused control too (no keyboard trap)', () => {
    const { onCommit, onCancel } = mountSheet();
    type('12 6');
    act(() => {
      chainButton().focus();
    });
    press('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Esc commits nothing even when the entry was committable', () => {
    const { onCommit } = mountSheet();
    type('10');
    expect(commitButton().disabled).toBe(false);
    press('Escape');
    expect(onCommit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D31 — the fraction chips are entry-scoped
// ---------------------------------------------------------------------------

describe('fraction chips are entry-scoped (D31)', () => {
  it('changes this entry’s denominator and leaves precisionDenominator untouched', () => {
    mountSheet({ precisionDenominator: 16 });

    clickKey('fraction-8');
    expect(keyEl('fraction-8').getAttribute('aria-pressed')).toBe('true');
    expect(keyEl('fraction-16').getAttribute('aria-pressed')).toBe('false');

    // The project precision readout is unchanged: the chip changed the ENTRY, not the project.
    expect(screen.getByText('Project precision: 1/16')).toBeTruthy();

    // …and the hardware parse fallback is still the project precision: a loose third
    // integer is read against 16, not against the chipped 8.
    type('12 6 3');
    expect(previewText()).toContain(`12'-6 3/16"`);
  });

  // D135 (spec expectation corrected): the chip used to set the denominator and route the NEXT digits
  // into the numerator (1 then 6 = 16/2 = 8"). A preset key now enters the whole fraction, so a
  // further digit edits the DENOMINATOR: 1/2 then 6 -> denominator "26", which is refused.
  it('after a preset fraction, a further digit edits the denominator (1/2 then 6 = 1/26, refused)', () => {
    mountSheet();
    clickKey('fraction-2');
    expect(previewText()).toContain(`1/2"`);
    clickKey('digit-6'); // denominator typed "2" + "6" = 26, which is not an allowed denominator
    expect(commitButton().disabled).toBe(true);
    expect(previewText()).toContain(STRINGS.keypad.errorDenominator);
    clickKey('backspace'); // back to 2
    expect(previewText()).toContain(`1/2"`);
    expect(commitButton().disabled).toBe(false);
  });

  it('← / → cycle the entry denominator across the whole VALID_DENOMINATORS enum', () => {
    mountSheet();
    clickKey('fraction-16');
    press('ArrowRight'); // → 32, the first step past the four visible chips
    expect(keyEl('fraction-16').getAttribute('aria-pressed')).toBe('false');
    press('ArrowLeft');
    expect(keyEl('fraction-16').getAttribute('aria-pressed')).toBe('true');
    expect(cycleDenominator(16, 1)).toBe(32);
    expect(FRACTION_CHIPS.map((c) => c.denominator)).toEqual([2, 4, 8, 16]);
  });
});

// ---------------------------------------------------------------------------
// The preview is derived (AGENTS #2)
// ---------------------------------------------------------------------------

describe('preview is a pure function of the slots', () => {
  it('shows the DERIVED value, which is not the composed enteredText', () => {
    const { onCommit } = mountSheet();
    clickKey('digit-8');
    clickKey('slash'); // numerator 8, denominator = project precision 16

    const slots = { ...emptyKeypadState(16), numerator: '8', activeSlot: 'numerator' as const };
    // `8/16"` and `1/2"` are the same value: the preview shows the canonical label while the
    // STORED text keeps the user's own fraction.
    expect(composeEnteredText(slots)).toBe(`8/16"`);
    expect(previewText()).toContain(`1/2"`);
    expect(previewText()).toContain(`= 0 1/2"`);

    act(() => {
      commitButton().click();
    });
    expect(onCommit.mock.calls[0][0].enteredText).toBe(`8/16"`);
    expect(onCommit.mock.calls[0][0].valueMm).toBeCloseTo(expectedMm(0.5), 9);
  });

  it('re-renders when the entry denominator changes — no cached label', () => {
    mountSheet();
    for (const k of ['digit-1', 'digit-2', 'in', 'digit-4']) clickKey(k);
    // 12 in + numerator 4 over the default 16 = 12.25 in = 1'-0 1/4".
    const before = previewText();
    expect(before).toContain(`1'-0 1/4"`);

    clickKey('slash');
    clickKey('digit-2'); // same numerator 4, denominator now 2: 12 + 4/2 = 14 in
    expect(previewText()).not.toBe(before);
    expect(previewText()).toContain(`1'-2"`);
  });
});

// ---------------------------------------------------------------------------
// initialValueMm — refine an existing dimension
// ---------------------------------------------------------------------------

describe('initialValueMm seeding', () => {
  it('opens on the current value and commits it unchanged', () => {
    const { onCommit } = mountSheet({ initialValueMm: expectedMm(124.5) });
    expect(previewText()).toContain(`10'-4 1/2"`);
    act(() => {
      commitButton().click();
    });
    expect(onCommit.mock.calls[0][0].valueMm).toBeCloseTo(expectedMm(124.5), 9);
  });

  it('does NOT round a value finer than the project precision (wrong-measurement guard)', () => {
    // 3/64 in = 1.190625 mm. Seeded at the project precision (1/16) it would become
    // 1/16 in = 1.5875 mm — a measurement the user never typed.
    const fine = (3 / 64) * MM_PER_IN;
    expect(fine).toBeCloseTo(1.190625, 9);
    expect((1 / 16) * MM_PER_IN).toBeCloseTo(1.5875, 9);

    const { onCommit } = mountSheet({ initialValueMm: fine });
    expect(previewText()).toContain(`3/64"`);
    act(() => {
      commitButton().click();
    });
    const committed = onCommit.mock.calls[0][0];
    expect(committed.valueMm).toBeCloseTo(fine, 9);
    expect(committed.valueMm).not.toBeCloseTo((1 / 16) * MM_PER_IN, 6);
    expect(committed.enteredText).toBe(`3/64"`);

    // The pure helper agrees, for both an exactly-representable value and a rounded one.
    expect(seedSlots(fine, 16).denominator).toBe(64);
    expect(seedSlots(expectedMm(124.5), 16).denominator).toBe(2); // formatInches reduces 8/16 → 1/2
    expect(seedSlots(null, 16)).toEqual(emptyKeypadState(16));
  });

  it('scopeToInches preserves the measured value exactly', () => {
    const ftIn = parseLooseToSlots(`12'-6 3/16"`, 16)!.slots;
    const scoped = scopeToInches(ftIn);
    expect(scoped.inchesMode).toBe(true);
    expect(scoped.feet).toBe('');
    expect(scoped.numerator).toBe('3'); // the fraction is carried, never re-rounded
    expect(keypadValueInches(scoped)).toBeCloseTo(keypadValueInches(ftIn)!, 12);
    expect(composeEnteredText(scoped)).toBe(`150 3/16"`); // 12 × 12 + 6 = 150
  });
});

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

describe('chain', () => {
  it('commits the same value with chain: true', () => {
    const { onCommit } = mountSheet();
    type('12 6');
    act(() => {
      chainButton().click();
    });
    expect(onCommit.mock.calls[0][0]).toEqual({
      valueMm: expectedMm(150),
      enteredText: `12'-6"`,
      chain: true,
    });
  });

  it('disables with the commit button while the entry is refused', () => {
    mountSheet();
    expect(commitButton().disabled).toBe(true);
    expect(chainButton().disabled).toBe(true);
    type('12 6');
    expect(commitButton().disabled).toBe(false);
    expect(chainButton().disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hardware affordances
// ---------------------------------------------------------------------------

describe('hardware keyboard', () => {
  it('Enter commits when focus is not on a control', () => {
    const { onCommit } = mountSheet();
    type('12 6');
    press('Enter');
    expect(onCommit.mock.calls[0][0].enteredText).toBe(`12'-6"`);
  });

  it('Enter does not steal a focused button’s own action', () => {
    const { onCommit } = mountSheet();
    type('12 6');
    act(() => {
      chainButton().focus();
    });
    press('Enter');
    // The global handler stands down for a focused control (which is why Enter on the
    // Chain button still chains); the button is the one that commits.
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      chainButton().click();
    });
    expect(onCommit.mock.calls[0][0].chain).toBe(true);
  });

  it('Space types the parser separator when focus is not on a control', () => {
    mountSheet();
    type('12');
    press(' ');
    type('6');
    expect(previewText()).toContain(`12'-6"`);
  });

  it('Space is left to a focused control — it does not type into the entry', () => {
    const { onCommit } = mountSheet();
    type('12');
    act(() => {
      commitButton().focus();
    });
    press(' ');
    expect(onCommit).not.toHaveBeenCalled(); // the global handler stood down
    type('6'); // if the Space had typed, this would be 12 ft 6 in
    expect(previewText()).toContain(`10'-6"`); // 126 in — the space never reached the buffer
  });

  it('Backspace edits the on-screen entry when there is no hardware buffer', () => {
    mountSheet();
    clickKey('digit-1');
    clickKey('digit-2');
    clickKey('digit-3');
    press('Backspace');
    expect(previewText()).toContain(`1'-0"`); // 123 in → 12 in
  });
});

// ---------------------------------------------------------------------------
// The offline/error state (UI §8.1)
// ---------------------------------------------------------------------------

describe('offline note', () => {
  it('is shown when the commit callback throws, and the sheet stays open', () => {
    const onCommit = vi.fn(() => {
      throw new Error('folder unavailable');
    });
    mountSheet({ onCommit });
    type('12 6');
    act(() => {
      commitButton().click();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe(STRINGS.keypad.offlineNote);
    expect(screen.getByRole('dialog')).toBeTruthy(); // still open, so it is retryable
  });
});

// ---------------------------------------------------------------------------
// a11y (§19.6)
// ---------------------------------------------------------------------------

describe('accessibility floor', () => {
  it('is a labelled modal dialog and the preview is a polite live region', () => {
    mountSheet();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe(STRINGS.keypad.title);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(preview().getAttribute('aria-live')).toBe('polite');
  });

  it('gives every key an aria-label', () => {
    mountSheet();
    const keys = Array.from(document.querySelectorAll<HTMLElement>('[data-keypad-key]'));
    expect(keys.length).toBeGreaterThan(15);
    for (const el of keys) {
      const label = el.getAttribute('aria-label');
      expect(label, `key ${el.dataset.keypadKey} has no aria-label`).toBeTruthy();
      expect((label ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('announces the refusal reason in the live region (never a silent disable)', () => {
    mountSheet();
    type('0');
    expect(within(preview()).getByText(STRINGS.keypad.errorEnterLength)).toBeTruthy();
  });

  it('focus enters the sheet on open and returns where it came from on close', () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <div>
          <button type="button" data-testid="canvas" onClick={() => setOpen((o) => !o)}>
            canvas
          </button>
          {open ? (
            <DimensionKeypadSheet precisionDenominator={16} onCommit={() => {}} onCancel={() => {}} />
          ) : null}
        </div>
      );
    }
    render(<Harness />);
    const canvas = screen.getByTestId('canvas');

    act(() => {
      canvas.click(); // close
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      canvas.focus();
    });
    act(() => {
      canvas.click(); // reopen — the mount must capture the focused canvas
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    act(() => {
      canvas.click(); // close again
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(canvas);
  });

  it('orders the pad for the keyboard the way it reads on screen', () => {
    mountSheet();
    const pad = Array.from(
      document.querySelectorAll<HTMLElement>('.keypad-pad [data-keypad-key]'),
    ).map((el) => el.dataset.keypadKey);
    // Row-major, calculator order: 7 8 9 | FT | 1/2, 4 5 6 | IN | 1/4, 1 2 3 | / | 1/8,
    // 0 ⌫ | C | 1/16 (0 is double-wide).
    expect(pad).toEqual([
      'digit-7', 'digit-8', 'digit-9', 'ft', 'fraction-2',
      'digit-4', 'digit-5', 'digit-6', 'in', 'fraction-4',
      'digit-1', 'digit-2', 'digit-3', 'slash', 'fraction-8',
      'digit-0', 'backspace', 'clear', 'fraction-16',
    ]);
    expect(pad).toEqual([...KEYPAD_KEY_IDS]);
  });

  it('orders the whole sheet for Tab: cancel → the pad → actions', () => {
    mountSheet();
    const order = Array.from(document.querySelectorAll<HTMLElement>('[data-keypad-key]')).map(
      (el) => el.dataset.keypadKey ?? '',
    );
    expect(order.slice(0, 2)).toEqual(['cancel', 'digit-7']);
    expect(order.slice(-2)).toEqual(['commit', 'chain']);
  });

  it('traps Tab inside the sheet, wrapping both ways', () => {
    mountSheet();
    type('12 6'); // so the last control (Chain) is enabled
    const cancel = keyEl('cancel');
    const chain = chainButton();

    act(() => {
      chain.focus();
    });
    press('Tab');
    expect(document.activeElement).toBe(cancel);

    act(() => {
      cancel.focus();
    });
    press('Tab', true); // Shift+Tab
    expect(document.activeElement).toBe(chain);
  });
});

// ---------------------------------------------------------------------------
// §6.1.1 hints and the `ft`/`in` toggles
// ---------------------------------------------------------------------------

describe('unit toggles and their hints (§6.1.1)', () => {
  it('IN closes the whole inches, so the next digits are a numerator (6 IN 3 = 6 3/16")', () => {
    mountSheet();
    clickKey('digit-6');
    clickKey('in');
    expect(previewText()).toContain(`6"`);
    clickKey('digit-3'); // a numerator now, over the project precision 16
    // 6 + 3/16 = 6.1875 in.
    expect(previewText()).toContain(`6 3/16"`);
  });

  it('⌫ un-presses the last unit key, one step at a time (12\' 6 3/8 -> back to 12\')', () => {
    mountSheet();
    for (const k of ['digit-1', 'digit-2', 'ft', 'digit-6', 'in', 'digit-3', 'slash', 'digit-8']) {
      clickKey(k);
    }
    const entry = (): string => document.querySelector('[data-testid="keypad-entry"]')!.textContent ?? '';
    expect(entry()).toBe(`12'63/8"`);
    clickKey('backspace'); // the typed denominator 8 -> back to the default 16
    expect(entry()).toBe(`12'63/16"`);
    clickKey('backspace'); // un-press /
    clickKey('backspace'); // delete the numerator 3
    clickKey('backspace'); // re-open the inches (6 is still there)
    expect(entry()).toBe(`12'6"`);
    clickKey('backspace'); // delete the 6
    clickKey('backspace'); // un-press FT: 12 is pending inches again
    expect(entry()).toBe(`12"`);
    expect(previewText()).toContain(`1'-0"`);
  });

  it('shows the «← /16» cycling hint once a chip sets the entry denominator', () => {
    mountSheet();
    expect(screen.queryByText(STRINGS.keypad.cycleHint)).toBeNull();
    clickKey('fraction-8');
    expect(screen.getByText(STRINGS.keypad.cycleHint)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// StrictMode — the app really mounts under <StrictMode> (src/main.tsx)
// ---------------------------------------------------------------------------

describe('under <StrictMode>', () => {
  function renderStrict(): void {
    render(
      <StrictMode>
        <DimensionKeypadSheet precisionDenominator={16} onCommit={() => {}} onCancel={() => {}} />
      </StrictMode>,
    );
  }

  it('⌫ on the pad deletes exactly one character, not two', () => {
    // A state updater with a side effect (setSlots nested in setBuffer) is double-invoked
    // under StrictMode, which deletes two characters. jsdom without StrictMode cannot see
    // that, and the dev server IS StrictMode — hence this guard.
    renderStrict();
    clickKey('digit-1');
    clickKey('digit-2');
    clickKey('digit-3');
    clickKey('backspace');
    expect(previewText()).toContain(`1'-0"`); // 12 in
    clickKey('backspace');
    expect(previewText()).toContain(`1"`); // 1 in
  });

  it('hardware ⌫ with no buffer edits the on-screen entry exactly once', () => {
    // THIS is the impure-updater path: a hardware Backspace while the entry belongs to the
    // on-screen slots. `setSlots` nested inside the `setBuffer` updater is double-invoked
    // under StrictMode and deletes two characters instead of one.
    renderStrict();
    clickKey('digit-1');
    clickKey('digit-2');
    clickKey('digit-3');
    press('Backspace');
    expect(previewText()).toContain(`1'-0"`); // 123 in → 12 in, not 1 in
    press('Backspace');
    expect(previewText()).toContain(`1"`); // 12 in → 1 in
  });

  it('commits once per activation (no doubled onCommit)', () => {
    const onCommit = vi.fn();
    render(
      <StrictMode>
        <DimensionKeypadSheet precisionDenominator={16} onCommit={onCommit} onCancel={() => {}} />
      </StrictMode>,
    );
    type('12 6');
    act(() => {
      keyEl('commit').click();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Pure helper boundaries
// ---------------------------------------------------------------------------

describe('helper boundaries', () => {
  it('badFractionInRaw mirrors the parser’s own validation rule', () => {
    expect(badFractionInRaw('12 6 20', 16)).toBe(true); // 20 ≥ 16
    expect(badFractionInRaw('12 6 15', 16)).toBe(false); // valid, and it parses anyway
    expect(badFractionInRaw('20/16"', 16)).toBe(true);
    expect(badFractionInRaw('-5', 16)).toBe(false);
    expect(badFractionInRaw('nonsense', 16)).toBe(false);
    expect(badFractionInRaw(`10' 4 99/100`, 16)).toBe(true); // illegal denominator
  });

  it('cycleDenominator is clamped to the enum and never divides by zero', () => {
    expect(cycleDenominator(2, -1)).toBe(64);
    expect(cycleDenominator(64, 1)).toBe(2);
    const unknown = cycleDenominator(999, 1);
    expect(VALID_DENOMINATORS.includes(unknown as (typeof VALID_DENOMINATORS)[number])).toBe(true);
  });

  it('scopeToInches leaves an inches-only entry alone', () => {
    const inchesOnly = { ...emptyKeypadState(16), inches: '124', inchesMode: true };
    expect(scopeToInches(inchesOnly)).toEqual(inchesOnly);
    expect(keypadValueInches(inchesOnly)).toBe(124);
  });

  it('the four keyed chips are exactly the appendix’s set', () => {
    expect(FRACTION_CHIPS.map((c) => c.label)).toEqual(['1/2', '1/4', '1/8', '1/16']);
    expect(STRINGS.keypad.cycleHint).toBe('← /16');
  });
});
