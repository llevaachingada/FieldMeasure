/**
 * `tests/layersRows.test.ts` — slice 1.6 wiring A1 (node project).
 *
 * The Layers panel is props-driven and already tested (`layersPanel.test.tsx`). This
 * file proves the SHELL's side: the rows it derives from the scene's `Annotation[]`.
 *
 * Pure, no Konva (D40 does not apply — there is no stage here), so it runs in `node`:
 *   - one band per group in the §9 order, front-most first within a band;
 *   - an inset child is indented 1 and keyed `${parentId}/${childId}` (§20.1);
 *   - names are DERIVED (no stored label / name — AGENTS #2);
 *   - the photo row is synthetic and never deletable (§20.2);
 *   - the additive `visible` field survives the `MarkupFileZ` round-trip, and its
 *     absence still parses (no migration bump).
 */
import { describe, expect, it } from 'vitest';

import type { Annotation } from '../src/domain/types';
import { DEFAULT_STYLE } from '../src/domain/types';
import { parseMarkupFile } from '../src/domain/schema';
import {
  LAYER_GROUP_ORDER,
  PHOTO_ROW_KEY,
  annotationName,
  buildLayerRows,
  layerGroupFor,
} from '../src/ui/layersRows';
import type { LabelContext } from '../src/editor/shapes/dimensionLabel';
import { derivedDimensionLabel } from '../src/editor/shapes/dimensionLabel';

const CTX: LabelContext = { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 };

let n = 0;
function ann(partial: Partial<Annotation> & Pick<Annotation, 'type' | 'geometry'>): Annotation {
  n += 1;
  return {
    id: `ann-${n}`,
    valueMm: null,
    enteredText: null,
    style: { ...DEFAULT_STYLE },
    zIndex: 1000 + n * 10,
    source: 'manual',
    assetId: null,
    groupId: null,
    locked: false,
    ...partial,
  } as Annotation;
}

describe('layerGroupFor — the §9 band map', () => {
  it('maps every annotation kind to its band', () => {
    expect(layerGroupFor('dimension')).toBe('dimensions');
    expect(layerGroupFor('rect')).toBe('shapes');
    expect(layerGroupFor('line')).toBe('shapes');
    expect(layerGroupFor('freehand')).toBe('ink');
    expect(layerGroupFor('highlight')).toBe('ink');
    expect(layerGroupFor('text')).toBe('text');
    expect(layerGroupFor('image')).toBe('insets');
  });
});

