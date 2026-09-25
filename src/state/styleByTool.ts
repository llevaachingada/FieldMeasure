/**
 * `src/state/styleByTool.ts` — slice 1.8, lane C1 (state + IO).
 *
 * The per-tool style memory (UI spec §7.4 #6 / build spec §11.5) plus the pure
 * derivation helpers the style panel and the shell consume:
 *
 *   - `styleByTool: Record<ToolId, AnnotationStyle>` — swapping tools returns that
 *     tool's LAST style; swapping back is always a return, never a reset (§7.4 #6).
 *   - `recents` — the last 8 style objects used anywhere, deduped, newest first;
 *     `recentsForTool` filters them to those valid for the current tool (§7.3).
 *   - `selectionStyleState` — `none | single | mixed` for a selection (§7.4 #2).
 *   - `applicableFor` — the §7.2 per-tool control table as booleans; a control the
 *     table does not list for a tool is `false` (rendered disabled, never hidden).
 *   - `selectionScope` — the heterogeneous-selection chip's `type (count)` rows (§7.4 #3).
 *
 * NO tool logic, NO React components, NO DOM and NO I/O live here. Zustand v5 with the
 * immer middleware; `ToolId` is a **type-only** import from `@/ui/ToolRail`, so this
 * module stays importable by pure node tests (the same rule editorStore.ts follows).
 *
 * "Used" means every committed style change: setting a tool's style (merge or replace)
 * and applying a style to a selection (`recordRecent`, called by the shell after the
 * one-step History command lands). Resetting a tool does NOT record — a default is not a
 * distinctive look.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { AnnotationStyle, AnnotationType } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { ToolId } from '@/ui/ToolRail';

/**
 * The `AnnotationStyle` keys the per-tool table covers, in a stable order (used by every
 * comparison below). D133 (UI/GUI handoff pass) appended the three inset-only keys after
 * the original eight — appending, not inserting, keeps every existing `STYLE_KEYS[i]`
 * index and every array built by filtering it (`enabledFor` et al.) stable except where a
 * test deliberately asserts the new tail, per `tests/typeToolMap.test.ts`'s own note.
 */
export const STYLE_KEYS = [
  'strokeColor',
  'strokeWidthMu',
  'fillColor',
  'fillAlpha',
  'lineStyle',
  'arrowheads',
  'fontSizeMu',
  'bold',
  'insetBorder',
  'insetRadius',
  'insetShadow',
] as const;

export type StyleKey = (typeof STYLE_KEYS)[number];

/** §7.3: the last 8 style objects used anywhere. */
export const RECENTS_CAP = 8;

/**
 * The 14 tool ids, mirroring `TOOL_DEFS` in `@/ui/ToolRail` — duplicated (not imported at
 * runtime) so this module never pulls React. The `satisfies` + `Exclude` pair below is a
 * compile-time exhaustiveness guard: adding a tool to `ToolId` without adding it here is a
 * `tsc` error, so the two cannot silently drift.
 */
const TOOL_IDS = [
  'select',
  'pan',
  'dimension',
  'angle',
  'line',
  'arrow',
  'rect',
  'ellipse',
  'polygon',
  'freehand',
  'highlight',
  'text',
  'inset',
  'erase',
] as const satisfies readonly ToolId[];

type MissingToolId = Exclude<ToolId, (typeof TOOL_IDS)[number]>;
const _everyToolIsListed: MissingToolId extends never ? true : never = true;
void _everyToolIsListed;

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

