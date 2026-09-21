# FieldMeasure — UI/UX Specification (v2, hardened)

**Product:** Surface touch + pen photo-annotation and field measurement app.
**Runtime:** Microsoft Edge, installed as a PWA, Windows 11. Fully local (File System Access API + IndexedDB). No server, no cloud, no account.
**Author:** UI/UX (design preflight), hardened per adversarial review 2026-09-21. **Status:** Preflight — ready for build.
**Copy note:** Any string in `«guillemets»` is placeholder copy. Final wording is owned by the content owner; do not treat these strings as final. 〔v2.1, C14: several labels appear **unquoted** here for readability — the Style-panel headers (`COLOR`, `WIDTH`, `FILL`, `TRANSPARENCY`, `LINE STYLE`, `ARROWHEADS`, `PRESETS`, `RECENT`), the Home sort options (`Recent / Name / Size / Needs attention`), the Home search placeholder, the first-run card labels (`Right / Left`), and the Capture toggle labels (torch, grid, level, flip, resolution). They are **copy too**, not literal captions: route them through `src/ui/strings.ts` sourced from `docs/appendix-strings.md`.〕
**Scope note (v2):** The companion `docs/preflight-handoff-v0.3-hardened.md` **§2.4 v1 scope table is the single authority on what is built**. Wherever this document shows a v1 scope marker — `〔v1 scope: …〕` — follow it. Deferred/cut features have had their controls removed or annotated in place so a builder cannot build the wrong v1.

---

## 0. Design intent in one paragraph

FieldMeasure is a professional instrument, not a creative toy. It should feel like a well-made surveying tool: dark, quiet, precise, and instantly legible in direct sun. The photo is the hero and must never be fought for space. Every control exists to be hit *once*, correctly, by a gloved finger or a pen tip, without the user looking away from the photo for more than a moment. Nothing is modal unless the user asked for it. Nothing is ever lost. There is no Save button and therefore the app must earn trust through a continuously visible save state.

---

## 1. Interaction principles (non-negotiable; do not flatten these)

1. **Touch places and moves. Pen draws. Both create geometry.** Touch is the **primary input**; the pen is an **enhancement** (pressure, tilt, hover). A **tap** places a point or selects; a **one-finger drag** moves the grabbable object under the finger and otherwise pans (§5.4); a **two-finger drag always pans**; a **pen drag** draws. Two Settings toggles re-scope this: **`«Touch places and moves»`** (**on** by default) and **`«Finger draws (freehand)»`** (off by default); the pen always draws regardless. 〔Touch-first, v2.1: this **inverts** the previous "Pen draws, finger navigates" default and the palm-smudge rationale that rested on it. The full interaction design is `docs/touch-first-interaction-model.md`.〕
   - **Palm rejection is now probabilistic, not deterministic.** With no pen present there is no pen event to suppress touch against; a web page **cannot** suppress OS touch behaviour (W3C Pointer Events 3: *"it is not possible for authors to suppress this behavior"*), and contact geometry is unreliable (`PointerEvent.width/height` default to `1` when the hardware cannot report it). The app therefore leans on the OS/digitizer where it exists, edge/dead-zone rejection, and a multi-touch debounce as **bounded heuristics**, with **undo and rollback on `pointercancel`** as the real safety net. It never builds a mode that silently discards input. See §5.4 and §14.7.
   - **Tap-tap is the primary placement verb for every placement tool**, and the **loupe is the tap's precision channel** (§8.1–§8.3). Every pen-hover-only affordance gains a touch equivalent (§6.3, §8.7, §14.6). Touch confirmation is **visual-only — there are no haptics** (§14.14).
2. **The photo is never occluded by persistent chrome.** Any UI that overlaps the canvas (loupe, keypad, popovers, selection toolbar) is transient: dismissible by tapping the canvas, by Esc, or by completing the action. No modal ever sits between the user and the photo except the camera preview and the export wizard.
3. **Style is always one tap from the tool.** The current tool + its exact style is rendered as a live swatch and is always on screen (the **Style Chip**). Changing color/width/fill never requires opening a modal — popovers are invited by long-press, never forced.
4. **Back is always safe.** Because everything autosaves, navigating back never prompts, never warns, and never loses work. This lets us remove confirmation dialogs from most of the app.
5. **Destructive needs intent, not a blind tap.** Recoverable actions get an undo toast, never a dialog. Only irreversible actions get a dialog, and that dialog's primary button requires a **press-and-hold** (600ms fill ring) rather than a tap.
6. **Marks must survive any photo.** Every label, handle, and floating control uses a dual-outline (dark core + light halo) or a solid 90%-opaque pill. No thin single-color strokes over photography.
7. **No gesture-only actions.** Every gesture (pinch, two-finger tap, hold-to-shape, pen barrel button) has an equivalent on-screen button.

---

## 2. Target device & layout constraints (quantified — build to these numbers)

| Target | CSS px @ device scale | Notes |
|---|---|---|
| **Primary: Surface Pro 9 / 8 landscape** | **1440 × 960 @ 200%** | Design canvas. 13", 267 ppi. |
| Min supported landscape: Surface Pro 7 / Go 3 | 1368 × 912 / 1280 × 853 | Must not break; rail may compress. |
| Primary portrait | **960 × 1440 @ 200%** | Kickstand off, handheld or stand. |
| Desk: Surface Laptop Studio | 1200 × 800 @ 200% | Use Compact density. |

**Physical target math (why 56px):** at 267 ppi and 200% scaling, 1 CSS px = 0.1904 mm. Therefore:

- 48 CSS px = **9.1 mm** (absolute floor, secondary chrome only; under touch-primary this 48px value is the **hard touch floor** — §14.5)
- 56 CSS px = **10.7 mm** (tool buttons, style controls — clears heavy work gloves)
- 64 CSS px = **12.2 mm** (dialog primaries / destructive confirm — the camera **shutter** is 88px, listed below)
- 72 CSS px = **13.7 mm** (**keypad number keys** — session 4: §8.1's diagram says 72px and this
  list said 64px. 72 wins: the keypad is the wrong-measurement surface, it is used with gloves,
  and it has the screen budget. The **loupe** was listed here in error — it is a passive
  magnifier, never a hit target; its geometry is build spec §19.5.)
- 88 CSS px = 16.8 mm (camera shutter)
- Minimum **8 CSS px gap** between adjacent targets.

**Aspect-ratio rule (drives the whole layout):** Surface photos are 3:2 (1.5) landscape or 2:3 portrait. Chrome is placed so the remaining canvas aspect stays **close to the photo's aspect**, because matching aspect yields ~35% more photo pixels than a bottom-deck layout at the same footprint. This is why the tool rail is vertical, not horizontal.

- Landscape with rail (128) + collapsed style spine (72): canvas 1240 × 908 = **1.37** (vs 1.5 ideal) → photo occupies ≈1.03 M px².
- Same device with a bottom deck instead: canvas 1440 × 776 = 1.86 → photo only ≈0.90 M px². **Vertical rail wins by ~15% vs a bottom deck, and by ~44% vs a full side style panel** (photo area: rail 1240×827 ≈ 1.03M px² · bottom deck 1164×776 ≈ 0.90M px² · full side panel 1032×688 ≈ 0.71M px²).

---

## 3. Visual direction — "Site Slate"

A high-vis, industrial-survey aesthetic: graphite chrome, one confident hi-vis accent, monospaced numerals, chunky geometry, hairline separators. It reads as *instrument*, never as *app store*.

### 3.1 Color tokens

```
/* Base — Graphite (dark chrome; keeps annotation colors honest and reduces glare) */
--g900 #0E1318   app background / canvas mat
--g850 #12181E   chrome background (top bar, rail)
--g800 #161C23   panel background
--g750 #1E262F   elevated surface (popover, sheet)
--g700 #2B3540   2px hairline / separators  (never use 1px — see §11.4)
--g600 #3A4652   control border / inactive icon
--g400 #6E7F8E   disabled text/icon
--g300 #9FB0BE   secondary text
--g100 #EAF0F5   primary text
--g000 #FFFFFF   max-contrast text (Sunlight mode)

/* Accents */
--hi    #FF7A18  HI-VIS ORANGE — primary action, active tool, default dimension stroke
--hi-d  #D45F0C  pressed/active-dark
--sel   #2FD4E0  SIGNAL CYAN — selection, snapping, focus rings, manipulation handles ONLY
--sel-d #12909A  selection pressed

/* Semantic */
--ok    #3DD68C   --warn #FFC24B   --err #FF5A5F

/* Canvas mat */
--mat   #0B0E12 with a radial vignette (rgba(0,0,0,.45) at edges) so the sheet reads as
        paper on a table. Sheet gets: 2px rgba(255,255,255,.10) edge + 0 12px 40px rgba(0,0,0,.55).
```

**Accent discipline (hard rule):** Orange = *action and measurement*. Cyan = *selection and manipulation*. These never swap. An orange thing is tappable; a cyan thing is a handle you drag. This lets a user parse a screen in one glance.

**`--sel` cyan has two distinct treatments — never conflate them (C11).** The **keyboard focus ring** is a `--sel` 2px ring drawn with a **2px offset** around the focused control; a **selection** is a `--sel` 2px bounding box plus a **4px `--sel` outer glow** (§8.6). Same hue, different frame, so "where the keyboard is" is never mistaken for "what is selected". 〔v2.1, C11〕

**`--hi` orange is *deliberately* both the UI accent and `DEFAULT_STYLE.strokeColor` (`#FF7A18`, preflight §3.3) (C12).** A fresh dimension is the same hi-vis orange the rail uses for "measurement", so the default mark matches the tool's promise. Chrome and canvas are different surfaces with different contrast contexts, so the shared token is intentional — but **verify legibility on both bright (sky / grass / concrete) and dark (night / undergrowth) photos**; if `#FF7A18` fails on any background common to this app, the *canvas* dimension stroke is darkened for canvas only and this note is updated (the UI accent never changes). 〔v2.1, C12〕

### 3.2 Markup palette (12 swatches, ordered for visibility over real photos)

Ordered left→right by "pops on a bright sky / grass / concrete" ranking:

`#FF7A18` Hi-Vis Orange · `#FFD400` Safety Yellow · `#E8384F` Signal Red · `#FF3D9A` Magenta · `#2FD4E0` Cyan · `#35A7FF` Sky · `#2ECC71` Green · `#A8E05F` Lime · `#FFFFFF` White · `#000000` Black · `#9AA6B2` Concrete · `#123B6B` Deep Navy

Plus: **Custom…** (HEX + HSL + RGB entry) and **Eyedropper** — pick a color from anywhere in the photo. Eyedropper has a companion suggestion: *"Nudge for contrast"* which shifts the picked hue ±18° and lightness until the WCAG contrast vs the sampled 24×24 px region is ≥ 4.5:1, with a live before/after preview.

### 3.3 Typography

Self-hosted, bundled in the service worker cache (there is no network in the field — **never** load fonts from a CDN).

