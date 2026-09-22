/**
 * `ToolAngleIcon` - the Angle tool glyph (UI spec §3.4/§11.7; build spec §11.7).
 *
 * §11.7's glyph note is explicit: *Angle = an arc between two rays.* Vertex at the
 * lower-left, one ray along the baseline and one rising to the upper-right, with the
 * swept arc between them - so it reads as an angle, not as a plain line.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.angle`.
 */
export default function ToolAngleIcon() {
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
      {/* The two rays, from a common vertex at (4.5, 19.5). */}
      <path d="M4.5 19.5 H20" />
      <path d="M4.5 19.5 L15.5 6.5" />
      {/* The swept arc between them (radius 8; the 49.7 deg ray lands at (9.7, 13.4)). */}
      <path d="M12.5 19.5 A8 8 0 0 0 9.7 13.4" />
    </svg>
  );
}
