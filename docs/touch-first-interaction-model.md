# FieldMeasure — Touch-First Interaction Model

**Status:** design proposal (2026-09-21). **Not canonical.** Requires build-spec / UI-spec edits plus
`DECISIONS.md` entries before it is binding (see §9).
**Derived from:** `docs/ui-spec-field-measure-v2-hardened.md`, `docs/preflight-handoff-v0.3-hardened.md`,
the touch-primacy audit, and the product decisions F1/F2 recorded in
`docs/gui-ux-readiness-and-design-handoff.md` §13.3.
**Scope:** adds a **gesture grammar, feedback layer, and state machine**. It does not move the rail,
restyle the style panel, or change any Site Slate token.

All measurements are CSS px on the 1440×960 @200% design canvas. Physical reference: 1 CSS px =
0.1904 mm, so 8px ≈ 1.5 mm, 44px ≈ 8.4 mm, 56px ≈ 10.7 mm.

---

## 0. Thesis

> **Touch taps and moves. Pen draws. Both create geometry.**
> A tap is a *point*. A drag is a *point pair*. Freehand ink stays pen-first and is opt-in for fingers.

Under touch-primary the router's job inverts: the **tap becomes the primary verb**. This reuses three
things the spec already sanctions — **polygon's tap-by-tap placement** (`U §8.3`), **tap-select /
drag-body** (`U §8.6`), and the **loupe + snapping** (`U §8.1`).

**Fork answers (F1/F2, resolved 2026-09-21):** replace the single "Finger draws" toggle with two:
`«Touch places and moves»` (**ON** by default) and `«Finger draws (freehand)»` (**OFF** by default);
the pen always draws regardless. Tap-tap applies to every **placement** tool — Dimension, Angle, Line,
Arrow, Rectangle, Ellipse, Polygon, Image inset, Text. It does not apply to Freehand/Highlighter
strokes, except that Highlighter gains a straight-line tap-tap mode (§4.3).

---

## 1. Tap-tap placement

### 1.1 One machine, per-tool config

Do **not** build seven state machines. Build one `PlacementController` driven by a descriptor:

```ts
interface PlacementSpec {
  tool: ToolId;
  taps: number | 'open';        // 2 | 3 | 'open' (polygon)
  closable: boolean;
  rubberBand: 'segment' | 'box' | 'none';
  valueSheet: 'dimension' | 'angle' | null;   // null ⇒ commit on final tap
  chainable: boolean;
}
```

| Tool | Taps | Rubber band | Value sheet | Commit |
|---|---|---|---|---|
| Dimension | 2 | segment | Dimension keypad | after value |
| Angle | 3 (vertex, ray1, ray2) | segment ×2 | Angle sheet | after value |
| Line | 2 | segment | — | on tap 2 |
| Arrow / Leader | 2 | segment | — | on tap 2 |
| Rectangle | 2 | box | — | on tap 2 |
| Ellipse | 2 | box | — | on tap 2 |
| Polygon | `open` | segment + close | — | on close / ✓ |
| Image inset | 1 | crosshair | — (opens picker) | on tap 1 |
| Text | 1 | none | — (opens caret) | on tap 1 |

**The tap/drag unification (what lets one machine serve pen and finger):**
`pointerdown` → `placeAnchor(A)`; `pointermove` in contact → update `provisionalB`; `pointerup` →
`placeAnchor(B)`. A **pen drag** is "A on down, B on up, with a live provisional." A **finger tap** is
the same machine with the provisional never moving. **No second code path for touch.**

### 1.2 States (Dimension shown)

