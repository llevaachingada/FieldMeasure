# Status

**Version 1.0.0** (handoff, 2026-10-02). Live at https://llevaachingada.github.io/FieldMeasure/ and built
from `main`. Every merge to `main` redeploys it.

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

Input is **touch only** (D167). The code still accepts a pen, but nothing on screen mentions one.

## Tests

About 1,690 automated tests (node + jsdom + browser projects) run in CI on every push and pull
request. All pass, with three known **load-sensitive** browser tests that occasionally fail on a busy
machine and pass on a re-run: `sheetEditor.dimension.browser`, `gridReorder.browser`, `appNewProject`.
Making them robust is owed (below).

Use **Node 24**. Node 22 fails two `projectSession` tests.

## Not yet done

1. **Field test.** No crew member has used it on a real job yet. Checklist:
   [`FIELD-TEST.md`](FIELD-TEST.md).
2. **Make the three load-sensitive tests robust.** Never by skipping them.
3. **Offset Nudge Pad:** on-screen fine-adjust arrows. Keyboard arrow nudging already works.
4. **History panel:** browse older versions of a sheet. `writeHistorySnapshot` exists but nothing
   calls it.
5. **«Moved to a new address» screen:** `src/data/originGuard.ts` is still a stub. A changed web
   address shows first run again, and picking the same folder recovers everything.
6. **Proposed wording:** strings marked `⚠ PROPOSED` in `src/ui/strings.ts`
   (see [`appendix-strings-gaps.md`](appendix-strings-gaps.md)) need the owner's sign-off.
7. **Small open choices:**
   - the side panel when different mark types are selected together;
   - the left-handed tab order;
   - whether the Dimension tool should grab an existing end directly;
   - per-tool styles for shapes and ink;
   - «Remember this destination» on export;
   - arrowheads on the preview line.
