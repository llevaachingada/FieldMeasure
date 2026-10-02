/**
 * `tests/editorChrome.test.tsx` - jsdom pins for the lane-D chrome work (slice 1.4.5 /
 * 1.8 visual pass).
 *
 * jsdom has no layout engine (D40), so the SIZES live in `editorChromeFit.browser.test.ts`
 * (real Chromium). What jsdom CAN prove, and what this file proves:
 *
 *   1. The 14 tool glyphs are real: 14 `<svg>`s, one per rail button, in rail order and
 *      grouped as UI §6.2 lists them, each decorative (`aria-hidden`), each carrying an
 *      accessible name on its BUTTON (the glyph itself is silent), each drawn on the 24 px
 *      grid with `currentColor` only - no `<text>`, no hardcoded colour, no inline `style`
 *      (CSP `style-src 'self'`), and no two glyphs byte-identical (the old placeholders were
 *      a numbered square: 14 files, 14 differences of one digit, and now none of that).
 *   2. §7.2's contextual panel: a section the active tool does not use is hidden while
 *      nothing is selected, and NOT hidden as soon as anything is selected (§7.4 #4/#5
 *      "disabled, never hidden" is preserved for a selection).
 *   3. The Density setting is wired: `data-density` on `.editor-layout` follows
 *      `appStore.density` (it was stored but inert before this pass).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
// The density rules are asserted as DECLARED here (`readFileSync` is the jsdom project's
// Node fs); their measured effect is the browser fit test.
// @ts-expect-error -- node:fs types are not part of this repo's `types` array.
import { readFileSync } from 'node:fs';

vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: () =>
      React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' }),
  };
});

vi.mock('@/fs/presets', async () => {
  const { DEFAULT_STYLE } = await import('@/domain/types');
  return {
    PresetsBindingError: class PresetsBindingError extends Error {},
    emptyPresets: () => ({ schemaVersion: 1, byTool: {} }),
    findPreset: () => undefined,
    loadPresets: async () => ({ ok: true, presets: { schemaVersion: 1, byTool: {} } }),
    presetsForTool: () => [{ name: 'Riverside dim', style: { ...DEFAULT_STYLE } }],
    savePresets: async () => {},
    upsertPreset: (file: unknown) => file,
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import ToolRail, { GROUP_HEADERS, TOOL_DEFS } from '../src/ui/ToolRail';
import StylePanel, { PALETTE, type StylePanelProps } from '../src/ui/StylePanel';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { createInitialStyleState, useStyleByTool } from '../src/state/styleByTool';
import { DEFAULT_STYLE } from '../src/domain/types';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// 1. The 14 tool glyphs (UI §3.4/§11.7; build spec §11.7)
// ---------------------------------------------------------------------------

describe('tool rail glyphs - 14 real, legible, decorative marks', () => {
  function railButtons(): HTMLButtonElement[] {
    const view = render(createElement(ToolRail, { activeTool: 'select', onSelectTool: () => {}, side: 'right' }));
    return Array.from(view.container.querySelectorAll<HTMLButtonElement>('[data-tool]'));
  }

  it('renders exactly one inline <svg> per tool, in the rail\'s own bottom-anchored order', () => {
    const buttons = railButtons();
    expect(buttons).toHaveLength(14);
    // DOM order is visual order. D149 (owner request): Measure, Annotate, Mark, Insert, Erase,
    // Move (was 6 → 1, UI §6.2).
    const expected = [2, 4, 3, 5, 6, 1].flatMap((group) =>
      TOOL_DEFS.filter((def) => def.group === group).map((def) => def.id),
    );
    expect(buttons.map((b) => b.dataset.tool)).toEqual(expected);
    for (const button of buttons) {
      expect(button.querySelectorAll('svg')).toHaveLength(1);
    }
  });

  it('orders the groups Measure, Annotate, Mark, Insert, Erase, Move (D149; was UI §6.2 6 -> 1)', () => {
    const view = render(createElement(ToolRail, { activeTool: 'select', onSelectTool: () => {}, side: 'right' }));
    const groups = Array.from(view.container.querySelectorAll<HTMLElement>('.tool-group')).map((g) =>
      Number(g.dataset.group),
    );
    expect(groups).toEqual([2, 4, 3, 5, 6, 1]);
    // …and each group's header is the approved §6.1 copy.
    const headers = Array.from(view.container.querySelectorAll('.tool-group-header')).map(
      (h) => h.textContent,
    );
    expect(headers).toEqual([
      GROUP_HEADERS[2],
      GROUP_HEADERS[4],
      GROUP_HEADERS[3],
      GROUP_HEADERS[5],
      GROUP_HEADERS[6],
      GROUP_HEADERS[1],
    ]);
  });

  it('draws every glyph on the 24 px grid with currentColor only', () => {
    for (const button of railButtons()) {
      const svg = button.querySelector('svg') as SVGSVGElement;
      expect(svg.getAttribute('viewBox'), button.dataset.tool).toBe('0 0 24 24');
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('height')).toBe('24');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      const strokeWidth = Number(svg.getAttribute('strokeWidth') ?? svg.getAttribute('stroke-width'));
      expect(strokeWidth, button.dataset.tool).toBeGreaterThanOrEqual(1.5);
      expect(strokeWidth, button.dataset.tool).toBeLessThanOrEqual(2);
    }
  });

  it('has no <text> node and no hardcoded colour (the placeholder art is gone)', () => {
    for (const button of railButtons()) {
      const svg = button.querySelector('svg') as SVGSVGElement;
      // The old glyphs were a square with a digit in a <text> - the owner saw numbers.
      expect(svg.querySelector('text'), button.dataset.tool).toBeNull();
      expect(svg.querySelectorAll('*').length, button.dataset.tool).toBeGreaterThan(0);
      for (const node of Array.from(svg.querySelectorAll('*'))) {
        for (const attribute of Array.from(node.attributes)) {
          if (attribute.name === 'fill' || attribute.name === 'stroke') {
            expect([undefined, 'none', 'currentColor'], `${button.dataset.tool} ${attribute.name}`).toContain(
              attribute.value,
            );
          }
          expect(attribute.value, `${button.dataset.tool} ${attribute.name}`).not.toMatch(
            /^#[0-9a-fA-F]{3,8}$/,
          );
        }
      }
    }
  });

  it('gives 14 mutually different glyphs (no copy-pasted placeholder remained)', () => {
    const markup = railButtons().map((b) => (b.querySelector('svg') as SVGSVGElement).innerHTML);
    expect(new Set(markup).size).toBe(14);
  });

  it('keeps every rail button accessible-named by its own button (the glyph stays silent)', () => {
    for (const button of railButtons()) {
      const name = button.getAttribute('aria-label') ?? '';
      expect(name.length, String(button.dataset.tool)).toBeGreaterThan(0);
      expect((button.querySelector('svg') as SVGSVGElement).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('carries no inline style attribute anywhere on the rail (CSP-as-a-test)', () => {
    const view = render(createElement(ToolRail, { activeTool: 'select', onSelectTool: () => {}, side: 'right' }));
    expect(view.container.querySelectorAll('[style]').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. §7.2 contextual sections (hidden by CSS, never removed from the DOM)
// ---------------------------------------------------------------------------

const D = DEFAULT_STYLE;

function mountPanel(overrides: Partial<StylePanelProps> = {}) {
  const props: StylePanelProps = {
    tool: 'dimension',
    style: { ...D },
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
  return render(<StylePanel {...props} />);
}

/** The panel's own view of which sections are hidden (the CSS reads this attribute). */
function hiddenSections(): string[] {
  return Array.from(
    screen.getByTestId('style-panel').querySelectorAll<HTMLElement>('.style-panel-section'),
  )
    .filter((section) => section.dataset.hidden === 'true')
    .map((section) => section.dataset.testid ?? '');
}

