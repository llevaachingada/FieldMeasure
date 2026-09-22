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
  keypadValueInches,
  parseLooseToSlots,
  pressDigit,
  pressDot,
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
export type KeypadRefusal = 'empty' | 'badFraction' | 'tooLarge';

/** The reason copy, in the preview area (plan §1.5 step 4). */
export const REFUSAL_COPY: Record<KeypadRefusal, string> = {
  empty: STRINGS.keypad.errorEnterLength,
  badFraction: STRINGS.keypad.errorFractionTooBig,
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

/** The four keyed fraction chips (UI §8.1). All of `VALID_DENOMINATORS` is reachable
 *  with `←` / `→`, which is what the `«← /16»` cycling hint names. */
export const FRACTION_CHIPS = [
  { denominator: 2, label: STRINGS.keypad.fractionHalf },
  { denominator: 4, label: STRINGS.keypad.fractionQuarter },
  { denominator: 8, label: STRINGS.keypad.fractionEighth },
  { denominator: 16, label: STRINGS.keypad.fractionSixteenth },
] as const;

/** Digits shown on the pad, in reading (and therefore Tab) order — UI §8.1's two 3-wide
 *  blocks. DOM order == visual order so keyboard traversal matches the eye. */
export const KEYPAD_ROWS = [
  ['1', '2', '3', '4', '5', '6'],
  ['7', '8', '9', '0'],
] as const;

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
  return parseLooseToSlots(text, precisionDenominator)?.slots ?? emptyKeypadState(precisionDenominator);
}

/** `⌫`: delete the last character of the slot the next digit would land in. */
export function backspace(st: KeypadState): KeypadState {
  if (st.inchesMode) return { ...st, inches: st.inches.slice(0, -1) };
  if (st.activeSlot === 'feet') return { ...st, feet: st.feet.slice(0, -1) };
  if (st.activeSlot === 'inches') return { ...st, inches: st.inches.slice(0, -1) };
  return { ...st, numerator: st.numerator.slice(0, -1) };
}

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
  const [inchesHint, setInchesHint] = useState(false);
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
      setSlots((current) => fn(buffer === null ? current : (parsed?.slots ?? current)));
    },
    [buffer, parsed],
  );

  const onKeyDigit = (d: string): void => editSlots((s) => pressDigit(s, d));
  const onKeyDot = (): void => editSlots((s) => pressDot(s));
  const onKeyBackspace = (): void => editSlots((s) => backspace(s));
  const onFt = (): void => editSlots((s) => ({ ...s, inchesMode: false, activeSlot: 'feet' }));
  const onIn = (): void => {
    setInchesHint(true);
    editSlots((s) => scopeToInches(s));
  };
  const onFractionChip = (denominator: number): void => {
    setCycleHint(true);
    editSlots((s) => ({
      ...s,
      denominator,
      // §6.1.1 wiring: only move the active slot when no numerator has been entered.
      activeSlot: s.numerator === '' ? 'numerator' : s.activeSlot,
    }));
  };
  const onCycle = (direction: 1 | -1): void => {
    setCycleHint(true);
    editSlots((s) => ({ ...s, denominator: cycleDenominator(s.denominator, direction) }));
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
      editSlots((s) => backspace(s));
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

  // The `Entry is now inches` hint is a 1.5 s acknowledgement (§6.1.1); the cycling hint
  // is an affordance and stays for the life of the sheet.
  useEffect(() => {
    if (!inchesHint) return;
    const id = window.setTimeout(() => setInchesHint(false), 1500);
    return () => window.clearTimeout(id);
  }, [inchesHint]);

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

        {/* Unit + entry-scoped precision (D31: these change THIS entry only). */}
        <div className="keypad-row keypad-chips">
          <button
            type="button"
            className="keypad-toggle"
            data-keypad-key="ft"
            aria-label={STRINGS.keypad.ftToggle}
            aria-pressed={!shownSlots.inchesMode && shownSlots.activeSlot === 'feet'}
            onClick={onFt}
          >
            {STRINGS.keypad.ftToggle}
          </button>
          <button
            type="button"
            className="keypad-toggle"
            data-keypad-key="in"
            aria-label={STRINGS.keypad.inToggle}
            aria-pressed={shownSlots.inchesMode}
            onClick={onIn}
          >
            {STRINGS.keypad.inToggle}
          </button>
          <span className="keypad-chip-divider" aria-hidden="true" />
          {FRACTION_CHIPS.map((chip) => (
            <button
              key={chip.denominator}
              type="button"
              className="keypad-chip"
              data-keypad-key={`fraction-${chip.denominator}`}
              aria-label={chip.label}
              aria-pressed={shownSlots.denominator === chip.denominator}
              onClick={() => onFractionChip(chip.denominator)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="keypad-grid">
          {KEYPAD_ROWS.map((row, index) => (
            <div className="keypad-grid-row" key={index}>
              <div className="keypad-grid-block">
                {row.slice(0, 3).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="keypad-key"
                    data-keypad-key={`digit-${d}`}
                    aria-label={d}
                    onClick={() => onKeyDigit(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="keypad-grid-block">
                {row.slice(3).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="keypad-key"
                    data-keypad-key={`digit-${d}`}
                    aria-label={d}
                    onClick={() => onKeyDigit(d)}
                  >
                    {d}
                  </button>
                ))}
                {index === 1 ? (
                  <>
                    <button
                      type="button"
                      className="keypad-key keypad-key--action"
                      data-keypad-key="backspace"
                      aria-label="⌫"
                      onClick={onKeyBackspace}
                    >
                      ⌫
                    </button>
                    <button
                      type="button"
                      className="keypad-key"
                      data-keypad-key="dot"
                      aria-label="."
                      onClick={onKeyDot}
                    >
                      .
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="keypad-notes">
          {inchesHint ? (
            <p className="keypad-hint keypad-hint--inches" role="status">
              {STRINGS.keypad.entryNowInches}
            </p>
          ) : null}
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
