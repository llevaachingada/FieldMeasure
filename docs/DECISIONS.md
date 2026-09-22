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
### D66 — process hardening from the session-9 reflect pass (and one correction to it)

**C4 — fired in slice 1.3 but NOT MEASURABLE there (recorded, not skipped).** `CHECKPOINTS.md` C4 asks
for markup-layer redraw time while panning a 4096-px sheet carrying ~50 annotations. Slice 1.3 shipped
**no annotation model** — dimensions arrive in 1.5, shapes and ink in 1.6 — so the measurement cannot
run yet. No number was invented to fill the gap: `min(devicePixelRatio, 2)` (already implemented) ships
until hardware says otherwise, the row is in `docs/HARDWARE-TEST-CHECKLIST.md`, and `CHECKPOINTS.md` C4
now carries that status plus the re-run point (after 1.6).

****★ Correction — to my own correction. This is the sharpest lesson of the pass.** The reflect report
claimed C1 and C2 had drifted (still ⬜ long after both had fired). **The report was right.** Proven
binary-safe: at `1975860` the C1/C2 headings end in **U+2B1C (⬜)**; at `a6a12de` they end in
**U+2705 (✅)** — a *concurrently running lane* measured C2 and refreshed both headings while this pass
was being written.

I first declared that finding false, because `git diff -- docs/CHECKPOINTS.md` showed only my own C4
edit. That check was **invalid**: HEAD had already moved (the lane’s commit had landed), so comparing the
working tree against the *current* HEAD could not reveal the historical state.

**Two rules adopted:**
1. **To test whether a finding was true, compare against the revision it was made against** —
   `git show <sha>:path` — never against current HEAD. With lanes running, HEAD moves underneath you and
   a *true* finding will look false.
2. **Never withdraw a finding without that proof.** A false correction is worse than the original error:
   it deletes knowledge that was correct, and nobody will re-derive it.

A separate and still-valid lesson about my own tooling: the script that "verified" the C1/C2 status
asserted an end state (✅ is present) instead of comparing before/after, so it passed while doing
nothing — defect class #2 in the review brief this same pass added. Prefer a before/after comparison
over an end-state assertion.

**`AGENTS.md` is now state-honest.** It read *"There is no application code yet"* after five slices had
shipped. It now (a) states that code exists and sends the reader to `CONTINUITY.md` / the last
`BUILD-LOG` entry for state, (b) says plainly that the file is the *contract* while those two are the
*state*, (c) makes `CONTINUITY.md` reading-order #1, and (d) carries no volatile counts (the previous
wording counted review rounds and would have gone stale again immediately). `CLAUDE.md` was a stale
second copy — with a mojibake header — and is now a deliberate pointer; nothing referenced it.

**New: `docs/review-brief.md`.** The eight questions every review lane must answer, each carrying the
real defect that put it there (proves-nothing tests, trivially-true gates, unfaithful DECISIONS claims,
stale arithmetic in a subordinate doc, faked or unlogged deferral, a flattened invariant, an unpinned
boundary, environment coupling). It is the pasteable brief for `@oracle` / adversarial lanes;
`BUILD-RUNBOOK.md` §12 points at it.

**New: `BUILD-RUNBOOK.md` §11 — parallel lane protocol.** Contended files with a one-writer rule
(re-derived per wave), never two writers on one file (whole-file last-writer-wins **loss**, not a merge
conflict), the staging module for copy a lane needs before its owner has written it, no cross-import of a
sibling’s in-flight file, the per-lane verification subset (`tsc` + node/jsdom — never `build` or
`playwright`, which share `dist/` and the ports), the integration checklist, and the session-reuse rule.
This was re-derived from scratch twice in one session; it is now written down.

**§8 checkpoint recording is now three places** — DECISIONS number, CHECKPOINTS status, and the
`Checkpoints fired:` field of the BUILD-LOG entry, in the same commit. A checkpoint with no DECISIONS
heading did not happen.

**§9: the copy contract is machine-checked** by `tests/strings.test.ts` (added by a parallel lane, and
verified **non-vacuous by mutation** — three separate mutations produced real failures, then were
reverted). It imports the real `STRINGS` and compares byte-level: a value with no `{token}` must match
the appendix exactly; a value containing tokens is compiled to an **anchored** regex whose literal
chunks are still compared exactly, and every token must be declared in the appendix `Interpolation`
column — so a placeholder cannot be renamed to one the appendix does not declare. Measured state:
**113 leaves** — 41 approved, 52 gaps-only, 20 beyond both appendices and therefore required to carry
the `⚠ PROPOSED (C14)` marker. **No allowlist.** It does not assert that a beyond-appendices key is
*justified*, and it does not police unused appendix rows.

**Environment quirks moved into `AGENTS.md`** (Windows PATH / `npm.cmd`, no PowerShell heredocs, the
console U+2014 + `Select-String` trap, the real background-task tooling behaviour, CRLF vs LF), because
it is the only file guaranteed to be in an agent’s context. The proposed `task_message` claim was
**corrected before writing**: it is a *lease*, not a one-shot — consecutive sends fail with
"message/control lease unavailable" and should be retried (5 of 6 landed in this session).

**Not applied, deliberately:** the reflect pass also proposed extending the *global*
`verification-planning` skill with a "does the path test the wiring, or only the decision?" section.
The evidence is one repository, and it is a global asset, so it stays un-applied until a second repo
shows the pattern. `docs/review-brief.md` covers the need in-repo.

### D67 — the copy-contract gate broke the typecheck gate (fixed without weakening it)

**Finding.** `tests/strings.test.ts` (added in `b68b74c`) read its three source files with
`node:fs` / `node:path` / `node:url`. `tsconfig.json` pins `types: ["vite/client"]` and the repo does
not install `@types/node`, so `npx tsc --noEmit` failed with **TS2307** on `node:fs` and `node:path`
— the gate written to protect the copy contract had broken the typecheck gate, and `tsc` was no
longer 0 on `main`. This is the review brief's "red gate nobody noticed" class, and it was
invisible to `vitest`, which resolves `node:` builtins at runtime regardless of types.

**Fix.** The three reads now use Vite `?raw` imports (`../src/ui/strings.ts?raw`,
`../docs/appendix-strings.md?raw`, `../docs/appendix-strings-gaps.md?raw`), whose module declaration
ships with `vite/client` — already in `tsconfig`'s `types`. No new dependency, no assertion changed,
no row skipped: `?raw` inlines the same UTF-8 bytes at transform time and the comparison logic below
it is untouched. The `readText` BOM strip is kept.

**Verified.** `npx tsc --noEmit` → **0 errors** (was 2). `npx vitest run --project node
tests/strings.test.ts` → **3/3 pass**. Because the parser below is unchanged and it still reconciles
the parsed source keys with the imported `STRINGS` object and still clears the ≥50-leaf guard, a byte
difference in the read would fail the test rather than pass silently; D66's mutation evidence for the
comparison logic therefore still applies to the comparison logic.

**Not done, deliberately.** `@types/node` was **not** added. It is a dev-only type package, but the
dependency list is closed and the `?raw` route needs nothing; `types: ["vite/client"]` stays pinned
rather than widened to paper over a harness import.

### D68 — slice 1.4.5 editor shell: composition, the no-op rule, and what is placeholder

**Composition.** `EditorLayout` owns the frame — 52 px top bar, 56 px tool rail on the
handedness side, the docked style-chip slot — and hosts `SheetEditor` for the canvas.
`SheetEditor` keeps the canvas, the zoom pill, the status panels and the **single** hidden file
input, and exposes two additive shell seams (`onImportReady(trigger)`, `onSheetTitleChange(title)`)
so the top bar’s «Import file» and the breadcrumb reuse the existing import path and sheet title
rather than duplicating them. It is still mountable bare, which is what
`tests/sheetEditor.browser.test.ts` asserts.

**The unimplemented-tool no-op is enforced in two places** — `ToolRail`’s click guard and
`EditorLayout.selectTool` — so selecting a tool with `implemented: false` cannot change `activeTool`.
Only `select` and `pan` ship implemented; slice 1.5 flips `dimension`. `sheetEditorToolFor` maps every
non-select/pan tool to `'place'`, so that flip needs no mapping change.

**`panelDockFor` is the single docking predicate**: `viewportW / viewportH >= 1.2 → 'side'`, else
`'bottom'`. The boundary is **inclusive** and pinned by test (`panelDockFor(1200, 1000) === 'side'`),
with a zero/negative-viewport guard returning `'bottom'` instead of dividing by zero. The rail side is
`railSideFor(handedness)` and never derives from the dock, so rotation cannot move the rail.

**The autosave slot renders nothing** until 1.10 supplies `autosaveChip` — the prop defaults to
`undefined`, so there is no optimistic "Saved" state to be wrong.

**Placeholder art, recorded so it cannot ship by accident.** The 14 tool glyphs are bespoke
single-path SVGs (`src/ui/icons/tools/*.tsx`, `currentColor`, 24 px grid) drawn for this slice from the
UI spec’s group taxonomy. They are **placeholders**: final art is a 2.0 prerequisite (plan
§1.4.5 step 3).

**Overflow menu.** UI §5.2’s nine items render from `appendix-strings-gaps.md` §9 and are marked
`⚠ PROPOSED (C14)`. Only `Add sheet` and `Import file` are wired; the rest are labelled no-ops —
not dead ends, not crashes.

**Bundle.** `App.tsx` lazy-loads `EditorLayout` (which carries Konva) and `CameraFlow`. The main
chunk fell from ~547 kB to **342.10 kB**; Konva moved into `EditorLayout-*.js` (217.04 kB) and the
precache went 12 → 16 entries.

## Checkpoint C5 — `lucide-react` 1.x icon API (slice 1.4.5, 2026-09-21)

**Measured:** named exports work. `lucide-react@1.47.0` is already in the runtime list; `SheetEditor`
has used `Maximize`/`Minus`/`Plus` since slice 1.3, and the new shell uses `Undo2`/`Redo2`
(`ToolRail`), `ChevronLeft`/`ChevronRight`/`Layers`/`MoreHorizontal`/`Share2` (`TopBar`) and the
camera glyphs in `CameraFlow`. `npx tsc --noEmit`, the production build and the CSP-as-a-test spec all
pass with them (the CSP spec would fail on any inline `style`).

**Decision row taken:** "Named exports work (`import { Camera } from 'lucide-react'`) → Use them. Continue."

**Action:** no inline-SVG fallback needed. The 14 tool glyphs stay bespoke SVG per §2.2 — lucide is
chrome-only, and nothing measurement-critical depends on it.

### D69 — slice 1.4 capture flow: mount, provisional device caps, and the shared write path

**The write path was extracted before the lanes started.** `src/fs/sheetIntake.ts`
(`addSheetFromPhoto` / `defaultSheetTitle`) owns "a photo becomes a sheet" — `sheets/<id>/photo.jpg`
then the `project.json` append — and is used by both the editor’s import and the capture flow. Slice
1.3’s `SheetEditor.handleFile` was refactored onto it in `ab42300`, so two parallel lanes could not
produce two versions of one data path. Write order is photo-first: a crash in between leaves an orphan
sheet directory (harmless, tolerated by `scanProjects`) and never a `project.json` entry pointing at a
missing photo.

**The capture mount is the top bar’s «Add sheet»**, wired by the orchestrator at integration:
`App.tsx` renders `CameraFlow` as a lazy full-bleed overlay over the editor; `onCaptured` sets
`editorSheetId`. `SheetEditor` gained an additive optional `sheetId?: string` so «Use photo» lands the
user on the sheet that was just written — before this, the editor always opened the first non-deleted
sheet (`sheets[0]`), so a capture into a non-empty project would have appeared to do nothing.

**The camera could not be measured.** The build machine has no usable camera (CHECKPOINTS C3), so
`PROVISIONAL_DEVICE_MAX` is `null` and the toggle ships the honest generic «High (device max)» /
«Fast» labels without claiming a resolution. The `useWindowsCameraPromoted` copy fires only when a
measured max is ≤ 1080p, which an unmeasured device is not. The spec §21.7 row is re-read after H10
measures the Surface, and the row is logged.

**Copy discipline.** Slice 1.4 staged its strings in `src/ui/cameraCopy.ts` (BUILD-RUNBOOK §11 — 1.4.5
owned `strings.ts` that wave). The orchestrator folded them into `STRINGS` **from the appendix bytes**
and deleted the staging module; `storage.saveACopy` is the first key of a new `STRINGS.storage`
section, and the copy-contract gate (`tests/strings.test.ts`) passes on the folded result.

**Write failure keeps the photo in memory** and offers «Save a copy…», so a field photo is never
trapped. The sheet is not appended to `project.json` until `photo.jpg` is on disk.

**Deferrals logged, not faked:** five `[Surface]` rows in `docs/HARDWARE-TEST-CHECKLIST.md`, every one
PENDING with its machine-verifiable half stated (capture→disk→thumbnail, kill-mid-write, camera-denied
copy, the real device max, and the on-device target/focus walk).

## Checkpoint C10 — Touch placement accuracy (slice 1.5, 2026-09-21)

**Measured:** the **machine half only**. There is no Surface, so no tap can be landed on
glass. What is machine-proven: the snap acquire **32 px** → lock **20 px** radii
(`snapAcquirePx`), the **40 px** post-place refine window, the loupe geometry, and the
second-finger **restore** (D63) — each pinned by tests, with the placement loop itself
driven in the browser project against a real `Konva.Stage`.

**Decision row taken:** none can be read until the on-glass walk runs. Recorded as
**not measurable without hardware** (the same treatment C4 got) — never as a pass, and no
number was invented to fill the gap.

**Action:** the ten `[Surface]` rows are logged in `docs/HARDWARE-TEST-CHECKLIST.md` under
slice 1.5, and `CHECKPOINTS.md` C10 carries the machine-half wording. The failure mode this
checkpoint guards is "wrong-looking drawing, right number" — it informs UX and cannot
corrupt a measured value.

### D70 — slice 1.5 dimension machine: seams, deliberate deviations, and what is not wired

**Loupe arithmetic (D65-consistent, both variants shipped).** Pen magnification is fixed at
**3.5×** with the source derived: 112/3.5 = **32**, 160/3.5 = **45.714…**, 200/3.5 =
**57.142…** px. Touch is **200 px / 4× / a 50 px source** (200/4 = 50), **136 px** offset, a
**44 px** contact disc, freeze **700 ms** then fade to 40 %. The three numbers are stated
with their arithmetic in `src/editor/Loupe.ts`, as the rules require.

**Keypad mount seam.** The sheet is mounted by **`SheetEditor`**, not `EditorLayout`. This is
a deliberate deviation from the brief: the component that commits a value must be able to
reach the imperative tool, and `SheetEditor`’s props are frozen. The shell mirrors the open
state through the **additive** `editorStore.keypadOpen` to apply the 40 % dim/inert treatment
(touch model §5.1), and `EditorLayout` defers **both** Escape and the tool hotkeys to the
open sheet.

**Undo/redo seam.** `src/editor/session.ts` (a command registry + toast bus) is wired to the
**rail’s** undo/redo, not the top bar: UI §5.1 and build spec §11.4 place them under the
drawing hand and forbid duplicating them in the top bar. The brief said "TopBar’s undo/redo" —
the specs win, and `TopBar` carries no undo/redo controls.

**D63 is discharged.** The `'object'` drag target now moves grabbable geometry, records the
pre-drag position at drag start, and applies `onSecondFinger(...).restoreTo` on cancel, so a
second finger can never leave an object displaced. Evidence:
`tests/sheetEditor.dimension.browser.test.ts` drags a dimension 120 px, lands a second
pointer, and asserts the endpoints return to the pre-drag pair with no commit at the
displaced position (verified against the real canvas, not jsdom).

**Not wired, and recorded as owed: `markup.json` persistence.** `MarkupScene` keeps the
annotation document **in memory**; writing it through slice 1.2’s `persistQueue` is not in
this packet. So annotations do **not** survive a reload yet. This is stated plainly rather
than left for a reader to infer from a green gate.

**Not built:** the Offset Nudge Pad (the packet marks it optional for 1.5).

### D71 — the keypad sheet: two spec conflicts corrected, and what is unmeasured

**UI §8.1’s "360 px tall" sheet is arithmetically impossible** with §8.1’s own contents:
48 header + 64 preview + 56 chips + 2×72 keys + 8 row gap + 20 notes + 128 actions + 30
padding + 40 inter-row gaps = **538 px** (shortfall ≈ 178 px). Clipping a keypad to honour the
number would have broken a 72 px key. The sheet is sized content-wise
(`max-height: min(92vh, 620px)`); **the spec’s number needs correcting, not the code**.

**§6.1.1’s `ft` wiring is incomplete.** "`ft` → `activeSlot = 'feet'`" leaves `inchesMode`
true, and `pressDigit` returns early in inches mode — so after tapping `in`, `ft` was a
**no-op**. Implemented as `{ inchesMode: false, activeSlot: 'feet' }`, the simplest behaviour
consistent with a control that works.

**The refusal copy is stale under D31.** The plan hard-codes «Fraction must be smaller than
1/16», but the entry denominator has been **entry-scoped** (2…64) since D31, so with a `1/2`
chip active the sentence is wrong. Shipped verbatim as instructed and marked
`⚠ PROPOSED (C14)`; the recommended replacement is «Fraction must be smaller than
1/{denominator}» and it **needs content-owner sign-off** (Open question 1 still stands).

**Unmeasured, recorded rather than papered over.** The 48 / 56 / 64 / 72 px target floor is
**CSS-declared only**: jsdom has no layout, so no honest measurement is possible there, and
the lane correctly refused to assert "the CSS text says 72 px" as if it were a measurement.
Same class as D64 (the dpr-2 path): inferred, not measured. Logged to the hardware checklist.

**Unreachable path.** `keypad.offlineNote` can only surface through a throwing commit,
because the pinned props expose no channel for the store’s folder-unavailable state; §8.1
wants it beside a `--warn` Autosave chip, which is slice 1.10’s. Flagged so the path is not
mistaken for tested.

**Lossy re-edit.** Seeded only with `initialValueMm`, re-editing picks the first valid
denominator that represents the value exactly and otherwise falls back to the project
precision — so a bare decimal finer than the project precision can round on re-edit. The real
fix is a future optional `initialEnteredText` prop (the schema already stores `enteredText`).

**Integration fixes.** (1) The shell wrapped the sheet in a second, same-named
`role="dialog" aria-modal="true"`, nesting two modals and making `getByRole('dialog')`
ambiguous — the wrapper is now positioning-only. (2) The keypad copy was folded from the
**appendix bytes** and the staging module deleted; the fold’s own two defects (a self-matching
identifier replacement that doubled three references, caught by `tsc`; and one row inserted as
the appendix’s *rendered* example instead of the shipped *template* form, caught by `vitest`)
were fixed before commit. Neither was a lane defect.

## Checkpoint C9 — Pen pressure response (slice 1.6, 2026-09-21)

