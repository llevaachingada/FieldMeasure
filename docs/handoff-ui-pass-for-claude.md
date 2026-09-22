# Handoff for Claude Code (Opus) — the UI/GUI pass: make every control real, and make it slick

**Audience:** you, an agent with the repo in front of you. **Goal:** the app's tool rail, style panel, canvas
HUDs, mini-toolbar, layers panel, overflow menus and project/grid chrome should **all be fully functional and
coherent**, with nothing dark, nothing disabled-that-should-work, and a look that reads as one slick product
rather than a set of stubs.

**This brief is self-contained.** I have done the recon for you: every fact below is verified on the tree and
carries `file:line`. You should not need to crawl the repo to know what is broken or why.

**Written:** 2026-09-22 · `main == origin/main` at `d2bd8ad` · gates green: `tsc` 0, **101 files / 1413 tests**,
`build` 0, `playwright` 5/5, `clickthru` 20/20.

---

## 0. Read these five things, in this order, and nothing else first

| # | File | Why |
|---|---|---|
| 1 | `AGENTS.md` | The **contract**: non-negotiables. It is not a status file. |
| 2 | `docs/ui-spec-field-measure-v2-hardened.md` | The **look/feel authority** (§7 style panel, §8 objects/mini-toolbar, §6 rail, §11 screens, §14 a11y, §19.6 targets). |
| 3 | `docs/handoff-session-23.md` | My current-state handoff: gates, owed work, the traps. |
| 4 | `docs/clickthru-harness.md` | **How to look at the app.** Run it before and after. |
| 5 | `docs/DECISIONS.md` **D126–D131** | What the last wave did to the chrome (glyphs, the fit, the rail side, the a11y audits). |

**Do not read the whole `docs/` tree.** Everything you need about the *chrome* is in this brief.

---

## 1. The one architectural finding that explains most of the dark UI

**`AnnotationStyle` has no data channel for the per-tool controls.** It carries exactly eight keys
(`src/domain/types.ts:13-22`):

```ts
strokeColor, strokeWidthMu, fillColor, fillAlpha, lineStyle, arrowheads, fontSizeMu, bold
```

Everything the spec asks for beyond those eight — **rectangle corner radius**, **polygon sides / closed-path**,
**arc radius**, **highlighter chisel width**, **erase mode/scope**, **inset border / corner radius / shadow /
crop**, **arrow elbow** — lives on `Geometry` (for two of them: `rect.cornerRadius?` at `types.ts:34`, and
`arrow.elbow?` at `:33`) or **nowhere at all**. The style panel's own header says this outright
(`src/ui/StylePanel.tsx:44-47`):

> `lineStyle`/`arrowheads`/`fill`/`fontSize`/`bold` are the only per-control style keys `AnnotationStyle`
> carries. Tool-specific controls outside that set (corner radius, sides, arc radius, chisel width, erase
> mode/scope, inset border/crop) have no data channel in this seam and are owed.

**Consequence:** you cannot "populate the buttons" without extending the schema first. This is the highest-value
work in the whole pass, and it is a *schema + migration + render + panel* change, not a CSS change. See §4.1.

---

## 2. The inventory: what is dark, broken, stubbed, or misnamed — with exact locations

### 2.1 Tools that *look* available but are disabled or inert

