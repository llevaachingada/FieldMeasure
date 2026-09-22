# Appendix — UI strings inventory

> Source: `docs/ui-spec-field-measure-v2-hardened.md` + `docs/preflight-handoff-v0.3-hardened.md`.
> The complete set of user-visible copy, verbatim, keyed for `src/ui/strings.ts`.
> Count: 223 distinct strings. Generated 2026-09-21; revised for the touch-primary input model 2026-09-21.
>
> **Touch-primary revision (2026-09-21).** The app is switching from pen-first to **touch-primary**
> (`docs/gui-ux-readiness-and-design-handoff.md` §13, `docs/touch-first-interaction-model.md`). Rows
> whose `Source ref` reads **`TF §9`** are **proposed, not final** — the wording is the content owner's
> (`TF §9`). They are keyed and listed so `src/ui/strings.ts` has somewhere to put them, but they must
> **not** be treated as approved copy. Gap placeholders flagged **⚠ unapproved** are likewise keys only,
> never wording to ship.
>
> **Refs.** `U §x:line` = `docs/ui-spec-field-measure-v2-hardened.md`; `P §x:line` = `docs/preflight-handoff-v0.3-hardened.md`; `TF §x` = `docs/touch-first-interaction-model.md` (proposed design, **not canonical**).
> **Verbatim:** every `String` column is reproduced exactly as written between the guillemets — typos, punctuation, `…`, dash characters and inner whitespace preserved. No guillemets appear in the `String` column.
> **Interpolation:** the `Interpolation` column lists the runtime-filled parts; a blank cell means the string is literal. Example strings keep their literal example text (e.g. `Sheet 04`, `Saved 2:14 PM`) with the varying parts described here.

## firstRun

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| firstRun.handednessQuestion | Which hand do you write with? | First-run step 1 heading; two Right/Left cards (Right pre-selected) | U §4.4:171 | |
| firstRun.projectsFolderQuestion | Where should your projects live? | First-run step 2 heading; folder picker | U §4.4:172 | |
| firstRun.chooseFolder | Choose folder | First-run step 2 folder-picker button | U §4.4:172 | |
| firstRun.useDocumentsFolder | Use Documents\FieldMeasure | First-run step 2 suggested-default button | U §4.4:172 | |

## home

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| home.appName | FieldMeasure | Home top bar app mark (Archivo 700 20px) | U §11.1:658 | |
| home.newProject | New project | Home top bar primary button | U §11.1:658 | |
| home.recentHeader | Recent | Home section header above the project grid | U §11.1:659 | |
| home.projectCardMeta | 12 sheets · 48 MB · 2:14 PM | Home project card mono meta line | U §11.1:660 | `{sheetCount}` · `{size}` · `{time}` |
| home.projectCardPath | …\Documents\FieldMeasure\Riverside | Home project card path chip (middle-truncated, mono) | U §11.1:660 | `{path}` |
| home.folderNotFound | Folder not found | Home project card status line when the folder is missing/unwritable | U §11.1:660 | |
| home.locate | Locate… | Home project card action (re-pick folder) | U §11.1:660 | |
| home.openExistingFolder | Open existing folder… | Home secondary card (dashed) opening `showDirectoryPicker` | U §11.1:661; P §11.9:1882 | |
| home.importProject | Import a project | Home secondary card — CUT in v1 (§2.4) | U §11.1:661 | |
| home.renameHint | Renaming changes the project name, not the folder. | Home card long-press Rename copy | U §11.1:662; P §11.9:1882 | |
| home.renameHereHint | Renaming here changes the project name, not the folder. | Build-spec rename copy (§5.6) | P §5.6:803 | |
| home.removeFromListHint | Removes it from this list only. Files on disk are untouched. | Home card context menu "Remove from this list" | U §11.1:662 | |
| home.emptyHeadline | No projects yet | Home empty-state headline | U §11.1:667 | |
| home.emptyBody | Projects are just folders on this PC. Pick one and everything saves into it. | Home empty-state one-line body | U §11.1:667; P §11.9:1882 | |
| home.createProject | Create a project | Home empty-state primary button | U §11.1:667 | |
| home.openExistingFolderEmpty | Open an existing folder… | Home empty-state secondary button | U §11.1:667 | |
| home.offlineBanner | 2 projects can't be reached. They may be on a disconnected drive. | Home error banner across the top of the grid | U §11.1:669 | `{projectCount}` |
| home.retryAll | Retry all | Home offline-banner action | U §11.1:669 | |
| home.permissionPrompt | Windows needs permission to read this folder | Home card-level one-time permission prompt | U §11.1:670 | |
| home.permissionAllow | Allow | Home permission prompt action (re-invokes requestPermission) | U §11.1:670 | |
| home.noSearchResults | No projects match riv | Home search active, empty result | U §11.1:671 | `{searchTerm}` — `riv` is the example term |
| home.clearSearch | Clear | Home search empty-result action | U §11.1:671 | |