describe('buildLayerRows — bands, order and indentation', () => {
  it('groups by band in the §9 order and sorts front-most first within a band', () => {
    const front = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 }, zIndex: 1200 });
    const back = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 10, height: 10 }, zIndex: 1010 });
    const dim = ann({ type: 'dimension', geometry: { kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, zIndex: 1100 });
    const ink = ann({ type: 'freehand', geometry: { kind: 'freehand', points: [], pressure: [] }, zIndex: 0 });

    const rows = buildLayerRows([front, back, dim, ink], { ctx: CTX, hasPhoto: false });
    // dimensions band, then shapes band (front first), then ink; `ink` is the lower band.
    expect(rows.map((r) => r.group)).toEqual(['dimensions', 'shapes', 'shapes', 'ink']);
    expect(rows[1].key).toBe(front.id);
    expect(rows[2].key).toBe(back.id);
  });

  it('keys rows by annotation id, never an array index', () => {
    const a = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 } });
    const rows = buildLayerRows([a], { ctx: CTX, hasPhoto: false });
    expect(rows[0].key).toBe(a.id);
  });

  it('indents an inset child and keys it `${parentId}/${childId}`', () => {
    const child = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 } });
    const inset = ann({
      type: 'image',
      geometry: { kind: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      children: [child],
    });
    const rows = buildLayerRows([inset], { ctx: CTX, hasPhoto: false });
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe(inset.id);
    expect(rows[0].indent).toBe(0);
    expect(rows[1].key).toBe(`${inset.id}/${child.id}`);
    expect(rows[1].indent).toBe(1);
    expect(rows[1].group).toBe('shapes');
  });

  it('appends the synthetic photo row last and makes it non-deletable', () => {
    const a = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 } });
    const rows = buildLayerRows([a], { ctx: CTX, hasPhoto: true });
    const photo = rows[rows.length - 1];
    expect(photo.key).toBe(PHOTO_ROW_KEY);
    expect(photo.group).toBe('photo');
    expect(photo.deletable).toBe(false);
    expect(photo.name).toBe('Photo');
    expect(rows[0].deletable).toBe(true);
  });

  it('treats absent/null `visible` as visible and false as hidden', () => {
    const shown = ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 } });
    const hidden = ann({
      type: 'rect',
      geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 },
      visible: false,
    });
    const rows = buildLayerRows([shown, hidden], { ctx: CTX, hasPhoto: false });
    expect(rows.find((r) => r.key === shown.id)?.visible).toBe(true);
    expect(rows.find((r) => r.key === hidden.id)?.visible).toBe(false);
  });

  it('carries the lock state used by the panel', () => {
    const locked = ann({
      type: 'rect',
      geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 },
      locked: true,
    });
    const rows = buildLayerRows([locked], { ctx: CTX, hasPhoto: false });
    expect(rows[0].locked).toBe(true);
  });

  it('LAYER_GROUP_ORDER is the §9 band order', () => {
    expect(LAYER_GROUP_ORDER).toEqual(['dimensions', 'shapes', 'ink', 'text', 'insets', 'photo']);
  });
});

describe('annotationName — derived, never stored', () => {
  it('derives a dimension name from valueMm (the renderer derivation)', () => {
    const valueMm = 3810; // 12.5 ft = 150 in = 3810 mm exactly
    const d = ann({
      type: 'dimension',
      geometry: { kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      valueMm,
    });
    const label = derivedDimensionLabel(valueMm, CTX)!;
    expect(label).toBe(`12'-6"`);
    expect(annotationName(d, CTX)).toBe(`Dimension ${label}`);
  });

  it('falls back to enteredText when there is no value yet', () => {
    const d = ann({
      type: 'dimension',
      geometry: { kind: 'dimension', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      valueMm: null,
      enteredText: `3'-0"`,
    });
    expect(annotationName(d, CTX)).toBe(`Dimension 3'-0"`);
  });

  it('uses the appendix names for the other kinds', () => {
    expect(annotationName(ann({ type: 'rect', geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 } }), CTX)).toBe('Rectangle');
    expect(annotationName(ann({ type: 'freehand', geometry: { kind: 'freehand', points: [], pressure: [] } }), CTX)).toBe('Freehand');
    expect(annotationName(ann({ type: 'image', geometry: { kind: 'image', x: 0, y: 0, width: 1, height: 1, rotation: 0 } }), CTX, 2)).toBe('Inset 2');
  });
});

describe('the additive `visible` field round-trips through MarkupFileZ', () => {
  it('parses an object with `visible: false`', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      sheetId: 's',
      objects: [
        {
          id: 'a1',
          type: 'rect',
          geometry: { kind: 'rect', x: 0, y: 0, width: 1, height: 1 },
          valueMm: null,
          valueDeg: null,
          enteredText: null,
          style: { ...DEFAULT_STYLE },
          zIndex: 1000,
          source: 'manual',
          assetId: null,
          groupId: null,
          locked: false,
          visible: false,
        },
      ],
    });
    const res = parseMarkupFile(raw);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.objects[0].visible).toBe(false);
  });

  it('still parses a pre-`visible` markup.json (absent = undefined, no migration bump)', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      sheetId: 's',
      objects: [
        {
          id: 'a1',
          type: 'line',
          geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
          style: { ...DEFAULT_STYLE },
          zIndex: 1000,
          source: 'manual',
          locked: false,
        },
      ],
    });
    const res = parseMarkupFile(raw);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.objects[0].visible).toBeUndefined();
  });
});
