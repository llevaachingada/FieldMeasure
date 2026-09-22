# Handoff (session 12) — next implementer: clear the review findings, then 1.8 → 2.0

**Written:** 2026-09-21 (session 12) · **Branch:** `main` · **Tree:** clean, pushed ·
**HEAD:** `19b624b` · **Previous handoff:** `docs/handoff-session-11.md` (its §0.1 document table is
still valid — read it there rather than repeating it).

This file is **prescriptive**. Where it names a file and a line, the line was verified this session;
if the code disagrees, **the code wins** — fix this file and note it in `docs/DECISIONS.md`.

`docs/CONTINUITY.md` is the live snapshot; the last `docs/BUILD-LOG.md` entries are the per-slice
record. Where they disagree with this file, **they win.**

---

# 0. Ground rules

1. **Read order:** `docs/CONTINUITY.md` → `docs/BUILD-LOG.md` (last 3 entries) → `AGENTS.md` →
   `docs/BUILD-RUNBOOK.md` (**§11 is the parallel-lane protocol — follow it literally**) →
   `docs/review-brief.md` → `docs/handoff-session-11.md` §0.1 → this file.
2. **One writer per file, per wave.** Two writers on one file is whole-file loss, not a merge
   conflict. This session paid for that rule once (the D76 reorder seam) and respected it thereafter.
3. **`docs/` are orchestrator-only.** Lanes report findings; you write the logs.
4. **Never let one lane import a sibling's in-flight file.** Pin the interface in both briefs.
5. **Copy:** one writer for `src/ui/strings.ts` per wave; a lane stages `src/ui/<slice>Copy.ts` and you
   fold it **from the appendix bytes** and delete it. `tests/strings.test.ts` machine-checks it.
   **A folded value must start its string on the same line as its key** — the gate's source parser
   reads leaves line-wise, and a value wrapped onto the next line reads as a missing key.
6. **Per-lane verification is a subset:** `npx tsc --noEmit` + `npx vitest run --project node --project
   jsdom`. The canvas lane may add `--project browser`. **No lane runs `npm run build` or
   `npx playwright test`.**
7. **You run the full gate on the reconciled tree** (`tsc` → `vitest run` → `npm run build` →
   `npx playwright test`) — **and you measure it on the file set the commit will contain.** A gate
   measured on a tree holding other lanes' uncommitted files is not reproducible from git; that error
   (D77/F10) cost a correction this session. If untracked lane files are present, move them aside,
   measure, restore.
8. **Commit per wave** with the slice number in the subject, then `git push origin main`, with
   `BUILD-LOG` + `CONTINUITY` + `DECISIONS` in the same commit.
9. **Windows/PowerShell:** prefix every command with `$env:Path = "C:\Program Files\nodejs;" +
   $env:Path`; use `npm.cmd` / `npx.cmd`; **no heredocs** — write the commit message to a file and use
   `git commit -F <file>`.

## 0.1 Baseline before you change anything

```
npx tsc --noEmit              -> 0
npx vitest run                -> 52 files / 636 tests passing   (committed file set)
npm run build                 -> 0 errors, 17 precache entries (788.94 KiB)
npx playwright test           -> 5 passed / 5 skipped
```

⚠ **`src/ui/StylePanel.tsx`, `StyleEditorSheet.tsx`, `stylePanel.css`, `styleCopy.ts` and their two
test files are on disk and UNTRACKED**, deliberately, for slice 1.8's own wave. With them present the
suite runs **54 files / 698 tests**. That larger number is **not any commit's gate** — see rule 7.
If those numbers differ *before* you change anything, stop and find out why.

---

# Part A — clear the independent review's remaining findings (do this first)

`docs/DECISIONS.md` **D77** is the register: six correctness findings, each **proven by execution** in
a clean worktree at `e06bf8f`. **F1/F2/F4/F8 are already fixed** (D78). **These five are owed.**

**One shape runs through four of them: the wiring exists, the tests pass, and the real input cannot
reach it.** For each fix: reproduce it first, then fix it, then leave a test that would have failed
before. Do not "fix" a test to match the code.

## A1. F3 — Escape's first rung never cancels a pending dimension

