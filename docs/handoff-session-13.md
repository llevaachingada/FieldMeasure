# Handoff (session 13) — next implementer: finish it — 1.9 → 1.10 → 1.11 → 2.0

**Written:** 2026-09-22 (session 13) · **Branch:** `main` · **Tree:** clean · **HEAD:** `32d17c6`
(pushed; `origin/main == HEAD`) · **Previous handoff:** `docs/handoff-session-12.md` — **its §0.1
document table is still valid and still the authority on the orienting document set; read it there rather
than repeating it here.**

This file is **prescriptive**. Where it names a file and a line, the line was verified this session; if the
code disagrees, **the code wins** — fix this file and note it in `docs/DECISIONS.md`.

`docs/CONTINUITY.md` is the live snapshot; the last `docs/BUILD-LOG.md` entries are the per-slice record.
Where they disagree with this file, **they win**.

> **The single most valuable thing you can do first is §1: run the independent review this session did
> not.** Everything else in this file is a plan; that is a bet against unknown-unknowns, and this
> project's track record says the bet loses.

---

# 0. Ground rules (inherited; only the deltas are repeated)

1. **Read order:** `docs/CONTINUITY.md` → `docs/BUILD-LOG.md` (last 2 entries) → `AGENTS.md` →
   `docs/BUILD-RUNBOOK.md` (**§11 is the parallel-lane protocol — follow it literally**) →
   `docs/review-brief.md` → `docs/handoff-session-12.md` §0.1 → this file.
2. **One writer per file, per wave.** Two writers on one file is whole-file **loss**, not a merge
   conflict.
3. **`docs/` are orchestrator-only.** Lanes report; you write the logs.
4. **Never let one lane import a sibling's in-flight file.** Pin the interface in both briefs; wire the
   seam yourself at integration.
5. **Copy:** one writer for `src/ui/strings.ts` per wave; a lane stages `src/ui/<slice>Copy.ts` and you fold
   it **from the appendix bytes** and delete it. **A folded value must start its string on the key's own
   line** — the gate's source parser reads leaves line-wise. `tests/strings.test.ts` machine-checks it.
   **Never verify copy through the console.** *(Session 13 detail: fold with a `node` byte read; use
   `JSON.stringify` in probe output so U+2014 cannot be mangled.)*
6. **Per-lane verification is a subset:** `npx.cmd tsc --noEmit` + `npx.cmd vitest run --project node
   --project jsdom`. **The canvas lane may add `--project browser`; no lane runs `npm run build` or
   `npx playwright test`.**
   ⚠ **This subset is exactly how session 13's integration defect hid (D84).** A change that puts a **new
   module into the browser-visible graph** can be green in `tsc` + node + jsdom and still fail to link in
   the browser. If the wave touches anything the editor UI imports, **say so in the lane brief** and treat
   the browser project as a required gate for that change, not an optional one.
7. **You run the full gate on the reconciled tree** (`tsc` → `vitest run` → `npm run build` →
   `npx playwright test`) **and measure it on the file set the commit will contain** (D77/F10). See §6 for
   the PowerShell pitfalls that make this harder than it sounds.
8. **Commit discipline:** with the slice number in the subject, `BUILD-LOG` + `CONTINUITY` + `DECISIONS`
   (+ `CHECKPOINTS` if one fired) **in the same commit**, then push. **If you have to deviate (e.g. two
   waves share files and cannot be split), do it and state the reason in the BUILD-LOG** — session 13 did
   exactly that (one commit, four shared files).
9. **Windows/PowerShell:** prefix every command with `$env:Path = "C:\Program Files\nodejs;" +
   $env:Path`; use `npm.cmd` / `npx.cmd` (**`npx.ps1` is blocked by execution policy**); **no heredocs** —
   write the commit message to a file and `git commit -F <file>`; `docs/*.md` are **CRLF**, sources are
   **LF UTF-8** (the `write` tool emits LF — convert any doc you author with a `node` script and then
   assert `bareLF === 0`).

## 0.1 Baseline before you change anything

```
npx.cmd tsc --noEmit     -> 0
npx.cmd vitest run       -> 62 files / 790 tests passing   (node + jsdom + browser)
npm.cmd run build        -> 0 errors, 2125 modules, 17 precache entries (855.24 KiB)
npx.cmd playwright test  -> 5 passed / 5 skipped
```

