/**
 * `src/ui/TextBoxSheet.tsx`: the text-box editor (owner request, session 29, D160). Replaces the
 * single-line text entry: multi-line text plus its look, with a live preview.
 *
 *   - text        : a textarea (Enter is a new line; Ctrl/Cmd+Enter finishes; Esc cancels)
 *   - size        : − / + stepper and S/M/L/XL chips (`fontSizeMu`)
 *   - bold
 *   - text color  : the 12-swatch palette (`strokeColor`)
 *   - background  : None or a palette swatch (`fillColor`, null = none)
 *   - opacity     : the background's opacity, 0–100 % (`fillAlpha`)
 *
 * The preview is SVG (presentation attributes, never `style=""`: the CSP is `style-src 'self'`).
 * The same sheet edits an existing note (the Text tool's tap on a note, or «Edit text»).
 */
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Bold, Minus, Plus } from 'lucide-react';

import type { Annotation, AnnotationStyle } from '@/domain/types';
import { PALETTE, colorName } from './StylePanel';
import { STRINGS } from './strings';
import './textBoxSheet.css';

const C = STRINGS.textBox;

export const TEXT_SIZE_MIN = 8;
export const TEXT_SIZE_MAX = 120;
/** The one-tap sizes (markup units, the same scale as the style panel's size). */
export const TEXT_SIZE_PRESETS = [
  { label: 'S', mu: 14 },
  { label: 'M', mu: 18 },
  { label: 'L', mu: 28 },
  { label: 'XL', mu: 40 },
] as const;

/** One stepper tick: 1 below 20, 2 below 40, 4 above (small sizes need fine steps). */
export function stepTextSize(mu: number, direction: 1 | -1): number {
  const step = mu < 20 ? 1 : mu < 40 ? 2 : 4;
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(mu) + direction * step));
}

/**
 * The editor's starting look for an existing note. A `box` note's style IS its look; an older
 * note (auto / pill / solid / none) is translated to the nearest box so editing it keeps it.
 */
export function textBoxStyleFor(ann: Annotation): AnnotationStyle {
  const style = { ...ann.style };
  if (ann.geometry.kind !== 'text') return style;
  switch (ann.geometry.background) {
    case 'box':
      return style;
    case 'none':
      return { ...style, fillColor: null };
    case 'solid':
      return { ...style, fillColor: style.strokeColor, fillAlpha: 1, strokeColor: '#FFFFFF' };
    default:
      return { ...style, strokeColor: '#FFFFFF', fillColor: '#0B0E12', fillAlpha: 0.85 };
  }
}

export interface TextBoxSheetProps {
  mode: 'new' | 'edit';
  initialText: string;
  initialStyle: AnnotationStyle;
  onCommit: (text: string, style: AnnotationStyle) => void;
  onCancel: () => void;
}

