/**
 * `ToolLineIcon` - the Line tool glyph (UI spec §6.1/§6.2; build spec §11.7).
 *
 * A plain straight segment with a small node at each end: it reads as "line between two
 * points" and carries NO arrowhead (that is Arrow/Leader) and no extension ticks or
 * double head (that is Dimension), so the three MARK tools stay separable at a glance.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.line`.
 */
export default function ToolLineIcon() {
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
      <path d="M5.5 18.5 L18.5 5.5" />
      {/* The two endpoints, the only part of this glyph that is filled. */}
      <circle cx="5.5" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
