# Field Measure — Implementation Plan (v1.2 — hardened)

**Derived from:** `docs/preflight-handoff-v0.3-hardened.md` §13 (slice spec) + §2.4 (scope authority),
after adversarial review rounds 1, 2, the session-3 flush-out, and the **session-4 senior
adversarial + hardening review**. This plan is the **execution order**: it adds per-slice files,
numbered build order, signatures at point of use, inline test tables, and checkable gates to the
spec's slices. The spec remains the authority on *what* to build; this plan is the authority on
*order and done-ness*.

> ## What session 4 changed (read this before anything else)
>
> Round 4 re-executed the spec's own reference code and attacked the plan for work that **no slice
> owned**. The full finding register with evidence is **`docs/review-session-4-hardening.md`**;
> spec-level fixes are marked `SESSION-4 FIX (…)` in the build spec and collected in its
> changelog rows 21–38, **§5.8** and **§19**.
>
> | What | Where it landed |
> |---|---|
> | **Three new slices** — 0.0 (origin & distribution), 1.4.5 (top bar + tool rail + panel docking), 1.11 (release & update) | this plan + spec §13 |
> | **Two new modules with no previous owner** — `src/state/persistQueue.ts` (nothing saved annotations between 1.5 and 1.10) and `src/domain/migrate.ts` | slices 1.2 and 1.1 |
> | **Test infrastructure**, which did not exist and was not specified, while three slices already depended on it | slice 0.1 |
> | **Six wrong-measurement guards** in the keypad/parser (a wrong committed test row, a silent sign flip, zero-length commits, numerator ≥ denominator, a property test that covered none of the branches it claimed, junk `enteredText`) | slice 1.1 tests |
> | **Four data-loss paths** in storage (an unlocked "locked" write, tmp cleanup that never entered the directories tmp files live in, I/O errors bypassing recovery, no disk-full state) | slice 1.2 |
> | **Accessibility** moved out of slice 1.10 into every UI slice's gate | all UI slices |
>
> **The single most important one:** slice 0.0. The origin the app is served from is the identity
> boundary for the persisted folder handle, every setting, OPFS and the service-worker cache.
> Choosing it after slice 0.1 costs a migration and silently orphans user data. It is a half-day
> decision and it must happen first.

**Reading rules for the builder:**
1. Do not start a slice until the previous slice's **Gate** passes. Gates are checkable — run them, don't eyeball them.
2. Each slice's **Spec refs** point into the build spec (§ numbers) — build exactly that, no more.
3. Anything unspecified → simplest behavior consistent with spec §11.6 + one line in `docs/DECISIONS.md`.
4. If a gate fails in a way the spec doesn't cover, **stop and record it** in `docs/DECISIONS.md` before improvising.
5. **Signatures** below are restated at the point of use from the spec's reference code — the spec
   section holds the full code; do not re-copy it into this plan. Build to the spec, not to this summary.
