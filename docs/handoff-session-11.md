# Handoff (hardened) — next orchestrator: close 1.6's wiring, then 1.7 and 1.8

**Written:** 2026-09-21 (session 11) · **Branch:** `main` · **Tree:** clean, pushed · **HEAD at time of writing:** `a93aa5e`

This file is **prescriptive**. It names every file, the exact methods to add, where to call them, and
the lane split for each wave. You should not need to go looking for a solution — if something here is
wrong, the code wins; fix this file and note it in `docs/DECISIONS.md`.

`docs/CONTINUITY.md` is the live snapshot; the last `docs/BUILD-LOG.md` entries are the per-slice record.
Where they disagree with this file, **they win**.

---

# 0. Ground rules for the orchestrator

1. **Read order:** `docs/CONTINUITY.md` → `docs/BUILD-LOG.md` (last 3 entries) → `AGENTS.md` →
   `docs/BUILD-RUNBOOK.md` (**§11 is the parallel-lane protocol — follow it literally**) →
   `docs/review-brief.md` → this file.
2. **One writer per file, per wave.** A file two lanes could touch has exactly one owner for that wave;
   every other lane reads only. Two writers on one file is **whole-file loss**, not a merge conflict.
3. **`docs/` are orchestrator-only.** Lanes *report* findings; you write `BUILD-LOG` / `DECISIONS` /
   `CONTINUITY` / `CHECKPOINTS` / `HARDWARE-TEST-CHECKLIST`.
4. **Never let one lane import a sibling's in-flight file.** Pin the interface in both briefs; wire the
   seam at integration.
5. **Copy**: one writer for `src/ui/strings.ts` per wave. A lane that needs copy stages
   `src/ui/<slice>Copy.ts`; you fold it **from the appendix bytes** and delete the module.
   `tests/strings.test.ts` machine-checks it (approved = byte-verbatim; gaps-or-neither = needs a
   `// ⚠ PROPOSED (C14)` marker in the immediately-preceding comment block; a blank line clears it).
6. **Per-lane verification is a subset:** `npx tsc --noEmit` + `npx vitest run --project node --project
   jsdom`. **One designated lane** (the canvas owner) may also run `--project browser`. **No lane runs
   `npm run build` or `npx playwright test`** — `dist/` and the ports are shared.
7. **You run the full gate on the reconciled tree:** `tsc` → `vitest run` (all 3 projects) →
   `npm run build` → `npx playwright test`. **The build is not optional** (see §5, the CP1252 incident).
8. **Commit per wave** (or one commit naming the slices when waves share files) with the slice number in
   the subject, then `git push origin main`. Update `BUILD-LOG` + `CONTINUITY` + `DECISIONS` in the same
   commit; `CHECKPOINTS` too if one fired.
9. **Windows/PowerShell:** prefix every command with `$env:Path = "C:\Program Files\nodejs;" + $env:Path`;
   use `npm.cmd` / `npx.cmd`; **no heredocs** — write the commit message to a file and use
   `git commit -F <file>`.

---

# Part A — close slice 1.6's three wiring items (do this first)

All three live in the **same files**, so this is **one lane, one wave**. Do not split it.

**Lane A owns (exclusively):** `src/editor/shapes/scene.ts`, `src/editor/tools/SelectTool.ts`,
`src/ui/SheetEditor.tsx`, `src/ui/TopBar.tsx`, `src/ui/EditorLayout.tsx`,
`src/state/editorStore.ts`, `src/domain/schema.ts` (one additive field, see A1),
`src/ui/LayersPanel.tsx` (only if a prop must change — it should not), plus new tests.

**Must not touch:** `src/ui/strings.ts` (stage copy in `src/ui/layersWireCopy.ts` if needed),
`src/domain/{units,geometry,snapping,migrate}.ts`, `docs/**`.

## A1. Mount the Layers panel

The panel is **built and tested (45 tests)** at `src/ui/LayersPanel.tsx` with this **exact** interface —
do not change it:

