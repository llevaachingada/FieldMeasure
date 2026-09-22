# Handoff — Field Measure, for the next agent (session 23 → 24)

Written 2026-09-22. `main == origin/main`, HEAD `1b18ec3`. Everything below is verified on that tree unless it
says otherwise. **Read this, then read `docs/CONTINUITY.md`'s header — it is now the one-screen state.**

---

## 0. The 60-second version

**Field Measure** is a local-only, offline PWA for Surface tablets: photograph a site, draw ft-in dimension
lines on the photo, export a marked-up PDF/PNG into a folder you drag into Dropbox. No server, no DB, no
sign-in, no cloud. It is **feature-complete for v1** and going to **beta**.

**Read in this order:** `AGENTS.md` (the contract — non-negotiables, and it is *not* a status file) →
`docs/CONTINUITY.md` (live state; its header is current) → `docs/BUILD-RUNBOOK.md` (how to work: the slice loop,
the lane protocol §11, the gate policy) → `docs/clickthru-harness.md` (**how to actually look at the app**) →
`docs/DECISIONS.md` **D115–D131** (this session: the grid wave, the beta wave, both a11y audits, the doc
repair) → `docs/BUILD-LOG.md`'s last entry.

**Gates right now:** `tsc` 0 · **100 files / 1409 tests** (node + jsdom + browser) · `build` 0 (26 precache,
1525.57 KiB) · `playwright` 5 passed / 5 skipped · **`clickthru` 20 PASS / 0 FAIL / 0 UNREACHED**.

**The single most important habit here:** *run the app, don't just test it.* Every owner-visible defect in this
project's recent history — the dead «New project» button, the Home cards stating fiction, the capture that hung,
the rail that ignored handedness, the thumbnail that was never written — was found by **running the app**, never
by a green gate. `npm.cmd run clickthru` is the cheapest way to do that; it drives the built app with real CDP
touch and pen on the Surface geometry and screenshots every step. It is an **inspection tool, never a gate**,
and it **never promotes a `[Surface]` row**.

---

## 1. Where the project stands

| | |
|---|---|
| Branch | **`main` only**; `origin/main` current at `1b18ec3` |
| Slices | 0.2–1.9 complete (1.9 reviewed, D109) · 1.10 in progress · 1.11 landed (D112) · the Project screen built (D111) and owns sheet trash (D113) · **the beta-readiness wave landed (D126–D130)** |
| Beta loop | first-run folder → Home → **New project** (opens the camera) → shutter → Use photo → **sheets grid** → open a sheet → dimension tap-tap → keypad → text → **Export** → drag to Dropbox. Machine-verified end to end by the clickthru, **20/20** |
| Blocking item | **None.** The beta blockers are hardware checks, not code (see §6) |

### What this session changed (so you don't redo it)

1. **The clickthru harness exists** (D123/D124; `docs/clickthru-harness.md`; a `clickthru` skill; an OMO
   orchestrator rule; four discoverability layers). One command: `npm.cmd run clickthru`. **D124 is important:**
   the harness needs a **fake folder picker + an `IDBObjectStore` sentinel shim**, because a page that loads
   with an **OPFS** handle under `fm:projects-root` **kills the renderer** — that also **corrects D81**: the
   death is on the IndexedDB **read**, on the **same** page load, headed and headless.
2. **Three product defects the harness found, all fixed:** `thumb.jpg` was **never written** for a captured
   sheet (D125 — the camera armed a 3 s debounce and unmounted, cancelling it); the **rail ignored the
   handedness setting** (D127 — `.tool-rail` had no `order` of its own); a **pen barrel press drew** (D128 — the
   router drew for *any* pen contact; now only the tip draws, and build spec §8.2 was amended).
3. **The beta-readiness wave** (the owner's two Surface screenshots, ~1920×1120 CSS px): the 14 tool glyphs are
   **real** (they were numbered placeholders), the **editor chrome fits** (panel content 1430–1566 px → 127–835),
   the **grid scrolls with its top bar fixed** + drag-autoscroll, and the **write lock is bounded** (D126).
4. **Both a11y contracts audited by execution** (D129/D130): the editor's found a **16×48 portrait target** and a
   **tab order contradicting UI §14.9** (the top bar was reached last — `order` moves paint, not focus); the
   grid's found nothing. The **arrow-key nudge** is built (1 px / 10 px with Shift, one undo step per press,
   held keys coalesce) — D130.
5. **The capture blocker is root-caused** (D119–D122): a blank failure overlay; a hang; a **Web Lock name
   collision** (a session-long writer lease and the per-write mutex shared one name → every write queued
   forever); and the owner's folder grant being **`denied`**, which no prompt can fix (the app now offers
   **«Re-pick folder»** and «Change folder…» finally **adopts** the picked handle).
6. **Docs repaired** (D131): D123–D125 had been written **twice** by two concurrent sessions and D127's heading
   was consumed by an insert. Merged, restored, and now **unique + ascending (D1–D131)**.

---

## 2. The rules that will bite you if you don't know them

