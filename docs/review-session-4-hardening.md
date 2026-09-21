# Session 4 — Senior Adversarial & Hardening Review

**Date:** 2026-09-21 · **Scope:** `docs/implementation-plan.md` + the architecture behind it
(build spec v0.3-hardened, UI spec v2-hardened) · **Method:** re-execute the specs' own reference
code, attack the storage layer's failure paths, and audit the build plan for work that **no slice
owned**.

**Bar applied:** rounds 2 and 3 each found real defects in code that had already passed a review.
So: nothing here is asserted from reading. Every code-level finding below was **executed** — the
reference code was extracted from the spec into a JS runtime and run against its own committed
tables. Every numeric claim shows its arithmetic.

**Headline:** the plan was in good shape on the things it had already been reviewed for. What it
was missing were (1) **six wrong-measurement paths** in the keypad/parser that survived three
rounds, (2) **four data-loss paths** in the storage reference code, and (3) a class of gap the
previous rounds structurally could not find — **work with no owner**: the tool rail, the save
pipeline, test infrastructure, and how the app reaches a Surface at all.

---

## Severity key

🔴 wrong measurement or data loss · 🟠 build-blocking (a builder stalls or ships something broken)
· 🟡 correctness/clarity

---

## A. Wrong-measurement findings (executed against the spec's own code)

### 🔴 F1 — §6.1's committed test table asserts a value its own code does not produce

The accepts block contains:

```ts
[`10′-4 ½″`, 124.5],   // unicode prime/double-prime + vulgar fraction NOT accepted → see note
```

Executed: **returns `null`.** `′`/`″` are normalized by the replace chain, but the vulgar
fraction `½` is not, so `4 ½` never matches the inches regex. **The row's own trailing comment
says it is not accepted** — the assertion contradicts the comment sitting on the same line.

Why it matters: the plan tells the builder to "carry the spec's tables verbatim", and slice 1.1's
gate is "vitest green". A builder therefore gets a red test in the **ft-in parser** — the
wrong-measurement guardian — and the cheapest way to make it green is to loosen the parser or
delete the test. **This is precisely the bug class round 2 was created to eliminate, and it survived
rounds 2 and 3.**

**Fixed:** moved to the rejects block with the reasoning inline. Vulgar fractions stay out of v1
(rejecting is benign — the commit button simply disables). Also added the genuinely-accepted
unicode-prime case `10′ 4″` → 124 so the normalization that *does* work is covered.

### 🔴 F2 — the strict parser silently flips signs, and the formatter can't round-trip its own output

```
parseImperialToInches('-5')        → 5        (not -5, not null — a SILENT SIGN FLIP)
parseImperialToInches('-5 1/2')    → 5.5
parseImperialToInches("-10' 4\"")  → -116
formatInches(-124.5)               → "-10'-4 1/2\""
parseImperialToInches("-10'-4 1/2\"") → -115.5   ← format → parse is NOT value-preserving
```

The leading-dash strip exists for the ft-in separator (`10'-4"`) but runs unconditionally, so with
no feet mark it eats a minus sign. The spec states the invariant "every non-empty output strictly
parses back to the same value"; for negatives it does not hold. The 500-combo property test never
generates a negative, so it cannot catch this.

**Fixed:** the dash is stripped **only** after a feet mark; a leading `-` with no feet mark returns
`null`; negative feet return `null`. Lengths are non-negative across the domain. `formatInches`
keeps its sign branch deliberately, so that if a negative ever does reach a label it is loudly
visible rather than silently absolute — and the plan asserts that its output is **not**
parser-round-trippable, so nobody "fixes" the parser to accept it.

### 🔴 F3 — a zero-length dimension is committable

The keypad wiring said "reject `Enter` when the value is null/NaN". `parseLooseToSlots('0', 16)` →
value `0`, which is neither. A `0"` dimension commits onto a drawing.

