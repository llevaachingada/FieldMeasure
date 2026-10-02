# 1. What you are getting

An honest inventory, so nothing surprises you later.

## What the app does today

| Area | What a crew member can do |
|---|---|
| Projects | Create a named project. Each project is a folder on the Surface (default `Documents\FieldMeasure`). |
| Capture | Take photos with the rear camera, use zoom chips, add an optional room name, then Use photo or Retake. |
| Dimensions | Tap-tap or drag a dimension line, then type feet, inches and fractions on a calculator-style keypad. Ends snap to other marks, a magnifier (loupe) helps placement, and the label can be dragged. |
| Markup | 14 tools, including lines, arrows, shapes, angles, a freehand pen, a highlighter, text boxes, an eraser and photo-in-photo insets. Undo, redo and layers. |
| Export | One-page PDF or PNG with a date and time stamp and the VANGARDE watermark (it can be turned off in Settings), saved to a folder you choose. |
| Offline | After the first install the app opens and works in airplane mode. |
| Help | A Help button on every screen. The same text is in [`docs/USER-GUIDE.md`](../docs/USER-GUIDE.md). |

Everything saves automatically. Nothing ever leaves the Surface unless someone drags the folder into
Dropbox or email.

## How well it is tested

| Kind of check | Status |
|---|---|
| Automated tests (about 1,690 of them, run by GitHub on every push) | Passing, apart from two known timing-sensitive tests that sometimes fail under load. They are listed in `docs/CONTINUITY.md`. |
| Scripted click-through on an emulated Surface screen (`npm run clickthru`) | 20 of 20 steps passing |
| **A real person on a real Surface with a pen** | **Not done yet.** The list of things to check is [`docs/HARDWARE-TEST-CHECKLIST.md`](../docs/HARDWARE-TEST-CHECKLIST.md) (rows marked `[Surface]`). |

**Your first job:** give one crew member a Surface and an hour to use it on a real site. Walk the
`[Surface]` rows with them. Things only real hardware can show: palm rejection, the pen in sunlight,
camera quality, and whether autosave survives the battery dying.

## Known unfinished items

These are written down in `docs/CONTINUITY.md` so an AI can pick them up:

- The "Offset Nudge Pad" (on-screen fine-adjust arrows). Keyboard arrow-key nudging already works.
- The "History" panel (browse older saved versions of a sheet). The saving behind it exists; the
  button does not yet.
- Two small layout choices nobody has decided yet: how the side panel looks when different kinds of
  marks are selected together, and the tab order for left-handed users.
- Some wording in the app is marked "proposed" and has never been signed off.

None of these block real use.

## The codebase in one picture

```
src/
  domain/   the maths: feet-inch parsing, rounding, snapping     <- a bug here = a wrong measurement
  editor/   the drawing canvas and the 14 tools
  fs/       saving to disk, safely (write, check, then swap)     <- a bug here = lost work
  export/   building the PDF and PNG                             <- a bug here = a wrong printout
  ui/       screens, buttons and dialogs. ALL wording lives in ui/strings.ts
public/branding/   the VANGARDE logo files (swap these to rebrand)
docs/              the project's memory: specs, every decision (DECISIONS.md), the build log
tests/             the safety net. Leave it alone unless you are adding to it.
AGENTS.md          the rules every AI tool reads before touching the code
```

## Things it deliberately does not do

No accounts, no cloud sync, no sharing between Surfaces, no server, no analytics, no AI features.
Those are design choices, not missing work. They are why it costs nothing to run and why the
photos stay private. If you ever need sync, the low-effort answer is Dropbox or OneDrive syncing the
projects folder, not changing the app.

## What you need

- A **GitHub account**. A free company account is fine. Free accounts publish the app from a
  **public** repository. The code is visible to anyone, but your photos and projects never are,
  because they never leave the Surfaces. If you want the code private, GitHub Pro or Team allows
  that (the app's web address is still public either way).
- **Microsoft Edge or Google Chrome** on the Surfaces. Firefox and Safari cannot save to folders.
- Optional: an AI coding tool, if you want to change the app.

Next: [2. Deploy your own copy](2-deploy-your-own-copy.md)
