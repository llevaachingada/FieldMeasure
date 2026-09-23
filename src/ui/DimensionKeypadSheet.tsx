/**
 * `src/ui/DimensionKeypadSheet.tsx` — the ft-in dimension keypad sheet
 * (implementation plan slice 1.5, build order step 4; UI spec §8.1; build spec §6.1.1;
 * touch-first interaction model §5.1).
 *
 * This is the ONE place a measured number is entered, so **no arithmetic lives here**.
 * Every value comes from the frozen primitives in `src/domain/units.ts`:
 * `emptyKeypadState`, `pressDigit`, `pressDot`, `keypadValueInches`,
 * `composeEnteredText`, `parseLooseToSlots`, `isCommittableInches`, `formatLength`,
 * `VALID_DENOMINATORS`, `MAX_LENGTH_IN`, `MM_PER_IN`. This file is the sheet: routing,
 * the live preview, the refusal reasons, the modal a11y and the hardware keyboard.
 *
 * NON-NEGOTIABLES THIS FILE IS BUILT AROUND
 *  - **No stored label (AGENTS #2).** The preview is a PURE FUNCTION of the slot state:
 *    `formatLength(keypadValueInches(st) * MM_PER_IN, 'imperial', st.denominator, 'ft-in')`.
 *    The composed `enteredText` is composed for *storage*; it is never re-parsed for
 *    display (spec §6.1.1: "never parse the composed string for display").
 *  - **Screen pixels are never stored (AGENTS #1).** The sheet commits exactly
 *    `{ valueMm, enteredText, chain }`.
 *  - **`Enter` is gated on `isCommittableInches` (session-4 F3/F4)** — not on null/NaN.
 *    When it blocks, the preview says WHY: a disabled button with no explanation reads
 *    as a broken app in the field.
 *  - **D31 entry-scoped precision.** The fraction chips set THIS entry's denominator
 *    (`slots.denominator`). The `precisionDenominator` prop is never changed: it stays
 *    the hardware parse fallback and the `Project precision:` chip.
 *  - **Touch model §5.1.** `Esc` and `✕` keep the geometry and commit no value. The
 *    "rail/style at 40% and non-interactive" half is the mounting lane's, not this file's.
 *    The sheet's own frame is `pointer-events: none` so the canvas stays live for the
 *    pan/pinch the model keeps.
 *
 * D135 (owner request, 2026-09-23): the pad is now a CALCULATOR pad in the Construction Master Pro
 * mould — digits first (7 8 9 on top), then the unit key that claims them: `1 2 FT 6 IN 3 / 8` =
 * 12'-6 3/8". The preset fraction keys (1/2 1/4 1/8 1/16) enter a whole fraction in one tap, `/` types
 * any other, `C` clears. A typed-entry line above the value shows exactly what was keyed, with the
 * active part underlined. The key logic is the pure `pressFeet/pressInch/pressSlash/pressFraction/
 * pressBackspace/pressClear` in `src/domain/units.ts`; this file only routes taps to them.
 *
 * DELIBERATE, REPORTED SCOPE NOTES (do not read these as spec silence)
 *  1. `units.ts` exposes no backspace primitive, so `backspace()` below is a UI-local
 *     edit of one slot string using `pressDigit`'s own routing. It computes no value.
 *  2. `units.ts` exposes no "re-scope feet → inches" primitive. `scopeToInches()` below
 *     preserves `keypadValueInches` EXACTLY (it moves whole feet into the inches slot and
 *     leaves the fraction untouched — no rounding), which is asserted in the tests.
 *  3. The pinned prop shape has no channel for the store-driven "folder unavailable"
 *     state, so UI §8.1's offline note is surfaced only when `onCommit` throws. The sheet
 *     then stays open and retryable. Reported for integration.
 *  4. §6.1.1 defines two entry paths (on-screen slots and a hardware text buffer) and says
 *     nothing about mixing them mid-entry. Simplest behaviour here: each path owns the
 *     entry, and starting one ends the other. The preview always shows the current reading.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Check, Link, X } from 'lucide-react';

import {
  MAX_LENGTH_IN,
  MM_PER_IN,
  VALID_DENOMINATORS,
  composeEnteredText,
  emptyKeypadState,
  formatLength,
  isCommittableInches,
  hasBadDenominator,
  keypadValueInches,
  parseLooseToSlots,
  pressBackspace,
  pressClear,
  pressDigit,
  pressFeet,
  pressFraction,
  pressInch,
  pressSlash,
  type KeypadState,
} from '@/domain/units';

import { fractionLabel, STRINGS, t } from './strings';
import './dimensionKeypad.css';

// ---------------------------------------------------------------------------
// Pinned interface — the machine lane mounts against EXACTLY this shape.
// ---------------------------------------------------------------------------

export interface DimensionKeypadSheetProps {
  /** Project precision denominator (2|4|8|16|32|64): the default slot denominator + parse fallback. */
  precisionDenominator: number;
  /** Refining an existing dimension: its current value in mm (null/absent for a fresh placement). */
  initialValueMm?: number | null;
  /** «Use this value» -> chain:false; «Chain: commit & start next from B» -> chain:true. */
  onCommit: (result: { valueMm: number; enteredText: string; chain: boolean }) => void;
  /** Esc / ✕ — keep the geometry, commit no value. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Copy + the refusal model
// ---------------------------------------------------------------------------

/** Why the commit gate is blocked. `null` = committable. */
export type KeypadRefusal = 'empty' | 'badFraction' | 'badDenominator' | 'tooLarge';

