# Clickthru harness — drive the whole app with real input, then look at the pixels

**What this is.** A one-command harness that drives the **built** Field Measure in a real headed
browser, walking the beta-critical path with **real CDP touch and pen input** on the **Surface
target geometry**, taking a screenshot at every step. An agent (or a human) then reviews the pixels.

**What this is not.** It is **not a gate**, it does **not** replace `npm run e2e`, and it **never
promotes a `[Surface]` row**. It is an *inspection* harness: it produces evidence and finds things
tests cannot see. It found three on its first two runs (§10).

**Why it exists.** `docs/handoff-session-21.md` §2 records the gap plainly: *"No agent has ever
driven the app end to end"* — and every one of this project's recent owner-visible defects (D85, D103,
D110, D119, D120, D122) was found by **running the app**, never by a green gate. This harness closes
that loop for the machine-checkable half.

---

## 1. The one command

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd run clickthru
```

That builds the app and runs the walk in a **real Chrome window** you can watch. It does not need
focus, so you can keep working. **Never judge appearance from `npm run dev`** — the shipped CSP
`style-src 'self'` blocks Vite's injected inline styles (D105), so the harness always exercises the
built app on `http://localhost:4173`.

**Fidelity run** (Edge is what a Surface actually ships; H10/H17 reference the target Edge build):

```powershell
$env:CLICKTHRU_CHANNEL = "msedge"; npm.cmd run clickthru
```

`chrome` is the default watchable window; bundled Chromium is the fallback when Chrome is absent.

## 2. What it produces

Everything lands in **`test-results/clickthru/latest/`** (gitignored; wiped at the start of each run):

| Artifact | What it is |
|---|---|
| `contact-sheet.html` | **Open this one file.** Every step, in order, with its status, its screenshot inlined, its notes and its evidence. Self-contained. |
| `NN-<step>.png` | Per-step screenshot — the evidence for that step. |
| `run.json` | Machine-readable: channel, profile, viewport, DPR, UA, `hasTouch`, every step's status + duration + note + **evidence**, and the caveats. |
| `run.webm` | The whole run as video. |
| `exported/` | The export artifact(s) read **out of OPFS**, so the PDF itself can be inspected. |

## 3. What it proves — and what it can never prove

**It proves** that the path renders, is reachable, and responds to the right input on the target
geometry — with a screenshot to check, not an assertion to trust.

**It can never prove** (these stay `PENDING` in `docs/HARDWARE-TEST-CHECKLIST.md`, always):
a finger's systematic contact-centroid offset; real palm physics; the OS ~250 ms pinch delay on an
inking surface (**H15**); coalescing/`getCoalescedEvents` rates (**H16**); the Ink API (**H17**);
thermal and sustained DPR-2 FPS (**H18**); real camera optics and resolution (**C3/H10**);
sunlight/Dim legibility (**H3**); the 14-day trash clock; the service-worker update lifecycle.

Every run records this list in `run.json` and prints it in the contact sheet, so a green run can never
be quietly read as "hardware verified". **A green run never promotes a `[Surface]` row.**

## 4. The device profiles (`tests/clickthru/devices.ts`)

From the UI spec's device table (`ui-spec-field-measure-v2-hardened.md:35-37`) and
`gui-ux-readiness-and-design-handoff.md:459-460`:

| Profile | Viewport (CSS px) | DPR |
|---|---|---|
| `surfaceLandscape` — **primary, the walk runs here** | 1440 × 960 | 2 |
| `surfacePortrait` | 960 × 1440 | 2 |
| `desk` | 1200 × 800 | 2 |

All three: `hasTouch: true`, `deviceScaleFactor: 2`, **desktop UA, `isMobile: false`** — this is a
Windows tablet, not a phone; a mobile UA or `isMobile` would change viewport-meta behaviour and
`showDirectoryPicker` availability.

