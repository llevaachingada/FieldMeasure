/**
 * tests/filenames.test.ts — export filename sanitizer + conflict policy (slice 1.9 step 1).
 *
 * The 29-row table from the implementation plan (20 `sanitizeToken` rows + 4 `joinFilename`
 * rows + 5 conflict cases), executed rather than read (AGENTS.md: "execute, don't read" — the
 * `con.jpg` row is exactly the one a from-prose draft failed).
 *
 * Numbers, with arithmetic:
 *   - token cap: 48 chars INCLUDING the extension → 50 `w` + `.jpg` → 48 − 4 = 44 `w`.
 *   - joined-base cap: 120 chars.
 *   - `EXT` accepts `.` + 1–8 alphanumerics; `. more` (space) and `.verylongext` (11) are NOT
 *     extensions, so the cap applies to the whole token / the dot stays in the base.
 *
 * Pure module → the `node` Vitest project.
 */
import { describe, expect, it } from 'vitest';
import {
  conflictName,
  joinFilename,
  sanitizeToken,
} from '../src/export/filenames';

describe('sanitizeToken — 20-row table (§9.4, order normative)', () => {
  const rows: Array<{ input: string; expected: string; why: string }> = [
    { input: 'CON', expected: '_CON', why: 'DOS device name' },
    { input: 'con.jpg', expected: '_con.jpg', why: 'device name WITH extension, case-insensitive — the row the first draft failed' },
    { input: 'LPT9.PDF', expected: '_LPT9.PDF', why: 'same, upper case' },
    { input: 'COM1', expected: '_COM1', why: 'device name with digit' },
    { input: 'COM0', expected: 'COM0', why: 'NOT reserved — COM0 is not a DOS device; do not over-prefix' },
    { input: 'foo ', expected: 'foo', why: 'trailing space stripped' },
    { input: 'foo .jpg', expected: 'foo.jpg', why: 'trailing space on the BASE, before the extension' },
    { input: 'foo...', expected: 'foo', why: 'trailing dots — strip the WHOLE token first, or you get `foo.`' },
    { input: '...', expected: 'untitled', why: 'all-dots → empty → substitute' },
    { input: '', expected: 'untitled', why: 'never a bare `.jpg`' },
    { input: '   ', expected: 'untitled', why: 'spaces only → empty → substitute' },
    { input: 'a/b\\c:d*e', expected: 'abcde', why: 'illegal characters removed' },
    { input: 'a\u0000b', expected: 'ab', why: 'C0 control' },
    { input: 'a\u009Fb', expected: 'ab', why: 'C1 control' },
    { input: 'x'.repeat(300), expected: 'x'.repeat(48), why: 'token cap (48)' },
    { input: 'y'.repeat(47) + '.', expected: 'y'.repeat(47), why: '47 y + trailing dot → dot stripped' },
    { input: 'z'.repeat(48) + '. more', expected: 'z'.repeat(48), why: '`. more` is NOT an extension — cap applies to the whole 54-char token' },
    { input: 'w'.repeat(50) + '.jpg', expected: 'w'.repeat(44) + '.jpg', why: 'cap is 48 INCLUDING the extension: 48 − 4 = 44 w' },
    { input: 'Ünïcode', expected: 'Ünïcode', why: 'NTFS allows Unicode; do not mangle names (NFC)' },
    { input: 'North wall', expected: 'North wall', why: 'inner spaces are fine — do not over-sanitize' },
  ];

  it.each(rows)('$input → $expected ($why)', ({ input, expected }) => {
    expect(sanitizeToken(input)).toBe(expected);
  });

  it('NFC-normalizes a decomposed (NFD) string rather than preserving the combining mark', () => {
    // 'U\u0308' (U + combining diaeresis) normalizes to '\u00DC' (Ü); 'i\u0308' would too.
    expect(sanitizeToken('U\u0308n\u00EFcode')).toBe('\u00DCn\u00EFcode');
  });
});

describe('joinFilename — 4-row table', () => {
  it('joined base that is not reserved: do not over-prefix', () => {
    expect(joinFilename(['CO', 'N'], 'pdf')).toBe('CO_N.pdf');
  });

  it('joined base that IS reserved: prefix the underscore', () => {
    expect(joinFilename(['CON'], 'pdf')).toBe('_CON.pdf');
  });

  it('empty tokens are substituted before joining', () => {
    expect(joinFilename(['', ''], 'pdf')).toBe('untitled_untitled.pdf');
  });

  it('the ordinary case', () => {
    expect(joinFilename(['Job 12', '01', 'North wall'], 'pdf')).toBe(
      'Job 12_01_North wall.pdf',
    );
  });
});

