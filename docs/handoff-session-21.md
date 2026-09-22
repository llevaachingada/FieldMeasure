# Handoff — session 21 → the next orchestrator (to the beta)

**Read in this order:** `AGENTS.md` (the contract) → `docs/CONTINUITY.md` (the live state) →
`docs/BUILD-RUNBOOK.md` (how to work) → **this file** (where the last session left the ground) →
`docs/DECISIONS.md` **D100–D113** (why each of this session's choices was made).
`docs/BUILD-LOG.md`'s last six entries are the record of what shipped.

---

## 0. State in one screen

| | |
|---|---|
| Branch | **`main` only** — `origin/main` is current (session 21 ended at `31ab0dd`). A `backup/pre-unify` ref may still exist locally; the old `claude/…` branch was retired after the union. |
| Gate on `31ab0dd` | tsc 0 · **86 files / 1205 tests** · build 0 (25 precache, **1498.09 KiB**) · playwright 5 passed / 5 skipped |
| Run it for inspection | **the BUILT app**: `npm run build && npm run preview` → http://localhost:4173/ (a preview server was left running). **Never judge appearance from `npm run dev`** — see trap 1. |
| Beta loop | open → project → **sheets grid** → camera/import → photo → dimensions/text → **export (PDF/PNG/zip)** → autosave + trash. It works end to end *by the tests*; see §2 for what that does not prove. |

---

## 1. What session 21 did (so you don't redo it)

- **Unified two divergent histories into `main`** — the cloud branch's real merge plus main's fixes — and
  reconciled the **duplicate decision numbering** the merge created (`D100`). Repaired the merge's silent
  document loss: `2e7a43a` had taken `CONTINUITY.md` and `BUILD-LOG.md` wholesale from `main`, dropping the
  branch's session-14/15 snapshot and its whole 1.9 BUILD-LOG entry. Both were restored.
- **Slice 1.9 (export) wired end to end** (`D106`) and then **independently reviewed and discharged**
  (`D109`) — including the owed pixel proof that an inset exports its **photo**, not the `#3A3F46` placeholder.
- **1.10:** Sunlight/Dim themes (`D104`), the autosave chip + single-instance toasts (`D107`), and **sheet
  trash** — delete → `.trash/`, the 14-day prune, the restore panel (`D113`).
- **1.11:** the release/update layer (`D112`) — prompt-mode, suppressed during any measurement, **flush-first**
  reload that cannot outrun the autosave.
- **The Project screen** (`D111`) — the sheets grid that the plan had carried **unowned since session 4**
  (build spec §20.5(a)).
- **Six fixes that were all the same bug** — the interface said something the system had not done: a **dead
  «New project» button** (`D103`), **Home cards stating fiction** (`D110`), an **inert halo tag** documented as
  a fix (`D101`), an **empty archive reported as a success** (`D109`/F3), a **torch button lit over an unlit
  LED** (`D108`), and a **delete announced before it happened** (`D113`).

---

## 2. What is verified — and, explicitly, what is not

**Verified, by execution, on the committed tree:** every wave's full gate (tsc + node + jsdom + browser vitest
+ `npm run build` + playwright) measured on the integrated files before the commit that records it; the export
path additionally by an independent executed register (`D109`); the trash + grid wave by the review listed in
§9.

**Not verified — do not inherit as true:**
- **No agent has ever driven the app end to end.** There is no camera and no folder picker in the agent
  environment, so only a human on real hardware has exercised capture → measure → export. The tests prove the
  units and the wiring they assert; they do not prove the loop.
- Every **`[Surface]`** row (`docs/HARDWARE-TEST-CHECKLIST.md`): H8, H12, H19–H22, the Sunlight porch check,
  the real touch reorder, the **service-worker update lifecycle**, and the **14-day trash clock**.
