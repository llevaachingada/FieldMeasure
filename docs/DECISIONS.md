# Decisions (ADR log)

One entry per architectural decision. Add a line here whenever you make a decision the spec doesn't
already cover (see build spec §15, rule 11).

**Canonical spec:** `docs/preflight-handoff-v0.3-hardened.md` (v0.3, hardened after adversarial
review). Its **§2.4 v1 scope table** is the single authority on what ships in v1.

Status: **Accepted** · Superseded · Proposed.

## Decision index

| # | Decision | Choice | Status |
|---|---|---|---|
| D1 | App type | PWA (Edge / Windows 11) | Accepted |
| D2 | Canvas engine | Imperative Konva (not react-konva) | Accepted |
| D3 | Persistence | File System Access API → per-project folder (OPFS fallback) | Accepted |
| D4 | On-disk layout | Per-sheet `markup.json` sidecars | Accepted |
| D5 | Coordinates | Image pixels + markup units (mu) | Accepted |
| D6 | Canonical length | Millimeters + entered text | Accepted |
| D7 | PDF | `@cantoo/pdf-lib`, flatten-only v1 | Accepted |
| D8 | Measuring | Typed values only (v1) | Accepted |
| D9 | Storage fallback | OPFS only; idb-keyval for the handle only | Accepted |
| D10 | Laser | `source` field only (no device code) | Accepted |
| D11 | Sharing | Manual Dropbox drag | Accepted |
| D12 | Inset nesting | One level, inline children, inset-local coords | Accepted |
| D13 | Erase stroke mode | Split at raw input points | Accepted |
| D14 | Runtime versions | Node 24 LTS / React 19.3 / TS 7.0.2 / +fflate | Accepted |
| D15 | Repo docs | README + INDEX + CONTINUITY + DECISIONS + UNITS | Accepted |

## Detail

### D2 — Imperative Konva, not react-konva
React renders only the chrome (top bar, tool rail, style panel, overlays). The canvas is an imperative
`EditorCanvas` class driving `Konva.Stage`/`Layer`/`Shape`. Rationale: full control over pen/touch
input, hit-testing, layer strategy, and export. **Do not introduce react-konva.**

### D3 — File System Access API, per-project folder
The device filesystem is the database. The user picks a root folder once; each project is a folder on
disk. All disk writes (JSON **and** binary: photos, assets, thumbs, exports) go through
`src/fs/projectStore.ts` using tmp → close → rename. Recap: `FileSystemFileHandle.move()` is shipped in
Chromium (POSIX overwrite, M109+) and is used for atomic rename; **`FileSystemDirectoryHandle.move()` is
not available** — project rename only rewrites `project.title`. Loads are zod-validated with
`.history/` snapshot recovery (including `.history/_project/` for `project.json`).

### D4 — Per-sheet `markup.json` sidecars (not one big `project.json`)
Write granularity matches edit granularity; corruption blast radius is one sheet; project listing never
parses ink. `project.json` holds only meta + sheet order + defaults. `label` is **derived-only** (never
persisted) so precision/unit changes can't leave stale labels.

### D5 / D6 — Image-pixel geometry, markup-unit styles, mm-canonical lengths
Geometry stores image pixels of the fixed working photo. Style sizes are markup units. **Export scaling
(corrected in v0.3):** strokes `strokeWidth = mu × M`; text `fontSize = mu` (no counter-scale); freehand
`getStroke size = mu`; PDF page pt = `imagePx × 0.75`; embed at `96 × M` dpi — so physical stroke/font
is `0.75 × mu` pt at every multiplier M. Lengths store canonical mm plus the raw entered text; ft-in is a
display concern only.

### D7 — Flatten-only PDF in v1
Vector-overlay PDF is deferred (fontkit, fraction glyphs, dash mapping). Flattening keeps labels crisp and
is universally readable. `pdf-lib` is unmaintained → `@cantoo/pdf-lib`.

### D8 — Typed values only in v1
The drawn dimension line is visual; the user types the real tape/laser value. Reference-scale calibration
(photo-derived lengths) is deferred; `Sheet.calibrationPxPerFoot` remains the future seam.

