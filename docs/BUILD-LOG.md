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
