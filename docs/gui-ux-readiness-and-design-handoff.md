# FieldMeasure — GUI/UX Pre-Implementation Readiness Report & Design Handoff

**Date:** 2026-09-21 · **Status:** review artifact (not a slice; not a canonical spec)
**Scope:** (1) senior assessment of the current architecture as it bears on the GUI/UX; (2) a
readiness verdict on doing pre-implementation visual design; (3) a decision package to close
*before* code; (4) a handoff pack for Claude Design / any external design tool.

**Authority.** This document is **not** canonical. It reports against, and cites, the canonical set:
`preflight-handoff-v0.3-hardened.md` (**P**, build spec — §2.4 is the single authority),
`ui-spec-field-measure-v2-hardened.md` (**U**, UI/UX spec), `implementation-plan.md` (**IP**).
Where this document proposes a change to a canonical doc, the change must be applied to that doc
plus a line in `docs/DECISIONS.md` — never here.

**Evidence discipline.** Claims below are marked **verified** (read directly in a canonical doc, with
line/section refs) or **reported** (from a specialist research lane, not yet merged into canonical
docs). Two external facts were independently re-verified at source.

---

## 1. Executive summary

**There is no application code.** The repo is 16 documents plus installed dependencies
(**verified**, `docs/BUILD-LOG.md:6`, `docs/CONTINUITY.md:15`). This is a design *ahead of* a build,
not a retrofit — which changes the question from "should we reverse-engineer a design from running
software" to "which design decisions are inputs to the build".

**Verdict: do not create a dedicated pre-implementation design phase, and do not gate the build on
it.** The project already has an unusually complete visual specification — full token system,
12-swatch palette, type pairing, target-size math, rail grouping, docking rule, per-screen states,
accessibility requirements. What it does **not** have is the *scaffolding underneath* the visuals:
a frozen box model, a spacing/opacity/z-index/shadow/motion token set, a handedness mirror matrix,
and a resolution of ~14 cross-document contradictions. Those are **decisions, not mockups** — they
cost hours-to-days, not weeks, and they are exactly the things that force a re-layout if deferred.

