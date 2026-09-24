# Build Log

**The agent's memory across sessions.** Read the last entry to find your place; append one entry per
slice, in the same commit as the slice.

**Status: slices 0.2 + 1.1 + 0.3 + 1.2 + 1.3 complete — all machine gates green.** Also landed:
**slice 1.9 step 1 only** (the filename module; **1.9 is NOT complete** — renderStage/pdf/png/wizard
still land after 1.8). Next action: **slice 1.4 ∥ 1.4.5** in `docs/implementation-plan.md`.

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

## Slice 0.3 — First-run, Settings, Home shell
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** two-step first-run (handedness → projects folder), the Settings screen (Input/Units/Display/Storage/About with the five touch toggles), the Home shell (empty/loading/ready + card grid on placeholder data), five + one typed idb-keyval settings helpers, the zustand `appStore`, and the filled `strings.ts` table.

**Machine gates:** 4/4 passing
- [x] First run two steps, Right default, auto-advance; Settings round-trip (set → re-render → persisted)
- [x] Five touch toggles default correctly (`touchPlaces:true, fingerDraws:false, magnifierOnTap:true, glovedTouch:false, penOnly:false`) and persist
- [x] Home renders the honest empty state; first-run keyboard-completable with `:focus-visible` ring, `aria-label`/`role="switch"`+`aria-checked`, 48px targets + 16px hit slop, no inline styles (CSP-as-a-test green)
- [x] `npx tsc --noEmit` clean · `npm run build` succeeds · `npx vitest run` green · `npx playwright test` green

**Deferred to hardware:** none (0.3 has no `[Surface]` gates).

**Checkpoints fired:** none.

**Decisions recorded:** D45–D47 (Settings/Home copy gaps; `projectsRoot.ts` + `units.ts` type import; Pen-only semantics reconciled to §8.2).

**Surprises:** (1) `showDirectoryPicker`/`DirectoryPickerOptions` are absent from TS 5.9 `lib.dom` — added a minimal ambient shim. (2) jsdom has no IndexedDB — `App` catches the idb-keyval failure and falls back to first-run (keeps the scaffold smoke test green). (3) `tests/component.smoke.test.tsx` + `tests/e2e/{smoke,csp}.spec.ts` asserted the old scaffold text `Field Measure`; updated to the first-run boot (`Which hand do you write with?`) — assertions superseded by 0.3, not weakened. (4) §20.5(b) "Pen only … ignores touch input entirely" conflicts with §8.2 — resolved to §8.2 (touch pans/zooms, never places/draws; D47).

**Next:** slice 1.2 (storage core)

## Slice 1.2 — Storage core
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** the atomic, lock-guarded, self-healing persistence layer — `src/fs/backend.ts` (`StorageBackend` + `FsaBackend` + `OpfsBackend` + `chooseBackend`), `src/fs/projectStore.ts` (`initStore`, `pickRoot`, `writeAtomic`/`writeJsonAtomic`, `readJsonValidated`, recursive `cleanStaleTmp`, `StorageWriteError` + failure classification, `.history` snapshots + recovery, duplicate-id scan + `makeProjectSeparate`, two-tab writer lease + `BroadcastChannel`), `src/data/storage.ts` (`ensurePersistentStorage`), `src/state/persistQueue.ts` (the §5.4 coalesce→serialize→backoff→flush pipeline, sole markup writer, owns `storageStatus`), and the `ProjectList` real scan. 52 new tests + a CDP kill-switch harness.

**Machine gates:** 4/4 passing
- [x] `npx vitest run` green (166 tests: projectStore 28, persistQueue 14, projectList 10 + prior slices)
- [x] `npx tsc --noEmit` clean · `npm run build` succeeds
- [x] `npx playwright test` green (5 passed: smoke + CSP ×2 + device-caps + `move()` overwrite; 4 `fixme`: 3 renderer-crash + 1 app-level, deferred)
- [x] `cleanStaleTmp` recursion + lock coverage + I/O-failure recovery + disk-full + persistQueue coalesce/backoff all unit-asserted

**Deferred to hardware:** 4 gates → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.2 (kill-switch ×3, disk-full mid-edit, duplicate-id folder copy, two-tab/different-project). The renderer-crash harness is `fixme` (CDP `Page.crash`+reopen times out in this env); the real power-loss case is H4.

**Checkpoints fired:** none.

**Decisions recorded:** D48–D53 — zod v4 JIT disabled (CSP `script-src eval`); `StorageStatus` canonical union; backend `getProjectDir()` = ROOT; duplicate-id runtime key (forward-looking); snapshot cadence/200 MB backstop deferred; kill-switch harness `fixme`.

**Surprises (senior adversarial review, fixed in this commit):** (1) zod v4's JIT compiler probes `Function('')`, firing `script-src eval` under our `'self'` CSP once `schema.ts` reached the browser bundle — fixed with `globalConfig.jitless = true` (latent in 1.1, real in 1.2). (2) `AppState['storageStatus']` lacked `'saving'`/`'full'` and used `'ok'` vs the queue's `'saved'` — reconciled to one canonical union (D49). (3) §5.1 vs §3.1 root-vs-project ambiguity resolved (D50). (4) duplicate-id collision risk in lock/queue/registry keyed by bare `id` (D51). (5) the fixer's own `persistQueue` "Saved forever" status bug — caught by its own test, not reading.

**Next:** slice 1.3 (photo on canvas)

## Session 8 — Oracle-style execution review (0.2–1.2) → clear 1.3–1.5
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** nothing new — a full-gate re-run plus execution-based re-derivation of the highest-stakes
modules. `npx vitest run` 166/166 · `npx tsc --noEmit` clean · `npm run build` (11 precache) ·
`npx playwright test` 5 passed / 4 fixme. 48/48 unit expectations in `units.ts` re-traced by execution.

**Machine gates:** n/a (review). **Checkpoints fired:** none.

**Findings:** no wrong-measurement or data-loss defect. One doc/code drift fixed (the `cleanStaleTmp`
comment claimed "never touch `.history/`" while the code correctly recurses into it to clean orphaned
snapshot `.tmp` files — comment rewritten, behaviour unchanged). D51 (duplicate-id runtime key → 1.3),
D52 (snapshot cadence → 1.6/1.10) and D53 (kill-switch harness → H4) confirmed safe to defer; the
`.history/<scope>/<epochMs>-<name>.json` recovery sort verified correct. Full register in
`docs/DECISIONS.md` "Session 8".

**Verdict:** the foundation is sound; **slices 1.3–1.5 are safe to start.**

**Next:** slice 1.3 (photo on canvas)

---

## Slice 1.9 — Export (PARTIAL — step 1 of 5 only: the filename module)
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** `src/export/filenames.ts` (`sanitizeToken`, `joinFilename`, `conflictName`) + `tests/filenames.test.ts` — the pure, dependency-free naming half of slice 1.9, pulled forward into its own lane because it has **no dependency on 1.3 or on the style system**. Only `renderStage.ts`/`pdf.ts`/`png.ts` and the wizard need slice 1.8's final style rules (the plan's `1.9 after 1.8` constraint); the sanitizer does not.

**Machine gates:** 2/2 passing
- [x] `npx vitest run --project node tests/filenames.test.ts` → 38/38 (20 `sanitizeToken` + 4 `joinFilename` + 6 conflict cases + 7 extra edge cases)
- [x] `npx tsc --noEmit` clean

**Deferred to hardware:** none (pure module; the export-invariance and NTFS-overwrite gates are `[Surface]` and belong to the rest of 1.9).

**Checkpoints fired:** none.

**Decisions recorded:** pending — see Follow-ups.

**Surprises:** (1) The plan's slice-1.9 gate text said "the full **17-row** table above passes" while the table it references has **29** rows (20 + 4 + 5). Gate text corrected in `docs/implementation-plan.md`; the DECISIONS line is still owed. (2) All 29 rows were re-executed against the reference implementation by an independent lane: **no row disagreed**, including `con.jpg` → `_con.jpg` (the row the session-4 from-prose draft failed) and both truncation-re-exposes-a-dot rows. (3) Two of the lane's own extra edge tests were first written with bad arithmetic and were caught by execution, not reading — the module was never at fault.

**Follow-ups owed (not done):** the DECISIONS entry for the 17→29 gate-text correction, held so it does not race slice 1.3's concurrent `DECISIONS.md` edits.

**Next:** slice 1.3 (in flight), then 1.4 ∥ 1.4.5; the rest of 1.9 (renderStage/pdf/png/wizard) still lands after 1.8.

---

## Slice 1.3 — Photo on canvas
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** the media pipeline and the first real canvas — `src/media/normalizeImage.ts` (`normalizeImage` + `sha256Hex`), `src/media/exif.ts` (manual APP1 scan bounded to 64 KB + `stripExif`), `src/media/thumbnails.ts` (640×480 contain-fit composite, 3 s debounce, atomic write) with the real `src/media/decodeWorker.ts` body replacing slice 0.1's stub (URL convention kept); `src/editor/EditorCanvas.ts` (imperative Konva, 5 layers, per-layer `pixelRatio` per §8.1.1, hand-rolled pinch on Konva's touch events, and the §4.2 screen-rules seam); `src/ui/SheetEditor.tsx` (import → normalize → render, pan/zoom/fit 0.25×–8×, double-tap fit↔100%, the locked touch-first drag rules); the App `'editor'` route using the **D51** `${id}:${folderName}` runtime key; and deterministic, dependency-free fixtures (`12mp-portrait-exif6.jpg` 143 KB, plus a regenerated `tiny-2x2.jpg`).

**Machine gates:** 4/4 passing (orchestrator run on the reconciled tree)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **270 tests / 24 files** green (was 166), incl. browser-project `editorCanvas.browser` 9 and `sheetEditor.browser` 3
- [x] `npm run build` succeeds (12 precache)
- [x] `npx playwright test` 5 passed / 4 skipped (unchanged)
- [x] Slice gates with a machine half: **zoom constancy at 1×/4×/8×** (stroke + ink pixel-measured; label now ink-measured too); EXIF orientation baked upright (3024×4032) and the re-encode proven free of APP1/GPS; the 12 MP fixture decodes at its real size; the object-first/pan predicate **and its wiring** (new `sheetEditor.browser` test); the EXIF read bounded to 64 KB

**Deferred to hardware:** 5 gates → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.3 (12 MP upright + 0.25×–8× smoothness; 20-photo import memory; Explorer GPS-property check; the on-glass touch-drag walk; Performance-panel worker confirmation; the on-device a11y walk). No `[Surface]` result was faked.

**Checkpoints fired:** none — and **C2's fixture TODO is now closed** (the 12 MP EXIF-6 fixture exists and is real, not a stub).

**Decisions recorded:** D54–D64 (DECISIONS "Session 9"): the §4.2 screen seam + the AND-vs-OR tap contradiction; media/worker/fixture/open-flow; EXIF `from-image` and the APP1 read path; the trivially-true "12 MP ≤4096" assertion; pinch wiring + the first-move defect; plus the review round's F1–F5.

**Surprises / review findings** (independent `oracle` review of this slice):
- **F1 (real defect, fixed):** one-finger pan on empty canvas was **never implemented** — panning was gated on `intent === 'navigate'` while the default `touchPlaces: ON` classifies a touch contact as `'draw'`, so with no grabbable geometry (all of 1.3) every one-finger drag did nothing. It contradicted build spec §8.2, D37 and build-order step 3. Fixed to consume `decideDragTarget` for **any** one-finger contact (a pending placement still wins), with a **wiring** test that mounts the real `SheetEditor` and asserts the stage pans — verified to fail against the pre-fix code.
- **F2 (fixed):** double-tap fit↔100% was also gated on `'draw'`, so users with `touchPlaces: false` had none.
- **F3 (documented, owed by 1.5):** the second-finger restore was **not** wired although a comment claimed it was. Comment corrected; the obligation is recorded.
- **F4 (corrected):** the "the old `tiny-2x2.jpg` SOF-patched a seed" story in D55 was **false** — the old file was a genuine encoder JPEG of a 2×2 white image.
- **F5 (improved; one gap left):** the §4.2 label assertion was attribute arithmetic rather than a pixel measurement — now ink-measured. The **dpr-2 path of §8.1.1 remains unproven** (the test forces `markupPixelRatio: () => 1`). Watch item, not coverage.
- **Verified sound** by the same review: the hand-rolled JPEG/EXIF bytes (independently re-parsed and cross-decoded with GDI+), the §4.2 seam (confirmed it would catch `strokeScaleEnabled:true`), the EXIF/normalize path, all four D51 keys, and D54/D56–D59 as written.
- **Process note:** a Windows-console artefact renders U+2014 as `-` under `Select-String` but `—` under `git diff`; during this review it manufactured two false "wording was rewritten" findings. Copy and fixture checks must be byte-level `node` reads.

**Next:** slice 1.4 ∥ 1.4.5 (two lanes; `src/ui/strings.ts` and `src/App.tsx` owned by the 1.4.5 lane).

## Slice 1.4 ∥ 1.4.5 — Capture flow ∥ Editor shell
**Date:** 2026-09-21 · **Commit:** this commit

**Built** (two parallel `@designer` lanes, integrated by the orchestrator):

- **1.4.5 editor shell** — `src/ui/EditorLayout.tsx` (the §11.3 docking rule as one pure predicate, `panelDockFor`), `ToolRail.tsx` (14 tools / 6 groups at 56 px with 8 px gaps on the handedness side, roving-focus `role="toolbar"`, "unimplemented tool is a no-op" enforced in **two** places), `TopBar.tsx` (52 px, breadcrumb, UI §5.2’s overflow, and the autosave slot that renders **nothing** until 1.10), `src/ui/icons/tools/*.tsx` (14 bespoke glyphs — **placeholders**, recorded as such), `src/state/editorStore.ts` (§10 registry), `SheetEditor`’s two shell seams (`onImportReady`, `onSheetTitleChange`), and a **lazy `App.tsx` editor route** so Konva leaves the Home chunk.
- **1.4 capture flow** — `src/ui/CameraFlow.tsx` + `camera.css`: full-bleed viewfinder, torch/grid/level/flip/resolution toggles, tap-to-focus reticle with AE/AF lock, 88 px shutter, zoom chips, the review screen (`Retake · Rotate · Use photo`, no auto-enhance), the camera-unavailable panel with the exact copy + both fallbacks, and a write failure that keeps the photo in memory and offers «Save a copy…».
- **The shared write path** — `src/fs/sheetIntake.ts` (`addSheetFromPhoto`, `defaultSheetTitle`) was extracted **before** the lanes started (commit `ab42300`) so the editor import and the capture flow cannot drift into two versions of one data path.

**Machine gates:** 4/4 passing (orchestrator, on the reconciled tree)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **330 tests / 29 files** (was 270/24)
- [x] `npm run build` — 16 precache entries; main chunk ~547 → **342 kB** (Konva moved into `EditorLayout-*.js`)
- [x] `npx playwright test` 5 passed / 4 skipped (unchanged, CSP-as-a-test green at both viewports)
- [x] Gate halves with a machine form: the `panelDockFor` table **including the inclusive 1.2 boundary**; rail side follows handedness and never the dock; an unimplemented tool cannot change `activeTool`; the autosave slot renders nothing; capture → review → Use writes `photo.jpg` + one `project.json` sheet + schedules the thumbnail; a failed write leaves `project.json` unchanged and the photo in memory; camera-denied renders the exact copy; copy contract enforced by `tests/strings.test.ts`

**Deferred to hardware:** 7 rows added to `docs/HARDWARE-TEST-CHECKLIST.md` (5 for 1.4, 2 for 1.4.5), every one PENDING with its machine-verifiable half stated. No `[Surface]` result was faked.

**Checkpoints fired:** **C5** (`lucide-react` 1.x icon API, slice 1.4.5) → measured: named exports work (`Undo2`/`Redo2`, `ChevronLeft/Right`, `Layers`, … render; build + CSP test green). Recorded in DECISIONS and flipped in CHECKPOINTS. C4 was already recorded by the owner as "fired but not measurable until annotations exist".

**Decisions recorded:** D67 (the new copy gate broke `tsc`), D68 (shell composition / placeholder art / bundle), D69 (capture mount, provisional device caps, copy fold).

**Surprises:**
- The owner’s new copy-contract gate (`tests/strings.test.ts`) **broke `tsc --noEmit`** — it read its sources with `node:fs` while `tsconfig` pins `types: ["vite/client"]` and `@types/node` is not installed, so the gate meant to protect copy was failing the typecheck gate. `vitest` could not see it. Fixed with Vite `?raw` imports, no assertion changed (D67).
- Integration surfaced an ownership gap the handoff left open: `SheetEditor.tsx` and the "a photo becomes a sheet" write path belonged to **neither** lane. Closed by extracting the seam before dispatch rather than letting two lanes write it.
- `SheetEditor` always opened `sheets[0]`, so a capture into a non-empty project would have appeared to do nothing. An additive `sheetId` seam makes «Use photo» land on the sheet just written.
- Two lanes’ `strings.ts` needs cannot both write one file: the capture lane staged `cameraCopy.ts` (§11), the orchestrator folded it from the **appendix bytes** and deleted the module.

