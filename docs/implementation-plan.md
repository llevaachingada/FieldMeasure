# Field Measure — Implementation Plan (v1.1 — flushed out)

**Derived from:** `docs/preflight-handoff-v0.3-hardened.md` §13 (slice spec) + §2.4 (scope authority),
after adversarial review rounds 1, 2, and the session-3 flush-out. This plan is the **execution
order**: it adds per-slice files, numbered build order, signatures at point of use, inline test
tables, and checkable gates to the spec's slices. The spec remains the authority on *what* to build;
this plan is the authority on *order and done-ness*.

**Reading rules for the builder:**
1. Do not start a slice until the previous slice's **Gate** passes. Gates are checkable — run them, don't eyeball them.
2. Each slice's **Spec refs** point into the build spec (§ numbers) — build exactly that, no more.
3. Anything unspecified → simplest behavior consistent with spec §11.6 + one line in `docs/DECISIONS.md`.
4. If a gate fails in a way the spec doesn't cover, **stop and record it** in `docs/DECISIONS.md` before improvising.
5. **Signatures** below are restated at the point of use from the spec's reference code — the spec
   section holds the full code; do not re-copy it into this plan. Build to the spec, not to this summary.
6. **Numeric expectations you add** must be hand-derived in a comment — round 2 caught a wrong
   committed number that had survived review. Every test value below shows its arithmetic.

**Open items deliberately left to slices (do not "solve" them now — see brief §8):**
- **Device caps report** — filled by slice 0.2 on real hardware; feeds 1.4's resolution-toggle labels.
- **TypeScript 7 vs 5.x** — confirmed at slice 0.1 scaffold time (DECISIONS D14 note).
- **`Konva.pixelRatio` downgrade on Surface Go** — measured in slice 1.3 (spec §8.1.1).
- **Metric-at-launch / typed site-address / sheet templates** — human product questions (CONTINUITY "Open questions"); the plan assumes no answer.

---

## Dependency graph (why this order)

```
0.1 scaffold ──▶ 0.2 input spike ──▶ 0.3 first-run / settings / Home shell ─┐
   │                                                                       │
   └──▶ 1.1 domain core (pure; no UI) ──▶ 1.2 storage core ◀───────────────┘
                                            │  (1.2 needs 1.1's schema + 0.3's Home shell)
                                            ▼
                                        1.3 photo on canvas
                                            │
                                            ▼
                                        1.4 capture flow   ◀── (0.2 device caps + 1.3 sheet UI)
                                            │
                                            ▼
                                        1.5 dimension tool ◀── (0.3 handedness + 1.1 keypad + 1.3 canvas)
                                            │
                                            ▼
                                        1.6 markup tools
                                            │
                                            ▼
                                        1.7 insets
                                            │
                                            ▼
                                        1.8 style system
                                            │
                                            ▼
                                        1.9 export         ◀── (everything renderable)
                                            │
                                            ▼
                                        1.10 safety & polish
                                            │
                                            ▼
                                        2.0 field pilot
```

Hard ordering constraints (violating any of these re-creates a review finding):
- **0.2 before any canvas UI** — palm/pen/touch is the highest product risk (spec R2).
- **0.3 before 1.2 and 1.5** — the Home shell (0.3) is where projects are created, which 1.2's gate
  wires to real storage; the loupe (1.5) consumes handedness (0.3).
- **1.1 before 1.2** — storage validates with the zod schema; and 1.1's keypad table is the
  wrong-measurement guard.
- **1.3 before 1.4/1.5** — capture and dimension tools render into the sheet canvas 1.3 creates.
- **1.9 after 1.8** — export renders with final style rules; testing it mid-style-system wastes the
  export-invariance gate.

> **Parallelism note:** 1.1 (pure domain, no UI) could be started as soon as 0.1 lands, in parallel
> with 0.2/0.3. The plan sequences it after 0.3 for a linear story, but a team may run 1.1 alongside
> 0.2/0.3 with no dependency risk — 1.1 touches only `src/domain/` and `tests/*.test.ts`.

---

## Verification discipline (applies to every slice)

- **Unit tests:** `npx vitest run` — all green before any gate.
- **Typecheck:** `npx tsc --noEmit` — zero errors.
- **Build:** `npm run build` — succeeds.
- **On-device:** the gates below marked **[Surface]** require a real Surface with a pen (mouse-only
  testing misses the input bugs — spec §13).
- **Never delete a failing test to make a gate pass.** If a spec-provided test expectation is wrong
  (it happened once: the `12 6 → 148` bug), fix the spec expectation with a traced calculation in
  `docs/DECISIONS.md`, then fix the test.
- **`[Surface — pending]`:** a gate that needs hardware you don't have is marked, not deleted.

---

## Phase 0 — Foundation

### Slice 0.1 — Scaffold
**Spec refs:** §2.2 (stack, pins, CSP, notices), §12 (repo layout), §13/0.1.

**Purpose:** a pinned, CI-checked, offline-installable PWA shell with zero app features. This is the
only slice where `package.json` (still npm-init defaults) is fixed.

**Files (each = one responsibility):**
- `package.json` — `"type": "module"`, real scripts, **exact pins** (no `^`/`~`) per §2.2.
- `package-lock.json` — commit as-is; do not hand-edit; `npm ci` installs from it.
- `vite.config.ts` — React plugin + `vite-plugin-pwa` (manifest, precache app shell + fonts + icons; **never cache user photos** — no runtime caching of `blob:`/user files).
- `tsconfig.json` — strict mode; resolve `src/*` imports.
- `src/main.tsx` / `src/App.tsx` — mount + placeholder screen (nothing domain-specific).
- `src/ui/strings.ts` — empty string table; **all** user-visible text lives here from now on.
- `public/icons/*` — original placeholder icons (not third-party).
- `THIRD-PARTY-NOTICES.md` — every runtime dependency's license (MIT/BSD notice text); CI checks it exists.
- `.github/workflows/ci.yml` — `npm ci` → typecheck → vitest → build.

