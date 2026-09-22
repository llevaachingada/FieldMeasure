/**
 * Display-theme tests (slice 1.10; UI §14.2).
 *
 * Two halves, both machine-checkable in Node:
 *   1. `applyThemeAttribute` — the helper the app root calls to write
 *      `<html data-theme="…">`.
 *   2. The token-level CSS itself — read as text off disk (Vite stubs `.css?raw`
 *      under the default `css: false`). jsdom cannot resolve the custom-property
 *      cascade, so this is the honest machine form of "the Standard look is unchanged
 *      and the theme remaps are complete": assert the shipped `:root` values are
 *      untouched, that a theme only redefines tokens that already exist, and — the
 *      requirement the field depends on — that NO theme redefines the ink colours.
 */
import { describe, expect, it } from 'vitest';
import {
  applyThemeAttribute,
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  type Theme,
} from '../src/settings/theme';

// Vite's CSS pipeline stubs `.css?raw` to an empty string under Vitest's default
// `css: false`, and `node:fs` has no bundled types here (`types: ["vite/client"]`),
// so the stylesheet is read as TEXT through the runner's own Node fs — the exact
// bytes a browser loads. Same pattern as `tests/stylePanel.test.tsx`.
// @ts-expect-error -- node:fs types are not part of this repo's `types` array.
import { readFileSync } from 'node:fs';

const styles = readFileSync('src/styles.css', 'utf8');

// ---------------------------------------------------------------------------
// The token-level CSS
// ---------------------------------------------------------------------------

/** Comments carry prose (and a colon), so strip them before splitting on `;`. */
function blockBody(selector: string): string {
  const at = styles.indexOf(selector);
  expect(at, `styles.css is missing the "${selector}" block`).toBeGreaterThanOrEqual(0);
  const open = styles.indexOf('{', at);
  const close = styles.indexOf('}', open);
  return styles.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of body.split(';')) {
    const i = chunk.indexOf(':');
    if (i < 0) continue;
    const name = chunk.slice(0, i).trim();
    if (name.startsWith('--')) out.set(name, chunk.slice(i + 1).trim());
  }
  return out;
}

const rootAt = styles.indexOf(':root {');
const rootBlock = declarations(blockBody(':root {'));
const sunlightAt = styles.indexOf(":root[data-theme='sunlight'] {");
const sunlight = declarations(blockBody(":root[data-theme='sunlight'] {"));
const dim = declarations(blockBody(":root[data-theme='dim'] {"));

/**
 * The shipped Standard palette, copied from `:root`. This is a guard, not a
 * baseline to move: a theme slice must not change the default look, so a change
 * here is a deliberate re-design that should be reviewed — not a quiet edit.
 */
const SHIPPED_DEFAULT: Record<string, string> = {
  '--g900': '#0e1318',
  '--g850': '#12181e',
  '--g800': '#161c23',
  '--g750': '#1e262f',
  '--g700': '#2b3540',
  '--g600': '#3a4652',
  '--g400': '#6e7f8e',
  '--g300': '#9fb0be',
  '--g100': '#eaf0f5',
  '--g000': '#ffffff',
  '--hi': '#ff7a18',
  '--hi-d': '#d45f0c',
  '--sel': '#2fd4e0',
  '--sel-d': '#12909a',
  '--ok': '#3dd68c',
  '--warn': '#ffc24b',
  '--err': '#ff5a5f',
  '--mat': '#0b0e12',
};

/** Colours that carry measurement meaning (UI §14.1). Never remapped by a theme. */
const INK_TOKENS = ['--hi', '--hi-d', '--sel', '--sel-d', '--ok', '--warn', '--err'];

// WCAG 2.x relative luminance / contrast, so "reduced luminance" and "AA" are
// numbers here rather than adjectives.
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('display themes (token-level, styles.css)', () => {
  it('leaves the shipped Standard palette byte-identical', () => {
    for (const [token, value] of Object.entries(SHIPPED_DEFAULT)) {
      expect(rootBlock.get(token), `:root ${token}`).toBe(value);
    }
    // And the default palette is the complete set of remappable tokens.
    expect([...rootBlock.keys()].sort()).toEqual(Object.keys(SHIPPED_DEFAULT).sort());
  });

  it('does not scope any rule to the default theme', () => {
    // `standard` must match nothing — no filter, no override, no no-op block that
    // could drift into a real one. (Its own attribute value is written by the
    // runtime, but no CSS keys off it.)
    expect(styles).not.toMatch(/data-theme=(['"])standard\1/);
  });

  it('declares the theme overrides after :root so they cascade', () => {
    expect(sunlightAt, 'sunlight block').toBeGreaterThan(rootAt);
    expect(styles.indexOf(":root[data-theme='dim'] {"), 'dim block').toBeGreaterThan(rootAt);
  });

  it('only remaps tokens that already exist at :root', () => {
    for (const [theme, tokens] of [
      ['sunlight', sunlight],
      ['dim', dim],
    ] as const) {
      for (const token of tokens.keys()) {
        expect(rootBlock.has(token), `${theme} introduces unknown token ${token}`).toBe(true);
      }
    }
  });

  it('never remaps an ink/meaning colour in any theme', () => {
    for (const [theme, tokens] of [
      ['sunlight', sunlight],
      ['dim', dim],
    ] as const) {
      for (const ink of INK_TOKENS) {
        expect(tokens.has(ink), `${theme} must not redefine ${ink}`).toBe(false);
      }
    }
  });

  it('Sunlight is pure-black chrome with pure-white text (≈21:1)', () => {
    expect(sunlight.get('--g900')).toBe('#000000');
    expect(sunlight.get('--g850')).toBe('#000000');
    expect(sunlight.get('--g100')).toBe('#ffffff');
    expect(sunlight.get('--mat')).toBe('#000000');
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    // 2px borders would vanish in glare; Sunlight's hairlines are white.
    expect(sunlight.get('--g700')).toBe('#ffffff');
  });

  it('Dim lowers luminance but keeps AA contrast', () => {
    const dimBg = dim.get('--g900')!;
    const dimText = dim.get('--g100')!;
    const dimPanel = dim.get('--g750')!;

    // Darker surfaces and dimmer body text than the shipped Standard theme.
    expect(luminance(dimBg)).toBeLessThan(luminance(SHIPPED_DEFAULT['--g900']));
    expect(luminance(dimText)).toBeLessThan(luminance(SHIPPED_DEFAULT['--g100']));

    // …but text still clears AA wherever it sits, including the small labels.
    expect(contrast(dimText, dimPanel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dim.get('--g300')!, dimBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dim.get('--g400')!, dimBg)).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// The runtime helper
// ---------------------------------------------------------------------------

describe('applyThemeAttribute', () => {
  it('writes the selected theme onto the root for every state', () => {
    const seen: Array<[string, string]> = [];
    const root = {
      setAttribute: (name: string, value: string) => {
        seen.push([name, value]);
      },
    };

    for (const theme of ['standard', 'sunlight', 'dim'] as Theme[]) {
      applyThemeAttribute(theme, root);
      expect(seen.at(-1)).toEqual([THEME_ATTRIBUTE, theme]);
    }
  });

  it('tolerates a missing root instead of throwing', () => {
    expect(() => applyThemeAttribute(DEFAULT_THEME, null)).not.toThrow();
  });
});