- **Where:** `src/ui/EditorLayout.tsx` rung 1 (the `cancelPending` branch) clears `pendingOp` only;
  `src/ui/SheetEditor.tsx`'s own Escape handler deliberately **excludes** the dimension
  (`if (id !== 'dimension' && markupToolPending())`), so nothing reaches `DimensionTool.cancelPending()`.
- **Proof (executed):** mount `EditorLayout`, tap A → `anchorA`, press Escape → `pendingOp` is `none`
  and the overlay still has its 2 children; the **next tap commits a dimension the user escaped away
  from.**
- **Fix:** make the rung actually cancel the pending dimension (the shell can call the tool's
  `cancelPending()`; it already owns the tool refs), and keep the rung count at one.
- **Guard:** a browser test asserting that after Escape the provisional is gone **and** a following tap
  starts a fresh placement.

## A2. F5 — the 450 ms settle timer survives a switch to another placement tool

- **Where:** `src/ui/SheetEditor.tsx` tool-switch subscription (`cancelActiveMarkup()`) covers every
  markup tool **but not `dimRef`**; the dimension's `onToolChange` fires only when the coarse
  `activeTool` **prop** leaves `'place'`, and dimension→rect stays `'place'`.
- **Proof (executed):** tap-tap (keypad armed), switch to `rect` within 450 ms, wait 600 ms →
  `keypadOpen === true`: the **dimension keypad opens over the rectangle tool.**
- **Fix:** cancel the dimension's settle on any real tool change (Angle is already cancelled — the
  asymmetry is the bug).
- **Guard:** a browser test that switches tools mid-window and asserts no keypad.

## A3. F6 — sub-slop moves mutate the document outside history

- **Where:** `src/editor/tools/SelectTool.ts` (`updateTransform` applies `setGeometry` on every move;
  `endTransform` records a step only when `drag.moved` ≥ the axis-lock threshold) and
  `src/ui/SheetEditor.tsx`'s object-first drag (`setGeometry` per move; `history.exec` only
  `if (drag.moved && !tapped)`).
- **Proof (executed):** a 5 px handle drag moved a rect 300→305, and the first available undo label was
  **"Add shape"** — so undo **deletes the rect** instead of restoring `x0`. The mutation is persisted
  but unreachable by history.
- **Fix:** record a step whenever the geometry actually **changed**, not only when it passed a
  threshold — on both paths.
- **Guard:** a browser test that drags below the slop, then asserts undo restores the original position
  (and does not remove the object).

## A4. F7 — one-time label layout drifts on zoom (the measured one)

- **Where:** `src/editor/shapes/renderDimension.ts` (`placeText` computes `offsetX/Y = width()/2`
  **once**), `renderShape.ts` (angle label), `renderText.ts` (the box is sized once);
  `EditorCanvas.applyScreenRules` re-applies `fontSize` on zoom but **never re-runs layout**.
- **Proof (executed, real Konva stage, pixels read):** at 4× a dimension label's `offsetX` stays 21.79
  while its glyph half-width shrinks to 5.45 → **65.4 CSS px of centre drift off the midpoint**; the
  angle readout **58 px**; at 0.5× a text note's glyphs are **167 px wider than its box**.
- **Why the suite missed it:** the §4.2 gate measures glyph **size** constancy on an **un-offset** test
  node; it never asserts an **anchored** label or a box's containment. Size is invariant; the anchor
  and the box are not.
- **Fix:** re-centre labels and re-fit text boxes when the scale changes — the natural home is the
  existing `applyScreenRules` chokepoint (do **not** add a second one).
- **Guard:** extend the §4.2 pixel test to measure the label's **midpoint** and the box's containment
  at 1× / 4× / 0.5×, not just glyph size.

## A5. F9 — selection handles translate; §8.6 requires scale/stretch

- **Where:** `src/editor/tools/SelectTool.ts` — `updateTransform` calls `translateGeometryLocal` for
  **every** handle, and `handleAxis` maps `n/s → 'x'`, `e/w → 'y'` (inverted).
- **Proof (executed):** an `nw` corner drag of a 120×80 rect by (40,30) produced a pure translation —
  the opposite corner moved too.
