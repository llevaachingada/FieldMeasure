# Project Continuity Log

**Purpose:** a single place that records where this project stands, so any session (human or AI) can
resume without re-deriving context. **Update this file at the end of each work session.**

**Last updated:** 2026-09-21 (session 11, continued — slice **1.6 is COMPLETE**: the three owed wiring items are closed, and the wave review found and fixed a real Layers-reorder defect — see D76)

---

## Current snapshot

| Field | Value |
|---|---|
| Phase | **Slices 0.2 + 1.1 + 0.3 + 1.2 + 1.3 + 1.4 + 1.4.5 + 1.5 + 1.6 complete and green.** Markup tools ship, **annotations persist** to `markup.json`, and the **Layers panel is mounted** with undoable eye/lock, a band-safe reorder and a shell-driven `SelectTool`. Next: **1.7 (image insets)** |
| Application code | **Nine slices**, **643 machine tests / 47 files**. 1.6 adds `shapes/{svgPath,renderShape,renderInk,renderText}.ts`, `tools/{toolTypes,ShapeTool,AngleTool,FreehandTool,TextTool,EraseTool,SelectTool}.ts`, `ui/LayersPanel.tsx`, `ui/layersRows.ts` (+CSS) and the `markup.json` persistence wiring; its wiring closure mounts the panel and drives `SelectTool` + the erase long-press preview. Plus 1.9 **step 1 only** |
| Build spec | **v0.3 hardened (r2) + touch-first (round 5)** — `docs/preflight-handoff-v0.3-hardened.md` (canonical). §8.2 input router is now **touch-primary** |
| UI spec | **v2 hardened + touch-first (v2.1)** — `docs/ui-spec-field-measure-v2-hardened.md` (canonical). Touch-primary principle, tap-tap placement, C11/C12/C14 applied |
| Implementation plan | ✅ `docs/implementation-plan.md` **v1.2 hardened + touch-first** — touch-first router/gates, three Vitest projects (incl. browser), CSP-as-a-test |
| Adversarial review | ✅ rounds 1–5 · ✅ sessions 7–9 (orchestrator + independent oracle on 1.3, F1–F5) · ✅ **session 10** — the owner **waived** the independent `@oracle` pass for the 1.4/1.4.5/1.5 batch; an orchestrator internal review was run against `docs/review-brief.md` (no stored `label`; the D65 loupe arithmetic; D63 restore live with a browser test; the 450 ms settle; the refusal table) and the full gate is green. **The waiver is recorded in the batch entry — this batch has not had an independent adversarial review.** |
| Design research | ✅ **Session 5** — 8 lanes (4 × `librarian`, 3 × `designer`, 1 × `explorer`): Claude Design capability, pre-code tooling, Konva/pen/palm, touch placement, spec gap analysis, field-app teardown, touch interaction design, touch-primacy docs audit |
| Dependencies | Installed and pinned — **TS 5.9.3** (not 7.0.2), + `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `jsdom` 30.1.0, `@vitest/browser-playwright` 5.0.1 |
| Blocking item | **None.** Origin resolved (§21.1 / D24). **UI/UX is implementation-ready**; no design gate remains |
| Next action | **Slice 1.7 (image insets).** Lane B2's picker sheet is already built and green **off the critical path**, so Wave B is the inset engine (`InsetTool` + the §8.5 coordinate model) plus integration. Then **1.8 (style system)**, whose StylePanel/StyleEditorSheet UI half is likewise already built. |

**Authority:** the build spec's **§2.4 "v1 scope table"** is the single authority on what ships in v1.
When any doc conflicts, §2.4 wins.

---

## Timeline

### 2026-09-21 — Session 1: preflight → review → docs → dependencies
1. Reviewed the original `field-measure-preflight.md` v0.1 (over-scoped: Bluetooth, PostgreSQL/Supabase
   sync, Entra/Graph/SharePoint, phone paths) against the client's feedback.
2. Ran research (Konva imperative API, File System Access API, pointer/pen/palm, camera capture,
   dependency versions/licenses, ft-in input UX, inset/tool/style-panel UX) and a UI/UX design pass.
3. Ran an architecture review; reconciled conflicts (per-sheet `markup.json` sidecars, atomic writes,
   markup-unit scaling, inset container model).
4. Wrote build spec v0.2 (`docs/preflight-handoff.md`) and UI spec v1 (`docs/ui-spec-field-measure.md`).
5. Wrote the adversarial-review brief `docs/review-handoff.md`.
6. Installed Node 24.19.0 (LTS) + npm 11.17.0 via winget; installed all runtime + dev dependencies
   (0 vulnerabilities); pinned `fflate` 0.8.3. Added `node_modules/` + build output to `.gitignore`.
7. **Adversarial review was run** (via `docs/review-handoff.md`) and produced hardened revisions:
   - `docs/preflight-handoff-v0.3-hardened.md` (supersedes v0.2) — fixes B1–B5, M1–M13, Minors 1–6:
     corrected export/DPI math, keypad slot state machine + lenient tokenizer, inset child coordinate
     space, FSA API corrections (`FileSystemFileHandle.move()` used; `FileSystemDirectoryHandle.move()`
     removed), zod `.nullish()` + guarded `JSON.parse` + `.history/_project/` recovery, per-project
     two-tab lock, derived-only `label`, handedness as a plain question, `fflate` for PNG zip,
     perfect-freehand `getSvgPathFromStroke` not exported (local helper), and a new **§2.4 v1 scope table**.
   - `docs/ui-spec-field-measure-v2-hardened.md` (supersedes v1).
8. Added repo docs: `README.md`, `docs/INDEX.md`, `docs/CONTINUITY.md`, `docs/DECISIONS.md`,
   `docs/UNITS.md`; reconciled references to the hardened canonical versions.

### 2026-09-21 — Session 2: UI-spec appendix, round-2 senior review, implementation plan
1. Finished the v2 UI-spec hardening: added the v2 changelog appendix (15 changes mapped to review
   findings) and final inline annotations (project-settings trim, per-project lock note, undo-depth
   wording, trash restore in the destructive table, `.history/_project/` in the on-disk layout,
   retake/replace-photo copy).
2. **Round-2 senior re-review of the hardened docs** — executed the spec's own reference code
   (keypad pipeline, parser, formatter) in a JS runtime and traced every promised case. Findings,
   all fixed in the spec before commit:
   - **Wrong test expectation (wrong-measurement class):** v0.3's committed test table asserted
     `12 6` → 148 in. 12 ft 6 in = **150 in** (the UI spec's own `12' 6 3/8" = 150.4 in` example had
     it right). A builder would have "fixed" the parser to pass the test. Test table corrected and
     re-verified.
   - **`composeEnteredText` dropped the fraction** in the feet+inches+fraction case (`10'-4"` instead
     of `10'-4 1/2"`) — silently discards half an inch. Rewritten with an explicit compose table
     (8 cases) + a 500-combo property test asserting **value** round-trips, not just parseability.
   - **`pressDot` semantics:** `denominator: 2` made `. 5` = 5/2" = 2.5". Now `.` routes to the
     numerator slot with the denominator unchanged (project precision).
   - **`parseLooseToSlots` gaps:** rejected `10 ft 4 in` (space before `'` after unit-word
     replacement) and `4-1/2`; couldn't parse explicit-feet + loose numerator (`12' 6 3`, a UI-spec
     promise). Rewritten; signature now returns `{ slots, rawDecimal }` so bare decimals keep their
     raw `enteredText`. **All 19 traced cases + rejects + 2000 property combos pass.**
   - **`cleanStaleTmp` race:** tab B opening a project could delete tab A's in-flight tmp file
     mid-write. Now runs under the per-project Web Lock + deletes only tmp files older than 5 min.
   - **Inset crop offset gap:** with non-zero `crop.x/y` the asset image must be positioned
     `(-crop.x, -crop.y)` inside the group or the wrong region shows. Spec'd with code.
   - **React version reconciled:** spec §2.2/§13 said "React 18"; installed (and per D14) is React
     19.3 — spec corrected in both places.
   - **Naming drift:** DECISIONS said `parseImperialLoose`; canonical is `parseLooseToSlots` — fixed.
   - **`formatLength('in')`** was identical code to `ft-in`; added `formatInchesOnly` (no feet
     decomposition: `124.5 in` → `124 1/2"`).
   - **`parseJson`** simplified to sync (zod is sync); `readJsonValidated` takes `MaybePromise`.
   - UNITS.md expanded: keypad model table, project-level precision, four highest-stakes modules.
