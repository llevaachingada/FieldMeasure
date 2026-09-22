# Hardware test checklist — gates that need a real Surface (pen **optional**)

Many acceptance gates cannot run on a development machine: palm rejection, pen pressure, sunlight
legibility, power-loss mid-write, real camera resolution. Those gates are marked `[Surface]` in
`docs/implementation-plan.md`.

**The app is touch-primary; the pen is an enhancement** (`docs/gui-ux-readiness-and-design-handoff.md`
§13, `docs/touch-first-interaction-model.md`). A test device therefore needs a real Surface **with or
without a pen**. Items labelled **pen-only** still require the pen but **must not block a v1
touch-only build**; items labelled **touch-primary** must pass with the pen nowhere near the device.

**Policy** (`docs/BUILD-RUNBOOK.md` §4): a `[Surface]` gate does **not** block the slice. It is
copied here, the plan's checkbox is marked `[~]`, and the build continues. A gate that is not in
this file did not happen.

**The project is not beta-ready until every item here has been run on real hardware** and either
passes or has a logged, accepted deviation.

---

## How to use this file

1. The building agent **appends** each deferred gate here as it reaches it, under the right slice
   heading, copied **verbatim** from the plan.
2. When a Surface is available, a human (or an agent driving the device) works through the file
   top to bottom.
3. Record the result inline: `PASS`, `FAIL — <what happened>`,
   `DEVIATION — <what was accepted and why>`, or `PENDING — <why it could not be run>`.
   **Never fake a result and never delete an item.** An item that has not been run is `PENDING`, not
   `PASS`; a pen-only item on a touch-only run is `PENDING (pen-only)`, not a FAIL.
4. A `FAIL` goes back to the owning slice as a bug, before beta.
5. **Pen-only items are not v1 touch blockers.** H9 (pen pressure), H13 (barrel button) and H14 (pen
   hover) require a pen; a touch-only build may ship with them `PENDING`. H1b, H15, H16, H18 must be
   run **without a pen**.

---

## Test device record

Fill this in before the first run — several gates are device-specific.

| Field | Value |
|---|---|
| Device model | _(e.g. Surface Go 3 / Surface Pro 9)_ |
| RAM | |
| Screen resolution + scaling | _(e.g. 1920×1280 @ 200%)_ |
| Windows build | |
| Edge version | |
| Pen present this run? | _(Yes / No — most items must pass **No**; pen-only items need Yes)_ |
| Pen model | _(optional — leave blank for a touch-only run)_ |
| Gloves available | _(Yes / No — H2)_ |
| Date tested | |
| Tested by | |

---

## Deferred gates by slice

> The building agent fills these in. Each entry is the gate text copied verbatim from
> `docs/implementation-plan.md`, plus a result column.

### Slice 0.1 — Scaffold
| Gate | Result |
|---|---|
| _(append as reached)_ | |

