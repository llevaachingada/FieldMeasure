/**
 * `ToolPanIcon` - the Pan & Zoom tool glyph (UI spec §3.4/§6.3; build spec §11.7).
 *
 * "Pan & Zoom" moves the view, so the glyph is a four-way move cross with a head on each
 * arm. Chosen over a hand because a hand is illegible at 24 px and because the two MOVE
 * tools must be instantly separable: Select is a solid pointer silhouette, Pan is an open
 * four-way cross.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.panZoom`.
 */
export default function ToolPanIcon() {
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
      <path d="M12 3.5 V20.5" />
      <path d="M3.5 12 H20.5" />
      <path d="M9.3 6.2 L12 3.5 L14.7 6.2" />
      <path d="M9.3 17.8 L12 20.5 L14.7 17.8" />
      <path d="M6.2 9.3 L3.5 12 L6.2 14.7" />
      <path d="M17.8 9.3 L20.5 12 L17.8 14.7" />
    </svg>
  );
}
