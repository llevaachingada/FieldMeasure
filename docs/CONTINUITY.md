# Project Continuity Log

**Purpose:** a single place that records where this project stands, so any session (human or AI) can
resume without re-deriving context. **Update this file at the end of each work session.**

**Last updated:** 2026-09-22 (session 22 — **the sheets grid's five owed items (D111) are built**: reorder (400 ms long-press drag, live renumber, pointer-following «Drop to move»), rename (inline), duplicate, the constrained §11.2:720 replace photo, and the §11.4 storage chip. Building it exposed and fixed a real `sortIndex` defect — `addSheetFromPhoto` wrote a gap-of-1 index, so after any reorder a newly appended sheet would have sorted **before every existing sheet** (**D116**); the replace was reordered with a rollback so a failure can no longer leave the new photo under the old dimensions or the old thumbnail under the new photo (**D117**); the wave's own choices are **D115**. Storage: `src/fs/sheetOps.ts` + `src/fs/projectSize.ts`; UI: `ProjectScreen.tsx`, `sheetReorder.ts`, `StorageChip.tsx`; the shell seam is `App.tsx`. Gate: tsc 0 · **94 files / 1319 tests** · build 0 (26 precache, 1520.63 KiB) · playwright 5/5. Three rounds of the capture blocker are root-caused: **D121** (a Web Lock name collision — fixed and pinned), **D119/D120** (the honest failure surface and the bounded wait), and **D122** (the owner's folder grant is **`denied`**, which no prompt can fix — the app now offers a **re-pick** and `Settings → Storage → «Change folder…»` finally **adopts** the picked handle). **Both reviews of the wave landed and are discharged** — an executed correctness register (no wrong-measurement, no data-loss; one claim-fidelity inversion and one wiring-seam gap, both fixed) and a **measured** UI/UX review (three Highs, all fixed) — full register and owed items in **D118**. Owed here: the **real end-to-end run on hardware**, and four recorded review items (drag autoscroll, the inert scroll container/top bar, the editor's replace dialog, `aria-pressed` on the hold))

---

## Current snapshot