**Measured:** the **touch-only** row — there is no pen and no Surface, so the on-device
comparison cannot run. What is machine-proven: `svgPath.strokeInputPoints` indexes the
**parallel** `pressure[]` array (`pressure[i] ?? 0.5`) and is the only place that does (the
F7 trap), and the CI counterpart passes — a ramped pen-pressure array produces a materially
wider outline at the last point than the first, while an all-`0.5` synthetic touch stroke
renders at the constant **8-mu** floor with `thinning: 0`.

**Decision row taken:** "No pen present (touch-only run) → Mark **PENDING (pen-only)** — never FAIL."

**Action:** the pen half is logged in `docs/HARDWARE-TEST-CHECKLIST.md` (slice 1.6) and
`CHECKPOINTS.md` C9 carries the pen-pending wording. Freehand ships on touch at the constant
width floor by design; no number was invented.

### D72 — slice 1.6 markup tools: the machinery, the deviations, and the completed carry-in

**The tool set and the document.** `shapes/svgPath.ts`, `renderShape.ts`, `renderInk.ts`,
`renderText.ts`; `tools/ShapeTool`, `AngleTool`, `FreehandTool`, `TextTool`, `EraseTool`,
`SelectTool`; `scene.ts` extended to every §3.3 geometry kind with §20.2 z-bands (highlighter
below other markup, above the photo) plus generic translate/bounds/keys-in-rect; `EditorCanvas`
regenerates filled ink at `mu/s` through the existing §4.2 seam (fills ignore
`strokeScaleEnabled`, which is exactly how ink width drifts).

**F7 discharged.** `strokeInputPoints` is the single place that reads the parallel
`pressure[]`; the spec’s pre-session-4 snippet (`p.pressure`) does not compile under `strict`,
and casting around it would silently pin every point to `0.5`.

**Touch smoothing 60 → `TOUCH_SMOOTHING = 0.6`.** perfect-freehand’s `smoothing` is a 0..1
fraction, so the touch model’s "60" is the percent form. Verified against the installed package,
not by reading.

**Highlighter "chisel".** perfect-freehand has no chisel tip: the freehand highlighter is a
constant-width bar (`thinning: 0`) and the **tap-tap straight-line mode is the true chisel**
(24-mu default under touch). Recorded so the label is not read as a claim the renderer cannot meet.

**`PendingOp` has no generic-shape member.** `editorStore.ts` was contended this wave, so a
generic shape/ink placement borrows `'polygon'` — the plan’s own sanctioned generic-placement
precedent — so `Esc` cancels the placement instead of exiting the editor.

**Erase hit target.** An unfilled shape is grabbable only on its stroke (`fillColor` null), so
touch tap-to-delete hits the visible outline; the wiring test documents this rather than hiding it.

**The D70 carry-in is DONE.** `MarkupScene.onChange` queues `markupFile(sheetId)` through
`createPersistQueue` (400 ms coalesce, per-project lock, D51 runtime key) and `loadSheet` restores
via `readSheetMarkup`, gated by a sheet-id ref so a restore does not queue a redundant write;
cleanup calls `flush()`. Annotations now survive a reload. Nuance: writes are **not** suppressed
when the project is read-only — the queue parks and retries, and the 1.10 autosave chip owns that
state.

### D73 — the Layers panel, and what integration found

**The panel ships complete and unmounted.** It is a props-driven §9 component (45 tests, no scene
access — deliberately, so it was disjoint from the tools lane). **It is not mounted**: the TopBar’s
`Layers` button is still `disabled`, because a real mount needs scene methods the document does not
have yet (visibility, lock, rename, z-order), history commands for each, and a `layersOpen` state.
Recorded as owed, in the same way 1.9 step 1 was committed as PARTIAL — not faked by wiring a
button to an empty shell.

**UI §8.6 contradicts itself on long-press** — "a 400 ms long-press starts the drag" *and*
"Long-press a row = menu". Resolved by target: **grip = drag, row body = menu**, both 400 ms. That
is the only reading that honours both sentences.

**`Group`/`Ungroup` render disabled.** The pinned props carry no channel, and `SelectTool`’s
grouping is not driven by the shell yet; they stay disabled until both exist rather than appearing
to work.

**Group-level mass-restyle (UI §9) is not expressible** with `AnnotationPath`-keyed selection — a
group header is not a row. It needs an `onSelectGroup` channel.

**No error prop and no scrim.** A scene load error has no channel (the shell owns it); the absence
of a scrim is correct for a flyout and avoids racing the trigger toggle.

**The staging module’s own marker list was inaccurate.** `markupCopy.PROPOSED_GAP_KEYS` listed
`selection.*` while the object paths are `select.*`, so **eight** proposals would have folded
**unmarked** — a copy-gate failure, and worse, unmarked proposals that a content owner could not
find. The fold derives provenance from the **appendices** (the same authority the gate uses) rather
than trusting either list; that is what caught it. Worth remembering: a hand-maintained list of
"which keys are proposed" is a second source of truth that can silently disagree with the file it
describes.

**The build caught what the unit suite structurally could not.** The tools lane wrote a
**CP1252 em dash (byte `0x97`)** into `src/styles.css`, making the file invalid UTF-8;
`npm run build` failed with `UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8` while
`tsc` and **526 tests were green** (vitest’s transform path is lenient; rolldown’s is not). Repaired
to U+2014 and a full-tree sweep confirmed no other file carried the damage. **This is the standing
argument for keeping the build in the gate even when every test is green.**

### D74 — three UI-spec corrections (two impossible numbers, one self-contradicting gesture)

Three claims in `docs/ui-spec-field-measure-v2-hardened.md` were wrong and are corrected in that
file (AGENTS.md: fix the subordinate document, log it here). The shipped code was right in all three
cases; **no application code changed**.

**(1) §8.1's keypad sheet "occupying 360px tall" is arithmetically impossible** with its own
contents: 48 header + 64 preview + 56 chips + 2×72 keys + 8 row gap + 20 notes + 128 actions + 30
padding + 40 inter-row gaps = **538 px** (shortfall ≈ 178 px). Honouring 360 px would clip a 72 px
key — a touch-target regression, not a cosmetic one. As built (D71): content-sized,
`max-height: min(92vh, 620px)`.

**(2) §9's insert picker sheet "bottom sheet, 320px" cannot hold its own contents.** With the
thumbnails the same paragraph specifies: 4 × 96 (four columns) + 3 × 8 gaps + 2 × 16 padding =
**440 px** minimum. As built (lane B2): content-sized, `max-width: 720px`, `max-height:
min(92vh, 720px)`. The same class as (1) — a container dimension that its own children outgrow.

