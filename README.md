# Field Measure

A Windows-first web app (PWA) for **Microsoft Surface** tablets with a pen. Take a photo with the
built-in camera, draw **feet-inch dimension lines** and rich markup on it, insert extra photos
*within* the photo, and export a marked-up **PDF/PNG** to a local project folder. There is **no
server, no database, no sign-in, no cloud SDK, no Bluetooth, and no multi-user** — each Surface is
self-contained, and the user drags the exported folder into Dropbox to share.

> **Status: pre-flight, review-complete.** No functional application code yet. The build spec has been
> through an adversarial review and hardened to v0.3; dependencies are installed. See
> [`docs/CONTINUITY.md`](docs/CONTINUITY.md) for the live project state.

## Why

Paper sketches get lost, and photos without dimensions lose their meaning by the time they reach the
office. Android measuring apps no longer run on Windows (Windows Subsystem for Android ended March
2025), so the team needs a Surface-native "photo + dimensions" tool with clean handoff into job
folders.

## Canonical documents

| Document | Canonical version | Notes |
|---|---|---|
| Build spec | [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md) | **Authoritative.** Its **§2.4 "v1 scope table" is the single authority on what ships in v1.** |
| UI/UX spec | [`docs/ui-spec-field-measure-v2-hardened.md`](docs/ui-spec-field-measure-v2-hardened.md) | **Authoritative** on look & feel. |
| Decisions (ADR) | [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why things are the way they are. |
| Unit rules | [`docs/UNITS.md`](docs/UNITS.md) | Input formats, rounding, examples. |
| Continuity log | [`docs/CONTINUITY.md`](docs/CONTINUITY.md) | Read first when resuming work. |
| File index | [`docs/INDEX.md`](docs/INDEX.md) | Map of every file. |

> The earlier `docs/preflight-handoff.md` (v0.2) and `docs/ui-spec-field-measure.md` (v1) are kept for
> history only and are **superseded — do not build from them.**

## What's here today

| Area | State |
|---|---|
| Build spec (v0.3, hardened) | ✅ |
| UI/UX spec (v2, hardened) | ✅ |
| Adversarial review | ✅ complete — findings folded into v0.3 / v2 |
| Decisions log (ADR) | ✅ |
| Dependencies installed | ✅ (`package.json`, Node 24 LTS) |
| Application code | ❌ not started (build slice 0.1) |

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