## project

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| project.sheetCount | 12 sheets | Project top bar count | U §11.2:677 | `{sheetCount}` |
| project.addTakePhoto | Take photo | Project add-sheet tile (primary, `--hi` tinted) | U §11.2:684 | |
| project.insetBadge | +2 | Project sheet card inset badge (top-right) | U §11.2:681 | `{insetCount}` |
| project.sheetMeta | 2:14 PM · 3 dimensions | Project sheet card mono meta line | U §11.2:682 | `{time}`, `{dimensionCount}` |
| project.selectionCount | 3 selected | Project selection bar / Style Chip when objects are selected | U §11.2:683; U §7.1:373 | `{count}` |
| project.reorderChip | Drop to move | Chip that follows a card while drag-reordering sheets | U §11.2:685 | |
| project.replacePhotoWarn | The new photo is a different size. Markup saved in the old photo's coordinates may land in the wrong place. | Project card menu / inset Replace-photo warned dialog (different dimensions) | U §11.2:686; P §8.5:1672 | |
| project.replacePhotoKeep | Keep markup | Replace-photo warned dialog (non-destructive choice) | U §11.2:686; P §8.5:1672 | |
| project.replacePhotoRemove | Remove markup | Replace-photo warned dialog (destructive choice, hold-to-confirm) | U §11.2:686; U §13.3:772; P §8.5:1654,1672 | |
| project.duplicateIdBadge | Copy | Home project-card badge for a duplicate-id folder (§5.8c) | P §5.8:840 | |
| project.makeSeparateProject | Make this a separate project | Offer when opening a copied project folder (mint a new id, rewrite project.json) | P §5.8:841–842 | |
| project.sheetNameExample | Sheet 04 | Default new-sheet name example (breadcrumb / sheet card) | U §4.2:148; U §5.1:185; U §5.2:223; P §20.6:2425 | `{sheetName}` (pattern `Sheet NN`, zero-padded 2, never renumbered) |
| project.sheetNameToastExample | Sheet 05 | Example sheet name substituted into the "Added …" capture toast | U §10.1:633 | `{sheetName}` |
| project.readOnlyChip | Read-only — changes can't be saved | Project top bar persistent error chip (folder unwritable) | U §11.2:688 | |
| project.notSavedToast | Not saved to disk | Toast shown on every mutation while the project is unwritable | U §11.2:688 | |
| project.fix | Fix… | Project read-only chip action (opens a folder re-pick) | U §11.2:688 | |
| project.noSheetsEmpty | No sheets yet — take a photo to start. | Project empty-state centered line | U §11.2:688 | |

## editor

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| editor.zoomPercent | 142% | Zoom pill value (bottom-left of canvas) | U §5.4:255 | `{zoomPercent}` |
| editor.cancel | Cancel | Keypad sheet ✕; Replace-photo warned dialog; Export progress | U §8.1:480; U §11.2:686; U §12:726; P §8.5:1672 | |
| editor.done | Done | Style editor sheet footer; Focus-mode chip; Project settings footer; Export result | U §7.5:447; U §9:596; U §11.3:692; U §12:727; P §8.5:1661 | |
| editor.breadcrumbProjectSegment | Project | Top bar breadcrumb segment placeholder (project name, inline-editable) | U §5.2:219 | `{projectName}` |
| editor.breadcrumbSheetSegment | Sheet | Top bar breadcrumb segment placeholder (sheet title, inline-editable) | U §5.2:219 | `{sheetName}` |
| editor.addLabel | Add label | Ghost button at the arrow tail; converts a leader into a callout | U §8.3:531; P §8.5:1581 | |
| editor.holdToShapeChip | ⇧ Shape | Chip shown during the freehand hold-to-shape gesture | U §8.4:539; P §8.5:1588 | |
| editor.lockedToast | Locked — unlock in Layers | Toast (+ shake) when trying to move a locked object | U §8.6:560; P §8.5:1559 | |
| editor.eraseNameRectangle | Rectangle | Erase object-mode name chip for a rectangle | U §8.7:566 | |
| editor.eraseNameDimension | Dimension 12' 6" | Erase object-mode name chip for a dimension | U §8.7:566; U §9:609 | `{measurement}` |
| editor.undo | Undo | Undo button; erase/capture/sheet-delete undo toasts | U §8.7:566; U §10.1:633; U §13.3:765 | |
| editor.clearSheetMarkup | Clear sheet markup… | Overflow menu destructive item (opens the counts + hold-to-confirm dialog) | U §8.7:569 | |
| editor.layersNameFreehand | Freehand | Layers panel row name for an ink object | U §9:609 | |
| editor.emptyHint | Tap a tool, then tap the photo | Editor empty-state canvas hint (new sheet) — **touch-primary wording** (was "Tap a tool, then draw on the photo") | U §17:927; TF §9 | |
| editor.layersEmpty | No markup yet | Layers panel empty state | U §17:930 | |
| editor.deleteSheet | Delete sheet | Undo semantics copy: post-write capture/import become delete-sheet ops | U §13.2:759 | |
| editor.replaceWarnFragment | markup may land in the wrong place | Destructive-policy table fragment for the Replace-photo warned dialog | U §13.3:772 | |
| editor.highlighterBandMessage | Highlighter always sits under other markup | Layers-panel refusal message on a cross-band drag (§20.2) | P §20.2:2348–2349 | |

## toolRail

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| toolRail.groupMove | MOVE | Tool rail group 1 header (Select, Pan & Zoom) | U §6.1:270; U §6.2:299 | |
| toolRail.groupMeasure | MEASURE | Tool rail group 2 header (Dimension, Angle) | U §6.1:271; U §6.2:297 | |
| toolRail.groupMark | MARK | Tool rail group 3 header (Line, Arrow, Rectangle, Ellipse, Polygon) | U §6.1:272; U §6.2:293 | |
| toolRail.groupAnnotate | ANNOTATE | Tool rail group 4 header (Freehand, Highlighter, Text) | U §6.1:273; U §6.2:290 | |
| toolRail.groupInsert | INSERT | Tool rail group 5 header (Image inset) | U §6.1:274 | |
| toolRail.groupErase | ERASE | Tool rail group 6 header (Erase/delete) | U §6.1:275 | |
| toolRail.eraseDisabledTooltip | Everything on this sheet is locked | Erase tool disabled tooltip (everything locked) | U §6.3:318 | |

