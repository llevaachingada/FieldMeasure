# Review brief — the questions every review lane must answer

**Hand this to every review lane** (an `oracle` pass, or a `fixer` doing an adversarial one). It exists
because a review always starts with the machine gate **green**: the gate proves what the tests *claim*,
not what they *prove*. Every question below is here because it has already caught a real defect in this
project — the prior catch is quoted so the question is not read as hypothetical.

---

## Method

- **Execute, don't read.** Re-run the code, re-derive the numbers, re-parse the bytes, re-issue the
  event. Every review round here has found defects that had passed the previous round's *reading*.
- Read the **code and the diff**, not only the lane's summary. A lane's report is a claim, not evidence.
  When a report and the code disagree, the code is what ships.
- **No edits.** The review lane reports; the orchestrator resolves and commits.
- **Test a claim against the revision it was made against** (`git show <sha>:path`), never against
  current HEAD. With lanes running, HEAD moves underneath you, and a *true* finding will look false.
  Never withdraw a finding — your own or a lane’s — without that proof: a false correction is worse
  than the original error.
- Say plainly which areas you checked and found **sound**. Do not pad with speculative rewrites, style
  preferences, or anything you did not actually run.

---

## The questions

1. **Proof, not decision.** For each new or changed test: could it pass *without* the behaviour it
   names? Name any wiring that is untested.
   *Prior catch:* a pure `decideDragTarget` predicate test was green while `SheetEditor` never consumed
   its result — one-finger pan on empty canvas was simply not implemented, and 270 passing tests could
   not see it. A read-only test of a decision is not evidence that the caller uses it.

2. **Triviality.** Is any checked gate true by construction?
   *Prior catch:* "12 MP fixture → ≤4096 px long edge" — a 12 MP photo's long edge is 4032, so the
   assertion could never fail and the downscale path was never exercised.

3. **Claim fidelity.** Does `docs/DECISIONS.md` — and the lane's own report — match the shipped code,
   claim by claim? Flag every claim the code does not support.
   *Prior catches:* a comment stated a restore path was "already live" while the return value was
   discarded; a narrative described a fixture anti-pattern that the old file never had.

4. **Stale arithmetic.** Is any subordinate document still carrying pre-correction numbers, or numbers
   that disagree with the document above it in the authority chain?
   *Prior catch (three times):* the loupe's window / magnification / source triplet. Exactly one of the
   three is free — `sourcePx = diameterPx / magnification` — and the pen and touch loupes legitimately
   differ (3.5× vs 4×).

5. **Honesty about deferral.** Are `[Surface]` gates logged in `docs/HARDWARE-TEST-CHECKLIST.md`, marked
   PENDING (never PASS), with the machine-verifiable half stated explicitly? Is anything marked
   machine-passed that is not machine-proven? Is any checkpoint that fired recorded in **all three**
   places (`BUILD-RUNBOOK.md` §8)?

6. **"Do not flatten".** For every rule the specs mark load-bearing (screen vs export scaling, derived
   labels, the inset crop offset, the tool rail), would the test actually catch the flattening it
   guards?
   *Prior catch:* the stroke and ink halves of the §4.2 gate were genuine pixel measurements, but the
   label half was attribute arithmetic — it proved the rule was applied, not that the glyph rendered
   at the right size.

7. **Boundaries.** Are boundary values pinned and asserted rather than assumed — an inclusive threshold,
   the fraction-denominator set, a clamp at exactly its limit, a cap that re-exposes a trailing dot?
   *Prior catch:* a refactor could silently stop clamping while the "≤4096" test still passed.

8. **Environment coupling.** Does any test depend on an environment that cannot exercise the path?
   jsdom has **no canvas** (so hit-testing "passes" without testing hit testing — D40); a mocked module
   can remove the behaviour under test; a forced `pixelRatio: () => 1` skips the DPR-2 path.
   *Known open gap:* the §8.1.1 `devicePixelRatio = 2` path is inferred, not measured.

---

## Ground truth

- Authority: build spec **§2.4 (v1 scope)** > build spec > UI spec > implementation plan.
- Specs: `docs/preflight-handoff-v0.3-hardened.md`, `docs/ui-spec-field-measure-v2-hardened.md`,
  `docs/implementation-plan.md`. Non-negotiables and the four highest-stakes modules: `AGENTS.md`.
  Process: `docs/BUILD-RUNBOOK.md`.
- A defect in one of the four highest-stakes modules is a **stop**, not a finding to batch.

---

## Report format

Findings ordered by severity, each with `file:line`, the exact evidence (the command and its output, or
the arithmetic), and an explicit statement of what you did **not** check. Then a plain list of the areas
you verified **sound**. If you find nothing in an area, say so rather than padding it.
