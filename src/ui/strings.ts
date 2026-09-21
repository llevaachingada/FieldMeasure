/**
 * The single string table (§12). ALL user-visible text lives here from now on.
 *
 * Filled for slice 0.3 (first-run, Home shell, Settings) from exactly two
 * sources:
 *   1. `docs/appendix-strings.md` — APPROVED copy (verbatim).
 *   2. `docs/appendix-strings-gaps.md` — PROPOSED placeholder copy.
 *
 * Every entry that is NOT approved inventory copy carries a
 * `// ⚠ PROPOSED (C14) — not approved copy` marker so the content-owner review
 * can find it. Anything marked `// ⚠ PROPOSED (C14) — not approved copy (beyond
 * the gaps appendix)` is a builder proposal for a row/control the appendices
 * never keyed at all; a human must approve or replace it before it ships.
 *
 * Interpolation is `{name}` and resolved with `t()` below. Numerals/labels are
 * never persisted — this file is the only home for wording.
 */
export const STRINGS = {
  firstRun: {
    handednessQuestion: 'Which hand do you write with?',
    projectsFolderQuestion: 'Where should your projects live?',
    chooseFolder: 'Choose folder',
    useDocumentsFolder: 'Use Documents\\FieldMeasure',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §21)
    handednessRight: 'Right',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §21)
    handednessLeft: 'Left',
  },

  home: {
    appName: 'FieldMeasure',
    newProject: 'New project',
    recentHeader: 'Recent',
    projectCardMeta: '12 sheets · 48 MB · 2:14 PM',
    projectCardPath: '…\\{path}',
    folderNotFound: 'Folder not found',
    locate: 'Locate…',
    openExistingFolder: 'Open existing folder…',
    emptyHeadline: 'No projects yet',
    emptyBody: 'Projects are just folders on this PC. Pick one and everything saves into it.',
    createProject: 'Create a project',
    openExistingFolderEmpty: 'Open an existing folder…',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §26)
    loading: 'Loading projects…',
  },

  settings: {
    // ── APPROVED inventory (appendix-strings.md `## settings`) ────────────────
    touchPlaces: 'Touch places and moves',
    fingerDraws: 'Finger draws (freehand)',
    magnifierOnTap: 'Magnifier when you tap',
    glovedTouch: 'Gloved touch (bigger touch targets)',
    penOnly: 'Pen only',
    // ⚠ PROPOSED (C14) — not approved copy (wording from appendix-strings.md
    // `settings.penOnly` "Where it appears"; no guillemet string exists)
    penOnlyHint: 'Limits finger gestures to two-finger pan/zoom',

    // ── ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §1) ────
    headingInput: 'Input',
    headingUnits: 'Units',
    headingDisplay: 'Display',
    headingStorage: 'Storage',
    headingAbout: 'About',
    changeFolder: 'Change folder…',
    storageProtected: "Storage protected — your projects won't be cleaned up automatically",
    storageNotProtected: 'Storage not protected — tap to request',
    buildVersion: 'Build {version} · {date}',
    thirdPartyNotices: 'Third-party notices',

    // ── ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §2) ────
    themeStandard: 'Standard',
    themeSunlight: 'Sunlight',
    themeDim: 'Dim',
    densityField: 'Field',
    densityDesk: 'Desk',

    // ── ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §5) ────
    unitFormatFtIn: 'ft-in',
    unitFormatIn: 'in',
    unitFormatDecimalFt: 'decimal ft',

    // ── ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix) ───────
    // Row labels for controls §20.5(b) requires but no appendix keys.
    rowHandedness: 'Handedness',
    rowUnitSystem: 'Unit system',
    rowUnitFormat: 'Unit format',
    rowTheme: 'Theme',
    rowDensity: 'Density',
    rowPalmWindow: 'Palm rejection',
    // Unit-system option labels (metric is deferred in v1 — §2.4 / §21.3).
    unitSystemImperial: 'Imperial',
    unitSystemMetric: 'Metric',
  },

  // APPROVED inventory (appendix-strings.md `## trash`)
  trash: {
    open: 'Trash…',
  },

  // APPROVED inventory (appendix-strings.md `## dimension`) — used as the
  // per-project-precision note in Settings (P §20.5(b)).
  dimension: {
    projectPrecision: 'Project precision: {denominator}',
  },

  // APPROVED inventory (appendix-strings.md `## project`)
  project: {
    duplicateIdBadge: 'Copy',
    makeSeparateProject: 'Make this a separate project',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §9)
  editor: {
    menuSettings: 'Settings',
    menuProjectSettings: 'Project settings',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §17)
  export: {
    back: 'Back',
  },
} as const;

/**
 * Minimal `{name}` interpolation. Missing keys resolve to an empty string rather
 * than leaking the raw token into the UI.
 */
export function t(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in vars ? String(vars[key]) : '',
  );
}

/** `16` → `1/16` (dimension.projectPrecision interpolation). */
export function fractionLabel(denominator: number): string {
  return `1/${denominator}`;
}
