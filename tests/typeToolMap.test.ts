/**
 * tests/typeToolMap.test.ts — session-14 review, finding 7 (node project).
 *
 * TWO THINGS ARE PINNED HERE, both of which were previously unasserted.
 *
 * 1. **The `AnnotationType → ToolId` map has ONE copy, and these are its values.**
 *    `EditorLayout.TOOL_FOR_TYPE` and `StylePanel.TYPE_TOOL` used to be two byte-identical
 *    private objects. `Record<AnnotationType, ToolId>` checks exhaustiveness and value TYPE
 *    only, so flipping one copy's `highlight` to `'freehand'` would have mislabelled the
 *    §7.4 #3 scope chip for a Highlighter selection while the §7.4 #4 applicability
 *    intersection still used the `highlight` row — `tsc`, node, jsdom and browser all green.
 *    The map now lives once in `src/state/styleByTool.ts`; the literal table below is what
 *    fails if anyone changes a row, and `consumers agree` below is what fails if anyone
 *    re-introduces a divergent local copy inside `applicabilityForSelection`.
 *    (The scope chip's half of the same guard is `tests/stylePanel.test.tsx`, because
 *    `scopeTypeCounts` needs the jsdom-side `tool.*` labels.)
 *
 * 2. **The §7.4 #4 intersection's outcome for `image` (an inset), either way.** The
 *    reviewer's executed table is asserted verbatim so the all-disabled panel is a DECIDED
 *    outcome rather than an accident nobody had run. `styleByTool.ts` gives `inset`
 *    `only({})` — faithful to `src/editor/inset/renderInset.ts`, which consumes none of the
 *    8 style keys — so ANY selection containing an inset intersects to nothing enabled.
 *    If the product answer later becomes "fall back to what the non-inset members share",
 *    THIS is the test that must be changed deliberately, with a DECISIONS entry.
 */
import { describe, expect, it } from 'vitest';

import type { AnnotationType } from '../src/domain/types';
import { applicabilityForSelection } from '../src/ui/EditorLayout';
import { STYLE_KEYS, TOOL_FOR_TYPE, applicableFor } from '../src/state/styleByTool';

/** Every member of the `AnnotationType` union (`src/domain/types.ts:9-11`). */
const ALL_TYPES: readonly AnnotationType[] = [
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
  'image',
];

/** The enabled style keys for a selection, as a stable, readable list. */
function enabledFor(types: readonly AnnotationType[]): string[] {
  const scope = types.map((type) => ({ type, count: 1 }));
  const map = applicabilityForSelection('select', scope);
  return STYLE_KEYS.filter((key) => map[key] === true);
}

describe('TOOL_FOR_TYPE is single-sourced and pinned (finding 7)', () => {
  it('maps every annotation type to its creating tool — exact values', () => {
    expect(TOOL_FOR_TYPE).toEqual({
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
      // The one row that is NOT the identity: an inset annotation is `image`, its tool
      // is `inset`. A rename on either side breaks here.
      image: 'inset',
    });
  });

  it('covers the whole AnnotationType union, with no extra keys', () => {
    expect(Object.keys(TOOL_FOR_TYPE).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('consumers agree: applicabilityForSelection derives from THIS map, not a copy', () => {
    // A single-type selection must reproduce that tool's §7.2 row exactly. This fails if
    // `EditorLayout` starts reading a local map whose rows differ from `TOOL_FOR_TYPE`.
    for (const type of ALL_TYPES) {
      const viaSelection = applicabilityForSelection('select', [{ type, count: 1 }]);
      const viaMap = applicableFor(TOOL_FOR_TYPE[type]);
      for (const key of STYLE_KEYS) {
        expect({ type, key, enabled: viaSelection[key] === true }).toEqual({
          type,
          key,
          enabled: viaMap[key] === true,
        });
      }
    }
  });
});

describe('§7.4 #4 applicability intersection — the executed table (finding 7)', () => {
  // D133 (UI/GUI handoff pass) is the deliberate change this file's own header comment
  // (§2) invited: `renderInset.ts` gained a real, rendered control set
  // (`insetBorder`/`insetRadius`/`insetShadow`), so `inset`'s row is no longer
  // `only({})` and a lone inset selection is no longer a dead panel.
  it('an inset alone enables its three D133 controls (border/radius/shadow), nothing else', () => {
    expect(enabledFor(['image'])).toEqual(['insetBorder', 'insetRadius', 'insetShadow']);
  });

  it('Rect + inset enables NOTHING — a truthful scope chip over a dead panel', () => {
    // The §7.4 #3 chip still reads «Apply to: Rectangle (1) · Image inset (1)».
    // Rect alone would enable 5 controls; the inset zeroes all of them.
    expect(enabledFor(['rect'])).toEqual([
      'strokeColor',
      'strokeWidthMu',
      'fillColor',
      'fillAlpha',
      'lineStyle',
    ]);
    expect(enabledFor(['rect', 'image'])).toEqual([]);
    expect(enabledFor(['image', 'rect'])).toEqual([]); // order-independent
  });

  it('non-inset heterogeneous selections still intersect to their shared controls', () => {
    // text: strokeColor + fontSizeMu + bold; rect: strokeColor + width + fill + alpha +
    // lineStyle → shared = strokeColor only.
    expect(enabledFor(['text', 'rect'])).toEqual(['strokeColor']);
    // dimension: strokeColor + strokeWidthMu + arrowheads; angle: strokeColor +
    // strokeWidthMu → shared = the first two.
    expect(enabledFor(['dimension', 'angle'])).toEqual(['strokeColor', 'strokeWidthMu']);
  });

  it('an empty selection falls back to the ACTIVE tool, not to the intersection', () => {
    expect(STYLE_KEYS.filter((key) => applicabilityForSelection('rect', [])[key] === true)).toEqual(
      ['strokeColor', 'strokeWidthMu', 'fillColor', 'fillAlpha', 'lineStyle'],
    );
  });
});