| Field | Value |
|---|---|
| Phase | **Slices 0.2–1.9 complete (1.9 reviewed, D109); 1.10 in progress; 1.11 landed (D112); the Project screen is built (D111) and now owns sheet trash (D113).** Shipped in 1.10 so far: themes (D104), the trust layer (D107), sheet trash (D113). Still owed: the History flyout, the end-to-end a11y audit, the arrow nudge, D101's halo fix, PDF captions, and the grid's remaining items are now **built** (session 22, D115–D117) — what still owes is the **independent review of that wave**, the **real end-to-end run on hardware**, the paused 1.10 polish, and PDF captions. Then 2.0 |
| Application code | **Twelve slices + 1.9 wiring + 1.10 trust layer/trash + 1.11 + the Project screen**, **94 files / 1317 tests** (node + jsdom + browser) on the unified tree; build 0 (26 precache entries, 1519.78 KiB); playwright 5 passed / 5 skipped. Session 21 added `src/fs/sheetTrash.ts` + `src/ui/TrashPanel.tsx` (delete/restore/prune), the grid's card menu, the folded `trash.*`/`sheetMenu.*` copy, the `App`/`EditorLayout` wiring for delete, restore, prune-on-open and the Export hand-off — and then the review resolutions (the single shell-level toast host, the delete reordering, the export-scope expansion, the restore-failure toast, the honest Settings rows). **Session 22 built the grid's five remaining D111 items** — `src/fs/sheetOps.ts` (reorder/rename/duplicate/replace-photo storage), `src/ui/sheetReorder.ts` (the pure drag arithmetic), `src/ui/StorageChip.tsx` + `src/fs/projectSize.ts` (§11.4 from real disk facts), the grid's card menu / inline rename / drag / warned replace dialog, and the `App` seam that owns the picker and the dimension decision |
| Build spec | **v0.3 hardened (r2) + touch-first (round 5)** — `docs/preflight-handoff-v0.3-hardened.md` (canonical). §8.2 input router is now **touch-primary** |
| UI spec | **v2 hardened + touch-first (v2.1)** — `docs/ui-spec-field-measure-v2-hardened.md` (canonical). Touch-primary principle, tap-tap placement, C11/C12/C14 applied |
| Implementation plan | ✅ `docs/implementation-plan.md` **v1.2 hardened + touch-first** — touch-first router/gates, three Vitest projects (incl. browser), CSP-as-a-test |
| Adversarial review | ✅ rounds 1–5 · ✅ sessions 7–9 (orchestrator + independent oracle on 1.3, F1–F5) · ⚠️ **session 10's waiver is now discharged: session 12 ran the independent `@oracle` pass over the 1.4→1.6 batch** — execution-based, in a clean worktree at `e06bf8f`, with a real-CDP-touch harness. **No wrong-measurement and no data-loss finding**, six correctness findings (**D77**): F1 touch drag-to-reorder silently dead, F2 «Adjust endpoints» dead, F3 Esc never cancels a pending dimension, F4 Chain locks at the pre-refine B, F5 settle survives a tool switch, F6 sub-slop moves outside history, plus F7 (a **measured** §4.2 label/text layout drift), F8, F9 and two doc-fidelity items. **F1/F2/F4/F8 are fixed** with pre-fix-failing evidence; **F3/F5/F6/F7/F9 remain owed** and are the next action. **Verified sound** with evidence: the §4.2 size invariants, `Annotation.visible` through zod, the anchor-based §20.2 reorder, the timers, persistence, the loupe arithmetic, history, and the copy contract. |
| Design research | ✅ **Session 5** — 8 lanes (4 × `librarian`, 3 × `designer`, 1 × `explorer`): Claude Design capability, pre-code tooling, Konva/pen/palm, touch placement, spec gap analysis, field-app teardown, touch interaction design, touch-primacy docs audit |
| Dependencies | Installed and pinned — **TS 5.9.3** (not 7.0.2), + `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `jsdom` 30.1.0, `@vitest/browser-playwright` 5.0.1 |
| Blocking item | **None.** Origin resolved (§21.1 / D24). **UI/UX is implementation-ready**; no design gate remains |
| Next action | **An independent executed review of the grid wave (D115–D117)** against the commit — data-critical `project.json` code plus a shell rewire, so it earns the same treatment as D114. Then the handoff's §3 path **run for real** on a machine with a webcam (built app → new project → camera → shutter → dimension → text → export → open the PDF): that run, not another test, is what turns this into a beta. Then the **paused 1.10 polish**: the History flyout (`writeHistorySnapshot` still has no caller), the end-to-end a11y audit, the arrow nudge, and D101's label-halo fix; the PDF caption placement (F1) and the `Skip`-row copy sign-off (F4) still need the content owner. Then 2.0 |

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
obstacle is gone (annotations exist), so its machine half is now **constructible and owed — not yet
dispatched** (⚠ corrected in session 12: this line previously said "dispatched").

**Also corrected in the same commit (D74):** five subordinate-document defects in the UI spec and the
strings appendix — two container dimensions that could not hold their own contents (`360px` keypad =
538 px; `320px` picker = 440 px), the self-contradicting Layers long-press (resolved **grip = drag,
row body = menu**), the 280 px panel that cannot hold its own 6-across 44 px swatch grid (294 px), and
the appendix's `4 pt` example for a string whose own source says `«3 pt»` (pt = 0.75 × mu).

### 2026-09-21 — Session 12: slice 1.7 (image insets), the independent review, and four defects fixed

**Three lanes ran at once, two of them off the critical path** (the 1.7 engine, and — from the
previous wave — the 1.8 style-panel UI), then integration, then a remediation lane on a hard file
allowlist chosen so no two writers could touch one file.

**Slice 1.7 shipped** (D78): the §8.5 coordinate model as **pure, executed** geometry (the shared
`-crop` offset on the asset *and* every child, rotation pivoting on the placed rect's centre); the
Konva container render verified against Konva 10.6's `_drawChildren`; **content-addressed assets**
(`assets/<sha256hex>.jpg`, dedupe by existence check, no index file); one-level **Focus** mode; an
`InsetTool`; **child addressing** in `MarkupScene` (`${insetId}/${childId}`) with children explicitly
**outside** the sheet z-bands; the props-driven picker sheet; and the shell wiring (asset registry
decoding off the main thread, a Focus-aware scene facade, breadcrumb, Replace-photo dialog with
hold-to-confirm), with the Inset rail tool finally **enabled**.

**The independent review the owner waived in session 10 was run** (D77), and it earned its keep:
execution-based, in a clean worktree, with a real-CDP-touch harness. **No wrong-measurement and no
data-loss finding**, but **six correctness defects** — and **four of them the same shape as the D76
defect**: *the wiring exists, the tests pass, and the real input cannot reach it.*

- **F1 is the headline.** **Touch drag-to-reorder could never work**: Chromium **implicitly captures**
  the pointer to the grip, so the rows' `pointerover` never fired and the drop was a silent no-op.
  The suite was green because its drag helpers drove synthetic `pointerover` — an event real touch
  never delivers. **Fixed** by resolving the target geometrically from captured `pointermove`
  coordinates, with `elementFromPoint` injected so the logic stays pure and testable.
- **F2/F4/F8** («Adjust endpoints» dead; Chain locking at the pre-refine B; hold-to-constrain dead on
  the second contact) are **fixed**, each reproduced **before** the fix.
- **F3/F5/F6/F7/F9 remain owed** — F7 is a *measured* §4.2 drift (a dimension label **65.4 px** off
  centre at 4×; a text note's glyphs **167 px** wider than their box at 0.5×).

**Two of the eleven findings were the orchestrator's own** and are corrected: **F10** — the 1.6
closure entry recorded "47 files / 643 tests" measured on a tree that still held three **uncommitted**
off-path lane test files (the committed tree is 44/565, and the same bullet's arithmetic already
summed to 565); and an **untrue claim that C4 had been "dispatched as its own lane"**, which it had
not. The restated rule: **a recorded gate must be reproducible from the commit it names.** This
session's own gate follows it — 1.7's numbers were measured with Wave C's uncommitted files moved
aside, because including them would have repeated the error exactly.

**The Esc ladder contradicted the spec, and the spec won.** A lane reordered `escapeStep` on the
strength of a handoff brief; **UI §4.2 states the ladder** (`pending → deselect → exit Focus →
navigate`) and outranks the implementation plan. Restored, with the plan's gate wording and both
tests corrected (D78). The briefing error was the orchestrator's.

**The ink question was answered with numbers, not an opinion.** Canvas zoom is **constant**
(`mu = 10` at zoom 1 and 4) — the §4.2 tripwire is **not** tripped. Inset scale is **proportional**
(§8.5's "children scale with the inset"), so **no code changed**; pinned by a browser test.

**Machine gates (on the committed file set):** `tsc` 0 · `vitest` **636 passed / 52 files** · `build` 0
(17 precache, 788.94 KiB) · `playwright` 5 passed / 5 skipped. **Checkpoints:** none fired.

**Deferred, explicitly:** the **real-touch** regression gate (`tests/e2e/layersReorderTouch.spec.ts`)
is written and marked **`fixme`** — it stalls in e2e first-run step 2 (the OPFS stub does not satisfy
the step-2 persistence path, so `disabled={busy}` never clears and the editor is never mounted). The
failure is in the harness, **before F1's code runs**; the product is not implicated, and it is never
reported as a pass.

### 2026-09-22 — Session 13: the D77 remediation, two deferred gates, and slice 1.8 (style system)

**Five lanes for Part A + Part B, three for Part C, then integration.** Part A ran as three disjoint-file
lanes (shell / select-tool / render), so no two writers could touch one file; Part B added the C4
measurement lane; Part C added the two 1.8 lanes plus an integration lane and a bounded re-try of B1.

**The five owed findings are fixed, each reproduced by execution first** (D79): **F3** (the `Esc` ladder's
first rung now reaches the canvas through a new `EditorSession.cancelPending()`), **F5** (a real tool switch
cancels the dimension's 450 ms settle — the asymmetry with Angle *was* the bug), **F6** (sub-slop moves are
history-visible on both drag paths), **F7** (the §4.2 chokepoint re-centres anchored labels and re-fits
text boxes; **58.8 px → 0.5 px** drift at 4×), **F9** (handles scale/stretch per UI §8.6). **Two tests that
encoded a defect were corrected as spec-expectation corrections, with the arithmetic shown** — the
translate-era `axisLockDelta` rows and `layersWire`'s "a handle drag translates" (wrong by 1.5757 px).

**B1's blocker was root-caused by execution, and the session-12 story was wrong** (D81). It is not
"`disabled={busy}` never clears": a page that **loads** with an OPFS directory handle stored under
`fm:projects-root` **kills the renderer** (three probes: the write succeeds and the page survives; the
*next* load dies). So neither of the handoff's prescribed routes to the real-touch gate exists in this
harness. The spec stays `fixme` with corrected evidence, and — because only OPFS handles were testable —
**whether a real on-disk handle does the same is unverified and would make this a *product* defect**, so it
is logged as a hardware check and the product is **not** declared exonerated. A CDP-touch attempt in the
browser project reached a real touch but failed its assertion and was deleted; F1's real-touch proof stays
owed. **Positive evidence (D86):** reviewing the *running* built app, a **real** directory handle
(auto-granted by `showDirectoryPicker`) was persisted under `fm:projects-root` and the page then **reloaded
into Home normally** — no renderer death. So the crash looks **OPFS-specific**, the hardware check narrows
to *"does a user-picked folder survive a reload?"*, and the product is no longer presumed defective.

**C4's machine half is measured and recorded provisional** (D80): a 4096-px sheet with 50 annotations,
panned — median **0.6 ms** (p95 1.3) on the real `min(dpr, 2)` path, 0.7 ms at forced ratio 2 and ratio 1.
The §21.8 ≤16 ms bar is not tripped, but the **ladder decision is still the Surface Go's**. Side finding:
the browser project runs at `devicePixelRatio === 2`, so D64's "DPR-2 path inferred, not measured" is
**partially closed**.

**Slice 1.8 shipped** (D82–D83): per-tool style memory (a swap is a return, never a reset) with recents; a
style change on a selection as **exactly one** undo step restoring each object's own style; atomic
per-tool presets at `<project>/.fieldmeasure/presets.json` with a folder-unavailable state; the WYSIWYG
Style Chip and the §7.4 selection bar mounted and wired; and the project-level precision/unit-format path —
**D31 held** (the keypad's fraction chip verifiably stays entry-scoped). The copy was folded into
`strings.ts` byte-verified and the staging module deleted; the fold caught a staged bug (`project.selectionCount`
was the rendered literal `'3 selected'`, not the appendices' `{count} selected` template). Six of the six
"known interface gaps" were **closed by extending the pinned interface**, not owed — §7.3 names the Recents
row and §7.4's details "must be honored".

**The full gate caught what no lane could** (D84). Once `EditorLayout` first pulled `presets.ts` into the
browser graph, three previously-green browser suites failed to import —
`…'/src/fs/projectStore.ts' does not provide an export named 'resolveFieldMeasureDir'` — while `tsc`, the
rolldown build, node+jsdom **and a namespace probe in the same browser context** all saw the export, and
clearing Vite's caches changed nothing. Fixed behaviour-identically with a **namespace import** in
`presets.ts`. Root cause not fully isolated; the leading hypothesis (mid-run dep re-optimization because
`EditorLayout` is lazy-loaded) is a **watch item**. The lane protocol reserves the browser project, so only
the orchestrator's full gate could see it — the runbook rule earning its keep for the third time.

**Machine gates (one commit; the gate is measured on that exact file set):** `tsc` 0 · `vitest` **62 files /
790 tests** (node + jsdom + browser) · `build` 0 (17 precache, 855.24 KiB) · `playwright` **5 passed /
5 skipped**. **Checkpoints:** C4 fired (measured, provisional). One commit rather than two, because Part A/B
and 1.8 share four files (`session.ts`, `EditorLayout.tsx`, `SheetEditor.tsx`, `editorShell.test.tsx`) and
splitting them would need hunk-level surgery inside shared files — the whole-file-loss risk the runbook
warns about.
### 2026-09-22 — Session 13 follow-up: two defects the owner found by *running the app*

Session 13's gate was green and two visible defects still shipped. Both were found by the product owner
**using the built app**, not by any test — worth remembering when the remaining `[Surface]` gates are run.

1. **First-run handedness card order (D85).** The step-1 cards rendered `[Right][Left]`, so the "Right" card
   sat on the **left**. Fixed by **re-ordering the DOM**, not by a CSS flip — DOM order *is* the focus order,
   so `row-reverse` would have sent the focus ring against the visual order (WCAG 2.4.3). The card for a hand
   now sits on that hand's side; `Right` stays pre-selected. `tests/firstRun.test.tsx` gained a **DOM-order
   assertion** (jsdom has no layout, so DOM order is the honest machine-checkable form of "Left is on the
   left") and the keyboard test now expects the first `Tab` on the Left card. **UI §4.4:177 was amended** so
   the arrangement cannot be silently reverted.
2. **Home «New project» was a dead control (D87).** A real, enabled button with approved copy whose handler
   was a no-op stub — and **no create-project code existed anywhere in `src/`**, with nothing recording the
   gap. The owner chose the flow (app-named subfolder), and `createProject()` now creates `New project`,
   `New project 2`, … under the projects root, writes a schema-valid `project.json` **atomically**, and opens
   the editor's copy-approved empty state («No sheets yet — take a photo to start.»). It **never adopts** an
   existing folder, and a double-tap cannot mint two projects. **Owed:** **`«Open existing folder…»` is still
   a no-op** (the specs do not say whether it re-points the projects root or adopts an outside folder — needs
   an owner answer or a spec amendment), the create-failure path is **silent** (the toast/autosave layer,
   slice 1.10, owns error surfacing), and the button has **no busy/disabled visual** while a create is in
   flight.
3. **B1's product question is largely answered (D86).** Reviewing the running app, a **real**
   `FileSystemDirectoryHandle` was persisted under `fm:projects-root` and the page **reloaded into Home
   normally** — no renderer death. D81's crash was with an **OPFS** handle written by a probe, so it looks
   **OPFS-specific**; the product is no longer presumed defective, and the hardware check narrows to *"does a
   user-picked folder survive a reload?"*.

**Lesson (the third of its kind this session).** Every gate was green while both defects were live: the jsdom
test asserted the *pre-selected hand* but never the *order*; the e2e smoke test asserts only the heading; and
**nothing tested «New project» because nothing owned it**. **A machine gate can only see what it asserts** —
and for the second time this session, the person using the product found what the suite could not.

4. **The **Project screen** (`/p/:projectId`, the sheets grid) does not exist — and no slice owns it (D88).**
   The owner's question *"should «New project» open the camera?"* exposed it. Per UI §4.1/§11.9 the landing
   after creating or opening a project is the **Project screen**, whose **first two grid tiles are the add
   affordances** (`📷 «Take photo»` primary + `⬆ «Import»`), and §11.8:667 has capture returning *to the sheets
   grid*. Build spec **§20.5(a)** reassigned the screen to slice 1.2, but 1.2 built **Home's**
   `ProjectList.tsx` instead; the plan carries the screen under no slice; and nothing recorded the miss — the
   same *work no slice owned* class as D87, invisible to every gate. Today `New project` lands in the
   **Editor**, whose empty state borrows the Project screen's copy («No sheets yet — take a photo to start.»)
   while offering only an `Import a photo` button, and there is **no UI anywhere that lists a project's
   sheets**. Awaiting the owner's A/B/C choice (D88). Documentation only — no code changed.
### 2026-09-22 — Session 16: the union, the reconciliation, and the beta flow

The cloud branch and `main` had collided (two sessions, one working tree; two independent `D85`–`D88`
sequences, and a merge that dropped the branch's newest docs). This session closed it **forward-only** —
no rebase, no force-push:

1. **Published the union.** The cloud branch was already a real 2-parent merge of `main` (`2e7a43a`), so
   `main` fast-forwarded to it and was pushed. Its gate was reproduced on Windows first (the standing
   rule) and was green. `main` == `origin/main`; PR #2 closes as merged; the remote branch is left as-is.
2. **Reconciled the decision numbering (D100)** — docs-only: four headings moved, one external reference
   updated, and **no source or test comment touched**.
3. **Repaired the merge's silent doc loss.** `2e7a43a` had taken `CONTINUITY.md` and `BUILD-LOG.md`
   wholesale from `main`, so the branch's session-14/15 snapshot and the 1.9 entry vanished from the live
   docs while the code kept 1.9. Both are restored; `CONTINUITY_new.md` was a mojibake duplicate of
   `main`'s file (same 854 lines, same references) and was deleted.
4. **Discharged the session-14 review (D101).** F1 is a **false positive**: a `Konva.Text` cannot disable
   stroke scaling (`Text.js:639-643`), so the `strokeWidthMu` guard is unreachable for a Text and the tag
   is inert — the angle halo already rendered `4 × M` (measured 5/8/13 px at M=1/2/3, byte-identical with
   and without the prescribed tag). A pixel regression guard was kept instead of a fix; F2 was re-worded;
   a genuinely new cosmetic finding (on-screen label outlines scale with zoom) is owed to 1.10.
5. **Landed the beta flow (D102)** — the owner's D88 answer (option B): «New project» opens the camera,
   the empty state carries the spec'd «Take photo» + «Import» pair through one `onTakePhoto` seam, and
   every stubbed folder control is honestly disabled rather than dead-looking-live.

**Lesson (the third of its kind).** The merge was structurally clean and every gate was green — yet the
*live project state* had been reverted by file-level conflict resolution, and a stop-class review finding
turned out to be attribute arithmetic. **A merge is not integration, and a finding is not a defect until
it is measured.**

### 2026-09-22 — Session 17: slice 1.9 wired (export works), 1.10 themes, and two real bugs closed

Three lanes ran in parallel on disjoint files (export wiring ∥ themes ∥ the owner's bug) and were
integrated on one tree:

1. **Export is reachable.** `src/export/runExport.ts` supplies the orchestration the wizard's injected
   props always needed; the wizard is a **static** import mounted in a positioning-only slot (the engine
   stays lazy — `await import('./pdf'/'./png')`), and three entry points are live: the top-bar button,
   `Ctrl+E`, and `⋯ → Export`. Every byte goes through `projectStore.writeAtomic`; per-file failures are
   rows, never a rejection; `conflictName` is applied against the destination's real listing. The
   load-bearing pixel assertion: a 400×300 sheet at M=2 → **300 × 225 pt** (a bitmap-derived page would
   be 600 × 450). **F3 closed the hard way:** `assetProvider` decodes every referenced asset before a
   sheet renders and closes only bitmaps it decoded (D106).
2. **The owner-reported dead «New project» button (D103).** Two stacked causes: the §5.2 gesture
   re-grant (`FsaBackend.requestAccess`) had **no caller in the codebase**, and `App.handleNewProject`
   swallowed every throw — so after a reload (handle restored, **write grant lost**) the first filesystem
   call failed invisibly. `ensureRootAccess({ request: true })` now asks inside the click; the open-project
   path re-grants best-effort, so the editor's «Retry» recovers. 42/42 node tests, including a fake that
   models the reloaded state.
3. **1.10 themes (D104).** Token-level `data-theme` remaps applied by one root hook; Standard pinned
   byte-for-byte; the meaning colours are provably untouched (a theme may not re-tint the ink that carries
   the measurement). The Settings control existed and was inert — it now works.
4. **A gate blind spot found (D105).** `npm run dev` renders **completely unstyled**: the shipped CSP
   (`style-src 'self'`) blocks Vite's injected inline `<style>`, and every automated gate runs the
   **built** app, so nothing in the suite could see it. Convention recorded: judge appearance from the
   built app.

**Lesson.** The dead button needed *both* a repair and an admission: two independent faults (a dead
permission path and a swallowing caller) hid each other, so either alone would have looked like "no bug".
And a third variant of the standing rule appeared — *the gate can see only what it asserts, in the
environment it asserts it* — this time at the level of the **server**, not the assertion.

### 2026-09-22 — Session 18: the 1.10 trust layer (autosave chip, toasts, honest failures)

The app autosaves every edit but said nothing about it, and every shell failure was silent — the same
silence that produced the owner-reported dead «New project» button. This session made the app honest
about state:

1. **The autosave chip** renders `persistQueue`'s `storageStatus` (the queue remains the only writer):
   `saved` · `saving` · `pending` · `readonly` · `error (+ Retry)` · `full` · `offline`. **Nothing
   optimistic** — it renders nothing until a real `… → saved` transition resolves after mount. An absent
   writer lease now maps to `readonly` (not an error) with the queue's `onStatus` gated against
   overwriting it.
2. **Single-instance toasts** — one message and one timer live in the component, so stacking is
   structurally impossible; a new toast replaces the current one **and closes its action window** (a stale
   armed undo is the thing that matters). 8 s normally, 10 s with an action; timers cleared on replacement
   and unmount; focus is never moved, so a toast cannot fight the keypad sheet.
3. **The silence is closed (D103's owed half)** — a failed create and a failed project load now raise an
   urgent toast using the already-existing `errors.projectUnavailable`. The create path is the one the
   owner hit: it used to swallow everything and look like a dead button.
4. **The recoverable-delete policy now actually holds:** erase-delete and select-delete raise a toast with
   a **real Undo** (`history.undo()`). This also corrected a pre-existing lie — the erase toast showed
   «Undid: …» **on deletion**, claiming an undo that never happened.

**Spec divergence resolved:** §13.3 lists an object-delete toast at 8 s while §13.4 makes any
action-carrying toast 10 s. §13.4 wins — the undo window is exactly why the longer timing exists.

**Lesson.** The chip and the toasts are not decoration: they are the only reason a *failure* can be seen.
Two of this project's worst bugs (a dead control, a swallowed throw) were invisible precisely because the
app had nowhere to say anything.

### 2026-09-22 — Session 19: the export review discharged, and two more honesty bugs closed

An independent review of the export wave ran in a **pinned clean worktree** (the main tree had already moved
two commits on — isolation, not inspection) and executed every claim. This session reconciled it:

1. **Verified sound, with evidence:** the physical-size invariant (the PDF page is 300 × 225 pt at M = 1, 2
   and 3), the §4.2 pixel ratios, `assetProvider` lifetime (borrowed bitmaps survive; disk assets re-decoded
   and closed; damaged photo → white page), per-file failure rows, conflict resolution folding NTFS case
   (`RIVERSIDE.ZIP` → `Riverside (1).zip`), the **lazy-chunk failure path** (honest reject, wizard returns to
   Destination with its alert), split/naming boundaries, all three themes' invariants, the D103 permission
   fix, and write integrity (`createWritable` only in `projectStore`).
2. **D106's owed pixel proof is discharged and now permanent:** the browser suite asserts that an inset
   exports its **photo** — `[254,0,0,255]` for a red asset, `[58,63,70,255]` (`#3A3F46`) for the missing-
   asset control.
