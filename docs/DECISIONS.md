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
