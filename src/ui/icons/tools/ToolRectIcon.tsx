/**
 * `ToolRectIcon` - the Rectangle tool glyph (UI spec §6.1/§7.2; build spec §11.7).
 *
 * A plain landscape rectangle. Deliberately the ONLY empty single outline among the shape
 * glyphs: Ellipse is round, Polygon is a pentagon, and the Image inset is two frames with
 * a sun dot, so a bare rectangle cannot be confused with an inset.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.rectangle`.
 */
export default function ToolRectIcon() {
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
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
    </svg>
  );
}