describe('conflictName — 5-row conflict table (P7: NTFS is case-insensitive)', () => {
  it('Add (1) does not overwrite an existing same-cased file', () => {
    expect(conflictName(['Sheet.pdf'], 'Sheet.pdf', 'add')).toBe('Sheet (1).pdf');
  });

  it("existing 'Sheet.pdf' + name 'sheet.pdf' + add → 'sheet (1).pdf' (NOT 'sheet.pdf')", () => {
    // On NTFS these are the SAME file; a case-sensitive compare would return the name untouched.
    expect(conflictName(['Sheet.pdf'], 'sheet.pdf', 'add')).toBe('sheet (1).pdf');
  });

  it("existing ['Sheet.pdf','sheet (1).pdf'] + name 'SHEET.pdf' + add → 'SHEET (2).pdf'", () => {
    expect(
      conflictName(['Sheet.pdf', 'sheet (1).pdf'], 'SHEET.pdf', 'add'),
    ).toBe('SHEET (2).pdf');
  });

  it('skip → null (caller omits the file)', () => {
    expect(conflictName(['Sheet.pdf'], 'sheet.pdf', 'skip')).toBeNull();
  });

  it('overwrite → the name unchanged (no suffix), preserving the caller\u2019s spelling', () => {
    expect(conflictName(['Sheet.pdf'], 'sheet.pdf', 'overwrite')).toBe('sheet.pdf');
  });

  it('NFC and NFD forms of the same accented name are treated as one', () => {
    // Existing is NFC 'Café.pdf'; the candidate is NFD 'Cafe\u0301.pdf'.
    const existing = ['Caf\u00E9.pdf']; // Café.pdf (NFC)
    const candidate = 'Cafe\u0301.pdf'; // Cafe + combining acute (NFD)
    const result = conflictName(existing, candidate, 'add');
    expect(result).not.toBeNull();
    expect(result!.normalize('NFC')).toBe('Caf\u00E9 (1).pdf');
  });
});

describe('edge cases the 29 rows do NOT cover', () => {
  it('a name with no extension still gets a suffix', () => {
    expect(conflictName(['report'], 'report', 'add')).toBe('report (1)');
  });

  it('a dotfile (leading dot) is treated as extensionless by the conflict splitter', () => {
    // dot === 0, so there is no base/extension split; the whole name is the base.
    expect(conflictName(['.gitignore'], '.gitignore', 'add')).toBe('.gitignore (1)');
  });

  it('an extension longer than 8 alphanumerics is NOT an extension (EXT caps at 8)', () => {
    // 11 chars: `.verylongext` fails /^\.[A-Za-z0-9]{1,8}$/, so the dot stays in the base.
    expect(sanitizeToken('file.verylongext')).toBe('file.verylongext');
  });

  it('a token that is exactly 8-char extension stays intact', () => {
    expect(sanitizeToken('file.abcdefgh')).toBe('file.abcdefgh'); // 8 alnum → a real ext
  });

  it('joins and caps the joined base at 120 chars', () => {
    // 48 + 1 + 48 + 1 + 48 = 146 > 120. Prefix before the third token is 48+1+48+1 = 98,
    // so the third token contributes 120 − 98 = 22 chars.
    const a = 'a'.repeat(48);
    const b = 'b'.repeat(48);
    const c = 'c'.repeat(48);
    const out = joinFilename([a, b, c], 'pdf');
    expect(out).toBe(a + '_' + b + '_' + c.slice(0, 22) + '.pdf');
    expect(out.slice(0, -4)).toHaveLength(120);
  });

  it('a joined base whose 120-cap lands on a dot re-strips it (§19.4d)', () => {
    // Token layout: 48a + '_' + 48b + '_' + (21c + '.' + 26d).
    // Indices: a 0..47, '_' 48, b 49..96, '_' 97, c 98..118, '.' 119, d 120..145.
    // slice(0,120) ends on the '.' at index 119; the post-cap re-strip must remove it,
    // yielding a 119-char base — not a base ending in '.'.
    const a = 'a'.repeat(48);
    const b = 'b'.repeat(48);
    const c3 = 'c'.repeat(21) + '.' + 'd'.repeat(26);
    expect(c3).toHaveLength(48);
    const out = joinFilename([a, b, c3], 'pdf');
    const expectedBase = a + '_' + b + '_' + 'c'.repeat(21); // 119 chars, no trailing dot
    expect(out).toBe(expectedBase + '.pdf');
    expect(out.slice(0, -4)).toHaveLength(119);
  });

  it('sanitizeToken is idempotent on already-clean input', () => {
    for (const s of ['North wall', 'foo.jpg', '_CON.jpg', 'Ünïcode']) {
      expect(sanitizeToken(sanitizeToken(s))).toBe(sanitizeToken(s));
    }
  });
});