3. Wrote `docs/implementation-plan.md` — the multi-slice build plan with gates and checkpoints,
   derived from build spec §13 with the round-2 corrections applied.

### 2026-09-21 — Session 3: plan verification + flush-out (per `docs/handoff-plan-verification.md`)
1. Adversarially verified `docs/implementation-plan.md` against the canonical specs. Cross-doc greps
   clean: no "React 18" stragglers in canonical docs, no `148`-class test expectation, no
   Explorer-open / Windows-pen-setting claims. Every `〔v1 scope〕` marker agrees with §2.4; every spec
   §13 "Done when" has a plan gate and vice versa.
2. Re-derived the §4.2 export invariant (`0.75×mu` pt at every M — M=2: 4 mu → 3 pt, 18 mu → 13.5 pt),
   §9.2 page-pt math, the §8.5 inset crop model, and the storage atomicity/two-tab/schema rules.
   **Findings fixed in the spec first, then the plan:**
   - **Inset child `-crop` offset (§8.5 + D12):** children must render at `(cx - crop.x, cy - crop.y)`,
     the same offset as the asset image, or they detach from the photo content when the crop window moves
     (round 2 caught the image offset but not the child offset).
   - **Inset rotation pivot (§8.5):** "rotation around center" vs "group at top-left `(x,y)`" disagreed
     (Konva rotates about its own origin) — pinned the pivot (`offset({crop.width/2, crop.height/2})` in
     LOCAL units + `position({x+width/2, y+height/2})`).
   - **Inset hit-test `+crop` (§8.5 + §8.1):** inverse group transform lands in group-local space; asset
     px = `local + crop`. Fixed both hit-testing notes.
   - **Property-test count 200 → 500** (§13/1.1, §14) to match the execution-verified §6.1.1 code.
   - **Plan dependency graph** drew 0.3 → 1.2 (Home shell hosts project creation) + a 1.1 parallelism note.
3. Flushed out `docs/implementation-plan.md` into per-slice build packets: files + responsibilities,
   numbered build order, signatures at point of use, inline test tables, checkable gates, rollback notes.
   Checkpoint table and wrong-measurement tripwires kept in sync (added the inset crop-detach tripwire).

### 2026-09-21 — Session 4: senior adversarial & hardening review; plan expansion

Full finding register with evidence: **`docs/review-session-4-hardening.md`**.
Method: the specs' reference code was extracted into a JS runtime and **executed** against its own
committed tables (as rounds 2 and 3 did — and as in both prior rounds, it found defects that reading
had missed); the storage failure paths were attacked; and the build plan was audited for work that
**no slice owned** — a class earlier rounds structurally could not find, because they compared the
plan to the spec and the spec to itself.

**1. Wrong-measurement defects, all executed (fixed in the spec, then propagated to the plan):**
   - **F1:** §6.1's accepts table asserted `10′-4 ½″` → 124.5; **it returns `null`** — the vulgar
     fraction is never normalized, and the row's own trailing comment already said "NOT accepted".
     Same class as round 2's `12 6 → 148`, surviving two further rounds. Moved to rejects.
   - **F2:** `parseImperialToInches('-5')` returned **+5** (silent sign flip), and
     `formatInches(-124.5)` produced a string re-parsing to **-115.5**. Lengths are now non-negative.
   - **F3/F4:** `Enter` was gated on null/NaN only → a bare `0` committed a **0″ dimension**;
     `12 6 20` committed **151.25″** and `10' 4 99/100` committed 124.99″. New `isCommittableInches`
     + denominator-enum + numerator-<-denominator validation.
   - **F5:** the 500-combo property test's generator **never produced an empty slot** (measured
     0/2000 for each of feet/inches/numerator) — the branches where round 1's fraction-dropping bug
     lived were untested by the test written to prevent that regression. Rewritten to draw
     `''`/`'0'`/digits, assert composed-text shape, and assert its own coverage.
   - **F6:** `'0'` is a truthy string → `12'-6 0/16"`, `0'-4"`, a bare `"` stored as `enteredText`.
   - **F7:** freehand rendered `p.pressure` on a `Px` that has none (pressure is a **parallel
     array**) — does not compile under `strict`, and any cast makes every point 0.5, silently
     killing pressure ink width. Present in the spec **and** repeated in the plan.
   - **F8:** the loupe's 160px/3.5×/80px numbers are mutually impossible; pinned to a formula.
   - **Verified:** the corrected code was re-extracted from the spec and executed — **53/53 pass**,
     run 8× for randomization stability.

