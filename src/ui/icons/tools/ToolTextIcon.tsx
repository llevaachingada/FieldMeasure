/**
 * `ToolTextIcon` - the Text note glyph (UI spec §6.1/§8.5; build spec §11.7).
 *
 * A capital T, drawn as two strokes (never a `<text>` element - the rail glyphs must
 * render without a font, and `tests/toolGlyphs.test.ts` pins that). The T is the one
 * glyph built from a stem plus a crossbar, so it cannot collide with Line (a diagonal
 * with nodes) or Arrow (a diagonal with a head).
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.textNote`.
 */
export default function ToolTextIcon() {
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
      <path d="M5 6.5 H19" />
      <path d="M12 6.5 V19" />
    </svg>
  );
}
