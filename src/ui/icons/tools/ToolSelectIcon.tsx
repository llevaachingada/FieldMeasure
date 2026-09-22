/**
 * `ToolSelectIcon` - the Select/Edit tool glyph (UI spec §3.4/§6.3; build spec §11.7).
 *
 * The universal pointer arrow: tap or drag the thing you can see, so the glyph is the
 * cursor itself. It is deliberately the ONLY arrow-shaped glyph of the two "MOVE" tools
 * that has no heads on a line (that is Pan's four-way cross), so Select and Pan never
 * read as each other.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.select`.
 */
export default function ToolSelectIcon() {
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
      {/* A pointer: shaft down the left, nose, then the little tail to the lower right. */}
      <path d="M6 3 L6 18.5 L9.7 14.9 L12.2 20.4 L14.7 19.2 L12.2 13.8 L17.5 13.5 Z" />
    </svg>
  );
}
