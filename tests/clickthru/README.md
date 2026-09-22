# Clickthru harness — watch the app walk its own beta path

This is a **hands-off inspection run**. One command builds the app, opens a **real Chrome
window** at the Surface target profile, and walks the app's most important path with **real
touch and pen input**, taking a **screenshot at every step** and recording what each gesture
actually did. You do not need to click anything, and the window does **not** need your focus —
start it and go do something else.

It is **not a test gate**. It never replaces `npm run e2e` and it never proves anything about the
Surface hardware. It exists so a human (or an AI agent) can *look at the pixels* of the real
built app.

---

## Run it

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd run clickthru
```

That is the whole thing. It will:

1. `npm run build` — so the app you watch is always the current source,
2. start (or reuse) `npm run preview` on <http://localhost:4173>,
3. open a Chrome window and walk the path, then leave the results on disk.

Requires: a Chromium-family browser (Chrome is used if installed, otherwise Playwright's
bundled Chromium). No webcam is needed — Chromium's fake camera provides the stream.

### Channels

| `CLICKTHRU_CHANNEL` | What it is |
|---|---|
| *(unset)* | **Default.** Installed Chrome if present, else bundled Chromium. The watchable window. |
| `msedge` | **Fidelity run.** A Surface ships Edge, and H10/H17 reference the "target Edge build". Use this when the question is "does it behave on what the customer will run". |

The resolved channel, the UA, `devicePixelRatio`, the viewport and `hasTouch` are printed into
`run.json`. The UA is deliberately a **desktop** Chrome UA: this is a Windows tablet, not a
phone, and a mobile UA/`isMobile` would change viewport-meta and `showDirectoryPicker` behaviour.

---

## Device profiles — `tests/clickthru/devices.ts`

From the UI spec's device table (`ui-spec-field-measure-v2-hardened.md:35-38`) and
`gui-ux-readiness-and-design-handoff.md:459-460`:

| Profile | viewport (CSS px) | dsf | Role |
|---|---|---|---|
| **`surfaceLandscape`** | **1440 × 960** | 2 | **Primary** — the whole path runs on this. |
| `surfacePortrait` | 960 × 1440 | 2 | The rotation target. |
| `desk` | 1200 × 800 | 2 | Surface Laptop Studio (Compact density). |

All are `hasTouch: true`, `deviceScaleFactor: 2`, desktop UA, `isMobile: false`.

---

## Where the output is

Everything lands in **`test-results/clickthru/latest/`** (already gitignored):

| File | What it is |
|---|---|
| **`contact-sheet.html`** | **Open this one file.** Every step's screenshot in order, with PASS / FAIL / UNREACHED, the step's note, its error, and its collapsible per-step evidence. |
| `NN-<step>.png` | The raw screenshot for each numbered step. |
| `run.json` | The machine-readable step log: status, evidence note, per-step sheet-directory listing, timings, environment (channel/UA/DPR/viewport/hasTouch) and the caveats. |
| `run.webm` | A real video of the whole run. |
| `exported/*.pdf` | The artifact the app exported, copied out of the browser's OPFS storage so you can open it. |

The run prints the absolute path of `contact-sheet.html` (and the artifacts folder) at the end.
The folder is **wiped at the start of every run**, so `NN-<step>.png` never accumulates stale
steps from an earlier run.

---

## How to read the result

- **PASS** — the step reached its intended state; the screenshot is the evidence.
- **FAIL** — the step ran but an expectation was not true (e.g. a gesture was supposed to move
  the object and the geometry did not change). The exact error is in `run.json` and on the sheet.
- **UNREACHED** — the step could not be reached (an element or the page was missing).

**A gesture that does nothing is recorded as doing nothing.** Intent is never reported as
result. The walk continues after a failure and always writes the contact sheet, so one broken
step never hides the rest. If any step is not PASS the command exits non-zero so you notice.

### Per-step evidence

After every step (pass or fail) the harness records the **sheet-directory listing** —
`photo.jpg` / `thumb.jpg` / `markup.json` presence and byte sizes — plus any export files. This
is how `thumb.jpg` is tracked at every step. It is **observation only, never a fix**; `src/**`
is off-limits to this harness.

### Gesture lab

The input layer is `tests/clickthru/gestures.ts`, built on `context.newCDPSession` →
`Input.dispatchTouchEvent` / `Input.dispatchMouseEvent(pointerType: 'pen')`. It never uses
synthetic `dispatchEvent` (D77/F1 proved those diverge from real input — Chromium's implicit
pointer capture). Exercised and recorded per step:

`tapTap` (the 450 ms settle window) · `longPress` (600 ms) · `drag` (object-first move vs empty-canvas pan) ·
`secondFingerCancel` (displaced mid-drag, then restored) · `twoFingerDrag` (always pans) ·
`pinch` (zoom pill changes) · `palmThenTap` (H1b shape) · `penStroke` (pressure `force`) ·
`penHover` (`buttons: 0`) · `penBarrelClick` (`buttons: 2`).

### Rotation gate (UI §5.3)

A step resizes 1440 × 960 → 960 × 1440 and back, asserting the real 1.4.5 gate: the tool rail
(`data-rail`) must **not** move, the style-panel dock (`data-dock`) must flip `side` → `bottom`
→ `side`, and the selected tool, the selection and the zoom must survive.

---

## Honest caveats — what this can never prove

A green clickthru run **never promotes a `[Surface]` row**. Emulation cannot reproduce:

- the finger's **systematic contact-centroid offset** — a synthetic touch point is exactly where we put it;
- **real palm physics** — the palm step is a stationary extra touch point, not a resting heel;
- Windows' **~250 ms pinch delay** on inking surfaces (**H15**);
- **coalescing / `getCoalescedEvents()` rates** (**H16**) — every CDP move is one discrete event;
- the **Ink API** (**H17**) and **thermal / sustained DPR-2 FPS** (**H18**);
- **pen pressure, tilt and hover** beyond a fixed CDP `force`;
- **real camera optics and resolution** (**C3/H10**) — the stream is Chromium's fake device;
- **sunlight / Dim legibility** on real glass (**H3**);
- the **14-day trash clock** and the **service-worker update lifecycle**;
- **File System Access on a real disk** — the projects root and export destination are OPFS.

Those rows live in `docs/HARDWARE-TEST-CHECKLIST.md` and still need a human on real hardware.

---

## Files

- `playwright.clickthru.config.ts` — the headed config (own port, own `outputDir`, never `CI`).
- `tests/clickthru/devices.ts` — the Surface device profiles.
- `tests/clickthru/gestures.ts` — the real CDP touch/pen gesture library.
- `tests/clickthru/harness.ts` — the shim, the step runner/screenshots, the per-step evidence observer, OPFS read-out, contact sheet.
- `tests/clickthru/betaPath.spec.ts` — the path, the gesture lab, the rotation gate, as numbered steps.
