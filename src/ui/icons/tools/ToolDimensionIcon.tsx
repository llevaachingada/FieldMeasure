/**
 * `ToolDimensionIcon` - the Dimension tool glyph (UI spec §3.4/§11.7; build spec §11.7).
 *
 * §11.7's glyph note is explicit: *Dimension = a measured line with ticks and outward
 * arrowheads.* Drawn here as a horizontal measure line between two extension ticks, with
 * an outward chevron at each end - symmetric, so it can never be mistaken for the
 * one-headed Arrow/Leader glyph.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4 ("24px grid, 2px stroke, round
 * caps"). Decorative - the rail button's accessible name is `STRINGS.tool.dimension`.
 */
export default function ToolDimensionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Extension lines at each measured end (y 5.5..18.5). */}
      <path d="M5 5.5 V18.5" />
      <path d="M19 5.5 V18.5" />
      {/* The measure line, with outward arrowheads pointing away from each other. */}
      <path d="M5 12 H19" />
      <path d="M7.6 9.2 L5 12 L7.6 14.8" />
      <path d="M16.4 9.2 L19 12 L16.4 14.8" />
    </svg>
  );
}