**The tree is CLEAN — there are no untracked lane files this time.** The six 1.8 files that were
deliberately untracked for two sessions are now committed, and `src/ui/styleCopy.ts` is deleted (folded
into `strings.ts`). If those numbers differ *before* you change anything, **stop and find out why.**

---

# 1. FIRST ACTION — run the independent review this session did not run

Session 13 shipped five review findings, a whole slice, an integration defect and a root-cause
investigation, and **no independent `@oracle` pass was run over any of it** (a deliberate call under
context pressure — recorded here so it is not quietly forgotten).

Why it matters: this project's independent reviews have found real defects **every time** — D77 found six
correctness findings across a batch that had passed every per-slice gate, and four of them shared the shape
*"the wiring exists, the tests pass, and the real input cannot reach it."* Session 13's own D84 is a
variant of that shape, caught only by the full gate.

**Do this, in this order:**

1. Give the reviewer **`docs/review-brief.md`** verbatim (its eight questions each exist because they
   caught a real defect).
2. Scope it to the **session-13 batch**: the `selectTool.resize` / `editorShell` / `sheetEditor.dimension`
   / `render*` / `EditorCanvas` changes (F9/F3/F5/F6/F7), the whole **1.8** seam
   (`styleByTool.ts`, `presets.ts`, `projectMeasure.ts`, `styleCommand.ts`, `scene.ts`,
   `StylePanel.tsx`, `StyleEditorSheet.tsx`, the `EditorLayout`/`SheetEditor`/`session.ts` wiring), and the
   **D84 namespace-import fix**.
3. Explicitly aim it at the shapes that bit us before: **a test that cannot fail**, **a decision tested but
   never consumed**, **a claim in `DECISIONS.md` the code does not support**, and **an arithmetic claim
   with no execution behind it**.
4. Highest-value specific targets, in order: the **F9 resize arithmetic** (`scaleGeometryLocal` — the
   aspect-locked factor, the clamps, the degenerate cases, and what it does to `dimension`/`angle`/`polygon`
   vs a box); **D84's actual mechanism** (is the namespace import a fix or a papering-over? does the same
   failure exist latent wherever a lazy-loaded UI module first pulls in a bare import?); the **1.8 gate's
   routing/effect split** (does the pair really cover "applies to all and clears it"?); and **whether
   `applicabilityForSelection` can disagree with the panel's own `TYPE_TOOL` map** (it duplicates it).
5. Fix what it finds **before** starting 1.9. Slice 1.9 is the export acceptance gate; you do not want to
   be debugging a 1.8 seam through a PDF measurement.

---

# 2. Slice 1.9 — Export  ← **the next acceptance gate that matters**

**Packet:** `docs/implementation-plan.md` **lines 1259–1425** (read it in full; the filename reference
implementation and its 29-row table live at 1273–1406 and are the most execution-hardened thing in the
plan). **Spec refs:** §4.2 export rules, §9, §11.10, §13/1.9.

**The whole slice is one invariant:** a 4-mu stroke and an 18-mu label must measure the **same physical
size** in PDFs exported at 1×, 2× and 3×, and `page pt = imagePx × 0.75`.

**Files:** `src/export/filenames.ts` (✅ **already shipped in 1.3** — do not rebuild it; do re-run its
table), `src/export/renderStage.ts`, `src/export/pdf.ts`, `src/export/png.ts`,
`src/ui/ExportWizard.tsx`.

**The one rule that will be violated by instinct:** the §4.2 **screen** and **export** paths are exact
**opposites**, and both are load-bearing.

| | screen | export |
|---|---|---|
| strokes | `strokeScaleEnabled: false` + `strokeWidth = mu` | `mu × M` |
| text | `fontSize = mu / s` (re-applied on every zoom) | `fontSize = mu` — **never counter-scaled** |
| ink | outline regenerated at `mu / s` on zoomend | `mu` |
| pixelRatio | `min(devicePixelRatio, 2)` | **1** |

