# Build Runbook

**How to work on Field Measure, slice by slice.** This is the operating procedure, not a spec. The
specs say *what* to build; this says *how* to build it without going off the rails.

Read this file once, then follow it every slice. It is cited from `AGENTS.md`, `docs/CHECKPOINTS.md`
(§2), `docs/HARDWARE-TEST-CHECKLIST.md` (§4) and `docs/BUILD-LOG.md` (§6). If those sections drift,
this file is the source of truth.

---

## 1. Authority and reading order

When documents disagree, the build spec's **§2.4 v1 scope table** wins — it is the single authority
on what ships in v1. Below it, in order: the build spec, the UI spec, then the implementation plan
(the plan is authoritative on **order and done-ness** only).

Before you write any code for a slice, read, in this order:

1. `docs/CONTINUITY.md` — where the project stands right now (live state, open items).
2. `docs/BUILD-LOG.md` — the last entry; it tells you where the previous session stopped.
3. `docs/implementation-plan.md` — **the slice you are on, read in full** (files, build order,
   signatures, test tables, gate).
4. `docs/preflight-handoff-v0.3-hardened.md` — the build spec sections that slice cites.
5. `docs/appendix-strings.md` — every user-visible string, keyed for `src/ui/strings.ts`.

**Never start a slice before reading its implementation-plan entry in full.**

---

## 2. The slice loop

Work one slice at a time, in plan order. For each slice:

1. **Read** the slice's plan entry in full — files, numbered build order, signatures, test tables,
   and the gate at the end.
2. **Check checkpoints** — open `docs/CHECKPOINTS.md` and see whether any checkpoint fires in this
   slice. If one does, run its measurement first, read the row, act, and record the number in
   `docs/DECISIONS.md` (see §8). A checkpoint is never skipped and never guessed.
3. **Build** — follow the numbered build order. Do not implement more than the slice calls for:
   v1 scope is §2.4, not the plan's examples.
4. **Write tests as you go** — a slice's test tables are part of the slice, not an afterthought.
5. **Gate** — run the slice's gate (§3). Every item must pass before the slice is done.
6. **Record** — update `docs/BUILD-LOG.md` with the slice entry (see §5) and commit in the same
   commit as the code.

A slice is **done** only when its gate passes and its `BUILD-LOG.md` entry is committed.

---

## 3. Gate policy

Every slice ends in a **gate**: a list of checkable statements. Two kinds:

- **Machine gates** run on a dev machine — `npx vitest run`, `npx tsc --noEmit`, `npm run build`,
  and any deterministic check. These **block** the slice: the slice is not done until they pass.
- **On-device `[Surface]` gates** need a real Surface with a pen (palm rejection, pen pressure,
  sunlight, power-loss, real camera resolution). You do not have one. **They do not block the
  slice** — see §4.

The standing verification discipline for every slice:

- `npx vitest run` — all green before any gate.
- `npx tsc --noEmit` — zero errors.
- `npm run build` — succeeds.
- **Never delete or weaken a test or gate to make it pass.** If a spec-provided expectation is
  wrong, fix the spec first (with the arithmetic, recorded in `docs/DECISIONS.md`), then fix the
  test. This has happened twice for real; both times the spec was wrong and the test was right to
  fail.

---

## 4. `[Surface]` gate deferral

You cannot run `[Surface]` gates. **This does not block you.**

For every `[Surface]` gate a slice reaches:

1. **Copy it verbatim** from the plan into `docs/HARDWARE-TEST-CHECKLIST.md`, under the slice's
   heading.
2. Mark the plan's checkbox `[~]` (deferred — not `[ ]`, which reads as "not attempted").
3. Continue the slice. The slice is done when its **machine** gates pass; the `[Surface]` gates are
   logged and re-checked later on hardware.

A gate that is not in `docs/HARDWARE-TEST-CHECKLIST.md` did not happen. The project is **not
beta-ready** until every entry in that file has been run on real hardware and either passed or has a
logged, accepted deviation. Never fake a `[Surface]` result, and never silently skip one.

---

## 5. Commit discipline