/** The reason copy, in the preview area (plan §1.5 step 4). */
export const REFUSAL_COPY: Record<KeypadRefusal, string> = {
  empty: STRINGS.keypad.errorEnterLength,
  badFraction: STRINGS.keypad.errorFractionTooBig,
  badDenominator: STRINGS.keypad.errorDenominator,
  tooLarge: STRINGS.keypad.errorTooLarge,
};

export interface RefusalInput {
  /** The raw hardware buffer, when the entry came from the keyboard. */
  buffer: string | null;
  /** The slots the preview reads (null when a hardware buffer did not parse). */
  slots: KeypadState | null;
  /** `keypadValueInches(slots)`. */
  value: number | null;
  /** The parse fallback — the project precision. */
  denominator: number;
}

/**
 * A fraction is a typo, not a measurement, when its numerator is not smaller than its
 * denominator (spec §6.1.1 `mk`). Read lexically from FAILED input only, because
 * `parseLooseToSlots` collapses "bad fraction" and "unreadable" into one `null` —
 * `mk` cannot tell us which. This classifies the message; it computes no length.
 */
export function badFractionInRaw(raw: string, denominator: number): boolean {
  const s = raw
    .toLowerCase()
    .replace(/feet|foot|ft/g, ' ')
    .replace(/inches|inch|in(?![a-z])/g, ' ')
    .replace(/['"]/g, ' ');
  // Any explicit `n/d` in input that failed to parse is a fraction the user meant.
  if (/\d\s*\/\s*\d/.test(s)) return true;
  // A loose third integer is the numerator the parser reads with the project denominator:
  // `12 6 20` (20 >= 16) is a typo; `12 6 15` parses and never reaches here.
  const loose = s.trim().match(/^(\d+)[\s-]+(\d+)[\s-]+(\d+)$/);
  return loose !== null && Number(loose[3]) >= denominator;
}

/**
 * The single refusal decision. `isCommittableInches` is authoritative for the VALUE
 * (null, non-finite, `<= 0` and `> MAX_LENGTH_IN` are all refused); the fraction rule is
 * the one thing it does not check, and the reason string for it exists (spec §6.1.1).
 */
export function refusalReason({ buffer, slots, value, denominator }: RefusalInput): KeypadRefusal | null {
  if (buffer !== null && buffer.trim() !== '' && slots === null) {
    return badFractionInRaw(buffer, denominator) ? 'badFraction' : 'empty';
  }
  // A fraction whose denominator is not 2/4/8/16/32/64 (typed after `/`, still incomplete or a typo).
  if (slots !== null && hasBadDenominator(slots)) return 'badDenominator';
  if (value === null) return 'empty';
  if (!isCommittableInches(value)) return value > MAX_LENGTH_IN ? 'tooLarge' : 'empty';
  if (slots !== null && slots.numerator !== '' && Number(slots.numerator) >= slots.denominator) {
    return 'badFraction';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure slot helpers (UI-local; they never compute a value)
// ---------------------------------------------------------------------------

/** The four preset fraction keys. Each enters a WHOLE fraction in one tap (`1/2` … `1/16`); any
 *  other is typed with the `/` key. `←` / `→` on a hardware keyboard still walk all of
 *  `VALID_DENOMINATORS` (the `«← /16»` cycling hint). */
export const FRACTION_CHIPS = [
  { denominator: 2, label: STRINGS.keypad.fractionHalf },
  { denominator: 4, label: STRINGS.keypad.fractionQuarter },
  { denominator: 8, label: STRINGS.keypad.fractionEighth },
  { denominator: 16, label: STRINGS.keypad.fractionSixteenth },
] as const;

/** The pad in reading (and therefore Tab) order: calculator digit order, then the unit column
 *  (FT · IN · /), then the fraction column. DOM order == visual order so traversal matches the eye.
 *  `0` is double-wide, as on a calculator. Row 4 ends in `C` in the unit column. */
export const KEYPAD_LAYOUT = [
  ['7', '8', '9', 'ft', 'fraction-2'],
  ['4', '5', '6', 'in', 'fraction-4'],
  ['1', '2', '3', 'slash', 'fraction-8'],
  ['0', 'backspace', 'clear', 'fraction-16'],
] as const;

/** Every key id on the pad, in reading order (also the Tab order). */
export const KEYPAD_KEY_IDS: readonly string[] = KEYPAD_LAYOUT.flat().map((id) =>
  /^\d$/.test(id) ? `digit-${id}` : id,
);

/** One segment of the typed-entry line: what was keyed, and whether it is the part being typed. */
export interface EntrySegment {
  kind: 'feet' | 'inches' | 'numerator' | 'slash' | 'denominator';
  text: string;
  /** The slot the next digit lands in. */
  active: boolean;
  /** The denominator is the default (project precision), not typed. */
  muted?: boolean;
}

/**
 * The typed-entry line as segments — `12'` `6` `3` `/` `8` `"`. Pure: a view of the slots, so it can never
 * disagree with the value (AGENTS #2: nothing here is stored or parsed back).
 */
export function entrySegments(st: KeypadState): EntrySegment[] {
  const out: EntrySegment[] = [];
  if (st.feet !== '') {
    out.push({ kind: 'feet', text: `${st.feet}'`, active: st.activeSlot === 'feet' });
  }
  if (st.inches !== '') {
    out.push({ kind: 'inches', text: st.inches, active: st.activeSlot === 'inches' });
  }
  if (st.numerator !== '') {
    const typed = st.activeSlot === 'denominator' && (st.denominatorTyped ?? '') !== '';
    out.push({ kind: 'numerator', text: st.numerator, active: st.activeSlot === 'numerator' });
    out.push({ kind: 'slash', text: '/', active: false });
    out.push({
      kind: 'denominator',
      text: typed ? (st.denominatorTyped as string) : String(st.denominator),
      active: st.activeSlot === 'denominator',
      muted: !typed,
    });
  }
  if (st.inches !== '' || st.numerator !== '') {
    out.push({ kind: 'inches', text: '"', active: false });
  }
  return out;
}

/**
 * Seed the entry from an existing dimension so «refine» opens on its current value.
 *
 * `formatLength` reduces fractions, so the seeded entry denominator is whatever the
 * displayed fraction reduces to — which is fine and normal. What is NOT acceptable is
 * seeding a value THROUGH a coarser rounding: that would commit a measurement the user
 * never typed (AGENTS #2, and the plan's own wrong-measurement tripwire). So pick the
 * first denominator in the project precision then finest-to-coarsest order that
 * represents the value exactly; fall back to the project precision (a genuinely
 * unrepresentable value, e.g. one typed as a bare decimal).
 */
export function seedSlots(
  initialValueMm: number | null | undefined,
  precisionDenominator: number,
): KeypadState {
  if (
    initialValueMm === null ||
    initialValueMm === undefined ||
    !Number.isFinite(initialValueMm) ||
    initialValueMm <= 0
  ) {
    return emptyKeypadState(precisionDenominator);
  }
  const valueIn = initialValueMm / MM_PER_IN;
  const candidates = [precisionDenominator, ...VALID_DENOMINATORS].filter(
    (d, i, all) => all.indexOf(d) === i,
  );
  // 0.046875 in (3/64) at project precision 16: 16/8/4/2/32 all round it; 64 is exact.
  const denom =
    candidates.find((d) => Math.abs(Math.round(valueIn * d) / d - valueIn) < 1e-9) ??
    precisionDenominator;
  const text = formatLength(initialValueMm, 'imperial', denom, 'ft-in');
  const parsed = parseLooseToSlots(text, precisionDenominator)?.slots;
  return parsed ? closeWholeParts(parsed) : emptyKeypadState(precisionDenominator);
}

/**
 * An entry that already has whole inches (a seeded refine value, or the slots a hardware buffer
 * parsed to) is CLOSED: the next digits are a numerator, and `/` acts on that — never on the inches
 * already there (`12'-6"` then `/` must not turn the 6 into a numerator).
 */
export function closeWholeParts(st: KeypadState): KeypadState {
  if (st.activeSlot === 'inches' && st.inches !== '') return { ...st, activeSlot: 'numerator' };
  return st;
}

/** `⌫`: delete the last thing typed, stepping back through the slots (see `pressBackspace`). */
export const backspace = pressBackspace;

/**
 * `in` re-scopes the WHOLE entry to inches (§6.1.1). Exact by construction: whole feet
 * become whole inches (`feet × 12`) and the fraction is carried unchanged, so
 * `keypadValueInches` is identical before and after (asserted in the tests).
 */
export function scopeToInches(st: KeypadState): KeypadState {
  if (st.inchesMode) return st;
  const whole = Number(st.feet || 0) * 12 + Number(st.inches || 0);
  const hadFeet = st.feet !== '' && Number(st.feet) > 0;
  return {
    ...st,
    feet: '',
    inches: hadFeet || st.inches !== '' ? String(whole) : '',
    inchesMode: true,
  };
}

/** `←` / `→` walk the denominator enum (the `«← /16»` hint chip). */
export function cycleDenominator(denominator: number, direction: 1 | -1): number {
  const list = VALID_DENOMINATORS as readonly number[];
  const index = list.indexOf(denominator);
  const next = index < 0 ? 0 : (index + direction + list.length) % list.length;
  return list[next];
}

const FOCUSABLE = 'button:not([disabled])';

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export default function DimensionKeypadSheet({
  precisionDenominator,
  initialValueMm = null,
  onCommit,
  onCancel,
}: DimensionKeypadSheetProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [slots, setSlots] = useState<KeypadState>(() =>
    seedSlots(initialValueMm, precisionDenominator),
  );
  /** Non-null = the hardware path owns the entry (the lenient text buffer). */
  const [buffer, setBuffer] = useState<string | null>(null);
  const [cycleHint, setCycleHint] = useState(false);
  const [offline, setOffline] = useState(false);

  // ---- derived state: the preview is a pure function of the slots --------------
  const parsed = useMemo(
    () => (buffer === null ? null : parseLooseToSlots(buffer, precisionDenominator)),
    [buffer, precisionDenominator],
  );
  const activeSlots: KeypadState | null = buffer === null ? slots : (parsed?.slots ?? null);
  const shownSlots: KeypadState = activeSlots ?? slots;
  const value = activeSlots === null ? null : keypadValueInches(activeSlots);
  const rawDecimal = buffer === null ? null : (parsed?.rawDecimal ?? null);
  const reason = refusalReason({
    buffer,
    slots: activeSlots,
    value,
    denominator: precisionDenominator,
  });
  const committable = reason === null && value !== null && activeSlots !== null;

  const segments = entrySegments(shownSlots);
  const previewText =
    value === null || activeSlots === null
      ? null
      : formatLength(value * MM_PER_IN, 'imperial', activeSlots.denominator, 'ft-in');
  const secondaryText =
    value === null || activeSlots === null
      ? null
      : formatLength(value * MM_PER_IN, 'imperial', activeSlots.denominator, 'in');

  // ---- commit ------------------------------------------------------------------
  const commit = useCallback(
    (chain: boolean) => {
      if (!committable || value === null || activeSlots === null) return;
      const enteredText = rawDecimal ?? composeEnteredText(activeSlots);
      try {
        onCommit({ valueMm: value * MM_PER_IN, enteredText, chain });
        setOffline(false);
      } catch {
        // UI §8.1 error state: the geometry and the typed value stay; the user can retry.
        setOffline(true);
      }
    },
    [activeSlots, committable, onCommit, rawDecimal, value],
  );

  // ---- on-screen keys (the slot model) -----------------------------------------
  /**
   * An on-screen edit owns the entry from now on. When a hardware buffer was in play we
   * continue from the slots it produced, so the edit applies to the value on screen.
   */
  const editSlots = useCallback(
    (fn: (s: KeypadState) => KeypadState) => {
      setBuffer(null);
      setSlots((current) =>
        fn(buffer === null ? current : closeWholeParts(parsed?.slots ?? current)),
      );
    },
    [buffer, parsed],
  );

  const onKeyDigit = (d: string): void => editSlots((s) => pressDigit(s, d));
  const onKeyBackspace = (): void => editSlots((s) => pressBackspace(s));
  const onFt = (): void => editSlots((s) => pressFeet(s));
  const onIn = (): void => editSlots((s) => pressInch(s));
  const onSlash = (): void => editSlots((s) => pressSlash(s));
  const onClear = (): void => editSlots((s) => pressClear(s));
  /** A preset fraction: one tap enters the whole fraction (D135). */
  const onFractionKey = (denominator: number): void => {
    setCycleHint(true);
    editSlots((s) => pressFraction(s, 1, denominator));
  };
  const onCycle = (direction: 1 | -1): void => {
    setCycleHint(true);
    // A cycled denominator is the entry's default now, not digits typed after `/`.
    editSlots((s) => ({
      ...s,
      denominator: cycleDenominator(s.denominator, direction),
      denominatorTyped: '',
    }));
  };

  // ---- hardware keyboard (§8.1: "no focus required") --------------------------
  const hardwareInput = useCallback((chunk: string) => {
    // `null` means the on-screen entry owned it; a keystroke starts a fresh buffer.
    setBuffer((b) => (b === null ? chunk : b + chunk));
  }, []);
  const hardwareBackspace = useCallback(() => {
    // Keep the updaters PURE: React double-invokes them under StrictMode, so a `setSlots`
    // call nested inside the `setBuffer` updater deletes two characters, not one. Proved by
    // the `<StrictMode>` test in tests/dimensionKeypadSheet.test.tsx (it fails on the nested
    // version with `123` → `1`).
    if (buffer === null) {
      editSlots((s) => pressBackspace(s));
      return;
    }
    setBuffer((b) => (b === null ? null : b.slice(0, -1)));
  }, [buffer, editSlots]);

  const trapTab = useCallback((event: KeyboardEvent): void => {
    const root = rootRef.current;
    if (!root) return;
    // Every focusable element in the sheet is a button, so this is exact — and it works
    // in jsdom, where `offsetParent`/layout-based visibility filters do not.
    const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active !== null && root.contains(active);
    if (event.shiftKey) {
      if (!inside || active === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      const target = event.target as HTMLElement | null;
      const onControl =
        target !== null &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable === true);

      // `Esc` always cancels, wherever focus is — this is what makes it not a trap.
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      // `Enter` on a focused control belongs to that control (`Chain` vs `Use this value`).
      if (key === 'Enter') {
        if (onControl) return;
        event.preventDefault();
        event.stopPropagation();
        commit(false);
        return;
      }
      if (key === 'Tab') {
        trapTab(event);
        return;
      }
      if (key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        hardwareBackspace();
        return;
      }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        onCycle(-1);
        return;
      }
      if (key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        onCycle(1);
        return;
      }
      // Space still activates a focused control; elsewhere it is the parser's separator.
      if (key === ' ' && onControl) return;
      if (
        /^[0-9]$/.test(key) ||
        key === '.' ||
        key === "'" ||
        key === '"' ||
        key === '-' ||
        key === '/' ||
        key === ' '
      ) {
        event.preventDefault();
        event.stopPropagation();
        hardwareInput(key);
      }
      // Letters are deliberately NOT captured: the keypad's hardware path is numeric, and
      // the layout's tool hotkeys keep working (reported as a §6.1.1 affordance gap).
    };
    // Capture phase: the `Esc` ladder and tool hotkeys in `EditorLayout` must not fire
    // while a measurement is being typed.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [commit, hardwareBackspace, hardwareInput, onCancel, onCycle, trapTab]);

  // ---- focus (§19.6): in on open, back where it came from on close -------------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The dialog itself takes focus, not the ✕: with focus on a button, Space would
    // activate it instead of typing the parser's separator.
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // ---- render ------------------------------------------------------------------
  return (
    <div className="keypad-scrim">
      <div
        ref={rootRef}
        className="keypad-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={STRINGS.keypad.title}
        tabIndex={-1}
      >
        <header className="keypad-header">
          <h2 className="keypad-title">{STRINGS.keypad.title}</h2>
          <button
            type="button"
            className="keypad-cancel hit-slop"
            data-keypad-key="cancel"
            aria-label={STRINGS.editor.cancel}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{STRINGS.editor.cancel}</span>
          </button>
        </header>

        {/* The point of the whole sheet: slots → value, never a re-parsed string. The
            derived value stays visible when the gate blocks, so the reason explains the
            reading instead of replacing it. */}
        <div
          className={`keypad-preview keypad-preview--${reason ?? 'ok'}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {/* What was KEYED, part by part, the active part underlined: the calculator's display.
              Visual only (the polite live region below reads the value and the reason). */}
          <div className="keypad-entry mono" aria-hidden="true" data-testid="keypad-entry">
            {segments.length === 0 ? (
              <span className="keypad-entry-empty">0"</span>
            ) : (
              segments.map((seg, i) => (
                <span
                  key={i}
                  className={`keypad-seg keypad-seg--${seg.kind}${seg.active ? ' is-active' : ''}${seg.muted ? ' is-muted' : ''}`}
                >
                  {seg.text}
                </span>
              ))
            )}
          </div>
          {previewText !== null ? (
            <>
              <span className="keypad-preview-value mono">{previewText}</span>
              <span className="keypad-preview-unit">{STRINGS.dimension.unitFtIn}</span>
              <span className="keypad-preview-secondary mono">{`= ${secondaryText}`}</span>
            </>
          ) : null}
          {reason !== null ? (
            <span className="keypad-preview-reason">{REFUSAL_COPY[reason]}</span>
          ) : null}
        </div>

        {/* The calculator pad (D135): digits 7 8 9 on top, the unit column (FT · IN · /), and the
            preset fractions. Every key is a labelled 72 px button; the DOM order is the reading
            order. */}
        <div className="keypad-pad">
          {KEYPAD_LAYOUT.flat().map((id) => {
            if (/^\d$/.test(id)) {
              return (
                <button
                  key={id}
                  type="button"
                  className={`keypad-key${id === '0' ? ' keypad-key--wide' : ''}`}
                  data-keypad-key={`digit-${id}`}
                  aria-label={id}
                  onClick={() => onKeyDigit(id)}
                >
                  {id}
                </button>
              );
            }
            if (id === 'ft' || id === 'in') {
              const label = id === 'ft' ? STRINGS.keypad.ftToggle : STRINGS.keypad.inToggle;
              return (
                <button
                  key={id}
                  type="button"
                  className="keypad-key keypad-key--unit"
                  data-keypad-key={id}
                  aria-label={label}
                  onClick={id === 'ft' ? onFt : onIn}
                >
                  {label}
                </button>
              );
            }
            if (id === 'slash') {
              return (
                <button
                  key={id}
                  type="button"
                  className="keypad-key keypad-key--unit"
                  data-keypad-key="slash"
                  aria-label={STRINGS.keypad.fractionBar}
                  onClick={onSlash}
                >
                  /
                </button>
              );
            }
            if (id === 'backspace') {
              return (
                <button
                  key={id}
                  type="button"
                  className="keypad-key keypad-key--action"
                  data-keypad-key="backspace"
                  aria-label="⌫"
                  onClick={onKeyBackspace}
                >
                  ⌫
                </button>
              );
            }
            if (id === 'clear') {
              return (
                <button
                  key={id}
                  type="button"
                  className="keypad-key keypad-key--unit keypad-key--action"
                  data-keypad-key="clear"
                  aria-label={STRINGS.keypad.clearEntry}
                  onClick={onClear}
                >
                  C
                </button>
              );
            }
            const chip = FRACTION_CHIPS.find((c) => `fraction-${c.denominator}` === id)!;
            return (
              <button
                key={id}
                type="button"
                className="keypad-key keypad-key--fraction"
                data-keypad-key={id}
                aria-label={chip.label}
                aria-pressed={
                  shownSlots.numerator === '1' &&
                  shownSlots.denominator === chip.denominator &&
                  shownSlots.activeSlot === 'denominator'
                }
                onClick={() => onFractionKey(chip.denominator)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="keypad-notes">
          {cycleHint ? <span className="keypad-hint-chip mono">{STRINGS.keypad.cycleHint}</span> : null}
          <span className="keypad-project-precision">
            {t(STRINGS.keypad.projectPrecisionEighth, { denominator: fractionLabel(precisionDenominator) })}
          </span>
        </div>

        {offline ? (
          <p className="keypad-offline" role="alert">
            {STRINGS.keypad.offlineNote}
          </p>
        ) : null}

        <div className="keypad-actions">
          <button
            type="button"
            className="keypad-commit"
            data-keypad-key="commit"
            aria-label={STRINGS.keypad.useThisValue}
            disabled={!committable}
            onClick={() => commit(false)}
          >
            <Check aria-hidden="true" />
            <span>{STRINGS.keypad.useThisValue}</span>
          </button>
          <button
            type="button"
            className="keypad-chain"
            data-keypad-key="chain"
            aria-label={STRINGS.keypad.chain}
            disabled={!committable}
            onClick={() => commit(true)}
          >
            <Link aria-hidden="true" />
            <span>{STRINGS.keypad.chain}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