**Fixed:** new `isCommittableInches(v)` — `v !== null && Number.isFinite(v) && v > 0 && v <= 12000`
(1000 ft ceiling) — is now the only gate the commit button may use.

### 🔴 F4 — the keypad invents measurements the user never typed

```
parseLooseToSlots('12 6 20', 16)      → 12 ft 6 in + 20/16 = 151.25 in
  composed enteredText: "12'-6 20/16\""   displayed label: 12'-7 1/4"
parseLooseToSlots("10' 4 99/100", 16) → denominator 100 (outside {2,4,8,16,32,64}) → 124.99 in
```

A numerator ≥ its denominator is a typo, not a measurement; `12 6 20` yields a length **1.25 inches
longer** than anything the user expressed, and it round-trips cleanly, so every downstream check
agrees with it.

**Fixed:** `parseLooseToSlots` returns `null` when the denominator is outside the precision enum or
the numerator is ≥ the denominator. Verified: `12 6 20` → `null`, `12 6 16` → `null`,
`12 6 15` → accepted (15/16 is valid), `10' 4 99/100` → `null`, `10' 4 3/8` → accepted.

### 🟠 F5 — the property test covers none of the branches it exists to protect

The generator drew every slot from `String(Math.floor(Math.random() * n))`, which **never produces
`''`**. Measured over 2000 draws:

| slot | times empty |
|---|---|
| `feet === ''` | **0** |
| `inches === ''` | **0** |
| `numerator === ''` | **0** |

Round 1's fraction-dropping bug lived in the feet+inches+fraction branch and the empty-slot
branches. The 500-combo property test written to prevent that regression exercised **only** the
all-slots-present shape. It also drew `numerator === '0'` in ~5% of draws, composing junk that
still round-trips by value — so the assertion passed on garbage.

**Fixed:** the generator now draws `''` (20%), `'0'` (10%) and a positive digit string (70%) per
slot; the test additionally asserts composed-text **shape** (never `0/d`, never a leading `0'`) and
**its own coverage** (each slot empty in >20 of 500 draws), so a future narrowing of the generator
fails the test instead of silently reducing it.

### 🟡 F6 — a `'0'` slot is truthy, so `enteredText` gets stored as junk

`st.numerator` is a **string**, so `'0'` is truthy. Results: `12'-6 0/16"`, `0'-4"`, and — in
inches-mode with an empty inches slot — a bare `"`. Values round-trip, so nothing caught it.

**Fixed:** presence means a **positive** value, in both `composeEnteredText` and
`keypadValueInches`. They must agree, or the live preview and the stored text diverge.
*(My first pass at this fix missed the `inchesMode` branch; execution caught it — the bare `"`
case. Re-fixed and re-verified.)*

### 🟡 F8 — the loupe's three numbers cannot all be true

§8.4: "160px diameter … zoom ~3.5× of an 80×80px source region." A 160px window at 3.5× shows a
**45.7px** source; an 80px source in a 160px window is exactly **2×**. Diameter is also a user
setting (112/160/200), and the spec never said whether magnification or source size is the
invariant. The loupe is the endpoint-placement accuracy aid, so this matters.

**Fixed (§19.5):** magnification is **fixed at 3.5×**, source is derived —
`sourcePx = diameterPx / 3.5` (112→32, 160→45.7, 200→57). Fixing magnification keeps placement
precision constant when the user changes loupe size.

### Verification

The corrected §6.1/§6.1.1 code was re-extracted from the spec and executed: **53/53 assertions
pass**, including the full original accept/reject tables, the formatters, the 8-case compose table,
the `12' 6 3/8"` → 150.375 round-trip, all seven new guard rows, and the rewritten property test
(run 8× for randomization stability).

---

## B. Data-loss findings (storage reference code)

### 🔴 S1 — `writeAtomic` promised a lock in its doc comment and never took one

```ts
/** … Hold the per-project Web Lock for the whole write so a second tab can't
 *  hold a writable on the target during move(). */
export async function writeAtomic(dir, name, data) {   // ← no navigator.locks.request anywhere
```

