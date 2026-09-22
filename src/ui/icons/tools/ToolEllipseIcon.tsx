/**
 * `ToolEllipseIcon` - the Ellipse/Circle tool glyph (UI spec §6.1/§7.2; build spec §11.7).
 *
 * A single ellipse, wider than tall. A circle and a rectangle are the two shapes a user
 * most often mis-picks, so the ellipse is drawn unmistakably round and the rectangle
 * unmistakably square-cornered.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.ellipse`.
 */
export default function ToolEllipseIcon() {
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
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </svg>
  );
}
