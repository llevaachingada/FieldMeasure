# Field Measure — Pre-flight Handoff & Implementation Plan

> **Status:** Pre-flight. No functional code exists yet. Reference code in Part 3 is a build anchor, not finished code — treat it as the required starting point and verify library versions/APIs when installing packages.
> **Version:** 0.2 (September 21, 2026) — supersedes `field-measure-preflight.md` v0.1.
> **Audience:** the AI builder. This document is written to be followed end-to-end with minimal judgment calls. Anything a builder might reasonably guess at is spelled out here.
> **Companion:** `docs/ui-spec-field-measure.md` (detailed UI/UX). Where the two disagree, this document wins on architecture and data; the UI spec wins on visual presentation and interaction feel.

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
11. [UI/UX specification](#11-uiux-specification)
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
│   ├─ markup layer  (z-banded: highlighter below, then shapes/ink/text, insets above photo)
│   └─ transient overlays (loupe, draw preview, selection)   │
├────────────────────────────────────────────────────────────┤
│  Domain (pure TS): units, geometry, snapping, ids, schema  │
├────────────────────────────────────────────────────────────┤
│  projectStore (File System Access API) → project folder    │
│  idb-keyval (settings + persisted directory handle)        │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Stack

| Concern | Pick | Version (pin) | Notes |
|---|---|---|---|
| Language / build | TypeScript + Vite + React | React 18 | |
| Canvas | **Konva (imperative, NOT react-konva)** | 10.x | MIT; layer-per-canvas; `getIntersection` hit-testing |
| UI state | zustand + immer | zustand 5, immer 11 | `styleByTool`, editor session state |
| Validation | zod | 4.x | validates `project.json`/`markup.json` on load and before save |
| Local key-value | idb-keyval | 6.x | settings + persisted `FileSystemDirectoryHandle` (NOT project data) |
| PDF | **@cantoo/pdf-lib** | 2.x | MIT; `pdf-lib` 1.x is unmaintained, this fork is active and drop-in |
| Freehand | perfect-freehand | 1.x | `getStroke()` → `getSvgPathFromStroke()` → `Konva.Path` |
| Icons | lucide-react | 1.x | verify icon-name API at pin time |
| Tests | Vitest + Playwright | | units/geometry/snapping are pure → must be unit-tested |
| PWA | vite-plugin-pwa | | precache app shell + fonts; **never cache user photos** |

**Fixed runtime dependencies** (do not add without updating this document): `react`, `react-dom`, `konva`, `zustand`, `immer`, `zod`, `idb-keyval`, `@cantoo/pdf-lib`, `perfect-freehand`, `lucide-react`. Use `crypto.randomUUID()` for ids — no `uuid` package.

### 2.3 Layer responsibilities

| Layer | Responsibility | Tech |
|---|---|---|
| UI | Screens, toolbars, keypad, dialogs | React + TypeScript |
| Editor engine | Drawing, hit-testing, pen/touch input, loupe, undo/redo, zoom/pan | Konva (imperative) |
| Domain | Pure logic: unit parse/format, geometry, snapping, schema validation | Plain TypeScript, fully unit-tested |
| Persistence | Project folders, atomic writes, validate-on-load, recovery | File System Access API (+ OPFS fallback) |
| Platform | Camera, file import, persistent-storage request | Web APIs (`getUserMedia`, `showDirectoryPicker`, `navigator.storage.persist`) |

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
  .history/<sheetId>/                    ← snapshots (20 cap / 200 MB), corruption recovery
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
| Project | `project.json` | id, title, jobNumber, locationLabel, unitSystem, precisionDenominator, sheet order, calibration defaults |
| Sheet | `project.json` (row) + `sheets/<n>/` | id, title, sortIndex, imageWidth/Height, `calibrationPxPerFoot?`, asset refs |
| Annotation | `sheets/<n>/markup.json` | one JSON object per mark; an inset is an annotation of type `image` with inline `children[]` |
| Asset | `photos/`, `assets/`, `exports/` | image files, referenced by relative path + content hash |

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
      crop?: { x: number; y: number; width: number; height: number };
      flipX?: boolean; flipY?: boolean; opacity?: number };

export interface Annotation {
  id: UUID;
  type: AnnotationType;
  geometry: Geometry;            // geometry.kind === type
  valueMm?: number | null;       // canonical length (typed) — source of truth for dimensions
  valueDeg?: number | null;      // canonical angle (typed)
  enteredText?: string | null;   // exactly as typed, e.g. "10'-4 1/2\""
  label?: string | null;         // what renders on the sheet (formatted at render time)
  style: AnnotationStyle;
  zIndex: number;
  source: 'manual' | 'laser' | 'calibrated';   // 'manual' in v1; 'laser'/'calibrated' future
  assetId?: string | null;       // image insets reference an asset file
  groupId?: UUID | null;         // object grouping (Ctrl+G)
  locked: boolean;
  children?: Annotation[];       // image insets only — nested exactly ONE level
}