**2. Data-loss defects:**
   - **S1:** `writeAtomic`'s doc comment promised the per-project Web Lock; **the body never took
     one**, which also falsified `cleanStaleTmp`'s stated safety property.
   - **S2:** `cleanStaleTmp` scanned the **project root only**, while every tmp file the app writes
     is in `sheets/<n>/` or `assets/` — slice 1.2's own "no `*.tmp` survivors" gate could never pass.
   - **S3:** only the *parse* was guarded in `readJsonValidated`; all I/O failures bypassed `.history`.
   - **S4:** no disk-full handling existed anywhere in four documents. New `storageStatus: 'full'`,
     and: never prune `.history/`/`.trash/` to make room for a save.
   - **S6:** duplicate project ids are *expected* (the sanctioned sharing model is copying the
     folder) yet undefined. Now: separate cards, `«Copy»` badge, never merge.
   - **S5/S7/S8:** locked rename target, deterministic two-tab arbitration, precise `.history` caps.

**3. Ownerless work → three new slices and two new modules:**
   - **Slice 0.0 (origin & distribution)** — nothing in four documents said how the app reaches a
     Surface, and **the origin is the identity boundary** for the persisted folder handle, every
     setting, OPFS and the SW cache. Changing it later silently orphans all of them while the files
     survive. **This is the one open item needing a human decision (D24).**
   - **Slice 1.4.5 (editor shell)** — no slice built the tool rail ("do not simplify #1", 14 tools);
     1.5/1.6 built tools with nothing to select them from.
   - **Slice 1.11 (release & update)** — no service-worker update strategy existed.
   - **`src/state/persistQueue.ts`** — §10 named a "persistence queue" module; no slice listed it, so
     **nothing would have saved annotations between slices 1.5 and 1.10.**
   - **`src/domain/migrate.ts`** — §3.1 required per-file migration; no module, signature or slice.
   - **Test infrastructure** — none existed, while 0.3/1.2/1.3 already depended on it; §14 also
     mandated Testing Library against a dependency list that declared itself closed and lacked it.

**4. Also fixed:** content-addressed assets (§19.3 — `sha256Hex` was defined and never called);
   case-insensitive export conflicts (NTFS — `Overwrite` could silently destroy an unrelated
   export); a computed export memory budget with a hard guard and a designed PDF-splitting remedy;
   damaged-photo export behaviour; a **29-row** filename test table with an executed reference
   implementation; accessibility moved from the last slice into every UI slice; UI-spec size
   conflicts (72px keypad keys, 64px hold-to-confirm); and several cross-reference errors.

**5. Re-verified sound:** the §4.2 export invariant (`0.75 × mu` pt at every M), §9.2's page math,
   session 3's inset crop/pivot/hit-test model, the keypad's core table, and the formatters' carry.

### 2026-09-21 — Session 3 (continued): UI/UX + layout review; plan re-review
1. Senior adversarial + architecture review of the UI spec against §2.4/§11/§8. Fixed three findings
   in the UI spec (see DECISIONS "Session 3 — UI/UX & layout review"): rail-customization drift
   (Bottom rail / Pin order / Quick Pair deferred — "Bottom" contradicted "do not simplify #1"),
   camera `«High (device max: <MP>)»` → `«High (device max)»` (no megapixel promise, A7), and the
   "~37% vs full side style panel" rationale → ~44% (arithmetic shown).
2. The requested final `@oracle` plan review could not run — the subagent returned **Insufficient
   Balance**. Fell back to a self-review of the flushed-out plan: re-confirmed slice↔§13 mapping, that
   every signature restated in the plan matches the spec's reference code (no invented APIs), the
   numeric derivations (12 6 = 150 in, export invariant 0.75×mu pt, inset crop trace), the dependency
   graph edges, and the checkpoint/tripwire sync. No new plan defects found.

### 2026-09-21 — Session 4b: implementation contracts, resolved decisions, process docs

Closed the remaining under-definitions and every open question, and built the process layer the plan
assumes:

1. **Build spec §20 — implementation contracts** (things the docs referenced but never defined):
   `AnnotationPath`, `zIndex` bands/reordering, the erase split algorithm, `groupId`, and the two
   screens with no owning slice (Project screen → slice 1.2; Settings screen — first layout).
2. **Build spec §21 — resolved decisions** (nothing is open any more): origin & distribution
   (**D24**), fraction chip entry-scoped (**D31**), metric deferred, job-site address schema-only,
   sheet templates cut, **TypeScript pinned 5.x** (supersedes D14), plus the capture-resolution,
   `Konva.pixelRatio` and `lucide-react` decision tables. §18 rewritten into a resolved registry.
3. **New process docs:** `docs/CHECKPOINTS.md` (C1–C7), `docs/HARDWARE-TEST-CHECKLIST.md` (H1–H12),
   `docs/BUILD-LOG.md`, `AGENTS.md` / `CLAUDE.md`, and `docs/appendix-strings.md` (the complete UI
   copy inventory for `src/ui/strings.ts`).
4. **Closed the process gaps:** wrote `docs/BUILD-RUNBOOK.md` (slice loop §2, `[Surface]` deferral
   §4, three-strike rule §6), `docs/appendix-scaffold-files.md`, `docs/install-runbook.md`,
   `THIRD-PARTY-NOTICES.md`, and `docs/appendix-strings-gaps.md` (proposed copy for the 26 gaps).

### 2026-09-21 — Session 5: touch-first input model + GUI/UX readiness review

Raised by the product owner: **(a)** review the current architecture and GUI/UX and decide whether to do
pre-implementation visual design (via Claude Design); **(b)** confirm the app is usable **primarily by
touch** — tap-tap dimension placement (tap A, tap B) with one-finger drag to adjust.

**Method:** 8 parallel research lanes (4 × `librarian`, 3 × `designer`, 1 × `explorer`) plus
source-verified checks of the Claude Design product claims, then 4 implementation lanes to apply the
accepted changes. Two new documents:
**`docs/gui-ux-readiness-and-design-handoff.md`** (the senior report + design handoff) and
**`docs/touch-first-interaction-model.md`** (the implementable interaction design).

1. **Verdict — no pre-implementation design phase.** The UI spec is already implementable; the
   outstanding work was *decisions*, not mockups. **Claude Design is real** (Anthropic Labs,
   2026-04-17, Opus 4.7, codebase-first design systems, Claude Code handoff) — but its output **cannot
   ship here**: it emits inline-styled standalone HTML, which `style-src 'self'` blocks. Verdict:
   moodboard-only, optional, non-blocking.