```ts
export type LayerGroup = 'dimensions' | 'shapes' | 'ink' | 'text' | 'insets' | 'photo';
export interface LayerRow {
  key: string;          // AnnotationPath key — NEVER an array index
  name: string;         // already-derived display name, e.g. `Dimension 12'-6"`
  group: LayerGroup;
  indent?: number;      // 0 top-level, 1 for an inset child
  locked: boolean;
  visible: boolean;
  deletable: boolean;   // the photo row is false
}
export interface LayersPanelProps {
  rows: LayerRow[]; selectedKeys: string[]; loading?: boolean;
  onSelect(key: string): void;
  onToggleVisible(key: string): void;
  onToggleLock(key: string): void;
  onReorder(key: string, toIndex: number): void;   // same-group only; refuse cross-band
  onRename(key: string, name: string): void;
  onDelete(key: string): void;
  onClose(): void;
}
export default function LayersPanel(props: LayersPanelProps): JSX.Element;
```

**Grounding you need (verified):**

| Fact | Where |
|---|---|
| The scene lives in `SheetEditor` | `src/ui/SheetEditor.tsx:198` `const sceneRef = useRef<MarkupScene \| null>(null)`, constructed at `:291` `new MarkupScene({…})`, `scene.onChange` wired at `:306` |
| The sheet-mount pattern to copy | `src/ui/SheetEditor.tsx:~835` — `{keypadOpen ? <div ref={keypadMountRef} className="keypad-sheet-mount" data-testid="keypad-sheet"> … </div> : null}` |
| How a tool asks the shell to open a sheet | `KeypadRequest` (`src/editor/tools/DimensionTool.ts:181`) + `onKeypadOpen` (`SheetEditor.tsx:335`, which calls `useEditorStore.getState().setKeypadOpen(request !== null)`) |
| `editorStore` already has the mirror-state pattern | `src/state/editorStore.ts:54` `keypadOpen: boolean`, `:64` `setKeypadOpen(open: boolean)`, `:79` initial `false` |
| The shell reads it for the dim/inert treatment | `src/ui/EditorLayout.tsx:150` (`useEditorStore((s) => s.keypadOpen)`), `:214` (hotkeys/Esc guard), `:254` (`data-keypad-open`) |
| The TopBar Layers button is hardcoded disabled with **no prop** | `src/ui/TopBar.tsx:148-152`; props interface at `:25-40` |
| `Annotation` schema fields | `src/domain/schema.ts:78` `AnnotationZ`; `:86` `zIndex: z.number()`; `:90` `locked: z.boolean()`; **there is NO `visible`/`hidden` field** |
| Scene API today | `src/editor/shapes/scene.ts` — public: `list()`, `entries()`, `get(key)`, `getNode(key)`, `keyForAnnotationId(id)`, `addDimension`, `addMarkup`, `addAnnotation`, `removeObject(key)`, `setValue`, `setAngleValue`, `setAnchor`, `setGeometry`, `geometryCopy(key)`, `moveObject`, `geometryAt`, `boundsAt(key)`, `keysInRect`, `setContext`, `setScale`, `setLuminanceSampler`, `serialize()`, `markupFile(sheetId, v)`, `load(annotations)`. Private: `nextZIndex(kind)`, `resort()`. **Bands:** `isLowerBand(kind)` + `Z_BAND` (`:53-63`) |

**Do this, in order:**

1. **`src/domain/schema.ts` — add ONE nullable field** to `AnnotationZ` (right after `locked`):
   ```ts
   // Slice 1.6 wiring: the Layers panel's eye toggle. `.nullish()` so existing
   // markup.json files (which have no `visible`) still parse — no migration version bump.
   visible: z.boolean().nullish(),
   ```
   **Rationale (record in DECISIONS):** the UI spec §9 requires the eye toggle; persistence is the
   "do not simplify" behaviour. `.nullish()` means absent = visible, so no `migrate.ts` change is needed.
   *Alternative if you prefer not to touch the frozen domain module:* make visibility **session-only**
   (keep a `Set<string>` of hidden keys in the scene, never serialized) — but then the eye toggle lies
   across a reload, so **prefer the field**.

2. **`src/editor/shapes/scene.ts` — add exactly four methods** (keep them band-aware so §20.2 cannot be
   violated):
   ```ts
   /** Eye toggle. Absent/false = visible. Emits onChange. */
   setVisible(pathKey: string, visible: boolean): void;
   /** Lock toggle. Uses the EXISTING `locked` schema field. Emits onChange. */
   setLocked(pathKey: string, locked: boolean): void;
   /** Rename = the annotation's display name source. Emits onChange. */
   rename(pathKey: string, name: string): void;
   /** Reorder WITHIN the object's own band (§20.2). Cross-band = no-op (the panel refuses first). */
   moveInBand(pathKey: string, toIndex: number): void;
   ```
   - `moveInBand` uses the same floor/ceiling logic as `nextZIndex`: collect the band's members sorted
     by `zIndex`, splice the moved one to `toIndex`, renumber, then call the existing private `resort()`.
   - Rename: if `Annotation` has no `name` field, store the edited name where the panel's `rows` builder
     reads it — check `AnnotationZ`. **If there is no name field, do NOT add one**: derive the name from
     kind + value (as the panel already expects `name` to be *derived*, e.g. `Dimension 12'-6"`,
     `Rectangle`, `Inset 2`) and make `onRename` a **no-op that reports** — the spec's editable sheet
     title lives on `SheetFile.title`, not on annotations. **Verify before building this**; the panel's
     own tests assert the menu carries a Rename item, not that renaming persists.