export interface Sheet {
  id: UUID;
  title: string;
  sortIndex: number;
  imageWidth: number;            // working image size (the coordinate space)
  imageHeight: number;
  calibrationPxPerFoot?: number | null;   // future: reference-scale calibration
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Project {
  id: UUID;
  title: string;
  jobNumber?: string;
  locationLabel?: string;        // typed site address, not geolocated
  unitSystem: 'imperial' | 'metric';
  precisionDenominator: 2 | 4 | 8 | 16 | 32 | 64;
  schemaVersion: number;
  sheets: Sheet[];
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Validation schemas (`src/domain/schema.ts`)

> **zod 4 ≠ zod 3.** Pin zod 4 and read its migration guide before writing schemas. Notable: `safeParse` returns a discriminated union (does not throw); the error param is a single `error` (not `message`/`invalid_type_error`); string formats are top-level (`z.email()`); apply defaults in code (a normalize step), not via `.default()`. Self-referential inset `children[]` needs `z.lazy()`.

```ts
import { z } from 'zod';

const HEX = /^#[0-9a-fA-F]{6}$/;
const Px = z.object({ x: z.number(), y: z.number() });

export const AnnotationStyleZ = z.object({
  strokeColor: z.string().regex(HEX),
  strokeWidthMu: z.number().positive(),
  fillColor: z.string().regex(HEX).nullable(),
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
  z.object({ kind: z.literal('image'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number(), crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(), flipX: z.boolean().optional(), flipY: z.boolean().optional(), opacity: z.number().optional() }),
]);

export const AnnotationZ: z.ZodType<Annotation> = z.object({
  id: z.string(),
  type: z.enum(['dimension', 'angle', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'freehand', 'highlight', 'text', 'image']),
  geometry: GeometryZ,
  valueMm: z.number().nullable(),
  valueDeg: z.number().nullable(),
  enteredText: z.string().nullable(),
  label: z.string().nullable(),
  style: AnnotationStyleZ,
  zIndex: z.number(),
  source: z.enum(['manual', 'laser', 'calibrated']),
  assetId: z.string().nullable(),
  groupId: z.string().nullable(),
  locked: z.boolean(),
  children: z.array(z.lazy(() => AnnotationZ)).optional(),
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
    precisionDenominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
  }),
  sheets: z.array(z.object({
    id: z.string(), title: z.string(), sortIndex: z.number(),
    imageWidth: z.number(), imageHeight: z.number(),
    calibrationPxPerFoot: z.number().nullable(),
    createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable(),
  })),
});

export const parseProjectFile = (json: string) => ProjectFileZ.safeParse(JSON.parse(json));
export const parseMarkupFile = (json: string) => MarkupFileZ.safeParse(JSON.parse(json));
```

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
      "label": "10'-4 1/2\"",
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
      "geometry": { "kind": "image", "x": 2600, "y": 900, "width": 900, "height": 675, "rotation": 0 },
      "valueMm": null, "enteredText": null, "label": null,
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
          "valueMm": 914.4, "enteredText": "3'-0\"", "label": "3'-0\"",
          "style": { "strokeColor": "#FF7A18", "strokeWidthMu": 4, "fillColor": null, "fillAlpha": 1, "lineStyle": "solid", "arrowheads": "both", "fontSizeMu": 18, "bold": true },
          "zIndex": 0, "source": "manual", "assetId": null, "groupId": null, "locked": false
        }
      ]
    }
  ]
}
```

---

## 4. Coordinate and style model

### 4.1 The three coordinate spaces

| Space | Units | Used for |
|---|---|---|
| Working-image | image pixels (float) | **stored** — annotation geometry |
| Screen | CSS px | rendering; `screen = stage.x() + image * stage.scaleX()` |
| Paper | points (pt) | export; `pt = 0.75 × mu` |

### 4.2 The scaling rules (verbatim — a builder must not "simplify" these)

- **Geometry coordinates are working-image pixels** of the sheet's working photo (EXIF-normalized, ≤4096px long edge). That working image is fixed at import and never re-encoded afterward, so coordinates stay stable. **Never store screen pixels in any data file.**
- **Style sizes are markup units (mu).** 1 mu = 1/96 inch (device-independent).
  - On screen, style sizes are **screen-space constant**: strokes use `strokeScaleEnabled: false` so a 4-mu stroke is 4 CSS px regardless of zoom. Geometry, by contrast, *does* scale with zoom.
  - Text: Konva `fontSize` is not counter-scaled like strokes. Set `fontSize = fontSizeMu` (screen-space) directly; do **not** counter-scale the node via `scale(1/s)` (that blurs at high zoom).
  - On export (flattened): `pt = 0.75 × mu`.

```
screen:  imageX_px → screenX = stage.x() + imageX * stage.scaleX()     (geometry scales with zoom)
         mu        → screen px = mu                                     (styles constant; strokeScaleEnabled:false)
export:  render stage at scale M, pixelRatio 1 → bitmap; embed at 96×M dpi; page size (in) = bitmap_px / (96×M)
         physical stroke/font size = mu → pt (×0.75)                    (identical to screen at any M)
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

**All disk writes go through `src/fs/projectStore.ts`. Never call `createWritable()` anywhere else.**

### 5.1 Storage backend interface (`src/fs/backend.ts`)

```ts
export interface StorageBackend {
  init(): Promise<void>;                                  // load persisted handle / open OPFS
  requestAccess(): Promise<boolean>;                      // user-gesture permission (re)acquisition
  getProjectDir(): FileSystemDirectoryHandle | null;
  readText(name: string): Promise<string>;                // relative to a project folder
  writeTextAtomic(name: string, text: string): Promise<void>;
  writeFile(name: string, blob: Blob): Promise<void>;
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
2. Later startups: read the handle from idb-keyval → `handle.queryPermission({ mode: 'readwrite' })`; if not `'granted'`, call `handle.requestPermission({ mode: 'readwrite' })` **from a user gesture**. Installed PWAs persist the grant once granted, but do not rely on it — re-verify once at session start, not before every write.
3. Map `NotFoundError` / `NotAllowedError` / `SecurityError` to a single "Project folder unavailable" UI state with a **Reconnect folder** action (re-pick via `showDirectoryPicker({ id: ... })`, confirm with `handle.isSameEntry(prev)`).

### 5.3 Atomic write pattern (mandatory)

`createWritable().close()` alone is **not atomic enough** — a crash mid-close can leave a truncated file. Use temp-file + same-directory rename (atomic in Chromium).

```ts
// src/fs/projectStore.ts (reference)
import { get, set } from 'idb-keyval';

let backend: StorageBackend;

export async function initStore(): Promise<void> {
  backend = chooseBackend();
  await backend.init();
  await backend.requestAccess();
}

export async function pickRoot(): Promise<void> {
  // FSA path
  const handle = await window.showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' });
  await set('rootHandle', handle);
  // re-init backend with the new handle
}

async function ensureDir(parent: FileSystemDirectoryHandle, name: string) {
  return parent.getDirectoryHandle(name, { create: true });
}

/** Atomic JSON write: tmp → close → rename over the real file. */
export async function writeJsonAtomic(dir: FileSystemDirectoryHandle, name: string, data: unknown): Promise<void> {
  const tmpName = `${name}.tmp`;
  const tmp = await dir.getFileHandle(tmpName, { create: true });
  const w = await tmp.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();                       // flush; then atomic rename
  // @ts-expect-error FileSystemFileHandle.move() exists in Chromium; verify overwrite semantics on the target build
  await tmp.move(name);
}

/** Read + validate; on parse failure, recover from history, never silently overwrite. */
export async function readJsonValidated<T>(
  dir: FileSystemDirectoryHandle, name: string,
  parse: (s: string) => { success: boolean; data?: T },
): Promise<T> {
  const fh = await dir.getFileHandle(name, { create: false });
  const raw = await (await fh.getFile()).text();
  const res = parse(raw);
  if (!res.success) return recoverFromHistory<T>(dir, name);
  return res.data!;
}