`cleanStaleTmp` takes `fm:project:<id>` and its round-2 safety note says it is safe *because it runs
under the same lock as writers*. With writers unlocked, that lock only excludes other cleaners — the
race round 2 identified was half-fixed, and the doc comment concealed it.

**Fixed:** the lock is taken **inside** `writeAtomic`, and `projectId` is now a required parameter
so it cannot be forgotten at a call site.

### 🔴 S2 — `cleanStaleTmp` never entered the directories where tmp files live

It iterates `dir.entries()` — the **project root only**. Every tmp file this app writes is in a
subdirectory: `sheets/<n>/markup.json.tmp`, `sheets/<n>/photo.jpg.tmp`,
`sheets/<n>/thumb.jpg.tmp`, `assets/<hash>.jpg.tmp`. Orphans accumulate forever, and **slice 1.2's
own gate — "no `*.tmp` survivors" — could never pass.**

**Fixed:** bounded recursive walk (depth ≤ 3), skipping `.trash/`.

### 🔴 S3 — every I/O failure bypassed the corruption-recovery path

`readJsonValidated` guards the **parse** only. `getFileHandle(name, { create: false })` throws
`NotFoundError` for a missing file; `getFile()/text()` throws `NotReadableError` on a truncated or
externally-locked one. Neither is caught, so those cases never reach `recoverFromHistory` — they
surface as unhandled rejections. The whole point of the guarded parse (§3.4) is that corruption
reaches recovery; the I/O half was unguarded.

**Fixed:** I/O is wrapped; `NotFoundError` with an `onMissing` callback returns the caller's default
(a brand-new sheet legitimately has no `markup.json` — that is expected absence, not corruption);
every other I/O error routes to recovery.

### 🔴 S4 — no disk-full handling anywhere in the architecture

Grepped all four canonical docs for `quota|disk full|QuotaExceeded|out of space`: **the only hit is
§9.5's per-file export error string.** The autosave path has no disk-full state at all. On a full
Surface, saves fail into a generic error.

**Fixed (§5.8a):** `StorageWriteError` with a classified `kind`; `storageStatus: 'full'`; a dedicated
chip state; the tmp is kept; and explicitly — **no automatic pruning of `.history/` or `.trash/` to
make room.** Deleting the user's recovery data to complete a save is a data-loss path dressed as a
fix.

### 🔴 S6 — duplicate project ids are near-certain, and the behaviour was undefined

Identity is `project.json.id` (§5.6) and **the sanctioned sharing model is copying the project
folder** (D11 — "drag it into Dropbox"). So two folders under one root carrying the same id is the
expected outcome of the documented workflow, not an edge case. The scan's behaviour was undefined:
which wins, do they merge, does opening one write into the other?

**Fixed (§5.8c):** group by id; every folder gets its own card; non-newest are badged `«Copy»`;
in-memory key is `id + folderName`; opening a copy offers `«Make this a separate project»`.
**Never merge, never write into a folder the user did not open.**

### 🟠 S5, S7, S8 — locked rename target, two-tab arbitration, history caps

- **S5:** `move()` failing because Dropbox/antivirus/the indexer holds the target is routine on
  Windows; no retry or cleanup was specified. Now classified `'target-locked'`, retried on the §5.4
  backoff, tmp kept, `«File is open in another app — Retry»`.
- **S7:** §5.4 said a second tab is invalidated but never said **which** tab loses when both open at
  once. Now decided by `navigator.locks.request(…, { ifAvailable: true })` at project open.
- **S8:** "20 snapshots / 200 MB" was ambiguous about what is snapshotted. Now explicit: **JSON
  only** (never photos), 20 per sheet + 20 for `_project`, 200 MB whole-`.history` backstop,
  cadence = a 10-minute timer reset on each write plus one before every destructive action.

---

