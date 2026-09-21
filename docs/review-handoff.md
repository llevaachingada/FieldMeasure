# Adversarial Review Handoff — Field Measure preflight packet

**To:** a senior-level adversarial reviewer (architecture + correctness + hardening + issue-finding).
**Subject:** `docs/preflight-handoff.md` (primary) and `docs/ui-spec-field-measure.md` (companion UI/UX spec).
**Your job:** try to break it. Find contradictions, unbuildable specs, data-loss paths, wrong-measurement paths, security/privacy gaps, and over/under-engineering. Verify this packet is actually executable by a lower-level builder with **zero guessing**.

---

## Objective & bar

This packet is intended to be handed to a lower-level AI that builds the app end-to-end. The review exists to catch anything that would cause that builder to:

1. build the wrong thing,
2. get stuck (underspecified),
3. ship a data-loss bug, or
4. produce a wrong measurement on a job site.

Report **material findings only** — not prose polish, not preference.

## Artifacts under review

- `docs/preflight-handoff.md` — architecture, data model, zod schemas, reference code, tool-by-tool specs, build slices, decisions, risks.
- `docs/ui-spec-field-measure.md` — UI/UX spec (authority on visual/interaction detail).

## Context (accepted — do not re-research, do not relitigate)

- **Product:** Surface (Windows 11 / Edge) pen+touch PWA. Take a photo → draw feet-inch dimensions + rich markup + photo insets → export PDF/PNG to a local folder. **No server, no DB, no sign-in, no Bluetooth, no cloud SDK, no multi-user.** Dropbox sharing is manual (the user drags the `exports/` folder into Dropbox).
- **Stack is fixed:** imperative Konva (not react-konva), React chrome, zustand 5 + immer 11, zod 4, idb-keyval 6, @cantoo/pdf-lib 2 (`pdf-lib` is unmaintained), perfect-freehand, lucide-react. `crypto.randomUUID()`.
- **Prior research already completed:** Konva API, File System Access API, pointer/pen/palm, camera capture, dependency versions/licenses, ft-in input UX, photo-inset patterns, tool/style-panel UX.
- **A prior architecture review was already done and its corrections are already incorporated.** Build on them; do not repeat them.

## Settled decisions (do not re-litigate)

Packet §16, D1–D13 are decided: PWA · imperative Konva · FSA storage (OPFS fallback) · per-sheet `markup.json` sidecars · image-px geometry + mu style units · mm-canonical + entered text · flatten-only PDF v1 · typed-value-only dimensions v1 · OPFS-only fallback (idb-keyval only for the handle) · `source` field only for laser · manual Dropbox · one-level inset nesting · raw-point erase split.

If you think one of these is wrong, you must show a **concrete failure scenario** — a preference opinion is not a finding.

## The threat model (attack these lenses)

1. **Data integrity / durability.** Crash or power-loss at any instant during a write. What exactly is on disk? Can `project.json`/`markup.json` be left truncated or inconsistent? Is the tmp+rename pattern actually correct in Chromium (does `FileSystemFileHandle.move()` exist, and does it overwrite atomically, or is removeEntry+move required)? Is validate-on-load + snapshot recovery sufficient? What about a crash *between* writing `markup.json` and updating `project.json` (e.g. sheet reorder)?
2. **Measurement correctness.** A wrong number is worse than a crash. Attack the ft-in parser, the 1/16" rounding/carry, the mm↔in↔ft round-trip, and the coordinate/scaling model (image-px geometry + mu styles + `strokeScaleEnabled:false` + export DPI). Is the mu→pt export math actually correct for a *flattened* render? Does `strokeScaleEnabled:false` behave under stage scaling as assumed, and what happens to text `fontSize`?
3. **FSA lifecycle.** Permission rehydration on cold start, folder moved/renamed/deleted, OPFS fallback, two-tab concurrency, and the big one — two Surfaces pointing at the same Dropbox folder (conflict copies, not clean last-writer-wins).
4. **Input pipeline.** Pen/touch/palm, pinch vs pan vs draw, coalesced events, latency, `pointercancel`.
5. **Export fidelity.** Flattened raster at 1×/2×/3×, DPI, filename sanitization (Windows reserved names / DOS devices), PDF correctness, per-file error handling.
6. **Security / privacy.** GPS stripping, no telemetry, CSP, third-party license notices (MIT/Apache-2.0/ISC all require them), supply chain.
7. **Spec completeness & contradictions.** Are the two docs internally consistent? Is any tool/flow underspecified enough that a builder would guess? Cross-check the UI spec's §18 open questions against the packet's §18.
8. **Build-plan feasibility.** Are the slices correctly ordered and dependency-complete? Does any slice need something not specified? Any missing slice?
9. **Schema / validation.** Is the zod 4 API as written actually correct (`discriminatedUnion`, `z.lazy` self-reference, `.nullable()`, union-of-literals)? Is the migration strategy sound?
10. **Performance.** 50-sheet project, freehand ink, thumbnails, in-memory model + per-sheet files on an 8 GB Surface Go.

## Specific things I'm least confident about (start here)

1. `FileSystemFileHandle.move()` — existence, overwrite semantics, and whether "tmp → close → move" is the correct atomic pattern vs "removeEntry(name) → move".
2. The flatten-export path: when I "render the stage at scale M, pixelRatio 1" with `strokeScaleEnabled:false`, does the stroke land at the *intended* physical size in the output bitmap, and does the mu→pt (×0.75) claim hold for both strokes **and** text?
3. **Inset child coordinate space** — I wrote "children in inset-local (untransformed) px," but that's under-specified. Define precisely what it means when the inset is scaled/rotated/cropped, and whether children coordinates stay stable across inset resizes. Is the inset geometry's `{width,height}` the *displayed* size or the *asset-native* size? This is a real footgun.
4. Konva hit-testing inside a clipped, rotated group — does `getIntersection` + `name()` tagging correctly resolve a child to its inset owner? What breaks?
5. The two-doc split: the UI spec §18 still frames calibration as a "required sub-flow," while the packet says typed-value-only v1. Reconcile fully so a builder doesn't build a calibration flow we don't want.
6. Dropbox concurrency: is "store `updatedAt` + content hash, warn on mismatch" a realistic mitigation, or does Dropbox's conflict-copy behavior produce a different failure mode (and does it matter)?
7. Undo/redo + debounced autosave interaction: is there a race where undo restores stale state while a write is in flight?
8. zod 4 exact API correctness of every construct in the packet's schema (§3.4).
9. PWA + FSA in Edge specifically: does `showDirectoryPicker` + persisted handle + `requestPermission` actually work in an *installed* PWA across restarts, or is there an Edge-specific wrinkle the research only "treated as Chromium-parity"?
10. Anything the user's feedback implies that I under-specified — e.g. "changing text and line scale and color and fills and transparency": is *every* one of those reachable in the style-panel spec?

## Output format

Produce a **ranked findings list**:

- **Blocker** — would cause data loss, a wrong measurement, or an unbuildable spec → include a concrete fix.
- **Major** — correctness/consistency gap → include a fix.
- **Minor** — clarity, cleanup, missed edge case → one-line fix.

Plus a short **verification checklist** of the 5–10 things that can only be resolved on real Surface hardware (these are not review findings — they are the on-device test gates).

Do not rewrite the packet. Do not re-research the libraries. Do not restate what is already correct.
