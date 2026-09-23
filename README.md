# Field Measure

A Windows-first web app (PWA) for **Microsoft Surface** tablets with a pen. Take a photo with the
built-in camera, draw **feet-inch dimension lines** and rich markup on it, insert extra photos
*within* the photo, and export a marked-up **PDF/PNG** to a local project folder. There is **no
server, no database, no sign-in, no cloud SDK, no Bluetooth, and no multi-user** — each Surface is
self-contained, and the user drags the exported folder into Dropbox to share.

> **Status: nine slices shipped and green — the app runs, takes a photo, and places typed
> dimensions.** Slices 0.2 (input router), 1.1 (domain core), 0.3 (first-run/Settings/Home), 1.2
> (storage core), 1.3 (media + canvas), 1.4 (capture flow), 1.4.5 (editor shell), 1.5 (dimension
> tool), 1.6 (markup tools, with the Layers panel mounted and wired) and **1.7 (image insets)** are
> complete, and slice 1.9 has shipped **step 1 of 5** (`export/filenames.ts`). An **independent
> adversarial review** of the 1.4→1.6 batch has now run (the session-10 waiver is discharged): it found
> no wrong-measurement and no data-loss defect, **four of its findings are fixed and five remain
> owed** — see `docs/DECISIONS.md` **D77/D78** and [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).
>
> **Machine gates (on the committed file set):** `npx tsc --noEmit` clean · `npx vitest run` **636
> tests / 52 files** · `npm run build` clean (17 precache) · `npx playwright test` 5 passed / 5 skipped.
>
> **Annotations persist** to each sheet's `markup.json`, so markup survives a reload. Read
> [`docs/CONTINUITY.md`](docs/CONTINUITY.md) for live state and
> [`docs/handoff-session-12.md`](docs/handoff-session-12.md) for the current handoff. The origin
> question ([`DECISIONS.md`](docs/DECISIONS.md) D24) is resolved in build spec **§21.1**.

## Why

Paper sketches get lost, and photos without dimensions lose their meaning by the time they reach the
office. Android measuring apps no longer run on Windows (Windows Subsystem for Android ended March
2025), so the team needs a Surface-native "photo + dimensions" tool with clean handoff into job
folders.

## Canonical documents

