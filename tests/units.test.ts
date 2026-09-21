// tests/units.test.ts — §6.1 strict parser + formatters.
// The accepts/rejects tables are carried forward verbatim from the spec's §6.1
// test block (docs/preflight-handoff-v0.3-hardened.md lines ~1155–1311).
import { describe, it, expect } from 'vitest';
import {
  parseImperialToInches,
  parseLengthToMm,
  formatInches,
  formatLength,
  MM_PER_IN,
} from '../src/domain/units';

describe('parseImperialToInches (strict parser — the guardian)', () => {
  it.each([
    [`10'`, 120], [`10' 4"`, 124], [`10'-4 1/2"`, 124.5], [`10 ft 4 in`, 124],
    [`4-1/2`, 4.5], [`1/2"`, 0.5], [`124.5`, 124.5],
    [`10\u2032 4\u2033`, 124],            // unicode prime/double-prime ARE normalized (see the replace chain)
  ])('parses %s', (input, expected) => {
    expect(parseImperialToInches(input)).toBeCloseTo(expected);
  });

  it.each([
    [`abc`], [`4 1/0`], [``], [`12 6`], [`12 6 3`], [`.5`],
    // SESSION-4 FIX (F1): this row used to sit in the ACCEPTS table asserting 124.5.
    // Executed, it returns null: \u2032/\u2033 are normalized but the VULGAR FRACTION
    // \u00BD is not, so the inches regex never matches. Vulgar fractions are OUT OF
    // SCOPE for v1 (DECISIONS D21); rejecting is safe (the commit button disables).
    [`10\u2032-4 \u00BD\u2033`],
    // SESSION-4 FIX (F2): negatives are rejected — they used to silently become positive.
    [`-5`], [`-5 1/2`], [`-10' 4"`],
  ])('rejects %s (strict layer)', (input) => {
    expect(parseImperialToInches(input)).toBeNull();
  });
});

describe('formatInches', () => {
  it('formats and reduces fractions', () => expect(formatInches(124.5)).toBe(`10'-4 1/2"`));
  it('carries rounding into feet', () => expect(formatInches(11.99)).toBe(`1'-0"`));
  it('handles fraction only', () => expect(formatInches(0.5)).toBe(`1/2"`));
});

describe('formatLength (unit formats)', () => {
  const mm = 3162.3;   // 10'-4 1/2"
  it('ft-in default', () => expect(formatLength(mm, 'imperial', 16, 'ft-in')).toBe(`10'-4 1/2"`));
  it('inches only (independent of feet decomposition)', () => expect(formatLength(mm, 'imperial', 16, 'in')).toBe(`124 1/2"`));
  it('decimal feet', () => expect(formatLength(mm, 'imperial', 16, 'ft-decimal')).toBe(`10.38'`));
});

describe('negative-value contract (session 4, F2)', () => {
  // formatInches keeps its sign branch DELIBERATELY: if a negative ever reaches a
  // label it should be loudly visible rather than silently absolute. Its output for a
  // negative is NOT parser-round-trippable — asserted here so nobody "fixes" the
  // parser to accept it. Lengths are non-negative across the domain.
  it('formats a negative with its sign but never round-trips through the parser', () => {
    expect(formatInches(-124.5)).toBe(`-10'-4 1/2"`);
    expect(parseImperialToInches(`-10'-4 1/2"`)).toBeNull();
  });
});

describe('parseLengthToMm', () => {
  // 1 inch = 25.4 mm exactly; 10'-4 1/2" = 124.5 in.
  it('converts imperial to mm', () => {
    expect(parseLengthToMm(`10'-4 1/2"`, 'imperial')).toBeCloseTo(124.5 * MM_PER_IN); // 3162.3
  });
  it('metric: bare number is mm, cm/m scale', () => {
    expect(parseLengthToMm('1245 mm', 'metric')).toBe(1245);
    expect(parseLengthToMm('124.5 cm', 'metric')).toBe(1245);   // 124.5 × 10
    expect(parseLengthToMm('1.245 m', 'metric')).toBe(1245);    // 1.245 × 1000
    expect(parseLengthToMm('1245', 'metric')).toBe(1245);       // bare = mm
  });
  it('returns null for unparseable imperial', () => {
    expect(parseLengthToMm('abc', 'imperial')).toBeNull();
  });
});