```
                 select tool / chain / after commit
        ┌────────────────────────────────────────────────┐
        ▼                                                │
     ┌──────┐  tap        ┌──────────┐  tap   ┌──────────┐│
     │ Idle │────────────▶│ AnchorA  │───────▶│ AnchorB  ││  auto-open fires
     └──────┘   (place A) └──────────┘(place B)└────┬─────┘│  after 450 ms
        ▲   ▲                  │  ▲                 │      │
        │   │  ✕ / Esc /       │  │ grab anchor     │      ▼
        │   │  tap≈A / 2-finger│  │ ▶RefineEndpoint │  ┌──────────┐
        │   └──────────────────┘  └─────────────────┘  │ KeypadO. │
        │                                               └────┬─────┘
        │                          ✕ / Esc / outside tap     │ ✓ value
        └───────────────────────────────────────────◀───────┘
                                     ┌──────────┐
                                     │ Valueless│  ◀── cancel from KeypadO.
                                     │ (ghost)  │      or from AnchorB (keeps line)
                                     └──────────┘
```

| State | What the user sees | Rail/style | Canvas input allowed |
|---|---|---|---|
| **Idle** | Style Chip: `«Dimension · ft-in · 1/8»`; one-time hint `«Tap the first point»` | live | all |
| **AnchorA** | Cyan anchor pin at A (44px ring → 12px), `1` index chip, loupe frozen on A, ghost rubber-band, hint `«Tap the second point»` | live (tool switch cancels) | tap=place B · drag=pan · drag near A=refine A · 2-finger=cancel |
| **AnchorB** (settle 0–450 ms) | Geometry solid; tug handles on both anchors; `<PlacementHud>` (✕ · Adjust endpoints · ✓ Value) | live | any contact cancels auto-open and enters refine; pan/zoom live |
| **RefineEndpoint** | Anchor grabbed; loupe tracks it; snap nodes light up | live | refine only (other touches ignored 150 ms) |
| **KeypadOpen** | 360px sheet, 180 ms slide; canvas dims 25%; rail+style dim 40%, **non-interactive** | **dead** | **pan + pinch only**; taps neither place nor select |
| **Valueless** | Kept geometry + `«tap to enter value»` ghost label | live | full |
| **Chained** | = AnchorA with A pre-locked at the previous B (`⛓`) | live | as AnchorA |

### 1.3 Tap A — exact feedback (zero delay; touch has no hover)

On `pointerdown` with Dimension: (1) **loupe appears in the same frame** (≤16 ms, §2.1);
(2) **anchor pin** — a 44px `--sel` ring **collapsing to 12px over 90 ms**, then static with a 2px
`--sel` ring and a 56px invisible hit — this collapse *is* the "your tap registered" signal;
(3) a **dashed 1px `--sel` leader** from anchor to loupe centre; (4) a `1` index chip 20px right of the
pin; (5) hint chip `«Tap the second point»` (`--g900` @92%, 56px pill, offset 112px, dismisses on next
contact).

### 1.4 Tap B and the ordering decision

**Decision:** tap B commits geometry immediately, then a **450 ms settle window** opens during which
the `✓ Value` / `Adjust endpoints` HUD is live; the keypad **auto-opens only if no contact occurred**
during that window.

| Order | Verdict |
|---|---|
| A. Keypad opens instantly on tap B | **rejected** — a modal-ish sheet covers the canvas before the user has looked at where B landed; wrong moment to take the photo away |
| B. Explicit placement-confirm step, then keypad | **rejected** — costs a tap and a decision on *every* dimension; breaks the 4-second target (`U §8.1`) |
| C. Commit → 450 ms settle → auto-open, cancelled by contact | **chosen** — zero extra taps when confident, full correction window when not |

**Exact rule (testable):** on the second anchor, `settleTimer = setTimeout(openKeypad, 450)`. **Any
`pointerdown` on the canvas before it fires clears the timer permanently for this placement.** If the
contact was within 40px of an anchor → `RefineEndpoint`; otherwise → pan. Refining does **not** re-arm;
the keypad then opens only via the explicit `✓ Value`.

**Why 450 ms:** longer than any plausible finger-linger after a lift (so natural tap-tap rhythm never
trips it), and it matches the existing 400 ms hold-to-shape and 400 ms autosave-coalesce windows.

