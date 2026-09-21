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
| D48 | zod v4 JIT disabled (CSP) | `globalConfig.jitless = true` in `schema.ts` — zod's JIT `Function('')` probe fired a `script-src eval` CSP violation | Accepted |
| D49 | `StorageStatus` union | `'ok'`→`'saved'` (chip wording), add `'saving'` + `'full'` (canonical per §5.8a/§11.4) | Accepted |
| D50 | Backend root vs project dir | `getProjectDir()` = ROOT; callers resolve the project dir; backend delegates writes via dynamic import (one `createWritable`) | Accepted |
| D51 | Duplicate-id runtime key | open flow must pass `id:folderName` as runtime `projectId` (lock/queue/registry collide on a bare id) | Accepted |
| D52 | Snapshot cadence deferred | `writeHistorySnapshot`/recovery exist; 10-min cadence + before-destructive + 200 MB backstop land with destructive actions | Accepted |
| D53 | Kill-switch harness | `move()` overwrite verified; 3 renderer-crash tests marked `fixme` (CDP `Page.crash`+reopen times out); H4 covers power-loss | Accepted |

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

## Session 7 — slice 1.2 storage core (2026-09-21)

### D48 — zod v4 JIT disabled (CSP `script-src eval`)

zod v4's optional JIT compiler probes `Function('')` to detect eval availability and compiles schemas via
`new Function`. Our CSP is `script-src 'self'` (no `'unsafe-eval'`, §2.2), so the probe fires a
`securitypolicyviolation` and the CSP-as-a-test (slice 0.1) fails. Latent in 1.1 (zod ran only in the
node test project); real in 1.2, when `projectStore.ts` imports `schema.ts` → `zod` into the browser
bundle. Resolution: `globalConfig.jitless = true` in `schema.ts` — zod's documented escape hatch "precisely
so CSP/no-eval environments never reach `new Function`". Schemas run on the interpreted runtime; correctness
is unchanged (166 tests + CSP test green).

### D49 — `StorageStatus` canonical union

§10 named the normal state `'ok'`; §11.4's chip says "Saved"; §5.8a requires `'full'`; the chip needs
`'saving'`. The appStore union `'ok'|'pending'|'readonly'|'offline'|'error'` could not express the states
`persistQueue` emits, so the plan's `subscribe(fn: (s: AppState['storageStatus']) => void)` was
unsatisfiable. Canonical union: `'saved' | 'saving' | 'pending' | 'readonly' | 'offline' | 'full' |
'error'` (`'ok'`→`'saved'`). `PersistStatus` is that union minus the UI-only `'offline'` (a one-time
reassurance the queue never emits), so it is a subtype of `StorageStatus` — 1.10's chip subscribes and
forwards without mapping.

### D50 — backend `getProjectDir()` is the ROOT projects folder

§5.1's "relative to a project folder" and §3.1's `<root>/<Project folder>/…` layout disagreed about whether
the backend points at the root or a project. Resolved: `getProjectDir()` returns the ROOT (the §5.2-persisted
handle); callers resolve `<root>/<projectFolder>/` and `<root>/<projectFolder>/sheets/<n>/` from it.
`readSheetMarkup(projectDir, sheetId)` takes the PROJECT dir because `.history/` lives at the project root
(FSA has no `..`). The backend's `writeTextAtomic`/`writeBlobAtomic` delegate to `projectStore.writeAtomic`
via a dynamic import with `ROOT_LOCK_SCOPE = '__root__'`, so `createWritable()` exists in exactly one module
(AGENTS non-negotiable 3). (The dynamic import is "ineffective" for chunking because `ProjectList.tsx` also
statically imports `projectStore` — harmless; a split is not needed.)

### D51 — duplicate-id runtime key (forward-looking)

§5.8c keys in-memory projects by `id + folderName`, but the Web Lock, `persistQueue`'s chain key and the
open-project registry are all keyed by `projectId` alone — so two same-id folders collide, and a queued write
could resolve to the wrong folder inside the 400 ms window. Resolution: the open flow must pass
`scanProjects()`'s returned `key` (`id:folderName`) as the runtime `projectId` to locks/queue/registry.
`ProjectList.onOpenProject(id, folderName)` already provides both halves. This lands with the editor open flow
(1.3+).

### D52 — history-snapshot cadence and 200 MB backstop deferred