/** Deep equality over every STYLE_KEYS entry (strings/numbers/booleans/null). */
export function stylesEqual(a: AnnotationStyle, b: AnnotationStyle): boolean {
  for (const key of STYLE_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * The §7.2 per-tool control table, reduced to the `STYLE_KEYS` subset of `AnnotationStyle`.
 *
 * A key the table does not list for a tool is **`false`** — the panel disables that
 * control and never hides it (§7.4 #4 / §11.6 #5). Ambiguities between the table and what
 * the renderers genuinely consume are reported to the orchestrator, not papered over here:
 *   - `renderDimension` consumes `lineStyle`, `fontSizeMu` and `bold`, but the §7.2
 *     Dimension row lists none of them → table-faithful `false`.
 *   - `renderShape`'s angle readout consumes `fontSizeMu`/`bold`; §7.2's Angle row lists no
 *     Size → table-faithful `false`.
 *   - §7.2's Highlighter row lists Transparency, but `renderInk` consumes only
 *     `strokeColor`/`strokeWidthMu` → `fillAlpha` stays `true` (the table wins).
 *   - Erase / Select / Pan map to no `AnnotationStyle` key at all → all `false`.
 *   - Image inset (D133) maps to exactly `insetBorder`/`insetRadius`/`insetShadow` —
 *     `renderInset.ts` consumes none of the original eight.
 */
type Applicability = Partial<Record<StyleKey, boolean>>;

function only(on: Partial<Record<StyleKey, boolean>>): Applicability {
  const base: Applicability = {
    strokeColor: false,
    strokeWidthMu: false,
    fillColor: false,
    fillAlpha: false,
    lineStyle: false,
    arrowheads: false,
    fontSizeMu: false,
    bold: false,
    insetBorder: false,
    insetRadius: false,
    insetShadow: false,
  };
  return { ...base, ...on };
}

const APPLICABILITY: Record<ToolId, Applicability> = {
  // Select lists the selection's shared style and edits it in place (§7.4); it creates nothing.
  select: only({}),
  pan: only({}),
  dimension: only({ strokeColor: true, strokeWidthMu: true, arrowheads: true }),
  angle: only({ strokeColor: true, strokeWidthMu: true }),
  line: only({ strokeColor: true, strokeWidthMu: true, lineStyle: true, arrowheads: true }),
  arrow: only({ strokeColor: true, strokeWidthMu: true, lineStyle: true, arrowheads: true }),
  rect: only({ strokeColor: true, strokeWidthMu: true, lineStyle: true, fillColor: true, fillAlpha: true }),
  ellipse: only({ strokeColor: true, strokeWidthMu: true, lineStyle: true, fillColor: true, fillAlpha: true }),
  polygon: only({ strokeColor: true, strokeWidthMu: true, lineStyle: true, fillColor: true, fillAlpha: true }),
  freehand: only({ strokeColor: true, strokeWidthMu: true }),
  highlight: only({ strokeColor: true, strokeWidthMu: true, fillAlpha: true }),
  text: only({ strokeColor: true, fontSizeMu: true, bold: true }),
  // D133: the inset row was `only({})` — see tests/typeToolMap.test.ts's own note that
  // this is where a real inset control set gets added, deliberately, with a DECISIONS
  // entry. `renderInset.ts` now consumes exactly these three.
  inset: only({ insetBorder: true, insetRadius: true, insetShadow: true }),
  erase: only({}),
};

/** The §7.2 control table for one tool, as booleans over STYLE_KEYS. */
export function applicableFor(tool: ToolId): Applicability {
  return APPLICABILITY[tool] ?? only({});
}

/**
 * `AnnotationType` → the tool that creates it. **THE ONE COPY.**
 *
 * Two consumers read it and they MUST agree, because they are two halves of one panel:
 *   - `StylePanel.scopeTypeCounts` turns it into the §7.4 #3 scope chip's labels
 *     («Apply to: Rectangle (1) · Image inset (1)») via each tool's `tool.*` name;
 *   - `EditorLayout.applicabilityForSelection` turns it into the §7.4 #4 applicability
 *     intersection (`applicableFor(TOOL_FOR_TYPE[type])` across the selection).
 *
 * It used to be duplicated byte-for-byte in both of those files. `Record<AnnotationType,
 * ToolId>` checks exhaustiveness and value TYPE only — it cannot see that two maps disagree
 * — so e.g. flipping one copy's `highlight` to `'freehand'` would have mislabelled a
 * Highlighter selection in the chip while the applicability intersection still used the
 * `highlight` row, with `tsc`, node, jsdom and browser all green. Session-14 review,
 * finding 7. The values are pinned by `tests/typeToolMap.test.ts`, and that both consumers
 * derive from THIS map (rather than a re-introduced local copy) is asserted there and in
 * `tests/stylePanel.test.tsx`.
 *
 * Copy note: the appendices key no `annotationType.*` strings, and the §7.4 example
 * (`Text`, `Dimension`) names exactly the creating tools, so reusing `tool.*` labels
 * invents no wording.
 */
export const TOOL_FOR_TYPE: Readonly<Record<AnnotationType, ToolId>> = {
  dimension: 'dimension',
  angle: 'angle',
  line: 'line',
  arrow: 'arrow',
  rect: 'rect',
  ellipse: 'ellipse',
  polygon: 'polygon',
  freehand: 'freehand',
  highlight: 'highlight',
  text: 'text',
  image: 'inset',
};

/**
 * A style is "valid for the current tool" (§7.3) when every key it carries AWAY FROM THE
 * DEFAULT is a control that tool exposes. A default-valued key is always valid, so a
 * Dimension style (default `fontSizeMu`/`bold`) still appears in Recents for Dimension
 * even though §7.2 lists no Size control there.
 */
export function isStyleValidForTool(style: AnnotationStyle, tool: ToolId): boolean {
  const applicable = applicableFor(tool);
  for (const key of STYLE_KEYS) {
    if (style[key] !== DEFAULT_STYLE[key] && !applicable[key]) return false;
  }
  return true;
}

/** Dedupe by value and cap at 8; newest-first. Pure — returns a fresh array. */
export function pushRecent(recents: readonly AnnotationStyle[], style: AnnotationStyle): AnnotationStyle[] {
  const rest = recents.filter((entry) => !stylesEqual(entry, style));
  return [{ ...style }, ...rest].slice(0, RECENTS_CAP);
}

/**
 * The Recents row for a tool: deduped, newest-first, filtered to styles valid for `tool`
 * (§7.3), capped at 8. Copies each style so a caller (or the panel) cannot mutate the
 * store's list.
 */
export function recentsForTool(
  recents: readonly AnnotationStyle[],
  tool: ToolId,
): AnnotationStyle[] {
  const out: AnnotationStyle[] = [];
  for (const style of recents) {
    if (!isStyleValidForTool(style, tool)) continue;
    if (out.some((entry) => stylesEqual(entry, style))) continue;
    out.push({ ...style });
    if (out.length >= RECENTS_CAP) break;
  }
  return out;
}

export interface SelectionStyleState {
  mode: 'none' | 'single' | 'mixed';
  /**
   * The shared style. Valid ONLY when `mode === 'single'` (or as the default when
   * `mode === 'none'`). In `mixed` mode this is `DEFAULT_STYLE` — a non-authoritative
   * placeholder, never a merged guess: callers MUST render the indeterminate state and
   * MUST NOT present any key of this object as the selection's value (§7.4 #2).
   */
  style: AnnotationStyle;
}

/** `'mixed'` when the selected objects' styles are not all equal over STYLE_KEYS (§7.4 #2). */
export function selectionStyleState(styles: readonly AnnotationStyle[]): SelectionStyleState {
  if (styles.length === 0) return { mode: 'none', style: { ...DEFAULT_STYLE } };
  const first = styles[0];
  for (let i = 1; i < styles.length; i += 1) {
    if (!stylesEqual(first, styles[i])) return { mode: 'mixed', style: { ...DEFAULT_STYLE } };
  }
  return { mode: 'single', style: { ...first } };
}

/**
 * The scope chip's rows for a heterogeneous selection (§7.4 #3), e.g.
 * `[text: 2, dimension: 1]`. First-appearance order so the chip reads in canvas order,
 * matching the spec's `«Apply to: Text (2) · Dimension (1)»` example.
 */
export function selectionScope(
  anns: readonly { type: AnnotationType }[],
): Array<{ type: AnnotationType; count: number }> {
  const order: AnnotationType[] = [];
  const counts = new Map<AnnotationType, number>();
  for (const ann of anns) {
    const next = (counts.get(ann.type) ?? 0) + 1;
    if (!counts.has(ann.type)) order.push(ann.type);
    counts.set(ann.type, next);
  }
  return order.map((type) => ({ type, count: counts.get(type)! }));
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

export interface StyleByToolState {
  styleByTool: Record<ToolId, AnnotationStyle>;
  /** Newest-first, deduped, capped at 8. The raw list; filter per tool at render (§7.3). */
  recents: AnnotationStyle[];
}

export interface StyleByToolActions {
  /** Merge a patch into one tool's style (the panel's `onChange`). Records a recent. */
  setToolStyle(tool: ToolId, patch: Partial<AnnotationStyle>): void;
  /** Replace one tool's style wholesale (applying a preset / a selection style). Records a recent. */
  replaceToolStyle(tool: ToolId, style: AnnotationStyle): void;
  /** Back to the tool's default style (`toolDefaultStyle`) for one tool (the sheet's `Reset to defaults`). Does not record. */
  resetToolStyle(tool: ToolId): void;
  /** Record a style as used (the shell calls this after applying a style to a selection). */
  recordRecent(style: AnnotationStyle): void;
  /** Back to fresh defaults — every tool + the recents list (test helper / new sheet). */
  resetStyleStore(): void;
}

export type StyleByToolStore = StyleByToolState & StyleByToolActions;

/**
 * A tool's fresh style. D150 (owner request): a dimension starts with slim arrowheads at
 * both ends; every other tool starts from `DEFAULT_STYLE`.
 */
export function toolDefaultStyle(tool: ToolId): AnnotationStyle {
  return tool === 'dimension' ? { ...DEFAULT_STYLE, arrowheads: 'both' } : { ...DEFAULT_STYLE };
}

function defaultRecord(): Record<ToolId, AnnotationStyle> {
  const record = {} as Record<ToolId, AnnotationStyle>;
  for (const tool of TOOL_IDS) record[tool] = toolDefaultStyle(tool);
  return record;
}

/** Fresh defaults — exported so tests can reset the module-global store. */
export function createInitialStyleState(): StyleByToolState {
  return { styleByTool: defaultRecord(), recents: [] };
}

/** The style the next mark from `tool` will use (per-tool memory, §7.4 #6). */
export function styleForTool(state: Pick<StyleByToolState, 'styleByTool'>, tool: ToolId): AnnotationStyle {
  return state.styleByTool[tool] ?? toolDefaultStyle(tool);
}

export const useStyleByTool = create<StyleByToolStore>()(
  immer((set) => ({
    ...createInitialStyleState(),

    setToolStyle: (tool, patch) =>
      set((state) => {
        const next: AnnotationStyle = { ...state.styleByTool[tool], ...patch };
        state.styleByTool[tool] = next;
        state.recents = pushRecent(state.recents, next);
      }),

    replaceToolStyle: (tool, style) =>
      set((state) => {
        const next: AnnotationStyle = { ...style };
        state.styleByTool[tool] = next;
        state.recents = pushRecent(state.recents, next);
      }),

    resetToolStyle: (tool) =>
      set((state) => {
        state.styleByTool[tool] = toolDefaultStyle(tool);
      }),

    recordRecent: (style) =>
      set((state) => {
        state.recents = pushRecent(state.recents, style);
      }),

    resetStyleStore: () =>
      set((state) => {
        state.styleByTool = defaultRecord();
        state.recents = [];
      }),
  })),
);
