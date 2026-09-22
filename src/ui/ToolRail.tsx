/**
 * `src/ui/ToolRail.tsx` — the vertical tool rail (implementation plan slice 1.4.5,
 * build order step 2; build spec §11.4, UI spec §5.1 / §6.1–§6.6).
 *
 * 14 tools in 6 fixed groups, 2-column grid, bottom-anchored, undo/redo at the very
 * bottom (UI §5.1: they live under the drawing hand and are NOT duplicated in the
 * top bar — this is why this slice does not render them in `TopBar`).
 *
 *   - 56 px square targets with 8 px gaps (UI §14.5: 56 ≥ the 48 px touch floor,
 *     and the rail's own 128 px = 4 + 56 + 8 + 56 + 4).
 *   - The **side** is handedness only (UI §5.1/§14.8): right-handed → rail on the
 *     right; left-handed → mirrored to the left. Rotation never moves the rail
 *     (muscle memory, §5.3) — `side` is a prop and never derived from the viewport.
 *   - Selecting a tool whose `implemented` flag is false is a **no-op**: it neither
 *     changes `activeTool` nor throws. That is what lets 1.5–1.8 land one tool at a
 *     time against a rail that already exists.
 *
 * `TOOL_DEFS` is the frozen table other lanes and slice 1.5 depend on: exactly 14
 * entries, groups 1–6, unique ids, copy present for each.
 *
 * Presentation only: the rail takes `activeTool` + `onSelectTool` and never reads a
 * store, so it is independently testable.
 */
import { useEffect, useRef, useState, type FC, type KeyboardEvent } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import ToolSelectIcon from './icons/tools/ToolSelectIcon';
import ToolPanIcon from './icons/tools/ToolPanIcon';
import ToolDimensionIcon from './icons/tools/ToolDimensionIcon';
import ToolAngleIcon from './icons/tools/ToolAngleIcon';
import ToolLineIcon from './icons/tools/ToolLineIcon';
import ToolArrowIcon from './icons/tools/ToolArrowIcon';
import ToolRectIcon from './icons/tools/ToolRectIcon';
import ToolEllipseIcon from './icons/tools/ToolEllipseIcon';
import ToolPolygonIcon from './icons/tools/ToolPolygonIcon';
import ToolFreehandIcon from './icons/tools/ToolFreehandIcon';
import ToolHighlighterIcon from './icons/tools/ToolHighlighterIcon';
import ToolTextIcon from './icons/tools/ToolTextIcon';
import ToolInsetIcon from './icons/tools/ToolInsetIcon';
import ToolEraseIcon from './icons/tools/ToolEraseIcon';
import { STRINGS } from './strings';

/** The 14 tools (build spec §10 / UI §6.1). */
export type ToolId =
  | 'select'
  | 'dimension'
  | 'angle'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'freehand'
  | 'highlight'
  | 'text'
  | 'inset'
  | 'erase'
  | 'pan';

/** One rail entry. `group` 1–6; `implemented` gates whether selecting it is allowed. */
export interface ToolDef {
  id: ToolId;
  group: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  Icon: FC;
  implemented: boolean;
}

/** Groups in canonical order (1 = MOVE … 6 = ERASE). */
export const TOOL_GROUPS = [1, 2, 3, 4, 5, 6] as const;

/** Group headers (UI §6.1; approved `toolRail.group*` copy). */
export const GROUP_HEADERS: Record<ToolDef['group'], string> = {
  1: STRINGS.toolRail.groupMove,
  2: STRINGS.toolRail.groupMeasure,
  3: STRINGS.toolRail.groupMark,
  4: STRINGS.toolRail.groupAnnotate,
  5: STRINGS.toolRail.groupInsert,
  6: STRINGS.toolRail.groupErase,
};

/**
 * The frozen tool table — **exactly 14 tools, 6 groups, unique ids**.
 *
 * Only `select` and `pan` are `implemented` in slice 1.4.5; slice 1.5 flips
 * `dimension`. Every other entry is present, labelled and inert on purpose.
 */
export const TOOL_DEFS: readonly ToolDef[] = [
  { id: 'select', group: 1, label: STRINGS.tool.select, Icon: ToolSelectIcon, implemented: true },
  { id: 'pan', group: 1, label: STRINGS.tool.panZoom, Icon: ToolPanIcon, implemented: true },
  { id: 'dimension', group: 2, label: STRINGS.tool.dimension, Icon: ToolDimensionIcon, implemented: true },
  { id: 'angle', group: 2, label: STRINGS.tool.angle, Icon: ToolAngleIcon, implemented: false },
  { id: 'line', group: 3, label: STRINGS.tool.line, Icon: ToolLineIcon, implemented: false },
  { id: 'arrow', group: 3, label: STRINGS.tool.arrowLeader, Icon: ToolArrowIcon, implemented: false },
  { id: 'rect', group: 3, label: STRINGS.tool.rectangle, Icon: ToolRectIcon, implemented: false },
  { id: 'ellipse', group: 3, label: STRINGS.tool.ellipse, Icon: ToolEllipseIcon, implemented: false },
  { id: 'polygon', group: 3, label: STRINGS.tool.polygon, Icon: ToolPolygonIcon, implemented: false },
  { id: 'freehand', group: 4, label: STRINGS.tool.freehand, Icon: ToolFreehandIcon, implemented: false },
  { id: 'highlight', group: 4, label: STRINGS.tool.highlighter, Icon: ToolHighlighterIcon, implemented: false },
  { id: 'text', group: 4, label: STRINGS.tool.textNote, Icon: ToolTextIcon, implemented: false },
  { id: 'inset', group: 5, label: STRINGS.tool.imageInset, Icon: ToolInsetIcon, implemented: false },
  { id: 'erase', group: 6, label: STRINGS.tool.erase, Icon: ToolEraseIcon, implemented: false },
];