3. **Four real gaps fixed (F1–F4):** a dead «Include sheet names» control (now honestly **disabled**; captions
   need a UI-spec placement decision); a revoked grant at the tmp-handle stage escaping as a raw
   `NotAllowedError` and reported as `unknown` (`writeAtomic` now creates the tmp handle inside its `try`, so
   it classifies as `permission`); an emptied-mid-flight scope writing an **empty archive as a success row**;
   and a skipped conflict reporting nothing (now a row + progress, with the count excluding skips).
4. **Two more honesty bugs, found outside the review:** the **torch toggle** showed a lit button over an unlit
   LED when the hardware refused the constraint (D108), and every **Home card** advertised «12 sheets ·
   48 MB · 2:14 PM» because the appendix's *example* was shipped where its *template* belongs (D110).

**Lesson (fourth of its kind).** Every fix in this session is an instance of the same defect class: *the
control, the comment or the card said something the system did not do*. The gates were green throughout —
because a gate can only see what it asserts, in the environment it asserts it, about the code it imports.

### 2026-09-22 — Session 20: the Project screen (the sheets grid), and the update strategy

Two slices in one wave — the screen that makes storage visible, and the release layer that keeps a
field device current:

1. **The Project screen is built (D111).** `Home → sheets grid → editor`: the two add tiles first in
   every state («Take photo» primary, «Import»), per-sheet cards with real thumbnails, index, inset badge
   and mono meta, and per-card selection driving a selection bar. The grid's loader is **read-only**
   (`src/fs/projectSheets.ts`): `project.json` → live sheets in `sortIndex` order → markup counts +
   `thumb.jpg`, tolerant exactly where tolerance is honest (a missing thumbnail is a placeholder, an orphan
   entry reads as empty, genuine corruption surfaces as the honest `error` state).