### Slice 0.2 — Input spike
| Gate | Result |
|---|---|
| **Touch tap-tap (no pen present):** tapping twice places a dimension A→B; the geometry commits and the value sheet can be opened. | PENDING — no Surface available (deferred, BUILD-RUNBOOK §4) |
| **Touch drag vs pan (the §3.1 predicate):** one-finger drag on a grabbable, unlocked object moves it; on empty canvas it pans; a second finger cancels and restores the previous position; two-finger drag always pans. | PENDING |
| **Pen parity:** the pen draws (pressure/tilt) and the same tap-tap placement works with it. | PENDING |
| **Palm gauntlet (with a pen present):** draw a stroke > 1.2 s with a palm resting on the glass mid-stroke — no pan, no zoom, no stray ink. | PENDING |
| **Touch-only palm gate (no pen ever detected):** rest a palm/heel and tap-tap — no accidental placement; a stray contact is recoverable by `pointercancel` rollback + undo. Assert the router reports `penPresent === false` and that no suppression window is claimed (it is best-effort only). | PENDING |
| Ink appears ≤ 16 ms perceived (draw fast and watch; use the browser's frame stats if in doubt). | PENDING |
| Pull the pen out of range mid-drag → `pointercancel` → stroke aborts cleanly (no partial commit). | PENDING |
| A touch `pointercancel` mid-placement discards the pending anchor and commits nothing. | PENDING |
| _(C3 re-measure)_ Re-measure device camera caps on the target Surface (`enumerateDevices` + `getUserMedia`); the dev-machine reading was PROVISIONAL (no camera). | PENDING — see H10 |

### Slice 0.3 — First-run / Settings / Home
### Slice 1.2 — Storage core
| Gate | Result |
|---|---|
| **Kill-switch ×3:** power-loss mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → reload: previous file intact, no `*.tmp` survivors, autosave chip reaches Saved. | PENDING — no Surface available (deferred, BUILD-RUNBOOK §4) |
| Kill-switch leaves **no `*.tmp` anywhere**, including inside `sheets/<n>/` and `assets/` — check the whole tree, not the project root. | PENDING |
| Fill the disk (or stub the quota error) mid-edit → chip shows `«Disk full — free space to save»`, the edit is not lost, and `.history/` and `.trash/` are untouched. | PENDING |
| Copy a project folder in Explorer → both appear as separate cards, one badged `«Copy»`; editing one never writes into the other. | PENDING |
| Create a project → folder appears on disk with `project.json`. | PENDING |
| Two tabs, same project → second is read-only. Two tabs, different projects → both writable. | PENDING |
| Explorer-rename the project folder mid-session → identity survives (card still opens after Locate/repick). | PENDING |
### Slice 1.3 — Photo on canvas
| Gate | Result |
|---|---|
| A 12MP phone photo opens upright (EXIF baked) and zooms 0.25×–8× smoothly on a Surface Go. | PENDING — no Surface available (deferred, BUILD-RUNBOOK §4). Machine-adjacent half is green: the synthetic 12 MP orientation-6 fixture decodes upright in Chromium (`tests/normalizeImage.browser.test.ts`) and zoom clamps at 0.25/8 (`tests/editorCanvas.browser.test.ts`). |
| 20-photo import doesn't crash (memory watch). | PENDING |
| EXIF: exported/normalized photo contains no GPS (verify in Explorer file properties). | PENDING — machine half green: `tests/normalizeImage.browser.test.ts` + `tests/exif.test.ts` prove the re-encode drops all APP1 metadata (no orientation, no capture time, no GPS). Confirm in Explorer file properties on hardware. |
| Touch object-drag: one-finger drag on an object moves it; on empty canvas pans; a second finger cancels and restores the previous position; two-finger drag always pans. | PENDING — the pure predicate (`decideDragTarget`, `onSecondFinger`, `isTap`) is machine-tested (`tests/dragPredicate.test.ts`); there is no grabbable geometry until slice 1.5, so the on-glass walk is deferred. |
| (session 4) The thumbnail decode actually runs in `decodeWorker.ts` — confirm on the Performance panel that decode is off the main thread, don't assume the import wired it up. | MACHINE HALF PASSED — `tests/thumbnails.browser.test.ts` asserts the worker's `decodedIn: 'decodeWorker.ts'` provenance marker, and the production build emits `dist/assets/decodeWorker-*.js`. The Performance-panel observation (off-main-thread confirmation on the Surface) is PENDING. |
| (a11y §19.6) The canvas container has an accessible name and is not a keyboard trap; zoom controls are reachable and labelled; 48 px minimum touch targets, hit slop 16 px (24 px along thin strokes). | PENDING — markup carries `role="application"` + `aria-label` (canvas) and labelled zoom buttons (`Zoom in` / `Zoom out` / `Fit to photo`); the on-device focus-order, visible-ring and measured-target walk is deferred. |

| **(C4) Markup-layer redraw at `min(dpr, 2)`** — a 4096-px sheet carrying ~50 annotations, panned; report the median frame time and read the `§21.8` ladder (≤16 ms keep; >16 ms drop overlay to 1, re-measure, then markup to 1.5, then 1). | PENDING — **not runnable at slice 1.3** (no annotation model exists yet); re-run after 1.6. See DECISIONS D66. |

### Slice 1.4 — Capture flow

| Gate | Result |
|---|---|
| Capture → review → Use → sheet on disk (verify file); thumbnail appears. | PENDING — machine half green: `tests/cameraFlow.test.tsx` drives shutter → review → «Use photo» and asserts `photo.jpg` is written through the shared `addSheetFromPhoto` path, exactly one sheet is appended to `project.json`, the thumbnail is scheduled and `onCaptured` fires; `tests/sheetIntake.test.ts` covers the write itself. Confirming the file and the card on the device (Explorer) is deferred. |
| Kill the app mid-capture-write → no partial photo on disk (tmp cleaned); sheet absent or intact, never half-written. | PENDING — machine half: the write goes through `projectStore.writeAtomic` (tmp → close → `move()`), so a kill can only leave a `*.tmp` survivor, and `cleanStaleTmp` removes it. The on-device form of this is the kill-switch harness (`tests/e2e/kill-switch.spec.ts`, H4). |
| Camera-denied → fallback panel with the exact fallback copy. | PENDING — machine half green: `tests/cameraFallback.test.tsx` asserts the `capture.unavailable` + `capture.embeddedFallback` copy, both fallback buttons and the OS privacy note. The real permission-denied / `NotSupportedError` path is device-specific. |
| Resolution toggle shows the device’s **real** max (matches the 0.2 report — never the sensor MP). | PENDING — **the 0.2 probe found no camera on the build machine** (CHECKPOINTS C3 / DECISIONS), so there is no measured device max to display; the toggle ships the honest generic `«High (device max)»` / `«Fast»` labels and does not claim a resolution. Re-measure C3 on the Surface (`H10`), then confirm the promoted `«Use the Windows Camera app for detail shots»` copy fires only when the measured max is ≤ 1080p. |
| (a11y §19.6) Shutter, toggles and the review actions are keyboard-operable and labelled; the camera-unavailable guidance is text, not an image; all touch controls ≥ 48 px with 16 px hit slop. | PENDING — machine half green: the shutter, toggles and review actions carry `aria-label`s (`a11y.shutter`, `a11y.torch`, `a11y.grid`, `a11y.level`, `a11y.cameraFlip`, `capture.retake`, `capture.usePhoto`) and the 88 px shutter clears the floor; the on-device focus-ring and measured-target walk is deferred. |
### Slice 1.4.5 — Editor shell
| Gate | Result |
|---|---|
| All 14 tools render in the rail at 56px with 8px gaps, on the handedness side. | PENDING — no Surface available (deferred, BUILD-RUNBOOK §4). Machine half green: `tests/editorShell.test.tsx` proves the frozen table (14 tools / 6 groups / unique ids / copy) and the handedness side (`railSideFor`), and the rail renders 14 buttons; the on-glass 56 px / 8 px walk and the handedness mirror are deferred. |
| Rotating the Surface flips the style-panel dock and **does not move the rail**; zoom, tool and selection survive. | PENDING — machine half green: the `panelDockFor` table (incl. the inclusive 1.2 boundary) and a jsdom rotation that flips `data-dock` 1240×908 → 960×1388 while `data-rail` and the store’s tool/selection stay put; the real device rotation is deferred. |

### Slice 1.5 — Dimension tool

| Gate | Result |
|---|---|
| **Touch tap-tap:** two taps place a dimension; geometry commits at tap B; the value sheet auto-opens after the **450 ms** settle **unless** a contact occurred, and a mid-settle contact cancels it **permanently** while the geometry survives. | PENDING — machine half green: `tests/dimensionTool.browser.test.ts` + `tests/sheetEditor.dimension.browser.test.ts` drive the real Konva stage through tap-tap, the settle timer and the contact-cancel. On-glass walk deferred. |
| **Keypad truth table** with the Type Cover: `12 6` + Enter → label `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact. | PENDING — machine half green: `tests/dimensionKeypadSheet.test.tsx` asserts the derived label **and** the committed `valueMm`/`enteredText`, computed through the real `src/domain/units.ts` primitives (no re-implementation). |
| **Refusal table** on-device — `0`, `12 6 20`, `-5` and a 1001-ft value each refused **with its reason legible** in the sheet (gloves, sunlight), not a silently disabled button. | PENDING — machine half green: the reason is rendered in the preview area (`keypad.errorEnterLength` / `errorFractionTooBig` / `errorTooLarge`) and the boundary value `1000 ft` still commits. |
| `Esc` and the sheet’s ✕ **keep** the drawn stroke with a ghost label; a canvas tap while the keypad is open does nothing (no place, no select) while pan and pinch-zoom stay live. | PENDING — machine half green: `onCancel` commits nothing (asserted), and the shell defers **both** Escape and the tool hotkeys to the open sheet (`EditorLayout` guards on `editorStore.keypadOpen` before the Esc ladder). |
| **Measured loupe ratios:** pen **3.5×** at 112/160/200 px (source 32 / 45.7 / 57 px) **and** touch **4×** of a 50 px source in its 200 px window — measured against a known feature, never eyeballed. | PENDING — machine half: the arithmetic is pinned in `src/editor/Loupe.ts` (`112/3.5 = 32`, `160/3.5 = 45.714…`, `200/3.5 = 57.142…`, `200/4 = 50`) and covered by `tests/loupe.test.ts`. |
| **4 dimensions in < 60 s (gloves off) / < 90 s (gloves on).** | PENDING — the keypad is on the critical path. |
| **Pen/touch endpoint-placement accuracy walk** — the drawn arrowhead may be off-target while the typed value stays right (the failure mode is "wrong-looking drawing, right number"). | PENDING — see also **C10**. |
| **Measured keypad targets** on glass: 72 px keys / 64 px commit / 56 px toggles / 48 px chips, and 16 px hit slop that does not overlap between adjacent keys. | PENDING — **CSS-declared only, not machine-measured**: jsdom has no layout, and the lane correctly declined to assert the CSS text as if it were a measurement. Recorded as a coverage gap, not a pass. |
| **Hardware-keyboard-only keypad operation**; focus is inside the sheet on open and returns to the canvas on close. | PENDING — machine half green: the jsdom suite asserts the focus trap, the Tab order and the focus return; the real Type Cover walk is deferred. |
| **Object-first drag + second-finger restore with a real finger** (D37/D63 residual risk). | PENDING — machine half green: `tests/sheetEditor.dimension.browser.test.ts` (`describe(‘D63 …’)`) drags a dimension 120 px, lands a second pointer, and asserts the endpoints return to the pre-drag pair with **no commit at the displaced position**. |
### Slice 1.6 — Markup tools
### Slice 1.7 — Insets
### Slice 1.8 — Style system
### Slice 1.9 — Export
### Slice 1.10 — Safety & polish
### Slice 1.11 — Release & update

---

## Cross-cutting checks (run once, at the end, not per slice)

These are the tests that only mean something on the finished app.

| # | Check | Result |
|---|---|---|
| H1 | **Palm gauntlet, full app — touch-primary, pen present:** with a pen detected and in range, tap-tap a dimension while a palm rests on the glass, in the real editor with all tools loaded. The pen's 1.2 s suppression window (`P §8.2`) must cover the touch: no stray geometry, no pan, no zoom, no stray ink. Repeat 10×. | |
| H1b | **Palm check, pen absent (highest risk):** the input router has **no palm suppression window without a pen** — `lastPenAt` is only set by a pen event, so with no pen the window never opens; with a placement tool armed and no pen ever seen, touch classifies as `'draw'` (the plan's locked truth table) (`P §8.2`; `gui-ux…` §13.4). Touch-only, no pen in range, test explicitly: **(a)** palm resting on the glass during a tap-tap placement; **(b)** accidental two-tap in quick succession; **(c)** the undo/rollback path — `pointercancel` discards the pending placement and the Undo button restores the prior state. Record counts of stray geometry, stray pan and stray zoom. A resting palm producing two clean, intended taps is the accepted-risk case; a resting palm producing stray geometry or a silent move is a FAIL. | |
| H2 | **Gloves:** complete 4 dimensions wearing work gloves, under 90 s. | |
| H3 | **Sunlight:** Sunlight theme legible outdoors, on a real job site or a vehicle dash in direct sun. | |
| H4 | **Power loss:** pull the power mid-`markup.json` write, mid-`photo.jpg` write, and mid-`move()`. Reload: previous file intact, no `*.tmp` anywhere in the tree, chip reaches Saved. | |
| H5 | **Reboot:** edit → 5 min idle → reboot → reload. Nothing lost. | |
| H6 | **8-hour offline day:** airplane mode all day, real work, no network. Nothing degrades. | |
| H7 | **Battery:** note battery drain over a 4-hour session with the camera used ~20 times. | |
| H8 | **50-photo project:** build one, then export at 2×. No tab crash. | |
| H9 | **Pen pressure — pen-only, NOT a v1 touch blocker:** a hard stroke is visibly wider than a light one at the same style width. `pressure` is a pen-only signal (a parallel array filled from pen input — `IP:956–959`); it is unreachable from a finger, so a touch-only device is expected to skip this row. Mark **PENDING (pen-only)** rather than FAIL when no pen is present. | |
| H10 | **Real camera resolution:** the capture toggle's label matches what the device actually delivers (C3). | |
| H11 | **Install + airplane reload** from the pinned production origin, on a clean Surface, following `docs/install-runbook.md`. | |
| H12 | **Export measured in Acrobat:** a 4-mu stroke and an 18-mu label measure identical physical sizes in PDFs exported at 1×, 2× and 3×; page size = imagePx × 0.75 pt. | |
| H13 | **Barrel-button routing (pen-only):** confirm the pen barrel button arrives as `button === 2`, `buttons === 2`, and is not stolen by a Windows/Edge right-click or long-press gesture. The radial quick-menu is barrel-gated (`P §2.4:226`); if the button cannot be read, keep the documented degrade path (radial absent rather than broken) and reach the menu from the rail only. | |
| H14 | **Pen hover semantics (pen-only):** confirm `pointerType === 'pen'` with `buttons === 0` fires `pointerover`/`pointermove` in range and that hover never triggers an action. Touch has no hover, so every hover affordance needs the touch equivalent in `TF §6.3` — verify both. | |
| H15 | **OS pinch/zoom delay on inking surfaces:** Windows adds ~250 ms to pinch/zoom on inking surfaces (`HKLM\SOFTWARE\Microsoft\Palm\DelayManipulationDuration`; `gui-ux…` §7.1). Time a two-finger pinch on the canvas and record the perceived delay. Do **not** misdiagnose it as an app bug and do not attempt to optimise it away app-side; document the measured value. | |
| H16 | **Real coalescing rate:** on a fast stroke, record `getCoalescedEvents().length` per `pointermove` and the real event rate (`pointerrawupdate` if used). The spike gate expects coalesced length > 1 on a fast stroke; record whether fingers and the pen differ. | |
| H17 | **Ink API availability:** confirm whether the Ink API (`navigator.ink`) is present and usable on the **target Edge build**. It is a latency lever for the `U §14.13` ≤16 ms budget (`gui-ux…` §7.1) but must not be assumed; record present/absent and fall back to the Canvas path if absent. | |
| H18 | **DPR-2 / thermal with a 4096px photo:** pan a 4096-px-long-edge sheet at `devicePixelRatio = 2` for 5 minutes and record sustained FPS, any frame > 100 ms, and whether the tablet throttles (thermal) over the run. The 0.2 spike's ≥50 FPS sustained gate applies (`gui-ux…` §8.1 gate 9). | |