export default function TextBoxSheet({
  mode,
  initialText,
  initialStyle,
  onCommit,
  onCancel,
}: TextBoxSheetProps): JSX.Element {
  const [text, setText] = useState(initialText);
  const [style, setStyle] = useState<AnnotationStyle>({ ...initialStyle });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();
  const patch = (next: Partial<AnnotationStyle>): void => setStyle((s) => ({ ...s, ...next }));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const canCommit = text.trim().length > 0;
  const commit = (): void => {
    if (canCommit) onCommit(text, style);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  };

  const opacityPct = Math.round(style.fillAlpha * 100);

  return (
    <div className="keypad-sheet-mount" data-testid="text-entry">
      <div
        className="text-box-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="text-box-title">
          {mode === 'edit' ? C.titleEdit : C.titleNew}
        </h2>

        <div className="text-box-main">
          <div className="text-box-left">
            <label className="visually-hidden" htmlFor="text-note-input">
              {STRINGS.tool.textNote}
            </label>
            <textarea
              ref={inputRef}
              id="text-note-input"
              className="text-box-input"
              rows={3}
              value={text}
              placeholder={C.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
            <TextPreview text={text || C.placeholder} style={style} />
          </div>

          <div className="text-box-controls">
            <div className="text-box-row">
              <span className="text-box-label">{C.size}</span>
              <button
                type="button"
                className="text-box-icon hit-slop"
                aria-label={C.smaller}
                onClick={() => patch({ fontSizeMu: stepTextSize(style.fontSizeMu, -1) })}
                disabled={style.fontSizeMu <= TEXT_SIZE_MIN}
              >
                <Minus aria-hidden="true" />
              </button>
              <output className="text-box-size mono" data-testid="text-box-size">
                {Math.round(style.fontSizeMu)}
              </output>
              <button
                type="button"
                className="text-box-icon hit-slop"
                aria-label={C.larger}
                onClick={() => patch({ fontSizeMu: stepTextSize(style.fontSizeMu, 1) })}
                disabled={style.fontSizeMu >= TEXT_SIZE_MAX}
              >
                <Plus aria-hidden="true" />
              </button>
              <button
                type="button"
                className="text-box-icon hit-slop"
                aria-label={C.bold}
                aria-pressed={style.bold}
                onClick={() => patch({ bold: !style.bold })}
              >
                <Bold aria-hidden="true" />
              </button>
            </div>
            <div className="text-box-row">
              {TEXT_SIZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="text-box-chip hit-slop"
                  aria-pressed={Math.round(style.fontSizeMu) === p.mu}
                  data-testid={`text-box-size-${p.label}`}
                  onClick={() => patch({ fontSizeMu: p.mu })}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <span className="text-box-label">{C.textColor}</span>
            <SwatchRow
              testId="text-box-color"
              value={style.strokeColor}
              onPick={(hex) => { if (hex) patch({ strokeColor: hex }); }}
            />

            <span className="text-box-label">{C.background}</span>
            <SwatchRow
              testId="text-box-bg"
              value={style.fillColor}
              allowNone
              onPick={(hex) => patch({ fillColor: hex })}
            />

            <label className="text-box-label" htmlFor="text-box-opacity">
              {C.opacity}
              <span className="mono text-box-pct">{`${opacityPct}%`}</span>
            </label>
            <input
              id="text-box-opacity"
              className="text-box-range"
              type="range"
              min={0}
              max={100}
              step={5}
              value={opacityPct}
              disabled={style.fillColor === null}
              onChange={(e) => patch({ fillAlpha: Number(e.target.value) / 100 })}
            />
          </div>
        </div>

        <div className="text-entry-actions">
          <button type="button" className="btn btn-secondary hit-slop" onClick={onCancel}>
            {STRINGS.editor.cancel}
          </button>
          <button
            type="button"
            className="btn btn-primary hit-slop"
            onClick={commit}
            disabled={!canCommit}
            data-testid="text-box-done"
          >
            {STRINGS.editor.done}
          </button>
        </div>
      </div>
    </div>
  );
}

function SwatchRow({
  value,
  onPick,
  allowNone = false,
  testId,
}: {
  value: string | null;
  onPick: (hex: string | null) => void;
  allowNone?: boolean;
  testId: string;
}): JSX.Element {
  const same = (hex: string): boolean => value !== null && value.toUpperCase() === hex.toUpperCase();
  return (
    <div className="text-box-swatches" role="group">
      {allowNone ? (
        <button
          type="button"
          className="text-box-swatch text-box-swatch-none hit-slop"
          aria-label={C.none}
          aria-pressed={value === null}
          data-testid={`${testId}-none`}
          onClick={() => onPick(null)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      ) : null}
      {PALETTE.map((entry) => (
        <button
          key={entry.hex}
          type="button"
          className="text-box-swatch hit-slop"
          aria-label={colorName(entry.hex)}
          aria-pressed={same(entry.hex)}
          data-testid={`${testId}-${entry.hex.slice(1)}`}
          onClick={() => onPick(entry.hex)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="4" fill={entry.hex} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** The note as it will look (box, colours, opacity, weight, line breaks), at a fixed scale. */
function TextPreview({ text, style }: { text: string; style: AnnotationStyle }): JSX.Element {
  const lines = text.split('\n').slice(0, 6);
  const font = Math.min(40, Math.max(12, style.fontSizeMu));
  const lineH = font * 1.2;
  const pad = Math.max(4, font * 0.35);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const w = Math.min(560, longest * font * 0.58 + pad * 2);
  const h = lines.length * lineH + pad * 2;
  return (
    <div className="text-box-preview" aria-label={C.preview} role="img" data-testid="text-box-preview">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="xMinYMin meet">
        {style.fillColor ? (
          <rect width={w} height={h} rx="4" fill={style.fillColor} fillOpacity={style.fillAlpha} />
        ) : null}
        <text
          fill={style.strokeColor}
          fontSize={font}
          fontWeight={style.bold ? 700 : 400}
          fontFamily="Inter, Archivo, sans-serif"
        >
          {lines.map((line, i) => (
            <tspan key={i} x={pad} y={pad + font * 0.9 + i * lineH}>
              {line || ' '}
            </tspan>
          ))}
        </text>
      </svg>
    </div>
  );
}