2. **A capture returns to the grid (UI §11.8).** The capture overlay moved to the shell root and is now
   driven by where it was launched: from the grid it returns to the grid with the approved
   «Added {sheetName}» toast; from the editor it opens the sheet it wrote. «New project» keeps the owner's
   D102 camera-first flow and now lands its result on the grid.
3. **Slice 1.11 (D112).** `registerType: 'prompt'` was already set — verified, not changed. What was
   missing was around it: a prompt that **suppresses itself while the queue is in flight, while a placement
   op is pending, or while the keypad is open**, and a reload that is **flush-first** — `flush → waitSettled
   → activate` — where a **parked** autosave failure counts as a rejection, so a reload can never discard an
   edit that did not reach disk. The build id is injected at build time and shown in Settings → About.
4. **The D51 registry regression, caught at integration.** The open-project registry is keyed by the full
   `${id}:${folderName}` runtime key; registering the bare id left every resolver throwing *"project … is not
   open in this tab"*, so the grid reported **every** project as an error. The App-level test (updated for the
   new landing) is what caught it, and its `empty` assertion now pins the registry contract.

**Lesson.** The grid's whole purpose is to show what is on disk, and it took the *wiring* test — not the
screen's own 29 tests — to prove the screen could read the disk at all. Again: a unit can be right while the
system is wrong, and only the integration path sees it.

