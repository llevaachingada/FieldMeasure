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

| **(C4) Markup-layer redraw at `min(dpr, 2)`** — a 4096-px sheet carrying ~50 annotations, panned; report the median frame time and read the `§21.8` ladder (≤16 ms keep; >16 ms drop overlay to 1, re-measure, then markup to 1.5, then 1). | **MACHINE HALF MEASURED — provisional (D80).** Dev machine: median **0.6 ms** (p95 1.3) on the real `min(dpr, 2)` path; **0.7 ms** forced at ratio 2 and at ratio 1. The ≤ 16 ms bar is **not tripped** (~10–20× margin) but **this decides nothing** — re-measure on the Surface Go. `tests/editorCanvasPerf.browser.test.ts` carries the harness; `min(dpr, 2)` ships until hardware says otherwise. Note the browser project already runs at `devicePixelRatio === 2` (200 % scaling), so the DPR-2 *ratio* is genuinely exercised; only hardware's frame time is missing. |

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
| All 14 tools render in the rail at 56px with 8px gaps, **on the handedness side**. | PENDING — `[Surface]` for the 56 px / 8 px on-glass walk. **Machine half green, and now stronger (D127):** `tests/editorShell.test.tsx` proves the frozen tool table (14 tools / 6 groups / unique ids / copy) and `railSideFor`; the rail renders 14 buttons; **and `tests/editorChromeFit.browser.test.ts` asserts in REAL layout that the attribute agrees with where the rail actually is** (`rail.left > center.left` for right-handed). This row was previously green on the strength of the **attribute alone** — and the rail was in fact left-most on the default right-handed setting until D127 fixed it. |
| Rotating the Surface flips the style-panel dock and **does not move the rail**; zoom, tool and selection survive. | PENDING — machine half green: the `panelDockFor` table (incl. the inclusive 1.2 boundary) and a jsdom rotation that flips `data-dock` 1240×908 → 960×1388 while `data-rail` and the store’s tool/selection stay put; the real device rotation is deferred. |
| **(owner-reported, D126) The editor chrome fits the Surface at the owner's size.** Open the editor on the tablet (owner's case: 2880×1920 @150 % → **~1920×1120 CSS px**, maximised) and, with a finger, confirm the tool rail and the style panel are **fully visible, nothing clipped and no internal scrolling** for each tool (`select`, `dimension`, `rectangle`, `text`) and with an object selected; then rotate to portrait and repeat. Machine half green: `tests/editorChromeFit.browser.test.ts` measures it in real Chromium through the production height chain and **fails on the pre-change source** (`select` 1430 → **127** px, `dimension` 1566 → **835**, `rectangle` 1566 → **786**, `text` 1565 → **614** at 1920×1120; plus a **second instance of the same defect** the lane caught — with a selection every section returned: 1204 px in an 861 px box). The clickthru's editor step is the built-app screenshot for the record. **Two states still do not fit and need an owner decision:** a **mixed** selection (1205 px of §7.4-mandated visible-and-disabled content vs 839/663 px) and `dimension` + a selection at 1916×960 (+134 px). | PENDING — `[Surface]` for the on-glass read (text scaling 100–150 %, Sunlight/Dim, portrait/bottom dock). |
| **(D118 M8 / D126) Drag autoscroll feel.** In the sheets grid, long-press a card and drag toward the top/bottom edge: the body must scroll from the 48 px edge band (~18 px per frame) and the card must land where it visually sits; repeat on a ~20-sheet project (16 items are 1248 px at 1440 / 2452 px at 960 against 894/1374 px visible). Machine half green: the pure `autoscrollDelta` / `shiftRectsByScroll` boundary suite plus jsdom wiring (edge scrolls, middle does not, the loop stops on cancel). **The band size and per-frame speed are the feel, and they are a device call.** | PENDING — `[Surface]`. |
| **(owner-reported, D126) The rail-top symptom, if it recurs.** The owner's first screenshot showed the rail's first tile clipped at the top; it was **not reproducible** in the production height chain (rail content 758 px in a 908/1068 px box, no scroll, 310/150 px spare). If it recurs, record `document.scrollingElement.scrollHeight` vs `innerHeight`, `rail.getBoundingClientRect().top/height` and `rail.scrollTop`: a **page-level** scroll — a broken `height: 100%` chain somewhere outside the editor — is the only mechanism that can put a rail tile above the visible top. | PENDING — needs the device, with the diagnostic above. |

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