/** Delete stale *.tmp files left by a crash. Call once on project open. */
export async function cleanStaleTmp(dir: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, h] of (dir as any).entries()) {
    if (h.kind === 'file' && name.endsWith('.tmp')) await dir.removeEntry(name);
  }
}
```

### 5.4 Autosave mechanics

- Changes are coalesced and written **400 ms** after the last edit; writes are **serialized per sheet**; thumbnails regenerate **3 s** after the last edit.
- **Never show "Saved" optimistically** — the Autosave chip reflects the write promise's resolution.
- Failures back off **1 s, 3 s, 10 s**, then park in "Pending" (never retry forever).
- **Flush on `pagehide` / `visibilitychange`** — otherwise the last ~400 ms of debounced work dies on close.
- **Two-tab guard:** wrap writes with `navigator.locks.request('projectStore', ...)`; listen on `BroadcastChannel` to invalidate a second tab into read-only. (~30 lines; ship in Phase 1.)

### 5.5 Corruption recovery

On any load: `safeParse` → on failure walk `.history/<sheetId>/` newest→oldest and auto-restore. History snapshots are the recovery path; the temp+rename write is the prevention. Snapshots are taken every 10 min of editing + before each destructive action, capped at 20 snapshots / 200 MB per project.

### 5.6 Project identity and rename

- **Project identity derives from `project.json` ids, never from the folder name.** When scanning a root folder, read each subfolder's `project.json` and match by `id`. Explorer renames are cosmetic and must not break project identity.
- **In-app rename** = rewrite `project.title` in `project.json` **and** `FileSystemDirectoryHandle.move()` the directory (content first, then move — a non-atomic pair, but both endpoints remain valid). Do not key anything on the path.
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

Accepted imperial input: `10'`, `10' 4"`, `10'-4 1/2"`, `10 ft 4 in`, `4-1/2`, `1/2"`, `124.5` (bare number = inches). A space or dash is required between whole inches and a fraction.

```ts
export const MM_PER_IN = 25.4;

export function parseImperialToInches(raw: string): number | null {
  let s = raw.trim().toLowerCase()
    .replace(/[’′]/g, "'").replace(/[”″]/g, '"')
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

/** Format a canonical mm value for display in the given system. */
export function formatLength(valueMm: number, system: 'imperial' | 'metric', denom = 16): string {
  if (system === 'metric') return `${valueMm.toFixed(0)} mm`;
  return formatInches(valueMm / MM_PER_IN, denom);
}
```

**Tests (`tests/units.test.ts`)** — carry these forward and add your own edge cases:

```ts
import { describe, it, expect } from 'vitest';
import { parseImperialToInches, formatInches, parseLengthToMm } from '../src/domain/units';

describe('parseImperialToInches', () => {
  it.each([
    [`10'`, 120], [`10' 4"`, 124], [`10'-4 1/2"`, 124.5], [`10 ft 4 in`, 124],
    [`4-1/2`, 4.5], [`1/2"`, 0.5], [`124.5`, 124.5],
  ])('parses %s', (input, expected) => {
    expect(parseImperialToInches(input)).toBeCloseTo(expected);
  });
  it.each([[`abc`], [`4 1/0`], [``]])('rejects %s', (input) => {
    expect(parseImperialToInches(input)).toBeNull();
  });
});

describe('formatInches', () => {
  it('formats and reduces fractions', () => expect(formatInches(124.5)).toBe(`10'-4 1/2"`));
  it('carries rounding into feet', () => expect(formatInches(11.99)).toBe(`1'-0"`));
  it('handles fraction only', () => expect(formatInches(0.5)).toBe(`1/2"`));
});

describe('parseLengthToMm', () => {
  it('converts imperial to mm', () => expect(parseLengthToMm(`10'-4 1/2"`, 'imperial')).toBeCloseTo(3162.3));
  it('parses metric', () => expect(parseLengthToMm('3.1623 m', 'metric')).toBeCloseTo(3162.3));
});
```

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
- **Reference calibration:** keep `Sheet.calibrationPxPerFoot?`. A future "calibrate scale" flow draws a known line and types its true length; measured length is then **derived at render** (never stored, so it can't go stale). Labels get an `≈` "estimated" prefix and a different accent. v1 always types the value.

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

Notes: the working image is fixed at this size forever (it is the coordinate space). Keep the original file in `photos/` if you later need higher-res re-export — **v1 does not keep originals** (4096px at 3× export is fine); document that a future "re-import at higher res" invalidates all annotation coordinates and is not supported.

### 7.2 EXIF (`src/media/exif.ts`)

Read capture time (for default sheet naming) **before** normalization strips it. Bake orientation by decoding with `imageOrientation: 'from-image'`. **Strip GPS by default** from working copies and exports.

### 7.3 Thumbnails (`src/media/thumbnails.ts`)

Generate 640×480 composites (photo + markup). Konva cannot run in a worker: **decode in a worker, render on the main thread throttled to idle**. Regenerate 3 s after the last edit; cache as `sheets/<n>/thumb.jpg`.

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
- `perfectDrawEnabled: false` for shapes with fill+stroke+opacity; `node.cache()` for complex static shapes; `Konva.pixelRatio = 1` on 2× screens.
- Keep the number of layers low (each Konva `Layer` is its own `<canvas>`).

Hit-testing:
- `layer.getIntersection({ x, y })` uses container-space (same as `stage.getPointerPosition()`), honors `listening:false`/visibility/opacity/`hitStrokeWidth`.
- Set `hitStrokeWidth` (e.g. 24) on thin lines for fat invisible hit areas (fingers/gloves).
- Tag every shape with `name()` = annotation id; resolve hit results to the owning annotation (children resolve to their inset). Use `hitFunc` for custom hit geometry.

### 8.2 Input router (`src/editor/inputRouter.ts`)

```ts
export type InputIntent = 'draw' | 'navigate' | 'ignore';

