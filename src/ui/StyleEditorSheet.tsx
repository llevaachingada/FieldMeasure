/**
 * `src/ui/StyleEditorSheet.tsx` — slice 1.8, the deep style editor (implementation plan
 * §1.8 build order 6; UI spec §7.5; build spec §11.5).
 *
 * A 720 × 640 modal over a **60 %** scrim — deliberately not 100 %: the user must still see
 * the photo while choosing a colour for it (§7.5). It provides its own `role="dialog"` /
 * `aria-modal="true"`, a real focus trap and focus return (§19.6), and `Esc` always closes
 * (so it is never a keyboard trap).
 *
 * PROPS: the EXTENDED `StylePanelProps` **minus `tool` / `applicable`**, plus the real
 * `onClose` the pinned set previously lacked. Session 13 replaced the `onOpenEditorSheet`
 * dismissal hack: `Esc`, the `✕` and `Done` all call `onClose`.
 *
 * WHAT IS HERE: the ~48-colour palette grid, a HEX field with HSL sliders, the width ladder
 * with 1:1 live preview strokes, the transparency ramp over a checkerboard, line-style
 * previews at three widths, the arrowhead picker on a sample line, text size/bold with a
 * live `Aa`, `Save as preset…`, the §7.5 folder-unavailable warn strip with `Retry`, and
 * the footer (`Done` + `Reset to defaults`).
 *
 * WHAT IS NOT, AND WHY: the eyedropper's magnified canvas-sampling loupe needs a channel to
 * the photograph (none exists here), and the RGB numeric fields likewise. Reported, not
 * faked.
 *
 * CSP: no `style=""`. The live `Aa` is an SVG `<text>` sized by the `fontSize` PRESENTATION
 * attribute, and every state is a `data-` attribute dressed in `stylePanel.css`.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { X } from 'lucide-react';

import { DEFAULT_STYLE, type AnnotationStyle } from '@/domain/types';

import { STRINGS, t } from './strings';
import {
  DEEP_PALETTE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FOCUSABLE,
  PRECISION_LADDER,
  StrokeSample,
  UNIT_FORMATS,
  WIDTH_LADDER_MU,
  aaFontSize,
  alphaFromTransparencyPercent,
  arrowEnds,
  clampDisplayWidth,
  formatPt,
  hexToHsl,
  hslToHex,
  normalizeHex,
  strokeStyleLabel,
  styleStrings as S,
  transparencyPercent,
  unitFormatLabel,
  type StylePanelProps,
} from './StylePanel';
import './stylePanel.css';

/** `StylePanelProps` minus `tool` / `applicable`, plus the sheet's own dismiss callback. */
export type StyleEditorSheetProps = Omit<StylePanelProps, 'tool' | 'applicable'> & {
  onClose(): void;
};

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const ARROW_OPTIONS = ['none', 'start', 'end', 'both'] as const;
/** "line style previews drawn at three widths" (§7.5). */
const PREVIEW_WIDTHS = [2, 6, 12] as const;

