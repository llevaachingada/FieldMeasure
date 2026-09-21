# Third-party notices

Field Measure bundles the third-party software listed below. This file is required by build spec
`docs/preflight-handoff-v0.3-hardened.md` §2.2 and is checked by CI; regenerate it whenever a
dependency changes. Its absence fails the build.

License text that must survive distribution (MIT/BSD notices) is reproduced in full in the sections
that follow each table. **Slice 0.1 pastes the complete notice text for every dependency below, plus
the full SIL Open Font License 1.1 text for both fonts.** A license marked
`verify at scaffold (C1)` is not stated in the project docs and must be read from the installed
`node_modules/<pkg>/LICENSE` at checkpoint C1 before this file is signed off — do not ship a guessed
license.

## Runtime dependencies (fixed list — §2.2)

| Package | Version | License |
|---|---|---|
| react | 19.3.0 | verify at scaffold (C1) |
| react-dom | 19.3.0 | verify at scaffold (C1) |
| konva | 10.6.0 | MIT (§2.2) |
| zustand | 5.0.15 | verify at scaffold (C1) |
| immer | 11.1.18 | verify at scaffold (C1) |
| zod | 4.6.5 | verify at scaffold (C1) |
| idb-keyval | 6.3.0 | verify at scaffold (C1) |
| @cantoo/pdf-lib | 2.11.1 | MIT (§2.2) |
| perfect-freehand | 1.2.3 | MIT (§8.5 local-helper note) |
| lucide-react | 1.47.0 | verify at scaffold (C1) |
| fflate | 0.8.3 | verify at scaffold (C1) |

> The runtime dependency list is **closed**. Adding one requires a spec change first (§2.2), and
> this file must be regenerated in the same change.

## Development dependencies

Not required by §2.2 (which mandates runtime notices), but listed here for completeness so the
licence set is auditable in one place. Version pins not fixed by the docs are resolved at scaffold
(C1).

| Package | Version | License |
|---|---|---|
| vite | 8.3.0 | verify at scaffold (C1) |
| @vitejs/plugin-react | 6.1.1 | verify at scaffold (C1) |
| typescript | ^5 (exact 5.x resolved at C1) | verify at scaffold (C1) |
| vitest | 5.0.1 | verify at scaffold (C1) |
| @playwright/test | 1.63.0 | verify at scaffold (C1) |
| vite-plugin-pwa | 1.3.0 | verify at scaffold (C1) |
| @testing-library/react | pin at scaffold (C1) | verify at scaffold (C1) |
| @testing-library/user-event | pin at scaffold (C1) | verify at scaffold (C1) |
| jsdom | pin at scaffold (C1) | verify at scaffold (C1) |

## Fonts

Both fonts are self-hosted (`public/fonts/*.woff2`) with `@font-face { font-display: swap }`.
No CDN is used (UI spec §3.3). Both are licensed under the **SIL Open Font License, Version 1.1**;
the full OFL text is pasted at slice 0.1 (§13/0.1 build-order step 12).

| Font | Role | License |
|---|---|---|
| Archivo | UI text | SIL Open Font License 1.1 (OFL) — full text at slice 0.1 |
| JetBrains Mono | Numerals / mono readouts | SIL Open Font License 1.1 (OFL) — full text at slice 0.1 |

## Notices

The MIT (and any BSD) notice text for every dependency above is reproduced verbatim in its own
section in this file at slice 0.1 (§13/0.1 build-order step 7). `react`, `react-dom` and the other
packages marked `verify at scaffold (C1)` must each have their licence confirmed and their full
notice text pasted before the slice 0.1 gate ("`THIRD-PARTY-NOTICES.md` exists and names all 11
runtime deps **and both font licenses**") can be signed off.

---

*CI check (required):* the pipeline asserts this file exists (`tests`-free existence step in
`.github/workflows/ci.yml`, §13/0.1 build-order step 8). Keep it at the repository root.