**Build order (literal):**
1. Rewrite `package.json`: `"type": "module"`; scripts `dev`/`build`/`preview`/`test`/`e2e`/`typecheck`; strip the caret ranges so each runtime+dev dep is an exact pin (§2.2). **Confirm TypeScript 7 vs 5.x here** (DECISIONS D14: TS `7.0.2` was installed — if the toolchain rejects it, pin the latest 5.x and record the choice in DECISIONS). Run `npm install` to regenerate the lockfile, then commit it.
2. `vite.config.ts`: `@vitejs/plugin-react` + `vite-plugin-pwa` with a `manifest` (name, icons, `display: standalone`, `start_url`) and `workbox` precaching the app shell, both fonts (woff2), and icons. **No** `runtimeCaching` entry that could capture `blob:` URLs or user files.
3. `tsconfig.json`: `strict: true`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, paths alias `@/* → src/*`.
4. `src/main.tsx` + `src/App.tsx`: minimal React 19 root + placeholder. `src/ui/strings.ts` exports an empty `const STRINGS = {} as const`.
5. `public/icons/*` placeholders (PNG + SVG, any original art — will be replaced later, never third-party).
6. Serve the CSP from §2.2 (meta tag in `index.html` or a dev/middleware header). CSP string (verbatim): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.
7. `THIRD-PARTY-NOTICES.md`: one section per runtime dep (§2.2's 11: react, react-dom, konva, zustand, immer, zod, idb-keyval, @cantoo/pdf-lib, perfect-freehand, lucide-react, fflate) with its license + notice text.
8. `.github/workflows/ci.yml`: `npm ci` → `npx tsc --noEmit` → `npx vitest run` → `npm run build`; a step asserting `THIRD-PARTY-NOTICES.md` exists.

**Signatures:** none (no domain code yet). The only "API" is the pinned dep list + CSP string, both from §2.2.

**Tests:** none required yet — CI's typecheck/build/test steps are the check. (A trivial `vitest` smoke test that `STRINGS` is importable is acceptable but optional.)

**Gate (all must pass)**
- [ ] `npm run build` succeeds; `npm run dev` serves in Edge.
- [ ] "Install app" works; after install, **reload in airplane mode still opens the app** (SW precache). [Surface]
- [ ] `THIRD-PARTY-NOTICES.md` exists and names all 11 runtime deps.
- [ ] CI green on push.

**Rollback:** this slice is config-only — revert the config files. If a pin fails to resolve, check the lockfile against the installed `node_modules`; do not silently widen a pin (that's a DECISIONS change).

### Slice 0.2 — Input spike (throwaway canvas; do before any UI)
**Spec refs:** §8.2 (hardened router), §13/0.2, A7.

**Purpose:** de-risk the pen/touch/palm pipeline and measure real device camera caps **before** any
product UI depends on either.

**Files:**
- `src/editor/inputRouter.ts` — the hardened classifier (production code, kept).
- `src/editor/spike.tsx` (throwaway) — a bare canvas wired to the router; deleted at end of slice.
- `docs/DECISIONS.md` — append the **device caps report** (real `getUserMedia` max, torch/flip behavior).

**Build order:**
1. `src/editor/inputRouter.ts` exactly per §8.2 — `classify`, `notePenEvent`, `penStrokeStart/End`, palm window 1200 ms refreshed by **every** pen event, touch ignored **during active pen strokes**.
2. Throwaway canvas: pen draws, finger pans, 2-finger pinch zooms (pivot = pinch midpoint), `getCoalescedEvents()` feeds ink.
3. Surface CSS: `touch-action: none; user-select: none`; `setPointerCapture` on `pointerdown`; **abort ink on `pointercancel`**.
4. **Device caps report:** `enumerateDevices()` + `getUserMedia` track constraints on the target Surface; record the real max resolution (not the sensor MP) + torch/flip availability into `docs/DECISIONS.md` (feeds 1.4's toggle labels).

**Signatures (from §8.2):**
```ts
export type InputIntent = 'draw' | 'navigate' | 'ignore';
export function createInputRouter(palmWindowMs = 1200): {
  notePenEvent(): void;              // feed EVERY pen pointer event (down AND move)
  penStrokeStart(): void;
  penStrokeEnd(): void;
  classify(e: PointerEvent, now?: number): InputIntent;
  onPenHover(e: PointerEvent): void; // pointerType==='pen' && no buttons → hover affordances
};
```

**Tests (unit, pure — Vitest with synthetic PointerEvent-shaped objects):**
| Case | Expected |
|---|---|
| `pointerType:'pen'` (down/move) | `'draw'`, and `lastPenAt` refreshes |
| `pointerType:'touch'` within 1200 ms of a pen event | `'ignore'` (palm) |
| `pointerType:'touch'` > 1200 ms after last pen event, no active stroke | `'navigate'` |
| `pointerType:'touch'` while `penStrokeActive` (stroke > 1.2 s) | `'ignore'` — the window must NOT re-open |
| `pointerType:'mouse'` | `'draw'` |
| `pointercancel` during a stroke | stroke aborts, no partial commit |

**Gate (all must pass)**
- [ ] Pen draws a line; finger pans; pinch zooms around the midpoint. [Surface]
- [ ] **Palm gauntlet:** draw a stroke > 1.2 s with a palm resting on the glass mid-stroke — no pan, no zoom, no stray ink. [Surface]
- [ ] Ink appears ≤ 16 ms perceived (draw fast and watch; use the browser's frame stats if in doubt). [Surface]
- [ ] Pull the pen out of range mid-drag → `pointercancel` → stroke aborts cleanly (no partial commit). [Surface]
- [ ] Device caps recorded in `docs/DECISIONS.md`.

**Rollback:** fix the router forward (it's pure and unit-tested). The spike canvas is throwaway — if the router is wrong, the unit table above pins the bug before any UI consumes it.

### Slice 0.3 — First-run, Settings, Home shell
**Spec refs:** §13/0.3 (new), UI spec §4.4 (first-run), §11.9 (Home), §10 (stores).

**Purpose:** the two first-run steps + a Home shell so that handedness exists **before** the loupe
(1.5) and a project-creation surface exists **before** storage (1.2).

**Files:**
- `src/ui/FirstRun.tsx` — two steps (handedness; projects folder). Must complete < 20 s.
- `src/ui/Settings.tsx` — minimal: handedness, units/precision, theme, density.
- `src/settings/handedness.ts` / `units.ts` / `theme.ts` / `density.ts` — typed read/write helpers over idb-keyval.
- `src/state/appStore.ts` — zustand store per §10 (projects list, currentProject/Sheet, storageStatus, theme, density, handedness, unitSystem/Format, precision).
- `src/ui/ProjectList.tsx` — Home shell: empty/loading/error states + card grid on **placeholder data** (real scanning lands with 1.2), per UI §11.1.
- `src/ui/strings.ts` — all new copy (handedness question, empty-state line `«Projects are just folders…»`, etc.).

**Build order:**
1. `src/settings/*`: idb-keyval-backed get/set for handedness (`'right'|'left'`, default right), unitSystem (`'imperial'`), unitFormat (`'ft-in'`), precisionDenominator (16), theme (`'standard'`), density (`'field'`).
2. `src/state/appStore.ts` per §10: state shape + actions (no persistence queue yet — that's 1.2).
3. `src/ui/FirstRun.tsx`: step 1 handedness = a **plain question** (`«Which hand do you write with?»`, Right pre-selected — **no Windows-setting claim**, spec M6/D18); step 2 projects folder = `showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' })` with a suggested `Documents\FieldMeasure` (use `startIn: 'documents'`; show the resolved path in mono). Persist the handle in idb-keyval.
4. `src/ui/ProjectList.tsx`: empty state (`«Projects are just folders on this PC. Pick one and everything saves into it.»`), loading (6 skeleton cards), and card grid reading placeholder data — per UI §11.1 states.
5. `src/ui/Settings.tsx`: read/write the `settings/*` helpers + appStore.
6. Wire FirstRun → Settings → Home routing; land on Home after first run.

**Signatures (from §10):**
```ts
// src/state/appStore.ts
interface AppState {
  projects: ProjectSummary[];          // { id, title, sheetCount, thumbPath, path, status }
  currentProjectId: string | null;
  currentSheetId: string | null;
  storageStatus: 'ok' | 'pending' | 'readonly' | 'offline' | 'error';
  theme: 'standard' | 'sunlight' | 'dim';
  density: 'field' | 'desk';
  handedness: 'right' | 'left';
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  precisionDenominator: number;
  // … actions (create via zustand)
}
```

**Tests:** component tests for FirstRun (two steps, Right default, auto-advance) and Settings round-trip (set handedness → reload → persisted).

**Gate (all must pass)**
- [ ] First run completes in < 20 s; both steps land on Home.
- [ ] Handedness persists across reload and is visible in Settings.
- [ ] Home renders the honest empty state (`«Projects are just folders…»`).
- [ ] Airplane-mode reload still works (no new network deps crept in).

**Rollback:** fix forward within the slice. If `showDirectoryPicker({ id })` behaves unexpectedly on the target Edge build, record it in DECISIONS and fall back to `showDirectoryPicker({ mode: 'readwrite' })` (drop the `id`), keeping the persisted-handle flow.

---

## Phase 1 — Core (each slice leaves the app usable)

### Slice 1.1 — Domain core (pure, fully tested)
**Spec refs:** §3 (types/schema), §4 (coordinates), §6 (units/geometry/snapping/ids), §6.1.1 (keypad).

**Purpose:** every pure module the rest of the app depends on, exhaustively unit-tested **before** any
UI or I/O consumes it. No DOM, no I/O, no Konva.

**Files:**
- `src/domain/types.ts` — `UUID`, `Px`, `AnnotationType`, `AnnotationStyle`, `Geometry`, `Annotation`, `Sheet`, `Project`, `UnitFormat`, `DEFAULT_STYLE` (§3.3).
- `src/domain/schema.ts` — zod 4 schemas + `parseJson` + `parseProjectFile`/`parseMarkupFile` (§3.4).
- `src/domain/units.ts` — strict parser, formatters, keypad slot model (§6.1 + §6.1.1).
- `src/domain/geometry.ts` — `pixelDistance`, `angleDeg`, `readableAngleDeg`, `rotatePoint`, `midpoint`, `pointInRect` (§6.2).
- `src/domain/snapping.ts` — `SnapTarget`, `snapPoint`, `snapAngle` (§6.3).
- `src/domain/ids.ts` — `newId()` (§6.4).
- `tests/units.test.ts`, `tests/keypad.test.ts`, `tests/geometry.test.ts`, `tests/snapping.test.ts`, `tests/schema.test.ts`.

**Build order:**
1. `types.ts` → `ids.ts` → `geometry.ts` → `snapping.ts` (no interdependency beyond `types`).
2. `units.ts` (§6.1 strict parser + formatters, then §6.1.1 keypad model).
3. `schema.ts` (§3.4) — zod 4; read its migration guide first (`safeParse` returns a union; single `error` param; `.nullish()` on optional-with-null).
4. Wire `schema.ts` to `types.ts` so `AnnotationZ: z.ZodType<Annotation>` is the single type source.
5. Write the test files from the tables below + the spec's full §6.1/§6.1.1 tables verbatim.

**Signatures (restated from §6 — full code in spec):**
```ts
// units.ts
export const MM_PER_IN = 25.4;
export function parseImperialToInches(raw: string): number | null;
export function parseMetricToMm(raw: string): number | null;
export function parseLengthToMm(raw: string, system: 'imperial'|'metric'): number | null;
export function formatInches(totalIn: number, denom?: number): string;        // 124.5 → 10'-4 1/2"
export function formatInchesOnly(totalIn: number, denom?: number): string;   // 124.5 → 124 1/2"
export function formatLength(valueMm: number, system: 'imperial'|'metric', denom?: number, unitFormat?: 'ft-in'|'in'|'ft-decimal'): string;

// keypad model (§6.1.1)
export interface KeypadState { feet: string; inches: string; numerator: string; denominator: number; activeSlot: 'feet'|'inches'|'numerator'; inchesMode: boolean; }
export const emptyKeypadState: (denominator: number) => KeypadState;
export function pressDigit(st: KeypadState, d: string): KeypadState;
export function pressDot(st: KeypadState): KeypadState;                       // → numerator slot, denominator UNCHANGED
export function composeEnteredText(st: KeypadState): string;
export function keypadValueInches(st: KeypadState): number | null;
export function parseLooseToSlots(raw: string, denominator: number): { slots: KeypadState; rawDecimal: string | null } | null;

// geometry.ts / snapping.ts / ids.ts
export function pixelDistance(a: Px, b: Px): number;
export function angleDeg(a: Px, v: Px, c: Px): number;
export function readableAngleDeg(a: Px, b: Px): number;
export function rotatePoint(p: Px, origin: Px, degrees: number): Px;
export function midpoint(a: Px, b: Px): Px;
export function pointInRect(p: Px, r: {x:number;y:number;width:number;height:number}): boolean;
export interface SnapTarget { p: Px; kind: 'endpoint'|'vertex'|'corner'; }
export function snapPoint(p: Px, targets: SnapTarget[], threshold: number): { p: Px; hit: SnapTarget | null };
export function snapAngle(deg: number, degThreshold?: number): number;
export const newId: () => string;   // crypto.randomUUID()

// schema.ts
export function parseJson<T>(schema: z.ZodType<T>, raw: string): { success: true; data: T } | { success: false; error: string };
export const parseProjectFile: (raw: string) => { success: true; data: ProjectFile } | { success: false; error: string };
export const parseMarkupFile:  (raw: string) => { success: true; data: MarkupFile } | { success: false; error: string };
```

**Tests (inline — turn into Vitest files; carry the spec's tables verbatim):**

*units.test.ts* — strict parser accepts `10'`→120, `10' 4"`→124, `10'-4 1/2"`→124.5, `10 ft 4 in`→124, `4-1/2`→4.5, `1/2"`→0.5, `124.5`→124.5; **rejects** `abc`, `4 1/0`, ``, `12 6`, `12 6 3`, `.5`. Formatter: `formatInches(124.5)`→`10'-4 1/2"`; `formatInches(11.99)`→`1'-0"` (carry: 11.99×16=191.84→192 ticks=12 in=1 ft); `formatInches(0.5)`→`1/2"`. `formatLength` unit formats: `formatLength(3162.3,'imperial',16,'ft-in')`→`10'-4 1/2"`; `'in'`→`124 1/2"`; `'ft-decimal'`→`10.38'`.

*keypad.test.ts* — the §6.1.1 table verbatim, plus the trace cases:
- `12 6` → 150 in (12×12 + 6 = 150).
- `12 6 3` → 150 + 3/16 = 150.1875 in (denominator = project precision 16).
- `12' 6 3` → same as `12 6 3` (explicit feet + loose numerator).
- `10 ft 4 in` → 124; `4-1/2` → 4.5.
- `124.5` → rawDecimal `'124.5'` preserved, `inchesMode:true`.
- compose table (8 cases) — see spec §6.1.1.
- round-trip: `12' 6 3/8` → compose → `12'-6 3/8"` → strict parses to 150.375 (12×12 + 6 + 3/8 = 150.375).
- `pressDot`: `emptyKeypadState(16)` + `pressDigit('1')`+`pressDigit('2')`+`pressDot()`+`pressDigit('8')` → `12 + 8/16` = 12.5 in.
- **Property test (value round-trip, 500 combos):** random slot combos → `composeEnteredText` → `parseImperialToInches` → equals `keypadValueInches` (not just "parses").

*geometry.test.ts* / *snapping.test.ts* — distance/angle/rotate/midpoint/pointInRect; `snapPoint` threshold, `snapAngle` 0/45/90.

*schema.test.ts* — round-trips the example JSON in §3.5/§3.6 (and **rejects** screen-pixel data or a missing `schemaVersion`); **v0.2-file tolerance**: an object with an extra `label` key parses (zod strips it) and one missing `unitFormat` normalizes to `'ft-in'`; corrupt JSON returns `{success:false}` without throwing.

**Gate (all must pass)**
- [ ] `npx vitest run` green, including the property test with **value** assertions (not just parseability).
- [ ] **Trace check (pick 5 by hand):** `12 6` → 150 in; `12 6 3` → 150 3/16 in; `10'-4 1/2"` → 124.5 in; `124.5` → 124.5 in; `1/2"` → 0.5 in. Any disagreement → stop and check against the spec's verified table (§6.1.1 was execution-verified in review round 2).

**Rollback:** fix forward. If a spec test expectation is wrong, fix the **spec** with a traced calc in DECISIONS, then fix the test — never weaken the test to pass.

### Slice 1.2 — Storage core
**Spec refs:** §5 (all), §13/1.2.

**Purpose:** the atomic, lock-guarded, self-healing persistence layer every later slice writes through.
**All disk writes go through `src/fs/projectStore.ts`** — JSON and blobs alike.

**Files:**
- `src/fs/backend.ts` — `StorageBackend` interface + `FsaBackend` + `OpfsBackend` + `chooseBackend`.
- `src/fs/projectStore.ts` — `initStore`, `pickRoot`, `writeAtomic`, `writeJsonAtomic`, `readJsonValidated`, `cleanStaleTmp`, flush-on-pagehide, per-project Web Lock + BroadcastChannel, history snapshots, truncated-photo detection.
- `src/data/storage.ts` — `ensurePersistentStorage()`.
- `src/ui/ProjectList.tsx` (rewire) — real scan: root folder → project cards (identity by `project.json` id, never folder name); create/open project.

**Build order:**
1. `src/fs/backend.ts`: the `StorageBackend` interface (§5.1) + `FsaBackend` (File System Access) + `OpfsBackend` (`navigator.storage.getDirectory()`) + `chooseBackend()`.
2. `src/fs/projectStore.ts` `initStore` (QUERY permission only — **never** `requestPermission` outside a gesture) + `pickRoot` (gesture) + `writeAtomic`/`writeJsonAtomic`/`readJsonValidated` + `cleanStaleTmp` (lock-held + 5-min age).
3. Per-project lock + BroadcastChannel (`fm:project:<id>`): serialize writes per project; invalidate a second tab on the same project into read-only.
4. `.history/_project/` + `.history/<sheetId>/` snapshots (every 10 min + before destructive actions; 20/200 MB caps, oldest-first) + recovery path in `readJsonValidated`.
5. Truncated-photo detection (§5.3): 0-byte `photo.jpg` or `createImageBitmap` failure → `«Photo damaged — markup preserved…»`, never delete `markup.json`.
6. Flush on `pagehide`/`visibilitychange`.
7. `src/data/storage.ts` `ensurePersistentStorage`.
8. Rewire `ProjectList.tsx`: scan root → cards (id-keyed); create/open; `Locate…`/re-pick with `isSameEntry`.
9. Kill-switch test harness (Playwright + CDP, or manual): crash mid-write.

**Signatures (from §5.1/§5.3/§5.7 — full code in spec):**
```ts
// backend.ts
export interface StorageBackend {
  init(): Promise<void>;
  requestAccess(): Promise<boolean>;
  getProjectDir(): FileSystemDirectoryHandle | null;
  readText(name: string): Promise<string>;
  writeTextAtomic(name: string, text: string): Promise<void>;
  writeBlobAtomic(name: string, blob: Blob): Promise<void>;
  readFile(name: string): Promise<Blob>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}
export function chooseBackend(): StorageBackend;

// projectStore.ts
type MaybePromise<T> = T | Promise<T>;
export async function initStore(): Promise<void>;
export async function pickRoot(): Promise<void>;   // user-gesture only
export async function writeAtomic(dir: FileSystemDirectoryHandle, name: string, data: string | Blob): Promise<void>;
export const writeJsonAtomic: (dir: FileSystemDirectoryHandle, name: string, data: unknown) => Promise<void>;
export async function readJsonValidated<T>(dir: FileSystemDirectoryHandle, name: string, parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>): Promise<T>;
export async function cleanStaleTmp(dir: FileSystemDirectoryHandle, projectId: string): Promise<void>;

// storage.ts
export async function ensurePersistentStorage(): Promise<boolean>;
```

**Tests (mostly scripted/manual — storage is I/O-bound):**
- Atomic write: write → kill mid-`markup.json`, mid-`photo.jpg`, mid-`move()` → reload: previous file intact, no `*.tmp` survivors.
- `cleanStaleTmp` unit (mock `navigator.locks` + a fake dir): a `.tmp` newer than 5 min survives; one older is removed; runs under `fm:project:<id>`.
- Two-tab matrix: same project → second read-only; different projects → both writable.
- Corruption: hand-corrupt `project.json` AND `markup.json` → auto-recover from `.history/`.
- Truncated `photo.jpg` → damaged-photo state, markup intact.

**Gate (all must pass)**
- [ ] Create a project → folder appears on disk with `project.json`.
- [ ] **Kill-switch ×3:** power-loss mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → reload: previous file intact, no `*.tmp` survivors, autosave chip reaches Saved. [Surface]
- [ ] Corrupt `project.json` **and** `markup.json` by hand → both auto-recover from `.history/`.
- [ ] Truncate `photo.jpg` by hand → load shows `«Photo damaged — markup preserved…»` state, markup intact.
- [ ] Two tabs, same project → second is read-only. **Two tabs, different projects → both writable.**
- [ ] Explorer-rename the project folder mid-session → identity survives (card still opens after Locate/repick).

**Rollback:** fix forward. If `FileSystemFileHandle.move()` overwrite semantics differ on the target Edge build, record it in DECISIONS and gate the rename behind a same-directory check (never switch to copy+delete — forbidden, §5.6).

### Slice 1.3 — Photo on canvas
**Spec refs:** §7.1–7.3 (media), §8.1 (EditorCanvas), §4.2 (screen scaling), §13/1.3.

**Purpose:** import → normalize → render with the **§4.2 screen rules** locked in (strokes constant,
text counter-scaled, ink regenerated) — validated here because four more slices build on them.

**Files:**
- `src/media/normalizeImage.ts` — `normalizeImage` + `sha256Hex` (§7.1).
- `src/media/exif.ts` — capture time (before normalize) + GPS strip (§7.2).
- `src/media/thumbnails.ts` — 640×480 composite, 3-s debounce, atomic write (§7.3).
- `src/editor/EditorCanvas.ts` — imperative Konva: 5 layers, pixelRatio per §8.1.1 (§8.1).
- `src/ui/SheetEditor.tsx` — import → normalize → render; pan/zoom/fit; §4.2 screen rules wired.

**Build order:**
1. `normalizeImage.ts` + `sha256Hex` + `exif.ts` (read capture time **before** re-encode strips EXIF; bake orientation via `createImageBitmap(file, { imageOrientation: 'from-image' })`; strip GPS).
2. `EditorCanvas.ts`: `Konva.Stage` + `photoLayer` (listening:false), `insetLayer`, `markupLayer`, `overlayLayer`, `dragLayer`. `Konva.pixelRatio`: photo 1; markup/inset/overlay `Math.min(devicePixelRatio, 2)` (§8.1.1). Pinch-zoom in `touchmove` (not built into Konva), pivot = pinch midpoint.
3. `SheetEditor.tsx`: import → normalize → render; pan/zoom/fit (0.25×–8×, double-tap fit↔100%).
4. **§4.2 screen rules:** strokes `strokeScaleEnabled:false` + `strokeWidth = strokeWidthMu`; text `fontSize = fontSizeMu / s` reset on **every** zoom change; freehand outline `getStroke(..., { size: strokeWidthMu / s })` regenerated on zoomend (throttled during pinch).
5. `thumbnails.ts`: 640×480 composite, decode-in-worker + render on main thread, 3-s debounce, atomic write.

**Signatures (from §7.1/§8.1):**
```ts
// media/normalizeImage.ts
export async function normalizeImage(file: Blob, maxEdge?: number, quality?: number): Promise<{ blob: Blob; width: number; height: number }>;
export async function sha256Hex(blob: Blob): Promise<string>;

// editor/EditorCanvas.ts
export class EditorCanvas {
  stage: Konva.Stage;
  photoLayer: Konva.Layer;   // listening:false
  insetLayer: Konva.Layer;
  markupLayer: Konva.Layer;
  overlayLayer: Konva.Layer;
  dragLayer: Konva.Layer;
  constructor(container: HTMLDivElement);
  // zoom/pan via stage.scale()/stage.position(); pinch via touchmove on stage.container()
}
```

**Tests:**
- `normalizeImage`: 12 MP fixture → ≤4096 px long edge, JPEG, no EXIF/GPS; `sha256Hex` stable.
- **Zoom constancy (the §4.2 screen gate):** render a test stroke (`strokeWidthMu:4`) + label (`fontSizeMu:18`) + freehand stroke at 1×/4×/8×; assert stroke CSS px = 4, glyph CSS px = 18, ink CSS px = 4 at every zoom (screenshot-diff or `getClientRect` measurement).

**Gate (all must pass)**
- [ ] A 12MP phone photo opens upright (EXIF baked) and zooms 0.25×–8× smoothly on a Surface Go. [Surface]
- [ ] 20-photo import doesn't crash (memory watch). [Surface]
- [ ] **Zoom constancy screenshot-diff at 1×/4×/8×:** test stroke + label width constant in CSS px, geometry scales. (This validates §4.2 screen rules before 4 more slices build on them.)
- [ ] EXIF: exported/normalized photo contains no GPS (verify in Explorer file properties). [Surface]

**Rollback:** fix forward. If markup redraw cost on the Surface Go is too high at `pixelRatio = min(dpr,2)`, downgrade overlay-only to 1 and record the measurement in DECISIONS (§8.1.1 — an open item, don't pre-solve).

### Slice 1.4 — Capture flow
**Spec refs:** §11.8, UI spec §10.1, A7/R9 (device caps from 0.2), §13/1.4.

**Purpose:** the camera path (capture → review → atomic write), using the 0.2 device caps for honest
resolution labels. No auto-enhance (§2.4: deferred).

**Files:**
- `src/ui/CameraFlow.tsx` — full-bleed viewfinder + review + write plumbing.
- capture plumbing into `sheets/<n>/photo.jpg` (atomic, via projectStore).

**Build order:**
1. Viewfinder: `getUserMedia` full-bleed; toggles torch/grid/level/flip; **resolution label from 0.2's measured caps** (`«High (device max: …)»`/`«Fast»` — never the sensor MP); tap-to-focus reticle; shutter (88px) + 120ms flash.
2. `enumerateDevices()` + `deviceId` picker + `ondevicechange`; **never rely on `facingMode`** (§11.8).
3. Capture → `normalizeImage` (from 1.3) → **atomic write** `sheets/<n>/photo.jpg` → sheet appears. Write failure → keep in memory + `«Save a copy…»`.
4. Review screen: `Retake · Rotate · Use photo` (no auto-enhance).
5. Camera-unavailable panel with the OS privacy-setting note; Windows Camera app as the high-res path.

**Signatures:** none new beyond Web APIs (`getUserMedia`, `enumerateDevices`, canvas snapshot). The write path reuses 1.2's `writeBlobAtomic`.

**Tests:**
- Capture → normalize → write → file exists on disk; kill mid-write → no partial file (tmp cleaned).
- Camera-denied → fallback panel (exact copy from strings).

**Gate (all must pass)**
- [ ] Capture → review → Use → sheet on disk (verify file), thumbnail appears.
- [ ] Kill the app mid-capture-write → no partial photo on disk (tmp cleaned); sheet absent or intact, never half-written. [Surface]
- [ ] Camera-denied → fallback panel with the exact fallback copy.
- [ ] Resolution toggle shows the device's **real** max (matches the 0.2 report).

**Rollback:** fix forward. If the 0.2 report shows both modes ≈4K, keep the toggle but confirm the label copy in DECISIONS (§18.5 — open item).

### Slice 1.5 — Dimension tool (flagship)
**Spec refs:** §8.5 Dimension, §8.4 (loupe), §8.3 (history), §6.1.1 (keypad), UI spec §8.1, §13/1.5.

**Purpose:** A→B with the loupe + the slot-keypad + derived labels. v1 is **typed-only** — the drawn
line is visual; the value is typed (no `≈`, no calibration).

**Files:**
- `src/editor/Loupe.ts` — zero-delay, edge-aware, handedness-aware, tracks B.
- `src/editor/tools/DimensionTool.ts` — A→B, snapping (20 screen px), angle-snap chips, live derived label (dual-outline), collision rule (140 px/36 px leader).
- `src/ui/DimensionKeypadSheet.tsx` — **slot state machine from 1.1** wired to keys; hardware buffer → `parseLooseToSlots`; Enter disabled on null value.
- `src/editor/history.ts` — command pattern (100 steps, coalescing) (§8.3).
- `src/editor/shapes/` — dimension line renderer (imperative Konva).

**Build order:**
1. `history.ts`: `Command`/`History` (100 steps; ink coalesced; style edits coalesced 600 ms; redo clears on new edit). Undo addresses by `(sheetId, annotationPath)` (incl. `insetId/childId`).
2. `Loupe.ts`: 160 px diameter, ~3.5× of 80×80 source, offset ~112 px up-and-away-from-hand (edge-aware, flips within 24 px of viewport edge), crosshair 12 px gap; tracks moving tip B while pending.
3. `DimensionTool.ts`: A→B commit-on-penup; snap 20 screen px; live label at midpoint with collision rule; cancel-keeps-geometry.
4. `DimensionKeypadSheet.tsx`: keys → `pressDigit`/`pressDot`; fraction chips set denominator (project precision) + move activeSlot; ft/in toggle; **preview = pure function of slots** (`formatLength(keypadValueInches(st) × 25.4, …)`); hardware buffer → `parseLooseToSlots(buffer, project.precisionDenominator)` → `{ slots, rawDecimal }`; Enter commits `valueMm` + `enteredText = rawDecimal ?? composeEnteredText(slots)`; **Enter disabled on null/NaN**.
5. Wire: chain (start next from B), select/move-endpoints/delete, undo/redo, ghost `«tap to enter value»` label on cancel.

**Signatures (from §8.3 + 1.1):**
```ts
// editor/history.ts
export interface Command { do(): void; undo(): void; label: string; }
export class History {
  exec(cmd: Command): void;
  undo(): Command | null;
  redo(): Command | null;
}
// keypad (reused from 1.1): pressDigit, pressDot, composeEnteredText, keypadValueInches, parseLooseToSlots
```

**Tests:**
- Keypad truth table (on-device, hardware keys): `12 6`+Enter → `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact; `Esc`/`✕`/canvas-tap keeps stroke with ghost label.
- History: stroke = one undo step; style-change coalescing; redo clears on new edit.
- Label derivation: change precision 1/16→1/2 → every label re-derives (no stored labels — schema has none).

**Gate (all must pass)**
- [ ] **Keypad truth table (on-device, hardware keys):** `12 6` + Enter → label `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact; `Esc`/`✕`/canvas-tap keeps the stroke with ghost label. [Surface]
- [ ] 4 dims < 60 s (gloves off), < 90 s (gloves on). [Surface]
- [ ] Chain starts the next dimension locked at B.
- [ ] **Change project precision 1/16 → 1/2 → every existing label re-derives** (no stored labels anywhere).
- [ ] Undo/redo toasts name the action.

**Rollback:** fix forward. The keypad is the highest-stakes module — if a trace disagrees with the §6.1.1 table, stop, re-run the table, and fix the spec before the tool.

### Slice 1.6 — Markup tools
**Spec refs:** §8.5 (Line/Arrow/Rect/Ellipse/Polygon/Freehand/Highlighter/Text/Angle/Erase), §8.6 (layers), §13/1.6.

**Purpose:** the rest of the drawing tools + selection + layers. Every tool undoable; ink width
constant across zoom.

**Files:**
- `src/editor/tools/SelectTool.ts` — selection, 8 handles, rotate, marquee, groups, lock, mini-toolbar.
- `src/editor/tools/AngleTool.ts` — vertex-first, commit sheet (`≈ 43.2°`, complement/supplement, chain).
- `src/editor/tools/ShapeTool.ts` — Line/Arrow/Rect/Ellipse/Polygon (shared drag-to-size; hold-400 ms constraint).
- `src/editor/tools/FreehandTool.ts` — freehand + highlighter; hold-to-shape (400 ms).
- `src/editor/tools/TextTool.ts` — `fontSize = fontSizeMu / s`; auto-contrast background.
- `src/editor/tools/EraseTool.ts` — object + stroke-scope (split at raw points).
- `src/editor/shapes/svgPath.ts` — **local** `getSvgPathFromStroke` (NOT exported by perfect-freehand).
- `src/editor/shapes/` renderers — one per geometry kind.
- `src/ui/LayersPanel.tsx` — §8.6 flyout.

**Build order:**
1. `svgPath.ts` (local helper, MIT from steveruizok's recipe) + the freehand renderer: `getStroke(points, { size: strokeWidthMu / stageScale, thinning:.5, smoothing:.5, streamline:.5 })` → `getSvgPathFromStroke(outline, true)` → `Konva.Path` fill, `strokeScaleEnabled:false`. Store raw points, never the derived path.
2. `ShapeTool.ts` (line/arrow/rect/ellipse/polygon) — shared drag-to-size pattern; hold-400 ms constraint; live `W×H`/length readouts.
3. `AngleTool.ts` — vertex-first; commit sheet with `≈ 43.2°` (the Angle tool's honest-readout convention, unrelated to calibration).
4. `TextTool.ts` — tap-to-type, `fontSize = fontSizeMu / s`, auto-contrast background (48×48 sample), leader.
5. `FreehandTool.ts` — pressure/tilt width, hold-to-shape (400 ms + `«⇧ Shape»` chip); highlighter (multiply, 30% alpha, chisel, **auto z-below**).
6. `EraseTool.ts` — object mode + stroke-scope (split at nearest raw points; never a polygon-boolean).
7. `SelectTool.ts` — handles (aspect-locked scale, rotate 0/15/30/45/90), alignment guides, grouping, locking.
8. `LayersPanel.tsx` (§8.6): Dimensions · Shapes · Ink · Text, insets (children indented), photo (lockable, never deletable); 56 px rows; drag-to-reorder; tap-select + pan-to.

**Signatures (key new ones):**
```ts
// editor/shapes/svgPath.ts  (local helper — perfect-freehand does NOT export it)
export function getSvgPathFromStroke(points: number[][], closed?: boolean): string;
// renderer usage:
//   const outline = getStroke(points.map(p => [p.x, p.y, p.pressure ?? 0.5]), { size: strokeWidthMu / stage.scaleX(), thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
//   const d = getSvgPathFromStroke(outline, true);
//   new Konva.Path({ data: d, fill: style.strokeColor, strokeScaleEnabled: false });
```

**Tests:**
- Ink zoom constancy: draw at 100%, zoom to 8× → ink width unchanged in CSS px (regeneration works).
- Highlighter z-band: inserted below all other markup, above photo.
- Angle: `angleDeg` for a right angle → 90; readable angle flips upside-down text.

**Gate (all must pass)**
- [ ] Every tool draws with the pen, is selectable, movable, undoable. [Surface]
- [ ] Highlighter renders below dimensions/shapes/ink on the same sheet.
- [ ] **Ink zoom constancy:** draw a stroke at 100%, zoom to 8× — ink width unchanged in CSS px (regeneration works).
- [ ] Angle tool: commit sheet shows `≈ 43.2°`-style readout, complement/supplement chips, chain.

**Rollback:** fix forward. Freehand is the trickiest — if ink width drifts at zoom, re-check `size = strokeWidthMu / s` and the zoomend regeneration (fills ignore `strokeScaleEnabled`).

### Slice 1.7 — Image insets
**Spec refs:** §8.5 Inset (coordinate model!), UI spec §9, §13/1.7.

**Purpose:** photo-within-photo, nested exactly one level, with the §8.5 coordinate model implemented
correctly (children glued to photo content).

**Files:**
- `src/editor/tools/InsetTool.ts` — insert flow, transforms, Focus mode.
- `src/editor/inset/` — the Konva.Group rendering (scale + clipFunc + asset/child offset).
- `src/ui/ImageInsetPickerSheet.tsx` — camera / choose / recents.

**Build order (the coordinate model is the contract — follow §8.5 exactly):**
1. Insert flow: tap → picker (`Take a photo` / `Choose from device` (multi-select cascades 24 px down-right) / `Recent photos` (4×2 of last 8)). Default placement 40% sheet width, aspect preserved.
2. **Rendering (session-3 hardened):** `Konva.Group` placed so the rect sits at `(x, y)` (top-left, sheet px), `scale = (width/crop.width, height/crop.height)`, `clipFunc(ctx => ctx.rect(0, 0, crop.width, crop.height))`, and **both** the asset image and every child offset by `-crop`. **Rotation pivots on the placed rect's CENTER** — set the pivot explicitly (`group.offset({ x: crop.width/2, y: crop.height/2 })` in LOCAL crop-window units, paired with `group.position({ x: x + width/2, y: y + height/2 })`), or wrap in a parent group at the placed-rect center carrying the rotation:
   ```ts
   group.clipFunc(ctx => ctx.rect(0, 0, crop.width, crop.height));
   assetImage.position({ x: -crop.x, y: -crop.y });
   // every child: node.position({ x: child.x - crop.x, y: child.y - crop.y })  — SAME -crop offset
   ```
   (Group-local origin = crop window top-left. A child stored at asset px `(cx, cy)` renders at `(cx - crop.x, cy - crop.y)` — see DECISIONS D12 session-3. Without the child offset, a crop-window move detaches children from the photo content.)
3. Manipulation: corner scale (aspect-locked), edge = crop window, rotate snap 0/90/180, two-finger pinch/rotate; style panel (border/opacity/radius/crop/replace/shadow).
4. Focus mode: dim outside 35%, breadcrumb `«Sheet 04 › Inset 2»` + `«Done»`; Inset tool disabled inside Focus (`«Nested insets aren't supported»`); one-level nesting enforced. **Hit-testing: container → group-local via the inverse transform, then `+ crop` to asset px** (`asset = local + crop`) — the inverse transform lands in crop-window space, not asset space.
5. Asset dedupe by content hash; **children belong to annotations, not assets** (two insets sharing an asset → independent children).
6. Replace photo: identical dims → swap, keep children; different dims → warned dialog (hold-to-confirm on `Remove markup`).

**Signatures:** none new — the contract is the §8.5 render model above. Reuse 1.1's `Geometry` (`kind:'image'` with `crop`, `flipX/Y`, `opacity`) and `Annotation.children`.

**Tests:**
- **Child round-trip (the B3 acceptance):** inset → child dimension inside → scale ×2 + move crop window + rotate 30° → save → reload → child lands at the same visual point on the photo content.
- Crop-window move: children stay glued (do not slide with the window). Trace: asset 2400×1800, crop {0,0,2400,1800}→{600,0,1200,900}; a child at asset (120,200) renders at group-local (120-600, 200-0)=(-480,200) — clipped out, i.e. glued to asset (120,200), not to screen (120,200).
- Two insets from the same asset → independent children.

**Gate (all must pass)**
- [ ] **Child round-trip test (the B3 acceptance):** inset → child dimension inside → scale ×2 + move crop window + rotate 30° → save → reload → child lands at the same **visual** point on the photo content. [Surface]
- [ ] Crop-window move: children stay glued to the photo content (they do not slide with the window).
- [ ] Focus: draw inside clips; draw outside renders above all insets; Esc exits with selection unchanged.
- [ ] Replace photo with different dimensions → the warned dialog, markup preserved or removed **per the user's explicit choice only**.
- [ ] Two insets from the same asset → independent children.

**Rollback:** fix forward. If a child drifts on crop/rotate, re-check the shared `-crop` offset and the rotation origin — this is the one coordinate model that, if flattened, silently misplaces measurements.

### Slice 1.8 — Style system
**Spec refs:** §11.5, UI spec §7, §13/1.8.

**Purpose:** per-tool style memory, WYSIWYG Style Chip, and the **project-level** precision/unit-format
controls — the one place precision is edited.

**Files:**
- `src/state/styleByTool.ts` — `styleByTool: Record<ToolId, AnnotationStyle>` (tool-swap = return, never reset).
- `src/ui/StylePanel.tsx` — Style Chip (WYSIWYG 96×40 SVG) + contextual controls.
- `src/ui/StyleEditorSheet.tsx` — 720×640 deep editor (60% scrim).
- presets IO → `.fieldmeasure/presets.json` (atomic write).

**Build order:**
1. `styleByTool.ts` store (zustand + immer): per-tool `AnnotationStyle`; selected-vs-tool rule (§11.5).
2. `StylePanel.tsx`: Style Chip (tool icon + live 96×40 SVG of the actual next stroke) always visible; palette (12 swatches + custom + eyedropper "nudge for contrast"); width scrubber/ladder; fill/transparency; line style; arrowheads; per-tool contextual controls.
3. **Precision + unit format** (dimension): edit the **project-level** `precisionDenominator`/`unitFormat` (one source of truth, chip confirms `«Project precision: 1/16»`).
4. Selected-vs-tool rule: mixed → indeterminate; incompatible controls **disabled, not hidden**; scope chip for heterogeneous selection.
5. Presets (`presets.json`, atomic) + recents (8, deduped, tool-filtered).
6. `StyleEditorSheet.tsx` (720×640, 60% scrim) + folder-unavailable warn strip + session-only styles.

**Signatures (from §10):**
```ts
// state/editorStore.ts (extends §10)
interface EditorState {
  activeTool: ToolId;
  styleByTool: Record<ToolId, AnnotationStyle>;
  selection: string[];   // annotation ids (with path context)
  // …
}
```

**Tests:**
- Mixed selection renders indeterminate; a change applies to all and clears it.
- Precision control edits the project value (change it → labels re-derive, chip confirms).
- Presets round-trip `presets.json` (write → reload → restore).

**Gate (all must pass)**
- [ ] Swap tools + restyle in < 2 s without losing flow (per-tool memory returns the last style). [Surface]
- [ ] Mixed selection renders indeterminate; a change applies to all and clears it.
- [ ] Precision control edits the **project** value (change it → labels re-derive, chip confirms).
- [ ] Presets persist to `presets.json` and survive reload; travel with the folder.

**Rollback:** fix forward. If style edits feel slow, cache complex static shapes (`node.cache()`) rather than simplifying the WYSIWYG chip (that's a "do not simplify" item, §11.6).

### Slice 1.9 — Export
**Spec refs:** §4.2 export rules, §9, §11.10, §13/1.9.

**Purpose:** flatten-only PDF/PNG whose physical stroke/font is `0.75 × mu` pt at every multiplier —
the export-invariance gate is the whole slice's acceptance.

**Files:**
- `src/export/filenames.ts` — hardened sanitizer + conflict policy (§9.4).
- `src/export/pdf.ts` — `buildPdf` (page pt = `imagePx × 0.75`) (§9.2).
- `src/export/png.ts` — 1×/2×/3× PNG, zip via `fflate` (§9.3).
- `src/export/renderStage.ts` — the offscreen §4.2 export stage (scale M, pixelRatio 1, strokes `mu×M`, text `mu`, ink `mu`).
- `src/ui/ExportWizard.tsx` — Scope/Format/Destination/Result (§11.10).

**Build order:**
1. `filenames.ts`: sanitize tokens + joined result — strip `<>:"/\|?*` + control chars; reject reserved DOS names (`CON`,`PRN`,`AUX`,`NUL`,`COM1-9`,`LPT1-9`) → prefix `_`; strip trailing dots/spaces; cap tokens 48 / base 120 / full path 240; empty → `untitled`. Conflict policy `Add (1)(2)` (default) / `Overwrite` / `Skip`.
2. `renderStage.ts`: offscreen `Konva.Stage` at scale M, `pixelRatio:1`; **strokes `strokeWidth = mu × M`**; **text `fontSize = mu` (no counter-scale)**; **ink `getStroke size = mu`**. One sheet at a time; free each bitmap before the next.
3. `pdf.ts`: `PDFDocument.create()` → per sheet `embedJpg(jpg)` (camelCase, verified) → `addPage([imagePx×0.75, imagePx×0.75])` → `drawImage` covering the page. Embed at 96×M dpi.
4. `png.ts`: 1×/2×/3× PNG; `zipSync` (fflate) into one `.zip` by default.
5. `ExportWizard.tsx`: Scope/Format/Destination; **2× default**, 3× shows `«Slow on this device — expect a wait»`; no flatten/summary checkboxes (always flattened, §2.4); result view `Copy path` + `«Reveal folder»` (= `showDirectoryPicker({ startIn })`) + the Dropbox line; per-file errors + retry.

**Signatures (from §9.2):**
```ts
// export/pdf.ts
type SheetExport = { jpg: Uint8Array; imageWidthPx: number; imageHeightPx: number };
export async function buildPdf(sheets: SheetExport[]): Promise<Uint8Array>;
// export/png.ts — zipSync from 'fflate'
// export/filenames.ts — sanitizeToken(base: string): string; joinFilename(tokens): string; conflictName(existing: string[], base: string, policy): string;
```

**Tests (the invariance arithmetic is the contract — show it):**
- **Export invariance (unit):** a 4-mu stroke renders `4×M` bitmap px; an 18-mu label `18×M` px; page pt = `imagePx × 0.75`. Derivation: bitmap = `mu×M` px embedded at `96×M` dpi → physical = `(mu×M)/(96×M)` in = `mu/96` in = `mu × 72/96` pt = **`0.75 × mu` pt**. M=2: 4-mu → 8 px @ 192 dpi = 3 pt; 18-mu → 36 px @ 192 dpi = 13.5 pt.
- Filename table: `CON` → `_CON`; `foo .jpg` → `foo.jpg`; 300-char title → truncated to base 120; trailing dots/spaces stripped.
- Conflict: `Add (1)` doesn't overwrite; `Overwrite` doesn't prompt.

**Gate (all must pass)**
- [ ] **Export-invariance test (the B1 acceptance):** export the same sheet at 1×/2×/3× → in each PDF, a 4-mu stroke and an 18-mu label measure **identical physical units** (Acrobat measuring tool), and page size = imagePx × 0.75 pt. [Surface]
- [ ] PNG ×3 opens at the expected pixel dimensions; zip contains all sheets.
- [ ] Filenames: `CON`, `foo .jpg`, 300-char titles all produce valid, non-colliding files on Windows.
- [ ] 50-sheet project exports on a Surface Go **at 2×** without a tab crash; 3× shows the warning. [Surface]
- [ ] Conflict policy Add(1) doesn't overwrite; Overwrite asks nothing (it's the chosen policy).

**Rollback:** fix forward. If a physical measurement disagrees across M, re-check the §4.2 rules (text must NOT be counter-scaled at export; strokes `mu×M`; embed 96×M) — the invariant is the spec, not the code.

### Slice 1.10 — Safety & polish
**Spec refs:** §11.11, §11.12, §8.3, §13/1.10.

**Purpose:** autosave chip, history flyout, trash + restore, toasts, themes, a11y — the trust layer.

**Files:**
- Autosave chip + History flyout (top bar) — all 5 states, never optimistic.
- `.trash/` + prune + restore UI (Project ⋯ → `Trash…`).
- Toasts (single instance, 8 s / 10 s-with-undo, never stack).
- Sunlight/Dim themes (token-level) + a11y pass (§11.12).

**Build order:**
1. Autosave chip: Saved / Saving / Pending-offline / Read-only / Error+Retry; reflects the write promise's resolution only; tap → History flyout (snapshot restore = whole-sheet).
2. `.trash/`: delete sheet → `.trash/` (14-day prune on open); restore UI (list + preview + `Restore` + undo toast).
3. Toasts: single-instance, bottom-center, 8 s (10 s with undo), never stack.
4. Sunlight/Dim themes (token-level, not a filter); a11y: focus rings, `aria-label` tool + style, accessible object tree, arrow nudge 1 px/10 px.

**Signatures:** none new — wiring of the §11.11/§11.12 states.

**Tests:**
- Reboot test (on-device): edit → 5 min idle → reboot → reload → nothing lost, chip Saved.
- Corruption → recovered (re-verify after all new write paths).
- Trash restore: delete → 14-day clock → restore returns sheet with markup.

**Gate (all must pass)**
- [ ] **Reboot test:** edit → 5 min idle → reboot Surface → reload: nothing lost; chip reaches Saved. [Surface]
- [ ] Corrupted file → recovered (re-verify after all the new write paths).
- [ ] Trash: delete sheet → 14-day clock → restore returns it with markup.
- [ ] Sunlight mode legible outdoors (spot-check on a real porch/vehicle). [Surface]

**Rollback:** fix forward. Do not weaken the destructive policy (recoverable = toast+undo; irreversible = hold-to-confirm) — it's a "do not simplify" item.

### 2.0 — Field pilot
**Spec refs:** §13/2.0.

**Do:** 2 people, 1 week, real jobs, side-by-side with their current tool. Write go/no-go + top 5 fixes into `docs/CONTINUITY.md`.

---

## Checkpoint summary (print this)

| # | Slice | One-line gate | Type |
|---|---|---|---|
| 0.1 | Scaffold | Airplane-mode reload works; CI green | on-device |
| 0.2 | Input spike | Palm gauntlet passes; ≤16 ms ink; caps recorded | on-device |
| 0.3 | First-run/Home | <20 s first run; handedness persists | on-device |
| 1.1 | Domain | Property test green; 5 hand-traces match | machine |
| 1.2 | Storage | Kill-switch ×3 clean; two-tab matrix; corruption auto-recovers | on-device |
| 1.3 | Photo canvas | Zoom constancy diff at 1×/4×/8× | on-device |
| 1.4 | Capture | Kill mid-write clean; real resolution label | on-device |
| 1.5 | Dimension | Keypad truth table; 4 dims <60 s; labels re-derive | on-device |
| 1.6 | Markup | Ink zoom constancy; highlighter z-below | on-device |
| 1.7 | Insets | Child round-trip (scale+crop+rotate+reload) | on-device |
| 1.8 | Style | <2 s restyle; project-level precision confirm | on-device |
| 1.9 | Export | Invariance at 1×/2×/3×; 50-sheet Go export | on-device |
| 1.10 | Safety | Reboot test; trash restore; sunlight legible | on-device |
| 2.0 | Pilot | Go/no-go written | humans |

**Wrong-measurement tripwires (any hit → stop):** keypad trace mismatch, label not re-deriving on
precision change, stale `label` in any JSON file, ink/stroke width changing with zoom, export physical
sizes differing across M, inset child moving when only the inset transforms, inset child detaching when
the crop window moves (the session-3 hardening — children share the image's `-crop` offset).