### 2026-09-22 — Session 21: sheet trash (delete → `.trash/`, prune, restore) and an honest delete

The trash slice is the one that makes deleting a bad photo possible **without** losing a measurement record:

1. **Storage (`src/fs/sheetTrash.ts`).** `deletedAt` on the `project.json` row is the single ledger (the
   schema already carried it; the scan, intake and grid loader already skip such rows). The move is
   **copy → verify → only then remove**, because FSA has no directory `move()`: a per-file size check
   catches a partial or zero-byte write, and a failed copy leaves the original untouched. The prune is
   **strictly older than 14 days** and removes the `.trash/<id>/` folder *before* rewriting `project.json`,
   so an entry is either fully pruned or untouched — never listed with its files gone.
2. **The UI (`src/ui/TrashPanel.tsx` + the grid's card menu).** Delete is two deliberate taps; the panel
   lists trashed sheets with name, deleted date and **days left**, a read-only preview and «Restore». An
   unreadable trash renders as an empty trash, never a broken grid.
3. **The delete toast became honest at integration.** The lane emitted «Sheet deleted · Undo»
   **optimistically** — before the shell's write resolved. That is the same defect class this session has
   fixed repeatedly: the UI claiming something the system had not done. The screen now **awaits the result**:
   success → the approved toast with a real 10 s Undo; failure → an urgent failure line with **no undo
   offered** for a deletion that did not happen. Three tests pin it, including *no toast while the write is
   in flight*.
4. **The grid's Export now completes the hand-off.** Its selection travels to the editor, where the wizard
   opens **already scoped** to those sheets (it derives `'selected'` from `selectedSheetIds`, UI §12:712),
   instead of dropping the user into an unscoped editor. This closes `D111`'s last owed item.
5. **A drift hazard removed before it bit:** both lanes declared a `TrashedSheet` model; the storage
   module's is now canonical and the panel re-exports it (the D94 lesson, applied pre-emptively).

**Lesson.** Six of this session's fixes were one defect: *the interface said something the system had not
done yet* — a dead button, a lying card meta, an inert tag, an empty archive reported as success, a torch
that lit nothing, and a delete announced before it happened. Gates cannot catch this class, because the
assertion and the lie usually agree; only asking "what would this say if the underlying call failed?" does.

### 2026-09-22 — Session 22: the sheets grid's remaining items (D111), and the `sortIndex` defect they exposed

Three lanes on disjoint files, integrated by the orchestrator, then the full gate on one tree.

1. **Storage (`src/fs/sheetOps.ts`).** `nextSortIndex` (`max(live) + 10`), `reorderSheetRows` (pure; requires
   an exact permutation of the live ids, so a stale screen cannot scramble a file), `renameSheet` (title
   only), `duplicateSheet` (folder copy through the now-exported `copySheetTree`, then the row), and
   `replaceSheetPhoto` (the §11.2:720 constrained replace). Same idiom as `sheetTrash`: copy → verify → only
   then mutate the ledger, `writeAtomic`/`writeJsonAtomic` only, the D51 full runtime key on every call.
2. **The grid (`ProjectScreen.tsx`, `projectScreen.css`, `sheetReorder.ts`).** The card menu
   (`Open · Rename · Duplicate · Replace photo · Delete`), each item live only when the shell injects its
   callback; inline rename; the 400 ms long-press drag with live renumber and a pointer-following
   «Drop to move» chip; the warned replace dialog with a 600 ms hold on `Remove markup`; and a keyboard
   `Move earlier`/`Move later` pair, added because a drag is unreachable by keyboard (WCAG 2.1.1) and because
   it is the only machine-testable reorder path.
3. **The storage chip (`projectSize.ts` + `StorageChip.tsx`).** §11.4's pill from real disk facts: a
   recursive byte walk of the project folder and `project.json`'s `lastModified`. Nothing is rendered while
   measuring, on failure, or without a real save time — the approved template needs both tokens, and a blank
   time would be a claim the system never made.
4. **The defect the wave exposed (D116).** `addSheetFromPhoto` wrote `sortIndex: sheets.length` — a gap-of-1,
   0-based index against §20.6's gaps of 10. Invisible until a reorder existed: after renumbering live rows
   to 10/20/30, a newly appended sheet would sort **before every existing sheet**. Fixed with
   `nextSortIndex`, and both `sheetIntake` pins corrected with the arithmetic. The **shared fixture**
   (`validProjectFile`) carried the same contradiction, which is why the lane brief's own arithmetic did not
   hold against it — corrected to `10 × (i + 1)`, and `cameraFlow.test.tsx` followed.
5. **The replace was reordered with a rollback (D117).** The first version removed the stale thumbnail last
   and swallowed every failure, so a locked `thumb.jpg` left the card showing the **old** photo under a sheet
   holding the new one, and a locked `project.json` left the new photo under the **old** dimensions — a
   wrong-measurement state. Now: read the bytes being overwritten → drop the thumbnail **first** (its failure
   aborts) → write + verify the photo → the row → clear the markup **last**; any failure restores the photo.
6. **Not built, on purpose:** the selection bar's batch `Duplicate`/`Delete` (UI §11.2:717) — the spec pins
   the buttons but no batch-delete/undo semantics and no copy, and an undo that restored only the last sheet
   would be this session's recurring lie. Owed, not invented.

**Machine gates (this commit's tree):** 4/4 passing — `tsc` 0 · `vitest` **91 files / 1293 tests** · `build` 0
(26 precache, 1516.68 KiB) · `playwright` 5 passed / 5 skipped.

**Reviews (same session, against the wave's commit).** Two ran: an **executed correctness register**
(`@oracle`, clean worktree pinned to `249754e`, per `docs/review-brief.md`) which reproduced the gate itself
and found **no wrong-measurement and no data-loss defect**, and an **independent UI/UX review** that measured
the screen in the repo's own Chromium because jsdom cannot see layout (D40). Their registers are **D118**. The
fixes: the card menu's direction + `max-height` backstop (it rendered 102 px of its 364 px at the bottom row,
so «Delete» was the least reachable item), the §13.3:808 progress track on the destructive control, `Cancel` as
initial focus + focus return, the `⋯` trigger's 92 % `--g900` and its slop overlap, the rename field's 8 px gap,
the chip's viewport clamp, §11.2:722's honest refusal for mutations on a project that cannot take them,
**F1** (`{ markupCleared }` so the shell stops denying a swap that succeeded), **F4**
(`defaultSheetTitle` counts every row, so a trashed title cannot be minted twice), and **F2** — the wiring
seam, now tested end to end by `tests/gridActions.test.tsx` (Home → grid → rename / reorder / duplicate /
replace, against the fake disk), which is the same route-level shape that caught the previous wave's worst bug.

**Owed after the reviews:** the real end-to-end run on hardware; drag **autoscroll** (a 20-sheet grid is
~1248 px at 1440 and 2452 px at 960 against 894/1374 px of visible body — a second lift is needed today); the
**inert scroll container** (the document scrolls and the 66 px top bar leaves the screen; the fix is coupled to
the menu's clipping); the **editor's replace dialog** (still 56 px with no progress and focus on «Keep markup»);
`aria-pressed` on the hold; the paused 1.10 polish; D113's restore-side undo toast (copy); and the
content-owner items.

7. **Owner-reported from a real run, and fixed the same session (D119).** *"When I take a photo and hit use photo
   it gets stuck at 'save as a copy…' 'retry' button."* Two defects wore one screen: the failure overlay was a
   **blank** `role="alert"` (no line said what had failed), and **«Retry» re-ran the identical failing path** —
   a project folder that never resolved left `projectRef.current === null` forever, so every attempt threw
   `'project is not open'`, and a lost write grant could not be re-asked for because nothing called
   `ensureRootAccess({ request: true })` inside the gesture. Now: the overlay names the cause (kind-mapped to the
   approved `errors.*` lines, plus one marked proposal `capture.saveFailed`), the primary action matches the
   cause («Re-authorize» for permission), `commit` asks for the grant at the top of the gesture (D103's fix,
   applied here), and `resolveProject()` is re-run so «Retry» is a genuine second attempt — pinned by a test
   that cannot pass against the pre-fix code.

8. **Owner-reported, second round, same session (D120).** *"It still gets stuck on adding… after clicking use
   photo"* — «Adding…» is the **saving** overlay, so the promise never settles: a HANG, which the honest-failure
   fix structurally cannot see (a pending promise never reaches the `catch`). Three fixes: the **primary** path
   no longer awaits the write grant (an unanswered `requestPermission` was hanging the save — only the recovery
   that reads «Re-authorize» asks now); a **30 s bounded wait** stops the app claiming progress and says «The
   folder isn't responding»; and the saving label **names the stage** («Adding…» = image work, «Saving…» = the
   folder write — both approved lines). Plus **one save in flight at a time**, so a retry cannot queue a second
   write behind a stuck one and land two sheets. **A stuck Web Lock is the leading cause** (their earlier failed
   attempts; `navigator.locks.request` has no timeout), which is why a **page reload is the first thing to try**
   — locks die with the page. A lock-acquisition timeout inside `projectStore` is the deeper fix, recorded in
   D120 and not done here.

9. **Root-caused the same session (D121), by execution: the hang was a Web Lock name collision.** §5.8d has a
   tab hold **`fm:project:<id>` exclusively for the whole editor session**; §5.3 had **every atomic write** ask
   for the **same name** (`writeAtomic` *and* `cleanStaleTmp`). Web Locks are not reentrant, so while a sheet was
   open **every write for that project queued forever** — no rejection, nothing to report. Hence: a capture from
   a **sheet** hangs on «Adding…» (the camera mounts over the still-mounted editor), the editor's own
   autosave/markup/thumbnail hang with it, and a capture from the **grid** does not — which is why the first
   report was a *failure* and the second a silent *hang*. **Fixed**: `writeLockName(projectId)` =
   `fm:project:<id>:write` for the per-write mutex and the tmp reaper; the lease keeps its name, so §5.8d's
   arbitration is unchanged. Spec §5.3/§5.4/§5.8d, the plan's S1 requirement and **six test assertions that
   pinned the colliding name** are amended with the evidence. **The proof it was invisible:** the new
   `tests/writerLease.browser.test.ts` (real Chromium + real Web Locks + real OPFS, no mocks) showed the write
   **timing out** under a held lease before the fix, and `navigator.locks.query()` naming the genuinely-held
   lease — while six browser suites **mock `acquireWriterLease` away**, so no test had ever held the real lock
   while writing. Also executed: Chromium **grants** a same-client `ifAvailable` re-request, so §5.8d's exclusion
   is **cross-tab** (recorded; the fake had taught the opposite). Written up for the next session in
   **`docs/handoff-capture-save.md`**.

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

## Known drift / watch items (session 12)

- **The remaining independent-review findings (D77) are the next action after 1.7** — F3, F5, F6, F7,
  F9, each with its file anchors and executed evidence in the register. F7 is the only **measured**
  rendering defect (65.4 px label drift at 4×; 167 px text overflow at 0.5×).
- **The real-touch regression gate is deferred, not passed.** `tests/e2e/layersReorderTouch.spec.ts`
  is `fixme` because the e2e **first-run bootstrap** cannot complete step 2 against the OPFS stub. Fix
  the bootstrap — do **not** delete the spec, and do not report F1's real-input half as proven until it
  runs. Precedent: D53's deferred CDP harness.
- **The camera has no in-app inset path (owed).** `onPickCamera` uses a hidden
  `capture="environment"` input (a real OS camera), not UI §9:614's in-app viewfinder, because
  `CameraFlow` cannot return a normalized blob without widening its frozen props. Needs either a
  `CameraFlow` inset mode or a spec amendment.
- **The inset decode-error state is unreachable.** `inset.openError` / `chooseAnother` / `removePhoto`
  exist in the appendix but nothing surfaces them; a corrupt asset leaves the placeholder. Owed.
- **Second-tap-to-Focus is wired but not independently tested** (the HUD `Focus` and Enter-while-
  selected paths are). A second-tap test needs a drawn layer before hit-testing — `getIntersection`
  reads a stale hit canvas when the stage transform changes without a layer draw. Not a product bug.
- **Still open from earlier sessions:** object **groups** (no model anywhere — Group/Ungroup disabled);
  the synthetic **photo row's lock cannot persist**; the **mini-toolbar** uses the `.placement-hud` slot
  because a computed anchor needs an inline `style` the CSP forbids; **rename is a deliberate no-op**;
  the `⚠ PROPOSED (C14)` copy set still needs a content owner; the 14 tool glyphs are still
  **placeholders**; C4's machine half is **owed** (its obstacle is gone, it is not dispatched).
- **Wave C's style-panel files are on disk and untracked**, deliberately, for slice 1.8's own wave.
  They are green; they are simply not part of the 1.7 commit — and because they are present,
  `npx vitest run` on the working tree reports a **larger** count than the commit's gate. Do not
  record the working-tree number as a commit's gate (D77/F10).
- **Process:** four of the six correctness findings had one shape — *wiring that exists, tests that
  pass, and a real input that cannot reach it.* When a test drives an input, ask what the real input
  does that the synthetic one does not; when behaviour depends on browser input semantics, only the
  browser project or Playwright/CDP is honest proof.

## Known drift / watch items (session 13)

- **The Project screen (`/p/:projectId`, the sheets grid) is unbuilt and unowned (D88).** Build spec §20.5(a)
  assigns it to slice 1.2; the plan carries it nowhere; slice 1.2 built **Home's** `ProjectList.tsx` instead and
  nothing recorded the miss. UI §11.9 defines it — including that its **first two grid tiles must be
  `📷 Take photo` + `⬆ Import`** ("the 'add' affordance must be the easiest thing on the screen"). Consequence
  today: `Home → «New project»` lands in the **Editor**, whose empty state shows the Project screen's copy with
  only an `Import a photo` button; the sole camera route is the editor's `Add sheet` menu item (a stand-in).
  **Blocks nothing, but schedule it before 1.10's end-to-end a11y audit**, which would otherwise cover neither
  the screen nor its two add tiles and then have to be repeated. The owner still has to choose A / B / C (D88).
- **`«Open existing folder…»` (Home) is still a no-op** (D87) — a real, enabled, approved-copy button with a
  stubbed handler. The specs say it opens `showDirectoryPicker` but never whether that **re-points the projects
  root** (hiding projects) or **adopts a folder from outside it**. Needs an owner answer or a spec amendment
  (handoff §9.2 row 18).
- **A failed project create is silent** — `App.tsx`'s `handleNewProject` swallows and stays on Home, because
  this slice has no error-surface copy; slice **1.10**'s toast/autosave layer owns it (`createProject()` itself
  never swallows: no root, name exhaustion and write failure all throw). The `New project` button also has **no
  busy/disabled visual** while a create is in flight (D87).

## Known drift / watch items (session 16)

- **The unbuilt folder controls are disabled, not built (D102).** «Open existing folder…» (the Home card
  *and* its empty-state variant) and a moved card's «Locate…» are inert by decision. handoff-13 §9.2 row
  18's question — does the picker **re-point the projects root**, or **adopt a folder from outside it**? —
  still needs an owner answer before they can be built honestly.
- **On-screen label outlines scale with canvas zoom (D101, cosmetic).** The dimension/angle label halo and
  the `--sel` hairline are multiplied by the canvas zoom instead of staying a constant `mu` CSS px, because
  a `Konva.Text` cannot disable stroke scaling. **Not** a wrong measurement (the glyph fill is correctly
  counter-scaled, and the export path is correct). The fix — `strokeWidth = mu / scale` for a tagged `Text`
  in `applyScreenRules` — belongs with the 1.10 polish/a11y pass.
- **`runExport.ts` is the only thing between the app and a usable export.** Every export claim is still
  module-level: no PDF or PNG has ever been written by the app.
- **C6 is not fired.** `EXPORT_BITMAP_LIMIT_BYTES` is a dev-machine figure (D96); H21 on a Surface Go is
  what sets it.
- **`[Surface]` gates pending, never faked:** H8, H12, H19–H22 (1.9) plus the earlier rows.

## Known drift / watch items (session 17)

- **`npm run dev` is unstyled by design (D105).** Manual inspection uses the built app
  (`npm run build && npm run preview`); a dev-only `style-src` relaxation is deliberately not done yet.
- **On-screen label outlines scale with canvas zoom (D101, cosmetic)** — the fix (`strokeWidth = mu / scale`
  for a tagged `Text`) belongs with the 1.10 polish/a11y pass.
- **Export owes (D106):** pixel-level proof that an inset exports its **photo** (not the grey placeholder);
  measured size factors instead of `2 B/px` / `0.5 B/px`; persisting the remembered destination; the
  240-char path cap (needs approved copy); exercising the 250 MB split branch; a populated
  `disk-full` shortfall; and `retryFile`'s happy path.
- **Sunlight is computed, not seen (D104):** the porch check is `[Surface]`; the §14.2 64 px target floor
  and 2.5 px icon strokes are component-level work, and the canvas HUDs still use hardcoded `rgba()`
  surfaces that do not re-theme.
- **`[Surface]` gates pending, never faked:** H8, H12, H19–H22 (1.9) plus the earlier rows.

## Known drift / watch items (session 18)

- **The History flyout is NOT built (D107).** Plan item 1 includes "tap → History flyout" with whole-sheet
  snapshot restore; `writeHistorySnapshot` still has **no caller**. The chip ships without its flyout.
- **The browser-only undo round-trip is unproven.** jsdom proves the wiring and the callback dispatch; a
  toast's Undo reaching a real `history.undo()` through a Konva-backed tool was reasoned, not executed.
- **The chip's timestamp is chip-local** (the queue exposes no last-saved time), so a project opened with
  no edits shows no chip until the first write resolves — deliberate, but worth knowing when judging UI.
- **`.trash/` + prune + restore is unstarted**, and its **restore UI wants the unbuilt Project screen**
  (D88/D102) — the prune half is buildable on its own; the restore half may not be.
- Carried: D101 (on-screen label halo scales with zoom), D104 (Sunlight component-level items), D105
  (dev-mode is unstyled by CSP design), D106 (export owed list), and the `[Surface]` rows H8/H12/H19–H22.

## Known drift / watch items (session 19)

- **«Include sheet names in pages» is disabled, not built (F1).** Captions need a placement decision (a
  full-bleed sheet image leaves nowhere obvious for a caption) — a UI-spec/content-owner question.
- **Two ⚠ PROPOSED copy rows await sign-off:** the `Skip` result word and its neutral glyph (gap §17 keys
  only ✓ / … / ✕).
- **`estimate` undercounts files when the 250 MB PDF split fires** (F6) — it reports one file for a PDF that
  may become `part-01.pdf`… Recorded; computing parts would need a render.
- **One non-reproducible full-suite failure** (7 files / 35 tests) was seen once by the reviewer and never
  again, including per-project runs. Trap-5's mid-run iframe reload is the prime suspect. Flaky-until-explained.
- **The History flyout is still not built (D107)** and `writeHistorySnapshot` still has no caller.
- **The owner's Home was pointed at the source repo** — Settings → Storage → «Change folder» fixes it; no code
  defect, but a clean Home needs that one click.
- Carried: D101 (label halo scales with zoom), D104 (Sunlight component-level items), D105 (dev-mode unstyled
  by CSP design), and the `[Surface]` rows H8/H12/H19–H22.

## Known drift / watch items (session 20)

- **The Project screen's owed items (D111)** — all spec'd, all absent, all rendered honestly: sheet
  reorder (drag + `sortIndex`), rename, duplicate, replace photo, delete → `.trash/`, grid-scoped export,
  returning to the grid after a grid-launched import, and the §11.4 storage chip in the grid top bar.
- **The paused 1.10 polish** — the History flyout (`writeHistorySnapshot` has no caller), the end-to-end
  a11y audit, the arrow nudge, and D101's label-halo screen fix.
- **Content-owner items:** the PDF «Include sheet names» caption placement (F1, control currently disabled)
  and sign-off on the two `Skip`-row strings (F4).
- **`[Surface]` and never faked:** the real service-worker update lifecycle (D112), H8/H12/H19–H22, the
  Sunlight porch check, the real touch reorder.
- **Coverage note (D112):** the `SheetEditor` queue→busy bridge runs only in the browser project, so it is
  verified by read plus the pure ordering test, not by execution.
- Carried: D105 (dev-mode is unstyled by CSP design — judge appearance from the built app), D106 (export
  owed list), D107 (chip/toast items).

## Known drift / watch items (session 21)

- **D113 owed:** the spec's restore-side undo toast («restored · undo») needs approved copy; and the trash
  panel's two-pane layout, card-`⋯` placement and real focus/hit-slop behaviour are manual/CSS checks
  (jsdom has no layout engine).
- **The Project screen's remaining items (D111):** sheet reorder (drag + `sortIndex`), rename, duplicate,
  replace photo, and the §11.4 storage chip in the grid top bar.
- **The paused 1.10 polish:** the History flyout (`writeHistorySnapshot` has no caller), the end-to-end a11y
  audit, the arrow nudge, and D101's label-halo screen fix.
- **Content-owner items:** the PDF caption placement (F1, control disabled) and the two `Skip`-row strings (F4).
- **`[Surface]` and never faked:** the service-worker update lifecycle (D112), the 14-day trash clock on real
  hardware, real `move()`/NTFS behaviour, H8/H12/H19–H22, the Sunlight porch check, the real touch reorder.
- Carried: D105 (dev-mode is unstyled by CSP design — judge appearance from the built app), D106 (export owed),
  D107 (chip/toast items).

## Known drift / watch items (session 22)

- **The grid wave's independent review is owed.** This wave rewrote `project.json` (reorder/rename/duplicate/
  replace) and the shell seam — the two places this project's real bugs have lived. Run
  `docs/review-brief.md` against the commit, executed, the way D114 was.