| Document | Canonical version | Notes |
|---|---|---|
| Build spec | [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md) | **Authoritative.** Its **§2.4 "v1 scope table" is the single authority on what ships in v1.** Hardened across rounds 1, 2 and 4 (both 2 and 4 execution-verified the reference code). Session-4 additions: changelog rows 21–38, §5.8, §19. Session-4b additions: §20 (implementation contracts), §21 (resolved decisions). |
| UI/UX spec | [`docs/ui-spec-field-measure-v2-hardened.md`](docs/ui-spec-field-measure-v2-hardened.md) | **Authoritative** on look & feel. |
| Implementation plan | [`docs/implementation-plan.md`](docs/implementation-plan.md) | **Authoritative on build order** (v1.2 hardened). Slice sequence, dependency graph, per-slice gates, checkpoint table, wrong-measurement and data-loss tripwires. |
| Latest review | [`docs/review-session-4-hardening.md`](docs/review-session-4-hardening.md) | Session-4 finding register: evidence, severity, and what was fixed. Includes the review **method note**. |
| Decisions (ADR) | [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why things are the way they are. |
| Unit rules | [`docs/UNITS.md`](docs/UNITS.md) | Input formats, rounding, examples. |
| Continuity log | [`docs/CONTINUITY.md`](docs/CONTINUITY.md) | Read first when resuming work. |
| File index | [`docs/INDEX.md`](docs/INDEX.md) | Map of every file. |
| UI strings | [`docs/appendix-strings.md`](docs/appendix-strings.md) | Complete inventory of user-visible copy, keyed for `src/ui/strings.ts`. |
| Checkpoints | [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) | **C1–C10** — things measurable only once code exists (C5 lucide API, C9 pen pressure and C10 touch accuracy all fired in 1.4.5/1.6). |
| Hardware checklist | [`docs/HARDWARE-TEST-CHECKLIST.md`](docs/HARDWARE-TEST-CHECKLIST.md) | `[Surface]` gate ledger + H1–H12 end-of-build checks. |
| Build log | [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) | Cross-session agent memory; one entry per slice. |
| Agent instructions | [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) | Entry instructions for the building agent. |
| Build runbook | [`docs/BUILD-RUNBOOK.md`](docs/BUILD-RUNBOOK.md) | How to work: slice loop, gate policy, `[Surface]` deferral, three-strike rule. |
| Scaffold reference | [`docs/appendix-scaffold-files.md`](docs/appendix-scaffold-files.md) | The pinned files slice 0.1 must produce (TS 5.x). |
| Install runbook | [`docs/install-runbook.md`](docs/install-runbook.md) | One page, non-developer, how a Surface gets the app. |
| String gaps (proposed) | [`docs/appendix-strings-gaps.md`](docs/appendix-strings-gaps.md) | Proposed wording for the 26 implied-but-unquoted strings. |
| Third-party notices | [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) | Dependency license notices + font OFL texts. |

> The earlier `docs/preflight-handoff.md` (v0.2) and `docs/ui-spec-field-measure.md` (v1) are kept for
> history only and are **superseded — do not build from them.**

## What's here today

| Area | State |
|---|---|
| Build spec (v0.3, hardened ×2 review rounds) | ✅ |
| UI/UX spec (v2, hardened) | ✅ |
| Adversarial review | ✅ rounds 1, 2, 4, 5; ✅ sessions 7–9 (orchestrator + an independent `oracle` pass on 1.3 that caught F1). ✅ **Session 11**: an orchestrator internal review of the 1.4/1.4.5/1.5/1.6 batch (the owner waived the independent `@oracle` pass — recorded in DECISIONS/CONTINUITY, so this batch has **not** had independent adversarial review). |
| Implementation plan (slice gates) | ✅ v1.2 hardened — 17 slices, per-slice gates |
| Origin / distribution decision | ✅ **resolved** — static HTTPS host + origin guard (D24 / §21.1) |
| Decisions log (ADR) | ✅ |
| Dependencies installed | ✅ (`package.json`, Node 24 LTS, React 19.3) |
| Latest owner-request pass (D135) | ✅ calculator-style dimension keypad (postfix `FT`/`IN`, preset fractions), a project-name pop-up on «New project», photo date/time stamped above the export logo, larger VANGARDE marks on every page (Settings switch), camera at device-maximum resolution with working zoom. Hardware rows H23-H25 owed. See `docs/DECISIONS.md` D135. |
| Application code | ✅ **nine slices** — input router, domain core, first-run/Settings/Home, storage core, media+canvas, capture flow, editor shell, dimension tool, markup tools (PARTIAL). **526 tests / 40 files**, build + e2e green. Slice 1.9 is step 1 of 5. |

## Prerequisites

- **Node.js 24 LTS** + npm 11+ (Node is installed on this machine)
- **Microsoft Edge** on Windows 11 (target runtime)
- A **Surface device with a pen** for real testing

## Quick start

> Runnable: `npm ci`, then `npm run dev` (Vite dev server) or `npm run build`. The three test

```bash
npm ci           # install exact locked versions
npm run dev      # vite dev server
npm test         # vitest
```

## Stack

React 19 · TypeScript · **Konva (imperative, not react-konva)** · zustand + immer · zod ·
idb-keyval · @cantoo/pdf-lib · perfect-freehand · fflate · lucide-react · Vite · Vitest + Playwright ·
vite-plugin-pwa. Versions and rationale: [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md) §2.

## Core constraints (do not violate)

- Windows/Surface + Edge only; built-in camera only.
- **No** server, database, sign-in, analytics, cloud SDKs, Bluetooth, or multi-user.
- Everything autosaves to a **local per-project folder** (File System Access API; OPFS fallback).
- Geometry is stored in **working-image pixels**; style sizes in **markup units (mu)**; lengths as
  **millimeters + the entered text**.
- All disk writes go through `src/fs/projectStore.ts` (tmp → close → rename).
- The UI spec's "do not simplify" list is binding.

## Documentation

Start at [`docs/INDEX.md`](docs/INDEX.md). When resuming work, read
[`docs/CONTINUITY.md`](docs/CONTINUITY.md) first.

## Repository layout

See [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md) §12.

## License

Private / internal. Not for distribution.
