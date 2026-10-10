/**
 * D172: the in-app Help (`STRINGS.help`) and `docs/USER-GUIDE.md` say the same thing.
 *
 * They were kept in step by a comment only, and drifted twice (a «Copy folder path» button that
 * did not exist; the guide's longer dimension steps). This reads the guide as text and requires
 * every Help heading and step to appear in it. Formatting is ignored: bold, backticks, curly vs
 * straight quotes, line wrapping, letter case, and a troubleshooting table row `| A | B |` reads
 * as `A: B` (the Help form).
 */
import { describe, expect, it } from 'vitest';
import guideRaw from '../docs/USER-GUIDE.md?raw';
import { STRINGS } from '../src/ui/strings';

function normalize(text: string): string {
  return text
    .replace(/\*\*|`/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The guide with list items unwrapped and table rows turned into `problem: answer`. */
function guideText(raw: string): string {
  const rows = raw.split(/\r?\n/).map((line) => {
    const cells = line.match(/^\|(.+)\|\s*$/);
    if (!cells) return line;
    const parts = cells[1].split('|').map((c) => c.trim());
    if (parts.length !== 2 || /^-+$/.test(parts[0])) return '';
    return `${parts[0]}: ${parts[1]}`;
  });
  return normalize(rows.join('\n'));
}

const guide = guideText(guideRaw);

describe('docs/USER-GUIDE.md mirrors the in-app Help (D172)', () => {
  const sections = Object.values(STRINGS.help.sections);

  it('has every Help section heading', () => {
    const missing = sections.map((s) => s.heading).filter((h) => !guide.includes(normalize(h)));
    expect(missing, 'Help headings missing from docs/USER-GUIDE.md').toEqual([]);
  });

  it('has every Help step, word for word', () => {
    const missing: string[] = [];
    for (const section of sections) {
      for (const step of Object.values(section.steps) as string[]) {
        if (!guide.includes(normalize(step))) missing.push(`${section.heading}: ${step}`);
      }
    }
    expect(missing, 'Help steps missing from docs/USER-GUIDE.md (update the guide too)').toEqual([]);
    // Non-triviality: the Help really has content to check.
    expect(sections.flatMap((s) => Object.values(s.steps)).length).toBeGreaterThan(25);
  });
});
