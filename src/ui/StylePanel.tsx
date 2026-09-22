/**
 * `src/ui/StylePanel.tsx` — slice 1.8, the style panel + the always-visible Style Chip
 * (implementation plan §1.8 build order 2–5; UI spec §7; build spec §11.5/§11.6/§11.7).
 *
 * PROPS-DRIVEN AND STANDALONE. Every value arrives as a prop (handoff Part C, "Lane split"):
 * this file **never reads a store**, never touches the scene, and never writes project
 * state. That is the whole point of the pinned seam — lane C1 owns the state and the
 * presets IO; the orchestrator wires the two at integration.
 *
 * ONE narrowing of that rule, made deliberately after integration (session-14 review,
 * finding 7): the file imports exactly one thing from `@/state/styleByTool` — the pure
 * `TOOL_FOR_TYPE` data constant — because the scope chip's labels and `EditorLayout`'s
 * applicability intersection are two halves of ONE map and had been duplicated byte-for-byte
 * with nothing enforcing agreement. It is a constant, not a hook: no store is read,
 * subscribed to, or written here, and the rest of the seam is unchanged.
 *
 * NON-NEGOTIABLES THIS FILE IS BUILT AROUND
 *  - **The Style Chip is a "do not simplify" item (§11.6 #4).** It is always visible and it
 *    renders a real 96×40 SVG of the *actual next stroke* — real color, real width (clamped
 *    1–20 for display), real dash, real arrowheads, real fill + transparency, and `Aa` at
 *    the real text size/weight. It is never a colored dot and never a text stand-in.
 *  - **Mixed is INDETERMINATE, never a guess (§7.4 #2).** With `selection: 'mixed'` the
 *    chip draws a hatched placeholder (no color is invented), the readouts show `—`, no
 *    swatch reads as pressed, and the state is ANNOUNCED, not merely drawn.
 *  - **Disabled, never hidden (§7.4 #4 / §11.6 #5).** A control whose `applicable[key]` is
 *    `false` stays in the layout, is `disabled`, and keeps an accessible name that says WHY.
 *    Hiding it would make the panel jump and destroy muscle memory.
 *  - **D31: nothing here edits project precision implicitly.** `onPrecisionChange` is called
 *    ONLY by the Precision control (and only while the Dimension tool is active). This file
 *    contains no other path to the project value; it never writes it.
 *  - **CSP-as-a-test.** No `style=""` anywhere: per-state visuals are carried by `data-`
 *    attributes and SVG *presentation attributes*, dressed in `stylePanel.css`.
 *
 * DELIBERATE, REPORTED SCOPE NOTES (do not read these as spec silence)
 *  1. (session 13) The pinned props were **EXTENDED** — `selectionCount`, `selectionScope`,
 *     `applyToSelection`, `recents`, `presetsUnavailable`, `appliedToCount` and the five
 *     callbacks — so the §7.4 selection bar (count + `✕ Deselect`), the synchronous-mode
 *     toggle, the scope chip, the §7.3 Recents row, the applied-to hint and the §7.5 warn
 *     strip are all rendered here now. The shape is pinned in `StylePanelProps` below.
 *  2. The scope chip's type labels reuse the corresponding `tool.*` names via a
 *     `AnnotationType → ToolId` map (`scopeTypeCounts`): the appendices key no
 *     `annotationType.*` copy, and the §7.4 example types (`Text`, `Dimension`) are exactly
 *     the tools that create them. No wording is invented.
 *  3. `lineStyle`/`arrowheads`/`fill`/`fontSize`/`bold` are the only per-control style keys
 *     `AnnotationStyle` carries. Tool-specific controls outside that set (corner radius,
 *     sides, arc radius, chisel width, erase mode/scope, inset border/crop) have no data
 *     channel in this seam and are owed.
 *  4. The chip's tap toggles the panel body (the spec's "tap = expand", read in reverse for
 *     a panel that is mounted expanded). The long-press "compact popover" has no prop.
 *  5. The width scrubber's *track* cannot render the live preview: a CSS gradient would need
 *     an inline `style=""`, which the CSP test forbids. The live preview is a real SVG strip
 *     beside the scrubber instead — same information, no prohibited attribute.
 */

import { useId, useState, type JSX, type ReactNode } from 'react';
import { Bold as BoldIcon, Contrast, Minus, Plus, X } from 'lucide-react';

import { type AnnotationStyle, type AnnotationType } from '@/domain/types';
import { VALID_DENOMINATORS } from '@/domain/units';
// The ONLY import from the state module, and it is a frozen data constant, not a store:
// `TOOL_FOR_TYPE` must be shared with `EditorLayout` or the two halves of the panel can
// disagree (finding 7). No hook, no `useStyleByTool`, nothing subscribed. See the header.
import { TOOL_FOR_TYPE } from '@/state/styleByTool';
import { toolDefById, type ToolId } from '@/ui/ToolRail';

import { STRINGS, fractionLabel, t } from './strings';
import './stylePanel.css';

// ---------------------------------------------------------------------------
// Pinned interface — the orchestrator mounts against EXACTLY this shape.
// ---------------------------------------------------------------------------

/** §7.4 #3 scope chip: one annotation type and how many of it are selected. */
export type StyleScope = { type: AnnotationType; count: number };

