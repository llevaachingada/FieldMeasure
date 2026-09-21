# Build Log

**The agent's memory across sessions.** Read the last entry to find your place; append one entry per
slice, in the same commit as the slice.

**Status: slice 0.1 (scaffold) complete — all machine gates green.** Next action: **slice 0.2** (input spike) in `docs/implementation-plan.md`.

---

## Entry template — copy this

```
## Slice <n> — <name>
**Date:** YYYY-MM-DD · **Commit:** <sha>

**Built:** <one or two lines: what now exists that did not before>

**Machine gates:** <n>/<n> passing
- [x] <gate text>
- [x] <gate text>

**Deferred to hardware:** <n> gates → logged in docs/HARDWARE-TEST-CHECKLIST.md under slice <n>

**Checkpoints fired:** <C<n> — measured X, took row Y> | none

**Decisions recorded:** <DECISIONS entries added> | none

**Surprises:** <anything that disagreed with the docs, and what you did — including any spec
expectation you corrected, with the arithmetic>

**Next:** slice <n+1>
```

---

## BLOCKED entries

If the three-strike rule (`docs/BUILD-RUNBOOK.md` §6) fires, append here instead and stop:

```
## BLOCKED — slice <n>
**What fails:** <exact failure, with the command and the output>
**Attempt 1:** <what you tried, why it failed>
**Attempt 2:** <…>
**Attempt 3:** <…>
**My read:** <what you believe is wrong, in the spec or the plan>
**Needs:** <what would unblock it>
```

---

## Log

## Slice 0.0 — Origin, distribution and install decision
**Date:** 2026-09-21 · **Commit:** docs-only, folded into session 4b

**Built:** nothing executable — pinned the origin (D24/D34/§21.1), wrote `docs/install-runbook.md`; the origin guard is specified for 0.1.

**Machine gates:** n/a (decision slice). **Checkpoints fired:** none.

**Next:** slice 0.1

---

## Slice 0.1 — Scaffold
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** a pinned, offline-installable PWA shell — React 19 + Vite 8 + vite-plugin-pwa (`registerType:'prompt'`, 11 precache entries), TypeScript 5.9.3 strict, three-project Vitest (node/jsdom/browser), Playwright e2e + CSP-as-a-test, self-hosted fonts (Archivo + JetBrains Mono), origin-guard + decode-worker stubs, placeholder icons, CI workflow.

**Machine gates:** 6/6 passing
- [x] `npm run build` (PWA generated: sw.js + workbox + manifest)
- [x] `npx tsc --noEmit` (strict)
- [x] vitest node project (1 test)
- [x] vitest jsdom project (1 test)
- [x] vitest browser project (real canvas → PNG data URL — D40 gate)
- [x] playwright e2e (3 tests: smoke + CSP landscape/portrait)

**Deferred to hardware:** 2 gates → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 0.1 (airplane-mode reload after install; fonts load offline after install)

**Checkpoints fired:** C1 — toolchain bring-up: "All pass" (versions recorded in DECISIONS)

**Decisions recorded:** C1 record in DECISIONS (TS 5.9.3; `@vitest/browser-playwright` 5.0.1 added; `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `jsdom` 30.1.0, `@types/react(-dom)` 19.3.0)

**Surprises:** (1) Vitest 5 browser `provider` takes `playwright()` (a function import), not the `'playwright'` string the docs implied — corrected. (2) `@vitest/browser-playwright` is an optional peer, not auto-installed — added explicitly. (3) Node is on the machine but not on the shell PATH, and `npm.ps1` is blocked by execution policy — invoked via `npm.cmd`. (4) `12mp-portrait-exif6.jpg` not yet generated (needs a real/synthetic EXIF source) — TODO in `tests/fixtures/make-fixtures.mjs`.

**Next:** slice 0.2 (input spike)
