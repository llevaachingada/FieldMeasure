# Documentation & File Index

A map of everything in this repository. Last updated **2026-10-30 (session 30, handoff, D167)**.

The original plans, research reports, review rounds and per-session handoffs were removed from
`main` at handoff. Every slice they planned has shipped. They are in git history at commit
`8da91d2` (`git show 8da91d2:docs/<file>`).

## Root

| File | What it is |
|---|---|
| `README.md` | **The handoff guide**: install (desktop shortcut or web app), troubleshooting, where it's at, make your own copy, change it with AI. |
| `Install Field Measure.cmd` | **Double-click Windows installer.** Installs Node.js if missing, copies the app to `%LOCALAPPDATA%\FieldMeasure\app`, builds it, makes the desktop shortcut, opens the app. Re-run to update. |
| `AGENTS.md` | **Agent instructions (canonical)**: reading order, authority chain, non-negotiables, working rules, when to stop and ask. |
| `CLAUDE.md` | A pointer to `AGENTS.md`, deliberately. Do not fork the instructions. |
| `THIRD-PARTY-NOTICES.md` | License notices for every runtime dependency and both fonts (CI checks it exists). |
| `package.json` / `package-lock.json` | Dependencies (pinned) and scripts. Install with `npm ci`. |
| `tools/launch-fieldmeasure.ps1` | The launcher the desktop shortcut runs: stops any old server and app window, (re)builds if needed, starts `vite preview` on port 4173, opens Chrome or Edge in a dedicated profile. `-Stop`, `-SkipBuild`, `-InstallShortcut`. |
| `.github/workflows/` | `ci.yml` (all checks on every push) and `pages.yml` (deploys `main` to GitHub Pages). |

## docs/

| File | What it is |
|---|---|
| `docs/USER-GUIDE.md` | **Crew how-to.** The in-app **Help** shows the same steps (`STRINGS.help`); keep them in step. |
| `docs/CONTINUITY.md` | **Live state**: snapshot, timeline, what's unfinished. Read first. |
| `docs/BUILD-LOG.md` | One entry per slice or session. The last entry is where work stopped. |
| `docs/DECISIONS.md` | Why things are the way they are (D-numbers). Checked by `tests/documents.test.ts`. |
| `docs/preflight-handoff-v0.3-hardened.md` | **Build spec (canonical).** §2.4 is the v1 scope table and wins every conflict. |
| `docs/ui-spec-field-measure-v2-hardened.md` | **UI spec (canonical)**, touch-first. |
| `docs/appendix-strings.md` / `docs/appendix-strings-gaps.md` | Approved and proposed copy for `src/ui/strings.ts`. Checked by `tests/strings.test.ts`. |
| `docs/UNITS.md` | Accepted length formats, keypad model, rounding. |
| `docs/HARDWARE-TEST-CHECKLIST.md` | The `[Surface]` checks only real hardware can pass. |
| `docs/clickthru-harness.md` | How to drive and screenshot the built app on the Surface geometry. Inspection, never a gate. |
| `docs/review-brief.md` | The checklist to hand any AI reviewer. |
| `docs/INDEX.md` | This file. |

## Not committed

| Path | What it is |
|---|---|
| `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/` | Installed parts and build/test output. |

## Project file directory 

| Path | What it holds |
|---|---|
| `vitest.config.ts` / `playwright.config.ts` / `playwright.clickthru.config.ts` | Three Vitest projects (node / jsdom / browser), the Playwright e2e + journey gate, and the clickthru harness. |
| `tests/` | Unit, jsdom and browser suites; `tests/e2e/` (journey gate); `tests/clickthru/` (`betaPath.spec.ts`, devices, gestures); `tests/fakes/` (in-memory FSA); `tests/fixtures/`. |
| `public/fonts/*.woff2` | Self-hosted Archivo + JetBrains Mono subsets. |
| `src/App.tsx`, `src/main.tsx`, `src/styles.css` | App shell (route reducer, project session, capture overlay), entry point, global styles. |
| `src/data/` | `storage.ts`, `originGuard.ts`. |
| `src/domain/` | `types.ts`, `schema.ts` (zod), `units.ts`, `geometry.ts`, `snapping.ts`, `ids.ts`, `migrate.ts`. |
| `src/editor/` | `EditorCanvas.ts` (Konva canvas + the §4.2 screen-scaling seam), `editorController.ts` (R6: canvas/scene/tools lifecycle, `loadSheet` without remount), `gestureArbiter.ts` (R1: pointer gestures, D151 label drag), `sceneActions.ts` (Layers/mini-toolbar actions), `history.ts`, `Loupe.ts` (D161 markup overlay), `snapTargets.ts` (D161 snapping), `sheetThumb.ts` (D155 grid thumbnails), `inputRouter.ts`, `session.ts`. |
| `src/editor/inset/` | `InsetFocus.ts`, `insetAssets.ts`, `insetGeometry.ts`, `renderInset.ts`. |
| `src/editor/shapes/` | `scene.ts` (the `Annotation[]` document), `renderDimension.ts`, `arrowHead.ts` (D150), `dimensionLabel.ts` (D151 offset), `renderShape.ts`, `renderInk.ts`, `renderText.ts`, `styleCommand.ts`, `svgPath.ts`. |
| `src/editor/tools/` | `DimensionTool`, `AngleTool`, `ShapeTool`, `FreehandTool`, `TextTool`, `EraseTool`, `SelectTool`, `InsetTool`, `toolTypes.ts`. |
| `src/export/` | `runExport.ts` (export session; D147 default location, open file), `renderStage.ts`, `pdf.ts`, `png.ts`, `filenames.ts`, `watermark.ts`. |
| `src/fs/` | `projectStore.ts` (the ONLY write path), `projectSession.ts` (R5/D144), `backend.ts`, `presets.ts`, `projectSheets.ts`, `projectSize.ts`, `sheetIntake.ts`, `sheetOps.ts`, `sheetTrash.ts`. |
| `src/media/` | `cameraSession.ts` (R4; D146 rear-camera pick), `normalizeImage.ts`, `exif.ts`, `thumbnails.ts`, `decodeWorker.ts`. |
| `src/settings/` | `capture.ts` (AE/AF lock, default off), `exportLocation.ts` (dated or project folder), `density.ts`, `handedness.ts`, `input.ts`, `projectsRoot.ts`, `theme.ts`, `units.ts`, `watermark.ts`. |
| `src/state/` | `appStore.ts`, `editorStore.ts`, `persistQueue.ts`, `projectMeasure.ts`, `styleByTool.ts`. |
| `src/ui/` | Screens and chrome: `ProjectList` (Home), `ProjectScreen` (+ `useSheetReorderDrag`), `EditorLayout`, `SheetEditor`, `TopBar`, `ToolRail`, `StylePanel`, `ExportWizard`, `CameraFlow`, `Settings`, `FirstRun`, `HelpButton` (D152), `TextBoxSheet` (D160), `TopBarLogo` (D157), dialogs and sheets, `appRoute.ts` / `useProjectActions.ts` (R2), `insetActions.ts`, `strings.ts` (all copy). `icons/tools/` holds the 14 rail glyphs. |

## Reading order for a new contributor or AI

1. `README.md`, then `AGENTS.md`.
2. `docs/CONTINUITY.md` and the last entry of `docs/BUILD-LOG.md`.
3. The build spec (§2.4 first), then the UI spec.
4. `docs/DECISIONS.md` for the reasoning behind anything surprising.