3. **`src/state/editorStore.ts` — mirror the keypad pattern:**
   ```ts
   layersOpen: boolean;                 // initial false
   setLayersOpen: (open: boolean) => void;
   ```
   (Add to `EditorState`, `EditorActions`, `createInitialEditorState`, and the store body — exactly where
   `keypadOpen` / `setKeypadOpen` are: `:54`, `:64`, `:79`, `:87`.)

4. **`src/ui/TopBar.tsx` — add one optional prop** and make the button real:
   ```ts
   /** Layers flyout toggle. Absent = the button stays disabled (a labelled no-op, never a lie). */
   onToggleLayers?: () => void;
   ```
   Then on the Layers `<button>` (`:148-152`): `disabled={!onToggleLayers}` and
   `onClick={onToggleLayers}`, plus `aria-expanded={...}` if you pass the open state.
   **Leave the Export button `disabled`** — 1.9 owns it.

5. **`src/ui/EditorLayout.tsx` — read the state, pass the toggle, mirror the dim:**
   - `const layersOpen = useEditorStore((s) => s.layersOpen);`
   - `<TopBar … onToggleLayers={() => useEditorStore.getState().setLayersOpen(!layersOpen)} />`
   - add `data-layers-open={layersOpen ? 'true' : 'false'}` next to `data-keypad-open` (`:254`)
   - **extend the Esc ladder guard at `:214`**: while a flyout is open, Escape must close it, not
     advance a rung. Use one rule: if `keypadOpen` → return (the keypad owns Esc); else if `layersOpen`
     → `setLayersOpen(false)` and return.

6. **`src/ui/SheetEditor.tsx` — build the rows and mount the panel** (this is the only place that can,
   because the scene lives here):
   ```tsx
   // rows: derive from the scene, one entry per annotation, insets' children indented.
   const rows = scene.list().map((a) => ({ key: scene.keyForAnnotationId(a.id)!, name: …, group: …, locked: !!a.locked, visible: a.visible !== false, deletable: a.type !== 'image' }));
   ```
   - Mount it **next to the keypad sheet**, same pattern: `{layersOpen ? <LayersPanel … /> : null}` with
     a `layersMountRef`, and **do not add a second `role="dialog"` wrapper** — the panel supplies its
     own; the wrapper is positioning-only. *(This is the exact defect that had to be fixed at the 1.5
     integration: two nested same-named modals.)*
   - Wire the six callbacks to the scene, **each through `History`** so every toggle is undoable:
     `onDelete` → `history.exec({ do: () => scene.removeObject(key), undo: …, label: … })`, etc.
     Use the existing `session.ts` registry if it is the established route for a command.
   - `onReorder` must **refuse cross-band** drops before calling `scene.moveInBand` (the panel already
     refuses and shows `editor.highlighterBandMessage`, but the scene must not be left able to violate
     §20.2 if called directly).
   - `onSelect` → `setSelection([key])` + pan the canvas to it (`scene.boundsAt(key)` + `EditorCanvas`).

7. **Names**: derive them with a single pure helper so the panel stays dumb and the tests can pin it —
   `Dimension 12'-6"` (use the same derivation the renderer uses, `dimensionLabel`/`formatLength`),
   `Rectangle`, `Freehand`, `Inset 2`, and `Photo` for the photo row. The appendix already keys
   `editor.eraseNameRectangle`, `editor.eraseNameDimension`, `editor.layersNameFreehand`, `inset.layersName`.
   **No new copy invention** — if you need a string that is in neither appendix, stage it marked
   `⚠ PROPOSED (C14)` and report it.