**Next:** slice 1.5.
## Slice 1.5 — Dimension tool (flagship)
**Date:** 2026-09-21 · **Commit:** this commit

**Built** (two parallel lanes — `@fixer` machine ∥ `@designer` keypad sheet — integrated by the orchestrator):

- **The machine** — `src/editor/history.ts` (Command/History, 100 steps, 600 ms style coalescing, redo clears on a new edit), `src/editor/shapes/` (`scene.ts` in-memory `Annotation[]` + Konva sync + `AnnotationPath`/zIndex bands; `renderDimension.ts`; `dimensionLabel.ts` with the pure 140 px / 36 px collision rule), `src/editor/Loupe.ts` (pen **3.5×** with derived source; touch **200 px / 4× / 50 px source**, 136 px offset, 44 px contact disc, 700 ms freeze → 40%), `src/editor/tools/DimensionTool.ts` (tap-tap commits at B, drag is the same machine, acquire 32 → lock 20 px, live derived label, the **450 ms** settle window, chain, refine-within-40 px), `src/editor/session.ts` (command registry + toast bus), and the `SheetEditor` wiring (keypad mount, focus trap + return, placement announcement, object-first drag).
- **The keypad sheet** — `src/ui/DimensionKeypadSheet.tsx` + `dimensionKeypad.css`: all arithmetic delegated to the shipped `src/domain/units.ts` primitives (nothing re-implemented), a pure preview, refusal reasons rendered in the preview area, entry-scoped fraction chips (D31), hardware-keyboard entry through `parseLooseToSlots`, focus trap/return, `aria-live` preview.
- **D63 discharged** — the `'object'` drag target now moves geometry and consumes `onSecondFinger(...).restoreTo`; the pre-drag position is recorded at drag start.

**Machine gates:** 4/4 passing (orchestrator, on the reconciled tree)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **437 tests / 36 files** (was 330/29), including the **browser** project (real Konva stage) for the tap-tap / settle / D63 machinery
- [x] `npm run build` — 17 precache; `EditorLayout-*.js` 254.6 kB (Konva + the tools), main chunk 343 kB
- [x] `npx playwright test` 5 passed / 4 skipped
- [x] The packet’s machine-checkable gates: pure tap/settle/contact/chain/refine decisions **and their wiring** in the browser project; the keypad truth table (`12 6`, `12 6 3`, `10'-4 1/2"`) asserted on the derived label **and** the committed `valueMm`/`enteredText`; the refusal table (`0`, `12 6 20`, `-5`, 1001 ft) each refused **with a rendered reason**; chain locks at B; precision 1/16 → 1/2 re-derives every label with no stored `label` key anywhere; one stroke = one undo step; undo/redo toasts name the action

