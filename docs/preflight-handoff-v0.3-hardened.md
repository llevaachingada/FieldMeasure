# Field Measure — Pre-flight Handoff & Implementation Plan (v0.3, hardened)

> **Status:** Pre-flight. No functional code exists yet. Reference code in Part 3+ is a build anchor, not finished code — treat it as the required starting point and verify library versions/APIs when installing packages.
> **Version:** 0.3-hardened (September 21, 2026) — supersedes `preflight-handoff.md` v0.2. This revision incorporates the adversarial review (findings B1–B5, M1–M13, Minors 1–6): corrected export math, keypad input model, inset child coordinate space, FSA API corrections, validation fixes, and build-plan gaps. Library versions verified against the npm registry on 2026-09-21.
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

---

## 1. Product definition

### 1.1 What it is

Field Measure is a Windows-first web app (PWA) for Microsoft Surface tablets with a pen. A field crew member takes a photo with the built-in camera, draws feet-inch dimension lines and rich markup on it, inserts additional photos within the photo (insets), and exports a marked-up PDF/PNG to a local project folder. There is **no server, no database, no sign-in, no cloud SDK, no Bluetooth, and no multi-user**. Each Surface is fully self-contained; the user later drags the project's `exports/` folder into Dropbox manually.

### 1.2 The core loop (field dimensioning on Surface)

1. Open the app (installed PWA from Edge) and create or open a project — a folder on disk.
2. Take a photo with the Surface camera (or import an existing image).
3. Tap the **Dimension** tool. Pen down at point A (a magnifier loupe appears next to the tip), lift at point B.
4. A ft-in keypad slides up with a live parse preview. Type `10'-4 1/2"` and commit.
5. Add a text note, an arrow, a shape, or an **image inset** (a close-up photo placed on top of the main photo, with its own markup).
6. Everything autosaves locally. There is no Save button.
7. Export PDF/PNG to `<project>/exports/<timestamp>/`, then drag that folder into Dropbox.

### 1.3 Goals

| # | Goal | How we know it's met |
|---|---|---|
| G1 | Dimension a photo fast with the pen | Median < 60 s for a photo with 4 dimensions |
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
| Radial quick menu (8 recents) | **IN** | Barrel-button-gated; absent if the pen reports no barrel button |
| Rulers/guides on canvas | **DEFERRED** | |
| Two-finger tap = add to selection; pinch-zoom; double-tap fit↔100% | **IN** | |
| Handedness question at first run | **IN** | Plain question, default Right. **Do not** claim to read the Windows pen setting (no web API exposes it) |
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
    <uuid>.jpg                           ← inset + shared images, deduped by content hash
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
| Asset | `assets/`, `exports/` | image files, referenced by id + content hash |

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
 *  Hold the per-project Web Lock for the whole write so a second tab can't
 *  hold a writable on the target during move(). */
export async function writeAtomic(
  dir: FileSystemDirectoryHandle, name: string, data: string | Blob,
): Promise<void> {
  const tmpName = `${name}.tmp`;
  const tmp = await dir.getFileHandle(tmpName, { create: true });
  const w = await tmp.createWritable();
  await w.write(data);                    // accepts string | Blob | BufferSource
  await w.close();                       // flush; then atomic rename
  // FileSystemFileHandle.move() exists in Chromium (files only — NOT on directories).
  // Overwrite-on-move matches POSIX (M109+). Verified on target build in slice 1.2.
  await tmp.move(name);
}

export const writeJsonAtomic = (dir: FileSystemDirectoryHandle, name: string, data: unknown) =>
  writeAtomic(dir, name, JSON.stringify(data, null, 2));

/** Read + validate; on parse failure, recover from history, never silently overwrite.
 *  `parse` may return synchronously (parseJson does) or a Promise — both are awaited. */
export async function readJsonValidated<T>(
  dir: FileSystemDirectoryHandle, name: string,
  parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>,   // see §3.4 parseJson — never throws
): Promise<T> {
  const fh = await dir.getFileHandle(name, { create: false });
  const raw = await (await fh.getFile()).text();
  const res = await parse(raw);
  if (!res.success) return recoverFromHistory<T>(dir, name);
  return res.data!;
}

/** Delete stale *.tmp files left by a crash. Call once on project open.
 *  SAFETY (round-2): a tmp file can be another tab's write IN FLIGHT — the write lock
 *  doesn't protect this unless cleanup takes it too. So: run under the same per-project
 *  Web Lock AND only delete tmp files whose lastModified is older than 5 minutes. */