2. **Tooling verdict.** `@playwright/test` 1.63.0 is **already pinned**, so the regression half was
   free. Assert exact computed geometry at both real viewports (1440×960, 960×1440) with
   `deviceScaleFactor: 2`; screenshot-baseline the canvas at 1×/4×/8×; drive synthetic pen input via
   CDP; and **enforce the CSP as a test**. Rejected: v0/Lovable/Bolt (Tailwind + cloud), Figma
   Make/Framer (no code export), Storybook/Loki/Chromatic/Percy (stale, or cloud + metered).
   Optional: Penpot self-hosted (the only surveyed mockup tool emitting class-based CSS).
3. **Contradiction register (C1–C14)** found in the canonical docs — 6 real defects. **C1–C10 and C13
   were applied by the repo owner in commit `5fa9515`** (D32–D34 recorded); **C11/C12/C14 applied in
   this session**.
4. **Touch-first inversion (the large change).** The app was specified pen-first; it will be used
   primarily by finger. `U §1.1` becomes *"Touch places and moves. Pen draws. Both create geometry."*
   Settings gain `«Touch places and moves»` (ON) and `«Finger draws (freehand)»` (OFF). **Tap-tap
   placement** for every placement tool through **one** `PlacementController`; Dimension commits at
   tap B, then a **450 ms settle window** auto-opens the keypad **only if no contact occurred**.
5. **Critical finding — no palm rejection without a pen.** The router's suppression window starts only
   on a pen event, so a pen-less session had **no suppression at all** (every touch resolved to
   `'navigate'`). W3C confirms authors cannot suppress palm behaviour and contact geometry is
   unreliable. Response: bounded heuristics (edge rejection, multi-touch debounce), keep the pen as a
   suppression signal when present, and make **undo + `pointercancel` rollback the safety net** —
   never a silent-discard mode.
6. **Why touch placement is defensible here.** Because measurements are **typed**, a placement error
   changes *where the line points*, not the measured number — a far smaller blast radius than for a
   calibrated CAD tool. Tap is at least as accurate as drag per point (CHI 2024). Finger precision is
   ~1.5 mm (2D) σ with a **systematic contact-centroid offset that cannot be corrected in math**
   (Windows exposes no intended-point API) — so it is corrected in the UI: snap, loupe, nudge pad.
7. **Object-first drag** — chosen by the product owner over the research's safer selection-first
   recommendation; recorded in `DECISIONS.md` **with its counter-argument and mandatory mitigations**
   (two-finger cancel-and-restore, Pan-tool override, undo labelling the move).
8. **A defect reintroduced and caught (wrong-measurement class).** The touch loupe was first specified
   as *"4× of a 100×100 source"* in a 200px window — which is 2×, not 4× — **the same defect class as
   F8/C4**. Caught in review; corrected to the D30-derived **50px** source in `U §8.1`, its changelog,
   and the interaction model, with a recorded rule preventing a third occurrence.
9. **Applied to the canonical docs**, verified: **all gates preserved or strengthened** (6 reworded,
   15 added, **none deleted**) and all **18** `〔v1 scope: …〕` markers intact. Files: `U` (touch change
   + C11/C12/C14), `P` (§8.2 touch-primary router + truth table, §2.4, §13 slice gates, §19.6
   targets), `implementation-plan.md` (0.2/0.3/1.3/1.5/1.6 + gates + checkpoint rows +
   Konva-in-jsdom note + CSP-as-a-test), `appendix-strings.md` (209 → 223 strings),
   `HARDWARE-TEST-CHECKLIST.md` (H1 touch-primary, new **H1b** touch-only palm, H13–H18),
   `CHECKPOINTS.md` (C8/C9/C10), `DECISIONS.md` (**D35–D42** + the session-5 detail section).

**Open after session 5:** C14 final copy wording (content owner) and `appendix-strings-gaps.md` §12.
Handedness-question semantics was resolved by the owner this session: keep `«Which hand do you write
with?»`.

---

### 2026-09-21 — Session 6: slices 0.2 + 1.1 + 0.3 (parallel fixer lanes)
Three lanes in parallel. **0.2** (input spike): the touch-first input router copied verbatim from §8.2
(D43) + 15 unit tests + the C3 device-caps probe. **1.1** (domain core): types/schema/units/geometry/
snapping/ids/migrate + 89 tests — two §3.4 schema bugs found by compilation, not reading (D44).
**0.3** (first-run/Settings/Home): settings helpers + appStore + three screens + filled `strings.ts`
(D45–D47). C3 recorded provisional (no camera on the build machine); the 8 `[Surface]` input/palm gates
logged to the hardware checklist.

### 2026-09-21 — Session 7: slice 1.2 (storage core) + orchestrator senior review
One fixer lane built the storage core (backend/projectStore/persistQueue/ProjectList rewire, 52 tests),
then the orchestrator ran a senior adversarial review and fixed five findings (D48–D53): zod v4's JIT
`Function('')` probe firing `script-src eval` under the CSP (`globalConfig.jitless = true`); the
`StorageStatus` union missing `'saving'`/`'full'` (reconciled to one canonical union); the §5.1
root-vs-project-folder ambiguity; the duplicate-id lock/queue key collision risk; and the CDP
renderer-crash harness timing out (marked `fixme`). 166 tests + tsc + build + e2e green; committed and pushed.

### 2026-09-21 — Session 8: oracle-style execution review (slices 0.2–1.2) → clear 1.3–1.5

Ran the full gate (`vitest` 166/166 · `tsc --noEmit` · `npm run build` 11 precache · `playwright`
5/4-fixme) and re-derived **48/48** unit expectations from `src/domain/units.ts` by execution (not by
reading the passing tests). Re-traced the four highest-stakes modules plus `schema.ts`/`migrate.ts`/
`inputRouter.ts`/`backend.ts`. **Verdict: the foundation is sound; slices 1.3–1.5 are safe to start.**

- No wrong-measurement or data-loss defect. The parser rejects `12 6`, negatives, vulgar fractions,
  numerator ≥ denominator, and denominators outside {2,4,8,16,32,64}; `formatInches(-124.5)` →
  `-10'-4 1/2"` re-parses to `null` (asserted). Atomic write takes `fm:project:<id>` inside
  `writeAtomic`; `createWritable()` exists in exactly one module.