- **Spec:** UI §8.6:585 — corner = scale with aspect locked; edge = free stretch. The axis lock and the
  96 px edge-suppression exist to serve resize, so as shipped they are decorative. The §8.6 rotate
  handle (40 px above the top edge) is likewise absent (chips only) and is **not recorded as owed**
  anywhere until now.
- **Fix:** corner = aspect-locked scale, edge = stretch, honouring `handleAxis`; keep it **one undo
  step**. A geometry-scale helper belongs beside the existing local `translateGeometryLocal` (do **not**
  add it to the frozen `src/domain/**`). Add the rotate handle or record it explicitly.
- **Guard:** a browser test that drags each handle and asserts the **expected corner moved and the
  opposite one did not**.

**Suggested lane split (files are disjoint):** one lane for A3+A5 (`SelectTool.ts` + the `SheetEditor`
drag path), one for A1+A2 (`EditorLayout.tsx` + `SheetEditor.tsx`), one for A4 (`render*.ts` +
`EditorCanvas.ts`). **A1/A2 and A3 share `SheetEditor.tsx` — give it to exactly one of them and wire
the other's seam yourself.**

---

# Part B — two deferred gates worth closing early

## B1. The real-touch proof for F1 (currently `fixme`)

`tests/e2e/layersReorderTouch.spec.ts` is written and wired but **cannot reach the editor**: it stalls
in **first-run step 2**, where the stubbed `showDirectoryPicker` (`() => navigator.storage
.getDirectory()`, an OPFS handle) does not satisfy the step-2 persistence path, so `FirstRun`'s
`disabled={busy}` never clears and Home is never reached. **The product is not implicated** — the
failure is in the harness, before F1's code runs.

This matters because F1's *mechanism* is proven only by a pure test and a browser test using a real
`elementFromPoint` — **neither is a real touch**, and real touch (implicit pointer capture) is exactly
what made F1 invisible for a whole slice. Fix by completing first-run legitimately (find what the step-2
path needs and provide it) or by seeding the persisted root handle directly. **Do not delete the spec
and never report it as a pass.** Precedent for a deferred harness: D53.

## B2. C4's machine half (owed, not dispatched)

C4's obstacle is gone — annotations exist, so "markup-layer redraw while panning a 4096-px sheet
carrying ~50 annotations at `pixelRatio = min(devicePixelRatio, 2)`" is constructible. The **decision**
remains hardware's (§21.8's ladder), so a dev-machine number is recorded **provisional, never a pass**.
⚠ Two docs previously claimed this was already dispatched; that was untrue and is corrected.

---

# Part C — slice 1.8: style system

**Packet:** `docs/implementation-plan.md` lines **1205–1258**. **Spec refs:** build spec §11.5, UI
spec §7. Read the packet in full before dispatch.

**Two-thirds of the UI already exists and is green but UNTRACKED**: `src/ui/StylePanel.tsx`,
`src/ui/StyleEditorSheet.tsx`, `src/ui/stylePanel.css`, `src/ui/styleCopy.ts`, `tests/stylePanel.test
.tsx` (44) and `tests/styleEditorSheet.test.tsx` (18). **Commit them as part of this wave** — they are
not yet in git, so `git add` them explicitly.

**Lane split (two lanes, disjoint):**

| Lane | Owns | Must not touch |
|---|---|---|
| **C1 — state + IO** | `src/state/styleByTool.ts`, presets IO (`.fieldmeasure/presets.json`, **atomic** via `projectStore`), `src/editor/shapes/scene.ts` (applying a style to a selection as one `History` command), tests | `src/ui/**`, `strings.ts` |
| **C2 — UI** | the five untracked files above + any prop change the pinned interface requires, tests | `src/editor/**`, `src/state/**`, `strings.ts`, `SheetEditor.tsx` |

**Pinned `StylePanelProps`** and the `StyleEditorSheet` shape are in the handoff-session-11 §Part C —
reuse them verbatim.

- **The Style Chip is a "do not simplify" item (§11.6):** always visible, a live **96 × 40 SVG of the
  actual next stroke** — never a swatch or a text label.
