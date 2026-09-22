# Handoff — the capture save that hangs (owner-reported), and the deadlock behind it

**Read in this order:** `AGENTS.md` (the contract) → `docs/CONTINUITY.md` (live state) →
`docs/BUILD-RUNBOOK.md` (how to work) → **this file** → `docs/DECISIONS.md` **D119, D120, D121** (the three
rounds of this issue) → the last entries of `docs/BUILD-LOG.md`.

Everything here was executed on this machine unless it says otherwise. Where something is *not* proven, it says
so — that distinction is the whole point of this file.

---

## 0. State in one screen

| | |
|---|---|
| Branch | `main`, gate green on the commit that adds this file: `tsc` 0 · **94 files / 1317 tests** · `build` 0 (26 precache, 1519.78 KiB) · `playwright` 5 passed / 5 skipped |
| The report | **"take a photo → «Use photo» → stuck on «Adding…»"**, on the built app (`npm run build && npm run preview` → http://localhost:4173) |
| **Root cause (found, fixed, proven)** | **D121** — a **Web Lock name collision**: the session writer lease and the per-write mutex both requested `fm:project:<id>`. Web Locks are not reentrant, so while the editor is mounted **every atomic write for that project queues forever** — no rejection, no timeout, nothing to report. |
| The proof | `tests/writerLease.browser.test.ts` (real Chromium, real Web Locks, real OPFS, **no mocks**): a write under a held lease **timed out** before the fix and settles after it; `navigator.locks.query()` during the hang showed the lease genuinely held with the write queued. |
| Why nobody saw it | Six browser suites **mock `acquireWriterLease`** away, and the only real lease test exercises two leases against each other — **never a lease plus a write**. Same shape as D114/F1: the code and its assertions agreed; the *combination* was never run. |
| **Still unproven** | The owner's **first** symptom — the failure overlay with «Save a copy…» / «Retry» — was a **rejection**, not a hang, so it is a *different* cause (a real write failure: permission / locked file / disk full / image pipeline). It is now *reported* honestly; the specific cause has not been captured from a real run yet. |
| Immediate next actions | (1) Owner rebuilds and runs the beta path from **both** the grid and a sheet. (2) If the *failure* overlay appears, its message names the cause — record that line. (3) Harden `writeAtomic` with a lock-**acquisition** timeout (§5.3 of this file). (4) Two-tab check on hardware. |

---

## 1. The symptom history, in order, verbatim

1. **"when i take a photo and hit use photo it gets stuck at 'save as a copy...' retry button"** — with a
   screenshot: the capture **review** step (photo centred, `Retake` / rotate / `Use photo` below) and a
   red-bordered dark overlay holding **only** «Save a copy…» (orange, primary) and «Retry» — **no message
   line**. The Project screen's bar was faintly visible above («‹ Projects · New project 2 · 1 sheet»), so the
   capture had been launched from the **grid**.
2. **"it still gets stuck on adding.... after clicking use photo"** — «Adding…» is the **saving** overlay
   (`write === 'saving'`), i.e. the promise never settles. That is a **hang**, not a failure.

Two different defects wearing one screen, and the distinction is what this whole file is about.

---

## 2. What has already been tried, in order, and what each one did

| Fix | What it changed | Outcome |
|---|---|---|
| **D119** (`588d329`) | The failure overlay said nothing and its «Retry» re-ran a guaranteed failure. Now: the message names the cause (kind-mapped to the approved `errors.*` copy + one `⚠ PROPOSED` line `capture.saveFailed`); the primary action matches the cause («Re-authorize» re-asks for the folder grant inside the click); the project is re-resolved so «Retry» is a real second attempt; focus goes to the safe action and returns to the invoker. | Fixed real defects. **Did not fix the hang** — a pending promise never reaches a `catch`, so honest-failure work structurally cannot see it. |
| `4253ab8` | The capture surface was 92 % opaque, ghosting the app's chrome through it. Now opaque. | Cosmetic; unrelated to the save. |
| **D120** (`48f5ce8`) | (a) The **primary** path no longer awaits the write grant (an unanswered `requestPermission` was one way this app could hang, introduced by D119 itself); only the recovery asks. (b) A **30 s bounded wait** shows «The folder isn't responding» instead of spinning forever. (c) The saving label **names the stage**: «Adding…» = image work, «Saving…» = the folder write (both already-approved lines). (d) **One save in flight at a time** — no stacked writes. (e) The watchdog is cleared on unmount. | Necessary but not sufficient: it bounded the symptom and made the hang *legible* (it is why «Adding…» could be diagnosed at all) — the cause was still below. |
| **D121** (this commit) | The **name collision**: `writeLockName(projectId)` = `fm:project:<id>:write` for the per-write mutex and the tmp reaper; the lease keeps `fm:project:<id>`. Spec §5.3/§5.4/§5.8d, the plan's S1 requirement, and six tests that pinned the colliding name all amended **with the executed evidence**. | **The root cause of the hang.** |

---

## 3. The root cause, in full (D121)

**Mechanism.** `acquireWriterLease(projectId)` takes `fm:project:<id>` **exclusively and holds it for the
editor's whole session** (§5.8d; `src/fs/projectStore.ts:530-548`). `writeAtomic` requested **the same name**
(§5.3; `:222`), and so did `cleanStaleTmp` (`:467`). Web Locks are **not reentrant** and a plain `request` for a
name the same page already holds **queues forever** — no rejection, no timer, nothing to report. Therefore:

- a capture taken **from a sheet** (the camera mounts over the still-mounted editor) → the sheet write queues →
  **«Adding…» forever**;
- the editor's own **autosave**, markup persistence and thumbnail → the same;
- `cleanStaleTmp` in the editor's **own open sequence** → the same;
- a capture taken **from the grid** with no editor mounted → no lease → unaffected. *This is why the owner's
  first report was a failure with a message and the second a silent hang.*

**Executed evidence** (`tests/writerLease.browser.test.ts`, real Chromium + real Web Locks + real OPFS, no mocks):

- no lease held → `writeAtomic` settles (the control, so the test is not vacuous);
- lease held → `writeAtomic` **times out** (2 s budget) — *before* the fix;
- `navigator.locks.query()` during the hang:
  `held: [{"clientId":"15D85E…","mode":"exclusive","name":"fm:project:probe:state"}]`, `pending: []` — the lease
  is genuinely held while the write sits queued;
- `cleanStaleTmp` under the lease: the same timeout;
- **after the fix**: both settle, control still green.

**A second executed fact, worth not re-litigating:** Chromium **grants** an `ifAvailable` re-request from the
client that already holds the lock, so `acquireWriterLease` **twice inside one tab returns two leases**. That is
harmless (one tab = one writer) and it means §5.8d's exclusion is **cross-tab**. The store's intent (second
acquire → `null`) is pinned against the fake in `tests/projectStore.test.ts`; the real two-tab case is a
hardware check. Do not "fix" the store on the assumption that the real API refuses a same-client re-request —
it does not.

---

## 4. Entry points (exact locations)

**Storage / locks — `src/fs/projectStore.ts`**
- `writeLockName(projectId)` — `'fm:project:' + projectId + ':write'`; the per-write mutex (D121).
- `writeAtomic(dir, name, data, projectId)` — tmp → `createWritable` → write → close → `move()`; the **only**
  place `createWritable()` is called; acquires the mutex above.
- `cleanStaleTmp(dir, projectId)` — the tmp reaper; same mutex, must not queue behind the lease.
- `acquireWriterLease(projectId)` — the session lease, `{ mode: 'exclusive', ifAvailable: true }`, name
  `fm:project:<id>`, released on editor unmount.
- `ensureRootAccess({ request })` — the folder grant; `request: true` needs live user activation.
- `resolveOpenProjectDir(projectId)` — root → grant ask → open-project registry (D51 `${id}:${folderName}`) →
  folder handle. **The registry key matters**: registering a bare id makes every resolver throw.
- `classifyWriteError` — `disk-full | target-locked | permission | unknown` (the `unknown` arm is where a
  missing `FileSystemFileHandle.move()` lands).

**Editor — `src/ui/SheetEditor.tsx`**
- `:1518-1541` the open sequence: `registerOpenProject` → `acquireWriterLease` → `openProjectChannel` →
  `resolveOpenProjectDir` → `cleanStaleTmp` → `readProjectFile`.
- `:1612` the lease release on unmount.

**Capture — `src/ui/CameraFlow.tsx`**
- `commit(blob, { askGrant })` — the whole save: stage tracking (`prepare` → `write`), the bounded wait, the
  in-flight guard, the grant ask only on the recovery path, `addSheetFromPhoto`, the thumbnail scheduler.
- `resolveProject()` — resolve extracted so «Retry» really retries.
- `describeWriteFailure(e)` — kind → message/`needsGrant`/`needsResolve`.
- `createSaveWatchdog(onTimeout, ms)` / `SAVE_TIMEOUT_MS` / `savingLabel(stage)` — exported for tests.
- The failure overlay (message + recovery + «Save a copy…») and the saving overlay (stage label).
- `snapshotVideoFrame` — `drawImage(video)` and nothing else: **no grid/level/reticle/HUD is burned into the
  photo**, so nothing the app draws can appear inside a captured image.

**Shell / other**
- `src/App.tsx` — the capture is mounted **over** the route, so a capture from the editor keeps the editor (and
  its lease) mounted.
- `src/fs/sheetIntake.ts` — `addSheetFromPhoto`: `photo.jpg` first, then `project.json` (photo-first is
  deliberate: no row without its photo).
- `src/fs/sheetOps.ts` — the grid's reorder/rename/duplicate/replace writes.

**Tests that matter here**
- `tests/writerLease.browser.test.ts` — **the D121 pin** (the deadlock, and the same-client `ifAvailable` fact).
- `tests/cameraFlow.test.tsx` — the capture UI half: failure kinds, the granting recovery, the stage label, the
  hung-pipeline symptom, the primary attempt filing a sheet.
- `tests/projectStore.test.ts` — the fake-lock lock-name assertions + the lease exclusivity intent.
- `tests/gridActions.test.tsx`, `tests/sheetOps.test.ts`, `tests/gridReorder.browser.test.ts`,
  `tests/projectScreen.test.tsx` — the grid wave (D115–D118).

---

## 5. Hypotheses — ruled in, ruled out, and still open

**Confirmed (executed):**
- The lease/mutex name collision → the hang. **Fixed.**

**Ruled out (executed or read):**
- *"The dark blob in the screenshot is an app overlay."* No: the review screen renders exactly three things
  (the photo, the action row, the alert) and `snapshotVideoFrame` is a bare `drawImage(video)` — nothing is
  burned in. It is scene content (compare the live viewfinder, the review image, and a downloaded
  `photo.jpg`). The 92 %-opaque capture surface that ghosted the app's chrome *was* real, and is fixed.
- *"A same-client `ifAvailable` re-request is refused."* It is **granted** (executed). §5.8d exclusion is
  cross-tab.
- *"The fake's write hooks can hang a write."* They are called synchronously and not awaited — a test cannot
  hang a write that way (which is why the watchdog tests use a hanging `normalizeImage` instead).

**Still open (in rough priority):**
1. **No lock-acquisition timeout in `writeAtomic`.** Anything that ever holds `fm:project:<id>:write` for long
   hangs writes the same silent way. This is the class-wide hardening: acquire with a bounded wait and fail into
   `StorageWriteError('target-locked')` (or a new kind) so the UI can say «the folder is busy» rather than
   spin. *Design note:* do not "steal" the lock — a steal could interleave two writers.
2. **The owner's original failure (a rejection).** Which kind? The overlay now prints it. Candidates: a lost
   readwrite grant after reload; `move()` refused/absent; a real OS lock (Dropbox/OneDrive/antivirus/Windows
   Search holding `project.json` or `photo.jpg`); disk full.
3. **`FileSystemFileHandle.move()` in the owner's build.** If absent, every write throws `unknown` — the spec
   forbids an improvised copy+delete ("a data-loss path"), so the honest answer would be a clear message, not a
   fallback. The console probe below answers this in one paste.
4. **Two-tab behaviour on real hardware** (§5.8d): second tab read-only, and a stuck holder must not silently
   block.
5. **The 30 s exit's post-timeout button set** (D120): the timer mechanism, the label mapping and the
   hung-save symptom are machine-pinned; the full exit is not.

---

## 6. Recipes: reproduce, diagnose, probe

**The deadlock, deterministically (no browser, no owner):**
```
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npx.cmd vitest run --project browser tests/writerLease.browser.test.ts
```

**Ask the browser what it thinks (the fastest way to see a stuck writer):** in any page on the app's origin,
`await navigator.locks.query()` → `held` / `pending` entries name the holder. This is what proved the lease was
really held while the write hung. A held `fm:project:<id>` with a `pending` `fm:project:<id>:write` is a stuck
save.

**Simulate a stuck holder in a real browser** (then trigger a save and watch the UI):
```js
navigator.locks.request('fm:project:p1:Riverside:write', () => new Promise(() => {})); // held forever
```

**Owner-side probe — paste into DevTools → Console on the running app** (read-only; one paste answers hypotheses
2 and 3):
```js
(async () => {
  const open = (name) => new Promise((res, rej) => {
    const r = indexedDB.open('keyval-store');
    r.onerror = () => rej(r.error); r.onsuccess = () => res(r.result);
  });
  const db = await open();
  const handle = await new Promise((res, rej) => {
    const tx = db.transaction('keyval', 'readonly');
    const q = tx.objectStore('keyval').get('fm:projects-root');
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  console.log('root folder:', handle ? handle.name : '(none stored)');
  console.log('readwrite permission:', handle && handle.queryPermission
    ? await handle.queryPermission({ mode: 'readwrite' }) : '(no permission API)');
  console.log('FileSystemFileHandle.move():',
    typeof FileSystemFileHandle.prototype.move === 'function' ? 'present' : 'MISSING');
  console.log('locks now:', JSON.stringify(await navigator.locks.query()));
})();
```
Interpretation: `move(): MISSING` ⇒ every write is a `StorageWriteError('unknown')`. A `held` entry naming
`fm:project:<id>:write` ⇒ a write is stuck (reload to clear; then file the timeout hardening). Permission
`prompt`/`denied` ⇒ the grant is the problem, and «Re-authorize» is the fix.

**Never** try to reproduce any of this in jsdom: no layout, no `PointerEvent`, no real Web Locks, no real FSA.

**"Folder permission expired" on screen (D122) — read this before hunting a save bug.** That line means the
**grant is missing or denied for the stored handle**, not that the write path is broken. Probe it from the page:
`queryPermission({ mode: 'readwrite' })` on the handle stored under `fm:projects-root` (the console snippet
above prints exactly that). If it is **`denied`**, Chromium will never prompt again for that handle and
`requestPermission` cannot fix it — the only recovery is a **re-pick** (Settings → Storage → «Change folder…»,
or the capture overlay's «Re-pick folder» button), which mints a fresh grant. The app now does that itself
(overlay) and adopts the new handle (Settings reloads); an un-adopted re-pick is why a folder change can look
like it did nothing.

---

## 7. What "done" looks like for this issue

1. On hardware, on the **built** app: capture → «Use photo» files the sheet **from the grid and from a sheet**;
   the autosave chip reaches «Saved»; a reload shows the sheet and its markup.
2. The owner's original **failure** case (if it recurs) has its message line captured and its cause fixed.
3. `writeAtomic` has a bounded lock acquisition with an honest message (or a recorded reason it cannot).
4. Two-tab arbitration verified on hardware, including that a stuck holder cannot silently block writes.
5. The `[Surface]`/manual rows under slice 1.10 in `docs/HARDWARE-TEST-CHECKLIST.md` that touch this path are
   run, not faked.

---

## 8. Constraints that bind any fix in this area

- **`createWritable()` may be called only in `src/fs/projectStore.ts`**; every disk write goes through
  `writeAtomic` / `writeJsonAtomic` (AGENTS #3).
- The runtime project key is **`${id}:${folderName}`** (D51) everywhere — a bare id makes every resolver throw.
- **`projectStore.ts` is one of the four highest-stakes modules**: execute anything you copy, test boundaries,
  and treat a defect there as a stop rather than a finding to batch.
- Copy: only from `docs/appendix-strings.md`, or marked `⚠ PROPOSED (C14)` and recorded; `tests/strings.test.ts`
  is the gate.
- **Never weaken or delete a test to make something pass.** If an expectation encodes the defect, correct it
  *with the executed evidence* and record it (this issue corrected six such assertions — they asserted the write
  took the *lease's* name).
- No new runtime dependency; no inline styles (CSP `style-src 'self'` + the e2e `[style]` count === 0); no
  react-konva.
- Never fake a `[Surface]`/hardware result: log it in `docs/HARDWARE-TEST-CHECKLIST.md` and continue.

---

## 9. Environment quirks (Windows, this machine)

- Prefix every command: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`; use `npm.cmd` / `npx.cmd`
  (`npm.ps1` is blocked). PowerShell has no heredocs — write commit messages to a file and use `git commit -F`.
- `npx.cmd vitest` prints a plugin warning to **stderr**, which PowerShell reports as a failed command **even
  when every test passed** — read the Vitest summary, never the exit code alone.
- **Never verify copy through the console** (it mangles U+2014/U+00B7 and has produced false findings);
  `tests/strings.test.ts` is the gate.
- Judge appearance from the **built** app (`npm run build && npm run preview`), never `npm run dev` (the CSP
  blocks Vite's inline styles by design — D105).
- `playwright` needs port 4173 **free** (`reuseExistingServer` is off while `CI` is set): stop any preview and
  unset `CI` first.
- The job board can report a finished task as "running, status uncertain": trust the completion notification and
  the files on disk.

---

## 10. If you read only one paragraph

The hang was **not** the filesystem and **not** the camera: it was **one Web Lock name doing two jobs**. A tab
holds `fm:project:<id>` for its whole editor session (§5.8d), and every atomic write asked for the very same
name (§5.3) — so whenever a sheet was open, every write for that project queued forever with nothing to report.
It is fixed (the write mutex is now `fm:project:<id>:write`) and pinned by a test that failed before the fix and
passes after it — a test nobody had written because **six browser suites mock the lease away**, so no test had
ever held the real lock while writing. If you take one habit from this file: when something *hangs*, ask what
could be **queued** — a hang has no error message, and this project's guards are all built around errors.