| Gate | Result |
|---|---|
| **[Surface — pen]** A hard-pressed pen stroke is visibly wider than a light one at the same style width (C9). If they look identical, `pressure` is being read from the wrong place. | PENDING (pen-only) — the CI counterpart is green: a ramped `pressure[]` yields a materially wider outline, and an all-`0.5` touch stroke renders at the constant 8-mu floor. |
| **Touch freehand** (with «Finger draws (freehand)» ON) renders at the constant width floor and is zoom-constant; erase-stroke mode is hidden under touch with the pen-required note shown. | PENDING — machine half green (`markupTools.browser.test.ts`): constant 8-mu ink, and the stroke-mode radio is absent with the note rendered. |
| **Every tool places with touch / draws with the pen; each is selectable, movable and undoable.** Touch: tap-tap for Line/Arrow/Rect/Ellipse/Angle; Polygon unchanged; each control has an on-screen equivalent. | PENDING — machine half: shape/angle tap-tap and drag both commit, handle-drag translate is undoable, and Delete removes the selection. Selection is now **fully shell-driven** (marquee-on-empty-drag, tap-select / second-tap action, the 600 ms long-press pin, rotate chips and Lock/Delete on the mini-toolbar) and browser-tested in `tests/layersWire.browser.test.ts`; **groups remain unwired** — no group model exists anywhere (D75). Marquee is armed for **non-touch** pointers only, because a touch empty-canvas drag must pan (the shipped F1 rule). |
| **On-glass selection handles:** 28 px visual / 72 px hit under touch, the 56 px proximity halo, the 0 px-overlap invariant when a selection is ≤ 96 px wide. | PENDING — the geometry and hit radii are pure-tested; the fingertip walk is deferred. |
| **Touch palm + selection gauntlet**, and the 2.0 timing gates (450 ms settle, 600 ms long-press, the 56 px polygon close ring). | PENDING — see **C10** and `H8`. |

