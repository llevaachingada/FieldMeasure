# AGENTS.md: Field Measure

Rules for any AI agent working in this repo (Claude Code reads it through `CLAUDE.md`; Cursor,
Codex and Copilot read it directly).

**The app:** Field Measure is a local-only, offline PWA for Microsoft Surface tablets, used with
**touch only**. A user photographs a job, draws feet-inch dimension lines on the photo, and exports
a marked-up PDF/PNG into a folder they drag into Dropbox. There is no server, database, sign-in,
cloud, Bluetooth or multi-user.

**The owner** runs a small cabinetry shop and directs agents without reading code. Explain every
result in plain English: what changed, what to try on a Surface, and what you could not test.

**`main` is the live app.** Every push to `main` redeploys to the crews within minutes. Always work
on a branch and open a pull request.

---

## Before you start

Read, in order:

1. **[`docs/STATUS.md`](docs/STATUS.md):** what works, what's owed, the known flaky tests.
2. **[`docs/CHANGELOG.md`](docs/CHANGELOG.md):** recent changes.
3. **[`docs/DECISIONS.md`](docs/DECISIONS.md):** search it for the feature you're touching. Most
   "odd" code has a numbered decision explaining why.

Deeper background (the original specs, plans and build history) is in
[`docs/archive/`](docs/archive/README.md). It's frozen: read it for the why, never update it.
Where the archive and the code disagree, the code and its tests win.

---

## Every change, in this order

1. Create a branch. Keep the change as small as the request allows.
2. Make the change. Put all on-screen wording in `src/ui/strings.ts` (see Copy below).
3. Run the checks and report the numbers:
   `npx tsc --noEmit` · `npx vitest run` · `npm run build` · `npx playwright test`.
   Use **Node 24**; Node 22 has unrelated test failures.
4. If what the user sees changed, run `npm run clickthru`. It builds the app, drives it with real
   touch on the Surface screen size and screenshots every step. Look at the screenshots. It's an
   inspection tool, not a gate. (Background: `docs/archive/clickthru-harness.md`.)
5. Document it in the same pull request:
   - **`docs/DECISIONS.md`:** a new `### D<next number> - <title>` section at the end. Numbers are
     unique and ascending; `tests/documents.test.ts` checks this.
   - **`docs/CHANGELOG.md`:** one entry at the top.
   - **`docs/STATUS.md`:** update it if what works or what's owed changed.
   - **`docs/USER-GUIDE.md`:** update it if Help text changed (it mirrors `STRINGS.help`).
6. Open a pull request whose description says, in plain English, what changed, what to try on a
   Surface, and what you couldn't test.

---

## Non-negotiables

Each one exists because breaking it caused a real bug.

1. **Never store screen pixels in a data file.** Geometry is working-image pixels; style sizes are
   markup units (mu); lengths are millimetres plus the raw entered text.
2. **There is no `label` field.** Labels are derived at render time from `valueMm`, project
   precision and unit format. A stored label is a wrong-measurement bug.
3. **All disk writes go through `src/fs/projectStore.ts`** (tmp → close → `move()`, under the
   per-project Web Lock). Never call `createWritable()` anywhere else.
4. **Imperative Konva only.** React renders the chrome; the canvas is an `EditorCanvas` class.
   Don't introduce react-konva.
5. **The runtime dependency list is closed.** Don't add a package without the owner's explicit OK
   and a DECISIONS entry. Use `crypto.randomUUID()` for ids, not a `uuid` package.
6. **Screen and export scaling are opposites,** and both are load-bearing. Screen: strokes
   `strokeScaleEnabled:false`, text `fontSize = mu / s`, ink `size = mu / s`. Export: strokes
   `mu × M`, text `fontSize = mu`, ink `size = mu`. The invariant is `0.75 × mu` pt at every M.
7. **Never delete, skip or weaken a test to make it pass.** If an expectation is truly wrong, show
   the arithmetic in DECISIONS, then fix the test. Every time a test failed here, it was right.
   Removing a test is allowed only when the owner removes the feature it tests, and it gets its
   own DECISIONS entry.
8. **Never add** servers, databases, sign-in, analytics, telemetry, cloud SDKs, Bluetooth, AI
   features, or service-worker caching of user photos.

## The four highest-stakes modules

A bug here is a wrong measurement or a lost file. Test changes exhaustively and **run** anything
you copy:

- `src/domain/units.ts`: the ft-in parser, formatters and keypad model
- `src/domain/snapping.ts`
- `src/export/renderStage.ts` + `src/export/pdf.ts`: the export scaling rules
- `src/fs/projectStore.ts`: atomic writes

## Working rules

- **Execute, don't read.** Before trusting a code snippet from the docs, run it. If your result and
  the doc disagree, your result wins; note it in DECISIONS.
- **Every numeric expectation you write shows its arithmetic** in a comment.
- **Copy:** all on-screen text lives in `src/ui/strings.ts`. `tests/strings.test.ts` checks it
  against `docs/appendix-strings.md` (approved wording) and `docs/appendix-strings-gaps.md` (new
  wording, marked `⚠ PROPOSED` until the owner signs it off). Add new strings to the gaps file.
- **Touch first.** 48 px minimum targets, an `aria-label` on every control, a visible focus ring,
  no keyboard trap. There's no pen in the field (D167). Pen code paths stay because they're shared
  with touch input, but don't build pen-only features or wording.
- **Never use `npm run dev` to look at the app.** The CSP blocks Vite's dev styles, so it renders
  unstyled. Use `npm run build` + `npm run preview` (http://localhost:4173), or `npm run clickthru`.
- **You can't test on a real Surface.** Say so, and add anything that needs real hardware to the
  owner's checklist in `docs/FIELD-TEST.md` rather than claiming it works.
- **Windows:** if PowerShell blocks `npm`, use `npm.cmd`/`npx.cmd` or Command Prompt.
  `tools/launch-fieldmeasure.ps1` builds and opens the app locally.

## Stop and ask the owner

- Before adding a dependency or breaking a non-negotiable.
- Before anything destructive or outward-facing: deleting user data, force-pushing, merging to
  `main`.
- When the same check fails three times after three genuinely different fixes.
