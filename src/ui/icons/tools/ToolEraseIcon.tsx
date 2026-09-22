/**
 * `ToolEraseIcon` - the Erase/delete glyph (UI spec §6.1/§8.7; build spec §11.7).
 *
 * A tilted eraser block with the seam between rubber and holder, lifted just above the
 * line it is clearing. A block on a baseline reads as "remove", and it is deliberately
 * NOT an arrow, a cross or a pointer, so Erase can never be mistaken for Select, Pan or
 * the Highlighter marker.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.erase`.
 */
export default function ToolEraseIcon() {
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
      {/* The eraser block (a 10.2 x 5.4 rectangle at 45 deg) ... */}
      <path d="M5.4 15 L12.6 7.8 L16.4 11.6 L9.2 18.8 Z" />
      {/* ... the rubber/holder seam, parallel to its short edge ... */}
      <path d="M7.6 12.8 L11.4 16.6" />
      {/* ... and the line it is clearing. */}
      <path d="M8 20.5 H20.5" />
    </svg>
  );
}