**Gates for A1:** rows render in the right bands with children indented; tap-select passes the **key**;
eye/lock call through and are labelled with the object's name; a cross-band reorder is refused with the
approved copy; the photo row offers no delete; the panel opens from the TopBar, Escape closes it, and
focus returns to the Layers button; **each toggle is one undo step**; the row count matches
`scene.list().length` after a reload (proves `visible`/`locked` persisted).

## A2. Finish `SelectTool`'s shell wiring

**The class is complete and pure-tested.** `src/editor/tools/SelectTool.ts` already exports:
`handleVisualPx`, `handleHitPx`, `handlePositions`, `visibleHandles`, `nearestHandle`, `rotateSnapDeg`,
`ROTATE_STOPS`, `handleAxis`, `axisLockDelta`, `marqueeRect`, `miniToolbarPosition`, `rotateGeometry`,
and the class `SelectTool implements MarkupTool` with `refresh()`, `selectionBounds(keys)`,
`onPointerDown/Move/Up`.

Its dependencies are already declared — construct it with:
```ts
export interface SelectToolDeps {
  canvas: EditorCanvas; scene: MarkupScene; history: History;
  getSelection: () => string[]; setSelection: (keys: string[]) => void;
  onSelectionChange: (keys: string[]) => void; onPinnedToolbar: (pinned: boolean) => void;
  labels: { move: string; rotate: string; delete: string; locked: string };
  onLockedToast?: () => void;
}
```
**What is missing is only the shell-side driving.** `SheetEditor.tsx` already routes pointer events to
the active tool through the `MarkupTool` contract (`src/editor/tools/toolTypes.ts`):
```ts
readonly pending: boolean;
onPointerDown(point: Px, pointerType: string): ContactAction;
onPointerMove(point: Px, movedBeyondSlop: boolean): ContactAction;
onPointerUp(point: Px, tapped: boolean, pointerType: string): void;
onPointerCancel(pointerType: string): void;
onToolChange(): void; dispose(): void;
```
**Do this:** dispatch `'select'` to a constructed `SelectTool` in the same place the other tools are
dispatched, and add the three shell behaviours the class cannot own:
1. **Marquee on empty-canvas drag** — when the drag target is `'pan'` *and* the select tool is active and
   nothing is hit, accumulate a marquee rect (`marqueeRect(a, b)`) and on up call
   `scene.keysInRect(rect)` → `setSelection(keys)`.
2. **Rotate UI** — show the rotate affordance while a selection exists; commit via
   `history.exec` with `rotateGeometry(geometry, pivot, deg)` using `nearestHandle`/`rotateSnapDeg`.
3. **Mini-toolbar** — position with `miniToolbarPosition(...)` (64 px tall) and pin it on the 600 ms
   long-press; `LONG_PRESS_MS = 600` is already exported from `src/editor/EditorCanvas.ts:48`.
   Keep `onLockedToast` wired to the existing `editor.lockedToast` copy.
   **Groups:** leave `Group`/`Ungroup` disabled in the panel. The class has no group model and
   `scene.ts` has none either — do **not** invent one in this wave; record it as owed.

**Gates for A2:** the browser project proves a marquee selects the enclosed annotations; a handle drag
translates and is one undo step; a rotate commit lands the snapped angle; a long-press pins the
mini-toolbar; starting a marquee on a *hit* object does not marquee.

## A3. Drive the erase 600 ms long-press preview

`src/editor/tools/EraseTool.ts` already exports `isErasePreview(durationMs)` (`:35`), `beginPreview(point)`
(`:169`), `ERR_COLOR` (`:279`) and implements the `MarkupTool` contract.

**Do this:** in `SheetEditor`'s erase-tool pointer path, start a `setTimeout(beginPreview(point), 600)`
on `pointerdown`; cancel it if the contact moves beyond the slop, lifts, or is cancelled;
`if (isErasePreview(duration))` keep the `--err` preview visible and **do not delete**; a tap shorter
than 600 ms deletes the object and names it in the undo toast (already wired). Reuse `LONG_PRESS_MS`.

**Gate for A3:** a 600 ms press on an object shows the `--err` outline and deletes nothing; a short tap
deletes and toasts; moving the finger cancels the preview.

## Wave A sequence