- **The pinned trap — the D31 rule:** the fraction chip during a dimension entry is **entry-scoped**;
  only the style panel's Precision control edits the **project** value, and every label must re-derive
  when it does. **Verify the keypad is still entry-scoped before touching it** — it is.
- **Integration:** fold `styleCopy.ts` → `strings.ts` from the appendix bytes → delete it; replace the
  **placeholder style chip** in `EditorLayout`'s docked style slot (keep the `panelDockFor` geometry);
  wire `onPrecisionChange` through the existing `persistQueue` path so it persists.
- **Known interface gaps in the pinned props, already reported by the built lane:** no `recents`
  channel (the §7.3 Recents row is therefore unbuilt), no selection **count**, no
  `onDeselect`/apply-to-selection/scope chip (§7.4 / §11.6 #5), no folder-unavailable flag, and
  `StyleEditorSheet` has no `onClose` (the built panel uses `onOpenEditorSheet` as a toggle).
  **Decide these explicitly** — extend the pinned interface (and record it) or record them owed. Do not
  let them disappear.
- **`AnnotationStyle` has only 8 keys**, so the tool-specific controls the specs list (corner radius,
  sides, chisel width, highlighter lock, erase mode/scope, inset border/opacity/crop/shadow) have **no
  data channel** in this slice's seam. Size + Bold are the only tool-specific keys that exist. Record
  the rest owed against the slice that adds them.

Gates: per the packet — style memory returns on a tool swap; mixed selection renders **indeterminate**
and a change applies to all and clears it; the precision control edits the **project** value and labels
re-derive; presets round-trip `presets.json` and survive a reload; a11y (mixed announced, disabled
controls keep a name explaining why, 48 px + 16 px slop, the swatch grid keeps its sanctioned sub-48
exception, Recents rise to 44 px).

---

# Part D — what remains after 1.8

```
1.9  Export — steps 2–5: renderStage.ts, pdf.ts, png.ts, ExportWizard.tsx
     (step 1, src/export/filenames.ts, shipped in slice 1.3's wave)
1.10 Safety & polish — the autosave chip (owns the read-only/failed-save state the queue
     currently parks and retries), the Offset Nudge Pad, the 2.0 timing gates
1.11 Release & update — install-runbook execution, THIRD-PARTY-NOTICES licence fields,
     the service-worker update strategy
2.0  Field pilot — C7, and the only checkpoint that legitimately ends in "ask the human"
```

**1.9 is the next acceptance gate that matters most:** the export-invariance rule (`0.75 × mu` pt at
every multiplier M) is the whole slice, and `src/export/renderStage.ts` must be the **only** place that
scales for export — the §4.2 screen and export paths are opposites, and both are load-bearing.

---

# Part E — standing context (do not re-derive)

**Contracts that must not break**
- **§4.2 screen vs export scaling are opposites.** Screen: strokes `strokeScaleEnabled:false` +
  `strokeWidth = mu`, text `fontSize = mu / s`, ink outline regenerated at `mu/s` on zoomend.
  **Fills ignore `strokeScaleEnabled`** — that is how ink width drifts. `applyScreenRules` in
  `EditorCanvas.ts` is the single chokepoint; **F7's fix must extend it, not duplicate it.**
- **There is no stored `label`** — labels derive from `valueMm` + project precision + unit format.
- **`pressure` is a parallel array**; `Px` has no `pressure` member. `svgPath.strokeInputPoints` is the
  one place that indexes it.
- **Children are not sheet z-band members** (1.7). A child's `zIndex` orders it inside its inset's
  group; the reorder primitives return `false` for any key containing `/`.
- **Canvas tests never in jsdom** (D40); the browser project or Playwright/CDP.
- **CSP-as-a-test stays green** — no inline `style=""`. This is why the mini-toolbar uses the
  `.placement-hud` slot rather than `miniToolbarPosition`, and why the Style Chip's preview is SVG.
- **All disk writes via `projectStore`**; **no new runtime dependencies** (§2.2 is closed);
  **imperative Konva only** (never react-konva).
- **D51:** the runtime project key is `${id}:${folderName}` everywhere.

**Checkpoint / hardware ledger (never fake):** C1 ✅ · C2 ✅ · C3 ✅(provisional) · **C4 ⬜ owned — see
B2** · C5 ✅ · C6/C7/C8 ⬜ · **C9 machine half ✅ / pen PENDING** · **C10 machine half ✅ / on-glass walk
deferred**. `min(dpr, 2)` ships until hardware says otherwise.

**Watch items carried forward**
1. **D77 F3, F5, F6, F7, F9** — the review's remaining findings; F7 is the only **measured** rendering
   defect. Part A.
2. **The real-touch e2e gate is `fixme`, not passed** (Part B1). Never report F1's real-input half as
   proven.
3. **Object groups exist nowhere** — no model in `SelectTool`, `scene.ts` or the panel; Group/Ungroup
   are correctly disabled. Their own slice.
4. **The synthetic photo row's lock cannot persist** until the photo is modelled as an annotation.
5. **Rename is a deliberate no-op** — annotations carry no name; either remove it from the row menu or
   sanction a stored field.
6. **The camera has no in-app inset path** — `onPickCamera` uses a hidden `capture="environment"` input,
   a real OS camera but not UI §9:614's in-app viewfinder; needs a `CameraFlow` inset mode or a spec
   amendment.
7. **The inset decode-error state is unreachable** (`inset.openError` / `chooseAnother` / `removePhoto`
   exist, nothing surfaces them).
8. **Second-tap-to-Focus is wired but not independently tested** (needs a drawn layer before
   hit-testing; `getIntersection` reads a stale hit canvas).
9. **`⚠ PROPOSED (C14)` copy still needs a content owner** — including the stale refusal sentence
   («Fraction must be smaller than 1/16» → `1/{denominator}`).
10. **The 14 tool glyphs are placeholders** (D68) — must not ship to 2.0 un-reviewed.
11. **Targets remain CSS-declared, not measured** (keypad 48–72 px; panel 320/56/48 px) — same class as
    **D64**'s unproven dpr-2 path.

**Environment quirks that cost real time**
- **Never verify copy through the console:** `Select-String` renders U+2014 as `-` while `git diff`
  renders `—`, and `[regex]::Escape()` + `-SimpleMatch` searches for a literal backslash-space. Use
  byte-level `node` reads or `tests/strings.test.ts`.
- **Encoding:** sources are LF UTF-8; `docs/*.md` are **CRLF** (a script rewriting a doc must restore
  CRLF). A lane can write **CP1252 into a UTF-8 source file** — it once broke `npm run build` while
  every test stayed green. On `UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8`, scan for
  invalid bytes rather than hunting a code error.
- **The background job board is unreliable by design:** finished lanes read "running, status uncertain"
  forever; `task_result`/`task_status` may not see terminal state; `task_message` is lease-limited
  (retry on "message/control lease unavailable"); `task_revive` works. **Trust the completion
  notification and the files on disk. Do not poll.**
- Node 24.19 · npm 11 · Vite 8.3 · Vitest 5.0.1 · TS 5.9.3 · React 19.3 · Konva 10.6 · Playwright 1.63.

**Stop and ask the human only for:** a gate failing three times with three genuinely different fixes
(runbook §6); anything needing a **new runtime dependency** or violating an `AGENTS.md`
non-negotiable; a **destructive or outward-facing** action (deleting user data, force-push, deploy,
publish). Everything else: decide, record it in `docs/DECISIONS.md`, and keep going.

---

# Session 12 in one paragraph

Slice 1.7 (image insets) shipped complete — the §8.5 coordinate model as executed pure geometry, a
Konva container verified against `_drawChildren`, content-addressed assets, one-level Focus, child
addressing outside the sheet z-bands, the props-driven picker, and the full shell wiring — with three
lanes run in parallel on disjoint file sets. The **independent adversarial review the owner had waived
over 1.4→1.6 was run** (D77) and found **six correctness defects, no wrong-measurement and no
data-loss**; four are fixed (F1 touch reorder was silently dead, F2, F4, F8), five are owed (Part A).
Four of the six shared one shape — *wiring that exists, tests that pass, and a real input that cannot
reach it* — which is worth carrying into every review you run. Two of the eleven findings were the
orchestrator's own and are corrected, including a gate number that was not reproducible from its
commit; the rule that fixes it is now written down and was applied to this session's own gate.