`writeHistorySnapshot` + `recoverFromHistory` exist and the corruption-recovery gate passes. The §5.5/§5.8e
triggers — a 10-minute reset-on-write cadence, "snapshot before every destructive action", and the 200 MB
whole-`.history` backstop — land when the destructive actions they protect (`Clear sheet markup`,
`Delete files…`) exist (1.6/1.10). The 20-per-scope cap (×2) is implemented now.

### D53 — kill-switch renderer-crash harness

`FileSystemFileHandle.move()` overwrite semantics are verified (the `move()` test passes in Chromium). The
three renderer-crash tests (`Page.crash` + `context.newPage()` reopen) time out in this Chromium/Playwright
combination, so they are marked `test.fixme` with the reason; the real power-loss case is the `[Surface]` H4
gate. No copy+delete fallback was introduced (§5.6 forbids it).

## Session 8 — oracle-style execution review of slices 0.2–1.2 (2026-09-21)

Full gate re-run green (`npx vitest run` 166/166, `npx tsc --noEmit`, `npm run build` 11 precache,
`npx playwright test` 5 passed / 4 fixme) and the highest-stakes modules re-traced by **execution**
(48/48 unit expectations independently re-derived, not read from the passing tests). Verdict:
**the foundation is sound — slices 1.3–1.5 are safe to start.** No wrong-measurement or data-loss
defect found. Findings were all either verified-sound or already-recorded deferrals:

- **`cleanStaleTmp` comment/code drift (fixed).** The S2 comment said "never touch `.history/`" but
  the code recurses into it (the `SKIP` set holds only `.trash`). The code is **correct** — recursing
  into `.history/` cleans an orphaned snapshot `.tmp` from a crashed write, and valid snapshots never
  end in `.tmp` so the suffix filter protects them — but the misleading comment could invite a future
  wrong "fix" that adds `.history` to `SKIP` and re-breaks the "no `*.tmp` survivors" gate. Comment
  rewritten to state the real behaviour.
- **`.history/<scope>/<epochMs>-<name>.json` naming — confirmed correct.** `recoverFromHistory` filters
  `entry.endsWith(name)` then `Number.parseInt(entry, 10)` on the `<epochMs>-` prefix, and sorts
  newest-first. `parseInt` stops at the `-`, so `1726901234567-markup.json` → `1726901234567`. The
  `<scope>` directories keep `project.json` and `markup.json` snapshots disjoint. No bug.
- **D51 (duplicate-id runtime key) — confirmed safe to defer, contract pinned to 1.3.** Nothing opens a
  project into an editor yet, so the bare-`id` lock/queue/registry keys cannot currently collide. The
  slice-1.3 editor open flow **must** pass `scanProjects()`'s `ScannedProject.key` (`id:folderName`) as
  the runtime `projectId` to `registerOpenProject`, `persistQueue`, the Web Lock and the BroadcastChannel.
- **D52 (snapshot cadence / 200 MB backstop) — confirmed safe to defer to 1.6/1.10.** Atomic `tmp→move`
  already prevents corruption in the common case, and the "snapshot before destructive action" triggers
  protect actions (`Clear sheet markup`, `Delete files…`) that do not exist yet. `writeHistorySnapshot` +
  `recoverFromHistory` + the 20-per-scope cap ship now; only the *trigger* is deferred. Watch item: slice
  1.5 starts writing `markup.json`, so if corruption recovery is wanted before 1.6, wire at least the
  before-destructive snapshot then.
- **D53 (kill-switch renderer-crash harness `fixme`) — confirmed sufficient.** H4 (real power-loss on
  hardware) covers it; `move()` overwrite is already e2e-verified and the atomic-write correctness is
  pinned by the S1–S5 fake-FSA tests. Repairing the CDP `Page.crash`+reopen timeout is not worth it now.

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

## Checkpoint C2 — Test fixtures (slice 0.1, 2026-09-21)

**Measured:** no real phone photo was available on the build machine, so the synthetic path was
taken. `tests/fixtures/make-fixtures.mjs` — Node built-ins only, no new dependency — hand-emits
`12mp-portrait-exif6.jpg`: 4032×3024 = **12.19 MP** stored, EXIF orientation tag **6**,
`DateTimeOriginal`, and a GPS IFD. It also regenerates `tiny-2x2.jpg` (mid-grey, 313 bytes). Also
committed: `truncated.jpg` (0 bytes), `corrupt-markup.json`, `v02-markup.json`, `v02-project.json`.
Both generated JPEGs are proven to decode with real pixels (not a stub) in
`tests/normalizeImage.browser.test.ts` — 2×2 and the upright 3024×4032 — so the fixture set is
genuinely decoded, not header-patched.

