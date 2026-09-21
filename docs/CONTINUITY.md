# Project Continuity Log

**Purpose:** a single place that records where this project stands, so any session (human or AI) can
resume without re-deriving context. **Update this file at the end of each work session.**

**Last updated:** 2026-09-21 (session 2)

---

## Current snapshot

| Field | Value |
|---|---|
| Phase | Pre-flight + planning complete → slice 0.1 (scaffold) |
| Application code | None yet (repo has docs + installed deps only) |
| Build spec | **v0.3 hardened (r2)** — `docs/preflight-handoff-v0.3-hardened.md` (canonical) |
| UI spec | **v2 hardened** — `docs/ui-spec-field-measure-v2-hardened.md` (canonical, changelog appendix) |
| Adversarial review | ✅ Round 1 folded into v0.3 / v2 · ✅ **Round 2 complete** (execution-verified; findings folded + committed) |
| Implementation plan | ✅ `docs/implementation-plan.md` — slice order, gates, checkpoints |
| Dependencies | Installed and pinned (Node 24 LTS, npm 11, `fflate` included; React 19.3 reconciled) |
| Blocking item | None. Next work is the slice 0.1 scaffold. |
| Next action | Slice 0.1 scaffold per `docs/implementation-plan.md` |

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

---

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
- ✅ Dependencies installed and verified resolvable (`fflate` pinned; React 19.3 reconciled).
- ✅ Repo documentation scaffolding (README, INDEX, CONTINUITY, DECISIONS, UNITS) updated for all of the above.

## In progress

- ⏳ Slice 0.1 scaffold (Vite config, `tsconfig`, `"type": "module"`, npm scripts, `public/icons/`,
  CSP, `THIRD-PARTY-NOTICES.md`, CI workflow).

## Next (in order)

1. Slice 0.1 scaffold → installable, offline PWA shell (gate: airplane-mode reload works; CI green).
2. Slice 0.2 input spike (pen/touch routing + device caps report) — the highest-risk area; do it
   before any UI (gate: palm gauntlet with a >1.2 s stroke).
3. Slice 0.3 first-run / settings / Home shell.
4. Slices 1.1 → 1.10 in order, then the 2.0 field pilot — **follow
   `docs/implementation-plan.md`** for gates and checkpoint tables.

---

## Open questions (need a human answer)

Product/scope questions survive the review; several scope items were resolved by the build spec §2.4.
Still needs a human decision:

1. **Metric** — needed at launch, or is feet-inches enough? (Affects the keypad's fraction chips.)
2. **Job-site address** — add a typed address field to project/sheet meta for reports?
3. **Sheet templates** — needed at launch, or is the preset system enough?

> Calibration and vector-overlay PDF were resolved by the review (see build spec §2.4 for the
> definitive v1 in/deferred/cut list).

## Known drift / watch items

- `package.json` is still npm-init defaults (`"type": "commonjs"`, placeholder test script) — fix in
  slice 0.1.
- **`lucide-react` 1.x** — chrome icons only; the 14 tool glyphs are bespoke SVG (per UI spec). Verify
  the icon-name API at first use.
- Transitive `glob@11.1.0` deprecation warning from the PWA toolchain — not a vulnerability
  (`npm audit` is clean).
- `THIRD-PARTY-NOTICES.md` is required by the build spec and not yet created.

## How to resume

1. Read this file.
2. Read `docs/preflight-handoff-v0.3-hardened.md` — start with **§2.4 (v1 scope table)**, then §13
   (build slices).
3. Read `docs/ui-spec-field-measure-v2-hardened.md` for UI detail.
4. Check `docs/DECISIONS.md` before making a technical choice.
5. Follow the build slices in order.