export interface StylePanelProps {
  // ---- pinned (handoff-session-11), unchanged ----
  tool: ToolId;
  /** The style the next stroke will use (per-tool memory). */
  style: AnnotationStyle;
  /** Selection state: 'none' | 'single' | 'mixed'. Mixed renders INDETERMINATE, never a guess. */
  selection: 'none' | 'single' | 'mixed';
  /** Per-control applicability; a control that does not apply is DISABLED, never hidden. */
  applicable: Partial<Record<keyof AnnotationStyle, boolean>>;
  projectPrecision: number; // the ONE place precision is edited (D31)
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  onChange(patch: Partial<AnnotationStyle>): void;
  onPrecisionChange(denominator: number): void;
  onUnitFormatChange(format: 'ft-in' | 'in' | 'ft-decimal'): void;
  onOpenEditorSheet(): void;
  presets: Array<{ name: string; style: AnnotationStyle }>;
  onSavePreset(name: string): void;
  onApplyPreset(name: string): void;
  // ---- EXTENDED (session 13) ----
  /** §7.1 #4 / §7.4 #1: «3 selected» / «3 objects selected». 0 = no selection. */
  selectionCount: number;
  /** §7.4 #3: the composition of a heterogeneous selection. */
  selectionScope: StyleScope[];
  /** §7.4 #3: synchronous mode, default ON. */
  applyToSelection: boolean;
  /** §7.3 Recents row: ≤8 style objects, newest first. */
  recents: AnnotationStyle[];
  /** §7.5: the project folder became unavailable, so presets cannot be loaded. */
  presetsUnavailable: boolean;
  /** §7.3 hint «Applied to 3 objects»; `null` hides it. */
  appliedToCount: number | null;
  onApplyRecent(style: AnnotationStyle): void;
  onToggleApplyToSelection(next: boolean): void;
  /** §7.3 «Also set as default for this tool». */
  onAlsoSetDefault(): void;
  /** §7.4 #1 «✕ Deselect». */
  onDeselect(): void;
  /** §7.5 «Retry». */
  onRetryPresets(): void;
}

// ---------------------------------------------------------------------------
// Copy: the slice-1.8 rows are folded into `STRINGS` (strings.ts is the ONE place
// user-visible text lives). `styleCopy.ts` was the staging module and is deleted.
// ---------------------------------------------------------------------------

const S = STRINGS.style;

/** `project.*` rows the chip's selection label reads. */
const P = STRINGS.project;

/**
 * The copy tables — exported so the deep editor and the tests read exactly what the panel
 * renders.
 */
export { S as styleStrings };
export { P as projectStrings };

// ---------------------------------------------------------------------------
// Pure helpers (exported so the machine gates can EXECUTE them, not read them)
// ---------------------------------------------------------------------------

export type StyleKey = keyof AnnotationStyle;

/**
 * The stored width ladder (UI §7.3). Storage stays in markup units; the readout shows true
 * paper points, `pt = 0.75 × mu` (§4.2). 4 mu → 4 × 0.75 = 3 pt ("so 4 mu reads «3 pt»").
 */
export const WIDTH_LADDER_MU = [1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 48] as const;

/** §4.2: points = markup units × 0.75. */
export const WIDTH_PT_PER_MU = 0.75;

/** §7.1 #2: the chip's display width is the real width clamped 1–20. */
export const DISPLAY_WIDTH_MIN = 1;
export const DISPLAY_WIDTH_MAX = 20;

/** UI §8.5: the text size range (10–72). */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 72;

/** UI §7.2: precision `1/16`→`1"` — the domain's own denominator enum (units.ts). */
export const PRECISION_LADDER: readonly number[] = VALID_DENOMINATORS;

/** The three unit formats (M11). */
export const UNIT_FORMATS = ['ft-in', 'in', 'ft-decimal'] as const;

/** Clamp a style width to what the 96×40 chip can honestly draw (1–20). */
export function clampDisplayWidth(mu: number): number {
  if (!Number.isFinite(mu)) return DISPLAY_WIDTH_MIN;
  return Math.max(DISPLAY_WIDTH_MIN, Math.min(DISPLAY_WIDTH_MAX, Math.round(mu)));
}

/** `4` → `3` (4 mu × 0.75 = 3 pt). */
export function muToPt(mu: number): number {
  return Math.round(mu * WIDTH_PT_PER_MU * 100) / 100;
}

/** The readout string: 1 → "0.75", 4 → "3", 3 → "2.25" (no trailing zeros). */
export function formatPt(mu: number): string {
  return String(muToPt(mu));
}

