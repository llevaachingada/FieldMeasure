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

## Slice 0.2 — Input spike (touch-first router)
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** the touch-first input router (`src/editor/inputRouter.ts`) copied verbatim from build spec §8.2 — `InputIntent`/`InputRouterOptions`/`createInputRouter` with the pen-present two-gate palm rule, the pen-free edge-rejection + multi-touch-debounce path, and the locked truth table — plus 15 pure node-project unit tests and the C3 device-caps e2e probe (`tests/e2e/device-caps.spec.ts`).

**Machine gates:** 4/4 passing
- [x] `tests/inputRouter.test.ts` (15 tests, node project) — pen always draw + window refresh; pen-free draw/navigate; gate 1; gate 2 (no mid-stroke reopen); edge rejection; ≥3-contact burst latch/resume; custom `palmWindowMs`; mouse draw
- [x] `npx tsc --noEmit` clean
- [x] `npm run build` succeeds
- [x] `npx vitest run` green (114 tests across node/jsdom/browser); `npx playwright test` green (smoke + CSP ×2 + device-caps)

**Deferred to hardware:** 8 gates → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 0.2 (touch tap-tap, touch drag-vs-pan, pen parity, palm gauntlet [pen], touch-only palm gate, ink ≤16 ms, pen `pointercancel`, touch `pointercancel`). The throwaway `spike.tsx` canvas is deferred — every one of its gates is `[Surface]`, no machine gate to satisfy.

**Checkpoints fired:** C3 — measured PROVISIONAL (no camera on build machine), recorded in DECISIONS. C8 (touch-primary palm gauntlet) deferred to hardware (H1/H1b).

**Decisions recorded:** D43 (router built to §8.2, not the plan's stale signature block; spike deferred).

**Surprises:** the plan's slice 0.2 "Signatures" block is stale vs §8.2 — built to §8.2. `EDGE_REJECT_PX` is declared but never referenced in the §8.2 body (the edge flag is passed in by the caller); kept verbatim. `pointercancel` rollback is a PlacementController concern, not a router method.

**Next:** slice 1.1 (domain core, parallel) → 0.3

## Slice 1.1 — Domain core (pure, fully tested)
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** seven `src/domain/*` modules (`types`, `schema`, `units`, `geometry`, `snapping`, `ids`, `migrate`) + six test files (89 tests). Reference code copied verbatim from §6.1/§6.1.1/§6.2/§6.3/§6.4/§3.3/§3.4, plus the session-4 `migrate.ts` and its idempotency/future-version guards.

**Machine gates:** 3/3 passing
- [x] `npx vitest run` green incl. the value round-trip property test (500 combos) with its own coverage assertions, all seven commit-guard rows, and the F6 zero-slot compose
- [x] Trace check (5 by hand, executed): `12 6`→150 · `12 6 3`→150 3/16 · `10'-4 1/2"`→124.5 · `124.5`→124.5 · `1/2"`→0.5
- [x] `migrate` idempotent (asserted) + future `schemaVersion` refused; `formatInches(-124.5)`→`-10'-4 1/2"` + re-parse→`null` asserted; `npx tsc --noEmit` clean; `npm run build` succeeds

**Deferred to hardware:** none (pure domain).

**Checkpoints fired:** none (C2's `12mp-portrait-exif6.jpg` fixture remains a slice 1.3 TODO; migrate uses the existing `v02-markup.json` + new `v02-project.json`).

**Decisions recorded:** D44 — two §3.4 schema corrections found by execution (compilation), not reading.

**Surprises:** (1) §3.4 as written does not typecheck — `AnnotationZ: z.ZodType<Annotation>` fails because `.nullish()` on `fillColor`/`children` yields `| undefined` that §3.3's exact types forbid; fixed to `.nullable()`/`.optional()` (exact translations, no cast, guards untouched). (2) The §6.1.1 compose table has **7** rows, not 8 (the 8th case is the `12' 6 3/8` round-trip). (3) The §6.1/§6.1.1 test block's import list omitted `isCommittableInches` and `KeypadState` — added to the imports. (4) `tests/units.smoke.test.ts` (slice 0.1's STRINGS smoke) left in place; still passes, redundant with the real units tests.

**Next:** slice 1.2 (storage core)
