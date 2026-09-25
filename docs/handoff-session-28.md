# Handoff: session 28 (2026-09-25)

Branch **`beta-readiness-wave-2`** (pushed). It is not merged to `main`; open a PR when the owner is ready.

## What shipped this session

| Area | Decisions | Commits (oldest first) |
|---|---|---|
| Wave 2 refactors R1-R4 (gesture arbiter, route reducer + project actions, reorder hook, camera session) | none (behaviour-preserving) | `6fcdcea` `81b8c65` `f8a4e4f` `b08e145` |
| Wave 3 R5 `ProjectSession` (one refcounted owner per open project) | D144 | `5d1d862` |
| Wave 3 R6 `EditorController`; switching sheets no longer remounts; `SheetEditor.tsx` 2943 → 1186 lines | D145 | `bc7fa39` `db1f6fd` + step 3 |
| Settings: AE/AF lock toggle (default **off**), export location (dated or project folder) | | `20fe0f4` |
| Rear camera by default; long-press lock only when enabled | D146 | `2e32c44` |
| One-page export (no step rail); default location from Settings; «Copy folder path» + per-file «Open» (a browser cannot open File Explorer; the owner accepted this) | D147 | `5d3e4f2` |
| «Use photo» opens the new sheet in the editor (not the grid) | D148 | `345d9ff` |
| One-column tool rail (Measure, Annotate, Mark on top; 48 px buttons); style dock three swatches wide (176 px) | D149 | `015a969` `adea1c7` |
| Slim filled dimension arrowheads, both ends by default for new dimensions | D150 | `21b9237` `5381f16` |
| Drag a selected dimension's text off its line (`labelOffset`, one undo step) | D151 | `21b9237` |
| Persistent «Help» button (editor, grid, Home) + `docs/USER-GUIDE.md` | D152 | `9f81b98` |

**Gates on the final tree (Windows):** `tsc` 0 · vitest **1670/1671** (the one failure, `layersReorder.browser`,
passes 4/4 alone; it is the known load flake) · build 0 (28 precache) · playwright 8 passed / 5 skipped · **clickthru
20/20**. Screenshots were read: the rail order, Help next to Export, the three-swatch panel, «Use photo» → editor, and the
one-page export.

## Test changes the owner's requests forced (named, not weakened)

- D146: `cameraFlow.test.tsx` long-press lock test enables the setting first.
- D147: `exportWizard.test.tsx` rewritten for one page.
- D148: `journey.spec.ts` and the clickthru drop «open grid card after Use photo».
- D149: `editorChrome`, `editorShell` (group order), `editorChromeFit` (widths; the panel now scrolls vertically and must
  never overflow sideways; the Desk rail is shorter than Field at 1366x768).
- D150: `styleByTool.test.ts` dimension baseline includes `arrowheads: 'both'`.

## Owed / next steps (in order)

1. **Owner sign-off on proposed copy.** The new strings carry `⚠ PROPOSED (C14)`: Settings › Camera / Export, the
   D147 export strings, and the whole `STRINGS.help` guide. They also belong in `appendix-strings-gaps.md`.
2. **`[Surface]` pass** (H1-H29, plus the new items): the rear camera is picked on the real device; the 48 px
   one-column rail and the 176 px panel feel right with a finger; dragging dimension text works with a finger and a pen;
   and a sheet switch after a capture followed by undo leaks nothing across sheets (D145).
3. **Flaky browser tests.** `sheetEditor.dimension` (D63/F6/F4) and `layersReorder` fail under full-suite load
   (pre-existing; the dimension one also fails on `c322bf4`). Fix: fake timers and `waitFor`, not more slack.
4. **Style panel choices don't apply to new marks** (pre-existing, found this session). Only the dimension tool now
   reads its per-tool style (`scene.dimensionStyle`). Shapes, ink and text still create marks from `DEFAULT_STYLE`.
   Extend the same hook per type once the owner confirms that is wanted.
5. «Remember this destination» has no backing store (the checkbox persists nothing; found by the export lane).
6. The dimension's **provisional** preview (while placing) still draws without arrowheads (`DimensionTool` uses
   `DEFAULT_STYLE` for the preview).
7. Wave 4 (docs diet, plan §9): **needs owner approval** before anything is done.
8. Still open from before: the Offset Nudge Pad, the History flyout (`writeHistorySnapshot` has no caller), the editor
   replace dialog (13.3:808), `aria-pressed` on the hold, the export owed list, D101's label halo, PDF captions, and the
   two owner decisions (mixed-selection chrome, 14.9 handedness tab order).
