# Handoff — next orchestrator (session 11 → 12)

**Written:** 2026-09-21 · **Branch:** `main` · **Last slice commit:** `0649fa3` (feat(1.6)) · docs refresh in this commit.

This is the working handoff. `docs/CONTINUITY.md` is the live snapshot; the last entries of
`docs/BUILD-LOG.md` are the per-slice record. Where they disagree with this file, they win — this file
is a briefing, not state.

---

## 0. State on entry — verify this first

| Field | Value |
|---|---|
| Branch / tree | `main`, clean, pushed to `origin/main` |
| Slices shipped | **0.2 · 1.1 · 0.3 · 1.2 · 1.3 · 1.4 · 1.4.5 · 1.5 · 1.6 (PARTIAL)** + slice 1.9 **step 1 of 5** |
| Gate (orchestrator-run, reconciled tree) | `npx tsc --noEmit` **0** · `npx vitest run` **526 / 40 files** · `npm run build` **0** (17 precache) · `npx playwright test` **5 passed / 4 skipped** |
| Checkpoints | C1 ✅ · C2 ✅ · C3 ✅ (provisional) · **C4 fired, not measurable until annotations exist** · **C5 ✅** · C6–C7 ⬜ · C8 ⬜ · **C9 machine half ✅, pen PENDING** · **C10 machine half ✅, on-glass walk deferred** |
| Independence of review | ⚠ **Sessions 11's batch (1.4/1.4.5/1.5/1.6) has NOT had an independent adversarial review.** The owner waived the `@oracle` pass; an orchestrator internal review was run and the waiver is recorded in DECISIONS + CONTINUITY. Treat those four slices as *gate-green but not independently reviewed*. |

**Read order:** `docs/CONTINUITY.md` → `docs/BUILD-LOG.md` (last 3 entries: 1.6, 1.4+1.4.5, 1.5) →
`AGENTS.md` → `docs/BUILD-RUNBOOK.md` (esp. **§11 parallel-lane protocol**, §12 review brief) → the plan
packet for your slice → `docs/DECISIONS.md` (**D67–D73 are this session**).

---

## 1. What exists now (so no lane re-builds it)

**Media** — `src/media/normalizeImage.ts` (`normalizeImage`, `sha256Hex`), `exif.ts` (APP1 scan bounded
to 64 KB, `stripExif`), `thumbnails.ts`, `decodeWorker.ts` (real decode, `decodedIn` provenance).

**Storage** — `src/fs/projectStore.ts` (all atomic writes; `writeAtomic` takes the per-project Web Lock
itself), `src/fs/backend.ts` (FSA + OPFS), **`src/fs/sheetIntake.ts`** — the single "a photo becomes a
sheet" write path (`addSheetFromPhoto`, `defaultSheetTitle`), used by both the editor import and the
capture flow. `src/state/persistQueue.ts` is the sole markup writer.

