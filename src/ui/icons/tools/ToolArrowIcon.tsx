/**
 * `ToolArrowIcon` - the Arrow / Leader tool glyph (UI spec §6.1/§7.2; build spec §11.7).
 *
 * A leader: one open line with a single arrowhead at its tip. It is the only MARK glyph
 * with exactly ONE head on a diagonal line - Line has none, Dimension has two outward
 * heads plus extension ticks - so "leader" never reads as "measure".
 *
 * Bespoke inline SVG (no new dependency, AGENTS #5): 24x24 viewBox, `currentColor` only,
 * no `<text>`, no inline `style`, round caps/joins per §3.4. Decorative - the rail
 * button's accessible name is `STRINGS.tool.arrowLeader`.
 */
export default function ToolArrowIcon() {
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
      {/* The leader line, and an open V head at its upper-right tip (a 72 deg head). */}
      <path d="M4.5 19.5 L18.2 5.8" />
      <path d="M18.2 5.8 L11.4 6.9" />
      <path d="M18.2 5.8 L17.1 12.6" />
    </svg>
  );
}
