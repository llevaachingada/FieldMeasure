# Changelog

One entry per merged change, newest first: what changed for the user, the decision number, and the
checks that ran. The full build-era log (sessions 1-30) is
[`archive/BUILD-LOG.md`](archive/BUILD-LOG.md).

## 2026-10-10: ship pass

- Fixed: «More styles…» was outside the side panel and could not be tapped (**D172**).
- No do-nothing controls: the editor and project ⋯ menus list only working items; Group/Ungroup and «Locate» are
  gone (**D172**).
- «Exported 1 file» (was «1 files») (**D172**).
- Help and the user guide are corrected and extended (sheets and trash, import, inset, erase), and a test keeps them
  identical (**D172**).
- New guides with PDFs: `docs/guides/` Quick Start (crews) and AI guide (owner) (**D172**).
- Exports: arrowheads show at every photo size, dashed and dotted lines stay dashed, a dimension with no value prints
  no placeholder text, and short-dimension labels match the screen (**D173**).
- Camera: «Retake» keeps the live picture, and «camera unavailable» has a Close (**D173**).
- Text notes use the app font, a sheet rename survives tapping away, and «Third-party notices» opens the notices
  offline. The Home card path, the Help keypad wording and the Retake button layout are fixed (**D173**).

## 2026-10-06: 1.0 sign-off

- Fixed: «Import file» inside the editor saved later edits into the previous sheet (or nowhere) (**D170**).
- Safety: newer-version projects are refused instead of overwritten; autosave keeps recovery snapshots (**D169**).
- Fixed before merge: the snapshot wiring's lock stalled autosave after the first save (**D171**).
- Labels: `1/2"` instead of `0 1/2"`; a damaged number shows `—` (**D170**).
- No dead buttons: «Third-party notices» works; Trash (in Settings), Project settings, Metric and «Include sheet
  names» are removed; the eraser switch no longer flickers (**D170**).
- Tests: the load-sensitive tests are deterministic; four switched-off end-to-end tests run (**D171**).
- Every open item decided (**D171**).

## 1.0.0 (2026-10-02): handoff

- `main` is the live app (beta merged; only `main` deploys) (**D166**).
- The app installs under any web address or repo name (**D166**).
- Touch only: the «Pen only» setting, the pen eraser note and pen wording are removed (**D167**).
- «Finger draws» is on by default, so the Freehand tool draws with a finger (**D167**).
- Docs: the README is the owner's guide; the build-era plans, specs, handoffs and reviews are in
  `docs/archive/` (**D168**).
- The app deploys only after CI passes on `main`. The third-party notices are complete and checked in
  CI. Dead code, stale comments and stray files are cleaned up. Help names the right button
  («Copy path»), and Help says the tool bar is "at the side of the screen" (it follows
  handedness) (**D168**).

Checks: tsc 0 · vitest node+jsdom 1455/1455 (Node 24) · build 0 · playwright 8 passed, 5 skipped ·
notices up to date · CI (all three test projects).
