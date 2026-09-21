# Checkpoints — questions that can only be answered once code exists

Some things genuinely cannot be decided from a document: what a real camera reports, how fast a
Surface Go redraws, whether a toolchain version cooperates. Those are **checkpoints**.

A checkpoint is **not** an open question. Each one says: which slice it fires in, exactly what to
measure, and what to do with **every** possible answer. You measure, read the row, act, and record
the number in `docs/DECISIONS.md`. **You never invent an answer and you never wait for one.**

At step 2 of the slice loop (`docs/BUILD-RUNBOOK.md` §2), check whether a checkpoint fires.

| Status key | Meaning |
|---|---|
| ⬜ | not reached yet |
| ✅ | measured, decided, recorded in DECISIONS |
| ⚠️ | measured, and the result needs the human (only C7 can do this) |

---

## C1 — Toolchain bring-up · slice 0.1 · ⬜

**Measure:** does `npx tsc --noEmit` + `npm run build` + `npx vitest run` all succeed with the pins
in `docs/appendix-scaffold-files.md`?

| Result | Do |
|---|---|
| All pass | Record the resolved versions in DECISIONS. Continue. |
| TypeScript errors that are version-shaped (unknown compiler options, missing lib types) | You are on the wrong TS major. Spec §21.6 pins **5.x** — run `npm view typescript@5 version`, pin that exact version, `npm install`, retry. |
| `vitest` rejects the `projects` config key | Vitest renamed this across majors. Try `workspace` instead of `projects`; if neither works, split into two config files (`vitest.node.config.ts`, `vitest.jsdom.config.ts`) and two npm scripts. Record which shape worked. |
| `vite-plugin-pwa` rejects an option | Drop to the minimal manifest + `workbox.globPatterns` only, get it building, then add options back one at a time. |

**Never** loosen `strict: true` to get past this checkpoint.

---

## C2 — Test fixtures · slice 0.1 · ⬜

**Measure:** can you produce `tests/fixtures/12mp-portrait-exif6.jpg` — a large JPEG whose EXIF
orientation tag is 6 and which carries GPS tags?

| Result | Do |
|---|---|
| You have a real phone photo available (ask the human once, cheaply — it is a 10-second request) | Commit it. Best fixture: real EXIF, real size. |
| No photo available | Generate a synthetic one: a canvas-drawn JPEG with an EXIF APP1 segment injected by a small committed script (`tests/fixtures/make-fixtures.mjs`, no new dependencies — it writes the APP1 bytes directly). Mark in the build log that slice 1.3's EXIF gate is **provisional** until tested with a real photo, and add that line to the hardware checklist. |

Either way, also commit: `tiny-2x2.jpg`, `truncated.jpg` (0 bytes), `corrupt-markup.json`
(valid JSON, invalid schema), `v02-markup.json` (has a stale `label` key, no `unitFormat`).

---

## C3 — Device camera capabilities · slice 0.2 · ⬜

**Measure:** on the target Surface, `enumerateDevices()` + `getUserMedia` with increasing
resolution constraints. Record the **real** maximum width × height actually delivered (not the
advertised sensor MP), plus whether torch and camera-flip are available.

**Decision table is spec §21.7** — it already covers all three outcomes (keep the toggle, drop the
toggle, drop it and promote the Windows Camera app). Read the row and build it in slice 1.4.

**If you have no Surface:** measure on whatever machine you have, record it as **provisional**, and
add "re-measure device caps" to the hardware checklist. Slice 1.4 builds against the provisional
numbers and the labels are re-checked on hardware.

---

## C4 — Konva pixel ratio on a Surface Go · slice 1.3 · ⬜

**Measure:** markup-layer redraw time while panning a 4096-px sheet carrying ~50 annotations, at
`pixelRatio = min(devicePixelRatio, 2)`. Use the Performance panel; report the median frame time.

**Decision ladder is spec §21.8** — ≤16 ms keep; >16 ms drop the overlay layer to 1, re-measure,
then markup to 1.5, then 1. Never drop the photo layer below 1, never exceed 2. Record every
measurement.

**If you have no Surface Go:** measure on your machine, record it, and add the real measurement to
the hardware checklist. Ship `min(dpr, 2)` until hardware says otherwise.

---

## C5 — `lucide-react` 1.x icon API · slice 1.4.5 · ⬜

**Measure:** a two-line spike — import one icon and render it.

| Result | Do |
|---|---|
| Named exports work (`import { Camera } from 'lucide-react'`) | Use them. Continue. |
| A different API (generic `<Icon name=…>`, a different entry point) | Use whatever it exposes. |
| It does not work at all | Inline the handful of chrome SVGs by hand and record it. lucide is chrome-only; the 14 tool glyphs are bespoke, so nothing measurement-critical depends on it. |

**This must not block the slice.** Timebox it to 15 minutes.

---

## C6 — Export memory ceiling on the target device · slice 1.9 · ⬜

**Measure:** export one 4096×3072 sheet at 1×, 2× and 3×; record peak tab memory and whether the tab
survives. Then a 50-sheet project at 2×.

| Result | Do |
|---|---|
| All succeed | Ship the §19.4b guard as specified (refuse >512 MB bitmaps, split PDFs >250 MB). |
| 3× crashes below the 512 MB computed guard | Lower the guard to just under the observed crash point and record the measurement. The guard is a number, not a principle. |
| 50 sheets at 2× crashes | The PDF-splitting remedy (§19.4b) is already designed — lower the split threshold until 50 sheets pass, and record it. |

**This checkpoint cannot fail the slice** — every outcome has a designed response.

---

## C7 — Field-pilot findings · slice 2.0 · ⬜

**Measure:** two people, one week, real jobs. Count wrong-measurement reports and data-loss reports
separately from everything else.