- **One fix:** `cleanStaleTmp`'s comment claimed "never touch `.history/`" while the code correctly
  recurses into it (only `.trash` is in the skip set) to clean orphaned snapshot `.tmp` files. Comment
  rewritten; behaviour unchanged.
- **Confirmed sound:** the `.history/<scope>/<epochMs>-<name>.json` recovery sorts newest-first via
  `parseInt` on the epoch prefix; D51 (duplicate-id runtime key, contract pinned to 1.3), D52 (snapshot
  cadence → 1.6/1.10), and D53 (kill-switch harness → H4) are all safe to defer. Full register in
  `docs/DECISIONS.md` "Session 8".

**Next:** slice 1.3 (photo on canvas), then 1.4 ∥ 1.4.5, then 1.5 — see handoff at the end of the
session.

### 2026-09-21 — Session 9: slice 1.3 "photo on canvas" + independent oracle review

One fixer lane built slice 1.3: the media pipeline (`normalizeImage`/`sha256Hex`, the manual-APP1
`exif.ts` bounded to a 64 KB head slice, `thumbnails.ts` + the real `decodeWorker.ts` body), the
imperative `EditorCanvas` (5 layers, per-layer `pixelRatio` per §8.1.1, hand-rolled pinch on Konva’s
touch events, and the §4.2 screen-rules seam), `SheetEditor`, the App editor route with the **D51**
`${id}:${folderName}` runtime key, and deterministic dependency-free JPEG/EXIF fixtures. A second
lane pulled **slice 1.9 step 1** forward (`export/filenames.ts` + its 29-row table) because it has no
dependency on 1.3 or on the style system.

An independent `oracle` review then re-derived the fixture bytes with its own JPEG parser + Huffman
decoder, cross-decoded with GDI+, traced Konva’s internals, and re-ran both Vitest projects. It found
**F1 — one-finger pan on empty canvas was never implemented** (panning gated on
`intent === 'navigate'` while the default `touchPlaces: ON` classifies touch as `'draw'`), which the
green gate structurally could not see because the predicate was tested and its wiring was not. F1 and
F2 were fixed and are now guarded by `tests/sheetEditor.browser.test.ts`, which mounts the real
`SheetEditor` and asserts the stage actually pans (verified to fail pre-fix). F3 (a comment claiming an
unwired restore) and F4 (a false "SOF-patched seed" narrative) were corrected; F5 strengthened the
label half of the §4.2 test. The review confirmed the fixtures, the §4.2 seam, the EXIF path, all four
D51 keys and D54/D56–D59 as written.

**Machine gates:** `npx tsc --noEmit` 0 · `npx vitest run` **270/270** (24 files) · `npm run build` 0
(12 precache) · `npx playwright test` 5 passed / 4 fixme. Five `[Surface]` gates logged to
`docs/HARDWARE-TEST-CHECKLIST.md` (none faked). `docs/DECISIONS.md` D54–D64.

**Next:** slice 1.4 ∥ 1.4.5, then 1.5.

### 2026-09-21 — Session 9 (continued): process hardening + docs reality pass

A reflect pass over session 9 produced three document-level fixes and one machine gate:

1. **`AGENTS.md` stopped lying.** It claimed *"There is no application code yet"* five slices in. It now
   separates *contract* from *state* (state lives in `CONTINUITY.md` + the last `BUILD-LOG` entry), makes
   CONTINUITY reading-order #1, drops every volatile count, and carries the environment quirks — shell
   invocation, the console encoding trap, background-task tooling, CRLF — so they stop costing a failed
   tool call every session. `CLAUDE.md` is now a pointer: it had drifted into a stale second copy with a
   mojibake header and no referrers.
2. **`docs/BUILD-RUNBOOK.md` gained §11 (parallel lane protocol) and §12 (review brief)**, and
   **`docs/review-brief.md`** now holds the eight questions every review lane must answer, each with the
   real defect that put it there. The lane rules this session re-derived twice are written down.
3. **Checkpoint bookkeeping is three places per firing** (§8). **C4 was fired in 1.3 and never recorded**;
   it is now recorded as *not measurable at its slice* — 1.3 shipped no annotation model, so "50
   annotations on a 4096-px sheet" cannot run until 1.6. No number was invented; the hardware row is
   logged and the re-run point is set.
4. **The copy contract is now a gate**: `tests/strings.test.ts` (a parallel lane), so the byte-level
   appendix match no longer depends on someone reading two 48 KB files carefully in a console that
   mangles U+2014.

**The C1/C2 claim in this session’s reflect report was RIGHT, and the correction I published against
it was WRONG.** Proven binary-safe: at `1975860` the C1/C2 headings ended in U+2B1C (⬜); at `a6a12de`
they end in U+2705 (✅) — a **concurrently running lane** refreshed them while this pass was being
written, so the `git diff` I checked against a *moving* HEAD could not show the historical state and
made a true finding look false. Rules adopted (D66): **test a finding against the revision it was made
against** (`git show <sha>:path`), never current HEAD; and **never withdraw a finding without that
proof**.

**Open at the time of writing (important):** the **1.4 and 1.4.5 lanes and the copy-gate lane were still
running** — `src/ui/CameraFlow.tsx`, `EditorLayout.tsx`, `ToolRail.tsx`, `TopBar.tsx`, `cameraCopy.ts`,
`editorStore.ts`, `src/ui/icons/tools/*`, plus edits to `App.tsx`, `SheetEditor.tsx` and `strings.ts`
were appearing in the tree while this entry was written. **Their output is unverified and was
deliberately NOT committed**; it needs its own gated commit. Watch item: the 1.4.5 lane owns
`src/ui/strings.ts` and is adding copy, so `tests/strings.test.ts` may need reconciling once it stops
(new keys need a verbatim appendix row or a ⚠ PROPOSED marker).

### 2026-09-21 — Session 10: slices 1.4 ∥ 1.4.5 (two lanes) and 1.5 (two lanes)

Two parallel waves, each integrated by the orchestrator before the next began. **Wave 1** —
4 design lanes: (1.4.5) the editor shell, and (1.4) the capture flow. **Wave 2** — 1.5 split on
the seam the specs already pin: a `@fixer` machine lane (DimensionTool + Loupe + history +
shapes + shell wiring) and a `@designer` keypad-sheet lane.

**Before dispatch** the orchestrator closed an ownership gap the handoff left open: neither lane
owned `SheetEditor.tsx` or the "a photo becomes a sheet" write path, and both needed it. It was
extracted to `src/fs/sheetIntake.ts` and the existing import path refactored onto it (`ab42300`),
so two lanes could not write two versions of one data path.