**(3) §9's Layers rows gave ONE 400 ms row long-press both the reorder drag and the row menu**
("a 400ms long-press starts the drag so it isn't confused with a tap-to-select" … "Long-press a row
= Bring to front / … / Delete"). Those cannot both be true: the same gesture cannot begin a drag and
open a menu. Resolved to **grip = drag, row body = menu** — which is what `src/ui/LayersPanel.tsx`
already does and already documents in its header. The grip is pointer-only input (decorative,
`aria-hidden`, not focusable); keyboard users reorder from the row menu.

**(4) §7.2's panel diagram claimed "2 rows × 6, 44px targets, 6px gaps" inside a "280px" panel.** The
swatch grid alone needs 6 × 44 + 5 × 6 = **294 px**, which exceeds the panel *before* its own padding
(~260 px of content width). The panel width is fine; the diagram's "2 rows × 6" is not. As built
(lane C2): `repeat(auto-fill, 44px)` + 6 px gaps, which lays out **5/5/2** at this width. The
annotation in the diagram now says so.

**(5) The appendix's rendered example for `style.widthReadout` was `4 pt`; its own cited source is
`«3 pt»`.** U §7.2:401 shows `«3 pt»` and §7.3 fixes `pt = 0.75 × mu`, so 4 mu → **3 pt** — the
appendix row appears to have carried the **mu** value under a **pt** label, i.e. the unit-confusion
class this project treats as a defect even in an example. Corrected in `appendix-strings.md`
(`4 pt` → `3 pt`, and the source ref `U §7.2:388` → `U §7.2:401`, which is where the readout
actually is). The copy gate is unaffected: with `{widthPt}` declared, the row is matched as the
anchored pattern `^.+ pt$`, which `3 pt` satisfies.

**Why this is a decision and not an edit:** these are subordinate-document defects, so the authority
chain (build spec §2.4 > build spec > UI spec > plan) makes the spec the thing to fix — and per the
project's own rule, a wrong number in a spec that a builder would otherwise implement literally is
the same defect class as a wrong test expectation. Watch item #4 in `handoff-session-11.md` is
closed on all five counts.

### D75 — slice 1.6 wiring closure: the `visible` field, the rename no-op, and what remains owed

**`Annotation.visible?: boolean | null` is now part of the document** (`src/domain/types.ts`),
with the matching `AnnotationZ.visible: z.boolean().nullish()` (`src/domain/schema.ts`). Two
additive edits to a module the repo map calls frozen; the session-11 handoff authorised the schema
half, and `types.ts` is required because `AnnotationZ` is declared `z.ZodType<Annotation>` under
`strict` — a schema-only change would parse but could not be *stored* on an `Annotation`.

`.nullish()` is load-bearing: `z.object` **strips** unknown keys, so without the schema field a
reloaded `markup.json` would silently drop the eye state. Absent/null means visible, so every
existing `markup.json` still parses — **no migration version bump and no `migrate.ts` change**. The
rejected alternative (session-only visibility, never serialized) is named in the handoff and
rejected because the eye toggle would lie across a reload.

**Rename is a deliberate no-op** (`MarkupScene.rename` + `SheetEditor.panelRename`). `Annotation`
has no name field and names are DERIVED at render time (AGENTS #2); the only editable title in the
product is `SheetFile.title`. `rename` exists so the shell has one honest place to route the panel's
`onRename`, and it deliberately does **not** emit `onChange` (nothing changed). Owed: either remove
Rename from the row menu, or sanction a stored name field — a spec change, not a code one.

**Marquee is armed for non-touch pointers only.** The handoff implied a marquee on any empty-canvas
drag; the shipped F1 rule requires a **touch** empty-canvas drag to **pan** (D… session 9 / F1), and
that test must not break. Pen/mouse keep the marquee.

**Locked objects toast on `pointerdown`, not on tap** — the touch "shake" equivalent, so a locked
object cannot be dragged before the message appears.

**The photo row is synthetic.** The sheet's photo is not an `Annotation`, so its row is built by
`layersRows.ts` and is `deletable: false` (§20.2). Its **lock cannot persist** (there is no
annotation to carry it) — owed until 1.7 models the photo. Note the handoff's `deletable: a.type !==
'image'` snippet is **wrong** per §20.2: the *photo* is non-deletable; image insets are deletable.

**The mini-toolbar is a DOM overlay in the existing `.placement-hud` slot.** `miniToolbarPosition`
would give a computed anchor, but placing it needs an inline `style`, which the CSP forbids and the
CSP-as-a-test enforces. Recorded as owed rather than silently dropped.

**Copy folded from the appendix bytes** (staging module deleted): `inset.layersName` (APPROVED,
`appendix-strings.md`), plus `layers.groupPhoto` (gaps §7) and `layers.actionToggleVisible` /
`layers.actionToggleLock` (beyond both appendices) — the last three carry `⚠ PROPOSED (C14)`.

**Still owed after this closure:** object **groups** (no group model exists in `SelectTool`,
`scene.ts` or the panel — Group/Ungroup stay disabled); inset and inset-child rows are code-complete
but unreachable until 1.7 attaches `children` and image rendering.

### D76 — the Layers reorder seam: group-index vs §20.2 band-index, and a pre-existing off-by-one

**The defect (found in wave review, reproduced before it was fixed).** `LayersPanel.resolveDrop`
returns `toIndex` as an index inside the dragged row's **group block**; `MarkupScene.moveInBand`
read it as an index inside the object's **§20.2 z-band**, and there are only two of those
(`isLowerBand`: `highlight` = lower, everything else = main). The panel's groups are finer
(`dimensions|shapes|ink|text|insets|photo`), so with ≥2 groups in the main band the two index spaces
disagree. Trace, executed against the pre-fix code: Dim A z=1000, Dim B z=1010, Rect R z=1020 →
rows front-first `[R, B, A]`, blocks `[{shapes:[R]}, {dimensions:[B, A]}]`; dragging A onto B gives
`toIndex = 0`, and `moveInBand(A, 0)` produced painter order `[B, R, A]` — **A ended up above a rect
it was never dropped over**, and the panel then re-grouped it above Shapes.

**Second defect, same root.** `layerGroupFor` maps **both** `freehand` (main band) and `highlight`
(lower band) to `ink`, so one panel block spans two §20.2 bands. `resolveDrop` accepted such a drop
as "same block", and `moveInBand` then filtered members by `isLowerBand` and **silently did nothing**
— no move and no refusal copy. The wave's own gate ("a cross-band reorder is refused with the
approved copy") was therefore **not truly met** for the ink case, which is why this was fixed rather
than logged.

**The fix: an anchor-based primitive, band-safe by construction.** `moveInBand` is deleted.
`moveInBandBefore(pathKey, anchorKey | null): boolean` places `pathKey` immediately **in front of**
`anchorKey` (taking the anchor's slot) and returns `false`, changing nothing, when the anchor is
unknown/self/**in the other band**; `null` means the front of `pathKey`'s own band.
`moveInBandToBack(pathKey)` covers the end-of-group case. `SheetEditor.panelReorder` translates the
panel's `(key, toIndex)` into an anchor with `blockFor`, maps a rest index `>= reduced.length` to the
back, and raises `editor.highlighterBandMessage` when the primitive refuses. Because both the moved
object and the anchor are filtered to one band, **a cross-band move is now unexpressible** instead of
being silently mis-applied.

**Direction correction (the implementer was right, the brief was wrong).** The brief said "place
immediately *behind* the anchor". That is jointly unsatisfiable with the required test and with
Bring-to-front: `(key, 0)` is shared by "drop on the group's front row" and "Bring to front", and
with *behind* semantics the object either fails to reach the front or jumps over the unrelated rect.
Implemented as *in front of* the anchor, which makes `toIndex` the documented rest index.

**Resulting semantics of the four entry points.** Drag-drop: the row rests at the dropped row's
index. **Bring to front**: front-most **of its own group** — not of the sheet — because `(key, 0)` is
shared with a drop on the group's front row. Send to back: see below. Keyboard `Alt`+Arrow: one
position inside the group; past the end → back of the band.

**Off-by-one corrected (pre-existing, became user-visible when the panel was mounted).**
`LayersPanel` computed Send-to-back as `reduced.length - 1`. For a group `[dim-1, dim-2, dim-3]`,
removing `dim-1` leaves length 2, and rest index 1 lands the row **between** dim-2 and dim-3 —
second-from-back, not the back. The true back is rest index `2 = reduced.length`, which is the same
sentinel the keyboard path already produces for "past the end". Corrected in `LayersPanel.tsx`
(`length`, guarded `> 0`) **and** in its pinned expectation (`layersPanel.test.tsx`, `('dim-1', 1)` →
`('dim-1', 2)`) — the old comment asserted the wrong arithmetic ("the back position is 1"), and the
test was right to change only because the spec's intent for *Send to back* is the back. The shell
could not have fixed this: `(key, reduced.length - 1)` is byte-identical to Alt+ArrowDown arriving at
the group's last-but-one slot, so no shell translation can distinguish the two.

### D77 — independent adversarial review of the 1.4→1.6 batch: register and remediation

**Why it ran.** Session 10's owner **waived** the independent `@oracle` pass for the 1.4/1.4.5/1.5/1.6
batch and recorded it as a carried watch item ("gate-green but unproven against `review-brief.md`").
An orchestrator review of the 1.6 wave then found two real defects a **643-test green suite could not
see** (D76), which is the argument that carried. The review ran read-only against a **clean worktree at
`e06bf8f`**, by **execution** — scratch harnesses in the browser project against a real Konva stage,
plus one Playwright/CDP harness driving **real touch input**.

**Nothing wrong-measurement and nothing data-loss was found.** Six **correctness** findings, and four
of them are the *same shape as D76*: **wiring that exists, tests that pass, and a real input that
cannot reach it.** Severity is the reason this is a register of owed work rather than a note.

| # | Class | Finding | Where |
|---|---|---|---|
| **F1** | correctness (high) | **Touch drag-to-reorder can never work.** Chromium **implicitly captures** the pointer to the grip, so rows' `pointerover` never fires, `dropKey` stays `null`, and `resolveDrop` returns `missing` — a **silent no-op**. Mouse/pen fine. Proven with real CDP touch. | `LayersPanel.tsx:580-606`, `:416-442` |
| **F2** | correctness | **«Adjust endpoints» is dead.** The button sets `phase='refine'` but never `contactRole='refining'`, so a subsequent drag returns `'pan'` and pans the canvas instead of moving the anchor. | `DimensionTool.ts:402-412`, `:281` |
| **F3** | correctness | **Escape's first rung does not cancel a pending dimension.** It clears `pendingOp` only; the next tap still commits the dimension the user escaped. | `EditorLayout.tsx:230-247` vs `SheetEditor.tsx:1047-1053` |
| **F4** | correctness (geometry) | **Chain locks at the ORIGINAL B after a refine** — `commitValue` uses a `this.b` that refine drags never update. Typed value unaffected. | `DimensionTool.ts:369-384` |
| **F5** | correctness | **The 450 ms settle timer survives a switch to another placement tool**, so the dimension keypad opens over the rectangle tool. Angle's settle *is* cancelled — the omission is an asymmetry. | `SheetEditor.tsx:526-535`, `:262-265` |
| **F6** | undo integrity | **Sub-slop moves mutate outside history**: geometry is applied per move but recorded only if `moved ≥ 8 px`, so undo can delete the object instead of restoring it. | `SelectTool.ts:357-385`, `SheetEditor.tsx:876-891,946-958` |
| **F7** | §4.2 seam | **One-time label layout drifts on zoom** (measured, real pixels): dimension label centre **65.4 CSS px** off at 4×; angle readout **58 px**; a text note's glyphs **167 px** wider than their box at 0.5×. Size is invariant; the *anchor and box* are not. | `renderDimension.ts:49-55`, `renderShape.ts:213-229`, `renderText.ts:88-99` |
| **F8** | gesture | **Hold-to-constrain is dead on the second contact** (tap A, hold at B) — `travel` is measured from the first contact, so it always exceeds the hold slop. | `ShapeTool.ts:194-212`, `:329-342` |
| **F9** | spec gap | **Handles translate; §8.6 requires scale/stretch** — corner/edge drags move the whole geometry, and `handleAxis` maps `n/s→'x'`, `e/w→'y'` (inverted). The §8.6 rotate handle is absent (chips only). | `SelectTool.ts:357-368`, `:113-117` |
| **F10** | doc honesty | **The recorded 1.6 gate was not reproducible from git** (see below). | `BUILD-LOG`, `CONTINUITY` |
| **F11** | doc/copy | `LayersPanel`'s header says the photo row is lockable while the shell no-ops its eye/lock; the closure entry's "row count proves persistence" was overstated. | `LayersPanel.tsx:21-22` |

**F10 is the orchestrator's own error, and it is fixed in this commit.** The 1.6 closure entry recorded
"47 files / 643 tests" measured on a tree that also held three **uncommitted off-critical-path lane**
test files; the committed tree runs **44 files / 565 tests**, and the same bullet's arithmetic
(`526 + 35 + 4`) already summed to 565. **The rule this restores: a recorded gate must be reproducible
from the commit it names** — measure it with only that commit's files present. The `[Surface]` ledger's
"machine half green" for drag-to-reorder was likewise false (F1) and is corrected there. Note the
agent-reported gates from off-critical-path lanes are legitimate *for those lanes* — the error was
folding them into a *slice* gate.

**Verified sound, with evidence** (not merely "not obviously broken"): the §4.2 **size** invariants at
1×/4×/8× (pixel-measured; ink regenerates from the raw `inkPoints`/`pressure` attrs, never from the
derived path, so there is no double division); **`Annotation.visible`** through the zod path
(absent→`undefined`, `false`→`false`; unknown keys still stripped) and through `serialize`/`load`;
the **anchor-based §20.2 reorder** primitives incl. the panel↔shell rest-index translation and the
Send-to-back sentinel; **timer** arming/cancelling (no double-arm, every cancel path clears — the two
timer defects are wiring, F2/F5); `markup.json` persistence (400 ms coalescing, failure re-queues, no
data loss, `sheetIntake` photo-first); the **loupe** arithmetic (all three numbers derived); the
`history` cap/coalescing/redo-clear; the copy contract; `panelDockFor`'s inclusive 1.2 boundary.

**Coverage gaps reported as gaps, not defects:** the "restore does not queue a redundant write" path is
never exercised (every mount harness lands in `'empty'`); `visible`-through-zod had no test (executed
manually, sound); dead exports (`SelectTool.miniToolbarPosition`, `EraseTool.previewName`,
`ShapeTool.shapeReadout`) and an unreachable `markupPointerDown` `'select'` branch.

**Remediation.** F1/F2/F4/F8/F9 are dispatched as one lane on files the in-flight 1.7 integration lane
cannot touch; **F3/F5/F6/F7 are deferred** until that lane lands, because they need `SheetEditor.tsx` /
`EditorCanvas.ts` / `EditorLayout.tsx` and a second writer on those files is the exact hazard D76
already cost this session. F1 needs a **real-input** regression test (CDP), which only the orchestrator
can run.

### D78 — slice 1.7 decisions, and the D77 status update

**The Esc ladder contradicted the spec, and the spec won.** The engine lane reordered `escapeStep` to
`exitFocus` **before** `deselect`, citing a handoff brief and the 1.7 packet's gate wording. **UI §4.2
states the ladder explicitly** — `pending → deselect → exit Focus → navigate`, one rung per press —
and the authority chain puts the **UI spec above the implementation plan** (which is authoritative on
order and done-ness only; its `[x]` gates are not maintained). §4.2's order is also coherent with the
packet's intent: exiting Focus does not itself change the selection, but with a selection present the
first `Esc` *is* the deselect rung. Restored §4.2's order in `EditorLayout.escapeStep`, corrected the
plan's gate wording, and rewrote both tests (the unit test and the browser test that had encoded the
reordered behaviour). **The briefing error was the orchestrator's** — it relayed a lane's phrasing
instead of checking §4.2 first, which is the same failure mode as trusting a lane's report over the
spec.

**Ink inside a scaled inset — measured, and left alone.** Canvas zoom is **constant** (`mu = 10` at
zoom 1 and at zoom 4), so the §4.2 screen invariant holds and the runbook tripwire *"ink/stroke width
changing with zoom"* is **not** tripped. Inset scale is **proportional** (`mu = 10` at inset scale 1 →
`20 px` at ×2), which is exactly what §8.5 specifies ("children are never rewritten when the inset is
moved/scaled/rotated/cropped" — the container scales them). **No code changed**; the behaviour is
pinned by `tests/insetWire.browser.test.ts` so it cannot drift silently. This closes the question the
engine lane raised, with numbers rather than an opinion.

**Children are not sheet-band members.** A child's `zIndex` orders it only inside its inset's Konva
group; the sheet's §20.2 bands apply to top-level objects only. This is enforced structurally rather
than by convention: `moveInBandBefore`/`moveInBandToBack` return `false` for any key containing `/`,
so a cross-band child move is **unexpressible**, and `keysInRect` is tops-only by default (a sheet
marquee must never grab a child) with an explicit `{ insetId }` form for querying one inset's children
in **asset** space.

**The camera has no in-app path for an inset (owed).** `CameraFlow` owns "a photo becomes a sheet" and
cannot hand a normalized blob back without widening its frozen props, so `onPickCamera` opens a hidden
`capture="environment"` file input — a genuine OS camera, but not the in-app viewfinder UI §9:614
describes. Owed: either a `CameraFlow` inset mode that returns the normalized blob, or a spec
amendment. Recorded rather than quietly shipped as equivalent.

**Two structural additions, both reported rather than inlined.** `src/ui/insetWiring.ts` holds the
asset registry (decode off the main thread, session-only recents — there is no index file, §19.3) and
`createFocusAwareScene`, a `MarkupScene` facade that converts sheet↔asset inside Focus and nests
creations through the child APIs; it is transparent when Focus is closed. `Focus` mode's dim is
**opacity** rather than a scrim, so the focused inset's own children stay bright. `SheetEditorProps`
gained an optional `onSceneReady` test seam (the `onImportReady` precedent — additive).

**Deferred gate, explicitly not a pass.** `tests/e2e/layersReorderTouch.spec.ts` is the **real-touch**
proof for D77/F1 (CDP `Input.dispatchTouchEvent`). It is written and wired but marked **`fixme`**: it
stalls in **first-run step 2**, where the stubbed `showDirectoryPicker` returns an OPFS handle that does
not satisfy the step-2 persistence path, so `disabled={busy}` never clears and the editor is never
mounted. The failure is in the e2e bootstrap, **before any of F1's code runs** — the product is not
implicated. F1's *mechanism* is covered by a pure test and by browser tests using a real
`elementFromPoint`, but **neither is a real touch**, which is exactly what made F1 invisible before.
Owed: fix the first-run bootstrap and turn the spec on. Precedent: the CDP renderer-crash harness was
deferred the same way (D53).

**D77 status after this session:**

| Finding | Status |
|---|---|
| **F1** touch reorder dead | **FIXED** (mechanism + pure/browser guards). Real-touch e2e **owed** (`fixme`). |
| **F2** «Adjust endpoints» dead | **FIXED** + browser-tested. |
| **F4** Chain locked pre-refine B | **FIXED** + browser-tested. |
| **F8** hold-to-constrain dead on contact 2 | **FIXED** + browser-tested. |
| **F3** Esc rung never cancels a pending dimension | **OWED** (needs `EditorLayout`/`SheetEditor`). |
| **F5** settle timer survives a tool switch | **OWED** (needs `SheetEditor`). |
| **F6** sub-slop moves outside history | **OWED** (needs `SelectTool` + `SheetEditor`). |
| **F7** label centring / text-box drift on zoom | **OWED** (measured: 65.4 px label drift at 4×, 167 px text overflow at 0.5×; needs `render*.ts` + `EditorCanvas`). |
| **F9** handles translate instead of scale/stretch | **OWED** (spec gap vs UI §8.6; needs `SelectTool` + a geometry-scale helper). |
| **F10** non-reproducible gate number | **FIXED** in the 1.6 commit; the rule is restated there. |
| **F11** overstated doc/checklist claims | **FIXED** (`LayersPanel` header + the ledger row + the BUILD-LOG bullet). |

**Process note for the next session.** Four of the six correctness findings had the same shape: **the
wiring exists, the tests pass, and the real input cannot reach it.** The suite that was green while F1
was dead used synthetic events for a gesture whose semantics depend on **implicit pointer capture**.
When a test drives an input, ask what real input does that the synthetic one does not — and where a
gate depends on browser input semantics, the browser project or Playwright/CDP is the only honest
place to prove it.
### D79 — D77 remediation: F3, F5, F6, F7 and F9 (the remaining five findings)

Three lanes on disjoint file sets, each finding **reproduced by execution before the fix** and each
guard **verified failing pre-fix**. No test was edited to match the code; two tests that *encoded a
defect* were corrected as spec-expectation corrections, with their arithmetic shown below.

**F3 — `Esc`'s first rung never cancelled a pending dimension.** `EditorLayout`'s rung cleared only the
store flag (`pendingOp`), and `SheetEditor`'s own Escape handler deliberately excludes the dimension
(`id !== 'dimension' && markupToolPending()`), so `DimensionTool.cancelPending()` was unreachable: the
machine stayed in `anchorA` and **the next tap committed the dimension the user had escaped away from**.
Fix: `EditorSession` gained `cancelPending()`; `SheetEditor` implements it as `tool.cancelPending()`
(discard an uncommitted A / keep a committed B as the Valueless ghost) plus `cancelActiveMarkup()` when a
markup op is pending; the rung calls `editorSession()?.cancelPending()`. The ladder still advances
**one rung per press** and `escapeStep`'s §4.2 order (`pending → deselect → exit Focus → navigate`) is
untouched. Guard: after Escape the provisional is gone **and** a following tap starts a fresh placement.

**F5 — the 450 ms settle survived a switch to another placement tool.** `cancelActiveMarkup()` covered
every markup tool but **not `dimRef`**, and the dimension's `onToolChange` fired only when the coarse
`activeTool` prop left `'place'` — so `dimension → rect` never cancelled it and **the dimension keypad
opened over the rectangle tool**. Angle was already cancelled; the asymmetry was the bug. Fix: the
dimension machine joined `cancelActiveMarkup()`. `onToolChange`'s documented semantics are preserved and
asserted (a committed B is kept, an uncommitted A is discarded).

**F6 — sub-slop moves mutated the document outside history.** Both writers (`SelectTool.updateTransform`
and `SheetEditor`'s object-first drag) applied geometry on **every** move while recording a history step
only past a threshold, so a ~5 px drag persisted a mutation **unreachable by history** — the first undo
deleted the object instead of restoring it. Fix: both paths now compare the live geometry against the
captured pre-drag geometry and record **exactly one** step iff it actually changed. The invariant is
pinned in both files: *geometry never changes without one matching step, and no step without a change.*
Guards: a sub-slop drag then `undo()` restores the original position and the object still exists.

**F7 — one-time label layout drifted on zoom (the only *measured* rendering defect).** Centred labels
computed `offset = width()/2` **once** at build time, and `applyScreenRules` re-applied
`fontSize = fontSizeMu / s` without re-running layout, so the anchor kept the old half-width: **65.4 CSS
px of centre drift at 4×** on a dimension label, 58 px on the angle readout, and **167 px of glyph
overflow** past a text note's box at 0.5×. Fix: the render modules tag centred labels (`centerAnchor`)
and text-note boxes (`textBoxFit`/`textPill`/`textPadPx`), and the **existing** `applyScreenRules`
chokepoint re-centres and re-fits **after** it re-applies the font — no second chokepoint, and
deliberately **not** coupled to `regenerateInk` (a pinch defers the ink but must keep labels anchored).
Verified: drift 58.8 px → **0.50 px** at 4×; the note's box now contains its glyphs at 1×/4×/0.5×;
the box re-fit reproduces the build-time geometry exactly (`cornerRadius: pill ? h/2 + pad : 4`, the
same `padPx / scale`), so nothing visual changes at any scale. Guard: the §4.2 pixel test gained
midpoint/containment assertions at 1×/4×/0.5× (3 failing pre-fix, 12 passing after); the existing
size-constancy assertions are untouched.

**F9 — selection handles translated; UI §8.6 requires scale/stretch.** `updateTransform` called
`translateGeometryLocal` for **every** handle, so an `nw` corner drag moved the whole object including
the opposite corner; `handleAxis` also mapped `n/s → 'x'`/`e/w → 'y'`, the **translate-era** reading.
Fix: corner = **aspect-locked scale**, edge = **single-axis stretch**, the opposite corner/edge as the
fixed pivot, one undo step; a local `scaleGeometryLocal` sits beside `translateGeometryLocal` (the
frozen `src/domain/**` was not touched and no new module was added). Uniform factor is the **distance
ratio** `s = |target − pivot| / |origHandle − pivot|`, clamped so both edges stay ≥ 1 px; a distance
ratio can never go negative, so a corner cannot flip through the pivot.
*Spec-expectation correction (arithmetic shown):* `tests/markupTools.test.ts` encoded the translate-era
axis semantics, e.g. `axisLockDelta('n', 20, 3, 20, 1) → {dx:20, dy:0, locked:true}`. With a handle now
**resizing**, the natural movement axis of `n/s` is **y** and of `e/w` is **x**, so the corrected rows are
`axisLockDelta('n', 3, 20, 20, 1) → {dx:0, dy:20, locked:true}` (`atan2(20,3) = 81.47°`,
`|81.47 − 90| = 8.53° ≤ 20°`) and `axisLockDelta('e', 20, 3, 20, 1) → {dx:20, dy:0, locked:true}`
(`atan2(3,20) = 8.53°`); `('n', 40, 23, 46, 1).locked === false` (60.1° off-axis), and corners
(`'both'`) never lock. `tests/layersWire.browser.test.ts` likewise asserted *"'a handle drag translates
the selection'"*; it now asserts the §8.6 property, deriving the expectation in-test
(`s = hypot(70,50)/hypot(120,80) = 86.02325/144.22204 = 0.596469`; new nw `x = 120 − 120·s = 48.4237`,
i.e. `x0 + 48.42`, versus the old translate expectation of `x0 + 50` — the pre-correction run failed by
1.5757 px, so the new assertion cannot pass by accident) and that the **opposite corner did not move**.
Guards: all 8 handles dragged (expected corner moved, opposite fixed), aspect-lock, single-axis stretch,
no-flip past the pivot, sub-slop undoability, and a no-op press recording nothing.

**Recorded owed (not silently dropped):**
- **The §8.6 rotate handle** (40 px above the top edge, `°` readout, 0/15/30/45/90 snaps) is still
  absent for the Select tool — rotate exists only as HUD chips. Now recorded explicitly for the first
  time; the Inset tool does have its own rotate arm.
- **Text-box scaling** — `Geometry`'s `text` carries only `at`, so a box resize has no data channel and
  degrades to a translate; it needs a size/rotation field in a later slice.
- **New finding, F7-adjacent (OWED):** the dimension label's **collision-push offset and leader**
  (`labelLayout(a, b, b, scale)`) and the angle's **arc radius** (`12 / ctx.scale`) are computed at build
  scale and are *not* recomputed on zoom, so their screen-space size still drifts. `applyScreenRules`
  cannot fix them (they need the tip and the geometry, not just the font); they need their own pass on
  the same `zoomend` hook.

---

### D80 — C4's machine half measured (provisional; the §21.8 ladder decision stays hardware's)

**Measured** on the dev machine — Intel Core Ultra 5 335 (8 cores), Windows 11 Pro x64, Playwright
1.63.0 / Chromium 153 headless, viewport 1024×768, `npx vitest run --project browser` — on a **4096-px**
sheet carrying **50** annotations (10 dimensions, 5 rect, 5 ellipse, 5 line, 5 arrow, 5 text, 5 angle,
5 freehand ink, 5 highlighter ink). Method: a pan loop (`panBy(2, 0)` + `markupLayer.draw()` per frame),
20 warm-up frames discarded, median/p95 over 100 measured frames.

| path (as labelled in the harness) | median | p95 |
|---|---|---|
| `min(dpr, 2)` — the **real**, unmodified path | 0.6 ms | 1.3 ms |
| ratio 2 — forced via `markupPixelRatio: () => 2` | 0.7 ms | 1.5 ms |
| ratio 1 — forced via `markupPixelRatio: () => 1` | 0.7 ms | 1.4 ms |

The §21.8 bar (**≤ 16 ms**) is **not tripped** at either ratio on this machine (~10–20× margin).
**This is a dev-machine number, recorded provisional, never a pass**: the ladder (drop overlay → 1, then
markup → 1.5, then 1) is a *Surface Go* decision and no Surface Go is available. C4 stays pending
hardware; the number and the harness are logged for that run.

**A correction that closes part of D64.** Headless Chromium **in this repo** reports
`window.devicePixelRatio === 2` (this build machine runs at 200 % display scaling). So the real,
unmodified browser-project path **is** the DPR-2 path, and it is asserted as
`getPixelRatio() === min(devicePixelRatio, 2)`. The long-standing watch item "the §8.1.1
`devicePixelRatio = 2` path is inferred, not measured" is therefore **partially closed**: the DPR-2
*ratio* is genuinely exercised; only hardware's *frame time* for it remains unmeasured (C4). Because no
DPR-1 real path exists here, the ratio-1 row is reachable only by forcing the option, and the harness
labels it as such.

Harness: `tests/editorCanvasPerf.browser.test.ts`. It asserts structural facts (50 markup children, the
expected pixel ratio, painted pixels, ≥ 60 frames) plus one deliberately generous **catastrophic**
ceiling (400 ms ≈ 25× the ladder bar) whose only job is to catch a hang or an accidental per-frame
blow-up. **The 16 ms threshold is never asserted**, so the suite cannot fake the ladder in either
direction.

---

### D81 — B1: the e2e blocker is a browser-level handle-persistence failure, not the harness's step-2 path

The session-12 record said the e2e stalled in first-run step 2 because the stubbed
`showDirectoryPicker` (`() => navigator.storage.getDirectory()`) "does not satisfy the step-2
persistence path", leaving `disabled={busy}` set. **That diagnosis is wrong**, and it was settled by
execution here with three probes (deleted once the finding was recorded):

| Probe | What it did | Result |
|---|---|---|
| **A** (control) | `navigator.storage.getDirectory()` + a plain-object IndexedDB write | fine, page alive; `structuredClone(opfsHandle)` also succeeds |
| **B** (control) | a bare `page.reload()` | fine (a service worker is registered, but not controlling) |
| **C** | `structuredClone(opfsHandle)` OK → `put(handle, 'fm:projects-root')` OK → page **still alive** → the **next page load dies** | Playwright: `Target page, context or browser has been closed`; it cannot even capture a page snapshot |

So: **a page that LOADS with an OPFS `FileSystemDirectoryHandle` stored under the app's root key
(`fm:projects-root`) kills the renderer** in this Chromium build (Playwright 1.63 / Chrome 153,
headless). The crash is on **deserialising the stored handle at boot** — not on the write, and not on
reload itself (probe B). `FirstRun`'s only completion path persists the picked handle, so *no* harness
reaches the editor by completing first-run; and the handoff's alternative, "seed the persisted root
handle directly", fails for exactly the same reason — seeding it is what causes the next load to die.

**⚠ Unverified, and it decides whether this is a product bug.** Whether a **real on-disk** directory
handle — what a user actually picks — behaves the same was **not** established; only OPFS handles are
testable headlessly. If real handles also kill the next load, this is a **product** defect in
`src/settings/projectsRoot.ts` (the app would be unusable after a reload), not a harness limitation.
Recorded as a hardware check in `docs/HARDWARE-TEST-CHECKLIST.md`. `tests/e2e/layersReorderTouch.spec.ts`
stays **`fixme`** with a corrected header, and **the product is not declared exonerated** — the
session-12 sentence "the product is not implicated" is withdrawn as unsupported.

---

### D82 — slice 1.8 (style system): per-tool memory, recents, presets IO, and the one place precision is edited

**Shipped** (packet `docs/implementation-plan.md` 1205-1258; build spec §11.5; UI spec §7):
- `src/state/styleByTool.ts` — `Record<ToolId, AnnotationStyle>` per-tool memory where a tool swap is
  a **return, never a reset** (§7.4 #6), plus **recents** (last 8, deduped, newest-first, filtered to
  those valid for the current tool — §7.3) and the pure derivations the shell needs:
  `selectionStyleState` (none/single/mixed), `applicableFor`, `selectionScope`.
- `src/editor/shapes/styleCommand.ts` + two additive `MarkupScene` methods (`styleCommand`,
  `patchStyleCommand`) — a multi-object style change is **exactly one** undo step, and undo restores
  each object's **own** previous style (not a uniform default). The factories are Konva-free so the
  command semantics are node-testable; the scene delegation is proven in the browser project.
- `src/fs/presets.ts` (+ additive `projectStore` helpers) — named per-tool presets at
  `<project>/.fieldmeasure/presets.json`, written **atomically** (tmp → close → `move()`) under the
  per-project Web Lock, with `folder-unavailable` / `corrupt` error states and a Retry. `createWritable()`
  still exists in exactly one module.
- `src/state/projectMeasure.ts` — the project-level precision / unit-format write path, through the
  existing `persistQueue.queueProject` plus the `useAppStore` mirror.

**The D31 trap held** (the pinned hazard). Verified by reading `DimensionKeypadSheet`: the fraction chip
edits only the **entry's** local slot (`editSlots(... denominator)`); it never calls
`setPrecisionDenominator`, and `precisionDenominator` is a read-only prop used as the parse seed. The
**project** value is written only by the panel's Precision control. Labels re-derive through the existing
`useAppStore → scene.setContext` subscription (idempotent with the helper's direct `setContext`).

**The pinned interface was EXTENDED, not left owed** — recorded decision. `StylePanelProps` gained
`selectionCount`, `selectionScope`, `applyToSelection`, `recents`, `presetsUnavailable`, `appliedToCount`
and their handlers, and `StyleEditorSheetProps` gained a real `onClose` (replacing the
`onOpenEditorSheet`-as-dismiss hack). Rationale: §7.3 **names** the Recents row (and the packet's a11y
gate names its 44 px target), §7.4 states details "the builder must honor" for the count / Deselect /
scope chip / apply toggle, and §7.5 defines the folder-unavailable warn strip. Leaving them owed would
have flattened §11.6 #5.

**Recorded owed instead — no `AnnotationStyle` channel exists in this slice's seam.** The tool-specific
controls the specs list (corner radius, sides, arc radius, chisel width, highlighter straight-line lock,
erase mode/scope, inset border/opacity/crop/shadow, text align/background/leader, elbow) are owed to the
slices that add those fields. **Size + Bold are the only tool-specific keys that exist.**

**§7.2 applicability answers, and two ambiguities reported rather than guessed.** Dimension:
colour/width/arrowheads. Angle: colour/width. Line & Arrow: colour/width/lineStyle/arrowheads.
Rect/Ellipse/Polygon: colour/width/lineStyle/fill/alpha. Freehand: colour/width. Highlighter:
colour/width/**fillAlpha**. Text: colour/fontSize/bold. Inset/Erase/Select/Pan: none.
*Ambiguity 1:* `renderDimension` consumes `lineStyle`/`fontSizeMu`/`bold` and the angle readout consumes
`fontSizeMu`/`bold`, but §7.2 lists **no** such control for those tools → returned the **table-faithful
`false`** (a record, not a silent guess). *Ambiguity 2:* the table lists Highlighter *Transparency* while
`renderInk` consumes only colour/width → `fillAlpha` stays `true` (the table wins).

**Also reported, not invented:** the scope chip labels annotation types with the creating tool's `tool.*`
name (`Text note`, `Image inset`) rather than §7.4's example words (`Text`), because the appendices key
no `annotationType.*` copy.

---

### D83 — slice 1.8 integration: the copy fold, the selection-style mirror, and the gate's split

**The copy fold (orchestrator, byte-checked).** `src/ui/styleCopy.ts` → `STRINGS.style` / `STRINGS.project`,
and the staging module is **deleted** (BUILD-RUNBOOK §11 rule 5). Fourteen keys landed; every value was
compared to the appendix **bytes** with a `node:fs` read (never the console — U+2014 is the trap):
- APPROVED `## style` rows — `widthReadout` (`{widthPt} pt`), `transparencyReadout` (`{percent}%`),
  `mixedValue`, `moreStyles`, `saveAsPreset`, `resetDefaults`, `appliedToSelection`
  (`Applied to {objectCount} objects`), `alsoSetDefault`, `selectionHeader`
  (`{objectCount} objects selected`), `deselect`, `applyToSelection`, `applyToScope`
  (`Apply to: {typeCounts}`), `presetsError` (with its U+2014). The `{token}` forms are the rows'
  **declared interpolation** (the appendix `String` column shows the rendered example), which the copy
  gate compiles to an anchored wildcard.
- APPROVED `## project` — `selectionCount`. **Corrected** from the staged rendered literal `'3 selected'`
  to the declared template `'{count} selected'` (the literal would have rendered «3 selected» for any
  count — the staged lane caught it, the fold preserves the fix).
- gaps §6 — `recentHeader: 'Recent'`, marked `⚠ PROPOSED (C14)`.
- One new **beyond-the-gaps** action name, `toasts.actionChangeStyle: 'Change style'`, under the existing
  `⚠ PROPOSED` marker block, because a style edit on a selection is one history step and the undo toast
  needs a name (the appendix keys none).
`tests/strings.test.ts` passes 3/3 — the contract is machine-checked, not read.

**The selection-style mirror.** `useEditorStore.selectionStyle` (`mode`/`style`/`count`/`scope`), published
by `SheetEditor` — the scene owner — using `selectionStyleState` + `selectionScope`. This follows the
established shell pattern (`keypadOpen`/`layersOpen` are mirrored the same way) and is reset on unmount so
a stale selection style cannot outlive the canvas it described. In `mixed` mode `style` is the
`DEFAULT_STYLE` placeholder and is documented as **non-authoritative** — callers render indeterminate and
ignore it, so no colour is ever invented (§7.4 #2).

**The wiring.** `EditorSession` gained `applyStylePatch` / `applyStyle` / `applyProjectPrecision` /
`applyProjectUnitFormat`; `EditorLayout` mounts the real `StylePanel` (side and bottom docks, `panelDockFor`
geometry and the `data-keypad-open` dim preserved) and the `StyleEditorSheet`; `src/styles.css`'s dead
`.style-chip*` placeholder rules were deleted and the vertical dock sized to UI §7.2's **280 px** (the old
72 px slot was the chip). `onChange` always updates the tool style + recents, and additionally applies to
the selection (one step, `toasts.actionChangeStyle`) when a selection exists and `Apply to selection` is on,
then shows the 4 s applied-to hint — §7.4's rule exactly.

**Deliberate deviation reported:** `SheetEditor` refreshes `projectDirRef.current.file` after a measure
change, because `projectMeasure`'s helpers return only the next context; without it a second change would
re-apply from a stale snapshot.

**Gate: the routing/effect split is explicit.** `tests/styleIntegration.test.tsx` (10 jsdom tests, the real
panel + real stores + a stubbed canvas session) proves the **routing** — mixed reaches the panel and is
**announced** (not merely styled), a swatch calls `applyStylePatch` with the right patch *and* updates the
tool style *and* raises the hint, Deselect clears, Apply-to-selection OFF suppresses the canvas call,
precision routes, the sheet opens/closes, presets load/save, and a heterogeneous selection disables the
wrong control with a reason. The **effect** — every selected object changes, in **one** undo step, and the
indeterminate state clears — is proven by `tests/sceneStyle.test.ts` (node) and
`tests/sceneStyleCommand.browser.test.ts` (real Konva, node rebuild). Neither half alone is the gate; the
pair is.

**Two follow-ups reported, not fixed (neither blocks the slice):** `EditorLayout.applicabilityForSelection`
duplicates `StylePanel`'s private (unexported) `TYPE_TOOL` map — a candidate for exporting that map so the
two cannot drift; and the horizontal dock now auto-sizes (a CSS geometry change, not a panel change)
because the real panel lays its sections out in a row.

### D84 — the full gate caught a browser-only module-linking defect that no per-lane check could see

**What happened.** After lane C3 wired `EditorLayout` → `@/fs/presets`, three previously-green
**browser**-project suites (`insetWire`, `layersWire`, `sheetEditor.dimension`) failed to import:

```
SyntaxError: The requested module '/src/fs/projectStore.ts' does not provide an export named
'resolveFieldMeasureDir'
```

**It was not a source defect, and that was proven rather than assumed.** `tsc --noEmit` was 0; the
rolldown `npm run build` was 0; the node+jsdom run (669 tests, including `tests/presets.test.ts` and
`tests/styleIntegration.test.tsx`, which import and mount the same chain) was green; and an
`import * as projectStore` **namespace probe inside the same browser context** listed
`resolveFieldMeasureDir` among the module's exports. Deleting Vite's optimizer cache
(`node_modules/.vite`, `.vite-temp`) and re-running changed nothing; a second re-run changed nothing.

**Trigger.** The error appeared only once a browser-loaded module first imported `src/fs/presets.ts` —
nothing in the browser graph reached it before C3's change. So the new **edge** in the graph, not the
module's contents, is what broke the link.

**Fix (behaviour-identical).** `src/fs/presets.ts` now takes a **namespace** import and resolves the three
bindings at use time (`projectStore.resolveFieldMeasureDir(...)`, `projectStore.resolveOpenProjectDir(...)`,
`projectStore.writePresetsFile(...)`). A namespace import is not link-time name-checked, so it sidesteps
the failure; the emitted behaviour is the same. Verified: those three suites pass (3 files / 38 tests) and
`tsc` stays 0.

**The root cause was NOT fully isolated — recorded as a watch item, not as a solved mystery.** The leading
hypothesis: Vite's dependency optimizer discovers a new bare import (`zod`, imported directly by
`presets.ts`) mid-run, because `EditorLayout` is **lazy-loaded** and therefore absent from the initial dep
scan, and re-optimizing while modules are already linked produces exactly this class of error. If it
recurs, the candidate fixes are `optimizeDeps.include: ['zod']` (or an `optimizeDeps.entries` scan of the
source graph) in the browser project's config — **not** another source change.

**Why every per-lane check missed it — and why that is the point.** The lane protocol reserves the browser
Vitest project (one canvas lane at a time), and C3, the integration lane, was instructed to verify with
`tsc` + node + jsdom. Both rules are correct, and together they made this failure structurally invisible
until the orchestrator ran the **full** gate on the reconciled tree — the exact step the runbook exists to
enforce. Third time this project has learned that a green subset is not a green gate.

**Carried in the same commit.** The CDP-touch route to F1's real-touch half (dispatched as the B1
alternative once D81 closed off the e2e) was interrupted; the partial browser spec it left behind **ran and
failed** its reorder assertion, so it was **deleted**, not committed. F1's real-touch proof therefore
remains **OWED** alongside D81's harness blocker. That failing run is evidence the CDP route *can* produce
a real touch; it just has not been made to pass.

### D85 — first-run handedness cards: the LEFT-hand card belongs on the left (owner decision; the spec was ambiguous)

The product owner found this by **running the app**, and the DOM confirmed it: the step-1 radiogroup rendered
`[Right][Left]`, so the "Right" card sat on the **left** of the screen. The spec's enumeration — UI §4.4:177
"two big cards (Right / Left)" — was being read as *listing* the options (Right first because Right is the
default), not as pinning screen position. The owner has now decided the position: **the card for a hand sits
on that hand's side** (Left card left, Right card right), which mirrors the layout the answer produces (a
right-handed user's tool rail and style panel swap sides).

**Fix:** the two `<button role="radio">` elements are **re-ordered in the DOM** (`src/ui/FirstRun.tsx`) —
deliberately **not** flipped with CSS. **DOM order is the focus order**, so a `row-reverse` flip would have
made the focus ring travel against the visual order (WCAG 2.4.3); ordering the elements keeps visual order ==
focus order == reading order. `Right` remains pre-selected (`DEFAULT_HANDEDNESS`) — unchanged.

**Guard:** `tests/firstRun.test.tsx` now asserts the **DOM order** (`getAllByRole('radio')` →
`[Left, Right]`). jsdom has no layout, so DOM order is the honest machine-checkable form of "Left is on the
left" (the visual order follows it by construction). The keyboard test now expects the first `Tab` to land
on the **Left** card; it previously asserted Right, which was true of the old order and was **not** a
stronger test — no assertion was weakened or removed.

UI §4.4:177 was **amended in the same commit** to state the arrangement, so the change cannot be silently
reverted by a later reader treating the old enumeration as normative.

### D86 — B1 evidence: a REAL directory handle survives a page load; the OPFS case is the odd one

Reviewing the running product (session 13 follow-up) produced a data point the test harness could not: the
automated browser auto-granted `showDirectoryPicker`, the app persisted a **real**
`FileSystemDirectoryHandle` (name `FieldMeasureVW`, the workspace root) under `fm:projects-root`, and the
page then **reloaded and rendered Home normally** — no renderer death, 11 project cards, and no console error
beyond the known `frame-ancestors` CSP-meta notice.

That is the first evidence on the question **D81** left open, and it points **away from a product defect**:
the renderer death reproduced in session 13 was with an **OPFS** handle written directly by a probe.
> It is **evidence, not proof**: a different Chromium invocation (the review browser, not Playwright's),
> a handle that was *auto-granted* rather than *user-picked*, and a single run.
> The check in `docs/HARDWARE-TEST-CHECKLIST.md` therefore stays, **narrowed** to *"does a user-picked
> folder survive a reload?"*, and that row now records this positive data point so the next session does not
> re-derive it.
### D87 — Home «New project»: app-created, auto-named folder (owner decision; the control had been dead since 1.4)

The owner found this by **using the running app**: `«New project»` — a real, enabled button with approved copy
(`home.newProject`, `src/ui/ProjectList.tsx:182`) — did nothing. `App.tsx` handed it a no-op stub commented
*"slice 1.4 — capture flow"*; **no create-project code existed anywhere in `src/`**; the implementation plan
never described the flow; and **it was not recorded as owed** anywhere. `«Open existing folder…»` was a second
stub in the same block. The class is the *inverse* of D77's "the wiring exists and the real input cannot reach
it" — here the **control** exists and the **wiring does not** — and it is equally invisible to a green gate,
because nothing tested it: nothing owned it.

**Owner decision (asked and answered — not invented):** «New project» creates an **app-named subfolder of the
projects root**. No OS folder picker, no name prompt.

**Implemented:** `createProject(options?: { title?: string }): Promise<CreatedProject>` in
`src/fs/projectStore.ts`. The write goes through the one atomic helper, `writeJsonAtomic`, under the **D51**
runtime key `` `${id}:${folderName}` `` (also the per-project Web Lock key).
- **Naming:** base = the approved copy `STRINGS.home.newProject` (`'New project'`), then `New project 2`,
  `New project 3`, … A candidate is free when `getDirectoryHandle(candidate, { create: false })` throws
  `NotFoundError`; any other error propagates. Bounded by `MAX_NEW_PROJECT_NAMES = 200`, then throws.
- **Never adopts an existing folder** — a "new project" action must not silently reopen old work. Asserted:
  a seeded `New project/project.json` is byte-identical afterwards, and the new folder is `New project 2`.
- **Envelope:** `{ schemaVersion: CURRENT_SCHEMA_VERSION, project: { id: newId(), title, unitSystem:
  'imperial', unitFormat: DEFAULT_UNIT_FORMAT, precisionDenominator: DEFAULT_PRECISION_DENOMINATOR },
  sheets: [] }`. There is **no** file-level `createdAt`/`updatedAt` — `ProjectFileZ` is the authority.
- **`title` defaults to the folder name.** Renaming the *title* later does not rename the folder on disk (the
  spec's own rename copy says exactly that), so a generated folder name is deliberately **not** user-facing
  identity.

**Landing:** the new project's editor. Its empty state already reads `STRINGS.project.noSheetsEmpty`
(«No sheets yet — take a photo to start.») and the top bar carries «Add sheet» → capture, so the flow is made
entirely of approved parts — **no new UI and no new copy**.

**Guard:** a `useRef` makes a double-tap a no-op (two clicks before the first create resolves must not mint
two projects); asserted in jsdom. The button stays enabled — no spinner, no new copy.

**Recorded owed (not silently dropped):**
1. **`«Open existing folder…»` is still a no-op** (`App.tsx`, `onOpenFolder`). Wiring it needs a decision the
   specs do not make: §11.9 says it "opens `showDirectoryPicker`", but it is unspecified whether that
   **re-points the projects root** (hiding existing projects) or **adopts a folder from outside the root**
   (which the root-keyed Home scan does not model). Needs an owner answer or a spec amendment.
2. **A creation failure is silent to the user.** `createProject()` itself never swallows — no root → throws;
   name exhaustion → throws; write failure → throws (via `writeJsonAtomic`) — but the Home caller swallows and
   stays on Home, because this slice has **no error-surface copy**. The toast/autosave layer (**slice 1.10**,
   which already owns the read-only/failed-save state) takes it.
3. The **`New project` button has no busy/disabled visual** while a create is in flight (the ref only blocks
   the second create). Any spinner or disabled state is copy/design work for 1.10, not invented here.

### D88 — The **Project screen** (`/p/:projectId`, the sheets grid) was never built, and no slice owns it

Found by the owner **using the app** on 2026-09-22, asking whether «New project» should open the camera. It
should open the **Project screen** — which does not exist.

**The specs are unambiguous.** UI §4.1's screen table lists **Project `/p/:projectId` — "Sheets grid for one
project. Add sheet, reorder, export, project info."** §11.9 specifies it in full: top bar (`‹ Projects` ·
inline-editable project name · `«N sheets»` · `Export`), a 4-column grid at 1440 (card 320 × 300), each card a
320 × 240 **composite thumbnail** + index badge + inset badge + name/meta line. Its **grid's first two tiles
are always the add affordances** — `📷 «Take photo»` (primary, `--hi` tinted) and `⬆ «Import»` — with the
rationale *"In a field app the 'add' affordance must be the easiest thing on the screen."* Its **empty state
is defined** as *"the two add tiles plus a centered line «No sheets yet — take a photo to start.»"*. And
§11.8:667 fixes capture's return path: *"If this capture was launched from Home/Project, `Use photo` returns
to the sheets grid with a toast «Added «Sheet 05»» + ↶ «Undo»."*

**The build spec already knew.** §20.5, "Screens that had no owner":

> **(a) Project screen (`/p/:projectId`) — the sheets grid.** UI §4.1 and §11.9 define it … but **no slice
> built it**. It owns: the sheet grid, `Add sheet` (→ capture/import), sheet reorder (drag, writes
> `sortIndex`), sheet rename, delete-to-`.trash`, `Export…` entry, and project info. It is now part of
> **slice 1.2** (it is the screen that makes storage visible) with reorder and trash arriving in their own
> slices.

**What actually happened.** Slice 1.2 built `src/ui/ProjectList.tsx` — *Home's* project-card list — and the
plan recorded that work as "create/open project". The Project screen appears in **no slice's file list** in
`docs/implementation-plan.md`, and the miss was recorded **nowhere**: it is absent from DECISIONS, from
`docs/handoff-session-13.md` §9, and from CONTINUITY's watch items. This is the same class as **D87** — *work
that no slice owned* — and it is invisible to every gate, because nothing asserts it. The plan is the
authority on order and done-ness; the build spec's reassignment of this screen to 1.2 was simply never carried
into it.

**The observable consequence (what the owner hit).** `Home → «New project»` lands in the **Editor**, because
the Editor is the only project surface that exists. The editor's empty state reuses the *Project screen's*
empty copy — `STRINGS.project.noSheetsEmpty` («No sheets yet — take a photo to start.»,
`src/ui/SheetEditor.tsx:2031`) — but pairs it with only an **`Import a photo`** button: the promise and the
affordance disagree, and nothing on the screen is a camera. The only route to the camera is the editor top bar
menu's **`Add sheet`** → capture (`src/App.tsx:124`) — itself a stand-in, since per spec *adding a sheet is the
Project screen's job* (capture is entered from Home/Project, or from the Editor only for the inset flow).

Missing with it: **any UI that lists a project's sheets** (there is no sheet-list/grid/switcher component in
`src/ui/` at all), hence no sheet reorder, no sheet rename/duplicate/delete-to-`.trash`, no per-sheet entry, no
selection + batch export, and none of the spec'd `thumb.jpg` composite thumbnails.

**Disposition — the owner must choose (asked; the answer is not yet recorded):**
- **A — build the Project screen (spec-faithful).** A new slice: route `/p/:projectId`; the sheets grid; the two
  add tiles first; the spec'd empty state; the top bar (`‹ Projects` / name / count / `Export`). Navigation
  becomes Home → Project → Editor; «New project» lands there and capture returns there. Watch item: the spec's
  card thumbnails are **photo + markup composites cached as `thumb.jpg`** — a first cut may use the existing
  photo thumbnail and owe the composite, or pull the render pipeline into that route (bundle cost). Sheet
  reorder, the selection bar and the card menus can land in their own slices.
- **B — minimal contradiction-killer.** «New project» opens the **camera** immediately, and the editor's empty
  state gains the spec'd pair («Take photo» + «Import»). Cheap, but a deliberate deviation: §11.8's return
  target (*the sheets grid*) still does not exist.
- **C — smallest.** Leave the landing alone; give the editor's empty state the «Take photo» + «Import» pair so
  the copy and the affordance agree.

**Not a scope question.** v1 scope (§2.4) includes the Project screen; it is **unbuilt, not out of scope**.
Nothing is implemented under this entry — it records the gap, the evidence, and the pending choice.

---

### D89

**`buildPdf([])` produces a one-page blank A4 PDF.** Executed, not assumed: `@cantoo/pdf-lib` substitutes
a 595.28 × 841.89 pt page when a page-less document is saved (`getPageCount()` is 0 before `save()`, 1
after `load()`). Callers must never pass an empty scope; `buildPdfParts([])` returns `[]` and is the safe
path. Pinned in `tests/pdf.test.ts`.

### D90 — D84's recorded root cause is DISPROVED

D84 recorded the cause as "Vite discovers a new bare import (`zod`, imported directly by `presets.ts`)
mid-run because `EditorLayout` is lazy-loaded and absent from the dep scan". All three premises fail:

1. **`zod` was already transitively in the graph.** `src/fs/projectStore.ts` imports `../domain/schema`
   and `src/domain/schema.ts:32` is `import { z } from 'zod'` — so the very module reported as "does not
   provide an export" already pulled it. The chain existed at the parent commit `e104c94`.
2. **`EditorLayout` is not lazy in the failing context.** `lazy()` appears only at `src/App.tsx:29`; all
   three failing suites import it **statically**, so the dep scan sees the whole graph.
3. **`presets.ts`'s direct `zod` import was DEAD CODE** — `z` was never used in the file (only
   `AnnotationStyleZ` from `@/domain/schema`). It has been deleted.

**Therefore D84's recorded remedy, `optimizeDeps.include: ['zod']`, is a no-op.** The root cause remains
unisolated. D84 stands as the record of the failure; this entry supersedes its explanation.

**Import policy, decided:** do NOT spread the namespace import — it is a mute button, not a fix, and it
trades a loud link-time error for a silent `undefined`. `src/export/**` and the Export wizard use ordinary
named imports. If the failure recurs, treat it as a build/tooling defect: the lever aimed at the mechanism
is `optimizeDeps.entries` covering the browser suites, not another source change. **Owed experiment:**
revert `presets.ts` to a named import and run the browser project. If it links cleanly the namespace
import should go; if not, the guard below is load-bearing. Nobody has run this.

### D91

**`loadPresets`'s contract is narrowed: a programming error now propagates.** The namespace import yields
`undefined` for a missing binding rather than throwing at link time, so the resulting `TypeError` fell
into a broad catch and surfaced to the user as **"presets file is corrupt"** (and `loadPresets`'s bare
`catch {}` did the same for `folder-unavailable`). `presets.ts` now has `PresetsBindingError` +
`isProgrammingError`, rethrown before any classification; `EditorLayout`'s save path rethrows it instead
of raising the §7.5 warn strip. Storage failures behave exactly as before. Laundering our own bug into
`{ok:false,error:'corrupt'}` hands the user a Retry button that can never succeed.

### D92

**§9 / §7.2 / §2.4 vs `AnnotationStyle`: the inset Border control is specified, in v1 scope, and has no
data channel.** UI §9 (line 624) and §7.2 (line 431), and build spec §11 (lines 1805, 1976), all specify
`Border (on/off + width + colour)`, Opacity, Corner radius and Shadow for a selected inset. Build spec
§2.4 line 233 puts image insets **IN** v1 with no carve-out. But `AnnotationStyle` has eight keys and none
is a border, `Geometry.image` has no border, and `renderInset.ts` consumes none of the eight — so
`styleByTool.ts`'s `inset: only({})` is faithful to the renderer.

**Visible consequence, now pinned by `tests/typeToolMap.test.ts`:** any selection containing an inset
disables EVERY style control, so Rect + inset shows a truthful scope chip over a completely dead panel.
**Decision: do not change the intersection.** Falling back to "controls the non-inset members share" would
leave an enabled Width scrubber that silently applies to the Rect and silently does nothing to the inset,
while the chip says the inset is in scope — a control that lies about its reach is worse than a disabled
one, and §7.4 #4's premise is that the panel narrows to what is *universally* applicable. The real defect
is the missing **explanation** (§7.4 #4 / §11.6 #5 say "disabled, never hidden", but an entirely disabled
panel gives no summary reason). That needs a copy row in `docs/appendix-strings.md` — owed to the content
owner — and the real fix is an inset-style slice that adds the channel.

### D93

**`PRESETS_DIR` deleted rather than consumed.** It had zero references; the alternative (a test asserting
`projectStore`'s two hardcoded literals agree with it) would need either a `projectStore → presets` cycle
or source-scraping. The drift is already pinned by execution: `tests/presets.test.ts:82-92` writes through
`savePresets` → `writePresetsFile` (which hardcodes `.fieldmeasure` and `presets.json`) and reads it back
through `readPresetsFromDir`, which uses `PRESETS_FILE` — if either literal drifted, the round-trip fails.

### D94

**`StylePanel`'s "never imports `styleByTool.ts`" seam is narrowed, deliberately.** The duplicated
type→tool map (`EditorLayout.TOOL_FOR_TYPE` / `StylePanel.TYPE_TOOL`) is now exported once from
`src/state/styleByTool.ts`. They were byte-identical so they could not disagree yet, but nothing enforced
it: changing `TYPE_TOOL.highlight` to `'freehand'` mislabels the scope chip while the applicability
intersection still uses the `highlight` row, and `tsc`, node, jsdom and browser all stay green (verified
by re-introducing exactly that divergence). `StylePanel` imports one pure data constant — no hook, no
store read, no runtime cycle — and its header records the narrowing. If the seam must stay byte-pure, a
third module both files import is a five-minute change.
### D95

**D84's root cause is ISOLATED by execution, and the D90 experiment has a definitive answer: the
namespace import is reverted to a named import.** The recorded "link error" was never Vite. Six browser
suites (`insetWire`, `layersWire`, `layersReorder`, `markupTools`, `sheetEditor`, `sheetEditor.dimension`)
mock `@/fs/projectStore` with factory functions that list only the bindings each suite drives, and those
factories predate slice 1.8 — so they omit `resolveFieldMeasureDir`, `resolveOpenProjectDir` and
`writePresetsFile`. A `vi.mock` factory replaces the whole module namespace: a named import of an omitted
binding is a **link-time** `SyntaxError` (the exact D84 error), while `import * as` silently yields
`undefined` and the D91 guard throws `PresetsBindingError` at use time. Both recorded symptoms, one
cause. The Linux gate did not surface the resulting use-time rejections; the first Windows run reported
them as 5 unhandled rejections, which is what reopened the case.

Fixes, all executed: (1) the six factories now spread `importOriginal` first and override only what they
drive, plus an explicit `resolveFieldMeasureDir` stub that reports `.fieldmeasure/` as absent (the
suites do not exercise presets), so the failure mode cannot silently re-create itself when a new binding
is added; (2) `presets.ts` is back to an ordinary named import — with complete mocks it links cleanly,
and a named import turns any future missing binding into a loud link error instead of a use-time
undefined; (3) the use-time guard (`requireBinding` + `isProgrammingError`) STAYS — the named bindings
are referenced directly (never snapshotted into an object; a snapshot freezes the values at module-eval
time and blinds the guard against the post-eval hiding `tests/presetsLinking.test.ts` performs — found
by that test failing when the interim version did exactly that). Full gate re-run green on the repaired
tree: tsc 0, vitest 71 files / 1015 tests 0 errors, build 0 (17 precache, 857.62 KiB), playwright 5
passed / 5 skipped.

**Also recorded: the Windows environment facts the handoff guessed wrong.** `core.autocrlf=true` on this
machine silently rewrote working-tree files to CRLF (33 src/test files); the tree was re-smudged to LF
with `git config core.autocrlf false` + `git read-tree HEAD` + `git checkout-index -f -a`. Node on this
box is 24.19.0 (package.json's >=24 satisfied — the handoff's node-22 note does not apply). The CRLF
hypothesis for the link error was tested and DISPROVED: LF made no difference; the mocks were the cause.

### D96

**Slice 1.9 export — the memory and PDF-part boundaries are INCLUSIVE.** `bitmapBytes > 512 MB` refuses
and `== 512 MB` passes; the same for the 250 MB PDF part limit. This matches the plan's literal wording
("if `bitmapBytes > 512 MB`, refuse that M"). Executed at the boundary rather than near it:
`bitmapBytes(16384, 8192, 1)` = 536,870,912 → allowed; `(16384, 8193, 1)` = 536,936,448 → refused;
`(8192, 4096, 2)` = 536,870,912 → allowed. Pinned in `tests/exportInvariance.test.ts`.

### D97

**`EXPORT_JPEG_QUALITY = 0.92`.** The spec fixes no export quality. The working image is already JPEG at
0.88 (`normalizeImage`), so the composite is re-encoded slightly higher to keep second-generation loss
under the first. Provisional — a `[Surface]` visual check can move it.

### D98

**The dimension label's halo and hairline are markup-unit sizes (`strokeWidthMu`), not constants.**
Found by running `tests/renderStage.browser.test.ts`, which its lane could not run. The halo
(`strokeWidth: 8`) and the `--sel` hairline (`strokeWidth: 1`) in `src/editor/shapes/renderDimension.ts`
carried no `strokeWidthMu` tag, so `applyExportRules` left them at 8 px and 1 px in the bitmap at EVERY
multiplier while the glyphs scaled `mu × M` — the label's outline was physically THINNER at 2× and 3×,
i.e. the §4.2 invariant failing for the label itself. Both are now tagged. **Screen behaviour is
unchanged**: `applyScreenRules` re-applies `strokeWidth = strokeWidthMu`, which is the same 8 and 1 it
already used, so this is export-only in effect.

### D99

**The export browser guard measures the label's HALO, not its white glyph fill — and the reason is
executed, not reasoned.** Same node, `fill:#FFFFFF` + `stroke:#2FD4E0 1px`, on a black page:

```
fontSize 18 -> 0 px over threshold 200, 15 px over 150, 43 px over 100
fontSize 54 -> 599 px over threshold 200
```

At 18 px the glyph stems are ~1 px wide and the 1-px hairline blends with essentially every fill pixel,
so none reaches `r,g,b > 200`. A white-fill detector therefore reports "no label rendered" at M=1 and a
real label at M=3 — failing the ratio for a reason unrelated to the export rules. **The product was never
broken here; the first detector was.** Recorded because the same wrong conclusion was reached once during
this session and corrected by measurement.

### D100 — decision numbering reconciled after the parallel-branch merge

`main` and `claude/amazing-carson-ocp8q7` diverged at `4a12168` and each allocated `D85`–`D88`
independently, so the merge commit `2e7a43a` shipped **two different `D85`s, `D86`s, `D87`s and `D88`s**.
The numbering is reconciled by keeping `main`'s four entries where they were recorded and moving the four
conflicting **export-side** entries to the next free numbers:

| As recorded on the branch | Now | Subject |
|---|---|---|
| D85 | **D96** | the 512 MB / 250 MB export boundaries are inclusive |
| D86 | **D97** | `EXPORT_JPEG_QUALITY = 0.92` |
| D87 | **D98** | the dimension label's halo/hairline were untagged (`strokeWidthMu`) |
| D88 | **D99** | the export browser guard measures the halo, not the white glyph fill |

Everything else on the export side keeps its number (`D89`–`D95`; `D90`'s owed experiment is answered by
`D95`). Why this direction: it is the smallest blast radius — four headings move and **no source or test
comment is touched**. The alternative (shifting all eleven export entries to `D89`–`D99`) rewrites ~16
comment lines across `src/fs/presets.ts` and six browser suites for the same result. The only external
reference updated is `docs/HARDWARE-TEST-CHECKLIST.md` H21 (the C6 ceiling row, which cites the 512 MB
figure). Historical commits that used the old branch numbers are left exactly as written; this entry is
the map.

### D101 — review finding F1 is a FALSE POSITIVE: a `Konva.Text` cannot disable stroke scaling, so the `strokeWidthMu` tag is inert (corrects D98)

The independent review of the session-14 export batch recorded **F1** as a §4.2 defect: `renderShape.ts`'s
angle readout is a `Konva.Text` with `stroke: LABEL_HALO, strokeWidth: 4` and no `strokeWidthMu` tag, and the
reviewer's execution walk of `applyExportRules` concluded the halo therefore stays 4 bitmap px at every M
while its glyphs scale `18 × M` — "the outline's physical size shrinks 3× from M=1→3". The finding was
treated as stop-class and dispatched as a fix.

**Executed counter-evidence (browser project, real Konva + real rasteriser):**

1. `node_modules/konva/lib/shapes/Text.js:639-643` — `getStrokeScaleEnabled()` **returns `true`
   unconditionally**, with Konva's own comment "*for text we can't disable stroke scaling; if we do, the
   result will be unexpected*". Setting `strokeScaleEnabled: false` at build time is ignored, and so is the
   setter afterwards.
2. Both seams guard the tag on that getter — `renderStage.ts:252` (`applyExportRules`) and
   `EditorCanvas.ts:226-232` (`applyScreenRules`) apply `strokeWidth = strokeWidthMu` only when
   `strokeScaleEnabled() === false`. **For a `Konva.Text` that branch is unreachable**, so the tag is inert
   on both paths: the prescribed one-line fix provably changes nothing.
3. The export stage scales the layer itself (`renderStage.ts:395`, `layer.scale({ x: m, y: m })`), so a Text
   stroke is multiplied by the layer transform. Measured halo run thickness through a glyph stem, angle
   label, over a black photo: **M=1 → 5 px, M=2 → 8 px, M=3 → 13 px** — `4 × M` within one AA pixel, and
   **byte-identical with and without** the prescribed tag. The exported artifact was never wrong.

**Decision: F1 is recorded as a false positive; no source change.** The reviewer's chain was attribute
arithmetic at its final step — the exact class the review brief's own question 6 warns about, and the
second time this project has caught it (D88). Instead of a "fix", a regression guard is kept:
`tests/renderStage.browser.test.ts` now measures the angle label's halo at M = 1/2/3 **in pixels**, so a
future change that really breaks the invariant fails loudly. F2 (the stale rationale comment) was re-worded.

**Correction to D98** (branch `D87`): the dimension halo/hairline tags are inert **for the same reason**.
The physical result D98 wanted — halo at `8 × M`, hairline at `1 × M` in the exported bitmap — was already
happening through the layer transform. D98's *outcome* stands (the export is correct); its *explanation*
("without this tag `applyExportRules` leaves it at 8 bitmap px") is disproved by execution. The tags stay in
place as documentation of intent, not as the mechanism.

**New, real, and cosmetic (owed):** because the tag cannot be honoured for `Text`, the on-screen label halo
and hairline scale with **canvas zoom** (`EditorCanvas.ts:453`, `stage.scale({ x: next })`) instead of being a
constant `mu` CSS px — at fit zoom (≈0.25) the dimension label's 8-mu halo renders ≈2 CSS px, and at 8× it
renders ≈64 px. That violates §4.2's *screen* intent for label outlines. It is **not** a wrong measurement
(the glyph fill is correctly counter-scaled by `fontSize = mu / s`, and the export path is correct), so it is
scheduled with the 1.10 polish/a11y pass rather than blocking the beta. The fix mirrors the existing
text/ink handling in `applyScreenRules`: for a `Konva.Text` carrying `strokeWidthMu`, set
`strokeWidth = mu / scale` (the layer multiplies it back), leaving the export path untouched.

### D102 — the owner's D88 answer (option B), and the beta-honesty rule for unbuilt controls

The owner answered D88's open question by choosing **option B**: **«New project» opens the camera
immediately**, and the editor's empty state gains the spec'd add pair («Take photo» + «Import»,
UI §11.2:684). Landed: `App.handleNewProject` sets `captureOpen` on a successful create, so a new project
lands on the viewfinder; cancelling falls back to the editor's empty state. The pair is wired through one
`onTakePhoto` seam (`App → EditorLayout → SheetEditor`) so exactly one capture dialog exists, and both
buttons use approved copy (`project.addTakePhoto`, `capture.importButton`). **The Project screen stays
unbuilt** (D88's gap is unchanged): for v1's field flow the editor is a sufficient landing, but the screen is
still the spec'd home of a project's sheet grid and its two add tiles.

**Beta-honesty rule (recorded because it changes shipped behaviour, temporarily).** A control whose handler
is a stub must never be left looking live. All three folder-affordances — the Home secondary card, the
Home *empty-state* button, and a card's «Locate…» on a moved folder — are therefore **disabled with
`aria-disabled="true"`, keyboard-skipped, copy and prop retained**; they are not hidden and not deleted.
Folder adoption is unbuilt (`App.onOpenFolder` is a no-op) and handoff-13 §9.2 row 18's question — does the
picker re-point the projects root, or adopt a folder from outside it? — is still open. The disabled state is
the interim; the slice that answers the question re-enables them.

### D103 — the owner-reported dead «New project» button: the §5.2 gesture re-grant had no caller, and the caller swallowed the throw

**Symptom (owner, running the app):** clicking «New project» did *nothing* — no navigation, no error, no
message.

**Root cause, two layers, both executed:**

1. **The caller could only ever look dead.** `App.handleNewProject` wraps the whole flow in
   `try { … } catch { /* stay on Home */ }` — the slice-1.10 error surface is owed, so every failure is
   silent by construction.
2. **Underneath, the create genuinely threw.** Chromium restores a persisted directory *handle* across a
   page load but **not** its write *grant*: `queryPermission()` returns `'prompt'` and the first filesystem
   call throws `NotAllowedError`. §5.2 step 3 accounts for this — re-acquire permission **from a user
   gesture** — and the implementation exists as `FsaBackend.requestAccess()` (`backend.ts:108`). **It had no
   caller anywhere in `src/` or `tests/`** (only a comment in `projectStore.ts:59` referred to it), so
   nothing ever re-granted after a reload. The first filesystem call in `createProject` therefore threw
   `NotAllowedError`, which layer 1 ate.

**Fix (executed, in `src/fs/projectStore.ts`):** `ensureRootAccess({ request?: boolean })` — a
backend-agnostic grant that reports, short-circuits while the grant is held (`queryPermission` first, so a
held grant never re-prompts), asks inside a gesture's activation window when it is not, and **swallows the
"no transient activation" rejection** so a non-gesture caller behaves exactly as before. It reports `true`
for a root with no permission API (OPFS / non-Chromium), so it cannot become a new failure mode there.
`createProject` runs it before touching the folder and turns a refusal into a typed
`StorageWriteError('permission')` rather than a silent no-op; `resolveOpenProjectDir` runs it best-effort, so
**opening an existing project after a reload also re-grants** — its failure path is unchanged and the
editor's «Retry» (itself a gesture) now recovers.

**Evidence:** the fake models the reloaded state (handle present, `queryPermission → 'prompt'`).
`tests/createProject.test.ts` +3 (grant-then-create; short-circuit while held; refusal is a typed error and
writes nothing — nothing is created when the grant is refused). `tests/projectStore.test.ts` +2 (the open
path asks and resolves; a rejected `requestPermission` from a non-gesture caller stays quiet). **42/42 node
tests green**, and the pre-existing `'no projects root is open'` throw is preserved (its test is untouched).

**Owed, not dropped:** the *user-visible* half is still missing — a refused grant, or a root that is
genuinely broken, is still silent, because that surface belongs to 1.10's error/toast layer (`App.tsx`).
Also in scope for that layer: Home's project list is unreadable until a gesture re-grants, so it can look
empty on a freshly reloaded page.

### D104 — slice 1.10 themes: Sunlight and Dim are token-level, and their absence was a wiring gap, not a missing control

**Built:** `data-theme` on `document.documentElement`, applied by a single `useThemeRuntime()` at the app
root (`src/ui/themeRuntime.ts`) that re-applies on `appStore.theme` changes and hydrates the persisted
choice on boot through the existing `getTheme()` helper. `src/styles.css` gains `:root[data-theme='sunlight']`
and `:root[data-theme='dim']` token blocks. The Settings → Display → Theme `ChoiceRow` **already existed**
with `role="radiogroup"`/`rule="radio"`, `aria-checked`, 48 px targets and the global focus ring — it was
inert only because nothing applied the theme, so no Settings edit was needed.

**Two invariants, both machine-checked (`tests/theme.test.ts` pins the CSS text):**
- **Standard is untouched** — `theme.test.ts` asserts the shipped `:root` values **byte-for-byte** and that
  no rule keys off `data-theme='standard'`; the overrides sit after `:root`.
- **Meaning colours are not re-themed** — `--hi`, `--hi-d`, `--sel`, `--sel-d`, `--ok`, `--warn`, `--err`
  are identical in both themes. The measurement ink (orange stroke, cyan `--sel`, `--hi` tint) carries
  information; a theme that re-tinted it would change what the drawing says.

**Contrast is computed, not seen:** Sunlight maps chrome to `#000000` and text to `#ffffff`/`#f2f5f8`
(`--g100` 21.0:1, `--g600` 18.3:1 on black) and thickens the focus ring to 3 px (2 px loses its edge in
glare); Dim lowers luminance while holding AA (worst case `--g400`/`--g900` 4.9:1, the 11–13 px labels;
`--g100`/`--g750` 13.2:1). **The `[Surface]` porch check is deferred and never claimed.**

**Found while doing it, recorded for the design pass (not fixed here):** several controls pair the unchanged
accent `--hi` with white text at 2.6:1 — pre-existing and identical in Standard, so it is a design decision
about an "on-accent" colour, not a theme bug; the floating canvas HUDs use hardcoded `rgba(...)` surfaces
and borders, so they do not re-theme (a tokenisation follow-up); and §14.2's Sunlight **64 px target floor**
and **2.5 px icon strokes** are component-level rather than token-level. Copy: the appendix carries no theme
labels (they are backticked, not quoted, in its gaps list) — the three existing `⚠ PROPOSED (C14)` rows in
`strings.ts` were used, and `tests/strings.test.ts` stays green.

### D105 — `npm run dev` can never render styled: the shipped CSP blocks Vite's injected inline styles

**Found while helping the owner look at the running app.** `npm run dev` served an app that mounted
correctly with **no styles at all** — verified in a real Chromium tab: `#root` had children (first-run
rendered), one `<style>` element carried 27,667 characters of CSS, `document.styleSheets` was **empty**,
`body` computed to `Times New Roman` on a transparent background, and the console reported:

```
Applying inline style violates the following Content Security Policy directive 'style-src 'self''.
```

**Mechanism, and why no gate ever saw it:** `index.html` carries the CSP as a `<meta http-equiv>` (since the
scaffold commit, `cc6e79e`) and Vite's **dev** server injects CSS as an inline `<style>` element. `style-src
'self'` without `'unsafe-inline'` (or a matching nonce/hash) blocks it, so **every** dev-mode stylesheet is
dropped. The production build emits a real `assets/*.css` file loaded with `<link rel="stylesheet">`, which
`'self'` permits. Every machine gate — Playwright, the CSP-as-a-test specs, the browser Vitest project —
runs against the **built** app or in a context without that meta, so this has never been observed by the
suite. It is a genuine blind spot of the shape the reviews keep naming: *the gate can only see what it
asserts, in the environment it asserts it*.

**Decision / convention (recorded so nobody re-discovers it):** manual inspection uses the **built** app
(`npm run build && npm run preview`), which is also what ships to the Surface. `npm run dev` remains useful
for HMR-driven development but must not be used to judge appearance. A deliberate follow-up, if dev-mode
styling is wanted: a `serve`-only `transformIndexHtml` that relaxes `style-src` (e.g. a dev nonce via
`html.cspNonce`) — **the shipped CSP must not change**, and the CSP test must keep asserting the built
output. Not done in this pass: it would alter the dev config while a build was being produced, and the
built-app path already serves human inspection honestly.

### D106 — slice 1.9 wiring: `runExport`, the three entry points, and the decisions the spec does not pin

**Shipped:** `src/export/runExport.ts` (the orchestration the wizard's injected props always needed),
mounted statically in `EditorLayout` in a positioning-only slot (the wizard is its own sibling dialog,
`z-index: 60`, capture-phase `Esc` — no second `role="dialog"`), and the three in-editor entry points —
the top-bar **Export** button (now enabled when a handler is supplied), **`Ctrl+E`**, and **`⋯ → Export`**
(using the already-approved `a11y.export`, no new copy). `SheetEditor` gained one additive seam,
`onExportSource`, publishing the sheet list (**working-image px, never the M-scaled bitmap**),
`currentSheetId`, a live annotations reader, the session asset provider and the persist `flush`.

**Verified invariants (executed):** one sheet at a time, each bitmap freed before the next; `buildPdfParts`,
never `buildPdf([])`; **every byte through `projectStore.writeAtomic`** under the per-project lock
(`createWritable` still exists only inside `projectStore`); per-file failures become **rows**, never a
rejection; `conflictName` applied against the destination's **real** listing; the engine is lazy
(`await import('./pdf')` / `('./png')`) while the wizard stays static. The load-bearing browser assertion:
a 400×300 sheet at M=2 exports a **300 × 225 pt** PDF page — a bitmap-derived page would be 600 × 450, and
that is the trap that silently breaks the slice.

**Decisions the spec does not pin (recorded here so they are choices, not accidents):**
1. **Aggregate filenames.** Per-sheet files use `{project}_{index}-{sheet}` (index `01`-padded). Where
   `{index}`/`{sheet}` have no meaning — a single multi-page PDF part, the PNG zip — the name degrades to
   `{project}` (`Riverside.pdf`, `Riverside.zip`). Split parts stay the plan's fixed `part-01.pdf`….
2. **`estimate`'s byte factors are documented estimates, not measurements** — `2 B/px` (PNG) and `0.5 B/px`
   (JPEG q0.92) over `w·h·M²`. Owed: a real measurement on a Surface (H21's neighbour).
3. **The remembered destination is session-scoped.** Persisting it across sessions needs new storage keys;
   reported rather than invented.
4. **The 240-char full-path cap is not applied.** `joinFilename` already caps the base, and no approved
   string exists for "name was shortened" — a content-owner gap, not a code decision.
5. **The 250 MB PDF-split branch is node-tested for naming only** (`pdfFileNames`); it is not exercised at
   250 MB end to end.
6. **`disk-full`'s `shortfallBytes` is never populated** — there is no free-space API, so the wizard's
   shortfall row will not show a number.
7. **`retryFile`'s happy path is not machine-tested** (forcing a write failure in the fake FS was not done),
   and it re-writes to the already-resolved name without a second conflict check.
8. **`assetProvider` is disk-backed (review F3 closed the hard way).** It decodes every referenced
   `assets/<id>.jpg` **before** a sheet renders, seeded synchronously from the editor session registry — so
   an inset exports its photo, not the `#3A3F46` placeholder. It closes **only** bitmaps it decoded; a
   borrowed session bitmap is never closed (a real bug found in review and regression-tested).
9. **The trap-5 tooling lever, applied:** the browser project now pre-bundles
   `optimizeDeps.include: ['@cantoo/pdf-lib', 'fflate']`. Without it, Vite discovered `pdf-lib` **mid-run**
   through the new dynamic edge and reloaded the test iframe, killing a sibling suite — the recorded D90
   step-2 lever, and *not* another source workaround. Re-run green from a cold `node_modules/.vite`.

**Owed and recorded:** pixel-level proof that an inset exports its **photo** rather than the placeholder
(the run proves the asset is decoded and the borrowed bitmap survives; it does not sample the exported
pixels) — a review-lane follow-up. `[Surface]`: real `showDirectoryPicker`, real on-disk `move()` and NTFS
conflict behaviour, and H19–H22 generally. Also owed from the visual review of this pass: the Sunlight
**64 px target floor** and **2.5 px icon strokes** are component-level, not token-level (§14.2).

### D107 — slice 1.10 trust layer: the autosave chip, single-instance toasts, and the silence that was closed

**Built:** the §13.1 **autosave chip** (`src/ui/AutosaveChip.tsx`) and the §13.4 **toast system**
(`src/ui/Toast.tsx`), plus the bus they run on (`src/editor/session.ts`), mounted from `EditorLayout`.

- **The chip renders state, it never owns it.** `persistQueue`'s `storageStatus` remains the sole writer;
  the chip is presentational and renders every union member — `saved` · `saving` · `pending` · `readonly` ·
  `error (+ Retry)` · `full` · `offline`. **Read-only is not an error**: an absent writer lease now maps to
  `storageStatus: 'readonly'` and the queue's `onStatus` is gated so it cannot overwrite that state.
  **Nothing optimistic:** the chip renders *nothing* until a real `… → saved` transition resolves after
  mount, then stamps that resolution's clock. Consequence, accepted: a project opened with no edits shows no
  chip until the first write lands (the queue exposes no last-saved time, so the timestamp is chip-local and
  resets on remount).
- **Toasts are single-instance by construction.** One message and one timer live in the component, so
  stacking is structurally impossible; a new toast **replaces** the current one and closes the replaced
  toast's action window (that is the point — a second toast must not leave a stale undo armed). 8 s normally,
  10 s when the toast carries an action; the timer is cleared on replacement and on unmount; the action is a
  real 48 px `hit-slop` button; focus is never moved, so a toast cannot fight the keypad sheet.
- **The silence is closed (D103's owed half).** `App.handleNewProject`'s catch — which swallowed everything
  and made a failed create look like a dead button — now raises an urgent toast using the already-existing
  `⚠ PROPOSED` `errors.projectUnavailable`, and Home mounts a `ToastHost`. The editor's project-load catch
  says the same thing while keeping its inline error panel.
- **Recoverable-delete policy actually enforced.** Erase-delete and select-delete now raise a toast with a
  **real Undo** that calls `history.undo()`. This also corrected a pre-existing lie: the erase toast showed
  `toasts.undoAction` ("Undid: …") **on deletion**, i.e. it claimed an undo had happened when the object was
  simply gone. Recoverable-vs-irreversible is a do-not-simplify item; this is the recoverable half working.
- **Best-effort pause fix included:** the session gained `retrySave()` (chip Retry → `persistQueue.flush()`).

**Spec divergence resolved (§13.3 vs §13.4):** §13.3 lists an object-delete toast at 8 s while §13.4 makes
*any* action-carrying toast 10 s. **§13.4 wins** — an undo window is exactly the case the longer timing
exists for. Recorded here so the choice is deliberate rather than accidental.

**Owed, explicitly (do not assume built):**
1. **The History flyout is NOT built.** The plan's item 1 includes "tap → History flyout" with whole-sheet
   snapshot restore; no such UI exists and `writeHistorySnapshot` still has **no caller**. The chip ships
   without its flyout.
2. **The browser-only undo round-trip is unproven by execution.** The jsdom tests prove the wiring and the
   callback dispatch; the path where a toast's Undo reaches a real `history.undo()` through a Konva-backed
   tool was reasoned, not executed (the lane added no browser assertion).
3. **`retrySave`'s error path** (a flush that fails again) renders the chip back to `error` — asserted in
   jsdom only.

### D108 — the torch toggle must reflect the hardware (and the "work light" is not in v1 scope)

Both items come from the owner-requested read-only investigation in
`docs/investigation-torch-and-capture.md`, which asked the next session touching this file to number them.

**1. The torch toggle could report success when nothing happened — fixed.** `applyAdvanced` swallowed every
rejected constraint and returned `void`, and `toggleTorch` flipped its own state *before* the call, so on a
platform that does not expose `torch` (Windows tablets do not: the browser camera stack withholds the
capability, so `applyConstraints({ torch })` rejects) the button showed **active over an unlit LED**. The
toggle now reflects the **hardware**: `applyAdvanced` reports whether the device accepted the hint, and
`toggleTorch` takes its state from that result, falling back to off whenever the hardware refuses. The
best-effort behaviour is unchanged — a rejected hint still never breaks the viewfinder. Evidence:
`tests/cameraFlow.test.tsx` gains two cases (refused → the button stays off; accepted → it stays on);
`cameraFlow` + `cameraFallback` are 20/20 green.

**Deliberately not done: capability-gating the button** from `caps.torch === false`. The button would then be
disabled on the target hardware — which is arguably more honest than an always-enabled control that always
reverts — but a disabled control needs an explanation, and `docs/appendix-strings.md` carries no string for
it. Inventing one is forbidden, so this is **owed to the content owner**; the revert makes the control honest
in the meantime.

**2. A screen-brighten "work light" is NOT in v1 scope.** §11.8 and the §2.4 scope table specify the capture
toggles as torch / grid / level / flip / resolution; a pure-software work light is a **new feature**, not a
fix, and the authority chain requires a §2.4 amendment (then a spec change) before any code. Recorded as a
candidate for a later slice, not built, and not smuggled in under a bug fix.

**Still unverifiable here:** whether the owner's Surface Go exposes `torch` at all remains a `[Surface]`
measurement (the e2e device-caps probe has no usable camera). The fix makes the control honest in either
outcome rather than assuming one.

### D109 — independent review of the export wave: the register, its resolutions, and a discharged owed item

**Method.** The review ran at the wave's revision (`6c3bc1d`) in a **pinned clean worktree**, because the main
tree had already moved two commits on — isolation, not inspection. Every claim below was executed; the
reviewer's scratch harness is reproducible.

**Verified sound (executed, not read).** The physical-size invariant end to end: the PDF page is
**300 × 225 pt at M = 1, 2 and 3** for a 400×300 sheet (`runExport` passes the working size, `renderSheetJpeg`
echoes `imageWidthPx`, `pdf.ts` multiplies by 0.75). The §4.2 stroke/glyph/angle-halo pixel ratios are
rasterised and measured. **The owed pixel proof from D106 is discharged — and now permanent:**
`tests/runExport.browser.test.ts` asserts that an inset exports its **photo** (a red `assets/<id>.jpg` gives an
inset-centre pixel of `[254,0,0,255]`) while the missing-asset control gives `[58,63,70,255]` — exactly
`#3A3F46`, the placeholder this was written to catch. Also sound: `assetProvider` lifetime (a borrowed session
bitmap survives two runs untouched; disk-backed assets are re-decoded per run and closed each time; a damaged
photo yields the white page with `sheetsWithoutPhoto: 1`); per-file failure rows
(`QuotaExceededError → disk-full`, `NoModificationAllowedError → locked`, `NotAllowedError → permission`, and
`retryFile` re-writing the retained bytes); conflict policy against a real listing including the NTFS
case-fold (`RIVERSIDE.ZIP` → `Riverside (1).zip`); the **lazy-engine failure path** (mocked chunk throw →
`runExport` rejects, writes nothing, and the wizard returns to Destination with its run-failed alert — an
honest failure, not a dead dialog); split/naming boundaries; the three themes (nothing keys off
`data-theme="standard"`, the seven meaning colours are byte-identical across all three); the D103 permission
fix; and write integrity (`createWritable()` exists only in `projectStore`; every new write goes through
`writeAtomic` under the per-project lock).

**Findings, and what happened to each:**

| # | Finding | Resolution |
|---|---|---|
| F1 | «Include sheet names in pages» was a **dead control** — nothing consumed `includeSheetNames`; the PDF had no captions | **Disabled honestly** (the D102 pattern) and **owed**: where a caption sits relative to a full-bleed sheet image is a UI-spec decision, so implementing it here would be un-reviewed design |
| F2 | A revoked grant at the **tmp-handle** stage escaped as a raw `NotAllowedError`, so the exporter reported `unknown` and the wizard offered «Retry» instead of «Re-authorize» | **Fixed at the contract:** `writeAtomic` now creates the tmp handle *inside* its `try`, so it classifies as `StorageWriteError('permission')`. Semantics unchanged (tmp kept, target never deleted). Pre-fix: 1 failed / 30 passed with the raw error escaping |
| F3 | A scope emptied mid-flight wrote a **22-byte empty archive as a SUCCESS row** | **Fixed:** the zip write is skipped when there are no entries, mirroring the PDF branch (pre-fix: 3 failed / 10 passed in the browser suite) |
| F4 | A `'skip'` conflict wrote nothing **and reported nothing** — "Wrote 0 files" with no explanation | **Fixed:** a `{ skipped: true, bytes: 0 }` row plus a progress event in both branches; the wizard's count excludes skipped rows and offers no Retry for them. The row's word (`Skipped`) and glyph (`–`, U+2013) are **⚠ PROPOSED (C14)** rows — gap §17 keys only ✓ / … / ✕ — folded from the lane's staging module and deleted after the fold |
| F5 | The Dim theme's comment overstated its arithmetic («nothing drops below AA», unnamed surfaces) | **Reworded:** each ratio names its surface (`--g100`/`--g750` 13.18; `--g300`/`--g900` 7.98 and `--g750` 7.08; `--g400`/`--g900` 4.90), and the AA claim is scoped to shipped pairings, naming the one sub-AA pair (`--g400` on `--g750` = 4.35) and the tightest real one (`.tool-group-header` on `--g850` = 4.73). Tokens untouched |
| F6 | `estimate` reports **1 file** for a PDF that may split into N parts, so «Will write 1 file» can be wrong | **Recorded here** — computing parts needs a render, which is not worth it. D106 #5 already covers the unexercised split |
| F7 | The `data as unknown as BlobPart` cast looked redundant | **Kept, and it is load-bearing:** removing it fails `tsc` (TS 5.9's generic typed arrays — `Uint8Array<ArrayBufferLike>` is not assignable to `BlobPart`). Type-only, zero runtime effect |

**Watch item (not a finding).** The reviewer once saw a full-suite run fail 7 files / 35 tests and never
reproduced it — not on identical re-runs, not per-project. The trap-5 mid-run iframe-reload class is the prime
suspect despite the `optimizeDeps` lever. Recorded as flaky-until-explained rather than dismissed.

### D110 — every Home card stated fiction: the appendix's EXAMPLE was shipped as the template

**Found by loading the built app**, not by a test: Home showed `.git`, `.github`, `.dist` … each advertising
**"12 sheets · 48 MB · 2:14 PM"**.

`src/ui/strings.ts` shipped `projectCardMeta: '12 sheets · 48 MB · 2:14 PM'` — the appendix's **`String`
column**, which is a *rendered example*. Its **`Interpolation` column** declares
`{sheetCount} · {size} · {time}`, and `ProjectList` already passes the real parts
(`sheetCount: card.sheetCount, size: '—', time: '—'`). With no tokens in the value, `t()` interpolated nothing,
so the example rendered verbatim on **every** card. `tests/strings.test.ts` even documented this row as a
sanctioned "rendered example stored literally" case, which is why the gate was green while the UI lied — the
same shape as D88's "the product was never broken; the first detector was ours".

**Fix:** the shipped value is the template, and the copy test's rule is now form-agnostic (a value with a token
compiles to the anchored regex; a value without one must match the appendix byte-for-byte). Verified:
`strings.test.ts` 3/3 green with the template, `projectList.test.tsx` 11/11. Unreadable folders now read
`0 sheets · — · —`, which is honest about both the scan failure and the size/time gap.

**Not a defect, but worth knowing:** the owner's own Home was pointed at the **source repository** (hence the
`.git`/`dist` cards). The control to change it exists — **Settings → Storage → «Change folder»**. No code
change; recorded so the next person sees a clean Home after one click.

### D111 — the Project screen (the sheets grid) is built: the owner chose D88's option A

D88 recorded that the Project screen (`/p/:projectId`, the sheets grid) was **unbuilt and owned by no slice**,
while UI §11.2 and build spec §20.5(a) both define it. The owner has now chosen **option A — build it** — and
it ships in this wave.

**Built:** `src/ui/ProjectScreen.tsx` + `projectScreen.css` (the grid, the two add tiles first, per-card
selection, honest empty/loading/error states), `src/fs/projectSheets.ts` (a **read-only** loader: `project.json`
→ live sheets in `sortIndex` order → per-sheet `markup.json` counts + `thumb.jpg`), and 29 tests
(20 jsdom + 9 node). Routing is wired in `App`: **Home → grid → editor**; «New project» still lands on the
camera (the owner's D102 flow) but now returns to the **grid**; a capture launched from the grid returns to the
grid (UI §11.8) with the approved «Added {sheetName}» toast; the editor's `‹ Projects` goes back to the grid.

**Decisions this screen forced (each is a choice, not an accident):**
1. **The selection checkmark replaces the index badge** on a selected card. §11.2 puts both top-left and they
   cannot coexist; the index is the less important of the two.
2. **Both add tiles keep the spec's dashed `--g700` border.** "Primary" for «Take photo» is carried by the
   `--hi` fill and icon, which is what §11.2 itself says ("Both are … dashed `--g700` tiles").
3. **The select toggle sits bottom-right (48 px)** so it can never collide with the top-right inset badge.
   Its `.hit-slop` ring overlaps the card's open hit area, which §14.5's no-overlap rule reads strictly —
   trivially removed if the owner prefers a tighter card.
4. **The loader is tolerant exactly where tolerance is honest:** a missing/zero-byte `thumb.jpg` is `null` (the
   card's placeholder), an orphan `project.json` entry reads as empty markup, but a genuinely corrupt
   `markup.json` propagates to the screen's `error` state — reporting «0 dimensions» for an unreadable sheet
   would be a lie.
5. **A regression caught at integration, worth remembering:** the open-project registry is keyed by the
   **full `${id}:${folderName}` runtime key** (D51), so registering the bare id left every resolver throwing
   *"project … is not open in this tab"*. `App` now composes the key before registering, in both the create
   and the open paths — and the App-level test pins it (the grid's `empty` state is only reachable when the
   registry lookup succeeds).

**Owed, explicitly (rendered honestly, not silently):** **grid-scoped export** (the wizard lives in the editor
and owns the destination, so the grid's Export hands off to the editor rather than opening a scoped run);
**returning to the grid after an import** (Import hands off to the editor's picker so the write path stays
single); the **«↶ Undo»** half of §11.8's added-sheet toast (there is no sheet-delete path yet); **reorder**
(long-press drag + `sortIndex`), **rename**, **duplicate**, **replace photo**, and **delete → `.trash/`** — all
of which the spec gives this screen and none of which exist yet; and the §11.4 **storage chip** in the grid's
top bar. The `⋯` menu's items render **disabled** per the D102 honesty rule.

### D112 — slice 1.11: an update prompt that cannot outrun the autosave

**`registerType: 'prompt'` was already set** (`vite.config.ts:35`) — the plan's first item needed no change;
it was **verified, not assumed**. What was missing was everything around it.

**Built:** `src/ui/UpdateToast.tsx` (the plan's pinned signature), `src/ui/PWAUpdate.tsx` (the
`useRegisterSW` glue + the reload sequence), `src/ui/updateReload.ts` (the pure ordering), plus tests and the
build-id injection.

- **The prompt is suppressed during work, always.** No update prompt while `persistQueue.inFlight`, while a
  placement op is pending (`pendingOp !== 'none'`), or while the keypad sheet is open — re-evaluated when they
  clear. A prompt that interrupts a measurement is the exact failure this design exists to prevent.
- **Reload is flush-first, and a failure never reloads.** `flush → waitSettled → activate(skipWaiting)`; the
  ordering is pinned by a pure test, and a rejected flush never reaches `activate`. A *parked* autosave
  failure (`full` / `pending` / `error`) is deliberately treated as a rejection — `persistQueue.flush()`
  resolves when it parks, so without that classification a reload could discard an edit that never reached
  disk. On failure the prompt stays and says so.
- **A second toast surface is deliberate, not duplication.** `ToastHost` is single-instance and
  auto-dismissing (8 s / 10 s) with at most one action, and cannot be gated on queue state; the update prompt
  must **persist until chosen**, carry **two** actions, and disappear mid-measurement. It reuses the toast's
  visual language and is positioned above it so the two can never overlap.
- **The build id is injected at build time** (`__BUILD_ID__` via Vite `define`, `<version>+<ISO timestamp>`)
  and rendered in Settings → About as `Build {version} · {date}`. The plan's illustrative `+sha` shape is
  available by passing `FM_BUILD_ID` in CI. A field bug report that cannot name the build cannot be acted on.

**Deferred, and never faked:** the real service-worker lifecycle (`SKIP_WAITING`, `controllerchange`, "the
prompt appears on the next online launch", "the app changes after the update") is a `[Surface]` gate — it is
not machine-testable here. Also recorded as a **coverage gap, not a pass**: the queue→busy bridge in
`SheetEditor` runs only in the browser project (jsdom has no canvas), so it is verified by reading plus the
pure ordering test.

### D113 — sheet trash: delete → `.trash/`, the 14-day prune, and the restore UI

**Shipped** (slice 1.10 item 2; UI §13.3:800; build spec §2.4:237 and §20.5/§11.9:2029). The storage half is
`src/fs/sheetTrash.ts` (`deleteSheet` / `restoreSheet` / `listTrash` / `pruneTrash`); the UI is
`src/ui/TrashPanel.tsx` plus the grid's card menu and its `⋯ → «Trash…»` entry. **`deletedAt` on the
`project.json` row is the single trash ledger** — the schema already carried it (`schema.ts:125`,
`types.ts:80`) and the scan, the intake path and the grid loader already skip such rows, so no second ledger
was invented. Files MOVE to `<project>/.trash/<id>/`.

**The safety decisions — this is data-critical code, so each is explicit:**
1. **Copy → verify → only then remove.** FSA has **no directory `move()`** (files only, §5.3), so the move is
   a copy with a **per-file verification** (size equality, which also catches a zero-byte blob write) followed
   by a recursive `removeEntry`. A failed copy leaves the original untouched and cleans up only a
   `.trash/<id>/` that *this call* created — never a legitimate earlier trash entry.
2. **Prune is strictly older than 14 days** (`at < now − 1_209_600_000`): an entry deleted *exactly* 14 days
   ago is **kept**, and an unparseable `deletedAt` is kept. It removes the `.trash/<id>/` folders **before**
   rewriting `project.json`, so an entry is either fully pruned or untouched — never listed with its files
   gone. It is the **only** thing that ever removes a trash entry: nothing prunes `.history/` or `.trash/` to
   make room for a save (build spec line 848), and `cleanStaleTmp` still skips `.trash/` (re-pinned by test).

   > **Corrected by the independent review (F3), which execution proved right.** The claim above is true for
   > a *single* entry and **false for a multi-entry prune**: the folders are removed one by one and the rows
   > are rewritten once, so a failure part-way through leaves a row whose folder is already gone — the panel
   > lists the name, «Restore» reports the missing copy honestly, and the next prune clears the ghost row.
   > **Folder-first is kept deliberately** — the alternatives are worse (rows-first would strand un-prunable
   > orphan folders with no ledger; a per-entry rewrite multiplies the failure windows) — but the honest
   > description is "the expired files go first; the rows follow, and a part-way failure can leave a ghost
   > row", not the impossible invariant this entry originally claimed.
3. **Restore clears the row before dropping the trash copy** — the lane's deliberate deviation from the
   spec's stated order. If the atomic `project.json` write failed *after* the copy was gone, the only
   remaining copy would be stranded behind a `deletedAt` the prune would later erase; row-first makes the
   worst case a harmless duplicate. The critical rule (never remove before the copy verifies) holds either
   way.
4. **An unreadable trash is an empty trash, not a broken screen.** The sheets are the primary content, so a
   failed `listTrash` renders the panel's empty state rather than taking the grid down.

**The honesty change made at integration.** The lane emitted «Sheet deleted · Undo» **optimistically**,
immediately after calling the shell — claiming a deletion the write might not have performed, which is the
same class of bug this session has fixed five times over and the exact rule the autosave chip already
follows (§13.1: never optimistic). The screen now **awaits the shell's result**: resolve → the approved
`toasts.sheetDeleted` with a real 10 s Undo that routes to the same restore the panel uses; reject → an urgent
`trash.deleteFailed` ("Couldn't delete that sheet"), **no success claim and no Undo offered for a deletion
that did not happen**. Three tests pin it: the toast appears only after resolution; **no toast while the
write is in flight**; a failure says so and offers no undo.

**Also cleaned up:** both lanes declared a `TrashedSheet` model. The canonical one now lives in the storage
module and is re-exported by the panel, so the two can never drift (the D94 lesson, applied before it bit).

**Owed, recorded:** the spec's *restore-side* undo toast («restored · undo») needs approved copy — today the
restore reports itself by the row leaving the panel and the sheet reappearing in the grid; and the panel's
two-pane layout, its card-`⋯` placement and its real focus/hit-slop behaviour are manual/CSS checks (jsdom
has no layout engine, D40).

### D114 — independent review of the trash + grid wave: the register, and what it changed

An independent, **executed** register was run against `31ab0dd` covering `sheetTrash.ts` (delete/restore/prune),
the trash panel and the grid's delete affordances, the App wiring, and the grid → editor Export hand-off. Six
findings; five changed code or docs.

- **F1 — the worst: the Project route mounted NO `ToastHost`.** Every toast emitted while the sheets grid was on
  screen — including «Sheet deleted · Undo», the whole point of the trash slice — went onto the bus and was
  rendered nowhere, so a delete vanished the card with **no announcement and no undo window**, and a failed
  delete was silent: exactly the lie D113 claimed to have removed. **The lane's own 28 tests asserted the
  bus, which is precisely why they could not see it** (a test that checks what the code emitted cannot notice
  that nothing rendered it). **Fixed:** ONE host at the app shell root — `.editor-toast` is `position: fixed`,
  so it belongs to no route — with the Home-branch and `EditorLayout` hosts removed (a second host would
  double-subscribe and render everything twice). **Pinned by a new route-level test**
  (`tests/gridToast.test.tsx`) that mounts the real `App`, walks Home → grid, and asserts the toast **DOM** and
  its action, plus a Home-route control.
- **F2 — `deleteSheet` removed the original before marking the row.** A locked `project.json` (the §5.8 S5
  locked/another-app case, plausible in the field) therefore left the sheet **half-deleted**: the folder gone
  from `sheets/`, its files in `.trash/`, and the row still live — so the grid showed a card for a sheet whose
  folder no longer existed, the trash panel could not see it, and Restore refused it as "already live".
  **Fixed by reordering:** copy → verify → **mark the row** → remove the original (tolerating `NotFoundError`),
  which turns that same failure into the harmless duplicate this entry's restore rationale already describes.
  **Pinned** with a test driving the fake's `beforeMove(file, name)` hook — the target name is what identifies
  the `project.json` write.
- **F3 — the prune's stated invariant was false.** "Fully pruned or untouched — never listed with its files
  gone" holds for a single entry and **fails for a multi-entry prune**: the folders go one by one and the rows
  are rewritten once, so a part-way failure can leave a row whose folder is already gone. **Folder-first is
  kept deliberately** (rows-first would strand un-prunable orphan folders with no ledger; a per-entry rewrite
  multiplies the failure windows), and both the code comment and D113 now describe what actually happens.
- **F4 — grid «Export» with no selection dropped the action.** `ProjectScreen` passes `[]` to mean "every
  sheet", but the shell gated the hand-off on a **non-empty** list, so the user was navigated into an editor
  with no wizard at all. **Fixed:** an empty selection expands to the project's live sheets at the moment of
  hand-off, and with zero sheets the action stays on the grid.
- **F5 — a failed restore was invisible when it came from the delete toast's Undo.** `handleRestoreSheet`'s
  catch set a flag whose only surface is the trash panel — which is **closed** when that Undo fires. **Fixed:**
  the catch now also emits an urgent toast.
- **F6 — Settings carried two enabled-but-dead rows** («Trash…», «Third-party notices»): real buttons, approved
  copy, no handler — and the trash one now reads as a broken duplicate of a real affordance. **Disabled
  honestly** (the D102 pattern).

**Verified sound by execution** (recorded because a register is only useful if it says what held): the 14-day
boundary and `daysLeft`; the copy-failure paths, including a **pre-existing** `.trash/<id>/` never being
touched by cleanup; the restore-ordering claim; the prune's blast radius (only `.trash/<id>/` + its row;
`.history/`, `assets/`, live sheets and `*.tmp` untouched); "the only reaper"; the D51 keys on every new
caller; the honest delete at the screen level; the wizard's scoping; the panel's a11y; and the gate.

**Not verified, and not to be inherited as true:** real File System Access on hardware (NTFS, Dropbox/AV
locks), the 14-day clock on a real device, the hand-off against the real `SheetEditor`/Konva, and the panel's
layout/focus (jsdom has no layout engine).

**Watch item:** `makeProjectSeparate` still registers a **bare** project id (`projectStore.ts:749`,
pre-existing, no live consumer) — the D51 full-key rule is not yet universal in that one path.

**Lesson, and it is the session's lesson again.** F1 is the seventh instance of *the interface said something
the system had not done* — and it survived a lane's tests, the lane's own honesty review, and my integration
pass, because every check asked what the code **emitted** rather than what the **screen rendered**. The pin is
route-level now, and the review brief should ask it directly: *does anything actually render what this emits,
on every route that can emit it?*

### D115 — the sheets grid's remaining items (D111): reorder, rename, duplicate, replace photo, and the storage chip

The five items the handoff listed as owed are built. The choices this wave forced, each one a decision rather
than an accident:

1. **A keyboard reorder path was added, and it is not decoration.** UI §11.2:719 specifies the reorder as a
   long-press drag only. A drag is unreachable by keyboard (WCAG 2.1.1) and jsdom cannot drive it, so the card
   menu carries **`Move earlier` / `Move later`** (disabled at the ends). The drag remains the primary gesture;
   the pair is the accessible equivalent and the only machine-testable path. Added copy is marked
   `⚠ PROPOSED` like its neighbours.
2. **The «Drop to move» chip follows the pointer via `element.animate()`.** §11.2:719 says the chip "follows
   the card", but a computed anchor needs an inline `style`, and the CSP (`style-src 'self'`) plus the e2e
   `[style]` count === 0 assertion both forbid one (the D75 mini-toolbar precedent). Web Animations positions
   it without creating a `style` attribute, so the spec's behaviour is honoured rather than approximated by a
   fixed slot.
3. **The drop target is resolved geometrically** from rectangles captured once at gesture start, never from
   hover events: Chromium implicitly captures the pointer to the card that received `pointerdown`, so
   `pointerover` never fires on the others. That exact trap shipped a dead touch reorder once already (D77/F1).
4. **Still deferred, deliberately: the selection bar's batch `Duplicate` / `Delete`** (UI §11.2:717). The spec
   lists the buttons but pins neither batch-delete/undo semantics nor any copy for them, and a batch undo that
   only restored the last sheet would be exactly the lie this project keeps fixing. Owed rather than invented.
5. **`duplicateSheet` places the copy at the END** (`nextSortIndex`, the §20.2 create rule) and the shell
   titles it with the existing `defaultSheetTitle` (`Sheet NN`, live count + 1) — one naming convention, not
   two, and no `(copy)` convention invented.
6. **`renameSheet` never touches `updatedAt`.** `updatedAt` is the sheet's content time (the card's «2:14 PM»
   meta line); a rename must not claim a content change. Only `title` moves.
7. **The storage chip reports disk facts, and renders nothing when it has none.** `{size}` is a recursive byte
   walk of the whole project folder (including `.history/` and `.trash/` — that is what the disk actually
   holds); `{time}` is `project.json`'s own `lastModified`. While measuring, on failure, or with no real save
   time, the chip renders **nothing** — the approved template needs both tokens, and `Local · 176 MB · Saved `
   would be a claim the system never made. (This is D110's lesson applied before the fact rather than after.)

### D116 — the sheet `sortIndex` correction: two pins were wrong, and the fixture was the reason

**`addSheetFromPhoto` wrote `sortIndex: projectFile.sheets.length`** (0-based, a gap of 1) while build spec
§20.6:2584 pins **integers, gaps of 10, renumbered `10 × position`**. The contradiction was invisible until
this wave added a reorder: the reorder renumbers live rows to `10, 20, 30…`, after which a newly appended
sheet (say `2`) sorts **before every existing sheet**, because `projectSheets.ts:102` sorts ascending. It now
uses `nextSortIndex` = `max(sortIndex of LIVE rows) + 10`, or **10** when there are none — arithmetic:
`10 × (position + 1)` for position 0.

`tests/sheetIntake.test.ts` pinned the old behaviour (`0`, then `[0, 1]`); both expectations are corrected
(`10`, `[10, 20]`) with the arithmetic in the comment, per the standing rule that **a test which encodes a
defect is corrected as a spec-expectation correction, with the arithmetic shown** — never by weakening a gate.

**The shared fixture carried the same bug.** `tests/fakes/fsa.ts`'s `validProjectFile` (used by ~20 tests)
also used `sortIndex: i`. That is why the lane brief's own arithmetic (`[10, 20]`) did *not* hold against it,
and why `cameraFlow.test.tsx` asserted the append at `1`. Corrected to `10 × (i + 1)`; that test's two pins
followed (`sortIndex: 20`, and the payload's `index` — see the watch item below). A fixture that disagrees
with the convention under test manufactures wrong expectations, and it did: it produced one in the brief
itself, inside a lane, in the same hour.

**Watch item, not fixed:** `CameraFlow`'s `onCaptured` payload field named **`index` actually carries the
sheet's `sortIndex`** (now `20`, not a 1-based position). No consumer reads it — the shell uses `id` and
`title` — so the value is pinned at its truth and the misnomer is recorded here rather than renamed inside a
frozen interface in this wave.

### D117 — the replace-photo write order: an in-place overwrite needs a rollback

`replaceSheetPhoto` is the one operation in this codebase that **overwrites the user's working image in
place** — `sheetTrash`'s "never lose the source" property comes from copying to a *new* location, which is not
available here. The first implementation ordered it photo → verify → row → thumb and treated the thumbnail
removal as best-effort, swallowing every failure. Execution showed two lies in that ordering:

- a **locked `thumb.jpg`** left the cached composite (the **old** photo) on the grid card under a sheet that
  now contained a **new** one — the D110/D114 class exactly; and
- a **locked `project.json`** left the new photo on disk under the **old** `imageWidth`/`imageHeight` — a
  working-image space that disagrees with itself, i.e. a wrong-measurement state.

The order is now, with the reason each step sits where it does:

1. **Read the bytes being overwritten** (so a failure can put them back).
2. **Remove the stale `thumb.jpg` first.** It is the only step that can fail for a reason we cannot work
   around, and doing it first means the "cannot proceed" case changes nothing the user can see — the card
   falls back to the honest placeholder. A non-`NotFoundError` here **aborts** the replace.
3. **Write the photo atomically, then verify** it (re-read, compare `size` — the `copySheetTree` idiom).
4. **Write the row's dimensions and `updatedAt`.** Any failure in 3–4 **restores the previous photo**.
5. **Only then, on `'remove'`, clear `markup.json`.** A failure here leaves the photo and the row consistently
   new and the markup still on disk — visible, recoverable. The opposite order would let a ledger failure
   destroy markup the user never got a new photo for: a silent loss. The worst case of this order is markup
   the user had already asked to discard.

Two tests that had encoded the weaker behaviour were corrected to the stronger one (the photo is restored, and
the stale thumbnail is gone), and a third was added: an unremovable thumbnail aborts the replace with the
photo, the row and the markup untouched. `{ create: false }` on the sheet folder is deliberate too — an orphan
row is not resurrected into a half-sheet (a photo, no markup) behind a card that looks healthy.

### D118 — the two independent reviews of the grid wave: the registers, what they changed, and what is owed

Two reviews ran against `249754e`.

**An executed correctness register** (`@oracle`, in a clean worktree pinned to that commit, per
`docs/review-brief.md`) reproduced the gate itself — tsc 0, **91 files / 1293 tests** across node + jsdom +
browser — and found **no wrong-measurement and no data-loss defect**. Six items: one genuine claim-fidelity
inversion (F1, fixed), one wiring-seam gap (F2, closed), two false comments (F3/F5, fixed), and two
cosmetic/spec-fidelity items (F4, fixed; F6, recorded).

**An independent UI/UX review** (`@designer`) that **measured** rather than read: a fixture mirroring the real
DOM chain with the repo's own stylesheets and fonts, rendered in the repo's Chromium at 1440×960, 960×1440 and
1200×800, with `getBoundingClientRect()` read per element. jsdom can see none of this (D40). All three of its
High findings were real.

**Fixed — the wave's own defects:**

1. **The card menu opened downward unconditionally.** Its seven items are 364 px tall (7 × 48 + 6 × 2 gaps
   + 12 padding + 4 border) with no room to flip inside a 300 px card, so at the bottom row only **102 px of
   364** was visible and «Delete» — the last item — was the least reachable action on the screen, which is
   precisely where a menu gets opened. `menuDirectionFor()` now decides from the card's real viewport rect,
   `data-direction` places it, and `max-height: min(364px, calc(100vh − 96px))` + `overflow-y: auto` is the
   backstop that makes an off-screen menu impossible. Pinned by an arithmetic test (inclusive threshold:
   exactly 364 counts as fitting) and by the browser suite.
2. **The destructive «Remove markup» read as broken** — a tap flashed it red and nothing happened; the wait was
   invisible. UI §13.3:808 pins the component: 64 px tall, the label inside a progress track that fills
   left→right with `--err` over 600 ms. It now does that, driven by `data-holding` in step with the JS timer.
   **The editor's own copy of this pattern (`insetWire.css`, `SheetEditor.tsx:2639-2654`) keeps the old
   treatment — owed, below.**
3. **Initial focus sat on «Keep markup».** §13.3:808: "Focus is never placed on the destructive button by
   default — the safe action (`Cancel`) receives initial focus." `Cancel` takes it now; the dialog's accessible
   name comes from its own heading (`aria-labelledby`) instead of an `aria-label` that disagreed with it; the
   sheet is a subject line; and focus **returns to the invoker** on close (the `TrashPanel` pattern) rather than
   falling to `<body>`. The test that encoded the old target was corrected with the clause cited — a
   spec-expectation correction, not a relaxed gate.
4. **Two violations on the wave's own controls:** the card `⋯` trigger's 8 px `.hit-slop` ring **overlapped the
   select toggle's by 4 px** (§14.5:827 — it moved to `bottom: 76px`), and it floated over the photo at 82 %
   where §14.3:820 requires a **solid `--g900` at 92 %** with `rgba(255,255,255,.14)`; the 70/82 % values are
   sanctioned for the *badges*, not for a control.
5. **The rename field sat 0 px from the select toggle** (§14.5 wants ≥ 8 px): `right: 64px`.
6. **The «Drop to move» chip ran off the right edge** at the last column of a 4-across grid (measured 35–75 px
   past it, clipping the label the chip exists to show): `chipTranslate` clamps to the viewport, and the browser
   suite asserts the chip's box stays on screen. The chip also no longer paints one frame at the viewport corner
   on mount (`useLayoutEffect` seeds it).
7. **Mutations were offered on a project that cannot take them** (§11.2:722): on the grid's `error` state — and
   on a read-only project once the shell passes `readOnly` — rename / duplicate / replace / reorder / delete now
   answer «Not saved to disk» instead of attempting a write that cannot land, which is what the add tiles
   already did.

**Fixed — the register's F1, a claim-fidelity inversion.** When only the replace's *last* step fails (clearing
the markup the user asked to drop), the photo, the dimensions and the thumbnail are already consistently new.
`replaceSheetPhoto` therefore returns `{ markupCleared }` instead of rejecting, and the shell says «Couldn't
remove the markup» rather than «Couldn't replace that photo» — which would deny a swap that happened. This is
the D110/D114 family **inverted** (a claimed failure the system did not have) and it was found by execution.

**Fixed — the register's F2, the wiring seam.** All five actions had a tested storage half
(`tests/sheetOps.test.ts`) and a tested screen half (`tests/projectScreen.test.tsx`) and **nothing between
them**. `tests/gridActions.test.tsx` now mounts the real `App`, walks Home → the grid and drives
rename / reorder / duplicate / replace through the DOM against the fake disk — including the silent same-size
swap, the warned dialog's `Keep markup`, and the F1 message above. Deliberately the same *route-level* shape as
`tests/gridToast.test.tsx`: D114's lesson was that the seam, not the modules, is where this project's real bugs
appear.

**Fixed — F4, spec fidelity.** `defaultSheetTitle` counted **live** rows while §20.6:2586's formula is
`sheets.length + 1`. Worked example — rows `[Sheet 01 live, Sheet 02 trashed, Sheet 03 live]`: the live count
says «Sheet 03», **duplicating a live title**; all rows says «Sheet 04». Corrected, with the trashed-row case
pinned.

**Also corrected:** two comments the register proved false — `App.tsx`'s "the editor has its own `ToastHost`"
(one host at the shell root since D114) and `dropIndexFor`'s "returns `fromIndex`" (the code returns
`Math.max(0, fromIndex)`; a negative index is not a position).

**Recorded, not fixed — each with its reason:**

- **No autoscroll during a drag** (UI review M8). Measured: 16 items → 1248 px of grid at 1440 and 2452 px at
  960 (portrait) against 894/1374 px of visible body, and `dropIndexFor` resolves only against the rects of the
  current screen — so moving a card more than a screenful needs a second lift. §11.2:719 does not pin
  autoscroll, and an edge-scroll loop (zones, speed, momentum) is a behaviour addition that needs its own
  decision and a hardware check, not a guess inside a remediation.
- **The grid's scroll container is inert and the top bar scrolls away** (UI review H2, pre-existing since
  `22477bd`). Measured at 1440×960: `.project-screen` is 1378 px tall, `.project-body`'s
  `scrollHeight === clientHeight` so its `overflow-y: auto` never engages, and at the bottom `window.scrollY =
  418` with the 66 px bar at y = −418. The fix is **coupled** — giving the screen a real height restores the
  fixed bar *and* makes the menu clip against the new scroller — so it needs the portal/flip work alongside it.
- **The top bar measures 66 px, not §11.2:711's 56 px** (tallest child is the 56 px Export button, + 4 px
  padding + a 2 px border). Shared with Home; nothing clips — the 48 px chip still leaves 8 px of slack.
- **`aria-pressed` on the hold-to-confirm** is a toggle semantic on a non-toggle. Shared with the editor's
  dialog; it should move with the §13.3:808 progress work, in both at once.
- **The editor's replace dialog** still carries findings 2 and 3's old treatment (56 px, no progress; initial
  focus on «Keep markup»).
- **The double keyboard-move revert race** (register F6): if move 1 is in flight when move 2 commits and move 1
  then rejects, the revert can lag the disk by one step; the next refresh heals it, each move closes the menu,
  and the window is tiny — but it is recorded rather than called impossible.
- **The one-shot click suppression after a normal drop** depends on Chromium synthesising exactly one `click`
  for the release (review L16) — `[Surface]`, logged.

### D119 — the owner-reported capture dead end: the failure overlay said nothing, and «Retry» could never work

**Reported from a real run** — *"when I take a photo and hit use photo it gets stuck at 'save as a copy…'
'retry' button"* — which is exactly the class `docs/handoff-session-21.md` §2 predicted only a real run would
find.

**What was wrong.** `CameraFlow`'s failure overlay was a blank `role="alert"` holding two buttons: no line
said what had failed. Behind it, two different failures landed on the same screen:

1. **The project folder never resolved.** The resolution effect swallowed its error and left
   `projectRef.current === null`; every later `commit()` therefore threw `'project is not open'`, which the
   catch turned into the same overlay. Nothing re-ran the resolution, so **every «Retry» repeated a guaranteed
   failure** — a permanent dead end with no explanation.
2. **The write itself failed** (a lost write grant, a locked file, a full disk). «Retry» re-ran `commit`, which
   used the already-resolved handle and **never re-asked for the grant** — and a lost grant can only be
   recovered inside a user gesture (§5.2), so a permission failure was also unrecoverable in place.

**The fix (three parts, each pinned by a test):**

1. **The overlay says why.** `describeWriteFailure()` maps the `StorageWriteError` kind to the approved copy —
   `permission` → «Folder permission expired», `target-locked` → «File is open in another app», `disk-full` →
   «Not enough disk space» — and one new `⚠ PROPOSED (C14)` line, `capture.saveFailed` («Couldn't save this
   photo»), covers the rest (a decode/canvas failure, or an unclassified write error). Never a blank alert.
2. **The recovery matches the cause.** On `permission` the primary action is **«Re-authorize»** (not a generic
   «Retry»), which genuinely re-asks for the grant because `commit` now calls `ensureRootAccess({ request:
   true })` at the **top** of the gesture — before the EXIF read and the normalization, which are slow enough to
   outlive the activation window. That is the D103 fix for «New project» applied to the capture path. «Save a
   copy…» stays beside it as the escape hatch (the photo is never trapped), and the recovery is now the primary
   button.
3. **«Retry» is a real second attempt.** The resolution is extracted as `resolveProject()` and re-run on the
   null-project path, so a folder that reappears (re-picked, reconnected) files the photo.
   `tests/cameraFlow.test.tsx` pins exactly that: with the folder absent the overlay names the problem and keeps
   the photo; the folder is then created, «Retry» is clicked, and the sheet lands on disk — a test that cannot
   pass against the pre-fix code.

**Still unknown, and it is the point of the fix:** *which* failure the owner actually hit. The screen now
identifies it in one line, and the four kinds map to four different remedies (re-grant, wait for the lock to
clear, free space, or a browser that cannot do the atomic write at all). Guessing further without that line
would be the pattern this project keeps paying for.

### D120 — the capture save HANGS: a pending write never reaches the honest-failure path

**Reported next:** *"it still gets stuck on adding… after clicking use photo"*. «Adding…» is the **saving**
overlay — so the promise never settles. D119 covered *rejection*; a hang is a different defect and the
honest-failure fix structurally cannot see it (a pending promise never reaches a `catch`).

**Three things were wrong:**

1. **The primary path could wait on a permission request that may never be answered.** D119 moved
   `ensureRootAccess({ request: true })` to the top of the capture gesture. The intent was D103's (ask inside the
   click), but a `requestPermission` the browser never answers — or one waiting on a prompt the user never sees
   over a full-bleed camera — turns "ask for the grant" into "hang forever". **The primary path no longer asks**;
   only the **recovery** path does, because that is the click whose button reads «Re-authorize», where a prompt
   is expected. The primary path still fails honestly: the write itself fails fast with `NotAllowedError`, and
   the overlay offers the granting recovery.
2. **Nothing bounded the wait.** `navigator.locks.request` has no timeout and queues silently, so a Web Lock held
   by an earlier stuck write makes every later write wait forever. A 30 s watchdog (`SAVE_TIMEOUT_MS`, via
   `createSaveWatchdog`) now stops the app claiming progress, with the honest line «The folder isn't responding»
   and the escape hatch beside it.
3. **Nothing said WHICH step was running.** The saving overlay's label now follows the stage — «Adding…» for the
   image work, «Saving…» for the folder write, both **already-approved** lines, so naming the stage cost no new
   wording. A hang now names itself; that is also the only reason this report could be diagnosed at all.

Plus **one save in flight at a time** (`inFlightRef` + `inFlight`): after the bounded wait the visible state is
`failed` while the write is still *pending*, so an in-place retry would queue a second write behind the stuck one
— and if the first ever lands, the project gets **two sheets**. While a save is unsettled the overlay therefore
offers «Save a copy…» and **no** in-place retry.

**Recorded, not fixed:** `writeAtomic` acquires its per-project Web Lock with **no timeout**, so a stuck holder
blocks every later write until the page is reloaded (locks die with the page). A lock-acquisition timeout inside
`projectStore` is the deeper fix and belongs with that module's own review, not inside a UI bug fix. The reload
is the reliable escape and is the first thing the hardware row asks for.

**Test honesty, and one gap stated plainly:** the first attempt to pin the watchdog drove the capture flow under
fake timers, which fought the component's own async path **and leaked a queued mock implementation into the next
test** — the environment-coupling trap `docs/review-brief.md` §8 names. Restructured: the timer mechanism is
pinned as a timer (`createSaveWatchdog`, no camera), the label mapping as a pure function, and the owner's
symptom (a hung pipeline keeps its stage label and never traps the photo) with **real** timers. The 30 s exit's
post-timeout button set is *not* machine-verified end to end; the hardware row covers it.