## keypad

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| keypad.title | Enter dimension | ft-in keypad sheet header | U §8.1:480 | |
| keypad.useThisValue | Use this value | Keypad primary commit button (64px, `--hi`) | U §8.1:490,499 | |
| keypad.chain | Chain: commit & start next from B | Keypad chain button | U §8.1:491 | |
| keypad.fractionHalf | 1/2 | Keypad fraction/precision chip | U §8.1:484; P §6.1.1:985 | |
| keypad.fractionQuarter | 1/4 | Keypad fraction/precision chip | U §8.1:484 | |
| keypad.fractionEighth | 1/8 | Keypad fraction/precision chip | U §8.1:484 | |
| keypad.fractionSixteenth | 1/16 | Keypad fraction/precision chip | U §8.1:484; P §6.1.1:985 | |
| keypad.keepMeasured | Keep measured… | Keypad button — DEFERRED with calibration (§2.4) | U §17:951; P §2.4:209; P §8.5:1567 | |
| keypad.keepMeasuredSpaced | Keep measured … | Keypad button, spaced variant of the deferred control | U §8.1:495 | |
| keypad.cycleHint | ← /16 | Fraction cycling hint chip | U §8.1:497; P §6.1.1:1127 | |
| keypad.entryNowInches | Entry is now inches | 1.5s hint after tapping the `in` toggle | U §8.1:498; P §6.1.1:1126 | |
| keypad.projectPrecisionEighth | Project precision: 1/8 | Keypad chip confirming the project-level precision change | U §8.1:498 | `{denominator}` |
| keypad.ftToggle | ft | Keypad unit toggle (routes to the feet slot) | P §6.1.1:1126 | |
| keypad.inToggle | in | Keypad unit toggle (re-scopes entry to inches) | P §6.1.1:1126 | |
| keypad.offlineNote | Saved locally, will write when the folder is back. | Keypad sheet error state when the folder is unavailable at commit — **C14 keypad offline note is already quoted** (no change needed) | U §8.1:514 | |

## dimension

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| dimension.toolName | Dimension | Style Chip tool name / panel diagram | U §7.1:372; U §7.2:381 | |
| dimension.unitFtIn | ft-in | Style Chip sub-label when the tool produces values; keypad ghost unit tag in the live parse preview | U §7.1:372; U §8.1:497 | |
| dimension.projectPrecision | Project precision: 1/16 | Dimension panel chip confirming the project precision | U §7.2:406; P §21.2:2476 | `{denominator}` |
| dimension.projectPrecisionTemplate | Project precision: … | Changelog template for the precision chip | U Appendix:953 | `{denominator}` |
| dimension.notCalibrated | Not calibrated | Warning chip — DEFERRED with calibration (not in v1) | U §7.2:406; U §8.1:504; U §17:951 | |
| dimension.polygonArea | ≈ sq ft | Polygon area readout unit suffix — DEFERRED | U §7.2:412 | |
| dimension.polygonAreaExample | ≈ 214 sq ft | Polygon live area readout example — DEFERRED | U §8.3:534 | `{area}` |
| dimension.snapChip90 | 90° | Snap chip shown near 0°/45°/90° | U §8.1:466; P §8.5:1562 | |
| dimension.snapChip45 | 45° | Angle tool hard-snap chip near 0°/45°/180° | U §8.2:522; P §8.5:1573 | |
| dimension.ghostLabel | tap to enter value | Ghost label on a kept-but-valueless dimension (cyan outline) | U §8.1:501; U Appendix:964 | |
| dimension.idleChip | Dimension · ft-in · 1/8 | Style Chip idle state for the Dimension tool | U §8.1:509 | `{unitFormat}`, `{fraction}` |
| dimension.calibrateScale | Calibrate scale | Long-press Dimension option — DEFERRED (no pxPerFoot UI in v1) | U §8.1:504 | |
| dimension.thisLineIs | This line is… | Calibration true-length prompt — DEFERRED | U §8.1:504 | |
| dimension.complementChip | Complement 46.8° | Angle commit sheet complement chip | U §8.2:523 | `{angle}` |
| dimension.supplementChip | Supplement 136.8° | Angle commit sheet supplement chip | U §8.2:523 | `{angle}` |
| dimension.complement | Complement | Angle commit sheet chip (build-spec short form) | P §8.5:1574 | |
| dimension.supplement | Supplement | Angle commit sheet chip (build-spec short form) | P §8.5:1574 | |
| dimension.chainFromRay | Chain from this ray | Angle commit sheet chain button | U §8.2:523 | |

## style

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| style.widthReadout | 3 pt | Width scrubber readout (style panel) | U §7.2:401 | `{widthPt}` |
| style.transparencyReadout | 35% | Transparency readout (style panel) | U §7.2:393 | `{percent}` |
| style.appliedToSelection | Applied to 3 objects | Apply-to-selection hint (4s) after a style edit on a selection | U §7.3:428 | `{objectCount}` |
| style.alsoSetDefault | Also set as default for this tool | Action in the apply-to-selection hint | U §7.3:428 | |
| style.selectionHeader | 3 objects selected | Style panel header when objects are selected | U §7.4:436 | `{objectCount}` |
| style.deselect | Deselect | ✕ button in the style panel selection header | U §7.4:436 | |
| style.mixedValue | Mixed | Indeterminate mixed-values placeholder chip (multi-select) | U §7.4:437 | |
| style.applyToSelection | Apply to selection | Synchronous-mode toggle label | U §7.4:438 | |
| style.applyToScope | Apply to: Text (2) · Dimension (1) | Scope chip for a heterogeneous selection | U §7.4:438 | `{typeCounts}` |
| style.copyStyle | Copy style | Selection mini-toolbar (Ctrl+Alt+C) | U §7.4:440 | |
| style.pasteStyle | Paste style | Selection mini-toolbar (Ctrl+Alt+V) | U §7.4:440 | |
| style.moreStyles | More styles… | Style editor sheet opener (also long-press on the panel header) | U §7.5:445 | |
| style.saveAsPreset | Save as preset… | Style editor sheet action | U §7.5:447 | |
| style.resetDefaults | Reset to defaults | Style editor sheet destructive text button | U §7.5:447 | |
| style.presetsError | Presets couldn't be loaded — changes will apply to this session only. | Style editor sheet inline warn strip (folder unavailable) | U §7.5:449 | |
| style.snapToggle | Snap | Angle tool style-panel snapping toggle | U §8.2:522 | |
| style.highlighterStraightLine | Straight line | Highlighter long-press "straight-line lock" option | U §8.4:540 | |

