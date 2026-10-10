# Handoff: session 29 (2026-09-25 to 2026-09-29)

Branch **`beta-readiness-wave-2`** (pushed; not merged to `main`). The app is live at
**https://llevaachingada.github.io/FieldMeasure/** (`.github/workflows/pages.yml`; Pages source = GitHub Actions;
every push to this branch or `main` redeploys it).

## What shipped

| Area | Decision | Commit |
|---|---|---|
| Exports draw marks at the fitted-editor size (`exportMarkupScale`) | D154 | `4bdec6c` |
| Grid thumbnails show photo + markup (`src/editor/sheetThumb.ts`) | D155 | `4bdec6c` |
| «Room name» at capture → sheet title + export stamp (`Sheet.roomName`) | D156 | `4bdec6c` |
| Corner mark 0.24 opacity; centred top-bar logo (`TopBarLogo.tsx`); camera z-index fixes the stray ⋯ tiles | D157 | `4bdec6c` |
| Export defaults: one sheet, 1x, no zip | D158 | `9d6c2d6` |
| Export watermark + stamp 25% smaller | D159 | `6278750` |
| GitHub Pages workflow; `BASE_URL`-relative icons, watermark and logo; removed the root-absolute manifest link | | `fac8309`, `64d49cb` |
| Text-box editor (`src/ui/TextBoxSheet.tsx`): multi-line, size, bold, colors, background + opacity, edit existing | D160 | `fe108a1` |
| End grips, grab-offset drag, snapping to every mark (`src/editor/snapTargets.ts`), loupe shows markup, text outline selection | D161 | this commit |

**Gates (final tree, Windows):** tsc 0 | vitest 1688/1688 | build 0 | playwright 8 passed / 5 skipped | clickthru 20/20.

## Test changes the requests forced (named, not weakened)

- D158: `exportWizard.test.tsx` now expects the 1x and zip-off defaults.
- D159: `watermark.test.ts` has the new fractions.
- D160: `styleByTool`, `typeToolMap`, `styleIntegration` and `editorChromeFit` expect text to have Fill and
  Transparency, and the new default text style.
- D161: `dimensionRefine` now moves the finger 10 px further, because the end keeps the grab offset.

## Owed / next

1. **Owner sign-off on proposed copy:** the room name, `STRINGS.textBox`, and the new Help steps.
2. **`[Surface]` checks:**
   - drag ends with a finger and with a pen;
   - the loupe placement while dragging an end;
   - snap feel at the 20 px acquire radius;
   - text-box editing with the on-screen keyboard;
   - offline use and the folder re-pick on the Pages origin;
   - D153.
3. **Owner question (open):** should the Dimension tool grab ANY existing end directly (MyMeasures), rather than
   starting a new dimension snapped to it? Today you select first, then drag the grip.
4. **Still open from session 28:**
   - the flake fixes;
   - per-tool styles for shapes and ink;
   - «Remember this destination»;
   - arrowheads on the provisional preview;
   - Wave 4 approval.
5. Merge `beta-readiness-wave-2` into `main` when the owner is ready. Pages already builds from either branch.