- **Not built, deliberately (D115):** the selection bar's batch `Duplicate` / `Delete` (UI §11.2:717).
  The spec pins the buttons but neither batch-delete/undo semantics nor any copy, and an undo that restored
  only the last sheet would be the lie this project keeps fixing.
- **`CameraFlow`'s `onCaptured` field named `index` carries `sortIndex`** (D116). No consumer reads it
  (the shell uses `id`/`title`); it is pinned at its true value rather than renamed inside a frozen interface
  mid-wave.
- **`⚠ PROPOSED` copy awaiting the content owner:** `sheetMenu.rename`, the six `…Named` accessible names,
  `sheetMenu.renameLabel`, `Move earlier` / `Move later`, and the four failure lines
  (`renameFailed`, `duplicateFailed`, `replaceFailed`, `reorderFailed`). `storage.local` and
  `project.reorderChip` are approved appendix rows (261 and 63).
- **`[Surface]` and manual, never faked:** the real touch drag (Chromium's implicit pointer capture, and
  whether it honours a `touch-action` set *after* `pointerdown`); the «Drop to move» chip's real follow
  (`element.animate` is absent in jsdom, so only its presence is asserted); a real replace against `move()`,
  NTFS and an AV/Dropbox lock; the chip's numbers against Explorer; the grid's responsive columns and the
  now-7-item card menu's popup height.
