# Field Measure — Pre-flight Handoff & Implementation Plan (v0.3, hardened)

> **Status:** Pre-flight. No functional code exists yet. Reference code in Part 3+ is a build anchor, not finished code — treat it as the required starting point and verify library versions/APIs when installing packages.
> **Version:** 0.3-hardened **+ session-4 addendum + touch-primary addendum** (September 21, 2026). Round 4 was a senior adversarial + architecture review; it re-executed this document's reference code and found defects that survived rounds 1–3. Code-level fixes are marked `SESSION-4 FIX (…)` in place; new normative rules are in **§5.8** and **§19**; the full finding register is `docs/review-session-4-hardening.md`. **Round 5 (touch-primary inversion):** touch is now the **primary input** and the pen enhances it — see the round-5 changelog below and §8.2. Base version note follows.
> **Version (base):** 0.3-hardened (September 21, 2026) — supersedes `preflight-handoff.md` v0.2. This revision incorporates the adversarial review (findings B1–B5, M1–M13, Minors 1–6): corrected export math, keypad input model, inset child coordinate space, FSA API corrections, validation fixes, and build-plan gaps. Library versions verified against the npm registry on 2026-09-21.
> **Audience:** the AI builder. This document is written to be followed end-to-end with zero judgment calls. Anything a builder might reasonably guess at is spelled out here.
> **Companion:** `docs/ui-spec-field-measure-v2-hardened.md` (detailed UI/UX, v2 hardened). Where the two disagree, this document wins on architecture and data; the UI spec wins on visual presentation and interaction feel. **The v1 scope table (§2.4) wins over both** — it is the single authority on what is built in v1.

---

## Changelog v0.2 → v0.3 (what was hardened, and why)

| # | Change | Finding fixed |
|---|---|---|
| 1 | Export scaling model fully redefined: strokes `strokeWidth = mu × M`, text `fontSize = mu` (no counter-scale), freehand `getStroke size = mu`, PDF page pt = `imagePx × 0.75`, embed at 96×M dpi. Physical stroke/font = `0.75 × mu` pt at every M. The old §9.2 code (page = bitmap px) was wrong. | B1 |
| 2 | Keypad input model specified: slot state machine + lenient tokenizer (`parseImperialLoose`) layered over the strict parser. `12 6` → `12'-6"`, `12 6 3` → `12'-6 3/16"` (denominator = project precision, cyclable). | B2 |
| 3 | Inset child coordinate space defined: children stored in the **inset asset's working-image px**, crop is a rect in asset px applied before the group transform, children never rewritten on inset transform. | B3 |
| 4 | New §2.4 **v1 scope table** — the definitive in/deferred/cut list resolving every doc-vs-doc scope contradiction (calibration, vector PDF, auto-enhance, Explorer integration, replace photo, …). | B4 |
| 5 | `FileSystemDirectoryHandle.move()` removed from rename (not implemented in Chromium — throws). Rename = rewrite `project.title` only. `FileSystemFileHandle.move()` confirmed shipped (POSIX overwrite semantics since M109). | B5 |
| 6 | **All** disk writes (photos, assets, thumbs, exports — not just JSON) go through tmp→close→`move()`. Truncated-photo detection at load. | M1 |
| 7 | Zod schema uses `.nullish()` on optional fields (matches TS types); `JSON.parse` guarded; `.history/_project/` added so `project.json` corruption is recoverable. | M2 |
| 8 | Two-tab lock + BroadcastChannel names are **per-project** (`fm:project:<id>`) — different projects in two tabs no longer conflict. | M3 |
| 9 | Input router: palm window refreshed by every pen event; touch ignored unconditionally while a pen stroke is active; single-finger pan always (default). | M4 |
| 10 | `label` is **derived-only** (never persisted, removed from schema) — eliminates stale labels after precision/unit changes. | M5 |
| 11 | Handedness first-run is a plain question (default Right) — the Windows pen-setting is not readable from a web page. | M6 |
| 12 | Replace photo: markup kept only when the new working image has identical dimensions; otherwise explicit warned choice. Sheet-card "Rotate" cut. | M7 |
| 13 | Capture resolution toggle shows the **device's real max** (getUserMedia caps ≈ 1080p–4K on Windows); verified in the input spike. | M8 |
| 14 | Build plan adds slices 0.3 (first-run/settings/Home shell) and 1.4 (Capture flow); handedness lands before the loupe consumes it. | M9 |
| 15 | Persisted undo = `.history` snapshots (one mechanism, not two). In-memory undo = 100 command steps. | M10 |
| 16 | Precision is project-level; the Dimension panel edits the project value; `unitFormat` added to project + `formatLength` implements ft-in/in/ft-decimal. | M11 |
| 17 | lucide-react pinned (1.47.x verified to exist) for chrome icons; the 14 tool glyphs are bespoke SVG (UI spec requirement). | M12 |
| 18 | `fflate` added to the fixed dependency list for PNG zip (already a transitive dep of @cantoo/pdf-lib — now pinned explicitly). | M13 |
| 19 | perfect-freehand correction: `getSvgPathFromStroke` is **not exported** by the package — a local helper is specified. Ink `size = strokeWidthMu` (the old `× 2` doubled ink width); outlines regenerated per zoom (`size = mu / stageScale`) because fills ignore `strokeScaleEnabled`. | new |
| 20 | `initStore()` reference no longer calls `requestPermission` without a user gesture; filename sanitizer hardened (trailing dots/spaces, length caps); export memory guidance + 2× default; CSP + license notices + exact pinning (`npm ci`, committed lockfile); trash restore UI specified. | Minors 1–6 |

### Changelog — session-4 hardening (round 4)

Every row below was **executed or hand-traced**, not reasoned about. Severity: 🔴 wrong
measurement or data loss · 🟠 build-blocking · 🟡 correctness/clarity.

