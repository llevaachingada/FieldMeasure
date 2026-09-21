/**
 * Copy-contract gate (AGENTS.md non-negotiable + BUILD-RUNBOOK §9).
 *
 * Every user-visible string must be copied VERBATIM from either
 *   - `docs/appendix-strings.md`        — approved inventory copy, or
 *   - `docs/appendix-strings-gaps.md`   — builder PROPOSALS (must be marked ⚠), or
 *   - nothing in either appendix, which is only allowed when the entry carries a
 *     `// ⚠ PROPOSED (C14)` marker saying it is a builder proposal awaiting sign-off
 *     (the "beyond the gaps appendix" category documented in `src/ui/strings.ts`).
 *
 * Why this file exists (see the environment-quirks note in AGENTS.md): copy was
 * previously checked by eye through the Windows console, which renders U+2014 as
 * `-` while `git diff` renders `—`, producing false "the wording was rewritten"
 * findings. This gate reads the files byte-for-byte with `node:fs`/UTF-8 so the
 * comparison is on the bytes a user actually reads.
 *
 * Flattening approach: the REAL `STRINGS` object is imported, so the test fails if
 * `src/ui/strings.ts` stops parsing. The source TEXT is read as well, only to attach
 * each key's line number and its `⚠ PROPOSED (C14)` marker (the imported object does
 * not carry comments).
 *
 * Interpolation normalisation (determined by executing/inspecting the real rows, not
 * by reading): the appendix `String` column stores a RENDERED example plus an
 * `Interpolation` column, while `strings.ts` may store a template. The rows that
 * forced this rule:
 *   - `home.projectCardPath`  appendix `…\Documents\FieldMeasure\Riverside` (`{path}`)
 *                             strings.ts `…\{path}`
 *   - `editor.zoomPercent`    appendix `142%` (`{zoomPercent}`)
 *                             strings.ts `{zoomPercent}%`
 *   - `dimension.projectPrecision` appendix `Project precision: 1/16` (`{denominator}`)
 *                             strings.ts `Project precision: {denominator}`
 * Some rows instead store the rendered example literally (e.g. `home.projectCardMeta`
 * is `12 sheets · 48 MB · 2:14 PM` in BOTH files). So: a value with NO `{token}` must
 * match the appendix byte-for-byte; a value WITH tokens is compiled to an ANCHORED
 * regex (`{token}` -> `.+`) so the literal wording is compared exactly and only the
 * runtime-filled parts are wildcards. Every token used must appear in the appendix
 * `Interpolation` column — a placeholder can't be renamed to something undeclared.
 * This is deliberately not a substring/no-op check.
 *
 * Marker window: a `// ⚠ PROPOSED (C14)` marker (one or more contiguous `//` lines)
 * applies to every following sibling key until a blank line or a comment block that
 * explicitly declares `APPROVED inventory`. A plain sub-comment does NOT clear it.
 * Verified against the real file: block markers sit before groups of keys separated by
 * blank lines (`settings`), one marker precedes a scope declaration (`a11y`),
 * `settings.unitSystemImperial`/`Metric` keep their section header's marker across the
 * plain sub-note `// Unit-system option labels…`, and `editor.zoomPercent` is cleared
 * by `// APPROVED inventory (appendix-strings.md \`editor.zoomPercent\`…)`.
 * A whole-file "search backwards N lines" window does not work here because the
 * shortest marked block and the longest unmarked gap both fall inside any fixed N;
 * a window that clears on ANY comment falsely unsticks `unitSystem*`, and one that
 * never clears falsely marks `zoomPercent`. The section semantics above are the only
 * rule that classifies every real key correctly (113 leaves when written; the file can
 * grow without changing this rule).
 */
import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/ui/strings';
import sourceTextRaw from '../src/ui/strings.ts?raw';
import approvedTextRaw from '../docs/appendix-strings.md?raw';
import gapsTextRaw from '../docs/appendix-strings-gaps.md?raw';

// ---------------------------------------------------------------------------
// File reads (byte-level, UTF-8)
// ---------------------------------------------------------------------------
//
// Read through Vite's `?raw` rather than `node:fs`. The repo pins
// `types: ["vite/client"]` and does not install `@types/node`, so a `node:fs`
// import cannot typecheck and this gate would break the `tsc --noEmit` gate it
// is supposed to protect. `?raw` inlines the same bytes at transform time, and
// `vite/client` supplies its module declaration — no new dependency, and the
// comparison below is unchanged byte-for-byte.

function readText(raw: string): string {
  return raw.replace(/^\uFEFF/, '');
}

const sourceText = readText(sourceTextRaw);
const approvedText = readText(approvedTextRaw);
const gapsText = readText(gapsTextRaw);

// ---------------------------------------------------------------------------
// Appendix table parsing
// ---------------------------------------------------------------------------

interface AppendixRow {
  key: string;
  value: string;
  /** Placeholder names declared in the appendix `Interpolation` column. */
  tokens: string[];
  line: number;
  file: string;
}