export default function StyleEditorSheet(props: StyleEditorSheetProps): JSX.Element {
  const {
    style,
    selection,
    projectPrecision,
    unitFormat,
    onChange,
    onPrecisionChange,
    onUnitFormatChange,
    presets,
    onSavePreset,
    onApplyPreset,
    onClose,
    presetsUnavailable,
    onRetryPresets,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hexDraft, setHexDraft] = useState(style.strokeColor);
  const [presetDraft, setPresetDraft] = useState('');

  const mixed = selection === 'mixed';

  // Keep the HEX field honest when the colour changes from anywhere else (a slider, a
  // swatch, a preset) — but never mid-typing, so an invalid half-typed value survives.
  useEffect(() => {
    if (normalizeHex(hexDraft) !== style.strokeColor.toUpperCase()) setHexDraft(style.strokeColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the colour only
  }, [style.strokeColor]);

  const dismiss = useCallback((): void => onClose(), [onClose]);

  // ---- Esc closes, always, and the editor's own Esc ladder must not also fire ----------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      // Every focusable in the sheet is a button or an input, so this is exact — and it
      // works in jsdom, where layout-based visibility filters do not (§19.6).
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && root.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [dismiss]);

  // ---- focus in on open, back where it came from on close (§19.6) ----------------------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const hsl = hexToHsl(style.strokeColor);
  const applyHsl = (next: { h?: number; s?: number; l?: number }): void => {
    onChange({
      strokeColor: hslToHex(next.h ?? hsl.h, next.s ?? hsl.s, next.l ?? hsl.l),
    });
  };

  const commitHex = (): void => {
    const normalized = normalizeHex(hexDraft);
    if (normalized === null) return;
    onChange({ strokeColor: normalized });
  };

  const submitPreset = (): void => {
    const name = presetDraft.trim();
    if (name === '') return;
    onSavePreset(name);
    setPresetDraft('');
  };

  return (
    <div className="style-sheet-scrim">
      <div
        ref={rootRef}
        className="style-sheet"
        data-testid="style-editor-sheet"
        data-mixed={mixed ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-label={S.panelLabel}
        tabIndex={-1}
      >
        <header className="style-sheet-header">
          <h2 className="style-sheet-title">{S.panelLabel}</h2>
          <button
            type="button"
            className="style-sheet-close hit-slop"
            data-testid="style-sheet-close"
            data-style-focusable="true"
            aria-label={STRINGS.editor.cancel}
            onClick={dismiss}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{STRINGS.editor.cancel}</span>
          </button>
        </header>

        {/* §7.5: folder unavailable — presets unloadable, edits still work in memory. */}
        {presetsUnavailable ? (
          <div
            className="style-panel-warn style-sheet-warn"
            data-testid="style-sheet-presets-warn"
            role="alert"
          >
            <span className="style-panel-warn-text">{S.presetsError}</span>
            <button
              type="button"
              className="style-panel-warn-retry hit-slop"
              data-testid="style-sheet-presets-retry"
              data-style-focusable="true"
              aria-label={STRINGS.errors.retry}
              onClick={onRetryPresets}
            >
              {STRINGS.errors.retry}
            </button>
          </div>
        ) : null}

        <div className="style-sheet-body">
          {/* ---- palette grid (~48 colours in 4 hue-rows) ------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-palette">
            <h3 className="style-panel-section-title">{S.paletteLabel}</h3>
            <div className="style-sheet-grid" role="group" aria-label={S.paletteLabel}>
              {DEEP_PALETTE.map((row, rowIndex) => (
                <div className="style-sheet-grid-row" key={rowIndex}>
                  {row.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className="style-panel-swatch"
                      data-testid={`style-sheet-swatch-${hex}`}
                      data-style-focusable="true"
                      data-selected={
                        !mixed && style.strokeColor.toUpperCase() === hex.toUpperCase()
                          ? 'true'
                          : 'false'
                      }
                      aria-label={hex}
                      aria-pressed={!mixed && style.strokeColor.toUpperCase() === hex.toUpperCase()}
                      onClick={() => onChange({ strokeColor: hex })}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* ---- custom colour: HEX + HSL sliders -------------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-custom">
            <h3 className="style-panel-section-title">{S.sectionColor}</h3>
            <label className="style-sheet-field">
              <span className="style-sheet-field-label mono">{S.hexLabel}</span>
              <input
                type="text"
                className="style-panel-input mono"
                data-testid="style-sheet-hex"
                data-style-focusable="true"
                aria-label={S.hexLabel}
                spellCheck={false}
                value={hexDraft}
                onChange={(event) => setHexDraft(event.target.value)}
                onBlur={commitHex}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitHex();
                  }
                }}
              />
            </label>
            <label className="style-sheet-field">
              <span className="style-sheet-field-label">{S.hueLabel}</span>
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-sheet-hue"
                data-style-focusable="true"
                aria-label={S.hueLabel}
                min={0}
                max={360}
                step={1}
                value={Math.round(hsl.h)}
                onChange={(event) => applyHsl({ h: Number(event.target.value) })}
              />
            </label>
            <label className="style-sheet-field">
              <span className="style-sheet-field-label">{S.saturationLabel}</span>
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-sheet-saturation"
                data-style-focusable="true"
                aria-label={S.saturationLabel}
                min={0}
                max={100}
                step={1}
                value={Math.round(hsl.s)}
                onChange={(event) => applyHsl({ s: Number(event.target.value) })}
              />
            </label>
            <label className="style-sheet-field">
              <span className="style-sheet-field-label">{S.lightnessLabel}</span>
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-sheet-lightness"
                data-style-focusable="true"
                aria-label={S.lightnessLabel}
                min={0}
                max={100}
                step={1}
                value={Math.round(hsl.l)}
                onChange={(event) => applyHsl({ l: Number(event.target.value) })}
              />
            </label>
          </section>

          {/* ---- width ladder, 1:1 live preview strokes -------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-width-ladder">
            <h3 className="style-panel-section-title">{S.widthLadder}</h3>
            <div className="style-sheet-ladder" role="group" aria-label={S.widthLadder}>
              {WIDTH_LADDER_MU.map((mu) => (
                <button
                  key={mu}
                  type="button"
                  className="style-sheet-ladder-row"
                  data-testid={`style-sheet-width-${mu}`}
                  data-style-focusable="true"
                  aria-label={`${formatPt(mu)} pt`}
                  aria-pressed={!mixed && style.strokeWidthMu === mu}
                  onClick={() => onChange({ strokeWidthMu: mu })}
                >
                  <StrokeSample
                    style={{ ...style, strokeWidthMu: mu, arrowheads: 'none' }}
                    width={clampDisplayWidth(mu)}
                  />
                  <span className="style-sheet-ladder-value mono">{formatPt(mu)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- transparency ramp over a checkerboard --------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-transparency">
            <h3 className="style-panel-section-title">{S.sectionTransparency}</h3>
            <p className="style-panel-readout">
              <span className="style-panel-readout-value mono" data-testid="style-sheet-transparency-value">
                {t(S.transparencyReadout, { percent: transparencyPercent(style.fillAlpha) })}
              </span>
            </p>
            <div className="style-panel-checker">
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-sheet-transparency-range"
                data-style-focusable="true"
                aria-label={S.sectionTransparency}
                min={0}
                max={100}
                step={5}
                value={transparencyPercent(style.fillAlpha)}
                onChange={(event) =>
                  onChange({ fillAlpha: alphaFromTransparencyPercent(Number(event.target.value)) })
                }
              />
            </div>
          </section>

          {/* ---- line style previews at three widths ----------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-line-styles">
            <h3 className="style-panel-section-title">{S.sectionLineStyle}</h3>
            <div className="style-sheet-stack" role="group" aria-label={S.sectionLineStyle}>
              {LINE_STYLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="style-sheet-option"
                  data-testid={`style-sheet-line-${option}`}
                  data-style-focusable="true"
                  aria-label={strokeStyleLabel(option)}
                  aria-pressed={style.lineStyle === option}
                  onClick={() => onChange({ lineStyle: option })}
                >
                  <span className="style-sheet-option-samples">
                    {PREVIEW_WIDTHS.map((width) => (
                      <StrokeSample
                        key={width}
                        style={{ ...style, lineStyle: option, arrowheads: 'none' }}
                        width={width}
                      />
                    ))}
                  </span>
                  <span className="style-sheet-option-name">{strokeStyleLabel(option)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- arrowhead picker on a sample line ------------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-arrowheads">
            <h3 className="style-panel-section-title">{S.sectionArrowheads}</h3>
            <div className="style-sheet-stack" role="group" aria-label={S.sectionArrowheads}>
              {ARROW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="style-sheet-option"
                  data-testid={`style-sheet-arrow-${option}`}
                  data-style-focusable="true"
                  aria-label={arrowLabel(option)}
                  aria-pressed={style.arrowheads === option}
                  onClick={() => onChange({ arrowheads: option })}
                >
                  <StrokeSample style={{ ...style, arrowheads: option }} width={3} />
                  <span className="style-sheet-option-name">{arrowLabel(option)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ---- text size + bold, with a live Aa at true size -------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-text">
            <h3 className="style-panel-section-title">{S.fontSize}</h3>
            <div className="style-sheet-field">
              <span className="style-sheet-field-label">{S.fontSize}</span>
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-sheet-size"
                data-style-focusable="true"
                aria-label={S.fontSize}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={style.fontSizeMu}
                onChange={(event) => onChange({ fontSizeMu: Number(event.target.value) })}
              />
              <span className="style-sheet-ladder-value mono">{style.fontSizeMu}</span>
            </div>
            <div className="style-sheet-aa">
              <svg
                viewBox={`0 0 ${aaFontSize(style.fontSizeMu) * 2 + 8} ${aaFontSize(style.fontSizeMu) + 10}`}
                width={aaFontSize(style.fontSizeMu) * 2 + 8}
                height={aaFontSize(style.fontSizeMu) + 10}
                data-testid="style-sheet-aa"
                role="img"
                aria-label={`${S.fontSize} ${style.fontSizeMu}`}
              >
                <text
                  x={4}
                  y={aaFontSize(style.fontSizeMu) + 2}
                  fontSize={aaFontSize(style.fontSizeMu)}
                  fontWeight={style.bold ? 700 : 400}
                  fill={style.strokeColor}
                >
                  Aa
                </text>
              </svg>
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-sheet-bold"
                data-style-focusable="true"
                aria-label={S.bold}
                aria-pressed={style.bold}
                onClick={() => onChange({ bold: !style.bold })}
              >
                {S.bold}
              </button>
            </div>
          </section>

          {/* ---- presets + save as preset ----------------------------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-presets">
            <h3 className="style-panel-section-title">{S.presetsMenu}</h3>
            {presets.length === 0 ? (
              <p className="style-panel-note">{S.presetsEmpty}</p>
            ) : (
              <ul className="style-panel-preset-list" role="list">
                {presets.map((preset) => (
                  <li key={preset.name}>
                    <button
                      type="button"
                      className="style-panel-preset"
                      data-testid={`style-sheet-preset-${preset.name}`}
                      data-style-focusable="true"
                      aria-label={preset.name}
                      onClick={() => onApplyPreset(preset.name)}
                    >
                      <span className="style-panel-preset-stroke" aria-hidden="true">
                        <StrokeSample style={preset.style} width={3} />
                      </span>
                      <span className="style-panel-preset-name">{preset.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="style-panel-preset-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitPreset();
              }}
            >
              <input
                type="text"
                className="style-panel-input"
                data-testid="style-sheet-preset-name"
                data-style-focusable="true"
                aria-label={S.presetNameLabel}
                value={presetDraft}
                onChange={(event) => setPresetDraft(event.target.value)}
              />
              <button
                type="submit"
                className="style-panel-button"
                data-testid="style-sheet-preset-save"
                data-style-focusable="true"
                aria-label={S.saveAsPreset}
                disabled={presetDraft.trim() === ''}
              >
                {S.saveAsPreset}
              </button>
            </form>
          </section>

          {/* ---- project-level precision + unit format (D31) ---------------- */}
          <section className="style-sheet-section" data-testid="style-sheet-project">
            <h3 className="style-panel-section-title">{S.precision}</h3>
            <div className="style-panel-row style-panel-row--wrap" role="group" aria-label={S.precision}>
              {PRECISION_LADDER.map((denominator) => (
                <button
                  key={denominator}
                  type="button"
                  className="style-panel-chip-option mono"
                  data-testid={`style-sheet-precision-${denominator}`}
                  data-style-focusable="true"
                  aria-label={`1/${denominator}`}
                  aria-pressed={projectPrecision === denominator}
                  onClick={() => onPrecisionChange(denominator)}
                >
                  {`1/${denominator}`}
                </button>
              ))}
            </div>
            <p className="style-panel-note mono" data-testid="style-sheet-project-precision">
              {t(STRINGS.dimension.projectPrecision, { denominator: `1/${projectPrecision}` })}
            </p>
            <div className="style-panel-row" role="group" aria-label={S.unitFormat}>
              {UNIT_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  className="style-panel-chip-option"
                  data-testid={`style-sheet-unit-${format}`}
                  data-style-focusable="true"
                  aria-label={unitFormatLabel(format)}
                  aria-pressed={unitFormat === format}
                  onClick={() => onUnitFormatChange(format)}
                >
                  {unitFormatLabel(format)}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="style-sheet-footer">
          <button
            type="button"
            className="style-sheet-reset"
            data-testid="style-sheet-reset"
            data-style-focusable="true"
            aria-label={S.resetDefaults}
            onClick={() => onChange({ ...DEFAULT_STYLE })}
          >
            {S.resetDefaults}
          </button>
          <button
            type="button"
            className="style-sheet-done"
            data-testid="style-sheet-done"
            data-style-focusable="true"
            aria-label={STRINGS.editor.done}
            onClick={dismiss}
          >
            {STRINGS.editor.done}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local tables (labels come from the shared copy)
// ---------------------------------------------------------------------------

function arrowLabel(arrowheads: AnnotationStyle['arrowheads']): string {
  const ends = arrowEnds(arrowheads);
  if (ends.start && ends.end) return S.arrowBoth;
  if (ends.start) return S.arrowStart;
  if (ends.end) return S.arrowEnd;
  return S.arrowNone;
}