**Copy discipline** (`BUILD-RUNBOOK` §11): each wave had exactly one writer for `strings.ts`; the
other lane staged copy in its own module (`cameraCopy.ts`, `keypadCopy.ts`), which the
orchestrator folded **from the appendix bytes** and deleted. The keypad fold was a merge, because
the machine lane had already added some of the same keys.

**Owner decision:** the independent `@oracle` review of this batch was **waived** (recorded in
DECISIONS and above). Compensating controls, all executed: the full gate on the reconciled tree;
an internal review against `docs/review-brief.md`; the lanes were asked for adversarial findings
and produced real ones (two nested modals; hotkeys leaking through the open keypad; a spec height
that cannot hold its own contents; stale refusal copy under D31).

**Machine gates:** `tsc` 0 · `vitest` **437 / 36 files** (browser project included) · `build` 0
(17 precache; Konva split out of the main chunk) · `playwright` 5 passed / 4 skipped.
**Checkpoints fired:** C5 (lucide API → measured) and C10 (touch placement accuracy → machine half
proven, on-glass walk deferred). C1/C2 were refreshed earlier in the batch; C4 was already recorded.

**Still owed:** `markup.json` persistence (D70) — annotations are in-memory until a later slice
connects `persistQueue`; the Offset Nudge Pad (optional for 1.5); and 1.9 steps 2–5.

### 2026-09-21 — Session 11: slice 1.6 markup tools (PARTIAL)

Two lanes: the tool/document spine (`@fixer`) and the props-driven Layers panel (`@designer`),
split so that exactly one lane touched `strings.ts`, `SheetEditor.tsx`, `scene.ts` and the tools.

**Shipped:** every remaining drawing tool (shapes, angle, freehand/highlighter, text, erase,
select), the document extended to all §3.3 kinds with §20.2 z-bands, ink regeneration on zoom, the
touch-model rules (touch erase is object-only; finger ink is constant-width; the highlighter’s
straight-line tap-tap chisel), and — closing the D70 carry-in — **`markup.json` persistence**, so
annotations survive a reload.

**Machine gates:** `tsc` 0 · `vitest` **526 / 40 files** · `build` 0 (17 precache) · `playwright`
5 passed / 4 skipped. **Checkpoint C9** fired → touch-only row proven, pen half PENDING.

**Two defects found by the gate, not by the lanes:** the tools lane wrote a **CP1252 em dash** into
`src/styles.css`, which broke `npm run build` while **526 tests stayed green** (vitest is lenient;
rolldown is not) — repaired, then swept tree-wide; and the staged copy module’s own “proposed keys”
list disagreed with its own object paths, which would have folded eight proposals **unmarked**. The
fold takes provenance from the appendices instead of the list.

**Owed (this slice is PARTIAL):** the Layers panel is built and tested but **not mounted**;
`SelectTool`’s marquee/rotate/groups/mini-toolbar are implemented but not shell-driven; the erase
600 ms long-press preview has no timer. All three are recorded in D72/D73.

**Carry-in closed:** D70 (`markup.json` persistence). **New watch item:** the read-only project
case is not suppressed at the queue — it parks and retries, and the 1.10 chip owns that state.

### 2026-09-21 — Session 11 (continued): the 1.6 wiring closure and a real reorder defect

Three lanes were dispatched at once — the wave's own lane plus, **off the critical path**, the two
UI halves that later waves need (`ImageInsetPickerSheet` for 1.7, `StylePanel`/`StyleEditorSheet` for
1.8) — because neither writes a file the wave owns. All three are built, tested and green.

**The three owed items are closed** (D75): `Annotation.visible` (additive in both domain files, no
migration bump) with `setVisible`/`setLocked`/`rename` on the scene; `layersOpen` mirroring
`keypadOpen`; a real `onToggleLayers` with `aria-expanded`; the mount in `SheetEditor` as a
positioning-only wrapper; rows derived by the new pure `ui/layersRows.ts`; every toggle one undo
step. `SelectTool` is now fully shell-driven (marquee on non-touch empty drag, tap-select,
long-press pin, rotate chips, Lock/Delete, the locked toast), and the erase 600 ms preview has its
timer.

**The wave review caught what the wave's own gate and the 639-test suite could not** (D76). Two
defects, one root cause — the panel's **groups** are not the **§20.2 bands**:
1. `resolveDrop` returned a **group-block** index while `moveInBand` read a **band** index, so with
   ≥2 groups in the main band a reorder landed in the wrong slot. Executed trace: a dimension
   dragged onto another dimension **jumped above an unrelated Rect**.
2. Because `freehand` (main band) and `highlight` (lower band) share the `ink` group, one block spans
   two bands and the cross-band refusal **never fired** — the drop silently did nothing, so the gate
   *"a cross-band reorder is refused with the approved copy" was not truly met*.

Fixed with an anchor-based, band-filtered primitive (`moveInBandBefore`/`moveInBandToBack`), so a
cross-band move is now **unexpressible**; the fix lane reproduced both failures **before** the fix
and captured both outputs. A pre-existing **Send-to-back off-by-one** in the panel (it landed the row
second-from-back) was corrected with its pinned expectation, arithmetic shown in D76.

**Machine gates:** `tsc` 0 · `vitest` **643 passed / 47 files** · `build` 0 (17 precache, no
`UNLOADABLE_DEPENDENCY`) · `playwright` 5 passed / 4 skipped. **Checkpoints:** none fired; C4's
obstacle is gone (annotations exist) and it is dispatched as its own lane.

**Also corrected in the same commit (D74):** five subordinate-document defects in the UI spec and the
strings appendix — two container dimensions that could not hold their own contents (`360px` keypad =
538 px; `320px` picker = 440 px), the self-contradicting Layers long-press (resolved **grip = drag,
row body = menu**), the 280 px panel that cannot hold its own 6-across 44 px swatch grid (294 px), and
the appendix's `4 pt` example for a string whose own source says `«3 pt»` (pt = 0.75 × mu).

## Done

- ✅ Product scope locked (Surface-only, local-only; no server / DB / cloud / Bluetooth / multi-user).
- ✅ Build spec (v0.3 hardened, round-2 execution-verified) + UI/UX spec (v2 hardened).
- ✅ Adversarial review round 1 complete; findings folded in.
- ✅ **Adversarial review round 2 complete** — the spec's own reference code was executed and
  traced; a wrong committed test expectation (`12 6` → 148 in; correct is 150), a fraction-dropping
  `composeEnteredText`, `pressDot` semantics, `parseLooseToSlots` gaps, a `cleanStaleTmp` race, an
  inset crop-offset gap, and the React 18/19 mismatch were all fixed before commit.