### D12 — Inset child coordinate space (corrected in v0.3; hardened session 3)
Children are stored in the **inset asset's working-image pixels**. Crop is a rect in asset px applied
*before* the group transform; children are never rewritten when the inset is transformed.

> **Session-3 hardening:** at render time both the asset image AND every child are offset by
> `(-crop.x, -crop.y)` in group-local space (group-local origin = the crop window's top-left). A child
> stored at asset px `(cx, cy)` renders at `(cx - crop.x, cy - crop.y)` — the same offset as the image —
> so children stay glued to the photo content when the crop window moves. The v0.3 text said "children
> at their true asset-space positions"; read literally, that mis-aligns children for non-zero `crop.x/y`.

### D14 — Runtime versions (2026-09-21)
Installed via winget + npm, 0 vulnerabilities:

- **Runtime:** react / react-dom `19.3.0`, konva `10.6.0`, zustand `5.0.15`, immer `11.1.18`,
  zod `4.6.5`, idb-keyval `6.3.0`, @cantoo/pdf-lib `2.11.1`, perfect-freehand `1.2.3`,
  lucide-react `1.47.0`, fflate `0.8.3`.
- **Dev:** vite `8.3.0`, @vitejs/plugin-react `6.1.1`, typescript `7.0.2`, vitest `5.0.1`,
  @playwright/test `1.63.0`, vite-plugin-pwa `1.3.0`.
- **Notes:** the spec's older "React 18" reference is superseded — actual is React 19.3. TypeScript 7
  vs 5.x to be confirmed at scaffold. `perfect-freehand` does **not** export `getSvgPathFromStroke`
  (a local helper is specified). Install with `npm ci` against the committed lockfile.

## Review-driven corrections (v0.3, 2026-09-21)

The adversarial review produced these corrections (findings B1–B5, M1–M13, Minors 1–6), all now folded
into the canonical docs:

- **B1** Export/DPI math redefined (see D5/D6).
- **B2** Keypad input is a slot state machine + lenient tokenizer (`parseLooseToSlots`) over the strict
  parser: `12 6` → `12'-6"` (150 in), `12 6 3` → `12'-6 3/16"`. Round-2: the composed text is
  property-tested (500 combos) to round-trip the strict parser to the same value.
- **B3** Inset child coordinate space defined (see D12).
- **B4** New **§2.4 v1 scope table** — the definitive in/deferred/cut list.
- **B5** `FileSystemDirectoryHandle.move()` removed; `FileSystemFileHandle.move()` confirmed (see D3).
- **M1** All disk writes use tmp→close→`move()`; truncated-photo detection at load.
- **M2** zod `.nullish()` on optional fields; guarded `JSON.parse`; `.history/_project/` recovery.
- **M3** Per-project two-tab lock + BroadcastChannel (`fm:project:<id>`).
- **M4** Input router: palm window refreshed by every pen event; touch ignored during an active pen
  stroke; single-finger pan default.
- **M5** `label` is derived-only (removed from the schema).
- **M6** Handedness is a plain first-run question (the Windows pen setting isn't readable from a page).
- **M7** Replace-photo rules; sheet-card "Rotate" cut from v1.
- **M8** Capture resolution shows the device's real max.
- **M9** Build plan gains slices 0.3 (first-run/settings/Home) and 1.4 (Capture).
- **M10** Persisted undo = `.history` snapshots (one mechanism).
- **M11** Precision is project-level; `unitFormat` added.
- **M12** `lucide-react` pinned for chrome; 14 tool glyphs are bespoke SVG.
- **M13** `fflate` added to the fixed runtime deps (PNG zip).
- **Minors** filename sanitizer hardened; export at 2× default with memory guidance; CSP + license
  notices; exact pinning (`npm ci`); trash restore UI; `THIRD-PARTY-NOTICES.md` required.

## Session 3 — plan verification & flush-out (2026-09-21)

Adversarial verification of `docs/implementation-plan.md` against the canonical specs, then flush-out of
the plan into per-slice build packets. Findings were fixed **in the spec first, then propagated to the
plan** — the two never left disagreeing:

- **Inset child `-crop` offset (real defect — spec §8.5 + D12).** Round 2 fixed the asset image's
  `(-crop.x, -crop.y)` offset but left "children at their true asset-space positions." Hand-traced: with
  crop `{x:600, y:0, …}` on a 2400×1800 asset, a child stored at asset px `(120,200)` rendered at
  group-local `(120,200)` aligns with asset px `(720,200)` — children detach from the photo content when
  the crop window moves. **Fix:** children render at `(cx - crop.x, cy - crop.y)`, the same offset as the
  image; group-local origin = the crop window's top-left. (Independently re-derived by an oracle review.)
- **Inset rotation pivot (spec §8.5).** The spec said "rotation around the placed rect's center" while
  placing the `Konva.Group` at the top-left `(x, y)` — Konva rotates about its own origin, so the two
  disagreed. Fixed: set the pivot explicitly (`group.offset({ x: crop.width/2, y: crop.height/2 })` in
  **LOCAL crop-window units, NOT placed units**, paired with `group.position({ x: x + width/2, y: y + height/2 })`),
  or wrap in a parent group at the placed-rect center carrying the rotation.
- **Inset hit-test `+crop` (spec §8.5 + §8.1).** The inverse group transform lands in group-local
  (crop-window) space, not asset space — `asset = local + crop`. Fixed both hit-testing notes (§8.1 and §8.5).
- **Property-test count 200 → 500.** Spec §13/1.1 and §14 said "200 random slot combos"; the
  execution-verified §6.1.1 code loops `i < 500` and the plan already said 500. Corrected the two spec
  references so no builder under-tests the keypad value round-trip.
- **Plan dependency graph fixed.** Now draws 0.3 → 1.2 (the Home shell hosts project creation, which
  1.2's gate wires to real storage) and notes that 1.1 (pure) may run in parallel with 0.2/0.3.
- **Re-verified (oracle, 5/5 PASS):** §4.2 export invariant `0.75×mu pt` at every M (M=2: 4 mu → 3 pt,
  18 mu → 13.5 pt); §9.2 page pt = `imagePx × 0.75`; atomic `tmp→close→move()` covers all writes;
  `cleanStaleTmp` is lock-held + 5-min age-gated; per-project lock/`BroadcastChannel`; schema
  `.nullish()`/guarded `parseJson`/`label` absent/`unitFormat` present/v0.2 tolerance.

## Session 3 — UI/UX & layout review (2026-09-21)

Senior adversarial + architecture review of `docs/ui-spec-field-measure-v2-hardened.md` against the
build spec (§2.4 scope, §11, §8) and UNITS/DECISIONS. Findings fixed in the UI spec (the subordinate doc):

- **Rail customization drift (UI §6.5 + §15).** "Rail side (…Bottom…)", "Pin order", and "Quick Pair"
  were UI-spec-only features absent from §2.4 and build §11.4. "Bottom" directly contradicts the build
  spec's "the tool rail never moves" (§11.4) and "do not simplify #1" (vertical rail, not a bottom bar).
  Deferred all three with a 〔v1 scope〕 marker: v1 rail side = handedness only (§5.1/§14.8); no manual
  override, no bottom rail, no drag-to-pin, no Quick Pair.
- **Camera resolution label (UI §10.1).** Copy read `«High (device max: <MP>)»` — the `<MP>` placeholder
  contradicted the attached "do not promise sensor megapixels" note (A7) and build §11.8's
  `«High (device max)»`. Corrected to `«High (device max)»` (measured resolution, never the sensor MP).
- **Aspect-ratio rationale arithmetic (UI §2).** "~37% vs a full side style panel" did not reproduce:
  full side panel (280 px) → canvas 1032×908 → photo 1032×688 ≈ 0.71M px², vs rail 1.03M px² = **~44%**.
  Corrected to ~44% with the arithmetic shown in-place.