## C. Ownerless work — the class previous rounds could not find

Rounds 1–3 verified the plan against the spec and the spec against itself. Neither check can find
work that **neither document assigns to anyone**. This is where the remaining risk was.

### 🔴 P4 — nothing said how the app reaches a Surface, and the origin is a data boundary

No canonical doc contains the words deploy, host, serve, or install-from. That looks like a
deployment detail. It is not: **`idb-keyval` (the persisted `FileSystemDirectoryHandle` *and* every
setting), OPFS, the service-worker cache, and the FSA permission grant are all origin-scoped.**
Change the origin later and each Surface silently loses its folder handle and its settings — and the
project *files* survive on disk, so the failure is quiet: the user just sees first-run again.

A plain `http://` LAN address is **not a secure context**: no install, no service worker, no
`showDirectoryPicker`. `http://localhost` works but is port-sensitive (`:5173` and `:8080` are
different origins, hence different data). Recommended: a static HTTPS host — which does not violate
§1.4, because §1.4 forbids a *backend*, a database, sign-in, cloud SDKs and sync, not the existence
of a web server that serves static files.

**Fixed:** new **§19.1** + new **slice 0.0**, before the scaffold. It is a half-day decision and it
gets strictly more expensive with every slice that ships.

### 🔴 P2 — nothing saved annotations between slice 1.5 and slice 1.10

§10 says "the command history and **persistence queue** live in dedicated modules"; §5.4 fully
specifies the pipeline (400 ms coalesce → per-sheet serialize → 1s/3s/10s backoff → park → flush on
`pagehide`). **No slice ever listed the module.** 1.2 builds write primitives; 1.5 creates the first
annotations; 1.10 builds the chip that *displays* save state. In between, the app would draw and
never write.

**Fixed:** `src/state/persistQueue.ts` added to slice 1.2 with signatures, semantics, tests and
gates. It is the only caller of `writeJsonAtomic` for markup and it owns `storageStatus` — which
makes "never show Saved optimistically" structural rather than a matter of discipline.

### 🔴 P1 — no slice built the tool rail

The vertical tool rail is **"do not simplify #1"** and hosts all 14 tools. Grepping the plan for
`rail`/`ToolRail`/`TopBar` returns nothing outside unrelated lines. Slices 1.5 and 1.6 build tools
with no surface to select them from, and the 14 bespoke glyphs (§2.2: lucide is chrome-only) had no
producer.

**Fixed:** new **slice 1.4.5** — top bar, tool rail, panel docking, glyphs, `editorStore` — placed
before 1.5, with the §11.3 docking rule reduced to one testable predicate (`panelDockFor`).

### 🟠 P3 — test infrastructure did not exist, and three slices already depended on it

No `vitest.config.ts`, no DOM environment, no `playwright.config.ts`, no fixtures. Meanwhile slice
0.3 requires component tests, 1.2 requires a Playwright+CDP kill-switch harness, and 1.3 requires a
screenshot diff. And a direct contradiction: **§14 mandates "Vitest + Testing Library" and offers
node-canvas, while §2.2 declares the dependency list closed and lists neither** — and neither is
installed.

**Fixed:** dev deps added to §2.2 (`@testing-library/react`, `@testing-library/user-event`, `jsdom`);
`node-canvas` explicitly dropped (native build on Windows, and it would not exercise the shipping
rasterizer) in favour of Playwright for export invariance; `vitest.config.ts` (node + jsdom
projects), `playwright.config.ts`, `tests/setup.ts` and `tests/fixtures/` are now slice 0.1
deliverables with their own gates.

### 🟠 P20, P13, P12 — asset dedupe, fonts, and the thumbnail worker had no mechanism

- **Asset dedupe** is required in four places; `sha256Hex` is defined in §7.1 and **called from
  nowhere**; there is no hash→uuid index in the on-disk layout and `assetId` carries no hash. A
  builder's only option was re-hashing every file in `assets/` on every import. **Fixed (§19.3):**
  assets are **content-addressed** — `assets/<sha256hex>.jpg`, `assetId` *is* the hash, dedupe is a
  `getFileHandle` existence check with no index to corrupt.