- **UI / display: Archivo** (variable, 400 / 500 / 600 / 700). Sturdy industrial grotesque; excellent small-size legibility; not a default UI font; free/open.
- **Numerals / measurements: JetBrains Mono** (500 / 700, tabular figures, slashed zero). Every ft-in value, angle, zoom %, and file size on screen uses this face. It makes the live-parse preview stable (digits don't dance) and disambiguates `0/O` and `1/l` — critical on a construction site.

| Role | Font | Size / line-height | Weight | Notes |
|---|---|---|---|---|
| Screen title | Archivo | 24 / 30 | 700 | Home, Project |
| Sheet title | Archivo | 17 / 22 | 600 | Truncate middle, editable inline |
| Body / list row | Archivo | 15 / 20 | 500 | |
| Label / chip | Archivo | 13 / 16 | 600 | letter-spacing +0.01em |
| Group header (rail) | Archivo | 11 / 14 | 700 | ALL CAPS, +0.06em, `--g400` |
| Number readout (canvas) | JetBrains Mono | 16–28 | 700 | Dual-outline halo. Rule: base **16px at 100% zoom**, scales with zoom, **clamped to 28px** max. |
| Keypad key | JetBrains Mono | 28 / 32 | 600 | Tabular |
| Parse preview | JetBrains Mono | 18 / 24 | 500 | `12' 6 3/8" = 150.4 in` |

### 3.4 Geometry, elevation, motion

- Radii: 10px controls, 14px panels/sheets, 999px pills. Chunkier than a normal app, on purpose.
- Elevation is used **only** for floating layers: `0 8px 32px rgba(0,0,0,.55)`, `0 24px 64px rgba(0,0,0,.6)` for dialogs, plus a `inset 0 1px 0 rgba(255,255,255,.06)` top highlight so edges don't vanish in sun.
- Motion: `150ms cubic-bezier(.2,0,0,1)` for chrome; 200ms slide-fade for screen transitions. **Ink has zero animation** — strokes render on the predicted/coalesced pointer path, 1:1, no easing, no lag. Respect `prefers-reduced-motion` (drop to opacity-only).
- Icons: 24px grid, 2px stroke, round caps, drawn as filled silhouettes for the active state (a filled chip is readable at a glance in glare where an outline is not). Custom glyph set, not a generic icon library — e.g. Dimension = a measured line with tick ticks and outward arrowheads; Angle = an arc between two rays.

### 3.5 Density modes

- **Field** (default): 56px controls, 72px rail, 8px gaps, 15px body.
- **Desk**: 48px controls, **≈108px rail** (still a 2-column grid: 2×48 + 6px gutter + ~6px padding), 6px gaps, 14px body. Auto-selected when a mouse/trackpad is the primary pointer and no pen has been seen for 5 minutes; user-overridable in Settings.

---

## 4. App shell & navigation

### 4.1 Screens

| Screen | Route | Purpose |
|---|---|---|
| **Home** | `/` | Project list (local folders). Create, open, locate, search. |
| **Project** | `/p/:projectId` | Sheets grid for one project. Add sheet, reorder, export, project info. |
| **Editor** | `/p/:projectId/s/:sheetId` | The photo, the tools, the markup. |
| **Capture** | editor route + `?mode=capture` | Full-screen camera. |
| **Export wizard** | modal sheet over Editor/Project | Format, naming, destination, confirm, progress. |
| **Style editor sheet** | modal sheet over Editor | Full style controls (colors, custom, widths, presets). |
| **Settings** | `/settings` | Handedness, input filters, units, precision, density, theme, storage. |

### 4.2 Navigation model

- **Breadcrumb, always top-left, always tappable:** `Projects / «Riverside Elementary» / «Sheet 04»`. Each segment is a 48px-min target; tapping `Projects` returns Home, tapping the project returns the Sheets grid.
- **Windows-native back also works:** Alt+Left, touchpad/edge back gestures, and a single **Esc ladder: pending → deselect → exit Focus → navigate** (one level per press, never two). Esc first cancels an in-progress action / pending dimension, then clears the selection, then exits Focus mode, and only when nothing is pending does it navigate back (Editor → Project).
- **Editor state is preserved per sheet** (zoom, scroll, active tool, open panels, selection). Returning to a sheet must feel like putting down and picking up a page.
- **No unsaved-work warnings anywhere.** Back is safe. This is a promise the Autosave chip keeps visibly (§10.1).
- Full-screen flows (Capture, Export) are entered with a 200ms slide-up and exited with a slide-down; during Capture, the top bar is hidden entirely and replaced by a minimal in-viewfinder row.

### 4.3 Screen flow

```
Home ──open/create──▶ Project ──open sheet──▶ Editor
 ▲                      │ ▲                    │  ▲
 │                      │ └──back─────────────┘  │
 └────back──────────────┘                        │
                                                 ├─▶ Capture (new sheet / inset)
                                                 ├─▶ Export wizard
                                                 ├─▶ Style editor sheet
                                                 └─▶ Layers panel
```

### 4.4 First run (must complete in under 20 seconds)

Two steps only, no tutorial carousel:

1. **«Which hand do you write with?»** — two big cards (Right / Left), **Right pre-selected as the plain default.** 〔v1 scope: do NOT claim to pre-select from the Windows pen setting — no web API can read it. The v1 copy is simply: `«Which hand do you write with?»` with Right highlighted.〕 Auto-advance on tap. (This drives rail side, style panel side, loupe offset, keypad side, and handle ordering.)
2. **«Where should your projects live?»** — a folder picker (`showDirectoryPicker`) with a suggested default `Documents\FieldMeasure`. Show the resolved path in mono. Buttons: `«Choose folder»` / `«Use Documents\FieldMeasure»`.

Then land on Home with an empty state. Contextual tips appear the first time each tool is used (one line, dismissible, never blocking, shown once per tool, re-enable-able in Settings). Take a photo within 20 seconds of first launch — that is the success bar.

---

## 5. Editor layout

### 5.1 Landscape (1440 × 960) — primary

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  52px                                                                 │
│ ‹ Projects / «Riverside Elem» / «Sheet 04»  │ ✓ «Saved 2:14 PM» │ ⌗ Layers │ ⇧ Export │ ⋯ │
├─────────────────────────────────┬─────────────────────────────────────────────┤
│                                 │                                             │
│                                 │   CANVAS VIEWPORT   1240 × 908               │
│                                 │   (graphite mat + vignette)                  │
│                                 │                                             │
│                                 │   ┌───────────────────────────┐             │
│                                 │   │                           │             │
│                                 │   │        PHOTO SHEET        │             │
│                                 │   │                           │             │
│                                 │   └───────────────────────────┘             │
│                                 │                                             │
│                                 │        [zoom pill]  bottom-left of canvas   │
├─────────────────────────────────┼─────────────────────────────────────────────┤
│ STYLE PANEL (left, 72 collapsed │                                             │
│ / 280 expanded)                 │                                             │
└─────────────────────────────────┴─────────────────────────────────────────────┘
      TOOL RAIL (right, 128px, 2-column grid, bottom-anchored)
```

Actual component order left→right: **Style Panel (72) | Canvas (1240) | Tool Rail (128)**.
(For a **left-handed** user this mirrors exactly: Tool Rail 128 | Canvas | Style Panel.)

**Why this placement — the two-handed thesis:**
The pen hand owns the **Tool Rail**: you pick a tool with the tip of the pen you're already holding, on the side your arm already lives, with zero body-crossing. The free hand owns the **Style Panel**: while the pen hand keeps drawing, the other hand taps color/width/fill. Both hands work at once and neither crosses the body. In a bottom-deck design both hands must reach into the same strip and the pen hand has to travel a long diagonal to the far corner — measurably slower for a tool tapped every few seconds.

The rail is **bottom-anchored**: the tools used most (Dimension, Arrow, Freehand) sit in the lower rows, which is the comfortable arc for a hand resting at the bottom edge, and the rail grows *upward* into the harder-to-reach zone as tools are added.

**Undo/redo live at the bottom of the rail** (two 56px buttons, side by side), directly under the drawing hand — because undo is the most-frequent rail action and hunting for it in the top bar is the classic field frustration. They are *not* duplicated in the top bar.

### 5.2 The top bar (52px, non-negotiable contents)

| Zone | Contents | Behavior |
|---|---|---|
| Left | Breadcrumb `‹ Projects / «Project» / «Sheet»` | Segment tap navigates. 48px targets. Sheet segment is an inline-editable text field (tap → caret + on-screen keyboard; Enter/blur commits). |
| Center | Autosave chip | See §10.1. Always visible, never hidden by overflow. |
| Right | `⌗ Layers` · `⇧ Export` · `⋯ Overflow` | Layers opens a flyout. Export opens the wizard. Overflow holds: Duplicate sheet, Insert image, Add sheet, Import file, Sheet info, Project settings, Settings, Help, Keyboard shortcuts. |

In **portrait (960 wide)**: `Export` collapses to icon-only, the breadcrumb collapses to a single `‹ «Sheet 04»` chip with the full path shown on tap, and the sheet title truncates to 18 characters. Autosave and Layers are never collapsed. **Top-bar height is a deliberate `<TopBar>` height variant:** Editor = 52px, Home/Project = 56px (§11.1–§11.2) — this is intentional, do not unify.

### 5.3 Portrait (960 × 1440)

```
┌──────────────────────────────────┐
│ TOP BAR 52px (compressed)        │
├────────────────────────────┬─────┤
│                            │     │
│   CANVAS 832 × 1316        │ T   │
│                            │ O   │
│                            │ O   │
│                            │ L   │
│                            │     │
│                            │ R   │
│                            │ A   │
│                            │ I   │
│                            │ L   │
│                            │ 128 │
├────────────────────────────┴─────┤
│ STYLE BAR (bottom, 72px, horizontal)
└──────────────────────────────────┘
```

**Docking rule (deterministic, testable):** *If viewport aspect ≥ 1.2, the Style Panel docks to the side opposite the tool rail. If aspect < 1.2, it docks to the bottom as a horizontal style bar.* Rationale: a portrait photo is 2:3, and a 960×1388 canvas is 0.69 — already an almost perfect match. Spending 72px of the scarce width on a side spine would break that match and cost ~20% of photo area; spending 72px of the generous height costs almost nothing. The **tool rail never moves** — muscle memory must survive rotation. Rotation preserves zoom/center, tool, selection, and open panels, and reflows the chrome in 180ms.

Square tool buttons mean the rail needs no re-layout in portrait; the 2-column grid simply has more vertical room than it needs.

### 5.4 Canvas viewport behavior

- **Zoom:** 0.25×–8× (pinch; mouse wheel + Ctrl). Double-tap = fit↔100% toggle, **suspended while a placement tool is armed** so the placement tap is never deferred (pinch and the always-available Fit button remain the zoom paths). Zoom is *centered on the pinch midpoint*. 〔Touch-first, v2.1〕
- **Pan:** **two-finger drag always pans** (this is the reserved safety gesture, in every state, and is never repurposed). A **one-finger drag is object-first**: if the `pointerdown` hit-tests a grabbable, unlocked object, no placement is pending, and the active tool is not Erase, it **moves that object**; otherwise it **pans**. The **Pan tool overrides object-first unconditionally**. Spacebar+drag still works. 〔Touch-first, v2.1 — this is the testable predicate in `docs/touch-first-interaction-model.md` §3.1.〕
- **Why object-first (and the safeguards that make it safe).** Object-first is a **deliberate product-owner decision against the safer selection-first convention** (touch-primary users reach for what they can see, so "I touched the dimension, so I move the dimension" needs no teaching). The mitigating rules are mandatory, not optional: (1) a **second finger always wins** — it cancels the object drag **and restores the object's pre-drag position**, then starts pan/zoom (never silently commit at the displaced position); (2) the Pan tool overrides unconditionally; (3) a one-finger contact that lifts within **8px** of travel (or ≤400ms) is a **tap**, never a drag; (4) every object move is named in the undo toast (§13.2). 〔Touch-first, v2.1〕
- **`PEN_HANDOFF` (the pen takes over).** Any pen `pointerdown` while a touch placement or a touch refine is active **discards the touch pending state and starts a fresh pen placement** — the pen is authoritative when present. This is the pen half of the palm story and must be mirrored in build spec §8.2's `classify` contract. 〔Touch-first, v2.1〕
- **Tap classification:** slop **8px**, tap ceiling **400ms**, long-press at **600ms**. The anchor is placed at `pointerdown` with an **8px / 120ms deadband** to ignore touchdown jitter; `getCoalescedEvents()` is preferred. Arrow-key nudge (1px / 10px with Shift) remains the keyboard escape hatch. 〔Touch-first, v2.1〕
- **Tap precedence (touch):** overlay open → the overlay gets it; otherwise **placement pending → the tap places a point**; then a tap on an **already-selected** object → the tool's action; then a tap on an **unselected** object → **selects it** (a stray tap while a creation tool is armed selects rather than places — the safe failure); then empty canvas → deselect. Two-finger tap is a **secondary** path only (below). 〔Touch-first, v2.1〕
- **Zoom pill** (floating, bottom-left of the canvas, 56px tall, 52px buttons): `−` `«142%»` `+` `⤢ Fit`. Auto-dims to 40% opacity after 4s of no interaction, returns to full on hover or tap. It never overlaps the sheet edge if the sheet's bounding box is within 96px of it — it slides along the bottom edge in that case.
- **Sheet bounds:** the photo appears as a page with a shadow on the mat. A subtle dashed `--g600` outline shows the sheet edge when zoomed in past the edges. Overscroll is allowed to 240px past the edge (breathing room) and springs back on release.
- **Rulers/guides:** off by default. 〔v1 scope: deferred — do not build the ruler toggle or the toggle's overflow entry in v1.〕 Optional top+left rulers show ft-in ticks **when the sheet is calibrated** (calibration itself is also deferred — the whole feature lands together in a later release).
- **Palm rejection (touch-primary, honest scope).** The canvas sets `touch-action: none` and filters `pointer-events` by `pointerType`. When a pen is present, touch is still ignored for **1.2 s after any pen event** and **for the entire duration of an active pen stroke** (configurable window) 〔v2 hardening: a stroke longer than 1.2 s must not re-open the touch window — a resting palm mid-stroke is the field reality.〕 **With no pen this suppression cannot run deterministically** — there is no pen event to key on — so the app treats palm rejection as *probabilistic*: OS/digitizer blocking where it exists, edge/dead-zone rejection, and a multi-touch debounce as bounded heuristics, with **undo + rollback on `pointercancel`** as the real safety net. Never build a mode that silently discards input; never ship a size-threshold palm filter as if it were reliable. 〔Touch-first, v2.1〕
- **Gesture vocabulary (one job per gesture per context):** single tap · double tap · long-press (600 ms) · two-finger tap · one-finger drag · two-finger drag. No three-finger gesture (undo already has a 56px rail button); no edge swipes (Windows shell gestures); no rotate gesture beyond the existing two-finger pinch-on-inset. 〔Touch-first, v2.1〕
- **Two-finger tap is retained as a SECONDARY path only.** It **adds to the selection**, and **cancels** a pending placement or an open keypad (where add-to-selection is meaningless). Because multi-finger gestures are OS-adjacent on Windows (two-finger tap is associated with right-click) it is never the only way to do anything: **every action it triggers also exists as an on-screen control**, per principle §1.7. Verify the behaviour on hardware; do not depend on it. 〔Touch-first, v2.1〕
- **Settings (touch group).** `«Touch places and moves»` (**on**), `«Finger draws (freehand)»` (off), `«Magnifier when you tap»` (**on**), `«Gloved touch»` (off; hit slop +8px, snap acquire +4px, loupe offset +16px). The existing `«Pen only»` canvas setting remains for crews that want finger gestures limited to two-finger pan/zoom. 〔Touch-first, v2.1〕

---

## 6. Tool rail — grouping, structure, and the radial-menu decision

### 6.1 Grouping rationale

The 14 tools are grouped by **what the user is trying to accomplish**, not by shape family. Each group answers a different question, and groups never mix actions with different mental models (create vs. destroy vs. adjust):

| # | Group | Header copy | Tools | Why together |
|---|---|---|---|---|
| 1 | **Manipulate** | `«MOVE»` | Select/Edit, Pan & Zoom | Tools that *act on the view or on objects*, produce no new geometry. Both are "get me somewhere / grab something". |
| 2 | **Measure** | `«MEASURE»` | Dimension (ft-in), Angle | Both produce a **numeric value** the crew will write down or report. Visually flagged with the hi-vis accent because these are the money tools. |
| 3 | **Shapes & Pointers** | `«MARK»` | Line, Arrow/Leader, Rectangle, Ellipse, Polygon | Geometric markup. Sub-order is by frequency of field use, not by complexity: Line and Arrow are used on nearly every sheet and sit in the top row; Polygon is last. |
| 4 | **Ink & Notes** | `«ANNOTATE»` | Freehand pen, Highlighter, Text note | Free-form, hand-driven markup; all three are typographic/gestural rather than geometric. Highlighter is adjacent to Freehand because it's a Freehand variant. |
| 5 | **Media** | `«INSERT»` | Image inset | The only tool that adds *content* rather than marks. Isolated so it's never accidentally hit next to a drawing tool. |
| 6 | **Remove** | `«ERASE»` | Erase/delete | The only destructive tool. Isolated at the far end, tinted `--err` on press, and physically separated by a full-width hairline + 16px of extra gap. |

That's 6 groups, 14 tools. Group headers are 11px ALL-CAPS `--g400` labels sitting on the group's first row, spanning the rail width.

### 6.2 Rail structure (2-column grid)

The rail is **128px wide** = two 56px buttons + 8px gutter + 8px outer padding. Two columns are required: 14 tools × 56px + separators + undo/redo cannot fit in one column of a 908px-tall area (it needs ~1080px). A 2-column grid keeps 56px glove targets *and* room for growth to ~20 tools.

Vertical order, bottom-anchored, reading upward:

```
(row 10)  [ Erase ]            [ ∅ ]        ← group 6, 16px extra gap above
           ═══════════ full-width hairline ═══════════
(row  9)  [ Inset ]            [ ∅ ]        ← group 5
           ═══════════ full-width hairline ═══════════
(row  8)  [ Text  ]            [ ∅ ]        ← group 4  («ANNOTATE»)
(row  7)  [ Freehand ]         [ Highlighter ]
           ═══════════ full-width hairline ═══════════
(row  6)  [ Polygon ]          [ More ▸ ]   ← group 3  («MARK»)
(row  5)  [ Rect ]             [ Ellipse ]
(row  4)  [ Line ]             [ Arrow ]
           ═══════════ full-width hairline ═══════════
(row  3)  [ Dimension ]        [ Angle ]    ← group 2  («MEASURE») — accent-tinted icons
           ═══════════ full-width hairline ═══════════
(row  2)  [ Select ]           [ Pan ]      ← group 1  («MOVE»)
           ═══════════ full-width hairline ═══════════
(bottom)  [ ↶ Undo ]           [ ↷ Redo ]   ← always bottom-most, always 56px
```

Empty cells are reserved for (a) **group options chevrons** — e.g. the Shapes group's empty cell is `More ▸` opening corner-radius / smoothing options for the group; the Annotate group's empty cell opens freehand pressure options — and (b) future tools. An empty cell is rendered as a flat `--g850` well (no icon, no border), never as a disabled button.

### 6.3 Tool button anatomy & states

56 × 56px, radius 10px.

| State | Visual |
|---|---|
| Default | Transparent fill, `--g300` 24px icon silhouette outline, no label |
| Hover (pen hover — Surface Pens report hover!) | `--g750` fill, 120ms, and the **tool name tooltip** appears in a `--g750` pill offset 12px toward the canvas, in Archivo 13/600. Hover tooltips are a real advantage on a pen device: the user can confirm a tool without touching it, which prevents wrong-tool strokes. **Touch equivalent (§1.7):** with no hover, the **Style Chip already names the active tool** (+ its WYSIWYG swatch); **press-and-hold** a rail button for its name + options popover; a one-time per-tool hint covers first discovery. 〔Touch-first, v2.1: no hover-only affordance may be the only path to anything.〕 |
| Active | `--hi` fill, white icon (filled variant), plus a 4px `--hi` bar on the rail's inner edge (the edge facing the canvas) spanning the button height. Readable in full sun where an outline would not be. |
| Pressed | scale(0.96), 120ms, no ripple (ripples read as lag) |
| Long-press (600ms) | Opens that tool's **options popover** (e.g. Rectangle → corner radius; Freehand → pressure/smoothing/perfect-shape; Dimension → precision & calibration; Erase → mode). A 3px `--sel` ring animates in from 400ms so the user sees the hold registering. |
| Badge | Small `--g750` count chip bottom-right when a tool has state (e.g. Inset shows the number of insets on the sheet, max `9+`) |
| Disabled | Only for erase when everything is locked: 40% opacity, tooltip `«Everything on this sheet is locked»` |

### 6.4 Recommend: fixed rail primary + a *bounded* radial quick-menu

**Recommendation: keep the fixed rail as the primary and only always-available tool surface. Add a radial menu as a secondary, pen-invoked, 8-slot quick-swap — not as a replacement.**

Rationale (be explicit with the builder so this isn't "improved" later):

- **Fixed rail wins on state visibility.** The user must always be able to answer "what tool am I holding and what will it look like?" A rail answers that in peripheral vision; a radial only exists while held.
- **Fixed rail wins on gloves.** A radial requires a precise flick-and-release into a wedge. Gloved fingers and a pen tip on a 24° wedge at arm's length is a mis-hit generator. A 56px square is not.
- **14 tools in a pie is over budget.** At 14 slices, each wedge is 25.7° — below the ~30° comfortable angular target for eyes-free selection. Cramming 14 in also forces a 2-ring pie, which destroys the single-gesture benefit that justifies radials at all.
- **Fixed rail wins on occlusion.** A radial appears at the pen tip — i.e. over the exact spot the user is measuring. Unacceptable for a measurement tool.
- **But radials win on one thing:** swapping among the last few tools without moving the eyes off the target point. So we keep exactly that: an **8-slot radial containing the last 8 distinct tools used** (recency-ordered, most recent at 12 o'clock going clockwise), invoked by **pen barrel-button hold** or by **press-and-hold on any rail button and flick** (releases into the wedge). If the pen reports no barrel button, the rail's press-and-hold path is the only entry — and the feature is simply absent rather than broken. Radial slice size: 96px inner radius, 220px outer, 44° wedges, icon + 11px label, current tool highlighted with the `--hi` ring; releasing in the dead-center hub cancels. 〔Radial wedges are **drawn at 44°** with a 1° gap, but **hit-testing uses the full 45°** so there is no dead zone — resolved in build spec §20.6; do not "fix" the 44°.〕

### 6.5 Rail customization

`⋯ Overflow → Rail settings`: **Density** (Field/Desk). 〔v1 scope: **Rail side**, **Pin order**, and **Quick Pair** are deferred — in v1 the rail side is driven by handedness only (right-handed → rail right, left-handed → mirrored, §5.1/§14.8) and the tool order is fixed (§6.2). There is no manual rail-side override, no bottom rail, no drag-to-pin, and no Quick Pair. The group boundaries stay fixed — the grouping is the pedagogy; letting it dissolve destroys learnability.〕

### 6.6 Shortcuts

Keyboard (Type Cover is common on Surface; assume it exists for power users and never *require* it):

| Key | Action | Key | Action |
|---|---|---|---|
| `V` | Select | `B` | Freehand (Brush) |
| `H` | Pan & Zoom (Hand) | `X` | Highlighter |
| `D` | Dimension | `T` | Text note |
| `G` | Angle (deGrees) | `I` | Image inset |
| `L` | Line | `E` | Erase |
| `A` | Arrow / leader | `Space`+drag | Temporary pan |
| `R` | Rectangle | `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `C` | Ellipse (Circle) | `Ctrl+E` | Export |
| `P` | Polygon | `Ctrl+D` | Duplicate selection |
| `[` / `]` | Stroke width −/+ | `Delete` | Erase selection |
| `1`–`9`, `0` | Palette swatches 1–10 | `Shift+1/2/3` | Swatches 11/12/custom |
| `Esc` | Cancel pending op → then deselect → then back | `Enter` | Commit pending (dimension keypad) |
| `F` | Fit sheet | `Ctrl+0` / `Ctrl+1` | Fit / 100% |
| `Tab` / `Shift+Tab` | Move focus through style controls | `Alt`+click | **Style eyedropper** — sample the style of the object under the cursor and adopt it for the current tool |
| `Ctrl+S` | **No-op with a toast: `«Everything saves automatically.»`** | `?` | Shortcut cheat sheet |

That `Ctrl+S` behavior is deliberate: muscle memory will press it, and the correct response is reassurance, not confusion.

---

## 7. Style panel

Purpose: change how the *next* mark will look, in under two seconds, without leaving the canvas.

### 7.1 The Style Chip — the always-visible status (never optional)

A 56px-tall pill at the top of the style panel (landscape) / the left end of the bottom style bar (portrait), containing, left to right:

1. **Active tool icon** in a 32px `--hi` circle (or `--sel` circle when a selection exists).
2. **A live rendered swatch** — a 96 × 40px SVG that draws the *actual* current style: real color, real width (clamped 1–20 for display), real line style, real arrowheads, real fill and transparency, real text size (rendered as "Aa" in the actual size/bold). This is not a colored dot; it is a WYSIWYG preview of the next stroke.
3. **Tool name** (`«Dimension»`) in 13/600, plus a `«ft-in»` sub-label when the tool produces values.
4. When objects are selected: the icon becomes `--sel` and the label becomes **`«3 selected»`**.

Interaction: **tap** = expand the full style panel; **long-press** = open a compact style popover at the pointer (swatches + widths + fill) so the user never has to expand anything for a quick change. Value changes animate the swatch (120ms) rather than snapping, so the change is noticed peripherally.

### 7.2 Layout — landscape (expanded side panel, 280px)

```
┌─ STYLE ────────────────────┐
│ [▣] ══════════  «Dimension»│  ← Style Chip (56)
├────────────────────────────┤
│ COLOR                      │
│ ● ● ● ● ● ●  (12 swatches) │  ← 2 rows × 6, 44px targets, 6px gaps
│ ● ● ● ● ● ●                │
│ [ ◐ Custom… ] [ ⊙ Pick ]   │  ← 48px buttons
├────────────────────────────┤
│ WIDTH            «3 pt»    │
│ ●────────────────────────  │  ← 44px-tall scrubber, live-preview track
│ [−]              [+]       │  ← 48px steppers
├────────────────────────────┤
│ FILL          [swatch ▾]   │  ← opens color popover
│ TRANSPARENCY    «35%»      │  ← track with a checkerboard underlay
├────────────────────────────┤
│ LINE STYLE   [——] [‑‑‑] [···]  │  ← 3 segmented 48px buttons, live-rendered
│ ARROWHEADS   [none][start][end][both] │
├────────────────────────────┤
│ PRESETS ▾   |   RECENT  ●●○○○ │
└────────────────────────────┘
```

Panel headers (`COLOR`, `WIDTH`, `FILL`, `TRANSPARENCY`, `LINE STYLE`, `ARROWHEADS`, `PRESETS`, `RECENT`) are **placeholder copy**, not literal captions — see the Copy note and `docs/appendix-strings.md`. 〔v2.1, C14〕

Controls adapt per tool — the panel is **contextual, not a fixed form**:

| Tool | Controls shown |
|---|---|
| Dimension | Color, Width, Arrowheads (default both), *Precision* (1/16→1"), *Unit format* (ft-in / in / decimal ft), *Calibrate scale* 〔v1 scope: **Precision and Unit format edit the project-level values** (one source of truth — changing them here changes every label in the project, and the chip confirms: `«Project precision: 1/16»`). **Calibrate scale is deferred** — no button, no `«Not calibrated»` chip, no `≈` anywhere on dimensions in v1.〕 |
| Angle | Color, Width, *Arc radius* (auto / 24 / 48 / 72px), *Precision* (0.1° / 0.5° / 1°) |
| Line | Color, Width, Line style, Arrowheads |
| Arrow / Leader | Color, Width, Line style, Arrowheads (default end), *Elbow* (straight / 90° / curved) |
| Rectangle | Color, Width, Line style, Fill, Transparency, *Corner radius* |
| Ellipse | Same as Rectangle, minus corner radius |
| Polygon | Color, Width, Line style, Fill, Transparency, *Sides* (3–12), *Close path* 〔v1 scope: no area readout — polygon `«≈ sq ft»` lands with calibration (deferred)〕 |
| Freehand | Color, Width, *Pressure→width* toggle, *Smoothing* (0–100), *Perfect shape* toggle. 〔Touch-first, v2.1: for finger input, pressure→width is **off** (a finger carries no pressure signal), width floor **8 mu**, smoothing **60**, thinning 0; perfect-shape hold becomes **600 ms / 16px** (finger jitter defeats 400 ms / 8px). Show `«Freehand is most precise with the pen.»` once.〕 |
| Highlighter | Color, *Chisel width* (4/12/24), Transparency (default 30%, always multiply blend, auto z-below all other markup), *Straight-line lock*. 〔Touch-first, v2.1: under touch `«Straight line»` defaults **ON**, which makes Highlighter a **tap-tap** tool (A then B → a straight 24px chisel bar) reusing the placement machine verbatim; chisel width default **24** for touch; long-press stays as the freehand-highlight path.〕 |
| Text | Color, *Size* (10–72), Bold, Align, *Background* (none / pill / solid / auto-contrast), *Leader* toggle |
| Image inset | Border on/off + width, Opacity, Corner radius, *Crop*, *Replace*, *Focus into inset* |
| Erase | *Mode* (object / stroke), *Scope* (ink only / markup only / everything) |
| Select | No creation controls. Lists the selection's shared style and edits it in place (§7.4). |

### 7.3 Making it fast

- **Swatches are the fastest path:** tap a swatch = instant apply, no confirm. The 12 swatches get 44px targets — 44px is the single sub-48px target size the app uses (shared with the Recents chips, §7.3) — justified because swatches are hit *very* frequently and are separated by 6px of dead space with no adjacent destructive action, and because 12 × 56 would not fit the panel width.
- **Width scrubber:** drag the track to scrub, or tap a position to jump. The track itself renders the current style preview at that width, so scrubbing is live-preview. `[` `]` step by one width increment; the readout shows **true paper points** (`pt = 0.75 × mu`) — stored ladder mu 1,2,3,4,6,8,12,16,20,24,32,48 → displayed pt 0.75,1.5,2.25,3,4.5,6,9,12,15,18,24,36 (so 4 mu reads `«3 pt»`). Storage stays in markup units (§4.2).
- **Presets** (`PRESETS ▾`): named user presets per tool. A preset stores the full style object. Presets are written to `<project>/.fieldmeasure/presets.json` so they travel with the folder when the user drags it into Dropbox, and can be shared between crews by copying the folder.
- **Recent styles:** the last 8 style objects used anywhere, deduped, filtered to those valid for the current tool, shown as 44px swatch chips. Recents are the primary fast path after presets — most field markups reuse the last two or three looks.
- **Long-press any control** opens its full editor (the big palette grid, custom color with HEX/HSL, transparency slider, the width ladder). Tap = fast path; long-press = deep path. Never force the deep path.
- **Live preview always.** Every style change renders on a preview strip inside the panel AND, if a selection exists, on the objects themselves in real time. Scrubbing width or transparency on a 6-object selection must animate smoothly at 60fps.
- **Apply-to-selection hint:** after any style edit applied to a selection, a one-line hint appears for 4s: `«Applied to 3 objects»` with a `«Also set as default for this tool»` text button that pins the same style as the tool default. This is the explicit, non-destructive way to propagate.

### 7.4 Selected objects vs. the current tool — the rule

> **When ≥1 object is selected, the style panel edits the selection AND updates the current tool's active style. When nothing is selected, it edits only the current tool's active style.**

Details the builder must honor:

1. **Selection mode is visually unmistakable:** the Style Chip's icon circle and the panel's 2px top border turn `--sel` cyan; the header reads `«3 objects selected»`; a `✕ «Deselect»` button appears.
2. **Mixed values render as indeterminate:** a swatch strip with a diagonal-stripe placeholder chip (`«Mixed»`) instead of a color; the width readout shows `«—»`; bool controls show an "indeterminate" dash state. Changing that control applies to all and clears the indeterminate state.
3. **Synchronous mode (default ON, labeled `«Apply to selection»`)**: editing a control applies immediately to all selected objects of a compatible type; incompatible selections (e.g. a Text and a Dimension both selected) show a scope chip: `«Apply to: Text (2) · Dimension (1)»` so the user knows exactly what's about to change.
4. **Type-changing controls are disabled, not hidden,** when the selection is heterogeneous (e.g. Text size is disabled because Dimensions aren't text objects) — with a tooltip explaining why. Hiding them makes the panel jump and destroys muscle memory.
5. **Copy / paste style:** in the selection mini-toolbar (§8.6) — `«Copy style»` (`Ctrl+Alt+C`) and `«Paste style»` (`Ctrl+Alt+V`), plus `Alt`+click as the one-step eyedropper.
6. **Per-tool style memory:** `styleByTool: Record<ToolId, Style>`. Swapping tools restores that tool's last style instantly. Swapping back is always a return, never a reset. This is what makes "swap tools and change these fast without losing flow" actually true.

### 7.5 Style editor sheet (modal, for deep edits)

Opened by long-press on the Style Panel header or `«More styles…»`. A 720 × 640 `--g750` sheet, centered, dimming the canvas to 60% (not 100% — the user must still see the photo while choosing a color for it).

Contents: full palette grid (~48 colors in 4 hue-rows), custom color (HEX field, HSL sliders, RGB fields, eyedropper with a magnified sampling loupe), stroke width ladder with live 1:1 preview strokes, fill transparency ramp with a checkerboard, line style previews drawn at three widths, arrowhead picker showing arrowheads on a sample line, text size/bold with a live "Aa" at true size, and a `«Save as preset…»` action. Footer: `«Done»` (primary) and `«Reset to defaults»` (text button, destructive styling).

States: **empty** n/a; **loading** n/a (all local); **error** only if the project folder became unavailable — then the sheet header shows an inline `--warn` strip `«Presets couldn't be loaded — changes will apply to this session only.»` with `«Retry»`, and style edits still work in memory.

---

## 8. Editor tools — flows

### 8.1 Dimension tool (the flagship flow)

**Goal:** capture a real-world feet-inches dimension on a photo in under 4 seconds — **two taps** (finger or pen) plus one value, with the input never leaving the glass until commit. 〔Touch-first, v2.1〕

**Step 1 — Place point A (pen down, or the first tap).**
- A `pointerdown` starts a pending dimension — with `pointerType === 'pen'` (draws), **or** with `pointerType === 'touch'` when `«Touch places and moves»` is on (the **first tap** places A). Both go through the **same** `PlacementController` state machine: `pointerdown` → `placeAnchor(A)`; `pointermove` in contact → provisional B; `pointerup` → `placeAnchor(B)`. A pen drag is "A on down, B on up"; a finger tap is the same machine with the provisional never moving. **There is no separate code path for touch.** 〔Touch-first, v2.1〕
- On a **touch** `pointerdown`, the anchor pin and the loupe appear **in the same frame (≤16 ms)**: a 44px `--sel` ring **collapsing to 12px over 90 ms** (this collapse *is* the "your tap registered" signal), a `1` index chip 20px right of the pin, a hint chip `«Tap the second point»`, and a `--sel` **proximity halo** on the nearest handle within 56px. 〔Touch-first, v2.1〕
- The **magnifier loupe** appears *immediately* (not after a delay — a delay reads as latency).
  - Size: 160px diameter (setting: Off / 112 / 160 / 200).
  - Position: offset **112px from the tip**, in the up-and-away-from-hand direction: for a right-handed user, up-left; for left-handed, up-right. **Edge-aware:** if that placement would push the loupe within 24px of any viewport edge, it flips to the opposite side, then rotates to the available quadrant. It must never sit under the pen hand or under the pen tip.
  - Content: a circular 3.5× magnified crop of the region under the tip, with a 1px `--sel` ring, a `0 8px 32px` shadow, and a crosshair whose center has a 12px gap (so the exact pixel is visible, not covered by the crosshair itself). **Magnification is fixed at 3.5× and the source region is derived — `sourcePx = diameterPx / 3.5` (build spec §19.5); at the 160px setting that is ≈45.7px, not the old 80px.**
  - While a pending dimension is active the loupe **freezes its source region** to point B's approach — i.e. it always tracks the moving tip, never point A.
  - **Touch variant (a different loupe, not the pen loupe).** With a finger the loupe is **200px** magnifying **4×** from a **50×50px** source (`sourcePx = diameterPx / 4`; 200 / 4 = 50), offset **136px** from contact (clear of the finger and its contact disc), and adds a **44px translucent contact disc** — the finger's own footprint, so the user learns their bias — plus a **1px dashed `--sel` leader** to the anchor. It is **full opacity with no fade** (it may be visible only ~200 ms on a fast tap), and on lift it **freezes on the last anchor for 700 ms**, then fades to 40%. It is never a hit target, is edge-aware (24px from any edge), and is switchable via `«Magnifier when you tap»` (default on). The **pen loupe is unchanged** (160px, 3.5×, 112px offset). 〔Touch-first, v2.1〕
- **Snapping:** within 20 screen px of an existing endpoint, vertex, or object bounding-box corner, the loupe shows a `--sel` snap node and the crosshair locks. Near 0°/45°/90°, a ghost ray appears with a `«90°»` chip. Snap strength is a setting (Off / Normal / Strong). Priority: existing endpoints → polygon vertices → object bbox corners → dimension label anchors → **edge midpoints** (cheap and very useful at openings). 〔Touch-first, v2.1: **under touch, acquire at 32px → lock at 20px**, evaluated **on the `pointerdown` position** (so a pure tap snaps even with no movement) and continuously during refine; the default strength under touch is **Strong** (pen stays Normal).〕

**Step 2 — Drag to B, or tap B.**
- A live dimension line draws 1:1 with the pen (zero easing). Arrowheads at both ends per style. Ticks at endpoints.
- A **live label** at the midpoint, rendered in JetBrains Mono 700 with the dual-outline halo (`0 0 0 4px rgba(11,14,18,.85)` stroke + 1px `--sel` inner hairline), showing the ft-in value with the current precision and reduced fractions, e.g. `12' 6 3/8"`.
- **Collision rule:** if the midpoint is within 140px of the pen tip (short segments), the label is pushed 36px along the perpendicular with a 1px leader line to the midpoint. Labels never sit under the tip.
- A `--sel` chip near the loupe shows live `Δx` / `Δy` in the current unit (helpful when placing on a plan view rather than an elevation).

**Step 3 — Commit at B (pen up, or second tap), then the settle window.**
- The dimension is committed **as geometry immediately** (the drawn line persists) on pen-up **or** on the second tap.
- **Pen:** the **ft-in keypad sheet** slides up from the bottom edge in 180ms, occupying 360px tall, full width, centered content. The sheet is `--g750`, radius 14px top corners, with a grabber handle.
- **Touch — the 450 ms settle window (new).** On a touch second tap the keypad does **not** open instantly. Geometry commits, and a **450 ms settle window** opens with a live `<PlacementHud>` carrying `«✕»` · `«Adjust endpoints»` · `«✓ Value»`. The keypad **auto-opens only if no canvas contact occurred during the window**; **any `pointerdown` on the canvas before the timer fires cancels the auto-open permanently for that placement.** If that contact was within **40px** of an anchor it enters `RefineEndpoint`; otherwise it pans. Refining does not re-arm — after that the keypad opens only via the explicit `«✓ Value»`. **Committing or cancelling never discards the drawn geometry.** Timing: the HUD is interactive **≤50 ms** after the tap; the keypad is fully open at **630 ms worst case (450 settle + 180 slide)** — but the correction window is live from 50 ms. **Why 450 ms:** longer than any plausible finger-linger after a lift (so natural tap-tap rhythm never trips it), and it matches the existing 400 ms hold-to-shape and 400 ms autosave-coalesce windows. 〔Touch-first, v2.1〕
- While the keypad is open, the canvas dims by only 25% and remains visible; the freshly drawn dimension stays highlighted with a `--sel` outline and its **drawn length readout** pulses once. 〔Touch-first, v2.1: under touch the canvas stays **live for pan and pinch-zoom only**; taps while the keypad is open do nothing (no place, no select), so a canvas tap no longer doubles as a cancel.〕
- **Offset Nudge Pad + tug handles (touch refinement).** In `RefineEndpoint` a **120px** circular pad floats **96px away** from the anchor (same edge-aware quadrant logic as the loupe); the finger drags *in the pad*, not on the point, and the anchor moves at **0.35×** in the inner 60px core and **1.0×** in the outer band while the loupe shows the anchor at 4×. Both anchors also carry a **28px visual / 72px hit** tug handle, offset 24px perpendicular to the segment, away from the label. The pad is `--g900`@92% with a 2px `rgba(255,255,255,.14)` border and a chevron showing the drag vector. 〔Touch-first, v2.1〕
- **Post-place refinement & the `Adjust endpoints` edit mode (touch).** Once a dimension exists, its anchors are **permanently grabbable whenever the object is selected** (via `Edit points`, or immediately after placement): a `pointerdown` within **40px** of an anchor enters `RefineEndpoint` with no mode change. The `Adjust endpoints` edit mode (from the placement HUD, the keypad sheet, or the mini-toolbar's `Edit points`) turns both anchors into persistent **28px tug rings**, adds a 1px `--sel` inner hairline to the label, and shows a top-centre chip `«Adjusting dimension»` with a 56px `✓ Done` (the same pattern as the inset Focus breadcrumb). Snapping is **Strong** and the Nudge Pad is available for the last-touched anchor. `Done`/`Esc` exits; **the value is unchanged** — refinement moves the geometry, never the typed measurement. 〔Touch-first, v2.1〕

**The ft-in keypad sheet:**
```
┌─ «Enter dimension» ─────────────────── ✕ «Cancel» ─┐
│  PREVIEW   ┌──────────────────────────────────────┐ │
│            │ 12' 6 3/8"      = 150.4 in           │ │  JetBrains Mono
│            └──────────────────────────────────────┘ │
│  [ ft ] [ in ] [ «1/2» ] [ «1/4» ] [ «1/8» ] [ «1/16» ]  ← unit & precision
│  ┌────┬────┬────┐  ┌────┬────┬────┐                 │
│  │ 1  │ 2  │ 3  │  │ 4  │ 5  │ 6  │   72px keys      │
│  ├────┼────┼────┤  ├────┼────┼────┤   8px gaps      │
│  │ 7  │ 8  │ 9  │  │ 0  │ ⌫  │ .  │                 │
│  └────┴────┴────┘  └────┴────┴────┘                 │
│  [ ✓ «Use this value» ]                                │
│  [ ⛓ «Chain: commit & start next from B» ]           │
└──────────────────────────────────────────────────────┘
```

〔v1 scope: the `«Keep measured …»` button is deferred with calibration — removed from the keypad sheet in v1.〕
〔Touch-first, v2.1: under touch the sheet also carries `«Adjust endpoints»`, which enters `RefineEndpoint` for the last-touched anchor (with the Offset Nudge Pad) **without discarding the value or the geometry**.〕

- **Live parse preview** is the point of the whole sheet. It parses continuously and renders the understood value in JetBrains Mono, plus the raw equivalent in the secondary unit. It shows a `--ok` check when the parse is unambiguous, and shows the parser's own reading when it isn't. 〔v2 hardening — the input model is fully specified in the preflight §6.1.1 slot state machine; this sheet is a pure function of the slots: typing `12 6` renders `12' 6"` with a ghost `«ft-in»` tag; typing `12' 6 3` renders `12' 6 3/16"` with the `3` underlined as the fraction numerator (denominator = project precision, cyclable via the `«← /16»` hint chip); `.` routes to the fraction numerator slot. The preview value comes from the slots directly — never by re-parsing the display string.〕
- **Unit toggles are big and obvious:** `ft` / `in` are 56px toggles. Tapping `in` re-scopes the whole entry to inches (`150 3/8"`), with a 1.5s `«Entry is now inches»` hint. The fraction chips set the rounding precision for the value being entered *and* update the **project-level** precision (one source of truth — the chip confirms `«Project precision: 1/8»`).
- **`«Use this value»` (primary, `--hi`, 64px tall)** commits the typed value; the geometry stays as drawn but the label reports the typed value (this is essential: crews often dimension a real-world dimension that doesn't match the drawn scale, e.g. reading a tape).
- **`⛓ Chain`** commits and immediately begins a new pending dimension from point B — chaining dimension runs along a wall without re-tapping the tool. This single feature saves a dozen taps per elevation.
- **Cancel paths:** `✕` or `Esc` discard the typed value and *keep* the drawn geometry. Cancelling must never throw away the stroke the user just drew. 〔v2 note: a kept-but-valueless dimension renders with a `«tap to enter value»` ghost label (cyan outline) until a value is entered; tapping it reopens the keypad. This closes the "cancel leaves a valueless dimension" gap.〕 〔Touch-first, v2.1: for a **still-pending** placement, `«✕»` at A discards A → Idle, while `«✕»` at B (or in the keypad) keeps the geometry as `Valueless`; a `Esc`, a **two-finger tap**, or a tool change on the rail cancels; a `pointercancel` (palm, OS edge gesture, blur) **discards** a pending touch placement entirely, since B was never chosen; a pen `pointerdown` mid-placement hands off to the pen. A canvas tap while the keypad is open is **not** a cancel — it does nothing (pan/pinch remain live), which removes the old double meaning. **There is no idle timeout** — a pending placement waits indefinitely, and after 30 s of no contact the hint chip re-appears.〕
- **Hardware keyboard path** (Type Cover): just type `12 6 3` and press `Enter`. No focus required — the parser captures digits whenever the keypad sheet is open. This is faster than the on-screen keypad and must work.

**Scale calibration** 〔v1 scope: **DEFERRED** — do not build the `«Calibrate scale»` long-press option, the `«Not calibrated»` warning chip, or any `pxPerFoot` UI in v1. The schema seam exists (`Sheet.calibrationPxPerFoot`, always null). When it ships, the sub-flow is: long-press Dimension → `«Calibrate scale»`; draw a known line; type its true length (`«This line is…»`); the sheet stores `pxPerFoot`; Copy-scale-to-other-sheets is offered in the confirmation toast. Until then the app is honest by omission: dimensions are typed, and nothing implies a measured scale.〕

**Dimension states:**
| State | Behavior |
|---|---|
| **Empty/idle** | Nothing pending. Style Chip shows `«Dimension · ft-in · 1/8»`. |
| **Drawing (A→B)** | Loupe + live line + live label. Esc cancels without creating anything. |
| **AnchorA (touch)** | Cyan anchor pin at A (44px → 12px over 90 ms), `1` index chip, loupe frozen on A, ghost rubber-band, hint `«Tap the second point»`. Tap = place B · drag = pan · drag near A = refine A · two-finger tap = cancel. 〔Touch-first, v2.1〕 |
| **AnchorB / settle (touch, 0–450 ms)** | Geometry solid; tug handles on both anchors; `<PlacementHud>` (`✕` · `Adjust endpoints` · `✓ Value`). Any canvas contact cancels auto-open and enters refine; pan/zoom live. 〔Touch-first, v2.1〕 |
| **RefineEndpoint (touch)** | Anchor grabbed; loupe tracks it; snap nodes light up; Offset Nudge Pad live. Other touches ignored for 150 ms. 〔Touch-first, v2.1〕 |
| **Keypad open** | Geometry committed, value pending. Canvas dimmed 25%; rail and style panel dim to 40% and are **non-interactive** (a mis-tap while typing must not swap tools). 〔Touch-first, v2.1: under touch the canvas stays live for **pan/pinch only**; taps neither place nor select.〕 |
| **Chained** | Same as drawing, but starting point is pre-locked at the previous B with a `--sel` node and a `⛓` indicator near the loupe. |
| **Uncalibrated** | 〔v1 scope: this state does not exist in v1 — there is no calibration and no `≈` on dimensions. Row retained for the calibration release.〕 |
| **Error** | Only: project folder unavailable at commit → the dimension is created in memory, the Autosave chip goes to `--warn`, and the keypad sheet shows `«Saved locally, will write when the folder is back.»` |

### 8.2 Angle tool

Vertex-first (matches how a crew reads an angle: "from that corner, between those two walls").
1. Pen down **or first tap** = **vertex** (loupe active, snapping to endpoints strongly here). 〔Touch-first, v2.1〕
2. Drag = first ray. Live ray with a `--sel` guide.
3. Lift, then tap or drag = second ray. A live arc renders between the rays with radius auto-sized to 40% of the shorter ray (min 32px, max 120px), a `--hi` arc with an arrow on each end, and the degree value at the arc's midpoint in JetBrains Mono, haloed.
4. Snapping: 0.5° by default, with hard snaps to 0/45/90/180 shown by a `«45°»` chip; a `«Snap»` toggle in the style panel.
5. Second lift opens the **angle commit sheet** (same shell as the keypad): `≈ 43.2°`, a `°` keypad with `1°` / `0.5°` / `0.1°` precision toggles, chips for `«Complement 46.8°»` and `«Supplement 136.8°»`, `✓`, `⛓ «Chain from this ray»`, and cancel.
6. Committed as a three-point object (vertex + two rays + arc) that stays editable: dragging any endpoint recomputes the arc and the label live.

〔Touch-first, v2.1: **Angle is a 3-tap tool under touch** — tap 1 = vertex, tap 2 = ray-1 tip, tap 3 = ray-2 tip, with the arc rendering live from tap 1. After tap 3 the angle commit sheet opens on the **same 450 ms settle rule** as the dimension keypad (any canvas contact cancels the auto-open permanently; the geometry is committed regardless). A tap within **44px** of the vertex cancels, as a degenerate-angle guard. A pen drag remains available at every step and goes through the same `PlacementController`.〕

### 8.3 Line, Arrow/Leader, Rectangle, Ellipse, Polygon

Shared pattern — **pen-down to start, drag to size, pen-up to commit**, *or* **tap-tap** (tap A, then tap B) under touch; both go through the same `PlacementController`. All support `Shift`-equivalent (hold pen steady 400ms) for constraint. All are re-editable after commit via Select (§8.6).

〔Touch-first, v2.1 — tap-tap applies to **every placement tool**: **Dimension** (2 taps), **Angle** (3), **Line** (2), **Arrow/Leader** (2), **Rectangle** (2), **Ellipse** (2), **Polygon** (open), **Image inset** (1), **Text** (1). Line/Arrow leave the new object **selected**; Rectangle/Ellipse honour the corner-to-corner / centre-out setting. Freehand and Highlighter *strokes* are not tap-tap, except Highlighter's straight-line mode (§8.4). A pen drag and a finger tap are the same machine — no second code path.〕

- **Line:** A→B with endpoint snapping, live length readout at the midpoint (same halo/label rules as Dimension), 45° constraint on hold.
- **Arrow / Leader:** same as Line but with a default single end arrowhead; the **Elbow** style (straight / 90° / curved) matters for pointing into dense photos. A leader ends in an optional text slot: after drawing, if the Text-note tool was the last-used text style, show a `«Add label»` ghost button at the arrow tail — tapping it converts the leader into a callout with an attached text object.
- **Rectangle:** corner-to-corner or center-out (setting). Corner radius from the style panel (0 / 4 / 12 / 24px, long-press the tool to change). Live `W × H` readout. **Fill** applies with transparency; the default is *no fill* so the photo stays readable — filled shapes are an intentional act.
- **Ellipse:** same as Rectangle; hold-to-constrain gives a circle; live `W × H`.
- **Polygon:** tap-by-tap vertex placement (this is the one tool where a drag-release-drag model is wrong — polygons need precision at each vertex). Each tap drops a `--sel` numbered node (tiny index chips) with snapping and a rubber-band segment to the previous node. Close by tapping the first node (which grows a `--sel` ring when within 24px) or by pressing `Enter`. `Backspace` removes the last vertex. Double-tap the last vertex ends an open path. 〔Touch-first, v2.1: under touch, nodes get a **56px** hit region, the close target grows to a **56px `--sel` ring at 32px proximity**, and the HUD offers a `✓ «Done»` button (the discoverable equivalent of `Enter`) and `«Undo point»` (replacing `Backspace`).〕 〔v1 scope: the live area readout (`«≈ 214 sq ft»`) is deferred with calibration — do not build it in v1.〕

### 8.4 Freehand pen and Highlighter

- **Freehand:** 1:1 ink using `getCoalescedEvents()`, pressure → width when enabled (min 30% of nominal at 0 pressure), tilt → width for the pen, and a **catmull-rom → bezier** fit so a stroke stored as 12 points renders smooth. Smoothing 0–100 (default 45): higher smoothing trades fidelity for tidiness, and the slider shows a live stroke sample. 〔Touch-first, v2.1: finger freehand is **opt-in** behind `«Finger draws (freehand)»` (off); when on, pressure→width is **off**, width floor **8 mu**, smoothing **60**, thinning 0, and the app says `«Freehand is most precise with the pen.»` once.〕
- **Perfect shape on hold:** if the pen stays still within 8px for 400ms at the end of a stroke, the stroke is replaced with a recognized primitive: nearly-straight → line, roughly rectangular → rectangle, roughly elliptical → ellipse. A `«⇧ Shape»` chip appears during the hold so the behavior is discoverable and interruptible (moving >8px cancels it and keeps the freehand stroke). Toggleable; on by default. 〔Touch-first, v2.1: under touch the hold becomes **600 ms / 16px** — finger jitter defeats 400 ms / 8px.〕
- **Highlighter:** multiply blend, default 30% alpha, chisel tip (tilt changes the chisel angle, matching a real marker), and an **auto z-order rule**: highlighter strokes are inserted *below* every other markup object but above the photo, so highlights never cover dimensions or text. Long-press the tool for chisel width and `«Straight line»` lock. 〔Touch-first, v2.1: under touch `«Straight line»` defaults **ON**, so Highlighter becomes a **tap-tap** tool (A, B → a straight 24px chisel bar) reusing the placement machine; chisel width default **24** for touch; freehand highlight stays reachable via long-press.〕

### 8.5 Text note

- Tap on the canvas with the Text tool → an inline caret appears at the tap point with the current size/bold/color, and the Windows soft keyboard slides up. The canvas auto-pans so the caret is never under the keyboard.
- Rich controls live in the style panel while a text object is being edited: **size** (10–72, 56px stepper with live "Aa"), **bold**, **align** (L/C/R), **color**, **background** (`none` / `pill` / `solid` / **`auto-contrast`** — samples the 48×48px region behind the text and picks a black-on-white or white-on-black pill for maximum legibility; default is `auto-contrast`), and **leader** (draws a 1px pointer line from the text box to a chosen point, for callouts).
- Commit: tap elsewhere, `Esc`, or `Done`. Empty text is discarded silently.
- Re-edit: double-tap a text object with any tool.
- Multi-line: Enter inserts a newline; the box auto-grows and the background pill resizes live.
- Copy is *never* auto-translated or auto-corrected in a way that changes measurements — disable autocorrect and autocapitalize on numeric-leading strings.

### 8.6 Select/Edit — direct manipulation

- **Tap** selects the topmost object under the tip (hit slop padded 8px on all sides, and 12px along thin strokes so a 4px line is grabbable). Selection = a `--sel` bounding box (2px) with a soft `--sel` 4px outer glow so it reads on any photo. 〔Touch-first, v2.1: under touch the hit slop becomes **16px** general and **24px** along thin strokes. The `--sel` selection frame (2px bbox + 4px glow) is deliberately distinct from the 2px + 2px-offset focus ring (§3.1, C11).〕
- **Marquee drag** on empty canvas selects everything intersecting the box. **Shift**+tap or two-finger tap adds to the selection. 〔Touch-first, v2.1: two-finger tap is a **secondary** add-to-selection path — the on-screen `Add to selection` control (§1.7) is the primary one.〕
- **Handles:** 8 × 24px visual / 56px invisible hit targets (corner = scale with aspect locked; edge = free stretch; `Shift` = free/unlocked), plus a **rotate handle** 40px above the top edge with a `°` readout that snaps to 0/15/30/45/90. 〔Touch-first, v2.1: under touch, handles enlarge to **28px visual / 72px hit** and the rotate handle sits **48px** above the top edge with a 72px hit. The **0px-overlap invariant is kept** — at ≤96px-wide selections, edge handles are suppressed and corners only are shown. Resizing gets an **axis lock**: after 8px of movement, within 20° of the handle's natural axis it locks.〕
- **Proximity halo (touch, replaces hover highlight):** the nearest handle within **56px** of a contact gets a `--sel` halo, so a finger can see what it is about to grab without hovering. 〔Touch-first, v2.1〕
- **Canvas long-press (600 ms)** selects the object under the finger **and pins the mini-toolbar** — touch's equivalent of a right-click. A 3px `--sel` ring fills from 400 ms so the hold is visibly registering. 〔Touch-first, v2.1〕
- **Second tap on a selected object = that object's action** (Text re-edit, inset Focus, dimension value, `Edit points`) — mirroring the inset's existing first-tap-selects / second-tap-Focuses precedent (§9). A tap on an **unselected** object selects it. 〔Touch-first, v2.1〕
- **Move:** drag the body. **Snapping + alignment guides:** `--sel` 1px lines appear when edges/centers align with other objects, with a 6px magnet. Guides are visual only, never blocking.
- **Mini toolbar:** a floating horizontal pill (56px tall) above the selection (flips below if there's <120px of headroom), containing: `Duplicate` · `Delete` · `Lock` · `Bring to front` / `Send to back` · `Copy style` · `Paste style` · and tool-specific extras (`Edit points` for lines/polygons/dimensions; `Replace photo` / `Focus` for insets; `Edit text` for text). Every action here is undoable. 〔Touch-first, v2.1: under touch the pill is **64px** tall with 56px buttons, anchored **16px** above the selection, flipping below when headroom < **160px**; `Edit points` is promoted to first position for measurement objects.〕
- **Point editing:** line, dimension, angle, polygon, and freehand (resample) expose editable nodes with `--sel` rings; dragging them updates labels live.
- **Groups:** select multiple → `Group` (`Ctrl+G`) so a callout with its leader and text moves as one. Grouping is visible as a single bounding box with a `⬚` badge.
- **Locked objects** are unselectable by tap (only via the Layers panel), render at 70% opacity of their own styling with a faint `🔒` in their Layers row, and show a shake + toast `«Locked — unlock in Layers»` if the user tries to move them.

### 8.7 Erase / delete

Two modes, chosen by long-press on the tool (default **Object**):

- **Object mode:** as the pen hovers (pen hover!) or drags over an object, the object gets a 2px `--err` outline + a name chip (`«Rectangle»`, `«Dimension 12' 6"»`). Tap/drag to delete. **Undo toast** with `«Undo»` for 8s — no confirmation dialog, ever, because undo exists. 〔Touch-first, v2.1 — touch has no hover, so the touch equivalent is **tap-to-delete + an undo toast naming the object** (`«Undid: Delete dimension 12' 6"»`); delete immediately, because a delay reads as lag. For a pre-commit signal, **long-press (600 ms)** reveals the `--err` outline + name chip *without* deleting. Touch erase of ink is tap-to-delete-whole-stroke — coarse but honest.〕
- **Stroke mode:** erases freehand/highlighter ink segment-wise, splitting strokes at the erase boundary; perfect for cleaning up a wandering pen stroke without losing the whole line. 〔Touch-first, v2.1: stroke mode is **pen-only** under touch (segment-wise scissoring needs pen precision). Hide stroke mode for touch and show `«Splitting a stroke needs the pen. Touch can delete the whole stroke.»`〕
- **Scope chips** in the style panel: `Ink` / `Markup` / `Everything`, so a user can wipe all freehand without touching dimensions. Scope = `Everything` shows a `--err` tint on the tool and requires a confirm.
- **`⋯ «Clear sheet markup…»`** (in the overflow menu, *not* on the rail — it must not be one slip away from normal erase) opens a dialog listing counts per category with checkboxes, and its confirm button is **hold-to-confirm 600ms**.

---

## 9. Image inset (photo within the photo)

**Goal:** reference a second photo (e.g. the wide shot of an elevation next to the detail shot) on the same sheet, with its own markup.

**Insert flow:**
1. Select the **Image inset** tool. A hint chip follows the pen: `«Tap where the inset should go»`. The canvas shows a `--sel` crosshair guide; crossing guides appear when near the center/edges. 〔Touch-first, v2.1: with no hover the hint chip appears once when the tool is selected rather than following a pointer. Image inset is a **1-tap** tool: tap → the picker sheet.〕
2. Tap → an **insert picker sheet** (bottom sheet, 320px) with three large options:
   - **`📷 «Take a photo»`** (64px row) → launches the in-app Capture flow in inset mode.
   - **`🖼 «Choose from device»`** → an OS file picker filtered to images (jpg/png/heic/webp) with multi-select allowed (multi-select inserts each as its own inset, cascaded 24px down-right, all selected after insert).
   - **`🕘 «Recent photos»`** → a 4×2 grid of the last 8 images captured or used in this project, thumbnails at 96px. This is the field-fast path: the crew usually just took the photo 30 seconds ago.
3. The inset appears with a `--sel` "drop-in" animation (200ms scale 0.94→1 + opacity) — the only decorative animation in the app, and it exists purely to confirm *where* the image landed, because a mis-placed inset is easy to miss.
4. Default placement: inserted at **40% of the sheet width**, centered on the tap point, aspect preserved, rotation 0, with a 4px `--sel` outline and 4 corner handles already showing (selected state), so the very next action is resize/move.

**Manipulation (same grammar as Select):**
- Handles: 4 corner (scale, aspect-locked by default; the aspect-lock toggle is a small `⬚` chip on the top edge), 4 edge (crop-and-stretch is *not* offered — edges instead adjust the visible crop window), a rotate handle with `°` readout and 0/90/180 snapping.
- Body drag to move, with alignment guides.
- **Two-finger rotate/scale directly on the inset** also works (pinch on the selected inset scales it; this is how a user will naturally try it).
- Style panel while an inset is selected: `Border` (on/off + width + color), `Opacity` (default 100%), `Corner radius` (0/6/12/24), `Crop…` (opens a crop overlay with rule-of-thirds + a straighten slider), `Replace photo`, `Shadow` (on/off — useful to separate the inset from a busy background photo), and `Focus».

**Tap to focus / edit (the nesting model):**
- **First tap** on an unselected inset selects it (handles appear).
- **Second tap** (or double-tap, or the `Focus` action, or `Enter` while selected) enters **Focus mode**:
  - Everything outside the inset dims to 35% opacity.
  - A breadcrumb chip docks at the top-center of the canvas: `«Sheet 04 › Inset 2»` with a `«Done»` button. This chip is the single source of truth for "where am I drawing".
  - The inset gets a `--sel` 2px frame and a `--sel` inner glow.
  - **All tools now draw into the inset's own markup layer.** The inset is a container: `{ photo, crop, transform, children: MarkupObject[] }`. Insets nest one level deep only (an inset cannot contain an inset) — enforce this and disable the Inset tool inside Focus with a tooltip `«Nested insets aren't supported»`. Depth limits keep the mental model teachable. 〔v2 hardening — the coordinate model is now fully specified in the preflight §8.5: **children are stored in the inset asset's working-image pixel space** (identical semantics to a sheet); `crop` is a rect in asset px applied via `clipFunc` before the group transform; children are never rewritten when the inset is moved/scaled/rotated/cropped; asset dedupe never merges children (children belong to the annotation, not the asset). Visual behavior is unchanged — this only pins the data model so builders can't guess.〕
  - `Esc` or `Done` exits Focus. Exiting does not change the selection.
- **Markup layering over the inset:** objects created *outside* Focus belong to the sheet's markup layer and render **above** all insets by default. Objects created *inside* Focus belong to the inset and are clipped to it (`overflow: hidden`, and children scale/rotate with the inset). This gives the two behaviors the crew needs — "draw an arrow pointing *at* the inset" (outside) and "circle the crack *inside* the inset" (inside) — without any z-order puzzle.

**Layers panel** (flyout, 320px, from the top bar `⌗ Layers`): a vertical list, top = front. Default order:
```
▸ Markup  (groups: Dimensions · Shapes · Ink · Text)
▸ Inset 2   ▸ (its own children, indented)
▸ Inset 1
▸ Photo (base — lockable, never deletable)
```
Rows: type icon + name (`«Dimension 12' 6"»`, `«Inset 2»`, `«Freehand»`) at 56px row height, an eye toggle, a lock toggle, and drag-to-reorder (a 400ms long-press starts the drag so it isn't confused with a tap-to-select). Tap a row = select that object (and it pans the canvas to it if off-screen). Long-press a row = `Bring to front` / `Send to back` / `Group` / `Ungroup` / `Rename` / `Delete`. Selecting a markup group in the list is the fastest way to mass-restyle (e.g. select `Dimensions` → change color).

**States:** *Empty* (no insets → the panel's insert sheet shows the three options with the Recents grid); *Loading* (large photo decode → the inset renders as a `--g750` placeholder with a `«Loading photo…»` shimmer and the sheet count badge shows a spinner; decode happens on a worker so the canvas never stutters); *Error* (unsupported/corrupt file → the placeholder shows `«Couldn't open this image»` with `«Choose another»` and `«Remove»`; the sheet stays otherwise usable).

---

## 10. Capture & import

### 10.1 Capture screen (full-bleed)

**Purpose:** three taps maximum from "I see the problem" to "it's a sheet".

**Layout:** camera feed fills the viewport. No top bar. Chrome is minimal and hugs the screen edges so the viewfinder is never crowded:

- **Top-left:** `✕ «Close»` (56px, `--g900` at 60% behind it for legibility over any scene).
- **Top-right:** a vertical stack of 56px toggles: torch/flash, grid overlay (rule of thirds), level indicator on/off, camera flip (front/rear — default **rear**), and resolution (`«High (device max)»` / `«Fast»`). 〔v2 hardening: `getUserMedia` on Windows tablets caps at ~1080p–4K — do not promise sensor megapixels. The `«device max»` value is filled from the 0.2 input spike's measured max **resolution** (`enumerateDevices` + track constraints), never the sensor's marketing MP; if the device caps at 1080p, the fallback copy points to the Windows Camera app + Import as the high-res path.〕
- **Center:** a tap-to-focus reticle — a `--sel` 72px ring that appears where tapped, animates a 300ms contract, and holds for 2s. A long-press locks focus/exposure with a `«AE/AF LOCK»` chip.
- **Horizon/level:** a `--sel` line with end ticks that turns `--ok` when the device is within ±1.5° and can optionally **auto-capture-on-level** (off by default, a real field trick for consistent elevation shots).
- **Bottom bar (88px + safe padding):** left = `🖼 «Import»` (file picker), center = **shutter** (88px, `--g000` ring with `--hi` inner disc, pressed = 88→80 scale + a 120ms ring flash), right = zoom control (0.5× / 1× / 2× chips + a pinch-enabled slider) and a photo-count badge.

**Capture feedback:** a black 120ms screen flash (mimics a shutter, confirms capture), a thumbnail flies to the bottom-left corner, and the **review screen** appears.

**Review screen:** the captured image fills the screen with a scrim. Controls:
- Bottom row: `↺ «Retake»` (56px, secondary) · `↻` rotate · `✓ «Use photo»` (64px, `--hi`, primary). 〔v1 scope: `✨ «Auto-enhance»` is deferred — do not build it or reserve a slot for it in v1.〕
- If this capture was launched from Home/Project, `Use photo` returns to the sheets grid with a toast `«Added «Sheet 05»»` + `↶ «Undo»`.
- If launched from the inset flow, it returns to the editor with the inset inserted at the tap point, selected.
- `Retake` while an inset capture is in progress asks nothing — the capture isn't in the project yet, so it's safe to discard. If the capture *is* replacing an existing sheet photo, `Retake` requires a confirm (`«Discard this photo? The sheet's markup will be kept if the new photo is the same size.»` — hold-to-confirm) 〔v2: replacement with different dimensions routes to the Replace-photo warned dialog (§11.2) — markup survival is never promised blindly〕.

**Autosave on capture:** the photo file is written to `<project>/sheets/<n>/photo.jpg` immediately on accept, with a `«Adding…»` inline progress bar. If the write fails, the sheet stays in memory, the Autosave chip goes `--warn`, and the user is offered `«Save a copy…»` (download the file) so a field photo is never trapped.

**Fallbacks (must exist):** if `getUserMedia` is unavailable or permission is denied, the Capture screen shows a `--warn` panel: `«Camera unavailable in this browser. «Open Windows Camera» or «Import a photo» instead.»` — the app must never be a dead end for lack of a camera. Note the OS-level camera privacy setting (Settings → Privacy → Camera → let desktop apps access) in the error copy, since that's the #1 cause on managed devices.

### 10.2 Import from disk

`🖼 Import` / `⋯ Overflow → Import file` → OS picker, multi-select, jpg/png/heic/webp. Behavior depends on context:

- **From Home/Project:** each image becomes its own sheet, named from the filename (slugified), sorted by EXIF capture time when available. Progress sheet with per-file rows and a per-file retry.
- **From the Editor:** images become **insets**, not sheets (that's what the user meant by importing while looking at a sheet). A small `«Insert as: ‹Inset› / ‹New sheet›»` segmented control lets them override.
- EXIF: read orientation (auto-rotate, then bake it so the photo and the markup coordinate space agree forever), capture timestamp (default sheet name), and camera model (stored in sheet info, never shown prominently). **Strip GPS by default** and offer it only as an opt-in sheet-info field — this is a local-only app with no cloud, but the folder gets dragged into Dropbox, so defaulting to stripped location is the safe, respectful choice.

---

## 11. Home & Project views

### 11.1 Home — Projects

**Purpose:** find the right folder fast and get into it. Users will have ~3–20 active projects.

**Layout (1440 × 960):**
- **Top bar (56px):** app mark + `«FieldMeasure»` (Archivo 700 20px) on the left; a **search field** (400px wide, `--g800`, magnifier icon, `Ctrl+F`) in the center-left; on the right, a **Storage chip** (§11.4) and `+ «New project»` (primary, 56px).
- **Below the bar:** `«Recent»` section header (with a `Sort: Recent ▾` control: Recent / Name / Size / Needs attention) and a **card grid** — 3 columns at 1440 (each card 400 × 280), 2 at 1200, 1 at portrait 960.
- **Project card:** 240px cover thumbnail (chosen sheet or the newest sheet, aspect-cropped to 16:10, with a 3px `--g700` bottom hairline), project name (Archivo 17/600), a meta line in JetBrains Mono 13 `«12 sheets · 48 MB · 2:14 PM»`, and a **path chip** `«…\Documents\FieldMeasure\Riverside»` (middle-truncated, mono 12). If the folder is missing or unwritable, the card shows a `--warn`/`--err` 3px left border and a status line `«Folder not found»` with `«Locate…»`.
- **Secondary row of cards** at the bottom of the grid: `«Open existing folder…»` (dashed `--g700` border, 56px icon, opens `showDirectoryPicker`) 〔v1 scope: the `«Import a project»` bundle card is CUT — `«Open existing folder…»` covers folder reuse; a lone card keeps the scan path honest〕. Both must look like cards so they live in the same scan path.
- **Card interactions:** tap = open Project. Long-press = context menu (`Rename` 〔with the copy `«Renaming changes the project name, not the folder.»`〕, `Copy path`, `Reveal folder` 〔= `showDirectoryPicker({ startIn })` rooted at the project folder — the closest a PWA can get to Explorer; **`Show in Explorer` is impossible from a PWA — never ship that string**〕, `Export all`, `Remove from this list` (never deletes files — copy: `«Removes it from this list only. Files on disk are untouched.»`), `Delete files…` (hold-to-confirm, with the exact path shown in mono)).

**States:**
| State | Presentation |
|---|---|
| **Empty** | Centered illustration (a simple line drawing of a clipboard + pen, `--g600` strokes, no color), headline `«No projects yet»`, one line `«Projects are just folders on this PC. Pick one and everything saves into it.»`, primary `«Create a project»`, secondary `«Open an existing folder…»`. |
| **Loading** | 6 skeleton cards (shimmer at `--g800`→`--g750`, 1.4s loop). Never a spinner on the whole screen. |
| **Error (folder offline)** | A `--warn` banner across the top of the grid: `«2 projects can't be reached. They may be on a disconnected drive.»` with `«Retry all»`. Individual cards stay visible and tappable (opening shows the Project in read-only memory mode with an `--err` chip). |
| **Permission needed** | A one-time card-level prompt `«Windows needs permission to read this folder»` → `«Allow»` (re-invokes `requestPermission` on the stored handle). |
| **Search active** | Grid filters live as the user types; empty result = `«No projects match «riv»»` with `«Clear»`. |

### 11.2 Project — Sheets

**Purpose:** see every page at a glance, add pages, and export.

- **Top bar (56px):** `‹ Projects` · project name (inline editable, Archivo 700 20px) · `«12 sheets»` count · right: `⌗` (nothing here), **`⇧ «Export»`** (primary), `⋯` (Project settings, Rename, Copy path, Reveal folder, Trash…, Delete project). 〔v1 scope: `Duplicate project` and `Show in Explorer` are removed (deferred/impossible); `Trash…` is added — the 14-day trash needs a restore UI: list (name, deleted date, days-left), read-only preview, `«Restore»` with undo toast.〕
- **Sheet grid:** 4 columns at 1440 (card 320 × 300), 3 at 1200, 2 at portrait 960. Each card:
  - 320 × 240 thumbnail of the actual rendered sheet (photo + markup composite, generated on save and cached as `thumb.jpg`), with rounded 10px corners and a `--g700` hairline.
  - **Index badge** `«04»` top-left in mono, `--g900` at 70%.
  - **Inset badge** `«+2»` top-right when the sheet contains insets.
  - Bottom row: sheet name (Archivo 15/600, editable via long-press → `Rename`), and a meta line in mono 12: `«2:14 PM · 3 dimensions»`.
  - Selected state (for batch export): `--sel` 2px border, checkmark badge top-left, and a **selection bar** replaces the grid's bottom area: `«3 selected»` · `Export` · `Duplicate` · `Delete`.
- **Add sheet affordances (first in the grid, always):** two large tiles — `📷 «Take photo»` (primary, `--hi` tinted) and `⬆ «Import»`. Both are 320 × 240 dashed `--g700` tiles with 56px icons. In a field app the "add" affordance must be the easiest thing on the screen.
- **Reorder:** long-press (400ms) a card → lift + haptic-less scale animation → drag; sheets renumber live; a `«Drop to move»` chip follows the card. Order is persisted in `project.json`.
- **Swipe/tap-hold on a card** opens the card menu: `Open`, `Rename`, `Duplicate`, `Replace photo`, `Delete`. 〔v1 scope: `Rotate` is CUT — rotation happens only in the capture review, before normalization; a post-hoc sheet rotate would invalidate every annotation's coordinates. `Replace photo` is constrained: identical working-image dimensions → silent swap, markup kept; different dimensions → the warned dialog (`«The new photo is a different size. Markup saved in the old photo's coordinates may land in the wrong place.»` → `«Keep markup»` / `«Remove markup»` / `«Cancel»`, hold-to-confirm on `«Remove markup»`).〕

**States:** *Empty* → the two add tiles plus a centered line `«No sheets yet — take a photo to start.»`; *Loading* → 8 skeleton cards + the two add tiles rendered real (they never skeleton, they're always usable); *Error* → project folder unwritable → a persistent `--err` chip in the top bar `«Read-only — changes can't be saved»` with `«Fix…»` (opens a folder re-pick), and every mutation shows a toast `«Not saved to disk»`; *Active/selected* → as above.

### 11.3 Project settings (sheet)

`⋯ → Project settings`: name, default units & precision, unit format (ft-in / in / decimal ft), default sheet naming template (`«{date} {time}»`), default export destination (remembered folder), strip GPS from new photos (on, default). 〔v1 scope: `auto-enhance new photos` (deferred feature) and `calibration defaults` (deferred) are removed from the sheet.〕 Footer: `«Done»`.

### 11.4 Storage & availability chip (used in Home and Editor top bars)

A 48px-tall pill in JetBrains Mono 13, states:
- `● «Local · 48 MB · Saved 2:14 PM»` (`--ok` dot) — normal.
- `◐ «Saving…»` (`--warn` dot, subtle 1s pulse) — a write in flight.
- `● «Pending — folder offline»` (`--warn` dot, solid) — folder handle unusable; tap opens an explanation + `«Locate folder…»` + `«Save a copy…»`.
- `● «Read-only»` (`--err` dot) — tap → Fix.
- `● «Offline · no network needed»` — a deliberate, calm reassurance shown *once* on first install and available on tap; the point is to teach that this app never needs connectivity.

---

## 12. Export flow

**Entry points:** Editor top bar `⇧ Export`, Project top bar `⇧ Export` (with the grid's selection applied if any), `Ctrl+E`, and `⋯ → Export`.

A modal wizard sheet, 880 × 700 (centered over a 60% scrim), 3 steps + progress. Steps are navigable by a left rail of step rows (`1 Scope · 2 Format · 3 Destination`) with a `Back` / `Next` footer, and the primary button on the right.

**Step 1 — Scope.**
Segmented 56px toggles: **`«This sheet»`** (default when in the Editor) / **`«Selected sheets (3)»`** (default when the Project grid has a selection) / **`«All sheets (12)»`**. Below: a scrollable list of the affected sheets with 64px thumbnails, checkboxes, and `Select all / none`. Shows a live count and an estimated size that updates as scope changes.

**Step 2 — Format.**
- **Format** (two big radio cards, 160px tall): **PDF** (multi-page, one page per sheet) / **PNG** (one file per sheet).
- **PDF options:** page size `«Fit to photo»` (one page per sheet at the photo's aspect — page = image px × 0.75 pt, photo at 96 dpi by design) — do not offer paper sizes as the default; field crews want the photo, not Letter. Quality: `1× / 2× / 3×` with estimated MB, **2× default** 〔v2: 3× is ~450 MB of canvas per sheet on a Surface Go — show `«Slow on this device — expect a wait»` under 3× when the device profile is low-RAM, and always render one sheet at a time〕. 〔v1 scope: markup is ALWAYS flattened — the `«Flatten markup»` checkbox and the vector-overlay option are removed (deferred to 1.1); the `«dimensions summary page»` checkbox is removed (deferred).〕 Checkbox `«Include sheet names in pages»`.
- **PNG options:** transparency (`photo` always has a base, so this is moot — instead: `«Size: 1× / 2× / 3×»`), and `«Zip into a single .zip»` (default ON so the user drags one file).
- **File naming:** a template input with token buttons that insert at the caret: `{project}` `{sheet}` `{index}` `{date}` `{time}`. Default `«{project}_{index}-{sheet}»`. A **live filename preview list** (the first 3 real names, in mono) renders directly beneath, and a **conflict policy** segmented control: `«Add (1), (2)…»` (default) / `«Overwrite»` / `«Skip»`.

**Step 3 — Destination.**
- Shows the resolved path in mono, middle-truncated, with a `«Choose folder…»` button (default `<project>/exports/<yyyy-MM-dd_HHmm>/`). A `«Remember this destination for this project»` checkbox.
- A prominent `«Destination»` summary: `«Will write 6 files (18.4 MB) to:  …\Riverside Elementary\exports\2026-09-21_1412\»`
- **`«Export»`** primary button, 64px, `--hi`.

**Progress & result.**
- Progress view: overall progress bar with mono percentage, per-file rows (icon, name, `✓ / … / ✕`), elapsed time, and a `«Cancel»` that stops cleanly (already-written files remain; the user is told so).
- Result view: a `--ok` check, `«Exported 6 files (18.4 MB)»`, the full path in mono with a `«Copy path»` button, and three actions: `«Reveal folder»` 〔= `showDirectoryPicker({ startIn: <destination handle> })` — the closest a PWA gets to opening Explorer; **`«Open folder»` via the OS is impossible from a PWA — never ship that string**〕, `«Export again»`, `«Done»`. Plus one line of instructional copy in `--g300`: `«Drag this folder into Dropbox when you're back on Wi-Fi.»` — the whole point of the local-folder architecture is that this moment is where the user's workflow continues, so the app should say it out loud.
- **Errors:** per-file rows show the specific failure: `«Folder permission expired»` → `«Re-authorize»`; `«File is open in another app»` → `«Retry»`; `«Not enough disk space»` → the exact shortfall. Retry is per-file, never "start over".

**States:** *Empty* scope (no sheets selected) → `«Select at least one sheet»`, primary disabled; *Loading* (during generation) → progress view; *Error* → per-file as above; *Success* → result view.

---

## 13. System status & safety

### 13.1 Autosave (the trust system)

There is no Save button, so the Autosave chip is the most important 200 pixels in the app. It lives in the top bar **center** in every editing context, is **never** hidden by overflow, never collapses to an icon-only state, and is tappable.

| State | Chip | Behavior on tap |
|---|---|---|
| **Saved** | `✓ «Saved 2:14 PM»`, `--ok` check, 13/600 | Opens **History** flyout. |
| **Saving** | `◐ «Saving…»`, spinner at 0.9s rotation (slow enough not to flicker) | Opens History (still shows last saved time). |
| **Offline/pending** | `◐ «Pending — folder offline»`, `--warn` | Explains, offers `«Locate folder…»` and `«Save a copy…»`. |
| **Read-only** | `⊘ «Read-only»`, `--err` | Explains and offers `«Re-pick folder»`. |
| **Error** | `! «Couldn't save»`, `--err` + a single `«Retry»` button inside the chip | Expands to a full explanation with `«Retry»` / `«Save a copy…»` / `«Copy error details»`. |

Write mechanics the UI must reflect honestly: changes are coalesced and written 400ms after the last edit; thumbnails regenerate 3s after the last edit; writes are serialized per sheet (and guarded by a **per-project** Web Lock — two tabs on *different* projects never block each other); failures back off (1s, 3s, 10s) and then park in the `Pending` state instead of silently retrying forever. Never show `Saved` optimistically before the write resolves. 〔v2 hardening: all writes — JSON, photos, assets, thumbnails — use the tmp→rename atomic pattern; the chip reflects the write promise's resolution only.〕

**History flyout** (from the chip): a list of local snapshots (auto every 10 minutes of editing, plus one before each destructive action), each row showing time and a one-line summary (`«Before: Clear sheet markup (14 objects)»`), tap to open a read-only preview with `«Restore this version»`. Stored in `<project>/.history/<sheetId>/` (and `.history/_project/` for `project.json`), capped at 20 snapshots / 200 MB per project with oldest-first pruning (and the cap is stated in the flyout footer, not hidden). 〔v2 hardening: restoring a snapshot is a **whole-sheet restore** — this IS the persisted undo mechanism (preflight §8.3/D20); there is no separate per-command journal across restarts.〕

### 13.2 Undo / redo

- Location: bottom of the tool rail, two 56px buttons (§5.1). Also `Ctrl+Z` / `Ctrl+Shift+Z`.
- Undo depth: 100 steps in memory. Across restarts, "undo" = restoring a `.history` snapshot from the Autosave chip's History flyout (whole-sheet restore — one mechanism, §13.1).
- Undo **coalesces ink**: a single continuous freehand stroke is one undo step, not 400. Style changes to a selection coalesce within a 600ms window into one step.
- Every undo button press shows the action name in a toast: `«Undid: Delete dimension 12' 6"»` — this is how a user learns what each step will do without experimentation.
- The redo stack clears on a new edit (standard) and the button visibly dims at 40% when empty.
- Never allow undoing a photo capture into a broken state: capture/import are undoable only while the image is still in memory, after the disk write completes they become `«Delete sheet»` operations instead. State this explicitly in the build notes.

### 13.3 Destructive-action policy

| Action | Recoverable? | Pattern |
|---|---|---|
| Delete an object / stroke | Yes (undo) | Immediate + `«Undo»` toast, 8s. **No dialog.** |
| Delete a sheet | Yes (to trash + undo) | Immediate + toast `«Sheet deleted · Undo»`, 10s. Files move to `<project>/.trash/`, pruned after 14 days. **Restore UI:** Project ⋯ → `«Trash…»` (list + preview + `«Restore»`) — trash is not a write-only graveyard. |
| Clear all markup on a sheet | No (in bulk) | Dialog + **hold-to-confirm 600ms** + a checkbox list of what's included. |
| Delete a project's files | No | Dialog + type the project name + hold-to-confirm. Shows the exact path. |
| Remove a project from the list | Yes (files untouched) | Immediate + toast, with the clear copy from §11.1. |
| Overwrite files on export | No | Handled by the export conflict policy, not a dialog. |
| Discard a capture (retake) | n/a | No dialog unless replacing an existing sheet photo. |
| Changing a sheet's base photo | Depends | Identical working-image dimensions → silent swap (undo toast). Different dimensions → warned dialog (`«markup may land in the wrong place»`) + hold-to-confirm on `«Remove markup»`. (§11.2 card menu) |

**Hold-to-confirm component spec:** **64px tall** (session 4: this said "56px tall minimum" while §2 and §14.5 classify destructive confirms in the 64px tier — 64 wins; it is the one control where a mis-tap is unrecoverable), the destructive label sits inside a progress track; holding fills it left→right with `--err` over 600ms while a subtle 60ms tick plays (audio off by default on noisy sites); releasing early cancels with a 150ms drain. Focus is never placed on the destructive button by default — the safe action (`Cancel`) receives initial focus. `Esc` always cancels.

### 13.4 Toasts

Bottom-center in the editor (bottom-left would collide with the zoom pill), bottom-center in Home/Project, max 1 at a time, 8s default (10s when they carry an Undo), 56px tall, `--g750`, radius 999px, action button on the right with `--hi` text. Never stack toasts; a new toast replaces the old one and the replaced one's undo window is closed (state this so builders don't invent a stacking system).

---

## 14. Accessibility & field ergonomics (build requirements)

1. **Contrast.** WCAG 2.2 AA minimum everywhere: 4.5:1 for text, 3:1 for icons and UI boundaries. Colors, not shading, carry meaning. All text on the dark chrome uses `--g100` (#EAF0F5) or `--g000`, never `--g300` for anything below 15px in Sunlight mode.
2. **Sunlight mode** (Settings → Theme: `Standard` / `Sunlight` / `Dim`). Sunlight pushes every token to extremes: pure `#000` chrome, pure `#FFF` text (≈21:1), icons at 2.5px strokes, 64px minimum targets, an optional high-contrast canvas mat (pure black instead of `--mat`), and disabling of all subtle 120ms fades in favor of instant state changes. This is the mode a crew member will actually run outdoors in July, and it must be a first-class theme, not a filter.
3. **Marks legibility over arbitrary photos — mandatory technique.** Any text drawn on the canvas (dimension labels, angle values, text notes without a background, vertex indices) renders with a **dual outline**: stroke text with `paint-order: stroke; stroke-width: 4px; stroke: rgba(11,14,18,.85)` behind a `fill: currentColor`, plus a 1px inner `--sel` hairline only while actively editing. Any *control* floating over the canvas (loupe ring, tooltips, mini toolbar, zoom pill, hint chips) uses a solid `--g900` at 92% opacity background with a 2px `rgba(255,255,255,.14)` border. Never place a thin translucent control over unpredictable photography.
4. **Never use 1px borders.** At 200% scaling a 1px CSS border lands inconsistently across device pixel boundaries and disappears in glare. The minimum hairline is **2px** (`--g700`); 1.5px is acceptable only for internal dividers inside panels.
5. **Targets.** 56px for rail/style controls, **72px for keypad number keys**,
   88px for the camera shutter, 64px for dialog primaries/destructive confirm, 48px absolute floor, 8px minimum gap.
   〔Session 4: keypad was 64px here and 72px in §8.1's diagram — 72 wins, see §2. The two
   sanctioned sub-48px exceptions are the 44px colour swatch grid (§7.2) and the 44px Recent
   style chips (§7.3); both are dense, forgiving, non-destructive, adjacent-miss-is-harmless
   grids, and **no third exception may be added**.〕 Hit areas may exceed visual size by up to 8px of padding, but never overlap another hit area by more than 0px — check the swatch grid and the rail's rail-edge notch specifically. 〔Touch-first, v2.1: under touch-primary the **floor is 48px** and the hit slop becomes **16px general / 24px along thin strokes** (from 8/12 for pen). No new exception is created — this only tightens.〕
6. **Pen hover.** Surface Pens report hover. Use `pointerover`/`pointermove` with `pointerType === 'pen'` to show tool tooltips, preview erase targets, and highlight handles *without contact*. This reduces mis-strokes and is a real differentiator on this hardware. Hover never triggers an action. 〔Touch-first, v2.1: hover is pen-only, so **every hover-only affordance gains a touch equivalent** — rail tooltips → the Style Chip + press-and-hold (§6.3); erase preview → tap-to-delete + undo toast, long-press to preview *without* deleting (§8.7); handle highlight → a 56px proximity halo on contact (§8.6). Nothing may be reachable *only* by hover (§1.7).〕
7. **Palm & glove rejection.** Pen `pointerdown` suppresses touch input for 1200ms. Optional `«Pen only»` canvas setting for crews who want finger gestures limited to two-finger pan/zoom. 〔Touch-first, v2.1: **with no pen this suppression cannot run**, so palm rejection is **probabilistic, not deterministic** — OS/digitizer blocking where present, edge/dead-zone rejection and a multi-touch debounce as bounded heuristics, and **undo + `pointercancel` rollback** as the real safety net. Never build a mode that silently discards input; never ship a size-threshold palm filter as if it were reliable. `«Gloved touch»` (off) adds hit slop +8px, snap acquire +4px, loupe offset +16px.〕
8. **Handedness.** A plain first-run question (Right pre-selected as default), overridable in Settings. 〔v2 hardening: the Windows pen setting is not readable from a web page — never claim or depend on it.〕 It mirrors: rail side, style panel side, loupe offset direction, keypad numeric layout (digits cluster toward the writing hand), mini-toolbar anchor, and the rotation of the align-guide priority. Changing it re-renders in place without losing canvas state.
9. **Keyboard & Type Cover.** Full keyboard operability: visible 2px `--sel` focus rings on every control (`:focus-visible` only), logical tab order = top bar → rail → canvas → style panel, `Tab`/`Shift+Tab` within the style panel, arrow keys nudge a selection 1px (10px with Shift). The dimension keypad accepts direct typing (§8.1). Touch adds no tab stop; make the canvas container focusable so arrow-nudge works after a touch selection. 〔Touch-first, v2.1〕
10. **Screen reader.** Every icon-only control has an `aria-label` naming the tool and its current style (`«Dimension tool, hi-vis orange, 4 point, arrowheads both»`), and the canvas exposes the object list (`role="application"` with an accessible object tree mirroring the Layers panel — a measurement app used by an office team should let a colleague audit dimensions without a mouse). Announced live regions: autosave state changes, selection count, undo action names. 〔Touch-first, v2.1: also announce placement state (`«Dimension: first point placed»`) and selection changes; under touch the object tree ("select the dimension from a list and nudge with arrows") becomes a first-class path, not a fallback.〕
11. **Text scaling.** Layout must survive 100–150% UI scale: rail switches to icon-only with hover/long-press labels at >125%, style panel controls wrap to two rows, project cards drop to 2 columns. No truncation of numeric values — numbers shrink to 13px mono before they ever clip.
12. **Motion.** `prefers-reduced-motion` → all chrome transitions become 0ms opacity swaps. Ink and the loupe are never animated regardless. 〔Touch-first, v2.1: the anchor-pin collapse becomes an instant opacity swap under reduced motion.〕
13. **Latency budget (treat as an a11y requirement).** Pen-to-ink ≤ 16ms perceived; tool swap visual feedback ≤ 100ms; any action over 400ms must show progress. Preview strokes render on the compositor; markup re-renders are batched per frame. 〔Touch-first, v2.1 touch budgets: `pointerdown` → loupe + anchor ≤ **16ms** (1 frame); `pointerup` → object committed ≤ **32ms** (2 frames); tap B → `<PlacementHud>` interactive ≤ **50ms**; keypad fully open **630ms** worst case (450 settle + 180 slide); label re-render ≤ **32ms**. The rule that prevents "laggy": every auto-open must be cancellable by contact, and every deferred step must have an immediately-live manual equivalent.〕
14. **Audio/haptics.** Snap ticks and commit clicks are optional (default **off**; construction sites are loud and a beeping tablet is the enemy). Surface Slim Pen 2 haptics may be used for snap/commit if the Ink APIs expose them — best-effort, never required, and never the only signal. 〔Touch-first, v2.1 — **no haptics for touch:** Surface tablets have no haptic actuator, and Slim Pen 2 haptics are not drivable from the web with confidence, so **touch confirmation is visual-only**. State this so nobody plans around a buzz that cannot happen.〕
15. **Offline correctness.** The PWA must be fully functional with the network stack dead: service worker precaches the app shell, both fonts (woff2 subsets), and icons; there is no telemetry, no CDN, no remote font, no analytics. Show `«Offline · no network needed»` once so the crew trusts it.
16. **Touch reach & palm safe-area (touch-primary).** In **portrait (960 × 1440)**, the comfortable one-handed arc is the bottom ~35% (y ≈ 940–1400), within ~90 mm of the corners. The bottom style bar (72px) is correctly placed and undo/redo already sit at the rail's bottom. **The top bar (52px) and the rail's upper rows are out of one-handed reach in portrait**, so the mild spec delta is a **56px pull-down handle at the top of the rail** that brings Layers · Export · ⋯ down into the bottom third as a horizontal strip. Reserve a **24px inner canvas margin**, and keep the keypad sheet and the mini-toolbar at least **96px clear of the bottom edge** (palm/heel occlusion). Landscape two-handed at the bezels is unaffected. 〔Touch-first, v2.1〕

---

## 15. Component structure (implementation map)

Names are suggestions; the **boundaries** are the specification.

> **Implementation note (architecture, not design):** the tree below is a *logical* component map.
> The canvas (PhotoLayer / InsetLayer / MarkupLayer / DrawOverlay / SelectionOverlay / Loupe) is built
> with **imperative Konva** (`Konva.Stage` / `Konva.Layer` / `Konva.Shape`), **NOT react-konva**.
> `<MarkupObject>`, `<InsetObject>`, etc. are conceptual boundaries for shape rendering and selection,
> not React components. React renders only the chrome around the canvas (TopBar, ToolRail, StylePanel,
> and the portalled overlays).

```
<AppShell>
├─ <TopBar>                       // Editor 52px / Home·Project 56px (intentional height variant); contents vary by screen
│   ├─ <Breadcrumb segments[]>    // editor: Projects / {project} / {sheet}
│   ├─ <SheetTitleField>          // inline editable, 18ch truncate in portrait
│   ├─ <AutosaveChip/>            // + <HistoryFlyout>
│   ├─ <StorageChip/>             // Home only
│   ├─ <LayersButton/>            // → <LayersPanel>
│   ├─ <ExportButton/>
│   └─ <OverflowMenu/>
├─ <Workspace>                    // layout container; owns the docking rule (§5.3)
│   ├─ <ToolRail side="right|left">   // handedness-driven in v1 (no Bottom / manual override — deferred)
│   │   ├─ <ToolGroup label="MEASURE">  <ToolButton/> × n  </ToolGroup> × 6
│   │   ├─ (QuickPair — deferred v1, §6.5)
│   │   ├─ <UndoRedoCluster/>
│   │   └─ <RadialQuickMenu/>     // pen-barrel / press-and-hold, 8 recents
│   ├─ <CanvasViewport>
│   │   ├─ <PhotoLayer/>          // base sheet image + sheet edge/shadow
│   │   ├─ <InsetLayer>           // <InsetObject> × n  (each has children[])
│   │   ├─ <MarkupLayer>          // <MarkupObject variant=dim|angle|line|arrow|rect|ellipse|poly|ink|highlight|text>
│   │   ├─ <SelectionOverlay>     // bbox, 8 handles, rotate, align guides, <SelectionToolbar>
│   │   ├─ <DrawOverlay>          // in-progress geometry + live label + <PlacementHud> (✓ Value · Adjust endpoints · ✕); never animated
│   │   ├─ <Loupe/>               // edge-aware placement, frozen source region
│   │   ├─ <ZoomPill/>
│   │   └─ <CanvasHints/>         // first-use one-liners, never blocking
│   └─ <StylePanel dock="side|bottom">
│       ├─ <StyleChip/>           // tool icon + WYSIWYG swatch + name  (ALWAYS visible)
│       ├─ <ContextualControls/>  // switches by tool + selection state
│       │   ├─ <Palette/>  <CustomColorPopover/>  <Eyedropper/>
│       │   ├─ <WidthScrubber/>  <FillControl/>  <TransparencyRamp/>
│       │   ├─ <LineStyleSegment/>  <ArrowheadSegment/>
│       │   ├─ <TextControls/>  <InsetControls/>  <EraseControls/>
│       │   └─ <PrecisionControl/>  <UnitFormatControl/>  <CalibrateButton/>
│       ├─ <PresetMenu/>  <RecentsStrip/>
│       └─ <MixedValueIndicator/> // indeterminate states for multi-select
├─ Overlays (portalled)
│   ├─ <DimensionKeypadSheet/>    // + <LiveParsePreview/>, <ChainButton/>
│   ├─ <AngleCommitSheet/>
│   ├─ <StyleEditorSheet/>
│   ├─ <ImageInsetPickerSheet/>   // camera / choose file / recents grid
│   ├─ <ExportWizard>             // Scope → Format → Destination → Progress → Result
│   ├─ <LayersPanel/>
│   ├─ <ConfirmDialog destructive> // requires <HoldToConfirm/>
│   ├─ <Toast/>                   // single-instance, with optional Undo
│   └─ <CameraFlow>               // Capture → Review → (Accept | Retake)
```

**State stores (suggested split):**
- `appStore` — projects, currentProject, currentSheet, storage/permission status, theme, density, handedness, input filters (`«Touch places and moves»` · `«Finger draws (freehand)»` · `«Magnifier when you tap»` · `«Gloved touch»` · `«Pen only»`), units/precision.
- `editorStore` — sheet, activeTool, `styleByTool`, selection, `undoStack`/`redoStack` (command pattern; ink coalesced), `viewTransform`, panel open state, radial recents, pending operations.
- `persistence` — `FileSystemDirectoryHandle` in IndexedDB, `AutosaveQueue` (per-sheet serialize, 400ms debounce, 1s/3s/10s backoff → Pending), thumbnail regeneration (3s debounce, off-main-thread), history snapshots (10-min cadence + pre-destructive).
- `polygon math / ink / snapping` — pure functions, off the render path, unit-tested (snapping and ft-in parsing are the two places where a bug becomes a wrong measurement on a job site; they deserve real tests).

**On-disk layout (drives the Home/Project UX and must be human-readable):**
```
<Project folder>/
  project.json                     // name, order, defaults, calibration defaults
  sheets/
    001-2026-09-21-1412/
      photo.jpg                    // EXIF-baked, oriented, GPS stripped by default
      markup.json                  // objects[] + inset children[] (nested 1 level)
      thumb.jpg                    // 640×480 composite, regenerated on save
      meta.json                    // captured at, camera, dimensions summary cache
    002-…/
  assets/
    <uuid>.jpg                     // inset + shared images (deduped by content hash)
  exports/
    2026-09-21_1412/…              // the folder the user drags into Dropbox
  .fieldmeasure/
    presets.json                   // travels with the folder
  .history/                        // capped snapshots (_project/ holds project.json snapshots; <sheetId>/ holds markup.json)
  .trash/                          // 14-day sheet trash
```

---

## 16. Implementation-critical details (a "do not simplify" list)

These are the specific things a mechanical implementer is most likely to flatten. Each one is a deliberate design decision with a reason.

1. **The tool rail is vertical and on the writing-hand side.** Not a bottom bar, not a left-docked Figma-style palette. Reason: canvas aspect must match a 3:2 photo, and the pen hand must not cross the body. (§5.1)
2. **The rail is a 2-column grid, bottom-anchored, with undo/redo at the very bottom.** Not a single scrolling column. (§6.2)
3. **No radial menu for the full tool set** — only an 8-slot recents radial, and only if the pen has a barrel button. (§6.4)
4. **The Style Chip is a WYSIWYG rendering of the next stroke**, not a colored dot or a tooltip. (§7.1)
5. **Style edits apply to the selection AND update the tool default**; mixed values render as indeterminate, and incompatible controls are disabled rather than hidden. (§7.4)
6. **The dimension loupe appears on pointerdown with zero delay, is edge-aware, and never sits under the pen hand or tip.** The live label offsets with a leader line rather than colliding. (§8.1)
7. **Cancelling the dimension keypad keeps the drawn geometry.** Never discard the stroke. (§8.1)
8. **The chain button exists.** Chained dimension runs are a headline feature. (§8.1)
9. **Live ft-in parse preview with the raw unit equivalent**, plus a keyboard fast-path that needs no focus. (§8.1) 〔v2 hardening: the input behind the preview is the **slot state machine** (preflight §6.1.1) — the preview is a pure function of slots; the strict parser round-trips every committed `enteredText`. There is no "guess the parse" layer.〕
10. **Uncalibrated dimensions show `≈`** and are honest about it. (§8.1) 〔v1 scope: superseded — calibration is deferred, so v1 dimensions never show `≈` (there is nothing to be uncertain about: values are typed). The honesty requirement carries to the Angle tool's readout and any future measured value.〕
11. **Insets are containers with their own markup layer, nested exactly one level**, with a Focus breadcrumb chip as the only z-context indicator. (§9)
12. **Highlighter inserts below all other markup automatically.** (§8.4)
13. **Hold-to-shape (400ms) for freehand** with a visible `⇧ Shape` chip. (§8.4)
14. **Recoverable deletion never dialogs** — it toasts with Undo. Only irreversible actions dialog, and theirs is hold-to-confirm. (§13.3)
15. **The Autosave chip is never icon-only, never in overflow, and never shows "Saved" optimistically.** (§13.1)
16. **Sunlight mode is a token-level theme**, not a CSS filter. (§14.2)
17. **Dual-outline text and 92%-opaque control backgrounds over the photo** — everywhere, no exceptions. (§14.3)
18. **2px minimum hairlines; no 1px borders.** (§14.4)
19. **Pen hover is used for tooltips and erase targeting, and every hover-only affordance has a touch equivalent.** (§14.6) 〔Touch-first, v2.1〕
20. **Export ends by telling the user to drag the folder into Dropbox.** That sentence is the bridge back to their real workflow. (§12)
21. **Tap-tap is the primary placement verb, and the loupe is the tap's precision channel.** Every placement tool (Dimension, Angle, Line, Arrow/Leader, Rectangle, Ellipse, Polygon, Image inset, Text) supports tap-A / tap-B creation through **one** `PlacementController` (a pen drag and a finger tap are the same machine); the dimension's **450 ms settle window** and the **cancelled-auto-open** rule are load-bearing, and committing *or* cancelling never discards the drawn geometry. (§8.1–§8.3) 〔Touch-first, v2.1〕
22. **Touch confirmation is visual-only, and palm rejection without a pen is probabilistic.** The target hardware has no haptic actuator; with no pen there is no deterministic palm rejection, so undo + `pointercancel` rollback is the real safety net. Never build a mode that silently discards input. (§14.7, §14.14) 〔Touch-first, v2.1〕

---

## 17. Screen state matrix (quick reference for QA)

| Screen | Empty | Loading | Error | Active |
|---|---|---|---|---|
| Home / Projects | Illustration + create/open | 6 skeleton cards | Warn banner + per-card Locate | Search filtered / sort applied |
| Project / Sheets | 2 add tiles + one-line copy | 8 skeletons, add tiles live | Read-only chip + toasts | Sheet selected / reordering / renaming |
| Editor | New sheet: photo + `«Tap a tool, then tap the photo»` hint | Photo decode placeholder + shimmer | Folder offline / read-only chip | Placement pending (AnchorA / AnchorB settle / RefineEndpoint) / keypad open / selection / focus-in-inset |
| Capture | n/a (camera preview or the `«Camera unavailable»` panel) | 120ms shutter flash + `Adding…` bar | Permission denied → Open Windows Camera / Import | Tap-to-focus reticle active, level locked |
| Export | `«Select at least one sheet»`, primary disabled | Per-file progress rows | Per-file errors with Retry | Result view with Copy path / Reveal folder |
| Layers | `«No markup yet»` | n/a | n/a | Row selected / dragging / group expanded |

---

## 18. Open questions (for the orchestrator / product owner)

1. **Calibration** — ~~required sub-flow~~ **Resolved (v2): deferred for v1; dimensioning is typed-value-only with the drawn length never shown as a number.** The full sub-flow spec is retained at §8.1 for the calibration release. Confirm this is acceptable for the pilot.
2. **PDF vector overlay** — **Resolved (v2): flattened-only in v1** (checkbox removed from the wizard); vector overlay is a 1.1 candidate. Confirm `@cantoo/pdf-lib`'s vector/dash fidelity when that release is planned.
3. **GPS**: default is stripped. Confirm whether a site-address field (typed, not geolocated) belongs in sheet meta for reporting.
4. **Metric units**: not designed in. The ft-in parser and the unit toggles have a clean seam for it, but say so now if metric is needed, because the keypad's fraction chips are ft-in-specific.
5. **Sheet templates** (e.g. a pre-set dimension style and title block) were not in scope; the preset system can carry most of that value if needed.
6. **Capture resolution reality** (new, v2): the 0.2 input spike measures the device's true `getUserMedia` caps. If both `High`/`Fast` land at ~4K, decide whether the toggle earns its place, and whether to promote the Windows Camera app import path for high-res shots.

---

## Appendix — v2 hardening changelog (what changed in this document and why)

Each change below fixes a verified adversarial-review finding (references are to the review's finding IDs). Inline `〔v1 scope: …〕` markers appear at every affected section.

| # | Change | Sections touched | Finding fixed |
|---|---|---|---|
| 1 | **Calibration, `≈` on dimensions, `«Keep measured…»`, `«Not calibrated»` chip, calibrated rulers, polygon area readout → DEFERRED.** v1 is typed-only; the drawn length is never shown as a number. The full sub-flow spec is retained at §8.1 for the calibration release. | §5.4, §7.2, §8.1, §8.3, §16-10 | B4 |
| 2 | **Keypad input model**: the live preview is a pure function of the slot state machine (preflight §6.1.1) — `12 6` → `12' 6"`, `12' 6 3` → `12' 6 3/16"` (project precision, cyclable), `.` routes to the fraction numerator. Committed `enteredText` always round-trips the strict parser (property-tested). | §8.1, §16-9 | B2 |
| 3 | **Dimension panel Precision/Unit format edit the project-level values** (one source of truth; chip confirms `«Project precision: …»`). Labels derive at render — never persisted, never stale. | §7.2, §8.1 | M5, M11 |
| 4 | **Palm rejection hardened**: touch ignored 1.2 s after ANY pen event AND for the entire duration of an active pen stroke (a >1.2 s stroke must not re-open the touch window). | §5.4 | M4 |
| 5 | **Handedness = plain first-run question (Right default).** The Windows pen setting is not readable from a web page — no copy may claim it. | §4.4, §14.8 | M6 |
| 6 | **Capture resolution toggle shows the device's real max** (`getUserMedia` caps ~1080p–4K on Windows); Windows Camera app + Import is the high-res path. **Auto-enhance removed from the review screen (deferred).** | §10.1 | M8, B4 |
| 7 | **`Show in Explorer` / `Open folder` strings eliminated everywhere** — impossible from a PWA. Replaced by `Copy path` + `Reveal folder` (`showDirectoryPicker({ startIn })`). | §11.1, §11.2, §12, §17 | B4 |
| 8 | **Export wizard**: flatten checkbox + vector overlay + summary-page checkbox removed (always flattened, deferred); **2× quality default**; 3× shows a low-RAM device warning; page = image px × 0.75 pt. | §12 | B1, B4, Minor-3 |
| 9 | **Replace photo constrained** (identical dims → silent swap; different dims → warned dialog, hold-to-confirm on `Remove markup`). **Sheet-card `Rotate` CUT** (would corrupt the coordinate space). `Import a project` card and `Duplicate project` removed (cut/deferred). | §11.1, §11.2, §13.3, §10.1 | M7, B4 |
| 10 | **Trash restore UI added** (Project ⋯ → `Trash…`: list, preview, `Restore`). Trash is not a write-only graveyard. | §11.2, §13.3 | Minor-6 |
| 11 | **Persisted undo = history snapshots** (whole-sheet restore from the Autosave chip); no separate command journal. `.history/_project/` covers `project.json`. | §13.1, §13.2 | M10, M2 |
| 12 | **Autosave mechanics note**: per-project Web Lock (two tabs on different projects never block each other); all writes atomic (tmp→rename) including photos. | §13.1 | M3, M1 |
| 13 | **Inset data model pinned** (children in asset working-image px; crop in asset px via `clipFunc` before transform; children never rewritten on inset transforms; dedupe never merges children). Visual spec unchanged. | §9 | B3 |
| 14 | **Cancel-keeps-stroke gap closed**: a valueless dimension renders with a `«tap to enter value»` ghost label until a value is entered (tapping reopens the keypad). | §8.1 | review follow-up |
| 15 | **Project settings sheet** trimmed of deferred features; `unit format` added. **Rename copy** states the folder name is cosmetic (the folder is never moved — the API doesn't exist). | §11.3, §11.1 | M7, B5 |

**v2.1 — touch-first pass (2026-09-21).** The app was specified pen-first but will be used primarily by touch. Rows 16–30 apply the touch workstream (handoff §13, `docs/touch-first-interaction-model.md` §1–§9); rows 31–33 close the contradiction-register items still open in this file (C11, C12, C14). **C1–C10 and C13 were applied earlier by commit `5fa9515` and are not revisited here.** Every row below needed a `DECISIONS.md` line.

| # | Change | Sections touched | Finding fixed |
|---|---|---|---|
| 16 | **Touch is the primary input (principle inversion).** §1.1 becomes "Touch places and moves. Pen draws. Both create geometry." Settings gains `«Touch places and moves»` (ON) and re-scopes `«Finger draws (freehand)»` (OFF); the pen always draws. The old "finger navigates" default and its palm-smudge rationale are retired. | §1.1, §5.4, §14.7 | F1/F2 (handoff §13.3) |
| 17 | **Tap-tap placement for every placement tool** through **one** `PlacementController`: Dimension (2), Angle (3), Line/Arrow/Rect/Ellipse (2), Polygon (open, + `✓ «Done»` and `«Undo point»`), Image inset (1), Text (1). A pen drag and a finger tap are the same machine. | §8.1–§8.3, §9, §16-21 | F2 |
| 18 | **Dimension 450 ms settle window.** Geometry commits at B, a live `<PlacementHud>` (`✕ · Adjust endpoints · ✓ Value`) is interactive ≤50 ms, and the keypad auto-opens **only if no canvas contact occurred**; any contact cancels the auto-open permanently. Committing/cancelling never discards the geometry. | §8.1 | handoff §13.6 |
| 19 | **Touch loupe variant** (200px, 4× of a **50×50** source — `sourcePx = diameterPx / 4`, 200 / 4 = 50 — 136px offset, 44px contact disc, 1px dashed leader, freeze-on-lift 700 ms), added alongside the unchanged pen loupe. | §8.1 | §13.6 |
| 20 | **Snapping retuned for fingers:** acquire **32px → lock 20px**, evaluated on the `pointerdown` position (a pure tap still snaps); **Strong** is the default under touch; edge midpoints added to the priority list. | §8.1 | §13.6 |
| 21 | **Offset Nudge Pad + enlarged handles:** a **120px** pad floating **96px** from the anchor (0.35× core / 1.0× outer); tug handles **28px visual / 72px hit**; mini-toolbar **64px**. Refinement never covers the point. | §8.1, §8.6 | §13.6 |
| 22 | **One-finger drag is object-first** — a **deliberate product-owner decision *against* the safer selection-first convention** — with mandatory safeguards: a second finger cancels the drag **and restores the pre-drag position**, the Pan tool overrides unconditionally, and a lift within 8px is a tap, not a drag. Two-finger drag always pans. | §5.4 | handoff §13.8 conflict 1 |
| 23 | **Two-finger tap retained as a SECONDARY path only** (add to selection; cancel mid-placement), because every action it performs also exists as an on-screen control (§1.7). | §5.4, §8.6 | handoff §13.8 conflict 2 |
| 24 | **Erase under touch:** object mode is tap-to-delete + an undo toast naming the object (long-press previews without deleting); **stroke/split mode is pen-only** with `«Splitting a stroke needs the pen. Touch can delete the whole stroke.»` | §8.7 | §13.6 |
| 25 | **Highlighter gains a tap-tap mode under touch:** `«Straight line»` defaults **ON**, making it the touch-native stroke tool; chisel width default 24. Finger freehand stays opt-in behind `«Finger draws (freehand)»`. | §8.4, §7.2 | §13.6 |
| 26 | **Every pen-hover-only affordance gains a touch equivalent** — rail tooltips → Style Chip + press-and-hold; erase preview → tap-delete + undo toast; handle highlight → 56px proximity halo; canvas long-press (600 ms) pins the mini-toolbar. | §6.3, §8.6, §8.7, §14.6, §16-19 | §13.6 |
| 27 | **Visual-only confirmation, no haptics:** the target hardware has no haptic actuator and Slim Pen 2 haptics are not web-drivable, so touch feedback is the loupe + the 90 ms anchor-pin collapse. | §1.1, §14.14, §16-22 | §13.6 |
| 28 | **Touch target floor 48px; hit slop 16px general / 24px on thin strokes.** No new sub-48px exception is created — this only tightens. | §2, §14.5 | §13.6 |
| 29 | **Palm rejection documented honestly:** with no pen it is **probabilistic, not deterministic** — OS/digitizer, edge rejection and debounce as bounded heuristics, undo + `pointercancel` rollback as the safety net. No mode that silently discards input. | §1.1, §5.4, §14.7 | lib-4 (handoff §13.7) |
| 30 | **Touch reach & safe area:** portrait one-handed reach delta (56px rail pull-down), a 24px inner canvas margin, and 96px bottom clearance for the keypad / mini-toolbar. | §14.16 | §13.6 |
| 31 | **C11 — cyan is differentiated by treatment:** focus ring = `--sel` 2px + **2px offset**; selection = `--sel` 2px bbox + **4px glow**. | §3.1, §8.6 | C11 |
| 32 | **C12 — `--hi` orange's dual role recorded as deliberate** (UI accent + default dimension stroke), with a mandatory legibility check on bright and dark photos. | §3.1 | C12 |
| 33 | **C14 — unquoted copy marked as placeholder copy:** the Style-panel headers, Home sort options, search placeholder, first-run card labels and Capture toggle labels are copy (routed through `src/ui/strings.ts` from `docs/appendix-strings.md`), not literal captions. | Copy note, §7.2 | C14 |

**Verified already-correct at the time of this pass (no edit needed):** C1 (shutter = 88px in §2, §10.1, §14.5; primaries 64px), C4 (loupe cites §19.5), C5 (44px swatch + 44px Recents, "no third exception"), C8 (top-bar height is a named `<TopBar>` variant), C9 (Autosave chip centered in §13.1), C10 (number-readout rule: base 16px @100% zoom, clamped 28px), C13 (single Esc ladder in §4.2). C1–C10 and C13 were applied by commit `5fa9515`.

**Unchanged (verified sound in review):** the visual token system, layout/docking math (the rail stays 128/108 and never moves), tool grouping/rail anatomy, style panel grammar, capture screen chrome, Home/Project states, toast/history/undo patterns, and all "do not simplify" items other than those annotated above.