export async function cleanStaleTmp(dir: FileSystemDirectoryHandle, projectId: string): Promise<void> {
  await navigator.locks.request('fm:project:' + projectId, async () => {
    const cutoff = Date.now() - 5 * 60_000;
    for await (const [name, h] of (dir as any).entries()) {
      if (h.kind !== 'file' || !name.endsWith('.tmp')) continue;
      const file = await h.getFile();
      if (file.lastModified < cutoff) await dir.removeEntry(name);
    }
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
    if (!Number.isFinite(feet)) return null;
    s = s.slice(ftIdx + 1);
  }
  s = s.replace(/"/g, '').replace(/^\s*-\s*/, '').trim();
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
  const fracPart = st.numerator ? `${st.numerator}/${st.denominator}` : '';

  if (st.inchesMode) {
    if (!st.inches && !st.numerator) return '';
    if (!st.inches) return `${fracPart}"`;                  // fraction only: `3/16"`
    return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
  }

  if (st.feet) {
    if (st.inches && fracPart) return `${st.feet}'-${st.inches} ${fracPart}"`;   // 10'-4 1/2"
    if (st.inches) return `${st.feet}'-${st.inches}"`;                          // 10'-4"
    if (fracPart) return `${st.feet}'-0 ${fracPart}"`;                          // 10'-0 1/2"
    return `${st.feet}'-0"`;                                                    // 10'-0"
  }

  // feet empty → everything is inches
  if (!st.inches && !st.numerator) return '';
  if (!st.inches) return `${fracPart}"`;
  return fracPart ? `${st.inches} ${fracPart}"` : `${st.inches}"`;
}

/** The live preview: slots → value. The truth; never parse the composed string for display. */
export function keypadValueInches(st: KeypadState): number | null {
  const frac = st.numerator ? Number(st.numerator) / st.denominator : 0;
  if (st.inchesMode) {
    if (!st.inches && !st.numerator) return null;
    return Number(st.inches || 0) + frac;
  }
  if (!st.feet && !st.inches && !st.numerator) return null;
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

  const mk = (over: Partial<KeypadState>): KeypadState =>
    ({ feet: '', inches: '', numerator: '', denominator, activeSlot: 'inches', inchesMode: false, ...over });

  // 1. feet-first forms (space allowed before the ' mark: "10 ft 4 in" → "10 ' 4 \"")
  const fm = s.match(/^(\d+)\s*'\s*[-\s]?\s*(.*)$/);
  if (fm) {
    const rest = fm[2].trim();
    if (rest === '' || rest === '"') return { slots: mk({ feet: fm[1] }), rawDecimal: null };
    let m = rest.match(/^(\d+)(?:\s*[\s-]\s*(\d+)\/(\d+))?\s*"?$/);   // i [n/d]
    if (m) return { slots: mk({ feet: fm[1], inches: m[1], numerator: m[2] ?? '',
      denominator: m[3] ? Number(m[3]) : denominator }), rawDecimal: null };
    m = rest.match(/^(\d+)\s+(\d+)\s*"?$/);                            // i n (loose numerator, project denom)
    if (m) return { slots: mk({ feet: fm[1], inches: m[1], numerator: m[2] }), rawDecimal: null };
    m = rest.match(/^(\d+)\/(\d+)\s*"?$/);                             // n/d only
    if (m) return { slots: mk({ feet: fm[1], numerator: m[1], denominator: Number(m[2]) }), rawDecimal: null };
    return null;
  }

  // 2. bare decimal → inches (raw preserved for enteredText)
  if (/^\d+\.\d+"?$/.test(s)) {
    const d = s.replace(/"$/, '');
    return { slots: mk({ inches: d, inchesMode: true }), rawDecimal: d };
  }

  // 3. fractions without feet: `4-1/2` · `4 1/2` (whole+fraction) · `1/2` (alone)
  let m = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)"?$/);                  // whole + fraction: 4-1/2, 4 1/2
  if (m) return { slots: mk({ inches: m[1], numerator: m[2], denominator: Number(m[3]), inchesMode: true }), rawDecimal: null };
  m = s.match(/^(\d+)\/(\d+)"?$/);                                  // fraction alone: 1/2
  if (m) return { slots: mk({ numerator: m[1], denominator: Number(m[2]), inchesMode: true }), rawDecimal: null };

  // 4. loose integer groups: `124` = 124 in · `12 6` = 12 ft 6 in · `12 6 3` = 12 ft 6 in + 3/16
  m = s.match(/^(\d+)(?:[\s-]+(\d+))?(?:[\s-]+(\d+))?"?$/);
  if (!m) return null;
  if (m[2] === undefined) return { slots: mk({ inches: m[1], inchesMode: true }), rawDecimal: null };
  if (m[3] === undefined) return { slots: mk({ feet: m[1], inches: m[2] }), rawDecimal: null };
  return { slots: mk({ feet: m[1], inches: m[2], numerator: m[3] }), rawDecimal: null };
}
```

**Keypad UI wiring (mandatory):**
- The **live parse preview** renders `formatLength(keypadValueInches(st) × 25.4, ...)` — the slots are the truth; the composed string is display + storage.
- `«ft»/«in»` toggles: `ft` → `activeSlot = 'feet'`; `in` → `inchesMode = true` (whole entry rescopes; feet slot clears visually with an `«Entry is now inches»` hint chip for 1.5 s).
- Fraction chips (`1/2…1/16`): set `denominator` AND if `numerator` is empty, move `activeSlot` to `numerator` and show the `«← /16»` cycling hint.
- Hardware path: every keystroke re-runs `parseLooseToSlots(buffer, project.precisionDenominator)` → `{ slots, rawDecimal }`; the preview reads `keypadValueInches(slots)` (for a bare decimal, the value is `Number(rawDecimal)`); `Enter` commits that value as `valueMm` and stores `enteredText = rawDecimal ?? composeEnteredText(slots)`. **Reject `Enter` when the value is null/NaN** (the primary button also disables) — never commit a null.
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
    [`10\u2032-4 \u00BD\u2033`, 124.5],   // unicode prime/double-prime + vulgar fraction NOT accepted → see note
  ])('parses %s', (input, expected) => {
    expect(parseImperialToInches(input)).toBeCloseTo(expected);
  });
  it.each([[`abc`], [`4 1/0`], [``], [`12 6`], [`12 6 3`], [`.5`]])('rejects %s (strict layer)', (input) => {
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
  it('composeEnteredText output always parses (property, 500 random slot combos)', () => {
    for (let i = 0; i < 500; i++) {
      const st: KeypadState = {
        feet: String(Math.floor(Math.random() * 30)),
        inches: String(Math.floor(Math.random() * 12)),
        numerator: String(Math.floor(Math.random() * 16)),
        denominator: 16, activeSlot: 'inches',
        inchesMode: Math.random() < 0.5,
      };
      const text = composeEnteredText(st);
      if (!text) continue;
      const parsed = parseImperialToInches(text);
      expect(parsed).not.toBeNull();
      expect(parsed!).toBeCloseTo(keypadValueInches(st)!);   // value round-trip, not just parseability
    }
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
- Set `hitStrokeWidth` (e.g. 24) on thin lines for fat invisible hit areas (fingers/gloves).
- Tag every shape with `name()` = annotation id; resolve hit results to the owning annotation (children resolve to their inset). Use `hitFunc` for custom hit geometry.
- **Insets:** hit-testing resolves through the inset group's absolute transform; a hit on an inset child maps container-space → sheet-space via the group, then to asset-space by the inverse transform (the input router must divide the container point by the group's absolute scale/rotation, not just the stage's).

#### 8.1.1 Pixel ratio & text sharpness rule

| Layer | `Konva.pixelRatio` | Why |
|---|---|---|
| photoLayer | `1` | base image is a raster; nothing to gain from dpr on it |
| markupLayer, insetLayer, overlayLayer | `Math.min(devicePixelRatio, 2)` | ink, labels, selection handles must be crisp on a 267-ppi screen; capping at 2 bounds the fill cost |

Text nodes do NOT go through `Konva.pixelRatio` for their raster; text sharpness comes from setting `fontSize = fontSizeMu / s` (§4.2) so glyphs rasterize at full stage scale.

### 8.2 Input router (`src/editor/inputRouter.ts`) — HARDENED

```ts
export type InputIntent = 'draw' | 'navigate' | 'ignore';

/** Pen draws. Finger pans/zooms. Touch shortly after ANY pen event, or while a pen
 *  stroke is active, is treated as palm and ignored. */
export function createInputRouter(palmWindowMs = 1200) {
  let lastPenAt = 0;
  let penStrokeActive = false;

  return {
    /** Feed EVERY pen pointer event (down AND move) through here. */
    notePenEvent(): void { lastPenAt = performance.now(); },
    penStrokeStart(): void { penStrokeActive = true; },
    penStrokeEnd(): void { penStrokeActive = false; },

    classify(e: PointerEvent, now = performance.now()): InputIntent {
      if (e.pointerType === 'pen') {
        lastPenAt = now;
        return 'draw';
      }
      if (e.pointerType === 'touch') {
        // Palm rejection has TWO gates: the time window AND an active pen stroke.
        // A stroke longer than palmWindowMs must not re-open the touch window.
        if (penStrokeActive) return 'ignore';
        return now - lastPenAt < palmWindowMs ? 'ignore' : 'navigate';
      }
      return 'draw';   // mouse or trackpad
    },

    onPenHover(e: PointerEvent): void { /* pointerType==='pen' && no buttons → hover affordances */ },
  };
}
```

**Input routing rules (complete, binding):**
- **Pen** (`pointerType === 'pen'`): draws with the active tool. Every pen `pointermove` refreshes the palm window (`notePenEvent`).
- **Touch**: **single finger = pan** (always, unless the *Finger draws* toggle is on); **two fingers = pinch-zoom + pan** (pivot = pinch midpoint). There is no touch mode that draws in the default configuration. A single touch during an active pen stroke, or within 1.2 s of any pen event, is palm → ignored.
- **Mouse/trackpad**: draws (with the same tools); wheel + Ctrl = zoom, spacebar+drag = pan.
- Attach native listeners to `stage.container()`; `setPointerCapture` on `pointerdown`, release on `pointerup`/`pointercancel`. **Abort in-progress strokes on `pointercancel`** — do not commit a partial ink stroke; if a dimension A→B was mid-drag, discard it entirely (B was never chosen).
- Container CSS (required, or the browser steals pen/touch gestures):
  ```css
  .editor-surface { touch-action: none; user-select: none; }
  ```
- Pinch-zoom is **not built into Konva** — implement in `touchmove` (track active touches; 2 = pinch), pivoting on the pinch midpoint.
- Use `getCoalescedEvents()` for smooth ink; target **pen-to-ink ≤ 16 ms** perceived. Tool-swap feedback ≤ 100 ms.

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

**Handedness source (v0.3):** a plain first-run question, default Right, overridable in Settings. Do NOT attempt to read the Windows "which hand" pen setting — **no web API exposes it** (M6). Do not ship copy claiming otherwise.

### 8.5 Tool behaviors (complete spec)

#### Select / Edit (`SelectTool`)
- **Tap** selects the topmost object under the tip (hit slop padded 8px, +12px along thin strokes). Selection = `--sel` bounding box (2px) + soft 4px outer glow.
- **Marquee drag** on empty canvas selects all intersecting. `Shift`+tap / two-finger tap adds to selection.
- **Handles:** 8 (corner = scale, aspect-locked; edge = free stretch; `Shift` = unlock); rotate handle 40px above top edge, snaps 0/15/30/45/90.
- **Move:** drag the body. Alignment guides (1px `--sel`, 6px magnet) when edges/centers align. Guides are visual only.
- **Mini toolbar** (floating pill, 56px, above selection; flips below if <120px headroom): Duplicate · Delete · Lock · Bring to front / Send to back · Copy style · Paste style · tool-specific extras (Edit points for line/polygon/dimension; Replace photo / Focus for insets; Edit text for text). Every action is undoable.
- **Point editing:** line, dimension, angle, polygon, and freehand (resample) expose editable nodes; dragging updates the DERIVED label live (labels are always derived, §3.3).
- **Groups:** select multiple → `Group` (`Ctrl+G`); a callout + leader + text moves as one. Visible as a single bounding box with a `⬚` badge.
- **Locked objects:** unselectable by tap (only via Layers panel), render at 70% opacity with a `🔒` in Layers; trying to move shows a shake + toast `«Locked — unlock in Layers»`.

#### Dimension (`DimensionTool`) — the flagship flow
1. **Pen down (A):** loupe appears immediately; snapping within 20 screen px of endpoints/vertices/corners locks to a `--sel` node; near 0/45/90 a ghost ray + `«90°»` chip appears.
2. **Drag to B:** 1:1 live line (zero easing), arrowheads per style, ticks at ends; live label at midpoint (JetBrains Mono 700, dual-outline halo) showing the value; **collision rule** — if the midpoint is within 140px of the tip, push the label 36px along the perpendicular with a 1px leader.
3. **Pen up (B):** commit the geometry immediately; the ft-in keypad sheet slides up (canvas dims 25%; rail and style panel dim 40% and go non-interactive).
4. **Keypad (input model in §6.1.1):** slot state machine; live preview from slots; fraction chips set the denominator for this entry AND update the project precision (§2.4/M11: the Dimension panel's Precision control edits the **project-level** `precisionDenominator` — one source of truth); `✓ Use this value` commits (typed values are exact), `⛓ Chain` (commit + start the next dimension from B), cancel paths (`✕`/`Esc`/tap canvas). **Cancel keeps the drawn geometry** — never discard the stroke.
5. **Hardware keyboard fast path:** type `12 6 3` + `Enter`; no focus required while the keypad is open (`parseLooseToSlots`, §6.1.1).
6. **v1 is typed-only (§2.4):** no `≈`, no calibration, no `«Keep measured…»` (deferred with calibration). The drawn line is visual; the value is typed. Do not render the drawn pixel length as a number anywhere.

#### Angle (`AngleTool`) — vertex-first
1. Pen down = vertex (loupe active; strong snapping to endpoints).
2. Drag = first ray (live `--sel` guide).
3. Lift, then tap/drag = second ray; live arc (radius auto 40% of shorter ray, min 32px, max 120px) with arrows and the degree value at the midpoint.
4. Snapping 0.5°, hard snaps 0/45/90/180 (`«45°»` chip).
5. Second lift → angle commit sheet: `≈ 43.2°` (the `≈` here is the ANGLE tool's honest-readout convention, unrelated to calibration), precision toggles (`1°/0.5°/0.1°`), `«Complement»`/`«Supplement»` chips, `✓`, `⛓ Chain`, cancel.
6. Committed as a three-point object (vertex + two rays + arc); dragging any endpoint recomputes arc + label live.

#### Line, Arrow/Leader, Rectangle, Ellipse, Polygon
Shared pattern — **pen-down to start, drag to size, pen-up to commit**; hold steady 400 ms for constraint; all re-editable after commit via Select.

- **Line:** A→B, endpoint snapping, live length readout at midpoint, 45° constraint on hold.
- **Arrow/Leader:** like Line, default single end arrowhead; `elbow` (straight/90°/curved). Optional text slot: after drawing, if Text was the last-used text style, show `«Add label»` at the tail → converts the leader into a callout with an attached text object.
- **Rectangle:** corner-to-corner or center-out (setting); corner radius (0/4/12/24); live `W × H`; **fill applies with transparency, default no fill** (so the photo stays readable).
- **Ellipse:** like Rectangle minus corner radius; hold-to-constrain = circle; live `W × H`.
- **Polygon:** tap-by-tap vertex placement (numbered `--sel` nodes, snapping, rubber-band to previous). Close by tapping the first node (grows a `--sel` ring within 24px) or `Enter`. `Backspace` removes last vertex; double-tap last vertex ends an open path. (Polygon area readout is deferred with calibration, §2.4.)

#### Freehand & Highlighter (`FreehandTool`)
- **Freehand:** 1:1 ink via `getCoalescedEvents()`; pressure → width when enabled (min 30% of nominal at 0 pressure); tilt → width for pen; catmull-rom → bezier fit (a 12-point stroke renders smooth). Smoothing 0–100 (default 45).
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
  const outline = getStroke(
    points.map(p => [p.x, p.y, p.pressure ?? 0.5]),
    { size: strokeWidthMu / stage.scaleX(), thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
  );
  const d = getSvgPathFromStroke(outline, true);
  const path = new Konva.Path({ data: d, fill: style.strokeColor, strokeScaleEnabled: false });
  ```
  Never store the derived path — only raw input points.
- **Highlighter:** multiply blend, default 30% alpha, chisel tip (tilt changes chisel angle); **auto z-order: inserted below all other markup but above the photo** (a dedicated z-band). Long-press for chisel width + `Straight line` lock.

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
- **Rendering:** each inset is a `Konva.Group` at `(x, y)`, `rotation`, with group scale set so the cropped region maps to the placed size: `group.scale({ x: width / crop.width, y: height / crop.height })` (default crop = full asset, i.e. `0,0,assetW,assetH`). Apply crop via `clipFunc` (crop is in group-local = asset px, so the clip is applied before the transform — group-local clip + group scale does crop-then-transform in the right order):
  ```ts
  group.clipFunc(ctx => ctx.rect(0, 0, crop.width, crop.height));
  assetImage.position({ x: -crop.x, y: -crop.y });   // ← the crop window scrolls the asset INTO view
  ```
  (**Round-2 fix:** with a non-zero `crop.x/y`, the asset image must be offset `(-crop.x, -crop.y)` inside the group — "drawn at its own pixels, unscaled position" alone would show the wrong region.) Children are added to the group in **asset px** at their true asset-space positions — they scale/rotate with the group automatically, are clipped automatically, and stay glued to the photo content when the crop window moves.
- **Children are NEVER rewritten** when the inset is moved, scaled, rotated, or cropped. They are pure asset-space data. Changing `crop` moves the visible window over the (fixed) child space — children stay glued to the photo content, which is the field-correct behavior (zooming the crop window is "looking closer at the detail photo," not moving its markup).
- **Default placement:** 40% of sheet width, centered on the tap point, aspect preserved, rotation 0, handles showing. `crop` omitted (defaults to full asset).
- **Replace photo:** if the new asset's working-image dimensions are **identical**, swap the asset reference and keep children (visual continuity). If dimensions differ, children cannot be mapped — the dialog states this explicitly and offers `«Keep markup anyway — it may land in the wrong place»` (warned) or `«Remove markup»`. No silent remap. (M7)
- **Asset dedupe:** assets are deduped by content hash across the project; **children belong to the annotation, not the asset**, so two insets sharing one asset file have independent children. State this so the builder doesn't "fix" dedupe by moving children onto the asset record.
- **Hit-testing:** container-space → (group absolute transform)⁻¹ → asset px; child hits resolve to `(insetId, childId)`.

**Flows:**
- **Insert:** select tool → tap location → bottom sheet: `Take a photo` / `Choose from device` (multi-select = each as its own inset, cascaded 24px down-right) / `Recent photos` (4×2 grid of this project's last 8 — the field-fast path).
- **Manipulation:** 4 corner handles (scale, aspect-locked), 4 edge handles (adjust crop window — not stretch), rotate handle (0/90/180 snap), body drag with guides, two-finger pinch/rotate directly on the inset. Style panel: border (on/off + width + color), opacity, corner radius (0/6/12/24), crop (rule-of-thirds + straighten slider), replace photo, shadow.
- **Focus mode (nesting):** first tap = select; second tap (or `Focus`/`Enter`) = Focus mode — everything outside dims to 35%; a breadcrumb chip docks top-center `«Sheet 04 › Inset 2»` with `«Done»`; all tools now draw into the inset's own clipped markup layer. `Esc`/`Done` exits (selection unchanged). The Inset tool is disabled inside Focus with the tooltip `«Nested insets aren't supported»` — **nesting exactly ONE level** is enforced.
- Objects created *outside* Focus render **above** all insets; objects created *inside* belong to the inset, are clipped to it, and scale/rotate with it.

#### Erase / delete (`EraseTool`) — two modes (long-press to switch)
- **Object mode:** pen hover/drag outlines the object (`--err` + name chip); tap/drag deletes. **Undo toast (8s), no dialog** (undo exists).
- **Stroke mode:** erases freehand/highlighter segment-wise by **splitting strokes at the nearest raw input points** (vector-safe, approximate but feels right). Do **not** reach for a polygon-boolean library — it explodes scope and breaks the "keep raw points" rule.
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

1. **Pen draws, finger navigates** (split by `pointerType`; touch suppressed 1.2 s after any pen event AND during any active pen stroke — §8.2). Toggles: "Finger draws" (off), "Pen navigates" (off).
2. **The photo is never occluded by persistent chrome.** Anything over the canvas is transient (loupe, keypad, popovers, selection toolbar), dismissible by tapping the canvas / `Esc` / completing the action.
3. **Style is always one tap from the tool** — the Style Chip is a live WYSIWYG render of the next stroke, always on screen.
4. **Back is always safe** — everything autosaves, so back never prompts/warns/loses work.
5. **Destructive needs intent** — recoverable = toast + undo (never a dialog); irreversible = dialog with **hold-to-confirm (600 ms)**.
6. **Marks must survive any photo** — dual-outline text + 92%-opaque control backgrounds over the photo, everywhere.
7. **No gesture-only actions** — every gesture has an on-screen button.

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

Button states: default → pen-hover (`--g750` + tooltip) → active (`--hi` fill, white icon, 4px accent bar) → pressed (0.96 scale) → long-press (tool options popover). Disabled only for Erase when everything is locked.

Radial menu: **only** as an 8-slot recents quick-swap (last 8 distinct tools), invoked by pen barrel-button hold or press-and-hold+flick; absent if the pen reports no barrel button. **Not** a replacement for the rail.

### 11.5 Style panel

- **Style Chip (never optional):** active tool icon in a `--hi` circle + a 96×40px SVG that renders the *actual* next stroke (real color/width/dash/arrowheads/fill/transparency/`Aa` size). Tap = expand panel; long-press = compact popover at pointer.
- **Controls (contextual per tool):** color swatches (12-swatch palette + Custom + Eyedropper with "Nudge for contrast"), width scrubber (live-preview track; `[`/`]` step), fill + transparency (checkerboard underlay), line style (solid/dashed/dotted), arrowheads (none/start/end/both), text size/bold/align/background, precision + unit format (dimension — edits the **project-level** values, M11), sides/close (polygon), corner radius (rect), pressure/smoothing/perfect-shape (freehand), chisel width/straight-line (highlighter), border/opacity/corner-radius/crop/replace/focus (inset), mode/scope (erase).
- **Selected vs current-tool rule:** ≥1 selected → panel edits the selection **and** updates the tool's active style; none selected → edits only the tool's active style. Mixed values render indeterminate; type-changing controls are **disabled, not hidden**; heterogeneous selection shows a scope chip.
- **Speed:** 44px swatches (frequent, 6px dead space, no adjacent destructive action); drag-scrub width; 8-slot recents; named presets in `.fieldmeasure/presets.json`; per-tool style memory (`styleByTool`).
- **Style editor sheet** (deep edits): long-press the Style Panel header or `«More styles…` → 720×640 sheet, canvas dimmed to 60% (not 100% — the user must see the photo while picking a color for it). If the folder is unavailable, presets show a warn strip and styles still work in memory (§7.5 states this in the UI spec).

### 11.6 "Do not simplify" list (from the UI spec — treat flattening any of these as a bug)

1. Vertical tool rail on the pen-hand side (not a bottom bar / left palette).
2. Rail is a 2-column grid, bottom-anchored, undo/redo at the bottom.
3. No full-tool-set radial menu — only the 8-slot recents radial, only with a barrel button.
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
18. Pen hover drives tooltips and erase targeting.
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
- 2px minimum hairlines; targets 56px (rail/style) / 64px (keypad/shutter/dialog) / 48px floor; 8px gap.
- Pen hover drives tooltips/erase preview. **Handedness = the first-run question (default Right, overridable in Settings)** — mirrors rail side, style panel side, loupe offset, keypad side, toolbar anchor. Do not read the Windows pen setting (impossible from the web).
- Full keyboard operability (`:focus-visible` rings, logical tab order, arrow-nudge 1px/10px, direct typing into keypad). Screen reader: `aria-label` naming tool + current style; accessible object tree mirroring Layers.
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

Build in order. Do not start a slice until the previous slice's "done when" passes **on a real Surface with a pen** (mouse-only testing misses the important bugs). Each slice leaves the app usable.

### 0.1 — Scaffold
**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `.github/workflows/ci.yml`, `public/icons/*`, `src/main.tsx`, `src/App.tsx`, `THIRD-PARTY-NOTICES.md`.
**Do:** Vite + React 19 + TS; install and pin the fixed deps (§2.2, exact versions, committed lockfile, `npm ci` in CI); Vitest + Playwright; vite-plugin-pwa (manifest + service worker precaching app shell + fonts + icons; **do not cache user photos**); serve the CSP (§2.2). CI = typecheck + test + build.
**Done when:** the app URL loads in Edge; "Install app" works; reload in airplane mode still opens the app.

### 0.2 — Input spike (do this before any UI)
**Files:** `src/editor/inputRouter.ts`, a throwaway test canvas.
**Do:** pen/touch/mouse classification, **hardened palm window (§8.2: every pen event refreshes; touch blocked during active pen strokes)**, `touch-action:none`, pointer capture, pinch-zoom in `touchmove`, coalesced events. **Also enumerate the device's real getUserMedia resolution caps** (A7) and torch/flip behavior — report the numbers, they set the capture toggle labels in slice 1.4.
**Done when:** pen draws a line; finger pans; **a palm resting on the glass mid-stroke (stroke > 1.2 s) does not pan/zoom/smudge**; ink ≤16ms perceived. **This is the highest-risk part of the product — spike it first.**

### 0.3 — First-run, Settings, Home shell (NEW — M6/M9)
**Files:** `src/ui/FirstRun.tsx`, `src/ui/Settings.tsx` (minimal), `src/state/appStore.ts`, `src/ui/ProjectList.tsx` (shell with empty/error states).
**Do:** the two first-run steps (handedness — plain question, default Right; projects folder — `showDirectoryPicker` with suggested `Documents\FieldMeasure`); settings: handedness, units/precision, theme, density; Home shell renders the project-card grid (empty + loading states; scanning/permission come with slice 1.2's backend).
**Done when:** first run completes in < 20 s; handedness persists; Home renders an honest empty state; airplane-mode reload still works.
**Note:** handedness MUST land here — slice 1.4's loupe consumes it.

### 1.1 — Domain core
**Files:** `src/domain/{types,schema,units,geometry,snapping,ids}.ts`, `tests/{units,keypad,geometry,snapping,schema}.test.ts`.
**Do:** everything in §3, §4, §6 — **including the keypad slot model (§6.1.1) and its test table**.
**Done when:** the tests in §6.1 pass plus your own edge cases; **the keypad property test (200 random slot combos round-trip through the strict parser) passes**; schema round-trips example JSON in §3.5/§3.6 **and tolerates v0.2 files (extra `label` keys stripped, missing `unitFormat` normalized)**.

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

### 1.5 — Dimension tool (flagship)
**Files:** `src/editor/tools/DimensionTool.ts`, `src/editor/Loupe.ts`, `src/editor/history.ts`, `src/ui/DimensionKeypadSheet.tsx`, `src/editor/shapes/`.
**Do:** pen A→B + loupe (handedness-aware) + **keypad slot model (§6.1.1)** + live preview + derived label + select/move-endpoints/delete + undo/redo (§8.5).
**Done when:** 4 dims in <60s (gloves off), 90s (gloves on); **hardware `12 6 3` + Enter → `12'-6 3/16"`** (at default 1/16 precision); cancel keeps the stroke; Chain works; **labels re-derive when project precision changes**.

### 1.6 — Markup tools
**Files:** `src/editor/tools/{SelectTool,AngleTool,ShapeTool,FreehandTool,TextTool}.ts`, shapes renderers.
**Do:** line, arrow, rect, ellipse, polygon, freehand (**local `getSvgPathFromStroke`, `size = mu / s` — §8.5**), highlighter, text, angle (§8.5); selection handles, grouping, locking, layers panel (§8.6).
**Done when:** every tool draws with the pen, is selectable and undoable; highlighter renders below other markup; **ink width is constant across zoom**.

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

### 2.0 — Field pilot
**Do:** 2 people, 1 week, real jobs, side-by-side with their current tool. Write go/no-go + top 5 fixes.

**Explicitly out of v1 (deferred/cut — see §2.4 for the full table):** vector-overlay PDF, reference calibration (+`≈`, Keep-measured, calibrated rulers, polygon area), dimensions-summary page, laser meters, metric keypad UI (seam kept), auto-enhance, import-project-bundle, duplicate project, rotate-sheet, sheet templates, rulers/guides.

---

## 14. Test plan

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | units parse/format, **keypad slot model (§6.1.1) incl. the 200-combo property test**, geometry, snapping, schema round-trip + v0.2 tolerance, filename sanitization (trailing dots, device names, length caps) |
| Export invariance | Vitest (node-canvas or Playwright) | §4.2 invariant: stroke/glyph bitmap px = `mu × M` at M∈{1,2,3}; page pt = imagePx × 0.75 |
| Component | Vitest + Testing Library | keypad live-parse preview (slots → preview), toolbar active states, style panel mixed/indeterminate states |
| E2E | Playwright | open app → import fixture photo → draw a dimension with synthetic pen PointerEvents → reload → confirm persisted → export PDF → non-empty, page size correct |
| Storage (manual + scripted) | Playwright + kill-switch harness | kill mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → all recover; two-tab same-project readonly; two-tab different-projects writable |
| Field | Humans | gloves, bright sun (contrast), 8h offline, battery drain, 50-photo project, pen+touch palm rejection (incl. >1.2 s strokes with a resting palm) |

**The four highest-stakes pure modules are snapping, ft-in parsing, the keypad slot model, and the export scaling rules** — a bug in any is a wrong measurement or a wrong artifact. Give all four extensive unit tests.

---

## 15. Rules for the AI builder

1. Build slices in order (§13). No slice until the prior slice's "done when" passes on a real Surface with a pen.
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

1. ~~**Calibration timing**~~ — **Resolved by §2.4/D8:** v1 is typed-only; calibration (and its `≈`, Keep-measured, rulers, polygon area) is deferred with the schema seam in place.
2. **Metric** — imperial default with a clean seam; confirm metric isn't needed at launch (it affects the keypad's fraction chips).
3. **GPS / site address** — GPS stripped by default. Confirm whether a *typed* site-address field belongs in project/sheet meta for reporting. (A typed `locationLabel` already exists in the schema.)
4. **Sheet templates** — not in scope (§2.4); the preset system carries most of that value. Confirm.
5. (new) **Capture resolution reality** — after the 0.2 spike reports the device's true caps, decide whether the `«High»` toggle is worth its UI if both modes are ≈4K. If capped at 1080p, consider promoting "Import from Windows Camera app" in the capture fallback copy.

---

*End of handoff. Scope authority in §2.4; build order in §13; data model in §3; reference code in §5–§9; UI authority in `docs/ui-spec-field-measure-v2-hardened.md`; decisions in §16.*