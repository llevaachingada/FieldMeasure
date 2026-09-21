// Units — §6.1 (strict parser + formatters) and §6.1.1 (keypad slot model) of
// docs/preflight-handoff-v0.3-hardened.md. Copied verbatim; this module is the
// highest-stakes one in the app (a bug here is a wrong measurement).
//
// Note (§6.1.1): the strict parser is the GUARDIAN and rejects `12 6`; the keypad
// slot model is the fuzzy layer on top that composes an explicit string for
// `enteredText` and round-trips it through the strict parser by value.

export const MM_PER_IN = 25.4;

export function parseImperialToInches(raw: string): number | null {
  let s = raw.trim().toLowerCase()
    .replace(/[\u2019\u2032]/g, "'").replace(/[\u201D\u2033]/g, '"')
    .replace(/feet|foot|ft/g, "'")
    .replace(/inches|inch|in/g, '"');

  let feet = 0;
  const ftIdx = s.indexOf("'");
  if (ftIdx >= 0) {
    feet = Number(s.slice(0, ftIdx).trim() || '0');
    // F2 (session 4): a NEGATIVE feet value must be rejected, not silently kept.
    if (!Number.isFinite(feet) || feet < 0) return null;
    s = s.slice(ftIdx + 1);
    // The leading dash is the ft-in SEPARATOR (10'-4") and is stripped only here.
    s = s.replace(/"/g, '').replace(/^\s*-\s*/, '').trim();
  } else {
    // F2 (session 4): with no feet mark there is no separator, so a leading '-' is a
    // negative number and must be REJECTED. Stripping it turned "-5" into +5 in.
    s = s.replace(/"/g, '').trim();
    if (s.startsWith('-')) return null;
  }
  if (s === '') return ftIdx >= 0 ? feet * 12 : null;

  const m = s.match(/^(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?$|^(\d+)\/(\d+)$/);
  if (!m) return null;
  let inches: number;
  if (m[4] !== undefined) {
    if (Number(m[5]) === 0) return null;
    inches = Number(m[4]) / Number(m[5]);
  } else {
    if (m[3] !== undefined && Number(m[3]) === 0) return null;
    inches = Number(m[1]) + (m[2] !== undefined ? Number(m[2]) / Number(m[3]) : 0);
  }
  return feet * 12 + inches;
}

export function parseMetricToMm(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === 'm' ? v * 1000 : m[2] === 'cm' ? v * 10 : v;   // default mm
}

export function parseLengthToMm(raw: string, system: 'imperial' | 'metric'): number | null {
  if (system === 'metric') return parseMetricToMm(raw);
  const inches = parseImperialToInches(raw);
  return inches === null ? null : inches * MM_PER_IN;
}

/** Construction style: 10'-4 1/2" (rounded to nearest 1/denom inch). */
export function formatInches(totalIn: number, denom = 16): string {
  const sign = totalIn < 0 ? '-' : '';
  let ticks = Math.round(Math.abs(totalIn) * denom);
  const feet = Math.floor(ticks / (12 * denom));
  ticks -= feet * 12 * denom;
  const inches = Math.floor(ticks / denom);
  let num = ticks - inches * denom;
  let den = denom;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${num}/${den}` : '';
  const inchStr = frac ? (inches ? `${inches} ${frac}` : frac) : String(inches);
  if (feet === 0) return `${sign}${inchStr}"`;
  return `${sign}${feet}'-${frac && !inches ? `0 ${frac}` : inchStr}"`;
}

/** Inches-ONLY format (no feet decomposition; may exceed 12): 124.5 in → `124 1/2"`. */
export function formatInchesOnly(totalIn: number, denom = 16): string {
  const sign = totalIn < 0 ? '-' : '';
  let ticks = Math.round(Math.abs(totalIn) * denom);
  const inches = Math.floor(ticks / denom);
  let num = ticks - inches * denom;
  let den = denom;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? ` ${num}/${den}` : '';
  return `${sign}${inches}${frac}"`;
}

/** Format a canonical mm value for display in the given system + format. */
export function formatLength(valueMm: number, system: 'imperial' | 'metric', denom = 16, unitFormat: 'ft-in' | 'in' | 'ft-decimal' = 'ft-in'): string {
  if (system === 'metric') return `${valueMm.toFixed(0)} mm`;
  const inches = valueMm / MM_PER_IN;
  if (unitFormat === 'in') return formatInchesOnly(inches, denom);
  if (unitFormat === 'ft-decimal') return `${(inches / 12).toFixed(2)}'`;
  return formatInches(inches, denom);
}

// ---------------------------------------------------------------------------
// 6.1.1 Keypad input model
// ---------------------------------------------------------------------------

/** Keypad slot state — the single source of truth while the keypad sheet is open. */
export interface KeypadState {
  feet: string;            // digits only, '' = none
  inches: string;         // digits only (whole inches), '' = none
  numerator: string;      // digits only, '' = no fraction
  denominator: number;    // active fraction denominator (project precision by default)
  activeSlot: 'feet' | 'inches' | 'numerator';   // which slot receives digit keys
  inchesMode: boolean;     // true = whole entry scoped to inches only (ft/in toggle)
}

export const emptyKeypadState = (denominator: number): KeypadState =>
  ({ feet: '', inches: '', numerator: '', denominator, activeSlot: 'inches', inchesMode: false });

/** Digit key → slot routing (pure). */
export function pressDigit(st: KeypadState, d: string): KeypadState {
  const next = { ...st };
  if (st.inchesMode) { next.inches = (next.inches + d).replace(/^0+(?=\d)/, ''); return next; }
  if (st.activeSlot === 'feet')       next.feet     = (next.feet + d).replace(/^0+(?=\d)/, '');
  else if (st.activeSlot === 'inches') next.inches  = (next.inches + d).replace(/^0+(?=\d)/, '');
  else                                  next.numerator = (next.numerator + d).replace(/^0+(?=\d)/, '');
  return next;
}

/** `.` key: starts a fraction (the `«1/2»`…`«1/16»` chips are the primary path; `.` is the
 *  hardware-typist's shortcut). DECISION: `.` moves to the numerator slot and resets it, with the
 *  denominator UNCHANGED (project precision). Then `. 5` = 5/16", not 0.5" — the preview shows
 *  exactly what the slots say, so this is discoverable, not surprising; the fraction chips remain
 *  the way to pick halves/quarters. (A bare decimal like `124.5` on the hardware path is handled
 *  by parseLooseToSlots, not by pressDot.) Documented so no builder guesses. */
export function pressDot(st: KeypadState): KeypadState {
  return { ...st, activeSlot: 'numerator', numerator: '' };
}

/** Compose the canonical enteredText from slots. This string is what gets stored
 *  (and what the strict parser round-trips on re-edit).
 *  INVARIANTS (all property-tested):
 *   1. Every non-empty output strictly parses back to keypadValueInches(st).
 *   2. Feet+fraction composes as `<f>'-<i> <n>/<d>"` (never drops the fraction).
 *   3. Inches-mode with only a fraction composes as `<n>/<d>"` (no phantom `0`). */
export function composeEnteredText(st: KeypadState): string {
  // SESSION-4 FIX (F6): a slot holding '0' is TRUTHY as a string. The old checks composed
  // `12'-6 0/16"` and `0'-4"` — junk that is stored verbatim as enteredText. The value
  // round-trips, so the 500-combo property test passed on it. Presence = a POSITIVE value.
  const has = (v: string) => v !== '' && Number(v) > 0;
  const fracPart = has(st.numerator) ? `${st.numerator}/${st.denominator}` : '';

  if (st.inchesMode) {
    if (!st.inches && !has(st.numerator)) return '';
    if (!st.inches) return `${fracPart}"`;                  // fraction only: `3/16"`
    return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
  }

  if (has(st.feet)) {
    if (st.inches && fracPart) return `${st.feet}'-${st.inches} ${fracPart}"`;   // 10'-4 1/2"
    if (st.inches) return `${st.feet}'-${st.inches}"`;                          // 10'-4"
    if (fracPart) return `${st.feet}'-0 ${fracPart}"`;                          // 10'-0 1/2"
    return `${st.feet}'-0"`;                                                    // 10'-0"
  }

  // feet empty (or zero) → everything is inches
  if (!st.inches && !has(st.numerator)) return '';
  if (!st.inches) return `${fracPart}"`;
  return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
}

/** Allowed fraction denominators (§3.3 `precisionDenominator`). Anything else is a typo,
 *  not a measurement — session 4 found `10' 4 99/100` silently accepted denominator 100. */
export const VALID_DENOMINATORS = [2, 4, 8, 16, 32, 64] as const;
export const isValidDenominator = (d: number): boolean =>
  (VALID_DENOMINATORS as readonly number[]).includes(d);

/** Largest length v1 will commit: 1000 ft. Beyond this the user mistyped, not measured. */
export const MAX_LENGTH_IN = 12000;

/** SESSION-4 FIX (F3/F4): the ONLY gate the commit button may use. `Enter` was previously
 *  blocked on null/NaN alone, so a bare `0` committed a 0" dimension, and `12 6 20`
 *  committed 151.25" — a measurement the user never typed. Both are wrong-measurement paths. */
export function isCommittableInches(v: number | null): boolean {
  return v !== null && Number.isFinite(v) && v > 0 && v <= MAX_LENGTH_IN;
}

/** The live preview: slots → value. The truth; never parse the composed string for display. */
export function keypadValueInches(st: KeypadState): number | null {
  // SESSION-4 (F6): presence tests must MATCH composeEnteredText's, or the preview value and
  // the stored text disagree. A slot holding '0' contributes 0 but is not "entered".
  const has = (v: string) => v !== '' && Number(v) > 0;
  const frac = has(st.numerator) ? Number(st.numerator) / st.denominator : 0;
  if (st.inchesMode) {
    if (!st.inches && !has(st.numerator)) return null;
    return Number(st.inches || 0) + frac;
  }
  if (!has(st.feet) && !st.inches && !has(st.numerator)) return null;
  return Number(st.feet || 0) * 12 + Number(st.inches || 0) + frac;
}

/** Hardware-keyboard / hardware-keypad path: tokenize a raw typed string leniently,
 *  then compose slots. Accepted (in order of precedence) — all cases traced against the
 *  test table below; if you touch this, re-run the traces:
 *   1. Feet-first (explicit `'`):  `10'` · `10' 4"` · `10'-4 1/2"` · `10' 6 3` (loose numerator,
 *      denominator = project precision) · `10' 1/2"` (fraction only).
 *   2. Bare decimal (`124.5`) → inches-mode, raw preserved for `enteredText`.
 *   3. Fraction alone (`1/2"`) → inches-mode fraction.
 *   4. Loose integer groups (spaces/dashes): `124` = 124 in (inchesMode) · `12 6` = 12 ft 6 in ·
 *      `12 6 3` = 12 ft 6 in + 3/16 (project denominator).
 *  Returns null when nothing sensible matches — the caller disables the commit button. */
export function parseLooseToSlots(raw: string, denominator: number): { slots: KeypadState; rawDecimal: string | null } | null {
  const s = raw.trim().toLowerCase()
    .replace(/[\u2019\u2032]/g, "'").replace(/[\u201D\u2033]/g, '"')
    .replace(/feet|foot|ft/g, "'").replace(/inches|inch|in(?![a-z])/g, '"')
    .replace(/\s+/g, ' ');
  if (!s) return null;

  /** SESSION-4 FIX (F4): every construction site validates the fraction. An explicit
   *  denominator outside VALID_DENOMINATORS, or a numerator >= its denominator, is a typo —
   *  return null so the commit button disables, rather than inventing a length. */
  const mk = (over: Partial<KeypadState>): KeypadState | null => {
    const st: KeypadState = { feet: '', inches: '', numerator: '', denominator,
      activeSlot: 'inches', inchesMode: false, ...over };
    if (!isValidDenominator(st.denominator)) return null;
    if (st.numerator !== '' && Number(st.numerator) >= st.denominator) return null;
    return st;
  };
  /** Wrap a slot result; null slots propagate as a null parse. */
  const ok = (slots: KeypadState | null, rawDecimal: string | null = null) =>
    slots ? { slots, rawDecimal } : null;

  // 1. feet-first forms (space allowed before the ' mark: "10 ft 4 in" → "10 ' 4 \"")
  const fm = s.match(/^(\d+)\s*'\s*[-\s]?\s*(.*)$/);
  if (fm) {
    const rest = fm[2].trim();
    if (rest === '' || rest === '"') return ok(mk({ feet: fm[1] }));
    let m = rest.match(/^(\d+)(?:\s*[\s-]\s*(\d+)\/(\d+))?\s*"?$/);   // i [n/d]
    if (m) return ok(mk({ feet: fm[1], inches: m[1], numerator: m[2] ?? '',
      denominator: m[3] ? Number(m[3]) : denominator }));
    m = rest.match(/^(\d+)\s+(\d+)\s*"?$/);                            // i n (loose numerator, project denom)
    if (m) return ok(mk({ feet: fm[1], inches: m[1], numerator: m[2] }));
    m = rest.match(/^(\d+)\/(\d+)\s*"?$/);                             // n/d only
    if (m) return ok(mk({ feet: fm[1], numerator: m[1], denominator: Number(m[2]) }));
    return null;
  }

  // 2. bare decimal → inches (raw preserved for enteredText)
  if (/^\d+\.\d+"?$/.test(s)) {
    const d = s.replace(/"$/, '');
    return ok(mk({ inches: d, inchesMode: true }), d);
  }

  // 3. fractions without feet: `4-1/2` · `4 1/2` (whole+fraction) · `1/2` (alone)
  let m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)"?$/);                  // whole + fraction: 4-1/2, 4 1/2
  if (m) return ok(mk({ inches: m[1], numerator: m[2], denominator: Number(m[3]), inchesMode: true }));
  m = s.match(/^(\d+)\/(\d+)"?$/);                                  // fraction alone: 1/2
  if (m) return ok(mk({ numerator: m[1], denominator: Number(m[2]), inchesMode: true }));

  // 4. loose integer groups: `124` = 124 in · `12 6` = 12 ft 6 in · `12 6 3` = 12 ft 6 in + 3/16
  m = s.match(/^(\d+)(?:[\s-]+(\d+))?(?:[\s-]+(\d+))?"?$/);
  if (!m) return null;
  if (m[2] === undefined) return ok(mk({ inches: m[1], inchesMode: true }));
  if (m[3] === undefined) return ok(mk({ feet: m[1], inches: m[2] }));
  return ok(mk({ feet: m[1], inches: m[2], numerator: m[3] }));
}