- **The chip renders nothing until a real save exists** — `{time}` is `project.json`'s `lastModified`, and the
  approved template needs both tokens, so a project with no `project.json` save shows no chip at all.
  Deliberate (D115), not a bug to "fix" with `Date.now()`.
- **The four review items this session did NOT fix (D118).** (a) Drag **autoscroll**: measured, 16 items give
  1248 px of grid at 1440 and 2452 px at 960 against 894/1374 px of visible body, and `dropIndexFor` resolves
  only against the current screen's rects, so a card cannot be dragged more than a screenful without a second
  lift. (b) The **inert scroll container**: `.project-body`'s `scrollHeight === clientHeight`, so the document
  scrolls instead and the 66 px top bar leaves the screen (`window.scrollY = 418`, bar at y = −418 at 1440×960)
  — pre-existing (`22477bd`), and its fix is **coupled** to the menu's clipping, which is why it was not
  half-done here. (c) The **editor's replace dialog** still has the old treatment (56 px, no progress, initial
  focus on «Keep markup») where the grid's now follows UI §13.3:808 — the two differ until the next pass.
  (d) `aria-pressed` on the hold is a toggle semantic on a non-toggle (shared with the editor).
- **`⚠ PROPOSED` copy the reviews added:** `sheetMenu.markupNotRemoved` («Couldn't remove the markup») — the F1
  line, beyond both appendices. With the earlier `sheetMenu.*` additions that is **eleven** proposed rows
  awaiting the content owner.
- **The register's F6 is recorded, not fixed:** if a keyboard move is in flight when the next one commits and
  the first then rejects, the revert can lag the disk by one step — self-healing on the next refresh, and each
  move closes the menu, so the window is tiny.
- **The capture dead end's ROOT CAUSE is still unknown (D119).** The owner hit it; the fix makes the screen
  name the failure in one line, and the four mapped causes have four different remedies (re-grant the folder,
  wait out a locked file, free space, or a browser that cannot do the atomic write at all). **Record that line
  from the next real run** — it is what says whether this fix is complete, or whether a fifth cause needs its
  own guard (the `unknown` arm covers `FileSystemFileHandle.move()` being absent, which would mean no atomic
  write is possible in that build).
- **The capture hang is ROOT-CAUSED and FIXED (D121): a Web Lock name collision** — the session writer lease and
  the per-write mutex both asked for `fm:project:<id>`, so every write for an open project queued forever. Pinned
  by `tests/writerLease.browser.test.ts` (real locks, no mocks) and written up in `docs/handoff-capture-save.md`.
  **Still owed in this area:** `writeAtomic` has **no lock-acquisition timeout** (anything that ever holds the
  mutex for long would hang writes the same silent way); the owner's **original failure** (a *rejection*, D119)
  has no captured message line yet; and the two-tab check on hardware.
- **`⚠ PROPOSED` copy is now thirteen rows:** `capture.folderNotResponding` joined the twelve.
- **`⚠ PROPOSED` copy is now twelve rows:** `capture.saveFailed` joined the eleven `sheetMenu.*`/review lines.
- Carried: D105 (judge appearance from the built app, never `npm run dev`), D106 (the export owed list),
  D107 (chip/toast items), D101 (the on-screen label halo), the **History flyout** (`writeHistorySnapshot`
  still has no caller), the end-to-end **a11y audit**, the **arrow nudge**, and the content-owner items
  (the PDF caption placement and the two `Skip`-row strings).

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
