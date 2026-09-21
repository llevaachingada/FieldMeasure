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
| D14 | Runtime versions | Node 24 LTS / React 19.3 / **TS 5.x** (was 7.0.2) / +fflate | Accepted |
| D15 | Repo docs | README + INDEX + CONTINUITY + DECISIONS + UNITS | Accepted |
| D21 | Vulgar fractions (`½`, `¼`) | **Not accepted** in v1 — rejected by the parser, commit disables | Accepted |
| D22 | Length domain | **Non-negative**; `0` and `> 1000 ft` are not committable | Accepted |
| D23 | Fraction validity | Denominator ∈ {2,4,8,16,32,64}; numerator **<** denominator; else reject | Accepted |
| D24 | Origin & distribution | **Resolved (§21.1):** static HTTPS host, origin-agnostic `base` (`FM_BASE`), slice 0.1 origin guard | Accepted |
| D25 | Service-worker updates | `registerType: 'prompt'`; never `autoUpdate`; flush queue before reload | Accepted |
| D26 | Asset storage | **Content-addressed**: `assets/<sha256hex>.jpg`, `assetId` = that hash | Accepted |
| D27 | Save pipeline | A dedicated `src/state/persistQueue.ts` owns debounce/serialize/backoff/flush **and** `storageStatus` | Accepted |
| D28 | Export conflicts | Case-folded + NFC-normalized comparison (NTFS is case-insensitive) | Accepted |
| D29 | Accessibility | Per-slice acceptance, not a final slice | Accepted |
| D30 | Loupe geometry | Magnification fixed at 3.5×; `sourcePx = diameterPx / 3.5` | Accepted |
| D31 | Fraction chip vs project precision | **Resolved (§21.2):** chip is entry-scoped; project precision changes only from the style panel | Accepted |
| D32 | Tool rail side | Follows **handedness** (writing-hand side): right-handed default → rail right; left-handed → rail left. No manual override in v1 (already deferred). | Accepted |
| D33 | Width readout unit | Show **true paper points** (`0.75 × mu`): a 4-mu stroke reads "3 pt". Consistent with the §4.2 export invariant. | Accepted |
| D34 | Hosting | Develop + beta-test on **`localhost`** (secure context); production on **GitHub Pages** (public repo). `FM_BASE` + origin guard make the move non-destructive. | Accepted |
| D35 | Input model | **Touch-primary**: touch places and moves; the pen enhances (pressure/tilt/hover). Supersedes M4's pen-first framing. | Accepted |
| D36 | Placement gesture | **Tap-tap is the primary placement verb** for every placement tool; press-drag-release remains supported. | Accepted |
| D37 | One-finger drag | **Object-first** (grabbable, unlocked object moves; else pan). Deliberate choice over selection-first — mitigations are mandatory. | Accepted |
| D38 | Two-finger tap | Secondary path only (add to selection; cancel mid-placement); an on-screen equivalent is mandatory per UI §1.7. | Accepted |
| D39 | Palm rejection | **Probabilistic, not deterministic** without a pen — the router's window only starts on a pen event. Undo + `pointercancel` rollback are the safety net. | Accepted |
| D40 | Canvas testing | Konva tests run in a **real browser** (jsdom has no canvas — hit-testing "passes" without testing it). CSP is enforced **as a test**. | Accepted |
| D41 | Pre-code design tooling | **No design phase.** Playwright is the source of truth; Claude Design is moodboard-only (its output cannot ship under `style-src 'self'`). | Accepted |
| D42 | Contradiction register C11/C12 | C11: `--sel` focus ring vs selection differ by **treatment** (offset ring vs bbox + glow). C12: `--hi` dual-use is **deliberate**; verify legibility on bright/dark photos. | Accepted |
| D43 | Input router (slice 0.2) | Built to **§8.2** (`createInputRouter(o?)` + `noteTouchDown/Up`), not the plan's stale signature block; throwaway `spike.tsx` deferred to hardware | Accepted |
| D44 | Schema §3.4 corrections (slice 1.1) | `unitFormat`/`precisionDenominator` → `.nullish()` (v0.2 tolerance + migrate fill); `fillColor` → `.nullable()`, `children` → `.optional()` (§3.4 as written does not compile) | Accepted |
| D45 | Settings/Home copy gaps (slice 0.3) | Proposed `settings.row*`/`unitSystem*`/`penOnlyHint` keys (⚠ pending approval); path readout = suggested root then handle leaf | Accepted |
| D46 | 0.3 supporting files | `src/settings/projectsRoot.ts` added; `settings/units.ts` imports `UnitFormat` type (read-only) | Accepted |
| D47 | Pen-only semantics | §20.5(b) "ignores touch entirely" reconciled to **§8.2**: touch pans/zooms when placement toggles are off, never places/draws | Accepted |