**The rotation gate** is part of the walk: rotate 1440×960 → 960×1440 and back, asserting the real
1.4.5 gate — `data-rail` must **not** move, `data-dock` must **flip** (`side → bottom → side`), and
the tool, selection and zoom must survive.

## 5. The gesture lab (`tests/clickthru/gestures.ts`)

`page.touchscreen` is **single-touch only** and cannot express the interaction model this app
implements. The lab drives raw CDP — `Input.dispatchTouchEvent` (multi-point) and
`Input.dispatchMouseEvent` with `pointerType: 'pen'`:

`tap` · `tapTap` (honours the **450 ms** settle) · `longPress` (**600 ms**) · `drag` (one finger) ·
`twoFingerDrag` · `secondFingerCancel` · `pinch` · `palmThenTap` · `penStroke(force)` · `penHover` ·
`penBarrelClick` — plus the project's timing constants in one place (`TSettle`: 450 / 600 / 400 / 8 / 400).

Two rules the lab enforces:

1. **Never synthetic `dispatchEvent`.** D77/F1 proved synthetic pointer events diverge from real input
   (Chromium implicitly captures the pointer), which is why this project treats them as non-evidence.
   CDP input is real input.
2. **Every sequence releases its touches in a `finally`.** A leaked touch point poisons every later step.

Each gesture records its **observed effect**, not its intent. A gesture that does nothing is recorded
as doing nothing (e.g. pen hover: *no change*; palm + tap: *objects 1→1*).

## 6. How the environment is faked — and why each piece is needed

This is the part that took measurement to get right. Four pieces, each with a reason:

1. **The folder picker.** `showDirectoryPicker` opens a native OS dialog no agent can drive — and the
   beta path starts with it. `pickProjectsFolder()` reads `globalThis.showDirectoryPicker` **at call
   time** (`src/settings/projectsRoot.ts:54`), so overriding it in an `addInitScript` before the first
   click is sufficient. Both first-run buttons route through it.
2. **The renderer death — and the fix.** See **D124**. In short: OPFS is the backing store, but a
   Chromium build dies when it *deserialises* an OPFS handle out of IndexedDB, which is exactly what
   the app does the moment Home mounts and re-reads its projects root. A ~20-line
   `IDBObjectStore.get/put` shim keeps the handle from ever round-tripping: `put` stores a sentinel
   string, `get` mints a **live** OPFS root. OPFS itself is fully capable — `queryPermission`,
   `createWritable` and **`move()`** all work, so every write is a real atomic write.