6. **Numeric expectations you add** must be hand-derived in a comment — round 2 caught a wrong
   committed number that had survived review, and **round 4 caught another one that survived
   rounds 2 and 3** (§6.1's unicode row asserted 124.5 for an input that returns `null`). Every
   test value below shows its arithmetic.
7. **Execute, do not read.** Rounds 2, 3 and 4 each found real defects in reference code that had
   already passed a review. Before you trust any code block in the spec, run it. If a spec
   expectation and your execution disagree, **your execution wins** — fix the spec with a traced
   calculation in `docs/DECISIONS.md`, then fix the code. Never weaken a test to make a gate pass.
8. **Every slice that ships UI carries its own accessibility acceptance** (§19.6): focus order,
   visible focus ring, `aria-label` on every control, **48 px minimum touch target** (the 44×44
   floor is raised for touch-primary — touch model §7.1), **hit slop 16 px general / 24 px along
   thin strokes** (was 8/12 for pen), no keyboard trap. Slice 1.10 keeps the themes, the canvas
   accessible object tree, and the end-to-end audit — it is no longer where accessibility *starts*.

**Open items deliberately left to slices (do not "solve" them now — see brief §8):**
- **Device caps report** — filled by slice 0.2 on real hardware; feeds 1.4's resolution-toggle labels.
- **TypeScript 7 vs 5.x** — **pinned to 5.x** per §21.6/D14; the exact 5.x patch is resolved via `npm view typescript@5 version` at checkpoint C1.
- **`Konva.pixelRatio` downgrade on Surface Go** — measured in slice 1.3 (spec §8.1.1).
- **Metric-at-launch / typed site-address / sheet templates** — human product questions (CONTINUITY "Open questions"); the plan assumes no answer.

---

## Dependency graph (why this order)

```
0.0 origin & distribution decision   (no code; pins the origin for the product's life)
   │
   ▼
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
                                        1.4.5 editor shell  (top bar · tool rail · panel docking)
                                            │               NEW — nothing built the rail
                                            ▼
                                        1.5 dimension tool ◀── (0.3 handedness + 1.1 keypad + 1.3 canvas + 1.4.5 rail)
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
                                        1.11 release & update   NEW — SW update flow, install runbook
                                            │
                                            ▼
                                        2.0 field pilot
```

Hard ordering constraints (violating any of these re-creates a review finding):
- **0.2 before any canvas UI** — **touch-first** input (tap-tap, one-finger object drag, pen-free
  palm handling) is the highest product risk (spec R2; touch model §3/§8).
- **0.3 before 1.2 and 1.5** — the Home shell (0.3) is where projects are created, which 1.2's gate
  wires to real storage; the loupe (1.5) consumes handedness (0.3).
- **1.1 before 1.2** — storage validates with the zod schema; and 1.1's keypad table is the
  wrong-measurement guard.
- **1.3 before 1.4/1.5** — capture and dimension tools render into the sheet canvas 1.3 creates.
- **1.9 after 1.8** — export renders with final style rules; testing it mid-style-system wastes the
  export-invariance gate.
- **0.0 before 0.1** (session 4) — the manifest's `start_url`/`scope` and every origin-scoped store
  (idb-keyval handle + settings, OPFS, SW cache, the FSA grant) are fixed by the origin. Deciding it
  after the scaffold means a migration, and the failure mode is silent: files survive, handles and
  settings do not.
- **1.4.5 before 1.5** (session 4) — the tool rail is "do not simplify #1" and hosts all 14 tools.
  No earlier slice built it, so 1.5/1.6 had tools with nothing to select them from.
- **1.2's persistence queue before 1.5** (session 4) — 1.2 builds write *primitives*; nothing owned
  the debounce → serialize → backoff → flush pipeline, so annotations created in 1.5 were never
  written until the chip arrived in 1.10. `persistQueue.ts` closes that gap inside 1.2.

> **Parallelism note:** 1.1 (pure domain, no UI) could be started as soon as 0.1 lands, in parallel
> with 0.2/0.3. The plan sequences it after 0.3 for a linear story, but a team may run 1.1 alongside
> 0.2/0.3 with no dependency risk — 1.1 touches only `src/domain/` and `tests/*.test.ts`.

---

## Verification discipline (applies to every slice)

- **Unit tests:** `npx vitest run` — all green before any gate.
- **Typecheck:** `npx tsc --noEmit` — zero errors.
- **Build:** `npm run build` — succeeds.
- **On-device:** the gates below marked **[Surface]** require a real Surface. **Touch is the primary
  input**, so most gates need only touch; a gate that genuinely needs a pen is marked
  **`[Surface — pen]`** (mouse-only or touch-only testing misses those input bugs — spec §13).
- **Canvas tests run in a real browser, never jsdom.** jsdom has **no canvas implementation**:
  `stage.getIntersection()` returns `null` and `toDataURL()` returns a stub, so a hit-testing test
  written against jsdom **passes without testing hit testing** (design handoff §7.1). Any test that
  touches a `Konva.Stage` belongs in the **Vitest browser-mode** project or a Playwright spec; jsdom
  is for stores and pure logic only. Project layout is pinned in slice 0.1.
- **The CSP is a test, not a hope.** Playwright asserts `page.locator('[style]').count() === 0` and
  attaches a `securitypolicyviolation` listener that **fails the spec on any violation** (design
  handoff §7.2) — `style-src 'self'` forbids inline `style=""`, and Konva is CSP-safe only because
  it assigns CSSOM properties directly. Wired in slice 0.1's Playwright config/gate.
- **Never delete a failing test to make a gate pass.** If a spec-provided test expectation is wrong
  (it happened once: the `12 6 → 148` bug), fix the spec expectation with a traced calculation in
  `docs/DECISIONS.md`, then fix the test.
- **`[Surface — pending]`:** a gate that needs hardware you don't have is marked, not deleted.

---

## Phase 0 — Foundation

### Slice 0.0 — Origin, distribution and install decision (NEW — session 4)
**Spec refs:** §19.1, §13/0.0. **No application code. Half a day. Blocks 0.1.**

**Purpose:** pin the origin the app is served from, for the life of the product. This is not a
deployment chore — **the origin is the identity boundary for everything the app persists**:
`idb-keyval` (the `FileSystemDirectoryHandle` *and* all settings), OPFS, the service-worker cache,
and the FSA permission grant are all origin-scoped. Change the origin later and every Surface
silently loses its folder handle and its settings. Project *files* survive on disk, which is what
makes the failure quiet instead of loud — the user just sees first-run again, with no explanation.

**Files:**
- `docs/DECISIONS.md` — the decision, the exact origin string, and why.
- `docs/install-runbook.md` — how one Surface goes from nothing to a working installed app.

**Build order:**
1. Read §19.1's three options and the trade table. **Recommended: a static HTTPS host** — it
   satisfies §1.4 honestly (no backend, no database, no account, no sync; the *app* is still
   served from somewhere), keeps the origin stable, and needs the network only at install and at
   update. `http://localhost` is a secure context but is **port-sensitive**
   (`localhost:5173` ≠ `localhost:8080` — a different origin, a different data world), which is a
   real data-orphaning hazard for a non-technical crew. A plain `http://` LAN address is **not a
   secure context**: no install, no service worker, no `showDirectoryPicker`. It cannot be used.
2. Write the chosen origin into DECISIONS as an exact string — **scheme, host, port, base path**.
   State the `start_url` and `scope` slice 0.1 must put in the manifest, verbatim.
3. Write `docs/install-runbook.md`: open the URL in Edge → `Install` → confirm the app opens in its
   own window → **turn on airplane mode and reload** → pick the projects folder → answer the
   handedness question. One page, written for a person who is not a developer.
4. Record how a new build reaches the devices (this is slice 1.11's input): who publishes, how the
   crew is told, and the expectation that the update toast appears on the next *online* launch.

**Signatures:** none.

**Tests:** none. This slice's artifact is two documents.

**Gate (all must pass)**
- [ ] `docs/DECISIONS.md` names the exact origin string and the reason it was chosen over the other two.
- [ ] The origin is a **secure context** (`https://…` or `http://localhost`) — write down which.
- [ ] `start_url` and `scope` are stated verbatim for slice 0.1 to copy.
- [ ] `docs/install-runbook.md` exists and a non-developer could follow it.

**Rollback:** none needed — nothing is built. But **do not skip this slice and "decide later."**
Later costs a migration and a data-orphaning incident, and it is the one decision in this plan
that gets strictly more expensive with every slice that ships.

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
- `THIRD-PARTY-NOTICES.md` — every runtime dependency's license (MIT/BSD notice text) **plus both
  font licenses (OFL)**; CI checks it exists.
- `.github/workflows/ci.yml` — `npm ci` → typecheck → vitest → build.

**Files added by session 4 (P3, P12, P13 — none of this existed, and three later slices already depended on it):**
- `vitest.config.ts` — **three projects in one config**: `node` (pure domain, default), `jsdom`
  (component tests), and **`browser`** (Vitest browser mode, for anything touching a `Konva.Stage`).
  Without this, slice 0.3's component tests have no DOM, slice 1.1's pure tests pay for one they
  don't need, and every canvas test silently passes against jsdom's non-existent canvas
  (`getIntersection` → `null`, `toDataURL` → stub — design handoff §7.1).
- `playwright.config.ts` — Chromium only (the target is Edge/Chromium); `webServer` runs
  `npm run preview`; **this is the harness for three later gates**: 1.2's kill-switch, 1.3's
  zoom-constancy screenshot diff, and 1.9's export invariance.
- `tests/setup.ts` — jsdom setup (`@testing-library/jest-dom`-style matchers are **not** added; use
  plain assertions to keep the dep list small).
- `tests/fixtures/` — the fixture set every later slice's gate assumes exists but nobody creates:
  `12mp-portrait-exif6.jpg` (EXIF orientation 6 + GPS tags, for 1.3), `tiny-2x2.jpg`,
  `truncated.jpg` (0 bytes, for 1.2), `corrupt-markup.json`, `v02-markup.json` (carries a stale
  `label` key and no `unitFormat`, for 1.1's tolerance test).
- `public/fonts/*.woff2` — **Archivo** (UI) and **JetBrains Mono** (numerals), self-hosted and
  subset. UI spec §3.3 requires them and forbids a CDN; slice 0.1 precaches "both fonts" but no
  slice ever *added* them. Subset to Latin + the glyphs the app actually draws (`′ ″ ° × ≈ ⌫ ✓`);
  record the subsetting command in the file header comment so it is reproducible.
- `src/media/decodeWorker.ts` — a stub worker. §7.3 requires decode-in-a-worker for thumbnails; the
  Vite worker convention (`new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' })`)
  must be proven to build **now**, not discovered to be misconfigured in slice 1.3.

**Build order (literal):**
1. Rewrite `package.json`: `"type": "module"`; scripts `dev`/`build`/`preview`/`test`/`e2e`/`typecheck`; strip the caret ranges so each runtime+dev dep is an exact pin (§2.2). **TypeScript is pinned to 5.x** per §21.6/D14 (not TS 7); resolve the exact 5.x patch via `npm view typescript@5 version` at checkpoint C1 and record the resolved patch in DECISIONS. Run `npm install` to regenerate the lockfile, then commit it.
2. `vite.config.ts`: `@vitejs/plugin-react` + `vite-plugin-pwa` with a `manifest` (name, icons, `display: standalone`, `start_url`) and `workbox` precaching the app shell, both fonts (woff2), and icons. **No** `runtimeCaching` entry that could capture `blob:` URLs or user files.
3. `tsconfig.json`: `strict: true`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, paths alias `@/* → src/*`.
4. `src/main.tsx` + `src/App.tsx`: minimal React 19 root + placeholder. `src/ui/strings.ts` exports an empty `const STRINGS = {} as const`.
5. `public/icons/*` placeholders (PNG + SVG, any original art — will be replaced later, never third-party).
6. Serve the CSP from §2.2 (meta tag in `index.html` or a dev/middleware header). CSP string (verbatim): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.
7. `THIRD-PARTY-NOTICES.md`: one section per runtime dep (§2.2's 11: react, react-dom, konva, zustand, immer, zod, idb-keyval, @cantoo/pdf-lib, perfect-freehand, lucide-react, fflate) with its license + notice text.
8. `.github/workflows/ci.yml`: `npm ci` → `npx tsc --noEmit` → `npx vitest run` → `npm run build` →
   `npx playwright test`; a step asserting `THIRD-PARTY-NOTICES.md` exists. Use
   `npx playwright install --with-deps chromium` (Chromium only — the target is Edge/Chromium).
9. **(session 4)** `vitest.config.ts` with **three** projects:
   ```ts
   // test: { projects: [
   //   { test: { name: 'node',    environment: 'node',    include: ['tests/**/*.test.ts'] } },
   //   { test: { name: 'jsdom',   environment: 'jsdom',   include: ['tests/**/*.test.tsx'],
   //             setupFiles: ['tests/setup.ts'] } },
   //   { test: { name: 'browser', browser: { enabled: true, provider: 'playwright',
   //             instances: [{ browser: 'chromium' }] }, include: ['tests/**/*.browser.test.ts'] } },
   // ] }
   ```
   Convention: `.test.ts` = pure/node, `.test.tsx` = component/jsdom, `.browser.test.ts` = real
   canvas/browser. **Nothing that constructs a `Konva.Stage` may live in the jsdom project** — put it
   in `browser`; the jsdom project would pass whether or not the code works (design handoff §7.1).
10. **(session 4)** `playwright.config.ts`: `testDir: 'tests/e2e'`, Chromium project,
    `webServer: { command: 'npm run preview', port: <preview port>, reuseExistingServer: !process.env.CI }`.
    Add one smoke spec (`tests/e2e/smoke.spec.ts`: the app loads, the title is right) so the harness
    is proven green before a later slice depends on it.
11. **(session 4, design handoff §7.2) CSP-as-a-test.** In `tests/e2e/`, add a spec that for each
    real viewport (landscape 1440×960, portrait 960×1440, `deviceScaleFactor: 2`):
    (a) attaches `page.on('console'|'pageerror')` **and** a `securitypolicyviolation` listener that
    **fails on any violation**; (b) asserts `await page.locator('[style]').count() === 0` — the
    `style-src 'self'` rule forbids inline `style=""`, and Konva is only safe because it assigns
    CSSOM properties (`el.style.x = …`) rather than `setAttribute('style', …)`. This proves the
    strictest non-visual constraint mechanically before any chrome is built.
12. **(session 4)** Add the fixtures listed above. Generate them deterministically with a committed
    script (`tests/fixtures/make-fixtures.mjs`) rather than committing opaque binaries where you can
    — a fixture nobody can regenerate is a fixture that rots.
13. **(session 4)** Add the two woff2 fonts + `@font-face` (`font-display: swap`) + their OFL text in
    `THIRD-PARTY-NOTICES.md`, and make sure the workbox `globPatterns` actually precaches
    `**/*.{woff2,png,svg}` — precaching a font that isn't in the build is a silent no-op.
14. **(session 4)** Manifest `start_url` and `scope` = the exact strings slice 0.0 wrote into
    DECISIONS. Do not invent them here.

**Signatures:** none (no domain code yet). The only "API" is the pinned dep list + CSP string, both from §2.2.

**Tests:** one node smoke test (`STRINGS` imports), one jsdom smoke test (App renders), one
**browser-mode** smoke test (a trivial `Konva.Stage` constructs and `toDataURL()` returns a real
data URL — proving the browser project actually has a canvas), one Playwright smoke spec. Their job
is to prove the **four harnesses run**, not to test anything. Plus the CSP-as-a-test spec (step 11).

**Gate (all must pass)**
- [ ] `npm run build` succeeds; `npm run dev` serves in Edge.
- [ ] "Install app" works; after install, **reload in airplane mode still opens the app** (SW precache). [Surface]
- [ ] `THIRD-PARTY-NOTICES.md` exists and names all 11 runtime deps **and both font licenses**.
- [ ] CI green on push.
- [ ] **(session 4)** `npx vitest run` runs **all three** projects (node + jsdom + browser) and all
      smoke tests pass; the browser project's `toDataURL` returns a **real** data URL (not jsdom's stub).
- [ ] **(session 4)** `npx playwright test` passes the smoke spec against `npm run preview`.
- [ ] **(session 4, design handoff §7.2)** The **CSP-as-a-test** spec is green at both viewports:
      `[style]` count is 0 and no `securitypolicyviolation` fires. Konva's layer styling is CSSOM
      property assignment, which `style-src 'self'` permits — prove it, don't assume it.
- [ ] **(session 4)** Both fonts load from `/fonts/` with the network throttled to offline after install
      (DevTools → Network → Offline → reload → text is not in a fallback face). [Surface]
- [ ] **(session 4)** `decodeWorker.ts` is bundled and instantiable (the smoke test constructs it and
      gets a message back) — proves the Vite worker setup before 1.3 needs it.
- [ ] **(session 4)** Manifest `start_url`/`scope` match slice 0.0's DECISIONS entry **exactly**.

**Rollback:** this slice is config-only — revert the config files. If a pin fails to resolve, check the lockfile against the installed `node_modules`; do not silently widen a pin (that's a DECISIONS change).

### Slice 0.2 — Input spike (throwaway canvas; do before any UI)
**Spec refs:** §8.2 (hardened router), §13/0.2, A7.

**Purpose:** de-risk the **touch-first** input pipeline — tap-tap placement, one-finger object
drag vs pan, two-finger pan, and the pen as an *enhancement* (pressure/tilt/hover + palm
suppression **when a pen is present**) — and measure real device camera caps **before** any product
UI depends on either. **Touch is the primary input**; a pen-less session must be fully usable and
must not pretend to have palm suppression it does not have (see the pen-free palm path below).

**Files:**
- `src/editor/inputRouter.ts` — the hardened classifier (production code, kept), now **touch-first**.
- `src/editor/spike.tsx` (throwaway) — a bare canvas wired to the router; deleted at end of slice.
- `docs/DECISIONS.md` — append the **device caps report** (real `getUserMedia` max, torch/flip behavior).

**Build order:**
1. `src/editor/inputRouter.ts` exactly per §8.2 — `classify`, `notePenEvent`, `penStrokeStart/End`,
   palm window 1200 ms refreshed by **every** pen event, touch ignored **during active pen strokes**.
   **Touch-first additions (locked):**
   - **Touch can draw.** A touch with a drawing/placement tool armed classifies as `'draw'` (the
     PlacementController turns it into tap-tap anchors A→B; freehand *ink* still requires the
     `«Finger draws (freehand)»` toggle, default **OFF**). Touch is never blanket-classified as
     `'navigate'` just because no pen has ever been seen.
   - **Pen-free palm path.** The suppression window **only ever starts on a pen event** — with no
     pen, `lastPenAt` stays `0` and there is **no suppression at all**. Do **not** fake one (a
     contact-size palm filter is not reliable — `PointerEvent.width/height` default to `1`). Instead:
     (a) reject contacts that begin in the OS **edge/dead zones**; (b) require **multi-touch
     debounce** before treating two contacts as a pan; (c) make `pointercancel` **roll back** the
     provisional geometry and lean on **undo** as the real safety net. State this dishonesty risk
     plainly in DECISIONS.
2. Throwaway canvas: **touch taps place A→B** (tap-tap; a drag from A to B is the same machine with
   a live provisional); one-finger drag **moves a grabbable, unlocked object, else pans** (locked
   decision: object-first); **two-finger drag always pans**; a second finger **cancels the drag and
   restores the previous position**; pinch zooms (pivot = pinch midpoint); a **pen** additionally
   draws with pressure/tilt and hovers; `getCoalescedEvents()` feeds ink.
3. Surface CSS: `touch-action: none; user-select: none`; `setPointerCapture` on `pointerdown`; **abort
   provisional geometry on `pointercancel`** (rollback, never a partial commit).
4. **Device caps report:** `enumerateDevices()` + `getUserMedia` track constraints on the target Surface; record the real max resolution (not the sensor MP) + torch/flip availability into `docs/DECISIONS.md` (feeds 1.4's toggle labels).

**Signatures (from §8.2 — extended for touch; full code in spec):**
```ts
export type InputIntent = 'draw' | 'navigate' | 'ignore';
export function createInputRouter(palmWindowMs = 1200): {
  notePenEvent(): void;              // feed EVERY pen pointer event (down AND move) — the ONLY clock start
  penStrokeStart(): void;
  penStrokeEnd(): void;
  classify(e: PointerEvent, now?: number): InputIntent;  // touch may be 'draw' — see truth table
  onPenHover(e: PointerEvent): void; // pointerType==='pen' && no buttons → hover affordances
  // ── touch-first additions (locked) ──────────────────────────────────────────
  noteTouchContact(e: PointerEvent, phase: 'down' | 'move' | 'up' | 'cancel'): void; // feeds the pen-free path
  onPointerCancel(e: PointerEvent): void;  // roll back provisional geometry; never a partial commit
  readonly penPresent: boolean;      // false ⇒ NO suppression window exists; lean on undo + cancel
};
```

**Tests (unit, pure — Vitest with synthetic PointerEvent-shaped objects; runs in the `node` project):**
| Case | Expected |
|---|---|
| `pointerType:'pen'` (down/move) | `'draw'`, and `lastPenAt` refreshes |
| `pointerType:'touch'`, drawing tool armed, `«Touch places and moves»` ON, **no pen ever seen** | `'draw'` — touch can draw; no suppression window exists (`penPresent === false`) |
| `pointerType:'touch'` within 1200 ms of a pen event | `'ignore'` (palm) |
| `pointerType:'touch'` > 1200 ms after the last pen event, no active stroke | `'navigate'` (drag) / placement tap handled above the router |
| `pointerType:'touch'` while `penStrokeActive` (stroke > 1.2 s) | `'ignore'` — the window must NOT re-open |
| `pointerType:'mouse'` | `'draw'` |
| `pointercancel` during a stroke | stroke aborts, no partial commit (rolled back; undo available) |
| `pointercancel` mid-placement (touch) | pending placement discarded; **no geometry committed** |

**Gate (all must pass)**
- [~] **Touch tap-tap (no pen present):** tapping twice places a dimension A→B; the geometry commits
      and the value sheet can be opened. [Surface]
- [~] **Touch drag vs pan (the §3.1 predicate):** one-finger drag on a grabbable, unlocked object
      moves it; on empty canvas it pans; a **second finger cancels and restores the previous
      position**; two-finger drag always pans. [Surface]
- [~] **Pen parity:** the pen draws (pressure/tilt) and the same tap-tap placement works with it. [Surface]
- [~] **Palm gauntlet (with a pen present):** draw a stroke > 1.2 s with a palm resting on the glass
      mid-stroke — no pan, no zoom, no stray ink. [Surface]
- [~] **Touch-only palm gate (no pen ever detected):** rest a palm/heel and tap-tap — no accidental
      placement; a stray contact is recoverable by `pointercancel` rollback + undo. Assert the router
      reports `penPresent === false` and that **no suppression window is claimed** (it is best-effort
      only). [Surface]
- [~] Ink appears ≤ 16 ms perceived (draw fast and watch; use the browser's frame stats if in doubt). [Surface]
- [~] Pull the pen out of range mid-drag → `pointercancel` → stroke aborts cleanly (no partial commit). [Surface]
- [~] A touch `pointercancel` mid-placement discards the pending anchor and commits nothing. [Surface]
- [x] Device caps recorded in `docs/DECISIONS.md`.

**Rollback:** fix the router forward (it's pure and unit-tested). The spike canvas is throwaway — if the router is wrong, the unit table above pins the bug before any UI consumes it.

### Slice 0.3 — First-run, Settings, Home shell
**Spec refs:** §13/0.3 (new), UI spec §4.4 (first-run), §11.9 (Home), §10 (stores).

**Purpose:** the two first-run steps + a Home shell so that handedness exists **before** the loupe
(1.5) and a project-creation surface exists **before** storage (1.2).

**Files:**
- `src/ui/FirstRun.tsx` — two steps (handedness; projects folder). Must complete < 20 s.
- `src/ui/Settings.tsx` — minimal: **Input group** (touch toggles), handedness, units/precision, theme, density.
- `src/settings/handedness.ts` / `input.ts` / `units.ts` / `theme.ts` / `density.ts` — typed read/write helpers over idb-keyval.
- `src/state/appStore.ts` — zustand store per §10 (projects list, currentProject/Sheet, storageStatus, theme, density, handedness, unitSystem/Format, precision, **input toggles**).
- `src/ui/ProjectList.tsx` — Home shell: empty/loading/error states + card grid on **placeholder data** (real scanning lands with 1.2), per UI §11.1.
- `src/ui/strings.ts` — all new copy (handedness question, empty-state line `«Projects are just folders…»`, touch toggle labels, etc.).

**Build order:**
1. `src/settings/*`: idb-keyval-backed get/set for handedness (`'right'|'left'`, default right), unitSystem (`'imperial'`), unitFormat (`'ft-in'`), precisionDenominator (16), theme (`'standard'`), density (`'field'`), and the **touch-first input toggles** (`src/settings/input.ts`):
   - **`touchPlaces`** (`«Touch places and moves»`, default **ON**) — the F1/F2 capability: touch
     creates and moves geometry. This is the ON-equivalent of the old single "Finger draws" toggle.
   - **`fingerDraws`** (`«Finger draws (freehand)»`, default **OFF**) — finger *freehand ink* only;
     the pen always draws regardless. Was the old toggle, now the narrow one.
   - **`penOnly`** (`«Pen only»`, default **OFF**) — input filter that limits finger gestures to
     two-finger pan/zoom; no longer the only input filter (§20.5b; UI §14.7; strings `settings.penOnly`).
   - `magnifierOnTap` (`«Magnifier when you tap»`, default **ON**) and `glovedTouch`
     (`«Gloved touch (bigger touch targets)»`, default **OFF**) — touch model §7.7; gloved adds
     hit slop +8 px, snap acquire +4 px, loupe offset +16 px.
2. `src/state/appStore.ts` per §10: state shape + actions (no persistence queue yet — that's 1.2).
3. `src/ui/FirstRun.tsx`: step 1 handedness = a **plain question** (`«Which hand do you write with?»`, Right pre-selected — **no Windows-setting claim**, spec M6/D18); step 2 projects folder = `showDirectoryPicker({ id: 'fieldmeasure-projects', mode: 'readwrite' })` with a suggested `Documents\FieldMeasure` (use `startIn: 'documents'`; show the resolved path in mono). Persist the handle in idb-keyval.
4. `src/ui/ProjectList.tsx`: empty state (`«Projects are just folders on this PC. Pick one and everything saves into it.»`), loading (6 skeleton cards), and card grid reading placeholder data — per UI §11.1 states.
5. `src/ui/Settings.tsx`: read/write the `settings/*` helpers + appStore; render the **Input group**
   (the five input toggles above) so touch behaviour is user-controllable from the first-run app.
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
  // touch-first input toggles (touch model §7.7)
  touchPlaces: boolean;      // «Touch places and moves» — default true
  fingerDraws: boolean;      // «Finger draws (freehand)» — default false
  penOnly: boolean;          // «Pen only» — default false (input filter)
  magnifierOnTap: boolean;   // «Magnifier when you tap» — default true
  glovedTouch: boolean;      // «Gloved touch» — default false
  // … actions (create via zustand)
}
```

**Tests:** component tests for FirstRun (two steps, Right default, auto-advance) and Settings round-trip (set handedness → reload → persisted). Plus: the five input toggles default correctly (`touchPlaces: true`, `fingerDraws: false`, `magnifierOnTap: true`, `glovedTouch: false`, `penOnly: false`) and persist across reload.

**Gate (all must pass)**
- [ ] First run completes in < 20 s; both steps land on Home.
- [ ] Handedness persists across reload and is visible in Settings.
- [ ] **Touch toggles:** `«Touch places and moves»` is ON and `«Finger draws (freehand)»` is OFF on a
      fresh install, and changing either persists across reload.
- [ ] Home renders the honest empty state (`«Projects are just folders…»`).
- [ ] Airplane-mode reload still works (no new network deps crept in).
- [ ] **(a11y §19.6)** First-run is completable with the keyboard alone; both steps have a visible
      focus ring, an `aria-label` on every control, and **48 px minimum touch targets with 16 px hit
      slop** (touch model §7.1/§7.2); the folder-picker button is reachable by Tab and announces what
      it does. The toggle rows are ≥48 px and their state is announced, not colour-only.

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
- **`src/domain/migrate.ts` (session 4 — P11).** §3.1 says "migration runs per file on load and is
  idempotent/tolerant of mixed versions" but no module, signature or slice ever existed for it; the
  only migration actually described (v0.2 tolerance) happened by accident, because zod strips
  unknown keys. Exports `CURRENT_SCHEMA_VERSION`, `migrateProjectFile`, `migrateMarkupFile`, and the
  **normalize step** that fills `unitFormat: 'ft-in'` and `precisionDenominator: 16` when absent
  (§19.5 — 16 is now the stated default). Migration runs **after** the zod parse, never before.
- `tests/units.test.ts`, `tests/keypad.test.ts`, `tests/geometry.test.ts`, `tests/snapping.test.ts`, `tests/schema.test.ts`, **`tests/migrate.test.ts`**.

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

// SESSION-4 guards (§6.1.1) — these are wrong-measurement gates, not conveniences
export const VALID_DENOMINATORS: readonly number[];      // [2,4,8,16,32,64]
export function isValidDenominator(d: number): boolean;
export const MAX_LENGTH_IN: number;                       // 12000 (1000 ft)
export function isCommittableInches(v: number | null): boolean;   // 0 < v <= MAX_LENGTH_IN

// migrate.ts (session 4)
export const CURRENT_SCHEMA_VERSION: number;
export function migrateProjectFile(parsed: ProjectFile): ProjectFile;   // idempotent
export function migrateMarkupFile(parsed: MarkupFile): MarkupFile;      // idempotent

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

*units.test.ts* — strict parser accepts `10'`→120, `10' 4"`→124, `10'-4 1/2"`→124.5, `10 ft 4 in`→124, `4-1/2`→4.5, `1/2"`→0.5, `124.5`→124.5, `10\u2032 4\u2033`→124 (unicode primes **are** normalized); **rejects** `abc`, `4 1/0`, ``, `12 6`, `12 6 3`, `.5`, and — **session 4** — `10\u2032-4 \u00BD\u2033` (F1: this row was in the *accepts* table asserting 124.5; executed, it returns `null`, because the vulgar fraction `\u00BD` is never normalized — the spec's own trailing comment already said so) and the negatives `-5`, `-5 1/2`, `-10' 4"` (F2: `-5` used to return **+5**). Formatter: `formatInches(124.5)`→`10'-4 1/2"`; `formatInches(11.99)`→`1'-0"` (carry: 11.99×16=191.84→192 ticks=12 in=1 ft); `formatInches(0.5)`→`1/2"`. `formatLength` unit formats: `formatLength(3162.3,'imperial',16,'ft-in')`→`10'-4 1/2"`; `'in'`→`124 1/2"`; `'ft-decimal'`→`10.38'` (124.5/12 = 10.375 → `toFixed(2)` = 10.38).

> **Negative-value contract (session 4, F2).** Lengths are **non-negative** across the domain. The
> strict parser rejects them, `isCommittableInches` rejects them, so one can never enter the data.
> `formatInches` keeps its sign branch deliberately — if a negative ever *does* reach a label, it
> should be loudly visible rather than silently absolute. Its output for a negative is **not**
> parser-round-trippable (`formatInches(-124.5)` → `-10'-4 1/2"` → parses to `null`); that is
> intentional and is asserted as such, so nobody "fixes" the parser to accept it.

*keypad.test.ts* — the §6.1.1 table verbatim, plus the trace cases:
- `12 6` → 150 in (12×12 + 6 = 150).
- `12 6 3` → 150 + 3/16 = 150.1875 in (denominator = project precision 16).
- `12' 6 3` → same as `12 6 3` (explicit feet + loose numerator).
- `10 ft 4 in` → 124; `4-1/2` → 4.5.
- `124.5` → rawDecimal `'124.5'` preserved, `inchesMode:true`.
- compose table (8 cases) — see spec §6.1.1.
- round-trip: `12' 6 3/8` → compose → `12'-6 3/8"` → strict parses to 150.375 (12×12 + 6 + 3/8 = 150.375).
- `pressDot`: `emptyKeypadState(16)` + `pressDigit('1')`+`pressDigit('2')`+`pressDot()`+`pressDigit('8')` → `12 + 8/16` = 12.5 in.
- **Property test (value round-trip, 500 combos) — REWRITTEN in session 4 (F5).** The old generator
  drew every slot from `String(Math.floor(Math.random()*n))`, which **never produces `''`**. Measured
  over 2000 draws: `feet===''` **0 times**, `inches===''` **0**, `numerator===''` **0**. The
  empty-slot branches — exactly where round 1's fraction-dropping bug lived — were covered only by
  the 7-row table, never by the property test written to prevent that regression. It also drew
  `numerator==='0'` ~5% of the time, composing junk like `12'-6 0/16"` that still round-trips by
  value, so the assertion passed on garbage. The generator now draws `''` (20%), `'0'` (10%), and a
  positive digit string (70%) per slot, and the test asserts **three** things:
  1. value round-trip (`parseImperialToInches(compose(st)) === keypadValueInches(st)`),
  2. **shape** — the composed text never matches `/\b0\/\d+/` and never starts with `0'`,
  3. **its own coverage** — each of `feet`, `inches`, `numerator` was empty in >20 of the 500 draws,
     so the test fails if someone silently narrows the generator again.
- **Commit guards (session 4, F3/F4)** — these are the wrong-measurement gates:
  | Input | Before | Required now |
  |---|---|---|
  | `0` + Enter | committed a **0″ dimension** | `isCommittableInches(0)` = `false` |
  | `12 6 20` | committed **151.25″** (20/16 = 1.25″ the user never typed) | `parseLooseToSlots` → `null` |
  | `12 6 16` | committed 151″ | `null` (numerator must be **<** denominator) |
  | `12 6 15` | 150 15/16″ | still accepted — 15/16 is valid |
  | `10' 4 99/100` | committed **124.99″** at a denominator outside `{2,4,8,16,32,64}` | `null` |
  | `10' 4 3/8` | 124.375″ | still accepted |
  | 12001 in | committed (1000 ft+) | `isCommittableInches` = `false`; 12000 = `true` |
- **Zero-slot compose (session 4, F6):** `{feet:'12',inches:'6',numerator:'0'}` → `12'-6"` (was
  `12'-6 0/16"`); `{feet:'0',inches:'4'}` → `4"` (was `0'-4"`); inches-mode `{inches:'',numerator:'0'}`
  → `''` (was a bare `"`). `composeEnteredText` and `keypadValueInches` **must use the same presence
  test** — if they disagree, the preview and the stored text diverge, which is a wrong-measurement path.

*geometry.test.ts* / *snapping.test.ts* — distance/angle/rotate/midpoint/pointInRect; `snapPoint` threshold, `snapAngle` 0/45/90.

*schema.test.ts* — round-trips the example JSON in §3.5/§3.6 (and **rejects** screen-pixel data or a missing `schemaVersion`); **v0.2-file tolerance**: an object with an extra `label` key parses (zod strips it) and one missing `unitFormat` normalizes to `'ft-in'`; corrupt JSON returns `{success:false}` without throwing.

*migrate.test.ts (session 4)* — `migrateProjectFile`/`migrateMarkupFile` are **idempotent**
(`migrate(migrate(x))` deep-equals `migrate(x)` — assert it, it is the property that makes a
migration safe to run on every load); `tests/fixtures/v02-markup.json` (stale `label`, no
`unitFormat`) migrates to `CURRENT_SCHEMA_VERSION` with `unitFormat: 'ft-in'` and
`precisionDenominator: 16`; a file with a **future** `schemaVersion` is refused with a clear error
rather than mangled (a newer build's file opened by an older build must not be silently downgraded —
this is real once two Surfaces are on different builds, see slice 1.11).

**Gate (all must pass)**
- [ ] `npx vitest run` green, including the property test with **value** assertions (not just parseability).
- [ ] **Trace check (pick 5 by hand):** `12 6` → 150 in; `12 6 3` → 150 3/16 in; `10'-4 1/2"` → 124.5 in; `124.5` → 124.5 in; `1/2"` → 0.5 in. Any disagreement → stop and check against the spec's verified table (§6.1.1 was execution-verified in rounds 2 and 4).
- [ ] **(session 4)** The property test's **coverage assertions** pass — it proves it exercised the
      empty-slot branches, not just that it ran 500 times.
- [ ] **(session 4)** All seven commit-guard rows above behave as the table requires. A single row
      failing is a wrong-measurement tripwire: stop.
- [ ] **(session 4)** `migrate` is idempotent, and a future `schemaVersion` is refused, not mangled.
- [ ] **(session 4)** `formatInches(-124.5)` → `-10'-4 1/2"` **and** `parseImperialToInches` of that
      string → `null`, asserted explicitly so the contract is visible in the test file.

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
- **`src/state/persistQueue.ts` (session 4 — P2, the gap that mattered most in this slice).**
  Spec §10 says "the command history and persistence queue live in dedicated modules, not in the
  stores", and §5.4 fully specifies the pipeline (400 ms coalesce → serialize per sheet → 1s/3s/10s
  backoff → park → flush on `pagehide`/`visibilitychange`) — but **no slice ever listed the module**.
  1.2 built write primitives, 1.5 created the first annotations, and 1.10 built the chip that
  *displays* save state. Between 1.5 and 1.10 nothing would have written a single annotation to
  disk. This module is the missing middle, and it belongs here because it is storage, not UI.

**Build order:**
1. `src/fs/backend.ts`: the `StorageBackend` interface (§5.1) + `FsaBackend` (File System Access) + `OpfsBackend` (`navigator.storage.getDirectory()`) + `chooseBackend()`.
2. `src/fs/projectStore.ts` `initStore` (QUERY permission only — **never** `requestPermission` outside a gesture) + `pickRoot` (gesture) + `writeAtomic`/`writeJsonAtomic`/`readJsonValidated` + `cleanStaleTmp` (lock-held + 5-min age).
3. Per-project lock + BroadcastChannel (`fm:project:<id>`): serialize writes per project; invalidate a second tab on the same project into read-only.
4. `.history/_project/` + `.history/<sheetId>/` snapshots (every 10 min + before destructive actions; 20/200 MB caps, oldest-first) + recovery path in `readJsonValidated`.
5. Truncated-photo detection (§5.3): 0-byte `photo.jpg` or `createImageBitmap` failure → `«Photo damaged — markup preserved…»`, never delete `markup.json`.
6. Flush on `pagehide`/`visibilitychange`.
7. `src/data/storage.ts` `ensurePersistentStorage`.
8. Rewire `ProjectList.tsx`: scan root → cards (id-keyed); create/open; `Locate…`/re-pick with `isSameEntry`.
   **(session 4, §5.8c)** Handle **duplicate project ids** — near-certain, because the sanctioned
   sharing model is *copying the project folder* (D11). Group the scan by id; a group with more than
   one folder shows **every folder as its own card**, badges the non-most-recently-modified ones
   `«Copy»`, and keys the in-memory project by `id + folderName`. Opening a copy offers
   `«Make this a separate project»` (mint a new id, rewrite `project.json` atomically). **Never
   merge two folders; never write into a folder the user did not open.**
9. **(session 4)** `src/state/persistQueue.ts` — the §5.4 pipeline, in one module:
   coalesce 400 ms per `(projectId, sheetId)` key → serialize per key → `writeJsonAtomic` →
   backoff 1s/3s/10s on failure → park in `'pending'` (never retry forever) → flush on
   `pagehide`/`visibilitychange`. It is the **only** caller of `writeJsonAtomic` for markup, and it
   owns `storageStatus`. The Autosave chip (1.10) subscribes to it and **never** sets state itself —
   that is how "never show Saved optimistically" is enforced structurally rather than by discipline.
   Failure classification comes from `StorageWriteError.kind` (§5.3): `'disk-full'` → the §5.8a
   state (**and no automatic pruning of `.history/` or `.trash/` — deleting the user's recovery data
   to make room for a save is a data-loss path**); `'target-locked'` → backoff then
   `«File is open in another app — Retry»`; `'permission'` → the §5.2 reconnect state.
10. **(session 4, §5.8d)** Deterministic two-tab arbitration: on project open, request
    `navigator.locks.request('fm:project:'+id, { mode:'exclusive', ifAvailable:true }, …)` and hold
    it for the session. Lock holder = writer; any tab without it is read-only **immediately** and
    shows `«Open in another tab — read only»` + `«Take over»`. §5.4 said a second tab is invalidated
    but never said which tab loses when both open at once.
11. Kill-switch test harness (Playwright + CDP, using `playwright.config.ts` from slice 0.1): crash mid-write.

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

// projectStore.ts  — SIGNATURES CHANGED IN SESSION 4; use these, not v1.1's
type MaybePromise<T> = T | Promise<T>;
export async function initStore(): Promise<void>;
export async function pickRoot(): Promise<void>;   // user-gesture only
export class StorageWriteError extends Error { kind: 'disk-full'|'target-locked'|'permission'|'unknown'; }
// `projectId` is REQUIRED (S1): writeAtomic takes the per-project Web Lock itself. The old
// signature's doc comment promised the lock and the body never took one.
export async function writeAtomic(dir: FileSystemDirectoryHandle, name: string, data: string | Blob, projectId: string): Promise<void>;
export const writeJsonAtomic: (dir: FileSystemDirectoryHandle, name: string, data: unknown, projectId: string) => Promise<void>;
// `onMissing` (S3): a brand-new sheet has no markup.json — that is expected absence, not corruption.
export async function readJsonValidated<T>(dir: FileSystemDirectoryHandle, name: string, parse: (s: string) => MaybePromise<{ success: boolean; data?: T }>, onMissing?: () => T): Promise<T>;
export async function cleanStaleTmp(dir: FileSystemDirectoryHandle, projectId: string): Promise<void>;   // now RECURSIVE (S2)

// state/persistQueue.ts (session 4)
export interface PersistQueue {
  queueSheet(projectId: string, sheetId: string, data: MarkupFile): void;   // coalesced 400 ms
  queueProject(projectId: string, data: ProjectFile): void;
  flush(): Promise<void>;                     // called on pagehide/visibilitychange AND before reload (1.11)
  subscribe(fn: (s: AppState['storageStatus']) => void): () => void;
  readonly inFlight: boolean;                 // 1.11's update toast is suppressed while true
}
export function createPersistQueue(): PersistQueue;

// storage.ts
export async function ensurePersistentStorage(): Promise<boolean>;
```

**Tests (mostly scripted/manual — storage is I/O-bound):**
- Atomic write: write → kill mid-`markup.json`, mid-`photo.jpg`, mid-`move()` → reload: previous file intact, no `*.tmp` survivors.
- `cleanStaleTmp` unit (mock `navigator.locks` + a fake dir): a `.tmp` newer than 5 min survives; one older is removed; runs under `fm:project:<id>`.
- **(session 4, S2) `cleanStaleTmp` recursion:** the fake dir must contain
  `sheets/003/markup.json.tmp`, `sheets/003/photo.jpg.tmp`, and `assets/<hash>.jpg.tmp`, all older
  than 5 min → **all three removed**. The previous implementation iterated the project root only, so
  every tmp file this app actually writes was invisible to it and accumulated forever — and slice
  1.2's own "no `*.tmp` survivors" gate could never pass. A `.trash/` tmp must **survive** (skipped).
- **(session 4, S1) lock coverage:** assert `writeAtomic` requests `fm:project:<id>` — spy on
  `navigator.locks.request`. Two concurrent `writeAtomic` calls to the same file must serialize
  (assert the second's `createWritable` starts after the first's `move` resolves).
- **(session 4, S3) I/O failures reach recovery:** a `getFileHandle` that throws `NotFoundError`
  with no `onMissing` → recovery is attempted; with `onMissing` → the default is returned and
  recovery is **not** attempted; a `getFile().text()` that throws `NotReadableError` → recovery is
  attempted. Previously all three escaped as unhandled rejections and never reached `.history`.
- **(session 4, S4) disk full:** stub `write()` to throw `QuotaExceededError` → `StorageWriteError`
  with `kind: 'disk-full'`, `storageStatus` becomes `'full'`, the tmp is **kept**, and **nothing in
  `.history/` or `.trash/` is deleted**.
- Two-tab matrix: same project → second read-only; different projects → both writable.
- **(session 4, S7) arbitration is deterministic:** open the same project in two tabs "simultaneously"
  (both before either finishes) → exactly one is the writer, 10 runs out of 10.
- **(session 4, S6) duplicate ids:** two folders whose `project.json` carry the same `id` → two cards,
  the older badged `«Copy»`, opening either writes only into its own folder.
- Corruption: hand-corrupt `project.json` AND `markup.json` → auto-recover from `.history/`.
- Truncated `photo.jpg` → damaged-photo state, markup intact.
- **(session 4, P2) persistQueue:** 10 rapid edits → exactly **one** write 400 ms after the last;
  two different sheets → two independent write chains; a failing write backs off 1s/3s/10s then
  parks in `'pending'` and stops (assert no 4th attempt); `flush()` writes immediately and resolves
  only after the write promise settles.

**Gate (all must pass)**
- [~] Create a project → folder appears on disk with `project.json`. [Surface]
- [~] **Kill-switch ×3:** power-loss mid-`markup.json` write, mid-`photo.jpg` write, mid-`move()` → reload: previous file intact, no `*.tmp` survivors, autosave chip reaches Saved. [Surface]
- [x] Corrupt `project.json` **and** `markup.json` by hand → both auto-recover from `.history/`.
- [x] Truncate `photo.jpg` by hand → load shows `«Photo damaged — markup preserved…»` state, markup intact.
- [~] Two tabs, same project → second is read-only. **Two tabs, different projects → both writable.** [Surface]
- [~] Explorer-rename the project folder mid-session → identity survives (card still opens after Locate/repick). [Surface]
- [~] **(session 4)** Kill-switch leaves **no `*.tmp` anywhere**, including inside `sheets/<n>/` and
      `assets/` — check the whole tree, not the project root. [Surface]
- [~] **(session 4)** Fill the disk (or stub the quota error) mid-edit → chip shows
      `«Disk full — free space to save»`, the edit is not lost, and **`.history/` and `.trash/` are
      untouched**. [Surface]
- [~] **(session 4)** Copy a project folder in Explorer → both appear as separate cards, one badged
      `«Copy»`; editing one never writes into the other. [Surface]
- [x] **(session 4)** Draw nothing but change project meta → `persistQueue` writes once, 400 ms
      later; pull the power 200 ms after an edit → the edit is gone but the file is **intact and
      valid** (coalescing loses ≤400 ms by design; corruption is the thing that must never happen).
- [x] **(session 4, a11y §19.6)** Every control added in this slice has a visible focus ring and an
      `aria-label`; the read-only and disk-full states are announced, not just coloured; **48 px
      minimum touch targets, 16 px hit slop**.

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
   **Touch-first input (locked — touch model §3.1):** one-finger drag is **object-first** — it moves a
   grabbable, unlocked object under the finger; on empty canvas it pans. **Two-finger drag always
   pans**; a second finger cancels an in-progress object drag and **restores the previous position**;
   the **Pan tool overrides** object-first unconditionally. **While a placement tool is armed,
   double-tap fit↔100% is suspended** (a deferred single tap would feel laggy); pinch stays the zoom
   gesture and a Fit button is always available. Classify tap vs drag on `pointerup` with
   `TAP_SLOP = 8 px`, `TAP_MAX_MS = 400`; `LONG_PRESS_MS = 600`.
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
- **Browser project, not jsdom:** this test constructs a `Konva.Stage`, so it belongs in the
  `browser` Vitest project (`.browser.test.ts`) or a Playwright spec — in jsdom it would pass without
  a canvas (design handoff §7.1).
- **Object-first drag predicate (pure):** a down on a grabbable unlocked object → `'object'`; on a
  locked object → `'pan'`; on empty canvas → `'pan'`; with the Pan tool active → `'pan'`; a second
  finger arriving mid-drag → cancel + **restore the recorded pre-drag position** (`maxDrift ≤ 8 px &&
  duration ≤ 400 ms` → `'tap'`).

**Gate (all must pass)**
- [~] A 12MP phone photo opens upright (EXIF baked) and zooms 0.25×–8× smoothly on a Surface Go. [Surface]
- [~] 20-photo import doesn't crash (memory watch). [Surface]
- [x] **Zoom constancy screenshot-diff at 1×/4×/8×:** test stroke + label width constant in CSS px, geometry scales. (This validates §4.2 screen rules before 4 more slices build on them.)
      → machine-checked by `tests/editorCanvas.browser.test.ts` (pixel-scan thickness + `fontSize()` measurement).
- [~] **Touch object-drag:** one-finger drag on an object moves it; on empty canvas pans; a second
      finger cancels and **restores the previous position**; two-finger drag always pans. [Surface]
- [~] EXIF: exported/normalized photo contains no GPS (verify in Explorer file properties). [Surface]
      → the machine half is green (`tests/exif.test.ts` + `tests/normalizeImage.browser.test.ts` prove the re-encode drops APP1/GPS).
- [~] **(session 4)** The thumbnail decode actually runs in `decodeWorker.ts` (slice 0.1's stub) —
      §7.3 requires decode-in-a-worker; confirm on the Performance panel that decode is off the main
      thread, don't assume the import wired it up.
      → machine half green: `tests/thumbnails.browser.test.ts` asserts the worker's `decodedIn: 'decodeWorker.ts'`
      provenance marker. The Performance-panel observation is logged to the hardware checklist.
- [~] **(a11y §19.6)** The canvas container has an accessible name and is not a keyboard trap; zoom
      controls are reachable and labelled; **48 px minimum touch targets, hit slop 16 px (24 px along
      thin strokes)**.
      → name/role/labels are in the markup (`role="application"` + `aria-label`, labelled zoom buttons);
      the on-device focus/target walk is logged to the hardware checklist.

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
- [ ] **(a11y §19.6)** Shutter, toggles and the review actions are keyboard-operable and labelled;
      the camera-unavailable panel's guidance is text, not an image; **all touch controls ≥48 px with
      16 px hit slop** (the 88 px shutter clears it).

**Rollback:** fix forward. If the 0.2 report shows both modes ≈4K, keep the toggle but confirm the label copy in DECISIONS (§18.5 — open item).

### Slice 1.4.5 — Editor shell: top bar, tool rail, panel docking (NEW — session 4)
**Spec refs:** §11.3 (editor layout), §11.4 (tool rail), §13/1.4.5, UI spec §5–§6, §19.6.

**Purpose:** the chrome that every tool slice after this one needs, **and which no slice owned**.
The vertical tool rail is "do not simplify #1" and hosts all 14 tools; before this slice, 1.5 and
1.6 built tools with no surface to select them from, and the 14 bespoke glyphs (§2.2: lucide is
chrome-only) had no producer. Building it here also means 1.5–1.8 each land in a real app instead
of a test harness.

**Files:**
- `src/ui/EditorLayout.tsx` — the §11.3 docking rule, the only place layout geometry lives.
- `src/ui/ToolRail.tsx` — 14 tools in 6 groups, 56px targets, 8px gaps, handedness-driven side.
- `src/ui/TopBar.tsx` — project/sheet breadcrumb, undo/redo, the autosave-chip **slot** (1.10 fills
  it; a placeholder that never lies — render nothing rather than a fake "Saved").
- `src/ui/icons/tools/*.tsx` — the 14 bespoke glyphs.
- `src/state/editorStore.ts` — `activeTool`, `pendingOp`, `selection`, `viewTransform` (§10).

**Build order:**
1. `editorStore.ts` per §10 — `activeTool: ToolId`, `pendingOp`, `selection`, `viewTransform`,
   `focusInsetId`. No tool logic; this is the registry the rail reads.
2. `ToolRail.tsx`: 14 tools / 6 groups (§11.4) at **56px with 8px gaps** (§14.5; 56 px ≥ the 48 px
   touch floor). The side is **handedness only** (§19 / session-3 finding: rail-side override, bottom
   rail, pin order and Quick Pair are all deferred — "Bottom" contradicts "the tool rail never
   moves"). Selecting a tool whose implementation does not exist yet is a **no-op, not a crash** —
   that is what lets 1.5–1.8 land one tool at a time.
3. `src/ui/icons/tools/*`: 14 original SVG glyphs, single-path where possible, `currentColor`, 24px
   grid. **Placeholder glyphs are acceptable to unblock this slice** (a numbered square is fine);
   final art is a prerequisite for 2.0, not for 1.5. Record which are placeholders in DECISIONS so
   they can't ship by accident.
4. `EditorLayout.tsx`: the §11.3 docking rule, stated as one testable predicate —
   **`aspect = viewportW / viewportH`; `aspect >= 1.2` → style panel docks to the side opposite the
   rail; `aspect < 1.2` → it docks to the bottom as a 72px horizontal style bar.** The **rail never
   moves** on rotation; rotation preserves zoom/centre, tool, selection and open panels, and reflows
   in 180 ms.
5. `TopBar.tsx`: breadcrumb (`Project › Sheet 04`), undo/redo buttons wired to nothing yet (1.5
   brings `history.ts`), and the autosave-chip slot.
6. Keyboard: `Esc` follows one ladder — pending → deselect → exit Focus → navigate (one level per press, never
   two); tool hotkeys per UI spec; **arrow-key nudge is 1.10's**, don't pre-build it.

**Signatures:**
```ts
// ui/EditorLayout.tsx
export type PanelDock = 'side' | 'bottom';
export function panelDockFor(viewportW: number, viewportH: number): PanelDock;  // >= 1.2 → 'side'

// ui/ToolRail.tsx
export type ToolId = 'select'|'dimension'|'angle'|'line'|'arrow'|'rect'|'ellipse'
                   | 'polygon'|'freehand'|'highlight'|'text'|'inset'|'erase'|'pan';
export interface ToolDef { id: ToolId; group: 1|2|3|4|5|6; label: string; Icon: React.FC; implemented: boolean; }
```

**Tests:**
| Case | Expected |
|---|---|
| `panelDockFor(1240, 908)` → aspect 1.366 | `'side'` |
| `panelDockFor(960, 1388)` → aspect 0.691 | `'bottom'` |
| `panelDockFor(1200, 1000)` → aspect **exactly 1.2** | `'side'` (the boundary is inclusive — pin it) |
| handedness `'left'` | rail renders on the **left** (the rail sits on the writing-hand side, §5.1/§14.8); **rail side is the only rail setting in v1** |
| rotate landscape → portrait | rail side unchanged; dock flips; tool + selection preserved |
| tap a tool with `implemented: false` | no-op, no throw, rail does not change `activeTool` |

**Gate (all must pass)**
- [ ] All 14 tools render in the rail at 56px with 8px gaps, on the handedness side. [Surface]
- [ ] Rotating the Surface flips the style-panel dock and **does not move the rail**; zoom, tool and
      selection survive. [Surface]
- [ ] `panelDockFor` unit table green, including the inclusive 1.2 boundary.
- [ ] The top bar's autosave slot renders **nothing** until 1.10 — it never shows an optimistic state.
- [ ] **(a11y §19.6)** Tab order is rail → canvas → panel → top bar; every control has a visible
      focus ring and an `aria-label`; the rail is a `role="toolbar"` with arrow-key navigation; no
      keyboard trap; **48 px minimum touch targets with 16 px hit slop** (56 px rail buttons already
      clear it).

**Rollback:** fix forward. If the docking rule feels wrong on a real Surface, change the **threshold
number** in `panelDockFor` and record it in DECISIONS — do not move the rail (§11.6 #1) and do not
introduce a second layout mode.

### Slice 1.5 — Dimension tool (flagship)
**Spec refs:** §8.5 Dimension, §8.4 (loupe), §8.3 (history), §6.1.1 (keypad), UI spec §8.1, §13/1.5.

**Purpose:** **tap A → tap B** (drag from A to B still supported) with the loupe + the slot-keypad +
derived labels. v1 is **typed-only** — the drawn line is visual; the value is typed (no `≈`, no
calibration).

**Files:**
- `src/editor/Loupe.ts` — zero-delay, edge-aware, handedness-aware, tracks B; **touch loupe variant** (200 px / 4× / 136 px offset, contact disc, freeze-on-lift 700 ms — touch model §2.1).
- `src/editor/tools/DimensionTool.ts` — tap-tap A→B (drag still supported), snapping (acquire 32 px → lock 20 px), angle-snap chips, live derived label (dual-outline), collision rule (140 px/36 px leader), 450 ms settle window.
- `src/ui/DimensionKeypadSheet.tsx` — **slot state machine from 1.1** wired to keys; hardware buffer → `parseLooseToSlots`; Enter disabled on null value.
- `src/editor/history.ts` — command pattern (100 steps, coalescing) (§8.3).
- `src/editor/shapes/` — dimension line renderer (imperative Konva).

**Build order:**
1. `history.ts`: `Command`/`History` (100 steps; ink coalesced; style edits coalesced 600 ms; redo clears on new edit). Undo addresses by `(sheetId, annotationPath)` (incl. `insetId/childId`).
2. `Loupe.ts`: **(session 4, F8 — the spec's three numbers were mutually impossible)** magnification
   is **fixed at 3.5×** and the source region is **derived**: `sourcePx = diameterPx / 3.5`
   (112px → 32px, 160px → **45.7px**, 200px → 57px). The old text said "160px diameter, ~3.5×, of an
   80×80px source" — a 160px window at 3.5× shows 45.7px, and an 80px source in a 160px window is
   exactly 2×; all three could not hold. Fixing magnification (not source size) keeps endpoint
   placement precision constant when the user changes loupe size, which is the point of the loupe.
   Offset ~112 px up-and-away-from-hand (edge-aware, flips within 24 px of viewport edge), crosshair
   12 px gap; tracks moving tip B while pending.
   **Touch loupe variant (touch model §2.1, locked):** 200 px diameter, **4×** of a 100×100 source,
   **136 px** offset (clears the finger and its contact disc), a **44 px translucent contact disc**
   showing the finger's true footprint, a 1 px dashed `«--sel»` leader to the anchor, instant full
   opacity (no fade), **freezes on lift for 700 ms then fades to 40%**, suppressed by
   `«Magnifier when you tap»` (default ON). Kept: never a hit target, edge-aware (24 px), never under
   the hand or the point, never animated.
3. `DimensionTool.ts`: **commit on tap B** — tap-tap is the primary path; a **drag from A to B is the
   same machine** (A on `pointerdown`, provisional between, B on `pointerup`), so there is no second
   code path for touch. Snapping acquire **32 px → lock 20 px** under touch (pen stays 20 px), default
   **Strong** under touch; live label at midpoint with collision rule; cancel-keeps-geometry.
   **Settle window (touch model §1.4, locked):** on tap B the geometry commits immediately and
   `settleTimer = setTimeout(openKeypad, 450)`; **any canvas `pointerdown` before it fires clears the
   timer permanently for this placement** — within 40 px of an anchor → `RefineEndpoint`, otherwise
   pan; refining does **not** re-arm (the keypad then opens only via the explicit `✓ Value`). Contact
   never discards geometry.
4. `DimensionKeypadSheet.tsx`: keys → `pressDigit`/`pressDot`; fraction chips set denominator (project precision) + move activeSlot; ft/in toggle; **preview = pure function of slots** (`formatLength(keypadValueInches(st) × 25.4, …)`); hardware buffer → `parseLooseToSlots(buffer, project.precisionDenominator)` → `{ slots, rawDecimal }`; Enter commits `valueMm` + `enteredText = rawDecimal ?? composeEnteredText(slots)`;
   **(session 4, F3/F4) Enter is gated on `isCommittableInches(value)` — not on null/NaN.** The old
   gate let a bare `0` commit a 0″ dimension and let `12 6 20` commit 151.25″. When the gate blocks,
   show the reason in the preview area (`«Enter a length»` / `«Fraction must be smaller than 1/16»` /
   `«Too large»`) — a disabled button with no explanation reads as a broken app in the field.
   **(touch model §5.1) Keypad-open state:** while the sheet is open the rail/style sit at 40% and are
   **non-interactive**; the canvas stays live for **pan and pinch-zoom only**; taps do nothing. `Esc`
   and the sheet's `✕` keep the geometry.
5. Wire: chain (start next from B), select/move-endpoints/delete, undo/redo, ghost `«tap to enter value»` label on cancel. Post-place, anchors are permanently grabbable when the object is selected (`pointerdown` within 40 px → `RefineEndpoint`); the **Offset Nudge Pad** (120 px pad 96 px away, 0.35× core / 1.0× outer) is optional for this slice but is the intended refinement path (touch model §2.3).

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
- Keypad truth table (on-device, hardware keys): `12 6`+Enter → `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact; `Esc`/`✕` keeps the stroke with a ghost label. **A canvas tap while the keypad is open does nothing** — no place, no select, and it no longer also cancels (touch model §5.1); the canvas stays live for **pan/pinch only**.
- **Tap-tap placement:** tap A → tap B commits; the keypad auto-opens **only if no canvas contact occurs** during the 450 ms settle window; contact cancels the auto-open **permanently** for that placement and never discards the geometry.
- History: stroke = one undo step; style-change coalescing; redo clears on new edit.
- Label derivation: change precision 1/16→1/2 → every label re-derives (no stored labels — schema has none).

**Gate (all must pass)**
- [ ] **Tap-tap placement (no pen):** two taps place a dimension; geometry commits at tap B; the value
      sheet opens after the 450 ms settle **unless** a contact occurred. [Surface]
- [ ] **Keypad truth table (on-device, hardware keys):** `12 6` + Enter → label `12'-6"`; `12 6 3` → `12'-6 3/16"`; `10'-4 1/2"` → exact; `Esc`/`✕` keeps the stroke with a ghost label; a canvas tap while the keypad is open does nothing. [Surface]
- [ ] **(session 4) Refusal table (on-device):** `0` + Enter → refused with a reason; `12 6 20` →
      refused (not 151.25″); `-5` → refused; a 1001-ft value → refused. Each shows *why*. [Surface]
- [ ] **(session 4)** The loupe's magnification is 3.5× at **every** size setting — measure a known
      feature at 112/160/200 px and confirm the ratio, don't eyeball it. [Surface]
- [ ] **(a11y §19.6)** The keypad is operable from the hardware keyboard alone; focus is trapped
      inside the sheet while it is open and returns to the canvas on close; every key has an
      `aria-label`; the live preview is an `aria-live="polite"` region; **keypad keys are ≥48 px with
      16 px hit slop** (the keypad's 72 px keys already clear it); placement state is announced
      (`«Dimension: first point placed»`).
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
- `src/editor/tools/SelectTool.ts` — selection, 8 handles (**28 px visual / 72 px hit** under touch), rotate, marquee, groups, lock, mini-toolbar (64 px tall).
- `src/editor/tools/AngleTool.ts` — vertex-first, **3-tap tap-tap** (vertex → ray-1 tip → ray-2 tip; drag still supported), commit sheet (`≈ 43.2°`, complement/supplement, chain).
- `src/editor/tools/ShapeTool.ts` — Line/Arrow/Rect/Ellipse (**tap-tap A→B**, drag still supported) + Polygon (tap-by-tap, the sanctioned precedent); hold-400 ms constraint.
- `src/editor/tools/FreehandTool.ts` — freehand + highlighter; hold-to-shape (600 ms / 16 px under touch); highlighter defaults to **straight-line tap-tap** under touch.
- `src/editor/tools/TextTool.ts` — `fontSize = fontSizeMu / s`; auto-contrast background.
- `src/editor/tools/EraseTool.ts` — object + stroke-scope (split at raw points); **stroke-scope is pen-only** (touch deletes whole strokes).
- `src/editor/shapes/svgPath.ts` — **local** `getSvgPathFromStroke` (NOT exported by perfect-freehand).
- `src/editor/shapes/` renderers — one per geometry kind.
- `src/ui/LayersPanel.tsx` — §8.6 flyout.

**Build order:**
1. `svgPath.ts` (local helper, MIT from steveruizok's recipe) + the freehand renderer: `getStroke(points, { size: strokeWidthMu / stageScale, thinning:.5, smoothing:.5, streamline:.5 })` → `getSvgPathFromStroke(outline, true)` → `Konva.Path` fill, `strokeScaleEnabled:false`. Store raw points, never the derived path.
   **(session 4, F7 — read this before you copy the spec's snippet.)** Geometry stores **two parallel
   arrays**, `points: Px[]` and `pressure: number[]` (§3.3/§3.4). `Px` has **no** `pressure` member,
   so the pre-session-4 snippet `points.map(p => [p.x, p.y, p.pressure ?? 0.5])` **does not compile
   under `strict: true`** — and casting around it yields a constant `0.5` for every point, silently
   killing pressure/tilt ink width while looking like it works. Index the parallel array:
   `points.map((p, i) => [p.x, p.y, pressure[i] ?? 0.5])`. The highlighter shares this renderer and
   the same fix.
   **(touch) `pressure` is a pen-only signal.** Browser `PointerEvent.pressure` is constant (`0.5`)
   for touch, and `width`/`height` default to `1` when hardware cannot report contact geometry — a
   finger never produces a varying-pressure stroke. Under touch, freehand width is **constant by
   design**: pressure→width **off**, width floor **8 mu**, smoothing raised to **60**, thinning `0`
   (touch model §4.2). The renderer must use the constant `?? 0.5` fallback and must never expect
   variation from a non-pen source.
2. `ShapeTool.ts` — **Line/Arrow/Rect/Ellipse: tap-tap A→B** (tap 1 = A, tap 2 = B, no value sheet;
   a drag from A to B is the same machine and remains supported); **Rectangle/Ellipse** corner-to-corner
   or centre-out per the existing setting. **Polygon: tap-by-tap** (the sanctioned precedent) with nodes
   raised to a **56 px hit**, a 56 px `«--sel»` close ring at 32 px proximity, a `✓ Done` HUD button
   (the discoverable equivalent of `Enter`) and `«Undo point»` (replacing `Backspace`). Hold-400 ms
   constraint; live `W×H`/length readouts.
3. `AngleTool.ts` — vertex-first, **3 taps** (vertex → ray-1 tip → ray-2 tip; the arc renders live from
   tap 1, and a drag path remains supported); after tap 3 the Angle sheet opens on the **same 450 ms
   settle rule** as the Dimension keypad; a tap within 44 px of the vertex cancels. Commit sheet with
   `≈ 43.2°` (the Angle tool's honest-readout convention, unrelated to calibration).
4. `TextTool.ts` — tap-to-type, `fontSize = fontSizeMu / s`, auto-contrast background (48×48 sample), leader.
5. `FreehandTool.ts` — pressure/tilt width (**pen only**), hold-to-shape (400 ms + `«⇧ Shape»` chip;
   **600 ms / 16 px under touch** — finger jitter defeats 400 ms / 8 px); highlighter (multiply, 30%
   alpha, chisel, **auto z-below**). **Touch:** finger freehand is gated behind
   `«Finger draws (freehand)»` (default OFF), and the highlighter's `«Straight line»` lock
   **defaults ON** under touch, turning it into a **tap-tap** chisel bar that reuses the placement
   machine verbatim (touch model §4.3); chisel width default **24** for touch.
6. `EraseTool.ts` — object mode + stroke-scope (split at nearest raw points; never a polygon-boolean).
   **Touch:** object mode = tap-to-delete + undo toast naming the object, with long-press (600 ms)
   previewing the `«--err»` outline without deleting; **stroke-scope is pen-only** — under touch hide
   stroke mode and show `«Splitting a stroke needs the pen. Touch can delete the whole stroke.»`
   (touch model §4.1).
7. `SelectTool.ts` — handles (aspect-locked scale, rotate 0/15/30/45/90), alignment guides, grouping, locking. **Touch (touch model §3.3):** handles **28 px visual / 72 px hit** (from 8×24/56); the nearest handle within 56 px gets a proximity halo on contact (replaces pen hover); a **second tap on an already-selected object** triggers the tool's action (mirrors the inset precedent); **long-press (600 ms)** selects + pins the mini-toolbar (64 px tall); axis lock after 8 px of movement within 20° of the handle's natural axis; keep the **0 px-overlap invariant** (at 96 px-wide selections suppress edge handles and show corners only).
8. `LayersPanel.tsx` (§8.6): Dimensions · Shapes · Ink · Text, insets (children indented), photo (lockable, never deletable); 56 px rows; drag-to-reorder; tap-select + pan-to.

**Signatures (key new ones):**
```ts
// editor/shapes/svgPath.ts  (local helper — perfect-freehand does NOT export it)
export function getSvgPathFromStroke(points: number[][], closed?: boolean): string;
// renderer usage — NOTE the parallel-array indexing (session-4 F7; `Px` has no `pressure`).
// `pressure` is PEN-ONLY: touch supplies a constant (the ?? 0.5 fallback), so touch freehand is
// constant-width by design.
//   const outline = getStroke(points.map((p, i) => [p.x, p.y, pressure[i] ?? 0.5]), { size: strokeWidthMu / stage.scaleX(), thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
//   const d = getSvgPathFromStroke(outline, true);
//   new Konva.Path({ data: d, fill: style.strokeColor, strokeScaleEnabled: false });
```

**Tests:**
- Ink zoom constancy: draw at 100%, zoom to 8× → ink width unchanged in CSS px (regeneration works).
- Highlighter z-band: inserted below all other markup, above photo.
- Angle: `angleDeg` for a right angle → 90; readable angle flips upside-down text.
- **(session 4, F7) pressure actually varies `[Surface — pen]`:** build a stroke whose `pressure` array
  ramps 0.1 → 1.0 and assert the generated outline's width at the last point is **materially greater**
  than at the first. This is the test that fails if someone re-introduces `p.pressure` (which would
  make every point 0.5 and the two widths identical). Same assertion for `highlight`.
  **This test is unreachable from a finger** — `pressure` is a pen-only parallel array, and browser
  `PointerEvent.pressure` is constant for touch. It **must run with a pen on hardware**; it is not
  deleted. **Touch fallback (asserted separately, in CI):** a synthetic touch stroke (all pressures
  `0.5`) renders at the **constant width floor (8 mu)** and the renderer reads **no per-point width
  from a non-pen source**.
- **Shape tool tap-tap (pure):** Line/Arrow/Rect/Ellipse commit on the second tap; the same machine
  commits on a drag-down/up; Polygon closes on `✓ Done` or a tap within 32 px of its start.
- **Touch erase:** object mode deletes on tap with an undo toast; stroke-scope is hidden under touch
  and shows the pen-required note.
- **(session 4, §19.5) degenerate angle:** `angleDeg(v, v, c)` returns `0` silently — assert that the
  Angle tool's commit gate **refuses** a ray shorter than 8 screen px rather than committing a 0°
  angle.

**Gate (all must pass)**
- [ ] **Every tool places with touch and draws with the pen; each is selectable, movable and
      undoable.** Touch: tap-tap for Line/Arrow/Rect/Ellipse/Angle; Polygon unchanged; each control
      has an on-screen equivalent. Pen: draw/drag for all. [Surface]
- [ ] Highlighter renders below dimensions/shapes/ink on the same sheet.
- [ ] **Ink zoom constancy:** draw a stroke at 100%, zoom to 8× — ink width unchanged in CSS px (regeneration works).
- [ ] Angle tool: commit sheet shows `≈ 43.2°`-style readout, complement/supplement chips, chain.
- [ ] **(session 4) `[Surface — pen]`** A hard-pressed **pen** stroke is visibly wider than a light one
      at the same style width, on the device. If they look identical, `pressure` is being read from
      the wrong place. **`[Surface — pending]`** — requires a pen; cannot run on a touch-only session
      and must not be faked. The CI-side touch fallback (constant 8-mu floor) covers the regression in
      the meantime.
- [ ] **(session 4)** Touch freehand (with `«Finger draws (freehand)»` ON) renders at the constant
      width floor and zoom-constant; erase-stroke mode is hidden under touch and the pen-required note
      is shown.
- [ ] **(a11y §19.6)** Every tool is reachable and operable from the keyboard; the layers panel is a
      proper list with names; focus ring visible on all controls; **48 px minimum touch targets with
      16 px hit slop; handles 72 px hit**.

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
- [ ] **(session 4, §19.3)** Assets are **content-addressed**: importing the same image twice writes
      **one** file, `assets/<sha256hex>.jpg`, and both annotations carry that hash as `assetId`.
      Dedupe is a `getFileHandle` existence check — there is no index file to write or corrupt.
      (`sha256Hex` was defined in §7.1 and called from nowhere before this.)
- [ ] **(a11y §19.6)** Focus mode announces entry/exit; the breadcrumb is a real control; `Esc` exits
      exactly one level per press (the C13 ladder); **48 px minimum touch targets, 16 px hit slop**.

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
- [ ] **(session 4, P21 — confirm the behaviour before building it)** Tapping a fraction chip during
      one dimension entry currently re-rounds **every label in the project**, because the chip edits
      the project-level `precisionDenominator` (§8.5 step 4 / M11). In a Chain sequence that is a
      silent, project-wide change made from inside a single measurement. **Already decided (D31 /
      §21.2):** the chip is **entry-scoped** — it sets the denominator **for this entry**; changing
      the project default requires the style panel's Precision control (which already exists and
      already confirms `«Project precision: 1/16»`).
- [ ] **(a11y §19.6)** Mixed/indeterminate states are announced, not only rendered; disabled controls
      keep an accessible name explaining why they are disabled; **48 px minimum touch targets, 16 px
      hit slop** (the swatch grid keeps its sanctioned sub-48 exception; Recents rise to 44 px).

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
1. `filenames.ts` — **(session 4, P6/P7) §9.4 gives rules but no reference implementation and no
   ORDER, and order changes the answer.** Truncating after stripping trailing dots/spaces can
   re-expose one; the reserved-name check must also run on the **joined** base, not only on tokens.
   Build it in exactly this order:

   ```ts
   const ILLEGAL = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F]/g;
   const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
   const EXT = /^\.[A-Za-z0-9]{1,8}$/;          // what counts as an extension, so `. more` doesn't

   /** One token (project title, sheet name, date, …). ORDER IS PART OF THE SPEC. */
   export function sanitizeToken(raw: string): string {
     // 1. illegal + C0/C1 control chars, leading spaces, trailing dots/spaces (whole token first —
     //    doing this after the extension split turns `foo...` into `foo.`)
     let t = raw.normalize('NFC').replace(ILLEGAL, '').replace(/^\s+/, '').replace(/[.\s]+$/, '');
     // 2. split a REAL extension off, so §9.4's "device name with or without extension" and the
     //    trailing-dot rule both apply to the BASE (`con.jpg` is reserved; `z….  more` is not an ext)
     const d = t.lastIndexOf('.');
     let base = t, ext = '';
     if (d > 0 && EXT.test(t.slice(d))) { base = t.slice(0, d); ext = t.slice(d); }
     base = base.replace(/[.\s]+$/, '');                    // 3. `foo .jpg` → `foo.jpg`
     // 4. cap at 48 INCLUDING the extension
     if (base.length + ext.length > 48) base = base.slice(0, Math.max(0, 48 - ext.length));
     base = base.replace(/[.\s]+$/, '');                    // 5. RE-STRIP — the cut can expose one
     if (base === '') return 'untitled';                   // 6. never empty
     if (RESERVED.test(base)) base = '_' + base;           // 7. DOS device name
     return base + ext;
   }

   /** Join, then apply the SAME rules to the joined base — clean tokens can join into `CON`. */
   export function joinFilename(tokens: string[], ext: string): string {
     let base = tokens.map(sanitizeToken).join('_');
     if (base.length > 120) base = base.slice(0, 120);
     base = base.replace(/[.\s]+$/, '');
     if (base === '') base = 'untitled';
     const d = base.lastIndexOf('.');
     const stem = d > 0 && EXT.test(base.slice(d)) ? base.slice(0, d) : base;
     if (RESERVED.test(stem)) base = '_' + base;
     return `${base}.${ext}`;
   }

   /** SESSION-4 FIX (P7): NTFS IS CASE-INSENSITIVE. `Sheet.pdf` and `sheet.pdf` are ONE file on
    *  disk but two different strings in JS. Comparing case-sensitively means `Overwrite` silently
    *  destroys an unrelated export and `Add (1)` never triggers. Fold case AND normalize Unicode
    *  on BOTH sides, everywhere a conflict is detected. */
   const key = (n: string) => n.normalize('NFC').toLowerCase();
   export function conflictName(existing: string[], name: string,
                                policy: 'add' | 'overwrite' | 'skip'): string | null {
     const taken = new Set(existing.map(key));
     if (!taken.has(key(name))) return name;
     if (policy === 'overwrite') return name;
     if (policy === 'skip') return null;
     const dot = name.lastIndexOf('.');
     const [b, e] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
     for (let i = 1; i < 1000; i++) {
       const c = `${b} (${i})${e}`;
       if (!taken.has(key(c))) return c;
     }
     throw new Error('too many conflicts');
   }
   ```

   > **This implementation was executed against all 29 cases in the test table below and passes.**
   > The first draft of it (written from the §9.4 bullets by reasoning alone) failed the `con.jpg`
   > row — the device-name check must see the *base*, not the whole token. Run it; don't read it.

   Full-path cap (240 chars) is checked against the **destination** path before writing; if
   exceeded, truncate the base and say so in the wizard (never silently write a different name).
2. `renderStage.ts`: offscreen `Konva.Stage` at scale M, `pixelRatio:1`; **strokes `strokeWidth = mu × M`**; **text `fontSize = mu` (no counter-scale)**; **ink `getStroke size = mu`**. One sheet at a time; free each bitmap before the next.
   **(session 4, §19.4b) Hard memory guard — the plan previously had a gate with no remedy.**
   `bitmapBytes ≈ imageWidthPx × imageHeightPx × M² × 4`:
   | Sheet | M=1 | M=2 | M=3 |
   |---|---|---|---|
   | 4096 × 3072 | 50 MB | 201 MB | 453 MB |
   | 4096 × 4096 (worst `normalizeImage` can produce) | 67 MB | 268 MB | **604 MB** |
   If `bitmapBytes > 512 MB`, **refuse that M** and offer the next lower one with
   `«This sheet is too large to export at 3× on this device»`. Do not attempt it and crash the tab.
   **(session 4, §19.4a) Damaged-photo sheets** (§5.3 defines the state; §9 never said what it
   exports as): render the markup on a **white page at `Sheet.imageWidth × Sheet.imageHeight`** and
   list it in the result view under `«N sheets exported without their photo»`. Never skip the sheet
   silently — the markup **is** the measurement record — and never abort the whole export.
3. `pdf.ts`: `PDFDocument.create()` → per sheet `embedJpg(jpg)` (camelCase, verified) → `addPage([imagePx×0.75, imagePx×0.75])` → `drawImage` covering the page. Embed at 96×M dpi.
3b. `pdf.ts` memory, second budget **(session 4, §19.4b)**: `pdf.save()` materializes the whole
   document in memory. If accumulated embedded-JPEG bytes exceed **250 MB**, split into
   `part-01.pdf`, `part-02.pdf`, … and say so in the result view. **This is the designed remedy if
   the 50-sheet gate fails** — decided now, not improvised at gate time.
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
- **Filename table (session 4 — expanded from 3 rows; order-sensitive cases are the point):**
  | Input token(s) | Expected | Why |
  |---|---|---|
  | `CON` | `_CON` | DOS device name |
  | `con.jpg` | `_con.jpg` | device name **with** extension, case-insensitive — **the row the first draft failed** |
  | `LPT9.PDF` | `_LPT9.PDF` | same, upper case |
  | `COM1` | `_COM1` | device name with digit |
  | `COM0` | `COM0` | **not** reserved — don't over-prefix |
  | `foo ` | `foo` | trailing space stripped |
  | `foo .jpg` | `foo.jpg` | trailing space **on the base**, before the extension |
  | `foo...` | `foo` | trailing dots — strip the **whole token** first, or you get `foo.` |
  | `...` | `untitled` | all-dots → empty → substitute |
  | `` (empty) | `untitled` | never a bare `.jpg` |
  | `   ` (spaces) | `untitled` | same |
  | `a/b\c:d*e` | `abcde` | illegal chars removed |
  | `a\u0000b` | `ab` | C0 control |
  | `a\u009Fb` | `ab` | C1 control |
  | 300 × `x` | 48 × `x` | token cap |
  | 47 × `y` + `.` | 47 × `y` | trailing dot |
  | 48 × `z` + `. more` | 48 × `z` | `. more` is **not** an extension — cap applies to the whole token |
  | 50 × `w` + `.jpg` | 44 × `w` + `.jpg` | cap is 48 **including** the extension |
  | `Ünïcode` | preserved (NFC) | NTFS allows Unicode; don't mangle names |
  | `North wall` | `North wall` | inner spaces are fine — don't over-sanitize |
  | join `['CO','N']` + `pdf` | `CO_N.pdf` | joined base is not reserved — don't over-prefix |
  | join `['CON']` + `pdf` | `_CON.pdf` | joined base **is** reserved |
  | join `['','']` + `pdf` | `untitled_untitled.pdf` | empty tokens substituted before joining |
  | join `['Job 12','01','North wall']` + `pdf` | `Job 12_01_North wall.pdf` | the ordinary case |
- **Conflict (session 4, P7):** `Add (1)` doesn't overwrite; `Overwrite` doesn't prompt;
  **`existing = ['Sheet.pdf']`, `name = 'sheet.pdf'`, policy `add` → `sheet (1).pdf`** (NOT
  `sheet.pdf` — on NTFS that is the same file); `existing = ['Sheet.pdf','sheet (1).pdf']`,
  `name = 'SHEET.pdf'`, `add` → `SHEET (2).pdf`; policy `skip` → `null`; policy `overwrite` →
  the name unchanged; NFC/NFD forms of the same accented name are treated as one name.

  **All 29 rows above were executed against the reference implementation and pass.**

**Gate (all must pass)**
- [ ] **Export-invariance test (the B1 acceptance):** export the same sheet at 1×/2×/3× → in each PDF, a 4-mu stroke and an 18-mu label measure **identical physical units** (Acrobat measuring tool), and page size = imagePx × 0.75 pt. [Surface]
- [ ] PNG ×3 opens at the expected pixel dimensions; zip contains all sheets.
- [ ] Filenames: the full **29-row** table above (20 `sanitizeToken` + 4 `joinFilename` + the 5
      conflict cases) passes, including the two truncation-re-exposes-a-dot rows and the
      joined-base row. *(Corrected from "17-row" — the gate text disagreed with its own table;
      recorded in DECISIONS.)*
- [ ] **(session 4)** Export to a folder already containing `Sheet.pdf`, then export `sheet.pdf` →
      the existing file is **not** overwritten under the `Add` policy. [Surface]
- [ ] **(session 4)** A sheet whose `photo.jpg` is damaged exports as markup on a white page at the
      sheet's stored dimensions, and the result view counts it. [Surface]
- [ ] **(session 4)** A 4096×4096 sheet at 3× is **refused with the device message**, not attempted.
- [ ] **(a11y §19.6)** The wizard is fully keyboard-operable; each step is announced; the result
      view's path is selectable text, not an image; **48 px minimum touch targets, 16 px hit slop**.
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
- [ ] **(session 4, §19.6)** The **end-to-end** a11y audit passes — per-slice a11y was already gated
      in each UI slice, so this is the canvas accessible object tree, the themes, and a full
      keyboard-only pass of the core loop, not a first attempt at accessibility. Include the
      **touch-first** checks: 48 px minimum touch targets, 16 px hit slop, canvas focusable so
      arrow-nudge works after a **touch** selection, and selection/placement state announced.

**Rollback:** fix forward. Do not weaken the destructive policy (recoverable = toast+undo; irreversible = hold-to-confirm) — it's a "do not simplify" item.

### Slice 1.11 — Release, update and install (NEW — session 4)
**Spec refs:** §19.1, §19.2, §13/1.11.

**Purpose:** the app has to *get* to the Surfaces and *stay current* there. v0.3 specified neither.
With `vite-plugin-pwa` precaching and no update strategy, a field device runs a stale build forever;
with the wrong strategy, an update reloads the tab mid-measurement.

**Files:**
- `vite.config.ts` (edit) — `registerType: 'prompt'`.
- `src/ui/UpdateToast.tsx` — the non-modal update prompt.
- `src/ui/Settings.tsx` (edit) — build version + build date.
- `docs/install-runbook.md` (from 0.0, now verified end-to-end on a real Surface).

**Build order:**
1. `registerType: 'prompt'` — **never `autoUpdate`**. An automatic reload mid-measurement is both a
   data risk and a trust risk, and this crew's trust in autosave is the product.
2. `UpdateToast.tsx`: on `needRefresh`, show `«Update ready — reload when you're done»` with
   `Reload` / `Later`. **Suppress it entirely while `persistQueue.inFlight`, while
   `pendingOp !== 'none'`, or while the keypad sheet is open** — re-evaluate when those clear.
3. `Reload` → `await persistQueue.flush()` → wait for `storageStatus === 'ok'` → `skipWaiting()` →
   reload. **Never reload over an unflushed queue.** If the flush fails (disk full, locked), keep
   the toast and say so; do not reload.
4. Settings: build version + date, injected at build time (`__BUILD_ID__` via Vite `define`). A
   field bug report that can't name the build is a bug report you can't act on.
5. Re-run the install runbook from 0.0 on a clean Surface, end to end, and correct it where reality
   disagrees with what 0.0 assumed.

**Signatures:**
```ts
// vite define
declare const __BUILD_ID__: string;        // e.g. '2026-09-21T14:03Z+a1b2c3d'
// ui/UpdateToast.tsx
export function UpdateToast(props: { needRefresh: boolean; onReload: () => Promise<void> }): JSX.Element | null;
```

**Tests:**
- Toast suppression: with `pendingOp: 'dimension'` → no toast; clear it → toast appears.
- With `persistQueue.inFlight` → no toast; on settle → toast appears.
- `Reload` calls `flush()` **before** `skipWaiting`, and does not reload if the flush rejects.

**Gate (all must pass)**
- [ ] Deploy a new build to the pinned origin (0.0) → the toast appears on the next **online** launch
      and **never** during a measurement. [Surface]
- [ ] `Reload` with an unflushed edit loses nothing — make an edit, hit Reload within 400 ms, confirm
      the edit is on disk after the reload. [Surface]
- [ ] Airplane-mode reload still works after the update (re-run slice 0.1's gate). [Surface]
- [ ] Settings shows the running build id and date; it changes after the update.
- [ ] `docs/install-runbook.md` was followed on a clean Surface, start to finish, by someone who did
      not write it. [Surface]
- [ ] **(a11y §19.6)** The toast is an `aria-live="polite"` region, is dismissible from the keyboard,
      and never steals focus; **its buttons are ≥48 px with 16 px hit slop**.

**Rollback:** if the prompt flow misbehaves, the safe fallback is **no automatic update at all**
(manual re-install from the runbook) — never `autoUpdate`. Record the choice in DECISIONS.

### 2.0 — Field pilot
**Spec refs:** §13/2.0.

**Do:** 2 people, 1 week, real jobs, side-by-side with their current tool. Write go/no-go + top 5 fixes into `docs/CONTINUITY.md`.

---

## Checkpoint summary (print this)

| # | Slice | One-line gate | Type |
|---|---|---|---|
| **0.0** | **Origin & distribution** | **Origin pinned in DECISIONS; runbook exists** | **decision** |
| 0.1 | Scaffold | Airplane-mode reload works; CI green; **all four test harnesses run (node/jsdom/browser/Playwright)**; **CSP-as-a-test green**; fonts offline | on-device |
| 0.2 | Input spike | **Touch tap-tap + object-drag pass**; pen palm gauntlet **and touch-only palm gate**; ≤16 ms ink; caps recorded | on-device |
| 0.3 | First-run/Home | <20 s first run; handedness persists; **touch toggles default ON/OFF correctly** | on-device |
| 1.1 | Domain | Property test green **incl. its own coverage assertions**; 7 commit-guard rows; 5 hand-traces match | machine |
| 1.2 | Storage | Kill-switch ×3 clean **with no tmp anywhere in the tree**; two-tab matrix; corruption auto-recovers; **disk-full state; duplicate-id cards; persistQueue coalesces** | on-device |
| 1.3 | Photo canvas | Zoom constancy diff at 1×/4×/8×; **touch object-drag / restore-on-second-finger** | on-device |
| 1.4 | Capture | Kill mid-write clean; real resolution label | on-device |
| **1.4.5** | **Editor shell** | **14 tools at 56px on the handedness side; rail never moves on rotation; dock rule** | **on-device** |
| 1.5 | Dimension | **Tap-tap placement + 450 ms settle**; keypad truth **and refusal** tables; 4 dims <60 s; labels re-derive; loupe 3.5× at every size | on-device |
| 1.6 | Markup | Ink zoom constancy; highlighter z-below; **pressure visibly varies stroke width (pen-only `[Surface — pending]`)** | on-device |
| 1.7 | Insets | Child round-trip (scale+crop+rotate+reload); **content-addressed asset dedupe** | on-device |
| 1.8 | Style | <2 s restyle; project-level precision confirm | on-device |
| 1.9 | Export | Invariance at 1×/2×/3×; 50-sheet Go export; **29-row filename table; case-insensitive conflicts; damaged-photo page; 3× refusal** | on-device |
| 1.10 | Safety | Reboot test; trash restore; sunlight legible; **end-to-end a11y audit** | on-device |
| **1.11** | **Release & update** | **Update toast never mid-measurement; Reload loses nothing; runbook followed by someone else** | **on-device** |
| 2.0 | Pilot | 3 real jobs each; **zero wrong-measurement and zero data-loss reports**; go/no-go written | humans |

**Wrong-measurement tripwires (any hit → stop):** keypad trace mismatch, label not re-deriving on
precision change, stale `label` in any JSON file, ink/stroke width changing with zoom, export physical
sizes differing across M, inset child moving when only the inset transforms, inset child detaching when
the crop window moves (the session-3 hardening — children share the image's `-crop` offset).

**Added in session 4:**
- a value the user **did not type** appearing on a label — `12 6 20` → `12'-7 1/4"` was the live
  example (numerator ≥ denominator silently accepted);
- a **zero-length** or negative dimension being committable at all;
- `composeEnteredText` and `keypadValueInches` disagreeing about whether a slot is "entered" (the
  preview and the stored `enteredText` then diverge);
- a **property test that passes without exercising the branch it exists to protect** — assert the
  generator's coverage, not just its result;
- a fraction chip silently re-rounding **every label in the project** (slice 1.8, P21 — decided: the chip is entry-scoped, D31/§21.2).

**Data-loss tripwires (any hit → stop) — new in session 4:**
- any `*.tmp` surviving anywhere in the project tree after a crash (check `sheets/`, not just the root);
- a write path that does not hold `fm:project:<id>`;
- an I/O error that does not reach the `.history` recovery path;
- pruning `.history/` or `.trash/` to make room for a save;
- two project folders with the same id being merged, or a write landing in a folder the user did not open;
- a service-worker reload happening over an unflushed persistence queue;
- changing the origin after slice 0.0 without a written migration.
