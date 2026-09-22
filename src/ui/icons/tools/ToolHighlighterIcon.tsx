/**
 * `ToolHighlighterIcon` - the Highlighter glyph (UI spec §6.1/§8.4; build spec §11.7).
 *
 * A broad chisel marker standing on the stroke it paints. It is upright with a flared tip
 * and a full-width base bar, while Freehand is a thin wave and Erase is a tilted block
 * above a line - the three "ink/remove" glyphs are therefore never confused.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.highlighter`.
 */
export default function ToolHighlighterIcon() {
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
      {/* Marker barrel, then the chisel that flares out onto the line below. */}
      <path d="M9.5 4.5 H14.5 V13 H9.5 Z" />
      <path d="M9.5 13 H14.5 L17 17.5 H7 Z" />
      {/* The highlighted line. */}
      <path d="M5 20.5 H19" />
    </svg>
  );
}
