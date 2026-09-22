/**
 * `tests/stylePanel.test.tsx` — slice 1.8 machine gates for the style panel + Style Chip
 * (implementation plan §1.8 build order 2–5 and its Tests/Gate rows; UI spec §7;
 * build spec §11.5/§11.6/§11.7; touch-primary a11y §19.6).
 *
 * The point of these tests: the panel is PROPS-DRIVEN and standalone (handoff Part C), so
 * every assertion drives the real component through the real DOM and asserts the exact
 * props it hands back. The exported pure helpers are executed too, so a wiring bug cannot
 * hide behind a passing DOM test.
 *
 * What is proved:
 *   - the Style Chip renders a live 96×40 SVG whose geometry IS the style (colour, width
 *     clamped 1–20, dash, arrowheads, fill + alpha, `Aa` size/weight) — §11.6 #4;
 *   - `selection: 'mixed'` renders INDETERMINATE (hatched, no guessed colour, no pressed
 *     swatch, `—` readouts) and the state is ANNOUNCED, not merely drawn — §7.4 #2;
 *   - every control fires the right prop, with arithmetic (`4 mu → 3 pt`, transparency
 *     `35 % → fillAlpha 0.65`);
 *   - a control whose `applicable` is false is DISABLED and still present, and its
 *     accessible name says WHY — §7.4 #4 / §11.6 #5;
 *   - precision / unit format are the D31 project-level controls and call their own props,
 *     and the chip confirms «Project precision: 1/16»;
 *   - presets render and both callbacks fire;
 *   - every interactive control has an accessible name, and the DOM carries no `style=""`
 *     (the CSP-as-a-test rule, checked locally as well as in e2e).
 *
 * NOT tested here (CSS only, and jsdom has no layout — D40): the 44 px swatch grid, the
 * 48 px floor, the 16 px hit slop, the 96×40 chip box and the 280 px panel width. Those are
 * `[Surface]` / e2e concerns, logged for hardware and the Playwright CSP test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import StylePanel, {
  WIDTH_LADDER_MU,
  aaFontSize,
  alphaFromTransparencyPercent,
  arrowEnds,
  clampDisplayWidth,
  dashArrayFor,
  describeStyle,
  formatPt,
  hexToHsl,
  hexToRgb,
  hslToHex,
  muToPt,
  nearestLadderIndex,
  normalizeHex,
  nudgeForContrast,
  projectStrings as P,
  scopeTypeCounts,
  stepWidthMu,
  styleStrings as S,
  transparencyPercent,
  type StylePanelProps,
} from '../src/ui/StylePanel';
import { DEFAULT_STYLE, type AnnotationStyle, type AnnotationType } from '../src/domain/types';
import { TOOL_FOR_TYPE } from '../src/state/styleByTool';
import { toolDefById } from '../src/ui/ToolRail';
import { STRINGS, t } from '../src/ui/strings';
// The numeric target declarations live in CSS, and jsdom has no layout (D40), so the
// stylesheet is read as TEXT and asserted as declared (the measured half stays e2e).
// `node:fs` has no bundled types in this repo (`types: ["vite/client"]`) and Vitest
// stubs `.css?raw` to '' under `css: false`, so the runner's own Node fs is used.
// @ts-expect-error -- node:fs types are not part of this repo's `types` array.
import { readFileSync } from 'node:fs';

const stylePanelCss = readFileSync('src/ui/stylePanel.css', 'utf8');
/** The 16 px slop (`inset: -8px` per side) is the global `.hit-slop` rule. */
const globalCss = readFileSync('src/styles.css', 'utf8');

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const STYLE: AnnotationStyle = {
  ...DEFAULT_STYLE,
  strokeColor: '#FF7A18',
  strokeWidthMu: 4,
  arrowheads: 'both',
};