From `AGENTS.md` (non-negotiables) and this project's own scar tissue:

- **Never store screen pixels in a data file.** Geometry is working-image px; style sizes are markup units (mu);
  lengths are millimetres + the raw entered text.
- **There is no `label` field** — labels derive at render time. A stored label is a wrong-measurement bug.
- **All disk writes go through `src/fs/projectStore.ts`** (tmp → close → move, under the per-project Web Lock).
  `createWritable()` exists in that one file and nowhere else.
- **Imperative Konva only.** The canvas is an `EditorCanvas` class; React renders the chrome. No react-konva.
- **The runtime dependency list is closed.** Adding one needs a spec change first.
- **The project key is `` `${id}:${folderName}` ``** (D51) everywhere — a bare id makes every resolver throw.
- **Never delete or weaken a test or gate to pass.** If a spec expectation is wrong, fix the spec with the
  arithmetic shown in `docs/DECISIONS.md`, then the test. This has happened repeatedly; each time the spec was
  wrong and the test was right to fail.
- **Never fake a `[Surface]` result**, and never silently skip one. Log it in
  `docs/HARDWARE-TEST-CHECKLIST.md` and continue.
- **Look at the app** (clickthru) after any wave that changes what the user sees.

### Environment quirks (this machine, Windows) — they cost a failed call each time