**Deferred to hardware:** 10 rows added to `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.5 (tap-tap + settle on glass, the keypad truth/refusal tables with a Type Cover, the measured pen-3.5×/touch-4× loupe ratios, the on-glass target walk, focus/keyboard walk, 4-dims timing, the accuracy walk, and the D37/D63 finger walk). None faked.

**Checkpoints fired:** **C10** (touch placement accuracy) → the machine half is proven and logged; the on-glass walk is deferred (no Surface), so it is recorded as **not measurable without hardware** — never as a pass. CHECKPOINTS flipped with that wording.

**Decisions recorded:** D70 (machine seams, the two deliberate deviations, and the un-wired `markup.json` persistence), D71 (the keypad sheet: the two spec conflicts corrected, and what is unmeasured or unreachable).

**Surprises / findings (from the lanes’ own adversarial notes, resolved at integration):**
- **Two nested same-named modals** — the shell wrapped the sheet in its own `role="dialog" aria-modal="true"` while the sheet already provided them. Fixed: the wrapper is now positioning-only.
- **Tool hotkeys fired while the keypad was open** — the shell now defers both Escape and the hotkeys to the open sheet (`editorStore.keypadOpen`).
- **UI §8.1’s "360 px" sheet height is arithmetically impossible** with §8.1’s own contents (538 px computed). The sheet is sized content-wise; the spec number needs correcting (D71).
- **§6.1.1’s `ft` wiring is incomplete** (`ft` was a no-op after `in` under `inchesMode`); implemented as the simplest behaviour that works and flagged (D71).
- **The refusal copy is stale under D31** — the plan hard-codes "1/16" while the denominator is entry-scoped. Shipped verbatim as instructed, marked `⚠ PROPOSED (C14)`, with `1/{denominator}` recommended for content-owner sign-off.
- **The keypad’s 48–72 px target floor is CSS-declared, not measured** (jsdom has no layout; the browser project does not assert it). Recorded as a coverage gap, not a pass.
- **The orchestrator’s own copy fold broke twice** and both were caught by the gate before commit: a self-matching `keypad.` → `STRINGS.keypad.` replacement doubled three references (`tsc` caught it), and one row was inserted as the appendix’s *rendered* example instead of the shipped *template* form (`vitest` caught it). Neither was a lane defect.

**Owed, explicitly:** `markup.json` persistence is **not** wired — `MarkupScene` is in-memory only, so annotations do not yet survive a reload. Slice 1.2’s `persistQueue` exists; a later slice must connect it. The Offset Nudge Pad was optional for 1.5 and is not built.

**Next:** slice 1.6 (markup tools).

## Slice 1.6 — Markup tools (PARTIAL — the tools ship; three wiring items are owed)
**Date:** 2026-09-21 · **Commit:** this commit

**Built** (two parallel lanes — `@fixer` tools/spine ∥ `@designer` Layers panel — integrated by the orchestrator):

- **Tools** — `shapes/svgPath.ts` (plus `strokeInputPoints`, the ONE place that indexes the parallel `pressure[]` array — the session-4 F7 trap), `shapes/renderShape.ts`, `shapes/renderInk.ts`, `shapes/renderText.ts`, and `tools/`: `ShapeTool` (Line/Arrow/Rect/Ellipse tap-tap + drag, Polygon tap-by-tap with the 56/56/32 close affordances), `AngleTool` (vertex-first 3 taps, 8 px ray refusal, 450 ms settle, complement/supplement/chain), `FreehandTool` (pressure-weighted pen ink; constant 8-mu touch ink; hold-to-shape; highlighter straight-line chisel), `TextTool`, `EraseTool` (object/stroke modes, raw-point split, touch = object-only + the pen-required note), `SelectTool` (8 handles 28/72 touch, edge suppression, axis lock, rotate snap, marquee).
- **Document** — `scene.ts` extended to every §3.3 geometry kind with §20.2 z-bands (highlighter below other markup, above the photo), plus generic translate/bounds/keys-in-rect. `EditorCanvas` regenerates filled ink paths at `mu/s` through the existing §4.2 seam.
- **Persistence (the D70 carry-in) — DONE.** `MarkupScene.onChange` queues `markupFile(sheetId)` through slice 1.2’s `createPersistQueue`; `loadSheet` restores via `readSheetMarkup`, gated so a restore does not queue a redundant write, and cleanup flushes. **Annotations now survive a reload.**
- **Layers panel** — `ui/LayersPanel.tsx` + `layersPanel.css`: a complete, tested (45 tests), props-driven §9 panel with the long-press row menu, cross-band refusal, photo-row protection and full keyboard operation. See "owed" — it is **not mounted yet**.

**Machine gates:** 4/4 passing (orchestrator, on the reconciled tree)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **526 tests / 40 files** (was 437/36), including the browser project for ink zoom constancy, the highlighter z-band and the touch-erase wiring
- [x] `npm run build` — 17 precache; main chunk 345 kB, `EditorLayout` 303 kB
- [x] `npx playwright test` 5 passed / 4 skipped (CSP-as-a-test green at both viewports)
- [x] Gate halves with a machine form: ink zoom constancy 1× → 8×; highlighter inserted below all markup; shape tap-tap pure **and** wired; Polygon closes on `✓ Done`; a right angle reads 90 and a < 8 px ray is **refused**; touch erase deletes with a named undo toast and hides stroke-scope; every mutation undoable; markup round-trips through `markup.json`

**Deferred to hardware:** the pen-pressure comparison (C9), the on-glass handle walk, the touch palm/selection gauntlet, the panel’s 320 px/56 px/48 px target walk and the 2.0 timing gates — logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.6. None faked.

**Checkpoints fired:** **C9** (pen pressure response) → the **touch-only** row: the CI counterpart is green (a ramped pen array yields a materially wider outline; an all-`0.5` touch stroke renders at the constant 8-mu floor), and the on-device pen comparison is marked **PENDING (pen-only)**, never FAIL and never faked.

**Decisions recorded:** D72 (the machinery, the deviations, and the persistence completion), D73 (the Layers panel and what integration found).

**Surprises:**
- **The build caught a defect the whole unit suite structurally could not.** The tools lane wrote a **CP1252 em dash (byte `0x97`)** into `src/styles.css`, making the file invalid UTF-8; `npm run build` failed with `UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8` while `tsc` and **526 tests were green**. Repaired to U+2014 and a tree-wide sweep confirmed no other file carried the damage. Without the build in the loop this would have shipped as a white-screen bundle.
- **The staged copy module’s own marker list was wrong** — `PROPOSED_GAP_KEYS` listed `selection.*` while the object paths are `select.*`, so eight proposals would have folded **unmarked** and failed the copy gate. The fold derives provenance from the appendices instead of trusting the list, which caught it (D73).
- **`a11y.rotate` folded as an exact duplicate** of the key the 1.4 camera fold had already added from the same gaps row — deduped by byte comparison rather than overwritten.

**Owed, explicitly (this slice is PARTIAL):**
1. **The Layers panel is not mounted** — the TopBar `Layers` button is still disabled; a real mount needs scene methods it does not have (visibility, lock, rename, z-order), history commands, and a `layersOpen` state.
2. **`SelectTool` is partially driven** — marquee-on-empty-drag, the rotate UI, groups, the lock toast and the mini-toolbar pin are implemented and pure-tested in the class but not yet driven by `SheetEditor` pointer/long-press handling.
3. **Erase long-press (600 ms) preview** — `isErasePreview`/`beginPreview` exist and are pure-tested; no timer drives them.

**Next:** close the three owed items above (a focused wiring slice), then 1.7 (image insets).

## Slice 1.6 — wiring closure (the three owed items; 1.6 is now COMPLETE)
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** the three items D73 recorded as owed, in one lane, plus the review fixes they surfaced.

- **Layers panel mounted** — `Annotation.visible?: boolean | null` (+ `AnnotationZ.visible: z.boolean().nullish()`, one additive field in each domain file, no migration bump); four band-aware scene mutators (`setVisible` / `setLocked` / `rename` / the reorder pair); `layersOpen` mirroring `keypadOpen` in `editorStore`; a real `onToggleLayers` + `aria-expanded` on the TopBar button; the EditorLayout Escape rung and `data-layers-open`; and the mount in `SheetEditor` (positioning-only wrapper — **no second `role="dialog"`**). Rows are derived by a new pure `src/ui/layersRows.ts`; all six callbacks route through `History`, so every toggle is one undo step.
- **`SelectTool` fully shell-driven** — marquee-on-empty-drag (non-touch only), tap-select / second-tap action, the 600 ms long-press pin, the rotate chips, Lock and Delete on a new mini-toolbar, and the locked-object toast (`onLockedToast`, previously declared but never passed).
- **Erase 600 ms preview driven** — `beginPreview` on a `LONG_PRESS_MS` timer, cancelled by move/lift/cancel; a short tap still deletes and toasts.
- **Review fixes folded in this commit** — the Layers reorder seam was rebuilt on an anchor-based, band-safe primitive, and a pre-existing **Send-to-back off-by-one** in the panel was corrected (D76).

**Machine gates:** 4/4 passing (orchestrator, on the reconciled tree)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **44 files / 565 tests** on the *committed* tree (was 526/40; +35 from the wave, +4 reorder, net of the panel expectation corrected in D76). ⚠ **Corrected (D77/F10):** this entry first read "47 files / 643 tests", which was measured on a working tree that also held three **uncommitted off-critical-path lane** test files (`stylePanel`, `styleEditorSheet`, `imageInsetPickerSheet`). That total is **not reproducible from git**; the arithmetic in this same bullet already summed to 565. The rule this restores: **a recorded gate must be reproducible from the commit it names** — measure the gate with only that commit's files present.
- [x] `npm run build` — 17 precache; `EditorLayout-*.js` 303 → **326.88 kB** (the panel + mini-toolbar), main chunk 345.15 kB; **no `UNLOADABLE_DEPENDENCY`** (the CP1252 trap)
- [x] `npx playwright test` — 5 passed / 4 skipped (CSP-as-a-test green at both viewports)
- [x] Gate halves with a machine form: rows in the right bands with children indented; tap-select passes the **key**; eye/lock undoable and named; the photo row offers no delete; the panel opens from the TopBar, Escape closes it and focus returns; the scene round-trip carries `visible`/`locked` after a reload (`layersWire.browser.test.ts`); marquee selects enclosed annotations; a handle drag is one undo step; the rotate commit lands snapped; long-press pins the toolbar; a 600 ms erase press previews and deletes nothing
  - ⚠ **Corrected (D77/F11):** this bullet first claimed "row count matches after a reload (proves `visible`/`locked` persisted)". A row count cannot prove visibility — a hidden row still counts. The persistence claim rests on the scene round-trip test above, which does cover it.

**Deferred to hardware:** 4 new rows → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.6 (drag-to-reorder on glass; eye/lock undo + reload; the erase 600 ms preview; the mini-toolbar pin), each with its machine half stated. None faked.

**Checkpoints fired:** none. **C4's obstacle is gone** — annotations now exist, so its "50 annotations on a 4096-px sheet" measurement is constructible; it stays a hardware decision and its machine half is **owed, not yet dispatched** (⚠ corrected in session 12: an earlier version of this line claimed it *was* dispatched, which was not true).

**Decisions recorded:** **D74** (five UI-spec corrections: two impossible container widths, the self-contradicting Layers long-press, the 280 px panel that cannot hold its own swatch grid, and the appendix's `4 pt` example for a string whose source says `«3 pt»`), **D75** (the `visible` field, the rename no-op, marquee gating, the synthetic photo row, the mini-toolbar's CSP-forced placement, the copy fold), **D76** (the reorder seam + the Send-to-back off-by-one).

**Surprises:**
- **The wave's own gate was not met, and the unit suite could not see it.** `LayersPanel.resolveDrop` returns a **group-block** index while `MarkupScene.moveInBand` read a **§20.2 band** index — different spaces whenever the main band holds ≥2 groups. Executed trace: Dim A z1000, Dim B z1010, Rect R z1020; dragging A onto B produced painter order `[B, R, A]` — the dimension jumped **above a rect it was never dropped over**. Separately, because `layerGroupFor` maps both `freehand` (main) and `highlight` (lower) to `ink`, one panel block spans two bands, so the cross-band refusal **never fired** for that case and the drop silently did nothing. Fixed with an anchor-based primitive that makes a cross-band move unexpressible; the fix lane reproduced both failures **before** the fix and captured both outputs.
- **A pre-existing off-by-one became user-visible the moment the panel was mounted.** Send-to-back passed `reduced.length - 1`, which lands the row second-from-back (for `[a,b,c]` minus `a`, rest index 1 = *between* b and c). Corrected to `reduced.length`, and the panel's pinned expectation — whose comment asserted the wrong arithmetic — corrected with it (D76). The shell could not have fixed it: that index is byte-identical to `Alt`+ArrowDown on the last-but-one slot.
- **The handoff's A2 framing was wrong** ("marquee, rotate, groups, mini-toolbar are implemented but not driven"). Handle transforms and `deleteSelection` were **already** driven; the real gaps were that marquee was never *armed*, `tapObject`/`longPress` were never called, `onPinnedToolbar` was `() => undefined`, no rotate UI existed, and `onLockedToast` was never passed. Groups genuinely do not exist anywhere.
- **The handoff's marquee rule collided with a shipped test.** It implies a marquee on any empty-canvas drag, but the F1 rule requires a **touch** empty-canvas drag to **pan**; marquee is therefore armed for pen/mouse only.
- **`deletable: a.type !== 'image'` (handoff A1 step 6) is wrong** per §20.2 — the *photo* is non-deletable, image insets are deletable.
- **The copy fold ran through three staging modules in one wave**; `layersWireCopy.ts` was folded from the appendix bytes and deleted, and the copy gate plus `layersRows` were re-run before the wave commit.

**Next:** slice 1.7 (image insets) — lane B2's picker sheet is already built and green (off the critical path), so Wave B is engine + integration.

## Slice 1.7 — Image insets
**Date:** 2026-09-21 · **Commit:** this commit

**Built** (engine and picker built in parallel off the critical path, then integrated):

- **The §8.5 coordinate model, pure and executed** — `src/editor/inset/insetGeometry.ts`: `insetTransform`, `insetLocalToSheet`/`sheetToInsetLocal` (replicating Konva's `T·R·S·T(-offset)`), `assetToInsetLocal`/`insetLocalToAsset` (the shared **`-crop`**), `sheetToAsset`/`assetToSheet`, `insetHandlePositions`/`nearestInsetHandle`, `defaultInsetPlacement` (40 % width, aspect preserved), `cascadeTap` (24 px), `scaleInset` (aspect-locked corners), `cropInsetEdge`, `rotateInset`/`snapRotation`, `replacePhotoDecision`.
- **The container render** — `src/editor/inset/renderInset.ts`: `clipFunc(0,0,crop.w,crop.h)`, `offset(crop/2)` + `position(x+w/2, y+h/2)` so **rotation pivots on the placed rect's centre**, `scale(w/crop.w, h/crop.h)`, the asset at `-crop`, and **every child wrapped and positioned at the same `-crop`**. Verified against Konva 10.6's `Container._drawChildren` (the clip is applied in crop-window units).
- **Focus mode** — `src/editor/inset/InsetFocus.ts`: dims the photo, markup and every *other* inset to 0.35 **opacity** (so the focused inset's children stay bright), restores exactly, one level only.
- **Content-addressed assets** — `src/editor/inset/insetAssets.ts`: normalize → SHA-256 → `assets/<hex>.jpg`, dedupe by a `getFileHandle({create:false})` existence check, one write via `projectStore`. No index file (§19.3).
- **Child addressing in the document** — `src/editor/shapes/scene.ts`: `locate()` as the single resolver for `top` vs `${insetId}/${childId}`, all mutators routed through it, `syncOwner` (a child's node lives in the inset's group), an `insetLayer` + per-layer `resort`, deep-cloning `serialize`/`load` of `children`, and `addChildDimension`/`addChildMarkup` (both refuse a nested `image`). **A child is not a member of any sheet z-band** — its `zIndex` orders it only inside its inset's group, and `moveInBandBefore`/`moveInBandToBack` return `false` for any key containing `/`, so a cross-band child move is unexpressible.
- **The tool** — `src/editor/tools/InsetTool.ts`: insert state machine, multi-select cascade, replace-photo decision point, Focus entry/exit, corner/edge/rotate routing with one-undo-step commits.
- **The picker sheet** (lane B2) — `src/ui/ImageInsetPickerSheet.tsx` + `imageInsetPicker.css`, its own `role="dialog"`, focus trap/return, three sections, honest empty state.
- **The shell wiring** — `src/ui/insetWiring.ts` (an `InsetAssetRegistry` decoding off the main thread with session-only recents; `createFocusAwareScene`, a facade that converts sheet↔asset inside Focus and nests creations), `insetWire.css`, and the `SheetEditor`/`EditorLayout`/`ToolRail` wiring: `insetLayer` + provider, picker mount (no second dialog), Focus + breadcrumb + Esc rung, the Inset rail tool **enabled**, and the Replace-photo dialog with hold-to-confirm.

**Machine gates:** 4/4 passing (orchestrator, on the **committed** file set — D77/F10's rule)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — **52 files / 636 tests** (was 44/565). *Measured with Wave C's not-yet-committed style files moved aside; with them present the tree is 54/698 — that larger number is NOT this commit's gate.*
- [x] `npm run build` — 17 precache (788.94 KiB); no `UNLOADABLE_DEPENDENCY`
- [x] `npx playwright test` — 5 passed / **5 skipped** (4 pre-existing + the new real-touch spec, deferred `fixme` — see below)
- [x] Gate halves with a machine form: the **child round-trip through the real editor** (place → Focus → child dimension → scale ×2 + crop + rotate 30° → save → remount → the child's asset geometry is unchanged and its wrapper sits at exactly `−crop`); the crop-window glue trace; two insets from one asset have **independent** children; the same image twice writes **one** file; Focus clips inside and outside-markup renders above insets; the §4.2 Esc ladder; Replace-photo warn/keep/hold-to-confirm-remove; a11y (Focus announced, breadcrumb is a real button, 48 px + 16 px slop, no inline style)

**Deferred to hardware:** 2 rows → logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.7 (the on-glass Focus/target walk; and the deferred real-touch reorder gate). None faked.

**Checkpoints fired:** none.

**Decisions recorded:** **D78** — the §4.2 Esc-ladder authority resolution, the ink measurement verdict, the camera fallback, the focus-aware facade, and the deferred real-touch gate.

**Surprises:**
- **The Esc ladder contradicted the spec, and the spec won.** The engine lane reordered `escapeStep` to `exitFocus`-before-`deselect` on the strength of a handoff brief and the plan's gate wording. **UI §4.2 states the ladder explicitly** (`pending → deselect → exit Focus → navigate`), and the authority chain puts the UI spec above the plan (`[x]` plan gates are not maintained; done-ness lives here). Restored §4.2's order, corrected the plan's gate text and both tests, and recorded it (D78). The mistake was mine in briefing: I relayed the engine lane's phrasing instead of checking §4.2 first.
- **The ink-thickness question was measured, not guessed.** Canvas zoom is **constant** (`mu = 10` at zoom 1 and 4), so the §4.2 tripwire ("ink width changing with zoom") is **not** tripped. Inset scale is **proportional** (`10 → 20 px` at ×2), which is exactly §8.5's "children scale with the inset" — intended, so **no code changed**; the behaviour is pinned by `tests/insetWire.browser.test.ts`.
- **The camera has no in-app path for an inset.** `CameraFlow` owns sheet creation and cannot hand back a normalized blob without widening its frozen props, so `onPickCamera` opens a hidden `capture="environment"` input — a real OS camera, but not the UI-spec §9:614 in-app viewfinder. Owed.
- **The real-touch regression gate is written but cannot yet run.** `tests/e2e/layersReorderTouch.spec.ts` (CDP `Input.dispatchTouchEvent`) stalls in **first-run step 2**: the stubbed `showDirectoryPicker` returns an OPFS handle that does not satisfy the step-2 persistence path, so `disabled={busy}` never clears and the editor is never mounted. The failure is in the e2e bootstrap, **not the product** — it is marked `fixme` with the observation in its header, never faked.
- **Five pre-existing browser tests needed a mock widened** (`resolveAssetsDir` on the `projectStore` mock) once `SheetEditor` began importing the inset modules transitively.

**Next:** slice 1.8 (style system) — its `StylePanel`/`StyleEditorSheet` UI half is already built and green, untracked, so Wave C is style state + presets IO plus integration.

## Defect remediation — D77 F1/F2/F4/F8 (independent review follow-up)
**Date:** 2026-09-21 · **Commit:** this commit

**Built:** fixes for the four defects the independent adversarial review found in the 1.4→1.6 batch, each **reproduced before the fix** and shown passing after (D77 register; D78 status).

- **F1 (highest value) — touch drag-to-reorder was silently dead.** Chromium **implicitly captures** the pointer to the grip, so the rows' `pointerover` never fired, `dropKey` stayed null, and the drop was a silent no-op. The panel now resolves the drop target **geometrically from captured `pointermove` coordinates** (`dropKeyAtPoint(clientX, clientY, elementFromPoint)`, with `elementFromPoint` injected so it is pure and unit-testable); the `pointerover` handler and the now-write-only `dragKeyRef` are gone. Pre-fix: `6 failed | 39 passed` in `layersPanel.test.tsx`; post-fix 46/46.
- **F2 — «Adjust endpoints» was dead.** It set `phase='refine'` but never armed `contactRole='refining'`, so the next drag returned `'pan'` and panned the canvas. It now routes through `beginRefine('b')` like the working 40 px-contact path, and `endRefine` clears the role.
- **F4 — Chain locked at the pre-refine B.** `commitValue` now reads the **live** anchor from the scene (`geometryAt(key)?.b`) instead of the stale field that refine drags never updated.
- **F8 — hold-to-constrain was dead on the second contact.** `placingB` now re-arms the hold baseline, so the 400 ms/8 px (pen) and 600 ms/16 px (touch) windows are measured from the *dragging* contact.

**Machine gates:** 4/4 passing (folded into the slice 1.7 run above; same tree)
- [x] `tsc` 0 · `vitest` 52 files / 636 · `build` 0 (17 precache) · `playwright` 5 passed / 5 skipped
- [x] Per-defect **pre-fix failing → post-fix passing** evidence captured for all four (F1: `onReorder` never called + no refusal alert; F2: move returned `'pan'`, B unchanged; F4: next locked A was `{300,100}` not `{300,200}`; F8: `|dx| 210` vs `|dy| 90`)
- [x] New guards: `tests/dimensionRefine.browser.test.ts`, `tests/shapeToolHold.browser.test.ts`, a pure `dropKeyAtPoint`/`rowKeyFromElement` test, and reworked drag helpers in `layersPanel.test.tsx` / `layersReorder.browser.test.ts`

**Deferred to hardware / owed:** the **real-touch** regression proof (`tests/e2e/layersReorderTouch.spec.ts`) is written and marked `fixme` — it cannot yet reach the editor because the e2e first-run bootstrap stalls with the OPFS stub (see the slice 1.7 surprises). Recorded in D78.

**Checkpoints fired:** none. **Decisions recorded:** D78 (status update on D77).

**Surprises:** **the two tests that "covered" F1 were themselves driving the broken mechanism** — a synthetic `pointerover` that real touch never delivers. That is the fourth instance this session of *wiring that exists, tests that pass, and a real input that cannot reach it*; it is now the reason `review-brief.md` question 8 exists. Also: `fix-5` observed a transient failure in another lane's in-flight `insetWire.browser.test.ts` that passed on re-run — mid-wave cross-lane test noise, resolved by re-running on the settled tree.

**Next:** the remaining D77 findings (F3, F5, F6, F7, F9), then slice 1.8.

## Defect remediation — D77 F3/F5/F6/F7/F9 (the remaining five findings) + the two deferred gates
**Date:** 2026-09-22 · **Commit:** session 13, one commit (see `git log`; the sha cannot be embedded in
the commit that creates it)

**Built:** the five findings D77 left owed are fixed, each **reproduced by execution before the fix** and
each with a guard that fails pre-fix. Three lanes on disjoint file sets:
- **F3** — `Esc`'s first rung now actually cancels a pending dimension: `EditorSession` gained
  `cancelPending()`, `SheetEditor` implements it (`tool.cancelPending()` + any pending markup op), and
  `EditorLayout`'s rung calls it. One rung per press; §4.2's ladder order untouched.
- **F5** — a real tool switch cancels the dimension's 450 ms settle (`dimRef` joined
  `cancelActiveMarkup()`), so the keypad can no longer open over the rectangle tool.
- **F6** — sub-slop moves are history-visible on **both** drag paths: one step iff the geometry actually
  changed, so undo restores instead of deleting.
- **F7** — the existing `applyScreenRules` chokepoint re-centres tagged labels and re-fits text-note boxes
  after re-applying the counter-scaled `fontSize`; measured drift **58.8 px → 0.5 px** at 4×.
- **F9** — handles scale/stretch per UI §8.6 (aspect-locked corners, single-axis edges, opposite corner
  fixed, one undo step), via a local `scaleGeometryLocal` (`src/domain/**` untouched).

Plus **B2** — C4's machine half measured (provisional) — and **B1**, whose real blocker was root-caused by
execution (D81) rather than fixed.

**Machine gates:** 4/4 passing — measured on a tree that also contains the slice-1.8 work (see the note
below; both waves share one commit, so this gate is the gate for both).
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **62 files / 790 tests passed** (node + jsdom + browser)
- [x] `npm run build` → 0 errors, 2125 modules, **17 precache entries (855.24 KiB)**
- [x] `npx playwright test` → **5 passed / 5 skipped** (the F1 real-touch spec stays `fixme` — D81)

**Deferred to hardware:** 2 added → `docs/HARDWARE-TEST-CHECKLIST.md`
- **C4** re-measured on a Surface Go (the §21.8 ladder; the dev-machine number decides nothing).
- ⚠ **The B1 handle-persistence check** — *pick a real folder in first-run, then reload: does Home come
  back?* This decides whether the renderer death is an OPFS-only harness problem or a **product** defect in
  `src/settings/projectsRoot.ts`.

**Checkpoints fired:** **C4** — machine half **measured** (median **0.6 ms**, p95 1.3, on the real
`min(dpr, 2)` path; 0.7 ms forced at ratio 2 and ratio 1; the ≤16 ms ladder bar is **not tripped** here).
Recorded **provisional, never a pass**. Side finding: the browser project runs at `devicePixelRatio === 2`
(200 % scaling), so the DPR-2 ratio is genuinely exercised — partially closing D64's "DPR-2 inferred, not
measured" watch item.

**Decisions recorded:** **D79** (the five fixes, the two spec-expectation corrections with arithmetic, and
the owed items), **D80** (C4 measured, provisional), **D81** (B1's real root cause).

**Surprises:**
1. **The session-12 diagnosis of B1 was wrong.** Not "`disabled={busy}` never clears": a page that LOADS
   with an OPFS directory handle stored under `fm:projects-root` **kills the renderer**. Proven with three
   probes (write OK, page alive, *next load* dies); the "seed the handle instead" alternative fails for the
   same reason. The spec's header carries the corrected evidence and stays `fixme`.
2. **Two tests encoded a defect** and were corrected as spec-expectation corrections with the arithmetic
   shown — not weakened: `markupTools.test.ts`'s `axisLockDelta` rows (`n/s` is the **y** axis once a
   handle resizes) and `layersWire.browser.test.ts`'s "a handle drag translates the selection" (wrong by
   1.5757 px; now asserts the §8.6 property).
3. **A new drift found and recorded owed:** the dimension label's collision-push offset/leader and the
   angle's arc radius are computed at build scale and still drift on zoom; `applyScreenRules` cannot fix
   them (they need the tip/geometry).
4. `editorCanvas.browser.test.ts`'s §4.2 gate was **extended** (label midpoint + box containment at
   1×/4×/0.5×) — the old gate measured glyph *size* on an un-offset node, which is exactly why F7 survived
   it for a whole slice.

**Next:** slice 1.8 (same commit).

---

## Slice 1.8 — Style system
**Date:** 2026-09-22 · **Commit:** session 13 (shared with the D77 remediation above)

**Built:** the per-tool style system. `styleByTool` (zustand+immer) gives every tool its own
`AnnotationStyle` — a swap is a **return, never a reset** — plus the last 8 **recents** (deduped,
tool-filtered). Applying a style to a selection is **exactly one** undo step, and undo restores each
object's **own** previous style. Named per-tool **presets** persist to
`<project>/.fieldmeasure/presets.json` **atomically** through `projectStore`, with a `folder-unavailable` /
`corrupt` state and a Retry. The props-driven **StylePanel** (WYSIWYG 96×40 Style Chip, palette, width
ladder, fill/alpha, line style, arrowheads, Recents, the §7.4 selection bar with count / Deselect / apply
toggle / scope chip, the §7.3 applied-to hint) and the **StyleEditorSheet** are mounted and wired in
`EditorLayout`. The panel is the **only** place the project's precision and unit format are edited —
**D31 held** (the keypad's fraction chip verifiably stays entry-scoped) — and every label re-derives.

**Machine gates:** the 4/4 gate above is this slice's gate too.
- [x] mixed selection renders indeterminate; a change applies to all and clears it — **routing** proven in
      `tests/styleIntegration.test.tsx`, **effect** in `tests/sceneStyle.test.ts` (node) +
      `tests/sceneStyleCommand.browser.test.ts` (real Konva)
- [x] the precision control edits the **project** value; labels re-derive; the chip confirms
- [x] presets round-trip `presets.json` and survive a reload (real `projectStore` + the in-memory FSA fake)
- [x] style memory returns on a tool swap
- [x] a11y: mixed/indeterminate **announced**; disabled controls keep a reason; 48 px + 16 px slop; the
      swatch grid keeps its sanctioned sub-48 exception; Recents are 44 px
- [~] **`[Surface]`** swap tools + restyle in < 2 s without losing flow → HARDWARE-TEST-CHECKLIST (§1.8)

**Deferred to hardware:** 1 → the §1.8 `[Surface]` flow gate.

**Checkpoints fired:** none.

**Decisions recorded:** **D82** (what shipped; the **extend-vs-owe** interface decision; the §7.2
applicability table with its two reported ambiguities; the owed tool-specific controls) and **D83** (the
byte-checked copy fold, the selection-style mirror, the wiring, and the gate's explicit routing/effect
split). **D84** records the integration defect the full gate caught.

**Surprises:**
1. **The full gate caught a defect no lane could see (D84).** Three previously-green **browser** suites
   began failing to import — `SyntaxError: … '/src/fs/projectStore.ts' does not provide an export named
   'resolveFieldMeasureDir'` — once `EditorLayout` first pulled the new `presets.ts` into the browser graph.
   `tsc`, the rolldown build, node+jsdom **and a namespace probe inside the same browser context** all saw
   the export; clearing Vite's caches changed nothing. Fixed behaviour-identically with a **namespace
   import** in `presets.ts` (3 files / 38 tests green). Root cause not fully isolated — the leading
   hypothesis (mid-run dep re-optimization because `EditorLayout` is lazy-loaded) is recorded as a **watch
   item**. The lane protocol reserves the browser project, so this was structurally invisible until the
   orchestrator ran the full gate — the runbook rule earning its keep.
2. **The copy fold caught a staged bug:** `project.selectionCount` was staged as the rendered literal
   `'3 selected'`; the appendix declares the template `{count} selected`. Folded as the template — the
   literal would have shipped a wrong count.
3. **Six of six "known interface gaps" were closed rather than owed** — §7.3 names the Recents row and
   §7.4 says its details "must be honored", so leaving them owed would have flattened §11.6 #5.
4. **Reported, not fixed:** `EditorLayout` duplicates the panel's private type→tool map (drift risk), and
   the horizontal dock now auto-sizes because the real panel lays its sections in a row.
5. **One commit, not two.** Part A/B and 1.8 share `session.ts`, `EditorLayout.tsx`, `SheetEditor.tsx` and
   `editorShell.test.tsx`; splitting them would have required hunk-level surgery inside shared files, which
   is exactly the whole-file-loss risk the runbook warns about. The gate above is therefore measured on the
   single committed file set — rule 7 satisfied by construction.

**Next:** slice **1.9 — Export** (steps 2–5: `renderStage.ts`, `pdf.ts`, `png.ts`, `ExportWizard.tsx`;
step 1, `export/filenames.ts`, shipped in 1.3). The export-invariance rule (`0.75 × mu` pt at every
multiplier M) is the whole slice, and `src/editor/../export/renderStage.ts` must be the **only** place that
scales for export — the §4.2 screen and export paths are opposites and both are load-bearing.

## Defect correction — first-run handedness card order (owner-reported; D85)
**Date:** 2026-09-22 · **Commit:** session 13 follow-up (see `git log`)

**Built:** the first-run step-1 cards now render **Left on the left, Right on the right**. They rendered
`[Right][Left]`, which the **owner caught by using the running app** — no gate saw it. The two
`role="radio"` elements were **re-ordered in the DOM** rather than flipped with CSS, because DOM order is
the focus order; a `row-reverse` flip would have pushed the focus ring against the visual order (WCAG 2.4.3).
`Right` stays pre-selected. UI §4.4:177 amended to state the arrangement so it cannot be silently reverted.

**Machine gates:** `<n>/<n>` passing (measured on this commit's file set)
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → `<files>` files / `<tests>` tests — the new guard asserts the **DOM order**, and
      the keyboard test now expects the first `Tab` on the Left card
- [x] `npm run build` → 0 errors, 17 precache entries
- [x] `npx playwright test` → 5 passed / 5 skipped

**Deferred to hardware:** none added.

**Checkpoints fired:** none.

**Decisions recorded:** **D85** (card order: the owner's decision, the DOM-vs-CSS a11y reasoning, and the
test change) and **D86** (a real `FileSystemDirectoryHandle` survived a page load in the review browser —
the first evidence on B1's open product question, pointing away from a defect; the OPFS case is the odd one).

**Surprises:** the jsdom test asserted the **pre-selected hand** but never the **order**, and the e2e smoke
test only asserts the heading — so every gate was green while the screen was wrong. That is the second time
this session that *"all gates green"* and *"the product is right"* differed (the first was D84). When the
remaining `[Surface]` gates are run, expect this class again: **a machine gate can only see what it asserts.**

**Next:** slice 1.9 — export (unchanged).

## Feature wiring — Home «New project» (owner-reported dead control; D87)
**Date:** 2026-09-22 · **Commit:** session 13 follow-up (see `git log`)

**Built:** `«New project»` on Home now works. It was a real, enabled, approved-copy button (`home.newProject`)
whose handler was a no-op stub — and **no create-project code existed anywhere in `src/`**, with the gap
recorded nowhere. It now creates an **app-named subfolder of the projects root** (`New project`,
`New project 2`, …; the base name is the approved copy itself), writes a schema-valid `project.json`
**atomically** through `projectStore` under the D51 runtime key, and opens the new project's editor — whose
empty state already reads `«No sheets yet — take a photo to start.»`, so **no new UI and no new copy** were
invented. It **never adopts** an existing folder, and a double-tap cannot mint two projects.

**Machine gates:** 4/4 passing (measured on this commit's file set)
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **64 files / 802 tests** (node + jsdom + browser; **+12 tests**)
- [x] `npm run build` → 0 errors, 17 precache entries (856.12 KiB)
- [x] `npx playwright test` → 5 passed / 5 skipped

**Deferred to hardware:** none added.

**Checkpoints fired:** none.

**Decisions recorded:** **D87** (the owner's flow decision, the naming rule and its bound, the never-adopt
guarantee, the landing rationale, and the owed items below).

**Surprises:** this control had been **dead since 1.4**, and **no gate could see it, because nothing owned
it** — there was no test to fail and no document to disagree with. The owner found it by clicking it. Together
with the handedness-card order (D85) earlier the same day, that is **two visible defects in one session on a
tree whose full gate was green** — both of the class *"a machine gate can only see what it asserts."* Expect
more of this when the `[Surface]` gates are run.

**Owed (recorded, not dropped):**
- **`«Open existing folder…»` is still a no-op.** The specs say it "opens `showDirectoryPicker`" but never
  whether that re-points the projects root (hiding projects) or adopts a folder from outside it — needs an
  owner answer or a spec amendment (handoff §9.2 row 18).
- **A create failure is silent** to the user (this slice has no error-surface copy); the toast/autosave layer
  (**1.10**) owns it. `createProject()` itself never swallows — no root, name exhaustion and write failure all
  throw.
- The button has **no busy/disabled visual** while a create is in flight (the ref only blocks the second
  create).

**Next:** slice 1.9 — export (unchanged).

---

## Slice 1.9 — Export (MODULES ONLY — the wiring is not built) + the session-13 review remediation
**Date:** 2026-09-22 · **Commits:** `cc35e4c`, `192585f`, `907af0b`, `33cee24`, `ada456b`, `250668c`
· **Branch:** `claude/amazing-carson-ocp8q7` (PR #2, draft) — **not `main`**

**⚠ This entry deviates from the one-commit-per-slice rule, and says so rather than hiding it.** Six
lanes ran in parallel and landed at different times, and the session's environment required a clean tree
at each stop, so each lane was committed as it was verified. Each commit message states that the wave was
still in flight. The usual discipline resumes when `runExport.ts` lands.

**Built:** slice 1.9's export **modules**. `renderStage.ts` is the §4.2 export stage — `applyExportRules`
is a node-for-node **mirror** of `applyScreenRules`, reading the same attrs; the export path never calls
`applyScreenRules` and never calls `scene.setScale()`, so the two paths stay opposites. `pdf.ts` gives
`buildPdf` / `buildPdfParts` (splitting at 250 MB, the remedy designed in advance for the 50-sheet gate) /
the pure `planPdfParts`. `png.ts` gives 1×/2×/3× sizing, `zipPngs` (fflate, level 0 — PNG is already
DEFLATE'd) and an IHDR parser that validates the signature **and** the chunk type. `ExportWizard.tsx` is
the §11.10 four-step wizard built against an injected-props interface, so it never imported a sibling
lane's in-flight file. 48 copy rows folded into `strings.ts` and machine-checked.

**NOT built — the slice is not usable:** `src/export/runExport.ts` does not exist and the wizard is not
mounted, so **nothing in the app can reach an export**. See `docs/handoff-session-14.md` §3.

**Machine gates:**
- [x] **export invariance, measured in REAL PIXELS** at M = 1/2/3 (`tests/renderStage.browser.test.ts`
      scans `getImageData`; not attribute arithmetic — the review brief's prior catch #6).
      `0.75 × mu` pt at every M; page pt = imagePx × 0.75, independent of M
- [x] PNG pixel dimensions; zip round-trip through `unzipSync` on the decompressed bytes
- [x] the 29-row filename table (unchanged, re-run) and the conflict rows
- [x] the 512 MB guard at its **exact** inclusive boundary (D96), and the 3× refusal as a **refusal** —
      `tests/exportWizard.test.tsx` asserts `runExport` was never called, not merely that a message showed
- [x] the damaged-photo white page at module level
- [x] a11y: keyboard-operable wizard, announced steps, selectable result path, no inline `style=""`
- [~] **`[Surface]`** H12 (Acrobat across M), H8 (50-sheet at 2×), **H19–H22** (damaged photo end to end,
      NTFS case-insensitive conflict, C6's real ceiling, the touch + a11y walk)

**Also landed — the independent review session 13 deferred.** 7 of 9 findings fixed, two of them
data-integrity bugs in already-shipped code that every prior gate had passed: a **cancelled drag persisted
geometry to `markup.json` with no undo step** (the palm-rejection case), and **resize teleported a vertex
on 7 of 11 annotation kinds** (all 11 resize tests used a `rect`). Also §8.3's 600 ms style coalescing,
which had **zero** production callers while two suites asserted it worked; a test that could not fail and
the growth-past-pivot bug it hid; a link failure being reported to the user as "presets file is corrupt";
and the duplicated type→tool map. **A bug the full gate caught that no per-lane check could:** the
dimension label's halo and hairline carried no `strokeWidthMu` tag, so they stayed 8 px / 1 px at every M
while the glyphs scaled — the §4.2 invariant failing for the label itself (D98).

**Deferred to hardware:** 6 → H8, H12, H19, H20, H21, H22.

**Checkpoints fired:** none. **C6 is NOT fired** — its number is a dev-machine figure (D96) and H21 is
what sets it.

**Gate on the pushed tree (`250668c`):** `tsc` 0 · `vitest` **71 files / 1015 tests** (node + jsdom +
browser) · `build` 0 (17 precache, 857.62 KiB) · `playwright` 5 passed / 5 skipped.

> **Restored in session 16.** The merge commit `2e7a43a` took `docs/BUILD-LOG.md` wholesale from `main`,
> which silently dropped this entry (it exists in history at `b2d6dea`). The text above is that record with
> its decision numbers re-mapped to the reconciled scheme (`D85`–`D88` → `D96`–`D99`; see DECISIONS `D100`).

---

## Session 16 — the union: merge published, numbering reconciled, and the beta flow
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main` (the cloud branch is merged into it)

**Done:**

- **The parallel-branch collision is closed.** `main` fast-forwarded to the merge commit `2e7a43a` and was
  **pushed** — `origin/main` is now the union and PR #2 closes as merged. The merge is structurally sound
  (no conflict markers; both sides' code present) and its gate was **re-run on Windows before anything
  landed on it**: tsc 0 · **73 files / 1027 tests** · build 0 (17 precache, 858.51 KiB) · playwright 5 / 5.
- **Decision numbering reconciled (D100).** The merge shipped two `D85`–`D88` sequences. `main`'s four keep
  their numbers; the four conflicting **export-side** entries moved to `D96`–`D99`. Docs-only — no source or
  test comment changed. The one external reference updated is HARDWARE-TEST-CHECKLIST H21 (the C6 row).
- **The merge's silent doc loss is repaired.** `2e7a43a` had taken `CONTINUITY.md` and `BUILD-LOG.md`
  wholesale from `main`, dropping the branch's session-14/15 snapshot **and its 1.9 entry**, while the code
  kept 1.9. The 1.9 entry is restored above (from `b2d6dea`, numbers re-mapped); CONTINUITY was rebuilt from
  the branch's session-15 state with `main`'s session-13 follow-up and watch items spliced back in. The
  untracked `docs/CONTINUITY_new.md` was a **mojibake duplicate** of `main`'s CONTINUITY (byte-compared: same
  854 lines, same references, no unique content) and was deleted.
- **The session-14 independent review is discharged (D101).** **F1 — recorded as a §4.2 export defect — is a
  FALSE POSITIVE, proven by execution.** `node_modules/konva/lib/shapes/Text.js:639-643` forces
  `getStrokeScaleEnabled()` to `true` ("for text we can't disable stroke scaling"), so the
  `strokeScaleEnabled() === false` guard in `applyExportRules` **and** `applyScreenRules` is unreachable for a
  `Konva.Text`: the prescribed `strokeWidthMu` tag is inert. The export stage scales the layer itself
  (`renderStage.ts:395`), so the angle halo already rendered `4 × M` — measured run thickness at M=1/2/3 =
  **5 / 8 / 13 px**, and **byte-identical with and without** the prescribed tag. A **pixel regression guard**
  was kept instead of a fix (`tests/renderStage.browser.test.ts`, its own fixture). **F2** (the stale halo
  rationale) was re-worded. **D98's** (branch D87) tags are inert for the same reason — its *outcome* stands
  (the export was always correct), its *explanation* does not. New and real: on-screen label outlines scale
  with canvas zoom instead of a constant mu px — cosmetic, owed to 1.10 (D101).
- **Beta flow landed (D102 = the owner's D88 answer, option B).** «New project» creates the folder and opens
  the **camera** over the editor; cancelling falls back to the editor's empty state, which now carries the
  spec'd add pair — primary «Take photo» (`project.addTakePhoto`, appendix line 59) + «Import»
  (`capture.importButton`) — wired through a single `onTakePhoto` seam (`App → EditorLayout → SheetEditor`) so
  exactly one capture dialog exists. All three stubbed folder controls (the secondary «Open existing
  folder…» card, its empty-state variant, and «Locate…» on a moved folder) are now **honestly disabled**
  (`disabled` + `aria-disabled`, keyboard-skipped, copy kept) instead of looking live.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **73 files / 1031 tests** (node + jsdom + browser; +4 this wave), exit 0
- [x] `npm run build` → 0 errors, 17 precache entries (858.82 KiB)
- [x] `npx playwright test` → 5 passed / 5 skipped

**Deferred to hardware:** none added. H19–H22 (1.9) and H8/H12 remain pending.

**Checkpoints fired:** none — **C6 is not fired**; H21 is what sets the real ceiling.

**Decisions recorded:** D100 (the numbering map), D101 (F1 false positive + the D98 correction + the
on-screen stroke finding), D102 (the owner's D88 answer + the beta-honesty rule).

**Surprises:**
1. **The merge silently reverted the live docs while keeping both sides' code.** File-level conflict
   resolution took `main`'s `CONTINUITY.md` and `BUILD-LOG.md`, so the project's own state file described a
   tree that no longer existed. Nothing flagged it; it was found by diffing the merge against *each* parent.
   **A merge is not integration.**
2. **A stop-class review finding was wrong.** F1's final step was attribute arithmetic, not a pixel
   measurement — exactly the class the review brief's question 6 warns about (second occurrence, after
   D88). Had it been "fixed", the codebase would carry an inert line with a false rationale.
3. **The prescribed fix was inert but harmless-looking**, which is the worse failure mode: it would have
   passed every gate and documented the wrong mechanism.

**Next:** slice 1.9's wiring (`src/export/runExport.ts` + mounting the wizard + enabling the entry points,
per `docs/handoff-session-14.md` §3), then 1.10.

---

## Session 17 — slice 1.9 wired (export works), 1.10 themes, and two real bugs closed
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Built (three lanes on disjoint files, integrated and gated on one tree):**

- **Export is reachable and working — slice 1.9 is complete.** `src/export/runExport.ts` supplies the
  orchestration the wizard's injected props always needed: one sheet at a time (`renderSheetJpeg` for PDF,
  `renderSheet` + `canvasToPngBytes` for PNG), each bitmap freed before the next, `buildPdfParts` (never
  `buildPdf([])`), `zipPngs`, `conflictName` against the destination's **real** listing, and **every byte
  through `projectStore.writeAtomic`** under the per-project lock (`createWritable` still exists only inside
  `projectStore`). Per-file failures become rows, never a rejection. The wizard is a **static** import in a
  positioning-only slot (own `z-index: 60` dialog, no second `role="dialog"`); the engine stays lazy
  (`await import('./pdf'/'./png')`). Entry points live: top-bar **Export**, **`Ctrl+E`**, **`⋯ → Export`**.
  **The pixel assertion that matters:** a 400×300 sheet at M=2 exports a **300 × 225 pt** PDF page — a
  bitmap-derived page would be 600 × 450. **Review F3 is closed the hard way:** `assetProvider` is
  disk-backed (every referenced asset decoded before a sheet renders, seeded from the editor session
  registry) and closes only bitmaps it decoded — a borrowed session bitmap is never closed.
- **1.10 themes (Sunlight / Dim) landed** — token-level `data-theme` remaps applied by one runtime hook at
  the app root; Standard pinned byte-for-byte; `--hi`/`--sel`/`--ok`/`--warn`/`--err` provably untouched,
  because the ink carries the measurement. The Settings → Display control already existed and was inert.
- **The owner-reported dead «New project» button is fixed.** Two stacked causes: the §5.2 gesture re-grant
  (`FsaBackend.requestAccess`) had **no caller anywhere**, and the caller swallowed every throw — so on a
  reloaded page (handle restored, **write grant lost**) the first filesystem call failed invisibly.
  `ensureRootAccess({ request: true })` now asks inside the click; the open-project path re-grants
  best-effort, so the editor's «Retry» recovers.
- **A gate blind spot, found and recorded:** `npm run dev` renders **completely unstyled** — the shipped CSP
  (`style-src 'self'`) blocks Vite's injected inline `<style>`, and every gate uses the built app. The
  convention is now explicit: judge appearance from the built app.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **78 files / 1095 tests** (node + jsdom + browser; +5 files / +64 tests), exit 0
- [x] `npm run build` → 0 errors, **25 precache entries (1454.51 KiB)**
- [x] `npx playwright test` → 5 passed / 5 skipped (see the collision below)

**Gate-environment collision (recorded because it looks like a failure and is not one):** the first
playwright run exited 1 with *"http://localhost:4173 is already used"* — the e2e config starts
`npm run preview` on 4173 and `reuseExistingServer` is disabled while `CI=true`, and a preview server
started earlier in the session was holding the port. Re-run without `CI` → **5 passed / 5 skipped**.
No code was involved.

**Deferred to hardware:** none added. H19–H22 (1.9) and H8/H12 remain pending.

**Checkpoints fired:** none — **C6 is still not fired**; H21 on a Surface Go sets the ceiling.

**Decisions recorded:** **D103** (the gesture re-grant and the swallowed throw), **D104** (themes),
**D105** (dev-mode CSP), **D106** (the export wiring, its unpinned decisions and its owed list).

**Surprises:**
1. **The dead button needed both a repair and an admission.** Two independent faults — a permission path
   with no caller, and a caller that swallowed everything — hid each other; fixing either alone would have
   left the symptom in place or produced a silent refusal.
2. **The suite was structurally blind to a whole environment.** Styles are only ever asserted against the
   built app, so the dev server's CSP-blocked styles could not fail any test. Third instance of "the gate
   can see only what it asserts" — this time about the *server*, not the assertion.
3. **The orchestrator's own helper server broke a gate run** (the 4173 collision). Worth remembering:
   stop convenience servers before gating, or leave `CI` unset so `reuseExistingServer` applies.

**Next:** the rest of 1.10 (autosave chip, toasts, `.trash/` prune + restore, arrow nudge, the end-to-end
a11y audit), then 1.11 (update strategy), then 2.0.

## Investigation — the torch button and the capture/import path (owner request)

Read-only investigation, recorded in `docs/investigation-torch-and-capture.md` and indexed in
`docs/INDEX.md`. No product behaviour changed by this entry.

**Question asked:** does the ⚡ Torch button actually fire the light on a Surface tablet, and is photo
saving/import complete?

**Torch — the button is wired to real hardware, but Windows cannot light the LED.** The toggle
(`src/ui/CameraFlow.tsx:860-870`) calls `toggleTorch` → `applyAdvanced({ torch })`
(`CameraFlow.tsx:535-539`), which is the standard Chromium hardware call
`MediaStreamTrack.applyConstraints({ advanced: [{ torch }] })` (`CameraFlow.tsx:458-466`). The
capability probe is already read (`CameraFlow.tsx:395-396`) but the button ignores it, and only the
zoom chips are capability-gated (`CameraFlow.tsx:565`). **On Windows/Chromium the camera stack does
not expose a `torch` capability, so `applyConstraints` rejects and the LED does not light — a platform
limitation, not a code defect.** Re-running the C3 device-caps probe here confirmed no usable camera in
the test context (`getUserMedia ladder: NotSupportedError`), matching the provisional C3 record. Whether
the owner's Surface exposes `torch` at all is a `[Surface]` measurement, never to be assumed.

**Capture/import — complete in code.** Capture (`CameraFlow.tsx:569` → `:605-642`) and import
(`CameraFlow.tsx:665-671`) both go through the same `commit`: EXIF read before normalize, rotation
baked, `normalizeImage`, then `addSheetFromPhoto` (the frozen atomic tmp→close→move path under the
project lock) plus an atomically written 640×480 `thumb.jpg`. A write failure keeps the photo and offers
Retry + «Save a copy…». The editor-side import entry is `EditorLayout.tsx:647 onImportFile`. What remains
is on-glass verification, already logged as `[Surface]` rows.

**Two candidate items recorded, deliberately un-numbered** (the parallel-session numbering collision
was reconciled in `ef4ccfc`, and slice 1.10 is actively editing `DECISIONS.md` — minting a number here
would re-create the collision): (1) the toggle can show "on" when the hardware rejected the constraint —
revert-on-rejection and/or disable from `caps.torch === false`; (2) a screen-brighten "work light" is the
only hardware-independent alternative, but it is a new feature and would need a §2.4 scope check and a
decision first. The next session to touch `DECISIONS.md` should number item 1 and decide item 2.

**Sub-agent note:** no lane was ever assigned to torch/capture (capture shipped in session 10). The one
background lane this session dispatched — the independent review of the session-14 export batch —
completed and delivered its findings; its "running" job-board state was stale bookkeeping.

**Gates:** none run for this entry — it is documentation only.

---

## Session 18 — slice 1.10 trust layer: the autosave chip and single-instance toasts
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Built:**

- **Autosave chip (§13.1)** — `src/ui/AutosaveChip.tsx`, purely presentational: it renders
  `persistQueue`'s `storageStatus` and never writes it. All union members: `saved` (✓, with the resolution's
  clock) · `saving` · `pending` (folder offline) · `readonly` (**not** an error) · `error (+ actionable
  Retry)` · `full` · `offline`. **No optimistic Saved** — it renders *nothing* until a real `… → saved`
  transition resolves after mount. An absent writer lease now maps to `storageStatus: 'readonly'`, with the
  queue's `onStatus` gated so it cannot overwrite that state.
- **Single-instance toasts (§13.4)** — `src/ui/Toast.tsx`: one message and one timer in the component, so
  stacking is **structurally impossible**; a new toast replaces the current one and **closes the replaced
  toast's action window**; 8 s normally, **10 s when it carries an action**; timers cleared on replacement
  and unmount; `role="alert"` for errors and `role="status"` otherwise; the action is a real 48 px
  `hit-slop` button; **focus is never moved**, so it cannot fight the keypad sheet.
- **The silence is closed (D103's owed half).** `App.handleNewProject`'s catch — the swallow that made a
  failed create look like a dead button — now raises an urgent toast (`errors.projectUnavailable`), and Home
  mounts a `ToastHost`. The editor's project-load catch says the same thing while keeping its inline panel.
- **The recoverable-delete policy now holds.** Erase-delete and select-delete raise a toast with a **real
  Undo** (`history.undo()`). This also fixed a pre-existing lie: the erase toast showed «Undid: …» **on
  deletion**, claiming an undo that never happened.
- **`retrySave()`** added to the session, wired to the chip's Retry (`persistQueue.flush()`).
- **Spec divergence resolved:** §13.3 (object-delete toast 8 s) vs §13.4 (any action-carrying toast 10 s) —
  **§13.4 wins**; an undo window is exactly the case the longer timing exists for.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **80 files / 1110 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 25 precache entries (1458.91 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0** — with `CI` unset so it reuses the running
      preview on 4173 (the deliberate fix for session 17's port collision)

**Deferred to hardware:** none added. H19–H22 and H8/H12 remain pending.

**Checkpoints fired:** none.

**Decisions recorded:** **D107** (the trust layer, the delete-toast undo, the read-only mapping, the
§13.3/§13.4 resolution, and the owed list).

**Surprises:**
1. **The erase toast had been lying since it shipped** — it announced an undo on a delete that recorded no
   undo step. Nothing asserted the *presence of the undo step*, only the text.
2. **The fix for session 17's gate collision was itself a one-line change** (`CI` unset for the e2e step):
   the collision was never a code problem, and the gate is now green in the same shell that hosts the
   preview server.

**Next:** the rest of 1.10 — the **History flyout** (owed; `writeHistorySnapshot` has no caller),
`.trash/` + prune + restore, the arrow nudge, and the end-to-end a11y audit — then 1.11.

---

## Session 19 — the export review discharged, plus two honesty bugs (torch toggle, Home card meta)
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Done:**

- **The export wave's independent review is discharged (D109).** The register was executed in a **pinned
  clean worktree** at `6c3bc1d` (the main tree had moved on — isolation, not inspection). Verified sound:
  the physical-size invariant (**300 × 225 pt at M = 1/2/3**), the §4.2 pixel ratios, `assetProvider`
  lifetime, per-file failure rows (`disk-full` / `locked` / `permission`, and `retryFile` re-writing its
  retained bytes), conflict resolution folding NTFS case, the **lazy-chunk failure path** (honest reject, no
  dead dialog), split/naming boundaries, the three themes' invariants, the D103 permission fix, and write
  integrity (`createWritable` exists only in `projectStore`).
- **D106's owed pixel proof is discharged — and permanent.** `tests/runExport.browser.test.ts` now asserts an
  inset exports its **photo**: red `assets/<id>.jpg` → inset-centre `[254,0,0,255]`; missing asset →
  `[58,63,70,255]` = `#3A3F46`, the placeholder it exists to catch.
- **F1–F4 fixed, each reproduced before the fix:** F1 the «Include sheet names» checkbox was **dead** (nothing
  consumed `includeSheetNames`) → now honestly **disabled** with the deferral recorded (caption placement is a
  UI-spec decision); F2 a revoked grant at the **tmp-handle** stage escaped as a raw `NotAllowedError` and was
  reported `unknown` → `writeAtomic` now creates the tmp handle *inside* its `try` so it classifies as
  `StorageWriteError('permission')` (semantics unchanged: tmp kept, target never deleted); F3 an emptied-
  mid-flight scope wrote a **22-byte empty archive as a success row** → the zip write is skipped when there
  are no entries; F4 a `'skip'` conflict wrote nothing and **reported nothing** → a `{skipped:true, bytes:0}`
  row plus progress in both branches, with the wizard's count excluding skips and offering no Retry for them.
- **F5/F6/F7 recorded:** the Dim comment was reworded so every ratio names its surface and the AA claim is
  scoped to shipped pairings (naming the one sub-AA pair, `--g400` on `--g750` = 4.35); `estimate`'s
  file-count undercount on a split is recorded; and the `as unknown as BlobPart` cast was **kept because it is
  load-bearing** — removing it fails `tsc` under TS 5.9's generic typed arrays.
- **Copy folded per runbook §11:** the lane's staging module (`src/ui/exportCopy.ts`) was folded into
  `strings.ts` as two `⚠ PROPOSED (C14)` rows (`skipped`, `statusSkipped`) and **deleted**; the copy contract
  (`strings.test.ts`, 3/3) stays green.
- **D108 — the torch toggle no longer lies.** It reported "on" even when the device refused the constraint
  (Windows tablets do not expose `torch`). `applyAdvanced` now reports acceptance and the toggle takes its
  state from that result; best-effort behaviour unchanged. Two new camera tests (20/20). Capability-gating the
  button is owed to the content owner (it needs a tooltip string the appendix lacks).
- **D110 — every Home card stated fiction.** `projectCardMeta` shipped the appendix's **example**
  (`'12 sheets · 48 MB · 2:14 PM'`) where its `Interpolation` column declares `{sheetCount} · {size} ·
  {time}`, so every card — including `.git` — advertised 12 sheets. The value is now the template and the copy
  test's rule is form-agnostic; unreadable folders read `0 sheets · — · —`.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **80 files / 1119 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 25 precache entries (1459.47 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0** (CI unset so it reuses the preview on 4173)

**Deferred to hardware:** none added. H19–H22 and H8/H12 remain pending.

**Checkpoints fired:** none.

**Decisions recorded:** **D108** (torch honesty + the work-light scope call), **D109** (the review register,
its resolutions, and the discharged pixel proof), **D110** (the card-meta example-vs-template defect).

**Surprises:**
1. **The review found the same defect class four more times** — a dead checkbox, a misreported permission
   failure, an empty success, and a silent skip — while every gate stayed green. The class is consistent: the
   system said something it did not do.
2. **`tests/strings.test.ts` had blessed the card-meta fiction** by naming that row as a sanctioned
   "rendered example stored literally" case. The gate was correct about the file and wrong about the product —
   the same shape as D88.
3. **A cast the reviewer called harmless is load-bearing:** dropping it breaks `tsc` under TS 5.9.

**Next:** the rest of 1.10 — the **History flyout** (owed), `.trash/` + prune + restore, the arrow nudge, and
the end-to-end a11y audit — plus the PDF-caption placement decision and the `Skip`-row copy sign-off. Then 1.11.

---

## Session 20 — the Project screen (the sheets grid) and slice 1.11 (update strategy)
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Built:**

- **The Project screen (D111 — the owner's D88 option A).** `src/ui/ProjectScreen.tsx` + `projectScreen.css`
  and the read-only loader `src/fs/projectSheets.ts`: the two add tiles **first in every state**
  («Take photo» primary, «Import»), per-sheet cards (real `thumb.jpg`, index badge, `+N` inset badge, mono
  `«2:14 PM · 3 dimensions»`), per-card selection driving a selection bar, and honest *loading / empty /
  error* states. Routing wired in `App`: **Home → grid → editor**; the editor's `‹ Projects` returns to the
  grid. The loader is tolerant exactly where tolerance is honest — a missing/zero-byte thumbnail is a
  placeholder, an orphan `project.json` entry reads as empty markup, and genuine corruption surfaces as the
  honest `error` state (reporting «0 dimensions» for an unreadable sheet would be a lie).
- **A capture returns to the grid (UI §11.8).** The capture overlay moved to the shell root, driven by where
  it was launched: from the grid it returns **to the grid** with the approved «Added {sheetName}» toast; from
  the editor it opens the sheet it wrote. «New project» keeps the owner's D102 camera-first flow and now lands
  its result on the grid. `CameraFlow`'s `onCaptured` payload gained the written sheet's `title` so the toast
  names the sheet instead of re-deriving a name (its test was updated for the extended payload).
- **Slice 1.11 (D112).** `registerType: 'prompt'` was **already set** (`vite.config.ts:35`) — verified, not
  changed. Around it: `src/ui/UpdateToast.tsx` (the plan's pinned signature), `src/ui/PWAUpdate.tsx`
  (`useRegisterSW` glue), `src/ui/updateReload.ts` (the pure ordering), and the `__BUILD_ID__` injection shown
  in Settings → About. The prompt **suppresses itself** while `persistQueue.inFlight`, while a placement op is
  pending, or while the keypad is open, and **reload is flush-first** (`flush → waitSettled → activate`) with a
  **parked** autosave failure treated as a rejection — a reload can never discard an edit that did not reach
  disk. A second toast surface is deliberate: `ToastHost` is single-instance and auto-dismissing, and cannot be
  gated on queue state.
- **Copy folded per runbook §11:** the Project screen's staging module (`src/ui/projectScreenCopy.ts`) was
  folded into `strings.ts` (the appendix rows verbatim, the rest marked `⚠ PROPOSED (C14)`, with the `projectMenu`
  rows traced to gaps §10) and **deleted**; `tests/strings.test.ts` stays green, which also confirms the
  lane's provenance claims were accurate.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **84 files / 1161 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 25 precache entries (1483.93 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0** (CI unset so it reuses the preview on 4173)

**Deferred to hardware:** the real service-worker update lifecycle (D112) and the `[Surface]` rows.

**Checkpoints fired:** none.

**Decisions recorded:** **D111** (the Project screen, its four forced choices, and its owed list), **D112**
(the update strategy, the suppression rules and the flush-first reload).

**Surprises:**
1. **A D51 regression only the App-level test could see.** The open-project registry is keyed by the full
   `${id}:${folderName}` runtime key; registering the bare id left every resolver throwing *"project … is not
   open in this tab"* — the grid reported **every** project as an error while its own 29 tests stayed green.
   Found by the integration test, fixed by composing the key first, and now pinned by that test's `empty`
   assertion.
2. **Three App-level expectations had to move with the product** (`«New project»` now lands on the grid, not
   the editor) — updated to assert the *new* intended behaviour rather than deleted, and the old editor-stub
   assertion became the grid-stub plus the registry proof.
3. **`registerType: 'prompt'` was already correct** — the plan's item 1 was a no-op to build and a real
   verification to make. Recorded so nobody "fixes" it twice.

**Next:** the Project screen's owed items (reorder, rename, duplicate, replace photo, delete → `.trash/`,
grid-scoped export) and the paused 1.10 polish (History flyout, a11y audit, halo fix, PDF captions), then 2.0.

---

## Session 21 — sheet trash (delete → `.trash/`, the 14-day prune, the restore UI)
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Built:**

- **Sheet trash, storage half (`src/fs/sheetTrash.ts`).** `deleteSheet` / `restoreSheet` / `listTrash` /
  `pruneTrash`. `deletedAt` on the `project.json` row is the **single** trash ledger — the schema already
  carried it (`schema.ts:125`, `types.ts:80`) and the scan, the intake path and the grid loader already skip
  such rows — and the files MOVE to `<project>/.trash/<id>/`. Because FSA has **no directory `move()`**, the
  move is **copy → verify (per-file size, which also catches a zero-byte blob write) → only then remove**; a
  failed copy leaves the original untouched and cleans up only a `.trash/<id>/` this call created. The prune
  is **strictly older than 14 days** (`at < now − 1_209_600_000`; an entry deleted exactly 14 days ago is
  KEPT, as is an unparseable `deletedAt`), it removes the folders **before** rewriting `project.json` (so an
  entry is never listed with its files gone), and it is the **only** thing that ever removes a trash entry —
  nothing prunes `.history/`/`.trash/` to make room, and `cleanStaleTmp` still skips `.trash/` (re-pinned).
- **Sheet trash, UI half (`src/ui/TrashPanel.tsx` + the grid's card menu).** Delete is **two deliberate
  taps** from a card's `⋯`; the panel lists trashed sheets with name, deleted date and **days left**, a
  read-only preview and «Restore». It is one `role="dialog"` with its own focus trap and focus return, and an
  unreadable trash renders as an *empty* trash rather than taking the grid down.
- **The delete toast is honest (the integration change).** The lane emitted «Sheet deleted · Undo»
  **optimistically**, before the shell's write resolved. The screen now **awaits the result**: resolve → the
  approved `toasts.sheetDeleted` with a real 10 s Undo routing to the same restore the panel uses; reject → an
  urgent `trash.deleteFailed` ("Couldn't delete that sheet") with **no success claim and no Undo offered for a
  deletion that did not happen**. Three tests pin it: the toast after resolution, **no toast while the write is
  in flight**, and a failure that says so.
- **The grid's Export hand-off (closes D111's last owed item).** The grid's selection travels to the editor
  and the wizard opens **already scoped** to it — the wizard derives `'selected'` from `selectedSheetIds`
  (UI §12:712). The hand-off waits for the export seam to publish the sheet list before opening, and the shell
  clears its copy through `onInitialExportConsumed`, so it can never re-open on a later render.
- **Copy folded per runbook §11:** `src/ui/trashPanelCopy.ts` was folded into `strings.ts` (`trash.*`,
  `toasts.sheetDeleted` (APPROVED), `sheetMenu.*`) and **deleted**; `tests/strings.test.ts` stays green. One
  new row was added by the integration: `trash.deleteFailed` (`⚠ PROPOSED (C14)`).
- **A drift hazard removed:** both lanes declared a `TrashedSheet` model; the storage module's is now
  canonical and the panel re-exports it (the D94 lesson, applied before it could bite).

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **86 files / 1205 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 25 precache entries (1498.09 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** the 14-day trash clock and real `move()`/NTFS behaviour (plus the carried rows).

**Checkpoints fired:** none.

**Decisions recorded:** **D113** (the trash slice: the copy→verify→remove move, the strict prune boundary, the
restore ordering deviation, and the honest delete toast).

**Surprises:**
1. **The sixth instance of one defect class.** Six fixes this session were the same shape: *the interface said
   something the system had not done* — a dead button, a card meta stating fiction, an inert tag, an empty
   archive reported as a success, a torch that lit nothing, and now a delete announced before it happened.
   Gates cannot catch it, because the assertion and the lie usually agree.
2. **Two lanes independently declared the same model type.** Harmless today, a drift bug tomorrow — caught and
   collapsed to one canonical definition at integration.

**Next:** the grid's remaining items (reorder, rename, duplicate, replace photo, the storage chip) and the
paused 1.10 polish (History flyout, a11y audit, halo fix, PDF captions), then 2.0.

---

## Session 21 addendum — the trash/grid review resolutions (D114)
**Date:** 2026-09-22 · **Commits:** see `git log` · **Branch:** `main`

**Context:** the independent, executed review of the trash + grid wave returned six findings (`D114`).
This entry records the resolutions; `docs/handoff-session-21.md` §9 carries the register in the same commit.

**Fixed:**

- **F1 — the severe one.** The Project route mounted **no `ToastHost`**, so every toast emitted on the sheets
  grid — the delete's «Sheet deleted · Undo», the failure line, the «Added {sheetName}» capture toast, the
  blocked-mutation line — went onto the bus and was **rendered nowhere**. A delete vanished the card with no
  announcement and **no undo window**: the trash slice's central promise was false in production. **One host
  now lives at the app shell root** (`.editor-toast` is `position: fixed`, so it belongs to no route), and the
  Home-branch and `EditorLayout` hosts are gone — a second host would double-subscribe and double-render.
  **Pinned by a new route-level test** (`tests/gridToast.test.tsx`) that mounts the real `App`, walks
  Home → grid, and asserts the toast **DOM** and its action, with a Home-route control. The lane's own 28
  tests asserted the **bus** — which is exactly why they could not see it. `editorShell`'s toast test now
  composes the layout the way `App` does.
- **F2 — a half-deleted sheet.** `deleteSheet` removed the original **before** marking the row, so a locked
  `project.json` (the §5.8 S5 case) left the folder gone from `sheets/`, its files in `.trash/`, and the row
  still live: the grid showed a card for a sheet that no longer existed, the trash panel could not see it, and
  Restore refused it as "already live". **Reordered** to copy → verify → **mark the row** → remove (tolerating
  `NotFoundError`), which turns that failure into the harmless duplicate the restore rationale already
  describes. Pinned with a test driving the fake's `beforeMove(file, name)` hook.
- **F3 — a false invariant.** The prune comment claimed "fully pruned or untouched — never listed with its
  files gone", which execution disproved for **multi-entry** prunes. Folder-first is kept deliberately (the
  alternatives are worse) and both the comment and `D113` now describe what actually happens.
- **F4 — a dropped action.** The grid's «Export» with **no selection** navigated into an editor with **no
  wizard** (`[]` means "every sheet", but the shell gated on a non-empty list). An empty selection now expands
  to the project's live sheets at hand-off, and with zero sheets the action stays on the grid.
- **F5 — a silent failure.** A failed **restore** that came from the delete toast's Undo was invisible (the
  failure flag's only surface is the trash panel, which is **closed** at that moment). The catch now also
  emits an urgent toast.
- **F6 — dead controls.** Two Settings rows («Trash…», «Third-party notices») were enabled with approved copy
  and no handler; both are now disabled honestly (the D102 pattern).

**Verified sound by the review, with execution** (recorded because a register is only useful if it says what
held): the 14-day boundary and `daysLeft`; the copy-failure paths, including a pre-existing `.trash/<id>/`
never being touched by cleanup; the restore-ordering claim; the prune's blast radius; "the only reaper"; the
D51 keys on every new caller; the honest delete at the screen level; the wizard's scoping; the panel's a11y.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `CI=true npx vitest run` → **87 files / 1208 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 25 precache entries (1498.22 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** unchanged (the real FSA/NTFS behaviour, the 14-day clock, the SW update lifecycle).

**Checkpoints fired:** none.

**Decisions recorded:** **D114** (the register and every resolution above); **D113** carries a correction for
F3.

**Surprises:** **F1 is the seventh instance of this session's one defect class** — *the interface said
something the system had not done* — and the first that survived a lane's own tests, that lane's honesty pass,
**and** an integration review. Every check asked what the code **emitted**; none asked what the **screen
rendered**. That question is now in the handoff and in `D114`.

**Next:** unchanged — the grid's remaining items (reorder, rename, duplicate, replace photo, the storage
chip), the paused 1.10 polish, and a real end-to-end run on the built app.

## Slice 1.10 (continued) - the sheets grid's remaining items (D111)
**Date:** 2026-09-22 · **Commit:** this commit (the grid wave)

**Built:** the Project screen's five owed items, end to end.
- **Storage — `src/fs/sheetOps.ts`** (the `sheetTrash` idiom: copy → verify → only then mutate the ledger;
  `writeAtomic`/`writeJsonAtomic` only; `createWritable()` is still called in `projectStore.ts` alone):
  `nextSortIndex` (`max(live) + 10`, or 10 when there are none), `reorderSheetRows` (pure; requires an exact
  permutation of the live ids, so a stale screen cannot scramble the file), `renameSheet` (title only — the
  folder is never renamed, and `updatedAt` is deliberately untouched because a rename is not a content
  change), `duplicateSheet` (folder copy via the now-exported `copySheetTree`, then the row appended at the
  end), and `replaceSheetPhoto` (§11.2:720's constrained replace).
- **Grid UI — `src/ui/ProjectScreen.tsx`, `projectScreen.css`, `src/ui/sheetReorder.ts`:** the §11.2:720 card
  menu (`Open · Rename · Duplicate · Replace photo · Delete`), every item live only when the shell injects its
  callback (the D102 pattern); inline rename (Enter commits, Escape/blur cancels, blank is a cancel); an
  honest duplicate failure line; the warned replace dialog (`Keep markup` default-focus / hold-to-confirm
  600 ms `Remove markup` / `Cancel`, real focus trap); the 400 ms long-press drag-reorder with live renumber
  and a pointer-following «Drop to move» chip; and the keyboard `Move earlier`/`Move later` pair as the
  WCAG 2.1.1 path (a long-press drag is unreachable by keyboard and jsdom cannot drive it).
- **Storage chip — `src/fs/projectSize.ts` + `src/ui/StorageChip.tsx` + `storageChip.css`:** §11.4's normal
  pill from REAL disk facts — a recursive byte walk of the whole project folder (including `.history/` and
  `.trash/`, which are what the user's disk actually holds) and `project.json`'s own `lastModified` as the
  save time. No estimate, no `Date.now()` fallback, and **nothing is rendered** while measuring, on failure,
  or when there is no real save time (the approved template needs both tokens; a blank time would claim a
  save that never happened).
- **The shell seam — `src/App.tsx`:** the reorder/rename/duplicate writes, and the whole replace decision
  (the file picker, the lazily-imported `normalizeImage`, identical dims → **silent** swap with the markup
  kept, different dims → the warned dialog). All copy folded into `strings.ts` under the one-writer rule:
  `storage.local` and `project.reorderChip` are approved appendix rows; the `sheetMenu.*` additions are
  marked `⚠ PROPOSED` (gaps §10 for `Open`/`Duplicate`/`Replace photo`, beyond both appendices for the
  accessible names, the move pair and the four failure lines).

**Machine gates:** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **91 files / 1293 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1516.68 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** the real touch reorder (implicit pointer capture, `touch-action` read at pointer
creation), the chip's real pointer-follow, a real replace against `move()`/NTFS/AV locks, and the chip's
numbers against Explorer — logged in `docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.10.

**Checkpoints fired:** none.

**Decisions recorded:** **D115** (the wave and its pinned choices, including what was deliberately NOT
built), **D116** (the `sortIndex` correction), **D117** (the replace-photo write order and its rollback).

**Surprises:** four, and they are one shape — a value that was right for the code that emitted it and wrong
for the system around it:
1. **`addSheetFromPhoto` wrote the wrong `sortIndex`.** It used `sheets.length` (0-based, gap of 1) while
   §20.6 pins gaps of 10 — so once the new reorder renumbered live rows to 10/20/30, a freshly appended sheet
   would sort **before every existing sheet** in the grid. Now `nextSortIndex(sheets)` = `max(live) + 10`;
   the two pins in `tests/sheetIntake.test.ts` were corrected (`0 → 10`, `[0, 1] → [10, 20]`).
2. **The shared fixture encoded the same contradiction.** `tests/fakes/fsa.ts`'s `validProjectFile` used
   `sortIndex: i`, which is why the lane brief's own arithmetic did not hold against it; it is now
   `10 × (i + 1)`, and `cameraFlow.test.tsx`'s pins followed. A fixture that disagrees with the convention
   under test is a wrong-expectation factory.
3. **That change exposed a misnomer.** `CameraFlow`'s `onCaptured` payload field named `index` actually
   carries the sheet's `sortIndex` (now `20`, not `1`). No consumer reads it; pinned at its true value and
   logged as a watch item rather than silently renamed.
4. **The replace could half-apply, and its stale thumbnail could outlive it.** The first version removed
   `thumb.jpg` **last** and swallowed every failure, so a locked thumbnail left the grid card showing the
   **old** photo under a sheet containing the new one (the D110/D114 class), and a failed `project.json`
   write left the new photo under the **old** dimensions — a wrong-measurement state, not just untidiness.
   Reordered: read the bytes being overwritten → drop the stale thumbnail **first** (the one step whose
   failure must abort) → write + verify the photo → the row → and the markup clear **last**. Any failure
   now restores the previous photo, so the bytes and the row can never describe two different pictures.

**Next:** an independent executed review of this wave against the commit (the D114 pattern — this wave is
data-critical `project.json` code and it rewired the shell), then the paused 1.10 polish, then the real
end-to-end run on a machine with a webcam.

## Slice 1.10 (continued) - the two independent reviews of the grid wave, and their remediation
**Date:** 2026-09-22 · **Commit:** this commit (the review remediation)

**Built:** nothing new that a user asked for — this entry is the register and the fixes. Two reviews ran against
the wave's commit: an **executed correctness register** (`@oracle`, clean worktree pinned to the revision, per
`docs/review-brief.md`) and an **independent UI/UX review** that MEASURED the screen in the repo's own Chromium
(a fixture mirroring the real DOM chain and stylesheets, 1440×960 · 960×1440 · 1200×800, `getBoundingClientRect`
per element) — because jsdom cannot see any of it (D40).

- **The register reproduced the gate itself** (tsc 0; 91 files / 1293 tests, all three projects) and found **no
  wrong-measurement and no data-loss defect**. Six items: one claim-fidelity inversion (F1), one wiring-seam gap
  (F2), two false comments (F3/F5), two cosmetic/spec-fidelity items (F4/F6).
- **The UI review's three High findings were all real:** the card menu's 7 items rendered 102 px of 364 at the
  bottom row (making «Delete» the least reachable action on the screen); the destructive «Remove markup» gave no
  progress and read as broken; and initial focus sat on «Keep markup» where UI §13.3:808 requires the safe
  action. All three fixed, plus §14.5/§14.3 violations on the wave's own controls, the chip running off the
  right edge at the last column, and mutations being offered on a project that cannot take them.

**Fixed (each pinned):** the menu's direction + `max-height` backstop (with the arithmetic test and a browser
assertion); the §13.3:808 progress track and 64 px destructive control; `Cancel` as initial focus + focus return
to the invoker + the dialog's name from its own heading; the `⋯` trigger's 92 % `--g900` and its 8 px slop
overlap with the select toggle; the rename field's 8 px gap; the chip's viewport clamp and its one-frame corner
flash; §11.2:722's «Not saved to disk» for the new mutations on an unreadable/read-only project; **F1** —
`replaceSheetPhoto` returns `{ markupCleared }` so the shell says «Couldn't remove the markup» instead of
denying a swap that happened; **F4** — `defaultSheetTitle` counts every row, so a trashed row's title can no
longer be minted twice (worked example in D118); and two comments the register proved false.

**The wiring seam is now tested (F2).** `tests/gridActions.test.tsx` mounts the real `App`, walks Home → the
grid and drives **rename / reorder / duplicate / replace** through the DOM against the fake disk — including
the silent same-size swap, the warned dialog's `Keep markup`, and F1's message. Deliberately the same
route-level shape as `tests/gridToast.test.tsx`: D114's lesson was that the seam, not the modules, is where
this project's real bugs appear.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **93 files / 1309 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1517.95 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** the drag's real input semantics, the chip's real follow, the menu's real popup height
and the manual/`[Surface]` rows — logged under slice 1.10.

**Checkpoints fired:** none.

**Decisions recorded:** **D118** (both registers, every resolution, and the owed items with their measurements).

**Surprises:** the two reviews found defects in **opposite directions** from the ones this project is used to.
The register's F1 is the D110/D114 family **inverted** — the interface claimed a *failure* the system did not
have (the replace's last step failed; the photo swap had succeeded). And the UI review could only exist because
someone finally **measured** the screen: three of its findings (102 px of a 364 px menu, a 4 px hit-slop overlap,
a chip 75 px off the right edge) are invisible to every test in the suite and to every reading of the CSS —
exactly the shape of D40's "a gate can only see what it asserts, in the environment it asserts it".

**Next:** the paused 1.10 polish (the History flyout, the end-to-end a11y audit, the arrow nudge, D101's halo),
the four owed review items above (autoscroll, the scroll container + top bar, the editor's replace dialog,
`aria-pressed`), and then the run that has never happened: built app, a webcam, a throwaway folder, export a
PDF and open it.

## Fix (owner-reported) - the capture dead end: a blank failure overlay and a «Retry» that could never work
**Date:** 2026-09-22 · **Commit:** this commit

**Built:** the capture flow's failure path is honest and recoverable (D119).

**Reported from a real run:** *"when I take a photo and hit use photo it gets stuck at 'save as a copy…'
'retry' button"* — the class of defect `handoff-session-21` §2 said only a real run would find.

**What it was.** The overlay was a blank `role="alert"` with two buttons and no message, and two different
failures landed on it: (a) the project folder never resolved — the effect swallowed the error, so every
`commit()` threw `'project is not open'` and nothing ever re-ran the resolution, making «Retry» a guaranteed
repeat; and (b) the write failed, where «Retry» reused the resolved handle without ever re-asking for the write
grant (§5.2 — recoverable only inside a gesture).

**Fixed:** the overlay names the cause (kind-mapped to the approved `errors.*` lines, plus one marked proposal
`capture.saveFailed`); the primary action matches the cause («Re-authorize» on a permission failure); `commit`
asks for the grant at the TOP of the gesture (the D103 fix, applied here); and `resolveProject()` is extracted
and re-run so «Retry» is a genuine second attempt.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **93 files / 1311 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1519.02 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** which failure a real run actually hits — the overlay now names it in one line, and a
row under slice 1.10 asks for that line to be recorded.

**Checkpoints fired:** none.

**Decisions recorded:** **D119**.

**Surprises:** the bug was two defects wearing one screen: a *silent* one (nothing said what failed) and a
*structural* one (the recovery re-ran the identical failing path). Neither is visible to a suite that only ever
drives the happy path plus a single mocked write failure — and the honest failure surface is what turns the next
report from "it's stuck" into a cause.

**Next:** the owner's next run, with the message on screen; then the owed items above.

## Fix (owner-reported, second round) - the save HANGS: bounded wait, a named stage, and no stacked writes
**Date:** 2026-09-22 · **Commit:** this commit

**Reported:** *"it still gets stuck on adding… after clicking use photo"* — «Adding…» is the SAVING overlay, so
the promise never settles. D119 handled rejection only; a pending promise never reaches the `catch`, so it could
not see this.

**Fixed (D120):** the **primary** capture path no longer awaits the write grant (only the recovery that reads
«Re-authorize» asks, where a prompt is expected — an unanswered request was hanging the save); a **30 s bounded
wait** stops the app claiming progress and shows «The folder isn't responding»; the saving label now **names the
stage** («Adding…» = image work, «Saving…» = folder write — both approved lines); and **one save in flight at a
time**, so a retry can no longer queue a second write behind a stuck one and land two sheets.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **93 files / 1315 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1519.72 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** the 30 s exit's post-timeout button set (the timer mechanism, the label mapping and
the hung-save symptom are machine-pinned; the full exit is not), and which condition a real run hits — the row
under slice 1.10 asks for the line and the stage label.

**Checkpoints fired:** none.

**Decisions recorded:** **D120**.

**Surprises:** the first attempt to pin the watchdog used fake timers around the whole capture flow — it fought
the component's async path AND leaked a queued mock into the next test, producing a false "regression" in an
unrelated case. That is `review-brief.md` §8's trap (a test coupled to an environment that cannot exercise the
path) caught in the act; the test was restructured rather than patched, and the leftover gap is stated in D120
instead of hidden.

**Next:** the owner's run with the stage label visible (and a reload first, to clear any stuck Web Lock).

## Fix - the capture HANG root-caused: a Web Lock name collision (the session lease vs the per-write mutex)
**Date:** 2026-09-22 · **Commit:** this commit

**Built:** nothing user-facing; this is the root cause of the owner's *second* symptom ("stuck on adding…").

**Found:** `acquireWriterLease` holds `fm:project:<id>` **exclusively for the whole editor session** (§5.8d),
while `writeAtomic` **and** `cleanStaleTmp` requested **the same name** (§5.3). Web Locks are not reentrant, so
while a sheet is open **every atomic write for that project queues forever** — no rejection, no timeout, nothing
to report: a capture from a sheet sits on «Adding…», and the editor's own autosave/markup/thumbnail with it. A
capture from the **grid** (no editor mounted) is unaffected — which is exactly why the first report was a
*failure* with a message and the second a silent *hang*.

**Fixed:** `writeLockName(projectId)` = `fm:project:<id>:write` for the per-write mutex and the tmp reaper; the
lease keeps `fm:project:<id>`, so §5.8d's arbitration is unchanged. Spec §5.3/§5.4/§5.8d, the plan's S1
requirement and **six test assertions that pinned the colliding name** (they encoded the defect) are amended with
the executed evidence.

**The proof it was invisible:** the new `tests/writerLease.browser.test.ts` (real Chromium, real Web Locks, real
OPFS, **no mocks**) showed a write under a held lease timing out before the fix and `navigator.locks.query()`
naming the genuinely-held lease; six browser suites **mock `acquireWriterLease` away**, so no test had ever held
the real lock while writing.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **94 files / 1317 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1519.78 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** two-tab arbitration (§5.8d) and the capture-from-a-sheet path — logged under slice 1.10.

**Checkpoints fired:** none.

**Decisions recorded:** **D121**. A handoff for this issue: **`docs/handoff-capture-save.md`**.

**Surprises:** two. (1) The same lock name was **pinned in the spec in two places** and mirrored by a test
requirement — a spec-level self-deadlock, not a slip in one module. (2) Executed: Chromium **grants** an
`ifAvailable` re-request from the client that already holds the lock, so §5.8d's exclusion is cross-tab only —
worth recording, because the fake had taught the opposite.

**Next:** the owner's run from both the grid and a sheet; then a bounded lock acquisition in `writeAtomic`
(the remaining class-wide hardening).

## Fix (owner-reported) - the folder grant was `DENIED`, and neither recovery path could fix it
**Date:** 2026-09-22 · **Commit:** this commit

**Probed from the running app** with this session's browser tooling (live page, not inference): the persisted
projects root is the **source repo** and its **readwrite grant is `denied`**; `FileSystemFileHandle.move()` is
present; clicking «New project» produced the honest toast «Project folder unavailable». So the write blocker is
a browser permission about a handle — not the lock (D121) and not the disk.

**Fixed (D122):** `queryRootWritePermission()` exposes the tri-state; the capture failure now offers
**«Re-pick folder»** (approved copy, `storage.rePickFolder`) when the grant is `denied` — performing a real
`pickRoot()` and retrying — and keeps «Re-authorize» only for a `prompt` grant, the one a prompt can still fix
(Chromium never re-prompts a denied handle). And `Settings → Storage → «Change folder…»` now **adopts** the
picked handle by reloading: without that, the backend, the registry and every mounted route keep the old
handle's permission, which is why a folder change looked like it did nothing.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **94 files / 1319 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1520.63 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**

**Deferred to hardware:** a real `showDirectoryPicker` grant, and the two-tab check — logged under slice 1.10.

**Checkpoints fired:** none.

**Decisions recorded:** **D122**; `docs/handoff-capture-save.md` gained the "if the line says Folder permission
expired" diagnosis.

**Next:** the owner re-picks the folder (and reloads manually on the build they have), then captures again.

## Wave (owner-reported, from the Surface) - beta readiness: real glyphs, a chrome that fits, a grid that scrolls, and the clickthru's findings
**Date:** 2026-09-22 · **Commit:** this commit

**Built:** the owner sent two screenshots from the real Surface (~1920×1120 CSS px) — *"the tools aren't
displaying correctly"*, *"make the palette not have scroll / be too long to display fully on this tablet"* — then
*"make it ready to beta test"*. Three lanes on disjoint files, integrated here; details in **D123–D127**.

- **The 14 tool glyphs are real** (they were numbered `1…14` squares whose own headers said *"PLACEHOLDER ART —
  MUST NOT SHIP"*).
- **The editor chrome fits:** panel content 1430–1566 px → **127 / 835 / 786 / 614** for
  select/dimension/rectangle/text at 1920×1120 (it used to clip mid-`LINE STYLE`), including a **second
  instance** the lane found in its own first rule (a selection returning every section: 1204 px in an 861 px
  box). The gate fails on the pre-change source at both targets.
- **The grid scrolls with its bar fixed** (`min-height: 100%` → `height: 100%`) and **drag-autoscrolls**
  (48 px band / 18 px per frame). The clip coupling this creates was measured first: a height-only fix clips
  42 px of «Delete», so the card menu is **portaled to `document.body`** and anchored with `element.animate()`.
- **The write lock is bounded** (D121's owed item): `withWriteLock` aborts after 20 s instead of queueing
  forever — and it aborts rather than abandons, so nothing lands after a reported failure.
- **D125:** `thumb.jpg` was never written for a captured sheet (a 3 s debounce cancelled by the unmount);
  flushed before the hand-off now, pinned by an **order** assertion.
- **D127:** the rail ignored the handedness setting (`.tool-rail` had no `order` of its own, so the flex
  container fell back to source order) — fixed, and pinned in **real layout**.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **97 files / 1379 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1524.60 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**
- [x] **`npm run clickthru`** (inspection, not a gate) → **20 PASS / 0 FAIL / 0 UNREACHED**, with the built-app
      screenshots reviewed: the rail on the right with real glyphs, the panel fitting, the card thumbnail
      rendered, the exported PDF read back out of OPFS (`%PDF`, dimension `valueMm`/`enteredText` intact)

**Deferred to hardware:** the chrome fit at 100–150 % text scaling / Sunlight / portrait, the autoscroll FEEL,
the rail-top symptom (with its diagnostic), and everything the harness can never prove — all logged under
slice 1.10/1.4.5.

**Checkpoints fired:** none.

**Decisions recorded:** **D123** (the clickthru harness; never a gate, never promotes a `[Surface]` row),
**D124** (the OPFS/IDB shim — it settles the D81 crash's shape), **D125** (the thumbnail), **D126** (the wave),
**D127** (the rail side).

**Surprises:** four. (1) **The harness earned its keep on its first runs**: a thumbnail that was never written,
and a rail that ignored the handedness setting — neither visible to any gate, both visible in the pixels.
(2) **The placeholder glyphs had been shipping since slice 1.4.5** and the owner is the first person to see the
rail. (3) **A lane's browser test had never been run** (contended, correctly) and failed for two harness reasons
— an in-flow fixture measured against `window.innerHeight`, and an overhang constant outside its own
constraints; both fixed, and the cascade-order trap recorded in the harness doc. (4) **A browser-project flake**
with the D84 signature reappeared once and did not reproduce in isolation.

**Next:** the owner runs the hardware rows on the Surface (with the projects root pointed at a real folder, not
the source repo); the two non-fitting chrome states need their decision; then the owed polish.

## Round (continuing the beta wave) - the barrel press stops drawing, and the editor chrome's a11y contract is audited by execution
**Date:** 2026-09-22 · **Commit:** this commit

**Built:** two lanes on disjoint files, integrated here.

1. **A pen barrel press no longer draws (D128).** The clickthru's step 17 found that a `buttons: 2` press with
   freehand active created a stroke: `inputRouter.classify` returned `'draw'` for **any** pen contact. Per
   §11.4/§2.4/§11.6 #3 the barrel hold is only an *optional accelerator* for the radial quick-menu, which is
   **not built** — so the documented degrade applies ("radial absent rather than broken"): only the **tip**
   (`button === 0`) draws; the editor now registers **no contact at all** for a non-tip press, so it cannot draw,
   ink *or* pan. Build spec **§8.2 amended** (the router was lifted from that block verbatim). **Evidence:**
   three router tests fail against the pre-fix router restored byte-exactly, the tip test passes, 19/19 after.
2. **The editor chrome's per-slice a11y contract, audited by execution (D129)** — 54 interactive controls at
   three viewports. Two real defects, both fixed with pre-fix proof: **four controls at 16×48** in the portrait
   bottom dock (`.style-panel-option`'s `flex: 1 1 0; min-width: 0` squeezing them; now a 48 px floor, and the
   dock scrolls instead), and a **tab order contradicting UI §14.9** (`TopBar` was the last DOM child with
   `order: 0` doing the painting — `order` moves paint, not focus — so the top bar was reached last; hoisted to
   the first DOM child). Names, traps, the focus ring and the rail's roving tabindex were verified sound.
3. **Two items from that audit's report, fixed here** (files the lane did not own): the deep sheet's ~48 swatches
   were named with a **bare hex** (now `colorName(hex)` — the 12-palette names where they exist, the honest
   uppercase hex otherwise), and the editor no longer renders Home's «Loading projects…» while loading a *sheet*
   (`editor.loadingSheet`, a marked proposal).

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **98 files / 1397 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1524.70 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**
- [x] `npm run clickthru` (inspection) → re-run on this tree; the barrel step's note is the witness

**Deferred to hardware:** H13 (does the real digitiser report `button === 2`?), 200 % text scaling, real
screen-reader output (no NVDA/VoiceOver here), and the handedness-consistent tab order, which is a **spec
question** (D129) rather than a guess.

**Checkpoints fired:** none.

**Decisions recorded:** **D128** (the barrel degrade), **D129** (the a11y audit + the §14.9 contradiction).

**Surprises:** a guard that measures the *right* thing is cheap — the target-size sweep found four controls that
no landscape test could see (portrait only, 16 px wide), and the focus walk found a spec contradiction that had
been invisible because `order` was doing the painting. Both are now pinned by tests that fail pre-fix.

**Next:** the arrow nudge pad and the History flyout are the two biggest owed items left; then the owner's
hardware pass.

## Round - the grid's a11y audit (no defects) and the arrow-key nudge (the owed escape hatch)
**Date:** 2026-09-22 · **Commit:** this commit

**Built:** two owed items, done in-session because the provider account was out of credit (`Insufficient
Balance` on two lane dispatches) — the browser project, build, e2e and clickthru stayed orchestrator-owned.

1. **The sheets grid's a11y audit, by execution (D130) — it found nothing.** The screen the owner uses most,
   and the one that changed most this wave (a **portaled** card menu, a real scroll container, drag-autoscroll,
   the trash panel), audited in real Chromium at three viewports: 48 px targets, the §14.5 hit-slop overlap, a
   `Tab` walk, accessible names, and the portal's keyboard contract. The portal — the change most likely to
   have broken something, and invisible to jsdom — holds: focus enters the menu, ArrowDown roves, **Escape
   closes and returns focus to the `⋯`**, and `Tab` closes rather than trapping. `tests/gridA11y.browser.test.ts`
   (8 tests).
2. **The arrow-key nudge (D130)** — owed since slice 1.5, and the spec calls it *the* accessibility escape
   hatch for the finger's systematic contact offset. `SelectTool.nudgeSelection` follows the existing
   capture → `execCoalesced` shape, so **one nudge is one undo step**, a **held** key coalesces into one edit
   rather than forty, a different direction starts a new step, and an empty selection is a no-op. 1 px, 10 px
   with Shift, on the canvas host's own `keydown` so it cannot steal arrows from the chrome. Pinned against a
   real Konva scene (`tests/arrowNudge.browser.test.ts`, 4 tests). The **Offset Nudge Pad** (the glass half)
   stays owed.

**Machine gates (this commit's tree):** 4/4 passing
- [x] `npx tsc --noEmit` → 0
- [x] `npx vitest run` → **100 files / 1409 tests** (node + jsdom + browser), exit 0
- [x] `npm run build` → 0 errors, 26 precache entries (1525.57 KiB)
- [x] `npx playwright test` → **5 passed / 5 skipped, exit 0**
- [x] `npm run clickthru` → **20 PASS / 0 FAIL / 0 UNREACHED**, with step 17 still reporting *"no object was
      created"* (D128's fix holding on the built app)

**Deferred to hardware:** unchanged — and the nudge's *feel* (1 px per press on glass, with a Type Cover) is a
device check.

**Checkpoints fired:** none.

**Decisions recorded:** **D130**.

**Surprises:** the grid audit found nothing — after a wave that portaled a menu out of its subtree and turned
the page into a scroller, that is the result worth recording, and the portal's focus contract is now pinned
where it can break. Second: two lanes could not run at all (provider balance), and the work still landed with
the same verification discipline — a reminder that the *discipline* is the portable part, not the lanes.

**Next:** the History flyout (its writer still has no caller) and the Offset Nudge Pad; then the owner's
hardware pass.

---

## Clickthru harness — drive the whole app with real touch/pen, then look at the pixels

**Date:** 2026-09-22 · **Commit:** this commit · **Not a slice** — verification tooling.

**Why:** `docs/handoff-session-21.md` §2 records it plainly — *"No agent has ever driven the app end to
end."* Several of the recent owner-visible defects were all found by **running** the app, never by a green
gate. This harness closes that loop for the machine-checkable half.

**Built:**
- `playwright.clickthru.config.ts` — a **separate** config (headed real Chrome, `video: 'on'`,
  `reuseExistingServer: true`). **`playwright.config.ts` and `npm run e2e` are untouched.**
- `tests/clickthru/devices.ts` — the three Surface profiles (1440×960 / 960×1440 / 1200×800, all DPR 2,
  `hasTouch`, desktop UA, `isMobile: false`), plus the rotation gate.
- `tests/clickthru/gestures.ts` — a raw-CDP gesture lab: tap-tap (450 ms settle), 600 ms long-press,
  one-finger drag, two-finger pan, second-finger cancel-and-restore, pinch, palm+tap, and pen
  stroke/hover/barrel via `pointerType: 'pen'`. **Never synthetic `dispatchEvent`** (D77/F1).
- `tests/clickthru/{harness.ts,betaPath.spec.ts,README.md}` — 20 steps, per-step screenshots, `run.json`,
  video, and a self-contained `contact-sheet.html`.
- `npm run clickthru` → `test-results/clickthru/latest/` (gitignored).

**Machine gates (this commit's tree):**
- [x] `npm.cmd run clickthru` → **20 PASS / 0 FAIL / 0 UNREACHED**, headed real Chrome 153,
  `surfaceLandscape` 1440×960 @ DPR 2, ~30 s. Export artifact read back out of OPFS: **279,266 bytes**,
  magic `%PDF`.
- [x] `npx tsc --noEmit` → **no errors in this change set**. The tree currently reports one **unrelated**
  error in a concurrent lane's brand-new file (`tests/_glyphpreview.browser.test.tsx`: `Cannot find
  namespace 'JSX'`), which is not mine to fix.
- [x] The **existing** `npm run e2e` and `vitest` gates are **byte-identical and unaffected**: this change
  adds no `tests/**/*.test.ts(x)` file and does not touch `playwright.config.ts`. They were **not** re-run
  here, because the tree holds another lane's uncommitted work and a result would not be attributable to
  this commit (D66: a recorded gate must be reproducible from the commit it names).

**Deferred to hardware:** everything `[Surface]`. The harness records **13 caveats** in `run.json` and in
the contact sheet, and states that a green run **never** promotes a `[Surface]` row.

**Checkpoints fired:** none.

**Decisions recorded:** **D123** (the built-in desktop browser can load the app but cannot drive it → the
driver of record is Playwright), **D124** (D81 corrected: the renderer death is on the IndexedDB **read**
of an OPFS handle; the sentinel shim; OPFS verified as a real store), **D125** (a captured sheet never
writes `thumb.jpg` — and the test that structurally cannot see it).

**Surprises:**
1. **`thumb.jpg` is never written for a captured sheet** (absent at all 20 steps; the grid card can only
   show its placeholder). `CameraFlow` arms a 3 s thumbnail debounce and then **unmounts**, and its cleanup
   **cancels** the scheduler — so the debounce can never elapse. `tests/cameraFlow.test.tsx` **mocks the
   scheduler** and calls `options.write()` by hand, so it asserts only that `schedule()` was *called*: the
   review brief's first question, *a test that proves nothing*, in its purest form. **Recorded, not fixed.**
2. **D81's mechanism was wrong.** It is not the write and not "the next load": the renderer dies on
   **`IDB get`** while **`put` succeeds**, on the **same** page load (Home re-reads its root the moment
   first-run completes). Reproduced headed *and* headless, so the variable is the Chromium **build**.
3. **The pen barrel button is not distinguished from the tip** — a `buttons: 2` press with freehand active
   **draws**, exactly like a tip stroke. Evidence for **H13**.
4. **A dimension's midpoint is a handle, not the body** — dragging from the exact midpoint does not move
   the object (the harness's first step-7 FAIL); from 25 % along the body it moves. jsdom cannot see this.
5. **`[data-tool]` is ambiguous** — the `StylePanel` root carries `data-tool` as well as the tool rail, so
   an unscoped locator throws a strict-mode violation once the panel's tool matches.
6. Flagged for the owning lane, **not** asserted: the rail renders left-most while `data-rail="right"`, and
   `src/styles.css` has no matching `[data-rail='right'] .tool-rail { order }` rule. The build under test
   contained a **concurrent lane's uncommitted** `src/styles.css` / `EditorLayout.tsx`, so confirm on a
   clean tree before calling it a defect.

**Next:** fix D125's `thumb.jpg` defect; then the independent review of the grid wave (D115–D117).

## Feature (owner request) — the VANGARDE watermark, settings-gated, app + exports

**Date:** 2026-09-22 · **Commit:** (this commit)

**Built:** a `Settings › Display › Watermark` switch (default ON) that shows the client's "VANGARDE woodworks"
mark as a subtle corner watermark — a light-ink compact mark in the app's own (always-dark) chrome, the full
vector lockup on exported PDFs/PNGs. New: `src/settings/watermark.ts`, `src/ui/watermarkRuntime.ts`,
`src/ui/WatermarkOverlay.tsx`, `src/export/watermark.ts`, `public/branding/{vangarde-mark-light,vangarde-full}.png`
(both derived from the client's supplied vector PDF via `pdftocairo`, 600 dpi — provenance and derivation steps
in **D132**). Changed: `src/state/appStore.ts` (+`watermarkEnabled`), `src/ui/Settings.tsx` (+the switch row,
Display group), `src/ui/strings.ts` (+`settings.rowWatermark`/`watermarkHint`, the "beyond both appendices"
marker), `src/App.tsx` (+`useWatermarkRuntime()` + `<WatermarkOverlay />`, mounted once at the shell root — the
`ToastHost`/`PWAUpdate` precedent), `src/export/renderStage.ts` (`ExportSheetInput.watermark`, composited in
`renderSheet` after every layer), `src/export/runExport.ts` (reads the setting and loads the image once per
run, not per sheet).

**Machine gates:**
- [x] `npx tsc --noEmit` — 0 errors.
- [x] `npx vitest run --project node --project jsdom` — **74 files / 1216 tests** (was 72/1205; +2 files,
      +11 tests: `tests/watermark.test.ts`, `tests/watermarkRuntime.test.tsx`, plus additions to
      `tests/settings.test.tsx`).
- [x] `npx vitest run --project browser` — **29 files / 210 tests** (was 29/208; +2 tests in
      `tests/renderStage.browser.test.ts` — real-pixel proof the mark composites at the computed opacity
      and is absent when no `watermark` is passed).
- [x] `npm run build` — 0 errors, 28 precache entries, 1628.71 KiB (was 26 / 1525.57 KiB).
- [x] `npx playwright test` — 5 passed / 5 skipped (unchanged from the last recorded baseline; the CSP
      spec's zero-inline-style assertion covers the new `<img>`).
- [x] `npm run clickthru` — **20 PASS / 0 FAIL / 0 UNREACHED**, run twice (before and after the corner-size
      tweak below). The exported PDF was read back out of OPFS and rasterised (`pdftoppm`) to confirm the
      full lockup composites cleanly in the corner of the printed sheet.

**Checkpoints fired:** none.

**Decisions recorded:** **D132** — the two derived assets (why one vector source, why PNG not SVG), the
settings/runtime shape (mirrors `theme.ts`/`themeRuntime.ts` exactly), the export sizing invariant (a
FRACTION of the bitmap so the mark stays the same fraction of the page at every export multiplier M), and a
real, accepted trade-off: `position: fixed` always paints above ordinary non-positioned chrome regardless of
z-index, so the in-app mark's bottom-right corner overlaps the tool rail's Undo/Redo pair on the editor screen
specifically. Verified harmless (never blocks a tap, glyphs stay legible) against the clickthru harness's own
screenshots rather than assumed; kept small/low-opacity rather than given route-aware positioning logic.

**Next:** the UI/GUI handoff pass itself (`docs/handoff-ui-pass-for-claude.md`), starting with its own §8
priority order — §4.1 (extend `AnnotationStyle` with the per-tool style keys the panel has no data channel
for), §4.2 (the mini-toolbar to spec), §4.3 (the two overflow menus).

## Slice §4.1 (UI/GUI handoff pass) — the style data channel: inset controls, arrow elbow

**Date:** 2026-09-22 · **Commit:** (this commit)

**Built:** `docs/handoff-ui-pass-for-claude.md` §4.1's data-channel work, scoped to what genuinely needed it
(full reasoning + the five deferred items in **D133**). Three new `AnnotationStyle` keys —
`insetBorder`/`insetRadius`/`insetShadow` — additive/`.nullish()`, no schema version bump. Rendered in
`renderInset.ts` (border inset by half its stroke width so it survives the group's own clip; shadow is a
radial vignette, kept inside the same clip rather than restructuring the group — see D133). Arrow elbow
(`straight`/`right`/`curved`) now actually renders (`renderShape.ts`'s `buildArrow` drew every arrow straight
regardless of `geometry.elbow` before this) — the routing math (`elbowPoints`) moved to
`src/domain/geometry.ts` so it stays pure/node-testable (Konva cannot be imported into the `node` project).
`StylePanel.tsx` gained a new INSET section (border/shadow toggles, a corner-radius range) wired through the
existing `onChange` callback, and the highlighter's WIDTH section now relabels to "Chisel width"
(`STRINGS.style.chiselWidth`, staged copy with nowhere to render before this) — checked against both the
active tool AND a homogeneous highlight selection, so the label survives re-selecting a stroke the user
already drew. `src/state/styleByTool.ts`'s `STYLE_KEYS`/`APPLICABILITY` table extended 8 → 11 keys (appended,
not inserted); `inset`'s row changed from "every control disabled" to the three D133 keys — a change
`tests/typeToolMap.test.ts`'s own header comment invited, done with this entry as its required paper trail.

**Machine gates:**
- [x] `npx tsc --noEmit` — 0 errors.
- [x] `npx vitest run --project node --project jsdom` — **74 files / 1236 tests** (was 74/1225 after the
      watermark slice; +11 tests: `elbowPoints` in `geometry.test.ts`, the D133 schema round-trip, the
      extended/updated applicability tables, the new StylePanel section + relabel tests).
- [x] `npx vitest run --project browser` — **31 files / 223 tests** (was 29/210; +2 files —
      `renderShape.browser.test.ts` (the elbow reaches the real Konva node),
      `renderInset.browser.test.ts` (border/shadow/radius as real Konva node structure)).
- [x] `npm run build` — 0 errors, 28 precache entries, 1632.03 KiB.
- [x] `npx playwright test` — 5 passed / 5 skipped, unchanged.

**Checkpoints fired:** none.

**Decisions recorded:** **D133** — the full scope decision (what got a new key vs. what already had a
render-ready `Geometry` field vs. what stays owed and why each deferred item would be a stub or a real
behavioural risk if shipped now), the clipped-container shadow constraint (an existing test,
`tests/insetWire.browser.test.ts`, caught a structural change before it shipped), and the `STYLE_KEYS`
extension with its two deliberately-updated pinned tests.

**Owed (named in D133, not silently dropped):** a `StylePanelProps.onGeometryChange` callback (and the
`EditorLayout.tsx` wiring to a real geometry-patch command) is what the rect corner-radius, polygon
closed-path, arrow-elbow and text-background PANEL CONTROLS are actually waiting on — their render support
already ships in this slice. Also owed, each with its own reason in D133: `textAlign` (no visible effect
without a real text-box-width feature), a text "leader" (needs a new geometry anchor point), polygon `sides`
(a construction-time parameter, not a post-hoc edit), angle `arcRadius` (currently derived, not stored),
highlighter `straightLineLock` (hardcoded to touch today; promoting it risks existing verified behaviour),
freehand `pressureWidth`/`smoothing` (no spec-given numbers to anchor to), and `eraseScope` persistence (belongs
in `styleByTool.ts`'s own per-tool memory, not `AnnotationStyle` — erasing creates no styled object).

**Next:** §4.2 (the mini-toolbar to spec) and §4.3 (the two overflow menus), per the handoff's own §8
priority order.

## Slice §4.2 (UI/GUI handoff pass) — the mini-toolbar: 9 buttons + a computed anchor

**Date:** 2026-09-22 · **Commit:** (this commit)

**Built:** Duplicate, Bring to front, Send to back, Copy style, Paste style added to the Select mini-toolbar
(3 → 9 buttons), all reusing existing scene primitives (`translateGeometry`, `moveInBandBefore`/
`moveInBandToBack`, `styleCommand`). The anchor is now computed via `element.animate()`
(`EditorCanvas.imageToScreen` + `SelectTool.selectionBounds`), 16 px above the selection, flipping below
under 160 px headroom — the §4.2 owed fix, done in this slice. `.placement-hud--wrap`/`--anchored` CSS
modifiers scope the change to the Select mini-toolbar only. Full reasoning, the deferred items (Edit points,
Edit text, Replace photo/Focus unification) and a real test-infra trap found along the way in **D134**.

**Machine gates:** `tsc` 0 · `vitest` 74/1236 (node+jsdom) + 31/228 (browser) · `build` 0 (28 precache,
1635.29 KiB) · `playwright` 5/5 skipped, unchanged.

**Next:** §4.3 (the two overflow menus) — not reached this session; time-boxed at the owner's request.


## Feature (owner request) — calculator keypad, project-name pop-up, photo date stamp, larger watermarks, camera zoom

**Built:** the dimension keypad is now a Construction Master Pro–style calculator pad (postfix units: `1 2 FT 6 IN 3 / 8`, preset
`1/2 1/4 1/8 1/16` keys, `/`, `C`, a typed-entry line) on pure functions in `src/domain/units.ts`; «New project» opens a name pop-up
and the folder is named from it; sheets record `capturedAt` (shutter / EXIF / file date) and exports print it above the logo;
the in-app mark is larger and now sits above every page (Settings switch unchanged); the export mark is 16% → 24%; the camera
lost the torch, High/Fast and the readout, asks for the device maximum, and its zoom chips now work (hardware zoom or a digital
crop) and sit clear of the watermark. Full reasoning, the rewritten tests and the stated limits are in **D135**.

**Machine gates:** `tsc` 0 · vitest — see the CONTINUITY snapshot for the final counts on this tree · `build` — see CONTINUITY.
`clickthru` was **not** re-run for this change (it is owed, along with the §4.1/§4.2 re-run session 24 already owed).

**Owed / `[Surface]`:** H23–H25 in `docs/HARDWARE-TEST-CHECKLIST.md` (the still-capture maximum, hardware vs digital zoom, the
watermark/zoom-chip clearance on the real tablet).


## Fix (owner report) — the projects folder survives relaunches and captures (D136)

**Date:** 2026-09-24 · **Commit:** (this commit)

**Built:** Home names a lapsed folder grant («Folder permission expired» + «Re-authorize» / «Re-pick folder») instead of
showing a fake empty state; Settings «Change folder…» adopts the folder in place (no reload that dropped the fresh grant);
the capture overlay's re-pick is guarded to folders that hold the open project (`RootMismatchError`) and a cancelled
re-pick keeps its recovery; «Use photo» re-asks a lapsed grant inside the tap (bounded, non-throwing); a root-less backend
re-reads the persisted handle; persistent storage is requested on adoption and on a re-given grant; the local launcher
closes the app browser gracefully before forcing it. Full reasoning in **D136**.

**Machine gates:** `tsc` 0 · vitest 107 files / 1530 tests (node + jsdom + browser) · `build` 0 (28 precache, 1644.44 KiB).
`npm.cmd run clickthru` re-run on this tree: passed (it also discharges the D135/§4.1/§4.2 re-run owed on the same build).

**Owed / `[Surface]`:** H26 in `docs/HARDWARE-TEST-CHECKLIST.md` (the real Chromium grant prompt and relaunch loop).
