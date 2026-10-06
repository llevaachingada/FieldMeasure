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

About 1,720 automated tests run in CI on every pull request and on `main`: node, jsdom and browser
(Chromium) projects, plus 13 Playwright end-to-end tests, including a real crash in the middle of an autosave. All pass;
none are skipped or switched off. The tests that used to fail
under load were made deterministic (D171), and the full browser project passed three runs in a
row.

Use **Node 24**. The container default Node 22 fails two `projectSession` tests.

## Safety nets (D169)

- A project saved by a newer version of the app is refused, never overwritten. The crew updates
  first; Help says how.
- Autosave keeps recovery snapshots in `.history/`: the first save of each session, then every 10
  minutes, 20 per sheet. A damaged file restores itself from the newest good one.

## Open items

**None in the code.** Every former open item was built, fixed or decided (D169-D171). What's
left belongs to the owner:

1. **Field test.** No crew member has used it on a real job yet. Do this before relying on it:
   [`FIELD-TEST.md`](FIELD-TEST.md).
2. **Two GitHub clicks** that this session's access couldn't do: Settings → General → tick
   **Template repository** (the README's copy step needs it), and delete the old merged branches.

### Decided, not building (D171)

- Offset Nudge Pad: dragging end grips with the magnifier, plus keyboard arrows, covers it.
- History panel: recovery from snapshots is automatic.
- «Moved to a new address» screen: picking the same folder recovers everything.
- Metric units: Imperial only (the Metric option was removed, D170).
- Mixed-selection panel, left-handed tab order, the Dimension tool grabbing an existing end,
  per-tool styles, «Remember destination» and arrowheads on the preview line: kept as they are.
- The `⚠ PROPOSED` on-screen wording is signed off as shipping copy.
