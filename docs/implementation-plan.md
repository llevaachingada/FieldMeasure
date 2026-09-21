# Field Measure — Implementation Plan (v1.0)

**Derived from:** `docs/preflight-handoff-v0.3-hardened.md` §13 (slice spec) + §2.4 (scope authority),
after adversarial review rounds 1 and 2. This plan is the **execution order**: it adds per-slice
checkpoints, machine-checkable gates, and on-device verification steps to the spec's slices. The spec
remains the authority on *what* to build; this plan is the authority on *order and done-ness*.

**Reading rules for the builder:**
1. Do not start a slice until the previous slice's **Gate** passes. Gates are checkable — run them, don't eyeball them.
2. Each slice's **Spec refs** point into the build spec (§ numbers) — build exactly that, no more.
3. Anything unspecified → simplest behavior consistent with spec §11.6 + one line in `docs/DECISIONS.md`.
4. If a gate fails in a way the spec doesn't cover, **stop and record it** in `docs/DECISIONS.md` before improvising.

---

## Dependency graph (why this order)

```
0.1 scaffold ──▶ 0.2 input spike ──▶ 0.3 first-run/settings/Home shell
   │                                        │
   │         1.1 domain core (pure; no deps on UI) ──▶ 1.2 storage core
   │                                              │
   └──────────────────────────────────────────────┴──▶ 1.3 photo on canvas
                                                             │
                                        1.4 capture flow ◀────┘ (needs 1.3's sheet UI + 0.2's device caps)
                                                             │
                                        1.5 dimension tool ◀──┘ (needs loupe/handedness from 0.3, geometry from 1.1)
                                                             │
                                        1.6 markup tools ────┘
                                                             │
                                        1.7 insets ──────────┘
                                                             │
                                        1.8 style system ───┘
                                                             │
                                        1.9 export ──────────┘ (needs everything renderable)
                                                             │
                                        1.10 safety & polish ▾
                                                             │
                                        2.0 field pilot
```

Hard ordering constraints (violating any of these re-creates a review finding):
- **0.2 before any canvas UI** — palm/pen/touch is the highest product risk (spec R2).
- **0.3 before 1.5** — the loupe consumes handedness; the Home shell is where projects are created,
  which 1.2's gate needs.
- **1.1 before 1.2** — storage validates with the zod schema; and 1.1's keypad table is the
  wrong-measurement guard.
- **1.3 before 1.4/1.5** — capture and dimension tools render into the sheet canvas 1.3 creates.
- **1.9 after 1.8** — export renders with final style rules; testing it mid-style-system wastes the
  export-invariance gate.

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

---

## Phase 0 — Foundation

### Slice 0.1 — Scaffold
**Spec refs:** §2.2 (stack, pins, CSP, notices), §12 (repo layout), §13/0.1.

**Tasks**
1. Fix `package.json`: `"type": "module"`, real scripts (`dev`, `build`, `test`, `e2e`, `typecheck`), exact pins per §2.2 (already installed — verify against the lockfile).
2. `vite.config.ts` (React plugin + `vite-plugin-pwa`: manifest, precache app shell + fonts + icons; **never cache user photos** — no runtime caching of `blob:`/user files).
3. `tsconfig.json` (strict).
4. `src/main.tsx`, `src/App.tsx` (placeholder screen), `public/icons/*` (original placeholders OK), `src/ui/strings.ts` (empty string table, real from here on).
5. Serve the CSP from §2.2 (header or meta).
6. `THIRD-PARTY-NOTICES.md` — every runtime dep's license (MIT/BSD notice text). CI checks it exists.
7. `.github/workflows/ci.yml`: `npm ci` → typecheck → vitest → build.

**Gate (all must pass)**
- [ ] `npm run build` succeeds; `npm run dev` serves in Edge.
- [ ] "Install app" works; after install, **reload in airplane mode still opens the app** (SW precache). [Surface]
- [ ] `THIRD-PARTY-NOTICES.md` exists and names all 11 runtime deps.
- [ ] CI green on push.

### Slice 0.2 — Input spike (throwaway canvas; do before any UI)
**Spec refs:** §8.2 (hardened router), §13/0.2, A7.