| Control | Location | Reality |
|---|---|---|
| **Group / Ungroup** | `src/ui/LayersPanel.tsx:784,787` (`disabled`), header comment `:30` | **No group model exists anywhere.** `groupId` is specified (§20.4) but unbuilt. Two permanently dead menu rows. |
| **Rename (Layers row)** | `src/ui/LayersPanel.tsx:794` | Runs, but annotations carry **no name** (AGENTS: "there is no `label` field"); names derive. Recorded as "a deliberate no-op" — it should be *removed or made meaningful*, not left inert. |
| **Inset disabled inside Focus** | `src/ui/EditorLayout.tsx:67-69,679-680` | Intentional (one-level nesting) **and** has a reason string — this is the correct pattern; use it as your template. |
| **Project screen ⋯ menu** | `src/ui/ProjectScreen.tsx:425-438` | **Five rows disabled**: `rename`, `copyPath`, `revealFolder`, `deleteProject`, `projectSettings`. Only `export` and `trash` work. |
| **Editor overflow menu** | `src/ui/TopBar.tsx:88-97` | **Seven of ten rows have no `run`** (`duplicateSheet`, `insertImage`, `sheetInfo`, `projectSettings`, `settings`, `help`, `keyboardShortcuts`). Only `export`, `addSheet`, `importFile` work. |
| **Home `Open existing folder…`** | `src/ui/ProjectList.tsx:215-296` | Disabled; `App.onOpenFolder` is a **no-op** (`src/App.tsx`). The spec (§11.1:661) says it opens `showDirectoryPicker`; **it is unspecified whether that re-points the projects root or adopts an outside folder** — that is an owner question (see §6). |
| **Settings rows** | `src/ui/Settings.tsx:338` (Project settings, disabled), `:402-403` (`Trash…`, disabled), `:319` (Metric, disabled by scope §2.4) | Two are dead-by-omission; `Trash…` has a real grid entry point but not one here. |
| **Mini-toolbar** | `src/ui/SheetEditor.tsx:2429-2462` | Renders **only**: rotate stops (×3), `Lock`, `Delete`. The spec (`ui-spec:590`) requires **`Duplicate` · `Delete` · `Lock` · `Bring to front`/`Send to back` · `Copy style`/`Paste style` · `Edit points`** (+ `Replace photo`/`Focus` for insets, `Edit text` for text). Its own comment admits it "reuses the HUD slot — the CSP forbids inline styles, so it cannot carry a computed anchor (reported owed)". |
| **Erase scope chips** (`Ink`/`Markup`/`Everything`) | spec `ui-spec:601` | **Not in the panel at all.** `eraseMode` lives as local component state (`SheetEditor.tsx:326`, rendered at `:2399-2412`) with no data channel. |
| **Radial quick-menu** | spec §11.4 / §2.4:246 | **Not built** — and correctly *degraded* (D128: a pen barrel press is a no-op). The spec's own rule: "radial absent rather than broken". |

### 2.2 Controls the spec requires that do not exist yet

From `ui-spec:590-602` and §7.2 — **none** of these are present, and §4.1 is why:

`Duplicate` · `Bring to front` / `Send to back` · `Copy style` / `Paste style` · `Edit points` · `Edit text` ·
`Replace photo` / `Focus` (as mini-toolbar items; `Replace photo` exists in the *grid* and *inset* flows) ·
rectangle **corner radius** · polygon **sides** / **closed path** · arrow **elbow** (straight/right/curved) ·
highlighter **chisel width** / **straight-line lock** · freehand **pressure→width** / **smoothing** ·
inset **border / corner radius / shadow / crop** · text **align / background / leader** · dimension **precision
row already exists** (`StylePanel.tsx:1262-1305`) but **`Elbow`** does not.

### 2.3 Copy that names the wrong thing (the project's signature defect class)

- The **deep style sheet**'s 48-swatch palette now uses `colorName(hex)` (fixed D129) ✔.
- **`STRINGS.capture.adding`** is rendered as the *saving* label in one stage (D120 fixed the stage split) ✔.
- `src/ui/StylePanel.tsx` `S.precisionDimensionOnly` ("Precision applies to Dimension only") is a **reason
  string** — good; keep that pattern for everything in §4.1.

### 2.4 What is genuinely *sound* — do not rebuild these

The 14 tool glyphs are real and distinguishable (D126); the rail honours handedness (D127); the editor chrome
**fits** at 1920×1120 and 1440×960 with no internal scroll; the grid scrolls with a fixed top bar and
drag-autoscrolls; the card menu is portalled and keeps its keyboard contract; both a11y contracts were audited
by execution (D129/D130); the arrow nudge works; the dimension keypad, capture flow, export wizard and trash
panel are all functional and were verified end to end by the clickthru.

---

## 3. What "slick and clean" means **here** (non-negotiable constraints)