**The geometry is committed at tap B regardless of what follows** — cancelling the keypad keeps the
line (`U §8.1`, unchanged). The **value** is provisional, never the stroke.

### 1.5 Cancel paths (Dimension)

| # | Trigger | Effect |
|---|---|---|
| 1 | `✕` at AnchorA | Discard A → Idle (120 ms pin fade) |
| 2 | `✕` at AnchorB / in keypad | Keep geometry → **Valueless** (never discard the stroke) |
| 3 | `Esc` | Same as ✕ for current state; when idle, navigates back |
| 4 | Tap within 44px of A while AnchorA | Degenerate-segment guard → cancel, silent |
| 5 | Two-finger tap while AnchorA/B | Cancel (add-to-selection is meaningless mid-placement) |
| 6 | Tool change on the rail | AnchorA → discard; AnchorB → Valueless |
| 7 | Open any overlay | Cancel pending; AnchorB kept as Valueless |
| 8 | `pointercancel` (palm, OS edge gesture, blur) | **Discard entirely** — B was never chosen |
| 9 | Pen `pointerdown` mid-placement | Hand off to pen: discard touch pending, pen starts fresh A |

There is **no idle timeout** — a pending placement waits indefinitely. After 30 s of no contact the
hint chip re-appears.

### 1.6 Other tools

- **Angle (3 taps):** vertex → ray-1 tip → ray-2 tip; arc renders live from tap 1; after tap 3 the Angle
  sheet opens on the same settle rule; tap within 44px of the vertex cancels.
- **Line / Arrow (2 taps):** as Dimension minus the keypad; the new object is left **selected**.
- **Rectangle / Ellipse (2 taps):** corner-to-corner or centre-out per the existing setting.
- **Polygon:** already tap-by-tap — raise nodes to a 56px hit, grow the close target to a 56px `--sel`
  ring at 32px proximity, add a `✓ Done` HUD button (the discoverable equivalent of `Enter`) and
  `«Undo point»` (replacing `Backspace`).
- **Image inset / Text:** single tap opens the picker / caret, unchanged except hit slop.

---

## 2. Accuracy safeguards

Five layers, applied in order.

### 2.1 Loupe on a *tap* — yes, but a different loupe

The tap-vs-drag decision isn't known until `pointerup`, and finger occlusion (~44–56px of contact plus
the hand) is strictly worse than a pen tip. The loupe is the only channel that says *where the point
actually is*. It cannot be the pen loupe unchanged:

| Property | Pen loupe (`U §8.1`) | **Touch loupe (new)** |
|---|---|---|
| Diameter | 160px | **200px** |
| Magnification | 3.5× — source `160 / 3.5` ≈ 45.7px | **4×** — source `200 / 4` = **50px** (marginally more context, and higher magnification) |
| Offset from contact | 112px | **136px** (must clear the finger and its contact disc) |
| Direction | up-and-away from the pen hand | up-and-away from the **handedness side**, flipped away from the nearest corner |
| Extra mark | 12px crosshair gap | 12px gap **+ a 44px translucent contact disc** showing the finger's true footprint, so the user learns their own bias |
| Leader | none | **1px dashed `--sel` leader** to the anchor |
| Timing | instant on `pointerdown` | instant, **full opacity, no fade** (may only be visible 200 ms on a fast tap) |
| Suppressible | Off/112/160/200 | add `«Magnifier when you tap»` (default ON) |
| After lift | tracks the moving tip | **freezes on the last anchor for 700 ms**, then fades to 40% |

**Kept:** never a hit target, edge-aware (24px from any edge), never under the hand or the point, never
animated.

### 2.2 Snapping, retuned for fingers

Existing: snap within 20 screen px. Finger contact centroids carry ~±4–8 mm of error, so acquire
earlier, lock at the pen value:

- **Acquire radius 32px** (ring grows, 2px `--sel`) → **Lock radius 20px** (node fills, crosshair locks, tick).
- Priority: existing endpoints → polygon vertices → object bbox corners → dimension label anchors →
  **edge midpoints** (new; cheap and very useful at openings) → 0°/45°/90° axis guidance (ghost ray +
  `«90°»` chip).
- **Snap strength default = Strong** under touch (pen stays Normal).
- Snapping evaluates **on the down position** (so a pure tap snaps even without movement) and
  continuously during refine.

### 2.3 Confirm + nudge without covering the point

**(a) Offset Nudge Pad (the main answer).** In `RefineEndpoint`, a **120px** circular pad floats
**96px away** from the anchor (same edge-aware quadrant logic as the loupe). The finger drags *in the
pad*, not on the point; the anchor moves at **0.35×** in the inner 60px core and **1.0×** in the outer
band, while the loupe shows the anchor at 4×. This yields fine adjustment with the finger nowhere near
the point. Rendered as `--g900`@92% with a 2px `rgba(255,255,255,.14)` border and a chevron showing
the drag vector.

**(b) Direct tug handles.** Both anchors carry a **28px visual / 72px hit** tug handle, offset 24px
perpendicular to the segment, away from the label. Coarse; the pad refines.

### 2.4 Post-place refinement
Anchors are permanently grabbable whenever the object is selected (via `Edit points`, or immediately
after placement). With the dimension selected, `pointerdown` within 40px of an anchor →
`RefineEndpoint`. No mode change needed.

### 2.5 "Adjust endpoints" edit mode
Entered from the mini-toolbar (`Edit points`) or the placement HUD. Both anchors become persistent 28px
tug rings; the label gets a 1px `--sel` inner hairline; a top-centre chip `«Adjusting dimension»` with
a 56px `✓ Done` (same pattern as the inset Focus breadcrumb). Snapping is Strong; the Nudge Pad is
available for the last-touched anchor. `Done`/`Esc` exits; the value is unchanged.

### 2.6 Touch contact reading
- **Place at `pointerdown`, not `pointerup`** — finger roll on lift is a real offset source.
- **8px deadband for the first 120 ms** to ignore touchdown jitter.
- Prefer `getCoalescedEvents()`; use the contact centroid to reduce edge bias.
- Keyboard nudge (arrow 1px / Shift 10px) remains the accessibility escape hatch.

---

## 3. One-finger drag disambiguation

### 3.1 The rule (testable predicate)

> A one-finger drag **moves an object** iff the `pointerdown` hit-tests a grabbable object, the active
> tool is not Erase, no placement is pending, and the object is not locked. Otherwise it **pans**.
> A **second finger always wins**: it cancels the object drag (restoring the object) and starts
> pan/zoom. A one-finger contact that lifts within 8px of travel is a **tap**, never a drag.

```ts
const TAP_SLOP = 8, TAP_MAX_MS = 400, LONG_PRESS_MS = 600, REFINE_RADIUS = 40;
function hitSlopFor(obj) { return obj.isThinStroke ? 24 : 16; }   // px (was 8/12 for pen)

type DragTarget = 'object' | 'anchor' | 'pan';

function classifyDown(p, ctx): DragTarget {
  if (ctx.overlayOpen) return 'overlay';
  if (ctx.pendingPlacement) {
    if (ctx.nearestAnchorDistance(p) <= REFINE_RADIUS) return 'anchor';
    return 'pan';
  }
  const h = hitTest(p, hitSlopFor(ctx.objectAt(p)));
  if (ctx.activeTool !== 'erase' && h && !h.locked) return 'object';
  return 'pan';
}

function resolve(down, up, maxDrift) {
  if (maxDrift <= TAP_SLOP && up.t - down.t <= TAP_MAX_MS) return 'tap';
  if (maxDrift <= TAP_SLOP && up.t - down.t >= LONG_PRESS_MS) return 'long-press';
  return 'drag';
}
```