## inset

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| inset.placeHint | Tap where the inset should go | Hint chip during inset insertion — **touch or pen** (no "following the pen"; touch has no hover) | U §9:578; TF §6.3 | |
| inset.takePhoto | Take a photo | Insert picker sheet row (launches capture in inset mode) | U §9:580 | |
| inset.chooseFromDevice | Choose from device | Insert picker sheet row (OS file picker, multi-select) | U §9:581 | |
| inset.recentPhotos | Recent photos | Insert picker sheet row (4×2 grid of recent project images) | U §9:582 | |
| inset.insertAs | Insert as: ‹Inset› / ‹New sheet› | Editor import segmented override control | U §10.2:646 | |
| inset.focusBreadcrumb | Sheet 04 › Inset 2 | Focus-mode breadcrumb chip docked top-center of the canvas | U §9:596; P §8.5:1661 | `{sheetName}` › `{insetName}` |
| inset.nestedTooltip | Nested insets aren't supported | Inset tool disabled tooltip inside Focus mode | U §9:598; P §8.5:1661 | |
| inset.loading | Loading photo… | Inset placeholder shimmer while a large photo decodes | U §9:611 | |
| inset.openError | Couldn't open this image | Inset error placeholder (unsupported/corrupt file) | U §9:611 | |
| inset.chooseAnother | Choose another | Inset error action | U §9:611 | |
| inset.removePhoto | Remove | Inset error action | U §9:611 | |
| inset.layersName | Inset 2 | Layers panel row name for an inset | U §9:609 | `{insetName}` |
| inset.focusControl | Focus | Style-panel inset control label (2nd-tap/manual Focus action) | U §9:590 | |
| inset.keepMarkupAnyway | Keep markup anyway — it may land in the wrong place | Replace-photo warned dialog (inset, warned choice) | P §8.5:1654 | |

## capture

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| capture.close | Close | Capture top-left close button | U §10.1:623 | |
| capture.resolutionHigh | High (device max) | Capture resolution toggle (real device max from the 0.2 spike) | U §10.1:624; P §11.8:1872; P §21.7:2525 | `{deviceMaxResolution}` |
| capture.resolutionFast | Fast | Capture resolution toggle | U §10.1:624; P §11.8:1872; P §21.7:2525 | |
| capture.aeAfLock | AE/AF LOCK | Chip shown when focus/exposure is long-press locked | U §10.1:625 | |
| capture.importButton | Import | Capture bottom bar (file picker); also the Project add-sheet tile | U §10.1:627; U §11.2:684 | |
| capture.retake | Retake | Capture review screen secondary button | U §10.1:632 | |
| capture.usePhoto | Use photo | Capture review screen primary button (64px, `--hi`) | U §10.1:632 | |
| capture.autoEnhance | Auto-enhance | Review screen toggle — DEFERRED in v1 (§2.4) | U §10.1:632 | |
| capture.discardConfirm | Discard this photo? The sheet's markup will be kept if the new photo is the same size. | Retake confirmation when replacing an existing sheet photo (hold-to-confirm) | U §10.1:635 | |
| capture.adding | Adding… | Inline progress bar while the capture is written to disk | U §10.1:637 | |
| capture.openWindowsCamera | Open Windows Camera | Camera-unavailable fallback button | U §10.1:639 | |
| capture.importAPhoto | Import a photo | Camera-unavailable fallback button | U §10.1:639 | |
| capture.embeddedFallback | Camera unavailable in this browser. Open Windows Camera or Import a photo instead. | Capture fallback panel (UI spec; embeds the two fallback buttons) | U §10.1:639 | `{Open Windows Camera}`, `{Import a photo}` are embedded button labels |
| capture.unavailableFallback | Camera unavailable… Open Windows Camera or Import a photo. | Camera-unavailable panel (build spec) | P §11.8:1875 | |
| capture.unavailable | Camera unavailable | Capture state-matrix label | U §17:928 | |
| capture.useWindowsCameraPromoted | Use the Windows Camera app for detail shots | Promoted fallback copy when the device max is ≤ 1080p | P §21.7:2527 | |