- ✅ **`docs/implementation-plan.md`** — dependency graph, 14 slices, machine-checkable +
  on-device gates, checkpoint table, wrong-measurement tripwires.
- ✅ **Session 3** — plan verified (findings fixed in spec + plan) and flushed out to per-slice build
  packets (files, build order, signatures, inline tests, checkable gates, rollback notes).
- ✅ Dependencies installed and verified resolvable (`fflate` pinned; React 19.3 reconciled).
- ✅ Repo documentation scaffolding (README, INDEX, CONTINUITY, DECISIONS, UNITS) updated for all of the above.
- ✅ **Session 4b** — build spec §20 (implementation contracts) + §21 (resolved decisions) added;
  §18 rewritten as a resolved registry.
- ✅ **Session 4b** — process docs added: `docs/CHECKPOINTS.md`, `docs/HARDWARE-TEST-CHECKLIST.md`,
  `docs/BUILD-LOG.md`, `AGENTS.md`, `CLAUDE.md`, `docs/appendix-strings.md`.
- ✅ **Session 4b** — handoff closed: `docs/BUILD-RUNBOOK.md`, `docs/appendix-scaffold-files.md`,
  `docs/install-runbook.md`, `THIRD-PARTY-NOTICES.md`, `docs/appendix-strings-gaps.md`.
- ✅ **Session 5** — senior GUI/UX readiness review + design handoff
  (`docs/gui-ux-readiness-and-design-handoff.md`): architecture assessment, Claude Design verdict,
  pre-code tooling stack, 14-item contradiction register, pre-code decision package.
- ✅ **Session 5** — touch-first interaction model designed
  (`docs/touch-first-interaction-model.md`): one `PlacementController`, the 450 ms settle window, the
  Offset Nudge Pad, the object-first drag predicate, tap precedence, gesture budget, latency budgets.
- ✅ **Session 5** — **touch inversion applied** across the UI spec, build spec, implementation plan,
  strings inventory, hardware ledger and checkpoints; **D35–D42** recorded.
- ✅ **Session 5** — C11/C12/C14 applied (C1–C10/C13 were applied by the owner in `5fa9515`).
- ✅ **Session 5** — **UI/UX confirmed implementation-ready**; no design gate remains before slice 0.0.

## In progress

- Nothing in flight as of this update. **Next dispatched: slice 1.4 ∥ slice 1.4.5** (two lanes).

## Next slice (not started)

- ⏳ **Slice 1.4 ∥ slice 1.4.5.** Capture flow (`CameraFlow.tsx`, capture → `normalizeImage` → `writeBlobAtomic`) ∥ the editor shell (`EditorLayout`/`ToolRail`/`TopBar`/`icons/tools/*`/`editorStore.ts`). Two disjoint lanes; `src/ui/strings.ts` and `src/App.tsx` are owned by the 1.4.5 lane.
- ⏳ Then **1.5** (dimension flagship), then 1.6 → 1.11 → 2.0 per `docs/implementation-plan.md`.
- Also outstanding: **slice 1.9 steps 2–5** (`renderStage`/`pdf`/`png`/`ExportWizard`) — step 1 is already shipped.

## Next (in order)

1. **Slice 0.0** origin & distribution decision (gate: origin pinned in DECISIONS; runbook exists).
2. Slice 0.1 scaffold → installable, offline PWA shell **+ the three test harnesses + fonts +
   CSP-as-a-test** (gate: airplane-mode reload works; CI green; vitest **node + jsdom + browser** and
   Playwright all run).
3. Slice 0.2 input spike — **now touch-first** (touch places, finger pans, pen parity; device caps
   report) — the highest-risk area; do it before any UI (gates: touch tap-tap, **touch-only palm gate**,
   pen palm gauntlet).
4. Slice 0.3 first-run / settings / Home shell (includes the five input toggles and their defaults).
5. Slices 1.1 → 1.4, **1.4.5 (editor shell)**, 1.5 → 1.10, **1.11 (release & update)**, then the
   2.0 field pilot — **follow `docs/implementation-plan.md`** for gates and checkpoint tables.

---

## Open questions

**Two items remain open after session 5 — neither blocks slice 0.0 or 0.1:**

1. **C14 final copy wording.** Settings labels, capture toggles, sort/search, style-panel headers and
   the first-run `Right`/`Left` card labels are marked **placeholder copy** in
   `docs/ui-spec-field-measure-v2-hardened.md` and `docs/appendix-strings.md`, with proposals in
   `docs/appendix-strings-gaps.md`. A content owner must approve the wording before it ships —
   **do not invent final copy in code.**
2. **`docs/appendix-strings-gaps.md` §12** needs reconciliation by its owner (flagged by the ledger lane).

**Handedness-question semantics — RESOLVED.** The owner decided (session 5, right-handed): keep
`«Which hand do you write with?»`. The touch-first model's *"which hand holds the tablet"* reframe is
**rejected** — every canonical doc already agrees on this wording, so no spec change is required.

**Previously open — all resolved in session 4b** (build spec **§21**). The former questions and their
resolutions:

| Was open | Resolved in | Decision |
|---|---|---|
| Origin & distribution (D24) | §21.1 | Static HTTPS host + origin-agnostic `base` + a slice 0.1 origin guard |
| Fraction chip vs project precision (D31) | §21.2 | Chip is entry-scoped; project precision changes only from the style panel |
| Metric at launch | §21.3 | No — deferred, seam kept |
| Job-site address | §21.4 | Schema-only; no UI in v1 |
| Sheet templates | §21.5 | Cut, confirmed |
| TypeScript 7 vs 5.x | §21.6 | Pin TS 5.x for v1 (supersedes D14) |
| Capture resolution toggle | §21.7 | Decision table — 0.2 measures, 1.4 reads the row |
| `Konva.pixelRatio` on Surface Go | §21.8 | Decision ladder, measured in 1.3 |
| `lucide-react` 1.x API | §21.9 | Two-line spike in 1.4.5 |

Calibration and vector-overlay PDF were already resolved by the review (build spec §2.4).

## Known drift / watch items

- `package.json` is still npm-init defaults (`"type": "commonjs"`, placeholder test script) — fix in
  slice 0.1.