| Result | Do |
|---|---|
| Zero wrong-measurement and zero data-loss reports | Write go + the top-5 fix list into `docs/CONTINUITY.md`. |
| **Any** wrong-measurement or data-loss report | **Automatic no-go**, regardless of how the rest of the week went. Root-cause it against the tripwire list before anything else ships. |

**This is the one checkpoint that legitimately ends with "ask the human"** — it is a product
decision made from field evidence, not a technical measurement.

---

## Touch-primary checkpoints (added 2026-09-21)

These implement the touch-primary input change (`docs/gui-ux-readiness-and-design-handoff.md` §13,
`docs/touch-first-interaction-model.md`). C8 and C9 are the **successors** to the pen-first 0.2 palm
gauntlet and 1.6 pressure gates that live in `docs/implementation-plan.md`; they are numbered after
C7 for stability, so the C-numbers are not in slice order.

---

## C8 — Touch-primary palm gauntlet · slice 0.2 · ⬜

**Supersedes the pen-first 0.2 palm gauntlet.** The router has **no palm suppression without a pen**
(the 1.2 s window only starts on a pen event — `P §8.2`; `docs/gui-ux-readiness-and-design-handoff.md`
§13.4), and browser palm rejection is **not deterministically solvable** (§13.7). The old gate tested a
>1.2 s **pen** stroke with a resting palm; under touch-primary that is the wrong test.

**Measure:** on the target Surface with the **pen out of range or absent**, tap-tap-place a dimension
10× while a palm rests on the glass (the cursor/hand posture a crew actually uses). Record, per
attempt: stray geometry created, stray pan, stray zoom. Then repeat with a deliberate **accidental
two-tap** and with a `pointercancel` (palm/OS edge gesture) to exercise the **undo/rollback** path.

| Result | Do |
|---|---|
| 0 stray geometry, 0 stray pan, 0 stray zoom across 10 placements | Record the number; rely on the OS/digitizer palm blocking plus the on-screen undo as designed. Continue. |
| A resting palm **creates geometry or silently moves** an object | Do **not** ship a size-threshold palm filter — contact geometry is unreliable and defaults to `1` (`gui-ux…` §13.7). Strengthen the escape hatches instead: generous tap slop, the 450 ms settle window, `Adjust endpoints`, and always-reachable Undo; re-measure. Record what was tried. |
| The palm only produces a second tap that mis-places a point | This is the **accepted-risk case**. Keep tap-tap; verify the settle window + `Adjust endpoints` lets the user correct it, and that the value is never wrong (labels re-derive). Record. |

**Never build a mode that silently discards input** (`gui-ux…` §13.7). If three different fixes fail,
this is a runbook §6 stop.

---

## C9 — Pen pressure response · slice 1.6 · ⬜

**Pen-only. This is not a v1 touch blocker.** `pressure` is a pen-only signal — a parallel array filled
from pen input (`IP:946–947`, `IP:956–959`) — so it is unreachable from a finger. This checkpoint is
the **on-device counterpart** to the plan's machine test "pressure actually varies", which stays a
synthetic-array unit test.

**Measure:** with a pen, build a stroke whose pressure ramps 0.1 → 1.0 and compare the rendered outline
widths at the first and last point; then draw a hard stroke and a light stroke at the same style width.

| Result | Do |
|---|---|
| Pressure varies continuously and the ramped/hard strokes are materially wider | Keep pressure→width as specified (`P §3.3`). Record. |
| **No pen present (touch-only run)** | Mark **PENDING (pen-only)** — never FAIL. Finger ink runs pressure→width **off**, width floor **8 mu**, smoothing 60 (`docs/touch-first-interaction-model.md` §4.2). A touch-only build ships freehand without pressure. |
| Pressure reads as 0 / 0.5 / 1 only (constant or quantised) | Treat pressure as optional decoration: disable pressure→width and keep the fixed width floor. Record the raw values. |

---

## C10 — Touch placement accuracy · slice 1.5 · ⬜

**Measure:** touch-primary, **no pen**. Tap-tap-place 10 dimensions on features (existing endpoints,
polygon vertices, object bbox corners, edge midpoints). For each, record: **(a)** whether the anchor
lands within the snap **acquire** radius (32px) → **lock** radius (20px) (`TF §2.2`); **(b)** whether
the touch loupe + contact disc makes the systematic finger offset visible; **(c)** whether
`Adjust endpoints` / the Offset Nudge Pad recovers a mis-placed anchor; **(d)** that the typed value
never changes because of placement error (labels re-derive; `AGENTS.md` #2).

| Result | Do |
|---|---|
| ≥ 8 of 10 anchors land on the intended feature with snapping alone | Record; ship the `TF §2.2` acquire/lock radii and Strong snap default. Continue. |
| < 8 of 10, but the loupe/nudge recovers each to the intended feature | Keep tap-tap; verify the one-time `touch.drawnVsTyped` hint fires and `Adjust endpoints` is prominent. Record. |
| Anchors land on the wrong feature and cannot be corrected | Do **not** ship tap-tap as the only placement path — keep press-drag-release available, increase the loupe offset, raise the snap acquire radius, and re-measure. Record. |

**The failure mode is "wrong-looking drawing, right number"** (`TF §8` risk 1; `gui-ux…` §13.7) — it
does not corrupt a measured value, so this checkpoint informs UX rather than stopping the slice.

---

## Recording a checkpoint result

When a checkpoint fires, add to `docs/DECISIONS.md`:

```
### C<n> — <name> (slice <n>, <date>)
Measured: <the actual numbers, verbatim>
Decision row taken: <which row of the table>
Action: <what you built as a result>
```

Then flip its status in this file to ✅ and note it in `docs/BUILD-LOG.md`.