`renderStage.ts` must be the **only** module that scales for export. **Do not "unify" the two paths, and do
not let the export path call `applyScreenRules`.** If a physical measurement disagrees across M, the
invariant is the spec and the code is wrong — re-check the three rows above first (packet's Rollback note).

**Checkpoint C6 fires here** (`docs/CHECKPOINTS.md` line 103): the export memory ceiling on the target
device. Measure it, read the row (the plan has a computed budget, a hard guard, and a designed
PDF-splitting remedy), record the number in **all three places** (DECISIONS + CHECKPOINTS + the BUILD-LOG
`Checkpoints fired:` field), and remember a dev-machine number is **provisional**.

**Suggested lane split** (disjoint files, per runbook §11):
- **Lane A — the render core:** `renderStage.ts` + `pdf.ts` + their tests. This is the lane that carries
  the invariant; give it the table above verbatim.
- **Lane B — png/zip:** `png.ts` (1×/2×/3× via `fflate`) + tests.
- **Lane C — the wizard:** `ExportWizard.tsx` (+ any copy it needs staged) — Scope/Format/Destination/
  Result per §11.10, including the `4096×4096 @3×` **device-message refusal** and per-file error retry.
- `filenames.ts` is closed; nobody edits it.

**Gate:** mostly `[Surface]` (real Acrobat measurement, 50-sheet 2× export on a Surface Go). Log those to
`docs/HARDWARE-TEST-CHECKLIST.md` under slice 1.9 and mark the plan's boxes `[~]`. The **machine** half you
must actually pass: the invariant's arithmetic at every M, the PNG pixel dimensions, the damaged-photo
white-page path, the 3× refusal, the conflict-policy rows, and the a11y items (keyboard-operable wizard,
announced steps, selectable result path, 48 px + 16 px slop).

---

# 3. Slice 1.10 — Safety & polish

**Packet:** `docs/implementation-plan.md` **lines 1427–1462**. **Spec refs:** §11.11, §11.12, §8.3.

**The autosave chip is a carry-in, and it owns a real bug the queue currently hides.** Since 1.6 the
`persistQueue` **parks and retries** writes when the project is **read-only** or a save **fails**; nothing
surfaces that state. The chip's five states (Saved / Saving / Pending-offline / Read-only / Error+Retry)
own it — **never optimistic**: it reflects the write promise's resolution, not the intent to write. Design
the read-only and failed-save paths *first*, because every later write path must be re-verified against
them.

Also here: `.trash/` + 14-day prune + restore UI (recoverable = toast + undo; irreversible =
hold-to-confirm — a "do not simplify" item, do not weaken it), single-instance toasts (8 s / 10 s with
undo), the Sunlight/Dim **token-level** themes, the **Offset Nudge Pad** (spec'd since session 5, still
unbuilt), and the **end-to-end** a11y audit (per-slice a11y is already gated; this is the canvas accessible
object tree, the themes, and a full keyboard-only pass of the core loop).

**Gate:** the reboot test and the sunlight check are `[Surface]`. The corruption-recovery test must be
**re-run after every new write path** — that is the point of it.

---

# 4. Slice 1.11 — Release, update and install

**Packet:** `docs/implementation-plan.md` **lines 1464–1517**. **Spec refs:** §19.1, §19.2, §13/1.11.

The non-negotiables, in order of how badly they bite if ignored:
1. **`registerType: 'prompt'` — never `autoUpdate`.** A reload mid-measurement is a data risk *and* a trust
   risk, and this crew's trust in autosave is the product.
2. **Suppress the update toast entirely while `persistQueue.inFlight`, while `pendingOp !== 'none'`, or
   while the keypad sheet is open** — re-evaluate when those clear.
3. **`Reload` = `await persistQueue.flush()` → wait for `storageStatus === 'ok'` → `skipWaiting()` →
   reload. Never reload over an unflushed queue;** if the flush fails, keep the toast and *say so*.
4. `__BUILD_ID__` in Settings (build version + date, injected via Vite `define`). A bug report that cannot
   name the build is not actionable.
5. **Re-run `docs/install-runbook.md` on a clean Surface, start to finish, by someone who did not write
   it** — and correct the runbook where reality disagrees.
6. `THIRD-PARTY-NOTICES.md` still has `verify at scaffold (C1)` fields to confirm.

**Rollback if the prompt flow misbehaves:** the safe fallback is **no automatic update at all** (manual
re-install from the runbook) — never `autoUpdate`. Record the choice.

---

# 5. 2.0 — Field pilot (the only checkpoint that may end in "ask the human")

**Packet:** `docs/implementation-plan.md` **lines 1519–1523**. 2 people, 1 week, real jobs, side-by-side
with their current tool. Write **go/no-go + the top 5 fixes** into `docs/CONTINUITY.md`. This is **C7**, and
it is the one checkpoint allowed to end with a question for the human — do not pre-empt it, and do not ship
to 2.0 with the **14 placeholder tool glyphs** (D68) unreviewed.

---

# 6. Environment quirks that cost real time this session (add these to your instincts)

- **`npx.ps1` is blocked** — always `npx.cmd` / `npm.cmd`.
- **`Select-Object -Last N` on a large piped stream can make `vitest` exit 1** (broken pipe) *while
  reporting all tests passed* — a false gate failure. **Redirect to a file and read the file** for gate
  numbers; never trust `$LASTEXITCODE` through a `Select-Object` pipeline.
- **`git` writes progress to stderr**, and PowerShell surfaces it as a `NativeCommandError` with **exit
  code 1 even when the push succeeded**. Verify with the `e104c94..32d17c6  main -> main` ref-update line,
  or `git rev-parse origin/main` — not the exit code.
- **One PowerShell redirect produced UTF-16 output.** When you read a captured log, try `utf8` and fall
  back to `utf16le`.
- **Exotic-glyph anchors are fragile in scripts.** Match by **ASCII prefix or substring** (`## C4 `,
  `lucide-react 1.x icon API`), never by retyping an em dash or `⬜`. Prefer a whole-line replace driven by
  a prefix over a literal multi-glyph replacement.
- **Editing CRLF docs:** do the edit with a small `node` script that normalises to LF, replaces, and
  re-joins with `\r\n`, then **assert `bareLF === 0`**. The `write` tool emits LF, so a doc you author with
  it needs a conversion pass before you commit.
- **Vite's browser-mode dep-optimizer cache** lives at `node_modules/.vite` (+ `.vite-temp`). Session 13
  cleared it while chasing D84 — it did **not** fix that bug, but it is the right first move for a
  "new dependency optimized mid-run" style failure.
- **The background job board is unreliable by design.** Finished lanes read *"running, status uncertain"*
  forever; `task_result`/`task_status` may not see terminal state; `task_message` is lease-limited;
  `task_revive` works. **Trust the completion notification and the files on disk. Do not poll.**
- **A stuck lane is a real cost.** Session 13 had two diagnostic lanes stall far past their peers; the
  second one had actually produced a **complete file that ran and failed**, and cancelling it left that
  file on disk to be deleted. **When you cancel a lane, inspect the tree before you continue** — and if it
  left a *failing* test behind, delete it or fix it; never commit it.

---

# 7. Standing contracts (do not re-derive)

- **§4.2 screen vs export are opposites** (table in §2 above). `applyScreenRules` in `EditorCanvas.ts` is
  the **single screen chokepoint** — it now also re-centres anchored labels and re-fits text-note boxes on
  every scale change (F7). Extend it; never add a second chokepoint.
- **There is no stored `label`.** Labels derive from `valueMm` + project precision + unit format.
- **`pressure` is a parallel array**; `Px` has no `pressure` member. `svgPath.strokeInputPoints` is the one
  place that indexes it.
- **Children are not sheet z-band members.** A child's `zIndex` orders it inside its inset's group; the
  reorder primitives return `false` for any key containing `/`.
- **Canvas tests never run in jsdom** (D40) — the browser project or Playwright/CDP only.
- **CSP-as-a-test stays green: no inline `style=""`.** That is why the mini-toolbar uses the
  `.placement-hud` slot and why the Style Chip's preview is SVG.
- **All disk writes go through `src/fs/projectStore.ts`**; `createWritable()` exists in exactly **one**
  module (now also the home of `writePresetsFile`/`resolveFieldMeasureDir`).
- **D51:** the runtime project key is `${id}:${folderName}` everywhere.
- **D31:** the keypad's fraction chip is **entry-scoped**; only the style panel's Precision control edits
  the **project** value. Verified again this session; keep it that way.
- **`min(devicePixelRatio, 2)` ships** until hardware says otherwise.

---

# 8. Checkpoint & hardware ledger (never fake a result)

**C1 ✅ · C2 ✅ · C3 ✅ (provisional) · C4 ✅ machine half MEASURED, provisional — the §21.8 ladder decision
remains the Surface Go's · C5 ✅ · C6 ⬜ (fires in 1.9) · C7 ⬜ (2.0) · C8 ⬜ · C9 machine half ✅ / pen
PENDING · C10 machine half ✅ / on-glass walk deferred.**

Added to `docs/HARDWARE-TEST-CHECKLIST.md` this session:
- **C4 re-measure** on a Surface Go — the dev-machine number (median **0.6 ms**, p95 1.3; the ≤16 ms bar is
  not tripped) decides **nothing**.
- ⚠ **The B1 handle check** — *pick a real folder in first-run, then reload: does Home come back?* This is
  the one that decides a **product** question (see §9.1).
- The §1.8 `[Surface]` flow gate (swap tools + restyle in < 2 s).

---

# 9. Carried owed items — do not let these disappear

## 9.1 F1's real-touch proof (blocked, and a possible product defect)
`tests/e2e/layersReorderTouch.spec.ts` stays **`fixme`**, and its header now carries the **executed** root
cause (D81): the e2e blocker is **not** "`disabled={busy}` never clears" — a page that **loads** with an
**OPFS** directory handle stored under `fm:projects-root` **kills the renderer** in this Chromium build.
The write succeeds and the page survives; the *next* load dies. So **both** routes the session-12 handoff
proposed (complete first-run; seed the handle directly) are closed.
⚠ **Unverified and product-relevant:** whether a **real on-disk** handle does the same. If it does,
`src/settings/projectsRoot.ts` is a **product defect** (the app would be unusable after a reload) — the
hardware check above decides it, and **the product is not exonerated**.
The most promising route to the *test* remains the **browser project with CDP touch** (no first-run
needed): a session-13 attempt reached a real touch but **failed its reorder assertion** and was deleted.
That is close — a focused lane should be able to finish it.

## 9.2 The rest (each is owed to the slice that can carry it)
| # | Item | Where it belongs |
|---|---|---|
| 1 | **§8.6 rotate handle** for the Select tool (40 px above the top edge, `°` readout, 0/15/30/45/90 snaps) — rotate exists only as HUD chips. The Inset tool already has its own rotate arm. | 1.10 or its own slice |
| 2 | **Text-box scaling** — `Geometry`'s `text` carries only `at`, so a box resize has no channel and degrades to a translate. | a slice that adds the field |
| 3 | **NEW drift (F7-adjacent, found session 13):** the dimension label's **collision-push offset/leader** (`labelLayout`) and the angle's **arc radius** (`12 / ctx.scale`) are computed at build scale and still drift on zoom. `applyScreenRules` cannot fix them (they need the tip/geometry). | alongside 1.10 polish |
| 4 | **Tool-specific style controls with no `AnnotationStyle` channel** — corner radius, sides, arc radius, chisel width, highlighter straight-line lock, erase mode/scope, inset border/opacity/crop/shadow, text align/background/leader, elbow. `AnnotationStyle` has **8 keys**; Size + Bold are the only tool-specific ones that exist. | extend the type in 1.10 and surface them |
| 5 | **Object groups exist nowhere** — no model in `SelectTool`, `scene.ts` or the panel; Group/Ungroup are correctly **disabled**. | their own slice |
| 6 | **The synthetic photo row's lock cannot persist** until the photo is modelled as an annotation. | with #5 or a photo-model slice |
| 7 | **Rename is a deliberate no-op** — annotations carry no name. Remove it from the row menu or sanction a stored field. | any |
| 8 | **The camera has no in-app inset path** — `onPickCamera` uses a hidden `capture="environment"` input, a real OS camera but not UI §9:614's viewfinder. | needs a `CameraFlow` inset mode or a spec amendment |
| 9 | **The inset decode-error state is unreachable** (`inset.openError` / `chooseAnother` / `removePhoto` exist, nothing surfaces them). | 1.10 |
| 10 | **Second-tap-to-Focus is wired but not independently tested.** | 1.10 |
| 11 | **⚠ PROPOSED copy still needs a content owner** — including the stale refusal sentence («Fraction must be smaller than 1/16» → `1/{denominator}`). | a human |
| 12 | **The 14 tool glyphs are placeholders (D68)** — must not ship to 2.0 un-reviewed. | before 2.0 |
| 13 | **Targets are CSS-declared, not measured** (keypad 48–72 px; panel 320/56/48 px) — same class as D64's dpr path. | the a11y audit in 1.10 |
| 14 | **D84 watch item** — if a `does not provide an export named …` link error recurs when a lazy-loaded UI module first pulls a new bare import, the candidates are `optimizeDeps.include` / an `optimizeDeps.entries` scan — **not** another namespace import. | 1.9 (the wizard is lazy too) |
| 15 | **`EditorLayout.applicabilityForSelection` duplicates `StylePanel`'s private `TYPE_TOOL` map** — they can drift. Export the map from the panel. | 1.10 |
| 16 | **The read-only / failed-save state is parked and retried by the queue** with nothing surfacing it. | **1.10's autosave chip owns this** |
| 17 | **The scope chip labels types with the creating tool's name** (`Text note`) rather than §7.4's example words (`Text`) — the appendices key no `annotationType.*` copy. | copy owner |
| 18 | **Home «Open existing folder…» is a no-op** (D87). Real, enabled, approved-copy button with a stubbed handler. The specs say it "opens `showDirectoryPicker`" but never whether that **re-points the projects root** (which hides existing projects) or **adopts a folder from outside the root** (which the root-keyed Home scan does not model). Needs an owner answer or a spec amendment before it can be built honestly. | its own small slice |

---

# 10. What session 13 verified, and what it did NOT

**Verified sound (by execution or by reading the diffs, not by trusting reports):** the F3/F5/F6/F7/F9
fixes — including the F9 corner/edge arithmetic re-derived by hand for all four corners and both edge axes,
the F7 label re-centring (drift **58.8 px → 0.5 px** at 4×) and the box re-fit (which reproduces the
build-time geometry exactly, so nothing visual changes at any zoom); the copy fold against the appendix
bytes (gate 3/3); the 1.8 gate's routing/effect split; C4's harness and its honest ratios; and the
`strings.test.ts` contract.

**NOT verified — do not inherit as true:**
1. **Any independent review of this session's output** (§1 — run it).
2. **F1's real-touch e2e** — deferred, and the product question behind it is open (§9.1).
3. **The DPR-2 path's frame time** — the DPR-2 *ratio* is genuinely exercised in the browser project
   (this machine runs at 200 % scaling), but C4's decision is hardware's.
4. **A real on-disk handle surviving a reload** — only OPFS was testable headlessly.
5. **The `[Surface]` gates** for 1.8 (the flow) and 1.9 (the physical export measurement).

---

# 11. Session 13 in one paragraph

The D77 review's remaining five findings are fixed, each reproduced by execution first and each with a
guard that fails pre-fix (F3 `Esc`'s rung now reaches the canvas; F5 the dimension's settle dies on a real
tool switch; F6 sub-slop moves are history-visible on both drag paths; F7 the §4.2 chokepoint re-centres
anchored labels and re-fits text boxes; F9 handles scale/stretch per §8.6), and **two tests that had
encoded a defect were corrected as spec-expectation corrections with the arithmetic shown**. C4's machine
half is measured and recorded **provisional** (median 0.6 ms — the ladder stays the Surface Go's). **B1's
recorded cause was wrong and is corrected by execution:** a page that loads with an **OPFS** handle
persisted under `fm:projects-root` **kills the renderer**, closing both routes to the real-touch gate —
and because only OPFS handles were testable, **the product is not exonerated** and a hardware check now
carries that question. **Slice 1.8 shipped**: per-tool memory, recents, one-undo-step style application,
atomic per-tool presets, the WYSIWYG Style Chip and the §7.4 selection bar mounted and wired, and the
project-level precision path with **D31 verifiably held**. Six of six previously-known interface gaps were
**closed by extending the pinned interface** rather than owed. And **the full gate caught a browser-only
module-linking defect no per-lane check could see (D84)** — fixed behaviour-identically with a namespace
import, with the root cause recorded as a watch item rather than a solved mystery. Gate on the committed
file set: `tsc` 0 · `vitest` **62 files / 790 tests** · `build` 0 (17 precache, 855.24 KiB) ·
`playwright` **5 passed / 5 skipped**; one commit (`32d17c6`), pushed, tree clean.
**Your first move is §1: run the independent review.**
