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
- [x] the 512 MB guard at its **exact** inclusive boundary (D85), and the 3× refusal as a **refusal** —
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
while the glyphs scaled — the §4.2 invariant failing for the label itself (D87).

**Deferred to hardware:** 6 → H8, H12, H19, H20, H21, H22.

**Checkpoints fired:** none. **C6 is NOT fired** — its number is a dev-machine figure (D85) and H21 is
what sets it.

**Gate on the pushed tree (`250668c`):** `tsc` 0 · `vitest` **71 files / 1015 tests** (node + jsdom +
browser) · `build` 0 (17 precache, 857.62 KiB) · `playwright` 5 passed / 5 skipped.