**Decision row taken:** "No photo available" → synthetic fixture + the committed generator script.

**Action:** slice 1.3 built and passed its EXIF/normalize gates against these fixtures. The
`[Surface]` half — a real phone photo, GPS tag confirmed present before import and confirmed absent
in Explorer file properties after — is logged in `docs/HARDWARE-TEST-CHECKLIST.md` (slice 1.3 rows
+ H4). Status flipped to ✅ in `docs/CHECKPOINTS.md` (orchestrator, slice 1.4/1.4.5 batch).

**Correction carried from D55:** the earlier claim that `tiny-2x2.jpg` was a "SOF-patched 1×1 seed"
was false — the old 631-byte file was a genuine encoder JPEG of a 2×2 solid-white image and decoded
cleanly. The 631→313 rewrite is hygiene, not the removal of an anti-pattern.

## Session 9 — slice 1.3 photo on canvas (2026-09-21)

### D54 — §4.2 screen scaling seam + the tap-classification contradiction (execution, not reading)

**Screen rules, implemented once.** `src/editor/EditorCanvas.ts` exports the §4.2 screen rules as
pure helpers — `screenFontSize`, `screenInkSize`, `screenStrokeConfig`, `screenTextConfig`,
`screenInkConfig`, `inkOutlinePoints` — plus `applyScreenRules(root, scale, { regenerateInk })`, which
`applyView` calls on **every** zoom change. Strokes keep `strokeWidth = strokeWidthMu` with
`strokeScaleEnabled:false`; Text nodes carry a `fontSizeMu` attr so `fontSize = fontSizeMu / s` is
re-applied at each scale; ink nodes carry `inkPoints` + `strokeWidthMu` and their filled outline is
regenerated at `mu / s`. Ink regeneration is skipped during a pinch/wheel burst and run once on
`zoomend`/wheel-settle (the throttle §4.2 rule 4 asks for). Nothing is flattened or pre-multiplied.
`tests/editorCanvas.browser.test.ts` renders a 4-mu stroke, 4-mu ink and an 18-mu label at 1×/4×/8×,
pixel-scans the layer canvas, and asserts the painted thickness is constant while geometry scales —
the slice's machine gate.

**Contradiction found by execution.** UI spec §5.4 reads "lifts within **8px** of travel (or ≤400ms) is
a tap"; the slice-1.3 plan test reads `maxDrift ≤ 8 px && duration ≤ 400 ms → 'tap'` (AND). A plain OR
classifies a 200 px pan completed in 150 ms as a **tap** — 192 px outside the slop, accepted purely on
duration — so every fast pan would become a selection. Implemented **AND** (`isTap`), pinned by
`tests/dragPredicate.test.ts`; the UI-spec wording is corrected to "**and** within **400ms**"
(AGENTS: fix the wrong expectation with the arithmetic, then the test).

### D55 — Slice 1.3 media, worker, fixture and open-flow decisions

- **Synthetic fixtures, hand-rolled — never a patched header.** `tests/fixtures/make-fixtures.mjs`
  emits `12mp-portrait-exif6.jpg` (4032×3024 = 12.19 MP stored; orientation 6; DateTimeOriginal; a GPS
  IFD) with Node built-ins only, and now also regenerates `tiny-2x2.jpg` the same way. A solid mid-grey
  image has DC = 8·(128−128) = 0 in every block, so a valid baseline grayscale JPEG is hand-emitted
  from the Annex K Huffman tables (SOI, DQT, SOF0 1-component, standard DHTs, SOS, DC0+EOB per MCU,
  `0xFF→0xFF00` stuffing) and the APP1/EXIF segment is spliced in as a normal marker.
  `buildSolidGrayJpeg` handles non-multiple-of-8 dimensions by emitting padding MCUs (identical for a
  constant image) and the decoder crops to the frame. Both sizes are proven to decode with real
  mid-grey pixels in `tests/normalizeImage.browser.test.ts` (2×2 and upright 3024×4032). 143 KB
  committed; the fixture name matches the plan/appendix (`12mp-portrait-exif6.jpg`).
