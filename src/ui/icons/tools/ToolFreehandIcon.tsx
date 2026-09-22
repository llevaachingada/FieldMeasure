/**
 * `ToolFreehandIcon` - the Freehand pen glyph (UI spec §6.1/§8.4; build spec §11.7).
 *
 * A single flowing stroke. §6.1 puts Freehand in "Ink & Notes" as the hand-driven mark, so
 * the glyph is the drawn line itself rather than a pen: a pen body would read as the
 * Highlighter marker sitting next to it. Thin and wavy, against the Highlighter's broad
 * chisel, so the two ink tools never collide.
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.freehand`.
 */
export default function ToolFreehandIcon() {
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
      <path d="M3.5 15.5 C6 9.5 9 20.5 12 14.5 S17.5 5.5 20.5 10.5" />
    </svg>
  );
}