**Tasks**
1. `src/editor/inputRouter.ts` exactly per §8.2: `classify`, `notePenEvent`, `penStrokeStart/End`, palm window 1200 ms refreshed by **every** pen event, touch ignored **during active pen strokes**.
2. Throwaway test canvas: pen draws, finger pans, 2-finger pinch zooms (pivot = midpoint), coalesced events feed ink.
3. `touch-action: none` + `user-select: none` on the surface; pointer capture; abort ink on `pointercancel`.
4. **Device caps report:** enumerate `getUserMedia` video capabilities on the target Surface (also torch/flip behavior); record the real max resolution — slice 1.4's toggle labels come from these numbers (spec A7/R9). Write the numbers into `docs/DECISIONS.md`.

**Gate**
- [ ] Pen draws a line; finger pans; pinch zooms around the midpoint. [Surface]
- [ ] **Palm gauntlet:** draw a stroke > 1.2 s with a palm resting on the glass mid-stroke — no pan, no zoom, no stray ink. [Surface]
- [ ] Ink appears ≤ 16 ms perceived (draw fast and watch; use the browser's frame stats if in doubt). [Surface]
- [ ] Pull the pen out of range mid-drag → `pointercancel` → stroke aborts cleanly (no partial commit). [Surface]
- [ ] Device caps recorded in `docs/DECISIONS.md`.

### Slice 0.3 — First-run, Settings, Home shell
**Spec refs:** §13/0.3 (new), UI spec §4.4 (first-run), §11.9 (Home), §10 stores.

**Tasks**
1. `src/ui/FirstRun.tsx`: two steps — handedness (plain question, Right default; **no Windows-setting claim**) and projects folder (`showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' })`, suggest `Documents\FieldMeasure`).
2. Persist handedness + settings in idb-keyval (settings store: handedness, units/precision, theme, density).
3. `src/ui/Settings.tsx` (minimal: handedness, units/precision, theme, density).
4. `src/state/appStore.ts` per spec §10.
5. `src/ui/ProjectList.tsx` shell: empty state + card grid reading **placeholder data** (real scanning lands with 1.2); states per UI spec §11.1.

**Gate**
- [ ] First run completes in < 20 s; both steps land on Home.
- [ ] Handedness persists across reload and is visible in Settings.
- [ ] Home renders the honest empty state (`«Projects are just folders…»`).
- [ ] Airplane-mode reload still works (no new network deps crept in).

---

## Phase 1 — Core (each slice leaves the app usable)

### Slice 1.1 — Domain core (pure, fully tested)
**Spec refs:** §3 (types/schema), §4 (coordinates), §6 (units/geometry/snapping/ids), §6.1.1 (keypad).

**Tasks**
1. `src/domain/{types,schema,units,geometry,snapping,ids}.ts` — exactly per spec §3.3/§3.4/§6.
2. Keypad model per §6.1.1: `KeypadState`, `pressDigit`, `pressDot` (numerator slot, denominator unchanged), `composeEnteredText` (the 8-case compose table), `keypadValueInches`, `parseLooseToSlots` returning `{ slots, rawDecimal }`.
3. `formatInchesOnly` (inches-only format) + `formatLength` with `unitFormat`.
4. Tests: `units.test.ts` + `keypad.test.ts` — the spec's full test tables verbatim, plus:
   - the **value round-trip property test** (500 random slot combos: composed text → strict parser → same value),
   - the compose table,
   - v0.2-file tolerance (extra `label` keys stripped; missing `unitFormat` normalized to `ft-in`).
5. Schema round-trips the example JSON in §3.5/§3.6 (and **rejects** screen-pixel data or missing `schemaVersion`).

**Gate**
- [ ] `npx vitest run` green, including the property test with **value** assertions (not just parseability).
- [ ] **Trace check (pick 5 by hand):** `12 6` → 150 in; `12 6 3` → 150 3/16 in; `10'-4 1/2"` → 124.5 in; `124.5` → 124.5 in; `1/2"` → 0.5 in. Any disagreement → stop and check against the spec's verified table (§6.1.1 was execution-verified in review round 2).

### Slice 1.2 — Storage core
**Spec refs:** §5 (all), §13/1.2.

**Tasks**
1. `src/fs/backend.ts` (interface + `chooseBackend`), `FsaBackend`, `OpfsBackend`.
2. `src/fs/projectStore.ts`: `initStore` (query only), `pickRoot` (gesture), `writeAtomic` (tmp→close→move, string|Blob), `writeJsonAtomic`, `readJsonValidated` (MaybePromise parse), `cleanStaleTmp(dir, projectId)` (**lock-held + 5-min age**), flush-on-`pagehide`/`visibilitychange`, per-project Web Lock + BroadcastChannel (`fm:project:<id>`), `.history/_project/` + `<sheetId>/` snapshots (20/200 MB caps, oldest-first), truncated-photo detection.
3. Wire Home to real storage: scan root folder → project cards (identity by `project.json` id, never folder name); create/open project.
4. Kill-switch test harness (Playwright + CDP or manual): crash mid-write.

**Gate**
- [ ] Create a project → folder appears on disk with `project.json`.
- [ ] **Kill-switch ×3:** power-loss mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → reload: previous file intact, no `*.tmp` survivors, autosave chip reaches Saved. [Surface]
- [ ] Corrupt `project.json` **and** `markup.json` by hand → both auto-recover from `.history/`.
- [ ] Truncate `photo.jpg` by hand → load shows `«Photo damaged — markup preserved…»` state, markup intact.
- [ ] Two tabs, same project → second is read-only. **Two tabs, different projects → both writable.**
- [ ] Explorer-rename the project folder mid-session → identity survives (card still opens after Locate/repick).

### Slice 1.3 — Photo on canvas
**Spec refs:** §7.1–7.3 (media), §8.1 (EditorCanvas), §4.2 (screen scaling), §13/1.3.

**Tasks**
1. `src/media/normalizeImage.ts` (+ sha256), `src/media/exif.ts` (capture time before normalize; GPS stripped).
2. `src/editor/EditorCanvas.ts` per §8.1: 5 layers, `Konva.pixelRatio` per §8.1.1 (photo 1, markup/overlay `min(dpr,2)`).
3. `src/ui/SheetEditor.tsx`: import photo → normalize → render; pan/zoom/fit; **§4.2 screen rules** (strokes `strokeScaleEnabled:false`; test marks with `fontSize = fontSizeMu / s` reset on every zoom change).
4. `src/media/thumbnails.ts`: 640×480 composite, 3-s debounce, atomic write.

**Gate**
- [ ] A 12MP phone photo opens upright (EXIF baked) and zooms 0.25×–8× smoothly on a Surface Go. [Surface]
- [ ] 20-photo import doesn't crash (memory watch). [Surface]
- [ ] **Zoom constancy screenshot-diff at 1×/4×/8×:** test stroke + label width constant in CSS px, geometry scales. (This validates §4.2 screen rules before 4 more slices build on them.)
- [ ] EXIF: exported/normalized photo contains no GPS (verify in Explorer file properties). [Surface]

### Slice 1.4 — Capture flow
**Spec refs:** §11.8, UI spec §10.1, A7/R9 (device caps from 0.2), §13/1.4.

**Tasks**
1. `src/ui/CameraFlow.tsx`: full-bleed viewfinder; toggles (torch/grid/level/flip; **resolution label from 0.2's measured caps**); tap-to-focus; shutter; review (Retake · Rotate · Use photo — **no auto-enhance**).
2. `enumerateDevices` + `deviceId` picker + `ondevicechange`; never rely on `facingMode`.
3. Capture → normalize → atomic write `sheets/<n>/photo.jpg` → sheet appears. Failure → keep in memory + `«Save a copy…»`.
4. Camera-unavailable panel with the OS privacy-setting note; Windows Camera app as the high-res path.

**Gate**
- [ ] Capture → review → Use → sheet on disk (verify file), thumbnail appears.
- [ ] Kill the app mid-capture-write → no partial photo on disk (tmp cleaned); sheet absent or intact, never half-written. [Surface]
- [ ] Camera-denied → fallback panel with the exact fallback copy.
- [ ] Resolution toggle shows the device's **real** max (matches the 0.2 report).

### Slice 1.5 — Dimension tool (flagship)
**Spec refs:** §8.5 Dimension, §8.4 (loupe), §8.3 (history), §6.1.1 (keypad), UI spec §8.1, §13/1.5.

**Tasks**
1. `src/editor/Loupe.ts` (zero-delay, edge-aware, handedness-aware, tracks B).
2. `src/editor/tools/DimensionTool.ts`: A→B, snapping (20 screen px), angle snap chips, live label (derived, dual-outline), collision rule (140 px/36 px leader).
3. `src/ui/DimensionKeypadSheet.tsx`: **slot state machine from 1.1** wired to keys (digits, `.` = numerator slot, ft/in toggles with hint chip, fraction chips edit the **project** precision + confirm chip, `«← /16»` cycle); preview = pure function of slots; hardware buffer → `parseLooseToSlots`; **Enter disabled on null value**.
4. `src/editor/history.ts` (command pattern, 100 steps, coalescing per §8.3).
5. Select/move-endpoints/delete/undo/redo; Chain; cancel-keeps-geometry with the `«tap to enter value»` ghost label.

**Gate**
- [ ] **Keypad truth table (on-device, hardware keys):** `12 6` + Enter → label `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact; `Esc`/`✕`/canvas-tap keeps the stroke with ghost label. [Surface]
- [ ] 4 dims < 60 s (gloves off), < 90 s (gloves on). [Surface]
- [ ] Chain starts the next dimension locked at B.
- [ ] **Change project precision 1/16 → 1/2 → every existing label re-derives** (no stored labels anywhere).
- [ ] Undo/redo toasts name the action.

### Slice 1.6 — Markup tools
**Spec refs:** §8.5 (Line/Arrow/Rect/Ellipse/Polygon/Freehand/Highlighter/Text/Angle/Erase), §8.6 (layers), §13/1.6.

**Tasks**
1. Shape tools (shared drag-to-size pattern, hold-400 ms constraint), angle tool (vertex-first, commit sheet), text tool (`fontSize = mu / s`), freehand (**local `getSvgPathFromStroke`; `size = strokeWidthMu / s`, regenerate on zoomend**), highlighter (multiply, auto z-below), erase (object + stroke-scope split at raw points), selection handles/grouping/locking, layers panel.
2. Every tool undoable; hit slop + `hitStrokeWidth` per §8.1.

**Gate**
- [ ] Every tool draws with the pen, is selectable, movable, undoable. [Surface]
- [ ] Highlighter renders below dimensions/shapes/ink on the same sheet.
- [ ] **Ink zoom constancy:** draw a stroke at 100%, zoom to 8× — ink width unchanged in CSS px (regeneration works).
- [ ] Angle tool: commit sheet shows `≈ 43.2°`-style readout, complement/supplement chips, chain.

### Slice 1.7 — Image insets
**Spec refs:** §8.5 Inset (coordinate model!), UI spec §9, §13/1.7.

**Tasks**
1. `InsetTool`: insert flow (camera/choose/recents), cascade multi-insert, default placement 40% sheet width.
2. Rendering per the **pinned coordinate model**: group at `(x,y)` + `rotation`, scale = placed/crop, `clipFunc` crop rect, **asset image at `(-crop.x, -crop.y)`**, children in asset px.
3. Manipulation: corner scale (aspect-locked), edge = crop window, rotate snap, two-finger pinch/rotate on inset; style panel (border/opacity/radius/crop/replace/shadow).
4. Focus mode (breadcrumb, dims 35%, Inset tool disabled with tooltip); nesting one level enforced.
5. Asset dedupe by content hash; **children belong to annotations, not assets**.
6. Replace photo: identical dims → swap; different dims → the warned dialog (hold-to-confirm on Remove markup).

**Gate**
- [ ] **Child round-trip test (the B3 acceptance):** inset → child dimension inside → scale ×2 + move crop window + rotate 30° → save → reload → child lands at the same **visual** point on the photo content. [Surface]
- [ ] Crop-window move: children stay glued to the photo content (they do not slide with the window).
- [ ] Focus: draw inside clips; draw outside renders above all insets; Esc exits with selection unchanged.
- [ ] Replace photo with different dimensions → the warned dialog, markup preserved or removed **per the user's explicit choice only**.
- [ ] Two insets from the same asset → independent children.

### Slice 1.8 — Style system
**Spec refs:** §11.5, UI spec §7, §13/1.8.

**Tasks**
1. `styleByTool` store; Style Chip (WYSIWYG 96×40 SVG); palette + custom + eyedropper (nudge-for-contrast); width scrubber/ladder; fill/transparency; line style; arrowheads; per-tool contextual controls (incl. **project-level precision + unit format** with the confirm chip).
2. Presets (`.fieldmeasure/presets.json`, atomic write) + recents (8, deduped, tool-filtered).
3. Selected-vs-tool rule (edits selection AND tool default; indeterminate mixed states; disabled-not-hidden incompatible controls; scope chip).
4. Style editor sheet (720×640, 60% scrim); folder-unavailable warn strip + session-only styles.

**Gate**
- [ ] Swap tools + restyle in < 2 s without losing flow (per-tool memory returns the last style). [Surface]
- [ ] Mixed selection renders indeterminate; a change applies to all and clears it.
- [ ] Precision control edits the **project** value (change it → labels re-derive, chip confirms).
- [ ] Presets persist to `presets.json` and survive reload; travel with the folder.

### Slice 1.9 — Export
**Spec refs:** §4.2 export rules, §9, §11.10, §13/1.9.

**Tasks**
1. `src/export/filenames.ts` — hardened sanitizer (reserved chars/devices, trailing dots/spaces, 48/120/240-char caps, `untitled` fallback) + conflict policy; test table incl. `CON`, `foo .`, over-length names.
2. Offscreen export stage per §4.2: scale M, `pixelRatio 1`, strokes `mu × M`, text `fontSize = mu` (**no counter-scale**), ink `size = mu`; **one sheet at a time, free each bitmap**.
3. `src/export/pdf.ts` (page pt = `imagePx × 0.75`, embed 96×M dpi, cover the page); `src/export/png.ts` (1×/2×/3×, fflate zip default).
4. `src/ui/ExportWizard.tsx`: Scope/Format/Destination (**2× default**, 3× low-RAM warning, no flatten/summary checkboxes — always flattened), live filename preview, result view with `Copy path` + `«Reveal folder»` + the Dropbox line; per-file errors + retry.

**Gate**
- [ ] **Export-invariance test (the B1 acceptance):** export the same sheet at 1×/2×/3× → in each PDF, a 4-mu stroke and an 18-mu label measure **identical physical units** (Acrobat measuring tool), and page size = imagePx × 0.75 pt. [Surface]
- [ ] PNG ×3 opens at the expected pixel dimensions; zip contains all sheets.
- [ ] Filenames: `CON`, `foo .jpg`, 300-char titles all produce valid, non-colliding files on Windows.
- [ ] 50-sheet project exports on a Surface Go **at 2×** without a tab crash; 3× shows the warning. [Surface]
- [ ] Conflict policy Add(1) doesn't overwrite; Overwrite asks nothing (it's the chosen policy).

### Slice 1.10 — Safety & polish
**Spec refs:** §11.11, §11.12, §8.3, §13/1.10.

**Tasks**
1. Autosave chip (all 5 states, never optimistic, tap → History flyout with snapshot restore).
2. `.trash/` + prune + **restore UI** (Project ⋯ → Trash…); destructive policy (toast+undo vs hold-to-confirm, initial focus on Cancel).
3. Toasts (single instance, 8s/10s, never stack).
4. Sunlight/Dim themes (token-level); a11y pass per §11.12 (focus rings, aria labels incl. tool+style, accessible object tree, arrow nudge).

**Gate**
- [ ] **Reboot test:** edit → 5 min idle → reboot Surface → reload: nothing lost; chip reaches Saved. [Surface]
- [ ] Corrupted file → recovered (re-verify after all the new write paths).
- [ ] Trash: delete sheet → 14-day clock → restore returns it with markup.
- [ ] Sunlight mode legible outdoors (spot-check on a real porch/vehicle). [Surface]

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
sizes differing across M, inset child moving when only the inset transforms.