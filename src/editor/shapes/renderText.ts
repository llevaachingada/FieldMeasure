/**
 * `src/editor/shapes/renderText.ts` — text-note renderer (plan slice 1.6 build order
 * step 4; UI §8.5 Text).
 *
 * `fontSize = fontSizeMu / s` at every zoom (§4.2 rule 2) — tagged `fontSizeMu` so
 * `EditorCanvas.applyScreenRules` re-applies it. The optional leader connects the note
 * to the point it annotates.
 *
 * **Auto-contrast background (48×48 sample).** The note's background must stay legible
 * over any photo. `autoContrastForLuminance` is the pure decision (sample average
 * luminance of a 48×48 region → light or dark treatment); the caller supplies the
 * sampled luminance, because only the canvas owns the bitmap. With no sample the dark
 * treatment is the safe default (the Site Slate mat is dark).
 */
import Konva from 'konva';
import type { AnnotationStyle, Px } from '@/domain/types';
import { screenFontSize } from '@/editor/EditorCanvas';

/** §8.5: the auto-contrast sample region is 48×48. */
export const TEXT_BG_SAMPLE_PX = 48;

export type TextBackground = 'none' | 'pill' | 'solid' | 'auto';

export interface TextContrast {
  /** Background fill for the note box (null = transparent). */
  background: string | null;
  /** Text fill. */
  text: string;
}

export const TEXT_LIGHT: TextContrast = { background: 'rgba(11,14,18,0.85)', text: '#FFFFFF' };
export const TEXT_DARK: TextContrast = { background: 'rgba(240,244,248,0.92)', text: '#0B0E12' };

/**
 * Pick the contrasting treatment from the mean luminance (0..1) of the 48×48 sample.
 * A light photo (luminance > 0.5) gets the dark pill; a dark photo gets the light one.
 */
export function autoContrastForLuminance(meanLuminance: number): TextContrast {
  return meanLuminance > 0.5 ? TEXT_LIGHT : TEXT_DARK;
}

export interface TextRenderInput {
  id: string;
  at: Px;
  text: string;
  background: TextBackground;
  style: AnnotationStyle;
  scale: number;
  /** Mean luminance (0..1) of the 48×48 region under `at`, when the caller can sample. */
  luminance?: number | null;
  /** Optional leader endpoint (callout tail). */
  leaderFrom?: Px | null;
  locked?: boolean;
}

/** Build a text-note group (a background box + the glyphs, optionally a leader). */
export function buildTextGroup(input: TextRenderInput): Konva.Group {
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', input.id);
  group.setAttr('locked', input.locked ?? false);
  group.setAttr('kind', 'text');

  const fontSize = screenFontSize(input.style.fontSizeMu, input.scale);
  const pad = Math.max(4, input.style.fontSizeMu * 0.35) / input.scale;

  // Choose the treatment. 'auto' needs the caller's sample; the default without one is
  // the dark pill (readable on the mat and most field photos).
  let treatment: TextContrast;
  if (input.background === 'none') treatment = { background: null, text: input.style.strokeColor };
  else if (input.background === 'solid') treatment = { background: input.style.strokeColor, text: '#FFFFFF' };
  else if (input.background === 'pill')
    treatment = { background: 'rgba(11,14,18,0.85)', text: '#FFFFFF' };
  else
    treatment = autoContrastForLuminance(
      typeof input.luminance === 'number' ? input.luminance : 0.5,
    );

  const glyphs = new Konva.Text({
    text: input.text,
    fontSize,
    fontFamily: 'Inter',
    fontStyle: input.style.bold ? '700' : '400',
    fill: treatment.text,
    listening: false,
  });
  glyphs.setAttr('fontSizeMu', input.style.fontSizeMu);

  if (treatment.background) {
    const box = new Konva.Rect({
      x: glyphs.x() - pad,
      y: glyphs.y() - pad,
      width: glyphs.width() + pad * 2,
      height: glyphs.height() + pad * 2,
      cornerRadius: input.background === 'pill' ? glyphs.height() / 2 + pad : 4,
      fill: treatment.background,
      listening: false,
    });
    group.add(box);
  }
  group.add(glyphs);
  group.position(input.at);

  if (input.leaderFrom) {
    const leader = new Konva.Line({
      points: [0, 0, input.leaderFrom.x - input.at.x, input.leaderFrom.y - input.at.y],
      stroke: input.style.strokeColor,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      listening: false,
    });
    leader.setAttr('strokeWidthMu', 1);
    group.add(leader);
  }

  return group;
}
