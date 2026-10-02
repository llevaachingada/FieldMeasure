# Changelog

One entry per merged change, newest first: what changed for the user, the decision number, and the
checks that ran. The full build-era log (sessions 1-30) is
[`archive/BUILD-LOG.md`](archive/BUILD-LOG.md).

## 1.0.0 (2026-10-02): handoff

- `main` is the live app (beta merged; only `main` deploys) (**D166**).
- The app installs under any web address or repo name (**D166**).
- Touch only: the «Pen only» setting, the pen eraser note and pen wording are removed (**D167**).
- Docs: the README is the owner's guide; the build-era plans, specs, handoffs and reviews are in
  `docs/archive/` (**D168**).

Checks: CI (typecheck, all three test projects, build, end-to-end).
