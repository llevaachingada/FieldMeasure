/**
 * tests/renderText.browser.test.ts: the text-note's typeface.
 *
 * Runs in the `browser` project because `Konva.Text` measures its glyphs on a real canvas.
 *
 * The note used to ask for `'Inter'`, which the app does not ship (it ships Archivo and
 * JetBrains Mono, see the @font-face rules in src/styles.css). A family the machine does not
 * have falls through to the browser default, which on Windows is Times New Roman: the note
 * showed in a serif face on screen and in every export, while the sheet that edits it
 * previewed it in Archivo. Both must name the UI font and end in a generic family, so a font
 * that fails to load degrades to a sans-serif instead of a serif.
 */
import { describe, expect, it } from 'vitest';
import type Konva from 'konva';
import { buildTextGroup } from '../src/editor/shapes/renderText';
import { DEFAULT_STYLE } from '../src/domain/types';

/** The app's UI font stack (src/styles.css `body`: `Archivo, system-ui, sans-serif`). */
const UI_FONT_STACK = 'Archivo, system-ui, sans-serif';

function glyphsOf(background: 'none' | 'pill' | 'solid' | 'auto' | 'box'): Konva.Text {
  const group = buildTextGroup({
    id: 'note',
    at: { x: 10, y: 10 },
    text: 'Cracked sill',
    background,
    style: { ...DEFAULT_STYLE },
    scale: 1,
  });
  return group.find('Text')[0] as Konva.Text;
}

describe('text-note typeface', () => {
  it.each(['none', 'pill', 'solid', 'auto', 'box'] as const)(
    'a %s note is drawn in the app UI font stack',
    (background) => {
      expect(glyphsOf(background).fontFamily()).toBe(UI_FONT_STACK);
    },
  );

  it('never asks for Inter (not shipped, so it fell back to a serif face)', () => {
    expect(glyphsOf('box').fontFamily()).not.toMatch(/inter/i);
  });

  it('ends in a generic family, so a font that has not loaded cannot fall back to a serif', () => {
    const families = glyphsOf('box')
      .fontFamily()
      .split(',')
      .map((f) => f.trim());
    expect(['sans-serif', 'serif', 'monospace']).toContain(families[families.length - 1]);
    expect(families[families.length - 1]).toBe('sans-serif');
  });
});
