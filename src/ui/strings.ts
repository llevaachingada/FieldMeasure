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
    // Slice 1.5 — Style Chip / keypad / live-label copy (all appendix rows, no marker).
    toolName: 'Dimension',
    unitFtIn: 'ft-in',
    ghostLabel: 'tap to enter value',
    snapChip90: '90°',
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    complement: 'Complement',
    supplement: 'Supplement',
    complementChip: 'Complement {angle}°',
    supplementChip: 'Supplement {angle}°',
    chainFromRay: 'Chain from this ray',
    snapChip45: '45°',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    anglePrecisionOne: '1°',
    anglePrecisionHalf: '0.5°',
    anglePrecisionTenth: '0.1°',
    angleReadout: '≈ {angle}°',
  },

  // APPROVED inventory (appendix-strings.md `## placement`; the appendix itself notes
  // the `TF §9` rows are "proposed, not final", but they are keyed there, so they are
  // appendix copy — no builder marker).
  placement: {
    firstPoint: 'Tap the first point',
    secondPoint: 'Tap the second point',
    adjustEndpoints: 'Adjust endpoints',
    adjusting: 'Adjusting dimension',
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    undoPoint: 'Undo point',
    closeShape: 'Close shape',
  },

  // APPROVED inventory (appendix-strings.md `## keypad`). Lane D's keypad sheet owns
  // the full key surface; these three are the ones slice 1.5's shell renders (the HUD
  // and the sheet's accessible name) plus the F3/F4 refusal reasons.
  keypad: {
    title: 'Enter dimension',
    useThisValue: 'Use this value',
    chain: 'Chain: commit & start next from B',
    // Slice 1.5 — the rest of the sheet’s approved keypad inventory (appendix rows).
    fractionHalf: '1/2',
    fractionQuarter: '1/4',
    fractionEighth: '1/8',
    fractionSixteenth: '1/16',
    cycleHint: '← /16',
    entryNowInches: 'Entry is now inches',
    // Appendix row value is the RENDERED example (`Project precision: 1/8`) with
    // `{denominator}` declared in its Interpolation column — so the shipped form is the
    // template, exactly as `dimension.projectPrecision` already ships. The copy gate
    // compiles the token to an anchored regex and still checks the wording byte-for-byte.
    projectPrecisionEighth: 'Project precision: {denominator}',
    ftToggle: 'ft',
    inToggle: 'in',
    offlineNote: 'Saved locally, will write when the folder is back.',
    // ⚠ PROPOSED (C14) — not approved copy (implementation-plan §1.5 F3/F4 quotes these
    // three refusal reasons; neither appendix keys them).
    errorEnterLength: 'Enter a length',
    errorFractionTooBig: 'Fraction must be smaller than 1/16',
    errorTooLarge: 'Too large',
  },

  // APPROVED inventory (appendix-strings.md `## toasts`): `undoAction` is the template.
  toasts: {
    undoAction: 'Undid: {actionName}',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix): the action names
    // interpolated into `toasts.undoAction`; the appendix supplies only the example
    // "Undid: Delete dimension 12' 6"".
    actionAddDimension: 'Add dimension',
    actionMoveDimension: 'Move dimension',
    actionDeleteDimension: 'Delete dimension',
    actionSetValue: 'Set dimension value',
    actionAdjustDimension: 'Adjust dimension',
    // Slice 1.8: a style edit on a selection is one history step, so the undo toast needs
    // a name for it. Same provenance as its siblings above (beyond the gaps appendix).
    actionChangeStyle: 'Change style',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    actionAddShape: 'Add shape',
    actionAddInk: 'Add ink',
    actionAddHighlight: 'Add highlight',
    actionAddText: 'Add text',
    actionAddAngle: 'Add angle',
    actionSplitStroke: 'Split stroke',
  },

  // APPROVED inventory (appendix-strings.md `## project`)
  project: {
    duplicateIdBadge: 'Copy',
    makeSeparateProject: 'Make this a separate project',
    noSheetsEmpty: 'No sheets yet — take a photo to start.',
    readOnlyChip: "Read-only — changes can't be saved",
    // APPROVED inventory (appendix-strings.md `project.selectionCount`) — slice 1.8:
    // the Style Chip / panel header when objects are selected. The appendix `String`
    // column shows the rendered `3 selected`; `{count}` is its declared interpolation.
    selectionCount: '{count} selected',
    // ⚠ PROPOSED (C14) — not approved copy: the literal word inside the
    // `Sheet NN` default name (appendix `project.sheetNameExample` = "Sheet 04",
    // pattern `Sheet NN`, zero-padded 2, never renumbered).
    sheetNamePrefix: 'Sheet',
    // APPROVED inventory (appendix-strings.md `project.replacePhoto*`) — slice 1.7:
    // the Replace-photo warned dialog (different dimensions).
    replacePhotoWarn: "The new photo is a different size. Markup saved in the old photo's coordinates may land in the wrong place.",
    replacePhotoKeep: 'Keep markup',
    replacePhotoRemove: 'Remove markup',
  },

  // APPROVED inventory (appendix-strings.md `## capture`)
  capture: {
    importButton: 'Import',
    importAPhoto: 'Import a photo',
    close: 'Close',
    resolutionHigh: 'High (device max)',
    resolutionFast: 'Fast',
    aeAfLock: 'AE/AF LOCK',
    retake: 'Retake',
    usePhoto: 'Use photo',
    discardConfirm: 'Discard this photo? The sheet\'s markup will be kept if the new photo is the same size.',
    adding: 'Adding…',
    openWindowsCamera: 'Open Windows Camera',
    embeddedFallback: 'Camera unavailable in this browser. Open Windows Camera or Import a photo instead.',
    unavailableFallback: 'Camera unavailable… Open Windows Camera or Import a photo.',
    unavailable: 'Camera unavailable',
    useWindowsCameraPromoted: 'Use the Windows Camera app for detail shots',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §14):
    // the viewfinder toggles and zoom chips. `capture.autoCapture` is deliberately
    // absent — auto-capture-on-level is not built in v1 (UI §10.1: off by default).
    torch: 'Torch',
    grid: 'Grid',
    level: 'Level',
    flip: 'Flip camera',
    zoomHalf: '0.5×',
    zoomOne: '1×',
    zoomTwo: '2×',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix): the OS
    // camera privacy note the specs require in the camera-unavailable copy
    // (P §11.8, U §10.1) but never key. The build spec's own phrase, promoted.
    cameraPrivacyNote: 'Settings → Privacy → Camera → allow desktop apps',
  },

  // APPROVED inventory (appendix-strings.md `## storage/autosave`) — slice 1.4 uses
  // only the write-failure action; slice 1.10 fills the autosave chip states.
  storage: {
    saveACopy: 'Save a copy…',
  },

  // APPROVED inventory (appendix-strings.md `## errors`)
  errors: {
    photoDamaged: 'Photo damaged — markup preserved. Re-import or replace the photo.',
    retry: 'Retry',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings.md gap #20 quotes the
    // spec phrase "Project folder unavailable" but never keys it).
    projectUnavailable: 'Project folder unavailable',
  },

  editor: {
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §9)
    menuSettings: 'Settings',
    menuProjectSettings: 'Project settings',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §9):
    // the remaining seven editor overflow items (slice 1.4.5 top bar).
    menuDuplicateSheet: 'Duplicate sheet',
    menuInsertImage: 'Insert image',
    menuAddSheet: 'Add sheet',
    menuImportFile: 'Import file',
    menuSheetInfo: 'Sheet info',
    menuHelp: 'Help',
    menuKeyboardShortcuts: 'Keyboard shortcuts',
    // APPROVED inventory (appendix-strings.md `editor.breadcrumbProjectSegment`
    // / `editor.breadcrumbSheetSegment`) — used as the breadcrumb FALLBACKS when a
    // name is not yet known (the segments become inline-editable in a later slice).
    breadcrumbProjectSegment: 'Project',
    breadcrumbSheetSegment: 'Sheet',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the breadcrumb's leading segment (UI §5.2 shows `‹ Projects`; no key exists).
    breadcrumbProjects: 'Projects',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // slice 1.3's minimal editor nav is superseded by the 1.4.5 top bar.
    back: 'Back',
    // APPROVED inventory (appendix-strings.md `editor.zoomPercent`, `{zoomPercent}`)
    zoomPercent: '{zoomPercent}%',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // visible label of the zoom pill's fit button (UI §5.4 shows `⤢ Fit`).
    fit: 'Fit',
    // APPROVED inventory (appendix-strings.md `editor.emptyHint`)
    emptyHint: 'Tap a tool, then tap the photo',
    // APPROVED inventory (appendix-strings.md `editor.cancel`) — the keypad sheet’s ✕.
    cancel: 'Cancel',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the Style Chip's accessible name in the docked container (slice 1.8 fills
    // the panel; 1.4.5 renders only the chip slot).
    styleChip: 'Current style',
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    holdToShapeChip: '⇧ Shape',
    lockedToast: 'Locked — unlock in Layers',
    eraseNameRectangle: 'Rectangle',
    eraseNameDimension: 'Dimension {measurement}',
    layersNameFreehand: 'Freehand',
    layersEmpty: 'No markup yet',
    addLabel: 'Add label',
    undo: 'Undo',
    done: 'Done',
    highlighterBandMessage: 'Highlighter always sits under other markup',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §11): the 14
  // tool names. One name per tool so the rail's tooltip, the `aria-label` and the
  // Style Chip share a single source.
  tool: {
    select: 'Select',
    panZoom: 'Pan & Zoom',
    dimension: 'Dimension',
    angle: 'Angle',
    line: 'Line',
    arrowLeader: 'Arrow / Leader',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    polygon: 'Polygon',
    freehand: 'Freehand',
    highlighter: 'Highlighter',
    textNote: 'Text note',
    imageInset: 'Image inset',
    erase: 'Erase',
  },

  // APPROVED inventory (appendix-strings.md `## toolRail`): the six group headers.
  toolRail: {
    groupMove: 'MOVE',
    groupMeasure: 'MEASURE',
    groupMark: 'MARK',
    groupAnnotate: 'ANNOTATE',
    groupInsert: 'INSERT',
    groupErase: 'ERASE',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md #25 supplies these
  // three labels; the approved `## a11yLabels` section holds only `a11y.dimensionTool`,
  // so they still await content-owner sign-off).
  a11y: {
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomFit: 'Fit to photo',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // accessible name of the zoom-pill group.
    zoom: 'Zoom',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the canvas container's accessible name (§19.6).
    canvas: 'Photo canvas',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §25):
    // accessible names for the icon-only top-bar and rail controls.
    layers: 'Layers',
    export: 'Export',
    undo: 'Undo',
    redo: 'Redo',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the overflow trigger and the breadcrumb nav landmark have no supplied copy.
    moreActions: 'More actions',
    breadcrumb: 'Breadcrumb',
    toolRail: 'Tools',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §25):
    // the capture screen’s icon-only controls (slice 1.4).
    torch: 'Torch',
    shutter: 'Take photo',
    grid: 'Grid',
    level: 'Level',
    cameraFlip: 'Flip camera',
    rotate: 'Rotate',
    close: 'Close',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    selectionHandle: 'Adjust {handle}',
    visibilityToggle: 'Show or hide {name}',
    lockToggle: 'Lock or unlock {name}',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §17)
  export: {
    back: 'Back',
  },

  erase: {
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    strokeNeedsPen: 'Splitting a stroke needs the pen. Touch can delete the whole stroke.',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    modeObject: 'Objects',
    modeStroke: 'Stroke',
  },

  select: {
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    touchHint: 'Drag to move. Two fingers to pan.',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    duplicate: 'Duplicate',
    delete: 'Delete',
    lock: 'Lock',
    bringFront: 'Bring to front',
    sendBack: 'Send to back',
    editPoints: 'Edit points',
    focus: 'Focus',
    editText: 'Edit text',
  },

  touch: {
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    freehandPenBetter: 'Freehand is most precise with the pen.',
  },

  style: {
    // APPROVED inventory (appendix-strings.md) — slice 1.6.
    highlighterStraightLine: 'Straight line',
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    straightLineLock: 'Straight-line lock',
    chiselWidth: 'Chisel width',

    // APPROVED inventory (appendix-strings.md `## style`) — slice 1.8: the style panel
    // and the deep style editor. A `{token}` value is the appendix row's declared
    // template (its `String` column shows the rendered example — `3 pt`, `Applied to 3
    // objects` — and its `Interpolation` column the token), so the copy gate compiles
    // the token to an anchored wildcard and compares only the literal wording.
    widthReadout: '{widthPt} pt',
    transparencyReadout: '{percent}%',
    mixedValue: 'Mixed',
    moreStyles: 'More styles…',
    saveAsPreset: 'Save as preset…',
    resetDefaults: 'Reset to defaults',
    appliedToSelection: 'Applied to {objectCount} objects',
    alsoSetDefault: 'Also set as default for this tool',
    selectionHeader: '{objectCount} objects selected',
    deselect: 'Deselect',
    applyToSelection: 'Apply to selection',
    applyToScope: 'Apply to: {typeCounts}',
    presetsError: "Presets couldn't be loaded — changes will apply to this session only.",

    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §6): the §7.2
    // diagram's backticked placeholder labels (`COLOR`, `WIDTH`, …). Title case matches
    // the existing `style.*` keys. `recentHeader` is the §7.3 Recents row's label.
    sectionColor: 'Color',
    sectionWidth: 'Width',
    sectionFill: 'Fill',
    sectionTransparency: 'Transparency',
    sectionLineStyle: 'Line style',
    sectionArrowheads: 'Arrowheads',
    presetsMenu: 'Presets',
    recentHeader: 'Recent',
    precision: 'Precision',
    unitFormat: 'Unit format',
    bold: 'Bold',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix): panel and
    // deep-editor chrome that neither appendix keys. A plain sub-comment does NOT clear
    // this marker (tests/strings.test.ts `parseSourceKeys`); only a blank line or an
    // `APPROVED inventory` block does.
    panelLabel: 'Style',
    fontSize: 'Size',
    paletteLabel: 'Palette',
    widthLadder: 'Width ladder',
    hexLabel: 'Hex',
    hueLabel: 'Hue',
    saturationLabel: 'Saturation',
    lightnessLabel: 'Lightness',
    // Option values verbatim from the specs' own lists (P §11.5 / U §7.2).
    lineStyleSolid: 'Solid',
    lineStyleDashed: 'Dashed',
    lineStyleDotted: 'Dotted',
    arrowNone: 'None',
    arrowStart: 'Start',
    arrowEnd: 'End',
    arrowBoth: 'Both',
    noFill: 'No fill',
    customColor: 'Custom…',
    nudgeContrast: 'Nudge for contrast',
    presetNameLabel: 'Preset name',
    presetsEmpty: 'No presets yet',
    // The mixed (indeterminate) readout glyph — UI §7.4: "the width readout shows «—»".
    mixedDash: '—',
    // The disabled control's SECOND accessible clause: §19.6 requires the name to say why.
    disabledForTool: 'Not available for this tool',
    disabledForSelection: 'Not available for this selection',
    // The project-level precision / unit-format cluster is dimension-only (U §7.2).
    precisionDimensionOnly: 'Available with the Dimension tool',
    // The Style Chip SVG's accessible description (the pattern is `a11y.dimensionTool`).
    chipStyleLabel: '{color} · {widthPt} pt · {lineStyle} · arrowheads {arrowheads}',
    // The 12 markup-palette names from the "Site Slate" visual direction (P §11.7).
    swatchHiVisOrange: 'Hi-Vis Orange',
    swatchSafetyYellow: 'Safety Yellow',
    swatchSignalRed: 'Signal Red',
    swatchMagenta: 'Magenta',
    swatchCyan: 'Cyan',
    swatchSky: 'Sky',
    swatchGreen: 'Green',
    swatchLime: 'Lime',
    swatchWhite: 'White',
    swatchBlack: 'Black',
    swatchConcrete: 'Concrete',
    swatchDeepNavy: 'Deep Navy',
  },

  layers: {
    // ⚠ PROPOSED (C14) — not approved copy (slice 1.6: appendix-strings-gaps.md).
    groupMarkup: 'Markup',
    groupDimensions: 'Dimensions',
    groupShapes: 'Shapes',
    groupInk: 'Ink',
    groupText: 'Text',
    // appendix-strings-gaps.md §7 (`layers.groupPhoto`) — the synthetic photo-base row.
    groupPhoto: 'Photo',
    menuBringFront: 'Bring to front',
    menuSendBack: 'Send to back',
    menuGroup: 'Group',
    menuUngroup: 'Ungroup',
    menuRename: 'Rename',
    menuDelete: 'Delete',
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the undo-toast
    // action names for the eye/lock toggles. Derived from the gaps §7/§25 templates
    // `a11y.visibilityToggle` / `a11y.lockToggle`; the caller composes `${action} ${name}`.
    actionToggleVisible: 'Show or hide',
    actionToggleLock: 'Lock or unlock',
  },

  inset: {
    // APPROVED inventory (appendix-strings.md `## inset`) — slices 1.6/1.7.
    layersName: 'Inset {insetName}',
    placeHint: 'Tap where the inset should go',
    takePhoto: 'Take a photo',
    chooseFromDevice: 'Choose from device',
    recentPhotos: 'Recent photos',
    focusBreadcrumb: '{sheetName} › {insetName}',
    nestedTooltip: "Nested insets aren't supported",
    focusControl: 'Focus',
    keepMarkupAnyway: 'Keep markup anyway — it may land in the wrong place',
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the inset
    // operation names used in undo toasts, and the Recents grid's empty state.
    actionPlace: 'Place inset',
    actionCrop: 'Crop inset',
    actionScale: 'Scale inset',
    actionRotate: 'Rotate inset',
    actionReplace: 'Replace photo',
    recentsEmpty: 'No recent photos yet',
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
