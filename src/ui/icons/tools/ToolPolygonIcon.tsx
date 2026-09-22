/**
 * `ToolPolygonIcon` - the Polygon tool glyph (UI spec §6.1/§7.2; build spec §11.7).
 *
 * A regular pentagon, point up: an odd number of sides so it can never read as the
 * rectangle, and no curves so it can never read as the ellipse. §7.2 exposes 3-12 sides;
 * the pentagon is the shape that says "many sides" at 24 px without a vertex count.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.polygon`.
 */
export default function ToolPolygonIcon() {
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
      {/* A pentagon of circumradius 8.6 about (12, 12.3); vertices at -90, -18, 54, 126, 198 deg. */}
      <path d="M12 3.7 L20.2 9.6 L17.1 19.3 L6.9 19.3 L3.8 9.6 Z" />
    </svg>
  );
}
