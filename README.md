# Field Measure

A Windows-first web app (PWA) for **Microsoft Surface** tablets with a pen. Take a photo with the
built-in camera, draw **feet-inch dimension lines** and rich markup on it, insert extra photos
*within* the photo, and export a marked-up **PDF/PNG** to a local project folder. There is **no
server, no database, no sign-in, no cloud SDK, no Bluetooth, and no multi-user** — each Surface is
self-contained, and the user drags the exported folder into Dropbox to share.

> **Status: pre-flight + planning complete, hardened through four review rounds.** No functional
> application code yet. Each round has **executed** the spec's reference code rather than reading it,
> and each has found real defects the previous round missed — round 2 a wrong test expectation and a
> fraction-dropping bug; round 4 another wrong test expectation, a silent sign flip in the ft-in
> parser, a keypad that would commit lengths the user never typed, a write path whose comment
> promised a lock it never took, and tmp cleanup that never entered the directories tmp files live
> in. Round 4 also found the work **no slice owned**: the tool rail, the save pipeline, test
> infrastructure, and how the app reaches a Surface at all.
>
> **One open item blocks the first slice:** the origin the app will be served from
> ([`DECISIONS.md`](docs/DECISIONS.md) D24) — it is the identity boundary for every persisted handle
> and setting, so it must be pinned before anything is built. See
> [`docs/CONTINUITY.md`](docs/CONTINUITY.md) for live state and
> [`docs/review-session-4-hardening.md`](docs/review-session-4-hardening.md) for the finding register.

## Why

Paper sketches get lost, and photos without dimensions lose their meaning by the time they reach the
office. Android measuring apps no longer run on Windows (Windows Subsystem for Android ended March
2025), so the team needs a Surface-native "photo + dimensions" tool with clean handoff into job
folders.

## Canonical documents

| Document | Canonical version | Notes |
|---|---|---|
| Build spec | [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md) | **Authoritative.** Its **§2.4 "v1 scope table" is the single authority on what ships in v1.** Hardened across rounds 1, 2 and 4 (both 2 and 4 execution-verified the reference code). Session-4 additions: changelog rows 21–38, §5.8, §19. |
| UI/UX spec | [`docs/ui-spec-field-measure-v2-hardened.md`](docs/ui-spec-field-measure-v2-hardened.md) | **Authoritative** on look & feel. |
| Implementation plan | [`docs/implementation-plan.md`](docs/implementation-plan.md) | **Authoritative on build order** (v1.2 hardened). Slice sequence, dependency graph, per-slice gates, checkpoint table, wrong-measurement and data-loss tripwires. |
| Latest review | [`docs/review-session-4-hardening.md`](docs/review-session-4-hardening.md) | Session-4 finding register: evidence, severity, and what was fixed. Includes the review **method note**. |
| Decisions (ADR) | [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why things are the way they are. |
| Unit rules | [`docs/UNITS.md`](docs/UNITS.md) | Input formats, rounding, examples. |
| Continuity log | [`docs/CONTINUITY.md`](docs/CONTINUITY.md) | Read first when resuming work. |
| File index | [`docs/INDEX.md`](docs/INDEX.md) | Map of every file. |

> The earlier `docs/preflight-handoff.md` (v0.2) and `docs/ui-spec-field-measure.md` (v1) are kept for
> history only and are **superseded — do not build from them.**

## What's here today

| Area | State |
|---|---|
| Build spec (v0.3, hardened ×2 review rounds) | ✅ |
| UI/UX spec (v2, hardened) | ✅ |
| Adversarial review | ✅ rounds 1, 2 and **4** complete — findings folded in |
| Implementation plan (slice gates) | ✅ v1.2 hardened — 17 slices, per-slice gates |
| Origin / distribution decision | ❌ **open — blocks slice 0.0** (D24) |
| Decisions log (ADR) | ✅ |
| Dependencies installed | ✅ (`package.json`, Node 24 LTS, React 19.3) |
| Application code | ❌ not started (slice 0.0 is a decision; slice 0.1 is the first code) |

## Prerequisites

- **Node.js 24 LTS** + npm 11+ (Node is installed on this machine)
- **Microsoft Edge** on Windows 11 (target runtime)
- A **Surface device with a pen** for real testing

## Quick start

> Not runnable yet — the Vite scaffold (slice 0.1) is not done. Once it is:

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