1. Dispatch **one lane** (the three items share files — do not parallelise them).
2. Integrate: fold any staged copy from the appendix bytes → delete the staging module.
3. Full gate → internal review (spot-check that the `visible` field survives a reload, that each toggle
   is one undo step, and that no second `role="dialog"` was added).
4. `BUILD-LOG` entry (1.6 becomes COMPLETE) + `DECISIONS` (the `visible` field; the rename decision;
   anything the lane could not finish) + `CONTINUITY` + `HARDWARE-TEST-CHECKLIST` rows.
5. Commit (`feat(1.6): close the three wiring items …`) and push.

---

# Part B — slice 1.7: image insets

**Packet:** `docs/implementation-plan.md` lines **1158–1204**. Read it in full before dispatch; it is the
contract. **Spec refs:** build spec §8.5 (inset coordinate model), UI spec §9, §13/1.7.

**The one thing that must not be flattened** (packet lines 1171–1179): a `Konva.Group` whose rect sits at
`(x, y)`, `scale = (width/crop.width, height/crop.height)`, `clipFunc(ctx => ctx.rect(0, 0, crop.width,
crop.height))`, where **both the asset image AND every child are offset by `-crop`**, and rotation pivots
on the placed rect's **centre** (`offset({x: crop.width/2, y: crop.height/2})` in local units +
`position({x: x+width/2, y: y+height/2})`). Hit-testing: container → inverse transform → group-local →
`asset = local + crop`. If a child drifts on crop/rotate, that offset is the bug.

**Lane split (two lanes, clean seam):**

| Lane | Owns (exclusively) | Must not touch |
|---|---|---|
| **B1 — inset engine** | `src/editor/tools/InsetTool.ts`, `src/editor/inset/**` (group render, crop/clip/offset, hit-test, one-level nesting, Focus mode), `src/editor/shapes/scene.ts` (the `image` kind + `children` handling), tests | `src/ui/**`, `src/state/**`, `strings.ts` |
| **B2 — picker sheet (UI)** | `src/ui/ImageInsetPickerSheet.tsx`, `src/ui/imageInsetPicker.css`, `src/ui/insetCopy.ts` (staging), tests | `src/editor/**`, `src/state/**`, `strings.ts`, `SheetEditor.tsx` |

**Pinned interface for B2** (put it verbatim in both briefs):
```ts
export interface ImageInsetPickerSheetProps {
  /** 'camera' | 'device' | 'recents' — the sheet renders all three sections. */
  recents: Array<{ assetId: string; thumbUrl: string; name: string }>;
  onPickCamera: () => void;
  onPickDevice: () => void;          // multi-select; the caller cascades placements 24 px down-right
  onPickRecent: (assetId: string) => void;
  onCancel: () => void;
}
export default function ImageInsetPickerSheet(props: ImageInsetPickerSheetProps): JSX.Element;
```
B1 mounts it (cross-lane import) — expect a **transient `TS2307`** until B2 lands; **B1 must not create or
stub that file.** Say so in the brief.

**Assets are content-addressed** (packet line 1196): `assets/<sha256hex>.jpg`, dedupe by a
`getFileHandle` existence check, both annotations carry the same `assetId`. `sha256Hex` already exists in
`src/media/normalizeImage.ts`. **No index file.**

**Gates:** the child round-trip (inset → child dimension → scale ×2 + move crop + rotate 30° → save →
reload → child lands at the same **visual** point); children stay glued on a crop-window move; two
insets from one asset have independent children; Focus clips inside / renders outside above all insets;
`Esc` exits exactly one level; a11y (Focus announces entry/exit; breadcrumb is a real control; 48 px
targets, 16 px hit slop). Insert flow: default placement 40 % of sheet width, aspect preserved.

**Integration:** fold `insetCopy.ts` → `strings.ts` → delete; wire the Inset tool into the rail
(`ToolRail.TOOL_DEFS` — `inset` is the **only** tool still `implemented: false`) and into `SheetEditor`'s
dispatch; ensure the picker opens from the insert flow.

---

# Part C — slice 1.8: style system

**Packet:** `docs/implementation-plan.md` lines **1205–1258**. **Spec refs:** build spec §11.5, UI spec §7.

**Purpose:** per-tool style memory, the WYSIWYG Style Chip, and the **project-level**
precision/unit-format controls — the one place precision is edited.

**Lane split (two lanes):**

