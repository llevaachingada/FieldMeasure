# Handoff — Implementation-Plan Flush-Out & Verification Brief

> **Audience:** the next AI session (or builder) whose job is to (1) **verify** the implementation
> plan against the canonical specs — no issues, no incorrect architecture, no conflicts — and then
> (2) **flush out** the plan into fully detailed, per-slice build instructions a lower-level builder
> can execute with zero guessing.
> **Written:** 2026-09-21, end of session 2. **Read this file first, in full, before touching anything.**

---

## 1. Objective and bar

Two jobs, in this order:

1. **Verify (adversarially).** Attack the plan + specs for: contradictions between the four
   canonical docs, unbuildable steps, wrong architecture, data-loss paths, wrong-measurement paths,
   missing slices/dependencies, gates that don't actually check what they claim. Fix findings in the
   docs before fleshing out.
2. **Flush out.** Expand `docs/implementation-plan.md` from its current state (slice order, task
   lists, gates) into a complete per-slice build packet: exact files with signatures, step-by-step
   build order inside each slice, the test tables inline, and the acceptance gates restated as
   checklists. The bar: a lower-level AI builder can execute any single slice with **zero guessing**
   and knows exactly when it's done.

**The failure modes you are defending against** (in priority order):
- a builder builds the wrong thing (doc conflict or underspecified step),
- a builder gets stuck (a slice references something not yet built, or an API that doesn't exist),
- a builder ships a data-loss bug (storage), —
- a builder produces a wrong measurement (units/keypad/scaling/labeling).

## 2. Repository state (as of commit `27b1b6b`, pushed to `main`)

- **No application code exists.** The repo is: docs + installed/pinned dependencies
  (`package.json`, committed lockfile) + git scaffolding. `package.json` is still npm-init defaults —
  fixing it is literally the first task of slice 0.1.
- Two adversarial review rounds are complete and folded in. **Round 2 executed the spec's reference
  code in a JS runtime** and found real bugs even after round 1 — including a wrong committed test
  expectation (`12 6` asserted as 148 in; correct is 150 in) and a fraction-dropping compose bug.
  **Lesson that applies to you:** do not trust any reference code in the docs because "it survived
  review" — execute or hand-trace anything you copy or expand. Anything you add must meet the same bar.

## 3. Reading order (authorities are fixed — do not restructure them)

| # | Doc | Authority over |
|---|---|---|
| 1 | `docs/CONTINUITY.md` | live state, where things stand |
| 2 | **This file** | your job and constraints |
| 3 | `docs/preflight-handoff-v0.3-hardened.md` | **what to build.** §2.4 v1 scope table is the single authority on what ships in v1; §13 defines the slices |
| 4 | `docs/implementation-plan.md` | **order, gates, done-ness.** You are flushing this out |
| 5 | `docs/ui-spec-field-measure-v2-hardened.md` | look & feel, interaction detail. Inline `〔v1 scope: …〕` markers defer to the build spec §2.4 |
| 6 | `docs/DECISIONS.md` | why things are the way they are (D1–D20 + review corrections) |
| 7 | `docs/UNITS.md` | input formats, keypad model, precision rules |

**Conflict rule:** build spec §2.4 > build spec > UI spec > plan (order). If you find a genuine
conflict, fix the subordinate doc, and record the conflict + resolution in `docs/DECISIONS.md`.

## 4. Verified facts — do NOT re-research, do NOT contradict

These were verified against live sources (npm registry, Chromium commits/WPT, Konva docs,
perfect-freehand's own source) during rounds 1–2. If your verification contradicts one, you are
probably wrong — re-check before "fixing" it:

1. **`FileSystemFileHandle.move(name)`** exists in Chromium; same-directory rename over an existing
   target works (POSIX semantics restored in M109). **`FileSystemDirectoryHandle.move()` does not
   exist** — spec §5.6 forbids it; in-app rename rewrites `project.title` only.
2. **perfect-freehand 1.2.3 exports only** `getStroke`/`getStrokePoints`/`getStrokeOutlinePoints`.
   `getSvgPathFromStroke` is a **local helper** (spec §8.5 provides it, MIT from steveruizok's recipe).
3. **Konva `strokeScaleEnabled:false`** keeps stroke width constant in output px; **fills and
   `Konva.Text` scale with the stage**. This is the basis of spec §4.2's opposite-treatment rules
   (screen: text `fontSize = mu / s`, ink `getStroke size = mu / s`; export: strokes `mu × M`,
   text `fontSize = mu`, ink `size = mu`). The invariant: physical stroke/font = `0.75 × mu` pt at
   every multiplier M.
4. **Pinned versions (npm, 2026-09-21):** React 19.3.0, Konva 10.6.0, zustand 5.0.15, immer 11.1.18,
   zod 4.6.5, idb-keyval 6.3.0, @cantoo/pdf-lib 2.11.1, perfect-freehand 1.2.3, lucide-react 1.47.0,
   fflate 0.8.3, vite-plugin-pwa 1.3.0. The fixed dependency list (spec §2.2) is closed — no additions
   without updating the spec first.
5. **The keypad pipeline in spec §6.1.1 is execution-verified**: all 19 traced cases + rejects +
   2000 property combos pass (`12 6` → 150 in; `12 6 3` → 150 3/16 in; compose table of 8 cases;
   value round-trips through the strict parser). `parseLooseToSlots` returns
   `{ slots, rawDecimal }`; `pressDot` routes to the numerator slot with the denominator unchanged.
6. **`getUserMedia` still-capture resolution on Windows tablets caps at ~1080p–4K** — capture toggle
   labels must come from the 0.2 spike's measured device caps, never from the sensor's marketing MP.
7. **No web API reads the Windows pen handedness setting** — first-run asks a plain question.
8. **"Open folder"/"Show in Explorer" is impossible from a PWA** — the sanctioned strings are
   `Copy path` + `«Reveal folder»` (`showDirectoryPicker({ startIn })`).

## 5. Settled decisions — do NOT re-litigate

D1–D20 in `docs/DECISIONS.md` plus the round-1/round-2 correction lists are settled. The big ones:
imperative Konva (no react-konva); per-project folders via FSA (OPFS fallback); per-sheet
`markup.json` sidecars; image-px geometry + mu styles + mm-canonical values; **`label` is
derived-only (no `label` field in the schema)**; typed-only measuring in v1 (calibration deferred —
**no `≈` on dimensions, no Keep-measured**); flatten-only PDF; insets nest exactly one level with
children in asset working-image px; persisted undo = `.history` snapshots (no command journal);
precision is project-level; fflate for PNG zip; handedness as a plain question; v1 scope per §2.4.

**Re-opening any of these requires a concrete failure scenario, not a preference.**

## 6. Your verification pass (do this BEFORE fleshing out)

Work through these checks; fix what fails; log findings in `docs/CONTINUITY.md` (session 3) and
`docs/DECISIONS.md` where a choice was involved.

**Cross-doc consistency:**
- [ ] Every slice in `docs/implementation-plan.md` matches its spec §13 entry (files, tasks, gates).
  The plan added slices 0.3/1.4 — confirm §13 has them (round-1 M9 fix) and that nothing drifted.
- [ ] Every gate in the plan actually checks the thing it's named for (e.g., the 1.9 invariance gate
  must reference the §4.2 export rules AND §9.2's `page pt = imagePx × 0.75`).
- [ ] UI spec `〔v1 scope〕` markers all agree with spec §2.4 (calibration, auto-enhance, rotate-sheet,
  vector overlay, summary page, Explorer strings, import-bundle, duplicate-project, rulers,
  `≈`, Keep-measured, sheet templates).
- [ ] No canonical doc says "React 18" (spec §2.2/§13 were corrected to 19.3; grep for stragglers).
- [ ] No doc claims the Windows pen setting is readable, or promises `Show in Explorer`/`Open folder`.
- [ ] `12 6`-class examples everywhere say 150 in / 150 3/16 in (grep for `148` — only allowed in
  round-2 bug explanations).

**Architecture soundness (re-derive, don't copy):**
- [ ] Storage: atomic write path (tmp→close→move) covers ALL writes; `cleanStaleTmp` is lock-held +
  age-gated; per-project lock names; `.history/_project/` exists; pagehide flush. Re-trace the
  two-tab matrix (same project → read-only; different projects → both writable).
- [ ] §4.2 screen/export scaling: re-derive the invariant yourself for M=2 with a 4-mu stroke and an
  18-mu label (bitmap px → dpi → pt). If your arithmetic disagrees with the spec, STOP and record it.
- [ ] §8.5 inset model: re-trace the crop offset (`assetImage.position(-crop.x, -crop.y)` inside a
  group with `clipFunc` + scale `placed/crop`) and the child round-trip gate. Confirm the plan's 1.7
  gate matches.
- [ ] Schema: `.nullish()` on optional fields; guarded `parseJson`; `label` absent; `unitFormat`
  present; v0.2-file tolerance (extra `label` stripped, missing `unitFormat` normalized) — make sure
  the plan's 1.1 gate tests both.
- [ ] Every function the plan/spec reference exists in a fixed dependency at the pinned version
  (`embedJpg`, `zipSync`, `getStroke`, `showDirectoryPicker` options, `navigator.locks.request`,
  `BroadcastChannel`, `getCoalescedEvents`, `createImageBitmap` options). No invented APIs.

**Plan-internal:**
- [ ] Dependency graph edges match the hard-ordering constraints; no slice uses something a later
  slice builds.
- [ ] Every "Done when" in spec §13 has a corresponding plan gate, and vice versa.
- [ ] The wrong-measurement tripwires list covers: keypad trace mismatch, stale labels, ink/stroke
  zoom variance, export M-variance, inset child drift. Add any new ones you find.

## 7. Your flush-out pass (after verification is clean)

For each slice in `docs/implementation-plan.md`, extend its entry with:

1. **Files:** exact paths (spec §12 layout) with one line on each file's responsibility.
2. **Build order inside the slice:** numbered steps a builder follows literally, including "wire X
   to Y" steps the spec implies but doesn't sequence.
3. **Signatures:** the function/class signatures from the spec's reference code, restated at the
   point of use (do not re-copy whole code blocks into the plan — reference the spec section, and
   restate only signatures + the non-obvious wiring).
4. **Test tables inline:** the unit tests the slice must carry (from spec §6.1/§14), as plain lists
   the builder turns into Vitest files.
5. **Gate as a checklist:** already present — keep it, and make each box independently checkable.
6. **Rollback note:** one line on what to do if the gate fails (usually: fix forward within the
   slice; if the spec itself is wrong, stop and record in DECISIONS).

**Rules while flushing out:**
- Do not rewrite the build spec or UI spec — the plan references them; they stay the authority.
- Do not change slice order or add/remove slices without recording why in `docs/DECISIONS.md`.
- Do not invent features. v1 scope is §2.4. "Simplest behavior consistent with §11.6 + a DECISIONS
  line" is the rule for anything unspecified.
- Every numeric expectation you add (a test value, a tolerance) must be **hand-derived in the doc**
  (show the arithmetic in a comment) — round 2 caught a wrong number that had survived review.
- Keep the checkpoint summary table (plan tail) in sync with your changes.

## 8. Known open items the plan deliberately leaves to slices (do not "solve" them now)

- **Device caps report** — filled by the 0.2 spike on real hardware (fed into 1.4's labels).
- **TypeScript 7 vs 5.x** — confirmed at slice 0.1 scaffold time (D14 note).
- **`Konva.pixelRatio` downgrade on Surface Go** — measured in slice 1.3 (spec §8.1.1).
- **Metric at launch, typed site-address field, sheet templates** — human product questions
  (CONTINUITY "Open questions"); the plan must not assume answers to them.
- **`THIRD-PARTY-NOTICES.md` + CSP + CI workflow** — first tasks of slice 0.1, currently absent.

## 9. Session mechanics

1. Update `docs/CONTINUITY.md` at session start (mark session 3, in-progress: plan verification +
   flush-out) and at session end (findings, state, next action).
2. Commit with a descriptive message; push to `origin HEAD`. Follow the repo's existing message
   style (see `git log`).
3. If you find a defect in the **canonical specs** (not just the plan), fix it there AND propagate to
   the plan — never let the plan and the spec disagree after your session.
4. Do not delete or weaken any existing test table, gate, or tripwire to make verification "pass."
   If a gate can't pass in principle (e.g., it needs hardware you don't have), mark it
   `[Surface — pending]` rather than removing it.

**Definition of done for your session:** verification checklist all green (with findings fixed and
logged), `docs/implementation-plan.md` flushed out slice-by-slice per §7, CONTINUITY updated,
committed and pushed. The next session after yours should be able to start slice 0.1 with zero
questions.