## export

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| export.button | Export | Editor/Project top bar button; wizard primary button | U §11.2:677; U §12:723 | |
| export.scopeThisSheet | This sheet | Export wizard step 1 scope toggle (default in the Editor) | U §12:712 | |
| export.scopeSelected | Selected sheets (3) | Export wizard step 1 scope toggle (default with a grid selection) | U §12:712 | `{count}` |
| export.scopeAll | All sheets (12) | Export wizard step 1 scope toggle | U §12:712 | `{count}` |
| export.pageSizeFit | Fit to photo | PDF page-size option (one page per sheet at the photo's aspect) | U §12:716 | |
| export.quality3xWarning | Slow on this device — expect a wait | Warning shown under the 3× quality option on a low-RAM device | U §12:716; P §9.5:1734 | |
| export.flattenMarkup | Flatten markup | Export wizard checkbox — removed in v1 (always flattened, deferred to 1.1) | U §12:716 | |
| export.summaryPage | dimensions summary page | Export wizard checkbox — DEFERRED | U §12:716 | |
| export.includeSheetNames | Include sheet names in pages | Export wizard checkbox (PDF options) | U §12:716 | |
| export.pngSize | Size: 1× / 2× / 3× | PNG options size control | U §12:717 | `{multipliers}` |
| export.zipSingle | Zip into a single .zip | PNG options checkbox (default ON) | U §12:717 | |
| export.conflictAdd | Add (1), (2)… | Filename conflict policy (default) | U §12:718 | |
| export.conflictOverwrite | Overwrite | Filename conflict policy | U §12:718 | |
| export.conflictSkip | Skip | Filename conflict policy | U §12:718 | |
| export.chooseFolder | Choose folder… | Destination step folder picker | U §12:721 | |
| export.rememberDestination | Remember this destination for this project | Destination step checkbox | U §12:721 | |
| export.destination | Destination | Destination summary heading | U §12:722 | |
| export.writeSummary | Will write 6 files (18.4 MB) to:  …\Riverside Elementary\exports\2026-09-21_1412\ | Destination summary line (note the double space after `to:`) | U §12:722 | `{fileCount}`, `{size}`, `{path}` |
| export.resultSummary | Exported 6 files (18.4 MB) | Export result view summary | U §12:727 | `{fileCount}`, `{size}` |
| export.copyPath | Copy path | Export result action (replaces the impossible "Show in Explorer") | U §12:727; P §2.4:225 | |
| export.revealFolder | Reveal folder | Export result action (`showDirectoryPicker({ startIn })`) | U §12:727; P §2.4:225; P §9.5:1731; P §11.10:1893 | |
| export.openFolder | Open folder | Export result action — CUT (impossible from a PWA; never ship) | U §12:727 | |
| export.exportAgain | Export again | Export result action | U §12:727 | |
| export.dropboxHint | Drag this folder into Dropbox when you're back on Wi-Fi. | Export result instructional line (`--g300`) | U §12:727 | |
| export.selectAtLeastOne | Select at least one sheet | Export empty-scope state; primary disabled | U §12:730; U §17:929 | |
| export.damagedPhotoSummary | N sheets exported without their photo | Export result view list for damaged-photo sheets | P §19.4:2230 | `{sheetCount}` |
| export.tooLargeFor3x | This sheet is too large to export at 3× on this device | Export hard memory-budget guard message | P §19.4:2244 | |

## storage/autosave

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| storage.saved | Saved 2:14 PM | Autosave chip Saved state; editor top bar | U §13.1:742; U §5.1:185 | `{time}` |
| storage.saving | Saving… | Autosave chip Saving state | U §13.1:743; U §11.4:698 | |
| storage.pending | Pending — folder offline | Autosave chip offline/pending state | U §13.1:744; U §11.4:699 | |
| storage.locateFolder | Locate folder… | Autosave chip pending action (explanation + re-pick) | U §11.4:699,744 | |
| storage.saveACopy | Save a copy… | Write-failure action (download the file) — capture, autosave chip | U §10.1:637; U §11.4:699,744; U §13.1:746 | |
| storage.readOnly | Read-only | Autosave chip read-only state | U §11.4:700,745 | |
| storage.rePickFolder | Re-pick folder | Autosave chip read-only action (explanation + re-pick) | U §13.1:745 | |
| storage.couldntSave | Couldn't save | Autosave chip error state | U §13.1:746 | |
| storage.copyErrorDetails | Copy error details | Autosave chip error-state action | U §13.1:746 | |
| storage.local | Local · 48 MB · Saved 2:14 PM | Storage chip normal state (Home + Editor top bars) | U §11.4:697 | `{size}`, `{time}` |
| storage.offline | Offline · no network needed | Storage chip offline reassurance (shown once on first install) | U §11.4:701; U §14.15:803 | |
| storage.diskFull | Disk full — free space to save | Autosave chip disk-full state (§5.8a) | P §5.8:825 | |
| storage.openInAnotherTab | Open in another tab — read only | Second-tab read-only notice (§5.8d) | P §5.8:849 | |
| storage.takeOver | Take over | Second-tab action (reloads after the other tab releases) | P §5.8:850 | |

## trash

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| trash.open | Trash… | Project ⋯ menu item opening the 14-day trash restore UI | U §13.3:766; P §2.4:217; P §11.9:1884 | |
| trash.restore | Restore | Trash list restore action (writes the sheet folder back + undo toast) | U §11.2:677; U §13.3:766; P §11.9:1884 | |

## history

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| history.snapshotSummary | Before: Clear sheet markup (14 objects) | History flyout row one-line summary (time + summary) | U §13.1:750 | `{action}`, `{objectCount}` |
| history.restoreVersion | Restore this version | History read-only snapshot preview action | U §13.1:750 | |

## toasts

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| toasts.ctrlS | Everything saves automatically. | Toast on Ctrl+S (deliberate no-op reassurance) | U §6.6:356 | |
| toasts.undoAction | Undid: Delete dimension 12' 6" | Undo toast showing the undone action name | U §13.2:757 | `{actionName}` |
| toasts.sheetDeleted | Sheet deleted · Undo | Sheet-delete toast (10s, with Undo) | U §13.3:766 | |
| toasts.updateReady | Update ready — reload when you're done | Service-worker update toast (§19.2; suppressed mid-write/mid-measurement) | P §13/1.11:2033; P §19.2:2204 | |
| toasts.addedSheet | Added Sheet 05 | Toast after "Use photo" from Home/Project (+ Undo) | U §10.1:633 | `{sheetName}` |

## settings

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| settings.penOnly | Pen only | Settings → Input toggle: limits finger gestures to two-finger pan/zoom. **No longer the only input filter** — it sits alongside the four touch toggles below. **Default OFF** under touch-primary (was the default safety mode under pen-first) | U §14.7:795; TF §7.7 | |
| settings.touchPlaces | Touch places and moves | Settings → Input toggle — permits tap/tap and drag to place and move geometry. **Default ON** | TF §9; TF §0, §7.7; U §14.7:270 | |
| settings.fingerDraws | Finger draws (freehand) | Settings → Input toggle — permits finger freehand ink (pressure→width off, width floor 8 mu, smoothing 60). **Default OFF** | TF §9; TF §0, §4.2, §7.7; U §14.7:270 | |
| settings.magnifierOnTap | Magnifier when you tap | Settings → Input toggle — the touch loupe on placement (200px, 4×, contact disc). **Default ON** | TF §9; TF §2.1, §7.7; U §8.1:479 | |
| settings.glovedTouch | Gloved touch (bigger touch targets) | Settings → Input toggle — hit slop +8px, snap acquire +4px, loupe offset +16px. **Default OFF** | TF §9; TF §7.6, §7.7; U §14.7:270 | |

**Note.** `TF §9` strings in this section are **proposed, not final** (see the touch-primary revision
note at the top of this file). `settings.penOnly` keeps its existing quoted string; only its scope and
default context change.

## placement

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| placement.firstPoint | Tap the first point | Hint chip, AnchorA-1 | TF §9 | |
| placement.secondPoint | Tap the second point | Hint chip, AnchorA | TF §9; U §8.1:473,529 | |
| placement.adjustEndpoints | Adjust endpoints | Placement HUD / keypad sheet | TF §9; U §8.1:491,513 | |
| placement.adjusting | Adjusting dimension | Top-centre chip in edit mode | TF §9 | |
| placement.undoPoint | Undo point | Polygon HUD | TF §9; U §8.3:559 | |
| placement.closeShape | Close shape | Polygon HUD | TF §9; U §8.3:559 (as `✓ Done`) | |

**Note.** `TF §9` strings — **proposed, not final**. `placement.*` is the tap-tap placement grammar's
copy (`TF §1`); `placement.undoPoint` / `placement.closeShape` replace the keyboard-only `Backspace` /
`Enter` affordances for Polygon.

## select

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| select.touchHint | Drag to move. Two fingers to pan. | One-time hint, first touch selection | TF §9 | |

**Note.** `TF §9` string — **proposed, not final**. Stating the §3.1 drag predicate and the reserved
two-finger pan in one line.

## touch

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| touch.drawnVsTyped | The value you type is the measurement. The line shows where you put it. | One-time hint, first touch dimension | TF §9 | |
| touch.freehandPenBetter | Freehand is most precise with the pen. | One-time hint, first finger freehand | TF §9; U §7.2:425; U §8.4:563 | |

**Note.** `TF §9` strings — **proposed, not final**. These are the two hand-off honesty lines
(`TF §8` risks 1 and 7); `touch.drawnVsTyped` is the typed-measurement reframing from
`docs/gui-ux-readiness-and-design-handoff.md` §13.7.

## erase

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| erase.strokeNeedsPen | Splitting a stroke needs the pen. Touch can delete the whole stroke. | Erase panel note shown under touch (stroke mode hidden) | TF §9; TF §4.1 | |

**Note.** `TF §9` string — **proposed, not final**. Under touch, stroke-split erase is pen-only and the
stroke-mode control is hidden; this note explains why.

## errors

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| errors.retry | Retry | Retry button: presets warn strip; autosave chip; per-file export error | U §7.5:449; U §12:728; U §13.1:746 | |
| errors.folderPermissionExpired | Folder permission expired | Per-file export error | U §12:728 | |
| errors.reAuthorize | Re-authorize | Per-file export error action | U §12:728 | |
| errors.fileOpenAnotherApp | File is open in another app | Per-file export error (short form) | U §12:728 | |
| errors.fileOpenAnotherAppRetry | File is open in another app — Retry | Autosave chip target-locked state (§5.8b) | P §5.3:679; P §5.8:833 | |
| errors.notEnoughDiskSpace | Not enough disk space | Per-file export error (shows the shortfall) | U §12:728 | |
| errors.diskFullShort | Disk full | Build-spec disk-full state name (§5.3 tag) | P §5.3:683 | |
| errors.photoDamaged | Photo damaged — markup preserved. Re-import or replace the photo. | Truncated/absent-photo load-time error (§5.3) | P §5.3:786 | |
| errors.originChanged | This app moved to a new address | Origin-guard blocking screen (§21.1) | P §21.1:2461 | |

## a11yLabels

| Proposed key | String (verbatim, no guillemets) | Where it appears (screen/component) | Source ref (file §/line) | Interpolation |
|---|---|---|---|---|
| a11y.dimensionTool | Dimension tool, hi-vis orange, 4 point, arrowheads both | Example `aria-label` naming a tool and its current style (icon-only control) | U §14.10:798 | `{color}`, `{widthPt}`, `{arrowheads}` |

## Excluded (not UI copy)

| Excluded string | Source ref (file §/line) | Reason |
|---|---|---|
| guillemets | U §0:6 | Meta mention of the `«…»` notation itself; not UI copy. |
| — | U §7.4:437 | Stray em-dash matched by the guillemet scan; it is the indeterminate "mixed value" readout glyph, not copy. |
| {date} {time} | U §11.3:692 | Default sheet-naming token template for exports; file-naming tokens, not on-screen copy. |
| {project}_{index}-{sheet} | U §12:718 | Export filename template; file-naming tokens, not on-screen copy. |
| Riverside Elementary | U §4.2:148; P §9.5:722 | Example project name (fixture data), not a shipped string. |
| Riverside Elem | U §5.1:185 | Example project name (truncated fixture), not a shipped string. |
| riv | U §11.1:671 | Search-filter example term inside `No projects match riv`; the template is captured as `home.noSearchResults`. |
| 04 | U §11.2:680 | Example sheet-index badge value (runtime number), not a shipped string. |
| device max | U §10.1:624 | Prose reference to the value inside `High (device max)`; not separate copy. |

## Gaps — implied copy with no «…» string

These places clearly require user-visible text but the specs provide no guillemet string. The builder would otherwise invent them. (Spec refs use the same `U`/`P` convention.)

1. **Settings screen** — `P §20.5(b)` defines the whole screen (group headers `Input`, `Units`, `Display`, `Storage`, `About`; row labels and controls, `Change folder…`, persistent-storage state text, build version + date, `Third-party notices`) but gives no strings at all. Only `Pen only` is quoted (and that from `U §14.7`).
   - **⚠ unapproved keys (C14):** `settings.headingInput`, `settings.headingUnits`, `settings.headingDisplay`, `settings.headingStorage`, `settings.headingAbout`, `settings.changeFolder`, `settings.storageProtected`, `settings.storageNotProtected`, `settings.buildVersion`, `settings.thirdPartyNotices` — plus the four touch toggles now quoted-by-proposal in `## settings` above (`TF §9`, default context added). Proposed wording lives in `docs/appendix-strings-gaps.md` §1 and is **not final copy**; the touch toggles need content-owner approval before shipping.
2. **Theme options** — `U §14.2` (`Standard` / `Sunlight` / `Dim`) and **density options** `U §3.5` (`Field` / `Desk`) are backticked, not quoted.
3. **Home sort control** — `U §11.1:659` names `Sort: Recent ▾` and the options `Recent` / `Name` / `Size` / `Needs attention`; none are quoted.
   - **⚠ unapproved keys (C14):** `home.sortLabel`, `home.sortRecent`, `home.sortName`, `home.sortSize`, `home.sortNeedsAttention` (`docs/appendix-strings-gaps.md` §3).
4. **Home search field** — `U §11.1:658` places a search field with no placeholder or label copy.
   - **⚠ unapproved key (C14):** `home.searchPlaceholder` (`docs/appendix-strings-gaps.md` §4).
5. **Unit-format & precision option labels** — `U §7.2:406` (`ft-in` / `in` / `decimal ft`; precision `1/16`→`1"`); only `ft-in` is quoted.
6. **Style panel section headers and control labels** — `U §7.2` / `P §11.5`: `COLOR`, `WIDTH`, `FILL`, `TRANSPARENCY`, `LINE STYLE`, `ARROWHEADS`, `PRESETS ▾`, `RECENT`; per-tool controls `Border`, `Opacity`, `Corner radius`, `Crop…`, `Replace photo`, `Shadow`, `Arc radius`, `Precision`, `Unit format`, `Elbow`, `Sides`, `Close path`, `Pressure→width`, `Smoothing`, `Perfect shape`, `Chisel width`, `Straight-line lock`, `Bold`, `Align`, `Background`, `Leader`, `Mode`, `Scope`, `Ink`, `Markup`, `Everything` — none quoted.
   - **⚠ unapproved keys (C14):** `style.sectionColor`, `style.sectionWidth`, `style.sectionFill`, `style.sectionTransparency`, `style.sectionLineStyle`, `style.sectionArrowheads`, `style.presetsMenu`, `style.recentHeader`, plus the per-tool control keys — see the C14 table below and `docs/appendix-strings-gaps.md` §6. The section headers (`COLOR`, `WIDTH`, …) are the placeholder labels, **not** final copy.
7. **Layers panel** — `U §8.6` / `P §8.6`: group names `Markup`, `Dimensions`, `Shapes`, `Ink`, `Text`, `Photo`; row context menu `Bring to front`, `Send to back`, `Group`, `Ungroup`, `Rename`, `Delete`; the eye and lock toggles need labels — none quoted.
8. **Selection mini-toolbar** — `U §8.6:557`: `Duplicate`, `Delete`, `Lock`, `Bring to front`, `Send to back`, `Edit points`, `Replace photo`, `Focus`, `Edit text` — none quoted (only `Copy style` / `Paste style` are).
9. **Editor overflow menu** — `U §5.2:221`: `Duplicate sheet`, `Insert image`, `Add sheet`, `Import file`, `Sheet info`, `Project settings`, `Settings`, `Help`, `Keyboard shortcuts` — none quoted.
10. **Project / sheet card menus** — `U §11.1:662` and `U §11.2:686`: `Rename`, `Export all`, `Remove from this list`, `Delete files…`, `Open`, `Duplicate`, `Replace photo`, `Delete` (plus cut `Rotate` / deferred `Duplicate project`) — none quoted.
11. **Tool names and hover tooltips** — `U §6.3:313`: the 14 tool names shown in the tooltip pill (`Select`, `Pan & Zoom`, `Dimension`, `Angle`, `Line`, `Arrow / Leader`, `Rectangle`, `Ellipse`, `Polygon`, `Freehand`, `Highlighter`, `Text note`, `Image inset`, `Erase`) — no strings; group `More ▸`/options chevrons likewise. **⚠ touch-primary:** pen hover has no touch equivalent (`TF §6.3`); under touch the pill is reached by press-and-hold on the rail, and the Style Chip names the active tool.
   - **⚠ unapproved keys (C14):** `tool.select`, `tool.panZoom`, `tool.dimension`, `tool.angle`, `tool.line`, `tool.arrowLeader`, `tool.rectangle`, `tool.ellipse`, `tool.polygon`, `tool.freehand`, `tool.highlighter`, `tool.textNote`, `tool.imageInset`, `tool.erase`, `tool.moreGroups` (`docs/appendix-strings-gaps.md` §11).
12. **Per-tool first-use tips** — `U §4.4:174`: "Contextual tips appear the first time each tool is used (one line, dismissible…)" — the actual tip lines are unspecified.
   - **⚠ touch-primary:** `docs/appendix-strings-gaps.md` §12 currently proposes **pen-first** tips (`Draw from A to B…`, `Drag to draw a line…`, `Draw with the pen…`). These **must not ship**; they are superseded by the tap-tap drafts under "C14 gap keys touched by the touch-primary change" below. Keys: `tips.select`, `tips.panZoom`, `tips.dimension`, `tips.angle`, `tips.line`, `tips.rectangle`, `tips.freehand`, `tips.textNote`, `tips.imageInset`, `tips.erase` — **⚠ unapproved.**
13. **Tool long-press option popovers** — `U §6.3:316`: e.g. Rectangle corner radius, Freehand pressure/smoothing/perfect-shape, Dimension precision & calibration, Erase mode — option labels unquoted.
14. **Capture toggles/tooltips** — `U §10.1:624`: torch/flash, grid overlay, level indicator, camera flip (front/rear), zoom chips `0.5× / 1× / 2×`, and auto-capture-on-level — no labels.
   - **⚠ unapproved keys (C14):** `capture.torch`, `capture.grid`, `capture.level`, `capture.flip`, `capture.zoomHalf`, `capture.zoomOne`, `capture.zoomTwo`, `capture.autoCapture` (`docs/appendix-strings-gaps.md` §14). Touch-primary adds no capture changes, but the labels are still unfilled.
15. **Autosave chip tap explanations** — `U §13.1:744–746`: "Explains, offers …" / "Explains and offers Re-pick folder" / "Expands to a full explanation" — the explanation body copy is unspecified.
16. **Destructive confirm dialogs** — `U §8.7:569`, `U §13.3:768`, `P §8.5`: the `Clear sheet markup…` dialog title/body and per-category checkbox labels; the `Delete files…` dialog title/body and "type the project name" instruction. Only button labels are quoted.
17. **Export wizard chrome** — `U §12:709`: step rail `1 Scope · 2 Format · 3 Destination`, footer `Back` / `Next`, format radio cards `PDF` / `PNG`, `Select all / none`, token buttons (`{project}` `{sheet}` `{index}` `{date}` `{time}`), per-file `✓ / … / ✕` states — no strings.
18. **Service-worker update toast buttons** — `P §19.2:2204`: `Reload` and `Later` are named but not quoted (only the toast body is).
19. **Origin-change recovery body** — `P §21.1:2461`: the explanatory body and the `Pick my projects folder` button are not quoted (only the headline is).
20. **Folder permission / reconnect states** — `P §5.2:637–638`, `P §5.6:804`: "Project folder needs permission", "Reconnect folder", "Project folder unavailable" — no strings.
21. **First-run handedness card labels** — `U §4.4:171`: `Right` / `Left` (Right pre-selected) — no strings.
   - **⚠ unapproved keys (C14):** `firstRun.handednessRight`, `firstRun.handednessLeft` (`docs/appendix-strings-gaps.md` §21). Under touch-primary the handedness answer still mirrors the rail/style panel/loupe/keypad (`TF §7`, `U §14.8`) — the labels themselves do not change.
22. **Angle commit sheet precision toggles** — `U §8.2:523`: `1°` / `0.5°` / `0.1°`, and the live readout `≈ 43.2°` — unquoted.
23. **Text tool option values** — `U §8.5:545`: background `none` / `pill` / `solid` / `auto-contrast` and align `L/C/R` — unquoted.
24. **Project settings sheet field labels** — `U §11.3:692`: name, default units & precision, unit format, default sheet-naming template, default export destination, strip-GPS toggle — labels unquoted.
25. **`aria-label` for every icon-only control** — `U §14.10:798` only gives one example (`Dimension tool, …`). All other icon-only controls need names with no supplied copy: Layers, Export, zoom `−`/`+`/`Fit`, torch, shutter, grid, level, camera flip, undo/redo, rotate, selection handles, eye/lock toggles, close buttons.
26. **Empty/loading states without copy** — Home loading skeletons (`U §11.1:668`), Project loading 8 skeleton cards (`U §11.2:688`), Editor photo-decode placeholder + shimmer (`U §17:927`), and the Capture `Adding…` progress context — no accompanying text is specified.

### C14 gap keys touched by the touch-primary change (⚠ all unapproved)

Added 2026-09-21 so the C14 gaps this change depends on carry a key rather than being silently
invented. Every string in `docs/appendix-strings-gaps.md` is a **builder proposal**; none is approved
copy and none may ship into `src/ui/strings.ts` until the content owner signs off.

| Gap (item above) | Proposed key(s) — ⚠ unapproved | Placeholder (NOT final copy) | Proposed wording lives in |
|---|---|---|---|
| 6 — Style panel section headers | `style.sectionColor`, `style.sectionWidth`, `style.sectionFill`, `style.sectionTransparency`, `style.sectionLineStyle`, `style.sectionArrowheads`, `style.presetsMenu`, `style.recentHeader` (+ per-tool control keys) | the spec's backticked labels (`COLOR`, `WIDTH`, `FILL`, `TRANSPARENCY`, `LINE STYLE`, `ARROWHEADS`, `PRESETS ▾`, `RECENT`) | `appendix-strings-gaps.md` §6 |
| 11 — Tool tooltips | `tool.select` … `tool.erase`, `tool.moreGroups` | the 14 tool names | `appendix-strings-gaps.md` §11 |
| 12 — Per-tool first-use tips | `tips.select`, `tips.panZoom`, `tips.dimension`, `tips.angle`, `tips.line`, `tips.rectangle`, `tips.freehand`, `tips.textNote`, `tips.imageInset`, `tips.erase` | **superseded — pen-first drafts must not ship** (see below) | `appendix-strings-gaps.md` §12 (needs rewrite) |
| 14 — Capture toggles / tooltips | `capture.torch`, `capture.grid`, `capture.level`, `capture.flip`, `capture.zoomHalf`, `capture.zoomOne`, `capture.zoomTwo`, `capture.autoCapture` | `Torch`, `Grid`, `Level`, `Flip camera`, `0.5×`, `1×`, `2×`, `Auto-capture when level` | `appendix-strings-gaps.md` §14 |
| 21 — First-run handedness cards | `firstRun.handednessRight`, `firstRun.handednessLeft` | `Right` / `Left` | `appendix-strings-gaps.md` §21 |

**Note (C5 — Recents chip size).** C5 (Recents chips `40px → 44px`) is **already applied**
(commit `5fa9515`, to `U §7.3`/`§14.5`). It is **layout-only**: no UI string carries the Recents-chip
size, so **no copy change is required** and `style.recentHeader` is unaffected. Retained here only so
a reader does not expect a string edit for C5.

**Note (pen-presuming copy, `TF §13.4`).** The following existing/proposed copy presumes a pen and
must be rewritten for touch-primary:
- `inset.placeHint`'s "following the pen" placement note — **fixed** above to "touch or pen".
- Gap 11's "pen-hover tooltip pill" — pen hover has no touch analogue (`TF §6.3`); the touch
  equivalent is the Style Chip naming the tool plus press-and-hold for name + options.
- Gap 12's proposed tips `Draw from A to B…`, `Drag to draw a line…`, `Draw with the pen…` — these
  live in `docs/appendix-strings-gaps.md` §12, which this file does not edit. Under `TF §1.1`/`§1.2`
  the placement tools are **tap-tap** and Freehand is pen-first/opt-in. **Corrected drafts (⚠ not
  final copy, pending content-owner approval):** `tips.dimension` = "Tap the first point, then the
  second, then type the measurement."; `tips.line` = "Tap the first point, then the second.";
  `tips.rectangle` = "Tap two opposite corners."; `tips.angle` = "Tap the vertex, then each end
  point."; `tips.freehand` = "Draw with the pen — or turn on Finger draws." The gap-12 row in
  `appendix-strings-gaps.md` must be reconciled by its owner.

## Summary

**223 distinct strings** — 212 unique guillemet matches (single-line scan) − 9 non-copy exclusions + 3 wrap/missing-guillemet cases (`Make this a separate project`, `Highlighter always sits under other markup`, `Focus`) + 3 nested-guillemet outer strings the scan misses (`Added Sheet 05`, `Camera unavailable in this browser. Open Windows Camera or Import a photo instead.`, `No projects match riv`) **+ 14 touch-primary rows** (`editor.emptyHint` reworded; `placement.*` ×6, `select.touchHint`, `touch.*` ×2, `erase.strokeNeedsPen`, `settings.*` toggles ×4 — all `TF §9` **proposed, not final**). Gap keys flagged **⚠ unapproved** are not counted; they are placeholders, not strings. The `Interpolation` column documents the runtime-filled parts of otherwise-literal example strings.