/** Look one tool up by id. */
export function toolDefById(id: ToolId): ToolDef | undefined {
  return TOOL_DEFS.find((def) => def.id === id);
}

/**
 * Keyboard shortcuts (UI §6.6). `V` Select · `H` Pan · `D` Dimension · `G` Angle ·
 * `L` Line · `A` Arrow · `R` Rectangle · `C` Ellipse · `P` Polygon · `B` Freehand ·
 * `X` Highlighter · `T` Text · `I` Inset · `E` Erase.
 */
export const TOOL_HOTKEYS: Readonly<Record<string, ToolId>> = {
  V: 'select',
  H: 'pan',
  D: 'dimension',
  G: 'angle',
  L: 'line',
  A: 'arrow',
  R: 'rect',
  C: 'ellipse',
  P: 'polygon',
  B: 'freehand',
  X: 'highlight',
  T: 'text',
  I: 'inset',
  E: 'erase',
};

export interface ToolRailProps {
  activeTool: ToolId;
  /** Called only for tools with `implemented: true`. */
  onSelectTool: (id: ToolId) => void;
  /** Handedness only — never the viewport (UI §5.1/§5.3). */
  side: 'left' | 'right';
  /** Slice 1.5 supplies these; absent = the button renders disabled (no history yet). */
  onUndo?: () => void;
  onRedo?: () => void;
}

const ARROW_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

/** Visual top→bottom = group 6 → group 1 (UI §6.2: bottom-anchored, reading upward). */
const RAIL_GROUP_ORDER: readonly ToolDef['group'][] = [6, 5, 4, 3, 2, 1];

export default function ToolRail({ activeTool, onSelectTool, side, onUndo, onRedo }: ToolRailProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // Roving tabindex: one tab stop for the whole toolbar; arrows move focus.
  const [focusIndex, setFocusIndex] = useState<number>(() => {
    const i = TOOL_DEFS.findIndex((d) => d.id === activeTool);
    return i < 0 ? 0 : i;
  });

  // Roving tabindex follows the active tool, so Tab lands on the held tool.
  useEffect(() => {
    const i = TOOL_DEFS.findIndex((d) => d.id === activeTool);
    if (i >= 0) setFocusIndex(i);
  }, [activeTool]);

  function buttons(): HTMLButtonElement[] {
    return Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>('[data-tool]') ?? []);
  }

  function onToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!ARROW_KEYS.includes(event.key)) return;
    const items = buttons();
    if (items.length === 0) return;
    let index = items.findIndex((b) => b === document.activeElement);
    if (index < 0) {
      index = items.findIndex((b) => b.getAttribute('data-tool') === activeTool);
    }
    if (index < 0) index = 0;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else next = items.length - 1; // End
    event.preventDefault();
    setFocusIndex(next);
    items[next]?.focus();
  }

  return (
    <aside className="tool-rail" data-side={side} data-testid="tool-rail" aria-label={STRINGS.a11y.toolRail}>
      <div
        ref={toolbarRef}
        className="tool-rail-groups"
        role="toolbar"
        aria-label={STRINGS.a11y.toolRail}
        aria-orientation="vertical"
        onKeyDown={onToolbarKeyDown}
      >
        {RAIL_GROUP_ORDER.map((group) => {
          const tools = TOOL_DEFS.filter((def) => def.group === group);
          const needsWell = tools.length % 2 === 1;
          return (
            <section className="tool-group" key={group} data-group={group}>
              <h2 className="tool-group-header">{GROUP_HEADERS[group]}</h2>
              <div className="tool-grid">
                {tools.map((def) => {
                  const isActive = def.id === activeTool;
                  const defIndex = TOOL_DEFS.indexOf(def);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      data-tool={def.id}
                      data-implemented={def.implemented ? 'true' : 'false'}
                      className={isActive ? 'tool-button is-active' : 'tool-button'}
                      aria-label={def.label}
                      aria-pressed={isActive}
                      tabIndex={defIndex === focusIndex ? 0 : -1}
                      onClick={() => {
                        // The unimplemented no-op lives HERE as well as in the layout,
                        // so a bare rail cannot change the tool either.
                        if (!def.implemented) return;
                        onSelectTool(def.id);
                      }}
                    >
                      <span className="tool-button-icon">
                        <def.Icon />
                      </span>
                    </button>
                  );
                })}
                {/* Empty cell = a flat well (UI §6.2), never a disabled button. */}
                {needsWell ? <span className="tool-well" aria-hidden="true" /> : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="tool-rail-history">
        <button
          type="button"
          className="rail-history-button"
          aria-label={STRINGS.a11y.undo}
          disabled={!onUndo}
          onClick={onUndo}
        >
          <Undo2 aria-hidden="true" />
          <span className="rail-history-label">{STRINGS.a11y.undo}</span>
        </button>
        <button
          type="button"
          className="rail-history-button"
          aria-label={STRINGS.a11y.redo}
          disabled={!onRedo}
          onClick={onRedo}
        >
          <Redo2 aria-hidden="true" />
          <span className="rail-history-label">{STRINGS.a11y.redo}</span>
        </button>
      </div>
    </aside>
  );
}
