# AGENTS.md — Field Measure

You are building **Field Measure**: a local-only, offline PWA for Microsoft Surface tablets with a
pen. Photograph a site, draw feet-inch dimension lines on the photo, export a marked-up PDF/PNG into
a folder the user drags into Dropbox. No server, no database, no sign-in, no cloud, no Bluetooth, no
multi-user.

**Application code exists and is shipping.** Work continues slice by slice, from a plan that has
been through many adversarial review rounds — the count and the current state live in
`docs/CONTINUITY.md`.

**Never trust this file for project state.** This file is the *contract* — the rules that do not
change. State lives in two places: `docs/CONTINUITY.md` (the live snapshot) and the last entry of
`docs/BUILD-LOG.md` (where the previous session stopped). Read both before your first decision, and
never infer progress from this file.

---

## Start here, in this order

1. **`docs/CONTINUITY.md`** — where the project stands right now: live snapshot, timeline, open items.
2. **`docs/BUILD-RUNBOOK.md`** — how to work: the slice loop, gate policy, the parallel-lane
   protocol, when to stop and ask. **Read this before writing any code.**
3. **`docs/BUILD-LOG.md`** — what has already been done. Read the last entry to find your place.
4. **`docs/implementation-plan.md`** — the slice you are on. It has files, numbered build order,
   signatures, test tables, and a checkable gate.
5. **`docs/preflight-handoff-v0.3-hardened.md`** — the build spec. The authority on *what*.
   §2.4 is the v1 scope table and overrides everything.

Do not start a slice before reading its entry in the implementation plan in full.

---

## Authority chain (when documents disagree)

```
build spec §2.4 (v1 scope)  >  build spec  >  UI spec  >  implementation plan
```

The implementation plan is the authority on **order and done-ness** only. If you find a genuine
conflict, fix the subordinate document and add a line to `docs/DECISIONS.md`.

---

## Non-negotiables

These are not preferences. Violating one re-creates a bug a review round already caught.

1. **Never store screen pixels in a data file.** Geometry is working-image pixels; style sizes are
   markup units (mu); lengths are millimetres plus the raw entered text.
2. **There is no `label` field.** Labels are derived at render time from `valueMm` + project
   precision + unit format. A stored label is a wrong-measurement bug.
3. **All disk writes go through `src/fs/projectStore.ts`** (tmp → close → `move()`, under the
   per-project Web Lock). Never call `createWritable()` anywhere else.
4. **Imperative Konva only.** React renders the chrome; the canvas is an `EditorCanvas` class.
   **Do not introduce react-konva.**
5. **The runtime dependency list is closed** (spec §2.2). Adding one requires a spec change first.
   `crypto.randomUUID()` for ids — no `uuid` package.
6. **Screen vs export scaling are opposites** (§4.2) and both are load-bearing. Screen: strokes
   `strokeScaleEnabled:false`, text `fontSize = mu / s`, ink `size = mu / s`. Export: strokes
   `mu × M`, text `fontSize = mu`, ink `size = mu`. The invariant is `0.75 × mu` pt at every M.
7. **Never delete or weaken a test or a gate to make it pass.** If a spec expectation is wrong, fix
   the spec with the arithmetic shown in `docs/DECISIONS.md`, then fix the test. This has happened
   repeatedly: each time, the spec was wrong and the test was right to fail. See `docs/DECISIONS.md`.
8. **Never add:** servers, databases, sign-in, analytics, telemetry, cloud SDKs, Bluetooth, AI
   features, or service-worker caching of user photos.

---

## The four highest-stakes modules

A bug in any of these is a wrong measurement or a wrong artifact. Test them exhaustively and
**execute** anything you copy:

- `src/domain/units.ts` — the ft-in parser, formatters, and the keypad slot model
- `src/domain/snapping.ts`
- `src/export/renderStage.ts` + `src/export/pdf.ts` — the export scaling rules
- `src/fs/projectStore.ts` — atomic writes

---

## Working rules

- **Execute, don't read.** Every review round has found defects in reference code that passed
  the previous round's *reading*. Before trusting any code block in the docs, run it. If your
  execution and the doc disagree, **your execution wins** — fix the doc, note it in DECISIONS.
- **Anything unspecified** → simplest behaviour consistent with the "do not simplify" list
  (§11.6) + one line in `docs/DECISIONS.md`. Do not invent features; v1 scope is §2.4.
- **Every numeric expectation you write must show its arithmetic** in a comment.
- **All user-visible text lives in `src/ui/strings.ts`.** Copy comes from
  `docs/appendix-strings.md` — do not invent wording that the specs already provide. The contract is
  machine-checked: `tests/strings.test.ts`.
- **Accessibility is per-slice**, not a final pass: focus order, visible focus ring, `aria-label`
  on every control, 48 px minimum target (touch-primary floor), no keyboard trap.
- Commit at the end of each slice, with the slice number in the subject. Update
  `docs/BUILD-LOG.md` in the same commit.

---

## Working with lanes (parallel agents)

Work may be dispatched to specialist lanes (@fixer, @designer, @oracle, @librarian, @explorer)
instead of being done serially. If you are orchestrating, read **`docs/BUILD-RUNBOOK.md` §11**
*before* dispatching — contended files, per-lane verification limits, the integration checklist —
and hand every review lane **`docs/review-brief.md`**.

---

## You do not have a Surface

Many gates are marked `[Surface]` (real hardware with a pen). You cannot run them.
**This does not block you.** Follow `docs/BUILD-RUNBOOK.md` §4: machine-checkable gates block the
slice; `[Surface]` gates get logged to `docs/HARDWARE-TEST-CHECKLIST.md` and the slice proceeds.
Never fake a `[Surface]` result, and never silently skip one.

---

## When to stop and ask the human

Almost never — every previously open question is resolved in build spec **§21**. Stop only for:

1. A gate that fails three times with three genuinely different fixes attempted (runbook §6).
2. Something that would require adding a runtime dependency, or violating a non-negotiable above.
3. A destructive or outward-facing action: deleting user data, force-pushing, deploying, or
   publishing anything.

Everything else: decide, record it in `docs/DECISIONS.md`, and keep going.

---

## Environment quirks (current build machine, Windows)

- **Shell:** prefix every command with `$env:Path = "C:\Program Files\nodejs;" + $env:Path`; use
  `npm.cmd` / `npx.cmd` — `npm.ps1` is blocked by execution policy.
- **PowerShell has no heredocs.** Write a commit message to a file and use `git commit -F <file>`;
  `<<'MSG'` fails with a parse error.
- **Never verify copy through the console.** `Select-String` prints U+2014 as `-` while `git diff`
  prints `—`, and `[regex]::Escape()` with `-SimpleMatch` searches for a literal backslash-space.
  Both have produced **false** "the wording changed" findings. Use a byte-level `node` read — and
  `tests/strings.test.ts`, which enforces the copy contract as a gate.
- **Background-task tooling:** a finished task may still read "running, status uncertain"
  (`client.session.status` is unavailable), `task_result` / `task_status` may not see terminal
  state, and a refused `subagent(sessionID)` resume is stale bookkeeping — `task_revive` works.
  `task_message` is lease-limited: several in a row fail with "message/control lease unavailable" —
  retry; it is not a lost message. Trust the completion notification and the files on disk, not the
  job board. **Do not poll.**
- **Line endings:** `docs/*.md` are CRLF, source files are LF. A script that rewrites a doc must
  restore CRLF or it leaves mixed endings.