**Why object-first, not pan-first:** touch-primary users reach for what they can see. "I touched the
dimension, so I move the dimension" needs no teaching. The escape hatches are guaranteed: two-finger
drag always pans, and the **Pan tool overrides object-first unconditionally**.

**Adding a second finger mid-drag:** cancel the drag and **restore the pre-drag position**, then pan.
The snap-back is deliberate feedback; never silently commit at the current position.

### 3.2 Tap precedence

1. Overlay open → the overlay gets it.
2. **Placement pending → the tap places a point** (this is what makes tap-tap safe).
3. Tap on an **already-selected** object → the tool's action (place / Focus / edit text / open value).
4. Tap on an **unselected** object → **select it** (replace; two-finger tap adds).
5. Tap on empty canvas → the tool's action, or deselect with Select/Pan.
6. Double-tap → §5.

Rule 3 mirrors the inset's own precedent (`U §9`: first tap selects, second tap Focuses). **A stray tap
while a creation tool is armed selects rather than places** — the safe failure: no geometry created.

### 3.3 Selection, handles, mini-toolbar under touch
- Selection box unchanged (2px `--sel` + 4px glow).
- **Handles enlarged:** visual 8×24 → **28px**; hit 56 → **72px**; rotate handle offset 40 → **48px**
  above the top edge with a 72px hit. Keep the **0px-overlap invariant**; at 96px-wide selections
  suppress edge handles and show corners only.
- **Axis lock while resizing:** after 8px of movement, within 20° of the handle's natural axis → lock.
- **Mini-toolbar:** 56 → **64px tall** under touch; buttons 56px; anchored **16px** above the selection;
  flips below when headroom < 160px. `Edit points` promoted to first position for measurement objects.
