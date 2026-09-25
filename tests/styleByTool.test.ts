/**
 * tests/styleByTool.test.ts — slice 1.8 lane C1 gates (UI spec §7.3/§7.4; build spec §11.5).
 *
 * Proves by execution, not by reading:
 *   - per-tool memory returns on a tool swap and is never reset by the swap;
 *   - Recents dedupe, cap at 8, are newest-first, and are filtered to the current tool;
 *   - `selectionStyleState` is `none`/`single`/`mixed` and the mixed style is not invented;
 *   - `applicableFor` matches the §7.2 per-tool control table for at least three tools;
 *   - `selectionScope` groups a heterogeneous selection in first-appearance order.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_STYLE, type AnnotationStyle } from '../src/domain/types';
import {
  RECENTS_CAP,
  applicableFor,
  isStyleValidForTool,
  pushRecent,
  recentsForTool,
  selectionScope,
  selectionStyleState,
  styleForTool,
  stylesEqual,
  useStyleByTool,
} from '../src/state/styleByTool';

afterEach(() => {
  useStyleByTool.getState().resetStyleStore();
});

const style = (patch: Partial<AnnotationStyle>): AnnotationStyle => ({ ...DEFAULT_STYLE, ...patch });

describe('styleByTool — per-tool memory (§7.4 #6)', () => {
  it('returns each tool\'s last style after a swap, never a reset', () => {
    const { setToolStyle } = useStyleByTool.getState();

    setToolStyle('dimension', { strokeColor: '#FFD400', strokeWidthMu: 8 });
    setToolStyle('line', { strokeColor: '#2FD4E0' });

    const afterSwap = useStyleByTool.getState();
    // D150 (owner request): a dimension's fresh style has arrowheads at both ends.
    expect(styleForTool(afterSwap, 'dimension')).toEqual(
      style({ strokeColor: '#FFD400', strokeWidthMu: 8, arrowheads: 'both' }),
    );
    expect(styleForTool(afterSwap, 'line')).toEqual(style({ strokeColor: '#2FD4E0' }));

    // Restyle dimension again, switch away and "back": line keeps its own memory.
    setToolStyle('dimension', { strokeColor: '#E8384F' });
    setToolStyle('line', { strokeWidthMu: 12 });
    const back = useStyleByTool.getState();
    expect(styleForTool(back, 'dimension').strokeColor).toBe('#E8384F');
    expect(styleForTool(back, 'line').strokeColor).toBe('#2FD4E0');
    expect(styleForTool(back, 'line').strokeWidthMu).toBe(12);
  });

  it('merges a patch without clobbering the other keys, and replaces wholesale', () => {
    const { setToolStyle, replaceToolStyle } = useStyleByTool.getState();
    setToolStyle('rect', { fillColor: '#35A7FF', fillAlpha: 0.4 });
    const merged = styleForTool(useStyleByTool.getState(), 'rect');
    expect(merged.fillColor).toBe('#35A7FF');
    expect(merged.strokeWidthMu).toBe(DEFAULT_STYLE.strokeWidthMu);

    replaceToolStyle('rect', style({ strokeColor: '#000000' }));
    expect(styleForTool(useStyleByTool.getState(), 'rect')).toEqual(style({ strokeColor: '#000000' }));
  });

  it('resetToolStyle returns exactly DEFAULT_STYLE for that tool only', () => {
    const { setToolStyle, resetToolStyle } = useStyleByTool.getState();
    setToolStyle('text', { bold: true, fontSizeMu: 30 });
    setToolStyle('line', { strokeColor: '#FFFFFF' });
    resetToolStyle('text');
    const state = useStyleByTool.getState();
    expect(styleForTool(state, 'text')).toEqual(DEFAULT_STYLE);
    expect(styleForTool(state, 'line').strokeColor).toBe('#FFFFFF');
  });
});

describe('recents — dedupe, cap, newest-first, tool filter (§7.3)', () => {
  it('caps at 8 and keeps the newest first', () => {
    const { setToolStyle } = useStyleByTool.getState();
    for (let i = 0; i < 10; i += 1) {
      // Distinct colors keep every style unique (no accidental dedupe).
      setToolStyle('dimension', { strokeColor: `#00000${i % 10}` });
    }
    const recents = useStyleByTool.getState().recents;
    expect(recents).toHaveLength(RECENTS_CAP);
    expect(recents[0].strokeColor).toBe('#000009'); // newest
    expect(recents[RECENTS_CAP - 1].strokeColor).toBe('#000002'); // oldest survivor
  });

  it('dedupes an identical style instead of adding a second copy', () => {
    const { setToolStyle } = useStyleByTool.getState();
    setToolStyle('dimension', { strokeColor: '#FF7A18' });
    setToolStyle('line', { strokeColor: '#2FD4E0' });
    setToolStyle('dimension', { strokeColor: '#FF7A18' });
    const recents = useStyleByTool.getState().recents;
    expect(recents.filter((entry) => entry.strokeColor === '#FF7A18')).toHaveLength(1);
    expect(recents[0].strokeColor).toBe('#FF7A18'); // moved back to the front
  });

  it('filters the raw list to styles valid for the current tool', () => {
    const { replaceToolStyle } = useStyleByTool.getState();
    const textLook = style({ bold: true, fontSizeMu: 30 });
    const dimensionLook = style({ strokeColor: '#FFD400', arrowheads: 'both' });
    replaceToolStyle('text', textLook);
    replaceToolStyle('dimension', dimensionLook);

    const recents = useStyleByTool.getState().recents;
    expect(recentsForTool(recents, 'text')).toEqual([textLook]);
    expect(recentsForTool(recents, 'dimension')).toEqual([dimensionLook]);

    // The text look carries non-default `bold`/`fontSizeMu`, which Dimension cannot express.
    expect(isStyleValidForTool(textLook, 'dimension')).toBe(false);
    // The default style is valid for every tool (nothing is away from default).
    expect(isStyleValidForTool(DEFAULT_STYLE, 'dimension')).toBe(true);
    expect(isStyleValidForTool(DEFAULT_STYLE, 'select')).toBe(true);
  });

  it('pushRecent is pure: the input array is untouched', () => {
    const before: AnnotationStyle[] = [style({ strokeColor: '#FFFFFF' })];
    const after = pushRecent(before, style({ strokeColor: '#000000' }));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
    expect(after[0].strokeColor).toBe('#000000');
  });
});

describe('selectionStyleState (§7.4 #2)', () => {
  it('none for an empty selection', () => {
    expect(selectionStyleState([])).toEqual({ mode: 'none', style: DEFAULT_STYLE });
  });

  it('single when all styles are equal', () => {
    const a = style({ strokeColor: '#FF7A18' });
    const b = style({ strokeColor: '#FF7A18' });
    const result = selectionStyleState([a, b]);
    expect(result.mode).toBe('single');
    expect(result.style).toEqual(a);
    expect(result.style).not.toBe(a); // a copy, not the caller's object
  });

  it('mixed when any key differs, and returns the DEFAULT placeholder (no invented merge)', () => {
    const a = style({ strokeColor: '#FF7A18', strokeWidthMu: 4 });
    const b = style({ strokeColor: '#2FD4E0', strokeWidthMu: 4 });
    const result = selectionStyleState([a, b]);
    expect(result.mode).toBe('mixed');
    expect(result.style).toEqual(DEFAULT_STYLE);
    // It must not have picked a winner or averaged anything.
    expect(result.style.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
  });

  it('stylesEqual compares every STYLE_KEYS entry (the original 8 plus D133\'s 3 inset keys)', () => {
    expect(stylesEqual(style({}), style({}))).toBe(true);
    expect(stylesEqual(style({ fillAlpha: 0.5 }), style({ fillAlpha: 0.5 }))).toBe(true);
    expect(stylesEqual(style({ lineStyle: 'dashed' }), style({ lineStyle: 'solid' }))).toBe(false);
  });
});

describe('applicableFor — the §7.2 table over STYLE_KEYS', () => {
  // D133 (UI/GUI handoff pass) appended insetBorder/insetRadius/insetShadow to
  // STYLE_KEYS; every non-inset row is false on all three (only `inset` sets them).
  const NO_INSET_KEYS = { insetBorder: false, insetRadius: false, insetShadow: false };

  it('Dimension exposes Color, Width, Arrowheads only', () => {
    expect(applicableFor('dimension')).toEqual({
      strokeColor: true,
      strokeWidthMu: true,
      fillColor: false,
      fillAlpha: false,
      lineStyle: false,
      arrowheads: true,
      fontSizeMu: false,
      bold: false,
      ...NO_INSET_KEYS,
    });
  });

  it('Text exposes Color, Size, Bold only', () => {
    expect(applicableFor('text')).toEqual({
      strokeColor: true,
      strokeWidthMu: false,
      fillColor: false,
      fillAlpha: false,
      lineStyle: false,
      arrowheads: false,
      fontSizeMu: true,
      bold: true,
      ...NO_INSET_KEYS,
    });
  });

  it('Rectangle exposes Color, Width, Line style, Fill, Transparency only', () => {
    expect(applicableFor('rect')).toEqual({
      strokeColor: true,
      strokeWidthMu: true,
      fillColor: true,
      fillAlpha: true,
      lineStyle: true,
      arrowheads: false,
      fontSizeMu: false,
      bold: false,
      ...NO_INSET_KEYS,
    });
  });

  it('Line exposes Color, Width, Line style, Arrowheads', () => {
    expect(applicableFor('line')).toEqual({
      strokeColor: true,
      strokeWidthMu: true,
      fillColor: false,
      fillAlpha: false,
      lineStyle: true,
      arrowheads: true,
      fontSizeMu: false,
      bold: false,
      ...NO_INSET_KEYS,
    });
  });

  it('Highlighter exposes Color, Chisel width, Transparency (fillAlpha)', () => {
    expect(applicableFor('highlight')).toEqual({
      strokeColor: true,
      strokeWidthMu: true,
      fillColor: false,
      fillAlpha: true,
      lineStyle: false,
      arrowheads: false,
      fontSizeMu: false,
      bold: false,
      ...NO_INSET_KEYS,
    });
  });

  it('Image inset (D133) exposes Border, Corner radius, Shadow only', () => {
    expect(applicableFor('inset')).toEqual({
      strokeColor: false,
      strokeWidthMu: false,
      fillColor: false,
      fillAlpha: false,
      lineStyle: false,
      arrowheads: false,
      fontSizeMu: false,
      bold: false,
      insetBorder: true,
      insetRadius: true,
      insetShadow: true,
    });
  });

  it('Select, Erase and Pan create nothing → every key false', () => {
    for (const tool of ['select', 'erase', 'pan'] as const) {
      expect(Object.values(applicableFor(tool)).every((value) => value === false)).toBe(true);
    }
  });
});

describe('selectionScope (§7.4 #3)', () => {
  it('groups by type in first-appearance order', () => {
    expect(
      selectionScope([{ type: 'dimension' }, { type: 'text' }, { type: 'text' }, { type: 'dimension' }]),
    ).toEqual([
      { type: 'dimension', count: 2 },
      { type: 'text', count: 2 },
    ]);
  });

  it('is empty for an empty selection', () => {
    expect(selectionScope([])).toEqual([]);
  });
});
