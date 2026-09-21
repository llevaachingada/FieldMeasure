# Project Continuity Log

**Purpose:** a single place that records where this project stands, so any session (human or AI) can
resume without re-deriving context. **Update this file at the end of each work session.**

**Last updated:** 2026-09-21

---

## Current snapshot

| Field | Value |
|---|---|
| Phase | Pre-flight complete → slice 0.1 (scaffold) |
| Application code | None yet (repo has docs + installed deps only) |
| Build spec | **v0.3 hardened** — `docs/preflight-handoff-v0.3-hardened.md` (canonical) |
| UI spec | **v2 hardened** — `docs/ui-spec-field-measure-v2-hardened.md` (canonical) |
| Adversarial review | ✅ **Complete** — findings folded into v0.3 / v2 |
| Dependencies | Installed and pinned (Node 24 LTS, npm 11, `fflate` included) |
| Blocking item | None. Next work is the slice 0.1 scaffold. |
| Next action | Slice 0.1 scaffold (Vite config, `tsconfig`, `"type": "module"`, scripts) |

**Authority:** the build spec's **§2.4 "v1 scope table"** is the single authority on what ships in v1.
When any doc conflicts, §2.4 wins.

---

## Timeline

### 2026-09-21 — Session 1: preflight → review → docs → dependencies
1. Reviewed the original `field-measure-preflight.md` v0.1 (over-scoped: Bluetooth, PostgreSQL/Supabase
   sync, Entra/Graph/SharePoint, phone paths) against the client's feedback.
2. Ran research (Konva imperative API, File System Access API, pointer/pen/palm, camera capture,
   dependency versions/licenses, ft-in input UX, inset/tool/style-panel UX) and a UI/UX design pass.
3. Ran an architecture review; reconciled conflicts (per-sheet `markup.json` sidecars, atomic writes,
   markup-unit scaling, inset container model).
4. Wrote build spec v0.2 (`docs/preflight-handoff.md`) and UI spec v1 (`docs/ui-spec-field-measure.md`).
5. Wrote the adversarial-review brief `docs/review-handoff.md`.
6. Installed Node 24.19.0 (LTS) + npm 11.17.0 via winget; installed all runtime + dev dependencies
   (0 vulnerabilities); pinned `fflate` 0.8.3. Added `node_modules/` + build output to `.gitignore`.
7. **Adversarial review was run** (via `docs/review-handoff.md`) and produced hardened revisions:
   - `docs/preflight-handoff-v0.3-hardened.md` (supersedes v0.2) — fixes B1–B5, M1–M13, Minors 1–6:
     corrected export/DPI math, keypad slot state machine + lenient tokenizer, inset child coordinate
     space, FSA API corrections (`FileSystemFileHandle.move()` used; `FileSystemDirectoryHandle.move()`
     removed), zod `.nullish()` + guarded `JSON.parse` + `.history/_project/` recovery, per-project
     two-tab lock, derived-only `label`, handedness as a plain question, `fflate` for PNG zip,
     perfect-freehand `getSvgPathFromStroke` not exported (local helper), and a new **§2.4 v1 scope table**.
   - `docs/ui-spec-field-measure-v2-hardened.md` (supersedes v1).
8. Added repo docs: `README.md`, `docs/INDEX.md`, `docs/CONTINUITY.md`, `docs/DECISIONS.md`,
   `docs/UNITS.md`; reconciled references to the hardened canonical versions.

---

## Done

- ✅ Product scope locked (Surface-only, local-only; no server / DB / cloud / Bluetooth / multi-user).
- ✅ Build spec (v0.3 hardened) + UI/UX spec (v2 hardened).
- ✅ Adversarial review complete; findings folded in.
- ✅ Dependencies installed and verified resolvable (`fflate` pinned).
- ✅ Repo documentation scaffolding.

## In progress

- ⏳ Slice 0.1 scaffold (Vite config, `tsconfig`, `"type": "module"`, npm scripts, `public/icons/`).

## Next (in order)

1. Slice 0.1 scaffold → installable, offline PWA shell.
2. Slice 0.2 input spike (pen/touch routing) — the highest-risk area; do it before any UI.
3. Slice 0.3 first-run / settings / Home shell (added by the review).
4. Slice 1.1 domain core → 1.2 storage → 1.3 photo-on-canvas → 1.4 capture → … (see build spec §13).

---

## Open questions (need a human answer)

Product/scope questions survive the review; several scope items were resolved by the build spec §2.4.
Still needs a human decision:

1. **Metric** — needed at launch, or is feet-inches enough? (Affects the keypad's fraction chips.)
2. **Job-site address** — add a typed address field to project/sheet meta for reports?
3. **Sheet templates** — needed at launch, or is the preset system enough?

> Calibration and vector-overlay PDF were resolved by the review (see build spec §2.4 for the
> definitive v1 in/deferred/cut list).

## Known drift / watch items

- `package.json` is still npm-init defaults (`"type": "commonjs"`, placeholder test script) — fix in
  slice 0.1.
- **`lucide-react` 1.x** — chrome icons only; the 14 tool glyphs are bespoke SVG (per UI spec). Verify
  the icon-name API at first use.
- Transitive `glob@11.1.0` deprecation warning from the PWA toolchain — not a vulnerability
  (`npm audit` is clean).
- `THIRD-PARTY-NOTICES.md` is required by the build spec and not yet created.

## How to resume

1. Read this file.
2. Read `docs/preflight-handoff-v0.3-hardened.md` — start with **§2.4 (v1 scope table)**, then §13
   (build slices).
3. Read `docs/ui-spec-field-measure-v2-hardened.md` for UI detail.
4. Check `docs/DECISIONS.md` before making a technical choice.
5. Follow the build slices in order.