> **Numbering note (session 4):** D16–D20 are referred to elsewhere (the review handoff says
> "D1–D20") and appear in the Detail sections below, but were never added to this index. Session 4
> numbered from **D21** to avoid colliding with them. Backfilling D16–D20 into the index is a
> housekeeping task for whoever next touches this file.

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
- **Notes:** the spec's older "React 18" reference is superseded — actual is React 19.3. TypeScript
  is pinned to **5.x** for v1 (session 4b, §21.6 — supersedes the "to be confirmed at scaffold" note).
  `perfect-freehand` does **not** export `getSvgPathFromStroke`
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

## Session 4 — senior adversarial & hardening review (2026-09-21)

Full register with evidence: **`docs/review-session-4-hardening.md`**. Method: the specs' reference
code was extracted into a JS runtime and **executed** against its own committed tables, the storage
failure paths were attacked, and the build plan was audited for work no slice owned. Code-level
fixes are marked `SESSION-4 FIX (…)` in the build spec; new normative rules are in **§5.8** and
**§19**; the changelog carries rows 21–38.

**Wrong-measurement defects that survived rounds 1–3** (all executed, not reasoned):

- **F1 — a wrong committed test expectation, again.** §6.1's accepts table asserted
  `10′-4 ½″ → 124.5`; executed it returns `null` (the vulgar fraction is never normalized), and the
  row's own trailing comment already said so. Same class as round 2's `12 6 → 148`. Moved to the
  rejects table (**D21**).
- **F2 — silent sign flip.** `parseImperialToInches('-5')` returned **+5**; `formatInches(-124.5)`
  produced a string that re-parses to **-115.5**. The leading-dash strip (for the `10'-4"`
  separator) ran unconditionally. Lengths are now non-negative (**D22**).
- **F3/F4 — the keypad committed values the user never typed.** `Enter` was gated on null/NaN only,
  so a bare `0` committed a 0″ dimension; `12 6 20` committed **151.25″** and `10' 4 99/100`
  committed 124.99″ at a denominator outside the precision enum. New `isCommittableInches` +
  fraction validation (**D22**, **D23**).
- **F5 — the property test covered none of the branches it existed to protect.** Its generator never
  produced an empty slot (measured 0/2000 for each of feet/inches/numerator) — the empty-slot
  branches, where round 1's fraction-dropping bug lived, were exercised only by the 7-row table.
  Rewritten to draw `''`/`'0'`/digits, assert composed-text shape, and **assert its own coverage**.
- **F6 — `'0'` is a truthy string**, so `composeEnteredText` stored junk (`12'-6 0/16"`, `0'-4"`, a
  bare `"`). Presence now means a positive value, in both compose and value (they must agree).
- **F7 — freehand pressure was silently dead.** §8.5 rendered
  `points.map(p => [p.x, p.y, p.pressure ?? 0.5])`, but `pressure` is a **parallel array** and `Px`
  has no such member: it does not compile under `strict`, and any cast yields a constant 0.5.
- **F8 — the loupe's numbers were mutually impossible** (160px window, 3.5×, 80px source). Pinned to
  a formula (**D30**).

**Data-loss defects:**

- **S1 —** `writeAtomic`'s doc comment promised the per-project Web Lock; **the body never took
  one**, which also made `cleanStaleTmp`'s stated safety property false. Lock moved into
  `writeAtomic`; `projectId` is now a required parameter.