- Prefix every command: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`; use `npm.cmd` / `npx.cmd`.
- **PowerShell has no heredocs.** Write a commit message to a file and use `git commit -F <file>`.
- **Never `>` redirect git output into a repo file** — PowerShell writes UTF-16 and destroys it (it cost me a
  `docs/DECISIONS.md` restore this session; use `git checkout -- <file>` and node for edits).
- `npx.cmd vitest` prints a plugin warning to **stderr**, which PowerShell reports as a **failed command even
  when every test passed** — read the Vitest summary, not the exit code.
- **Never verify copy through the console** (it mangles U+2014/U+00B7 and has produced false findings);
  `tests/strings.test.ts` is the gate.
- `playwright` needs **port 4173 free** and `CI` unset.
- **Running `npx playwright test` wipes `test-results/`, which deletes the clickthru's artifacts.** Review (or
  copy aside) a clickthru run **before** the e2e gate.
- **Editing text in `docs/*.md`:** anchor on **unique** text. Anchoring an insert on a heading string replaces
  the heading — that is exactly how D127 lost its own heading this session.

---

## 3. The lane protocol (`docs/BUILD-RUNBOOK.md` §11) — read it before dispatching

- **One writer per file per wave.** The contended set: `src/ui/strings.ts`, `src/styles.css`, `src/App.tsx`,
  `src/state/*`, `docs/**`. Two writers on one file is whole-file last-writer-wins **loss**.
- **`docs/**` is orchestrator-only.** Lanes report; the orchestrator writes the entries.
- **Lanes run `tsc` + `vitest --project node --project jsdom` only.** `npm run build`, `playwright` and
  **`clickthru`** belong to the orchestrator (`dist/` and port 4173 are shared).
- **A lane that needs copy stages it in a lane-local module**; the orchestrator folds it into `strings.ts` with
  a `⚠ PROPOSED (C14)` marker where the appendix has no approved row.
- **Warn:** the **provider account ran out of credit** this session (`Insufficient Balance` on two dispatches),
  so two lanes could not start and the work was done in-session instead. If dispatches fail, do the work
  directly and keep the verification discipline — that is the portable part. **Check the balance before
  planning a multi-lane wave.**

---

## 4. What is owed, in beta order

**P0 — before a tester touches it**
1. **The hardware pass.** Every `[Surface]` row in `docs/HARDWARE-TEST-CHECKLIST.md` (palm with no pen, sunlight,
   the 14-day trash clock, the service-worker update lifecycle, the real digitiser's barrel `button`, real FSA
   on NTFS/Dropbox). **No emulation promotes these**, and the project is "not beta-ready until every entry has
   been run on real hardware or has a logged, accepted deviation."
2. **Point the owner's projects root at a real folder.** It is the **source repo**, so Home lists `.git`,
   `node_modules`, `dist`. Settings → Storage → «Change folder…» (it reloads to adopt the handle). *Not a code
   defect — a setup step that makes the first impression honest.*

**P1 — the two large owed features**
3. **The Offset Nudge Pad** (touch model §2.3): a **120 px** circular pad, **96 px** from the anchor, **0.35×**
   in the inner 60 px core / **1.0×** in the outer band, `--g900`@92 % + a 2 px `rgba(255,255,255,.14)` border +
   a drag-vector chevron, in `RefineEndpoint` (which already exists). This is the **glass half** of the pair
   whose keyboard half (the arrow nudge) I just built — it is the last touch-accuracy affordance the research
   says a finger needs (the contact-centroid offset **cannot be corrected in maths**). Entry points:
   `src/editor/tools/DimensionTool.ts` (the `RefineEndpoint` state), `src/editor/Loupe.ts`
   (`loupeQuadrant` — the edge-aware quadrant logic to reuse), `src/ui/SheetEditor.tsx`.
4. **The History flyout.** `writeHistorySnapshot` (`src/fs/projectStore.ts`) still has **no caller**. Plan item 1
   (1.10) wants tap→History→whole-sheet snapshot restore. Entry points: the autosave chip area
   (`src/ui/AutosaveChip.tsx`), `persistQueue`'s cadence (`src/state/persistQueue.ts`, D52), and the snapshot
   writer. Note `docs/BUILD-RUNBOOK.md`'s "small, honest steps" — a flyout that claims a restore it cannot do
   would be this project's signature bug.

**P2 — polish with known shapes**
5. The editor's **replace dialog** on UI §13.3:808 (64 px + a progress track; the grid's already has it, so the
   two differ) and **`aria-pressed`** on the hold (a toggle semantic on a non-toggle).
6. **D113's owed restore-side undo toast** (needs approved copy), the **export owed list** (D106),
   **D101's** on-screen label halo (`strokeWidth = mu / scale` for a tagged `Text`).
7. **Two decisions that are the owner's, not mine:** (a) a **mixed selection** cannot fit the chrome
   (1205 px of §7.4-mandated content vs 839/663 — two sanctioned trades are written up in D126); (b) the
   **§14.9 handedness tab order** (the spec mandates rail→canvas→panel regardless of hand, so a right-handed
   user's walk crosses the row right→left — D129).
8. **Content owner:** the PDF «Include sheet names» caption placement (the control is disabled today) and the
   `Skip`-row strings; plus the growing set of `⚠ PROPOSED (C14)` copy rows.

**P3**
9. **The doc layer has no gate.** D131's lesson: a test asserting decision numbers are **unique and ascending**
   would have caught this session's duplicate-numbering mechanically. Cheap, and it protects the one artifact
   every future session reads first.
10. Slice **2.0** (C7 + the tool-glyph review — the glyphs now exist, so that review is finally possible).

---

## 5. What I was fixing when I stopped — and the state I left it in

**Finished and pushed:** the beta-readiness wave (`cd20269`), the barrel + editor-a11y round (`660e0cb`), the
grid-a11y + arrow-nudge round (`f45f1be`), and the docs repair (`1b18ec3`). Tree clean, `main == origin/main`.

**The doc repair is worth knowing about, because I caused part of it.** While adding D128 I anchored on the text
`### D127`, which **replaced that heading** rather than preceding it — and my first attempt at D131 did the same
to D130. Both are restored and verified (100 sections, unique, ascending). If you edit `docs/DECISIONS.md`,
**anchor on prose, not on a heading**, and re-check that the heading you meant to keep still exists.

**Two lanes could not run** (provider balance), so the grid audit, the arrow nudge and their tests were written
in-session. They follow the same shape as the lane work around them: fix + a pin that **fails against the
pre-fix source**, with the before/after numbers in the report.

---

## 6. What I could not verify (do not inherit as true)

- **Everything `[Surface]`.** The clickthru is **emulation**: real CDP input on the Surface *geometry*, but it
  cannot prove contact-centroid offset, palm physics, the digitiser pressure curve, the OS pinch delay (H15),
  coalescing rates (H16), the Ink API (H17), thermals/DPR-2 FPS (H18), camera optics (H10), sunlight (H3), the
  14-day trash clock, or the service-worker update lifecycle. **A green clickthru run proves none of those.**
- **Real File System Access on a real disk** — the harness uses OPFS behind a shim; `move()`, NTFS case rules,
  Dropbox/AV locks and quota are the OS's.
- **The owner's original capture *failure*** (the rejection, as opposed to the hang) has never had its message
  line captured from a real run — the overlay now prints it, so one run would name the cause.
- **The two non-fitting chrome states** (D126) and **the §14.9 handedness order** (D129) are open decisions, not
  bugs to "fix" silently.
- **`EXPORT_BITMAP_LIMIT_BYTES`** is a dev-machine figure; H21 on a Surface Go sets the real one.

---

## 7. How to start (the first three moves)

1. **Run the clickthru first** — before reading a line of `src/`. `npm.cmd run clickthru`, open
   `test-results/clickthru/latest/contact-sheet.html`, and look at the 20 screenshots. You will know what the app
   is in two minutes, and you may see something no test asserts. *(Copy the folder aside if you plan to run the
   e2e gate — it wipes `test-results/`.)*
2. **Then read** `docs/CONTINUITY.md`'s header + `docs/DECISIONS.md` D126–D131, and pick from §4 above.
3. **Then choose your first lane** — and if the provider balance allows lanes, split by file (`BUILD-RUNBOOK`
   §11). The **Offset Nudge Pad** and the **History flyout** are both single-lane, single-file-cluster jobs;
   the **doc-layer decision test** (§4.9) is a small, high-leverage one that makes the *next* handoff safer.

**If you have a Surface and a webcam: do §4.1 first.** That run — not another test — is what turns this into a
beta, and the list it produces *is* the honest roadmap.
