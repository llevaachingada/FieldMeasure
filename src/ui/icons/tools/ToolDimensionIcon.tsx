/**
 * `ToolDimensionIcon` — PLACEHOLDER glyph for the Dimension tool (slice 1.4.5).
 *
 * ⚠ PLACEHOLDER ART — MUST NOT SHIP. The plan sanctions a numbered square to unblock
 * the editor shell; the 14 bespoke single-path glyphs (§2.2, UI §11.7) are a
 * prerequisite for slice 2.0, not for 1.5. Replace this file with the real glyph.
 */
export default function ToolDimensionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        3
      </text>
    </svg>
  );
}
