# Documentation & File Index

A map of everything in this repository. Last updated **2026-09-25 (session 28: user guide added)**.

## Root

| File | What it is |
|---|---|
| `README.md` | Project entry point: what this is, status, canonical docs, constraints. |
| `AGENTS.md` | **Agent entry instructions (canonical)** — reading order, authority chain, non-negotiables, working rules, lane protocol, environment quirks, when to stop and ask. |
| `CLAUDE.md` | **A pointer to `AGENTS.md`, deliberately** — it used to be a second copy and drifted for three sessions while still claiming no code existed. Do not fork the instructions. |
| `THIRD-PARTY-NOTICES.md` | License notices for every runtime dependency **plus both font OFL texts** (CI checks it exists). |
| `package.json` | Node project manifest, dependencies pinned; scripts wired (`dev`, `build`, `preview`, `test`, `e2e`, `typecheck`). |
| `package-lock.json` | Lockfile — commit it; do not edit by hand; use `npm ci` to install. |
| `.gitignore` | Ignore rules (`node_modules/`, build output, `.slim/deepwork/`, OS/IDE files). |
| `.ignore` | OpenCode ignore rules (keeps `.slim/deepwork/` readable locally). |

## docs/ — canonical

| File | What it is |
|---|---|
| `docs/INDEX.md` | This file. |
| `docs/USER-GUIDE.md` | **User guide** for people using the app: getting started, photos, dimensions, markup, export, troubleshooting. The in-app **Help** pop-up shows the same content (`STRINGS.help`); keep them in step. |
| `docs/CONTINUITY.md` | **Project continuity log** — live state, session timeline, next steps, open questions. Read first when resuming. |
| `docs/preflight-handoff-v0.3-hardened.md` | **PRIMARY BUILD SPEC (canonical).** Hardened after adversarial review rounds 1, 2 and **4**. Its **§2.4 v1 scope table is the single authority on what ships in v1.** Round 2 executed the keypad reference code and fixed a wrong committed test expectation (`12 6` = 150 in, not 148); **round 4 executed it again and found another one** (§6.1's unicode row), plus a silent sign flip, zero/oversized commits, an unlocked "locked" write, and tmp cleanup that never entered the directories tmp files live in. Session-4 additions: changelog rows 21–38, **§5.8** (failure states) and **§19** (origin, SW updates, asset addressing, export guards). Session-4b additions: **§20** (implementation contracts) and **§21** (resolved decisions — nothing left open). |
| `docs/ui-spec-field-measure-v2-hardened.md` | **UI/UX SPEC (canonical), v2.1 touch-first.** Authoritative on look & feel; v1 scope markers `〔v1 scope: …〕` defer to the build spec §2.4; the changelog appendix maps every change to its review finding. **Session 5 inverted the input principle to touch-primary** (tap-tap placement, one-finger drag, touch loupe, nudge pad) and applied C11/C12/C14. |
| `docs/implementation-plan.md` | **EXECUTION PLAN (canonical for order), v1.2 hardened.** Slice order, dependency graph, per-slice files + build order + signatures + inline tests + checkable gates + rollback notes, checkpoint table, wrong-measurement **and data-loss** tripwires. Session 4 added slices **0.0** (origin), **1.4.5** (editor shell) and **1.11** (release), the `persistQueue`/`migrate` modules, test infrastructure, and executed reference implementations. The build spec is the authority on *what*; this is the authority on *order and done-ness*. |
| `docs/review-session-4-hardening.md` | **Session-4 senior adversarial & hardening review** — the finding register with evidence and severity: 8 wrong-measurement defects (executed, not reasoned), 6 data-loss defects, and the "ownerless work" class that produced 3 new slices and 2 new modules. Read it before starting a build slice, and read its **method note** before running round 5. |
| `docs/DECISIONS.md` | Architecture Decision Record (ADR) log — review-driven corrections D21–D31, session-4b design decisions D32–D34, and **session-5 decisions D35–D42** (touch-primary input, tap-tap placement, object-first drag, palm-rejection limits, canvas testing + CSP-as-a-test, no-design-phase tooling). |
| `docs/UNITS.md` | Accepted length input formats, keypad model, rounding rules, examples. |
| `docs/appendix-strings.md` | **UI strings inventory** — every user-visible string, verbatim, keyed for `src/ui/strings.ts`. |
| `docs/CHECKPOINTS.md` | **Checkpoints (C1–C10)** — things only measurable once code exists; each names its slice, what to measure, and an action for every result. Session 5 added **C8** (slice 0.2 touch palm), **C9** (1.6 pen-only pressure) and **C10** (touch placement accuracy). |
| `docs/HARDWARE-TEST-CHECKLIST.md` | **Hardware gate ledger** — deferred `[Surface]` gates + the H1–H18 end-of-build checks. Session 5 added **H1b** (touch-only palm check, the pen-absent router) and **H13–H18** (barrel routing, hover semantics, the OS ~250 ms pinch delay, coalescing rate, Ink API, DPR-2/thermal). |
| `docs/BUILD-LOG.md` | **Build log** — the agent's cross-session memory; one entry per slice. |
| `docs/BUILD-RUNBOOK.md` | **Build runbook** — how to work: the slice loop, gate policy, `[Surface]` deferral, checkpoint recording in three places, the three-strike rule, and **§11 the parallel-lane protocol** (contended files, per-lane verification, the integration checklist). |
| `docs/review-brief.md` | **The review brief** — the eight questions every review lane must answer, each with the real defect that put it there (proves-nothing tests, trivial gates, unfaithful DECISIONS claims, stale arithmetic, faked deferral, flattened invariants, unpinned boundaries, environment coupling). Hand it to every `@oracle`/adversarial lane. |
| `docs/appendix-scaffold-files.md` | **Scaffold reference** — the pinned files slice 0.1 must produce (TS 5.x). |
| `docs/install-runbook.md` | **Install runbook** — one page, non-developer, how a Surface gets the app. |
| `docs/appendix-strings-gaps.md` | **Proposed copy for the gaps** — wording for the 26 implied-but-unquoted strings (PROPOSED, approve before shipping). |
| `docs/gui-ux-readiness-and-design-handoff.md` | **Session-5 senior GUI/UX readiness report + design handoff** — architecture assessment, the Claude Design verdict, the pre-code tooling stack, contradiction register C1–C14, the pre-code decision package, and the touch workstream. |
| `docs/touch-first-interaction-model.md` | **Session-5 touch-first interaction design** — one `PlacementController`, the 450 ms settle window, the touch loupe, the Offset Nudge Pad, the object-first drag predicate, tap precedence, the gesture budget, latency budgets and the required spec deltas. |
| `docs/investigation-torch-and-capture.md` | **Investigation (owner request, 2026-09-22)** — is the ⚡ Torch toggle able to fire the camera LED on a Surface, and is photo capture/import complete? Verdict: the toggle is wired to the real `applyConstraints({ torch })` path, but Windows/Chromium does not expose a torch capability, so the LED cannot be driven from the browser (platform limitation, `[Surface]`-verifiable). Capture and import are both complete and atomic. Carries two un-numbered candidate items. |
| `docs/handoff-session-21.md` | **Session-21 handoff → the next orchestrator (to the beta).** The state in one screen, exactly what is verified and what is *not*, the beta-critical path, the traps that already cost time (dev-CSP, the D51 registry key, this shell), the one review question worth asking every time, the owed work in beta-priority order, orchestration lessons, and the independent review register for the trash/grid wave. **Read it before resuming.** |
| `docs/clickthru-harness.md` | **Clickthru harness** — one command that drives the *built* app with real touch/pen input on the Surface geometry and screenshots every step, so an agent or human can judge the pixels instead of trusting a green gate. Holds the environment recipe (folder-picker stub, the IndexedDB OPFS shim, fake camera), the three Surface device profiles, the CDP gesture lab, how to read a run and reconcile it, the gotchas that already cost time, and what the first runs found. **An inspection tool: never a gate, and it never promotes a `[Surface]` row.** |

## docs/ — superseded (kept for history)

| File | What it is |
|---|---|
| `docs/preflight-handoff.md` | Build spec **v0.2** — superseded by `preflight-handoff-v0.3-hardened.md`. Do not build from it. |
| `docs/ui-spec-field-measure.md` | UI/UX spec **v1** — superseded by `ui-spec-field-measure-v2-hardened.md`. Do not build from it. |
| `docs/review-handoff.md` | The adversarial-review brief that produced the v0.3 / v2 hardening. Kept as a record of what was reviewed. |
| `docs/handoff-plan-verification.md` | Session-3 handoff brief (verify the plan + flush it out). Kept as a record of the session's contract. |

## Not committed (git-local / generated)

| Path | What it is |
|---|---|
| `node_modules/` | Installed dependencies. |
| `.slim/deepwork/` | OpenCode deepwork progress files (session state). |
| `dist/`, `coverage/`, `playwright-report/`, `test-results/` | Build / test output. |

## Built (slices 0.1–1.6, plus slice 1.9 step 1)

| Path | What it holds |
|---|---|
| `vitest.config.ts` / `playwright.config.ts` / `tests/fixtures/` / `tests/fakes/` | Test infrastructure: three Vitest projects (node/jsdom/browser), Playwright e2e + CSP-as-a-test, deterministic fixtures, in-memory FSA fakes. |
| `public/fonts/*.woff2` | Self-hosted Archivo + JetBrains Mono subsets. |
| `src/domain/` | `types.ts`, `schema.ts` (zod 4, jitless), `units.ts`, `geometry.ts`, `snapping.ts`, `ids.ts`, `migrate.ts`. |
| `src/fs/` | `backend.ts` (FSA + OPFS), `projectStore.ts` (atomic/locked/recovering write path). |
| `src/state/` | `appStore.ts`, `persistQueue.ts` (the §5.4 save pipeline). |
| `src/settings/` | `handedness.ts`, `input.ts`, `units.ts`, `theme.ts`, `density.ts`, `projectsRoot.ts`. |
| `src/data/` | `storage.ts`, `originGuard.ts`. |
| `src/editor/inputRouter.ts` | Touch-first input router (§8.2). |
| `src/editor/EditorCanvas.ts` | Imperative Konva 5-layer canvas, pinch, pan/zoom/fit, and the **§4.2 screen-scaling seam** (`applyScreenRules` + the `screen*` helpers are the single chokepoint for every zoom path). |
| `src/ui/` | `FirstRun.tsx`, `Settings.tsx`, `ProjectList.tsx`, `strings.ts`, `SheetEditor.tsx` (slice 1.3: import → normalize → render, the D51 open flow). |
| `src/media/` | `normalizeImage.ts` (EXIF baked via `from-image`, ≤4096 clamp), `exif.ts` (manual APP1 scan, 64 KB bound, `stripExif`), `thumbnails.ts`, `decodeWorker.ts` (real decode, provenance-marked). |
| `src/export/filenames.ts` | Slice 1.9 step 1 — the filename sanitizer + NTFS case-insensitive conflict policy (`tests/filenames.test.ts`, 29-row table). |
| `public/icons/` | Placeholder app icons. |
| `src/editor/shapes/` | `scene.ts` (the in-memory `Annotation[]` document, Konva sync, `AnnotationPath` addressing, §20.2 z-bands, `markupFile`/`load`), `svgPath.ts` (local `getSvgPathFromStroke` + `strokeInputPoints` — the one place that indexes the parallel `pressure[]`), `renderDimension/renderShape/renderInk/renderText/dimensionLabel`. |
## Planned (not yet created)

| Path | What it will hold |
|---|---|
| `src/editor/inset/` | Inset container + crop/hit-test model (1.7). |
| `src/export/` | `renderStage.ts`, `pdf.ts`, `png.ts` (zip via `fflate`) (1.9 steps 2–5). |
| `src/state/styleByTool.ts` | The style system (1.8). |
| `src/ui/` | Style panel, export wizard, autosave chip, history flyout (1.8–1.10). |

## Planned (not yet created)

| Path | What it will hold |
|---|---|
| `src/editor/` | `history.ts`, `Loupe.ts`, `tools/`, `shapes/` (incl. local `svgPath.ts`), `inset/` (1.5–1.7). |
| `src/export/` | `pdf.ts`, `png.ts` (zip via `fflate`), `renderStage.ts` (1.9) — `filenames.ts` has shipped. |
| `src/state/` | `editorStore.ts` (1.4.5), `styleByTool.ts` (1.8). |
| `src/ui/` | `CameraFlow.tsx` (1.4), `EditorLayout.tsx` + `ToolRail.tsx` + `TopBar.tsx` + `icons/tools/*` (1.4.5), style panel + keypad sheet + export wizard (1.5–1.9). |

## Reading order for a new contributor or AI

1. `README.md` — orientation.
2. `docs/BUILD-RUNBOOK.md` — how to work: the slice loop, gate policy, `[Surface]` deferral, three-strike rule.
3. `docs/CONTINUITY.md` — where things stand right now.
4. `docs/handoff-session-21.md` — **the previous session's handoff**: what is verified vs assumed, the traps
   that already cost time, and the owed work in beta-priority order. Read this before resuming.
5. `docs/review-session-4-hardening.md` — what the latest review found, and how to review.
6. `docs/implementation-plan.md` — the execution order and gates.
7. `docs/preflight-handoff-v0.3-hardened.md` — the build spec (start with §2.4, the v1 scope table;
   then the session-4 changelog rows 21–38, §5.8, §19, and the session-4b §20–§21).
8. `docs/ui-spec-field-measure-v2-hardened.md` — the UI.
9. `docs/appendix-strings.md` — every user-visible string, keyed for `src/ui/strings.ts`.
10. `docs/CHECKPOINTS.md` — the C1–C10 checkpoints; `docs/BUILD-LOG.md` — where the build stands.
11. `docs/DECISIONS.md` — why things are the way they are.
12. `docs/touch-first-interaction-model.md` — the touch-first interaction design (read with the UI spec).
13. `docs/gui-ux-readiness-and-design-handoff.md` — the session-5 GUI/UX readiness review and its reasoning.
14. `docs/review-brief.md` — hand this to any review lane; it is the checklist of defects that have already shipped here once.