| Lane | Owns (exclusively) | Must not touch |
|---|---|---|
| **C1 — style state + IO** | `src/state/styleByTool.ts` (`Record<ToolId, AnnotationStyle>`; tool-swap **returns**, never resets), the presets IO (`.fieldmeasure/presets.json`, **atomic** via `projectStore`), `src/editor/shapes/scene.ts` (applying a style to a selection as one `History` command), tests | `src/ui/**`, `strings.ts` |
| **C2 — Style panel UI** | `src/ui/StylePanel.tsx`, `src/ui/StyleEditorSheet.tsx`, `src/ui/stylePanel.css`, `src/ui/styleCopy.ts` (staging), tests | `src/editor/**`, `src/state/**`, `strings.ts`, `SheetEditor.tsx` |

**Pinned interface for C2:**
```ts
export interface StylePanelProps {
  tool: ToolId;
  /** The style the next stroke will use (per-tool memory). */
  style: AnnotationStyle;
  /** Selection state: 'none' | 'single' | 'mixed'. Mixed renders INDETERMINATE, never a guess. */
  selection: 'none' | 'single' | 'mixed';
  /** Per-control applicability; a control that does not apply is DISABLED, never hidden. */
  applicable: Partial<Record<keyof AnnotationStyle, boolean>>;
  projectPrecision: number;            // the ONE place precision is edited (D31)
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  onChange(patch: Partial<AnnotationStyle>): void;
  onPrecisionChange(denominator: number): void;
  onUnitFormatChange(format: 'ft-in' | 'in' | 'ft-decimal'): void;
  onOpenEditorSheet(): void;
  presets: Array<{ name: string; style: AnnotationStyle }>;
  onSavePreset(name: string): void;
  onApplyPreset(name: string): void;
}
export default function StylePanel(props: StylePanelProps): JSX.Element;
```
`StyleEditorSheet` is a 720×640 modal at 60 % scrim with the same props minus `tool`/`applicable`.

**The Style Chip is a "do not simplify" item** (§11.6): it is always visible and shows a **live 96×40 SVG
of the actual next stroke** — do not replace it with a swatch or a text label.

**Pinned trap — read this before building (packet lines 1246–1252):** tapping a fraction chip during a
dimension entry must **not** re-round every label in the project. The chip is **entry-scoped** (D31 /
§21.2); changing the project default happens **only** in this panel's Precision control, which already
confirms `«Project precision: 1/16»` (`dimension.projectPrecision` is the shipped template form).
Verify the current keypad behaviour before touching it — it is already implemented entry-scoped.

**Gates:** swap tools + restyle in < 2 s without losing flow (style memory returns); mixed selection
renders **indeterminate**, a change applies to all and clears it; the precision control edits the
**project** value and every label re-derives; presets round-trip `presets.json` and survive a reload;
a11y (mixed/indeterminate announced, disabled controls keep an accessible name explaining why, 48 px
targets with 16 px hit slop; the swatch grid keeps its sanctioned sub-48 exception, Recents rise to 44 px).

**Integration:** fold `styleCopy.ts` → `strings.ts` → delete; mount `StylePanel` in `EditorLayout`'s
docked style slot (it currently renders a **placeholder style chip** — replace it, keep the dock
geometry from `panelDockFor`); wire `onPrecisionChange` to the project file through the existing
`persistQueue` path so the change persists and labels re-derive.

---

# Part D — what to run, in order

```
Wave A  one lane   → 1.6 wiring complete           → gate → commit+push
Wave B  two lanes  → 1.7 insets                    → integrate → gate → commit+push
Wave C  two lanes  → 1.8 style system              → integrate → gate → commit+push
```

Between waves: reconcile → read the diffs (not just the reports) → full gate → optional review lane
against `docs/review-brief.md` → resolve → re-run gate → docs → commit → push.

**Cross-check before each dispatch:** the contended set. Today it is `src/ui/strings.ts`,
`src/styles.css`, `src/App.tsx`, `src/state/{appStore,editorStore}.ts`, `src/editor/shapes/scene.ts`,
`src/ui/SheetEditor.tsx`, `src/ui/EditorLayout.tsx`, `src/ui/ToolRail.tsx`, and all of `docs/`.
**Re-derive it per wave** — new slices add new shared files.

---

# Part E — standing context (do not re-derive)