const DOTTED_KEY = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/;

function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  return t.slice(1, -1).split('|').map((c) => c.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** `| key | string | where | source | interpolation |` -> Map by key. */
function parseApproved(text: string, file: string): Map<string, AppendixRow> {
  const out = new Map<string, AppendixRow>();
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = splitRow(line);
    if (!cells || cells.length !== 5 || isSeparator(cells)) return;
    if (!DOTTED_KEY.test(cells[0])) return; // skips the header + the Excluded/C14 tables
    const tokens = [...cells[4].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    out.set(cells[0], { key: cells[0], value: cells[1], tokens, line: i + 1, file });
  });
  return out;
}

/**
 * `| # | gap | proposed key(s) | proposed string(s) | rationale |` with `<br>`-separated
 * lists in the key and string cells. Keys are zipped with strings positionally.
 */
function parseGaps(text: string, file: string): Map<string, AppendixRow> {
  const out = new Map<string, AppendixRow>();
  text.split(/\r?\n/).forEach((line, i) => {
    const cells = splitRow(line);
    if (!cells || cells.length !== 5 || isSeparator(cells)) return;
    if (!/^\d+$/.test(cells[0])) return;
    // Keys are wrapped in markdown backticks in this table (`` `settings.x` ``).
    const keys = cells[2]
      .split(/<br\s*\/?>/i)
      .map((s) => s.trim().replace(/^`(.*)`$/, '$1'))
      .filter(Boolean);
    const values = cells[3].split(/<br\s*\/?>/i).map((s) => s.trim());
    if (keys.length !== values.length) {
      throw new Error(
        `appendix-strings-gaps.md line ${i + 1}: ${keys.length} key(s) but ` +
          `${values.length} string(s) in one row — cannot zip them.`,
      );
    }
    keys.forEach((key, j) => out.set(key, { key, value: values[j], tokens: [], line: i + 1, file }));
  });
  return out;
}

const approved = parseApproved(approvedText, 'docs/appendix-strings.md');
const gaps = parseGaps(gapsText, 'docs/appendix-strings-gaps.md');

// ---------------------------------------------------------------------------
// Source marking (line number + ⚠ PROPOSED marker per key)
// ---------------------------------------------------------------------------

interface SourceKey {
  line: number;
  marked: boolean;
}