function mountPanel(overrides: Partial<StylePanelProps> = {}) {
  const onChange = vi.fn<(patch: Partial<AnnotationStyle>) => void>();
  const onPrecisionChange = vi.fn<(denominator: number) => void>();
  const onUnitFormatChange = vi.fn<(format: 'ft-in' | 'in' | 'ft-decimal') => void>();
  const onOpenEditorSheet = vi.fn();
  const onSavePreset = vi.fn<(name: string) => void>();
  const onApplyPreset = vi.fn<(name: string) => void>();
  const onApplyRecent = vi.fn<(style: AnnotationStyle) => void>();
  const onToggleApplyToSelection = vi.fn<(next: boolean) => void>();
  const onAlsoSetDefault = vi.fn();
  const onDeselect = vi.fn();
  const onRetryPresets = vi.fn();

  const props: StylePanelProps = {
    tool: 'dimension',
    style: STYLE,
    selection: 'none',
    applicable: {},
    projectPrecision: 16,
    unitFormat: 'ft-in',
    onChange,
    onPrecisionChange,
    onUnitFormatChange,
    onOpenEditorSheet,
    presets: [],
    onSavePreset,
    onApplyPreset,
    selectionCount: 0,
    selectionScope: [],
    applyToSelection: true,
    recents: [],
    presetsUnavailable: false,
    appliedToCount: null,
    onApplyRecent,
    onToggleApplyToSelection,
    onAlsoSetDefault,
    onDeselect,
    onRetryPresets,
    ...overrides,
  };

  const view = render(<StylePanel {...props} />);
  return {
    view,
    onChange,
    onPrecisionChange,
    onUnitFormatChange,
    onOpenEditorSheet,
    onSavePreset,
    onApplyPreset,
    onApplyRecent,
    onToggleApplyToSelection,
    onAlsoSetDefault,
    onDeselect,
    onRetryPresets,
    props,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (executed, not read)
// ---------------------------------------------------------------------------

describe('style panel pure helpers', () => {
  it('clamps the chip display width to 1–20', () => {
    expect(clampDisplayWidth(4)).toBe(4);
    expect(clampDisplayWidth(48)).toBe(20);
    expect(clampDisplayWidth(0.4)).toBe(1);
    expect(clampDisplayWidth(Number.NaN)).toBe(1);
  });

  it('converts mu to paper points at 0.75 × mu (§4.2)', () => {
    // 4 × 0.75 = 3 ; 2 × 0.75 = 1.5 ; 3 × 0.75 = 2.25 ; 48 × 0.75 = 36
    expect(muToPt(4)).toBe(3);
    expect(muToPt(2)).toBe(1.5);
    expect(muToPt(3)).toBe(2.25);
    expect(muToPt(48)).toBe(36);
    expect(formatPt(4)).toBe('3');
    expect(formatPt(1)).toBe('0.75');
  });

  it('steps the ladder and clamps at both ends', () => {
    expect(nearestLadderIndex(4)).toBe(3);
    // A hand-edited 5 mu lands on 4 (index 3) — |5−4| = 1 beats |5−6| = 1 by first match.
    expect(WIDTH_LADDER_MU[nearestLadderIndex(5)]).toBe(4);
    expect(stepWidthMu(4, 1)).toBe(6);
    expect(stepWidthMu(4, -1)).toBe(3);
    expect(stepWidthMu(48, 1)).toBe(48);
    expect(stepWidthMu(1, -1)).toBe(1);
  });

  it('maps line styles and arrowheads to their samples', () => {
    expect(dashArrayFor('solid')).toBeUndefined();
    expect(dashArrayFor('dashed')).toBe('10 6');
    expect(dashArrayFor('dotted')).toBe('2 6');
    expect(arrowEnds('none')).toEqual({ start: false, end: false });
    expect(arrowEnds('start')).toEqual({ start: true, end: false });
    expect(arrowEnds('end')).toEqual({ start: false, end: true });
    expect(arrowEnds('both')).toEqual({ start: true, end: true });
  });

  it('scales the chip Aa and clamps it to the chip box', () => {
    // 18 × 0.7 = 12.6 → 13 ; 10 × 0.7 = 7 → clamped up to 10 ; 72 × 0.7 = 50.4 → 22
    expect(aaFontSize(18)).toBe(13);
    expect(aaFontSize(10)).toBe(10);
    expect(aaFontSize(72)).toBe(22);
  });

  it('treats transparency as the inverse of the stored alpha', () => {
    // 1 − 0.65 = 0.35 → 35 % (the UI §7.2 example) ; 1 − 1 = 0
    expect(transparencyPercent(0.65)).toBe(35);
    expect(transparencyPercent(1)).toBe(0);
    expect(alphaFromTransparencyPercent(35)).toBe(0.65);
    expect(alphaFromTransparencyPercent(0)).toBe(1);
  });

  it('nudges for contrast away from the mid-lightness', () => {
    // #123B6B is 26 % L → 26 + 22 = 48 % L, same hue/sat, so it stays a dark navy.
    expect(hexToHsl('#123B6B').l).toBeLessThan(50);
    expect(hexToHsl(nudgeForContrast('#123B6B')).l).toBeGreaterThan(hexToHsl('#123B6B').l);
    // White is 100 % L → 100 − 22 = 78 % L, so it visibly darkens instead of staying white.
    expect(Math.round(hexToHsl(nudgeForContrast('#FFFFFF')).l)).toBe(78);
    expect(nudgeForContrast('#FFFFFF')).not.toBe('#FFFFFF');
  });

  it('round-trips hex ⇄ HSL within one step per channel, and validates the HEX field', () => {
    expect(normalizeHex('ff7a18')).toBe('#FF7A18');
    expect(normalizeHex('#FF7A18')).toBe('#FF7A18');
    expect(normalizeHex('#FF7A1')).toBeNull();
    expect(normalizeHex('nope')).toBeNull();
    for (const hex of ['#FF7A18', '#000000', '#FFFFFF', '#2FD4E0', '#123B6B']) {
      const { h, s, l } = hexToHsl(hex);
      const back = hexToRgb(hslToHex(h, s, l));
      const original = hexToRgb(hex);
      // An integer-stepped HSL UI is inherently lossy by ≤ a rounding step; assert that
      // bound rather than pretending the conversion is exact.
      expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
    }
    // A pure grey is exact: hue/sat are both 0.
    const white = hexToHsl('#FFFFFF');
    expect(hslToHex(white.h, white.s, white.l)).toBe('#FFFFFF');
  });
});

// ---------------------------------------------------------------------------
// The Style Chip (§11.6 #4 — never optional, never a colored dot)
// ---------------------------------------------------------------------------

describe('StylePanel — the Style Chip', () => {
  it('renders a live 96×40 SVG of the real next stroke', () => {
    mountPanel();
    const svg = screen.getByTestId('style-chip-svg');
    expect(svg.getAttribute('width')).toBe('96');
    expect(svg.getAttribute('height')).toBe('40');
    expect(svg.getAttribute('data-mixed')).toBe('false');

    const stroke = screen.getByTestId('style-chip-stroke');
    expect(stroke.getAttribute('stroke')).toBe('#FF7A18');
    expect(stroke.getAttribute('stroke-width')).toBe('4');
    // `solid` has no dash attribute at all.
    expect(stroke.getAttribute('stroke-dasharray')).toBeNull();
    // `both` draws two arrowhead polygons.
    expect(svg.querySelectorAll('polygon').length).toBe(2);
  });

  it('reflects width, line style, arrowheads, fill and Aa in the geometry', () => {
    mountPanel({
      style: {
        ...STYLE,
        strokeWidthMu: 48, // → clamped to 20 on the chip
        lineStyle: 'dashed',
        arrowheads: 'end',
        fillColor: '#FFD400',
        fillAlpha: 0.35,
        fontSizeMu: 72,
        bold: true,
      },
    });
    const stroke = screen.getByTestId('style-chip-stroke');
    expect(stroke.getAttribute('stroke-width')).toBe('20');
    expect(stroke.getAttribute('stroke-dasharray')).toBe('10 6');

    const svg = screen.getByTestId('style-chip-svg');
    expect(svg.querySelectorAll('polygon').length).toBe(1); // `end` only
    const fill = svg.querySelector('rect');
    expect(fill?.getAttribute('fill')).toBe('#FFD400');
    expect(fill?.getAttribute('fill-opacity')).toBe('0.35');

    const aa = screen.getByTestId('style-chip-aa');
    expect(aa.getAttribute('font-size')).toBe('22'); // 72 × 0.7 = 50.4 → clamped
    expect(aa.getAttribute('font-weight')).toBe('700');
    // The Aa is painted in the stroke colour, so the chip is a true preview.
    expect(aa.getAttribute('fill')).toBe('#FF7A18');
  });

  it('names the tool and shows the ft-in sub-label for a value tool', () => {
    mountPanel({ tool: 'dimension' });
    const chip = screen.getByTestId('style-chip');
    expect(chip.textContent).toContain(STRINGS.tool.dimension);
    expect(chip.textContent).toContain(STRINGS.dimension.unitFtIn);
    // The accessible name names the tool as well as the slot (§11.6 #18).
    expect(chip.getAttribute('aria-label')).toBe(`${STRINGS.editor.styleChip}: ${STRINGS.tool.dimension}`);
  });

  it('shows the selection label and leaves the tool name behind when objects are selected', () => {
    mountPanel({ selection: 'single', selectionCount: 3 });
    expect(screen.getByTestId('style-chip').textContent).toContain(
      t(P.selectionCount, { count: 3 }),
    );
  });

  it('collapses to the chip alone and re-expands', () => {
    mountPanel();
    expect(screen.queryByTestId('style-section-color')).not.toBeNull();
    fireEvent.click(screen.getByTestId('style-chip'));
    expect(screen.queryByTestId('style-section-color')).toBeNull();
    expect(screen.getByTestId('style-chip').getAttribute('aria-expanded')).toBe('false');
    // The chip itself is STILL there — §11.6 #4.
    expect(screen.getByTestId('style-chip-svg')).not.toBeNull();
    fireEvent.click(screen.getByTestId('style-chip'));
    expect(screen.queryByTestId('style-section-color')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mixed = indeterminate (§7.4 #2)
// ---------------------------------------------------------------------------

describe('StylePanel — mixed selection is indeterminate and announced', () => {
  it('hatches the chip, presses no swatch and dashes the readouts', () => {
    mountPanel({ selection: 'mixed' });
    const svg = screen.getByTestId('style-chip-svg');
    expect(svg.getAttribute('data-mixed')).toBe('true');
    // The hatch is a real pattern whose id resolves (a colon/guillemet id would not).
    const pattern = svg.querySelector('pattern');
    expect(pattern).not.toBeNull();
    expect(pattern?.id).toMatch(/^[A-Za-z0-9_-]+$/);
    const hatch = Array.from(svg.children).find((child) => child.tagName === 'rect');
    expect(hatch?.getAttribute('fill')).toBe(`url(#${pattern?.id})`);
    // No swatch reads as the current value — a guess would be a wrong measurement.
    expect(screen.getByTestId('style-swatch-#FF7A18').getAttribute('aria-pressed')).toBe('false');
    // The placeholder chip is the sanctioned "Mixed" marker.
    expect(screen.queryByTestId('style-swatch-mixed')).not.toBeNull();
    // `—` for the width readout (§7.4 #2), never a number.
    expect(screen.getByTestId('style-section-width').textContent).toContain(S.mixedDash);
  });

  it('announces the indeterminate state (not only rendering it)', () => {
    mountPanel({ selection: 'mixed' });
    const status = screen.getByTestId('style-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(S.mixedValue);
  });

  it('clears the indeterminate render once the change lands', () => {
    const { onChange, view } = mountPanel({ selection: 'mixed' });
    fireEvent.click(screen.getByTestId('style-swatch-#2ECC71'));
    expect(onChange).toHaveBeenCalledWith({ strokeColor: '#2ECC71' });
    // The caller re-renders with the new style + selection; the panel shows a real value.
    view.rerender(
      <StylePanel
        {...mountProps({
          selection: 'single',
          selectionCount: 1,
          style: { ...STYLE, strokeColor: '#2ECC71' },
        })}
      />,
    );
    expect(screen.getByTestId('style-chip-svg').getAttribute('data-mixed')).toBe('false');
    expect(screen.queryByTestId('style-swatch-mixed')).toBeNull();
    expect(screen.getByTestId('style-swatch-#2ECC71').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('style-status').textContent).toBe(
      t(S.selectionHeader, { objectCount: 1 }),
    );
  });

  it('names the selection as the reason a control is unavailable', () => {
    mountPanel({ selection: 'mixed', applicable: { strokeColor: false } });
    const swatch = screen.getByTestId('style-swatch-#FF7A18');
    expect((swatch as HTMLButtonElement).disabled).toBe(true);
    expect(swatch.getAttribute('aria-label')).toBe(
      `${S.swatchHiVisOrange}. ${S.disabledForSelection}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

describe('StylePanel — colour', () => {
  it('applies a palette swatch instantly', () => {
    const { onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-swatch-#2FD4E0'));
    expect(onChange).toHaveBeenCalledWith({ strokeColor: '#2FD4E0' });
  });

  it('names every swatch from the Site Slate palette', () => {
    mountPanel();
    expect(screen.getByTestId('style-swatch-#2FD4E0').getAttribute('aria-label')).toBe(
      S.swatchCyan,
    );
    expect(screen.getByTestId('style-swatch-#FF7A18').getAttribute('aria-label')).toBe(
      S.swatchHiVisOrange,
    );
  });

  it('opens the deep editor from Custom… and from More styles…', () => {
    const { onOpenEditorSheet } = mountPanel();
    fireEvent.click(screen.getByTestId('style-custom-color'));
    fireEvent.click(screen.getByTestId('style-more'));
    expect(onOpenEditorSheet).toHaveBeenCalledTimes(2);
  });

  it('nudges for contrast with a real, different colour', () => {
    const { onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-contrast'));
    const patch = onChange.mock.calls[0][0];
    expect(patch.strokeColor).toBeDefined();
    expect(patch.strokeColor).not.toBe('#FF7A18');
  });
});

// ---------------------------------------------------------------------------
// Width
// ---------------------------------------------------------------------------

describe('StylePanel — width', () => {
  it('reads true paper points: 4 mu → «3 pt»', () => {
    mountPanel();
    expect(screen.getByTestId('style-section-width').textContent).toContain(
      t(S.widthReadout, { widthPt: '3' }),
    );
  });

  it('steps the ladder with − and +', () => {
    const { onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-width-plus'));
    expect(onChange).toHaveBeenCalledWith({ strokeWidthMu: 6 });
    fireEvent.click(screen.getByTestId('style-width-minus'));
    expect(onChange).toHaveBeenCalledWith({ strokeWidthMu: 3 });
  });

  it('scrubs to a ladder value', () => {
    const { onChange } = mountPanel();
    fireEvent.change(screen.getByTestId('style-width-range'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ strokeWidthMu: WIDTH_LADDER_MU[5] });
  });

  it('disables the steppers at the ends of the ladder', () => {
    mountPanel({ style: { ...STYLE, strokeWidthMu: 1 } });
    expect((screen.getByTestId('style-width-minus') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('style-width-plus') as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fill + transparency
// ---------------------------------------------------------------------------

describe('StylePanel — fill and transparency', () => {
  it('clears the fill with No fill and sets it from a swatch', () => {
    const { onChange } = mountPanel({ style: { ...STYLE, fillColor: '#FFD400' } });
    fireEvent.click(screen.getByTestId('style-fill-none'));
    expect(onChange).toHaveBeenCalledWith({ fillColor: null });
    fireEvent.click(screen.getByTestId('style-fill-swatch-#2ECC71'));
    expect(onChange).toHaveBeenCalledWith({ fillColor: '#2ECC71' });
  });

  it('maps transparency percent onto the stored alpha (35 % → 0.65)', () => {
    const { onChange } = mountPanel();
    fireEvent.change(screen.getByTestId('style-transparency-range'), { target: { value: '35' } });
    expect(onChange).toHaveBeenCalledWith({ fillAlpha: 0.65 });
  });

  it('reads the transparency back out of the stored alpha', () => {
    mountPanel({ style: { ...STYLE, fillAlpha: 0.65 } });
    expect(screen.getByTestId('style-section-transparency').textContent).toContain('35%');
  });
});

// ---------------------------------------------------------------------------
// Line style, arrowheads, text
// ---------------------------------------------------------------------------

describe('StylePanel — line style, arrowheads and text', () => {
  it('fires the line style', () => {
    const { onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-line-dotted'));
    expect(onChange).toHaveBeenCalledWith({ lineStyle: 'dotted' });
  });

  it('fires the arrowhead option', () => {
    const { onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-arrow-none'));
    expect(onChange).toHaveBeenCalledWith({ arrowheads: 'none' });
  });

  it('fires text size and bold', () => {
    const { onChange } = mountPanel({ tool: 'text' });
    fireEvent.change(screen.getByTestId('style-size-range'), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith({ fontSizeMu: 24 });
    fireEvent.click(screen.getByTestId('style-bold'));
    expect(onChange).toHaveBeenCalledWith({ bold: true });
  });
});

// ---------------------------------------------------------------------------
// D133 (UI/GUI handoff pass) — inset border/corner-radius/shadow, chisel width
// ---------------------------------------------------------------------------

describe('StylePanel — D133 inset controls (border/radius/shadow)', () => {
  it('fires insetBorder and insetShadow as booleans, toggling the CURRENT value', () => {
    const { onChange } = mountPanel({ tool: 'inset', style: { ...STYLE, insetBorder: false, insetShadow: false } });
    fireEvent.click(screen.getByTestId('style-inset-border'));
    expect(onChange).toHaveBeenCalledWith({ insetBorder: true });
    fireEvent.click(screen.getByTestId('style-inset-shadow'));
    expect(onChange).toHaveBeenCalledWith({ insetShadow: true });
  });

  it('the border/shadow buttons announce their PRESSED state', () => {
    mountPanel({ tool: 'inset', style: { ...STYLE, insetBorder: true, insetShadow: false } });
    expect(screen.getByTestId('style-inset-border').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('style-inset-shadow').getAttribute('aria-pressed')).toBe('false');
  });

  it('fires insetRadius as a number from the range input', () => {
    const { onChange } = mountPanel({ tool: 'inset' });
    fireEvent.change(screen.getByTestId('style-inset-radius-range'), { target: { value: '24' } });
    expect(onChange).toHaveBeenCalledWith({ insetRadius: 24 });
  });

  it('reads an unset insetRadius back as 0, not undefined/NaN', () => {
    mountPanel({ tool: 'inset', style: { ...STYLE, insetRadius: undefined } });
    const range = screen.getByTestId('style-inset-radius-range') as HTMLInputElement;
    expect(range.value).toBe('0');
  });

  it('is hidden while nothing is selected and the active tool is not Inset (§7.2 contextual panel)', () => {
    mountPanel({ tool: 'select', selection: 'none', applicable: { insetBorder: false, insetRadius: false, insetShadow: false } });
    expect(screen.getByTestId('style-section-inset').getAttribute('data-hidden')).toBe('true');
  });

  it('is visible (not hidden) with the Inset tool active', () => {
    mountPanel({ tool: 'inset', applicable: { insetBorder: true, insetRadius: true, insetShadow: true } });
    expect(screen.getByTestId('style-section-inset').getAttribute('data-hidden')).toBe('false');
  });

  it('a control that does not apply (e.g. a non-inset selection) is disabled, never hidden, named with the reason', () => {
    mountPanel({
      tool: 'select',
      selection: 'single',
      applicable: { insetBorder: false, insetRadius: false, insetShadow: false },
    });
    const border = screen.getByTestId('style-inset-border') as HTMLButtonElement;
    expect(border.disabled).toBe(true);
    // `baseReason` keys off `selection === 'mixed'` specifically, not "any selection" —
    // a single (homogeneous) selection still reads "for this tool" (the same rule every
    // other control in the panel follows; see the disabled-never-hidden block above).
    expect(border.getAttribute('aria-label')).toBe(`${S.insetBorder}. ${S.disabledForTool}`);
    // Present, not hidden — the section itself is visible because the selection is
    // homogeneous-but-inapplicable, not "nothing selected and the wrong tool".
    expect(screen.getByTestId('style-section-inset')).not.toBeNull();
  });
});

describe('StylePanel — D133 highlighter "Chisel width" relabel', () => {
  it('labels the width section "Chisel width" while the Highlighter tool is active', () => {
    mountPanel({ tool: 'highlight' });
    expect(screen.getByTestId('style-section-width').textContent).toContain(S.chiselWidth);
  });

  it('keeps "Chisel width" when an EXISTING highlight is selected via the Select tool', () => {
    // The real gap this closes: `tool` alone is `activeTool` (EditorLayout), which stays
    // 'select' when the user re-selects an object they already drew — the label must not
    // silently revert to the generic "Width" the moment that happens.
    mountPanel({ tool: 'select', selectionScope: [{ type: 'highlight', count: 1 }] });
    expect(screen.getByTestId('style-section-width').textContent).toContain(S.chiselWidth);
  });

  it('stays the generic "Width" for every other tool', () => {
    mountPanel({ tool: 'line' });
    expect(screen.getByTestId('style-section-width').textContent).toContain(S.sectionWidth);
    expect(screen.getByTestId('style-section-width').textContent).not.toContain(S.chiselWidth);
  });

  it('the width minus/plus steppers carry the relabelled accessible name too', () => {
    mountPanel({ tool: 'highlight' });
    expect(screen.getByTestId('style-width-minus').getAttribute('aria-label')).toBe(`${S.chiselWidth} −`);
    expect(screen.getByTestId('style-width-plus').getAttribute('aria-label')).toBe(`${S.chiselWidth} +`);
  });
});

// ---------------------------------------------------------------------------
// Project precision + unit format (D31)
// ---------------------------------------------------------------------------

describe('StylePanel — project precision and unit format (D31)', () => {
  it('confirms the shipped template form «Project precision: 1/16»', () => {
    mountPanel({ projectPrecision: 16 });
    expect(screen.getByTestId('style-project-precision').textContent).toBe(
      t(STRINGS.dimension.projectPrecision, { denominator: '1/16' }),
    );
  });

  it('offers the domain denominator ladder and fires onPrecisionChange only', () => {
    const { onPrecisionChange, onChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-precision-8'));
    expect(onPrecisionChange).toHaveBeenCalledWith(8);
    // D31: the panel never edits a style value to change project precision.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onUnitFormatChange for each format', () => {
    const { onUnitFormatChange } = mountPanel();
    fireEvent.click(screen.getByTestId('style-unit-in'));
    fireEvent.click(screen.getByTestId('style-unit-ft-decimal'));
    expect(onUnitFormatChange.mock.calls.map((call) => call[0])).toEqual(['in', 'ft-decimal']);
  });

  it('is dimension-only: disabled elsewhere, and still present', () => {
    mountPanel({ tool: 'rect' });
    const chip = screen.getByTestId('style-precision-8') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.getAttribute('aria-label')).toBe(`1/8. ${S.precisionDimensionOnly}`);
    const unit = screen.getByTestId('style-unit-in') as HTMLButtonElement;
    expect(unit.disabled).toBe(true);
    expect(unit.getAttribute('aria-label')).toBe(`in. ${S.precisionDimensionOnly}`);
  });
});

// ---------------------------------------------------------------------------
// Disabled, never hidden (§7.4 #4)
// ---------------------------------------------------------------------------

describe('StylePanel — a control that does not apply is disabled, never hidden', () => {
  it('keeps an inapplicable control in the layout, disabled, and named with the reason', () => {
    mountPanel({ applicable: { fillColor: false, fillAlpha: false, arrowheads: false } });

    const noFill = screen.getByTestId('style-fill-none') as HTMLButtonElement;
    expect(noFill.disabled).toBe(true);
    expect(noFill.getAttribute('aria-label')).toBe(`${S.noFill}. ${S.disabledForTool}`);
    expect(noFill.getAttribute('title')).toBe(S.disabledForTool);

    const transparency = screen.getByTestId('style-transparency-range') as HTMLInputElement;
    expect(transparency.disabled).toBe(true);

    const arrow = screen.getByTestId('style-arrow-both') as HTMLButtonElement;
    expect(arrow.disabled).toBe(true);
    expect(screen.getByTestId('style-section-arrows')).not.toBeNull();
  });

  it('treats an absent applicability entry as applicable', () => {
    mountPanel({ applicable: {} });
    expect((screen.getByTestId('style-arrow-both') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('style-fill-none') as HTMLButtonElement).disabled).toBe(false);
  });

  it('leaves every control enabled for a fully applicable style', () => {
    mountPanel({
      applicable: {
        strokeColor: true,
        strokeWidthMu: true,
        fillColor: true,
        fillAlpha: true,
        lineStyle: true,
        arrowheads: true,
        fontSizeMu: true,
        bold: true,
      },
    });
    const controls = screen
      .getByTestId('style-panel')
      .querySelectorAll<HTMLButtonElement>('button');
    expect(controls.length).toBeGreaterThan(20);
    for (const control of Array.from(controls)) expect(control.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe('StylePanel — presets', () => {
  it('shows the empty state with no presets', () => {
    mountPanel({ presets: [] });
    expect(screen.getByTestId('style-presets-empty').textContent).toBe(S.presetsEmpty);
  });

  it('lists presets and applies one by name', () => {
    const { onApplyPreset } = mountPanel({
      presets: [
        { name: 'Site red', style: { ...STYLE, strokeColor: '#E8384F' } },
        { name: 'Survey blue', style: { ...STYLE, strokeColor: '#35A7FF' } },
      ],
    });
    expect(screen.getByTestId('style-preset-Site red').getAttribute('aria-label')).toBe('Site red');
    fireEvent.click(screen.getByTestId('style-preset-Survey blue'));
    expect(onApplyPreset).toHaveBeenCalledWith('Survey blue');
  });

  it('saves a preset by name and refuses a blank one', () => {
    const { onSavePreset } = mountPanel();
    fireEvent.click(screen.getByTestId('style-preset-save'));
    const confirm = screen.getByTestId('style-preset-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // a blank name is not a preset

    fireEvent.change(screen.getByTestId('style-preset-name'), {
      target: { value: '  Roof edge  ' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onSavePreset).toHaveBeenCalledWith('Roof edge');
  });
});

// ---------------------------------------------------------------------------
// Accessibility (§19.6) + CSP
// ---------------------------------------------------------------------------

describe('StylePanel — accessibility and CSP', () => {
  it('gives every interactive control an accessible name', () => {
    mountPanel({ tool: 'text' });
    const panel = screen.getByTestId('style-panel');
    const controls = panel.querySelectorAll<HTMLElement>('button, input, [role="group"]');
    expect(controls.length).toBeGreaterThan(20);
    for (const control of Array.from(controls)) {
      const named =
        control.getAttribute('aria-label') !== null ||
        control.textContent?.trim() !== '' ||
        control.querySelector('[aria-label]') !== null;
      expect(named, `${control.tagName}.${control.className} has no accessible name`).toBe(true);
    }
  });

  it('carries no inline style attribute anywhere (CSP-as-a-test)', () => {
    const { view } = mountPanel({ tool: 'text', presets: [{ name: 'P', style: STYLE }] });
    expect(view.container.querySelectorAll('[style]').length).toBe(0);
  });

  it('exposes the panel as a labelled landmark and reports the selection', () => {
    mountPanel({ selection: 'single' });
    const panel = screen.getByTestId('style-panel');
    expect(panel.tagName).toBe('ASIDE');
    expect(panel.getAttribute('aria-label')).toBe(S.panelLabel);
    expect(panel.getAttribute('data-selection')).toBe('single');
  });
});

// ---------------------------------------------------------------------------
// Selection bar (§7.4 #1/#3)
// ---------------------------------------------------------------------------

describe('StylePanel — selection bar', () => {
  it('shows the count header and a Deselect button, and fires onDeselect', () => {
    const { onDeselect } = mountPanel({ selection: 'single', selectionCount: 3 });
    expect(screen.getByTestId('style-selection-header').textContent).toBe(
      t(S.selectionHeader, { objectCount: 3 }),
    );
    const deselect = screen.getByTestId('style-deselect');
    expect(deselect.getAttribute('aria-label')).toBe(S.deselect);
    fireEvent.click(deselect);
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('renders no selection bar when nothing is selected', () => {
    mountPanel({ selectionCount: 0 });
    expect(screen.queryByTestId('style-selection-bar')).toBeNull();
    expect(screen.queryByTestId('style-deselect')).toBeNull();
  });

  it('announces the selection count (not only renders it)', () => {
    mountPanel({ selection: 'single', selectionCount: 2 });
    const status = screen.getByTestId('style-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(t(S.selectionHeader, { objectCount: 2 }));
  });

  it('toggles synchronous mode through onToggleApplyToSelection', () => {
    const { onToggleApplyToSelection } = mountPanel({
      selection: 'single',
      selectionCount: 2,
      applyToSelection: true,
    });
    const toggle = screen.getByTestId('style-apply-to-selection');
    expect(toggle.getAttribute('aria-label')).toBe(S.applyToSelection);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onToggleApplyToSelection).toHaveBeenCalledWith(false);

    cleanup();
    const off = mountPanel({
      selection: 'single',
      selectionCount: 2,
      applyToSelection: false,
    });
    const offToggle = screen.getByTestId('style-apply-to-selection');
    expect(offToggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(offToggle);
    expect(off.onToggleApplyToSelection).toHaveBeenCalledWith(true);
  });

  it('shows the scope chip only for a heterogeneous selection', () => {
    const scope = [
      { type: 'text' as const, count: 2 },
      { type: 'dimension' as const, count: 1 },
    ];
    mountPanel({ selection: 'mixed', selectionCount: 3, selectionScope: scope });
    expect(screen.getByTestId('style-scope-chip').textContent).toBe(
      t(S.applyToScope, { typeCounts: scopeTypeCounts(scope) }),
    );
    // The type labels reuse the creating tools' names; the counts are the caller's truth.
    expect(scopeTypeCounts(scope)).toBe('Text note (2) · Dimension (1)');

    cleanup();
    mountPanel({ selection: 'single', selectionCount: 1, selectionScope: [scope[1]] });
    expect(screen.queryByTestId('style-scope-chip')).toBeNull();
  });

  /**
   * Session-14 review, finding 7 — the scope chip's half of the single-map guard.
   *
   * `scopeTypeCounts` used to read a private `TYPE_TOOL` copy that was byte-identical to
   * `EditorLayout`'s `TOOL_FOR_TYPE` with nothing enforcing it. Both now read the ONE map
   * in `@/state/styleByTool`; this asserts the chip's label for EVERY annotation type is
   * that map's tool label, so re-introducing a divergent local copy here fails.
   * (The applicability half, and the map's literal values, are `tests/typeToolMap.test.ts`.)
   */
  it('the chip labels every type through the shared TOOL_FOR_TYPE map', () => {
    const allTypes: AnnotationType[] = [
      'dimension',
      'angle',
      'line',
      'arrow',
      'rect',
      'ellipse',
      'polygon',
      'freehand',
      'highlight',
      'text',
      'image',
    ];
    for (const type of allTypes) {
      const expected = toolDefById(TOOL_FOR_TYPE[type])?.label;
      expect(expected, `no tool label for type ${type}`).toBeTruthy();
      expect(scopeTypeCounts([{ type, count: 2 }])).toBe(`${expected} (2)`);
    }
    // The one non-identity row, spelled out: an `image` annotation is an Image inset.
    expect(scopeTypeCounts([{ type: 'image', count: 1 }])).toBe(
      `${toolDefById('inset')?.label} (1)`,
    );
  });
});

// ---------------------------------------------------------------------------
// Recents (§7.3)
// ---------------------------------------------------------------------------

describe('StylePanel — Recents', () => {
  const recentA: AnnotationStyle = { ...STYLE, strokeColor: '#2ECC71' };
  const recentB: AnnotationStyle = { ...STYLE, strokeColor: '#35A7FF', strokeWidthMu: 8 };

  it('applies a recent style, newest first', () => {
    const { onApplyRecent } = mountPanel({ recents: [recentA, recentB] });
    expect(screen.getByTestId('style-section-recents').textContent).toContain(S.recentHeader);
    const chip0 = screen.getByTestId('style-recent-0');
    expect(chip0.getAttribute('aria-label')).toBe(describeStyle(recentA));
    fireEvent.click(chip0);
    expect(onApplyRecent).toHaveBeenCalledWith(recentA);
    fireEvent.click(screen.getByTestId('style-recent-1'));
    expect(onApplyRecent).toHaveBeenCalledWith(recentB);
  });

  it('renders no Recents row when there are none', () => {
    mountPanel({ recents: [] });
    expect(screen.queryByTestId('style-section-recents')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Applied-to hint (§7.3)
// ---------------------------------------------------------------------------

describe('StylePanel — the applied-to hint', () => {
  it('shows «Applied to N objects» and pins the default on demand', () => {
    const { onAlsoSetDefault } = mountPanel({ appliedToCount: 3 });
    const hint = screen.getByTestId('style-applied-hint');
    expect(hint.textContent).toContain(t(S.appliedToSelection, { objectCount: 3 }));
    const also = screen.getByTestId('style-also-default');
    expect(also.getAttribute('aria-label')).toBe(S.alsoSetDefault);
    fireEvent.click(also);
    expect(onAlsoSetDefault).toHaveBeenCalledTimes(1);
  });

  it('hides the hint when appliedToCount is null', () => {
    mountPanel({ appliedToCount: null });
    expect(screen.queryByTestId('style-applied-hint')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Presets warn strip (§7.5)
// ---------------------------------------------------------------------------

describe('StylePanel — folder-unavailable warn strip', () => {
  it('renders the warn copy and retries through onRetryPresets', () => {
    const { onRetryPresets } = mountPanel({ presetsUnavailable: true });
    const warn = screen.getByTestId('style-presets-warn');
    expect(warn.textContent).toContain(S.presetsError);
    const retry = screen.getByTestId('style-presets-retry');
    expect(retry.getAttribute('aria-label')).toBe(STRINGS.errors.retry);
    fireEvent.click(retry);
    expect(onRetryPresets).toHaveBeenCalledTimes(1);
  });

  it('hides the strip while presets are available', () => {
    mountPanel({ presetsUnavailable: false });
    expect(screen.queryByTestId('style-presets-warn')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Declared target geometry (§19.6) — checked in the stylesheet, NOT measured
// (jsdom has no layout, D40; the measured half stays [Surface]/e2e)
// ---------------------------------------------------------------------------

describe('StylePanel — declared touch targets (CSS)', () => {
  it('declares 48 px on the selection controls and 44 px Recents + swatches', () => {
    const css = stylePanelCss;
    expect(css).toMatch(/\.style-panel-deselect,[\s\S]*?min-height:\s*48px/);
    expect(css).toMatch(/\.style-panel-warn-retry\s*\{[^}]*min-height:\s*48px/);
    expect(css).toMatch(/\.style-panel-recent\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.style-panel-recent\s*\{[^}]*height:\s*44px/);
    // The swatch grid keeps the sanctioned sub-48 exception (shared with Recents).
    expect(css).toMatch(/\.style-panel-swatch\s*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.style-panel-swatch\s*\{[^}]*height:\s*44px/);
    // The 16 px slop itself is the global `.hit-slop` rule (8 px per side).
    expect(globalCss).toMatch(/\.hit-slop::after\s*\{[^}]*inset:\s*-8px/);
  });

  it('puts the 16 px slop class on the new controls and not on Recents', () => {
    mountPanel({
      selection: 'single',
      selectionCount: 2,
      appliedToCount: 2,
      presetsUnavailable: true,
    });
    expect(screen.getByTestId('style-deselect').className).toContain('hit-slop');
    expect(screen.getByTestId('style-apply-to-selection').className).toContain('hit-slop');
    expect(screen.getByTestId('style-also-default').className).toContain('hit-slop');
    expect(screen.getByTestId('style-presets-retry').className).toContain('hit-slop');
    // Recents deliberately carry no slop: 16 px over a 6 px gap would overlap (§14.5).
    cleanup();
    mountPanel({ recents: [{ ...STYLE }] });
    expect(screen.getByTestId('style-recent-0').className).not.toContain('hit-slop');
  });
});

/** The base props for a re-render, without the renderer. */
function mountProps(overrides: Partial<StylePanelProps> = {}): StylePanelProps {
  return {
    tool: 'dimension',
    style: STYLE,
    selection: 'none',
    applicable: {},
    projectPrecision: 16,
    unitFormat: 'ft-in',
    onChange: vi.fn(),
    onPrecisionChange: vi.fn(),
    onUnitFormatChange: vi.fn(),
    onOpenEditorSheet: vi.fn(),
    presets: [],
    onSavePreset: vi.fn(),
    onApplyPreset: vi.fn(),
    selectionCount: 0,
    selectionScope: [],
    applyToSelection: true,
    recents: [],
    presetsUnavailable: false,
    appliedToCount: null,
    onApplyRecent: vi.fn(),
    onToggleApplyToSelection: vi.fn(),
    onAlsoSetDefault: vi.fn(),
    onDeselect: vi.fn(),
    onRetryPresets: vi.fn(),
    ...overrides,
  };
}