**Domain** (frozen, exhaustively tested — do not edit; if you think it's wrong, stop and report) —
`src/domain/{units,schema,geometry,snapping,ids,migrate}.ts`.

**Canvas + input** — `src/editor/EditorCanvas.ts` (5 layers, per-layer `pixelRatio`, hand-rolled pinch,
the **§4.2 screen-rules seam**: `applyScreenRules` + the `screen*` helpers are the single chokepoint for
every zoom path — do not add a second), `src/editor/inputRouter.ts` (touch-first; never re-derive).

**Document + tools** — `src/editor/shapes/scene.ts` (in-memory `Annotation[]`, Konva sync,
`AnnotationPath`/`pathToKey`/`keyToPath`, §20.2 z-bands, `markupFile`/`load`, `onChange`), `svgPath.ts`
(**`strokeInputPoints` is the only place that indexes the parallel `pressure[]`** — see §5),
`renderDimension/renderShape/renderInk/renderText/dimensionLabel.ts`; `src/editor/tools/`
(`DimensionTool` placement machine, `ShapeTool`, `AngleTool`, `FreehandTool`, `TextTool`, `EraseTool`,
`SelectTool`, `toolTypes.ts`); `src/editor/{history,Loupe,session}.ts`.

**Shell** — `src/ui/EditorLayout.tsx` (`panelDockFor`, `railSideFor`, `sheetEditorToolFor`),
`ToolRail.tsx` (14 tools / `TOOL_DEFS`, `implemented` flags), `TopBar.tsx`, `icons/tools/*`
(**placeholder art**), `DimensionKeypadSheet.tsx`, `CameraFlow.tsx`, `LayersPanel.tsx`
(**built + tested, NOT mounted**), `src/state/editorStore.ts`, `strings.ts` (the only home for copy,
machine-checked by `tests/strings.test.ts`).

**Routing** — `src/App.tsx`: first-run → home → settings → editor, with `EditorLayout` and `CameraFlow`
lazy-loaded (Konva is out of the Home chunk: main 345 kB, `EditorLayout` 303 kB).

---

## 2. What shipped this session (and what it cost)

| Slice | Result |
|---|---|
| **1.4 capture flow** | `CameraFlow.tsx` + `camera.css`; mounted from the TopBar overflow's «Add sheet» as a lazy overlay; `SheetEditor` gained an additive `sheetId` seam so «Use photo» lands on the photo just taken (previously it always opened `sheets[0]`). |
| **1.4.5 editor shell** | `EditorLayout`/`ToolRail`/`TopBar`/`editorStore`/14 glyphs; `panelDockFor` inclusive-1.2 boundary; lazy editor route. |
| **1.5 dimension flagship** | `DimensionTool` (tap-tap commits at B, **450 ms** settle, acquire 32 → lock 20, chain, refine 40 px), `Loupe` (pen 3.5× derived source; touch 200/4×/50 px, 136 px offset), `DimensionKeypadSheet` (48 tests), `history.ts`, `session.ts`. **D63 discharged** (second-finger restore is live and browser-tested). |
| **1.6 markup tools (PARTIAL)** | Shapes/angle/freehand/highlighter/text/erase/select; scene extended to every §3.3 kind with §20.2 z-bands; ink regeneration on zoom; **`markup.json` persistence wired** (the D70 carry-in is closed — markup survives a reload). |

Two defects the **gate** caught that the lanes could not — both worth remembering:

1. **A CP1252 em dash (byte `0x97`) in `src/styles.css`** made the file invalid UTF-8 and broke
   `npm run build` (`UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8`) while `tsc` and 526
   tests were **green**. Repaired, then the whole tree was swept. Vitest's transform is lenient;
   rolldown's is not. **Keep the build in the loop.**
2. **A staged copy module's own "proposed keys" list disagreed with its own object paths**
   (`selection.*` vs `select.*`), which would have folded **eight proposals unmarked**. The fold now
   takes provenance from the appendices. **A hand-maintained "which keys are proposed" list is a second
   source of truth that can silently lie.**

---

## 3. Owed work — in priority order

### A. Close slice 1.6's three wiring items (a focused slice; the code exists, the wiring does not)
1. **Mount `LayersPanel`.** The TopBar `Layers` button is still `disabled`. A real mount needs, in
   `scene.ts`: visibility, lock, rename and z-order methods; a `History` command for each; and a
   `layersOpen` state in `editorStore` (mirror the existing `keypadOpen` pattern, which the shell
   already reads for the 40 % dim). Then rows are built from `scene.entries()`/`list()` and the panel's
   six callbacks are wired. **Do not wire the button to an empty shell to make a gate look green.**
2. **Finish `SelectTool`'s shell wiring** — marquee-on-empty-drag, the rotate UI, groups, the lock
   toast and the mini-toolbar pin are implemented **and pure-tested in the class** but not driven by
   `SheetEditor`'s pointer/long-press handling.
3. **Drive the erase 600 ms long-press preview** — `isErasePreview`/`EraseTool.beginPreview` exist and
   are pure-tested; no timer calls them.

### B. Then the plan's next slices
`1.7 image insets` → `1.8 style system` → `1.9 export steps 2–5` (`renderStage.ts`, `pdf.ts`, `png.ts`,
`ExportWizard`) → `1.10 safety & polish` (autosave chip, layers flyout, themes, undo/redo affordances,
arrow-nudge) → `1.11 release & update` → `2.0 field pilot`.

### C. Hardware ledger (never fake; all PENDING in `docs/HARDWARE-TEST-CHECKLIST.md`)
- **C4** — markup-layer redraw at `min(dpr,2)` on a 4096-px sheet with ~50 annotations. Now
  *measurable*: annotations exist as of 1.6. `min(dpr,2)` ships until hardware says otherwise.
- **C9 pen half** — hard-press vs light stroke at equal style width.
- **C10 on-glass walk** — 10 tap-tap placements with the loupe/nudge recovery checks.
- **C8 palm gauntlet**, the 320 px Layers flyout / 56 px row / 48 px target walk, the 4-dims timing
  gates, and the tile-time gates from the 0.2 spike.

---

## 4. Potential issues / watch items (new or sharpened this session)

1. **No independent review on 1.4–1.6.** The internal review checked the high-stakes claims it could
   (no stored `label`; the D65 loupe arithmetic; D63 restore live; the 450 ms settle; the refusal
   table; persistence wired; the F7 parallel-array trap) but it is not a substitute. If a defect class
   like session-9's F1 is lurking here, this is where it is.
2. **`markup.json` under a read-only project** is not suppressed: the queue parks and retries. The
   1.10 autosave chip owns that state; until then a read-only project accumulates parked writes.
3. **The keypad's 48–72 px target floor is CSS-declared only** (jsdom has no layout) — same class as
   **D64**'s unproven dpr-2 path. Neither is measured; both are logged.
4. **`SelectTool`'s grouping exists but nothing drives it**, and `LayersPanel`'s `Group`/`Ungroup`
   render **disabled** — consistent, but both must land together.
5. **Group-level mass-restyle (UI §9) is not expressible** with `AnnotationPath`-keyed selection; it
   needs an `onSelectGroup` channel.
6. **UI §8.6 contradicts itself on long-press** ("400 ms starts the drag" vs "long-press = row menu").
   Resolved as **grip = drag, row body = menu**. UI §8.1's "360 px" sheet is also **arithmetically
   impossible** with its own contents (538 px computed); the sheet is sized content-wise. Both spec
   numbers still need correcting in the UI spec.
7. **Two proposed-copy items need a content owner** (Open question 1): the refusal reason
   «Fraction must be smaller than 1/16» is **stale under D31** (the denominator is entry-scoped →
   recommend `1/{denominator}`), and the whole `⚠ PROPOSED (C14)` set across slices is unapproved.
8. **`PendingOp` has no generic-shape member** — a generic shape/ink placement borrows `'polygon'` so
   `Esc` cancels instead of exiting. Fine functionally; worth a proper member when `editorStore` is next
   touched.
9. **Placeholder art** — the 14 tool glyphs are placeholders and must not ship to 2.0 un-reviewed
   (recorded in D68).
10. **Background-job board is unreliable by design**: `client.session.status` is unavailable, so
    finished lanes read "running, status uncertain" forever, and `task_result`/`task_status` may not see
    terminal state. **Trust the completion notification and the files on disk. Do not poll.**

---

## 5. Contracts the lanes must not break

- **D51** — the runtime `projectId` is `${id}:${folderName}` everywhere (registry, writer lease,
  `persistQueue`, Web Lock, BroadcastChannel). Never a bare id.
- **§4.2 screen vs export scaling are opposites** (AGENTS #6). Screen: strokes
  `strokeScaleEnabled:false` + `strokeWidth = mu`; text `fontSize = mu / s`; ink outline regenerated at
  `mu / s` on zoomend. **Fills ignore `strokeScaleEnabled`** — that is how ink width drifts.
- **No stored `label`** (AGENTS #2) — labels derive from `valueMm` + project precision + unit format.
- **`pressure` is a parallel array**; `Px` has no `pressure` member. Index `pressure[i] ?? 0.5` — the
  only place that does is `svgPath.strokeInputPoints`. A cast silently pins every point to `0.5`.
- **Canvas tests never in jsdom** (D40) — `getIntersection` returns `null` there. Canvas tests go in
  the browser Vitest project or Playwright.
- **CSP-as-a-test stays green** — no inline `style=""`; Konva assigns CSSOM properties directly.
- **All copy in `src/ui/strings.ts`**, from the appendices, machine-checked by `tests/strings.test.ts`
  (approved = byte-verbatim; gaps/neither = requires a `// ⚠ PROPOSED (C14)` marker in the preceding
  comment block — a blank line clears it).
- **All disk writes via `projectStore`** (tmp → close → `move()`), under the per-project Web Lock.
- **No new runtime dependencies** (spec §2.2 is closed); `crypto.randomUUID()` for ids.
- **Imperative Konva only** — never react-konva.

---

## 6. How to run the next batch (the shape that worked)

1. **Check the contended set and pick one writer per file** (runbook §11). Today's contended files:
   `strings.ts`, `styles.css`, `App.tsx`, `appStore.ts`, `editorStore.ts`,
   `docs/{HARDWARE-TEST-CHECKLIST,DECISIONS,BUILD-LOG,CONTINUITY,CHECKPOINTS}.md` — **all `docs/` are
   orchestrator-only**; lanes report findings and the orchestrator writes the entry.
2. **If two lanes both need `strings.ts`**, the non-owner stages copy in `src/ui/<slice>Copy.ts`; the
   orchestrator folds it **from the appendix bytes** and deletes the module. (Two proven folds done this
   session; the fold scripts live in the session's temp dir, not the repo.)
3. **Never let one lane import a sibling's in-flight file.** Pin the interface in both briefs; wire the
   seam at integration.
4. **Per-lane verification is a subset:** `npx tsc --noEmit` + `npx vitest run --project node --project
   jsdom`. One designated lane (the canvas owner) may also run `--project browser`. **No lane runs
   `npm run build` or `npx playwright test`** — shared `dist/` and ports. The orchestrator runs the full
   gate on the reconciled tree.
5. **Integration checklist:** fold staged copy → wire deferred seams → read the diffs (not just the
   reports) → full gate → review against `docs/review-brief.md` → resolve → re-run the gate → BUILD-LOG +
   DECISIONS + CONTINUITY (+ CHECKPOINTS if one fired) → commit with the slice number in the subject →
   push.
6. **Commit granularity:** when waves share files (`strings.ts`, `SheetEditor.tsx`, `EditorLayout.tsx`),
   a per-slice split needs hunk surgery and would leave commits that do not build. One green commit
   naming all the slices in the subject beats three that lie.

---

## 7. Environment quirks that cost real time (accumulated)

- **Windows/PowerShell:** prefix every command with `$env:Path = "C:\Program Files\nodejs;" + $env:Path`;
  use `npm.cmd`/`npx.cmd` (`npm.ps1` is blocked). **No heredocs** — write commit messages to a file and
  use `git commit -F <file>`.
- **Never verify copy through the console.** `Select-String` renders U+2014 as `-` while `git diff`
  renders `—`; `[regex]::Escape($p)` + `-SimpleMatch` searches for a literal backslash-space. Both have
  produced **false** findings. Use a byte-level `node` read, or `tests/strings.test.ts`.
- **Encoding:** source files are LF UTF-8, `docs/*.md` are CRLF; a script that rewrites a doc must
  restore CRLF. **A lane can write CP1252 into a UTF-8 file** (§2 above) — run `npm run build` before
  committing, and if it fails with `UNLOADABLE_DEPENDENCY`, scan for invalid UTF-8 bytes rather than
  assuming a code error.
- **Background tasks:** finished lanes may read "running, status uncertain" forever; only one
  `task_message` lands per task (retry on "message/control lease unavailable"); `task_revive` works for
  a cancelled/stopped session. **Do not poll.**
- Node 24.19, npm 11, Vite 8.3, Vitest 5.0.1, TS 5.9.3, React 19.3, Konva 10.6, Playwright 1.63.

---

## 8. Stop and ask the human only for

1. A gate that fails three times with three genuinely different fixes attempted (runbook §6).
2. Anything needing a **new runtime dependency** or violating an `AGENTS.md` non-negotiable.
3. A **destructive or outward-facing** action: deleting user data, force-push, deploy, publish.

Everything else: decide, record it in `docs/DECISIONS.md`, and keep going.