- **Long-press an object (600 ms)** → select + pin the mini-toolbar (touch's right-click). 3px `--sel`
  ring fills from 400 ms.
- **Locked objects:** shake + `«Locked — unlock in Layers»`, unchanged — a genuinely useful touch safety net.

---

## 4. Eraser, freehand, highlighter

### 4.1 Erase
- **Object mode works well with touch.** No hover → replace the pen's hover-preview with **tap-to-delete
  + undo toast** naming the object (`«Undid: Delete dimension 12' 6"»`). Delete immediately (a delay
  reads as lag). For a pre-commit signal, long-press (600 ms) reveals the `--err` outline + name chip
  *without* deleting.
- **Stroke mode is pen-only.** Segment-wise scissoring needs pen precision. Under touch, hide stroke
  mode and show `«Splitting a stroke needs the pen. Touch can delete the whole stroke.»`
- **Touch eraser for ink:** tap-to-delete-whole-stroke. Coarse but honest.
- Scope chips and the `Everything` hold-to-confirm are unchanged.

### 4.2 Freehand
- Allowed by finger but **pen-first by default**, behind `«Finger draws (freehand)»` (OFF).
- When on: pressure→width **off**, width floor **8 mu**, smoothing raised to **60**, thinning 0. Say it
  once: `«Freehand is most precise with the pen.»`
- Perfect-shape hold becomes **600 ms / 16px** under touch (finger jitter defeats 400 ms / 8px).

### 4.3 Highlighter — the one stroke tool that *gains* from touch
Highlighter is fat, translucent, forgiving, and already has a `«Straight line»` lock (`U §8.4`).
Under touch, **`«Straight line»` defaults ON**, turning it into a **tap-tap tool** (A, B → a straight
24px chisel bar) reusing the placement machine verbatim. Freehand highlight stays available via
long-press. Chisel width default **24** for touch. Multiply blend, 30% alpha and auto z-below unchanged.

### 4.4 Pen-required list (the app should state these)
1. Segment-wise stroke erase. 2. Pressure/tilt-expressive freehand. 3. The finest endpoint placement
(sub-3mm) — typing the value hides the error, but the **drawn arrowhead lands where the finger landed**.

---

## 5. Gesture vocabulary budget

| Gesture | Touch-primary job | Existing | Conflict & resolution |
|---|---|---|---|
| **Single tap** | Place a point / select / act | same | §3.2 precedence |
| **Double tap** | Empty canvas = fit↔100%. On an object = its edit action (Text re-edit, inset Focus, dimension value) | fit↔100% only | Split by hit-test on the **first** tap; 300 ms window, 24px slop; never fires if the first tap placed an anchor |
| **Long-press 600 ms** | Rail/style = options popover (unchanged). Canvas object = select + pin mini-toolbar | tool options popover | No conflict — canvas long-press was free |
| **Two-finger tap** | Add to selection, **unless** a placement is pending or the keypad is open → **cancel** | add to selection | Mid-placement/keypad, add-to-selection is meaningless, so cancel is the sane reuse |
| **One-finger drag** | Move the object under the finger; else pan; near a pending anchor → refine | pan only | §3.1 predicate; Pan tool overrides |
| **Two-finger drag** | Pan + pinch-zoom, always, in every state | pan+zoom | unchanged — never repurpose the safety gesture |

### 5.1 Keypad-open state
Keep the rail/style at 40% and non-interactive while typing (`U §8.1`). **Change one thing:** the canvas
stays live for **pan and pinch-zoom only** (the sheet leaves it visible so the user can check the
dimension landed). Taps while the keypad is open do **nothing** — no place, no select. `Esc` and the
sheet's `✕` keep the geometry; a canvas tap no longer also cancels, removing the double meaning.

### 5.2 Gestures deliberately not spent
No three-finger gesture (undo already lives on a 56px rail button). No edge swipes (Windows shell
gestures; the rail/style panel already inset the canvas). No rotate gesture beyond the existing
two-finger pinch-on-inset.

---

## 6. Feedback and latency

### 6.1 What confirms a tap
An anchor is **not ink** — it is UI confirmation, and taps must be legible. Two-part signal, ≤90 ms:
(1) **loupe at `pointerdown`, same frame** (≤16 ms) — strongest proof the touch landed;
(2) **anchor pin collapse** 44px → 12px over **90 ms**, below the 100 ms "tool swap feedback" ceiling
in `U §14.13`, so it reads as instant rather than decorative.

**No haptics:** Surface tablets have no haptic actuator, and Slim Pen 2 haptics are not drivable from
the web with confidence. Audio stays off by default. **Touch confirmation is visual-only** — state this
so nobody plans around a buzz that cannot happen.

### 6.2 Latency budget (touch)

| Moment | Budget |
|---|---|
| `pointerdown` → loupe + anchor visible | **≤16 ms** (1 frame) |
| `pointerdown` → snap resolution visible | ≤1 frame after the point is known |
| `pointerup` → anchor finalised / object committed | ≤32 ms (2 frames) |
| Tap B → `<PlacementHud>` interactive | **≤50 ms** |
| Tap B → keypad fully open | 630 ms worst case (450 settle + 180 slide) — but the HUD is live at 50 ms |
| Value commit → label re-render | ≤32 ms (labels are derived, never stored) |
| Any action > 400 ms | must show progress |

**The rule that prevents "laggy": every auto-open must be cancellable by contact, and every deferred
step must have an immediately-live manual equivalent.**

### 6.3 Replacing pen hover (touch has none)

| Pen-hover behaviour (`U §14.6`, `§16-19`) | Touch equivalent |
|---|---|
| Rail tool tooltips | The **Style Chip already names the tool** + shows a WYSIWYG swatch. Press-and-hold a rail button for name + options. One-time hint per tool |
| Erase-target preview | Tap-to-delete + undo toast; long-press to preview without deleting |
| Handle highlight | A **proximity halo** on contact: the nearest handle within 56px gets a `--sel` halo |
| Snap preview before commit | Survives — snapping computes at `pointerdown` and during refine; the pin/loupe show it |
| Crosshair following the pointer | Replaced by the loupe + contact disc during contact; nothing between contacts (the honest cost of touch) |

---

## 7. Accessibility / ergonomics deltas

1. **Target floor 44 → 48px for touch-primary.** Rail (56), style controls (56), keypad (72) and
   destructive confirms (64) already clear it. The only sub-48 items remain the two sanctioned ones —
   and the **Recent style chips must rise 40 → 44px**. No new exception is created; this tightens.
2. **Hit slop 8 → 16px general, 12 → 24px along thin strokes.** Re-verify the 0px-overlap invariant on
   the swatch grid and rail notch (`U §14.5`).
3. **Handles** 28px visual / 72px hit (from 8×24 / 56). **Mini-toolbar** 64px (from 56).
4. **Thumb reach (portrait 960×1440).** Comfortable one-handed arc is the bottom ~35% (y ≈ 940–1400)
   within ~90 mm of the corners. The bottom style bar (72px) is correctly placed; undo/redo already sit
   at the rail's bottom. **The top bar (52px) and the rail's upper rows are out of one-handed reach.**
   Recommended delta (mild spec change): in portrait touch-primary, a **56px pull-down handle at the
   top of the rail** brings Layers · Export · ⋯ down into the bottom third as a horizontal strip.
   Landscape two-handed at the bezels is unaffected.
5. **Palm/heel occlusion safe area.** Reserve a **24px inner canvas margin**; keep the keypad sheet and
   mini-toolbar at least **96px clear of the bottom edge**.
6. **Glove delta.** `«Gloved touch»` → hit slop +8px, snap acquire +4px, loupe offset +16px. One toggle.
7. **Settings** gain `«Touch places and moves»` (ON), `«Finger draws (freehand)»` (OFF),
   `«Magnifier when you tap»` (ON), `«Gloved touch»` (OFF). `«Pen only»` remains.
8. **Focus order and keyboard unchanged** (top bar → rail → canvas → style panel; arrow-nudge; direct
   keypad typing). Touch adds no tab stop. Make the canvas container focusable so arrow-nudge works
   after a touch selection.
9. **Screen reader:** the canvas object tree becomes *more* important — "select the dimension from a
   list and nudge with arrows" is now a first-class path. Announce selection changes and placement
   state (`«Dimension: first point placed»`).
10. **Sunlight mode** already has the 64px floor, no fades and max contrast — the right touch theme too.
11. **Reduced motion:** the anchor-pin collapse becomes an instant opacity swap.

---

## 8. Top interaction risks

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| 1 | **The drawn geometry is wrong while the label is right.** The typed value hides placement error; arrowheads still point at the wrong spot, and the PDF reads as authoritative | Silent wrong-looking artifact on a measurement drawing | Loupe + snapping + Offset Nudge Pad + `Edit points` promoted; one-time honesty hint `«The value you type is the measurement. The line shows where you put it.»` |
| 2 | **Palm rejection with no pen signal** | A resting heel can tap | Tap-tap default (far more palm-tolerant than drag); explicit cancel paths; undo + refine; keep the pen as a suppression signal when present; define `PEN_HANDOFF`; document that a pen-less device leans on undo |
| 3 | **One-finger drag misfires** (move when panning, or vice-versa), displacing a measurement | Silent displacement | Deterministic predicate §3.1; two-finger drag always pans; second finger cancels + restores; undo labels the move |
| 4 | **Tap-vs-drag ambiguity for the placement tap** | Wrong endpoint, silently | Tap slop 8px + 400 ms ceiling; classify on `pointerup`; a drag starting on empty canvas pans rather than placing A |
| 5 | **Keypad auto-open surprises a user mid-adjustment** | Interrupts correction | Settle window cancelled permanently by any contact; HUD live at 50 ms; `Adjust endpoints` available *inside* the sheet |
| 6 | **Finger occlusion at the decision point** | Corrections hide the thing being corrected | Touch loupe (200px, 4×, 136px offset, contact disc, leader); Offset Nudge Pad; freeze-on-lift |
| 7 | **Freehand / stroke-erase look available but are materially worse** | A bad result erodes trust in the whole tool | Pen-first defaults + in-context notes; straight-line Highlighter as the touch-native path; finger ink behind an explicit toggle |
| 8 | **Gesture conflicts with what the user already learned** | Feels unpredictable | Every context split stated as a one-line predicate; every gesture has an on-screen equivalent (`U §1.7`); per-tool first-use cheat sheet |

---

## 9. Spec deltas and copy required

**Spec edits (each needs a `DECISIONS.md` line):**
- `U §1.1` — replace "Pen draws, finger navigates" with "Pen draws. Touch places and moves. Both create
  geometry," plus the re-scoped toggles.
- `U §5.4` / `P §8.2` — single-finger drag is object-first per the §3.1 predicate; add `PEN_HANDOFF`.
- `U §8.1` — tap-tap placement, the settle window, the touch loupe variant, the Offset Nudge Pad, the
  cancelled-auto-open rule.
- `U §8.2`–`§8.3` — tap-tap generalisation (Angle 3 taps; Line/Arrow/Rect/Ellipse 2; Polygon close + `✓ Done`).
- `U §8.6` — enlarged handles, proximity halo, canvas long-press, second-tap-on-selected semantics.
- `U §8.7` — stroke-mode erase is pen-only; touch erases whole strokes.
- `U §14` — 48px touch floor, 16/24px hit slop, gloved-touch toggle, portrait reach delta, 24px safe area.
- `U §16` — update item 19 (pen hover) and add "tap-tap is the primary verb; the loupe is the tap's
  precision channel."

**Proposed copy** (placeholders; final wording is the content owner's):

| Key | Proposed string | Where |
|---|---|---|
| `editor.emptyHint` (edit) | Tap a tool, then tap the photo | Editor empty state |
| `placement.firstPoint` | Tap the first point | Hint chip, AnchorA-1 |
| `placement.secondPoint` | Tap the second point | Hint chip, AnchorA |
| `placement.adjustEndpoints` | Adjust endpoints | Placement HUD / keypad sheet |
| `placement.adjusting` | Adjusting dimension | Top-centre chip in edit mode |
| `placement.undoPoint` | Undo point | Polygon HUD |
| `placement.closeShape` | Close shape | Polygon HUD |
| `touch.drawnVsTyped` | The value you type is the measurement. The line shows where you put it. | One-time hint, first touch dimension |
| `touch.freehandPenBetter` | Freehand is most precise with the pen. | One-time hint, first finger freehand |
| `erase.strokeNeedsPen` | Splitting a stroke needs the pen. Touch can delete the whole stroke. | Erase panel note under touch |
| `settings.touchPlaces` | Touch places and moves | Settings toggle (default ON) |
| `settings.fingerDraws` | Finger draws (freehand) | Settings toggle (default OFF) |
| `settings.magnifierOnTap` | Magnifier when you tap | Settings toggle (default ON) |
| `settings.glovedTouch` | Gloved touch (bigger touch targets) | Settings toggle (default OFF) |
| `select.touchHint` | Drag to move. Two fingers to pan. | One-time hint, first touch selection |

---

## 10. Honest summary — touch vs pen

Touch-primary is the right call for reach and gloves, and tap-tap fits this app well because placement
is **discrete and interruptible** — exactly what a less-precise input needs. Three things are genuinely
worse, and the product should say so rather than paper over them: **fine endpoint placement** (the
label can be right while the line is wrong — risk #1), **freehand expressiveness** (no pressure/tilt),
and **stroke-scoped erasing**. Everything else — placement, selection, dragging, panning, zooming,
deleting, and the whole measurement loop — works at least as well with a finger as with a pen.