/** Pen draws. Finger pans/zooms. Touches shortly after pen use are treated as palm and ignored. */
export function createInputRouter(palmWindowMs = 1200) {
  let lastPenAt = 0;
  return {
    classify(e: PointerEvent): InputIntent {
      if (e.pointerType === 'pen') { lastPenAt = performance.now(); return 'draw'; }
      if (e.pointerType === 'touch') {
        return performance.now() - lastPenAt < palmWindowMs ? 'ignore' : 'navigate';
      }
      return 'draw';   // mouse or trackpad
    },
    onPenHover(e: PointerEvent): void { /* pointerType==='pen' && no buttons → hover affordances */ },
  };
}
```

- Container CSS (required, or the browser steals pen/touch gestures):
  ```css
  .editor-surface { touch-action: none; user-select: none; }
  ```
- Attach native listeners to `stage.container()`; `setPointerCapture` on `pointerdown`, release on `pointerup`/`pointercancel`. Abort in-progress strokes on `pointercancel`.
- Pinch-zoom is **not built into Konva** — implement in `touchmove` (track ≥1 active touch, 2 = pinch), pivoting on the pinch midpoint.
- Use `getCoalescedEvents()` for smooth ink; target **pen-to-ink ≤ 16 ms** perceived. Tool-swap feedback ≤ 100 ms.

### 8.3 Undo/redo (`src/editor/history.ts`)

Command pattern. Depth: **100 steps in memory, 20 persisted per sheet** across restarts.

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

### 8.5 Tool behaviors (complete spec)

#### Select / Edit (`SelectTool`)
- **Tap** selects the topmost object under the tip (hit slop padded 8px, +12px along thin strokes). Selection = `--sel` bounding box (2px) + soft 4px outer glow.
- **Marquee drag** on empty canvas selects all intersecting. `Shift`+tap / two-finger tap adds to selection.
- **Handles:** 8 (corner = scale, aspect-locked; edge = free stretch; `Shift` = unlock); rotate handle 40px above top edge, snaps 0/15/30/45/90.
- **Move:** drag the body. Alignment guides (1px `--sel`, 6px magnet) when edges/centers align. Guides are visual only.
- **Mini toolbar** (floating pill, 56px, above selection; flips below if <120px headroom): Duplicate · Delete · Lock · Bring to front / Send to back · Copy style · Paste style · tool-specific extras (Edit points for line/polygon/dimension; Replace photo / Focus for insets; Edit text for text). Every action is undoable.
- **Point editing:** line, dimension, angle, polygon, and freehand (resample) expose editable nodes; dragging updates labels live.
- **Groups:** select multiple → `Group` (`Ctrl+G`); a callout + leader + text moves as one. Visible as a single bounding box with a `⬚` badge.
- **Locked objects:** unselectable by tap (only via Layers panel), render at 70% opacity with a `🔒` in Layers; trying to move shows a shake + toast `«Locked — unlock in Layers»`.

#### Dimension (`DimensionTool`) — the flagship flow
1. **Pen down (A):** loupe appears immediately; snapping within 20 screen px of endpoints/vertices/corners locks to a `--sel` node; near 0/45/90 a ghost ray + `«90°»` chip appears.
2. **Drag to B:** 1:1 live line (zero easing), arrowheads per style, ticks at ends; live label at midpoint (JetBrains Mono 700, dual-outline halo) showing the value; **collision rule** — if the midpoint is within 140px of the tip, push the label 36px along the perpendicular with a 1px leader.
3. **Pen up (B):** commit the geometry immediately; the ft-in keypad sheet slides up (canvas dims 25%; rail and style panel dim 40% and go non-interactive).
4. **Keypad:** live parse preview (`12' 6 3/8" = 150.4 in`); big `ft`/`in` toggles; fraction chips; 72px keys; `✓ Use this value` (typed values are exact and override any drawn scale), `⛓ Chain` (commit + start the next dimension from B), cancel paths (`✕`/`Esc`/tap canvas). **Cancel keeps the drawn geometry** — never discard the stroke.
5. **Hardware keyboard fast path:** type `12 6 3` + `Enter`; no focus required while the keypad is open.
6. **Uncalibrated:** labels are typed, so there is no `≈` in v1 (calibration is a future seam, §6.5). If calibration ever ships, uncalibrated labels get `≈` and the calibrated value is derived at render.

#### Angle (`AngleTool`) — vertex-first
1. Pen down = vertex (loupe active; strong snapping to endpoints).
2. Drag = first ray (live `--sel` guide).
3. Lift, then tap/drag = second ray; live arc (radius auto 40% of shorter ray, min 32px, max 120px) with arrows and the degree value at the midpoint.
4. Snapping 0.5°, hard snaps 0/45/90/180 (`«45°»` chip).
5. Second lift → angle commit sheet: `≈ 43.2°`, precision toggles (`1°/0.5°/0.1°`), `«Complement»`/`«Supplement»` chips, `✓`, `⛓ Chain`, cancel.
6. Committed as a three-point object (vertex + two rays + arc); dragging any endpoint recomputes arc + label live.

#### Line, Arrow/Leader, Rectangle, Ellipse, Polygon
Shared pattern — **pen-down to start, drag to size, pen-up to commit**; hold steady 400 ms for constraint; all re-editable after commit via Select.

- **Line:** A→B, endpoint snapping, live length readout at midpoint, 45° constraint on hold.
- **Arrow/Leader:** like Line, default single end arrowhead; `elbow` (straight/90°/curved). Optional text slot: after drawing, if Text was the last-used text style, show `«Add label»` at the tail → converts the leader into a callout with an attached text object.
- **Rectangle:** corner-to-corner or center-out (setting); corner radius (0/4/12/24); live `W × H`; **fill applies with transparency, default no fill** (so the photo stays readable).
- **Ellipse:** like Rectangle minus corner radius; hold-to-constrain = circle; live `W × H`.
- **Polygon:** tap-by-tap vertex placement (numbered `--sel` nodes, snapping, rubber-band to previous). Close by tapping the first node (grows a `--sel` ring within 24px) or `Enter`. `Backspace` removes last vertex; double-tap last vertex ends an open path.

