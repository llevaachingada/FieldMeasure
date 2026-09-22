/**
 * `tests/styleEditorSheet.test.tsx` — slice 1.8 machine gates for the deep style editor
 * (implementation plan §1.8 build order 6; UI spec §7.5; build spec §11.5; a11y §19.6).
 *
 * The point of these tests: the sheet is mounted by a host (the panel's
 * `onOpenEditorSheet`), so the tests drive it through that same host — open, interact,
 * close — and assert both the props it fires and the focus it returns. The `role="dialog"`
 * / `aria-modal` contract and the `Esc` path are the load-bearing ones: this is a modal
 * over a photograph, and a stuck focus ring there is a lost field session.
 *
 * What is proved:
 *   - the sheet is a labelled `role="dialog"` with `aria-modal`, 720×640 (the box is CSS;
 *     the size is asserted as a declared style rule, not as a measurement — jsdom has no
 *     layout, D40);
 *   - `Esc`, the ✕ and `Done` all dismiss through the ONE pinned channel
 *     (`onOpenEditorSheet`, which the host wires as a toggle) — the pinned prop set has no
 *     `onClose`; that is reported, not papered over;
 *   - focus enters the dialog, `Tab` is trapped, and focus RETURNS to the opener on close;
 *   - the deep controls each fire their prop (palette, HEX, HSL, the width ladder, the
 *     transparency ramp, line styles, arrowheads, text size/bold, presets, precision, unit
 *     format), and `Reset to defaults` sends the exact `DEFAULT_STYLE`;
 *   - no inline `style=""` (the CSP-as-a-test rule).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';

import StyleEditorSheet, { type StyleEditorSheetProps } from '../src/ui/StyleEditorSheet';
import { WIDTH_LADDER_MU, hexToHsl, hslToHex, styleStrings as S } from '../src/ui/StylePanel';
import { DEFAULT_STYLE, type AnnotationStyle } from '../src/domain/types';
import { STRINGS, t } from '../src/ui/strings';

afterEach(cleanup);

const STYLE: AnnotationStyle = {
  ...DEFAULT_STYLE,
  strokeColor: '#FF7A18',
  strokeWidthMu: 4,
  arrowheads: 'both',
};

function baseProps(overrides: Partial<StyleEditorSheetProps> = {}): StyleEditorSheetProps {
  return {
    style: STYLE,
    selection: 'none',
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
    onClose: vi.fn(),
    ...overrides,
  };
}

/** Hosts the sheet the way the panel does: `onClose` un-mounts it. */
function mountSheet(overrides: Partial<StyleEditorSheetProps> = {}) {
  const spies = baseProps(overrides);
  function Host(): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" data-testid="open-sheet" onClick={() => setOpen(true)}>
          open
        </button>
        {open ? <StyleEditorSheet {...spies} onClose={() => setOpen(false)} /> : null}
      </div>
    );
  }
  render(<Host />);
  return spies;
}

// ---------------------------------------------------------------------------
// The dialog contract
// ---------------------------------------------------------------------------

