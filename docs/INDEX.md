# Documentation & File Index

A map of everything in this repository. Last updated **2026-09-21**.

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
| `docs/preflight-handoff-v0.3-hardened.md` | **PRIMARY BUILD SPEC (canonical).** Hardened after adversarial review. Its **§2.4 v1 scope table is the single authority on what ships in v1.** |
| `docs/ui-spec-field-measure-v2-hardened.md` | **UI/UX SPEC (canonical).** Authoritative on look & feel; v1 scope markers `〔v1 scope: …〕` defer to the build spec §2.4. |
| `docs/DECISIONS.md` | Architecture Decision Record (ADR) log, incl. review-driven corrections. |
| `docs/UNITS.md` | Accepted length input formats, rounding rules, examples. |

## docs/ — superseded (kept for history)

| File | What it is |
|---|---|
| `docs/preflight-handoff.md` | Build spec **v0.2** — superseded by `preflight-handoff-v0.3-hardened.md`. Do not build from it. |
| `docs/ui-spec-field-measure.md` | UI/UX spec **v1** — superseded by `ui-spec-field-measure-v2-hardened.md`. Do not build from it. |
| `docs/review-handoff.md` | The adversarial-review brief that produced the v0.3 / v2 hardening. Kept as a record of what was reviewed. |

## Not committed (git-local / generated)

| Path | What it is |
|---|---|
| `node_modules/` | Installed dependencies. |
| `.slim/deepwork/` | OpenCode deepwork progress files (session state). |
| `dist/`, `coverage/`, `playwright-report/`, `test-results/` | Build / test output. |

## Planned (not yet created)

| Path | What it will hold |
|---|---|
| `THIRD-PARTY-NOTICES.md` | License notices for every runtime dependency (required by build spec; CI should check it exists). |
| `src/domain/` | Pure logic: `types.ts`, `schema.ts`, `units.ts`, `geometry.ts`, `snapping.ts`, `ids.ts`. |
| `src/fs/` | `projectStore.ts`, `backend.ts` (File System Access API + OPFS). |
| `src/media/` | `normalizeImage.ts`, `exif.ts`, `thumbnails.ts`. |
| `src/editor/` | `EditorCanvas.ts`, `inputRouter.ts`, `history.ts`, `Loupe.ts`, `tools/`, `shapes/`. |
| `src/export/` | `pdf.ts`, `png.ts` (zip via `fflate`), `filenames.ts`. |
| `src/state/` | `appStore.ts`, `editorStore.ts`, `styleByTool.ts`. |
| `src/ui/` | React chrome (top bar, tool rail, style panel, overlays) + `strings.ts`. |
| `tests/` | Vitest unit tests + Playwright e2e. |
| `public/icons/` | Original app icons. |

## Reading order for a new contributor or AI

1. `README.md` — orientation.
2. `docs/CONTINUITY.md` — where things stand right now.
3. `docs/preflight-handoff-v0.3-hardened.md` — the build spec (start with §2.4, the v1 scope table).
4. `docs/ui-spec-field-measure-v2-hardened.md` — the UI.
5. `docs/DECISIONS.md` — why things are the way they are.