| # | Change | Finding |
|---|---|---|
| 21 | 🔴 §6.1 test table: the unicode row `10′-4 ½″` sat in the **accepts** block asserting 124.5. Executed, it returns `null` (the vulgar fraction `½` is never normalized) — its own trailing comment already said "NOT accepted". Moved to the rejects block. This is the same bug class round 2 was created to eliminate, and slice 1.1's gate would have failed on the spec's own table. | F1 |
| 22 | 🔴 §6.1 strict parser silently flipped signs: `parseImperialToInches('-5')` returned **+5**, and `formatInches(-124.5)` → `-10'-4 1/2"` re-parses to **-115.5**. Negatives are now rejected; the ft-in separator dash is stripped only after a feet mark. | F2 |
| 23 | 🔴 §6.1.1 commit gate: `Enter` was blocked only on null/NaN, so a bare `0` committed a **0″ dimension**. New `isCommittableInches` requires `0 < v ≤ 1000 ft`. | F3 |
| 24 | 🔴 §6.1.1 `parseLooseToSlots` accepted a numerator ≥ its denominator and denominators outside the precision enum: `12 6 20` committed **151.25″** and `10' 4 99/100` committed **124.99″** — measurements the user never typed. Both now return `null`. | F4 |
| 25 | 🟠 §6.1.1 property test: the generator drew every slot from `String(Math.floor(rand*n))`, which **never produces `''`** (measured 0/2000 for each slot). The empty-slot branches — where round 1's fraction-dropping bug lived — were untested by the very test written to prevent that regression. Generator now draws `''`/`'0'`/digits, asserts composed-text **shape**, and asserts its own branch coverage. | F5 |
| 26 | 🟡 §6.1.1 a slot holding `'0'` is truthy as a string, composing junk `enteredText` like `12'-6 0/16"`, `0'-4"`, and a bare `"`. Presence now means a **positive** value, in both `composeEnteredText` and `keypadValueInches` (they must agree or the preview and the stored text diverge). | F6 |
| 27 | 🟠 §8.5 freehand: `points.map(p => [p.x, p.y, p.pressure ?? 0.5])` — `Px` has no `pressure`; it is a **parallel array**. Does not compile under `strict: true`, and any cast yields a constant 0.5, silently killing pressure/tilt ink width. Now indexes the parallel array. | F7 |
| 28 | 🔴 §5.3 `writeAtomic`'s doc comment promised "hold the per-project Web Lock for the whole write" — **the body never took a lock**. `cleanStaleTmp`'s stated safety property was therefore false. The lock is taken in `writeAtomic`, and `projectId` is a required parameter so it cannot be forgotten. | S1 |
| 29 | 🔴 §5.3 `cleanStaleTmp` iterated the **project root only**, but every tmp file this app writes lives in `sheets/<n>/` or `assets/`. Orphans accumulated forever and slice 1.2's "no `*.tmp` survivors" gate could never pass. Now a bounded recursive walk that skips `.trash/`. | S2 |
| 30 | 🔴 §5.3 `readJsonValidated` guarded only the **parse**. `getFileHandle`/`getFile().text()` throw on missing, truncated, or externally-locked files — so every I/O failure **bypassed `.history` recovery**. Now routed to recovery, with an explicit "expected absence" path for a new sheet. | S3 |
| 31 | 🔴 New **§5.8 failure states**: disk-full (never prune the user's `.history`/`.trash` to make room), locked rename target, **duplicate project ids** (near-certain, since the sanctioned sharing model is *copying the project folder*), deterministic two-tab arbitration, and the `.history` cap stated precisely (JSON only). | S4–S8 |
| 32 | 🔴 New **§19.1 origin and distribution**: v0.3 never said how the app reaches a Surface. The origin is the identity boundary for the persisted folder handle, all settings, OPFS and the SW cache — changing it later silently orphans all of them. Decided before slice 0.1 (new slice 0.0). | P4 |
| 33 | 🟠 New **§19.2 service-worker update flow**: `registerType: 'prompt'`, never auto-reload, toast suppressed mid-write/mid-measurement, queue flushed before reload (new slice 1.11). | P5 |
| 34 | 🟠 New **§19.3 asset dedupe**: required in four places with no mechanism — `sha256Hex` was defined and never called. Assets are now **content-addressed** (`assets/<sha256hex>.jpg`, `assetId` = that hash); dedupe is an existence check with no index to corrupt. | P20 |
| 35 | 🟠 New **§19.4 export**: damaged-photo sheets (undefined before) export as markup on a white page; a computed memory budget with a hard guard and a designed PDF-splitting remedy; **case-insensitive conflict detection** (NTFS: `Sheet.pdf` and `sheet.pdf` are the same file — as specified, `Overwrite` silently destroyed an unrelated export). | P7, P9, P10 |
| 36 | 🟠 §2.2/§14: §14 mandated Testing Library and slice 0.3 required component tests, but neither was in the dependency list nor installed. Dev deps added; `node-canvas` dropped in favour of Playwright for export invariance. | P3 |
| 37 | 🟠 §13: three slices added for work no slice owned — **0.0** (origin), **1.4.5** (top bar + tool rail + panel docking: the rail is "do not simplify #1" and nothing built it), **1.11** (release/update). | P1, P4, P5 |
| 38 | 🟡 §19.5/§19.6: `precisionDenominator` default stated (16); loupe geometry pinned to a formula (its three numbers were mutually impossible); `§8.7` and "slice 1.4's loupe" cross-references corrected; degenerate-angle guard; slice 2.0 given a "Done when"; accessibility moved from a final slice into every UI slice's gate. | F8, P8, P15–P19 |

### Changelog — touch-primary inversion (round 5)

**Locked product decisions (2026-09-21): touch is the primary input; the pen enhances it.** The
pre-flight input model assumed a pen was always present, so much of §8/§13 was written pen-first.
Every row below is a consequence. Design sources: `docs/gui-ux-readiness-and-design-handoff.md`
§13 (C1–C14, touch workstream) and `docs/touch-first-interaction-model.md` (§9 lists the deltas).
Severity: 🔴 wrong measurement/artifact · 🟠 build-blocking · 🟡 correctness/clarity.

| # | Change | Finding |
|---|---|---|
| 39 | 🟡 §1 product definition (`§1.1`, `§1.2` step 3, G1): "Surface tablets **with a pen**" → **pen-optional**; touch is primary and the pen enhances. The core loop opens with tap-tap. | T1 |
| 40 | 🟡 §2.4: the radial quick menu's **primary entry is the rail's press-and-hold** (all inputs); the pen barrel-button hold is an *optional accelerator*. Added the **input-model settings row** and the touch-primary defaults. | T4 |
| 41 | 🟠 §8.2 rewritten: **touch can `draw`/place**; the **two-gate palm rule applies when a pen is present**; a defined **pen-free path** (edge rejection + multi-touch debounce) is documented with its probabilistic limitation; `pointercancel` rolls back the in-progress gesture; an explicit `classify` **truth table** was added; intent is sticky at `pointerdown`. | T2, T5 |
| 42 | 🟠 §8.4/§8.5: the **touch loupe variant** (200 px / 4× / 136 px offset / contact disc / dashed leader / freeze-on-lift 700 ms); Dimension **A→B drag becomes tap-tap with a 450 ms settle window** (drag retained); Select **move is object-first drag** with second-finger restore; Erase object mode = tap-to-delete + undo toast and stroke mode is **pen-only under touch**; Angle/Line/Arrow/Rect/Ellipse/Polygon get tap-tap; finger freehand is opt-in with a fixed-width fallback. | T3, T6 |
| 43 | 🟡 §11.1/§11.4/§11.6/§11.12: the "Pen draws, finger navigates" principle replaced by "Touch taps and moves; the pen draws"; pen-hover affordances get mandatory touch equivalents; 48 px floor + 16/24 px hit slop; handedness now also drives the touch-loupe flip. | T7 |
| 44 | 🟠 §13: slice 0.2's spike gates rewritten for touch-primary (touch places, finger pans, pen-free palm path); slice 1.5 commit-on-penup → tap-tap + settle; slice 1.6's "every tool draws with the pen" and the **pressure gate** rewritten — `pressure`/`tilt` are pen-only signals and the finger path asserts a fixed-width fallback. §0.3 and the §14 test plan updated. | T8 |
| 45 | 🟡 §19.6 a11y floor 44→**48** under touch-primary (C5 exceptions unchanged at two); §20.5b Settings Input group. | T9 |

*(C6 width readout = `DECISIONS.md` D33, and C7 radial wedges — already applied to the UI spec by the repo owner; deliberately NOT re-applied here.)*

---

## Table of contents

1. [Product definition](#1-product-definition)
2. [Architecture](#2-architecture)
3. [Data model and on-disk format](#3-data-model-and-on-disk-format)
4. [Coordinate and style model](#4-coordinate-and-style-model)
5. [Storage and persistence](#5-storage-and-persistence)
6. [Domain modules](#6-domain-modules)
7. [Media modules](#7-media-modules)
8. [Editor engine](#8-editor-engine)
9. [Export](#9-export)
10. [State stores](#10-state-stores)
11. [UI/UX specification](#11uiux-specification)
12. [Repository layout](#12-repository-layout)
13. [Build plan (slices)](#13-build-plan-slices)
14. [Test plan](#14-test-plan)
15. [Rules for the AI builder](#15-rules-for-the-ai-builder)
16. [Decisions log](#16-decisions-log)
17. [Risks and mitigations](#17-risks-and-mitigations)
18. [Open questions](#18-open-questions)
19. [Session-4 hardening addendum](#19-session-4-hardening-addendum-normative)
20. [Implementation contracts](#20-implementation-contracts-session-4b--things-the-docs-referenced-but-never-defined)
21. [Resolved decisions](#21-resolved-decisions-session-4b--nothing-here-is-open-any-more)

---

## 1. Product definition

### 1.1 What it is

Field Measure is a Windows-first web app (PWA) for Microsoft Surface tablets. A field crew member takes a photo with the built-in camera, draws feet-inch dimension lines and rich markup on it, inserts additional photos within the photo (insets), and exports a marked-up PDF/PNG to a local project folder. **Touch is the primary input; the pen is optional and enhances it** with pressure, tilt and hover. The app must be fully usable with a finger and gloves alone (§8.2, §13). There is **no server, no database, no sign-in, no cloud SDK, no Bluetooth, and no multi-user**. Each Surface is fully self-contained; the user later drags the project's `exports/` folder into Dropbox manually.

### 1.2 The core loop (field dimensioning on Surface)

1. Open the app (installed PWA from Edge) and create or open a project — a folder on disk.
2. Take a photo with the Surface camera (or import an existing image).
3. Tap the **Dimension** tool. **Tap point A, then tap point B** — a magnifier loupe appears under the finger and snapping locks to nearby geometry. The pen can also draw A→B in one drag; both paths create the same geometry (§8.2, §8.5).
4. The ft-in keypad slides up after a **450 ms settle window** (a touch on the canvas inside that window cancels the auto-open and keeps the drawn geometry). Type `10'-4 1/2"` and commit.
5. Add a text note, an arrow, a shape, or an **image inset** (a close-up photo placed on top of the main photo, with its own markup).
6. Everything autosaves locally. There is no Save button.
7. Export PDF/PNG to `<project>/exports/<timestamp>/`, then drag that folder into Dropbox.

### 1.3 Goals

| # | Goal | How we know it's met |
|---|---|---|
| G1 | Dimension a photo fast with touch or pen | Median < 60 s for a photo with 4 dimensions |
| G2 | Works offline forever | No network dependency at any point; runs with the network stack dead |
| G3 | Clean professional export | PDF and PNG an estimator, fabricator, or client can read without explanation |
| G4 | Files land in the right place | Exports write to `<project>/exports/<timestamp>/`; user drags into Dropbox |
| G5 | Never lose a measurement | Autosave + atomic writes + history snapshots + trash |

### 1.4 Non-goals (explicitly out of scope for v1)

- No server, database, sign-in, or multi-user editing.
- No cloud SDKs (Dropbox, OneDrive, Google Drive, Microsoft Graph).
- No Bluetooth or laser-meter device integration (a typed-value seam only, §6.5).
- No automatic measuring from photos or AR (typed values only; reference-scale calibration is a future seam).
- No phones/tablets other than Surface; no native app stores.
- No analytics, telemetry, or AI features.
- No real-time co-editing; no public share links.

### 1.5 Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A1 | Internal tool, one company, a handful of Surfaces | No change — no shared state to scale |
| A2 | Surface runs Windows 11 with Microsoft Edge (Chromium) | FSA/pen/touch behave the same in Chrome; Firefox/Safari lack FSA (OPFS fallback covers most) |
| A3 | Default units feet-inches to 1/16"; metric optional | Data stored in mm either way, so flipping the default is cheap |
| A4 | The user types the measured value (tape/laser reading); the app does not compute length from the photo in v1 | Reference-scale calibration is a documented seam; nothing else changes |
| A5 | Each Surface is the single source of truth for its own projects | Two Surfaces editing the same Dropbox folder → last-writer-wins (§17, R7) |
| A6 | Clean-room build — no reuse of My Measures code, name, icons, or assets | Non-negotiable |
| A7 | `getUserMedia` still-image resolution on Windows tablets is capped (~1080p–4K, device-dependent), below the camera sensor's stills resolution | The capture toggle reports the device's real max; "Import from Windows Camera app" is the high-res path (§8.5 Capture, §13 slice 1.4) |

### 1.6 Users and roles

Only one role in v1: **Field editor** (PM, superintendent, designer on site) on a Surface. No office-viewer role, no admin role, no recipient accounts (recipients get a PDF/PNG, not the app).

---

## 2. Architecture

### 2.1 Big picture

A **local-first, single-device PWA**. The device filesystem is the database. React renders chrome (top bar, tool rail, style panel, overlays); an imperative Konva canvas renders the photo and markup. Everything autosaves to a per-project folder chosen once by the user.

```
┌────────────────────────────────────────────────────────────┐
│  React chrome (top bar, tool rail, style panel, overlays)  │
├────────────────────────────────────────────────────────────┤
│  Imperative Konva canvas (EditorCanvas)                    │
│   ├─ photo layer   (base image, listening:false)           │
│   ├─ inset layer   (one Konva.Group per inset + children)  │
│   ├─ markup layer  (z-banded: highlighter below, then shapes/ink/text, insets above photo) │
│   └─ transient overlays (loupe, draw preview, selection)   │
├────────────────────────────────────────────────────────────┤
│  Domain (pure TS): units, geometry, snapping, ids, schema  │
├────────────────────────────────────────────────────────────┤
│  projectStore (File System Access API) → project folder    │
│  idb-keyval (settings + persisted directory handle)        │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Stack

Versions below were verified against the npm registry on 2026-09-21. **Pin exact versions** (no `^`/`~`), commit the lockfile, and install with `npm ci` in CI.

| Concern | Pick | Verified latest (pin ≤ this) | Notes |
|---|---|---|---|
| Language / build | TypeScript + Vite + React | React 19 (19.3.0 installed — supersedes the original "React 18" plan; no React-18-only APIs are used; React 19 removes no API this app relies on) | |
| Canvas | **Konva (imperative, NOT react-konva)** | 10.6.0 | MIT; layer-per-canvas; `getIntersection` hit-testing |
| UI state | zustand + immer | 5.0.15 / 11.1.18 | `styleByTool`, editor session state |
| Validation | zod | 4.6.5 | validates `project.json`/`markup.json` on load and before save |
| Local key-value | idb-keyval | 6.3.0 | settings + persisted `FileSystemDirectoryHandle` (NOT project data) |
| PDF | **@cantoo/pdf-lib** | 2.11.1 | MIT; `pdf-lib` 1.x is unmaintained, this fork is active and drop-in |
| Freehand | perfect-freehand | 1.2.3 | **Exports only `getStroke`/`getStrokePoints`/`getStrokeOutlinePoints`** — `getSvgPathFromStroke` is NOT exported; use the local helper in §8.5 |
| Zip (PNG export) | fflate | 0.8.3 | `zipSync()`; also a transitive dep of @cantoo/pdf-lib — pin it explicitly since we import it directly |
| Icons | lucide-react | 1.47.0 | **Chrome icons only.** The 14 tool glyphs are bespoke SVG paths (UI spec §3.4) |
| Tests | Vitest + Playwright | | units/geometry/snapping are pure → must be unit-tested |
| PWA | vite-plugin-pwa | 1.3.0 | precache app shell + fonts; **never cache user photos** |

**Fixed runtime dependencies** (do not add without updating this document): `react`, `react-dom`, `konva`, `zustand`, `immer`, `zod`, `idb-keyval`, `@cantoo/pdf-lib`, `perfect-freehand`, `lucide-react`, `fflate`. Use `crypto.randomUUID()` for ids — no `uuid` package.

**Supply-chain rules (mandatory):**
- `npm ci` with a committed lockfile in CI; exact versions in `package.json`.
- A `THIRD-PARTY-NOTICES.md` file listing every runtime dependency's license (MIT/BSD notices must survive distribution). Regenerate on dependency change; CI checks it exists.
- CSP served with the app (PWA header or meta): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. `blob:` is required for camera/import preview and canvas export; nothing else.

### 2.3 Layer responsibilities

| Layer | Responsibility | Tech |
|---|---|---|
| UI | Screens, toolbars, keypad, dialogs | React + TypeScript |
| Editor engine | Drawing, hit-testing, pen/touch input, loupe, undo/redo, zoom/pan | Konva (imperative) |
| Domain | Pure logic: unit parse/format, geometry, snapping, schema validation | Plain TypeScript, fully unit-tested |
| Persistence | Project folders, atomic writes, validate-on-load, recovery | File System Access API (+ OPFS fallback) |
| Platform | Camera, file import, persistent-storage request | Web APIs (`getUserMedia`, `showDirectoryPicker`, `navigator.storage.persist`) |

### 2.4 V1 scope table — the definitive feature authority

Every feature named in either document is IN, DEFERRED, or CUT here. If a UI-spec section implies a DEFERRED/CUT feature, the builder does not build it and does not leave a dead control. **This table overrides both documents.**

| Feature | Status | Notes |
|---|---|---|
| Typed dimensions (keypad, chain, cancel-keeps-stroke) | **IN** | The flagship flow |
| Reference-scale calibration (`pxPerFoot`, `«Keep measured…»`, `≈` labels, calibrated rulers, polygon `≈ sq ft` area) | **DEFERRED** | `Sheet.calibrationPxPerFoot` stays in the schema (null in v1); no UI, no `≈`. Drawn length is not converted to a value in v1. |
| Flatten-only PDF/PNG export | **IN** | §9 |
| PDF vector-overlay mode | **CUT from v1** (revisit at 1.1) | The export wizard's "flatten markup" checkbox is removed — it is always flattened |
| Dimensions summary page | **DEFERRED** | Checkbox removed from wizard |
| Image insets (one level, Focus mode) | **IN** | §8.5 |
| Style presets (`presets.json`), recents, per-tool memory | **IN** | §8.7 |
| Highlighter auto-z-below | **IN** | |
| Hold-to-shape freehand | **IN** | |
| Trash (14-day `.trash/`) with restore | **IN** | Restore UI: Home → project ⋯ → `«Trash…»` (§11.9) |
| Sheet templates | **CUT** | Presets carry most of the value |
| Metric input (keypad) | **DEFERRED** (seam kept) | Parser + schema support it; no metric keypad UI |
| Auto-enhance (levels/contrast fix) | **DEFERRED** | Review screen hides the toggle; capture review = Retake · Rotate · Use photo |
| Import project bundle (`.fieldmeasure` file) | **CUT** | Home card removed; "Open existing folder…" covers folder reuse |
| Duplicate project | **DEFERRED** | Project ⋯ menu item removed |
| Replace photo | **IN, constrained** | Markup kept only if the new working image has identical dimensions; otherwise an explicit warned choice (§8.5 Replace photo) |
| Rotate sheet (Project card menu) | **CUT** | Rotation happens only at capture-review time, before normalization |
| "Show in Explorer" / "Open folder" | **CUT as specified** | Not possible from a PWA. Replaced everywhere by `«Copy path»` + `«Reveal folder»` (= `showDirectoryPicker({ startIn: <handle> })`, which opens the OS picker rooted at the folder) |
| Radial quick menu (8 recents) | **IN** | **The rail's press-and-hold is the primary entry path** and works for every input. The pen **barrel-button hold** is an *optional accelerator* on top of it — the radial is reachable even if the pen reports no barrel button (§11.4, §20.6). Not a replacement for the rail. |
| Rulers/guides on canvas | **DEFERRED** | |
| Two-finger tap = add to selection; pinch-zoom; double-tap fit↔100% | **IN** | |
| Handedness question at first run | **IN** | Plain question, default Right. **Do not** claim to read the Windows pen setting (no web API exposes it) |
| Input-model settings (touch-first) | **IN** | Settings → Input gains the touch-primary toggles: `«Touch places and moves»` (**ON**) · `«Finger draws (freehand)»` (**OFF**) · `«Magnifier when you tap»` (**ON**) · `«Gloved touch»` (**OFF**). `«Pen only»` remains, but is **no longer the only input filter** (§20.5b, §8.2). The pen always draws; touch placement is the default. Persisted in the settings store. |
| Sunlight / Dim themes | **IN** | Token-level themes |
| Persisted undo across restarts | **IN as history snapshots** | §8.3: in-memory commands + `.history` snapshots are the only mechanisms; "undo after restart" = restore a snapshot from the History flyout |

---

## 3. Data model and on-disk format

### 3.1 On-disk layout (human-readable; drives the Home/Project UX)

```
<Project folder>/                        ← one folder = one project
  project.json                           ← project meta, sheet order, defaults, schemaVersion
  sheets/
    001-2026-09-21-1412/
      photo.jpg                          ← EXIF-baked, oriented, GPS stripped, ≤4096px long edge
      markup.json                        ← this sheet's objects[] (incl. inset children[])
      thumb.jpg                          ← 640×480 photo+markup composite, regenerated on save
      meta.json                          ← captured-at, camera model, cached dimension summary
    002-…/
  assets/
    <sha256hex>.jpg                      ← inset + shared images; the FILENAME IS the content hash (§19.3)
  exports/
    2026-09-21_1412/…                    ← the folder the user drags into Dropbox
  .fieldmeasure/
    presets.json                         ← style presets — travel with the folder when shared
  .history/
    _project/project.json                ← snapshots of project.json (recovery for whole-project corruption)
    <sheetId>/markup.json                ← snapshots (20 cap / 200 MB), corruption recovery
  .trash/                                ← soft-deleted sheets, pruned after 14 days
```

**Why per-sheet `markup.json` (not one monolithic `project.json`):**
- Edit granularity = write granularity. A 50-sheet project with freehand ink would otherwise rewrite a multi-MB file on every stroke.
- Corruption blast radius is one sheet, not the whole project.
- Home/Project never parse ink to list projects — it reads `project.json` + cached `thumb.jpg`.

Each file carries its own `schemaVersion`. Migration runs per file on load and is idempotent/tolerant of mixed versions.

### 3.2 Entities

| Entity | Where it lives | Notes |
|---|---|---|
| Project | `project.json` | id, title, jobNumber, locationLabel, unitSystem, unitFormat, precisionDenominator, sheet order |
| Sheet | `project.json` (row) + `sheets/<n>/` | id, title, sortIndex, imageWidth/Height, `calibrationPxPerFoot?` (null in v1), asset refs |
| Annotation | `sheets/<n>/markup.json` | one JSON object per mark; an inset is an annotation of type `image` with inline `children[]` |
| Asset | `assets/`, `exports/` | image files; **`assetId` IS the sha-256 hex and IS the filename** (§19.3) |

### 3.3 Domain types (`src/domain/types.ts`)

```ts
export type UUID = string;

/** Geometry is in WORKING-IMAGE PIXELS (float), not normalized 0..1, not screen pixels. */
export type Px = { x: number; y: number };

export type AnnotationType =
  | 'dimension' | 'angle' | 'line' | 'arrow' | 'rect' | 'ellipse'
  | 'polygon' | 'freehand' | 'highlight' | 'text' | 'image';

export interface AnnotationStyle {
  strokeColor: string;        // '#rrggbb'
  strokeWidthMu: number;      // markup units (§4)
  fillColor: string | null;   // null = no fill
  fillAlpha: number;          // 0..1
  lineStyle: 'solid' | 'dashed' | 'dotted';
  arrowheads: 'none' | 'start' | 'end' | 'both';
  fontSizeMu: number;         // text + dimension labels
  bold: boolean;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  strokeColor: '#FF7A18', strokeWidthMu: 4, fillColor: null, fillAlpha: 1,
  lineStyle: 'solid', arrowheads: 'none', fontSizeMu: 18, bold: false,
};

export type Geometry =
  | { kind: 'dimension'; a: Px; b: Px; labelOffset?: number }
  | { kind: 'angle'; a: Px; vertex: Px; c: Px }
  | { kind: 'line'; a: Px; b: Px }
  | { kind: 'arrow'; a: Px; b: Px; elbow?: 'straight' | 'right' | 'curved' }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; cornerRadius?: number }
  | { kind: 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'polygon'; points: Px[]; closed: boolean }
  | { kind: 'freehand'; points: Px[]; pressure: number[] }   // RAW input points, not the smoothed path
  | { kind: 'highlight'; points: Px[]; pressure: number[] }
  | { kind: 'text'; at: Px; text: string; background: 'none' | 'pill' | 'solid' | 'auto' }
  | { kind: 'image'; x: number; y: number; width: number; height: number; rotation: number;
      crop?: { x: number; y: number; width: number; height: number };   // rect in ASSET px (§8.5)
      flipX?: boolean; flipY?: boolean; opacity?: number };

export interface Annotation {
  id: UUID;
  type: AnnotationType;
  geometry: Geometry;            // geometry.kind === type
  valueMm?: number | null;       // canonical length (typed) — source of truth for dimensions
  valueDeg?: number | null;      // canonical angle (typed)
  enteredText?: string | null;   // exactly as entered, e.g. "10'-4 1/2\"" — REPARSED, never trust a cached label
  style: AnnotationStyle;
  zIndex: number;
  source: 'manual' | 'laser' | 'calibrated';   // 'manual' in v1; 'laser'/'calibrated' future
  assetId?: string | null;       // image insets reference an asset file
  groupId?: UUID | null;         // object grouping (Ctrl+G)
  locked: boolean;
  children?: Annotation[];       // image insets only — nested exactly ONE level
}

// NOTE: there is NO `label` field. Labels are DERIVED at render time from
// valueMm/valueDeg + enteredText + project precision + unitFormat (§6.1 formatLength).
// Persisting labels creates stale-measurement bugs when precision or units change.

export interface Sheet {
  id: UUID;
  title: string;
  sortIndex: number;
  imageWidth: number;            // working image size (the coordinate space)
  imageHeight: number;
  calibrationPxPerFoot?: number | null;   // future seam — ALWAYS null in v1 (§2.4)
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type UnitFormat = 'ft-in' | 'in' | 'ft-decimal';

export interface Project {
  id: UUID;
  title: string;
  jobNumber?: string;
  locationLabel?: string;        // typed site address, not geolocated
  unitSystem: 'imperial' | 'metric';
  unitFormat: UnitFormat;       // how imperial values are DISPLAYED (§6.1)
  precisionDenominator: 2 | 4 | 8 | 16 | 32 | 64;
  schemaVersion: number;
  sheets: Sheet[];
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Validation schemas (`src/domain/schema.ts`)

> **zod 4 ≠ zod 3.** Pin zod 4 and read its migration guide before writing schemas. Notable: `safeParse` returns a discriminated union (does not throw); the error param is a single `error` (not `message`/`invalid_type_error`); string formats are top-level (`z.email()`); apply defaults in code (a normalize step), not via `.default()`. Self-referential inset `children[]` needs `z.lazy()`. **Optional-with-null fields use `.nullish()`** (`undefined | null`) — plain `.nullable()` rejects `undefined` and will fail validation on objects built from the TS types in §3.3.

```ts
import { z } from 'zod';

const HEX = /^#[0-9a-fA-F]{6}$/;
const Px = z.object({ x: z.number(), y: z.number() });

export const AnnotationStyleZ = z.object({
  strokeColor: z.string().regex(HEX),
  strokeWidthMu: z.number().positive(),
  fillColor: z.string().regex(HEX).nullish(),
  fillAlpha: z.number().min(0).max(1),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']),
  arrowheads: z.enum(['none', 'start', 'end', 'both']),
  fontSizeMu: z.number().positive(),
  bold: z.boolean(),
});

export const GeometryZ = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dimension'), a: Px, b: Px, labelOffset: z.number().optional() }),
  z.object({ kind: z.literal('angle'), a: Px, vertex: Px, c: Px }),
  z.object({ kind: z.literal('line'), a: Px, b: Px }),
  z.object({ kind: z.literal('arrow'), a: Px, b: Px, elbow: z.enum(['straight', 'right', 'curved']).optional() }),
  z.object({ kind: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), cornerRadius: z.number().optional() }),
  z.object({ kind: z.literal('ellipse'), x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  z.object({ kind: z.literal('polygon'), points: z.array(Px), closed: z.boolean() }),
  z.object({ kind: z.literal('freehand'), points: z.array(Px), pressure: z.array(z.number()) }),
  z.object({ kind: z.literal('highlight'), points: z.array(Px), pressure: z.array(z.number()) }),
  z.object({ kind: z.literal('text'), at: Px, text: z.string(), background: z.enum(['none', 'pill', 'solid', 'auto']) }),
  z.object({ kind: z.literal('image'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number(),
    crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
    flipX: z.boolean().optional(), flipY: z.boolean().optional(), opacity: z.number().optional() }),
]);

export const AnnotationZ: z.ZodType<Annotation> = z.object({
  id: z.string(),
  type: z.enum(['dimension', 'angle', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'freehand', 'highlight', 'text', 'image']),
  geometry: GeometryZ,
  valueMm: z.number().nullish(),
  valueDeg: z.number().nullish(),
  enteredText: z.string().nullish(),
  style: AnnotationStyleZ,
  zIndex: z.number(),
  source: z.enum(['manual', 'laser', 'calibrated']),
  assetId: z.string().nullish(),
  groupId: z.string().nullish(),
  locked: z.boolean(),
  children: z.array(z.lazy(() => AnnotationZ)).nullish(),
});

export const MarkupFileZ = z.object({
  schemaVersion: z.number(),
  sheetId: z.string(),
  objects: z.array(AnnotationZ),
});

export const ProjectFileZ = z.object({
  schemaVersion: z.number(),
  project: z.object({
    id: z.string(),
    title: z.string(),
    jobNumber: z.string().optional(),
    locationLabel: z.string().optional(),
    unitSystem: z.enum(['imperial', 'metric']),
    unitFormat: z.enum(['ft-in', 'in', 'ft-decimal']),   // v0.3: added
    precisionDenominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
  }),
  sheets: z.array(z.object({
    id: z.string(), title: z.string(), sortIndex: z.number(),
    imageWidth: z.number(), imageHeight: z.number(),
    calibrationPxPerFoot: z.number().nullish(),
    createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullish(),
  })),
});

/** Guarded parse: corrupt JSON must return { success: false }, NEVER throw —
 *  readJsonValidated (§5.3) relies on this to reach the .history recovery path.
 *  Synchronous (zod is sync); readJsonValidated's `parse` param may be sync or
 *  async — `await` on a plain value is fine either way. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string):
  { success: true; data: T } | { success: false; error: string } {
  try {
    const res = schema.safeParse(JSON.parse(raw));
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: JSON.stringify(res.error.issues) };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export const parseProjectFile = (raw: string) => parseJson(ProjectFileZ, raw);
export const parseMarkupFile  = (raw: string) => parseJson(MarkupFileZ, raw);
```

**Migration note:** v0.2 files that contain a persisted `label` on annotations load fine — the schema ignores unknown keys (zod strips them by default). A `unitFormat` missing from an older file is filled by the normalize step (`'ft-in'`).

### 3.5 Example `project.json`

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "0199b0c3-7a1e-7c2b-9d0e-3f4a5b6c7d8e",
    "title": "Riverside Elementary",
    "jobNumber": "1204",
    "locationLabel": "1204 Oak St, Suite A",
    "unitSystem": "imperial",
    "unitFormat": "ft-in",
    "precisionDenominator": 16
  },
  "sheets": [
    {
      "id": "0199b0c4-1111-7c2b-9d0e-3f4a5b6c7d8e",
      "title": "Kitchen existing",
      "sortIndex": 0,
      "imageWidth": 4096,
      "imageHeight": 3072,
      "calibrationPxPerFoot": null,
      "createdAt": "2026-09-21T14:12:03.000Z",
      "updatedAt": "2026-09-21T14:18:22.000Z",
      "deletedAt": null
    }
  ]
}
```

### 3.6 Example `markup.json`

```json
{
  "schemaVersion": 1,
  "sheetId": "0199b0c4-1111-7c2b-9d0e-3f4a5b6c7d8e",
  "objects": [
    {
      "id": "0199b0c5-2222-7c2b-9d0e-3f4a5b6c7d8e",
      "type": "dimension",
      "geometry": { "kind": "dimension", "a": { "x": 820, "y": 1280 }, "b": { "x": 2920, "y": 1290 } },
      "valueMm": 3162.3,
      "enteredText": "10'-4 1/2\"",
      "style": { "strokeColor": "#FF7A18", "strokeWidthMu": 4, "fillColor": null, "fillAlpha": 1, "lineStyle": "solid", "arrowheads": "both", "fontSizeMu": 18, "bold": true },
      "zIndex": 0,
      "source": "manual",
      "assetId": null,
      "groupId": null,
      "locked": false
    },
    {
      "id": "0199b0c6-3333-7c2b-9d0e-3f4a5b6c7d8e",
      "type": "image",
      "geometry": { "kind": "image", "x": 2600, "y": 900, "width": 900, "height": 675, "rotation": 0,
                     "crop": { "x": 0, "y": 0, "width": 2400, "height": 1800 } },
      "valueMm": null, "enteredText": null,
      "style": { "strokeColor": "#2FD4E0", "strokeWidthMu": 2, "fillColor": null, "fillAlpha": 1, "lineStyle": "solid", "arrowheads": "none", "fontSizeMu": 18, "bold": false },
      "zIndex": 10,
      "source": "manual",
      "assetId": "0199b0c7-4444-7c2b-9d0e-3f4a5b6c7d8e",
      "groupId": null,
      "locked": false,
      "children": [
        {
          "id": "0199b0c8-5555-7c2b-9d0e-3f4a5b6c7d8e",
          "type": "dimension",
          "geometry": { "kind": "dimension", "a": { "x": 120, "y": 200 }, "b": { "x": 600, "y": 210 } },
          "valueMm": 914.4, "enteredText": "3'-0\"",
          "style": { "strokeColor": "#FF7A18", "strokeWidthMu": 4, "fillColor": null, "fillAlpha": 1, "lineStyle": "solid", "arrowheads": "both", "fontSizeMu": 18, "bold": true },
          "zIndex": 0, "source": "manual", "assetId": null, "groupId": null, "locked": false
        }
      ]
    }
  ]
}
```

Note: the child dimension's coordinates are in the **inset asset's working-image pixel space** (§8.5), not the sheet's space.

---

## 4. Coordinate and style model

### 4.1 The three coordinate spaces

| Space | Units | Used for |
|---|---|---|
| Working-image | image pixels (float) | **stored** — annotation geometry |
| Screen | CSS px | rendering; `screen = stage.x() + image × stage.scaleX()` |
| Paper | points (pt) | export; `pt = 0.75 × mu` |

### 4.2 The scaling rules (verified against Konva 10.6 semantics — do not "simplify" these)

The single hardest-to-discover fact in this document: **strokes and text need OPPOSITE treatments on screen vs at export.** Konva's `strokeScaleEnabled: false` keeps a stroke's width constant in output pixels (verified behavior); but `Konva.Text` (and filled paths) scale with the stage like every node. Therefore:

**On screen (stage scale `s`, geometry scales with zoom):**
1. **Strokes** (dimension lines, shapes, text halos): `strokeScaleEnabled: false`, `strokeWidth = strokeWidthMu` → constant CSS px at any zoom. ✓ nothing else to do.
2. **Text** (dimension labels, text notes): set `fontSize = fontSizeMu / s` on **every zoom change**. The glyphs rasterize under the full stage transform (smooth at any zoom, no blur). Do NOT wrap text in a counter-scaled group or `scale(1/s)` container — that rasterizes at the small size and blurs.
3. **Text halo** (dual-outline, UI spec §14.3): `stroke = 'rgba(11,14,18,.85)'`, `strokeWidth = 4` — halo width follows the stroke rules (`strokeScaleEnabled: false`).
4. **Freehand/highlighter**: perfect-freehand produces a **filled outline path in image space** — fills ignore `strokeScaleEnabled`. To keep ink at constant CSS-px width, regenerate the outline with `getStroke(..., { size: strokeWidthMu / s })` on zoom change (and on load). `getStroke` on a few hundred points is sub-millisecond; regenerate on `zoomend` and throttle during pinch. The raw points on disk never change — only the derived outline.

**At export (dedicated offscreen stage at scale `M` ∈ {1,2,3}, `pixelRatio: 1`):**
1. **Strokes**: `strokeWidth = strokeWidthMu × M` (equivalently: enable `strokeScaleEnabled` for the export render). Bitmap stroke = `mu × M` px.
2. **Text**: `fontSize = fontSizeMu` — do **NOT** apply the screen counter-scale (`/s`). Bitmap glyph = `mu × M` px.
3. **Freehand/highlighter**: `getStroke(..., { size: strokeWidthMu })` — the stage's ×M does the multiplication. Bitmap ink = `mu × M` px.
4. **Embed at 96×M dpi** → physical size = `(mu × M) px / (96 × M dpi)` = `mu/96 in` = **`0.75 × mu` pt on paper, identical at every M.** This is the acceptance invariant (test it, §14).
5. **PDF page (points) = workingImagePx × 0.75** — independent of M. A 4096-px sheet → 3072 pt page (42.7 in; the photo prints at 96 dpi — fit-to-photo by design).

```
screen:  screenX = stage.x() + imageX × s          (geometry scales with zoom)
         stroke CSS px  = strokeWidthMu             (strokeScaleEnabled:false)
         text fontSize  = fontSizeMu / s             (reset on every zoom change)
         freehand size  = strokeWidthMu / s          (regenerate outline on zoom change)

export:  offscreen stage scale M, pixelRatio 1
         stroke width   = strokeWidthMu × M
         text fontSize  = fontSizeMu                 (NO counter-scale)
         freehand size  = strokeWidthMu
         bitmap stroke/glyph = mu × M px; embedded at 96×M dpi → physical = 0.75 × mu pt ∀ M
         PDF page pt = imagePx × 0.75 ; PNG: 1× = 96 dpi nominal (2× = 192, 3× = 288)
```

### 4.3 Screen↔image conversion

```ts
// image → screen
const sx = stage.x() + ix * stage.scaleX();
const sy = stage.y() + iy * stage.scaleY();

// screen → image (pointer position, in container-space)
const p = stage.getPointerPosition();       // container-space, NOT stage-transformed
const ix = (p.x - stage.x()) / stage.scaleX();
const iy = (p.y - stage.y()) / stage.scaleY();
```

---

## 5. Storage and persistence

**All disk writes go through `src/fs/projectStore.ts` — JSON and blobs alike.** Never call `createWritable()` anywhere else. Photos, inset assets, thumbnails, and exports are exactly as precious as JSON: a truncated `photo.jpg` is unrecoverable in v1 (no originals are kept, §7.1).

### 5.1 Storage backend interface (`src/fs/backend.ts`)

```ts
export interface StorageBackend {
  init(): Promise<void>;                                  // load persisted handle / open OPFS; QUERY permission only
  requestAccess(): Promise<boolean>;                       // user-gesture permission (re)acquisition
  getProjectDir(): FileSystemDirectoryHandle | null;
  readText(name: string): Promise<string>;                // relative to a project folder
  writeTextAtomic(name: string, text: string): Promise<void>;
  writeBlobAtomic(name: string, blob: Blob): Promise<void>;   // SAME tmp→close→move pattern — mandatory for photos/assets/thumbs
  readFile(name: string): Promise<Blob>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
  // Note: operations below the project root need subdir helpers:
  // getDir(path): Promise<FileSystemDirectoryHandle>; ensureDir(path)
}

export function chooseBackend(): StorageBackend {
  return 'showDirectoryPicker' in window ? new FsaBackend() : new OpfsBackend();
}
```

Two implementations: `FsaBackend` (File System Access API) and `OpfsBackend` (Origin Private File System via `navigator.storage.getDirectory()`). `idb-keyval` is used **only** for the persisted directory handle and settings — never as a project store.

### 5.2 Root folder and permission lifecycle

1. First run: `showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' })` → persist the `FileSystemDirectoryHandle` in idb-keyval (it is structured-cloneable).
2. Later startups: read the handle from idb-keyval → `handle.queryPermission({ mode: 'readwrite' })` (this needs no gesture and never throws). If not `'granted'`, show a "Project folder needs permission" state whose button — from a user gesture — calls `handle.requestPermission({ mode: 'readwrite' })`. Installed PWAs persist the grant once granted, but do not rely on it — re-verify once at session start, not before every write. **Never call `requestPermission()` outside a user gesture** — it will reject.
3. Map `NotFoundError` / `NotAllowedError` / `SecurityError` to a single "Project folder unavailable" UI state with a **Reconnect folder** action (re-pick via `showDirectoryPicker({ id: ... })`, confirm with `handle.isSameEntry(prev)`).

### 5.3 Atomic write pattern (mandatory, for every file type)

`createWritable().close()` alone is **not atomic enough** — a crash mid-close can leave a truncated file. Use temp-file + same-directory rename. **`FileSystemFileHandle.move(name)` is implemented in current Chromium** and same-directory rename-over-an-existing-target works (POSIX semantics restored in M109); still, hold the two-tab lock (§5.4) so no writable/stream is open on the target during `move()`, and verify on the target build as part of slice 1.2.

```ts
// src/fs/projectStore.ts (reference)
import { get, set } from 'idb-keyval';
import { parseProjectFile, parseMarkupFile } from '../domain/schema';

type MaybePromise<T> = T | Promise<T>;

let backend: StorageBackend;

export async function initStore(): Promise<void> {
  backend = chooseBackend();
  await backend.init();          // QUERY permission only — requestAccess() is separate, gesture-driven
}

export async function pickRoot(): Promise<void> {
  // Must be called from a user gesture
  const handle = await window.showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' });
  await set('rootHandle', handle);
  await backend.init();          // re-init backend with the new handle
}

async function ensureDir(parent: FileSystemDirectoryHandle, name: string) {
  return parent.getDirectoryHandle(name, { create: true });
}

/** Atomic write (text or blob): tmp → close → rename over the real file.
 *  SESSION-4 FIX (S1): the previous version's doc comment said "hold the per-project Web
 *  Lock for the whole write" but the body NEVER TOOK A LOCK. cleanStaleTmp's stated safety
 *  property ("runs under the same lock as writers") was therefore false — the lock excluded
 *  other cleaners, not writers, so cleanup could still race an in-flight write. The lock is
 *  taken HERE, and `projectId` is now a required parameter so it cannot be forgotten.
 *
 *  SESSION-4 FIX (S5): `move()` fails with a locked target on Windows (Dropbox, antivirus,
 *  the search indexer). The tmp is KEPT on failure (it holds the good bytes; cleanStaleTmp
 *  will age it out) and the error is re-thrown tagged so the autosave layer can show
 *  «File is open in another app — Retry» instead of a generic failure.
 *
 *  SESSION-4 FIX (S4): a full disk surfaces as QuotaExceededError (OPFS) or
 *  NotAllowedError/NotReadableError (FSA). It is tagged 'disk-full' so the Autosave chip
 *  can enter the dedicated «Disk full» state (§5.8) rather than a silent generic error. */
export class StorageWriteError extends Error {
  constructor(public kind: 'disk-full' | 'target-locked' | 'permission' | 'unknown', cause: unknown) {
    super(`storage write failed: ${kind}`); this.cause = cause;
  }
}

function classifyWriteError(e: unknown): StorageWriteError['kind'] {
  const name = (e as DOMException)?.name ?? '';
  if (name === 'QuotaExceededError') return 'disk-full';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') return 'target-locked';
  return 'unknown';
}

export async function writeAtomic(
  dir: FileSystemDirectoryHandle, name: string, data: string | Blob, projectId: string,
): Promise<void> {
  await navigator.locks.request('fm:project:' + projectId, async () => {
    const tmpName = `${name}.tmp`;
    const tmp = await dir.getFileHandle(tmpName, { create: true });
    try {
      const w = await tmp.createWritable();
      await w.write(data);                  // accepts string | Blob | BufferSource
      await w.close();                     // flush; then atomic rename
    } catch (e) {
      throw new StorageWriteError(classifyWriteError(e), e);
    }
    try {
      // FileSystemFileHandle.move() exists in Chromium (files only — NOT on directories).
      // Overwrite-on-move matches POSIX (M109+). Verified on target build in slice 1.2.
      await tmp.move(name);
    } catch (e) {
      // Keep the tmp — it holds the good bytes and the target is still the previous
      // (valid) file. NEVER delete the target or the tmp here.
      throw new StorageWriteError(classifyWriteError(e), e);
    }
  });
}

export const writeJsonAtomic = (dir: FileSystemDirectoryHandle, name: string, data: unknown, projectId: string) =>
  writeAtomic(dir, name, JSON.stringify(data, null, 2), projectId);

/** Read + validate; on parse failure, recover from history, never silently overwrite.
 *  `parse` may return synchronously (parseJson does) or a Promise — both are awaited. */
export async function readJsonValidated<T>(
  dir: FileSystemDirectoryHandle, name: string,
  parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>,   // see §3.4 parseJson — never throws
  onMissing?: () => T,                                                   // SESSION-4 (S3)
): Promise<T> {
  // SESSION-4 FIX (S3): only the PARSE was guarded. `getFileHandle(name, {create:false})`
  // throws NotFoundError for a missing file and `getFile()/text()` throws NotReadableError
  // on a truncated or externally-locked file — so every I/O failure BYPASSED the .history
  // recovery path and surfaced as an unhandled rejection. Both now route correctly, and a
  // genuinely absent file (a brand-new sheet has no markup.json yet) is NOT corruption.
  let raw: string;
  try {
    const fh = await dir.getFileHandle(name, { create: false });
    raw = await (await fh.getFile()).text();
  } catch (e) {
    if ((e as DOMException)?.name === 'NotFoundError') {
      if (onMissing) return onMissing();          // expected absence → caller's default
      return recoverFromHistory<T>(dir, name);    // should exist → try recovery
    }
    return recoverFromHistory<T>(dir, name);      // NotReadableError etc. → recovery
  }
  const res = await parse(raw);
  if (!res.success) return recoverFromHistory<T>(dir, name);
  return res.data!;
}

/** Delete stale *.tmp files left by a crash. Call once on project open.
 *  SAFETY (round-2): a tmp file can be another tab's write IN FLIGHT — the write lock
 *  doesn't protect this unless cleanup takes it too. So: run under the same per-project
 *  Web Lock AND only delete tmp files whose lastModified is older than 5 minutes. */
export async function cleanStaleTmp(dir: FileSystemDirectoryHandle, projectId: string): Promise<void> {
  // SESSION-4 FIX (S2): the previous version iterated the PROJECT ROOT ONLY. Every tmp file
  // this app actually writes lives in a subdirectory — `sheets/<n>/markup.json.tmp`,
  // `sheets/<n>/photo.jpg.tmp`, `sheets/<n>/thumb.jpg.tmp`, `assets/<hash>.jpg.tmp` — so
  // orphaned tmp files accumulated forever and slice 1.2's "no *.tmp survivors" gate could
  // never pass. Walk recursively, bounded, and never touch `.trash/` (its contents are
  // user-restorable) or `.history/` (snapshots are written atomically to the same rules).
  await navigator.locks.request('fm:project:' + projectId, async () => {
    const cutoff = Date.now() - 5 * 60_000;
    const SKIP = new Set(['.trash']);
    const walk = async (d: FileSystemDirectoryHandle, depth: number): Promise<void> => {
      if (depth > 3) return;                       // root / sheets / <sheet> — nothing deeper
      for await (const [name, h] of (d as any).entries()) {
        if (h.kind === 'directory') {
          if (SKIP.has(name)) continue;
          await walk(h as FileSystemDirectoryHandle, depth + 1);
          continue;
        }
        if (!name.endsWith('.tmp')) continue;
        const file = await h.getFile();
        if (file.lastModified < cutoff) await d.removeEntry(name);
      }
    };
    await walk(dir, 0);
  });
}
```

**Truncated-photo detection (load-time):** when opening a sheet, if `photo.jpg` is 0 bytes or `createImageBitmap` fails, show `«Photo damaged — markup preserved. Re-import or replace the photo.»`. Never delete `markup.json` in this state; the user may replace the photo (§8.5 Replace photo). This catches the one corruption window tmp+rename can't (a crash during the very first write of a photo, before the tmp exists on the target path — the sheet dir exists but `photo.jpg` doesn't: same UI state).

### 5.4 Autosave mechanics

- Changes are coalesced and written **400 ms** after the last edit; writes are **serialized per sheet**; thumbnails regenerate **3 s** after the last edit.
- **Never show "Saved" optimistically** — the Autosave chip reflects the write promise's resolution.
- Failures back off **1 s, 3 s, 10 s**, then park in "Pending" (never retry forever).
- **Flush on `pagehide` / `visibilitychange`** — otherwise the last ~400 ms of debounced work dies on close.
- **Two-tab guard (per-project):** wrap writes with `navigator.locks.request('fm:project:' + projectId, ...)`; listen on `new BroadcastChannel('fm:project:' + projectId)` to invalidate a second tab into read-only. **Names must include the project id** — a global name would false-conflict two tabs editing two different projects, which Home explicitly supports.

### 5.5 Corruption recovery

On any load: guarded parse (§3.4 `parseJson`) → on failure walk `.history/<sheetId>/` newest→oldest and auto-restore. **`project.json` snapshots live in `.history/_project/`** (same cadence/caps) so whole-project corruption is recoverable too. History snapshots are the recovery path; the temp+rename write is the prevention. Snapshots are taken every 10 min of editing + before each destructive action, capped at 20 snapshots / 200 MB per project (oldest-first pruning).

### 5.6 Project identity and rename

- **Project identity derives from `project.json` ids, never from the folder name.** When scanning a root folder, read each subfolder's `project.json` and match by `id`. Explorer renames are cosmetic and must not break project identity.
- **In-app rename = rewrite `project.title` in `project.json` ONLY.** The on-disk folder name is explicitly cosmetic; the UI's rename copy says so (`«Renaming here changes the project name, not the folder.»`). **Do NOT attempt to move/rename the directory — `FileSystemDirectoryHandle.move()` is not implemented in Chromium and will throw**; an improvised copy+delete "equivalent" is a data-loss path and is forbidden.
- **Missing/unwritable folder:** match the UI spec's "Folder not found" → `Locate…` state (re-pick + `isSameEntry`), and offer "Remove from this list" (never deletes files).

### 5.7 Persistent storage request

```ts
// src/data/storage.ts
export async function ensurePersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();   // call after a user action, e.g. first save
}
```

### 5.8 Failure states (SESSION-4 — previously unspecified)

Four failure modes reached the code with no defined behavior. Each now has one state, one
string, and one gate.

**(a) Disk full.** A full Surface surfaces as `QuotaExceededError` (OPFS) or
`NotAllowedError`/`NotReadableError` (FSA). `writeAtomic` tags it `'disk-full'` (§5.3).
`AppState.storageStatus` gains **`'full'`**. The Autosave chip shows
`«Disk full — free space to save»` with a `Retry` action; the write parks (it does **not**
consume the 1s/3s/10s backoff budget and then silently give up), the tmp file is kept, and
**no automatic pruning of `.history/` or `.trash/` is allowed** — deleting the user's
recovery data to make room for a save is a data-loss path. Offer `Trash…` and
`Export and clear` as explicit user actions instead.

**(b) Rename target locked.** On Windows, `move()` can fail because Dropbox, antivirus, or
the search indexer holds the target. Tagged `'target-locked'`; retried on the §5.4 backoff
(1s/3s/10s); on exhaustion the chip shows `«File is open in another app — Retry»`. The tmp
is kept and the previous file is left intact — never delete either.

**(c) Duplicate project ids.** Identity is `project.json.id` (§5.6) and the **sanctioned
sharing model is copying the project folder** (D11 — drag into Dropbox), so two folders
under one root carrying the same id is expected, not exotic. Previously undefined. Rule: the
root scan groups by id; when a group has more than one folder, **show every folder as its
own card**, badge the ones that are not the most-recently-modified with `«Copy»`, and key the
in-memory project by `id + folderName`. Opening a copy offers `«Make this a separate
project»` (mint a new `id`, rewrite `project.json` atomically). **Never merge two folders,
and never write into a folder the user did not open.**

**(d) Two-tab arbitration.** §5.4 says a second tab is invalidated into read-only but never
said *which* tab loses when both open at once. Rule: on project open, a tab attempts
`navigator.locks.request('fm:project:' + id, { mode: 'exclusive', ifAvailable: true }, …)`
and holds it for the session. The tab that gets the lock is the writer; any tab that does
not is read-only immediately and shows `«Open in another tab — read only»` with a
`«Take over»` action (which reloads after the other tab releases). Deterministic, no race.

**(e) History cap, stated precisely.** `.history/` snapshots contain **JSON only** — never
photos, assets, or thumbnails (a photo snapshot would multiply disk use by the snapshot
count for no recovery value: photos are never edited in place). Caps: **20 snapshots per
sheet** under `.history/<sheetId>/`, **20** under `.history/_project/`, and a **200 MB
whole-`.history` backstop**, pruned oldest-first. Cadence: a **10-minute timer reset on each
successful write**, plus one snapshot immediately before every destructive action.

---

## 6. Domain modules

### 6.1 Units (`src/domain/units.ts`)

Accepted **explicit** imperial input: `10'`, `10' 4"`, `10'-4 1/2"`, `10 ft 4 in`, `4-1/2`, `1/2"`, `124.5` (bare number = inches). A space or dash is required between whole inches and a fraction.

```ts
export const MM_PER_IN = 25.4;

export function parseImperialToInches(raw: string): number | null {
  let s = raw.trim().toLowerCase()
    .replace(/[\u2019\u2032]/g, "'").replace(/[\u201D\u2033]/g, '"')
    .replace(/feet|foot|ft/g, "'")
    .replace(/inches|inch|in/g, '"');

  let feet = 0;
  const ftIdx = s.indexOf("'");
  if (ftIdx >= 0) {
    feet = Number(s.slice(0, ftIdx).trim() || '0');
    // F2 (session 4): a NEGATIVE feet value must be rejected, not silently kept.
    if (!Number.isFinite(feet) || feet < 0) return null;
    s = s.slice(ftIdx + 1);
    // The leading dash is the ft-in SEPARATOR (10'-4") and is stripped only here.
    s = s.replace(/"/g, '').replace(/^\s*-\s*/, '').trim();
  } else {
    // F2 (session 4): with no feet mark there is no separator, so a leading '-' is a
    // negative number and must be REJECTED. Stripping it turned "-5" into +5 in.
    s = s.replace(/"/g, '').trim();
    if (s.startsWith('-')) return null;
  }
  if (s === '') return ftIdx >= 0 ? feet * 12 : null;

  const m = s.match(/^(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?$|^(\d+)\/(\d+)$/);
  if (!m) return null;
  let inches: number;
  if (m[4] !== undefined) {
    if (Number(m[5]) === 0) return null;
    inches = Number(m[4]) / Number(m[5]);
  } else {
    if (m[3] !== undefined && Number(m[3]) === 0) return null;
    inches = Number(m[1]) + (m[2] !== undefined ? Number(m[2]) / Number(m[3]) : 0);
  }
  return feet * 12 + inches;
}

export function parseMetricToMm(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === 'm' ? v * 1000 : m[2] === 'cm' ? v * 10 : v;   // default mm
}

export function parseLengthToMm(raw: string, system: 'imperial' | 'metric'): number | null {
  if (system === 'metric') return parseMetricToMm(raw);
  const inches = parseImperialToInches(raw);
  return inches === null ? null : inches * MM_PER_IN;
}

/** Construction style: 10'-4 1/2" (rounded to nearest 1/denom inch). */
export function formatInches(totalIn: number, denom = 16): string {
  const sign = totalIn < 0 ? '-' : '';
  let ticks = Math.round(Math.abs(totalIn) * denom);
  const feet = Math.floor(ticks / (12 * denom));
  ticks -= feet * 12 * denom;
  const inches = Math.floor(ticks / denom);
  let num = ticks - inches * denom;
  let den = denom;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? `${num}/${den}` : '';
  const inchStr = frac ? (inches ? `${inches} ${frac}` : frac) : String(inches);
  if (feet === 0) return `${sign}${inchStr}"`;
  return `${sign}${feet}'-${frac && !inches ? `0 ${frac}` : inchStr}"`;
}

/** Inches-ONLY format (no feet decomposition; may exceed 12): 124.5 in → `124 1/2"`. */
export function formatInchesOnly(totalIn: number, denom = 16): string {
  const sign = totalIn < 0 ? '-' : '';
  let ticks = Math.round(Math.abs(totalIn) * denom);
  const inches = Math.floor(ticks / denom);
  let num = ticks - inches * denom;
  let den = denom;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const frac = num ? ` ${num}/${den}` : '';
  return `${sign}${inches}${frac}"`;
}

/** Format a canonical mm value for display in the given system + format. */
export function formatLength(valueMm: number, system: 'imperial' | 'metric', denom = 16, unitFormat: 'ft-in' | 'in' | 'ft-decimal' = 'ft-in'): string {
  if (system === 'metric') return `${valueMm.toFixed(0)} mm`;
  const inches = valueMm / MM_PER_IN;
  if (unitFormat === 'in') return formatInchesOnly(inches, denom);
  if (unitFormat === 'ft-decimal') return `${(inches / 12).toFixed(2)}'`;
  return formatInches(inches, denom);
}
```

#### 6.1.1 Keypad input model (NEW — the fuzzy layer over the strict parser)

The strict parser above **rejects** `12 6` and `12 6 3` (no unit marks). That is correct — the parser is the guardian. The keypad is the fuzzy layer: it composes a **slot state**, renders a live preview from it, and composes an explicit string for `enteredText`.

```ts
/** Keypad slot state — the single source of truth while the keypad sheet is open. */
export interface KeypadState {
  feet: string;            // digits only, '' = none
  inches: string;         // digits only (whole inches), '' = none
  numerator: string;      // digits only, '' = no fraction
  denominator: number;    // active fraction denominator (project precision by default)
  activeSlot: 'feet' | 'inches' | 'numerator';   // which slot receives digit keys
  inchesMode: boolean;     // true = whole entry scoped to inches only (ft/in toggle)
}

export const emptyKeypadState = (denominator: number): KeypadState =>
  ({ feet: '', inches: '', numerator: '', denominator, activeSlot: 'inches', inchesMode: false });

/** Digit key → slot routing (pure). */
export function pressDigit(st: KeypadState, d: string): KeypadState {
  const next = { ...st };
  if (st.inchesMode) { next.inches = (next.inches + d).replace(/^0+(?=\d)/, ''); return next; }
  if (st.activeSlot === 'feet')       next.feet     = (next.feet + d).replace(/^0+(?=\d)/, '');
  else if (st.activeSlot === 'inches') next.inches  = (next.inches + d).replace(/^0+(?=\d)/, '');
  else                                  next.numerator = (next.numerator + d).replace(/^0+(?=\d)/, '');
  return next;
}

/** `.` key: starts a fraction (the `«1/2»`…`«1/16»` chips are the primary path; `.` is the
 *  hardware-typist's shortcut). DECISION: `.` moves to the numerator slot and resets it, with the
 *  denominator UNCHANGED (project precision). Then `. 5` = 5/16", not 0.5" — the preview shows
 *  exactly what the slots say, so this is discoverable, not surprising; the fraction chips remain
 *  the way to pick halves/quarters. (A bare decimal like `124.5` on the hardware path is handled
 *  by parseLooseToSlots, not by pressDot.) Documented so no builder guesses. */
export function pressDot(st: KeypadState): KeypadState {
  return { ...st, activeSlot: 'numerator', numerator: '' };
}

/** Compose the canonical enteredText from slots. This string is what gets stored
 *  (and what the strict parser round-trips on re-edit).
 *  INVARIANTS (all property-tested):
 *   1. Every non-empty output strictly parses back to keypadValueInches(st).
 *   2. Feet+fraction composes as `<f>'-<i> <n>/<d>"` (never drops the fraction).
 *   3. Inches-mode with only a fraction composes as `<n>/<d>"` (no phantom `0`). */
export function composeEnteredText(st: KeypadState): string {
  // SESSION-4 FIX (F6): a slot holding '0' is TRUTHY as a string. The old checks composed
  // `12'-6 0/16"` and `0'-4"` — junk that is stored verbatim as enteredText. The value
  // round-trips, so the 500-combo property test passed on it. Presence = a POSITIVE value.
  const has = (v: string) => v !== '' && Number(v) > 0;
  const fracPart = has(st.numerator) ? `${st.numerator}/${st.denominator}` : '';

  if (st.inchesMode) {
    if (!st.inches && !has(st.numerator)) return '';
    if (!st.inches) return `${fracPart}"`;                  // fraction only: `3/16"`
    return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
  }

  if (has(st.feet)) {
    if (st.inches && fracPart) return `${st.feet}'-${st.inches} ${fracPart}"`;   // 10'-4 1/2"
    if (st.inches) return `${st.feet}'-${st.inches}"`;                          // 10'-4"
    if (fracPart) return `${st.feet}'-0 ${fracPart}"`;                          // 10'-0 1/2"
    return `${st.feet}'-0"`;                                                    // 10'-0"
  }

  // feet empty (or zero) → everything is inches
  if (!st.inches && !has(st.numerator)) return '';
  if (!st.inches) return `${fracPart}"`;
  return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
}

/** Allowed fraction denominators (§3.3 `precisionDenominator`). Anything else is a typo,
 *  not a measurement — session 4 found `10' 4 99/100` silently accepted denominator 100. */
export const VALID_DENOMINATORS = [2, 4, 8, 16, 32, 64] as const;
export const isValidDenominator = (d: number): boolean =>
  (VALID_DENOMINATORS as readonly number[]).includes(d);

/** Largest length v1 will commit: 1000 ft. Beyond this the user mistyped, not measured. */
export const MAX_LENGTH_IN = 12000;

/** SESSION-4 FIX (F3/F4): the ONLY gate the commit button may use. `Enter` was previously
 *  blocked on null/NaN alone, so a bare `0` committed a 0" dimension, and `12 6 20`
 *  committed 151.25" — a measurement the user never typed. Both are wrong-measurement paths. */
export function isCommittableInches(v: number | null): boolean {
  return v !== null && Number.isFinite(v) && v > 0 && v <= MAX_LENGTH_IN;
}

/** The live preview: slots → value. The truth; never parse the composed string for display. */
export function keypadValueInches(st: KeypadState): number | null {
  // SESSION-4 (F6): presence tests must MATCH composeEnteredText's, or the preview value and
  // the stored text disagree. A slot holding '0' contributes 0 but is not "entered".
  const has = (v: string) => v !== '' && Number(v) > 0;
  const frac = has(st.numerator) ? Number(st.numerator) / st.denominator : 0;
  if (st.inchesMode) {
    if (!st.inches && !has(st.numerator)) return null;
    return Number(st.inches || 0) + frac;
  }
  if (!has(st.feet) && !st.inches && !has(st.numerator)) return null;
  return Number(st.feet || 0) * 12 + Number(st.inches || 0) + frac;
}

/** Hardware-keyboard / hardware-keypad path: tokenize a raw typed string leniently,
 *  then compose slots. Accepted (in order of precedence) — all cases traced against the
 *  test table below; if you touch this, re-run the traces:
 *   1. Feet-first (explicit `'`):  `10'` · `10' 4"` · `10'-4 1/2"` · `10' 6 3` (loose numerator,
 *      denominator = project precision) · `10' 1/2"` (fraction only).
 *   2. Bare decimal (`124.5`) → inches-mode, raw preserved for `enteredText`.
 *   3. Fraction alone (`1/2"`) → inches-mode fraction.
 *   4. Loose integer groups (spaces/dashes): `124` = 124 in (inchesMode) · `12 6` = 12 ft 6 in ·
 *      `12 6 3` = 12 ft 6 in + 3/16 (project denominator).
 *  Returns null when nothing sensible matches — the caller disables the commit button. */
export function parseLooseToSlots(raw: string, denominator: number): { slots: KeypadState; rawDecimal: string | null } | null {
  const s = raw.trim().toLowerCase()
    .replace(/[\u2019\u2032]/g, "'").replace(/[\u201D\u2033]/g, '"')
    .replace(/feet|foot|ft/g, "'").replace(/inches|inch|in(?![a-z])/g, '"')
    .replace(/\s+/g, ' ');
  if (!s) return null;

  /** SESSION-4 FIX (F4): every construction site validates the fraction. An explicit
   *  denominator outside VALID_DENOMINATORS, or a numerator >= its denominator, is a typo —
   *  return null so the commit button disables, rather than inventing a length. */
  const mk = (over: Partial<KeypadState>): KeypadState | null => {
    const st: KeypadState = { feet: '', inches: '', numerator: '', denominator,
      activeSlot: 'inches', inchesMode: false, ...over };
    if (!isValidDenominator(st.denominator)) return null;
    if (st.numerator !== '' && Number(st.numerator) >= st.denominator) return null;
    return st;
  };
  /** Wrap a slot result; null slots propagate as a null parse. */
  const ok = (slots: KeypadState | null, rawDecimal: string | null = null) =>
    slots ? { slots, rawDecimal } : null;

  // 1. feet-first forms (space allowed before the ' mark: "10 ft 4 in" → "10 ' 4 \"")
  const fm = s.match(/^(\d+)\s*'\s*[-\s]?\s*(.*)$/);
  if (fm) {
    const rest = fm[2].trim();
    if (rest === '' || rest === '"') return ok(mk({ feet: fm[1] }));
    let m = rest.match(/^(\d+)(?:\s*[\s-]\s*(\d+)\/(\d+))?\s*"?$/);   // i [n/d]
    if (m) return ok(mk({ feet: fm[1], inches: m[1], numerator: m[2] ?? '',
      denominator: m[3] ? Number(m[3]) : denominator }));
    m = rest.match(/^(\d+)\s+(\d+)\s*"?$/);                            // i n (loose numerator, project denom)
    if (m) return ok(mk({ feet: fm[1], inches: m[1], numerator: m[2] }));
    m = rest.match(/^(\d+)\/(\d+)\s*"?$/);                             // n/d only
    if (m) return ok(mk({ feet: fm[1], numerator: m[1], denominator: Number(m[2]) }));
    return null;
  }

  // 2. bare decimal → inches (raw preserved for enteredText)
  if (/^\d+\.\d+"?$/.test(s)) {
    const d = s.replace(/"$/, '');
    return ok(mk({ inches: d, inchesMode: true }), d);
  }

  // 3. fractions without feet: `4-1/2` · `4 1/2` (whole+fraction) · `1/2` (alone)
  let m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)"?$/);                  // whole + fraction: 4-1/2, 4 1/2
  if (m) return ok(mk({ inches: m[1], numerator: m[2], denominator: Number(m[3]), inchesMode: true }));
  m = s.match(/^(\d+)\/(\d+)"?$/);                                  // fraction alone: 1/2
  if (m) return ok(mk({ numerator: m[1], denominator: Number(m[2]), inchesMode: true }));

  // 4. loose integer groups: `124` = 124 in · `12 6` = 12 ft 6 in · `12 6 3` = 12 ft 6 in + 3/16
  m = s.match(/^(\d+)(?:[\s-]+(\d+))?(?:[\s-]+(\d+))?"?$/);
  if (!m) return null;
  if (m[2] === undefined) return ok(mk({ inches: m[1], inchesMode: true }));
  if (m[3] === undefined) return ok(mk({ feet: m[1], inches: m[2] }));
  return ok(mk({ feet: m[1], inches: m[2], numerator: m[3] }));
}
```

**Keypad UI wiring (mandatory):**
- The **live parse preview** renders `formatLength(keypadValueInches(st) × 25.4, ...)` — the slots are the truth; the composed string is display + storage.
- `«ft»/«in»` toggles: `ft` → `activeSlot = 'feet'`; `in` → `inchesMode = true` (whole entry rescopes; feet slot clears visually with an `«Entry is now inches»` hint chip for 1.5 s).
- Fraction chips (`1/2…1/16`): set `denominator` AND if `numerator` is empty, move `activeSlot` to `numerator` and show the `«← /16»` cycling hint.
- Hardware path: every keystroke re-runs `parseLooseToSlots(buffer, project.precisionDenominator)` → `{ slots, rawDecimal }`; the preview reads `keypadValueInches(slots)` (for a bare decimal, the value is `Number(rawDecimal)`); `Enter` commits that value as `valueMm` and stores `enteredText = rawDecimal ?? composeEnteredText(slots)`. **Reject `Enter` unless `isCommittableInches(value)`** (the primary button disables with it) —
  null/NaN, **zero, negative, and > 1000 ft are all refused**. Session 4: the old null/NaN-only
  gate let a bare `0` commit a 0" dimension and let `12 6 20` commit 151.25" (§6.1.1 F3/F4).
- **Committed annotations always store BOTH** `valueMm` (from slots/decimal) and `enteredText` (composed, or the raw decimal). The strict parser must round-trip `enteredText` → same `valueMm` for every composed string; this is a unit test (see below).
- `composeEnteredText` invariants: (1) every non-empty output strictly parses back to `keypadValueInches(st)`; (2) feet+fraction never drops the fraction; (3) inches-mode fraction-only composes `3/16"` — never `03/16"`.

**Tests (`tests/units.test.ts`)** — carry these forward and add the keypad table:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseImperialToInches, formatInches, parseLengthToMm, formatLength,
  parseLooseToSlots, keypadValueInches, composeEnteredText,
  emptyKeypadState, pressDigit, pressDot,
} from '../src/domain/units';

describe('parseImperialToInches (strict parser — the guardian)', () => {
  it.each([
    [`10'`, 120], [`10' 4"`, 124], [`10'-4 1/2"`, 124.5], [`10 ft 4 in`, 124],
    [`4-1/2`, 4.5], [`1/2"`, 0.5], [`124.5`, 124.5],
    [`10\u2032 4\u2033`, 124],            // unicode prime/double-prime ARE normalized (see the replace chain)
  ])('parses %s', (input, expected) => {
    expect(parseImperialToInches(input)).toBeCloseTo(expected);
  });
  it.each([
    [`abc`], [`4 1/0`], [``], [`12 6`], [`12 6 3`], [`.5`],
    // SESSION-4 FIX (F1): this row used to sit in the ACCEPTS table asserting 124.5.
    // Executed, it returns null: \u2032/\u2033 are normalized but the VULGAR FRACTION
    // \u00BD is not, so the inches regex never matches. The row's own trailing comment
    // already said "NOT accepted" — the assertion contradicted it. Vulgar fractions are
    // OUT OF SCOPE for v1 (DECISIONS D21); rejecting is safe (the commit button disables).
    [`10\u2032-4 \u00BD\u2033`],
    // SESSION-4 FIX (F2): negatives are rejected — they used to silently become positive.
    [`-5`], [`-5 1/2`], [`-10' 4"`],
  ])('rejects %s (strict layer)', (input) => {
    expect(parseImperialToInches(input)).toBeNull();
  });
});

describe('formatInches', () => {
  it('formats and reduces fractions', () => expect(formatInches(124.5)).toBe(`10'-4 1/2"`));
  it('carries rounding into feet', () => expect(formatInches(11.99)).toBe(`1'-0"`));
  it('handles fraction only', () => expect(formatInches(0.5)).toBe(`1/2"`));
});

describe('formatLength (unit formats)', () => {
  const mm = 3162.3;   // 10'-4 1/2"
  it('ft-in default', () => expect(formatLength(mm, 'imperial', 16, 'ft-in')).toBe(`10'-4 1/2"`));
  it('inches only (independent of feet decomposition)', () => expect(formatLength(mm, 'imperial', 16, 'in')).toBe(`124 1/2"`));
  it('decimal feet', () => expect(formatLength(mm, 'imperial', 16, 'ft-decimal')).toBe(`10.38'`));
});

describe('keypad slot model (fuzzy layer)', () => {
  it('12 6 → 12 ft 6 in = 150 in (hardware fast path)', () => {
    const { slots } = parseLooseToSlots('12 6', 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150);
  });
  it('12 6 3 → 12 ft 6 in + 3/16 (denominator = project precision)', () => {
    const { slots } = parseLooseToSlots('12 6 3', 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150 + 3/16);
  });
  it(`12' 6 3 → same (explicit feet + loose numerator)`, () => {
    const { slots } = parseLooseToSlots(`12' 6 3`, 16)!;
    expect(keypadValueInches(slots)).toBeCloseTo(150 + 3/16);
  });
  it(`10 ft 4 in and 4-1/2 parse (unit words + dash forms)`, () => {
    expect(keypadValueInches(parseLooseToSlots(`10 ft 4 in`, 16)!.slots)).toBeCloseTo(124);
    expect(keypadValueInches(parseLooseToSlots(`4-1/2`, 16)!.slots)).toBeCloseTo(4.5);
  });
  it('bare decimal stays decimal inches (raw preserved)', () => {
    const r = parseLooseToSlots('124.5', 16)!;
    expect(r.rawDecimal).toBe('124.5');
    expect(r.slots.inchesMode).toBe(true);
  });
  it.each([
    // [slots, expected text] — compose invariants
    [{ feet: '10', inches: '4', numerator: '1', denominator: 2 },  `10'-4 1/2"`],
    [{ feet: '10', inches: '4', numerator: '', denominator: 16 },   `10'-4"`],
    [{ feet: '10', inches: '', numerator: '1', denominator: 2 },    `10'-0 1/2"`],
    [{ feet: '10', inches: '', numerator: '', denominator: 16 },    `10'-0"`],
    [{ feet: '', inches: '4', numerator: '1', denominator: 2 },     `4 1/2"`],
    [{ feet: '', inches: '', numerator: '3', denominator: 16 },      `3/16"`],
    [{ feet: '', inches: '124', numerator: '', denominator: 16 },    `124"`],
  ] as const)('composeEnteredText %j → %s', (st, expected) => {
    expect(composeEnteredText(st as unknown as KeypadState)).toBe(expected);
  });
  it('explicit string round-trips through the strict parser', () => {
    const { slots } = parseLooseToSlots(`12' 6 3/8`, 16)!;
    const text = composeEnteredText(slots);
    expect(text).toBe(`12'-6 3/8"`);
    expect(parseImperialToInches(text)).toBeCloseTo(150.375);   // 12 ft 6 3/8 = 150.375 in — matches the UI spec's `12' 6 3/8" = 150.4 in` example
  });
  it('digit routing + dot-as-fraction', () => {
    let st = emptyKeypadState(16);
    st = pressDigit(st, '1'); st = pressDigit(st, '2');   // 12 (inches-mode default start)
    st = pressDot(st);        // → numerator slot, denominator UNCHANGED (16)
    st = pressDigit(st, '8');
    expect(keypadValueInches(st)).toBeCloseTo(12 + 8/16);   // 12 8/16" = 12.5"
  });
  // SESSION-4 FIX (F5): the old generator drew every slot from `String(Math.floor(rand*n))`,
  // which NEVER produces ''. Measured over 2000 draws: feet==='' 0 times, inches==='' 0,
  // numerator==='' 0. The empty-slot branches — exactly where round 1's fraction-dropping
  // bug lived — were covered only by the 7-row table, never by the property test. It also
  // drew numerator==='0' ~5% of the time, composing junk like `12'-6 0/16"` that still
  // value-round-trips, so the assertion passed on garbage. Draw '' explicitly, and assert
  // on the SHAPE of the composed text as well as its value.
  const slot = (max: number) => {
    const r = Math.random();
    if (r < 0.2) return '';                                  // empty slot — 20% of draws
    if (r < 0.3) return '0';                                 // zero slot  — 10% of draws
    return String(Math.floor(Math.random() * max) + 1);
  };
  it('composeEnteredText round-trips by VALUE and is well-formed (property, 500 combos)', () => {
    let sawEmptyFeet = 0, sawEmptyInches = 0, sawEmptyNum = 0;
    for (let i = 0; i < 500; i++) {
      const st: KeypadState = {
        feet: slot(30), inches: slot(11), numerator: slot(15),
        denominator: 16, activeSlot: 'inches',
        inchesMode: Math.random() < 0.5,
      };
      if (st.feet === '') sawEmptyFeet++;
      if (st.inches === '') sawEmptyInches++;
      if (st.numerator === '') sawEmptyNum++;
      const text = composeEnteredText(st);
      if (!text) continue;
      // Shape: never a zero numerator, never a leading-zero feet mark, never a bare `0/d`.
      expect(text).not.toMatch(/\b0\/\d+/);
      expect(text).not.toMatch(/^0'/);
      const parsed = parseImperialToInches(text);
      expect(parsed).not.toBeNull();
      expect(parsed!).toBeCloseTo(keypadValueInches(st)!);   // value round-trip, not just parseability
    }
    // The generator must actually reach the branches it claims to cover.
    expect(sawEmptyFeet).toBeGreaterThan(20);
    expect(sawEmptyInches).toBeGreaterThan(20);
    expect(sawEmptyNum).toBeGreaterThan(20);
  });

  // SESSION-4: the commit gate (F3/F4) — these are wrong-measurement guards, not niceties.
  it('rejects a zero-length commit', () => {
    expect(isCommittableInches(keypadValueInches(parseLooseToSlots('0', 16)!.slots))).toBe(false);
  });
  it('rejects numerator >= denominator (typo, not a measurement)', () => {
    expect(parseLooseToSlots('12 6 20', 16)).toBeNull();     // was 151.25 in, silently
    expect(parseLooseToSlots('12 6 16', 16)).toBeNull();
    expect(parseLooseToSlots('12 6 15', 16)).not.toBeNull(); // 15/16 is valid
  });
  it('rejects a denominator outside the precision enum', () => {
    expect(parseLooseToSlots(`10' 4 99/100`, 16)).toBeNull();  // was 124.99 in, silently
    expect(parseLooseToSlots(`10' 4 3/8`, 16)).not.toBeNull();
  });
  it('rejects an absurd length', () => {
    expect(isCommittableInches(12001)).toBe(false);          // > 1000 ft
    expect(isCommittableInches(12000)).toBe(true);
  });
  it('a zero slot is not a present slot (F6)', () => {
    expect(composeEnteredText({ feet: '12', inches: '6', numerator: '0', denominator: 16,
      activeSlot: 'numerator', inchesMode: false })).toBe(`12'-6"`);   // was `12'-6 0/16"`
    expect(composeEnteredText({ feet: '0', inches: '4', numerator: '', denominator: 16,
      activeSlot: 'inches', inchesMode: false })).toBe(`4"`);           // was `0'-4"`
  });
});
```

> **Test note:** the compose table above is the acceptance contract for `composeEnteredText` — the v0.3 round-1 code dropped the fraction in the `feet && inches && numerator` case (`10'-4"` instead of `10'-4 1/2"`); these tests exist so that regression can never come back. The property test asserts the **value** round-trip (not just parseability).

### 6.2 Geometry (`src/domain/geometry.ts`) — image-pixel space

```ts
import type { Px } from './types';

/** Distance between two image-space points, in image pixels. */
export function pixelDistance(a: Px, b: Px): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Interior angle at the vertex, degrees (0..180). */
export function angleDeg(a: Px, v: Px, c: Px): number {
  const v1x = a.x - v.x, v1y = a.y - v.y;
  const v2x = c.x - v.x, v2y = c.y - v.y;
  return Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)) * 180 / Math.PI;
}

/** Keep labels upright: flip text that would render upside down. */
export function readableAngleDeg(a: Px, b: Px): number {
  const deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return deg > 90 || deg < -90 ? deg + 180 : deg;
}

/** Rotate a point around an origin (image space). */
export function rotatePoint(p: Px, origin: Px, degrees: number): Px {
  const r = degrees * Math.PI / 180;
  const dx = p.x - origin.x, dy = p.y - origin.y;
  return { x: origin.x + dx * Math.cos(r) - dy * Math.sin(r), y: origin.y + dx * Math.sin(r) + dy * Math.cos(r) };
}

export function midpoint(a: Px, b: Px): Px { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

export function pointInRect(p: Px, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
```

### 6.3 Snapping (`src/domain/snapping.ts`)

```ts
import type { Px } from './types';

export interface SnapTarget { p: Px; kind: 'endpoint' | 'vertex' | 'corner'; }

/** Snap a point to the nearest target within `threshold` image-px (convert screen threshold via zoom first). */
export function snapPoint(p: Px, targets: SnapTarget[], threshold: number): { p: Px; hit: SnapTarget | null } {
  let best: SnapTarget | null = null;
  let bestD = threshold;
  for (const t of targets) {
    const d = Math.hypot(t.p.x - p.x, t.p.y - p.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best ? { p: best.p, hit: best } : { p, hit: null };
}

/** Angle snap: 0/45/90 (and 135/180/...) within `degThreshold`. */
export function snapAngle(deg: number, degThreshold = 5): number {
  const snapped = Math.round(deg / 45) * 45;
  return Math.abs(deg - snapped) <= degThreshold ? snapped : deg;
}
```

### 6.4 IDs (`src/domain/ids.ts`)

```ts
export const newId = (): string => crypto.randomUUID();
```

### 6.5 Future measurement seams (do NOT build now)

- **Laser:** keep `Annotation.source: 'manual' | 'laser' | 'calibrated'`. A future laser meter just populates `valueMm` + `enteredText` + `source: 'laser'` through the same keypad-commit path. No device code, no UI in v1.
- **Reference calibration:** keep `Sheet.calibrationPxPerFoot?` (always null in v1, per §2.4). When it ships: a "calibrate scale" flow draws a known line, types its true length, and the measured length is **derived at render** (never stored). Labels get an `≈` prefix and a different accent. v1 always types the value; drawn lines carry no numeric value.

---

## 7. Media modules

### 7.1 Normalize image (`src/media/normalizeImage.ts`)

```ts
/** Decode with orientation applied, downscale, re-encode as JPEG.
 *  Re-encoding strips EXIF — read capture time first (src/media/exif.ts) if you need it. */
export async function normalizeImage(file: Blob, maxEdge = 4096, quality = 0.88) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return { blob, width, height };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Notes: the working image is fixed at this size forever (it is the coordinate space). **v1 does not keep originals** (4096px at 2× export is fine — see §9 memory guidance on 3×); document that a future "re-import at higher res" invalidates all annotation coordinates and is not supported.

### 7.2 EXIF (`src/media/exif.ts`)

Read capture time (for default sheet naming) **before** normalization strips it. Bake orientation by decoding with `imageOrientation: 'from-image'`. **Strip GPS by default** from working copies and exports — the folder gets dragged into Dropbox, so stripped-by-default is the respectful, safe choice. GPS is never re-embedded; a typed `locationLabel` is the only location data (§18.3).

### 7.3 Thumbnails (`src/media/thumbnails.ts`)

Generate 640×480 composites (photo + markup). Konva cannot run in a worker: **decode in a worker, render on the main thread throttled to idle**. Regenerate 3 s after the last edit; cache as `sheets/<n>/thumb.jpg` (written atomically, §5.3).

---

## 8. Editor engine

### 8.1 `EditorCanvas` structure (imperative Konva)

```ts
// src/editor/EditorCanvas.ts (sketch)
import Konva from 'konva';

export class EditorCanvas {
  stage: Konva.Stage;
  photoLayer: Konva.Layer;      // base image, listening:false
  insetLayer: Konva.Layer;      // one Konva.Group per inset
  markupLayer: Konva.Layer;     // z-banded shapes/ink/text
  overlayLayer: Konva.Layer;    // loupe, draw preview, selection handles
  dragLayer: Konva.Layer;       // node moved here during drag

  constructor(container: HTMLDivElement) {
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.photoLayer = new Konva.Layer({ listening: false });
    this.insetLayer = new Konva.Layer();
    this.markupLayer = new Konva.Layer();
    this.overlayLayer = new Konva.Layer();
    this.dragLayer = new Konva.Layer();
    this.stage.add(this.photoLayer, this.insetLayer, this.markupLayer, this.overlayLayer, this.dragLayer);
  }

  // … zoom/pan via stage.scale()/stage.position(); pinch via touchmove on stage.container()
}
```

Performance rules (low-end Surface Go, 8 GB):
- Keep the static photo on a `listening: false` layer.
- Use a dedicated **drag layer** — move the dragged node to it on `dragstart`, back on `dragend`.
- `perfectDrawEnabled: false` for shapes with fill+stroke+opacity; `node.cache()` for complex static shapes.
- **`Konva.pixelRatio` (§8.1.1, below) — NOT a blanket `= 1`:** photo layer 1 (it's a bitmap, nothing to gain), markup/overlay layers `min(devicePixelRatio, 2)` so ink/text stay sharp on the 267-ppi flagship screen. Measure on the Surface Go before shipping; if markup redraw cost is too high there, downgrade overlay-only to 1.
- Keep the number of layers low (each Konva `Layer` is its own `<canvas>`).

Hit-testing:
- `layer.getIntersection({ x, y })` uses container-space (same as `stage.getPointerPosition()`), honors `listening:false`/visibility/opacity/`hitStrokeWidth`.
- Set `hitStrokeWidth` on thin lines for fat invisible hit areas — **16 px general, 24 px along thin strokes** under touch-primary (fingers/gloves; §11.12). Section hit slop: **16 px general / 24 px thin**.
- Tag every shape with `name()` = annotation id; resolve hit results to the owning annotation (children resolve to their inset). Use `hitFunc` for custom hit geometry.
- **Insets:** hit-testing resolves through the inset group's absolute transform; a hit on an inset child maps container-space → sheet-space via the group, then to **group-local** space by the inverse transform, then to asset-space by **adding `crop`** (`asset = local + crop` — the inverse transform lands in crop-window space, not asset space). The input router must divide the container point by the group's absolute scale/rotation, not just the stage's.

#### 8.1.1 Pixel ratio & text sharpness rule

| Layer | `Konva.pixelRatio` | Why |
|---|---|---|
| photoLayer | `1` | base image is a raster; nothing to gain from dpr on it |
| markupLayer, insetLayer, overlayLayer | `Math.min(devicePixelRatio, 2)` | ink, labels, selection handles must be crisp on a 267-ppi screen; capping at 2 bounds the fill cost |

Text nodes do NOT go through `Konva.pixelRatio` for their raster; text sharpness comes from setting `fontSize = fontSizeMu / s` (§4.2) so glyphs rasterize at full stage scale.

### 8.2 Input router (`src/editor/inputRouter.ts`) — TOUCH-PRIMARY (HARDENED)

> **The inversion (2026-09-21):** touch is the **primary input**; the pen enhances it. Touch can both
> **place/move** geometry and **navigate**. The pen always draws, and additionally supplies pressure,
> tilt and hover. This section is the single authority on input routing — §8.4/§8.5, §11.1 and slice
> 0.2 all defer to it. Design source: `docs/touch-first-interaction-model.md` §1, §3, §9.

**Intent is decided once, at `pointerdown`, and is sticky for the whole contact.** A contact
classified `'draw'` stays `'draw'` for its lifetime (a drifting placement never silently becomes a
pan); a second concurrent contact is the one documented exception ("second touch wins", below).

```ts
export type InputIntent = 'draw' | 'navigate' | 'ignore';
// 'draw'     = may create/edit geometry with the active tool (pen always; touch per the toggles)
// 'navigate' = pan/zoom only
// 'ignore'   = palm/heel/OS gesture — no action, no state change

export interface InputRouterOptions {
  palmWindowMs?: number;          // default 1200; refreshed by every pen event
  touchPlaces?: () => boolean;    // «Touch places and moves» — default ON
  fingerDraws?: () => boolean;    // «Finger draws (freehand)» — default OFF
}
const EDGE_REJECT_PX = 24;        // pen-free path (a): outer band a contact can never place from
const PALM_BURST_COUNT = 3;       // pen-free path (b): contacts in a burst that read as a palm/heel
const PALM_BURST_MS = 90;         // pen-free path (b): the burst window

export function createInputRouter(o: InputRouterOptions = {}) {
  const palmWindowMs = o.palmWindowMs ?? 1200;
  const touchPlaces = o.touchPlaces ?? (() => true);
  const fingerDraws = o.fingerDraws ?? (() => false);

  let lastPenAt = 0;
  let penStrokeActive = false;
  let penSeenThisSession = false;                    // has ANY pen event fired since load?
  const touchDownAt = new Map<number, number>();      // pointerId → down time
  const touchBornAtEdge = new Map<number, boolean>(); // pointerId → began in the outer band?
  let burstIgnoreUntilLift = false;                   // pen-free multi-touch debounce latch

  const canCreate = () => touchPlaces() || fingerDraws();

  return {
    /** Feed EVERY pen pointer event (down AND move) through here. */
    notePenEvent(): void { penSeenThisSession = true; lastPenAt = performance.now(); },
    penStrokeStart(): void { penStrokeActive = true; },
    penStrokeEnd(): void { penStrokeActive = false; },

    /** Call on every touch pointerdown with whether it began within EDGE_REJECT_PX of the edge. */
    noteTouchDown(pointerId: number, atEdge: boolean, now = performance.now()): void {
      touchDownAt.set(pointerId, now);
      touchBornAtEdge.set(pointerId, atEdge);
      // (b) multi-touch debounce: a burst of ≥3 contacts inside 90 ms is a heel, not intentional use.
      const recent = [...touchDownAt.values()].filter(t => now - t <= PALM_BURST_MS).length;
      if (recent >= PALM_BURST_COUNT) burstIgnoreUntilLift = true;
    },
    noteTouchUp(pointerId: number): void {
      touchDownAt.delete(pointerId);
      touchBornAtEdge.delete(pointerId);
      if (touchDownAt.size === 0) burstIgnoreUntilLift = false;
    },

    classify(e: PointerEvent, now = performance.now()): InputIntent {
      if (e.pointerType === 'pen') {
        penSeenThisSession = true; lastPenAt = now;
        return 'draw';
      }
      if (e.pointerType === 'touch') {
        if (burstIgnoreUntilLift) return 'ignore';                        // pen-free (b)
        if (penStrokeActive) return 'ignore';                             // pen-present gate 2
        // pen-present gate 1 — only meaningful once a pen has actually been seen this session
        if (penSeenThisSession && now - lastPenAt < palmWindowMs) return 'ignore';
        if (!penSeenThisSession && touchBornAtEdge.get(e.pointerId)) return 'navigate'; // pen-free (a)
        return canCreate() ? 'draw' : 'navigate';
      }
      return 'draw';   // mouse or trackpad
    },

    onPenHover(_e: PointerEvent): void { /* pointerType==='pen' && buttons===0 → hover affordances */ },
  };
}
```

**`classify` truth table (keep this and the code above in lock-step — slice 0.2 tests it):**

| Pen seen this session? | Contact | Active pen stroke? | Time since last pen event | Edge-born / burst? | Result |
|---|---|---|---|---|---|
| yes | pen | — | — | — | `'draw'` (sets `penSeen`, refreshes the window) |
| yes | touch | yes | — | — | `'ignore'` (gate 2) |
| yes | touch | no | `< 1200 ms` | — | `'ignore'` (gate 1) |
| yes | touch | no | `≥ 1200 ms` | no | `'draw'` if a toggle is on, else `'navigate'` |
| no | touch | n/a | n/a | burst | `'ignore'` (all until every pointer lifts) |
| no | touch | n/a | n/a | edge-born | `'navigate'` (pan at most — never places) |
| no | touch | n/a | n/a | no | `'draw'` if a toggle is on, else `'navigate'` |
| any | mouse/trackpad | — | — | — | `'draw'` (wheel+Ctrl zoom, spacebar+drag pan) |

**Input routing rules (complete, binding):**

- **Pen** (`pointerType === 'pen'`): draws with the active tool, always. Every pen `pointermove`
  refreshes the palm window (`notePenEvent`) and keeps `penSeenThisSession = true`.
- **Two-gate palm rule — pen present.** Touch is suppressed when **either** gate is closed:
  **gate 1** = within `palmWindowMs` (1200 ms) of the last pen event (refreshed by every pen event,
  including moves); **gate 2** = a pen stroke is active. Both gates must be tested independently: a
  stroke longer than 1200 ms must not re-open the window mid-stroke.
- **Pen-free path — no pen seen this session.** Palm suppression is **probabilistic, not
  deterministic**, and the app must say so (gui-ux handoff §13.7). Only two bounded heuristics exist: **(a) edge
  rejection** — a touch born within `EDGE_REJECT_PX` (24 px) of the container edge is never
  `'draw'` (pan at most), so a heel on the bezel cannot place a point; **(b) multi-touch debounce** —
  ≥ `PALM_BURST_COUNT` (3) contacts inside `PALM_BURST_MS` (90 ms) are all `'ignore'` until every
  pointer lifts. **A tap-tap rhythm (≥ 120 ms apart, one contact at a time) is caught by neither.**
  Do **not** ship a contact-size threshold filter: W3C Pointer Events 3 states author-side
  suppression is not possible, `PointerEvent.width/height` defaults to `1` when the hardware cannot
  report geometry, and Android's own cookbook handles `ACTION_CANCEL` + undo rather than prevention.
  **The real safety net is undo + rollback on `pointercancel` (below)** — verify the heuristics
  empirically on the target Surface and log it in the hardware checklist.
- **Touch can place.** Single touch is `'draw'` when `touchPlaces()` is ON (default) or, for the
  freehand/highlighter tools only, when `fingerDraws()` is ON. Two fingers = pinch-zoom + pan
  (pivot = pinch midpoint), always. Single touch with both toggles off = pan.
- **Second concurrent touch wins.** A second finger during an object drag **cancels the
  drag, restores the pre-drag position, and starts pan/zoom**; while a placement is pending, a
  two-finger tap **cancels the placement** (add-to-selection is meaningless mid-placement) — and
  every action a two-finger gesture performs also exists as an on-screen control (§11.1 #7). The
  two-finger drag safety gesture is never repurposed.
- **Mouse/trackpad:** draws (with the same tools); wheel + `Ctrl` = zoom, spacebar+drag = pan.
- **Attach / capture:** attach native listeners to `stage.container()`; `setPointerCapture` on
  `pointerdown`, release on `pointerup`/`pointercancel`.
- **`pointercancel` rollback (the pen-free safety net).** `pointercancel` (palm, OS edge gesture,
  blur) rolls back the **in-progress gesture only**: discard a partial ink stroke (never commit it);
  discard a pending placement anchor A (tap B was never chosen); restore the pre-drag position of a
  dragged object. **A geometry already committed at tap B is never discarded by `pointercancel`** —
  "cancel keeps the stroke" is a keypad rule, not a gesture rule. Any palm-induced action that does
  land must be undoable with a labelled undo.
- Container CSS (required, or the browser steals pen/touch gestures):
  ```css
  .editor-surface { touch-action: none; user-select: none; }
  ```
- Pinch-zoom is **not built into Konva** — implement in `touchmove` (track active touches; 2 = pinch),
  pivoting on the pinch midpoint.
- Use `getCoalescedEvents()` for smooth ink; **pen-to-ink ≤ 16 ms** perceived; touch feedback (loupe +
  anchor) at `pointerdown` in the same frame (§8.4). Tool-swap feedback ≤ 100 ms.

### 8.3 Undo/redo & history (`src/editor/history.ts`)

**One mechanism for crash-recovery/persisted undo, one for session undo** (v0.2 conflated them — M10):

- **Session undo/redo:** the command pattern below. Depth **100 steps in memory**. Not persisted; cleared on app close.
- **Persisted undo across restarts = `.history` snapshots** (§5.5). "Undo after restart" means: open the Autosave chip → History flyout → restore a snapshot (a whole-sheet restore — snapshots are sheets, not commands). There is no persisted command journal in v1; do not build one.

```ts
export interface Command { do(): void; undo(): void; label: string; }

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  exec(cmd: Command) { cmd.do(); this.undoStack.push(cmd); this.redoStack = []; }
  undo(): Command | null {
    const c = this.undoStack.pop(); if (!c) return null;
    c.undo(); this.redoStack.push(c); return c;
  }
  redo(): Command | null {
    const c = this.redoStack.pop(); if (!c) return null;
    c.do(); this.undoStack.push(c); return c;
  }
}
```

Coalescing rules:
- A continuous freehand stroke = **one** undo step (not one per point).
- Style changes to a selection coalesce within a **600 ms** window into one step.
- Undo addresses annotations by **`(sheetId, annotationPath)`**, where `annotationPath` includes `insetId/childId` (children live inside insets). Never by top-level index.
- Redo stack clears on a new edit (standard).
- **Never allow undoing a photo capture into a broken state**: capture/import are undoable only while the image is still in memory; after the disk write completes they become "Delete sheet" operations instead.

### 8.4 Loupe (`src/editor/Loupe.ts`)

- Appears on `pointerdown` with **zero delay** (a delay reads as latency).
- Size 160px diameter (setting: Off / 112 / 160 / 200); zoom ~3.5× of an 80×80px source region.
- Offset ~112px from the tip in the up-and-away-from-hand direction (up-left for right-handed, up-right for left-handed); **edge-aware** (flips quadrant if it would come within 24px of a viewport edge); never under the pen hand or tip.
- Crosshair with a 12px center gap (the exact pixel stays visible). `--sel` ring + shadow.
- While a pending dimension is active, the loupe tracks the moving tip (point B), never point A.

**Touch loupe variant (new — the pen loupe above is unchanged).** Touch has no hover and the finger
occludes ~44–56 px of contact, so the touch loupe is a distinct, larger optical aid:

| Property | Touch loupe |
|---|---|
| Diameter | **200 px** |
| Magnification | **4×** (fixed, per the §19.5 rule) → source region = `diameter / 4` = **50 px** |
| Offset from contact | **136 px** (must clear the finger and its contact disc) |
| Direction | up-and-away from the **handedness side**, flipped away from the nearest corner (same edge-aware quadrant logic as the pen loupe) |
| Extra mark | 12 px crosshair gap **+ a 44 px translucent contact disc** showing the finger's true footprint |
| Leader | **1 px dashed `--sel` leader** from the anchor to the loupe |
| Timing | instant on `pointerdown`, **full opacity, no fade** |
| After lift | **freezes on the last anchor for 700 ms**, then fades to 40% |
| Suppressible | `«Magnifier when you tap»` (default ON) |

> **Arithmetic note (spec fix, log in DECISIONS).** The design source
> (`touch-first-interaction-model.md` §2.1) phrases this as "4× of a **100×100** source" — those
> cannot both hold: a 200 px window showing a 100 px source is exactly **2×** (`200 / 100 = 2`), not
> 4×. Following §19.5's established rule (**magnification is fixed; the source is derived**),
> magnification stays **4×** and the source becomes `200 / 4 = 50 px`. A 50 px source is still more
> context than the pen loupe's `160 / 3.5 = 45.7 px`.

**Kept from the pen loupe:** never a hit target; edge-aware (≤ 24 px from any viewport edge); never
under the hand or the point; never animated.

**Handedness source (v0.3):** a plain first-run question, default Right, overridable in Settings. Do NOT attempt to read the Windows "which hand" pen setting — **no web API exposes it** (M6). Do not ship copy claiming otherwise.

### 8.5 Tool behaviors (complete spec)

#### Select / Edit (`SelectTool`)
- **Tap** selects the topmost object under the tip (hit slop padded **16 px general, +24 px along thin strokes** under touch-primary; the pen-era 8/12 was too tight for a finger — §7.1 of the touch model). Selection = `--sel` bounding box (2px) + soft 4px outer glow.
- **Marquee drag** on empty canvas selects all intersecting. `Shift`+tap / two-finger tap adds to selection.
- **Handles:** 8 (corner = scale, aspect-locked; edge = free stretch; `Shift` = unlock); rotate handle 40px above top edge, snaps 0/15/30/45/90.
- **Move (drag) — object-first.** A one-finger drag **moves an object** iff the `pointerdown` hit-tests a grabbable object, the active tool is not Erase, no placement is pending, and the object is not locked; otherwise it **pans**. A **second finger always wins**: it cancels the object drag, **restores the pre-drag position**, and starts pan/zoom. Empty canvas pans. **The Pan tool overrides object-first unconditionally.** A contact that lifts within 8 px of travel is a **tap**, never a drag. *(Object-first is a deliberate product-owner decision against the safer selection-first convention; its mitigations are the deterministic predicate, two-finger drag always pans, second-finger restore, and a labelled undo.)* Alignment guides (1px `--sel`, 6px magnet) when edges/centers align. Guides are visual only.
- **Mini toolbar** (floating pill, 56px, above selection; flips below if <120px headroom): Duplicate · Delete · Lock · Bring to front / Send to back · Copy style · Paste style · tool-specific extras (Edit points for line/polygon/dimension; Replace photo / Focus for insets; Edit text for text). Every action is undoable.
- **Point editing:** line, dimension, angle, polygon, and freehand (resample) expose editable nodes; dragging updates the DERIVED label live (labels are always derived, §3.3).
- **Groups:** select multiple → `Group` (`Ctrl+G`); a callout + leader + text moves as one. Visible as a single bounding box with a `⬚` badge.
- **Locked objects:** unselectable by tap (only via Layers panel), render at 70% opacity with a `🔒` in Layers; trying to move shows a shake + toast `«Locked — unlock in Layers»`.

#### Dimension (`DimensionTool`) — the flagship flow

**Two equivalent placement paths share ONE `PlacementController`** (tap/drag unification): `pointerdown`
= `placeAnchor(A)`; contact drift updates a provisional B; `pointerup` = `placeAnchor(B)`. A **pen drag**
is "A on down, B on up, with a live provisional"; a **finger tap-tap** is the same machine with the
provisional never moving. **There is no second code path for touch.**

1. **Pen drag A→B (unchanged):** pen down at A — loupe appears immediately; snapping within 20 screen px of endpoints/vertices/corners locks to a `--sel` node; near 0/45/90 a ghost ray + `«90°»` chip appears. Drag to B with a 1:1 live line (zero easing), arrowheads per style, ticks at ends, live label at midpoint. **Collision rule** — if the midpoint is within 140 px of the tip, push the label 36 px along the perpendicular with a 1 px leader. **Pen up commits B.**
2. **Touch tap-tap A→B (new — the default verb):** tap A places the anchor pin — a **44 px `--sel` ring collapsing to 12 px over 90 ms** (this collapse *is* the "tap registered" signal) + a `1` index chip + the **touch loupe** (§8.4) + hint chip `«Tap the second point»`. Tap B commits. Same machine, no drag required.
3. **Commit → 450 ms settle window (new).** Tap B **commits the geometry immediately**, then opens a **450 ms settle window** during which a live `<PlacementHud>` (✕ · Adjust endpoints · ✓ Value) is interactive (≤ 50 ms). `settleTimer = setTimeout(openKeypad, 450)`. **Any canvas `pointerdown` before it fires clears the timer permanently for this placement** — if the contact was within 40 px of an anchor → `RefineEndpoint`; otherwise → pan. **Refining does not re-arm**; the keypad then opens only via the explicit `✓ Value`. Zero extra taps when confident, a full correction window when not. (450 ms = longer than any plausible finger-linger after a lift, and matches the existing 400 ms hold-to-shape / autosave-coalesce windows.)
4. **Keypad (input model in §6.1.1):** slot state machine; live preview from slots; fraction chips set the denominator for this entry AND update the project-level `precisionDenominator` (M11); `✓ Use this value` commits; `⛓ Chain`; cancel paths (`✕`/`Esc`/tap canvas). **Cancel keeps the drawn geometry** — never discard the stroke. Per §1.5 of the touch model: `✕` at A discards the pending anchor; `✕`/`Esc` at B or in the keypad keeps the geometry as a **Valueless** object.
5. **Hardware keyboard fast path:** type `12 6 3` + `Enter`; no focus required while the keypad is open (`parseLooseToSlots`, §6.1.1).
6. **v1 is typed-only (§2.4):** no `≈`, no calibration, no `«Keep measured…»` (deferred with calibration). The drawn line is visual; the value is typed. Do not render the drawn pixel length as a number anywhere.

#### Angle (`AngleTool`) — vertex-first, 3 taps
**Tap-tap:** tap the vertex → tap ray-1 tip → tap ray-2 tip (3 taps), reusing the Dimension placement machine; the arc renders live from tap 1; a tap within 44 px of the vertex cancels. **Pen drag** remains available:
1. Pen down = vertex (loupe active; strong snapping to endpoints).
2. Drag = first ray (live `--sel` guide).
3. Lift, then tap/drag = second ray; live arc (radius auto 40% of shorter ray, min 32px, max 120px) with arrows and the degree value at the midpoint.
4. Snapping 0.5°, hard snaps 0/45/90/180 (`«45°»` chip).
5. Second lift → angle commit sheet: `≈ 43.2°` (the `≈` here is the ANGLE tool's honest-readout convention, unrelated to calibration), precision toggles (`1°/0.5°/0.1°`), `«Complement»`/`«Supplement»` chips, `✓`, `⛓ Chain`, cancel.
6. Committed as a three-point object (vertex + two rays + arc); dragging any endpoint recomputes arc + label live.

#### Line, Arrow/Leader, Rectangle, Ellipse, Polygon
Shared pattern — **two equivalent paths**: (a) pen/touch **drag** — down to start, drag to size, up to commit; (b) **tap-tap** — tap start, tap end/opposite corner (Line, Arrow, Rectangle, Ellipse), reusing the Dimension tool's `PlacementController` and its 8 px tap slop. Tap counts: **Line/Arrow/Rect/Ellipse = 2 · Polygon = `open` · Angle = 3**. Hold steady 400 ms for constraint; all re-editable after commit via Select. Naming/commit is unchanged by path — a tap-tap line is byte-identical to a dragged one.

- **Line:** A→B, endpoint snapping, live length readout at midpoint, 45° constraint on hold.
- **Arrow/Leader:** like Line, default single end arrowhead; `elbow` (straight/90°/curved). Optional text slot: after drawing, if Text was the last-used text style, show `«Add label»` at the tail → converts the leader into a callout with an attached text object.
- **Rectangle:** corner-to-corner or center-out (setting); corner radius (0/4/12/24); live `W × H`; **fill applies with transparency, default no fill** (so the photo stays readable).
- **Ellipse:** like Rectangle minus corner radius; hold-to-constrain = circle; live `W × H`.
- **Polygon:** tap-by-tap vertex placement (numbered `--sel` nodes raised to a **56 px hit**, snapping, rubber-band to previous). Close by tapping the first node (grows a 56 px `--sel` ring within 32 px) or `Enter`. An on-screen **`✓ Done`** HUD button is the discoverable equivalent of `Enter`, and **`«Undo point»`** replaces `Backspace` for touch — every keyboard-only action has an on-screen control (§11.1 #7). `Backspace` still removes the last vertex; double-tap the last vertex ends an open path. (Polygon area readout is deferred with calibration, §2.4.)

#### Freehand & Highlighter (`FreehandTool`)
- **Freehand:** 1:1 ink via `getCoalescedEvents()`; pressure → width when enabled (min 30% of nominal at 0 pressure); tilt → width for pen; catmull-rom → bezier fit (a 12-point stroke renders smooth). Smoothing 0–100 (default 45).
- **Pen-fluent, finger-opt-in (touch-primary).** `pressure` and `tilt` are **pen-only signals** — `pressure` is a parallel array filled from pen input (§3.3), so a finger cannot emit either. A finger may draw freehand only when `«Finger draws (freehand)»` is ON (default **OFF**), and then pressure→width is **off**, width uses a fixed floor of **8 mu**, smoothing is **60**, thinning **0**. Say it once in-context: `«Freehand is most precise with the pen.»` **Expression is the pen-only part; state that rather than faking it.**
- **Perfect shape on hold:** pen still within 8px for 400ms at stroke end → replace with a recognized primitive (line/rect/ellipse). `«⇧ Shape»` chip during hold; moving >8px cancels (keeps the freehand stroke). On by default.
- **Rendering (v0.3 hardened — verified against perfect-freehand 1.2.3):** store raw points + pressure in `markup.json`; render via perfect-freehand. **The package exports ONLY `getStroke`, `getStrokePoints`, `getStrokeOutlinePoints` — `getSvgPathFromStroke` is NOT exported.** Use this local helper (`src/editor/shapes/svgPath.ts`):
  ```ts
  // Local helper — copied from perfect-freehand's README recipe (MIT, steveruizok).
  const med = (a: number, b: number) => (a + b) / 2;
  export function getSvgPathFromStroke(points: number[][], closed = true): string {
    const len = points.length;
    if (len < 2) return '';
    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let i = 0; i < len; i++) {
      const [x0, y0] = points[i % len];
      const [x1, y1] = points[(i + 1) % len];
      const [x2, y2] = points[(i + 2) % len];
      if (closed || i < len - 1) {
        d += ` Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${med(x1, x2).toFixed(2)} ${med(y1, y2).toFixed(2)}`;
      } else {
        d += ` Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
      }
    }
    if (closed) d += ' Z';
    return d;
  }
  ```
  ```ts
  import { getStroke } from 'perfect-freehand';
  import { getSvgPathFromStroke } from './shapes/svgPath';

  // size = strokeWidthMu (NOT ×2 — the v0.2 snippet doubled ink width vs shape strokes).
  // Screen: pass size = strokeWidthMu / stageScale and regenerate on zoom change (fills
  // ignore strokeScaleEnabled — §4.2 rule 4). Export: pass size = strokeWidthMu at scale M.
  // SESSION-4 FIX (F7): geometry stores TWO PARALLEL arrays — `points: Px[]` and
  // `pressure: number[]` (§3.3/§3.4). `Px` has NO `pressure` member, so the old
  // `points.map(p => [p.x, p.y, p.pressure ?? 0.5])` does not compile under `strict: true`;
  // any cast around it yields a constant 0.5 and silently kills pressure/tilt ink width.
  // Index the parallel array instead. Same fix applies to `highlight` (shared renderer).
  const outline = getStroke(
    points.map((p, i) => [p.x, p.y, pressure[i] ?? 0.5]),
    { size: strokeWidthMu / stage.scaleX(), thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
  );
  const d = getSvgPathFromStroke(outline, true);
  const path = new Konva.Path({ data: d, fill: style.strokeColor, strokeScaleEnabled: false });
  ```
  Never store the derived path — only raw input points.
- **Highlighter:** multiply blend, default 30% alpha, chisel tip (tilt changes chisel angle); **auto z-order: inserted below all other markup but above the photo** (a dedicated z-band). Long-press for chisel width + `Straight line` lock. **Under touch the `Straight line` lock defaults ON**, turning the Highlighter into the app's touch-native stroke tool: a **tap-tap** A→B straight 24 px chisel bar reusing the placement machine verbatim; freehand highlight stays available via long-press. Chisel-width default for touch = **24**.

#### Text (`TextTool`)
- Tap → inline caret at tap point, Windows soft keyboard slides up; canvas auto-pans so the caret is never under the keyboard.
- Controls (style panel): size 10–72, bold, align L/C/R, color, background (`none`/`pill`/`solid`/`auto-contrast` — default `auto-contrast`, samples the 48×48px region behind the text and picks black-on-white or white-on-black), leader toggle.
- Commit: tap elsewhere / `Esc` / `Done`. Empty text discarded silently. Re-edit: double-tap. Multi-line: `Enter` inserts newline; box auto-grows.
- Disable autocorrect/autocapitalize on numeric-leading strings (never change measurements).
- **Rendering:** Konva.Text with `fontSize = fontSizeMu / stageScale` (§4.2), updated on every zoom change.

#### Image inset (`InsetTool`) — photo within the photo

**Coordinate model (v0.3 — this was the under-specified core; follow exactly):**

- The inset's asset is a **normalized working image** exactly like a sheet photo (§7.1: EXIF-baked, ≤4096px, dimensions fixed at insert).
- **Child geometry is stored in the asset's working-image pixel space** — identical semantics to a top-level sheet. `geometry.x/y` of the image annotation is the inset's top-left **in sheet px**; `width/height` are the placed size in sheet px; `rotation` degrees around the placed rect's center; `crop` is a rect **in asset px**.
- **Rendering:** each inset is a `Konva.Group` whose placed rect sits at `(x, y)` (top-left, sheet px) with group scale mapping the cropped region to the placed size: `group.scale({ x: width / crop.width, y: height / crop.height })` (default crop = full asset, i.e. `0,0,assetW,assetH`). **Rotation pivots on the placed rect's CENTER** — Konva rotates a node about its own origin (the rect's top-left if unset), so set the pivot explicitly, or wrap in a parent group at the placed-rect center that carries the rotation. (Pivot: `group.offset({ x: crop.width / 2, y: crop.height / 2 })` — **LOCAL crop-window units, NOT placed units** — paired with `group.position({ x: x + width / 2, y: y + height / 2 })`.) Apply crop via `clipFunc` (a rect in group-local space, where **group-local = the crop window** — origin at the crop rect's top-left; group-local clip + group scale does crop-then-transform in the right order):
  ```ts
  group.clipFunc(ctx => ctx.rect(0, 0, crop.width, crop.height));
  assetImage.position({ x: -crop.x, y: -crop.y });   // ← the crop window scrolls the asset INTO view
  ```
  (**Round-2 fix + session-3 hardening:** with a non-zero `crop.x/y`, the asset image must be offset `(-crop.x, -crop.y)` inside the group — "drawn at its own pixels, unscaled position" alone would show the wrong region. **The same `-crop` offset applies to every child**: a child stored at asset px `(cx, cy)` renders at group-local `(cx - crop.x, cy - crop.y)`. Round 2 fixed the image offset but left "children at their true asset-space positions"; read literally as group-local `(cx, cy)`, that mis-aligns children whenever `crop.x/y ≠ 0`.) Children are stored in **asset px** and offset by `-crop` at render only; they scale/rotate with the group automatically, are clipped automatically, and stay glued to the photo content when the crop window moves.
- **Children are NEVER rewritten** when the inset is moved, scaled, rotated, or cropped. They are pure asset-space data. Changing `crop` moves the visible window over the (fixed) child space — children stay glued to the photo content, which is the field-correct behavior (zooming the crop window is "looking closer at the detail photo," not moving its markup).
- **Default placement:** 40% of sheet width, centered on the tap point, aspect preserved, rotation 0, handles showing. `crop` omitted (defaults to full asset).
- **Replace photo:** if the new asset's working-image dimensions are **identical**, swap the asset reference and keep children (visual continuity). If dimensions differ, children cannot be mapped — the dialog states this explicitly and offers `«Keep markup anyway — it may land in the wrong place»` (warned) or `«Remove markup»`. No silent remap. (M7)
- **Asset dedupe:** assets are deduped by content hash across the project; **children belong to the annotation, not the asset**, so two insets sharing one asset file have independent children. State this so the builder doesn't "fix" dedupe by moving children onto the asset record.
- **Hit-testing:** container-space → (group absolute transform)⁻¹ → **group-local px → + `crop` → asset px**. The inverse group transform lands in group-local (crop-window) space, NOT asset space — add `crop` to reach asset px (`asset.x = local.x + crop.x`, `asset.y = local.y + crop.y`). Child hits resolve to `(insetId, childId)`.

**Flows:**
- **Insert:** select tool → tap location → bottom sheet: `Take a photo` / `Choose from device` (multi-select = each as its own inset, cascaded 24px down-right) / `Recent photos` (4×2 grid of this project's last 8 — the field-fast path).
- **Manipulation:** 4 corner handles (scale, aspect-locked), 4 edge handles (adjust crop window — not stretch), rotate handle (0/90/180 snap), body drag with guides, two-finger pinch/rotate directly on the inset. Style panel: border (on/off + width + color), opacity, corner radius (0/6/12/24), crop (rule-of-thirds + straighten slider), replace photo, shadow.
- **Focus mode (nesting):** first tap = select; second tap (or `Focus`/`Enter`) = Focus mode — everything outside dims to 35%; a breadcrumb chip docks top-center `«Sheet 04 › Inset 2»` with `«Done»`; all tools now draw into the inset's own clipped markup layer. `Esc`/`Done` exits (selection unchanged). The Inset tool is disabled inside Focus with the tooltip `«Nested insets aren't supported»` — **nesting exactly ONE level** is enforced.
- Objects created *outside* Focus render **above** all insets; objects created *inside* belong to the inset, are clipped to it, and scale/rotate with it.

#### Erase / delete (`EraseTool`) — two modes (long-press to switch)
- **Object mode (works well with touch):** pen hover/drag outlines the object (`--err` + name chip); tap/drag deletes. **Under touch there is no hover**, so the pen preview is replaced by **tap-to-delete + an undo toast naming the object** (`«Undid: Delete dimension 12' 6"»`) — delete immediately, because a delay reads as lag. For a pre-commit signal, **long-press 600 ms** reveals the `--err` outline + name chip *without* deleting. **Undo toast (8s), no dialog** (undo exists).
- **Stroke mode is pen-only under touch:** segment-wise scissoring needs pen precision. Under touch, **hide stroke mode** and show `«Splitting a stroke needs the pen. Touch can delete the whole stroke.»` A finger in stroke mode deletes whole strokes (tap-to-delete). Erases freehand/highlighter segment-wise by **splitting strokes at the nearest raw input points** (vector-safe, approximate but feels right). Do **not** reach for a polygon-boolean library — it explodes scope and breaks the "keep raw points" rule.
- Scope chips: `Ink` / `Markup` / `Everything`. `Everything` shows `--err` tint + requires confirm.
- `Clear sheet markup` lives in the overflow menu (not the rail); dialog lists counts per category + hold-to-confirm.

#### Replace photo (`ReplacePhotoTool` behavior, from Select's mini-toolbar)
- Identical dimensions (after normalization) → asset swap, children kept.
- Different dimensions → dialog: `«The new photo is a different size. Markup saved in the old photo's coordinates may land in the wrong place.»` → `«Keep markup»` (warned) / `«Remove markup»` / `«Cancel»`. Hold-to-confirm on the destructive option.

### 8.6 Layers panel

Flyout (320px) listing (top = front): `Markup` (grouped: Dimensions · Shapes · Ink · Text), each `Inset` (its children indented), `Photo` (base — lockable, never deletable). Rows 56px; eye toggle, lock toggle, drag-to-reorder (400ms long-press starts the drag), tap = select (pans to it if off-screen), long-press = Bring to front / Send to back / Group / Ungroup / Rename / Delete. Selecting a markup group is the fastest mass-restyle path.

---

## 9. Export

### 9.1 Flatten-only (v1)

Markup is burned into the raster at the chosen multiplier. **Vector-overlay PDF is deferred to 1.1** (it drags in fontkit, fraction glyphs, and dash mapping for marginal v1 value) — and per §2.4 there is no "flatten" checkbox: it is always flattened. No dimensions summary page (deferred).

### 9.2 PDF (`src/export/pdf.ts`) — `@cantoo/pdf-lib`

```ts
import { PDFDocument } from '@cantoo/pdf-lib';

type SheetExport = { jpg: Uint8Array; imageWidthPx: number; imageHeightPx: number };

/** Flatten-only: one page per sheet, fit-to-photo page size.
 *  PAGE SIZE IN POINTS = image px × 0.75 (96dpi photo).
 *  The bitmap (rendered at M×, §4.2) is embedded to COVER the page exactly. */
export async function buildPdf(sheets: SheetExport[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const s of sheets) {
    const img = await pdf.embedJpg(s.jpg);            // camelCase embedJpg/embedPng — verified API
    const pageW = s.imageWidthPx * 0.75;             // pt
    const pageH = s.imageHeightPx * 0.75;            // pt
    const page = pdf.addPage([pageW, pageH]);
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });  // cover the page exactly
  }
  return pdf.save();
}
```

- **The bitmap is rendered by the export stage (§4.2 export rules) at scale M, `pixelRatio: 1`.** `imageWidthPx/HeightPx` are the **working-image** dimensions (the coordinate space), NOT the bitmap's — the page is the photo at 96 dpi regardless of M; M only sets raster fidelity.
- **PDF origin is bottom-left** — moot for flatten-only; relevant the moment vector overlay ships.
- `@cantoo/pdf-lib` does not re-apply orientation; the working image is already EXIF-normalized.

### 9.3 PNG (`src/export/png.ts`)

One file per sheet at `1×/2×/3×` (working-image px × M); **zip into a single `.zip` by default** via `fflate` (`zipSync` — pinned dependency, §2.2).

### 9.4 Filenames (`src/export/filenames.ts`) — HARDENED

- Token template `{project} {index} {sheet} {date} {time}`; default `{project}_{index}-{sheet}`.
- **Sanitize every token AND the joined result**:
  - Strip `<>:"/\|?*` and control chars (C0 + C1, U+0000–001F, U+007F–009F).
  - Reject reserved DOS device names for any token whose base equals one: `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` (case-insensitive, with or without extension) → prefix `_` (e.g. `_CON`).
  - **Strip trailing dots and spaces** (Windows strips them silently → `foo .jpg` vs `foo.jpg` collision).
  - Cap each token at 48 chars, the **joined base name at 120 chars**, and the **full path at 240 chars** (pre-check with the destination path; if exceeded, truncate the base name and note it in the wizard).
  - Empty token → substitute `untitled` (never a bare `..` or `-.jpg`).
- Conflict policy: `Add (1)(2)` (default) / `Overwrite` / `Skip`.

### 9.5 Destination & result

- Default `<project>/exports/<timestamp>/`; "Remember this destination" per project.
- Result view: `--ok` check, `Exported N files (X MB)`, full path in mono, `Copy path`, `«Reveal folder»` (= `showDirectoryPicker({ startIn: <handle> })`), `Export again`, `Done`, plus the line: *"Drag this folder into Dropbox when you're back on Wi-Fi."*
- **"Open folder"/"Show in Explorer" is not possible from a PWA** (no browser API opens Explorer at a path). The UI spec's "via the OS" copy is replaced by `Copy path` + `Reveal folder`. Do not burn time on this.
- Errors are per-file with per-file retry (`Folder permission expired` → Re-authorize; `File is open in another app` → Retry; `Not enough disk space` → show the shortfall). Never "start over".
- **Memory guidance (8 GB Surface Go):** at 3×, a 4096-px sheet's bitmap is ~12,288×9,216 ≈ 450 MB of canvas. Defaults: **wizard quality defaults to 2×**; choosing 3× shows `«Slow on this device — expect a wait»` on a Surface Go profile; render and embed **one sheet at a time**, freeing each bitmap before the next (`imgbitmap.close()`, drop Konva refs); never hold 50 sheets' bitmaps in memory.

---

## 10. State stores

```ts
// src/state/appStore.ts
import { create } from 'zustand';

interface AppState {
  projects: ProjectSummary[];           // list of { id, title, sheetCount, thumbPath, path, status }
  currentProjectId: string | null;
  currentSheetId: string | null;
  storageStatus: 'ok' | 'pending' | 'readonly' | 'offline' | 'error';
  theme: 'standard' | 'sunlight' | 'dim';
  density: 'field' | 'desk';
  handedness: 'right' | 'left';
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  precisionDenominator: number;
  // … actions
}

// src/state/editorStore.ts
interface EditorState {
  activeTool: ToolId;
  styleByTool: Record<ToolId, AnnotationStyle>;
  selection: string[];                  // annotation ids (with path context)
  viewTransform: { scale: number; x: number; y: number };
  pendingOp: 'none' | 'dimension' | 'angle' | 'polygon' | 'inset' | 'text' | 'erase';
  focusInsetId: string | null;          // null = not in Focus mode
  radialRecents: ToolId[];
  // … actions
}
```

- `styleByTool: Record<ToolId, AnnotationStyle>` is what makes tool-swapping a return, never a reset.
- The command history (§8.3) and persistence queue live in dedicated modules, not in the stores.

---

## 11. UI/UX specification

> This section is the implementation-level summary. The full spec — `docs/ui-spec-field-measure-v2-hardened.md` — is authoritative on visual tokens, exact pixel values, and interaction micro-detail. A builder must honor its "do not simplify" list (reproduced in §11.6). This section exists so the builder does not need to flip between files for the core layout and flows. **§2.4's scope table overrides both documents.**

### 11.1 Interaction principles (non-negotiable)

1. **Touch taps and moves; the pen draws. Both create geometry** (§8.2). Touch is the primary input; the pen enhances it with pressure, tilt and hover. Touches are suppressed 1.2 s after any pen event AND during any active pen stroke; **with no pen present there is no deterministic palm suppression** — edge rejection + multi-touch debounce are bounded heuristics only, and undo + `pointercancel` rollback are the safety net. Toggles: `«Touch places and moves»` (ON), `«Finger draws (freehand)»` (OFF), `«Magnifier when you tap»` (ON), `«Gloved touch»` (OFF); `«Pen only»` remains an input filter, no longer the only one.
2. **The photo is never occluded by persistent chrome.** Anything over the canvas is transient (loupe, keypad, popovers, selection toolbar), dismissible by tapping the canvas / `Esc` / completing the action.
3. **Style is always one tap from the tool** — the Style Chip is a live WYSIWYG render of the next stroke, always on screen.
4. **Back is always safe** — everything autosaves, so back never prompts/warns/loses work.
5. **Destructive needs intent** — recoverable = toast + undo (never a dialog); irreversible = dialog with **hold-to-confirm (600 ms)**.
6. **Marks must survive any photo** — dual-outline text + 92%-opaque control backgrounds over the photo, everywhere.
7. **No gesture-only or hover-only actions** — every gesture and every pen-hover affordance has an on-screen control (§11.6 #18). Two-finger tap is a secondary path only; the actions it triggers also exist as buttons.

### 11.2 Target device & layout

| Target | CSS px @ scale | Notes |
|---|---|---|
| Primary: Surface Pro 9/8 landscape | 1440 × 960 @ 200% | design canvas |
| Min: Surface Pro 7 / Go 3 | 1368 × 912 / 1280 × 853 | must not break |
| Primary portrait | 960 × 1440 @ 200% | |
| Desk: Laptop Studio | 1200 × 800 @ 200% | Compact density |

Physical math (267 ppi @ 200%: 1 CSS px = 0.1904 mm): 48px = 9.1mm (floor), 56px = 10.7mm (tool/style), 64px = 12.2mm (keypad/shutter/confirm), 88px = 16.8mm (shutter). Min 8px gap.

**Aspect rule:** photos are 3:2 (landscape) / 2:3 (portrait). Chrome is placed so the remaining canvas aspect stays close to the photo's — hence the **vertical rail, not a bottom deck** (vertical rail yields ~15% more photo area).

### 11.3 Editor layout

- **Landscape:** Style Panel (72 collapsed / 280 expanded) | Canvas (1240 × 908) | Tool Rail (128). Left-handed: mirrored (Tool Rail left, Style Panel right).
- **Portrait:** Tool Rail (128) | Canvas (832 × 1316) | Style bar (bottom, 72, horizontal).
- **Docking rule (deterministic):** viewport aspect ≥ 1.2 → Style Panel docks to the side opposite the rail; < 1.2 → docks bottom. **The tool rail never moves** (muscle memory).
- **Top bar (52px):** breadcrumb (tappable) + inline sheet title | Autosave chip (center) | Layers · Export · Overflow. In portrait, Export collapses to icon, breadcrumb collapses to a chip; Autosave + Layers never collapse.
- **Canvas:** pinch 0.25×–8× (centered on pinch midpoint), double-tap = fit↔100%, zoom pill bottom-left (auto-dims after 4 s). Overscroll 240px springs back.

### 11.4 Tool rail

128px = 2-column grid of 56px buttons, bottom-anchored (most-used tools in the lower comfortable arc), undo/redo at the very bottom. 14 tools in 6 groups (fixed boundaries — the grouping is the pedagogy):

| Group | Tools |
|---|---|
| MOVE | Select, Pan & Zoom |
| MEASURE | Dimension, Angle (accent-tinted — the "money" tools) |
| MARK | Line, Arrow, Rectangle, Ellipse, Polygon (+ `More ▸` for corner radius/smoothing) |
| ANNOTATE | Freehand, Highlighter, Text |
| INSERT | Image inset |
| ERASE | Erase (isolated, `--err` on press, 16px extra gap) |

Button states: default → hover (`--g750` + tooltip; **under touch the Style Chip names the tool and press-and-hold opens the tool's name + options** — there is no hover, §11.6 #18) → active (`--hi` fill, white icon, 4px accent bar) → pressed (0.96 scale) → long-press (tool options popover). Disabled only for Erase when everything is locked.

Radial menu: **only** as an 8-slot recents quick-swap (last 8 distinct tools). **The primary entry path is the rail's press-and-hold** (works for touch, mouse and pen); the pen **barrel-button hold** is an *optional accelerator* on top of it, so the radial is reachable even if the pen reports no barrel button. **Not** a replacement for the rail.

### 11.5 Style panel

- **Style Chip (never optional):** active tool icon in a `--hi` circle + a 96×40px SVG that renders the *actual* next stroke (real color/width/dash/arrowheads/fill/transparency/`Aa` size). Tap = expand panel; long-press = compact popover at pointer.
- **Controls (contextual per tool):** color swatches (12-swatch palette + Custom + Eyedropper with "Nudge for contrast"), width scrubber (live-preview track; `[`/`]` step), fill + transparency (checkerboard underlay), line style (solid/dashed/dotted), arrowheads (none/start/end/both), text size/bold/align/background, precision + unit format (dimension — edits the **project-level** values, M11), sides/close (polygon), corner radius (rect), pressure/smoothing/perfect-shape (freehand), chisel width/straight-line (highlighter), border/opacity/corner-radius/crop/replace/focus (inset), mode/scope (erase).
- **Selected vs current-tool rule:** ≥1 selected → panel edits the selection **and** updates the tool's active style; none selected → edits only the tool's active style. Mixed values render indeterminate; type-changing controls are **disabled, not hidden**; heterogeneous selection shows a scope chip.
- **Speed:** 44px swatches (frequent, 6px dead space, no adjacent destructive action); drag-scrub width; 8-slot recents; named presets in `.fieldmeasure/presets.json`; per-tool style memory (`styleByTool`).
- **Style editor sheet** (deep edits): long-press the Style Panel header or `«More styles…` → 720×640 sheet, canvas dimmed to 60% (not 100% — the user must see the photo while picking a color for it). If the folder is unavailable, presets show a warn strip and styles still work in memory (§7.5 states this in the UI spec).

### 11.6 "Do not simplify" list (from the UI spec — treat flattening any of these as a bug)

1. Vertical tool rail on the pen-hand side (not a bottom bar / left palette).
2. Rail is a 2-column grid, bottom-anchored, undo/redo at the bottom.
3. No full-tool-set radial menu — only the 8-slot recents radial. Its **primary entry is the rail's press-and-hold** (every input); the pen barrel-button hold is an optional accelerator.
4. Style Chip is a WYSIWYG render, not a colored dot.
5. Style edits apply to selection AND update tool default; mixed = indeterminate; incompatible controls disabled (not hidden).
6. Dimension loupe on pointerdown with zero delay, edge-aware, never under hand/tip; label offsets with a leader line.
7. Cancelling the dimension keypad keeps the drawn geometry.
8. The Chain button exists.
9. Live ft-in parse preview + no-focus keyboard fast path (slot model, §6.1.1).
10. Insets are containers with their own markup, nested one level, Focus breadcrumb chip.
11. Highlighter inserts below all other markup.
12. Hold-to-shape (400ms) for freehand, with a `⇧ Shape` chip.
13. Recoverable deletion never dialogs (toast + undo); irreversible = hold-to-confirm.
14. Autosave chip never icon-only, never optimistic.
15. Sunlight mode is a token-level theme, not a filter.
16. Dual-outline text + 92%-opaque control backgrounds over the photo.
17. 2px minimum hairlines (no 1px borders).
18. Pen hover drives tooltips and erase targeting. **Under touch (no hover) the equivalents are mandatory:** the Style Chip names the tool + shows a WYSIWYG swatch; press-and-hold a rail button for name + options; erase = tap-to-delete + undo toast (long-press to preview without deleting); a proximity halo marks the nearest handle within 56 px. Snap preview survives (snap resolves at `pointerdown` and during refine, shown by the pin + loupe).
19. Export ends by telling the user to drag the folder into Dropbox.
20. **Precision is project-level; the Dimension panel edits the project value — never a per-tool-only override** (M11).

*(The v0.2 item "Uncalibrated dimensions show ≈" is superseded by §2.4 — calibration is deferred, so there is no `≈` on dimensions in v1. The Angle tool's `≈` readout is unrelated and stays.)*

### 11.7 Visual direction "Site Slate"

- Dark graphite chrome (keeps annotation colors honest, reduces glare); **one** hi-vis accent. **Accent discipline (hard rule): orange = action/measurement, cyan = selection/manipulation — never swap.**
- Tokens: `--g900 #0E1318` app/mat · `--g850 #12181E` chrome · `--g800 #161C23` panel · `--g750 #1E262F` elevated · `--g700 #2B3540` hairline · `--g600 #3A4652` control border · `--g400 #6E7F8E` disabled · `--g300 #9FB0BE` secondary · `--g100 #EAF0F5` primary · `--g000 #FFFFFF`. Accents `--hi #FF7A18`, `--hi-d #D45F0C`, `--sel #2FD4E0`, `--sel-d #12909A`. Semantic `--ok #3DD68C`, `--warn #FFC24B`, `--err #FF5A5F`.
- **12-swatch markup palette** (ordered for real-photo visibility): `#FF7A18` Hi-Vis Orange · `#FFD400` Safety Yellow · `#E8384F` Signal Red · `#FF3D9A` Magenta · `#2FD4E0` Cyan · `#35A7FF` Sky · `#2ECC71` Green · `#A8E05F` Lime · `#FFFFFF` White · `#000000` Black · `#9AA6B2` Concrete · `#123B6B` Deep Navy.
- **Type:** Archivo (UI, variable 400/500/600/700) + JetBrains Mono (all numerals, 500/700, tabular figures, slashed zero). Self-hosted woff2 subsets; **never a CDN**.
- Radii 10px controls / 14px panels / 999px pills; elevation only on floating layers; 150ms chrome motion, **zero animation on ink**.
- **Icons:** lucide-react for chrome icons (arrows, overflow dots, close, search…). **The 14 tool glyphs are bespoke SVG paths** drawn to the UI spec's glyph notes (Dimension = measured line with ticks and outward arrowheads; Angle = arc between two rays) — lucide has no surveying tool set and the UI spec forbids a generic library for tools. Do not substitute.

### 11.8 Camera & import

- `getUserMedia` full-bleed viewfinder, no top bar. Chrome hugs edges: close · torch/grid/level/flip (default rear) · **resolution: `«High (device max)»` / `«Fast»` — the label shows the real max the device reports (A7)**; `enumerateDevices()` + `deviceId` picker + `ondevicechange`; `facingMode` is unreliable on Windows — don't use it for selection.
- Tap-to-focus reticle (`--sel`), long-press = AE/AF lock; horizon line turns `--ok` within ±1.5°; auto-capture-on-level off (deferred with the level feature if the sensor budget hurts — measure in slice 1.4).
- Shutter 88px; capture = 120ms black flash + thumbnail flies to corner; review screen: `Retake · Rotate · Use photo` (auto-enhance is DEFERRED, §2.4).
- **Camera-unavailable fallback (mandatory):** if `getUserMedia` is unavailable or denied, show `«Camera unavailable… Open Windows Camera or Import a photo.»` (note the OS privacy setting: Settings → Privacy → Camera → allow desktop apps). **The Windows Camera app is the high-res path** when the tab's `getUserMedia` caps are too low for the job (A7).
- **Do NOT use `<input type="file" capture>`** — `capture` is ignored on Windows desktop. Use `getUserMedia` + `<video>` + canvas snapshot.
- Import from disk: `🖼 Import` → OS picker, multi-select jpg/png/heic/webp. From Home/Project → each becomes a sheet; from Editor → each becomes an **inset** (with an `Insert as: Inset / New sheet` override). Read EXIF orientation (bake it), capture time (default name), camera model; **strip GPS by default**. **HEIC/webp are not reliably decodable in Edge (OS codec dependent)** — feature-detect decode and use the "Couldn't open this image" state, not just the accept attribute.
- Autosave on capture: write `sheets/<n>/photo.jpg` immediately (**atomically**, §5.3); on write failure keep the sheet in memory + `Save a copy…` (a field photo is never trapped).

### 11.9 Home & Project

- **Home:** search + sort (Recent/Name/Size/Needs attention), 3-column project card grid. Card = cover thumbnail + name + mono meta (`12 sheets · 48 MB · 2:14 PM`) + middle-truncated path chip + per-card availability state (`Folder not found` → `Locate…`). Empty state copy: `«Projects are just folders on this PC. Pick one and everything saves into it.»` `Remove from this list` never deletes files (says so). Long-press = Rename / `Copy path` / `Reveal folder` / Export all / Remove from list / Delete files (hold-to-confirm, shows the path). **Rename copy must state: `«Renaming changes the project name, not the folder.»`** (§5.6). Secondary cards: `«Open existing folder…»` (import-bundle card is CUT, §2.4).
- **Project:** 4-column sheet grid of composite thumbnails + index badge + `+2` inset badge. **Add affordances are the first two tiles** (`Take photo`, `Import`) — always live, never skeleton. Long-press to reorder (live renumber). Selection mode = batch action bar. Card menu: Open, Rename, Duplicate, **Replace photo** (constrained, §8.5), Delete — **Rotate is CUT** (§2.4).
- **Trash restore (NEW):** Project ⋯ → `«Trash…»` lists `.trash/` entries (name, deleted date, day-left-to-prune); tap → read-only preview + `«Restore»` (writes the sheet folder back into `sheets/`, restores the `project.json` row) with an undo toast. Prune (14 days) runs on project open.
- **Storage chip (Home + Editor):** `● Local · 48 MB · Saved 2:14 PM` / `◐ Saving…` / `● Pending — folder offline` / `● Read-only` / `● Offline · no network needed` (shown once).

### 11.10 Export wizard

Modal (880×700 over 60% scrim), step rail `Scope · Format · Destination`:
- **Scope:** This sheet / Selected (n) / All (n), live count + size estimate, per-sheet checkbox list.
- **Format:** PDF (multi-page, one page/sheet, fit-to-photo, **1×/2×/3× with 2× default**, §9.5 memory note) vs PNG (one/sheet, zip by default). Naming template with token buttons + live filename preview + conflict policy. **No "flatten markup" checkbox (always flattened, §2.4) and no summary-page checkbox (deferred).**
- **Destination:** resolved path in mono (default `<project>/exports/<timestamp>/`), remember-per-project.
- **Result:** success check, path, `Copy path`, `«Reveal folder»`, `Export again`, `Done`, + the Dropbox line. Errors per-file with per-file retry.

### 11.11 System status & safety

- **Autosave chip** (the trust anchor replacing Save): Saved / Saving / Pending-offline / Read-only / Error+Retry. Never icon-only, never optimistic. Tap → **History flyout** (snapshots every 10 min + before each destructive action; restore = whole-sheet restore, §8.3).
- **Undo/redo** (§8.3): 100 in-memory session steps; history snapshots are the persisted mechanism. Ink coalesced; style edits coalesced 600ms; each undo toasts its action name.
- **Destructive policy** (§13.3 table in UI spec): recoverable = toast + undo; irreversible = hold-to-confirm dialog (initial focus on Cancel, `Esc` cancels). Sheet delete → 14-day `.trash/` **with restore UI (§11.9)**. Replace photo with different dimensions → warned choice (§8.5).
- **Toasts:** single-instance, bottom-center, 8s (10s with undo), never stack.

### 11.12 Accessibility & field ergonomics (requirements)

- WCAG 2.2 AA: 4.5:1 text, 3:1 UI. Sunlight mode = token-level theme (#000/#FFF ≈21:1, 64px floor, no fades).
- Dual-outline canvas text (`paint-order: stroke; stroke: rgba(11,14,18,.85)` 4px halo behind fill).
- 2px minimum hairlines; targets 56px (rail/style) / 64px (keypad/shutter/dialog) / **48px floor under touch-primary**; **hit slop 16px general / 24px along thin strokes** (raised from the pen-era 8/12px; §7.1 of the touch model); 8px gap.
- **Under touch there is no hover**; every pen-hover affordance has an explicit touch equivalent (§11.6 #18). **Handedness** is the first-run question (default Right, overridable in Settings) — it mirrors rail side, style-panel side, **loupe offset direction (the touch loupe flips away from the handedness side and the nearest corner)**, keypad side and toolbar anchor. Do not read the Windows pen setting (impossible from the web).
- Full keyboard operability (`:focus-visible` rings, logical tab order, arrow-nudge 1px/10px, direct typing into keypad). Screen reader: `aria-label` naming tool + current style; accessible object tree mirroring Layers. **Make the canvas container focusable** so arrow-nudge works after a touch selection.
- Pen-to-ink ≤16ms; tool-swap ≤100ms; audio off by default; offline-correct (no CDN/telemetry).

---

## 12. Repository layout

```
field-measure/
├─ README.md
├─ THIRD-PARTY-NOTICES.md          # license notices — required (§2.2)
├─ docs/
│  ├─ preflight-handoff-v0.3-hardened.md   # this file
│  ├─ ui-spec-field-measure-v2-hardened.md # UI/UX spec (authoritative on look & feel)
│  ├─ DECISIONS.md                 # ADR log (one entry per decision in §16)
│  └─ UNITS.md                     # accepted input formats, rounding rules, examples
├─ package.json  /  vite.config.ts  /  tsconfig.json  /  .env.example
├─ public/icons/  (original icons — not third-party assets)
├─ src/
│  ├─ main.tsx  App.tsx
│  ├─ domain/   types.ts  schema.ts  units.ts  geometry.ts  snapping.ts  ids.ts
│  ├─ fs/       projectStore.ts  backend.ts
│  ├─ media/    normalizeImage.ts  exif.ts  thumbnails.ts
│  ├─ editor/   EditorCanvas.ts  inputRouter.ts  history.ts  Loupe.ts  ZoomPill.ts
│  │            tools/  shapes/ (svgPath.ts)
│  ├─ export/   pdf.ts  png.ts  filenames.ts
│  ├─ state/    appStore.ts  editorStore.ts  styleByTool.ts
│  ├─ ui/       ProjectList.tsx  ProjectView.tsx  SheetEditor.tsx  ToolRail.tsx
│  │            StylePanel.tsx  DimensionKeypadSheet.tsx  ExportWizard.tsx
│  │            LayersPanel.tsx  CameraFlow.tsx  FirstRun.tsx  Settings.tsx  strings.ts
│  └─ settings/ handedness.ts  units.ts  theme.ts  density.ts
└─ tests/  units.test.ts  keypad.test.ts  geometry.test.ts  snapping.test.ts
           schema.test.ts  filenames.test.ts  e2e/editor.spec.ts
```

All user-visible text lives in `src/ui/strings.ts`.

---

## 13. Build plan (slices)

Build in order. Do not start a slice until the previous slice's "done when" passes **on a real Surface** (touch-first; a pen is used where a gate names one). Mouse-only testing misses the important bugs. Each slice leaves the app usable.

> **Session 4 added three slices** — 0.0, 1.4.5 and 1.11 — for work that previously had no
> owner. `docs/implementation-plan.md` is the authority on order and done-ness and carries
> their full build packets.

### 0.0 — Origin, distribution and install decision (NEW — session 4, §19.1)
**Files:** `docs/DECISIONS.md` (the decision), `docs/install-runbook.md` (how a Surface gets the app).
**Do:** choose and **pin** the origin (scheme + host + port + base path) the app will be served from for the life of the product, per §19.1; confirm it is a secure context; write the per-device install runbook (open the URL in Edge → Install → verify airplane-mode reload → pick the projects folder). Nothing is built here — this is a half-day decision that costs a migration if it is made after slice 0.1.
**Done when:** the origin is written in DECISIONS with its rationale, `start_url` and `scope` for slice 0.1's manifest are stated verbatim, and the runbook exists.

### 0.1 — Scaffold
**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `.github/workflows/ci.yml`, `public/icons/*`, `src/main.tsx`, `src/App.tsx`, `THIRD-PARTY-NOTICES.md`.
**Do:** Vite + React 19 + TS; install and pin the fixed deps (§2.2, exact versions, committed lockfile, `npm ci` in CI); Vitest + Playwright; vite-plugin-pwa (manifest + service worker precaching app shell + fonts + icons; **do not cache user photos**); serve the CSP (§2.2). CI = typecheck + test + build.
**Done when:** the app URL loads in Edge; "Install app" works; reload in airplane mode still opens the app.

### 0.2 — Input spike (do this before any UI)
**Files:** `src/editor/inputRouter.ts`, a throwaway test canvas.
**Do:** pen/touch/mouse classification per the **§8.2 touch-primary contract and its truth table** — the two-gate palm rule (every pen event refreshes the window; touch blocked during active pen strokes) **and the pen-free path** (edge rejection + multi-touch debounce), `touch-action:none`, pointer capture, pinch-zoom in `touchmove`, coalesced events, `pointercancel` rollback, and the sticky intent-at-`pointerdown` rule. **Also enumerate the device's real getUserMedia resolution caps** (A7) and torch/flip behavior — report the numbers, they set the capture toggle labels in slice 1.4.
**Done when:** **touch places a point (tap-tap) and a pen draws a line; a single finger pans and two fingers pinch-zoom; a drag moves the object under the finger (object-first) and a second finger restores it.** With a pen present, a resting palm mid-stroke (stroke > 1.2 s) does not pan/zoom/smudge, and touch within 1.2 s of a pen event is ignored. **With no pen present** (`[Surface — pending]`, log the result): a heel resting on the glass does not place a point (edge rejection) and a heel burst is debounced, but the heuristics are probabilistic — a stray palm action must be recoverable via undo + `pointercancel`. Ink ≤16ms perceived. **This is the highest-risk part of the product — spike it first.**

### 0.3 — First-run, Settings, Home shell (NEW — M6/M9)
**Files:** `src/ui/FirstRun.tsx`, `src/ui/Settings.tsx` (minimal), `src/state/appStore.ts`, `src/ui/ProjectList.tsx` (shell with empty/error states).
**Do:** the two first-run steps (handedness — plain question, default Right; projects folder — `showDirectoryPicker` with suggested `Documents\FieldMeasure`); settings: handedness, **input/model toggles (`«Touch places and moves»` ON · `«Finger draws (freehand)»` OFF · `«Magnifier when you tap»` ON · `«Gloved touch»` OFF · `Pen only`)**, units/precision, theme, density; Home shell renders the project-card grid (empty + loading states; scanning/permission come with slice 1.2's backend).
**Done when:** first run completes in < 20 s; handedness persists; Home renders an honest empty state; airplane-mode reload still works.
**Note:** handedness MUST land here — slice 1.4's loupe consumes it.

### 1.1 — Domain core
**Files:** `src/domain/{types,schema,units,geometry,snapping,ids}.ts`, `tests/{units,keypad,geometry,snapping,schema}.test.ts`.
**Do:** everything in §3, §4, §6 — **including the keypad slot model (§6.1.1) and its test table**.
**Done when:** the tests in §6.1 pass plus your own edge cases; **the keypad property test (500 random slot combos round-trip through the strict parser) passes**; schema round-trips example JSON in §3.5/§3.6 **and tolerates v0.2 files (extra `label` keys stripped, missing `unitFormat` normalized)**.

### 1.2 — Storage core
**Files:** `src/fs/{projectStore,backend}.ts`, `src/data/storage.ts`.
**Do:** FSA backend (pick root, persist handle, queryPermission at init + requestPermission on gesture, reconnect), OPFS backend, **tmp→close→move() atomic write for JSON AND blobs**, read-validate-recover, cleanStaleTmp (aged + lock-guarded), **per-project two-tab lock + BroadcastChannel (§5.4)**, flush-on-pagehide, `.history/_project/` snapshots, truncated-photo detection.
**Done when:** create a project → a folder appears on disk; kill-switch during a **markup.json write and during a photo.jpg write** → no corruption on reload; a corrupted `project.json` **and** a corrupted `markup.json` auto-recover from `.history/`; two tabs on the same project → second is read-only; **two tabs on different projects → both writable**.

### 1.3 — Photo on canvas
**Files:** `src/media/{normalizeImage,exif}.ts`, `src/editor/EditorCanvas.ts`, `src/ui/SheetEditor.tsx`.
**Do:** import + normalize (EXIF bake, 4096px, JPEG), show it, pan/zoom/fit, thumbnails (§7.3), **§4.2 screen scaling rules incl. `fontSize = fontSizeMu / s` and freehand outline regeneration** (validated with test marks at 1×/4×/8× zoom).
**Done when:** a 12MP phone photo opens upright and zooms smoothly on a Surface Go; 20-photo import doesn't crash; **stroke/label width stays constant across zoom (screenshot-diff)**.

### 1.4 — Capture flow (NEW — M8/M9)
**Files:** `src/ui/CameraFlow.tsx`, capture plumbing into sheets.
**Do:** full-bleed viewfinder (§11.8): torch/grid/level/flip toggles, real-resolution label from the 0.2 spike, tap-to-focus, shutter, review (Retake · Rotate · Use photo), atomic photo write + failure fallback (`Save a copy…`), camera-unavailable panel.
**Done when:** capture → review → use → sheet appears with the photo written to disk; killing the app mid-capture-write leaves no partial photo (tmp cleaned); camera-denied path shows the fallback panel; **the resolution toggle shows the device's true max**.

### 1.4.5 — Editor shell: top bar, tool rail, panel docking (NEW — session 4)
**Files:** `src/ui/TopBar.tsx`, `src/ui/ToolRail.tsx`, `src/ui/EditorLayout.tsx`, `src/ui/icons/tools/*.tsx`.
**Do:** the chrome every later tool slice needs and **which no previous slice owned** — the vertical tool rail (§11.4: 14 tools, 6 groups, handedness-driven side, **never moves**), the top bar, and the §11.3 panel docking rule (aspect ≥ 1.2 → side; < 1.2 → bottom style bar). The 14 bespoke tool glyphs live here (placeholder glyphs are acceptable to unblock the slice; final art before 2.0). Tools register themselves with the rail; selecting a tool that does not exist yet is a no-op, not a crash.
**Done when:** the rail renders all 14 tools at 56px with 8px gaps on the handedness side, survives a rotation without moving, docks the style panel per the aspect rule, and every control has a visible focus ring + `aria-label` (§19.6).

### 1.5 — Dimension tool (flagship)
**Files:** `src/editor/tools/DimensionTool.ts`, `src/editor/Loupe.ts`, `src/editor/history.ts`, `src/ui/DimensionKeypadSheet.tsx`, `src/editor/shapes/`.
**Do:** **tap-tap placement (touch) AND pen-drag A→B**, sharing one `PlacementController`; the **450 ms settle window** with the live `<PlacementHud>`; the **touch loupe variant** (200 px / 4× / 136 px offset / contact disc / dashed leader / freeze-on-lift 700 ms) alongside the pen loupe (handedness-aware); **keypad slot model (§6.1.1)** + live preview + derived label + select/move-endpoints/delete + undo/redo (§8.5).
**Done when:** **tap A, tap B places a dimension, the keypad auto-opens after 450 ms, and any canvas contact inside the settle window cancels the auto-open and keeps the geometry**; pen-drag A→B still commits on pen-up; 4 dims in <60s with touch (gloves off), 90s (gloves on); **hardware `12 6 3` + Enter → `12'-6 3/16"`** (at default 1/16 precision); cancel keeps the stroke (keypad cancel, not `pointercancel`); Chain works; **labels re-derive when project precision changes**.

### 1.6 — Markup tools
**Files:** `src/editor/tools/{SelectTool,AngleTool,ShapeTool,FreehandTool,TextTool}.ts`, shapes renderers.
**Do:** line, arrow, rect, ellipse, polygon, freehand (**local `getSvgPathFromStroke`, `size = mu / s` — §8.5**), highlighter, text, angle (§8.5); **tap-tap placement for every shape tool** (Line/Arrow/Rect/Ellipse = 2 taps, Polygon = `open` with `✓ Done`/`«Undo point»`, Angle = 3 taps) and **object-first drag** on Select; selection handles, grouping, locking, layers panel (§8.6).
**Done when:** **every placement tool places with tap-tap AND draws with the pen**, is selectable and undoable; a one-finger drag moves the object under the finger and a second finger restores its prior position; highlighter renders below other markup; **ink width is constant across zoom**.
**Pressure gate (`[Surface — pen required]`):** `pressure`/`tilt` are **pen-only signals** — `pressure` is a parallel array filled from pen input (§3.3) and is **unreachable from a finger**. The "pressure visibly varies stroke width" check therefore runs **only** on a Surface with a pen and is logged to the hardware checklist. The finger path is asserted instead against its touch fallback: with `«Finger draws (freehand)»` ON, ink uses a **fixed 8 mu width, smoothing 60, thinning 0** — no pressure/tilt code path is entered.

### 1.7 — Image insets
**Files:** `src/editor/tools/InsetTool.ts`, inset rendering (Konva.Group + scale + clipFunc, §8.5 coordinate model).
**Do:** insert flow, transform, Focus mode, nested markup (one level), asset dedupe (children belong to annotations, not assets).
**Done when:** an inset scales/rotates; markup inside clips and moves with it; **child round-trip test: place inset → add child → scale ×2 + crop + rotate 30° → save → reload → child lands at the same visual point**; Focus breadcrumb works; Replace-photo warned choice works.

### 1.8 — Style system
**Files:** `src/state/styleByTool.ts`, `src/ui/StylePanel.tsx`, presets IO.
**Do:** Style Chip, palette, width/fill/transparency/line-style/arrowheads, per-tool memory, recents, presets (`presets.json`), selected-vs-tool rule (§11.5), **project-level precision + unit format controls**.
**Done when:** swap tools + restyle in <2s without losing flow; selection edits apply to selection + tool default.

### 1.9 — Export
**Files:** `src/export/{pdf,png,filenames}.ts`, `src/ui/ExportWizard.tsx`.
**Do:** flatten PDF (**§4.2 export rules + §9.2 pt math**) + PNG(+zip via fflate), naming + sanitize + conflict policy, destination + result (§9, §11.10).
**Done when:** **the export-invariance test passes: a 4-mu stroke and 18-mu label measure identical physical units at 1×/2×/3× (Acrobat measuring tool), and page size = imagePx × 0.75 pt**; filenames safe (incl. trailing-dot/device-name cases); per-file error retry works; a 50-sheet export on a Surface Go completes without a tab crash (**2× default; 3× shows the device warning**).

### 1.10 — Safety & polish
**Files:** autosave chip, history flyout, `.trash/` + **restore UI (§11.9)**, toasts, sunlight mode.
**Do:** §11.11, §11.12 (a11y), §8.3.
**Done when:** reboot Surface → nothing lost; corrupted file → recovered; trash restore works; sunlight mode legible outdoors.

### 1.11 — Release, update and install (NEW — session 4, §19.2)
**Files:** `vite.config.ts` (SW registration options), `src/ui/UpdateToast.tsx`, `src/ui/Settings.tsx` (build version), `docs/install-runbook.md`.
**Do:** `registerType: 'prompt'`; the non-modal `«Update ready — reload when you're done»` toast, **suppressed while a write is in flight, while `pendingOp !== 'none'`, or while the keypad is open**; `Reload` flushes the persistence queue and waits for it to settle before `skipWaiting`; build version + date in Settings.
**Done when:** a new build deployed to the pinned origin surfaces the toast on the next online launch, never mid-measurement; `Reload` loses no edits (verify with an unflushed queue); airplane-mode reload still works after the update; Settings names the running build.

### 2.0 — Field pilot
**Do:** 2 people, 1 week, real jobs, side-by-side with their current tool. Write go/no-go + top 5 fixes.
**Done when:** (session 4 — every other slice had a gate and this one did not) both pilots completed **at least 3 real jobs each** entirely in this app; **zero wrong-measurement reports** and **zero data-loss reports** across the week; the go/no-go decision and the top-5 fix list are written into `docs/CONTINUITY.md`. A wrong-measurement or data-loss report is an automatic no-go regardless of how the rest of the week went.

**Explicitly out of v1 (deferred/cut — see §2.4 for the full table):** vector-overlay PDF, reference calibration (+`≈`, Keep-measured, calibrated rulers, polygon area), dimensions-summary page, laser meters, metric keypad UI (seam kept), auto-enhance, import-project-bundle, duplicate project, rotate-sheet, sheet templates, rulers/guides.

---

## 14. Test plan

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | units parse/format, **keypad slot model (§6.1.1) incl. the 500-combo property test**, geometry, snapping, schema round-trip + v0.2 tolerance, filename sanitization (trailing dots, device names, length caps) |
| Export invariance | Vitest (node-canvas or Playwright) | §4.2 invariant: stroke/glyph bitmap px = `mu × M` at M∈{1,2,3}; page pt = imagePx × 0.75 |
| Component | Vitest + Testing Library | keypad live-parse preview (slots → preview), toolbar active states, style panel mixed/indeterminate states |
| E2E | Playwright | open app → import fixture photo → **place a dimension with tap-tap (synthetic touch PointerEvents) and draw one with synthetic pen PointerEvents** → reload → confirm persisted → export PDF → non-empty, page size correct |
| Storage (manual + scripted) | Playwright + kill-switch harness | kill mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → all recover; two-tab same-project readonly; two-tab different-projects writable |
| Field | Humans | gloves, bright sun (contrast), 8h offline, battery drain, 50-photo project, **touch-first palm rejection (heel/bezel) and pen+touch palm rejection (incl. >1.2 s strokes with a resting palm)** |

**Touch a11y gates (per slice, §19.6):** target floor **48×48 under touch-primary**; **hit slop 16 px general / 24 px along thin strokes**; every hover-only affordance has an on-screen equivalent (§11.6 #18). Assert computed geometry at both real viewports/DPR 2 in the Playwright suite.

**The four highest-stakes pure modules are snapping, ft-in parsing, the keypad slot model, and the export scaling rules** — a bug in any is a wrong measurement or a wrong artifact. Give all four extensive unit tests.

---

## 15. Rules for the AI builder

1. Build slices in order (§13). No slice until the prior slice's "done when" passes on a real Surface (touch-first; a pen where the gate names one).
2. **Never add:** servers, databases, sign-in, analytics/telemetry, cloud SDKs (Dropbox/OneDrive/Google/Graph), Bluetooth/device code, AI features, service-worker caching of user photos.
3. Runtime dependencies are fixed (§2.2). `crypto.randomUUID()` for ids — no `uuid` package.
4. **Do not use react-konva.** The canvas is the imperative `EditorCanvas` (Konva.Stage/Layer/Shape). React renders only the chrome around it.
5. **Coordinates are working-image pixels; style sizes are markup units (mu).** Never store screen pixels in any data file. **Screen: strokes `strokeScaleEnabled:false`; text `fontSize = fontSizeMu / stageScale` (every zoom change); freehand outline `size = mu / stageScale`. Export (§4.2): strokes `mu × M`, text `fontSize = mu` (no counter-scale), freehand `size = mu`.** Never store screen pixels in any data file.
6. **All disk writes go through `src/fs/projectStore.ts` — JSON and blobs alike.** Never call `createWritable()` anywhere else. Use the tmp→close→move() atomic pattern (§5.3).
7. **Validate** `project.json` and `markup.json` with zod on load and before save; run `schemaVersion` migrations per file; recover from `.history/` on parse failure; never silently overwrite. **Use the guarded parse (§3.4 `parseJson`) so corrupt JSON reaches recovery instead of throwing.**
8. **Store canonical mm + entered text; derive labels at render** (§6.1). There is no `label` field. The drawn dimension line is visual; the value is typed (v1).
9. **Keep raw freehand input points** in `markup.json` — never store the derived/smoothed path. `getSvgPathFromStroke` is a LOCAL helper (§8.5) — perfect-freehand does not export it.
10. All user-visible text lives in `src/ui/strings.ts`.
11. When something is unspecified, choose the simplest behavior consistent with the non-negotiables (§11.6), and add one line to `docs/DECISIONS.md`.
12. **Honor the "do not simplify" list (§11.6).** Flattening a deliberate design decision is a bug, not a simplification.
13. **Storage integrity first** (§17 R1): the top risk is losing a day of field work. Test with a kill-switch mid-write — **JSON and photo writes both**.
14. **Snapping, ft-in parsing, the keypad model, and export scaling get real unit tests** — a bug there is a wrong measurement or a wrong artifact.
15. Sanitize export filenames (§9.4 — including trailing dots/spaces and length caps). "Open folder"/"Show in Explorer" is impossible from a PWA — use `Copy path` + `showDirectoryPicker({startIn})`.
16. **Never call `FileSystemDirectoryHandle.move()` — it does not exist in Chromium.** `FileSystemFileHandle.move()` is the atomic-rename workhorse (§5.3). Project rename = `project.title` only (§5.6).
17. **§2.4 is the scope authority.** If a UI-spec section shows a deferred/cut control, do not build it and do not leave a dead control — the hardened UI spec already removes them; if you find a straggler, remove it and note it in `docs/DECISIONS.md`.

---

## 16. Decisions log

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | App type | PWA (Edge on Windows 11) | One codebase, installable, offline, no store |
| D2 | Canvas | Imperative Konva (not react-konva) | Full control over pen/touch, hit-testing, export; React only for chrome |
| D3 | Persistence | File System Access API → per-project folder (OPFS fallback) | "Local folder per project" is the product; no DB |
| D4 | On-disk layout | Per-sheet `markup.json` sidecars | Write granularity, corruption blast radius, fast project listing |
| D5 | Coordinates | Image pixels + markup units (mu) | Stable, device-independent style sizing |
| D6 | Canonical value | millimeters + entered text; **labels derived, never stored** | No rounding drift; no stale labels when precision/units change (M5) |
| D7 | PDF | `@cantoo/pdf-lib`, flatten-only v1; **page pt = imagePx × 0.75** | `pdf-lib` unmaintained; vector overlay deferred; v0.2's page-px-as-pt was wrong (B1) |
| D8 | Measuring | Typed values only (v1); calibration fully deferred incl. `≈` | Matches the tape/typed workflow; §2.4 resolves the doc-vs-doc conflict (B4) |
| D9 | Storage fallback | OPFS only (idb-keyval only for the handle) | Two fallbacks = three storage modes to build/test |
| D10 | Laser | `source` field only, no interface/device code | YAGNI until a real meter exists |
| D11 | Sharing | Manual Dropbox drag | Company already uses Dropbox; no cloud SDKs |
| D12 | Inset nesting | One level, children inline, **children in asset working-image px; crop in asset px before transform** | Teachable, correct clipping/transform, stable child data (B3) |
| D13 | Erase stroke mode | Split at raw input points | Vector-safe; avoids polygon-boolean scope explosion |
| D14 (new) | Keypad input | Slot state machine (§6.1.1) composes `enteredText`; strict parser stays strict and round-trips | Fuzzy UI over a strict guardian; `12 6` etc. defined (B2) |
| D15 (new) | Export scaling | Strokes `mu×M`, text `mu`, ink `mu`; embed 96×M dpi; page pt = imagePx × 0.75 | Physical size = `0.75×mu` pt invariant at every M (B1) |
| D16 (new) | Two-tab scope | Lock + broadcast names are per-project | Different projects in two tabs must not conflict (M3) |
| D17 (new) | Rename | `project.title` only; never move the directory | `FileSystemDirectoryHandle.move()` unimplemented in Chromium (B5) |
| D18 (new) | Handedness | First-run question, default Right | No web API reads the Windows pen setting (M6) |
| D19 (new) | Precision | Project-level `precisionDenominator` + `unitFormat`; Dimension panel edits the project value | One source of truth (M11) |
| D20 (new) | Persisted undo | = `.history` snapshots (whole-sheet restore); no command journal | One mechanism, not two conflated ones (M10) |

---

## 17. Risks and mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Storage integrity** — crash/power-loss corrupting a day's work | Critical | tmp+rename atomic writes **for every file type**, validate-on-load, snapshot auto-recovery (incl. `_project/`), truncated-photo detection, kill-switch test on JSON **and** photo writes |
| R2 | **Pen/touch input pipeline** — palm rejection, pinch vs pan vs draw, ink latency | High | Input spike first (§13, 0.2); hardened pointerType routing (pen event refreshes the window; touch blocked during active strokes), `touch-action:none`, coalesced events |
| R3 | **Freehand erase + export fidelity** — splitting smoothed strokes; PDF text mismatch | High | Split at raw input points (no polygon-boolean); flatten-only PDF; ASCII-composed ft-in text |
| R4 | File System Access permission rehydration on cold start | Medium | `queryPermission()` at session start, gesture-driven `requestPermission()`, "Reconnect folder" UX; OPFS fallback |
| R5 | Memory on 8GB Surface Go with big photos | Medium | Working copies ≤4096px; worker decode; lazy thumbnails; few Konva layers; **2× export default + one-sheet-at-a-time export + 3× device warning** |
| R6 | EXIF sideways photos | Medium (if ignored) | Bake orientation at import (§7.1) |
| R7 | Two Surfaces editing the same Dropbox folder | Low (excluded) | Document as unsupported; store `updatedAt` + content hash to warn on mismatch, never auto-merge |
| R8 | Dependency drift | Low | Pin exact versions (§2.2 verified against npm 2026-09-21); committed lockfile + `npm ci`; read migration guides at pin time |
| R9 (new) | getUserMedia resolution caps (~1080p–4K) make "High 12MP" impossible | Medium | Real-max labels from the 0.2 spike (A7); Windows Camera app as the high-res path; import covers it |
| R10 (new) | Export invariance regresses silently | Medium | Dedicated unit test: bitmap stroke/glyph = `mu×M` at M∈{1,2,3}; on-device Acrobat measuring-tool check in slice 1.9 |

---

## 18. Open questions

> **SESSION-4b: there are no open questions left.** Every item below was resolved in **§21**, which
> gives the decision and the rationale. They are kept here for history. A builder who reaches this
> section should read §21 and keep building — **nothing in this document requires a human answer
> before implementation starts.**

| Was open | Resolved in | Decision |
|---|---|---|
| Calibration timing | §2.4 / D8 | v1 is typed-only; calibration deferred with the schema seam |
| Metric at launch | §21.3 | No — deferred, seam kept |
| GPS / typed site address | §21.4 | Schema field stays; no UI in v1 |
| Sheet templates | §21.5 | Cut, confirmed |
| Capture resolution reality | §21.7 | Decision table — 0.2 measures, 1.4 reads the row |
| Origin & distribution | §21.1 | Static HTTPS host + origin-agnostic `base` + an origin-change guard |
| TypeScript 7 vs 5.x | §21.6 | Pin 5.x for v1 |
| `Konva.pixelRatio` downgrade | §21.8 | Decision ladder, measured in 1.3 |
| Fraction chip vs project precision | §21.2 | Chip is entry-scoped |

---

*End of handoff. Scope authority in §2.4; build order in §13; data model in §3; reference code in §5–§9; UI authority in `docs/ui-spec-field-measure-v2-hardened.md`; decisions in §16.*

---

## 19. Session-4 hardening addendum (NORMATIVE)

Round 4 was a senior adversarial + architecture review of the implementation plan and the
architecture behind it. It executed this document's own reference code again (rounds 2 and 3
did the same and each found real defects), attacked the storage layer's failure paths, and
audited the build plan for things no slice owns. Code-level findings were fixed **in place**
in §5, §6.1, §6.1.1 and §8.5 and are marked `SESSION-4 FIX (…)` there. The items below are
new **normative rules** that had no home in the document.

The full finding register, with evidence and severity, is
`docs/review-session-4-hardening.md`.

### 19.1 Origin and distribution (was completely unspecified — highest-leverage gap)

Nothing in v0.3 said how this app reaches a Surface. That is not a deployment detail: **the
origin is the identity boundary for every persistent thing the app owns.** `idb-keyval` (the
persisted `FileSystemDirectoryHandle` *and* all settings), OPFS, the service-worker cache,
and the FSA permission grant are **all origin-scoped**. Changing the origin later silently
orphans every persisted handle and every setting — each user re-picks their projects folder
and loses handedness/theme/precision, with no error to explain it. Project *files* survive
(they are on disk), which makes the failure quiet rather than loud.

**Rules:**
1. **The origin is chosen once, before slice 0.1, and never changed.** Record it in
   `docs/DECISIONS.md` with the reason. Changing it afterwards is a migration, not a config
   edit, and requires a written re-pick flow.
2. Installing a PWA and registering a service worker require a **secure context**:
   `https://…`, or `http://localhost`. A plain `http://` LAN address (e.g.
   `http://192.168.1.10:8080`) is **not** a secure context and will not install, will not
   register a service worker, and will not expose `showDirectoryPicker` — it cannot be the
   answer.
3. The three viable origins, with the trade this project actually faces:

   | Option | Install + offline | Update path | Origin stability | Cost |
   |---|---|---|---|---|
   | **A. Static HTTPS host** (e.g. GitHub Pages / any static host), installed once per Surface | ✅ full | fetch a new SW on any online launch | stable if the domain is kept | needs network **once** per device, and at each update |
   | **B. `http://localhost` from a tiny local static server on each Surface** | ✅ (localhost is a secure context) | copy a new build folder per device | stable, but **port-sensitive** — `localhost:5173` ≠ `localhost:8080`, a different origin | a background process per device; "no server" reads badly against §1.4 |
   | **C. LAN HTTPS host with a private CA** | ✅ | central | stable | certificate management on every Surface |

   **Recommendation: A.** It satisfies §1.4 honestly (the *app* is served; there is still no
   backend, no database, no account, no sync — the constraint §1.4 actually states), it keeps
   the origin stable for the life of the product, and offline operation after install is
   exactly what slice 0.1's airplane-mode gate already proves. B's port fragility is a real
   data-orphaning hazard for a non-technical crew.
4. Whatever is chosen: **pin the exact origin string** (scheme, host, port, base path) in
   DECISIONS, and make `start_url`/`scope` in the PWA manifest match it exactly.

### 19.2 Service-worker update flow (was unspecified)

`vite-plugin-pwa` precaching with no update strategy means a field device can run a stale
build indefinitely, and an update landing mid-edit can swap assets under an open editor.

- `registerType: 'prompt'` — **never** `autoUpdate`. An automatic reload mid-measurement is
  a data-risk and a trust-risk.
- On `needRefresh`, show a **non-modal** toast `«Update ready — reload when you're done»`
  with `Reload` and `Later`. **Suppress the toast entirely while a write is in flight, while
  a pending op is open (`pendingOp !== 'none'`), or while the keypad sheet is open.**
- `Reload` flushes the persistence queue (§5.4) and waits for it to settle *before*
  `skipWaiting` + reload. Never reload over an unflushed queue.
- Settings shows the **build version and build date**, so a field report can name the build.
- The airplane-mode gate (slice 0.1) is re-run after every SW change.

### 19.3 Asset dedupe — content-addressed filenames (mechanism was missing)

Four places require "assets are deduped by content hash" (§3.1, §3.2, §8.5, §13/1.7), but
`sha256Hex` (§7.1) is defined and **never called**, there is no hash→uuid index in the
on-disk layout, and `assetId` carries no hash. A builder's only option was to re-hash every
file in `assets/` on every import.

**Rule: assets are content-addressed.** An asset's filename **is** its hash:
`assets/<sha256Hex>.jpg`, and `Annotation.assetId` holds that same hash string. Dedupe is
then a single `getFileHandle(hash + '.jpg', { create: false })` existence check — no index
file to write, corrupt, or recover. This replaces `assets/<uuid>.jpg` in §3.1.
`Annotation.assetId` remains `string` (schema unchanged); its *contents* are now specified.

### 19.4 Export: damaged photos, memory budget, filenames

**(a) Damaged-photo sheets (undefined before).** §5.3 defines the damaged state and preserves
markup, but §9 never said what such a sheet exports as. Rule: it exports as a **white page at
`Sheet.imageWidth × Sheet.imageHeight`** with the markup rendered on it, and the export
wizard's result view lists it under `«N sheets exported without their photo»`. Never skip the
sheet silently (the markup is the measurement record) and never abort the whole export.

**(b) Memory budget, computed.** §9.5 gives 450 MB at 3× as guidance with no guard. State it
as arithmetic and enforce it:

```
bitmapBytes ≈ imageWidthPx × imageHeightPx × M² × 4
  4096 × 3072 @ M=1 →   50 MB
  4096 × 3072 @ M=2 →  201 MB
  4096 × 3072 @ M=3 →  453 MB
  4096 × 4096 @ M=3 →  604 MB   ← the worst case normalizeImage can produce
```
- Hard guard: if `bitmapBytes > 512 MB`, refuse M and offer the next lower M with
  `«This sheet is too large to export at 3× on this device»`. Do not attempt and crash.
- Render, embed, and **release** one sheet at a time (`close()` the bitmap, drop Konva refs)
  before starting the next — already stated, now gated.
- `pdf.save()` materializes the entire document in memory. For a 50-sheet project this is
  the second budget: if the accumulated embedded-JPEG bytes exceed **250 MB**, split the
  output into `part-01.pdf`, `part-02.pdf`, … and say so in the result view. This is the
  designed remedy if slice 1.9's 50-sheet gate fails — not an improvisation at gate time.

**(c) Filename conflicts must be case-insensitive.** §9.4's conflict policy compares against
`existing: string[]`. **NTFS is case-insensitive**: `Sheet.pdf` and `sheet.pdf` are the same
file on disk but different strings in JS. As specified, `Overwrite` silently destroys an
unrelated export and `Add (1)` fails to trigger. Rule: compare
`name.normalize('NFC').toLowerCase()` on both sides, everywhere conflicts are detected.

**(d) Sanitizer ordering is normative.** §9.4 lists rules but not their order, and order
changes the result — truncating *after* stripping trailing dots/spaces can re-expose one.
The mandatory order, per token and then on the joined base, is in the implementation plan's
slice 1.9 with a reference implementation and a 20-row test table.

### 19.5 Defaults and small corrections

- **`precisionDenominator` defaults to `16` for a new project.** Implied by every fixture and
  by slice 1.5's "at default 1/16 precision", but never stated normatively until now.
- **Loupe geometry is a formula, not three loose numbers.** §8.4 gave "160px diameter" +
  "~3.5×" + "80×80px source region"; those cannot all hold (a 160px window at 3.5× shows a
  **45.7px** source; an 80px source in a 160px window is exactly **2×**). Rule: **magnification
  is fixed at 3.5×** and the source region is derived — `sourcePx = diameterPx / 3.5` (112px →
  32px, 160px → 45.7px, 200px → 57px). Magnification stays constant when the user changes
  loupe size, which is what makes endpoint placement predictable.
- **The touch loupe (§8.4) follows the same formula at 4×:** `sourcePx = diameterPx / 4` →
  `200 / 4 = 50px`. The design source's phrase "4× of a **100×100** source" cannot hold (`100px` in a
  `200px` window is exactly `2×`); magnification stays fixed and the source is derived instead, so
  the touch loupe still shows more context than the pen loupe's `160 / 3.5 = 45.7px`.
- **§2.4's "§8.7" cross-reference does not exist** (§8 ends at §8.6). The presets/recents/
  per-tool-memory specification is **§11.5**.
- **§13/0.3's note said "slice 1.4's loupe"**; the loupe is built in **slice 1.5**.
- **`angleDeg` with a degenerate vertex** (`a === v` or `c === v`) returns `0` silently.
  Callers must treat a zero-length ray as "no angle yet" and not commit it; the Angle tool's
  commit gate requires both rays ≥ 8 screen px.
- **Slice 2.0 now has a "Done when"** (§13).

### 19.6 Accessibility is per-slice, not a final slice

§11.12 is scheduled entirely in slice 1.10. Retrofitting focus order, roles, names, and the
accessible object tree across eight slices of already-built UI is the standard way
accessibility does not happen. Rule: **every slice that ships UI carries its own a11y
acceptance** (focus order, visible focus ring, `aria-label` on every control, **48×48 minimum
target under touch-primary — raised from 44×44 — and hit slop 16 px general / 24 px along thin
strokes**, no keyboard trap). The only sanctioned sub-48 exceptions stay the 44 px swatch grid and
the 44 px Recent chips (C5) — the count stays at **two**; no third exception is created. Slice 1.10
keeps the themes, the accessible *object tree* for canvas annotations, and the end-to-end audit —
not the whole of §11.12.

---

## 20. Implementation contracts (SESSION-4b — things the docs referenced but never defined)

Session 4's first pass fixed defects. This pass closes the remaining **under-definitions**: places
where the documents name a mechanism, rely on it in several sections, and never say what it is. Each
one would otherwise be invented by whoever builds it first, differently each time.

### 20.1 `AnnotationPath` — the address of an annotation

§8.3 says undo addresses annotations by `(sheetId, annotationPath)` "where `annotationPath` includes
`insetId/childId`", and §10's `selection: string[]` says "annotation ids (with path context)".
Neither says what the string looks like. Definition:

```ts
/** The address of one annotation within a sheet. Stable across reorders (ids, never indices). */
export type AnnotationPath =
  | { kind: 'top'; annotationId: UUID }                      // a sheet-level annotation
  | { kind: 'child'; insetId: UUID; annotationId: UUID };    // a child inside an image inset

/** Canonical string form — used as a Set/Map key and as the `selection[]` element. */
export function pathToKey(p: AnnotationPath): string {
  return p.kind === 'top' ? p.annotationId : `${p.insetId}/${p.annotationId}`;
}
export function keyToPath(key: string): AnnotationPath {
  const i = key.indexOf('/');
  return i < 0
    ? { kind: 'top', annotationId: key }
    : { kind: 'child', insetId: key.slice(0, i), annotationId: key.slice(i + 1) };
}
```

Rules: exactly one `/` is possible (insets nest exactly one level, D12); ids are `crypto.randomUUID()`
and contain no `/`; **never address an annotation by array index** (a reorder invalidates it, which is
how undo-after-reorder corrupts a sheet). `selection: string[]` holds these keys.

### 20.2 `zIndex` — assignment, bands, and reordering

§3.3 has the field; §8.5 says the highlighter is "inserted below all other markup but above the
photo (a dedicated z-band)". Nothing says how values are chosen. Definition:

- **Bands** (within a sheet's `objects[]`, and independently within each inset's `children[]`):

  | Band | Range | Contents |
  |---|---|---|
  | Highlight | `0 … 999` | `highlight` annotations only |
  | Main | `1000 … 1_999_999` | everything else, in creation order |

  Insets are **not** a band — they are a separate Konva layer (`insetLayer`, below `markupLayer`),
  so an inset's `zIndex` orders it only against other insets.
- **On create:** `zIndex = (max zIndex in that band within this container) + 10`, or the band's base
  if the band is empty. The gap of 10 leaves room for "send backward" without a full renumber.
- **On reorder** (layers panel drag, or Bring/Send actions): recompute the affected band's members
  as `base + 10 × position`. Renumber the **band only**, never the whole sheet.
- **Render order** = sort by `zIndex` ascending, ties broken by array order. Ties are legal; do not
  crash or reorder arbitrarily on a tie.
- **The highlighter band is enforced at creation, not at render** — a highlighter annotation is
  created with a Highlight-band `zIndex`, so it cannot be dragged above ink in the layers panel.
  The layers panel must refuse a cross-band drag and say why (`«Highlighter always sits under other
  markup»`).

### 20.3 Erase, stroke scope — the split algorithm

§8.5 gives the principle ("split at the nearest raw input points", never a polygon-boolean) and D13
records it, but no algorithm. Definition, for one eraser drag against one `freehand`/`highlight`
annotation:

1. The eraser has a radius `r` in **image px** (`eraserWidthMu / stageScale`, then ÷ stage scale to
   image space — the eraser is a screen-sized tool).
2. Mark every raw point `points[i]` whose distance to **any** sampled eraser position is `< r`.
3. Split the `points[]`/`pressure[]` arrays at each maximal run of marked points, discarding the
   marked runs. `pressure[]` is split **at the same indices** — they are parallel arrays (F7).
4. Each surviving run of **≥ 2 points** becomes a new annotation: a copy of the original with a new
   `id`, the same `style`, `zIndex` and `groupId`, and its slice of `points`/`pressure`. Runs of
   0 or 1 points are dropped.
5. If every point is marked, the annotation is deleted.
6. The whole drag is **one** undo step (`Command`), whatever the split count.

Deterministic, no geometry library, and it preserves the "raw points only" rule.

### 20.4 `groupId` — grouping semantics

§3.3 has `groupId?: UUID | null` labelled "(Ctrl+G)" and nothing else.

- Grouping sets the same fresh `groupId` on every selected annotation; ungrouping sets it to `null`.
- A group is **flat** — there is no nesting, and `groupId` never points at another annotation's id.
- Selecting any member selects the whole group (tap-select); `Alt`+tap selects one member.
- A group is **not** persisted as an object — it is only this shared field, so a partially deleted
  group simply has fewer members.
- Groups do **not** cross containers: a sheet-level annotation and an inset child can never share a
  `groupId`.
- Transforms apply to every member; style edits follow the §11.5 selected-vs-tool rule.

### 20.5 Screens that had no owner

Two first-class screens are named in UI spec §4.1 and specified nowhere in the build plan.

**(a) Project screen (`/p/:projectId`) — the sheets grid.** UI §4.1 and §11.9 define it (4 columns at
1440, card 320×300, 3 at 1200, 2 at portrait 960) and §11.8 has capture "return to the sheets grid",
but **no slice built it**. It owns: the sheet grid, `Add sheet` (→ capture/import), sheet reorder
(drag, writes `sortIndex`), sheet rename, delete-to-`.trash`, `Export…` entry, and project info. It
is now part of **slice 1.2** (it is the screen that makes storage visible) with reorder and trash
arriving in their own slices.

**(b) Settings screen (`/settings`).** UI §4.1 lists it — "Handedness, input filters, units,
precision, density, theme, storage" — and, alone among the screens, gives it no layout, no component
list and no grouping anywhere in the document. It is not marked deferred. Definition (deliberately
plain — it is a settings list, not a designed surface):

> A single scrolling column, max-width 720px, of labelled groups in this order:
> **Input** (handedness · **`Touch places and moves`** — default ON · **`Finger draws (freehand)`**
> — default OFF · **`Magnifier when you tap`** — default ON · **`Gloved touch`** — default OFF ·
> `Pen only` — an input *filter*, and **no longer the only one** · palm-rejection window, read-only
> display of 1200 ms) ·
> **Units** (unit system · unit format · *note that precision is per-project, with a link*) ·
> **Display** (theme · density) · **Storage** (projects-folder path in mono · `Change folder…` ·
> persistent-storage state · `Trash…`) · **About** (build version + date — §19.2 — and
> `Third-party notices`).
> Rows are 56px, label left, control right, 1.5px divider between rows, group headers 13px
> `--g400` uppercase. No search, no tabs, no icons.
>
> **Touch-primary defaults (§8.2):** the pen always draws; touch placement is the default; finger
> freehand is opt-in; the tap magnifier is on. `Pen only`, when on, ignores touch input entirely.

Anything else a builder wants to add to Settings needs a DECISIONS line first.

### 20.6 Smaller pins

- **`readableAngleDeg` boundary:** `deg > 90 || deg < -90` flips. At **exactly** ±90 it does not
  flip (text reads bottom-to-top). This is intentional and is asserted in the unit test so nobody
  "fixes" it.
- **`snapPoint` determinism:** strictly `d < bestD`, so on an exact tie the **first** target in the
  array wins. Target order must therefore be stable — build the target list in annotation order, not
  from a Set or an object's key order.
- **Radial quick-menu wedges:** 8 slots × 45° with a **1° gap** drawn between wedges (the "44°" in
  UI §6.4 is the drawn wedge, not the hit arc). **Hit testing uses the full 45°** so there is no dead
  zone between slots.
- **`Enter` on the Angle commit sheet** commits it, exactly as on the dimension keypad (UI §8.2 says
  "same shell as the keypad" but never says this outright).
- **Sheet `sortIndex`:** integers, gaps of 10, renumbered `10 × position` on reorder — the same rule
  as §20.2, so there is one reordering idiom in the codebase, not two.
- **New-sheet naming:** `Sheet NN` zero-padded to 2 (`Sheet 04`), where `NN` is `sheets.length + 1`
  at creation and is **never** renumbered when a sheet is deleted (names are labels, not indices).
  The on-disk folder is `sheets/<NNN-date-time>/` per §3.1 and is likewise never renamed.

---

## 21. Resolved decisions (SESSION-4b — nothing here is open any more)

Every item previously marked "open", "confirm", or "needs a human answer" is resolved below with its
rationale. **A builder never has to stop and ask about any of them.** Each is reversible: the
rationale names what would change the answer.

### 21.1 Origin and distribution (was D24 — the one blocker)

**Decided.** Three parts:

1. **Development runs on `http://localhost:5173`** (Vite dev) and **`http://localhost:4173`**
   (preview). Both are secure contexts, so install, service worker and `showDirectoryPicker` all
   work. **Data created against a dev origin is disposable and is never migrated.** Say so in the
   runbook; do not build a dev→prod migration.
2. **Production is a static HTTPS host, and the origin is pinned before the first real user data
   exists** — i.e. before the pilot, not before slice 0.1. Default choice:
   `https://<owner>.github.io/FieldMeasure/` with `base: '/FieldMeasure/'`,
   `start_url: '/FieldMeasure/'`, `scope: '/FieldMeasure/'`. Any other static HTTPS host is a
   drop-in substitute; only the `base` changes.
3. **The build is origin-agnostic and the app detects an origin change.** `base` comes from
   `process.env.FM_BASE ?? '/'` in `vite.config.ts`, so moving hosts is a rebuild, not a code edit.
   And — this is the part that actually removes the risk — **slice 0.1 ships an origin guard**:

   ```ts
   // src/data/originGuard.ts — runs before the first render
   // Stores the origin+base this profile's data was created under. If it changes, the persisted
   // FileSystemDirectoryHandle, all settings, OPFS and the SW cache are a DIFFERENT, EMPTY world.
   // Without this the user silently sees first-run again and assumes their work is gone.
   export async function checkOrigin(): Promise<'ok' | 'first-run' | 'changed'> { /* idb-keyval */ }
   ```
   On `'changed'`, show a blocking screen: `«This app moved to a new address»` — explain that
   projects are safe on disk, that the folder must be picked again, and offer `Pick my projects
   folder`. **Never silently fall through to first-run.**

**Why this resolves rather than defers:** the original risk was that an origin change silently
orphans every device. With (3), a change is loud, recoverable in two taps, and costs no data —
which downgrades the decision from irreversible-architecture to ordinary-config. Build now.

**What would change the answer:** if the repository must stay private and GitHub Pages is
unavailable for it, substitute any static HTTPS host. The code does not care.

### 21.2 Fraction chip vs project precision (was D31)

**Decided: the chip is entry-scoped.** Tapping `1/2 … 1/16` while entering a dimension sets the
denominator **for that entry only**. The project's `precisionDenominator` is changed **only** from
the Dimension style panel's Precision control, which already confirms `«Project precision: 1/16»`.

This does not weaken M11's one-source-of-truth rule: **labels still derive from the project value**,
always. The entry denominator only governs what fraction the user can express while typing, and what
`enteredText` records. A value typed as `3/8` with project precision `1/2` stores exactly and
displays rounded — which is the documented behaviour of derived labels, not a new concession.

**Why:** a chip tap inside one measurement silently re-rounding every label in the project is a
wrong-display path, and it is worst exactly where the chip is most used — mid-Chain, where the user
is heads-down and will not notice.

### 21.3 Metric at launch

**Decided: no.** §2.4 already says DEFERRED and the seam (parser, schema, `unitSystem`) is in place.
The crew measures in feet and inches. Building the metric keypad UI costs the fraction-chip row and
a second formatter path for zero pilot value. Revisit after the pilot if a real job needs it.

### 21.4 Typed job-site address

**Decided: schema only, no UI in v1.** `Project.locationLabel` stays in the schema and in the zod
parser (it is already there and already optional). **No field is added to Project Settings in v1** —
§2.4 does not list it, and a text input that nothing reads is a feature with no consumer. When a
report or filename token needs it, add the input and the token together.

### 21.5 Sheet templates

**Decided: cut, confirmed.** §2.4 says CUT; the preset system (§11.5) carries the value. Nothing to
build, nothing to stub.

### 21.6 TypeScript 7 vs 5.x

**Decided: pin TypeScript 5.x for v1.** D14 recorded `7.0.2` as installed and left the choice to
scaffold time. Resolving it now, in favour of 5.x:

- The toolchain around it — `vitest`, `vite`, `@vitejs/plugin-react`, `@playwright/test`, the
  `@types/*` ecosystem — is verified against TS 5 and is not verified here against TS 7.
- Toolchain bring-up is not on the critical path to a beta, and it is the worst possible place for a
  builder to burn a day.
- Nothing in this codebase needs a TS 7 feature.

`npx tsc --noEmit` must pass under 5.x with `strict: true`. Revisiting TS 7 is a post-beta task with
its own branch. **This supersedes D14's "TypeScript 7 vs 5.x to be confirmed at scaffold."**

### 21.7 Capture resolution toggle (was §18.5)

**Decided in advance, so slice 1.4 cannot stall.** After slice 0.2 reports the device's real caps:

| What 0.2 measures | What 1.4 builds |
|---|---|
| The two modes differ by **≥ 1.5×** in pixel count | Keep the toggle: `«High (device max)»` / `«Fast»` |
| They differ by **< 1.5×** | **Drop the toggle**, always capture at max, and record the measured numbers in DECISIONS |
| Max is **≤ 1080p** | Drop the toggle **and** promote `«Use the Windows Camera app for detail shots»` in the capture fallback copy |

No judgement call at build time — measure, read the row, build it.

### 21.8 `Konva.pixelRatio` on a Surface Go (was §8.1.1)

**Decided in advance.** Slice 1.3 measures markup-layer redraw time at
`pixelRatio = min(devicePixelRatio, 2)` while panning a 4096-px sheet with ~50 annotations:

- **≤ 16 ms** → keep `min(dpr, 2)` everywhere.
- **> 16 ms** → drop the **overlay layer only** to `1`, re-measure; if still > 16 ms, drop the markup
  layer to `1.5`, then `1`. Record each step's measurement in DECISIONS.
- Never drop the **photo** layer below 1, and never raise any layer above 2.

### 21.9 `lucide-react` 1.x icon API

**Decided: verify once, in slice 1.4.5, with a two-line spike** (import one icon, render it). lucide
is chrome-only (§2.2); the 14 tool glyphs are bespoke, so a surprise in its API affects a handful of
chrome icons and nothing measurement-critical. If the named-export API differs from expectation, use
the generic `<Icon name="…">` form or inline the handful of chrome SVGs and record it. **This must
not block the slice.**
