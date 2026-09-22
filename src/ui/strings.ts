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
    // APPROVED (appendix-strings.md `home.projectCardMeta`, line 34): the appendix's `String`
    // column holds the RENDERED EXAMPLE (`12 sheets · 48 MB · 2:14 PM`) and its `Interpolation`
    // column declares `{sheetCount} · {size} · {time}`. Shipping the example verbatim made every
    // card state fiction — `.git` advertised "12 sheets · 48 MB" (D109). The shipped value must be
    // the template; `ProjectList` already passes the real parts.
    projectCardMeta: '{sheetCount} · {size} · {time}',
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
    // UI/GUI handoff pass (2026-09-22, owner request): the VANGARDE watermark toggle.
    rowWatermark: 'Watermark',
    watermarkHint: 'Adds the VANGARDE mark to the app and your exports',
    rowPalmWindow: 'Palm rejection',
    // Unit-system option labels (metric is deferred in v1 — §2.4 / §21.3).
    unitSystemImperial: 'Imperial',
    unitSystemMetric: 'Metric',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §10 `sheetMenu.*`;
  // `rename`, every accessible name, the keyboard move pair and each failure line are
  // beyond both appendices). UI §11.2:719-720's card menu + the grid's reorder.
  sheetMenu: {
    // gaps §10 proposals, verbatim: Open / Duplicate / Replace photo / Delete.
    open: 'Open',
    duplicate: 'Duplicate',
    replacePhoto: 'Replace photo',
    delete: 'Delete',
    rename: 'Rename',
    // Accessible names for the per-card controls and the replace dialog.
    moreNamed: 'More actions for {title}',
    openNamed: 'Open {title}',
    renameNamed: 'Rename {title}',
    duplicateNamed: 'Duplicate {title}',
    replaceNamed: 'Replace photo for {title}',
    deleteNamed: 'Delete {title}',
    renameLabel: 'Sheet name',
    // Keyboard equivalent of the drag (WCAG 2.1.1): the card menu carries it, because a
    // long-press drag is unreachable by keyboard and jsdom cannot drive real pointer input.
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    // Honest failure lines — emitted INSTEAD of a success claim when the write rejects
    // (the §13.4 rule: never announce something the system did not do).
    renameFailed: "Couldn't rename that sheet",
    duplicateFailed: "Couldn't duplicate that sheet",
    replaceFailed: "Couldn't replace that photo",
    reorderFailed: "Couldn't save the new order",
    // ⚠ PROPOSED (C14) — beyond both appendices (review F1): the replace's LAST step is the
    // only one that can fail after the photo, the dimensions and the thumbnail are already
    // consistently new, so «Couldn't replace that photo» would claim a failure the system
    // did not have. This line says what actually happened.
    markupNotRemoved: "Couldn't remove the markup",
  },

  trash: {
    open: 'Trash…',
    // APPROVED inventory (appendix-strings.md `## trash`, line 272) — slice 1.10, the
    // 14-day trash's restore UI.
    restore: 'Restore',

    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the specs require the
    // information (UI §11.2:711 "name, deleted date, days-left"; build spec §11.9:2029) but
    // key none of it, so each row is a builder proposal for the content owner.
    deletedOn: 'Deleted {date}',
    daysLeft: '{daysLeft} days left',
    daysLeftOne: '1 day left',
    daysLeftNone: 'Prunes today',
    empty: 'No sheets in the trash.',
    loading: 'Loading trash…',
    restoring: 'Restoring…',
    restoreFailed: "Couldn't restore that sheet",
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): an honest line for a
    // delete whose write failed. The screen emits it INSTEAD of «Sheet deleted · Undo» —
    // never alongside (D113).
    deleteFailed: "Couldn't delete that sheet",
    previewLabel: 'Preview',
    restoreNamed: 'Restore {title}',
    pruneNote: 'Deleted sheets are kept for 14 days.',
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
    // APPROVED inventory (appendix-strings.md `toasts.addedSheet`, line 289) — slice 1.10:
    // the toast after «Use photo» when the capture was launched from Home/Project, naming
    // the sheet that was just written. Its «↶ Undo» half is owed (no delete path yet).
    addedSheet: 'Added {sheetName}',
    // APPROVED inventory (appendix-strings.md `toasts.sheetDeleted`, line 287; the middle
    // dot is U+00B7). UI §13.3:800 — a sheet delete is recoverable: this toast's action is
    // what makes `ToastHost` hold it for 10 s. Emitted by the SHELL, after the write
    // resolves — never optimistically by the screen (D113).
    sheetDeleted: 'Sheet deleted · Undo',
    undoAction: 'Undid: {actionName}',
    // APPROVED inventory (appendix-strings.md `toasts.updateReady`, line 288).
    updateReady: "Update ready — reload when you're done",
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §18): the prompt's
    // two button labels — the spec names them (`Reload`, `Later`) but quotes neither.
    updateReload: 'Reload',
    updateLater: 'Later',
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
    // D133 (§4.2): the mini-toolbar's «Copy style» — the brief's own words ("a toast that
    // names what was copied"). `select.duplicate`/`bringFront`/`sendBack` double as their
    // OWN undo-toast text (every `history.exec({label})` feeds `toasts.undoAction`
    // directly — no separate `actionDuplicate`/`actionReorder` needed).
    styleCopied: 'Style copied',
  },

  // APPROVED inventory (appendix-strings.md `## project`)
  project: {
    duplicateIdBadge: 'Copy',
    makeSeparateProject: 'Make this a separate project',
    noSheetsEmpty: 'No sheets yet — take a photo to start.',
    // APPROVED (appendix-strings.md `project.addTakePhoto`, line 59) — the editor
    // empty-state primary, paired with `capture.importButton` (UI §11.2:684; D88).
    addTakePhoto: 'Take photo',
    readOnlyChip: "Read-only — changes can't be saved",
    // APPROVED inventory (appendix-strings.md `## project`) — slice 1.10, the sheets grid:
    // the count in the top bar, the inset badge, the per-card meta line, and the
    // blocked-mutation toast. Values are the appendix's TEMPLATE forms (its `String` column
    // is the rendered example; its `Interpolation` column declares the tokens).
    sheetCount: '{sheetCount} sheets',
    insetBadge: '+{insetCount}',
    sheetMeta: '{time} · {dimensionCount} dimensions',
    notSavedToast: 'Not saved to disk',
    // APPROVED inventory (appendix-strings.md `project.reorderChip`, line 63) — the chip
    // that follows a card while drag-reordering sheets (UI §11.2:719).
    reorderChip: 'Drop to move',

    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §26):
    // the grid's loading line.
    loading: 'Loading sheets…',

    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the grid's accessible
    // region name, the per-card selection toggle's name, the selection bar's clear action,
    // and the honest line shown when the project folder cannot be read (UI §11.2).
    sheetsRegion: 'Sheets',
    selectToggle: 'Select {title}',
    clearSelection: 'Clear',
    loadError: "Couldn't read this project folder",

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
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices). Owner-reported from a
    // real run: the capture flow's failure overlay was a BLANK `role="alert"` with two
    // buttons, so nothing said the photo could not be filed. This is that line, for the
    // failures that have no more specific approved copy (a decode/canvas failure, or any
    // unclassified write error); `permission`, `target-locked` and `disk-full` reuse the
    // approved `errors.*` lines instead.
    saveFailed: "Couldn't save this photo",
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices). A save that HANGS is not
    // the same as one that failed: nothing has been rejected, and the write may still land
    // (a Web Lock held by an earlier stuck write, or an OS lock held by another app). This is
    // the bounded-wait exit that stops the app claiming progress forever.
    folderNotResponding: "The folder isn't responding",
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

  // APPROVED inventory (appendix-strings.md `## storage/autosave`) — slice 1.4 added the
  // write-failure action; slice 1.10 fills the autosave chip states from the same section.
  storage: {
    // `{time}` is the appendix row's declared interpolation (`Saved 2:14 PM`).
    saved: 'Saved {time}',
    // APPROVED (appendix-strings.md `storage.local`, line 261). The appendix `String`
    // column is the RENDERED example (`Local · 48 MB · Saved 2:14 PM`) and its
    // Interpolation column declares `{size}`/`{time}`, so the shipped value is the
    // template (same rule as D110's fix). Rendered by the grid's storage chip.
    local: 'Local · {size} · Saved {time}',
    saving: 'Saving…',
    pending: 'Pending — folder offline',
    readOnly: 'Read-only',
    couldntSave: "Couldn't save",
    diskFull: 'Disk full — free space to save',
    offline: 'Offline · no network needed',
    saveACopy: 'Save a copy…',
    // APPROVED inventory (appendix-strings.md `storage.rePickFolder`, line 258). The capture
    // failure overlay's recovery when the folder grant is `denied`: no prompt can fix that, so
    // the honest action is a fresh pick.
    rePickFolder: 'Re-pick folder',
  },

  // APPROVED inventory (appendix-strings.md `## errors`)
  errors: {
    photoDamaged: 'Photo damaged — markup preserved. Re-import or replace the photo.',
    retry: 'Retry',
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings.md gap #20 quotes the
    // spec phrase "Project folder unavailable" but never keys it).
    projectUnavailable: 'Project folder unavailable',

    // ── APPROVED inventory (docs/appendix-strings.md `## errors`) ────────────
    folderPermissionExpired: 'Folder permission expired', // appendix-strings.md:354
    reAuthorize: 'Re-authorize', // appendix-strings.md:355
    fileOpenAnotherApp: 'File is open in another app', // appendix-strings.md:356
    notEnoughDiskSpace: 'Not enough disk space', // appendix-strings.md:358

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // `ExportFileResult.error.kind` has an `unknown` arm; UI §12:728 keys only the three named causes.
    unknown: "Couldn't export this file",
  },

  editor: {
    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §9)
    menuSettings: 'Settings',
    menuProjectSettings: 'Project settings',
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the sheet-loading line. The
    // editor used to render Home's «Loading projects…» while loading a SHEET, which named the wrong
    // thing (found by the D129 chrome audit); the singular is the honest wording for one sheet.
    loadingSheet: 'Loading sheet…',
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
    // ⚠ PROPOSED (C14) — not approved copy (beyond both appendices): the Project screen's
    // back control. Its visible label is the shipped `editor.breadcrumbProjects` («Projects»).
    backToProjects: 'Back to Projects',
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

    // ── APPROVED inventory (docs/appendix-strings.md `## export`) ──────────────
    button: 'Export', // appendix-strings.md:220
    scopeThisSheet: 'This sheet', // appendix-strings.md:221
    scopeSelected: 'Selected sheets ({count})', // appendix-strings.md:222
    scopeAll: 'All sheets ({count})', // appendix-strings.md:223
    pageSizeFit: 'Fit to photo', // appendix-strings.md:224
    quality3xWarning: 'Slow on this device — expect a wait', // appendix-strings.md:225
    includeSheetNames: 'Include sheet names in pages', // appendix-strings.md:228
    pngSize: 'Size: 1× / 2× / 3×', // appendix-strings.md:229
    zipSingle: 'Zip into a single .zip', // appendix-strings.md:230
    conflictAdd: 'Add (1), (2)…', // appendix-strings.md:231
    conflictOverwrite: 'Overwrite', // appendix-strings.md:232
    conflictSkip: 'Skip', // appendix-strings.md:233
    chooseFolder: 'Choose folder…', // appendix-strings.md:234
    rememberDestination: 'Remember this destination for this project', // appendix-strings.md:235
    destination: 'Destination', // appendix-strings.md:236
    writeSummary: 'Will write {fileCount} files ({size}) to:  {path}', // appendix-strings.md:237
    resultSummary: 'Exported {fileCount} files ({size})', // appendix-strings.md:238
    copyPath: 'Copy path', // appendix-strings.md:239
    revealFolder: 'Reveal folder', // appendix-strings.md:240
    exportAgain: 'Export again', // appendix-strings.md:242
    dropboxHint: "Drag this folder into Dropbox when you're back on Wi-Fi.", // appendix-strings.md:243
    selectAtLeastOne: 'Select at least one sheet', // appendix-strings.md:244
    damagedPhotoSummary: '{sheetCount} sheets exported without their photo', // appendix-strings.md:245
    tooLargeFor3x: 'This sheet is too large to export at 3× on this device', // appendix-strings.md:246

    // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §17):
    // the wizard chrome — step rail, footer, format cards, select all/none, status glyphs.
    stepScope: 'Scope',
    stepFormat: 'Format',
    stepDestination: 'Destination',
    stepRail: '1 Scope · 2 Format · 3 Destination',
    next: 'Next',
    formatPdf: 'PDF',
    formatPng: 'PNG',
    selectAll: 'Select all',
    selectNone: 'Select none',
    statusDone: '✓',
    statusWorking: '…',
    statusFailed: '✕',
    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // gap §17 keys exactly three result glyphs (✓ / … / ✕); a file the `Skip` conflict policy
    // left untouched needs a fourth, neutral state plus a word for it (review F4, D109).
    statusSkipped: '–',
    skipped: 'Skipped',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the PDF-side twin of the approved `export.pngSize` control; UI §12:716 writes it as `Quality: 1× / 2× / 3×`.
    quality: 'Quality: 1× / 2× / 3×',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the 1×/2×/3× button labels: a numeral format, like the approved `editor.zoomPercent`.
    multiplierOption: '{multiplier}×',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the polite progress announcement; UI §12:726 describes a progress bar but keys no string.
    progress: '{done} of {total}',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // the conflict group needs an accessible name; this is the appendix’s own "Where it appears" phrase for `export.conflictAdd`.
    conflictHeading: 'Filename conflict policy',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // UI §12:728 says the disk-full row shows "the exact shortfall" but keys no string.
    diskShortfall: '{shortfall} more needed',

    // ⚠ PROPOSED (C14) — not approved copy (beyond the gaps appendix):
    // implementation plan §1.9 step 3b says the 250 MB split must be stated in the result view; no string is keyed.
    splitParts: 'Split into {parts} parts',
  },

  // ⚠ PROPOSED (C14) — not approved copy (appendix-strings-gaps.md §10 `projectMenu.*`;
  // `copyPath`/`deleteProject` are beyond both appendices). UI §11.2's ⋯ menu names these;
  // v1 does not build them, so the Project screen renders them disabled + `aria-disabled`.
  projectMenu: {
    rename: 'Rename',
    copyPath: 'Copy path',
    deleteProject: 'Delete project',
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
    // D133 (§4.2): the mini-toolbar's copy/paste-style pair.
    copyStyle: 'Copy style',
    pasteStyle: 'Paste style',
    noStyleCopied: 'Copy a style first',
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
    // D133 (UI/GUI handoff pass, 2026-09-22): the image-inset controls
    // (`insetBorder`/`insetRadius`/`insetShadow`) had no data channel until this pass.
    insetBorder: 'Border',
    insetRadius: 'Corner radius',
    insetShadow: 'Shadow',
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