#### Freehand & Highlighter (`FreehandTool`)
- **Freehand:** 1:1 ink via `getCoalescedEvents()`; pressure → width when enabled (min 30% of nominal at 0 pressure); tilt → width for pen; catmull-rom → bezier fit (a 12-point stroke renders smooth). Smoothing 0–100 (default 45).
- **Perfect shape on hold:** pen still within 8px for 400ms at stroke end → replace with a recognized primitive (line/rect/ellipse). `«⇧ Shape»` chip during hold; moving >8px cancels (keeps the freehand stroke). On by default.
- **Rendering:** store raw points + pressure in `markup.json`; render via perfect-freehand:
  ```ts
  import { getStroke, getSvgPathFromStroke } from 'perfect-freehand';
  const outline = getStroke(points.map(p => [p.x, p.y, p.pressure ?? 0.5]), {
    size: style.strokeWidthMu * 2, thinning: 0.5, smoothing: 0.5, streamline: 0.5,
  });
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

#### Image inset (`InsetTool`) — photo within the photo
- **Insert flow:** select tool → tap location → bottom sheet: `Take a photo` / `Choose from device` (multi-select = each as its own inset, cascaded 24px down-right) / `Recent photos` (4×2 grid of this project's last 8 — the field-fast path). Default placement 40% of sheet width, centered on tap, aspect preserved, rotation 0, handles showing.
- **Manipulation:** 4 corner handles (scale, aspect-locked), 4 edge handles (adjust crop window — not stretch), rotate handle (0/90/180 snap), body drag with guides, two-finger pinch/rotate directly on the inset. Style panel: border (on/off + width + color), opacity, corner radius (0/6/12/24), crop (rule-of-thirds + straighten slider), replace photo, shadow.
- **Focus mode (nesting):** first tap = select; second tap (or `Focus`/`Enter`) = Focus mode — everything outside dims to 35%; a breadcrumb chip docks top-center `«Sheet 04 › Inset 2»` with `«Done»`; all tools now draw into the inset's own clipped markup layer. `Esc`/`Done` exits (selection unchanged).
- **Model:** inset is a container `{ photo, crop, transform, children: MarkupObject[] }`. Nesting exactly **one level** (an inset cannot contain an inset — disable the Inset tool in Focus with a tooltip). Objects created *outside* Focus render **above** all insets; objects created *inside* belong to the inset, are clipped to it, and scale/rotate with it.
- **Konva:** each inset is a `Konva.Group` (image + children + border); `Group.clip()` — apply crop **first**, then transform (clip is in group-local space); `opacity` on the group so children fade with it; children in inset-local (untransformed) px.

#### Erase / delete (`EraseTool`) — two modes (long-press to switch)
- **Object mode:** pen hover/drag outlines the object (`--err` + name chip); tap/drag deletes. **Undo toast (8s), no dialog** (undo exists).
- **Stroke mode:** erases freehand/highlighter segment-wise by **splitting strokes at the nearest raw input points** (vector-safe, approximate but feels right). Do **not** reach for a polygon-boolean library — it explodes scope and breaks the "keep raw points" rule.
- Scope chips: `Ink` / `Markup` / `Everything`. `Everything` shows `--err` tint + requires confirm.
- `Clear sheet markup` lives in the overflow menu (not the rail); dialog lists counts per category + hold-to-confirm.

### 8.6 Layers panel

Flyout (320px) listing (top = front): `Markup` (grouped: Dimensions · Shapes · Ink · Text), each `Inset` (its children indented), `Photo` (base — lockable, never deletable). Rows 56px; eye toggle, lock toggle, drag-to-reorder (400ms long-press starts the drag), tap = select (pans to it if off-screen), long-press = Bring to front / Send to back / Group / Ungroup / Rename / Delete. Selecting a markup group is the fastest mass-restyle path.

---

## 9. Export

### 9.1 Flatten-only (v1)

Markup is burned into the raster at the chosen multiplier. **Vector-overlay PDF is deferred to 1.1** (it drags in fontkit, fraction glyphs, and dash mapping for marginal v1 value).

### 9.2 PDF (`src/export/pdf.ts`) — `@cantoo/pdf-lib`

```ts
import { PDFDocument, rgb } from '@cantoo/pdf-lib';

type SheetExport = { jpg: Uint8Array; widthPx: number; heightPx: number; title: string };

/** Flatten-only: one page per sheet, "fit to photo" page size. */
export async function buildPdf(sheets: SheetExport[], opts: { summaryPage?: boolean }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const s of sheets) {
    const img = await pdf.embedJpg(s.jpg);            // camelCase embedJpg/embedPng (v1.17+ / cantoo fork)
    const page = pdf.addPage([s.widthPx, s.heightPx]); // fit-to-photo: page = image px at 1:1 (96dpi)
    page.drawImage(img, { x: 0, y: 0, width: s.widthPx, height: s.heightPx });
    if (opts.summaryPage) { /* skip in v1 — see below */ }
  }
  return pdf.save();
}
```

- **Flattened raster for each sheet:** render the stage at scale M, `pixelRatio: 1`, export via `stage.toBlob()`; embed at 96×M dpi; page size = px/(96×M) inches. The working photo is already EXIF-normalized; `@cantoo/pdf-lib` does not re-apply orientation.
- **PDF origin is bottom-left** — invert Y when mapping coordinates (moot for flatten-only; relevant the moment vector overlay ships).
- **Optional dimensions summary page (deferred):** a mono table of every dimension across the project (sheet name + value). A real report artifact; defer unless asked.

### 9.3 PNG (`src/export/png.ts`)

One file per sheet at `1×/2×/3×`; zip into a single `.zip` by default.

### 9.4 Filenames (`src/export/filenames.ts`)

- Token template `{project} {index} {sheet} {date} {time}`; default `{project}_{index}-{sheet}`.
- **Sanitize Windows reserved characters and DOS device names** in every token: strip `<>:"/\|?*` and control chars; reject `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` (and any name whose base equals one).
- Conflict policy: `Add (1)(2)` (default) / `Overwrite` / `Skip`.

### 9.5 Destination & result

- Default `<project>/exports/<timestamp>/`; "Remember this destination" per project.
- Result view: `--ok` check, `Exported N files (X MB)`, full path in mono, `Copy path`, `Export again`, `Done`, plus the line: *"Drag this folder into Dropbox when you're back on Wi-Fi."*
- **"Open folder" is not possible from a PWA** (no browser API opens Explorer at a path). Approximate with `showDirectoryPicker({ startIn: <handle> })` or `Copy path`. Do not burn time on this.
- Errors are per-file with per-file retry (`Folder permission expired` → Re-authorize; `File is open in another app` → Retry; `Not enough disk space` → show the shortfall). Never "start over".

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

> This section is the implementation-level summary. The full spec — `docs/ui-spec-field-measure.md` — is authoritative on visual tokens, exact pixel values, and interaction micro-detail. A builder must honor its "do not simplify" list (reproduced in §11.6). This section exists so the builder does not need to flip between files for the core layout and flows.

### 11.1 Interaction principles (non-negotiable)

1. **Pen draws, finger navigates** (split by `pointerType`; touch suppressed 1.2 s after pen-down). Toggles: "Finger draws" (off), "Pen navigates" (off).
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
- **Controls (contextual per tool):** color swatches (12-swatch palette + Custom + Eyedropper with "Nudge for contrast"), width scrubber (live-preview track; `[`/`]` step), fill + transparency (checkerboard underlay), line style (solid/dashed/dotted), arrowheads (none/start/end/both), text size/bold/align/background, precision + unit format (dimension), sides/close (polygon), corner radius (rect), pressure/smoothing/perfect-shape (freehand), chisel width/straight-line (highlighter), border/opacity/corner-radius/crop/replace/focus (inset), mode/scope (erase).
- **Selected vs current-tool rule:** ≥1 selected → panel edits the selection **and** updates the tool's active style; none selected → edits only the tool's active style. Mixed values render indeterminate; type-changing controls are **disabled, not hidden**; heterogeneous selection shows a scope chip.
- **Speed:** 44px swatches (frequent, 6px dead space, no adjacent destructive action); drag-scrub width; 8-slot recents; named presets in `.fieldmeasure/presets.json`; per-tool style memory (`styleByTool`).

### 11.6 "Do not simplify" list (from the UI spec — treat flattening any of these as a bug)

