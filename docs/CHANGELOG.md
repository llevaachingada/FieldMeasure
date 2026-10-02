# Changelog

One entry per merged change, newest first: what changed for the user, the decision number, and the
checks that ran. The full build-era log (sessions 1-30) is
[`archive/BUILD-LOG.md`](archive/BUILD-LOG.md).

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