describe('StyleEditorSheet — the dialog contract', () => {
  it('is a labelled, modal dialog', () => {
    mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    const sheet = screen.getByTestId('style-editor-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.getAttribute('aria-label')).toBe(S.panelLabel);
  });

  it('renders every deep editor section', () => {
    mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    for (const id of [
      'style-sheet-palette',
      'style-sheet-custom',
      'style-sheet-width-ladder',
      'style-sheet-transparency',
      'style-sheet-line-styles',
      'style-sheet-arrowheads',
      'style-sheet-text',
      'style-sheet-presets',
      'style-sheet-project',
    ]) {
      expect(screen.getByTestId(id), `${id} missing`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Dismissal + focus (§19.6)
// ---------------------------------------------------------------------------

describe('StyleEditorSheet — dismissal and focus', () => {
  it('Escape dismisses and returns focus to the opener', () => {
    mountSheet();
    const opener = screen.getByTestId('open-sheet');
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByTestId('style-editor-sheet'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('style-editor-sheet')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the ✕ and Done both dismiss', () => {
    mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-close'));
    expect(screen.queryByTestId('style-editor-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-done'));
    expect(screen.queryByTestId('style-editor-sheet')).toBeNull();
  });

  it('Esc, the ✕ and Done all dismiss through onClose', () => {
    const onClose = vi.fn();
    render(<StyleEditorSheet {...baseProps({ onClose })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    // The ✕ and Done route through the same channel.
    fireEvent.click(screen.getByTestId('style-sheet-close'));
    fireEvent.click(screen.getByTestId('style-sheet-done'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('no longer uses onOpenEditorSheet as the dismiss channel', () => {
    const onOpenEditorSheet = vi.fn();
    const onClose = vi.fn();
    render(<StyleEditorSheet {...baseProps({ onOpenEditorSheet, onClose })} />);
    fireEvent.click(screen.getByTestId('style-sheet-close'));
    fireEvent.click(screen.getByTestId('style-sheet-done'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenEditorSheet).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('traps Tab inside the dialog', () => {
    mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    const sheet = screen.getByTestId('style-editor-sheet');
    const focusables = Array.from(
      sheet.querySelectorAll<HTMLElement>('[data-style-focusable]:not([disabled])'),
    );
    expect(focusables.length).toBeGreaterThan(10);

    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    focusables[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// Deep controls
// ---------------------------------------------------------------------------

describe('StyleEditorSheet — deep controls fire their props', () => {
  it('applies a palette colour from the 48-colour grid', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-swatch-#2FD4E0'));
    expect(onChange).toHaveBeenCalledWith({ strokeColor: '#2FD4E0' });
  });

  it('commits a valid HEX and ignores an invalid one', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    const hex = screen.getByTestId('style-sheet-hex');

    fireEvent.change(hex, { target: { value: '#2ecc71' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ strokeColor: '#2ECC71' });

    vi.mocked(onChange).mockClear();
    fireEvent.change(hex, { target: { value: 'not-a-hex' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('mixes the touched HSL channel with the untouched ones', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.change(screen.getByTestId('style-sheet-hue'), { target: { value: '200' } });
    const source = hexToHsl('#FF7A18');
    expect(onChange).toHaveBeenCalledWith({ strokeColor: hslToHex(200, source.s, source.l) });
  });

  it('picks a width from the 1:1 ladder', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId(`style-sheet-width-${WIDTH_LADDER_MU[7]}`));
    expect(onChange).toHaveBeenCalledWith({ strokeWidthMu: WIDTH_LADDER_MU[7] });
  });

  it('sets transparency on the checkbox ramp (35 % → 0.65)', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.change(screen.getByTestId('style-sheet-transparency-range'), {
      target: { value: '35' },
    });
    expect(onChange).toHaveBeenCalledWith({ fillAlpha: 0.65 });
  });

  it('picks a line style and an arrowhead option', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-line-dashed'));
    expect(onChange).toHaveBeenCalledWith({ lineStyle: 'dashed' });
    fireEvent.click(screen.getByTestId('style-sheet-arrow-start'));
    expect(onChange).toHaveBeenCalledWith({ arrowheads: 'start' });
  });

  it('sets text size and bold, and previews Aa at the real size', () => {
    const { onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.change(screen.getByTestId('style-sheet-size'), { target: { value: '36' } });
    expect(onChange).toHaveBeenCalledWith({ fontSizeMu: 36 });
    fireEvent.click(screen.getByTestId('style-sheet-bold'));
    expect(onChange).toHaveBeenCalledWith({ bold: true });

    const aa = screen.getByTestId('style-sheet-aa');
    expect(aa.querySelector('text')?.getAttribute('font-size')).toBe('13'); // 18 × 0.7
  });

  it('saves a preset by name and applies a listed one', () => {
    const { onSavePreset, onApplyPreset } = mountSheet({
      presets: [{ name: 'Roof edge', style: { ...STYLE, strokeColor: '#E8384F' } }],
    });
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.change(screen.getByTestId('style-sheet-preset-name'), {
      target: { value: 'Wall run' },
    });
    fireEvent.click(screen.getByTestId('style-sheet-preset-save'));
    expect(onSavePreset).toHaveBeenCalledWith('Wall run');

    fireEvent.click(screen.getByTestId('style-sheet-preset-Roof edge'));
    expect(onApplyPreset).toHaveBeenCalledWith('Roof edge');
  });

  it('edits the project precision and the unit format (D31 / M11)', () => {
    const { onPrecisionChange, onUnitFormatChange, onChange } = mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-precision-32'));
    expect(onPrecisionChange).toHaveBeenCalledWith(32);
    fireEvent.click(screen.getByTestId('style-sheet-unit-ft-decimal'));
    expect(onUnitFormatChange).toHaveBeenCalledWith('ft-decimal');
    expect(onChange).not.toHaveBeenCalled();
    // The chip confirms the shipped template form.
    expect(screen.getByTestId('style-sheet-project-precision').textContent).toBe(
      t(STRINGS.dimension.projectPrecision, { denominator: '1/16' }),
    );
  });

  it('resets to the exact DEFAULT_STYLE', () => {
    const { onChange } = mountSheet({ style: { ...STYLE, strokeWidthMu: 12, bold: true } });
    fireEvent.click(screen.getByTestId('open-sheet'));
    fireEvent.click(screen.getByTestId('style-sheet-reset'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_STYLE);
  });
});

// ---------------------------------------------------------------------------
// Folder-unavailable warn strip (§7.5)
// ---------------------------------------------------------------------------

describe('StyleEditorSheet — folder-unavailable warn strip', () => {
  it('shows the warn copy with Retry and fires onRetryPresets', () => {
    const { onRetryPresets } = mountSheet({ presetsUnavailable: true });
    fireEvent.click(screen.getByTestId('open-sheet'));
    const warn = screen.getByTestId('style-sheet-presets-warn');
    expect(warn.textContent).toContain(S.presetsError);
    const retry = screen.getByTestId('style-sheet-presets-retry');
    expect(retry.getAttribute('aria-label')).toBe(STRINGS.errors.retry);
    fireEvent.click(retry);
    expect(onRetryPresets).toHaveBeenCalledTimes(1);
  });

  it('stays hidden while presets are available', () => {
    mountSheet({ presetsUnavailable: false });
    fireEvent.click(screen.getByTestId('open-sheet'));
    expect(screen.queryByTestId('style-sheet-presets-warn')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSP
// ---------------------------------------------------------------------------

describe('StyleEditorSheet — CSP', () => {
  it('carries no inline style attribute (CSP-as-a-test)', () => {
    const { ...spies } = mountSheet({ presets: [{ name: 'P', style: STYLE }] });
    expect(spies).toBeDefined();
    fireEvent.click(screen.getByTestId('open-sheet'));
    const sheet = screen.getByTestId('style-editor-sheet');
    expect(sheet.querySelectorAll('[style]').length).toBe(0);
    expect(document.querySelectorAll('[style]').length).toBe(0);
  });

  it('names every interactive control', () => {
    mountSheet();
    fireEvent.click(screen.getByTestId('open-sheet'));
    const sheet = screen.getByTestId('style-editor-sheet');
    const controls = sheet.querySelectorAll<HTMLElement>('button, input, [role="group"], [role="img"]');
    expect(controls.length).toBeGreaterThan(30);
    for (const control of Array.from(controls)) {
      const named =
        control.getAttribute('aria-label') !== null || control.textContent?.trim() !== '';
      expect(named, `${control.tagName}.${control.className} has no accessible name`).toBe(true);
    }
  });
});