3. **The camera.** `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` gives a real
   `getUserMedia` stream (Chromium's synthetic device, reporting 3840×2160), so the shutter, review and
   «Use photo» paths are genuinely exercised — no webcam needed.
4. **The output.** Export writes through the same stubbed picker into OPFS, and the harness reads the
   artifact back out to disk so the PDF can be inspected.

## 7. Reading the results

Open `test-results/clickthru/latest/contact-sheet.html`. For each step you get: status
(`PASS` / `FAIL` / `UNREACHED`), the screenshot, the note, and the **evidence** — which for the file
steps is the sheet-directory listing (`photo.jpg` / `thumb.jpg` / `markup.json` presence and sizes).

A step is `PASS` **only** when its observation is in the note. Treat the screenshot as the evidence and
the status as a claim about it. An `UNREACHED` step is not a failure of the app — it means the harness
could not get there, and that is itself a finding about the harness.

## 8. The process

**When to run it:** after any wave that changes user-visible behaviour, before a handoff, and whenever
you are about to claim that something "works end to end". It is the cheapest way to convert *"the
tests pass"* into *"I looked at it"*.

**How to reconcile it:** the run reports; **the orchestrator resolves.** Read the contact sheet, and for
any `FAIL`/`UNREACHED` decide whether the harness or the product is at fault. Then record:

- a **product** finding → `docs/DECISIONS.md` (with the evidence) and an owed item in
  `docs/CONTINUITY.md`, plus a `BUILD-LOG.md` **Surprises** line if it contradicted a document;
- a **harness** finding → fix the harness in the same wave, and say so in `README.md`;
- a **`[Surface]`** question → `docs/HARDWARE-TEST-CHECKLIST.md`, left `PENDING`, never promoted.

**Never** wire this harness into `playwright.config.ts` or `npm run e2e`. The gate stays byte-identical:
this is an inspection tool, and the fastest way to lose its value is to let it become a gate that
someone later weakens to make green.

## 9. Gotchas that already cost time

- **`[data-tool=…]` is ambiguous** — the `StylePanel` root carries `data-tool` too. Always scope to
  `[data-testid="tool-rail"] [data-tool="…"]`, or a strict-mode violation fires once the panel's tool
  matches.
- **`[data-testid="keypad-sheet"]` is a zero-size positioning wrapper.** Wait on `.keypad-sheet` (the
  dialog).
- **The capture overlay shares accessible names with the grid** (`Take photo` exists behind the
  overlay). Prefer class/`data-*` hooks there; a `getByRole` name match can sit on a covered element
  until it times out.
- **The mini-toolbar is bottom-anchored**, so it is not a proxy for the selected object's position.
  Object screen coordinates come from an affine image→screen map recovered from two **diagonal**
  placement taps.
- **Playwright 1.63's `getAttribute` takes no options** — absence-tolerant reads need
  `textContent({ timeout })`, or an absent element burns the default action timeout.
- **A dimension's midpoint carries a handle.** A drag started exactly at the midpoint is a handle
  interaction, not a body move; the harness starts object drags at 25 % along the body.
- **Concurrent writers.** This repo is often worked by more than one session at once. Run the clickthru
  on a tree you can name, and when reading its pixels remember the build may include another lane's
  uncommitted edits (see D125's caveat about the rail-side observation).

## 10. What it has found so far

| Finding | Status |
|---|---|
| **`thumb.jpg` is never written for a captured sheet** — absent at all 20 steps, including after the dimension persisted, after reload and after export, so the grid card can only show its placeholder. Mechanism traced: `CameraFlow` arms a **3 s** debounce, then unmounts on `onCaptured`, and its cleanup **cancels** the scheduler. `tests/cameraFlow.test.tsx` hand-drives `write()` and so asserts only that `schedule()` was called. | **D125 — FIXED and re-verified by this harness.** `CameraFlow` now flushes the scheduler **before** `onCaptured`; on the reconciled tree step 03 reports *card thumbnail rendered: true* and step 20 finds `thumb.jpg` (6256 B) in the sheet directory. Pinned by a test that asserts the **order** (a call is not an effect). |
| **The pen barrel button is not distinguished from the tip** — a `buttons: 2` press with freehand active **draws**, exactly like a tip stroke. | evidence for **H13**; recorded |
| **A dimension's midpoint is a handle, not the body** — dragging from the exact midpoint does not move the object. | recorded; the harness works around it |
| **The rotation gate's machine half is green** — `data-rail` fixed, `data-dock` `side→bottom→side`, tool/selection/zoom survive. | recorded; the `[Surface]` half stays owed |
| Rail renders as the left-most column while `data-rail="right"`, with no `[data-rail='right'] .tool-rail { order }` rule. | **CONFIRMED on the reconciled tree, and FIXED — D127.** `.tool-rail` carried no `order` of its own, so with the dock also given `0` the flex container fell back to **source order** and the rail stayed left-most — the handedness setting did nothing, and every attribute assertion still passed. Fixed (`.editor-layout[data-rail='right'] .tool-rail { order: 2 }`) and pinned in **real layout** by `tests/editorChromeFit.browser.test.ts` (the attribute must agree with where the rail is). |

---

**Files:** `playwright.clickthru.config.ts` · `tests/clickthru/{devices,gestures,harness}.ts` ·
`tests/clickthru/betaPath.spec.ts` · `tests/clickthru/README.md`.
**Command:** `npm run clickthru`. **Skill:** `clickthru` (user-level, loadable by any agent).