- **★ corrected (orchestrator review, after an independent oracle review of this slice).** The claim
  above that the old `tiny-2x2.jpg` "SOF-patched a larger frame onto a 1×1 seed" was **wrong**. The
  oracle extracted `HEAD:tests/fixtures/tiny-2x2.jpg` binary-safe and parsed it: the 631-byte file was
  a **genuine encoder JPEG of a 2×2 solid-white image** — JFIF APP0, 2 DQTs, 4 DHTs, SOF0 2×2
  3-component — and it decoded cleanly in both Chromium and GDI+. It was never broken. (At that
  degenerate size a 1×1-seed patch would be byte-indistinguishable anyway: one MCU covers the whole
  cropped frame, which is how the false story became plausible.) The 631→313 rewrite is still worth
  keeping — deterministic, dependency-free, and now a meaningful mid-grey level rather than white —
  but it is **hygiene, not the removal of an anti-pattern**. The `make-fixtures.mjs` header comment was
  corrected to match.
- **Thumbnail composite is contain-fit on `--mat`, not cover** (§7.3 leaves "composite" open). A sheet
  thumbnail must show the whole photo; cover would hide exactly the edges a dimension might sit near.
- **Decode worker is real and machine-proven.** `src/media/decodeWorker.ts`'s stub body is replaced
  with the real `createImageBitmap` decode (transferred `ImageBitmap`), keeping the slice-0.1 URL
  convention. It returns `decodedIn: 'decodeWorker.ts'`; `tests/thumbnails.browser.test.ts` asserts the
  marker, so a refactor that drops the worker fails a test instead of passing on an assumption. The
  build emits `dist/assets/decodeWorker-*.js` (a separate chunk).
- **`dragLayer` pixel ratio = `min(devicePixelRatio, 2)`.** §8.1.1's table names only photo / markup /
  inset / overlay. The drag layer holds the same crisp markup content as `markupLayer`, so it takes the
  same ratio.
- **`fit()` is clamped to 0.25×.** A 12 MP portrait photo contain-fitted into a ~1312×908 landscape
  canvas computes ≈0.225 < `MIN_ZOOM`. Honouring the stated 0.25×–8× range for every path (pill, pinch,
  fit) means Fit shows slightly less than the whole sheet on very large images; recorded rather than
  silently allowing a sub-0.25 fit.
- **Capture time → the new sheet's `createdAt`.** §7.2 says to read capture time "for default sheet
  naming", but (a) the appendix fixes the default name as `Sheet NN`, and (b) §3.4's `Sheet` has no
  capture-time field (zod would strip an unknown key). Capture time is read BEFORE `normalizeImage`
  (proved by test) and used as `createdAt`, which is schema-legal and better than "now"; the title is
  the appendix's `Sheet NN`.
- **Damaged-photo state offers Import (adds a sheet).** Replace-in-place is §8.5's Replace-photo flow
  (later slice); v1.3 only has the import path.
- **D51 wiring landed.** `src/App.tsx` composes the runtime `projectId` as `${id}:${folderName}` from
  `ProjectList.onOpenProject`, and `SheetEditor` registers THAT key with `registerOpenProject`, the
  writer lease (`acquireWriterLease`), the BroadcastChannel and (via `projectStore`) the per-project
  Web Lock — two same-id folders can no longer collide. A scan entry with no valid id is not openable.