**Recommended sequence (matches the plan's own de-risking intent):**

1. Close the **decision package** in §10 (≈1–2 days, mostly `DECISIONS.md` entries + three doc fixes).
2. Resolve the **contradiction register** in §11 (≈half a day; C1–C6 are real bugs).
3. Run the plan unchanged: **0.0** origin → **0.1** scaffold → **0.2** input spike → **0.3** Home
   shell → **1.1** domain → **1.2** storage → **1.3** canvas → **1.4** capture → **1.4.5** editor
   shell → tools.
4. Build the chrome **from the UI spec**, which is already specific enough to implement without a
   mockup.
5. Optionally, in parallel with 1–3 and explicitly non-blocking: **one throwaway Claude Design pass
   for tablet chrome layout alternatives only**, treated as a moodboard, never as validation.

**Why not design-first:** the highest-risk surface of this product is not the chrome — it is the
imperative Konva canvas under a pen, palm rejection, atomic offline writes, and the `0.75 × mu` pt
export invariant. A DOM mockup cannot represent any of those, and a polished mockup of the *chrome*
would create false confidence about the 80% that it cannot show (§8).

**Answer to the direct question — "are we better off writing the backend first?"** Yes, largely — but
"backend-first" is a false choice here. Do the ~1-day decision pass, then build domain/storage/spike
first exactly as the plan already sequences. Design work does not need to block any of it, and only
a small part of it needs to *precede* it.

**A second, larger finding emerged during this review.** The app has been specified **pen-first**, but
it will be used **primarily by touch**. That inverts a documented non-negotiable (`U §1.1`), contradicts
**22** statements across the docs, and — critically — leaves **no palm rejection whatsoever** in a
pen-less session, because the input router only starts its suppression clock on a pen event. The full
analysis is **§13**, the implementable design is `docs/touch-first-interaction-model.md`, and the
consolidated verdict is **§14**. It is cheapest to correct **now**, before slice 0.1, because it lands
almost entirely inside slice 0.2 (the input spike), which has not started.

---

## 2. Current state — facts

| Fact | Evidence |
|---|---|
| No `src/`, no `tests/`, no build output | `docs/BUILD-LOG.md:54`; `docs/CONTINUITY.md:15` |
| `package.json` is still npm-init defaults (`"type": "commonjs"`, placeholder test script) | `docs/CONTINUITY.md:273` |
| Dependencies installed and pinned; four spec/UI-review rounds complete | `docs/CONTINUITY.md:18–21` |
| `docs/BUILD-RUNBOOK.md` cited by four docs but **does not exist** | `docs/CONTINUITY.md:280` |
| `THIRD-PARTY-NOTICES.md` required by spec, **does not exist** | `docs/CONTINUITY.md:279` |
| Next action: slice 0.0, then 0.1 | `docs/CONTINUITY.md:241` |

---

## 3. Architecture as specified (the parts that constrain the GUI)

**Runtime:** Microsoft Edge on Windows 11, installed as a PWA, fully local — File System Access API +
IndexedDB. No server, no database, no account, no cloud, no Bluetooth (**verified**, `P:1`,
`U:1–5`).

**Stack (closed list — adding a dep requires a spec change):** React 19.3, TypeScript 5.x,
Vite 8, Zustand 5, Immer, Zod, idb-keyval, **Konva 10 (imperative)**, `@cantoo/pdf-lib`,
`perfect-freehand`, `fflate`, `lucide-react` (chrome icons only) (**verified**, `package.json:24–44`;
`P:1962`).

**Three architectural facts that dominate every GUI decision:**

1. **Chrome is React; the canvas is an imperative Konva class.** `react-konva` is forbidden
   (**verified**, `U:811–816`, `AGENTS.md` non-negotiable #4). The component tree in `U:818–863` is a
   *logical* map — `<PhotoLayer>`, `<MarkupObject>` etc. are conceptual boundaries, not React
   components. React owns TopBar, ToolRail, StylePanel and portalled overlays only.
2. **There are two unrelated sizing systems, and neither doc names them separately.**
   Chrome is fixed **CSS px** (52/56/64/72/88, 6/8px gaps). Canvas markup is **markup units (mu)** —
   resolution-independent, anchored only by the paper invariant
   `physical = 0.75 × mu pt at every export multiplier M` (**verified**, `P:565–584`, `P:301`
   `strokeWidthMu: 4`). Screen scales by `mu / s`; export scales by `mu × M` (**verified**).
   Any designer working from the UI spec alone will conflate these.
3. **Strict CSP with `style-src 'self'`** (**verified**, `P:190`). No inline `style=""` attributes, no
   runtime-injected `<style>`, no CDN — so tokens must live in a real self-hosted stylesheet. That
   rules out CSS-in-JS and ships of most generated prototype HTML. **One nuance matters, though:**
   `style-src 'self'` blocks `setAttribute('style', …)` and `el.style.cssText = …`, but **not** direct
   CSSOM property assignment (`el.style.display = 'none'`). Konva styles its stage layer with direct
   property assignment, so **Konva is not a CSP violation** — worth proving once with a
   `securitypolicyviolation` listener in the spike rather than assuming.

**Storage shape that the Home/Project UX is built on** (**verified**, `P:239–259`, `U:872–890`):
one folder = one project; `<project>/project.json`, `sheets/<n>/{photo.jpg,markup.json,thumb.jpg,meta.json}`,
`assets/<sha256>.jpg`, `exports/`, `.fieldmeasure/presets.json`, `.history/`, `.trash/`.
All writes atomic (tmp → close → `move()`) under a per-project Web Lock (`P:190`, `U:748`).

**Plan structure:** 16 slices with hard ordering constraints (**verified**, `IP:61–124`). The ones
that matter to design: **0.2 is a throwaway input spike that must precede any canvas UI**
(`IP:104`), and **1.4.5 builds the editor shell only after domain/storage/canvas** (`IP:116–117`).

---

## 4. What the GUI/UX design already decides (build from these)

The UI spec is stronger than "preflight design" — it is close to implementable. Already fixed:

- **Visual direction "Site Slate"**: 10 graphite tokens, 4 accent tokens, 3 semantic tokens, canvas
  mat + vignette, sheet edge/shadow (**verified**, `U:61–90`).
- **Accent discipline**: orange = action/measurement, cyan = selection/manipulation, never swapped
  (**verified**, `U:90`).
- **12-swatch markup palette in fixed visibility order**, plus Custom + Eyedropper with a
  "nudge for contrast" suggestion (**verified**, `U:92–98`).
- **Typography**: self-hosted Archivo (UI) + JetBrains Mono (all numerals/measurements), 7 named
  roles with size/line-height/weight (**verified**, `U:100–117`). Never a CDN font.
- **Geometry/motion**: radii 10/14/999; two elevation shadows + inset top highlight; 150ms chrome /
  200ms screen / 180ms rotation; **ink has zero animation** (**verified**, `U:118–123`).
- **Density modes**: Field (56px controls, 72px rail) / Desk (48px controls, 64px rail) — see C2.
- **Target-size math with physical derivation** at 267 ppi / 200%: 48/56/64/72/88 px with 8px min gap
  (**verified**, `U:29–48`).
- **Layout + two-handed thesis**: vertical 128px tool rail on the pen-hand side, 2-column,
  bottom-anchored, undo/redo at the bottom; Style Panel on the free-hand side; the aspect-ratio
  argument (~15% more photo area than a bottom deck, ~44% vs a full side panel) (**verified**,
  `U:178–213`).
- **Deterministic docking rule**: `aspect ≥ 1.2` → side dock; `< 1.2` → 72px bottom style bar; the
  rail never moves (**verified**, `U:247`, `IP:798–802`).
- **Full screen/panel inventory with states** (**verified**, `U:134–165`, `U:921–931`).
- **Accessibility as a per-slice gate**: focus order, 2px `:focus-visible` ring, `aria-label` on
  every control, 44×44 minimum, no keyboard trap (**verified**, `IP:47`, `P:19.6`).

This is the material a handoff needs — and it is already written down. **A design tool is not needed
to produce it; it already exists.**

---

## 5. What is genuinely *not* decided (the real gap)

The gap is scaffolding, not style (**reported**, designer lane; spot-verified against `U`):

| Gap | State | Consequence if deferred |
|---|---|---|
| **Spacing scale** | only "8px gap", "6px gap", "16px extra gap" | every panel's padding is ad-hoc; global rename churn |
| **Opacity/scrim set** | 0.92/0.85/0.70/0.60/0.40/0.35/0.30/0.25/0.10 appear as prose | scrims and dim states will not harmonise (popover over a scrimmed keypad) |
| **Z-index scale** | implied only | overlay stacking bugs |
| **Shadow levels** | raw strings; toasts/zoom pill/mini-toolbar unspecified | elevation inconsistency |
| **Density × theme × text-scale matrix** | Sunlight forces a 64px floor overriding both densities; 100–150% must survive | component box must be authored at the largest case; retrofitting re-lays every panel |
| **Handedness mirror matrix** | six surfaces mirror, only rail side has a test | mirrored-surface bugs in the flagship flow |
| **Width readout unit** | panel shows `«4 pt»` for `strokeWidthMu: 4`, which prints 3 pt (C6) | mislabelled product artifact; touches non-negotiable #1 |
| **Copy for trust surfaces** | Autosave expanded explanations, Settings screen, confirm-dialog bodies, capture labels are unquoted | Settings ships *first* (slice 0.3) with no copy |

---

## 6. "Claude Design" in 2026 — what it actually is

**Independently verified at source** (TechCrunch, VentureBeat, Adweek, `anthropic.com/news`,
`support.claude.com`, `claude.com/blog`):

- **Claude Design is a real Anthropic Labs product**, launched **17 April 2026**, in research
  preview/beta for Pro, Max, Team and Enterprise. Powered by **Claude Opus 4.7**.
- It builds prototypes, wireframes, mockups, design explorations, decks, one-pagers and
  marketing collateral on a canvas beside a chat.
- **Its differentiator is codebase-first design systems**: it reads a repo and design files, builds
  a design system (colour, type, components), and applies it automatically.
- It exports to **HTML, PDF, PPTX, Canva** and hands off to **Claude Code** for implementation.
- A **September 2026 update** brought it into any Claude conversation, including Claude Code and the
  Artifacts tab.
- Known limitations (**reported**, help centre): inline-comment persistence is flaky, large-codebase
  lag/crash, turn-based not real-time, **no visual regression testing**, no mobile surface.

**Capability ceiling (**reported**, cross-checked):**

| Output | Verdict |
|---|---|
| Static hi-fi mockups (DOM/HTML/CSS) | Strong |
| Interactive clickable prototypes | Yes — real navigation; complex animation weak; no live data |
| Production React/TS code | Only via Claude Code handoff; the canvas output is self-contained HTML, not repo code |
| Design system / tokens | Yes, *if* you supply one — and import "isn't perfect" |
| Persistent state across sessions | Not by default |
| Visual regression / screenshot testing | None |

---

## 7. Tooling landscape for pre-code GUI definition

### 7.1 Canvas / pen prototyping and validation — **RESOLVED**

**The single most useful finding: you can synthesize pen input off-device via CDP.** Playwright's
own `Mouse` API has no `pointerType`/`force`/`tilt` (so it cannot test the pen path directly), but
`page.context().newCDPSession(page)` + `Input.dispatchMouseEvent` with `pointerType: 'pen'`,
`force`, `tiltX`, `tiltY`, `twist` **is** the practical Chromium/Edge pen simulator. Selenium 4.2+
also exposes pen actions. That closes a large class of risk in CI.

**Correction to a premise in the spec's own design:** the pen has **two** distinct buttons and they
are not the same code:

| Device button | `button` | `buttons` |
|---|---|---|
| Pen **barrel** (right-click equivalent) | `2` | `2` |
| Pen **eraser** (flipped tip) | `5` | `32` |

This matters because the radial quick-menu is **barrel-button-gated** (`P §2.4:226`) and the eraser
is a first-class tool (`U §8.4`). Whether Windows/Edge actually delivers `button 2 / buttons 2`
reliably — or lets a long-press/right-click gesture steal it — is **hardware-only** and must be
proven in the spike.

**Konva findings that map directly onto existing spec requirements:**

| Finding | Spec requirement it serves |
|---|---|
| `hitStrokeWidth` enlarges the hit region without visual change | `U §8.6` "hit slop 8px, 12px along thin strokes" — this is the built-in mechanism |
| `stage.getIntersection({x,y})` reads the hit canvas; `listening:false` nodes excluded, `hitStrokeWidth` counted | Selection/erase targeting (`U §8.6, §8.7`) |
| **Export defaults to `pixelRatio: 1`** regardless of screen | `U §12` export quality 1×/2×/3× — must be passed explicitly or exports are softer than the screen |
| Cross-origin images taint the canvas and block `toDataURL`; `blob:`/`data:` are same-origin and safe | Confirms the local-file architecture is compatible; never introduce a remote image |
| Canvas area cap ≈ 16,384² px in Chromium | Bounds the export multiplier; relevant to the `U §12` "3× ≈ 450 MB on a Surface Go" note |
| `desynchronized: true` context hint and the **Ink API** are the latency levers | `U §14.13` pen-to-ink ≤ 16ms budget |
| Third-party **Konva Devtools** extension exists (scene-graph tree, hit-region visualisation, render heatmap, cache inspector, `Layer.draw()` profiler) | Debugging the canvas during 1.3–1.8 |

**Plan gap found (must be recorded in `DECISIONS.md`):** the plan's test infrastructure mandates
**Vitest + jsdom** (`IP:242`, `U §15`), but **jsdom has no canvas implementation** — `getIntersection`
returns `null`, `toDataURL` returns a stub, and pixel readback is transparent. A hit-testing test
written against jsdom *passes without testing hit testing*. Anything touching a `Konva.Stage` must
run in a **real browser** (Vitest browser mode + Playwright, or Playwright directly). jsdom is fine
for stores and pure logic only. Konva's official testing guidance says this explicitly.

**What cannot be validated off-device, ever** (log to `docs/HARDWARE-TEST-CHECKLIST.md`, never fake):
OS/driver palm rejection as delivered (the ~12 cm angled dead-zone and its handedness setting);
true end-to-end ink latency; real coalescing rate and `getPredictedEvents()`; pen hover semantics;
barrel/eraser routing; pressure curve and light-touch registration; `twist` (Surface Slim Pen 2 has
no rotation sensor — expect constant 0); GPU/DPR-2/thermal behaviour on the tablet; Ink API
availability on the target Edge build; and the OS-level **250 ms pinch/zoom delay on inking
surfaces** (`HKLM\SOFTWARE\Microsoft\Palm\DelayManipulationDuration`), which explains pinch lag that
no amount of app-side optimisation removes.

### 7.2 GUI design / visualisation tooling — **RESOLVED**

**Headline: the regression half of the question is already paid for.** `@playwright/test` **1.63.0 is
already in the pinned dev dependencies** — it is not a new cost, and it is a stronger answer than any
mockup tool.

**The CSP + closed-dep-list + canvas filter eliminates most of the market:**

| Tool | Survives our constraints? | Why |
|---|---|---|
| **Playwright `toHaveScreenshot`** | ✅ **Recommended — already pinned** | Runs the real DOM/canvas; exact viewports + `deviceScaleFactor`; fully offline; baselines in-repo |
| **Penpot** (self-hosted, AGPL) | ✅ Optional | The only mockup tool that emits **class-based CSS rules** (not inline `style=""`), and its flex/grid model maps onto CSS. Offline via Docker |
| **Excalidraw** (desktop, MIT) | ✅ Optional | Offline, hand-drawn wireframes; honest about being approximate |
| **DTCG JSON + Style Dictionary v4** | ✅ Recommended for tokens | Emits an external `tokens.css` with custom properties — CSP-safe by construction |
| Figma / Figma Dev Mode | ⚠️ Marginal | Cloud-only; per-layer **absolute-positioned** snippets, not a stylesheet |
| Figma Make / Framer | ❌ | No real code export; cloud-only |
| Storybook / Loki / Chromatic / Percy | ❌ | Not in the closed dev-dep list; Loki last published 2024 (stale); Chromatic/Percy are cloud + metered (~$149–179/mo) and violate "fully offline" |
| v0 / Lovable / Bolt / **Claude Design** | ❌ for *shipping* | Cloud + AI, emit Tailwind and/or inline styles — banned framework, blocked by CSP. (Note: the runtime "no AI / no cloud" prohibition in `AGENTS.md` #8 applies to the *app*, not the design process — but the *output* still cannot ship) |

**Recommended minimal stack:**
1. **Playwright — primary and non-negotiable.** Two projects at the real viewports with
   `deviceScaleFactor: 2` (landscape 1440×960, portrait 960×1440). Assert **exact computed geometry**
   (`boundingBox()`, `getBoundingClientRect()`, `getComputedStyle()`) for the load-bearing numbers —
   rail width, keypad slot widths, panel row heights — so a wrong layout fails CI with a numeric diff
   rather than an eyeball. Use `toHaveScreenshot()` for what numbers can't capture (canvas render at
   1×/4×/8×, card grids, toolbars) with `animations: 'disabled'`, `caret: 'hide'`, and
   `document.fonts.ready` awaited.
2. **Penpot self-hosted (or Excalidraw)** — *optional*, disposable chrome wireframes only. Build with
   Flex/Grid, never freeform absolute, and hand-copy class rules into our own stylesheet.
3. **DTCG JSON + Style Dictionary v4** — single token source. *Needs a one-line spec change +
   `DECISIONS.md` entry, because it is a new dev dependency and §2.2 lists dev deps too.* Cheaper
   alternative: hand-write `tokens.css` from the same JSON and skip the tool.

**Highest-value idea from this lane, and it is missing from the plan:** **enforce the CSP as a test.**
A spec that asserts `page.locator('[style]').count() === 0` plus a `securitypolicyviolation` listener
that fails on any violation makes the project's strictest non-visual constraint machine-checked. Add
overflow checks (`scrollWidth <= clientWidth`) and a tap-target audit (every chrome control ≥44×44) as
cheap `evaluate` loops across both viewports. A mockup is a picture you eyeball; these are numbers
that fail CI — and non-negotiable #7 forbids weakening them.

**Skip:** every AI/cloud code generator (they cannot ship here) and every cloud visual-regression
service (offline + cost). None of them buys anything Playwright doesn't already provide.

### 7.3 Professional field-app UI patterns — **RESOLVED**

Benchmark teardown of Bluebeam Revu/Mobile, Fieldwire, Procore, PlanRadar, Autodesk/PlanGrid,
CompanyCam, Microsoft Whiteboard, Concepts, GoodNotes, Notability, Procreate, OneNote, Snagit, Apple
Markup and Acrobat. Findings below are labelled **fact** (documented in the cited vendor source) or
**opinion**.

**Where the spec matches proven practice (validated — keep):**

| Choice | Validation |
|---|---|
| Vertical side tool palette | The drawing-class default: Bluebeam Revu iPad, Acrobat, CompanyCam, Procreate/GoodNotes family. Bottom bars are the norm only for canvas tools with no precision placement |
| Persistent **WYSIWYG** style indicator | Three independent precedents: Concepts puts the live colour/opacity swatch **in the centre of its Tool Wheel**; Windows InkToolbar auto-dismisses its flyout and **resumes inking** on change; Snagit's Quick Styles are the primary path with properties as fallback |
| A magnifier for placement accuracy | Fieldwire documents its Magnifier as *"accuracy for area/distance measurements"* |
| Bottom sheet for entry | iOS keyboard, InkToolbar flyout, Bluebeam's bottom Properties toolbar |
| Hold-to-confirm for destruction | Named best practice for high-criticality actions |
| Two-accent semantic split (orange action / cyan selection) | More disciplined than the single-accent incumbents (Acrobat, iOS) |
| 44×44 minimum | Conservative and aligned — Microsoft's guidance is **44×44 epx with ≥4 epx of visible spacing** (7.5 mm ≈ 40×40 at 135 PPI) |

**Where the spec deviates — ranked by risk:**

| # | Deviation | Why it's risky | Recommended adjustment |
|---|---|---|---|
| **1** | **Fixed rail on the pen-hand side** | No vendor documents a *pen-hand* rationale. The recurring market rule is *vertical palette, left or right, **user-selectable**, mirrored for handedness* (Concepts states this explicitly). Non-movable chrome is the single most-complained trait in the category — Microsoft Whiteboard has an open "Flexible/moveable toolbar" request and users are told there is no setting; GoodNotes users complain about a top toolbar being hard to reach | Keep handedness auto-mirroring (already spec'd), and **strongly consider letting the rail collapse** like the style panel. "Fixed" is the weak part, not "vertical" |
| **2** | **Transient, draw-time-only loupe** | Every shipped loupe in the set is **docked and user-positioned** (Fieldwire Magnifier, GoodNotes Zoom Window, Notability Zoom View, Apple Markup loupe). Nothing auto-shows a loupe on pointer-down. A loupe near the contact point **occludes the very endpoint being placed** — and this gets *worse* under touch (§13) | Dock it or offset it further, make it dismissible, and consider making it the persistent companion to the keypad sheet rather than a draw-time overlay |
| **3** | **Typed ft-in keypad as the primary value path** | **No field incumbent does this.** Bluebeam/Fieldwire/Procore/PlanGrid are all *calibrate-then-draw*; My Measures does arrows + a Leica DISTO and never parses ft-in; Concepts does typed exact lengths but on a *scaled* canvas. There is even an **open Microsoft Calculator request** to add a ft-in "Construction Mode". So we are inventing the pattern, not copying it | Defensible given our architecture (lengths = mm + raw text; calibration is deferred), but it must be usability-tested. **Also: construction calculators colour-code keys blue = feet / green = inches — this collides with our orange/cyan discipline.** Decide and record which wins |
| **4** | **Undo/redo split from the tools, and undefined undo-across-restart** | Every peer co-locates undo with tools: GoodNotes (undo side is a *user setting*), Concepts (undo at the Tool Wheel), Fieldwire (undo inside the markup toolbar). Fieldwire's undo is **session-only and deletions are unrecoverable**; Procreate **wipes undo history on canvas close**; OneNote substitutes version history | State the undo scope explicitly. Pair in-memory undo with the per-project history surface (we already have `.history/`). If we keep the bottom placement, justify it as a deliberate bottom thumb-zone and mirror it for handedness |
| **5** | **Five simultaneous chrome surfaces** (rail + panel + Style Chip + loupe + keypad) **and no "pen only" mode** | The closest precedent warns about exactly this: the Revu iPad review called the markup palette *"a bit overwhelming"*, said *"each markup tool has its own way of working"*, and that users *"do need to review the instructional manual"*. Separately, **palm/touch conflict at bottom-of-screen controls is the most repeated user complaint in this category** | Make the Style Chip the **single** source of style truth and the 280px panel state explicitly transient. Add the documented **"Touch writing" / "pen only" toggle** (Windows InkToolbar and Procreate both ship this) |

**Other notable findings:**
- **Label legibility — we are ahead, and it is a real advantage.** Most tools ship coloured text with no guaranteed contrast (Apple Markup has no text-background pill at all; Procore is colour-only). The cartography canon for halos is specific: the halo should be **darker than white text (or lighter than dark text)**, use **darken/lighten blend modes** so it only draws where it helps, and be **slightly blurred** — not a hard black outline. Our dual-outline/pill approach is right; it must hold at both screen scale (`mu / s`) and export scale (`mu`) or it silently breaks the `0.75 × mu` pt rule.
- **Save-state.** Field incumbents use an explicit **commit** (green check / red X — Fieldwire's Android build literally won't save a markup without the green checkmark) because their output is a contract artifact. Note apps are autosave-first. Design-system guidance says saved-ness should be obvious **without text**, and that save **errors belong in a persistent alert, not a toast** (GitLab Pajamas; Primer). Our atomic write path is a genuine trust advantage that is currently *invisible* in the chrome spec.
- **Palm rejection is not reliable even on real hardware.** Microsoft's line is that Surface *"is designed to ignore your hand… while you write"*, and Windows ships an *"Ignore touch input when I'm using my pen"* setting — yet Surface users report palm rejection causing **pen inaccuracy** and repeatedly request a true pen-only mode. Procreate ships **"Disable Touch Actions"** as a first-class setting. This is a warning about our §13 plan, not just a footnote.

---

## 8. Canvas reality check — what a mockup cannot validate

This is the decisive section. An AI/external prototype is DOM + CSS + a little sandboxed JS. Konva is
an **imperative 2D scene graph**. The prototype cannot represent, and therefore cannot de-risk:

1. **Scene-graph behaviour** — z-order bands, hit testing, transformer handles, exported-canvas
   taint.
2. **Pen/pointer fidelity** — pressure, tilt, coalesced events, palm rejection. A mouse-driven mock
   has none of this.
3. **The export invariant** — `0.75 × mu` pt at every M is arithmetic, not appearance
   (**verified**, `P:565–584`).
4. **Offline storage** — atomic tmp→`move()` under a per-project Web Lock; sandboxed prototype output
   cannot do this at all.
5. **Performance at real resolution** — a 4096px-long-edge photo on a tablet GPU, DPR 2.

**The false-confidence mechanism:** the chrome looks finished and clickable, reviewers approve it, and
the unprototyped 80% (units, snapping, export fidelity, atomic writes, offline PWA) turns out to be
unbudgeted and unvalidated. A smooth DOM mock of drag/snap **actively misleads**. The plan already
knows this — it is why slice 0.2 is a throwaway canvas spike before any UI (`IP:104`).

### 8.1 The spike spec (slice 0.2 + slice 1.3)

One throwaway page. No app shell, no store, no PDF, no design system. Konva stage at 1440×960 CSS px,
`touch-action: none`, a 4096px-long-edge fixture photo, one pressure→width draw tool, pan/zoom, and an
"export at M" button. **Log every pointer field from every event to an on-screen copyable JSON panel** —
that single artifact answers most of the gates below.

| # | Gate | Pass threshold | If it fails |
|---|---|---|---|
| 1 | Pen identity | `pointerType === 'pen'` on down/move; coalesced length > 1 on a fast stroke | Investigate Edge/driver before anything else |
| 2 | Pressure | Varies continuously, not 0 / 0.5 / 1 | Treat pressure as optional decoration |
| 3 | **Palm rejection** | 10 tries: rest palm flat, then draw → **0 stray strokes, 0 accidental zooms** | Add pen-mode overlay + touch-suppression window |
| 4 | Palm-after-pen | Two-finger pan works immediately after pen-up | Tune suppression timeout |
| 5 | Ink latency | Median ≤ 30ms, p95 ≤ 50ms (16ms is the aspiration) | Try `pointerrawupdate`, desynchronized/Ink trail, layer split |
| 6 | Barrel / eraser | Confirm `2/2` and `5/32` are distinguishable from the page | Fix mapping, or drop the radial to the rail-only entry path |
| 7 | Zoom/pan + transform | Marks land under the pen; no drift; handles track | Fix the transform round-trip |
| 8 | **Export invariance** | `0.75 × mu` pt at M = 1, 2, 3; no taint error | Fix export stage/scaling |
| 9 | 4096 perf @ DPR 2 | ≥ 50 FPS sustained pan; no frame > 100ms | Downscale display copy, split layers, `perfectDrawEnabled:false` |
| 10 | jsdom sanity | The same hit-test that "passes" in jsdom actually runs in a browser | Move canvas tests to browser mode |

**Everything in gates 1–10 except #3, #5 and #6 can be exercised off-device**, and #5/#6 partially
(via CDP pen synthesis). Gates #3 and #6 are the ones that genuinely require the Surface.

### 8.2 Spec / plan implications found during this review

| Finding | Owner doc | Action |
|---|---|---|
| Konva tests cannot run in jsdom; the plan mandates jsdom for the test harness | `IP:242`, `P §14` | Add browser-mode config for canvas tests; record in `DECISIONS.md` |
| `pointercancel` must finalise partially-drawn geometry (Windows cancels touch pointers when a pen enters range) | `U §8.1` ("cancel keeps the stroke") | Make explicit that the same rule applies to *interrupted* strokes, not just user cancel |
| Barrel-button routing is not guaranteed; the radial is already correctly spec'd as "absent rather than broken" | `P §2.4:226` | Keep the degrade path; prove the button in the spike before building the radial |
| `hitStrokeWidth` is the built-in mechanism for the spec's hit slop | `U §8.6` | Use it rather than a custom hit function |
| Export `pixelRatio` must be passed explicitly (default 1) | `U §12` | Pin the export DPI path against `P §4.2` |
| The OS adds ~250ms to pinch/zoom on inking surfaces | `U §5.4` | Expect it; do not misdiagnose it as an app bug; document in the hardware checklist |

---

## 9. Recommendation

**Do not commission a design phase. Close decisions, then build.**

- **Do** spend ≈1–2 days on §10 (decision package) and ≈0.5 day on §11 (contradictions).
- **Do** run the plan as written; it already sequences risk correctly (spike before canvas UI, domain
  before storage, chrome after canvas).
- **Do** build chrome directly from the UI spec — it is specific enough (exact px, exact tokens, exact
  states) and needs no mockup to be implementable.
- **Do** treat §7's findings (when they land) as tool selection for *layout regression testing*, not
  as a design gateway.
- **Optionally** run one time-boxed Claude Design pass for chrome-layout alternatives, labelled
  "chrome only / not validated", exported as PDF/PNG for a human decision. Non-blocking. Do not
  expect its HTML to be droppable (CSP `style-src 'self'` + no repo state).
- **Never** use a mock to validate: pen/palm, ink latency, snapping feel, the mu↔pt invariant,
  atomic writes, or PWA offline lifecycle.

---

## 10. The decision package — close before code

Each item is a `docs/DECISIONS.md` entry (plus a doc fix where noted). None requires a mockup.

| # | Decision | Why it must precede code | Recommended resolution |
|---|---|---|---|
| **D1** | **Freeze the layout box model** | Canvas view rect + stage transform feed zoom/pan, hit-testing, loupe placement and export; every screen-px constant in `U §8.1/§8.3` derives from it | Freeze: rail 128 (Field) / panel 72↔280 side / 72 bottom / top bar 52 editor, 56 Home·Project / dock threshold 1.2 inclusive / canvas 1240×908 landscape. Correct `U` for C2/C8 first |
| **D2** | **Target-size × density × theme × text-scale matrix** | Sunlight's 64px floor overrides both densities; components must be authored at the largest case | Author components at **64px** and scale down. Field = 56, Desk = 48, Sunlight = 64 floor. Pin the 100/125/150% reflow rules |
| **D3** | **Width readout unit (mu vs pt)** | Touches domain correctness, the strings table, the width ladder, scrubber ticks and the Style Chip formula | **Show true paper pt** (`0.75 × mu`) and relabel the ladder, *or* show a unit-less "Width" value with "3 pt on paper" in a tooltip. Do **not** ship a control labelled "4 pt" that prints 3 pt |
| **D4** | **Handedness mirror matrix + keypad handedness model** | Flagship flow; the docs currently contradict each other (C3) and the keypad's centred sheet fights "digits cluster to the writing hand" | Follow `U §5.1/§14.8`: right-handed → rail **right**; left-handed → rail **left**. Fix the `IP 1.4.5` test row. Enumerate all six mirror rules explicitly |
| **D5** | **Base token set beyond the pinned colours** | Everything else references it; CSP means one stylesheet, so renames are global | Emit one self-hosted `tokens.css`: CSS custom properties for spacing (2/4/6/8/12/16/24/32), opacity/scrim set, z-index scale, 3–4 named shadows, motion durations/easing, focus-ring recipe |
| **D6** | **Copy for trust surfaces** | Settings ships in slice **0.3**, i.e. first; the Autosave chip is "the most important 200 pixels in the app" (`U:738`) and has no body copy | Write: Settings labels, Autosave five-state explanations, confirm-dialog titles/bodies, capture toggle labels, keypad offline note. Source from `docs/appendix-strings.md`; fill its gaps |
| **D7** | **Resolve the contradiction register (§11)** | C1–C6 are real defects; fixing them later means a migration or a re-layout | Apply the recommended fixes to the owning canonical doc + `DECISIONS.md` |

---

## 11. Contradiction register (verified against canonical docs)

> **Application status (2026-09-21 — commit `5fa9515`, authored by the repo owner):**
> **C1–C10 and C13 are APPLIED** to `ui-spec-field-measure-v2-hardened.md` and
> `implementation-plan.md`, with **D32–D34** recorded in `DECISIONS.md` alongside
> (D32 rail follows handedness, D33 width readout in true paper points, D34 hosting).
> The rows below are therefore the **record of what was found and done**, not an open to-do list.
> **Still open: C11, C12, C14.**

| # | Issue | Where | Recommended fix |
|---|---|---|---|
| **C1** | **Shutter is 64px and 88px.** `U:42` lists 64 for "shutter, dialog primaries, destructive confirm"; `U:47` lists 88 for "camera shutter"; `U:790` says 64; `U:627` says 88 with an 88→80 press scale | `U §2:42,47`, `§14.5`, `§10.1` | **88 wins for the shutter** (capture is the only screen with no budget pressure, and §10.1 defines the press animation). Correct `§2:42` and `§14.5` to "dialog primaries / destructive confirm = 64; shutter = 88" |
| **C2** | **Desk rail width is impossible.** Desk = "48px controls, **64px rail**", but the rail is a 2-column grid by non-negotiable #2. `2×48 + 6 gutter + padding = ~108`, not 64. 64 fits only a single 48px column | `U §3.5` vs `§6.2` | Set **Desk rail ≈108px** (`2×48 + 6 + 3+3`). Keep 2 columns — a 1-column Desk rail cannot hold 14 tools + undo/redo |
| **C3** | **Handedness direction is inverted between documents.** `U`: right-handed default → rail on the **right**; left-handed mirrors → rail **left**. `IP 1.4.5` test: `handedness 'left'` → "rail renders on the **right**" | `U §5.1, §14.8` vs `IP:826` | Fix the **plan test** to match `U` (rail on the writing-hand side). The ergonomic thesis requires it |
| **C4** | **Loupe geometry stale in the UI spec.** `U:463` says a 160px window showing an 80×80px source at 3.5× — an 80px source in a 160px window is 2×, not 3.5× | `U §8.1` vs `P §19.5` | **Already fixed in `P §19.5`** (magnification 3.5×, `source = diameter / 3.5` ≈ 45.7px; **verified**, `P:60`). Update `U §8.1` to cite §19.5 rather than restate numbers |
| **C5** | **Sub-48px exception count disagrees.** `U:422` says the 44px swatch grid is "the one place we go below 48px"; `U:791` sanctions **two** (44 swatch + 40 Recents); the per-slice a11y gate says 44×44 minimum with no exception | `U §7.3, §14.5`, `P §19.6`, `IP:47` | Raise **Recents chips to 44px** and keep "no third exception". Alternatively annotate the a11y gate explicitly — do not leave the gate silently false |
| **C6** | **Width readout unit is wrong by 25%.** Panel shows `«4 pt»`; `DEFAULT_STYLE.strokeWidthMu = 4`; physical = `0.75 × mu` → the printed line is **3 pt** | `U §7.2:388` vs `P §4.2, §3.3:301` (**verified**) | See **D3**. Fix the unit or the ladder; do not ship the mislabel |
| **C7** | **Radial wedge angles.** `U §6.4` says 44° wedges; `P §20.6` says 8 × 45° with a 1° drawn gap, hit-test the full 45° | `U §6.4` vs `P §20.6` | Document as drawn-44° / hit-45°. Cosmetic; pin it so it isn't "fixed" later |
| **C8** | **Top bar height differs by screen** — Editor 52px, Home/Project 56px | `U §5.1` vs `§11.1/§11.2` | Make height a `<TopBar>` variant (or unify). Affects D1 |
| **C9** | **Autosave chip position** — `U:220` says "Center"; `U:738` says "center-right" | `U §5.2` vs `§13.1` | Pick **center** (`§5.2`'s zone table is authoritative for layout) and fix `§13.1`'s prose |
| **C10** | **Canvas number readout is a range with no rule** — "JetBrains Mono 16–28" | `U §3.3` | Define the mapping (value length? role? zoom?) before the string table is frozen |
| **C11** | **`--sel` cyan is both the focus ring and the selection/manipulation colour** | `U §3.1, §14.9` | Differentiate by treatment: focus ring = 2px cyan + offset; selection = 2px cyan bbox + 4px glow. Resolve deliberately or accept the ambiguity in writing |
| **C12** | **`--hi` orange is both the UI accent and the default dimension stroke** (`DEFAULT_STYLE.strokeColor = '#FF7A18'`) | `U §3.1` vs `P §3.3:301` (**verified**) | Deliberate, and contexts differ (chrome vs canvas). Accept and record; verify legibility on bright and dark photos |
| **C13** | **Two different Esc ladders.** `U §4.2`: pending → deselect → back. `IP 1.4.5`: pendingOp → selection → exit Focus | `U §4.2` vs `IP:805` | Publish one: **pending → selection → exit Focus → navigate**. Keyboard help must match behaviour |
| **C14** | **Unquoted copy.** Settings screen, sort options, search placeholder, panel headers (`COLOR`, `WIDTH`), first-run card labels, capture toggle labels | `docs/appendix-strings.md` gaps | Fill the strings appendix; it is the contract for `src/ui/strings.ts` (`AGENTS.md`) |

---

## 12. Handoff pack for Claude Design (if used)

**Purpose:** obtain *chrome layout alternatives* for human decision. Not validation. Not production
code. Time-boxed; discard freely.

**Inputs to attach:**
1. `docs/ui-spec-field-measure-v2-hardened.md` §3 (tokens), §5 (layout), §6 (rail), §7 (style panel),
   §8.1 (keypad), §10.1 (capture), §11 (Home/Project), §12 (export).
2. `docs/appendix-strings.md` (real copy — do not let the tool invent words).
3. The exact canvas sizes: landscape 1440×960 (DPI-scaled 200%, i.e. CSS 1440×960), portrait
   960×1440, Desk 1200×800.

**Ask for exactly:** 2–3 layout directions per surface, at the two real viewports, dark graphite,
class-based CSS (no inline styles), with the canvas area as a **flat placeholder** labelled
"canvas — not designed here".

**Acceptance:** renders the fixed px geometry faithfully; uses the 12-swatch palette and the
orange/cyan discipline; no invented copy; no claim about gesture/ink behaviour.

**Forbid:** any representation of pen/palm behaviour, ink, snapping, export fidelity, offline storage,
or the keypad's live-parse behaviour. No "this is how it will feel" claims.

**Do not expect:** droppable HTML (CSP `style-src 'self'` blocks inline styles), repo integration, or
state persistence. Treat output as a picture, not an artifact.

---

## 13. Touch-first requirement — gap analysis (NEW, 2026-09-21)

**The requirement (from the product owner):** the app will be used **primarily with touch**; pen
support is a bonus. Drawing a dimension should be **tap point A, tap point B** → the dimension string
and arrows are dropped between them. The placed dimension is then **selectable and draggable with one
finger**.

**This is a scope change, and it inverts a documented non-negotiable.** It must land in the build spec
and the UI spec with `DECISIONS.md` entries — not in a plan silo.

### 13.1 What the current docs require, and must therefore change

| Doc | Current rule | Conflict |
|---|---|---|
| `U §1.1` | "**Pen draws, finger navigates.**" — called *"the single biggest protection against palm and glove smudges."* Finger drawing is an **off-by-default** Settings toggle | Touch-primary inverts the default; the palm-rejection rationale weakens |
| `U §8.1` | Dimension = pen-down at A → drag → pen-up at B | **Tap-tap placement is not specified** |
| `U §5.4` | "Pan: **one-finger drag** (when Pan tool active or with the Pan modifier); two-finger drag always" | One-finger drag-to-**move an object** collides with one-finger drag-to-**pan** |
| `P §8.2` | Pointer routing + palm window (1.2s after any pen event, plus the whole stroke) | Designed on the assumption a pen is present |
| `U §8.3` | **Polygon is tap-by-tap** vertex placement | ✅ **Precedent exists** — tap-tap is already a sanctioned placement grammar in this app |
| `U §8.6` | Tap selects; drag body moves; 8px hit slop; 56px invisible handle targets | ✅ Reusable as-is for finger drag |

**Nothing here needs new architecture.** Pointer routing already branches on `pointerType`;
tap-by-tap is already a pattern (Polygon); the loupe, snapping, hit slop and 56px targets already
exist. What changes is **defaults, gesture grammar, and conflict resolution** — not a rewrite.

### 13.2 The three hard problems

1. **Accuracy — the biggest risk.** A fingertip is less precise than a pen tip, and this is a
   *measurement* app; misplacement is the product's core failure mode. Tap-tap helps materially
   (discrete, intentional, interruptible), but the endpoint still lands where the finger landed.
   Existing mitigations to lean on: the **loupe** (`U §8.1`), **snapping** to endpoints/corners within
   20px, a **confirm-or-adjust** step before commit, and **drag-to-refine** after placement.
2. **Palm rejection with no pen signal.** If touch is primary, there is no pen event to suppress
   touch against. Tap-tap is *far* more palm-tolerant than drag — a resting palm rarely produces two
   clean taps at two distinct points — but it is not free. Options: keep the pen as a suppression
   signal *when one is present*; add a touch-only heuristic; or accept the risk and lean on undo/refine.
3. **One-finger drag: move vs pan.** Needs a deterministic, testable rule. Proposed: object under the
   touch point → drag the object; empty canvas → pan. Two-finger pan always remains the escape hatch
   (`U §5.4` already guarantees it).

### 13.3 Product decisions — **RESOLVED (2026-09-21)**

- **F1 — Touch is the primary input.** *"Finger draws" defaults **ON**, with the pen as an
  enhancement.* The palm-suppression window stays active whenever a pen is detected (a pen event still
  suppresses touch), but the app must be fully usable with touch alone. This **inverts `U §1.1`'s
  default** and requires the copy/rationale update noted in §13.1.
- **F2 — Tap-tap placement applies to every placement tool.** Dimension, Angle, Line, Arrow,
  Rectangle and Ellipse all support tap-A / tap-B creation; press-drag-release remains available for
  users who prefer it. This generalises the Polygon tool's existing tap-by-tap model.

**Consequences that follow from these two answers (to be reflected in the spec changes):**
- The **"Pen draws / finger navigates"** principle (`U §1.1`) becomes **"Touch and pen both draw; the
  pen adds pressure, tilt and hover"**, and the two Settings toggles are re-framed.
- **Every pen-hover affordance needs a touch equivalent** — `U §14.6`'s hover tooltips and
  erase-preview have no touch analogue (`U §1.7` already forbids gesture-only actions; the same logic
  now applies to *hover*-only affordances).
- **The palm-rejection design is materially weaker** and must be re-derived (§13.2 problem 2). The
  `P §8.2` window assumes a pen is present.
- **The loupe becomes more important and more problematic.** §7.3 finding 2 already flags the
  draw-time transient loupe as a market deviation; under finger placement it also occludes the exact
  point being touched. This is now the top interaction risk in the change.
- **Measurement-accuracy safeguards become mandatory, not optional** (§13.2 problem 1).
- An explicit **"Touch writing" / "pen only"** toggle should be added (see §7.3, deviation 5).

### 13.4 Impact inventory (audit complete, line-referenced)

**⚠️ Critical architectural finding — there is no palm rejection at all in a touch-only session.**
The input router sets `lastPenAt` **only** when a pen event fires (`P:1463–1484`, `P:1496`,
`IP:312–315`, `U:258`). With no pen present, `lastPenAt = 0`, so roughly 1.2 s after page load
**every touch classifies as `'navigate'`** — the palm window never closes because the clock was never
started. The entire palm-rejection design is predicated on a pen being present. **This must be
redesigned, not merely re-defaulted.** Any touch-primary plan needs a second, pen-free rejection
mechanism (contact-patch geometry, edge/dead-zone rejection, or multi-touch debounce — `lib-4` is
researching this).

**Scale of the change:** the audit found **22 hard contradictions** across `P`, `U`, `IP`,
`DECISIONS.md` and the strings appendices, plus roughly **90 further assumptions** marked
"needs change" (they survive the shift but must be re-derived).

| Doc | What must change |
|---|---|
| **`P`** (build spec) | §1 product definition ("Surface tablets **with a pen**"), §8.2 the entire `classify` contract, §8.4/§8.6 tool gestures, §2.4 radial barrel-gating, §11.9 Settings, §13 slice-0.2/1.5/1.6 acceptance, §14 gates |
| **`U`** (UI spec) | **§1.1 the core principle** (the inversion), §5.4 pan rule + palm window, §6.3/§14.6 hover affordances, §7.2/§7.3 pressure controls, §8.1/§8.3 placement grammar, §8.6 move, §14.7 palm, §14.8 handedness semantics |
| **`IP`** (plan) | slices **0.2, 0.3, 1.3, 1.5, 1.6**; the `classify` truth table; the §0.2 and §1.6 gates |
| **`DECISIONS.md`** | new/updated ADR rows for **M4** (input router), **M6** (handedness), and the §1.1 principle |
| **`appendix-strings.md`** (+ gaps) | `settings.penOnly`; hover-only tooltip labels; every per-tool placement tip (currently "Draw from A to B", "Drag to draw a line", "Draw with the pen") |
| **`HARDWARE-TEST-CHECKLIST.md`** | H1 palm gauntlet, H9 pen pressure, and the "Surface **with a pen**" framing |
| **`CHECKPOINTS.md`** | *Correction (from the ledger lane):* the 0.2 palm-gauntlet and 1.6 pressure rows are in the **implementation plan**, not in `CHECKPOINTS.md` — that file had no such rows. Now added as **C8** (0.2, touch-primary palm gauntlet), **C9** (1.6, pen-only pressure, non-blocking), plus a new **C10** (touch placement accuracy) |

**Tests and gates that break outright:**
- the `classify` truth table (`IP:312–315`) — pen/touch rows invert
- the 0.2 gate *"Pen draws a line; finger pans"* and the *"palm gauntlet"* (`IP:320–321`)
- 1.5's *"A→B commit-on-penup"* (`IP:867`)
- 1.6's *"pressure actually varies"* test (`IP:956–959`) — **unreachable from a finger**, because
  `pressure` is a pen-only signal (a parallel array filled from pen input)
- 1.6's gate *"Every tool draws with the pen"* (`IP:965`) and *"hard-pressed stroke is visibly
  wider"* (`IP:969–970`, H9)

**Gesture-grammar gaps — no tap equivalent exists today:** Dimension; Line / Arrow / Rectangle /
Ellipse (all "shared drag-to-size", `IP:917/934`); Angle (vertex **and** first ray are drags — only
the second endpoint already accepts a tap); object move; point/endpoint editing; marquee select;
handle scale/rotate.

**Already tap-ready (no change needed):** **Polygon** (the sanctioned precedent), Text, Image inset,
select-by-tap (8px slop, 12px on thin strokes), the 56px invisible handle targets, two-finger
pinch/rotate, double-tap fit↔100%, long-press reorder/options, and the whole 44/48/56/64/72px target
ladder.

**Superseded docs — do NOT edit when the change lands:** `docs/ui-spec-field-measure.md` and
`docs/preflight-handoff.md` carry the same pen-first text but are superseded by the `-hardened` files.

### 13.5 Sequencing — this change is cheapest right now

The touch inversion lands almost entirely inside **slice 0.2 (input spike)** and the slices it feeds
(0.3 Settings, 1.3 canvas, 1.5/1.6 tools). **0.2 has not started, and no code exists.** That makes
this the single cheapest possible moment to make the change: it costs spec edits plus `DECISIONS.md`
rows, not a refactor. If it were deferred until after 1.5, it would be a rework of the input router,
every placement tool, the acceptance gates, and the hardware checklist.

**Recommended order:** fold the touch change into the **§10 decision package** and apply it *before*
slice 0.1, so 0.2's spike validates the touch-first router rather than the pen-first one.

### 13.6 Touch-first interaction model — **DESIGNED**

Full design: **`docs/touch-first-interaction-model.md`** (a standalone, implementable proposal).
Its load-bearing decisions:

| Decision | Resolution |
|---|---|
| Core thesis | *"Touch taps and moves. Pen draws. Both create geometry."* The **tap becomes the primary verb** |
| Placement machine | **One** `PlacementController` + a per-tool descriptor (2 / 3 / open taps). A pen drag and a finger tap are the **same** machine — down = A, up = B, provisional between. No second code path for touch |
| Tap-B ordering | Geometry commits immediately; a **450 ms settle window** opens with a live HUD; the keypad auto-opens **only if no contact occurs** during it. Any contact cancels the auto-open permanently for that placement. Zero extra taps when confident, full correction window when not |
| Accuracy | Touch loupe (**200px, 4×, 136px offset**, contact disc, dashed leader, freeze-on-lift 700 ms); snapping acquire **32px → lock 20px**, default **Strong**; **Offset Nudge Pad** (120px pad 96px away, 0.35× core / 1.0× outer) so refinement **never covers the point**; handles 28px visual / **72px hit** |
| Drag rule | **Object-first** via a testable predicate; two-finger drag always pans; a second finger cancels the drag **and restores the prior position**; the Pan tool overrides unconditionally |
| Tap precedence | Overlay → pending placement → already-selected object → unselected object (**selects**) → empty canvas. So a stray tap while a creation tool is armed **selects instead of creating** — the safe failure |
| Stroke tools | Erase-object is fine (tap-to-delete + undo toast); **stroke-split erase is pen-only**; freehand is opt-in behind a toggle; **Highlighter gains a straight-line tap-tap mode** and becomes the touch-native stroke tool |
| Feedback | **Visual only — no haptics.** Surface has no haptic actuator and Slim Pen 2 haptics are not web-drivable. Loupe ≤16 ms, anchor-pin collapse 90 ms |
| Gesture budget | Single tap · double tap · long-press · two-finger tap · one-finger drag · two-finger drag — one job each per context. No three-finger gesture, no edge swipes |

It also lists the exact spec edits and ~15 new strings, and names the three things **honestly worse on
touch**: fine endpoint placement (the label can be right while the line is wrong), freehand
expressiveness, and stroke-scoped erasing.

### 13.7 Touch research findings & reconciliation (`lib-4`)

**The reframing that de-risks the whole change.** Because FieldMeasure measurements are **typed
feet-inches values, not scale-calibrated distances**, a placement error does **not** change a measured
number — it only changes *where the dimension anchors and which feature the arrow/label visually
attaches to*. That makes finger-first placement defensible for v1 in a way it would not be for a
calibrated CAD takeoff tool. This does not make anchor placement free, but it moves the failure from
"wrong number" to "wrong-looking drawing" — a materially smaller blast radius, and one the safeguards
below address directly.

**Evidence that tap-tap is the right verb:**
- A CHI 2024 study found tap is **at least as accurate as swipe/drag per point**, with swipe showing
  "longer operation times, higher error rates, and significantly shifted touch points"
  (DOI 10.1145/3613904.3642272). Drag also adds a failure mode tap does not: unintended movement of
  the first point.
- Finger precision is ~**0.94 mm (1D) / ~1.5 mm (2D)** σ (FFitts Law), with ~**12 % error at 5 mm
  targets** and **28–46 % at 3 mm** — so the spec's existing generous targets (56px ≈ 10.7 mm;
  handles at a 72px hit under touch) are correctly sized.
- The dominant error is **systematic, not random**: the reported point is the *contact centroid*,
  offset from the intended point by posture and user, explaining **67 %** of "fat finger" inaccuracy
  (Holz & Baudisch). **Windows exposes no intended-point or calibration API**, and browser
  `PointerEvent.width/height` **default to `1`** when the hardware cannot report contact geometry — so
  the offset **cannot be corrected in math**. It must be corrected in the UI: snap, loupe, nudge.
- Snapping to existing geometry is the established industry answer (AutoCAD object snaps exist to
  *"ensure accuracy"*); it is the highest-leverage accuracy aid available and costs almost nothing.

**Palm rejection without a pen — the hard truth.** This cannot be solved deterministically:
- W3C Pointer Events 3 states plainly that while devices may ignore touch during pen use,
  **"it is not possible for authors to suppress this behavior"**, and that detecting these scenarios is
  **out of scope for the specification**.
- Contact geometry is unreliable as a palm discriminator: it is hardware-dependent and defaults to
  unknown/`1`.
- Android's own documented cookbook does **not** attempt prevention — it recommends handling
  `ACTION_CANCEL` and **keeping history so unintended palm input can be undone**.
- **Therefore:** rely on the OS/digitizer where it exists (Surface palm blocking), add edge rejection
  and multi-touch debounce as bounded heuristics, and make **undo + rollback on `pointercancel`** the
  real safety net. **Do not build a mode that silently discards input**, and do not ship a
  size-threshold palm filter as if it were reliable. Verify empirically on the target Surface model.

**Factual correction to our own spec:** there is **no 44/48/56px Microsoft "ladder."** Microsoft's
actual guidance is **40×40 epx minimum → 44×44 epx touch-optimised with ≥4 epx spacing**. Our 56px
control size is *not* a Microsoft figure — it is derived in `U §2` from **glove clearance at 267 ppi**
(56px ≈ 10.7 mm), which is a legitimate and separate justification. Record this so nobody later
"corrects" 56px by citing Microsoft, or "corrects" the glove math by citing 44px.

### 13.8 Reconciliation with the interaction model — three conflicts

The research and the interaction design agree on the substance (tool-gated placement, mandatory snap +
loupe + nudge handles, two-finger pan reserved, snapshot/restore on pinch, undo + `pointercancel`
rollback). They disagree on three rules, and the disagreement matters:

| # | Rule | `des-3` interaction design | `lib-4` research | Recommendation |
|---|---|---|---|---|
| **1** | **What a one-finger drag moves** | **Object-first** — any grabbable, unlocked object under the finger moves | **Selected-first** — only an *already-selected* object moves; a first tap on an unselected object just selects it | **Follow `lib-4`.** Silent displacement of a measurement is the worst failure this app can have, and the market convention (OneNote/Miro handle-only move; Microsoft's *"do not override common gestures"*) supports selection-first. Cost is one extra tap on an unselected object — cheap against measurement integrity. This **changes `des-3`'s predicate** |
| **2** | **Two-finger tap = add to selection** (and cancel mid-placement) | Kept, and repurposed to cancel while placing | Warns that multi-finger gestures are **OS-reserved on Windows** and two-finger tap is OS-associated with right-click; overloading is risky | **Keep, but as a secondary path only.** `U §1.7` already forbids gesture-only actions, so every action it performs must also have an on-screen control. Verify the behaviour in the spike; do not depend on it |
| **3** | **Double-tap = fit↔100% vs single-tap placement** | Split by hit-test; placement preempts so placement is never deferred | Avoid double-tap zoom **on the placement surface**; keep fit↔100% in navigation/select only; a deferred single tap would feel laggy | **They agree in effect — make it explicit:** while a placement tool is armed, **fit↔100% double-tap is suspended**; pinch remains the zoom gesture and a Fit button is always available. This avoids deferring the placement tap, which is the real hazard |

**Also carried over from the research (already satisfied by the design, keep them):** tool-gated
placement; snap-to-endpoint/edge with a distinct indicator; the magnifier/loupe during placement *and*
handle-drag; post-place nudge handles with handles ≠ body for endpoints; `pointercancel` rollback and
generous undo; no two handle hit-regions overlapping; and a published statement that a finger places an
*anchor* which is then snapped/nudged — the typed number is authoritative.

### 13.9 Status — **all lanes complete**

`lib-1` (Claude Design), `lib-2` (tooling), `lib-3` (Konva/pen), `lib-4` (touch), `des-1` (spec gaps),
`des-2` (field-app teardown), `des-3` (touch design), `exp-1` (docs audit) — all returned and are
reconciled into this document and `docs/touch-first-interaction-model.md`.

---

## 14. Final consolidated verdict

1. **Do not commission a pre-implementation design phase.** The visual system is already specified far
   beyond what a mockup would add. Close the §10 decision package and the §11 contradictions instead
   — ≈2 days of doc edits, not weeks of design.
2. **Use Claude Design for nothing that ships.** Its output cannot even be dropped in (CSP
   `style-src 'self'` blocks inline styles; it emits Tailwind/inline-styled HTML; no repo state). An
   optional, time-boxed chrome moodboard is defensible for stakeholder review; treat it as a picture,
   never as validation.
3. **Your GUI/UX regression tooling already exists and is already paid for.** `@playwright/test` is
   pinned. Assert exact computed geometry at both real viewports/DPR 2, baseline the canvas at 1×/4×/8×,
   drive synthetic pen input through CDP, and **enforce the CSP as a test**. Skip every AI/cloud
   generator and every cloud visual-regression service.
4. **The touch-first change is sound, and it is cheapest right now.** The typed-measurement
   reframing lowers its stakes; tap is at least as accurate as drag per point; tap-tap was already
   sanctioned by the Polygon tool; and 0.2 (the input spike) has not started. Deferred past slice 1.5,
   it becomes a router + every-placement-tool + gates + hardware-checklist rework.
5. **Three safeguards are mandatory, not optional:** snap-to-feature, the loupe/offset lens, and
   post-place nudge handles. Without them, touch placement produces drawings that look authoritative
   while pointing at the wrong feature — risk #1 in the interaction model.
6. **Browser palm rejection without a pen is not deterministically solvable.** Say so in the docs.
   Lean on the OS, edge rejection, debounce, and undo — and never build a mode that silently discards
   input.
7. **Sequence:** apply the decision package + contradiction fixes + the touch-first spec change
   **before slice 0.1**, so the 0.2 spike validates a touch-first router. Then build exactly as the
   plan already sequences — the plan's risk ordering (spike → domain → storage → canvas → chrome) was
   right before this review and is right after it.
8. **What to hard-code now, before wiring:** one self-hosted `tokens.css` of CSS custom properties
   (spacing scale, opacity/scrim set, z-index scale, named shadows, motion, focus recipe); the frozen
   layout box model constants; the string table skeleton; and the two new touch toggles' defaults.

### 14.1 Open items requiring your decision

| # | Decision | Recommendation |
|---|---|---|
| D-a | One-finger drag: object-first (`des-3`) or selected-first (`lib-4`)? | **Selected-first** — §13.8 conflict 1 |
| D-b | Keep two-finger tap as a secondary gesture, or drop it? | **Keep as secondary**, verify on hardware |
| D-c | Apply the canonical-doc updates now (P, U, IP, DECISIONS, strings, hardware checklist, checkpoints)? | Yes — per §13.5 they belong before slice 0.1. **Not yet applied; awaiting your go** |

---

## Appendix A — Do not mock (deferred / cut in v1)

Calibration sub-flow, `≈` on dimensions, "Keep measured…", "Not calibrated" chip, calibrated rulers,
polygon ≈sq ft area; metric keypad; auto-enhance; dimensions-summary page; flatten/vector-PDF options;
import-project bundle card; duplicate project; **Rotate sheet**; sheet templates; rail-side override /
pin order / Quick Pair / bottom rail (**verified**, `P §2.4:206–231`, `U §6.5`).

## Appendix B — Screen & surface inventory

**Full screens (v1):** First-run ×2 (handedness, projects folder) · Home/Projects · Project/Sheets ·
Editor · Capture · Capture review · Settings · Export wizard (**verified**, `U §4.1`, `§4.4`, `§10.1`,
`§11`, `§12`, `P §20.5`).

**Persistent chrome:** Top bar · Tool rail · Style panel/bar · Style Chip · Zoom pill · Storage/
Autosave chip.
**Transient:** Loupe · Dimension keypad sheet · Angle commit sheet · Selection mini-toolbar · Layers
flyout · History flyout · Style editor sheet · Inset picker sheet · Crop overlay · Confirm dialog ·
Replace-photo dialog · Toast · Radial quick menu · Per-tool options popover · Custom colour/eyedropper
popover · Project settings sheet · Trash list/preview · Hint chips · Camera fallback · Origin-change
guard · SW update toast · Second-tab notice (**verified**, `U §5–§13`, `P §19–§21`).

## Appendix C — Sources

- **Internal (verified in-repo):** `docs/preflight-handoff-v0.3-hardened.md`,
  `docs/ui-spec-field-measure-v2-hardened.md`, `docs/implementation-plan.md`,
  `docs/CONTINUITY.md`, `docs/BUILD-LOG.md`, `docs/INDEX.md`, `docs/appendix-strings.md`.
- **External (independently re-verified):** TechCrunch 2026-04-17; VentureBeat; Adweek;
  `anthropic.com/news/claude-design-anthropic-labs`; `support.claude.com` (get started with Claude
  Design); `claude.com/blog/claude-design-stays-on-brand-for-daily-work`.
- **Reported, not yet canonical:** specialist lane findings on token gaps, component state gaps, the
  contradiction register, and the Claude Design capability matrix.