- **Fonts:** the UI spec requires self-hosted Archivo + JetBrains Mono woff2 subsets and forbids a
  CDN; slice 0.1 precaches "both fonts" and **no slice ever added them** (nor their OFL text to
  THIRD-PARTY-NOTICES). Precaching a font that isn't in the build is a silent no-op. **Fixed:** an
  explicit 0.1 deliverable with an offline gate.
- **Thumbnail worker:** §7.3 requires decode-in-a-worker; no worker file existed in any slice and
  the Vite worker convention was never proven. **Fixed:** a stub in 0.1 (so misconfiguration is
  found at the scaffold, not in 1.3) and a real gate in 1.3.

### 🟠 P5 — no service-worker update strategy

Precaching with no update flow means a field device can run a stale build forever; the wrong flow
reloads mid-measurement. **Fixed (§19.2 + new slice 1.11):** `registerType: 'prompt'` (never
`autoUpdate`), a non-modal toast **suppressed while a write is in flight, while `pendingOp !==
'none'`, or while the keypad is open**, and `Reload` flushing the persistence queue before
`skipWaiting`.

### 🟠 P7, P9, P10 — export

- **P7 (data loss):** conflict detection compares JS strings, but **NTFS is case-insensitive**.
  `Sheet.pdf` and `sheet.pdf` are one file on disk. As specified, `Overwrite` silently destroys an
  unrelated export and `Add (1)` never triggers. **Fixed (§19.4c):** fold case and normalize NFC on
  both sides.
- **P9:** the 50-sheet gate had no designed remedy if it failed. **Fixed (§19.4b):** the budget is
  computed (`w × h × M² × 4`; 4096×4096 at 3× = **604 MB**), a hard guard refuses M above 512 MB,
  and PDF splitting above 250 MB of embedded JPEG is decided **now** rather than improvised at gate
  time.
- **P10:** §5.3 defines the damaged-photo state and preserves markup; §9 never said what such a
  sheet exports as. **Fixed (§19.4a):** markup on a white page at the sheet's stored dimensions,
  counted in the result view. Never skipped silently — the markup *is* the measurement record.

### 🟠 P6 — the filename sanitizer had rules but no implementation and no order

§9.4 lists rules; order changes the answer (truncating after stripping trailing dots can re-expose
one; the reserved-name check must also run on the **joined** base). It is also the module with the
most Windows-specific edge cases and §14 names it a unit-test target.

**Fixed:** a reference implementation plus a **29-row** test table in slice 1.9.
Worth noting as evidence for the method: **the first draft of that implementation, written from the
§9.4 bullets by reasoning alone, failed the `con.jpg` row** — the device-name check must see the
base, not the whole token. It was caught by executing it, exactly as F1 was. The version now in the
plan passes all 29.

### 🟡 P8 — accessibility was scheduled entirely in the last slice

§11.12 lands in 1.10, after eight slices of UI. Retrofitting focus order, roles, names and the
accessible object tree is the standard way accessibility does not happen. **Fixed (§19.6):** every
UI slice carries its own a11y acceptance; 1.10 keeps the themes, the canvas object tree, and the
end-to-end audit.

### 🟡 P15–P19 — smaller corrections

