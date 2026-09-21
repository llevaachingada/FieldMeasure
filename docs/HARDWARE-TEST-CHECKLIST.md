# Hardware test checklist — gates that need a real Surface with a pen

Many acceptance gates cannot run on a development machine: palm rejection, pen pressure, sunlight
legibility, power-loss mid-write, real camera resolution. Those gates are marked `[Surface]` in
`docs/implementation-plan.md`.

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
3. Record the result inline: `PASS`, `FAIL — <what happened>`, or
   `DEVIATION — <what was accepted and why>`.
4. A `FAIL` goes back to the owning slice as a bug, before beta.

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
| Pen model | |
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
| _(append as reached — the palm gauntlet lives here and it is the highest-risk test in the project)_ | |

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
| H1 | **Palm gauntlet, full app:** draw a >1.2 s stroke with a palm resting on the glass, in the real editor with all tools loaded. No pan, no zoom, no stray ink. | |
| H2 | **Gloves:** complete 4 dimensions wearing work gloves, under 90 s. | |
| H3 | **Sunlight:** Sunlight theme legible outdoors, on a real job site or a vehicle dash in direct sun. | |
| H4 | **Power loss:** pull the power mid-`markup.json` write, mid-`photo.jpg` write, and mid-`move()`. Reload: previous file intact, no `*.tmp` anywhere in the tree, chip reaches Saved. | |
| H5 | **Reboot:** edit → 5 min idle → reboot → reload. Nothing lost. | |
| H6 | **8-hour offline day:** airplane mode all day, real work, no network. Nothing degrades. | |
| H7 | **Battery:** note battery drain over a 4-hour session with the camera used ~20 times. | |
| H8 | **50-photo project:** build one, then export at 2×. No tab crash. | |
| H9 | **Pen pressure:** a hard stroke is visibly wider than a light one at the same style width. | |
| H10 | **Real camera resolution:** the capture toggle's label matches what the device actually delivers (C3). | |
| H11 | **Install + airplane reload** from the pinned production origin, on a clean Surface, following `docs/install-runbook.md`. | |
| H12 | **Export measured in Acrobat:** a 4-mu stroke and an 18-mu label measure identical physical sizes in PDFs exported at 1×, 2× and 3×; page size = imagePx × 0.75 pt. | |