const ALL_HIDDEN_FOR_SELECT = [
  'style-section-color',
  'style-section-width',
  'style-section-fill',
  'style-section-transparency',
  'style-section-line',
  'style-section-arrows',
  'style-section-text',
  'style-section-precision',
];

describe('style panel - §7.2 is contextual, not a fixed form', () => {
  it('hides every creation section for a tool that creates nothing (Select)', () => {
    mountPanel({
      tool: 'select',
      applicable: {
        strokeColor: false,
        strokeWidthMu: false,
        fillColor: false,
        fillAlpha: false,
        lineStyle: false,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    expect(hiddenSections()).toEqual(ALL_HIDDEN_FOR_SELECT);
  });

  it('hides only the controls the active tool does not use (Rectangle keeps Fill)', () => {
    // The §7.2 Rectangle row: Color, Width, Line style, Fill, Transparency. `applicable`
    // is always the FULL eight-key map in the real shell (`applicableFor`), so the probe
    // spells out the three keys Rectangle leaves out.
    mountPanel({
      tool: 'rect',
      applicable: {
        strokeColor: true,
        strokeWidthMu: true,
        lineStyle: true,
        fillColor: true,
        fillAlpha: true,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    expect(hiddenSections()).toEqual(['style-section-arrows', 'style-section-text', 'style-section-precision']);
  });

  it('keeps hiding inapplicable sections for a HOMOGENEOUS selection', () => {
    // A single-type selection: `applicable` is that type's own tool table, so a Rectangle
    // selection still has no Size control and the panel stays compact.
    mountPanel({
      tool: 'rect',
      selection: 'single',
      selectionCount: 1,
      selectionScope: [{ type: 'rect', count: 1 }],
      applicable: {
        strokeColor: true,
        strokeWidthMu: true,
        lineStyle: true,
        fillColor: true,
        fillAlpha: true,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    expect(hiddenSections()).toEqual([
      'style-section-arrows',
      'style-section-text',
      'style-section-precision',
    ]);
  });

  it('shows EVERY section for a MIXED selection and disables rather than hides (§7.4 #4)', () => {
    // §7.4 #4 is scoped by the spec to a heterogeneous selection: "Text size is disabled
    // because Dimensions aren't text objects". Nothing is hidden there, so the panel cannot
    // jump under the user's finger while they edit a mixed selection.
    mountPanel({
      tool: 'rect',
      selection: 'mixed',
      selectionCount: 3,
      selectionScope: [
        { type: 'text', count: 2 },
        { type: 'rect', count: 1 },
      ],
      applicable: {
        strokeColor: true,
        strokeWidthMu: false,
        fillColor: false,
        fillAlpha: false,
        lineStyle: false,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    expect(hiddenSections()).toEqual([]);
    // …and the inapplicable controls really are disabled, not silently live.
    expect((screen.getByTestId('style-fill-none') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('style-size-range') as HTMLInputElement).disabled).toBe(true);
  });

  it('keeps hidden controls in the DOM (a hidden section is CSS, not a conditional render)', () => {
    mountPanel({
      tool: 'rect',
      applicable: {
        strokeColor: true,
        strokeWidthMu: true,
        lineStyle: true,
        fillColor: true,
        fillAlpha: true,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    // `style-section-text` is hidden …
    expect(hiddenSections()).toContain('style-section-text');
    // … and its controls are still queryable, so no seam or name changed shape.
    expect(screen.getByTestId('style-size-range')).toBeTruthy();
    expect(screen.getByTestId('style-bold')).toBeTruthy();
  });

  it('always shows the Fill picker as one row with the swatches behind the disclosure', () => {
    mountPanel({
      tool: 'rect',
      applicable: {
        strokeColor: true,
        strokeWidthMu: true,
        lineStyle: true,
        fillColor: true,
        fillAlpha: true,
        arrowheads: false,
        fontSizeMu: false,
        bold: false,
      },
    });
    const picker = screen.getByTestId('style-fill-picker');
    expect(picker.dataset.open).toBe('false');
    // The swatches are in the DOM and reachable once the disclosure opens.
    expect(screen.getByTestId('style-fill-swatch-#2ECC71')).toBeTruthy();
  });

  it('paints every palette swatch with its own colour (not twelve grey squares)', () => {
    // Before the paint fix the swatch buttons were empty and every one rendered as the
    // same `--g700` grey: the palette was in the DOM but not on the screen. A CSP-legal
    // SVG `fill` carries the colour, so the assertion is on the attribute, not on layout.
    mountPanel({ tool: 'text' });
    for (const entry of PALETTE) {
      const swatch = screen.getByTestId(`style-swatch-${entry.hex}`);
      expect(swatch.querySelector('rect')?.getAttribute('fill'), entry.hex).toBe(entry.hex);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Density wiring (UI §3.5) - the stored setting actually reaches the chrome
// ---------------------------------------------------------------------------

describe('density - the setting now compacts the editor chrome', () => {
  beforeEach(() => {
    useEditorStore.setState(createInitialEditorState());
    useAppStore.setState(createInitialAppState());
    useStyleByTool.setState(createInitialStyleState());
  });

  function renderLayout(): HTMLElement {
    const view = render(
      createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
    );
    return view.container.querySelector('.editor-layout') as HTMLElement;
  }

  it('defaults to field', () => {
    expect(renderLayout().dataset.density).toBe('field');
  });

  it('mirrors appStore.density onto the layout for the CSS to read', () => {
    useAppStore.setState({ density: 'desk' });
    expect(renderLayout().dataset.density).toBe('desk');
  });

  it('the stylesheet compacts the rail and panel under data-density="desk"', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    // D149 (owner request): one column. Desk is 40 px buttons in a 48 px rail (was 2 x 48 in 108).
    expect(css).toMatch(/\.editor-layout\[data-density='desk'\]\s+\.tool-rail\s*\{[^}]*flex-basis:\s*48px/);
    expect(css).toMatch(/\.editor-layout\[data-density='desk'\]\s+\.tool-grid[\s\S]*?grid-template-columns:\s*40px/);
  });
});