function parseSourceKeys(text: string): Map<string, SourceKey> {
  const out = new Map<string, SourceKey>();
  const lines = text.split(/\r?\n/);
  const stack: string[] = [];
  let started = false;
  let pendingProposed = false;
  let inCommentBlock = false;
  let blockHasMarker = false;
  let blockDeclaresApproved = false;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    if (!started) {
      if (/^export const STRINGS\b/.test(t)) started = true;
      continue;
    }
    if (/^\}\s*as const/.test(t)) break;

    if (t === '') {
      pendingProposed = false;
      inCommentBlock = false;
      continue;
    }

    if (t.startsWith('//')) {
      if (!inCommentBlock) {
        inCommentBlock = true;
        blockHasMarker = false;
        blockDeclaresApproved = false;
      }
      if (t.includes('⚠ PROPOSED (C14)')) blockHasMarker = true;
      if (t.includes('APPROVED inventory')) blockDeclaresApproved = true;
      continue;
    }

    // A non-comment line ends the comment block and resolves its marker.
    // A marker wins; otherwise an explicit `APPROVED inventory` declaration clears the
    // state; a plain sub-comment leaves it unchanged (see the header note).
    if (inCommentBlock) {
      if (blockHasMarker) pendingProposed = true;
      else if (blockDeclaresApproved) pendingProposed = false;
      inCommentBlock = false;
    }

    if (t.startsWith('}')) {
      stack.pop();
      continue;
    }

    const scope = t.match(/^([A-Za-z_$][\w$]*)\s*:\s*\{/);
    if (scope) {
      stack.push(scope[1]);
      continue;
    }

    const leaf = t.match(/^([A-Za-z_$][\w$]*)\s*:\s*(['"])/);
    if (leaf && stack.length > 0) {
      out.set([...stack, leaf[1]].join('.'), { line: i + 1, marked: pendingProposed });
    }
  }

  return out;
}

const sourceKeys = parseSourceKeys(sourceText);

// ---------------------------------------------------------------------------
// Flatten the real STRINGS object
// ---------------------------------------------------------------------------

function flatten(node: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof node === 'string') {
    out.set(prefix, node);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      flatten(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const leaves = flatten(STRINGS);

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokensOf(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/** Anchored pattern: literal chunks escaped, each `{token}` becomes `.+`. */
function templatePattern(template: string): string {
  return (
    '^' +
    template
      .split(/(\{\w+\})/)
      .map((part) => (/^\{\w+\}$/.test(part) ? '.+' : escapeRegExp(part)))
      .join('') +
    '$'
  );
}

function quote(s: string): string {
  return JSON.stringify(s);
}

interface Violation {
  key: string;
  line: number | undefined;
  detail: string;
}

function checkLeaf(key: string, value: string, violations: Violation[]): void {
  const info = sourceKeys.get(key);
  const marked = info?.marked ?? false;
  const line = info?.line;
  const a = approved.get(key);
  const g = gaps.get(key);

  if (a) {
    if (value === a.value) return;

    const tokens = tokensOf(value);
    if (tokens.length > 0) {
      const undeclared = tokens.filter((t) => !a.tokens.includes(t));
      if (undeclared.length === 0) {
        const pattern = new RegExp(templatePattern(value));
        if (pattern.test(a.value)) return;
      } else {
        violations.push({
          key,
          line,
          detail:
            `uses placeholder(s) ${undeclared.map((t) => `{${t}}`).join(', ')} not declared in the ` +
            `appendix Interpolation column (${a.tokens.length ? a.tokens.map((t) => `{${t}}`).join(', ') : 'blank'})`,
        });
        return;
      }
    }

    violations.push({
      key,
      line,
      detail:
        `APPROVED copy mismatch\n` +
        `      expected (${a.file}:${a.line}): ${quote(a.value)}\n` +
        `      actual   (src/ui/strings.ts${line ? `:${line}` : ''}): ${quote(value)}`,
    });
    return;
  }

  if (g) {
    if (!marked) {
      violations.push({
        key,
        line,
        detail:
          `present only in docs/appendix-strings-gaps.md:${g.line} (a PROPOSAL) but has no ` +
          `\`// ⚠ PROPOSED (C14)\` marker in src/ui/strings.ts. ` +
          `Proposed copy must be marked so a reviewer can find it.`,
      });
      return;
    }
    if (value !== g.value) {
      violations.push({
        key,
        line,
        detail:
          `PROPOSED copy mismatch\n` +
          `      expected (${g.file}:${g.line}): ${quote(g.value)}\n` +
          `      actual   (src/ui/strings.ts${line ? `:${line}` : ''}): ${quote(value)}`,
      });
    }
    return;
  }

  if (!marked) {
    violations.push({
      key,
      line,
      detail:
        `not in either appendix; either add the row or mark it ⚠ PROPOSED ` +
        `(\`// ⚠ PROPOSED (C14)\` above the key in src/ui/strings.ts).`,
    });
  }
}

function describeSources(key: string): string {
  const a = approved.get(key);
  const g = gaps.get(key);
  if (a) return `approved (${a.file}:${a.line})`;
  if (g) return `gaps-only (${g.file}:${g.line})`;
  return 'neither appendix';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('copy contract (src/ui/strings.ts vs appendices)', () => {
  it('checks a non-trivial number of leaves and keeps source/flatten in sync', () => {
    expect(
      leaves.size,
      'STRINGS flattened to suspiciously few leaves — a refactor may have emptied it',
    ).toBeGreaterThanOrEqual(50);

    expect(
      [...leaves.keys()].sort(),
      'the source-text key parser and the imported STRINGS object disagree',
    ).toEqual([...sourceKeys.keys()].sort());
  });

  it('every value is verbatim approved copy, a matched proposal, or a marked proposal', () => {
    const violations: Violation[] = [];
    for (const [key, value] of leaves) {
      checkLeaf(key, value, violations);
    }

    if (violations.length > 0) {
      const report = violations
        .map(
          (v) =>
            `  ✗ ${v.key} (src/ui/strings.ts${v.line ? `:${v.line}` : ''}; ${describeSources(v.key)})\n` +
            `      ${v.detail}`,
        )
        .join('\n\n');
      throw new Error(
        `Copy contract: ${violations.length} violation(s). Every user-visible string must be ` +
          `verbatim appendix copy or explicitly marked ⚠ PROPOSED.\n\n${report}`,
      );
    }

    // Guard against a silent all-exempt pass: assert each provenance actually occurs.
    expect([...leaves.keys()].filter((k) => approved.has(k)).length).toBeGreaterThan(0);
    expect([...leaves.keys()].filter((k) => gaps.has(k)).length).toBeGreaterThan(0);
  });

  it('does not mark approved inventory copy as ⚠ PROPOSED (reverse direction)', () => {
    const wrong = [...sourceKeys.entries()]
      .filter(([key, info]) => info.marked && approved.has(key))
      .map(([key, info]) => {
        const a = approved.get(key)!;
        return `  ✗ ${key} (src/ui/strings.ts:${info.line}) is marked ⚠ PROPOSED but is item ` +
          `${a.file}:${a.line} — approved copy must not be marked proposed.`;
      });

    if (wrong.length > 0) {
      throw new Error(
        `Copy contract: ${wrong.length} approved string(s) wrongly marked ⚠ PROPOSED.\n\n${wrong.join('\n')}`,
      );
    }
  });
});