- **S2 —** `cleanStaleTmp` scanned the **project root only**, while every tmp file the app writes
  lives in `sheets/<n>/` or `assets/` — so slice 1.2's own "no `*.tmp` survivors" gate could never
  pass. Now a bounded recursive walk.
- **S3 —** only the *parse* was guarded in `readJsonValidated`; every I/O failure bypassed `.history`
  recovery entirely. Now routed, with an explicit expected-absence path for new sheets.
- **S4 —** no disk-full handling existed anywhere. New `storageStatus: 'full'`, and explicitly:
  **never prune `.history/` or `.trash/` to make room for a save.**
- **S6 —** duplicate project ids are *expected*, because the sanctioned sharing model is copying the
  project folder — yet the behaviour was undefined. Now: separate cards, `«Copy»` badge, never merge.

**Ownerless work (the class earlier rounds structurally could not find):**

- **P4/D24 — nothing said how the app reaches a Surface**, and the **origin is the identity boundary**
  for the persisted folder handle, every setting, OPFS and the SW cache. Changing it later silently
  orphans all of them while the files survive, so the failure is quiet. New **§19.1** + **slice 0.0**,
  before the scaffold. **Resolved in session 4b (§21.1).**
- **P2/D27 — nothing saved annotations between slices 1.5 and 1.10.** §10 named a "persistence
  queue" module; no slice ever listed it. Added to 1.2.
- **P1 — no slice built the tool rail** ("do not simplify #1", 14 tools). New **slice 1.4.5**.
- **P3 — test infrastructure did not exist** and three slices depended on it; §14 also mandated
  Testing Library against a closed dependency list that lacked it. Dev deps added; `node-canvas`
  dropped for Playwright; configs and fixtures are slice 0.1 deliverables.
- **P20/D26 — asset dedupe had no mechanism** (`sha256Hex` was defined and never called). Assets are
  now content-addressed.
- **P5/D25 — no service-worker update strategy.** New **slice 1.11**.
- **P7/D28 — export conflict detection was case-sensitive on a case-insensitive filesystem**, so
  `Overwrite` could silently destroy an unrelated export.
- **P8/D29 — accessibility was scheduled entirely in the last slice.** Moved into every UI slice.

**Resolved (session 4b, §21.2):** **D31** — the fraction chip is **entry-scoped**; tapping `1/2 … 1/16`
during one entry changes the denominator for that entry only, and the project's `precisionDenominator`
changes only from the Dimension style panel's Precision control.

**Re-verified sound:** the §4.2 export invariant (`0.75 × mu` pt at every M; M=2 → 4 mu = 3 pt,
18 mu = 13.5 pt), §9.2's page math, the §8.5 inset crop/pivot/hit-test model from session 3, the
keypad's core table, and the formatters' carry behaviour.

**Method note:** three rounds running have found defects in reference code that passed the previous
review. Prose review finds prose defects; only execution finds execution defects. Two of this round's
findings — F1, and the `con.jpg` row in this session's own first-draft filename sanitizer — were
caught only by running the code.

## Session 4b — resolved decisions (2026-09-21)

Build spec **§21** resolved every item that was previously open or "needs a human answer"; the ADR
index above is updated accordingly. Key resolutions:

- **D24 — origin & distribution (§21.1).** Development on `localhost:5173`/`4173`; production on a
  pinned static HTTPS host (default `https://<owner>.github.io/FieldMeasure/`, `base: '/FieldMeasure/'`).
  The build is origin-agnostic (`base` from `process.env.FM_BASE ?? '/'`) and slice 0.1 ships an
  origin-change guard — a move is loud and recoverable, not a silent first-run.
- **D31 — fraction chip (§21.2).** Entry-scoped; project precision changes only from the style panel.
- **D14 — TypeScript (§21.6).** Pin TS 5.x for v1; supersedes the "to be confirmed at scaffold" note.
- **Also resolved (§21.3–§21.9):** metric deferred; `locationLabel` schema-only (no v1 UI); sheet
  templates cut; capture-resolution decision table (0.2 measures, 1.4 reads the row); `Konva.pixelRatio`
  downgrade ladder (measured in 1.3); `lucide-react` verified by a two-line spike in 1.4.5.