- One commit per slice, with the slice number in the subject (e.g. `feat(0.1): scaffold`).
- Update `docs/BUILD-LOG.md` in the **same** commit — the log entry is how the next session resumes.
- Copy the `Entry template` from `docs/BUILD-LOG.md`; fill every field (Built / Machine gates /
  Deferred to hardware / Checkpoints fired / Decisions recorded / Surprises / Next).
- "Surprises" is mandatory: anything that disagreed with the docs, and what you did — including any
  spec expectation you corrected, with the arithmetic. This is the project's most valuable memory.

---

## 6. The three-strike rule

If a machine gate fails and a fix does not work:

1. First attempt — diagnose and fix.
2. Second attempt — a genuinely different fix (not the same fix twice).
3. Third attempt — a third, different approach.

If three genuinely different fixes all fail the same gate, **stop**. Append a `## BLOCKED — slice
<n>` entry to `docs/BUILD-LOG.md` (use its template: exact failure + command + output, the three
attempts, your read on what is wrong, and what would unblock it) and stop building. Do not paper
over the failure, do not loosen the gate, and do not burn a fourth attempt. A blocked gate is a spec
or plan defect, not a persistence problem.

---

## 7. When to stop and ask the human

Almost never — every previously open question is resolved in build spec **§21**. Stop and ask only
for:

1. A gate that hit the three-strike rule (§6).
2. Anything that would add a runtime dependency (the list is closed, spec §2.2) or violate a
   non-negotiable in `AGENTS.md`.
3. A destructive or outward-facing action: deleting user data, force-pushing, deploying, or
   publishing.

Everything else: decide, record it in `docs/DECISIONS.md`, and keep going.

---

## 8. Checkpoints, decisions, and the wrong-measurement tripwires

- **A checkpoint** (`docs/CHECKPOINTS.md`) is a question only code can answer (what the camera
  reports, how fast a Surface redraws, whether a toolchain version cooperates). It is measured, not
  asked, and **never guessed**. When one fires (slice-loop step 2), measure, read the row, act, and
  record the number in `docs/DECISIONS.md` in the format given at the bottom of `CHECKPOINTS.md`.
  Only C7 (field pilot) can legitimately end in "ask the human".
- **A decision** you make that the spec doesn't already cover gets one line in `docs/DECISIONS.md`
  (build spec §15, rule 11). Do not invent features; v1 scope is §2.4.
- **Wrong-measurement tripwires** are listed at the bottom of the implementation plan's checkpoint
  summary. Any one hit is a stop: keypad trace mismatch, a label not re-deriving on precision
  change, a stale `label` in any JSON file, ink/stroke width changing with zoom, export physical
  sizes differing across M, an inset child moving when only the inset transforms, or a value the
  user did not type appearing on a label. Stop, root-cause, and record before continuing.

---

## 9. Copy

All user-visible text lives in `src/ui/strings.ts`. Copy comes from `docs/appendix-strings.md` —
reproduce it verbatim (typos, punctuation and ellipses included). For the places the specs imply
copy but quote none, `docs/appendix-strings.md` has a **Gaps** section and proposed wording in
`docs/appendix-strings-gaps.md` — use the proposal, and if you change it, say so in `BUILD-LOG.md`
and add the final string to `appendix-strings.md`. **Never invent wording silently.**

---

## 10. Slice 0.0 note (the origin is already decided)

The plan's slice 0.0 was written when the origin was an open decision. It is now **resolved** — see
build spec **§21.1** and `docs/DECISIONS.md` D24: development on `http://localhost:5173`/`4173`,
production on a pinned static HTTPS host (default `https://<owner>.github.io/FieldMeasure/`, `base:
'/FieldMeasure/'`), an origin-agnostic `base` from `FM_BASE`, and a slice 0.1 origin-change guard.

What remains for slice 0.0 is **execution, not decision**: pin the exact owner/domain string (the
`<owner>` placeholder) into `docs/DECISIONS.md`, state `start_url`/`scope` verbatim for slice 0.1,
write `docs/install-runbook.md`, and record the update/publish path (slice 1.11's input). The gate
still holds — an exact origin string and a runbook a non-developer can follow.