1. Vertical tool rail on the pen-hand side (not a bottom bar / left palette).
2. Rail is a 2-column grid, bottom-anchored, undo/redo at the bottom.
3. No full-tool-set radial menu — only the 8-slot recents radial, only with a barrel button.
4. Style Chip is a WYSIWYG render, not a colored dot.
5. Style edits apply to selection AND update tool default; mixed = indeterminate; incompatible controls disabled (not hidden).
6. Dimension loupe on pointerdown with zero delay, edge-aware, never under hand/tip; label offsets with a leader line.
7. Cancelling the dimension keypad keeps the drawn geometry.
8. The Chain button exists.
9. Live ft-in parse preview + no-focus keyboard fast path.
10. Uncalibrated dimensions show `≈` (only if calibration ever ships; v1 is typed-only).
11. Insets are containers with their own markup, nested one level, Focus breadcrumb chip.
12. Highlighter inserts below all other markup.
13. Hold-to-shape (400ms) for freehand, with a `⇧ Shape` chip.
14. Recoverable deletion never dialogs (toast + undo); irreversible = hold-to-confirm.
15. Autosave chip never icon-only, never optimistic.
16. Sunlight mode is a token-level theme, not a filter.
17. Dual-outline text + 92%-opaque control backgrounds over the photo.
18. 2px minimum hairlines (no 1px borders).
19. Pen hover drives tooltips and erase targeting.
20. Export ends by telling the user to drag the folder into Dropbox.

### 11.7 Visual direction "Site Slate"

- Dark graphite chrome (keeps annotation colors honest, reduces glare); **one** hi-vis accent. **Accent discipline (hard rule): orange = action/measurement, cyan = selection/manipulation — never swap.**
- Tokens: `--g900 #0E1318` app/mat · `--g850 #12181E` chrome · `--g800 #161C23` panel · `--g750 #1E262F` elevated · `--g700 #2B3540` hairline · `--g600 #3A4652` control border · `--g400 #6E7F8E` disabled · `--g300 #9FB0BE` secondary · `--g100 #EAF0F5` primary · `--g000 #FFFFFF`. Accents `--hi #FF7A18`, `--hi-d #D45F0C`, `--sel #2FD4E0`, `--sel-d #12909A`. Semantic `--ok #3DD68C`, `--warn #FFC24B`, `--err #FF5A5F`.
- **12-swatch markup palette** (ordered for real-photo visibility): `#FF7A18` Hi-Vis Orange · `#FFD400` Safety Yellow · `#E8384F` Signal Red · `#FF3D9A` Magenta · `#2FD4E0` Cyan · `#35A7FF` Sky · `#2ECC71` Green · `#A8E05F` Lime · `#FFFFFF` White · `#000000` Black · `#9AA6B2` Concrete · `#123B6B` Deep Navy.
- **Type:** Archivo (UI, variable 400/500/600/700) + JetBrains Mono (all numerals, 500/700, tabular figures, slashed zero). Self-hosted woff2 subsets; **never a CDN**.
- Radii 10px controls / 14px panels / 999px pills; elevation only on floating layers; 150ms chrome motion, **zero animation on ink**.

### 11.8 Camera & import

- `getUserMedia` full-bleed viewfinder, no top bar. Chrome hugs edges: close · torch/grid/level/flip (default rear) · resolution (`High`/`Fast`).
- Tap-to-focus reticle (`--sel`), long-press = AE/AF lock; horizon line turns `--ok` within ±1.5°; optional auto-capture-on-level (off).
- Shutter 88px; capture = 120ms black flash + thumbnail flies to corner; review screen: `Retake · Rotate · Auto-enhance · Use photo`.
- **Camera-unavailable fallback (mandatory):** if `getUserMedia` unavailable or denied, show `«Camera unavailable… Open Windows Camera or Import a photo.»` (note the OS privacy setting: Settings → Privacy → Camera → allow desktop apps).
- **Do NOT use `<input type="file" capture>`** — `capture` is ignored on Windows desktop (opens a normal file picker). Use `getUserMedia` + `<video>` + canvas snapshot. `facingMode` is unreliable on Windows — use `enumerateDevices()` + a `deviceId` picker + `ondevicechange`. Labels are empty until camera permission is granted.
- Import from disk: `🖼 Import` → OS picker, multi-select jpg/png/heic/webp. From Home/Project → each becomes a sheet; from Editor → each becomes an **inset** (with an `Insert as: Inset / New sheet` override). Read EXIF orientation (bake it), capture time (default name), camera model; **strip GPS by default**. **HEIC/webp are not reliably decodable in Edge (OS codec dependent)** — feature-detect decode and use the "Couldn't open this image" state, not just the accept attribute.
- Autosave on capture: write `sheets/<n>/photo.jpg` immediately; on write failure keep the sheet in memory + `Save a copy…` (a field photo is never trapped).

### 11.9 Home & Project

- **Home:** search + sort (Recent/Name/Size/Needs attention), 3-column project card grid. Card = cover thumbnail + name + mono meta (`12 sheets · 48 MB · 2:14 PM`) + middle-truncated path chip + per-card availability state (`Folder not found` → `Locate…`). Empty state copy: `«Projects are just folders on this PC. Pick one and everything saves into it.»` `Remove from this list` never deletes files (says so). Long-press = Rename / Reveal path / Export all / Remove from list / Delete files (hold-to-confirm, shows the path).
- **Project:** 4-column sheet grid of composite thumbnails + index badge + `+2` inset badge. **Add affordances are the first two tiles** (`Take photo`, `Import`) — always live, never skeleton. Long-press to reorder (live renumber). Selection mode = batch action bar.
- **Storage chip (Home + Editor):** `● Local · 48 MB · Saved 2:14 PM` / `◐ Saving…` / `● Pending — folder offline` / `● Read-only` / `● Offline · no network needed` (shown once).

### 11.10 Export wizard

Modal (880×700 over 60% scrim), step rail `Scope · Format · Destination`:
- **Scope:** This sheet / Selected (n) / All (n), live count + size estimate, per-sheet checkbox list.
- **Format:** PDF (multi-page, one page/sheet, **fit-to-photo**, 1×/2×/3×) vs PNG (one/sheet, zip by default). Naming template with token buttons + live filename preview + conflict policy.
- **Destination:** resolved path in mono (default `<project>/exports/<timestamp>/`), remember-per-project.
- **Result:** success check, path, `Copy path`, `Export again`, `Done`, + the Dropbox line. Errors per-file with per-file retry.

### 11.11 System status & safety

- **Autosave chip** (the trust anchor replacing Save): Saved / Saving / Pending-offline / Read-only / Error+Retry. Never icon-only, never optimistic. Tap → **History flyout** (snapshots every 10 min + before each destructive action; restore).
- **Undo/redo** (§8.3): 100 in-memory / 20 persisted; ink coalesced; style edits coalesced 600ms; each undo toasts its action name.
- **Destructive policy** (§8.5, §13 table in UI spec): recoverable = toast + undo; irreversible = hold-to-confirm dialog (initial focus on Cancel, `Esc` cancels). Sheet delete → 14-day `.trash/`.
- **Toasts:** single-instance, bottom-center, 8s (10s with undo), never stack.

