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
| _(append as reached — the palm gauntlet and the touch-placement checks live here; they are the highest-risk tests in the project. Run them **without a pen present** unless the row says pen-only)_ | |
| _(pen-optional framing: the router must classify touch as a first-class input. The old gate "Pen draws a line; finger pans" is superseded — see `docs/touch-first-interaction-model.md` §3.1)_ | |

### Slice 0.3 — First-run / Settings / Home
### Slice 1.2 — Storage core
### Slice 1.3 — Photo on canvas
### Slice 1.4 — Capture flow
### Slice 1.4.5 — Editor shell
### Slice 1.5 — Dimension tool
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