- Real File System Access behaviour on a real disk (the fakes model it; `move()`, NTFS case rules and quota
  are the OS's).
- Anything jsdom cannot see: layout, real focus order, hit-slop overlap, the trash panel's two-pane view.

---

## 3. The beta-critical path (protect this)

`first-run (pick a folder)` → `Home` → **`New project`** → **camera** → shutter → review → `Use photo` →
**sheets grid** → open a sheet → **dimension** tap-tap → keypad → label → text/markup → reload (persists) →
**Export** → drag the folder into Dropbox.

---

## 4. Traps that already cost time here (read before touching anything)

1. **`npm run dev` can never render styled** (`D105`): the shipped CSP `style-src 'self'` blocks Vite's
   dev-injected inline styles. Every gate uses the built app, which is why no test ever saw it.
2. **The open-project registry is keyed by the full `` `${id}:${folderName}` `` runtime key** (`D51`).
   Registering the bare id makes *every* resolver throw and the grid report **every** project as an error.
   That mistake shipped once this session; an App-level test now pins it.
3. **`git grep` skips untracked files** — a brand-new file's internal references are invisible to it. Use the
   filesystem grep for anything uncommitted.
4. **This shell**: prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path`; use `npm.cmd`/`npx.cmd`; no
   PowerShell heredocs; **never verify copy through the console** (it mangles U+2014/U+00B7 and has produced
   false "the wording changed" findings — `tests/strings.test.ts` is the real gate). `npx.cmd` writes a Vitest
   plugin warning to stderr that PowerShell reports as a **failed command even when every test passed** — read
   the Vitest summary, or set `CI` and redirect to a file.
5. **The e2e config binds port 4173** and `reuseExistingServer` is **off** while `CI` is set. A running
   preview therefore makes `playwright` exit 1 with a port error while the tests themselves are fine. Unset
   `CI` for that step, or stop the preview.
6. **Gate before you commit; commit before the next wave.** The one time two writers shared this tree (another
   session committed `e89c4d2` mid-flight), nothing was lost only because the file sets happened not to
   overlap — the merge that started this session was lost that way once already.

---

## 5. The one review question worth asking every time

> **What would this say if the underlying call failed?**

Six defects this session were the same shape, and every gate stayed green through all of them: *the interface
said something the system had not done.* Gates cannot see it — the assertion and the lie usually agree. Ask it
of every toast, chip, badge, status line and optimistic update.

---

## 6. Owed work, in the order that serves the beta

**P0 — before this goes into someone's hands**
1. **Resolve the trash/grid review register (§9).** Trash is data-critical; fix anything stop-class and re-gate.
2. **The Project screen's remaining items (`D111`)**: sheet **reorder** (long-press drag + `sortIndex`),
   **rename**, **duplicate**, **replace photo**, and the §11.4 **storage chip**. All spec'd, all absent — and
   the UI renders the menu items *disabled* rather than dead-looking.
3. **A real end-to-end run on the built app, on a machine with a webcam and Chromium.** Do §3, then export
   into a folder and open the PDF. Log everything that breaks; that list *is* the beta backlog.

**P1 — the trust/polish the owner put on hold**
4. The **History flyout** (`writeHistorySnapshot` still has **no caller**), the **end-to-end a11y audit**, the
   **arrow nudge**, and **`D101`**'s on-screen label-halo fix (labels' outlines currently scale with canvas zoom).
5. **`D113`'s owed restore-side undo toast**, and the trash panel's manual layout/focus checks.

**P2 — needs other people**
6. **Content owner:** the PDF «Include sheet names» **caption placement** (F1 — the control is disabled
   today) and sign-off on the `Skip`-row strings (F4) plus the session's `⚠ PROPOSED (C14)` rows.
7. **Hardware:** the `[Surface]` rows, including the update lifecycle and the trash clock.

**P3:** slice **2.0** (C7 + the owed tool-glyph review).

---

## 7. How to orchestrate *here* (what worked, what to change)

**Worked:** one wave = 2–3 lanes on **disjoint files**, each brief carrying a **pinned interface**; the
orchestrator owns `docs/**` and every integration; lanes that need copy **stage it in a lane-local module**,
which the orchestrator folds into `strings.ts` and deletes; a **full gate on the integrated tree** before each
commit; small commits whose message carries the measured numbers; every owed item written down in
`DECISIONS`/`CONTINUITY` rather than carried in a head.

**Change (three rules that would have saved this session):**
- Tell every lane: **never emit a success message before the write resolves** (the optimistic delete, the
  optimistic toast, the "Saved" chip — same rule, §13.1/§13.4).
- Tell every lane: **the open-project registry key is `` `${id}:${folderName}` ``** — a one-line rule that cost
  a shipped bug.
- **Treat the wiring as orchestrator work.** The App-level seams (routes, `onExportSource`, `initialExportSelection`,
  the delete/restore handlers) are where the lanes meet, and they are where this session's real bugs appeared —
  not inside any lane's own module.

**Lane verification limits that mattered:** lanes run `tsc` + node/jsdom; the browser project is one lane's at
a time; `npm run build` and `playwright` belong to the orchestrator (shared `dist/` and ports).

---

## 8. If you read only one paragraph

The product works: **capture → measure → annotate → export**, with autosave, a 14-day trash and an update
path, on **one branch**, gated to **1205 tests**, with every decision and every owed item written down. What it
has never had is **a real end-to-end run on real hardware by a real person**. That run, plus the Project
screen's remaining spec'd items and the trash review in §9, is what stands between here and a beta worth
someone's time.

---

## 9. The independent review register for the trash + grid wave — and what it changed

An independent, **executed** register was run against `31ab0dd`. It found six issues and **one of them was
severe enough to falsify a shipped promise**; all are resolved (full text and evidence: **`D114`**).

| # | Finding (severity) | Resolution |
|---|---|---|
| **F1** | **The Project route mounted NO `ToastHost`** — every toast emitted on the grid (the delete undo, the failure line, the added-sheet toast) went onto the bus and rendered **nowhere**. A delete vanished the card with no announcement and **no undo window**; a failed delete was silent. *The lane's own 28 tests asserted the bus — which is exactly why they missed it.* | **One host at the app shell root** (`.editor-toast` is `position: fixed`); the Home-branch and editor hosts removed. **Pinned by a new route-level test** (`tests/gridToast.test.tsx`) that mounts the real `App`, walks Home → grid, and asserts the toast **DOM** + its action. |
| **F2** | `deleteSheet` removed the original **before** marking the row: a locked `project.json` (§5.8 S5) left the sheet **half-deleted** — folder gone, files in `.trash/`, row still live → a grid card for a sheet that wasn't there, invisible to the panel, refused by Restore. | **Reordered:** copy → verify → **mark the row** → remove (tolerating `NotFoundError`). Pinned with a test driving the fake's `beforeMove(file, name)` hook. |
| **F3** | The prune's "fully pruned or untouched" claim was **false for multi-entry prunes** (folders first, rows rewritten once). | Folder-first kept deliberately (the alternatives are worse); the code comment **and `D113`** now describe what actually happens. |
| **F4** | Grid «Export» with **no selection** dropped the action — `[]` means "every sheet", but the shell gated on a non-empty list, so the user landed in an editor with **no wizard**. | An empty selection expands to the project's live sheets at hand-off; with zero sheets the action stays on the grid. |
| **F5** | A failed **restore** was invisible when it came from the delete toast's Undo (the failure flag's only surface is the *closed* panel). | The catch now also emits an urgent toast. |
| **F6** | Settings carried two enabled-but-dead rows («Trash…», «Third-party notices»). | Disabled honestly (the D102 pattern). |

**Verified sound by execution** (a register is only useful if it says what held): the 14-day boundary and
`daysLeft`; the copy-failure paths, including a **pre-existing** `.trash/<id>/` never being touched by cleanup;
the restore-ordering claim; the prune's blast radius; "the only reaper"; the D51 keys on every new caller; the
honest delete at the screen level; the wizard's scoping; the panel's a11y; and the gate.

**Still not verified** (unchanged from §2): real File System Access on hardware, the 14-day clock on a device,
the hand-off against the real `SheetEditor`/Konva, and the panel's layout/focus.

**Watch item from the register:** `makeProjectSeparate` still registers a **bare** project id
(`projectStore.ts:749` — pre-existing, no live consumer), so the D51 full-key rule is not yet universal there.

**And the lesson, one last time:** F1 is the **seventh** instance of *the interface said something the system
had not done* — and it survived a lane's tests, that lane's own honesty pass, **and** my integration review,
because every check asked what the code **emitted** rather than what the **screen rendered**. Ask the review
brief's question directly next time: *does anything actually render what this emits, on every route that can
emit it?*