**Contracts that must not break**
- **D51** — runtime `projectId` is `${id}:${folderName}` everywhere (registry, writer lease,
  `persistQueue`, Web Lock, BroadcastChannel).
- **§4.2 screen vs export scaling are opposites** — screen: strokes `strokeScaleEnabled:false` +
  `strokeWidth = mu`; text `fontSize = mu / s`; ink outline regenerated at `mu/s` on zoomend.
  **Fills ignore `strokeScaleEnabled`** — that is how ink width drifts. `applyScreenRules` in
  `EditorCanvas.ts` is the single chokepoint; **do not add a second.**
- **No stored `label`** — labels derive from `valueMm` + project precision + unit format.
- **`pressure` is a parallel array**; `Px` has no `pressure` member. `svgPath.strokeInputPoints` is the
  only place that indexes it (`pressure[i] ?? 0.5`).
- **Canvas tests never in jsdom** (D40); the browser project or Playwright.
- **CSP-as-a-test stays green** — no inline `style=""`.
- **All disk writes via `projectStore`**; **no new runtime dependencies** (§2.2 is closed);
  **imperative Konva only**.

**Checkpoint / hardware ledger (never fake):** C1 ✅ C2 ✅ C3 ✅(provisional) · **C4 is now measurable**
(annotations exist) — `min(dpr,2)` ships until hardware says otherwise · C5 ✅ · C6/C7/C8 ⬜ ·
**C9 machine half ✅ / pen PENDING** · **C10 machine half ✅ / on-glass walk deferred**.

**Watch items carried forward**
1. **The 1.4→1.6 batch has NOT had an independent adversarial review** (the owner waived it). Treat
   those slices as gate-green but unproven against the `review-brief.md` questions.
2. `markup.json` under a **read-only project** is not suppressed — the queue parks and retries; 1.10's
   autosave chip owns that state.
3. **Targets are CSS-declared, not measured** (keypad 48–72 px; panel 320/56/48 px) — same class as
   **D64**'s unproven dpr-2 path.
4. **Two UI-spec numbers are wrong** and still need correcting in the UI spec: §8.6 contradicts itself on
   long-press (resolved: grip = drag, row body = menu); §8.1's "360 px" sheet is arithmetically impossible
   with its own contents (538 px computed).
5. **Proposed copy needs a content owner**: the refusal reason «Fraction must be smaller than 1/16» is
   stale under D31 (→ `1/{denominator}`), and the whole `⚠ PROPOSED (C14)` set is unapproved.
6. **`PendingOp` has no generic-shape member** — placements borrow `'polygon'`.
7. **14 tool glyphs are placeholders** (D68) — must not ship to 2.0 un-reviewed.
8. **Groups** exist nowhere: `SelectTool` has no group model, `scene.ts` has none, and the panel's
   `Group`/`Ungroup` are correctly disabled. Landing them is its own slice.

**Environment quirks that cost real time**
- **Never verify copy through the console**: `Select-String` renders U+2014 as `-`, `git diff` renders
  `—`; `[regex]::Escape()` + `-SimpleMatch` searches for a literal backslash-space. Use byte-level `node`
  reads or `tests/strings.test.ts`.
- **Encoding**: source = LF UTF-8, `docs/*.md` = CRLF (a script rewriting a doc must restore CRLF).
  **A lane can write CP1252 into a UTF-8 source file** — it broke `npm run build` while **526 tests were
  green**. On `UNLOADABLE_DEPENDENCY … stream did not contain valid UTF-8`, scan for invalid bytes
  (`0x80–0x9F`) rather than hunting a code error.
- **The background job board is unreliable by design**: finished lanes read "running, status uncertain"
  forever; `task_result`/`task_status` may not see terminal state; only one `task_message` lands per task
  (retry on "message/control lease unavailable"); `task_revive` works. **Trust the completion
  notification and the files on disk. Do not poll.**
- Node 24.19 · npm 11 · Vite 8.3 · Vitest 5.0.1 · TS 5.9.3 · React 19.3 · Konva 10.6 · Playwright 1.63.

**Stop and ask the human only for:** a gate failing three times with three genuinely different fixes
(runbook §6); anything needing a **new runtime dependency** or violating an `AGENTS.md` non-negotiable;
a **destructive or outward-facing** action (deleting user data, force-push, deploy, publish).
Everything else: decide, record it in `docs/DECISIONS.md`, and keep going.