## Session 4b — design decisions & the contradiction register (2026-09-21)

Three design questions were answered and recorded as **D32–D34**; the `gui-ux-readiness` review's
contradiction register (C1–C14) was applied to the canonical docs. The decisions:

- **D32 — rail side.** The rail follows **handedness**, which *is* the left/right switch: right-handed
  users (the default) get the rail on the right, left-handed users on the left — handedness is a
  first-run question, so switching costs nothing and needs no new control. A free manual override
  independent of handedness was already deferred (session 3). The implementation plan's 1.4.5 test row
  had the direction inverted; corrected to match the UI spec.
- **D33 — width unit.** The width readout shows **true paper points** (`0.75 × mu`): a 4-mu stroke
  reads "3 pt" — the size it actually prints, on any paper size. This is the §4.2 export invariant
  (non-negotiable #1), not a new unit. The UI spec's `4 pt` label and the width ladder were corrected.
- **D34 — hosting.** Develop and beta-test on **`http://localhost`** (a secure context — install,
  service worker and `showDirectoryPicker` all work). Production is **GitHub Pages**, which requires a
  **public** repo (or a paid plan for private Pages). `base` stays `FM_BASE`-driven and the origin
  guard (§21.1) makes the localhost→Pages move a recoverable re-pick, not a data loss.

## Session 5 — touch-first input model & pre-code design review (2026-09-21)

Full analysis: **`docs/gui-ux-readiness-and-design-handoff.md`**. Implementable interaction design:
**`docs/touch-first-interaction-model.md`**. Eight research lanes (4 × `librarian`, 3 × `designer`,
1 × `explorer`) plus a source-verified check of the Claude Design product claims.

### D35 — Touch is the primary input (supersedes M4's pen-first framing)

The app was specified pen-first: UI §1.1's *"Pen draws, finger navigates"* — called *"the single
biggest protection against palm and glove smudges"* — with "Finger draws" **off** by default. In fact
it will be used **primarily by finger**. The principle becomes:

> **Touch places and moves. Pen draws. Both create geometry.**

Settings gain `«Touch places and moves»` (**ON**) and `«Finger draws (freehand)»` (**OFF**); the pen
always draws and additionally supplies pressure, tilt and hover. Rationale: reach and gloves, plus the
decisive point below.

**Why this is lower-risk than it looks:** measurements are **typed** feet-inches values, not
scale-calibrated distances. A placement error therefore changes *where the line points and which
feature it attaches to* — **not the measured number**. That makes finger-first defensible in v1 in a
way it would not be for a calibrated CAD takeoff. The failure mode moves from "wrong measurement" to
"wrong-looking drawing", which is a materially smaller blast radius.

### D36 — Tap-tap placement is the primary placement verb

Tap A → tap B creates the object, for **every** placement tool (Dimension, Angle, Line, Arrow,
Rectangle, Ellipse, Polygon, Image inset, Text). Press-drag-release remains supported for pen users.
This generalises the Polygon tool's existing tap-by-tap grammar rather than inventing a new one.

**Dimension specifically:** geometry commits on tap B; a **450 ms settle window** opens with a live
`✓ Value` / `Adjust endpoints` HUD; the keypad auto-opens **only if no canvas contact occurred** during
that window, and any contact cancels the auto-open **permanently for that placement**. Cancelling never
discards the drawn geometry (unchanged UI §8.1 rule). Evidence: tap is **at least as accurate as drag
per point** (CHI 2024, DOI 10.1145/3613904.3642272), and drag adds a first-point-movement failure mode.

**Mandatory accuracy safeguards** (not optional — they are what makes finger placement trustworthy):
snap-to-feature (acquire 32px → lock 20px, default Strong under touch); the loupe on tap (200px, 4×,
136px offset, contact disc, dashed leader, freeze-on-lift 700 ms); and post-place nudge handles with
an **Offset Nudge Pad** so refinement never covers the point being corrected.

### D37 — One-finger drag is object-first (deliberate, with mandatory mitigations)

A one-finger drag moves the grabbable, unlocked object under the pointer; otherwise it pans.
Two-finger drag always pans. A second finger **cancels the drag and restores the previous position**.
The Pan tool overrides object-first unconditionally.

> **Recorded counter-argument (this is a deliberate risk, not an oversight).** The safer convention —
> and the one the touch-placement research recommended — is **selection-first**: a first tap selects an
> object and only an *already-selected* object drags. That matches Windows/OneNote/Miro behaviour and
> Microsoft's explicit guidance *"do not override common gestures"*. Object-first was chosen by the
> product owner for a lower tap count. **The mitigations above (two-finger cancel-and-restore, Pan-tool
> override, undo labelling the move) are therefore mandatory**, and the residual risk — silently
> displacing a measurement when the user meant to pan — must be re-checked in the slice 0.2 spike and
> on real hardware.

### D38 — Two-finger tap is a secondary path only

It remains (add to selection; cancel mid-placement), but Microsoft warns that multi-finger gestures are
OS-reserved on Windows and that two-finger tap is OS-associated with right-click. Every action it
performs must also exist as an on-screen control (UI §1.7 already forbids gesture-only actions).
Verify the behaviour in the spike; do not depend on it.

### D39 — Palm rejection without a pen is not deterministically solvable

W3C Pointer Events 3 states that authors **cannot suppress** the behaviour, and that detecting these
scenarios is **out of scope for the specification**. Contact geometry (`PointerEvent.width`/`height`)
defaults to `1` when the hardware cannot report it, so it cannot be trusted as a palm discriminator.
The router's suppression window only starts on a **pen event**, so **a pen-less session has no palm
suppression window at all** — with a placement tool armed and no pen ever seen, touch classifies as `'draw'` (the plan's locked truth table), not `'navigate'`.

Design response: bounded heuristics (edge rejection, multi-touch debounce) + keep the pen as a
suppression signal **when one is present** + make **undo and `pointercancel` rollback the real safety
net** (Android's own documented palm-rejection cookbook does exactly this instead of attempting
prevention). **Never ship a mode that silently discards input**, and never present a size-threshold
palm filter as reliable.

### D40 — Canvas testing and CSP enforcement

jsdom has **no canvas implementation**: `getIntersection` returns `null`, `toDataURL` returns a stub,
and pixel readback is transparent — so a hit-testing test written against jsdom **passes without
testing hit testing**. Anything touching a `Konva.Stage` must run in a **real browser** (Vitest browser
mode + Playwright). jsdom remains fine for stores and pure logic.

Separately, the strict CSP (`style-src 'self'`) becomes **a test**: assert zero `[style]` attributes
and fail on any `securitypolicyviolation`. One nuance worth recording: `style-src 'self'` blocks
`setAttribute('style', …)` and `el.style.cssText = …` but **not** direct CSSOM assignment
(`el.style.display = 'none'`). Konva styles its stage that way, so **Konva is not a CSP violation** —
prove it in the spike with a violation listener rather than assuming.

### D41 — No pre-implementation design phase

The UI spec is already implementable; the outstanding work is **decisions, not mockups**. Design-tool
conclusions:

- **`@playwright/test` 1.63.0 is already pinned** and is the source of truth: assert **exact computed
  geometry** at the two real viewports (1440×960 and 960×1440, `deviceScaleFactor: 2`) and
  screenshot-baseline the canvas at 1×/4×/8×.
- **Claude Design is moodboard-only.** It is a real product (Anthropic Labs, 2026-04-17, Opus 4.7,
  codebase-first design systems, Claude Code handoff) — but its output **cannot ship here**: it emits
  standalone HTML with inline styles, which `style-src 'self'` blocks, and it carries Tailwind in the
  AI-codegen tools. It also cannot represent an imperative Konva canvas, pen/palm behaviour, or the
  `0.75 × mu` pt export invariant — so a polished prototype would create false confidence about the
  hardest 80%.
- Rejected for shipping output: v0 / Lovable / Bolt (Tailwind + cloud), Figma Make / Framer (no code
  export), Storybook / Loki / Chromatic / Percy (not in the closed dep list; stale or cloud + metered).
- Acceptable optional wireframe tools: **Penpot self-hosted** (the only surveyed tool emitting
  class-based CSS) or **Excalidraw** (offline, honest about being approximate).
- **Token source of truth:** a hand-authored **DTCG JSON** → committed external `tokens.css`. Style
  Dictionary v4 is optional and would need a dev-dep spec change.

### D42 — Contradiction register C11/C12 (C14 is copy)

- **C11 — `--sel` cyan serves both the focus ring and selection/manipulation.** Differentiate by
  **treatment**, not by adding a colour: focus = 2px ring with an offset; selection = 2px bbox + 4px
  glow.
- **C12 — `--hi` orange is both the chrome accent and `DEFAULT_STYLE.strokeColor`.** Deliberate: the
  contexts differ (chrome vs canvas). Record it, and verify legibility over both bright and dark photos.
- **C14** is unquoted copy (Settings labels, capture toggles, sort/search, panel headers, first-run
  card labels) and is a content-owner task, tracked in `docs/appendix-strings.md`.
- *Application note:* C11/C12/C14 land in the UI spec and strings inventory **after** the in-flight
  touch-change edits release those files, to avoid a second writer.

### Correction (round 5) — the touch loupe was arithmetically impossible

The touch loupe was first specified as *"4× of a 100×100 source"* in a 200px window — which is **2×,
not 4×**. This is **the same defect class as F8/C4** (the pen loupe's mutually-impossible
160px / 3.5× / 80px), reintroduced during the touch change and caught in review by the build-spec lane.

Corrected using `D30`'s sanctioned formula, `sourcePx = diameterPx / magnification`:

| | Window | Magnification | Source (**derived**, not stated) |
|---|---|---|---|
| Pen loupe (`D30`) | 160px | 3.5× | `160 / 3.5` ≈ **45.7px** |
| **Touch loupe** | **200px** | **4×** | `200 / 4` = **50px** |

Applied to `U §8.1` (the touch-variant bullet), `U`'s changelog row 19, and
`docs/touch-first-interaction-model.md` §2.1. All three now state the **derived** source rather than an
independent number, so they can no longer disagree. The touch loupe genuinely does show slightly more
context than the pen loupe (50px vs ≈45.7px) *at a higher magnification*, because the window grew too.

> **Rule to carry forward:** never state a loupe's window, magnification and source as three
> independent numbers. Exactly one of the three is free; the other two must be derived. Fixing the
> same class of defect twice is why this is recorded rather than just corrected.

## Session 6 — slices 0.2, 1.1, 0.3 (2026-09-21)

### D43 — Input router built to §8.2, not the plan's stale signature

The implementation plan's slice 0.2 "Signatures" block predates the final §8.2 hardening: it lists
`createInputRouter(palmWindowMs=1200)` with `noteTouchContact(e, phase)` and `readonly penPresent`.
The authoritative §8.2 is `createInputRouter(o?: InputRouterOptions)` returning `notePenEvent /
penStrokeStart / penStrokeEnd / noteTouchDown(pointerId, atEdge, now?) / noteTouchUp(pointerId) /
classify(e, now?) / onPenHover(e)`, with `penSeenThisSession` internal (no `penPresent` getter). Built
to §8.2 (plan reading rule #5: "build to the spec, not to this summary"). `pointercancel` rollback is
a PlacementController concern, not a router method. The throwaway `spike.tsx` canvas is deferred to
hardware — every one of its gates is `[Surface]`, so it has no machine gate it can satisfy.

### D44 — §3.4 schema corrections (found by execution, not reading)

Four reading-only review rounds missed that §3.4 as written does not compile under `strict`:
`AnnotationZ: z.ZodType<Annotation>` fails because §3.4 applies `.nullish()` to `fillColor`
(`string | null | undefined`) and `children` (`Annotation[] | null | undefined`), neither of which
satisfies §3.3's `fillColor: string | null` (required-nullable, no `undefined`) and
`children?: Annotation[]` (optional, no `null`). Fixes (exact translations, no cast, no guard
weakened): `fillColor → .nullable()`, `children → .optional()`. Separately, to satisfy the §3.4
migration note + §19.5 + "migration runs AFTER the zod parse, never before", `ProjectFileZ`'s
`unitFormat` and `precisionDenominator` became `.nullish()` so a pre-v0.3 project file parses and
`migrateProjectFile` fills `'ft-in'`/`16`. Wrong-measurement guards (`isCommittableInches`,
`VALID_DENOMINATORS`, numerator<denominator) are untouched.

### D45 — Settings/Home copy gaps (proposed placeholders, pending content-owner approval)

§20.5(b) requires Settings rows the appendices never keyed (Handedness / Unit system / Unit format /
Theme / Density / Palm rejection window / Imperial / Metric). Simplest behavior: proposed
`settings.row*` + `settings.unitSystem*` keys + `settings.penOnlyHint` (wording lifted from the
appendix's own `settings.penOnly` "Where it appears" note), all marked ⚠ in `strings.ts` pending
approval. Unit-format options use gap #5 keys (`settings.unitFormatFtIn/In/DecimalFt`). Path readout:
File System Access exposes only `handle.name` (no absolute path), so the readout shows the suggested
root (`…\Documents\FieldMeasure`) then the handle leaf name after a pick. About shows the package
version + `document.lastModified` (no Vite `define` wired yet — a later slice adds
`__APP_VERSION__`/`__BUILD_DATE__`).

### D46 — 0.3 supporting files

`src/settings/projectsRoot.ts` (not in the plan's file list) is the home for the
`FileSystemDirectoryHandle` + `showDirectoryPicker` flow, kept out of `src/fs/*` (slice 1.2).
`src/settings/units.ts` imports the `UnitFormat` type from `src/domain/types.ts` (read-only, soft
coupling — harmless now that 1.1 is complete).

### D47 — Pen-only semantics reconciled to §8.2

§20.5(b)'s trailing line ("`Pen only`, when on, ignores touch input entirely") contradicts §8.2 and
the plan ("limits finger gestures to two-finger pan/zoom"). §8.2 is authoritative: with the placement
toggles off, single touch pans and two fingers pinch-zoom — it never places or draws. `Pen only` turns
touch placement/draw off; it is not "ignore all touch". Recorded so the copy and any future wiring
agree.

## Checkpoint C1 — Toolchain bring-up (slice 0.1, 2026-09-21)

**Measured:** `npx tsc --noEmit` ✓ · `npm run build` ✓ (vite 8.3.0; PWA: 11 precache entries) ·
`npx vitest run` ✓ (node 1/1, jsdom 1/1, browser 1/1) · `npx playwright test` ✓ (3/3, incl. the
CSP-as-a-test at both viewports).

**Decision row taken:** "All pass".

**Action:** resolved and pinned the versions the docs left open — **TypeScript 5.9.3** (per §21.6, not
7.0.2), `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `jsdom` 30.1.0,
`@types/react` / `@types/react-dom` 19.3.0. Added **`@vitest/browser-playwright` 5.0.1** (Vitest 5's
browser provider — an optional peer, not auto-installed). Corrected the browser-provider config to
`provider: playwright()` (a function import), not the `'playwright'` string.

## Checkpoint C3 — Device camera capabilities (slice 0.2, 2026-09-21)

**Measured:** on the build machine (Windows, headless Chromium): `enumerateDevices()` reports 1
`videoinput` entry with empty `deviceId` and hidden label; `getUserMedia({ video })` returns
`NotSupportedError`. No usable camera — so no max resolution or torch/flip data could be read.

**Decision row taken:** "If you have no Surface" → PROVISIONAL.

**Action:** recorded provisional; added "re-measure C3 device caps on the target Surface" to
`docs/HARDWARE-TEST-CHECKLIST.md` (slice 0.2 + H10); slice 1.4 builds against provisional labels and
reads the §21.7 row after the on-device measurement. The probe is committed at
`tests/e2e/device-caps.spec.ts` so hardware re-measurement is a one-command run.