- **`lucide-react` 1.x** — chrome icons only; the 14 tool glyphs are bespoke SVG (per UI spec). Verify
  the icon-name API at first use.
- Transitive `glob@11.1.0` deprecation warning from the PWA toolchain — not a vulnerability
  (`npm audit` is clean).
- `docs/appendix-strings-gaps.md` is **proposed copy** — a human should approve the wording before it
  ships, then fold the final strings into `docs/appendix-strings.md`.
- `THIRD-PARTY-NOTICES.md` exists but several license fields are `verify at scaffold (C1)` — confirm
  them at slice 0.1.
- **Palm rejection without a pen is probabilistic** (D39). The router has a pen-free path (edge
  rejection + multi-touch debounce) but it is best-effort. `HARDWARE-TEST-CHECKLIST.md` **H1b** is the
  gate; undo and `pointercancel` rollback are the safety net. Do not treat it as deterministic, and
  never add a mode that silently discards input.
- **Object-first one-finger drag is a deliberate, mitigated risk** (D37) — the touch-placement research
  recommended selection-first. Re-check in slice 0.2 and on real hardware.
- **Canvas tests must not run under jsdom** (D40): `getIntersection` returns `null` and `toDataURL`
  returns a stub, so a hit-testing test "passes" without testing hit testing. Konva tests belong in the
  Vitest **browser** project.
- **Loupe geometry rule** (DECISIONS, session-5 correction): never state a loupe's window,
  magnification and source as three independent numbers — exactly one is free and the other two are
  derived. The same defect class has now been caught twice.
- `docs/appendix-strings.md` grew **209 → 223** strings; the new touch strings are **proposed**, not
  final, and follow the same approval path as `appendix-strings-gaps.md` (see Open questions 1).

## Known drift / watch items (session 9)

- **1.4 / 1.4.5 output is in the working tree but unverified and uncommitted.** Two lanes were running at
  the end of session 9 (`src/ui/CameraFlow.tsx`, `EditorLayout.tsx`, `ToolRail.tsx`, `TopBar.tsx`,
  `cameraCopy.ts`, `editorStore.ts`, `icons/tools/*`, edits to `App.tsx` / `SheetEditor.tsx` /
  `strings.ts`). Reconcile them against their plan gates, fold `cameraCopy.ts` into `strings.ts`, wire the
  deferred camera mount, then run the **full** gate and commit them as their own slices.
- **`tests/strings.test.ts` (the copy gate) may need reconciling** once the 1.4.5 lane stops editing
  `strings.ts`: every new key needs a verbatim row in `appendix-strings.md` or a `⚠ PROPOSED (C14)` marker.
- **Lanes committed to `main` during this session** — `ab42300` (`refactor(fs): extract the "photo →
  sheet" write path`) and `a6a12de` (checkpoint status refresh + the C2 record), both pushed as ancestors
  of `b68b74c`. Neither went through a slice gate or a `BUILD-LOG` entry, so **review them before treating
  1.4/1.4.5 as shipped**: `src/fs/sheetIntake.ts` is new and `SheetEditor.tsx` was rewired through it.
- **C4 is recorded but unmeasured** — re-run after 1.6, when annotations exist (D66, hardware row logged).
- **`docs/HARDWARE-TEST-CHECKLIST.md` carries a C4 row that is on disk but not yet committed** (the file
  is lane-owned this wave); confirm it survives the wave commit.


## Known drift / watch items (session 11, continued)

- **Object groups do not exist anywhere** — `SelectTool` has no group model, `scene.ts` has none,
  and the Layers panel's `Group`/`Ungroup` are correctly disabled. D75; landing them is its own slice.
- **The photo row is synthetic** — the sheet's photo is not an `Annotation`, so its row is
  non-deletable (§20.2) but its **lock cannot persist**. Owed until 1.7 models the photo.
- **The mini-toolbar uses the `.placement-hud` slot, not `miniToolbarPosition`** — a computed anchor
  needs an inline `style`, which the CSP (and the CSP-as-a-test) forbids. D75.
- **Rename is a no-op** on purpose (annotations carry no name; names derive — AGENTS #2). Either
  remove Rename from the row menu or sanction a stored name field; do not silently add one. D75.
- **Inset and inset-child Layers rows are code-complete but unreachable** until 1.7 attaches
  `children` and image rendering.
- **The 1.4→1.6 batch still has NOT had an independent adversarial review** (the owner waived it).
  The orchestrator review of the 1.6 wave found two real defects the suite could not see, which is
  the argument for running the `@oracle` pass — scheduled immediately after the 1.6 commit.
- **Targets remain CSS-declared, not measured** (keypad 48–72 px; panel 320/56/48 px) — same class as
  **D64**'s unproven dpr-2 path.
- **Two carried watch items are now closed:** the UI-spec numbers (D74) and the Layers long-press
  contradiction (D74). The remaining carried ones are unchanged: parked writes on read-only projects
  (1.10), unapproved `⚠ PROPOSED (C14)` copy, the borrowed `PendingOp`, and the 14 placeholder glyphs.
- **The reorder seam's semantics are worth re-reading before 1.7 changes z-order** — Bring to front
  is *front of the row's own group*, not of the sheet, because `(key, 0)` is shared with a drop on the
  group's front row (D76). Insets will add a new group and (in Focus mode) a nesting level, which is
  exactly the shape of change that produced the defect above.

## How to resume

1. Read this file.
2. Read `docs/BUILD-RUNBOOK.md` — how to work (slice loop, gate policy, `[Surface]` deferral,
   three-strike rule).
3. Read `docs/review-session-4-hardening.md` — the most recent review, its findings, and the
   **method note**: extract every reference code block into a runtime and run it against its own
   committed table *before* reading prose. Three rounds running, that is what found the real bugs.
4. Read `docs/preflight-handoff-v0.3-hardened.md` — start with **§2.4 (v1 scope table)**, then the
   session-4 changelog rows 21–38, **§5.8**, **§19**, then §13 (build slices).
5. Read `docs/ui-spec-field-measure-v2-hardened.md` for UI detail.
6. Check `docs/DECISIONS.md` before making a technical choice.
7. Follow the build slices in order.
8. At step 2 of each slice, check `docs/CHECKPOINTS.md` for a checkpoint that fires, and log the
   slice in `docs/BUILD-LOG.md` in the same commit. Copy strings from `docs/appendix-strings.md` into
   `src/ui/strings.ts` — never invent wording.