### 11.12 Accessibility & field ergonomics (requirements)

- WCAG 2.2 AA: 4.5:1 text, 3:1 UI. Sunlight mode = token-level theme (#000/#FFF ≈21:1, 64px floor, no fades).
- Dual-outline canvas text (`paint-order: stroke; stroke: rgba(11,14,18,.85)` 4px halo behind fill).
- 2px minimum hairlines; targets 56px (rail/style) / 64px (keypad/shutter/dialog) / 48px floor; 8px gap.
- Pen hover drives tooltips/erase preview. Handedness mirrors rail side, style panel, loupe offset, keypad, toolbar anchor (from the Windows pen setting).
- Full keyboard operability (`:focus-visible` rings, logical tab order, arrow-nudge 1px/10px, direct typing into keypad). Screen reader: `aria-label` naming tool + current style; accessible object tree mirroring Layers.
- Pen-to-ink ≤16ms; tool-swap ≤100ms; audio off by default; offline-correct (no CDN/telemetry).

---

## 12. Repository layout

```
field-measure/
├─ README.md
├─ docs/
│  ├─ preflight-handoff.md         # this file
│  ├─ ui-spec-field-measure.md     # UI/UX spec (authoritative on look & feel)
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
│  │            tools/  shapes/
│  ├─ export/   pdf.ts  png.ts  filenames.ts
│  ├─ state/    appStore.ts  editorStore.ts  styleByTool.ts
│  ├─ ui/       ProjectList.tsx  ProjectView.tsx  SheetEditor.tsx  ToolRail.tsx
│  │            StylePanel.tsx  DimensionKeypadSheet.tsx  ExportWizard.tsx
│  │            LayersPanel.tsx  CameraFlow.tsx  strings.ts
│  └─ settings/ handedness.ts  units.ts  theme.ts  density.ts
└─ tests/  units.test.ts  geometry.test.ts  snapping.test.ts  e2e/editor.spec.ts
```

All user-visible text lives in `src/ui/strings.ts`.

---

## 13. Build plan (slices)

Build in order. Do not start a slice until the previous slice's "done when" passes **on a real Surface with a pen** (mouse-only testing misses the important bugs). Each slice leaves the app usable.

### 0.1 — Scaffold
**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `.github/workflows/ci.yml`, `public/icons/*`, `src/main.tsx`, `src/App.tsx`.
**Do:** Vite + React 18 + TS; install and pin the fixed deps (§2.2); Vitest + Playwright; vite-plugin-pwa (manifest + service worker precaching app shell + fonts + icons; **do not cache user photos**); CI = typecheck + test + build.
**Done when:** the app URL loads in Edge; "Install app" works; reload in airplane mode still opens the app.

### 0.2 — Input spike (do this before any UI)
**Files:** `src/editor/inputRouter.ts`, a throwaway test canvas.
**Do:** pen/touch/mouse classification, palm window (1.2s), `touch-action:none`, pointer capture, pinch-zoom in `touchmove`, coalesced events.
**Done when:** pen draws a line; finger pans; no palm smudges; ink ≤16ms perceived. **This is the highest-risk part of the product — spike it first.**

### 1.1 — Domain core
**Files:** `src/domain/{types,schema,units,geometry,snapping,ids}.ts`, `tests/{units,geometry,snapping}.test.ts`.
**Do:** everything in §3, §4, §6. Fully unit-tested.
**Done when:** the tests in §6.1 pass plus your own edge cases; schema round-trips example JSON in §3.5/§3.6.

### 1.2 — Storage core
**Files:** `src/fs/{projectStore,backend}.ts`, `src/data/storage.ts`.
**Do:** FSA backend (pick root, persist handle, verifyPermission, reconnect), OPFS backend, tmp+rename atomic write, read-validate-recover, cleanStaleTmp, two-tab guard, flush-on-pagehide.
**Done when:** create a project → a folder appears on disk; kill-switch during a write → no corruption on reload; a corrupted `project.json`/`markup.json` auto-recovers from `.history/`.

### 1.3 — Photo on canvas
**Files:** `src/media/{normalizeImage,exif}.ts`, `src/editor/EditorCanvas.ts`, `src/ui/SheetEditor.tsx`.
**Do:** import + normalize (EXIF bake, 4096px, JPEG), show it, pan/zoom/fit, thumbnails (§7.3).
**Done when:** a 12MP phone photo opens upright and zooms smoothly on a Surface Go; 20-photo import doesn't crash.

### 1.4 — Dimension tool (flagship)
**Files:** `src/editor/tools/DimensionTool.ts`, `src/editor/Loupe.ts`, `src/editor/history.ts`, `src/ui/DimensionKeypadSheet.tsx`, `src/editor/shapes/`.
**Do:** pen A→B + loupe + ft-in keypad + live parse + label + select/move-endpoints/delete + undo/redo (§8.5).
**Done when:** 4 dims in <60s (gloves off), 90s (gloves on); cancel keeps the stroke; Chain works.

### 1.5 — Markup tools
**Files:** `src/editor/tools/{SelectTool,AngleTool,ShapeTool,FreehandTool,TextTool}.ts`, shapes renderers.
**Do:** line, arrow, rect, ellipse, polygon, freehand, highlighter, text, angle (§8.5); selection handles, grouping, locking, layers panel (§8.6).
**Done when:** every tool draws with the pen, is selectable and undoable; highlighter renders below other markup.

### 1.6 — Image insets
**Files:** `src/editor/tools/InsetTool.ts`, inset rendering (Konva.Group + clip).
**Do:** insert flow, transform, Focus mode, nested markup (one level), asset dedupe (§8.5, §5).
**Done when:** an inset scales/rotates; markup inside clips and moves with it; Focus breadcrumb works.

### 1.7 — Style system
**Files:** `src/state/styleByTool.ts`, `src/ui/StylePanel.tsx`, presets IO.
**Do:** Style Chip, palette, width/fill/transparency/line-style/arrowheads, per-tool memory, recents, presets (`presets.json`), selected-vs-tool rule (§11.5).
**Done when:** swap tools + restyle in <2s without losing flow; selection edits apply to selection + tool default.

### 1.8 — Export
**Files:** `src/export/{pdf,png,filenames}.ts`, `src/ui/ExportWizard.tsx`.
**Do:** flatten PDF + PNG(+zip), naming + sanitize + conflict policy, destination + result (§9, §11.10).
**Done when:** PDF/PNG open correctly; filenames safe; per-file error retry works.

### 1.9 — Safety & polish
**Files:** autosave chip, history flyout, `.trash/`, toasts, sunlight mode.
**Do:** §11.11, §11.12 (a11y), §8.3 (persisted undo).
**Done when:** reboot Surface → nothing lost; corrupted file → recovered; sunlight mode legible outdoors.

### 2.0 — Field pilot
**Do:** 2 people, 1 week, real jobs, side-by-side with their current tool. Write go/no-go + top 5 fixes.

**Explicitly out of v1 (deferred):** vector-overlay PDF, reference calibration, laser meters, metric UI (keep the seam), radial menu (barrel-button-only), rulers/guides, auto-enhance, import-project-bundle, sheet templates, dimensions-summary page.

---

## 14. Test plan

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | units parse/format, geometry, snapping, schema round-trip, filename sanitization |
| Component | Vitest + Testing Library | keypad live-parse preview, toolbar active states, style panel mixed/indeterminate states |
| E2E | Playwright | open app → import fixture photo → draw a dimension with synthetic pen PointerEvents → reload → confirm persisted → export PDF → non-empty |
| Field | Humans | gloves, bright sun (contrast), 8h offline, battery drain, 50-photo project, pen+touch palm rejection |

**The two highest-stakes pure modules are snapping and ft-in parsing** — a bug there is a wrong measurement on a job site. Give both extensive unit tests.

---

## 15. Rules for the AI builder

1. Build slices in order (§13). No slice until the prior slice's "done when" passes on a real Surface with a pen.
2. **Never add:** servers, databases, sign-in, analytics/telemetry, cloud SDKs (Dropbox/OneDrive/Google/Graph), Bluetooth/device code, AI features, service-worker caching of user photos.
3. Runtime dependencies are fixed (§2.2). `crypto.randomUUID()` for ids — no `uuid` package.
4. **Do not use react-konva.** The canvas is the imperative `EditorCanvas` (Konva.Stage/Layer/Shape). React renders only the chrome around it.
5. **Coordinates are working-image pixels; style sizes are markup units (mu).** Never store screen pixels in any data file. `strokeScaleEnabled: false` for strokes; text `fontSize = fontSizeMu` (not `scale(1/s)`).
6. **All disk writes go through `src/fs/projectStore.ts`.** Never call `createWritable()` anywhere else. Use the tmp+rename atomic pattern (§5.3).
7. **Validate** `project.json` and `markup.json` with zod on load and before save; run `schemaVersion` migrations per file; recover from `.history/` on parse failure; never silently overwrite.
8. **Store canonical mm + entered text**; format ft-in only at render (§6.1). The drawn dimension line is visual; the value is typed (v1).
9. **Keep raw freehand input points** in `markup.json` — never store the derived/smoothed path.
10. All user-visible text lives in `src/ui/strings.ts`.
11. When something is unspecified, choose the simplest behavior consistent with the non-negotiables (§11.6), and add one line to `docs/DECISIONS.md`.
12. **Honor the "do not simplify" list (§11.6).** Flattening a deliberate design decision is a bug, not a simplification.
13. **Storage integrity first** (§17 R1): the top risk is losing a day of field work. Test with a kill-switch mid-write.
14. **Snapping and ft-in parsing get real unit tests** — a bug there is a wrong measurement on a job site.
15. Sanitize export filenames (§9.4). "Open folder"/"Show in Explorer" is impossible from a PWA — approximate with `showDirectoryPicker({startIn})` or Copy path.

---

## 16. Decisions log

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | App type | PWA (Edge on Windows 11) | One codebase, installable, offline, no store |
| D2 | Canvas | Imperative Konva (not react-konva) | Full control over pen/touch, hit-testing, export; React only for chrome |
| D3 | Persistence | File System Access API → per-project folder (OPFS fallback) | "Local folder per project" is the product; no DB |
| D4 | On-disk layout | Per-sheet `markup.json` sidecars | Write granularity, corruption blast radius, fast project listing |
| D5 | Coordinates | Image pixels + markup units (mu) | Stable, device-independent style sizing |
| D6 | Canonical value | millimeters + entered text | No rounding drift; ft-in is a display concern |
| D7 | PDF | `@cantoo/pdf-lib`, flatten-only v1 | `pdf-lib` unmaintained; vector overlay deferred |
| D8 | Measuring | Typed values only (v1) | Matches the tape/typed workflow; calibration is a future seam |
| D9 | Storage fallback | OPFS only (idb-keyval only for the handle) | Two fallbacks = three storage modes to build/test |
| D10 | Laser | `source` field only, no interface/device code | YAGNI until a real meter exists |
| D11 | Sharing | Manual Dropbox drag | Company already uses Dropbox; no cloud SDKs |
| D12 | Inset nesting | One level, children inline, inset-local coords | Teachable, correct clipping/transform |
| D13 | Erase stroke mode | Split at raw input points | Vector-safe; avoids polygon-boolean scope explosion |

---

## 17. Risks and mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Storage integrity** — crash/power-loss corrupting a day's work | Critical | tmp+rename atomic writes, validate-on-load, snapshot auto-recovery, kill-switch test |
| R2 | **Pen/touch input pipeline** — palm rejection, pinch vs pan vs draw, ink latency | High | Input spike first (§13, 0.2); `pointerType` routing, `touch-action:none`, coalesced events |
| R3 | **Freehand erase + export fidelity** — splitting smoothed strokes; PDF text mismatch | High | Split at raw input points (no polygon-boolean); flatten-only PDF; ASCII-composed ft-in text |
| R4 | File System Access permission rehydration on cold start | Medium | `verifyPermission()` at session start; "Reconnect folder" UX; OPFS fallback |
| R5 | Memory on 8GB Surface Go with big photos | Medium | Working copies ≤4096px; worker decode; lazy thumbnails; few Konva layers |
| R6 | EXIF sideways photos | Medium (if ignored) | Bake orientation at import (§7.1) |
| R7 | Two Surfaces editing the same Dropbox folder | Low (excluded) | Document as unsupported; store `updatedAt` + content hash to warn on mismatch, never auto-merge |
| R8 | Dependency drift (lucide-react 1.x, immer 11.x, zod 4 breaking changes) | Low | Pin exact versions; read migration guides at pin time |

---

## 18. Open questions

1. **Calibration timing** — v1 is typed-value-only (A4/D8). Confirm the drawn line should *not* auto-compute a length until reference-scale calibration ships later.
2. **Metric** — imperial default with a clean seam; confirm metric isn't needed at launch (it affects the keypad's fraction chips).
3. **GPS / site address** — GPS stripped by default. Confirm whether a *typed* site-address field belongs in project/sheet meta for reporting.
4. **Sheet templates** — not in scope; the preset system carries most of that value. Confirm.

---

*End of handoff. Build order in §13; data model in §3; reference code in §5–§9; UI authority in `docs/ui-spec-field-measure.md`; decisions in §16.*