| # | Finding | Fix |
|---|---|---|
| P15 | Keypad keys are **64px** in UI §2 and §14.5 but **72px** in §8.1's diagram; hold-to-confirm is "56px minimum" while §2/§14.5 put destructive confirms in the 64px tier; Recents chips are 40px against a stated 48px floor with no exception | 72px keypad (it is the wrong-measurement surface, used with gloves); 64px hold-to-confirm; Recents named as the second and final sanctioned exception |
| P16 | §13/0.3 says "slice **1.4**'s loupe consumes it" — the loupe is slice **1.5** | corrected |
| P17 | §2.4 cites **§8.7**, which does not exist (§8 ends at §8.6) | → §11.5 |
| P18 | No normative default for `precisionDenominator` — 16 was implied only by fixtures | stated in §19.5 |
| P19 | Slice 2.0 had no "Done when", alone among all slices | given one, with wrong-measurement and data-loss reports as automatic no-gos |
| — | `angleDeg` returns `0` for a degenerate vertex, silently | commit gate requires both rays ≥ 8 screen px |

---

## D. Open — needs a human decision, not a fix

### 🟡 P21 — a fraction chip silently re-rounds every label in the project

§8.5's Dimension flow step 4 says the fraction chips "set the denominator for this entry **AND**
update the project precision" (M11's one-source-of-truth rule). Combined with Chain — which commits
at B and immediately starts the next dimension — tapping `1/8` for one awkward measurement silently
changes the rounding of **every label in the project**, from inside a single entry.

M11's principle (one source of truth, no stored labels) is right and should stand. The question is
whether a chip tap inside one entry is the correct gesture for a project-wide change.

**Recommendation:** the chip sets the denominator **for that entry**; changing the project default
stays with the style panel's Precision control, which already exists and already confirms
`«Project precision: 1/16»`. **This is a product decision — resolve it before building slice 1.8.**
Flagged in the plan's 1.8 gate; not changed unilaterally, because it is settled behaviour in the
spec and the review's job is to surface it, not to overrule it.

### Carried forward, still unanswered (from CONTINUITY)

Metric at launch · typed job-site address · sheet templates. None block slice 0.0–1.4.

---

## E. What was checked and found sound

Not everything was broken. Re-derived independently and confirmed:

- **The §4.2 export invariant.** `bitmap = mu × M` px embedded at `96 × M` dpi → physical
  `= (mu × M)/(96 × M)` in `= mu/96` in `= 0.75 × mu` pt, identical at every M. At M=2: a 4-mu
  stroke → 8 px @ 192 dpi → **3 pt**; an 18-mu label → 36 px @ 192 dpi → **13.5 pt**. ✓
- **§9.2 page math.** `pageW = imagePx × 0.75` pt with the bitmap drawn to cover → embedded dpi
  `= (imagePx × M)/(imagePx × 0.75/72) = 96M`. Self-consistent. ✓
- **The §8.5 inset coordinate model** (session 3's hardening) — the shared `-crop` offset for both
  the asset image and every child, the rotation pivot in local crop-window units, and
  `asset = local + crop` for hit-testing. Re-traced; correct as written.
- **The keypad's core table** — `12 6` → 150 in, `12 6 3` → 150 3/16 in, `12' 6 3/8"` → 150.375 in,
  the 8-case compose table, `pressDot` semantics. All still pass after the guard changes.
- **The formatters** — `formatInches(11.99)` → `1'-0"` (11.99 × 16 = 191.84 → 192 ticks = 12 in =
  1 ft), `formatInchesOnly(124.5)` → `124 1/2"`, `ft-decimal` → `10.38'` (124.5/12 = 10.375). ✓
- **Atomicity design** (tmp → close → `move()`), the zod `.nullish()` discipline, derived-only
  labels, and the two-tab/per-project lock **naming** were all correct in principle — the defects
  were in the implementations of those correct ideas, which is why reading them passed and running
  them did not.

---

## F. Method note for round 5

Three rounds in a row have now found defects in reference code that survived the previous round's
review. The pattern is consistent: **prose-level review finds prose-level defects; only execution
finds execution-level defects.** Two of this round's findings (F1 and the `con.jpg` row in my own
first-draft sanitizer) were caught only by running the code.

For the next reviewer: extract every reference code block into a runtime and run it against its own
committed table **before** reading a single paragraph of prose. Budget the first hour for that. It
has paid for itself three times.