/** The ladder index closest to a stored mu value (a hand-edited 5 mu still lands somewhere). */
export function nearestLadderIndex(mu: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  WIDTH_LADDER_MU.forEach((value, index) => {
    const distance = Math.abs(value - mu);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** `[` / `]` and the −/+ steppers: one ladder position, clamped to the ends. */
export function stepWidthMu(mu: number, direction: 1 | -1): number {
  const index = nearestLadderIndex(mu);
  const next = Math.max(0, Math.min(WIDTH_LADDER_MU.length - 1, index + direction));
  return WIDTH_LADDER_MU[next];
}

/** The §11.5 line-style samples. `solid` has no dash attribute at all. */
export function dashArrayFor(lineStyle: AnnotationStyle['lineStyle']): string | undefined {
  if (lineStyle === 'dashed') return '10 6';
  if (lineStyle === 'dotted') return '2 6';
  return undefined;
}

/** `none | start | end | both` → the two ends that carry an arrowhead (§11.5). */
export function arrowEnds(arrowheads: AnnotationStyle['arrowheads']): {
  start: boolean;
  end: boolean;
} {
  return {
    start: arrowheads === 'start' || arrowheads === 'both',
    end: arrowheads === 'end' || arrowheads === 'both',
  };
}

/**
 * The chip's `Aa` size: 18 mu → 18 × 0.7 = 12.6 → 13 px, clamped to 10–22 so a 72 mu text
 * size still fits a 40 px-tall chip without clipping.
 */
export function aaFontSize(mu: number): number {
  if (!Number.isFinite(mu)) return FONT_SIZE_MIN;
  return Math.max(10, Math.min(22, Math.round(mu * 0.7)));
}

/** Transparency is the INVERSE of the stored alpha (fillAlpha is opacity, renderShape.ts:101). */
export function transparencyPercent(fillAlpha: number): number {
  const alpha = Math.max(0, Math.min(1, fillAlpha));
  // fillAlpha 0.65 → (1 − 0.65) × 100 = 35 % transparency (the UI §7.2 example).
  return Math.round((1 - alpha) * 100);
}

/** The inverse of `transparencyPercent`, rounded to 2 dp so the stored alpha is stable. */
export function alphaFromTransparencyPercent(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return Math.round((1 - clamped / 100) * 100) / 100;
}

// ── colour maths (pure; no canvas, no DOM) ─────────────────────────────────

export function normalizeHex(input: string): string | null {
  const body = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(body)) return null;
  return `#${body.toUpperCase()}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex) ?? '#000000';
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function channelHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

/**
 * Standard HSL conversion — the deep editor's sliders and the contrast nudge both use it.
 * Unrounded on purpose: the sliders round at their own boundary, so moving one channel
 * never drifts the other two.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  const sector = Math.floor(hn / 60) % 6;
  const [r1, g1, b1] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector];
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/**
 * "Nudge for contrast" (P §11.5). Deterministic and photo-free: a dark colour is
 * lightened 22 percentage points of HSL lightness, a light colour is darkened 22. 18 % L
 * → 40 % L; 82 % L → 60 % L. (The eyedropper half of the control samples the canvas and
 * needs a prop this seam does not carry — reported.)
 */
export function nudgeForContrast(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return l < 50 ? hslToHex(h, s, Math.min(100, l + 22)) : hslToHex(h, s, Math.max(0, l - 22));
}

// ── the palette (P §11.7, ordered for real-photo visibility) ────────────────

export const PALETTE = [
  { hex: '#FF7A18', nameKey: 'swatchHiVisOrange' },
  { hex: '#FFD400', nameKey: 'swatchSafetyYellow' },
  { hex: '#E8384F', nameKey: 'swatchSignalRed' },
  { hex: '#FF3D9A', nameKey: 'swatchMagenta' },
  { hex: '#2FD4E0', nameKey: 'swatchCyan' },
  { hex: '#35A7FF', nameKey: 'swatchSky' },
  { hex: '#2ECC71', nameKey: 'swatchGreen' },
  { hex: '#A8E05F', nameKey: 'swatchLime' },
  { hex: '#FFFFFF', nameKey: 'swatchWhite' },
  { hex: '#000000', nameKey: 'swatchBlack' },
  { hex: '#9AA6B2', nameKey: 'swatchConcrete' },
  { hex: '#123B6B', nameKey: 'swatchDeepNavy' },
] as const;

export type SwatchNameKey = (typeof PALETTE)[number]['nameKey'];

/** The deep editor's ~48 colours in 4 hue-rows (UI §7.5): palette, warm, cool, neutral. */
export const DEEP_PALETTE: ReadonlyArray<ReadonlyArray<string>> = [
  PALETTE.map((entry) => entry.hex),
  [
    '#FFE0CC', '#FFC299', '#FFA366', '#FF8533', '#E86A00', '#C24F00',
    '#FFD9D9', '#FFB3B3', '#FF8080', '#E64D4D', '#FFB3D1', '#FF80B3',
  ],
  [
    '#CCF2FF', '#99E5FF', '#66D9FF', '#33CCFF', '#00A6E6', '#0077B3',
    '#D9FFE6', '#B3FFD1', '#80FFB3', '#4DE68C', '#CCFFCC', '#99FF99',
  ],
  [
    '#FFFFFF', '#F2F5F8', '#E2E8EE', '#C9D3DC', '#9AA6B2', '#6E7F8E',
    '#4A5866', '#2B3540', '#1E262F', '#12181E', '#0E1318', '#000000',
  ],
];

/** The accessible + visible name of a swatch (the 12-palette names, P §11.7). */
export function swatchLabel(nameKey: SwatchNameKey): string {
  return S[nameKey];
}

function colorName(hex: string): string {
  const match = PALETTE.find((entry) => entry.hex.toUpperCase() === hex.toUpperCase());
  return match ? S[match.nameKey] : hex.toUpperCase();
}

/** The §11.5 line-style option name; exported so the deep editor shares one definition. */
export function strokeStyleLabel(lineStyle: AnnotationStyle['lineStyle']): string {
  if (lineStyle === 'dashed') return S.lineStyleDashed;
  if (lineStyle === 'dotted') return S.lineStyleDotted;
  return S.lineStyleSolid;
}

function arrowheadsLabel(arrowheads: AnnotationStyle['arrowheads']): string {
  if (arrowheads === 'start') return S.arrowStart;
  if (arrowheads === 'end') return S.arrowEnd;
  if (arrowheads === 'both') return S.arrowBoth;
  return S.arrowNone;
}

/** The Style Chip / Recents accessible description of a real style (`style.chipStyleLabel`). */
export function describeStyle(style: AnnotationStyle): string {
  return t(S.chipStyleLabel, {
    color: colorName(style.strokeColor),
    widthPt: formatPt(style.strokeWidthMu),
    lineStyle: strokeStyleLabel(style.lineStyle),
    arrowheads: arrowheadsLabel(style.arrowheads),
  });
}

/**
 * `«Text note (2) · Dimension (1)»` — the `{typeCounts}` fragment of the §7.4 #3 scope chip.
 *
 * The `AnnotationType → ToolId` map is `TOOL_FOR_TYPE`, imported from
 * `@/state/styleByTool` — the SAME object `EditorLayout.applicabilityForSelection` reads.
 * This file used to carry a private byte-identical copy called `TYPE_TOOL`; nothing
 * enforced the two, so the chip's label and the panel's applicability could disagree with
 * every gate green (session-14 review, finding 7).
 */
export function scopeTypeCounts(scopes: ReadonlyArray<StyleScope>): string {
  return scopes
    .map(
      (scope) => `${toolDefById(TOOL_FOR_TYPE[scope.type])?.label ?? scope.type} (${scope.count})`,
    )
    .join(' · ');
}

/** The tool's own name for the chip label (`TOOL_DEFS`, whose labels come from `tool.*`). */
function toolName(tool: ToolId): string {
  return toolDefById(tool)?.label ?? '';
}

/** The tools whose marks carry a value, so the chip shows the `ft-in` sub-label (§7.1 #3). */
const VALUES_TOOLS: ReadonlyArray<ToolId> = ['dimension', 'angle'];

// ---------------------------------------------------------------------------
// Samples + the chip SVG
// ---------------------------------------------------------------------------

/**
 * A real, live stroke sample. Used by the width preview, the line-style buttons and the
 * deep editor's ladder — same color, same dash, same arrowheads, at the given width.
 */
export function StrokeSample({
  style,
  width,
  className,
  testid,
}: {
  style: AnnotationStyle;
  width: number;
  className?: string;
  testid?: string;
}): JSX.Element {
  const height = Math.max(12, Math.round(width) + 8);
  const mid = height / 2;
  const dash = dashArrayFor(style.lineStyle);
  const ends = arrowEnds(style.arrowheads);
  const x1 = ends.start ? 16 : 8;
  const x2 = ends.end ? 104 : 112;
  return (
    <svg
      className={className}
      data-testid={testid}
      viewBox={`0 0 120 ${height}`}
      width="120"
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      {style.fillColor !== null ? (
        <rect
          x={20}
          y={2}
          width={80}
          height={height - 4}
          rx={3}
          fill={style.fillColor}
          fillOpacity={style.fillAlpha}
        />
      ) : null}
      <line
        x1={x1}
        y1={mid}
        x2={x2}
        y2={mid}
        stroke={style.strokeColor}
        strokeWidth={Math.max(1, Math.round(width))}
        strokeDasharray={dash}
        strokeLinecap={style.lineStyle === 'dotted' ? 'round' : 'butt'}
      />
      {ends.start ? (
        <polygon
          points={`${x1},${mid} ${x1 + 10},${mid - 6} ${x1 + 10},${mid + 6}`}
          fill={style.strokeColor}
        />
      ) : null}
      {ends.end ? (
        <polygon
          points={`${x2},${mid} ${x2 - 10},${mid - 6} ${x2 - 10},${mid + 6}`}
          fill={style.strokeColor}
        />
      ) : null}
    </svg>
  );
}

/**
 * The Style Chip's 96 × 40 WYSIWYG render (§7.1 #2, §11.6 #4).
 *
 * `mixed` is INDETERMINATE: it draws a hatch and invents no colour and no width. Its
 * accessible name says so, so the state is announced, not merely drawn.
 */
export function StyleChipSvg({
  style,
  mixed,
  descriptor,
}: {
  style: AnnotationStyle;
  mixed: boolean;
  /** The accessible description of the real style (built by the caller from copy). */
  descriptor: string;
}): JSX.Element {
  const rawId = useId();
  // React 19's `useId` may contain non-identifier delimiters (`:r0:` in 18, `«r0»` in 19);
  // an SVG fragment id must be punctuation-free for `url(#…)` to resolve everywhere.
  const hatchId = `fm-chip-hatch-${rawId.replace(/[^A-Za-z0-9_-]/g, '') || 'x'}`;

  if (mixed) {
    return (
      <svg
        className="style-panel-chip-svg"
        data-testid="style-chip-svg"
        data-mixed="true"
        viewBox="0 0 96 40"
        width={96}
        height={40}
        role="img"
        aria-label={S.mixedValue}
      >
        <defs>
          <pattern
            id={hatchId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="#2B3540" />
            <rect width="4" height="8" fill="#3A4652" />
          </pattern>
        </defs>
        <rect x="4" y="4" width="88" height="32" rx="6" fill={`url(#${hatchId})`} />
      </svg>
    );
  }

  const width = clampDisplayWidth(style.strokeWidthMu);
  const dash = dashArrayFor(style.lineStyle);
  const ends = arrowEnds(style.arrowheads);
  const size = aaFontSize(style.fontSizeMu);

  return (
    <svg
      className="style-panel-chip-svg"
      data-testid="style-chip-svg"
      data-mixed="false"
      viewBox="0 0 96 40"
      width={96}
      height={40}
      role="img"
      aria-label={descriptor}
    >
      {style.fillColor !== null ? (
        <rect
          x="6"
          y="7"
          width="58"
          height="26"
          rx="4"
          fill={style.fillColor}
          fillOpacity={style.fillAlpha}
        />
      ) : null}
      <line
        data-testid="style-chip-stroke"
        x1="8"
        y1="20"
        x2="64"
        y2="20"
        stroke={style.strokeColor}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={style.lineStyle === 'dotted' ? 'round' : 'butt'}
      />
      {ends.start ? <polygon points="8,20 17,15 17,25" fill={style.strokeColor} /> : null}
      {ends.end ? <polygon points="64,20 55,15 55,25" fill={style.strokeColor} /> : null}
      <text
        data-testid="style-chip-aa"
        x="70"
        y="30"
        fontSize={size}
        fontWeight={style.bold ? 700 : 400}
        fill={style.strokeColor}
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
      >
        Aa
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="style-panel-section" data-testid={testid}>
      <h3 className="style-panel-section-title">{title}</h3>
      {children}
    </section>
  );
}

interface SwatchListProps {
  colors: ReadonlyArray<{ hex: string; label: string }>;
  selectedHex: string | null;
  mixed: boolean;
  disabled: boolean;
  disabledLabel: string | undefined;
  groupLabel: string;
  onPick(hex: string): void;
  testidPrefix: string;
}

function SwatchList({
  colors,
  selectedHex,
  mixed,
  disabled,
  disabledLabel,
  groupLabel,
  onPick,
  testidPrefix,
}: SwatchListProps): JSX.Element {
  return (
    <div className="style-panel-swatches" role="group" aria-label={groupLabel}>
      {colors.map((entry) => {
        const pressed = !mixed && selectedHex?.toUpperCase() === entry.hex.toUpperCase();
        return (
          <button
            key={entry.hex}
            type="button"
            className="style-panel-swatch"
            data-testid={`${testidPrefix}-${entry.hex}`}
            data-selected={pressed ? 'true' : 'false'}
            aria-label={disabled && disabledLabel ? `${entry.label}. ${disabledLabel}` : entry.label}
            aria-pressed={pressed}
            title={disabled && disabledLabel ? disabledLabel : entry.label}
            disabled={disabled}
            onClick={() => onPick(entry.hex)}
          />
        );
      })}
      {mixed ? (
        <span
          className="style-panel-swatch style-panel-swatch--mixed"
          data-testid={`${testidPrefix}-mixed`}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

/** The deep editor's focus trap query — every control here is a button/input. */
export const FOCUSABLE = '[data-style-focusable]:not([disabled])';

export default function StylePanel({
  tool,
  style,
  selection,
  applicable,
  projectPrecision,
  unitFormat,
  onChange,
  onPrecisionChange,
  onUnitFormatChange,
  onOpenEditorSheet,
  presets,
  onSavePreset,
  onApplyPreset,
  selectionCount,
  selectionScope,
  applyToSelection,
  recents,
  presetsUnavailable,
  appliedToCount,
  onApplyRecent,
  onToggleApplyToSelection,
  onAlsoSetDefault,
  onDeselect,
  onRetryPresets,
}: StylePanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetDraft, setPresetDraft] = useState('');

  const mixed = selection === 'mixed';
  const hasSelection = selectionCount > 0;
  const def = toolDefById(tool);
  const Icon = def?.Icon;
  const isValueTool = VALUES_TOOLS.includes(tool);
  const precisionApplies = tool === 'dimension';

  const notApplicable = (key: StyleKey): boolean => applicable[key] === false;
  const baseReason = mixed ? S.disabledForSelection : S.disabledForTool;
  /** The accessible name: the control's own name, plus WHY when it is disabled. */
  const nameFor = (label: string, key: StyleKey): string =>
    notApplicable(key) ? `${label}. ${baseReason}` : label;
  /** The project-level cluster is gated by TOOL, not by an `AnnotationStyle` key. */
  const projectNameFor = (label: string): string =>
    precisionApplies ? label : `${label}. ${S.precisionDimensionOnly}`;
  const titleFor = (key: StyleKey, fallback: string): string =>
    notApplicable(key) ? baseReason : fallback;

  const widthIndex = nearestLadderIndex(style.strokeWidthMu);
  const descriptor = describeStyle(style);

  /** §7.4 #1: the visible header and the announced status share one string. */
  const selectionHeaderText = t(S.selectionHeader, { objectCount: selectionCount });
  const chipLabel = mixed
    ? S.mixedValue
    : hasSelection
      ? t(P.selectionCount, { count: selectionCount })
      : toolName(tool);
  /** §7.4 #3: only a heterogeneous selection shows the scope chip. */
  const scopeChip =
    selectionScope.length > 1
      ? t(S.applyToScope, { typeCounts: scopeTypeCounts(selectionScope) })
      : null;

  const submitPreset = (): void => {
    const name = presetDraft.trim();
    if (name === '') return;
    onSavePreset(name);
    setPresetDraft('');
    setPresetOpen(false);
  };

  return (
    <aside
      className="style-panel"
      data-testid="style-panel"
      data-expanded={expanded ? 'true' : 'false'}
      data-mixed={mixed ? 'true' : 'false'}
      data-selection={selection}
      data-tool={tool}
      aria-label={S.panelLabel}
    >
      <header className="style-panel-header">
        {/* ALWAYS VISIBLE (§11.6 #4). Tap toggles the body. */}
        <button
          type="button"
          className="style-panel-chip"
          data-testid="style-chip"
          data-style-focusable="true"
          aria-label={`${STRINGS.editor.styleChip}: ${chipLabel}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="style-panel-chip-icon" aria-hidden="true">
            {Icon ? <Icon /> : null}
          </span>
          <StyleChipSvg style={style} mixed={mixed} descriptor={descriptor} />
          <span className="style-panel-chip-text">
            <span className="style-panel-chip-name">{chipLabel}</span>
            {isValueTool ? (
              <span className="style-panel-chip-unit mono">{STRINGS.dimension.unitFtIn}</span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          className="style-panel-more"
          data-testid="style-more"
          data-style-focusable="true"
          aria-label={S.moreStyles}
          onClick={onOpenEditorSheet}
        >
          {S.moreStyles}
        </button>
      </header>

      {/* §7.4 #1/#3: selection mode — count, Deselect, synchronous toggle, scope chip. */}
      {hasSelection ? (
        <div
          className="style-panel-selection"
          data-testid="style-selection-bar"
          role="group"
          aria-label={selectionHeaderText}
        >
          <span className="style-panel-selection-header" data-testid="style-selection-header">
            {selectionHeaderText}
          </span>
          <div className="style-panel-selection-actions">
            <button
              type="button"
              className="style-panel-deselect hit-slop"
              data-testid="style-deselect"
              data-style-focusable="true"
              aria-label={S.deselect}
              onClick={onDeselect}
            >
              <X aria-hidden="true" />
              <span>{S.deselect}</span>
            </button>
            <button
              type="button"
              className="style-panel-toggle hit-slop"
              data-testid="style-apply-to-selection"
              data-style-focusable="true"
              aria-label={S.applyToSelection}
              aria-pressed={applyToSelection}
              onClick={() => onToggleApplyToSelection(!applyToSelection)}
            >
              {S.applyToSelection}
            </button>
          </div>
          {scopeChip !== null ? (
            <p className="style-panel-scope mono" data-testid="style-scope-chip" role="status">
              {scopeChip}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* §7.3: transient apply hint + «Also set as default for this tool». */}
      {appliedToCount !== null ? (
        <div
          className="style-panel-applied"
          data-testid="style-applied-hint"
          role="status"
          aria-live="polite"
        >
          <span className="style-panel-applied-text">
            {t(S.appliedToSelection, { objectCount: appliedToCount })}
          </span>
          <button
            type="button"
            className="style-panel-link hit-slop"
            data-testid="style-also-default"
            data-style-focusable="true"
            aria-label={S.alsoSetDefault}
            onClick={onAlsoSetDefault}
          >
            {S.alsoSetDefault}
          </button>
        </div>
      ) : null}

      {/* §7.5: the project folder is unavailable — presets cannot be loaded. */}
      {presetsUnavailable ? (
        <div className="style-panel-warn" data-testid="style-presets-warn" role="alert">
          <span className="style-panel-warn-text">{S.presetsError}</span>
          <button
            type="button"
            className="style-panel-warn-retry hit-slop"
            data-testid="style-presets-retry"
            data-style-focusable="true"
            aria-label={STRINGS.errors.retry}
            onClick={onRetryPresets}
          >
            {STRINGS.errors.retry}
          </button>
        </div>
      ) : null}

      {/* §19.6: mixed/indeterminate is ANNOUNCED, not only rendered. */}
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="style-status">
        {mixed ? S.mixedValue : hasSelection ? selectionHeaderText : ''}
      </p>

      {expanded ? (
        <div className="style-panel-body">
          {/* ---- COLOR (§7.2) ------------------------------------------------ */}
          <Section title={S.sectionColor} testid="style-section-color">
            <SwatchList
              colors={PALETTE.map((entry) => ({ hex: entry.hex, label: S[entry.nameKey] }))}
              selectedHex={style.strokeColor}
              mixed={mixed}
              disabled={notApplicable('strokeColor')}
              disabledLabel={notApplicable('strokeColor') ? baseReason : undefined}
              groupLabel={S.sectionColor}
              onPick={(hex) => onChange({ strokeColor: hex })}
              testidPrefix="style-swatch"
            />
            <div className="style-panel-row">
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-custom-color"
                data-style-focusable="true"
                aria-label={S.customColor}
                onClick={onOpenEditorSheet}
              >
                {S.customColor}
              </button>
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-contrast"
                data-style-focusable="true"
                aria-label={nameFor(S.nudgeContrast, 'strokeColor')}
                title={titleFor('strokeColor', S.nudgeContrast)}
                disabled={notApplicable('strokeColor')}
                onClick={() => onChange({ strokeColor: nudgeForContrast(style.strokeColor) })}
              >
                <Contrast aria-hidden="true" />
                <span>{S.nudgeContrast}</span>
              </button>
            </div>
          </Section>

          {/* ---- WIDTH (§7.2/§7.3) ------------------------------------------ */}
          <Section title={S.sectionWidth} testid="style-section-width">
            <div className="style-panel-readout">
              <span className="style-panel-readout-value mono">
                {mixed ? S.mixedDash : t(S.widthReadout, { widthPt: formatPt(style.strokeWidthMu) })}
              </span>
            </div>
            <StrokeSample
              style={style}
              width={clampDisplayWidth(style.strokeWidthMu)}
              className="style-panel-preview"
              testid="style-width-preview"
            />
            <div className="style-panel-row">
              <button
                type="button"
                className="style-panel-stepper"
                data-testid="style-width-minus"
                data-style-focusable="true"
                aria-label={`${S.sectionWidth} −`}
                disabled={notApplicable('strokeWidthMu') || widthIndex === 0}
                onClick={() => onChange({ strokeWidthMu: stepWidthMu(style.strokeWidthMu, -1) })}
              >
                <Minus aria-hidden="true" />
              </button>
              <input
                type="range"
                className="style-panel-range style-panel-range--width"
                data-testid="style-width-range"
                data-style-focusable="true"
                aria-label={nameFor(S.sectionWidth, 'strokeWidthMu')}
                aria-valuetext={
                  mixed ? S.mixedValue : t(S.widthReadout, { widthPt: formatPt(style.strokeWidthMu) })
                }
                min={0}
                max={WIDTH_LADDER_MU.length - 1}
                step={1}
                value={widthIndex}
                disabled={notApplicable('strokeWidthMu')}
                onChange={(event) =>
                  onChange({ strokeWidthMu: WIDTH_LADDER_MU[Number(event.target.value)] })
                }
              />
              <button
                type="button"
                className="style-panel-stepper"
                data-testid="style-width-plus"
                data-style-focusable="true"
                aria-label={`${S.sectionWidth} +`}
                disabled={
                  notApplicable('strokeWidthMu') || widthIndex === WIDTH_LADDER_MU.length - 1
                }
                onClick={() => onChange({ strokeWidthMu: stepWidthMu(style.strokeWidthMu, 1) })}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
          </Section>

          {/* ---- FILL (§7.2) ------------------------------------------------- */}
          <Section title={S.sectionFill} testid="style-section-fill">
            <div className="style-panel-row style-panel-row--wrap">
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-fill-none"
                data-style-focusable="true"
                aria-label={nameFor(S.noFill, 'fillColor')}
                aria-pressed={style.fillColor === null}
                disabled={notApplicable('fillColor')}
                title={titleFor('fillColor', S.noFill)}
                onClick={() => onChange({ fillColor: null })}
              >
                {S.noFill}
              </button>
            </div>
            <SwatchList
              colors={PALETTE.map((entry) => ({ hex: entry.hex, label: S[entry.nameKey] }))}
              selectedHex={style.fillColor}
              mixed={mixed}
              disabled={notApplicable('fillColor')}
              disabledLabel={notApplicable('fillColor') ? baseReason : undefined}
              groupLabel={S.sectionFill}
              onPick={(hex) => onChange({ fillColor: hex })}
              testidPrefix="style-fill-swatch"
            />
          </Section>

          {/* ---- TRANSPARENCY (§7.2) ---------------------------------------- */}
          <Section title={S.sectionTransparency} testid="style-section-transparency">
            <div className="style-panel-readout">
              <span className="style-panel-readout-value mono">
                {mixed
                  ? S.mixedDash
                  : t(S.transparencyReadout, { percent: transparencyPercent(style.fillAlpha) })}
              </span>
            </div>
            <div className="style-panel-checker">
              <input
                type="range"
                className="style-panel-range"
                data-testid="style-transparency-range"
                data-style-focusable="true"
                aria-label={nameFor(S.sectionTransparency, 'fillAlpha')}
                aria-valuetext={
                  mixed
                    ? S.mixedValue
                    : t(S.transparencyReadout, { percent: transparencyPercent(style.fillAlpha) })
                }
                min={0}
                max={100}
                step={5}
                value={transparencyPercent(style.fillAlpha)}
                disabled={notApplicable('fillAlpha')}
                onChange={(event) =>
                  onChange({ fillAlpha: alphaFromTransparencyPercent(Number(event.target.value)) })
                }
              />
            </div>
          </Section>

          {/* ---- LINE STYLE (§7.2) ------------------------------------------ */}
          <Section title={S.sectionLineStyle} testid="style-section-line">
            <div className="style-panel-row" role="group" aria-label={S.sectionLineStyle}>
              {(['solid', 'dashed', 'dotted'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="style-panel-option"
                  data-testid={`style-line-${option}`}
                  data-style-focusable="true"
                  aria-label={nameFor(strokeStyleLabel(option), 'lineStyle')}
                  aria-pressed={!mixed && style.lineStyle === option}
                  disabled={notApplicable('lineStyle')}
                  title={titleFor('lineStyle', strokeStyleLabel(option))}
                  onClick={() => onChange({ lineStyle: option })}
                >
                  <StrokeSample style={{ ...style, lineStyle: option, arrowheads: 'none' }} width={3} />
                </button>
              ))}
            </div>
          </Section>

          {/* ---- ARROWHEADS (§7.2) ------------------------------------------ */}
          <Section title={S.sectionArrowheads} testid="style-section-arrows">
            <div className="style-panel-row" role="group" aria-label={S.sectionArrowheads}>
              {(['none', 'start', 'end', 'both'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className="style-panel-option"
                  data-testid={`style-arrow-${option}`}
                  data-style-focusable="true"
                  aria-label={nameFor(arrowheadsLabel(option), 'arrowheads')}
                  aria-pressed={!mixed && style.arrowheads === option}
                  disabled={notApplicable('arrowheads')}
                  title={titleFor('arrowheads', arrowheadsLabel(option))}
                  onClick={() => onChange({ arrowheads: option })}
                >
                  <StrokeSample style={{ ...style, arrowheads: option }} width={3} />
                </button>
              ))}
            </div>
          </Section>

          {/* ---- SIZE + BOLD (the text/label controls, §7.2) ---------------- */}
          <Section title={S.fontSize} testid="style-section-text">
            <div className="style-panel-readout">
              <span className="style-panel-readout-value mono">
                {mixed ? S.mixedDash : String(style.fontSizeMu)}
              </span>
            </div>
            <input
              type="range"
              className="style-panel-range"
              data-testid="style-size-range"
              data-style-focusable="true"
              aria-label={nameFor(S.fontSize, 'fontSizeMu')}
              aria-valuetext={mixed ? S.mixedValue : String(style.fontSizeMu)}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={1}
              value={style.fontSizeMu}
              disabled={notApplicable('fontSizeMu')}
              onChange={(event) => onChange({ fontSizeMu: Number(event.target.value) })}
            />
            <div className="style-panel-row">
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-bold"
                data-style-focusable="true"
                aria-label={nameFor(S.bold, 'bold')}
                aria-pressed={!mixed && style.bold}
                disabled={notApplicable('bold')}
                title={titleFor('bold', S.bold)}
                onClick={() => onChange({ bold: !style.bold })}
              >
                <BoldIcon aria-hidden="true" />
                <span>{S.bold}</span>
              </button>
            </div>
          </Section>

          {/* ---- PRECISION + UNIT FORMAT (project-level; D31) ---------------- */}
          <Section title={S.precision} testid="style-section-precision">
            <div className="style-panel-row style-panel-row--wrap" role="group" aria-label={S.precision}>
              {PRECISION_LADDER.map((denominator) => (
                <button
                  key={denominator}
                  type="button"
                  className="style-panel-chip-option mono"
                  data-testid={`style-precision-${denominator}`}
                  data-style-focusable="true"
                  aria-label={projectNameFor(fractionLabel(denominator))}
                  aria-pressed={projectPrecision === denominator}
                  disabled={!precisionApplies}
                  title={precisionApplies ? fractionLabel(denominator) : S.precisionDimensionOnly}
                  onClick={() => onPrecisionChange(denominator)}
                >
                  {fractionLabel(denominator)}
                </button>
              ))}
            </div>
            {/* The shipped template form: «Project precision: 1/16» (D31 / §21.2). */}
            <p className="style-panel-note mono" data-testid="style-project-precision">
              {t(STRINGS.dimension.projectPrecision, {
                denominator: fractionLabel(projectPrecision),
              })}
            </p>
            <div className="style-panel-row" role="group" aria-label={S.unitFormat}>
              {UNIT_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  className="style-panel-chip-option"
                  data-testid={`style-unit-${format}`}
                  data-style-focusable="true"
                  aria-label={projectNameFor(unitFormatLabel(format))}
                  aria-pressed={unitFormat === format}
                  disabled={!precisionApplies}
                  title={precisionApplies ? unitFormatLabel(format) : S.precisionDimensionOnly}
                  onClick={() => onUnitFormatChange(format)}
                >
                  {unitFormatLabel(format)}
                </button>
              ))}
            </div>
          </Section>

          {/* ---- RECENTS (§7.3: last 8 styles, newest first, 44 px chips) ---- */}
          {recents.length > 0 ? (
            <Section title={S.recentHeader} testid="style-section-recents">
              <ul className="style-panel-recents" role="list">
                {recents.map((recent, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className="style-panel-recent"
                      data-testid={`style-recent-${index}`}
                      data-style-focusable="true"
                      aria-label={describeStyle(recent)}
                      onClick={() => onApplyRecent(recent)}
                    >
                      <StrokeSample style={recent} width={3} />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* ---- PRESETS (§7.3) --------------------------------------------- */}
          <Section title={S.presetsMenu} testid="style-section-presets">
            {presets.length === 0 ? (
              <p className="style-panel-note" data-testid="style-presets-empty">
                {S.presetsEmpty}
              </p>
            ) : (
              <ul className="style-panel-preset-list" role="list">
                {presets.map((preset) => (
                  <li key={preset.name}>
                    <button
                      type="button"
                      className="style-panel-preset"
                      data-testid={`style-preset-${preset.name}`}
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
            {presetOpen ? (
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
                  data-testid="style-preset-name"
                  data-style-focusable="true"
                  aria-label={S.presetNameLabel}
                  value={presetDraft}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- the field is revealed by an explicit tap
                  autoFocus
                  onChange={(event) => setPresetDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="style-panel-button"
                  data-testid="style-preset-confirm"
                  data-style-focusable="true"
                  aria-label={STRINGS.editor.done}
                  disabled={presetDraft.trim() === ''}
                >
                  {STRINGS.editor.done}
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="style-panel-button"
                data-testid="style-preset-save"
                data-style-focusable="true"
                aria-label={S.saveAsPreset}
                onClick={() => setPresetOpen(true)}
              >
                {S.saveAsPreset}
              </button>
            )}
          </Section>
        </div>
      ) : null}
    </aside>
  );
}

/** The unit-format option label (gaps §5), shared with the deep editor. */
export function unitFormatLabel(format: 'ft-in' | 'in' | 'ft-decimal'): string {
  if (format === 'in') return STRINGS.settings.unitFormatIn;
  if (format === 'ft-decimal') return STRINGS.settings.unitFormatDecimalFt;
  return STRINGS.settings.unitFormatFtIn;
}

