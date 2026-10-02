# Status

**Version 1.0.0** (handoff, 2026-10-02). Live at https://llevaachingada.github.io/FieldMeasure/ and built
from `main`. Once CI passes on a merge to `main`, it redeploys.

Keep this page current: update it in the same pull request as any change that alters what works or
what's owed. It replaces the build-era `CONTINUITY.md` (now in [`archive/`](archive/)).

## Works

- **Projects:** each project is a folder on the Surface (default `Documents\FieldMeasure`).
- **Capture:** rear camera, zoom chips, an optional room name, Use photo / Retake.
- **Dimensions:** tap-tap or drag, a calculator keypad for feet, inches and fractions, snapping to
  other marks, a magnifier, end grips, a draggable label, and label size and bold.
- **Markup:** 14 tools. Select, pan/zoom, dimension, angle, line, arrow, rectangle, ellipse, polygon,
  freehand, highlighter, text box, photo inset, erase. Plus undo, redo and layers.
- **Export:** one-page PDF/PNG with a date and room stamp and the VANGARDE watermark (switchable in
  Settings).
- **Safety:** autosave, atomic writes, trash, a folder re-authorize flow, and offline use after install.

Input is **touch only** (D167). «Finger draws» is on by default. The code still accepts a pen, but
nothing on screen mentions one.

**Deploys:** a merge to `main` goes live only after CI passes on it (D168).

## Tests

About 1,690 automated tests (node + jsdom + browser projects) run in CI on every push and pull
request. All pass, with three known **load-sensitive** browser tests that occasionally fail on a busy
machine and pass on a re-run: `sheetEditor.dimension.browser`, `gridReorder.browser`, `appNewProject`.
Making them robust is owed (below).

Use **Node 24**. Node 22 fails two `projectSession` tests.

## Not yet done

In priority order:

1. **Field test.** No crew member has used it on a real job yet. Checklist:
   [`FIELD-TEST.md`](FIELD-TEST.md).
2. **Wire the file-version guard.** `src/domain/migrate.ts` refuses a project written by a *newer*
   build, but the load path in `src/fs/projectStore.ts` never calls it (only tests do). Risk: if two
   Surfaces on different versions share a project folder (Dropbox), the older app could re-save the
   file and drop fields it doesn't know. This is in a high-stakes module, so it needs its own careful
   change with tests. Until then, let every Surface update (tap **Reload**) before sharing projects.
3. **Make the three load-sensitive tests robust.** Never by skipping them.
4. **Offset Nudge Pad:** on-screen fine-adjust arrows. Keyboard arrow nudging already works.
5. **History panel:** browse older versions of a sheet. `writeHistorySnapshot` exists but nothing
   calls it.
6. **«Moved to a new address» screen:** never built. A changed web address shows first run again,
   and picking the same folder recovers everything.
7. **Disabled controls (visible but greyed out):**
   - Settings → «Third-party notices» (should open `THIRD-PARTY-NOTICES.md`)
   - Settings → «Trash…» (the sheets grid's Trash works)
   - Settings → «Project settings» link beside precision
   - Settings → unit system «Metric» (metric parsing exists in `src/domain/units.ts`; the display
     and project wiring don't)
   - the export wizard's «Include sheet names»

   Build or remove each.
8. **Five end-to-end tests marked `test.fixme`:** the power-loss simulations in
   `tests/e2e/kill-switch.spec.ts` (4) and a touch reorder in `tests/e2e/layersReorderTouch.spec.ts`
   (1). They need a decision, not deletion. Field-test checks 11-13 cover the same ground by hand.
9. **Proposed wording:** strings marked `⚠ PROPOSED` in `src/ui/strings.ts`
   (see [`appendix-strings-gaps.md`](appendix-strings-gaps.md)) need the owner's sign-off.
10. **Small open choices:**
    - the side panel when different mark types are selected together;
    - the left-handed tab order;
    - whether the Dimension tool should grab an existing end directly;
    - per-tool styles for shapes and ink;
    - «Remember this destination» on export;
    - arrowheads on the preview line;
    - the eraser's Objects/Stroke switch shows until the first touch.
