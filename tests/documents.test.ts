/**
 * `tests/documents.test.ts` — a gate on the **document layer**, which had none.
 *
 * WHY THIS EXISTS (D131, measured): two concurrent sessions wrote `D123`–`D125` **twice** in
 * `docs/DECISIONS.md`, and an edit anchored on the literal heading `### D127` **deleted that
 * heading** instead of preceding it — so a decision lost its section while every machine gate
 * stayed green. Nothing in the suite looked at the docs at all.
 *
 * This is the cheapest gate that would have caught both: **decision numbers are unique and
 * ascending**, and every one has a heading the reader can anchor on. It reads the files as text
 * (via `?raw`, the same mechanism `tests/strings.test.ts` uses — no `node:fs`, which cannot
 * typecheck here).
 *
 * It is deliberately narrow. It does **not** try to lint prose or enforce a format: a brittle doc
 * test gets weakened the first time it gets in the way, and a weakened gate is worse than none.
 */
import { describe, expect, it } from 'vitest';
import decisionsRaw from '../docs/DECISIONS.md?raw';
import continuityRaw from '../docs/CONTINUITY.md?raw';
import buildLogRaw from '../docs/BUILD-LOG.md?raw';

const read = (raw: string): string => raw.replace(/^\uFEFF/, '');

const decisions = read(decisionsRaw);
const continuity = read(continuityRaw);
const buildLog = read(buildLogRaw);

/** Every `### D<n>` heading, in file order, with its line number. */
function decisionHeadings(text: string): Array<{ num: number; line: number; title: string }> {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line: i + 1, m: line.match(/^### D(\d+)\s*(?:—|-)\s*(.*)$/) }))
    .filter((e): e is { line: number; m: RegExpMatchArray } => e.m !== null)
    .map((e) => ({ num: Number(e.m[1]), line: e.line, title: e.m[2].trim() }));
}

/**
 * Every decision **defined** anywhere in the log — not only as a `### D<n>` heading.
 *
 * This project records some decisions in a different shape, deliberately: the session-4b resolved
 * registry is a **table** (`| D24 | Origin & distribution | …`), and a few carry their number as a
 * bold lead-in (`**D64 — …**`). The first version of this gate only knew about headings and
 * **failed on D24/D31/D64**, which are perfectly real — so the gate now accepts all three forms.
 * A gate that rejects correct input is the fastest way to get itself weakened.
 */
function decisionDefinitions(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/^### D(\d+)\b/gm)) found.add(Number(m[1]));
  for (const m of text.matchAll(/^\| D(\d+) \|/gm)) found.add(Number(m[1]));
  for (const m of text.matchAll(/^\*\*D(\d+)\b/gm)) found.add(Number(m[1]));
  return found;
}

const headings = decisionHeadings(decisions);
const defined = decisionDefinitions(decisions);

describe('the document layer (D131)', () => {
  it('every decision number is UNIQUE — two writers must not mint the same one', () => {
    const seen = new Map<number, number>();
    const duplicates: string[] = [];
    for (const h of headings) {
      const first = seen.get(h.num);
      if (first !== undefined) {
        duplicates.push(`D${h.num} at lines ${first} and ${h.line}`);
      } else {
        seen.set(h.num, h.line);
      }
    }
    expect(
      duplicates,
      'a decision number is used twice — two sessions wrote the same number. Merge them (D131) ' +
        'rather than renumbering: every reference in BUILD-LOG/CONTINUITY/HARDWARE links by number.',
    ).toEqual([]);
  });

  it('decision headings are in ASCENDING order — the log reads as a sequence', () => {
    const outOfOrder = headings
      .map((h, i) => ({ h, prev: headings[i - 1] }))
      .filter((e) => e.prev && e.h.num < e.prev.num)
      .map((e) => `D${e.h.num} (line ${e.h.line}) follows D${e.prev.num} (line ${e.prev.line})`);
    expect(outOfOrder, 'a decision is out of numeric order').toEqual([]);
  });

  it('every decision heading has a title, so an anchor on it is unambiguous', () => {
    const untitled = headings.filter((h) => h.title.length === 0).map((h) => `D${h.num} (line ${h.line})`);
    expect(untitled).toEqual([]);
    // Non-triviality: the log really was parsed (an empty parse would pass everything above).
    expect(headings.length).toBeGreaterThan(50);
  });

  it('every decision referenced by the live docs actually exists', () => {
    // A dangling `D<n>` reference is how a merge-or-renumber silently falsifies a document: the
    // prose keeps pointing at a number that no longer exists, and the reader trusts it.
    const refs = new Set<number>();
    for (const text of [continuity, buildLog]) {
      for (const m of text.matchAll(/\*\*D(\d+)\*\*/g)) refs.add(Number(m[1]));
    }
    const dangling = [...refs].filter((n) => !defined.has(n)).sort((a, b) => a - b);
    expect(
      dangling.map((n) => `D${n}`),
      'a bolded decision reference in CONTINUITY/BUILD-LOG has no definition in DECISIONS.md ' +
        '(as a heading, a registry table row, or a bold lead-in)',
    ).toEqual([]);
    // Non-triviality: the reference scan really found references.
    expect(refs.size).toBeGreaterThan(20);
  });
});