This project has a closed design system. **Do not import a component library, do not add a runtime dependency**
(AGENTS #5), and **do not use inline styles** — the CSP is `style-src 'self'` and the e2e suite asserts
`[style]` count === 0 (`tests/e2e/csp.spec.ts:44`).

- **Tokens:** the "Site Slate" set in `src/styles.css:45-58` (`--g900`…`--g000`, `--hi`, `--sel`, `--err`,
  `--warn`). Reuse them; new colours need a spec line.
- **Pattern for state without inline styles:** a `data-` attribute dressed in the component's own CSS
  (`.style-panel.css`, `projectScreen.css`, `camera.css`, `editorShell.css`). This is used everywhere — copy it.
- **Pattern for a computed position without inline styles:** `element.animate()` (Web Animations adds no
  `style` attribute). The «Drop to move» chip (`ProjectScreen.tsx`) and the portalled card menu are the two
  working precedents. **This is the sanctioned answer to the mini-toolbar's "cannot carry a computed anchor".**
- **Targets:** 48×48 CSS px minimum for anything touchable (§19.6), `.hit-slop` (+8 px per side) where the visual
  box is smaller, and **hit areas must not overlap** (§14.5). Two 44 px grids are sanctioned (swatches, Recents).
- **A11y is per-slice, not a final pass** (AGENTS): accessible name on every control, visible focus ring
  (`:focus-visible`, `styles.css:103-106`), logical tab order (`ui-spec:832` — top bar → rail → canvas → panel),
  no keyboard trap. **`tests/editorA11y.browser.test.ts` and `tests/gridA11y.browser.test.ts` are your
  templates** — they measure targets, tab order, names and traps in real Chromium. Extend them.
- **Copy comes from `docs/appendix-strings.md`**, or is marked `⚠ PROPOSED (C14)` in `src/ui/strings.ts`;
  `tests/strings.test.ts` is the gate. Never invent wording silently.
- **The disabled-with-a-reason pattern** (`EditorLayout.tsx:67-69`) is the house style for a control that must
  exist but cannot act. A *dead-but-live-looking* control is the worst outcome in this codebase.

---

## 4. The work, in the order that produces the most value

### 4.1 FIRST: give the per-tool controls a data channel (this unblocks ~everything below)

This is the single highest-value change. It is not UI work; it is the schema work the UI has been waiting for.

1. **Extend `AnnotationStyle`** (`src/domain/types.ts:13-22`) with the per-tool keys the spec names. Suggested
   shape (all optional or defaulted, so existing documents stay valid):
   `cornerRadius?: number` · `polygonSides?: number` · `polygonClosed?: boolean` · `arcRadius?: number` ·
   `chiselWidthMu?: number` · `straightLineLock?: boolean` · `pressureWidth?: boolean` · `smoothing?: number` ·
   `textAlign?: 'left'|'center'|'right'` · `textBackground?: 'none'|'pill'|'solid'|'auto'` ·
   `leader?: boolean` · `arrowElbow?: 'straight'|'right'|'curved'` · `insetBorder?: boolean`/`insetRadius?: number`
   · `insetShadow?: boolean` · `eraseScope?: 'ink'|'markup'|'everything'`.
   **Prefer `AnnotationStyle` over `Geometry`** for anything a user sets once and applies to a selection —
   `Geometry` already carries `rect.cornerRadius` and `arrow.elbow`, so **either migrate those into the style
   (with a `migrate.ts` step and a schema version bump) or document why they stay** — do not end up with two
   sources of truth for the same control.
2. **`src/domain/schema.ts`** — add the keys to `AnnotationStyleZ` (**defined at `:46`**, wired into the
   annotation at `:85`) with `.nullish()` or
   `.default()` so old files parse, and (per §3.1) bump the schema version in `src/domain/migrate.ts`.
3. **`DEFAULT_STYLE`** (`types.ts:24-27`) — add the defaults, and keep them *conservative* (a new key must not
   change how an existing document renders).
4. **Render** — each key must reach the canvas (`src/editor/shapes/renderShape.ts` for rect/ellipse/polygon,
   `renderDimension.ts`, `renderText.ts`, `renderInk.ts`, and `src/editor/inset/renderInset.ts` for inset
   border/shadow/crop). §4.2 of AGENTS applies: **screen vs export scaling are opposites** (§4.2) — anything you
   add that has a size must honour `strokeScaleEnabled:false` / `mu / s` on screen and `mu × M` on export. The
   invariant is **`0.75 × mu` pt at every M**.
5. **Panel** — `src/ui/StylePanel.tsx` gains one section per tool that needs it, each with
   `hidden={hideUnused([...])}` (the pattern defined at `:797`, first used at `:960`; §7.2's "contextual, not a
   fixed form") and `disabled={notApplicable(...)}`.
   **Every disabled control keeps an accessible name that says WHY** (`S.precisionDimensionOnly` is the model).
6. **Tests** — extend `tests/schema.test.ts`, `tests/migrate.test.ts`, the render tests, and the browser
   `markupTools`/`shapeTool` suites. **A new key with no render test is a stub.**

*Why this first:* every missing button in §2.2 becomes a 20-line panel section once the channel exists — and
**without it, any button you add is a lie**, which is the one thing this codebase will not tolerate.

### 4.2 The mini-toolbar, to spec (`ui-spec:590`)

Ship the full pill: `Duplicate` · `Delete` · `Lock` · `Bring to front` / `Send to back` · `Copy style` /
`Paste style` · and the tool-specific extras (`Edit points` first for measurement objects; `Replace photo` /
`Focus` for insets; `Edit text` for text). Under touch it is **64 px tall, 56 px buttons, anchored 16 px above
the selection, flipping below when headroom < 160 px** (`ui-spec:590`, touch-first).

- **The anchor problem is solved** — use `element.animate()` (§3). Today it reuses the `.placement-hud` slot
  because a computed anchor needed an inline style (`SheetEditor.tsx:2429-2431`); that reasoning is now obsolete.
- Everything here must be **undoable** (spec's own words) — reuse the existing commands
  (`SelectTool.rotateBy`/`deleteSelection`/`nudgeSelection`, which use `history.execCoalesced`; see §5).
- `Copy style`/`Paste style` need a small clipboard in `styleByTool` or the editor store — one slot, and a
  toast that names what was copied.

### 4.3 Fill in the overflow menus (they are already wired for it)

- **Editor** (`src/ui/TopBar.tsx:88-97`): `Duplicate sheet` (the grid's `duplicateSheet` already exists in
  `src/fs/sheetOps.ts` — reuse it), `Insert image` (opens the inset picker,
  `src/ui/ImageInsetPickerSheet.tsx`), `Sheet info` (a small dialog: dimensions, counts, created/updated —
  the data is in `ProjectSheetCard`), `Project settings` (the spec'd sheet, `ui-spec:726`), `Settings` (route
  exists), `Help` / `Keyboard shortcuts` (a real key list — `ToolRail.tsx:110` already documents the hotkeys).
- **Project screen** (`src/ui/ProjectScreen.tsx:425-438`): `Rename` (project **title**, `renameSheet`'s
  project-level sibling; the copy already exists and states the folder is not renamed), `Copy path` (clipboard),
  `Reveal folder` (`showDirectoryPicker({ startIn })` — `runExport.ts:698` has the working precedent),
  `Delete project` (hold-to-confirm 600 ms + the trash philosophy: state exactly what is deleted),
  `Project settings`.
- **Rule to keep:** if you cannot make one work honestly, leave it disabled **with a reason**, or delete it.
  Never ship a live-looking dead row.

### 4.4 Groups, and the two dead Layers rows (`LayersPanel.tsx:784,787`)

`groupId` is fully specified in §20.4 (flat, no nesting, no cross-container groups, transforms apply to all
members). Implement it, then wire `Group`/`Ungroup` — or, if you judge it out of scope for this pass, delete
the two rows and record why. **Do not leave them.**

### 4.5 Then make it *slick*

Only after the buttons are real. Concretely, and in this order of payoff:

1. **One visual language for "chrome surfaces"** — the rail, style panel, HUDs, mini-toolbar, menus and sheets
   currently each carry their own copy of the same surface treatment (`--g800`/`--g750`, 14 px radius, 2 px
   border, one shadow). Unify into **two or three shared classes** in `src/styles.css` and delete the copies.
   That alone removes most of the visual noise.
2. **State, not decoration:** selected/active/pressed/disabled/locked/focused already ride on `data-`
   attributes; audit them for consistency (the same state must look the same everywhere).
3. **Motion budget:** the spec has no motion language. Add three, no more — panel/menu appear (≈120 ms), the
   lifted card, and the toast — and honour `prefers-reduced-motion` (there is already a precedent at
   `projectScreen.css:556`).
4. **Icon consistency:** the 14 tool glyphs are bespoke 24 px strokes at `strokeWidth` 1.5–2; the chrome uses
   `lucide-react`. Pick the tool-glyph weight as the house weight and match the chrome's icons to it.
5. **The empty/loading/error states** of every screen are already honest — make them *consistent* (same
   skeleton shimmer, same line height, same tone).
6. **The two chrome states that still do not fit** (D126): a **mixed selection** (1205 px of §7.4-mandated
   content vs 839/663 available) and `dimension` + a selection at 1916×960 (+134 px). Two sanctioned trades are
   written up in D126 — **pick one and implement it**, because a panel that scrolls is the thing the owner
   complained about.

---

## 5. Entry points you will need (so you don't have to search)

**State & commands (reuse these; do not build parallel paths)**
- `src/editor/history.ts` — `exec(cmd, coalesceKey?)` and **`execCoalesced(cmd, key, windowMs)`** (a held control
  coalesces into one step; the pattern is `SelectTool.rotateBy`, `:448-463`).
- `src/editor/session.ts` — the `EditorSession` seam (`undo`/`redo`/`deleteSelection`/`nudgeSelection`/
  `applyStylePatch`/`adjustEndpoints`/`requestValue`/…). **Add capabilities here**, implemented in
  `src/editor/tools/*`, then registered in `src/ui/SheetEditor.tsx` where it builds the session object and calls
  `setEditorSession(session)` (`:934`; `null` on unmount at `:1616`).
- `src/editor/tools/SelectTool.ts` — the selection commands (`rotateBy`, `deleteSelection`, `nudgeSelection`,
  `moveObject`, `setLocked`/`setVisible`).
- `src/editor/shapes/scene.ts` — `moveObject`, `setGeometry`, `geometryCopy`, z-order primitives
  (`moveInBandBefore`/`moveInBandToBack`).
- `src/state/styleByTool.ts` — per-tool style memory + Recents; `src/fs/presets.ts` — presets.

**UI**
- `src/ui/StylePanel.tsx` (+ `stylePanel.css`) — the panel; `src/ui/StyleEditorSheet.tsx` — the deep editor.
- `src/ui/ToolRail.tsx` — the 14 tools, `TOOL_DEFS` (`:88-101`), hotkeys (`:110`).
- `src/ui/TopBar.tsx`, `src/ui/EditorLayout.tsx` (rail/dock/top bar + Focus), `src/ui/SheetEditor.tsx` (the
  canvas screen; the mini-toolbar is at `:2429`).
- `src/ui/LayersPanel.tsx` (+ `layersRows.ts` for the pure row derivation).
- `src/ui/ProjectScreen.tsx` (+ `projectScreen.css`), `src/ui/ProjectList.tsx`, `src/ui/Settings.tsx`,
  `src/ui/TrashPanel.tsx`, `src/ui/ExportWizard.tsx` (+ `exportWizard.css`), `src/ui/CameraFlow.tsx`.

**Copy**
- `src/ui/strings.ts` (**the only home for user-visible text**; `tests/strings.test.ts` is the gate),
  `docs/appendix-strings.md` (approved), `docs/appendix-strings-gaps.md` (proposals).

---

## 6. Decisions that are NOT yours — ask the owner

1. **`«Open existing folder…»`** — does the picker **re-point the projects root** (hiding existing projects) or
   **adopt a folder from outside it**? The spec says "opens `showDirectoryPicker`" and stops there. Two
   `ProjectList` rows are disabled on this answer.
2. **The mixed-selection panel** and **`dimension` + a selection at 1916×960** (D126): the panel cannot fit
   §7.4's "disabled, never hidden" content at any legible size. Two trades are written up; pick one.
3. **The §14.9 tab order vs handedness** (D129): the spec mandates rail → canvas → panel regardless of hand, so
   a right-handed user's (rail on the right) walk crosses the row right→left. Left as-is deliberately.
4. **Content-owner copy:** the PDF caption placement, the `Skip`-row strings, and the growing set of
   `⚠ PROPOSED (C14)` rows.

---

## 7. How to work, and how to prove it

**The loop (from `docs/BUILD-RUNBOOK.md` §2/§3):** read the slice → check checkpoints → build → write tests as
you go → gate → record in `docs/BUILD-LOG.md` + `docs/DECISIONS.md` in the same commit.

**Verification discipline that this codebase actually requires:**

1. **Before and after every visual change, run the clickthru and LOOK at it:**
   `npm.cmd run clickthru` → open `test-results/clickthru/latest/contact-sheet.html`. It drives the built app
   with real touch/pen on the Surface geometry and screenshots 20 steps. **It is an inspection tool, never a
   gate, and it never promotes a `[Surface]` row.** *(Copy the folder aside if you will run the e2e gate —
   `npx playwright test` wipes `test-results/`.)*
2. **jsdom cannot see layout** (D40): target sizes, focus order, the focus ring, clipping, and anything
   `position: fixed` need the **browser project** — `tests/editorA11y.browser.test.ts` and
   `tests/gridA11y.browser.test.ts` are your templates, and they are how the last wave found a 16×48 portrait
   target and a tab order contradicting the spec.
3. **A fix needs a pin that fails against the pre-fix source.** Stash → run → restore, and put the before/after
   numbers in your report. This is the house standard.
4. **Never delete or weaken a test or a gate.** If a spec expectation is wrong, fix the spec with the arithmetic
   shown in `docs/DECISIONS.md`, then fix the test. It has happened repeatedly; every time the spec was wrong
   and the test was right to fail.
5. **One writer per file** if you parallelise (`BUILD-RUNBOOK` §11): `strings.ts`, `styles.css`, `App.tsx`,
   `state/*`, `docs/**` are contended. **`docs/**` is the orchestrator's.** Lanes run `tsc` + `vitest --project
   node --project jsdom` only; `build`, `playwright` and `clickthru` are the orchestrator's.
6. **The environment:** prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path`; use `npm.cmd`/`npx.cmd`;
   **no PowerShell heredocs** (write commit messages to a file, `git commit -F`); never `>` redirect into a repo
   file (UTF-16 destroys it — use `git checkout -- <file>`); `npx.cmd vitest` shows a stderr warning that
   PowerShell reports as *failed* even when every test passed — **read the summary**; never verify copy through
   the console (`tests/strings.test.ts` is the gate); `playwright` needs port 4173 free and `CI` unset.
7. **In `docs/DECISIONS.md`, anchor edits on prose, not on a heading** — anchoring on `### D127` once *deleted*
   that heading. `tests/documents.test.ts` now gates uniqueness/order/referential integrity, so a mistake will
   fail the suite rather than ship.

**Definition of done for this pass:** every control in §2.1 is either **working** or **deleted**; every control
the spec names in §2.2 **exists and changes the canvas**; nothing is disabled without an accessible reason;
`tsc` 0, the full suite green, `playwright` green, and a clickthru contact sheet you have actually looked at
that shows the new controls doing their job. Then update `BUILD-LOG`/`DECISIONS`/`CONTINUITY` in the same
commit and hand back.

---

## 8. If you only do three things

1. **§4.1 — extend `AnnotationStyle`** (the data channel). Everything else in this brief is blocked on it, and
   without it any button you add is a stub that lies.
2. **§4.2 — the mini-toolbar to spec**, using `element.animate()` for the anchor. It is the control a field user
   touches most, and it is currently three buttons of eleven.
3. **§4.3 — fill the two overflow menus.** They are already wired for it, the handlers mostly exist elsewhere in
   the codebase, and a working menu row is the cheapest "this is a real product" signal in the app.