- **New string keys** (all from the appendices except where marked ⚠): `project.noSheetsEmpty`,
  `project.readOnlyChip`, `project.sheetNamePrefix` (⚠, the literal word in `Sheet NN`),
  `capture.importButton`, `capture.importAPhoto`, `errors.photoDamaged`, `errors.retry`,
  `errors.projectUnavailable` (⚠, appendix gap #20's quoted phrase), `editor.zoomPercent`, `editor.fit`
  (⚠), `editor.emptyHint`, `editor.back` (⚠), `a11y.zoomIn/zoomOut/zoomFit`, `a11y.zoom` (⚠),
  `a11y.canvas` (⚠). No wording was invented beyond these marked placeholders.
- **★ corrected (orchestrator review of this slice).** The line above listed
  `a11y.zoomIn/zoomOut/zoomFit` as **non**-placeholder. Byte-level checking shows they exist **only** in
  `appendix-strings-gaps.md` #25 — *proposed* copy — while the approved `## a11yLabels` section holds
  only `a11y.dimensionTool`. Re-marked ⚠ PROPOSED in `src/ui/strings.ts` so unapproved copy cannot ship
  as final (CONTINUITY open question 1 / C14). Every other new key's **value** was verified
  byte-identical to the approved appendix, **em dashes included**.
  **Process note for future sessions:** the Windows PowerShell console renders U+2014 inconsistently —
  `Select-String` prints it as `-` while `git diff` prints it as `—` — so a copy check done through the
  console can invent a string mismatch that does not exist (it did, twice, during this review). Do copy
  and fixture checks with a byte-level `node` read, never with `Select-String` output.
- **Bundle note.** Importing Konva into the app bundle took the main chunk to ~547 kB (past Vite's
  500 kB warning). Non-blocking; lazy-loading `SheetEditor` (Konva off the Home route) is the obvious
  code-split and is left for the 1.4.5 shell, which will mount `SheetEditor` behind the editor layout.
- **Surprise (test harness).** The first `--project browser` run timed out initializing the
  `thumbnails.browser.test.ts` iframe (60 s) while other browser files ran in parallel; a re-run was
  green and each file passes in isolation (worker included). Recorded as a possible Vitest browser
  flake to watch, not a product defect.

### D56 — EXIF orientation decode: `from-image`, never `none`/`flipY`, no manual rotation

Confirmed by a dedicated research pass (librarian lane) and by a local Chromium probe:

- **Always** `createImageBitmap(blob, { imageOrientation: 'from-image' })`. In Chromium the Blob
  default is **already** `'from-image'` (the probe showed `createImageBitmap(blob)` and the explicit
  form both yield the fixture's upright 3024×4032), so the explicit option is **intent, not a
  behaviour change** — it stops a future edit from silently opting out.
- **Never `'none'`.** A flag-disabled/deopted decoder leaves orientation un-baked, so a 4032×3024
  orientation-6 phone photo would load sideways and **every** stored dimension would land in the wrong
  place (a wrong-measurement bug, not a cosmetic one).
- **Never `'flipY'`.** It is a mirror, not an orientation; it cannot express EXIF 6.
- **No manual rotation anywhere.** All four decode sites — `normalizeImage.decodeOriented`,
  `decodeWorker.onmessage`, and the two `SheetEditor` loads — pass `from-image`; adding a
  `rotate()`/transform on top would double-rotate. Enforced by comment at each call site; the
  `tests/normalizeImage.browser.test.ts` dim assertion (upright 3024×4032) is the behavioural guard.
- The `ImageBitmap` is the only thing decoded; the working image is re-encoded without metadata, so
  orientation is baked exactly once on import and never re-applied on load.
- **`convertToBlob`/`toBlob` drop EXIF (incl. GPS) by construction** — confirmed by research and
  asserted by execution: both are a fresh Skia encode with no metadata passed, in all Chromium builds
  (no Android/Windows difference; it is the encoder, not the platform). `tests/normalizeImage.browser.test.ts`
  verifies this by **re-parsing the normalized output bytes** for an APP1 segment beginning `"Exif\0\0"`
  and for the GPSInfoIFDPointer tag `0x8825`; the same scanner first proves both are present in the
  source fixture, so the negative result is meaningful. `exif.ts`'s byte-level `stripExif` is therefore
  belt-and-braces for any path that must preserve original bytes, not the mechanism the import relies on.

### D57 — EXIF read path: manual APP1 scan, bounded to a ~64 KB head slice

There is **no native metadata API** — `createImageBitmap`/`ImageBitmap` and the File System Access
`File` expose no EXIF access — so walking the JPEG marker structure by hand is the only read path.
`src/media/exif.ts` implements exactly that: require `FFD8`, walk markers stopping at `DA`/`D9`, find
`E1` followed by `"Exif\0\0"`, take the TIFF that starts next, detect `II` (0x4949) / `MM` (0x4D4D),
check magic `42` at TIFF+2, IFD0 at `TIFF + u32(TIFF+4)`, and read 12-byte `tag/type/count/value`
entries.

**`readExifInfo` reads only the first `EXIF_SCAN_BYTES` (64 KB)** via `blob.slice`, instead of pulling a
multi-MB phone photo into memory just for metadata. One APP1 segment is capped at 65533 bytes by the
JPEG spec, and cameras emit EXIF before ICC/other APPn, so 64 KB covers a full EXIF block plus the JFIF
APP0 that normally precedes it. The bound cannot cause a wrong measurement: this parser supplies only
the **capture time** (a default sheet timestamp); **orientation is decoder-side** — baked by
`createImageBitmap(..., { imageOrientation: 'from-image' })` in `normalizeImage`/`decodeWorker` (D56),
which reads the tag internally, not through this module. A pathological JPEG that preceded EXIF with
~64 KB of other APPn data would lose only the timestamp, never the upright pixels.
`tests/exif.test.ts` proves the bound by spying on `Blob.prototype.arrayBuffer` and asserting no more
than `EXIF_SCAN_BYTES` is ever materialized from the 143 KB fixture (while still parsing orientation 6).
`stripExif` is the exception — it rewrites the file, so it must read the whole blob; it is not on the
import path.

### D58 — The plan's "12 MP → ≤4096 long edge" assertion is trivially true; downscaling is covered explicitly

The slice-1.3 test line "12 MP fixture → ≤4096 px long edge" **never exercises downscaling**: a
4032×3024 12 MP photo is 3024×4032 after EXIF orientation 6, long edge **4032 < 4096**, so the default
`normalizeImage` call returns it unchanged. Recorded rather than "fixed" by inventing a >4096 fixture
that would no longer be 12 MP. The downscale path is covered by execution instead:

- pure `targetSize` (`tests/normalizeImage.test.ts`): `8192×6144 @4096 → 4096×3072` (0.5×);
  `3024×4032 @1024 → 768×1024` (1024/4032 = 0.253968…, 3024 × that = 768.0); `1×100000 @1 → 1` (never 0).
- browser (`tests/normalizeImage.browser.test.ts`): `normalizeImage(input, 1024) → 768×1024`, and
  `normalizeImage(input, 512)` in the content-hash case.
- the **default** call now asserts the exact unchanged `3024×4032` (and `max(w,h) === 4032`) so the
  no-op is deliberate and visible; a regression that silently downscaled a 12 MP photo on import would
  fail it.

A real >4096 phone photo (e.g. a 48 MP sensor in 4:3) would exercise the default clamp on glass; that
belongs to the hardware checklist's 12 MP gate, not to a synthetic fixture.

### D59 — Pinch wiring: `stage.on('touchmove')` + `preventDefault`, `touch-action:none`, `overscroll-behavior:none`

Konva ships no pinch gesture. `EditorCanvas` hand-rolls it, and the hardening is now explicit:

- **`stage.on('touchstart' | 'touchmove' | 'touchend' | 'touchcancel', …)`** — Konva binds those
  listeners on `stage.content` with **`{ passive: false }`** (verified in `konva/lib/Stage.js`), and
  dispatches them synchronously, so `e.evt.preventDefault()` inside the handler is honoured. Pinch
  therefore lives on the Konva event system, not a side-channel DOM listener.
- **`touch-action: none`** on the canvas container (`.editor-canvas`, the div handed to `Konva.Stage`)
  — the scroll/zoom gestures never reach the browser. **`overscroll-behavior: none`** on `body` stops
  pull-to-refresh and rubber-band chaining while a two-finger pinch is in flight.
- Only two-finger contacts `preventDefault` and zoom; a single-finger `touchmove` is left alone (the
  SheetEditor pointer path owns one-finger pan/object-first drag).
- **Execution caught a real (minor) defect:** the pinch baseline was first established inside
  `touchmove`, so the *first* move only set `startDistance` and never zoomed. The baseline is now
  established in `touchstart` (two touches → `beginPinch`), so the first move zooms. Pinned by
  `tests/editorCanvas.browser.test.ts`: synthesized two-finger `TouchEvent`s assert 100 px → 200 px =
  2×, pivot = midpoint (image point under the midpoint is unchanged), `touchmove` is `defaultPrevented`,
  and a single-finger move neither zooms nor preventDefaults.

## Session 9 (continued) — independent review of slice 1.3 (F1–F5), 2026-09-21

An independent `oracle` review was run because 1.3 is the foundation four slices build on and its
scaling seam is load-bearing. **Method:** the fixture generator was re-run and its output re-derived by
an independent byte-level JPEG parser + Huffman entropy decoder; both fixtures were cross-decoded with a
second implementation (GDI+); the Konva 10.6.0 stroke/event internals were traced in `node_modules`; and
`vitest --project node` and `--project browser` were re-run independently.

**Verified sound, no defect found:**
- **Fixtures.** Marker structure correct; entropy decodes to exactly `ceil(w/8)×ceil(h/8)` DC0+EOB MCUs
  (190,512 for the 12 MP; 1 for the 2×2) with correct `0xFF→0xFF00` stuffing and EOI placement; APP1
  length field includes its own 2 bytes (182 = 180+2); `"Exif\0\0"`, `II`+42+IFD0@8, ascending 12-byte
  entries, every offset even, `0x8769`→Exif SubIFD / `0x8825`→GPS IFD with zero next-IFD terminators;
  all tags resolve to the claimed values, and GDI+ reads the same tags. Orientation 6 is genuinely
  demonstrated (stored 4032×3024 → decoded upright 3024×4032).
- **§4.2 screen rules.** `applyView` (`EditorCanvas.ts`) is the single chokepoint for every zoom path
  (pill / setZoom / zoomAt / fit / pinch / wheel), so text is re-counter-scaled on **every** change;
  ink regenerates from the raw `inkPoints` attr (never from already-outlined points → no double-apply);
  strokes are never divided (no flatten/pre-multiply). The test is genuine, and the reviewer confirmed
  from Konva's source that `strokeScaleEnabled:true` would render 4→16→32 px across 1×/4×/8× and fail it
  — i.e. it would catch the exact regression it names. "Label width constant in CSS px" was, however,
  proven by attribute arithmetic rather than pixels; see F5 below.
- **EXIF/normalize path.** `targetSize` arithmetic exact (1024/4032 × 3024 = 768), `sha256Hex` matches
  the FIPS "abc" vector, and the 64 KB scan bound is load-bearing **only** for capture time: nothing in
  `src/` consumes `readExifInfo().orientation`/`.hasGps` — orientation is decoder-side at all four
  `createImageBitmap(..., 'from-image')` sites — so the bound cannot cause a wrong measurement. The
  EXIF-negative assertion is meaningful because it first proves the source carries the tags.
- **D51.** All four keys verified (`registerOpenProject`, the writer lease, the BroadcastChannel, and the
  `writeAtomic` Web Lock) use the same `${id}:${folderName}` runtime key.
- **D54, D56, D57, D58, D59** — accurate as written.

**D60 — F1 (medium, real defect): one-finger pan on empty canvas was never implemented. FIXED.**
`SheetEditor`'s `onPointerMove` gated panning on `contact.intent === 'navigate'`, but with the default
`touchPlaces: ON` the router classifies a touch contact `'draw'`. `decideDragTarget` correctly returned
`'pan'`, and **nothing consumed it** — so with no grabbable geometry (all of 1.3) every one-finger drag
did nothing; it worked only from the 24 px edge band or with `touchPlaces` off. Mouse and pen were
equally dead. This contradicted build spec §8.2 ("otherwise it **pans**"), D37, and slice-1.3 build
order step 3 — a shipped-behaviour gap the green gate structurally could not see, because
`dragPredicate.test.ts` tests the pure predicate, not the wiring.
**Fix:** `onPointerMove` consumes `decideDragTarget`'s result for **any** one-finger contact — `'pan'`
pans, `'object'` is left to 1.5 — suppressed only while a placement is pending (UI §5.4 gates
object-first on "no placement is pending", so a pending placement wins). Tap routing is untouched:
`isTap` still governs taps, so tap-tap placement is unaffected.
**Guard:** `tests/sheetEditor.browser.test.ts` mounts the **real** `SheetEditor` (real `EditorCanvas`,
real Konva stage, real native pointer listeners; storage mocked), sizes the host to 800×600 so the edge
band is real and the contact is born off-edge, drags (400,300)→(520,340) and asserts
`stage.position()` is (120,40) — plus a second case asserting a pending placement suppresses pan. The
lane verified this test **fails against the pre-fix code** (`expected +0 to be close to 120`), so it is
a real guard, not a tautology. **Not proven by it:** object-move and the second-finger restore (no
object model until 1.5), the pen/mouse variants (same branch, not separately simulated), and the
edge-born `'navigate'` route.

**D61 — sheetEditor props gain the 1.4.5 rail seam.** `SheetEditorProps` gains optional
`activeTool: 'select' | 'pan' | 'place'` (default `'select'`) and `placementPending: boolean` (default
false), read through refs because the pointer handlers are installed in a mount-time effect. `'place'`
stands for **any** placement tool — it arms placement so double-tap fit is suspended and a pending
placement suppresses drag navigation. 1.4.5's rail drives these props; 1.5 supplies
`placementPending`.

**D62 — F2 (low): double-tap fit↔100% is no longer gated on the touch toggle.** `endContact` gated the
double-tap on `intent === 'draw'`, so a user with `touchPlaces` off (`'navigate'`) got no double-tap fit
even though UI §5.4 states it unconditionally. Now only a palm/heel `'ignore'` contact is excluded; the
placement-armed suspension is retained. Guarded in the same new test file (`touchPlaces: false` → one
`toggleFitOrFull` call; it too fails pre-fix).

**D63 — F3 (low): the second-finger restore is documented as owed, not live.**
`onSecondFinger(session).restoreTo` is deliberately **not** consumed: 1.3 has no grabbable object model,
so `preDragPosition` is always `null` and there is nothing to restore. The comments previously claimed
"the restore path below is already live" — now corrected to state plainly that 1.5 must apply
`restoreTo` to the dragged node at that point. Recorded here so the obligation cannot be lost.

**D64 — F5 (note): the text half of the §4.2 gate was attribute arithmetic; now also measured, and one
gap remains.** The label assertion was `text.fontSize() × scale ≈ 18` — it proves the *rule* was
applied, not that the rendered glyph is 18 CSS px (the stroke and ink halves were genuine pixel
measurements). `inkBBoxWidth()` now scans the label's own client rect for opaque pixels and records the
inked bounding-box width at 1×/4×/8×, asserted identical and within a plausible range. **Still
unproven:** the §8.1.1 dpr-2 path — the test forces `markupPixelRatio: () => 1`, so CSS-px constancy at
`devicePixelRatio = 2` is inferred, not measured. Watch item; do not mistake it for coverage.

**Also fixed from this review:** the false "old `tiny-2x2.jpg` SOF-patched a seed" narrative in D55
(★ corrected above) and the matching header comment in `make-fixtures.mjs`.

### D65 — the implementation plan still carried the **pre-correction** touch-loupe numbers (fixed)

Found while preparing the session-9 handoff (orchestrator), by cross-checking the slice-1.5 packet against
the documents above it. The plan's slice-1.5 build order read *"Touch loupe variant … 200 px diameter,
**4×** of a **100×100** source"*, and its gate read *"The loupe's magnification is 3.5× at **every** size
setting"*.

Both are wrong, and this is a **reintroduction** of the exact defect the round-5 correction (DECISIONS
"Correction (round 5)") already caught — there written as *"200px window, 4×, of a 100×100 source"*, which
is **2×**, not 4×, and is the same defect class as session-4's F8. The authorities agree with each other
and disagree with the plan:

| Source | Touch loupe | Arithmetic |
|---|---|---|
| UI spec §8.1 (and its changelog row 19) | 200 px, **4×**, **50×50** source | `sourcePx = diameterPx / 4` → 200 / 4 = 50 ✓ |
| `docs/touch-first-interaction-model.md` §2.1 | 200 px, **4×**, **50 px** source | same ✓ |
| D30 + the round-5 correction table | 200px, **4×**, `200 / 4` = **50px** | same ✓ |
| **implementation plan** (before this fix) | 200 px, 4×, **100×100** source | 4× of 100 px needs a **400** px window ✗ |

Also: the pen and touch loupes legitimately have **different** magnifications (3.5× vs 4×), so the gate's
"3.5× at **every** size setting" was wrong for the touch variant.

**Authority chain applies:** build spec > UI spec > implementation plan, so the **plan** is the wrong
document and was corrected (both the build-order line and the gate line), not the UI spec.
`sourcePx = diameterPx / magnification` (D30) is the invariant to keep: exactly one of {window,
magnification, source} is free, and the same defect has now been caught **three** times (F8/C4, round 5,
and here) — so the slice-1.5 lane must state all three numbers **with their arithmetic**, and the gate
must be checked for **both** loupes.


