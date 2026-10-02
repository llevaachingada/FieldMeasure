/**
 * `src/ui/textSize.ts`: the one set of text-size steps shared by the style panel's Size section
 * (text AND dimension labels, D164) and the text-box editor (D160).
 */

/** The one-tap sizes (markup units, the scale the Size slider shows). */
export const TEXT_SIZE_PRESETS = [
  { label: 'S', mu: 14 },
  { label: 'M', mu: 18 },
  { label: 'L', mu: 28 },
  { label: 'XL', mu: 40 },
] as const;

/** One stepper tick: 1 below 20, 2 below 40, 4 above (small sizes need fine steps). */
export function stepTextSize(mu: number, direction: 1 | -1, min = 8, max = 120): number {
  const step = mu < 20 ? 1 : mu < 40 ? 2 : 4;
  return Math.min(max, Math.max(min, Math.round(mu) + direction * step));
}