### Slice 1.6 — Layers panel (mounted in the 1.6 wiring closure; D75/D76)
| Gate | Result |
|---|---|
| **320 px flyout / 56 px row / 48 px eye-lock-menu targets at DPR 2**, portrait and landscape, with a fingertip; the flyout slide-in. | PENDING — CSS-declared only; jsdom has no layout and the lane correctly declined to assert the CSS text as a measurement. |
| **400 ms long-press feel:** tap-select vs row-menu vs grip-drag must be reliably distinguishable; confirm the 8 px drift-cancel is not twitchy. | PENDING — the split (grip = drag, row body = menu) resolves UI §8.6's self-contradiction (D73). |
| **Name truncation at 320 px:** icon + eye + lock + menu ≈ 144 px, so confirm a truncated name is still identifiable, and decide whether a tooltip is needed. | PENDING. |
| **Row menu opens under the finger without clipping at the viewport bottom** (flip-up when headroom < 160 px). | PENDING — the flip is CSS/unverified in jsdom. |
| **Cross-band refusal alert legibility in sunlight.** | PENDING — machine half green: the shell raises `editor.highlighterBandMessage` when a drop's target is in the other §20.2 band (the Ink group spans both bands); asserted in `tests/layersReorder.browser.test.ts`. |
| **Drag-to-reorder with a fingertip** — the grip drag must land the row where it was dropped inside its own group, and must not lift it over another group. | PENDING — ⚠ **the machine half does NOT cover the real input (D77/F1).** Under **real touch**, Chromium **implicitly captures** the pointer to the grip (the `pointerdown` target), so every later event targets the grip and the rows' `pointerover` **never fires**; `dropKey` stays `null`, `resolveDrop` returns `missing`, and the drop is a **silent no-op**. The existing tests pass only because synthetic `PointerEvent`s cannot reproduce implicit capture. Proven by execution with real CDP touch input (`Input.dispatchTouchEvent`); mouse/pen are unaffected. Fix + real-input regression test owed. |
| **Cross-band refusal alert legibility in sunlight.** | PENDING — machine half: the shell raises `editor.highlighterBandMessage` when a drop's target is in the other §20.2 band (the Ink group spans both bands); asserted in `tests/layersReorder.browser.test.ts`. ⚠ Same caveat as the row above: under real touch the drop target never resolves (D77/F1), so the *reachability* of this alert on glass is unproven until F1 is fixed. |
| **Eye + lock toggles are undoable, and the eye survives a reload** (`Annotation.visible`). | PENDING — machine half green: `tests/layersWire.browser.test.ts` proves one undo step per toggle and that a hidden object reloads hidden. |
| **Erase 600 ms long-press preview** on glass: the `--err` outline appears and nothing is deleted; a short tap deletes and toasts. | PENDING — machine half green (same file): the preview timer arms on pointerdown and is cancelled by move/lift/cancel. |
| **Mini-toolbar pin** (64 px) after the 600 ms long-press, clear of the selection. | PENDING — machine half green; the toolbar is a DOM overlay in the existing `.placement-hud` slot (a computed anchor would need an inline `style`, which the CSP forbids — D75). |
### Slice 1.7 — Insets
| Gate | Result |
|---|---|
| **Child round-trip:** inset → child dimension → scale ×2 + move crop + rotate 30° → save → reload → the child lands at the same **visual** point on the photo content. | PENDING (on-glass half) — machine half **green through the real editor** in `tests/insetWire.browser.test.ts` (the child's stored asset px is unchanged and its wrapper sits at exactly `−crop` after the transforms and a remount). |
| Crop-window move: children stay glued to the photo content (they do not slide with the window). | PENDING — machine half green: the `(600,0,1200,900)` trace and the shared `-crop` offset are asserted in `tests/insetGeometry.test.ts` / `insetScene.browser.test.ts`. |
| Two insets from one asset have **independent** children; the same image twice writes **one** `assets/<sha256hex>.jpg`. | PENDING — machine half green (`insetAssets.test.ts`, `insetWire.browser.test.ts`). |
| Focus: draw inside clips; outside markup renders above all insets; **`Esc` follows the §4.2 ladder** (pending → deselect → exit Focus → navigate). | PENDING — machine half green; the ladder order is pinned by `tests/editorShell.test.tsx` (unit) and `tests/insetWire.browser.test.ts` (real `EditorLayout`). |
| Replace photo with different dimensions → the warned dialog; markup preserved or removed **only by explicit choice**. | PENDING — machine half green: silent swap on identical dims; warn + Keep preserves children; a short press on Remove does nothing and a 700 ms hold clears them. |
| Focus is announced; the breadcrumb is a real control; **48 px targets, 16 px hit slop**; no inline `style=""`. | PENDING — machine half green (live region carries the breadcrumb; the breadcrumb path is a `<button>`; CSP-as-a-test green). The on-glass target walk is deferred. |
| **A real touch drag of the Layers grip reorders the row** (D77/F1). | ⚠ **DEFERRED — `fixme`, never a pass.** Root cause executed in session 13 (**D81**): a page that LOADS with an **OPFS** `FileSystemDirectoryHandle` stored under `fm:projects-root` **kills the renderer** in this Chromium build, so the e2e can never complete first-run — and the session-12 story ("`disabled={busy}` never clears") is **withdrawn** (the step-2 buttons are verifiably enabled). **NEW evidence (D86):** reviewing the *running* built app, a **real** directory handle (auto-granted by `showDirectoryPicker`) was persisted under that key and the page **reloaded into Home normally** — no renderer death, 11 cards. The death therefore looks **OPFS-specific**, and the product is **no longer presumed defective**. **Hardware check, narrowed — run it:** pick a *user-picked* folder in first-run, then reload: does Home come back? F1's real-touch proof stays **OWED** (a CDP-touch browser-project attempt reached a real touch but failed its assertion and was deleted). |
### Slice 1.8 — Style system
| Gate | Result |
|---|---|
| **`[Surface]`** Swap tools + restyle in < 2 s without losing flow (per-tool memory returns the last style). | PENDING — machine half green: `tests/styleByTool.test.ts` proves a tool swap is a **return, never a reset**, and `tests/styleIntegration.test.tsx` proves the mounted panel is driven by the live per-tool style. The timed on-glass flow is deferred. |
### Slice 1.9 — Export
### Slice 1.10 — Safety & polish
| Gate | Result |
|---|---|
| **(1.10, session 22) A real touch long-press reorders the sheets.** Press a card ~400 ms, drag it across the grid, release. The card lifts, the indices renumber live, the «Drop to move» chip follows the finger, and a reload shows the new order. Then: a *short* tap still opens the sheet (never a stray lift), a drag never opens it, and the grid still scrolls when no lift is armed. **The two things only hardware can settle:** Chromium implicitly captures the pointer to the pressed card (so the drop must stay geometric — D77/F1 proves hover events do not fire), and the spec reads `touch-action` when the pointer is created, so a `touch-action` set mid-gesture may not stop a scroll takeover. Record both. | PENDING — machine half green: `tests/sheetReorder.test.ts` (16 pure cases over a real 4-across grid) and the component tests drive a real pointer sequence against stubbed rects; jsdom has no layout and no `PointerEvent`. |
| **(1.10, session 22) The replace-photo flow on a real filesystem.** (a) Same-dimension photo → a silent swap, markup kept, card thumbnail replaced by the honest placeholder. (b) Different dimensions → the warned dialog; `Keep markup` keeps the coordinates, `Remove markup` (600 ms hold) clears them, `Cancel` changes nothing. (c) Lock `thumb.jpg` (or `project.json`) in another app and replace again: the sheet must be **exactly as it was** — the same photo, the same dimensions, the same markup — with an honest failure line. | PENDING — machine half green: `tests/sheetOps.test.ts` covers the ordering, the verification, the rollback and the abort; the real `move()`/NTFS/AV-lock behaviour is the OS's. |
| **(1.10, session 22) The storage chip agrees with Explorer.** The chip's `{size}` includes `.history/` and `.trash/` (it reports what the project occupies); compare it against the folder's size in Explorer and the `{time}` against `project.json`'s modified time. A project with no `project.json` save yet must show **no chip** (never a fabricated size or time). | PENDING — machine half green: `tests/projectSize.test.ts` (12 cases) + `tests/storageChip.test.tsx` (5). |
| **(1.10, session 22) Rename and duplicate on a real disk.** Rename a card inline (Enter commits, Escape/blur cancels) and confirm the **folder is not renamed** and the card's meta line does not claim a content change. Duplicate a sheet: the copy carries `photo.jpg`, `thumb.jpg` and `markup.json` byte-for-byte, appears last, is titled with the next `Sheet NN`, and shows the placeholder until its first save. | PENDING — machine half green: `tests/sheetOps.test.ts` (25 cases) + `tests/projectScreen.test.tsx`. |
| **(1.10, session 22 review) The card menu is fully reachable on the bottom row.** Open a card's `⋯` on the last row of a long grid at 1440×960 and at 960×1440 and confirm every item — «Delete» last — is visible and tappable. The direction is decided from the card's real viewport rect and the list has a `max-height`/`overflow-y` backstop; what a device adds is the real popup height against the real viewport (the UI review measured 102 px of 364 visible before the fix, in Chromium, not on glass). | PENDING — machine half green: the direction arithmetic is unit-tested (inclusive threshold at exactly 364 px) and `tests/gridReorder.browser.test.ts` asserts real layout. |
| **(1.10, session 22 review) The destructive hold reads as a hold on glass.** Press and hold «Remove markup» for the full 600 ms: the `--err` track must fill left→right and the action fire at the end, not before. A tap that flashes and does nothing is the defect the UI review measured. | PENDING — machine half green: `tests/projectScreen.test.tsx` pins nothing before 599 ms and the fire at 600 ms, and `data-holding` drives the fill; the perceived timing is a device check. |
| **(1.10, session 22 review) Drag autoscroll — OWED BEHAVIOUR, not a device gate.** With ~20 sheets, long-press a card and drag it past the visible area: today it does **not** scroll, so reaching the last row needs a second lift. Record the effort; this is the input to the autoscroll decision (D118). | PENDING — measured in the review: 16 items → 1248 px of grid at 1440 and 2452 px at 960 (portrait) against 894/1374 px of visible body. |
| **(1.10, session 22 review) The pre-lift slop under a resting finger.** The lift cancels on >8 px of travel before the 400 ms mark (the Layers grip's slop). On glass, does a deliberate hold survive a finger that drifts 9–15 px — and does a slow scroll start accidentally lifting a card? One of the two fails at any slop value, so this row is what picks it. | PENDING — `[Surface]`; the number is a feel decision that cannot be measured in jsdom (no layout, no real touch). |
| **(owner-reported, D119) Capture → «Use photo» on real hardware, and the failure line if it fails.** Run the beta path (new project → camera → shutter → «Use photo») on the target device and record: does the sheet write, and if the overlay appears, **which line it shows**. The four mapped causes have four different remedies (re-grant the folder, wait out a locked file, free space, or a browser without `FileSystemFileHandle.move()` — the `unknown` arm — which would mean no atomic write is possible at all). This row exists because the reported dead end could not be diagnosed from a screenshot: the old overlay said nothing. | PENDING — machine half green: `tests/cameraFlow.test.tsx` pins each failure kind's message, the «Re-authorize» recovery, and that «Retry» really files the photo once the folder is resolvable (a test that cannot pass against the pre-fix code). |
| **(D121) A save works with a SHEET OPEN, and two tabs arbitrate.** On the target device: (a) open a sheet, add a photo from inside the editor, and confirm the sheet write **and** the editor's autosave both reach «Saved» (before D121 every write for an open project queued forever behind the session writer lease); (b) open the same project in a **second tab** and confirm it comes up read-only with the «Open in another tab» affordance; (c) with a save deliberately stuck, confirm the first tab still reports it (the 30 s bounded wait) rather than spinning invisibly. | PENDING — machine half green: `tests/writerLease.browser.test.ts` (real Web Locks + real OPFS, no mocks) pins the lease/mutex separation and records that Chromium grants a same-client `ifAvailable` re-request, so the exclusion is cross-tab; the real two-tab case is a browser/hardware check. |

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
| H13 | **Barrel-button routing (pen-only):** confirm the pen barrel button arrives as `button === 2`, `buttons === 2`, and is not stolen by a Windows/Edge right-click or long-press gesture. The radial quick-menu is barrel-gated (`P §2.4:226`); if the button cannot be read, keep the documented degrade path (radial absent rather than broken) and reach the menu from the rail only. | PENDING — **emulated half green after D128:** the clickthru's step 17 (real CDP pen input, `buttons: 2`, freehand active) used to **draw** (`objects 2 → 3`); the router now treats any non-tip pen contact as `'ignore'` and the editor registers no contact, so a barrel press creates **no object, no ink and no pan**, with three router tests that fail against the pre-fix code. **Still `[Surface]`:** whether the real digitiser reports the barrel as `button === 2` (and the eraser end as `5`) at all, and that Windows/Edge does not steal the press as a right-click. |
| H14 | **Pen hover semantics (pen-only):** confirm `pointerType === 'pen'` with `buttons === 0` fires `pointerover`/`pointermove` in range and that hover never triggers an action. Touch has no hover, so every hover affordance needs the touch equivalent in `TF §6.3` — verify both. | |
| H15 | **OS pinch/zoom delay on inking surfaces:** Windows adds ~250 ms to pinch/zoom on inking surfaces (`HKLM\SOFTWARE\Microsoft\Palm\DelayManipulationDuration`; `gui-ux…` §7.1). Time a two-finger pinch on the canvas and record the perceived delay. Do **not** misdiagnose it as an app bug and do not attempt to optimise it away app-side; document the measured value. | |
| H16 | **Real coalescing rate:** on a fast stroke, record `getCoalescedEvents().length` per `pointermove` and the real event rate (`pointerrawupdate` if used). The spike gate expects coalesced length > 1 on a fast stroke; record whether fingers and the pen differ. | |
| H17 | **Ink API availability:** confirm whether the Ink API (`navigator.ink`) is present and usable on the **target Edge build**. It is a latency lever for the `U §14.13` ≤16 ms budget (`gui-ux…` §7.1) but must not be assumed; record present/absent and fall back to the Canvas path if absent. | |
| H18 | **DPR-2 / thermal with a 4096px photo:** pan a 4096-px-long-edge sheet at `devicePixelRatio = 2` for 5 minutes and record sustained FPS, any frame > 100 ms, and whether the tablet throttles (thermal) over the run. The 0.2 spike's ≥50 FPS sustained gate applies (`gui-ux…` §8.1 gate 9). | |
| H19 | **(1.9) Damaged photo exports as a white page, end to end:** corrupt a sheet's `photo.jpg` (truncate it to 0 bytes), then export the project. The sheet must appear as its markup on a **white page at the sheet's stored dimensions**, must NOT be skipped, must not abort the run, and the result view must count it in «N sheets exported without their photo». The markup **is** the measurement record. Module-level behaviour is proven (`tests/renderStage.browser.test.ts`); this is the end-to-end half. | |
| H20 | **(1.9) NTFS conflict policy is case-insensitive:** export into a folder already containing `Sheet.pdf`, then export `sheet.pdf` under the **Add** policy. The existing file must NOT be overwritten — on NTFS those are one file but two different JS strings. `conflictName` folds case and normalises Unicode on both sides; this verifies it against a real filesystem. | |
| H21 | **(1.9) C6 — the export memory ceiling on the target device.** Export a 4096×4096 sheet at 3× and confirm it is **refused with the device message**, not attempted. Then find the real ceiling on a Surface Go and record the number. `EXPORT_BITMAP_LIMIT_BYTES` is 512 MB with the arithmetic pinned (D96), but that is a **dev-machine** figure and decides nothing — this row is what sets it. Record in DECISIONS + CHECKPOINTS + the BUILD-LOG `Checkpoints fired:` field. | |
| H22 | **(1.9) Export wizard, touch + a11y walk:** the whole Scope→Format→Destination→Result flow with a finger and with gloves; 48 px minimum targets and 16 px slop; every step announced; the result path selectable as text. jsdom has no layout (D40), so every CSS-declared target in `exportWizard.css` is unmeasured until this row runs. | |

| H23 | **(D135) Camera maximum resolution:** open the capture screen, take a photo, and open `photo.jpg`'s properties. Confirm the pixel size equals the largest still mode the Surface camera app offers (capped at 4096 px on the long edge by `normalizeImage`), that the framing matches the preview, and that a sheet made with `Import` of a larger photo still works. Note the camera model and both numbers. | |
| H24 | **(D135) Zoom on the real camera:** tap 1×, 2× (and 0.5× only if a chip appears). Confirm the preview zooms, the photo taken at 2× shows exactly the zoomed framing, the pressed chip matches what is on screen, and that no chip is greyed out. Record whether the camera reported a hardware zoom range (digital crop = no). | |
| H25 | **(D135) Watermark clearance and the date stamp:** with the Watermark setting on, check the bottom-right mark on Home, Settings, the sheets grid, the editor and the camera on the real tablet — visible, never blocking a touch, zoom chips clear of it. Export a PDF and a PNG: the date/time stamp sits right-aligned directly above the logo, is legible on a dark and a light photo, and turning the Watermark setting off removes both. | |
| H26 | **(D136) The folder survives a relaunch and a capture:** choose the projects folder, take 3 photos into a project, close the app completely and relaunch. Home must list the projects or show «Folder permission expired» — never «No projects yet». Tap «Re-authorize»: note whether the browser offers "Allow on every visit"; pick it, relaunch again, and confirm no prompt and no trip to Settings. Then, in a project right after a relaunch, take a photo: «Use photo» must save on the first tap (at most one browser prompt). Finally, at a «Re-pick folder» prompt, pick the PROJECT folder: it must be refused and Home must still list the original folder. Note the browser and version. | |
