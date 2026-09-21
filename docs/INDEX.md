# Documentation & File Index

A map of everything in this repository. Last updated **2026-09-21 (session 4)**.

## Root

| File | What it is |
|---|---|
| `README.md` | Project entry point: what this is, status, canonical docs, constraints. |
| `package.json` | Node project manifest, dependencies pinned. Scripts are still placeholders (slice 0.1 pending). |
| `package-lock.json` | Lockfile — commit it; do not edit by hand; use `npm ci` to install. |
| `.gitignore` | Ignore rules (`node_modules/`, build output, `.slim/deepwork/`, OS/IDE files). |
| `.ignore` | OpenCode ignore rules (keeps `.slim/deepwork/` readable locally). |

## docs/ — canonical

| File | What it is |
|---|---|
| `docs/INDEX.md` | This file. |
| `docs/CONTINUITY.md` | **Project continuity log** — live state, session timeline, next steps, open questions. Read first when resuming. |
| `docs/preflight-handoff-v0.3-hardened.md` | **PRIMARY BUILD SPEC (canonical).** Hardened after adversarial review rounds 1, 2 and **4**. Its **§2.4 v1 scope table is the single authority on what ships in v1.** Round 2 executed the keypad reference code and fixed a wrong committed test expectation (`12 6` = 150 in, not 148); **round 4 executed it again and found another one** (§6.1's unicode row), plus a silent sign flip, zero/oversized commits, an unlocked "locked" write, and tmp cleanup that never entered the directories tmp files live in. Session-4 additions: changelog rows 21–38, **§5.8** (failure states) and **§19** (origin, SW updates, asset addressing, export guards). |
| `docs/ui-spec-field-measure-v2-hardened.md` | **UI/UX SPEC (canonical).** Authoritative on look & feel; v1 scope markers `〔v1 scope: …〕` defer to the build spec §2.4; v2 changelog appendix maps every change to its review finding. |
| `docs/implementation-plan.md` | **EXECUTION PLAN (canonical for order), v1.2 hardened.** Slice order, dependency graph, per-slice files + build order + signatures + inline tests + checkable gates + rollback notes, checkpoint table, wrong-measurement **and data-loss** tripwires. Session 4 added slices **0.0** (origin), **1.4.5** (editor shell) and **1.11** (release), the `persistQueue`/`migrate` modules, test infrastructure, and executed reference implementations. The build spec is the authority on *what*; this is the authority on *order and done-ness*. |
| `docs/review-session-4-hardening.md` | **Session-4 senior adversarial & hardening review** — the finding register with evidence and severity: 8 wrong-measurement defects (executed, not reasoned), 6 data-loss defects, and the "ownerless work" class that produced 3 new slices and 2 new modules. Read it before starting a build slice, and read its **method note** before running round 5. |
| `docs/DECISIONS.md` | Architecture Decision Record (ADR) log, incl. review-driven corrections and the session-4 decisions D21–D31. |
| `docs/UNITS.md` | Accepted length input formats, keypad model, rounding rules, examples. |

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

## Planned (not yet created)

| Path | What it will hold |
|---|---|
| `THIRD-PARTY-NOTICES.md` | License notices for every runtime dependency **plus both font OFL texts** (required by build spec; CI checks it exists). |
| `docs/install-runbook.md` | How one Surface goes from nothing to a working installed app (slice 0.0, verified in 1.11). |
| `vitest.config.ts` / `playwright.config.ts` / `tests/fixtures/` | Test infrastructure — **did not exist before session 4**, while three slices already depended on it (slice 0.1). |
| `public/fonts/*.woff2` | Self-hosted Archivo + JetBrains Mono subsets (slice 0.1; the UI spec forbids a CDN). |
| `src/domain/` | Pure logic: `types.ts`, `schema.ts`, `units.ts`, `geometry.ts`, `snapping.ts`, `ids.ts`, **`migrate.ts`** (session 4). |
| `src/fs/` | `projectStore.ts`, `backend.ts` (File System Access API + OPFS). |
| `src/media/` | `normalizeImage.ts`, `exif.ts`, `thumbnails.ts`. |
| `src/editor/` | `EditorCanvas.ts`, `inputRouter.ts`, `history.ts`, `Loupe.ts`, `tools/`, `shapes/` (incl. local `svgPath.ts`). |
| `src/export/` | `pdf.ts`, `png.ts` (zip via `fflate`), `filenames.ts`. |
| `src/state/` | `appStore.ts`, `editorStore.ts`, `styleByTool.ts`, **`persistQueue.ts`** (the save pipeline — session 4). |
| `src/ui/` | React chrome (top bar, tool rail, style panel, overlays) + `strings.ts`. |
| `tests/` | Vitest unit tests (incl. `keypad.test.ts`) + Playwright e2e. |
| `public/icons/` | Original app icons. |

## Reading order for a new contributor or AI

1. `README.md` — orientation.
2. `docs/CONTINUITY.md` — where things stand right now.
3. `docs/review-session-4-hardening.md` — what the latest review found, and how to review.
4. `docs/implementation-plan.md` — the execution order and gates.
5. `docs/preflight-handoff-v0.3-hardened.md` — the build spec (start with §2.4, the v1 scope table;
   then the session-4 changelog rows 21–38, §5.8 and §19).
6. `docs/ui-spec-field-measure-v2-hardened.md` — the UI.
7. `docs/DECISIONS.md` — why things are the way they are.
