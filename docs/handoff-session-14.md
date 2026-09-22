# Handoff (session 14) — next implementer: finish 1.9's wiring, then 1.10 → 1.11 → 2.0

**Written:** 2026-09-22 (session 14) · **Branch:** `claude/amazing-carson-ocp8q7` (NOT `main`) ·
**PR:** https://github.com/llevaachingada/FieldMeasure/pull/2 (draft, open) ·
**Previous handoff:** `docs/handoff-session-13.md` — **its §0 ground rules, §7 standing contracts and
§9 owed-items table are still valid and are NOT repeated here. Read it.**

This file is **prescriptive**. Where it names a file and a line, the line was verified this session; if
the code disagrees, **the code wins** — fix this file and note it in `docs/DECISIONS.md`.

> **Session 13's handoff opened by saying its most valuable act would be running the independent review
> it had skipped. That was correct: the review found nine findings, two of them data-integrity bugs in
> shipped code that every prior gate had passed. Session 14 ran it, fixed seven, and shipped slice 1.9's
> modules. The pattern holds — run the review.**

---

# 0. State — what is true right now

**The work is on a feature branch, not `main`.** `origin/claude/amazing-carson-ocp8q7` is the live branch
and PR #2 is open as a draft. `main` is still at `4a12168`.

**Full gate on the pushed tree (`ada456b`), all executed this session:**

```
tsc --noEmit            -> 0
vitest run              -> 71 files / 1015 tests   (node + jsdom + browser)
npm run build           -> 0 errors, 17 precache entries, 857.62 KiB
playwright test         -> 5 passed / 5 skipped
```

Baseline at session start was 62 files / 790 tests, so this session added **225 tests**.

## 0.1 Environment — this repo is now being built on Linux, and the runbook is written for Windows

`AGENTS.md` §"Environment quirks" and handoff-13 §6 describe a Windows box (`npx.cmd`, blocked `npx.ps1`,
`Select-Object` broken pipes, CRLF docs). **None of that applies here.** What does:

1. **`node_modules` is absent on a fresh container** — run `npm ci` first. Node is 22.22 while
   `package.json` asks for `>=24`; nothing has failed because of it, but it is a mismatch, not a
   blessing.
2. **The vitest browser project launches HEADED and dies with "no XServer".** Every browser run must be
   `CI=true npx vitest run --project browser`. Without `CI=true` you will conclude the browser suite is
   broken. It is not.
