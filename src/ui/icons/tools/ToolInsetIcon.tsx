/**
 * `ToolInsetIcon` - the Image inset glyph (UI spec §6.1/§9; build spec §11.7).
 *
 * A photo frame with a second, smaller frame overlapping its lower-right corner, plus a
 * filled "sun" dot inside the small frame: the inset is *content inside content* (§9),
 * which is exactly what two offset frames say. The offset and the dot are what keep it
 * from reading as the plain Rectangle glyph.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.imageInset`.
 */
export default function ToolInsetIcon() {
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
      {/* The sheet, and the inset frame nested into its lower-right corner. */}
      <rect x="3.5" y="4.5" width="12.5" height="11" rx="1.5" />
      <rect x="10" y="10.5" width="10.5" height="9" rx="1.5" />
      {/* The photo mark: one filled dot, the only filled part of this glyph. */}
      <circle cx="13.2" cy="13.6" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