3. **Playwright's pinned chromium (1243) is not the preinstalled one (1194)** — `npx playwright install
   chromium` fetches it (~114 MB) and works through the proxy.
4. **`docs/*.md` are LF here**, not CRLF. `file docs/DECISIONS.md` says so. Do not run handoff-13's CRLF
   conversion script; it would dirty every doc.

---

# 1. FIRST ACTION — run the independent review over THIS session's batch

Same instruction session 13 gave, for the same reason, with fresh evidence behind it. Hand the reviewer
`docs/review-brief.md` verbatim and scope it to:

1. **`src/export/renderStage.ts` — the whole module.** It is one of the four highest-stakes modules
   (`AGENTS.md`) and its correctness is the slice. Specifically: `applyExportRules` against
   `applyScreenRules` node-for-node (does any tag exist on one path and not the other?), the memory
   accounting, and the `getClassName()` matching that replaces `instanceof`.
2. **`scaleGeometryLocal`'s new pivot-scaling**, for all kinds — the old code was wrong for seven of
   eleven kinds and nothing caught it for a whole session.
3. **The style coalescing now wired into `SheetEditor.applyStylePatch`** — does an undo after a scrubber
   drag really restore the pre-drag value, and does a *different* key still start a new step?
4. **`src/ui/ExportWizard.tsx`'s refusal path** — the guard asserts `runExport` was never called, which
   is right; check whether anything else can reach the export with a refused multiplier.

Aim it at the shapes that keep recurring here: **a test that cannot fail**, **a decision tested but never
consumed**, **a `DECISIONS.md` claim the code does not support**, **an arithmetic claim with no execution
behind it**. Four of the nine findings this session were exactly those.

---

# 2. What shipped this session

## 2.1 Slice 1.9 — Export modules (the invariant is PROVEN, the wiring is NOT)

| File | State |
|---|---|
| `src/export/filenames.ts` | shipped in 1.3, untouched, closed |
| `src/export/png.ts` | **done** — 13 node + 2 browser tests |
| `src/export/renderStage.ts` | **done** — the §4.2 export stage |
| `src/export/pdf.ts` | **done** — `buildPdf`, `buildPdfParts`, `planPdfParts` |
| `src/ui/ExportWizard.tsx` | **done** — 36 jsdom tests, copy folded into `strings.ts` |
| `src/export/runExport.ts` | **DOES NOT EXIST — this is your first build task** |

**The invariant now has execution behind it, measured in real pixels at M = 1, 2, 3** — not attribute
arithmetic (the review brief's prior catch #6). `tests/renderStage.browser.test.ts` scans `getImageData`
for the stroke's opaque run and the label's ink bounding box and asserts the 1 : 2 : 3 ratio.

Derivation, asserted in `tests/exportInvariance.test.ts`: bitmap = `mu × M` px embedded at `96 × M` dpi
→ `(mu×M)/(96×M)` in = `mu/96` in = **`0.75 × mu` pt**, independent of M. At M=2: a 4-mu stroke → 8 px @
192 dpi = 3 pt; an 18-mu label → 36 px @ 192 dpi = 13.5 pt.

**A real bug the full gate caught, and the reason to keep running it.** Lane A could not run its own
browser test. Running it failed, and the chase found that the dimension label's halo (`strokeWidth: 8`)
and `--sel` hairline (`strokeWidth: 1`) carried **no `strokeWidthMu` tag**, so `applyExportRules` left
them at 8 px and 1 px in the bitmap at *every* M while the glyphs scaled `mu × M`. The label's outline
was physically thinner at 2× and 3× — **the §4.2 invariant failing for the label itself**. Both are now
tagged (`src/editor/shapes/renderDimension.ts`); screen behaviour is unchanged because
`applyScreenRules` re-applies the same 8 and 1.

**One trap to not re-learn — the white glyph fill is NOT a usable detector at M=1.** Executed, same node,
`fill:#FFFFFF` + `stroke:#2FD4E0 1px`, on a black page:

```
fontSize 18 -> 0 px over threshold 200, 15 px over 150, 43 px over 100
fontSize 54 -> 599 px over threshold 200
```

At 18 px the glyph stems are ~1 px wide and the hairline blends with essentially every fill pixel. A
`>200` detector reports "no label rendered" at M=1 and a real label at M=3 — it fails the ratio for a
reason that has nothing to do with the export rules. The test therefore measures the **halo**, which is
the same glyph outline at `8 × M` px and unambiguous at every M. This is written into the test file so
nobody re-derives it by reasoning. **The product was never broken here; the first detector was.**

## 2.2 The independent review — seven of nine findings fixed

Full report is in the session transcript; the fixes are in commit `ada456b` with the reasoning in the
message. The two that mattered most:

- **A cancelled drag persisted geometry with no history step.** `updateTransform` writes every frame
  through `scene.setGeometry` → `notify()` → `persist.queueSheet` → `markup.json`, while only
  `endTransform` records the step. `onPointerCancel` dropped the transform; `onToolChange` — the path
  the shell *actually* takes on `pointercancel` — did not clear it at all, so the next handle press took
  the already-mutated geometry as its undo baseline and the unrecorded mutation became permanent. The
  object-first drag had the same hole. **This is the palm-rejection case**, the likeliest interrupt on a
  gloved Surface. Both paths now share one restore-and-clear helper.
- **Resize teleported a vertex on all seven non-box kinds.** `scaleGeometryLocal` assigned the
  *absolute* handle target to the nearest vertex; a handle sits on the bounding box, not a vertex, so
  1 px of drag moved a vertex up to 101 px, and on freehand it spiked the stroke and desynchronised
  `pressure[]`. All 11 resize tests used a `rect`, so no non-box kind was covered anywhere in the repo.

Also fixed: §8.3's 600 ms style coalescing (`execCoalesced` had **zero** production callers while two
suites asserted it worked — the fourth "decision tested but never consumed" in this project; one
transparency-slider drag was pushing ~100 undo steps); a resize test that could not fail, and the
growth-past-pivot bug it was hiding; edge-handle pivot drift and flipping; a linking failure being
reported to the user as "your presets file is corrupt"; and the duplicated `TYPE_TOOL` map.

## 2.3 D84's recorded root cause is DISPROVED — do not act on it

`docs/DECISIONS.md` D84 records the cause as "Vite discovers a new bare import (`zod`) mid-run because
`EditorLayout` is lazy-loaded and absent from the dep scan". Both halves fail against the import graph:

- `src/fs/projectStore.ts` imports `../domain/schema`, and `src/domain/schema.ts:32` is
  `import { z } from 'zod'` — **`zod` was already transitively in the graph** of the very module that
  "does not provide an export".
- `EditorLayout` is lazy **only** at `src/App.tsx:29`. All three failing suites
  (`tests/insetWire.browser.test.ts:25`, `tests/layersWire.browser.test.ts:23`,
  `tests/sheetEditor.dimension.browser.test.ts:20`) import it **statically**, so the dep scan sees its
  whole graph.

**And a third premise fails:** `presets.ts`'s direct `import { z } from 'zod'` was **dead code** — `z` was
never used in the file (only `AnnotationStyleZ` from `@/domain/schema`). It has been deleted. So the one
artefact D84's hypothesis rested on did not even do anything.

**Consequence: D84's recorded remedy (`optimizeDeps.include: ['zod']`) is a no-op.** The root cause
remains unisolated. What IS fixed is the silent-failure mode: a missing namespace binding yielded
`undefined`, threw a `TypeError`, and was caught and reported as a corrupt presets file (D91).

**Policy, recorded as D90 — read it before you write `runExport.ts`:**

1. **Do not spread the namespace import.** It is a mute button, not a fix: it trades a loud link-time
   error for a silent `undefined`, which is exactly how the corrupt-file misreport was born.
   `src/export/**` and the wizard use ordinary named imports of `projectStore`.
2. **If it recurs, treat it as a build/tooling defect.** The lever aimed at the mechanism is
   `optimizeDeps.entries` covering the browser suites — a one-line `vitest.config.ts` change — not
   another source edit.
3. **OWED, 5 minutes, nobody has run it:** revert `presets.ts` to a named import and run the browser
   project. If it links cleanly today, the namespace import should be reverted and the guard kept. If it
   still fails, the guard is load-bearing and step 2 is the next move. **Do this before 1.9's lazy
   loading lands, not after.**

`presets.ts` is the only namespace importer in the tree. Three siblings use named imports from the same
module, sit in the **same lazy chunk** and are reached by the **same** suites that failed —
`src/ui/SheetEditor.tsx:86`, `src/ui/insetWiring.ts:35`, `src/editor/inset/insetAssets.ts:21` — with no
guard at all. If the mechanism is "whichever module is mid-link when re-optimization fires", `presets.ts`
was the victim, not the cause.

---

# 3. YOUR FIRST BUILD TASK — `src/export/runExport.ts` and mounting the wizard

**Slice 1.9 is not usable yet: nothing in the app can reach the export.** The modules and the UI both
exist and are tested; the orchestration between them does not. This is a few hundred lines and it is
fully specified by what already ships.

The wizard takes every unit of real work as an injected prop (deliberate — it kept Lane C independent of
the render lane). You must supply:

```ts
runExport(plan, onProgress)   // resolve sheetIds in order; render ONE sheet at a time through
                              // renderSheetJpeg at plan.multiplier; buildPdf / buildPdfParts (split
                              // at 250 MB -> part-01.pdf … and set ExportResult.parts) or
                              // canvasToPngBytes + zipPngs when plan.zip; conflictName(existing,
                              // name, plan.conflictPolicy) against the destination listing; write
                              // through projectStore.writeAtomic; onProgress after each file; count
                              // photoMissing into sheetsWithoutPhoto; RESOLVE with per-file rows
                              // including failures — a rejection is a whole-run failure with no detail
checkMultiplier(plan)         // the §19.4b budget across the plan's sheets: renderStage.canExportAt,
                              // and renderStage.largestMultiplierFor for the `largest` offer
estimate(plan)                // fileCount + bytes for the approved `Will write …` line
chooseDestination()           // gesture-driven showDirectoryPicker; default <project>/exports/<timestamp>/
revealFolder()                // showDirectoryPicker({ startIn })
copyPath(path) / retryFile(name)
```

**Non-negotiable #3 applies:** every byte written goes through `src/fs/projectStore.ts`
(`writeAtomic(dir, name, data, projectId)` — tmp → close → `move()` under the per-project Web Lock).
Do **not** call `createWritable()` anywhere else.

**Traps, each of them already paid for:**

1. **`buildPdf([])` produces a one-page blank A4 PDF** (executed, pinned in `tests/pdf.test.ts`):
   `@cantoo/pdf-lib` substitutes a 595.28 × 841.89 pt page when a page-less document is saved. Never
   call it with an empty scope; `buildPdfParts([])` returns `[]` and is the safe path.
2. **`SheetExport.imageWidthPx` is the WORKING-IMAGE size, never the M-scaled bitmap.** Page pt =
   `imagePx × 0.75` is what makes the physical size identical at every M. Getting this wrong is the one
   mistake that silently breaks the whole slice, and it will still pass a naive test.
3. **The wizard is a sibling dialog at `z-index: 60`** (editor sheets are 40). Its `Esc` handler is
   capture-phase and calls `stopPropagation`, so the editor's Esc ladder will not also fire. Mount it in
   a positioning-only slot and add no second `role="dialog"`.
4. **`src/ui/TopBar.tsx:171` already has the Export button, hard-coded `disabled`.** Add an `onExport`
   prop and enable it. Entry points per UI §12:740 are the Editor top bar, the Project top bar (pass the
   grid selection as `selectedSheetIds`), `Ctrl+E`, and `⋯ → Export`.
5. **Lazy-load the export ENGINE, not the wizard.** `pdf-lib` is the heavy dependency; a dynamic
   `import()` inside the handler keeps it out of the main chunk. Static-import the wizard component —
   given §2.3, adding a new edge into a lazy chunk is exactly the untested case, and the browser project
   is the only gate that can see it (D84's watch item, handoff-13 §9.2 item 14). **Run the browser
   project on that change specifically.**
6. **Checkpoint C6 fires in this slice** (`docs/CHECKPOINTS.md:103`) — the export memory ceiling on the
   target device. `EXPORT_BITMAP_LIMIT_BYTES` is 512 MB with the arithmetic pinned, but a dev-machine
   number is **provisional**; the real measurement is the Surface Go's. Record it in all three places
   (DECISIONS + CHECKPOINTS + the BUILD-LOG `Checkpoints fired:` field).

---

# 4. Owed items added this session (handoff-13 §9.2's table still stands; these are new)

| # | Item | Where it belongs |
|---|---|---|
| 18 | **`runExport.ts` + mounting the wizard** — §3 above. Slice 1.9 is not shippable without it. | now |
| 19 | **The in-wizard filename-template control** (UI §12:718: a template input with `{project}/{sheet}/{index}/{date}/{time}` token buttons and a live 3-name preview) is **not built**. The plan's build order never lists it and §11.3 puts the template in *project settings*. `ExportPlan` would need a `nameTemplate` field and a preview prop. `filenames.ts` already honours the token template, so nothing measurable is lost. | project settings, or 1.10 |
| 20 | **`export.tooLargeFor3x` hard-codes "3×"** with a blank Interpolation column, so it cannot be tokenised without failing `tests/strings.test.ts`. If the guard ever refuses **2×** on a very large sheet, the user is told "3×". | content owner |
| 21 | **7 new ⚠ PROPOSED (C14) rows** in `STRINGS.export` (progress readout, disk shortfall, split-parts note, conflict-group label, the PDF-side quality ladder, the multiplier button label, `errors.unknown`) — the appendices key none of them. | content owner |
| 22 | **The wizard's progress step has no Cancel** (UI §12:726) — `runExport` exposes no cancellation signal. Also absent: the elapsed-time readout, the per-sheet 64 px thumbnails, the live size estimate on the scope step. | 1.10 |
| 23 | **A rotated inset scales its unrotated AABB under the Select tool.** `image` geometry carries `rotation`, but `geometryBounds` (`src/editor/shapes/scene.ts:139-140`) returns the unrotated box, so a corner drag visibly jumps. The Inset tool's own rotate arm is unaffected. | with the §8.6 rotate handle |
| 24 | **`applicabilityForSelection` disables EVERY control when an inset is in the selection** (`styleByTool.ts` has `inset: only({})`). Rect + inset shows a truthful scope chip over a fully dead panel. Faithful to the renderer — `renderInset.ts` consumes no stroke — but **UI §9 specifies a `Border (on/off + width + colour)` control for a selected inset that does not exist**. `AnnotationStyle` has no channel for it. | a slice that extends the type |
| 25 | **CSS-declared a11y in the wizard is unmeasured** — the 48 px targets, the 16 px slop (`.export-wizard-slop::after { inset: -16px }`), the 720 px reflow. jsdom has no layout (D40). | the 1.10 a11y audit |

---

# 5. What this session did NOT verify — do not inherit as true

1. **No independent review of THIS session's output** (§1 — run it). Same omission session 13 recorded,
   now with a measured track record behind why it matters.
2. **Export has never run end to end.** No PDF or PNG has been written to disk by the app, because
   `runExport.ts` does not exist. Every export claim is at module level.
3. **Every `[Surface]` gate for 1.9** — the Acrobat measurement across 1×/2×/3×, the 50-sheet 2× export
   on a Surface Go, the damaged-photo end-to-end, the conflict policy against a real NTFS folder. These
   are logged, not passed. **Never fake one.**
4. **B1's product question is still open** (handoff-13 §9.1): a page that loads with an **OPFS** handle
   under `fm:projects-root` kills the renderer; whether a **real on-disk** handle does the same is
   untested, and if it does, `src/settings/projectsRoot.ts` is a product defect. Only hardware decides.
   **The product is not exonerated.**
5. **F1's real-touch e2e** remains `fixme`.
6. **C4's ladder decision** is still the Surface Go's; the dev-machine number decides nothing.
7. **The 1015-test suite has never run on the Windows build machine** — it was written and gated here.

---

# 6. Process notes worth keeping

- **Six parallel lanes ran this session** (one review, three for 1.9, two remediation) under the
  runbook §11 protocol. Zero file collisions: every lane got an explicit owned-files list and a pinned
  interface, and no lane imported a sibling's in-flight file. The protocol works — follow it literally.
- **Pin the ambiguous field in the brief, not in review.** `SheetExport.imageWidthPx` (working-image vs
  bitmap) was called out in the brief with the reason; it came back right from a lane that never saw the
  other lane's code.
- **A lane's report is a claim.** Two defects were found by reading committed lane output rather than
  trusting the summary: a `DuplicatePngNameError` whose public `name` field was silently overwritten by
  the `Error` class tag (so the caller could never learn which entry collided, and the lane's test only
  asserted the error *type*), and the unexecuted browser test in §2.1. **Read the diffs.**
- **Intermediate commits on the feature branch** were used because a stop-hook requires a clean tree and
  lanes land at different times. Each says in its message that the wave was still in flight. The usual
  one-commit-per-slice discipline resumes once `runExport.ts` lands.
