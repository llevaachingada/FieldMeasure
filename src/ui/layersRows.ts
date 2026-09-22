/**
 * `src/ui/layersRows.ts` — slice 1.6 wiring: derive the Layers panel's rows from the
 * scene's `Annotation[]`.
 *
 * PURE and Konva-free (it imports the `dimensionLabel` helpers, not `scene.ts`), so the
 * node project can execute it. The panel stays dumb: it renders exactly these rows and
 * only inserts the group headers.
 *
 * Ordering is the shell's job (the panel renders `rows` verbatim, §8.6 "top = front"):
 *   - one band per group, in the §9 order Dimensions → Shapes → Ink → Text → Insets →
 *     Photo;
 *   - within a band, front-most (highest `zIndex`) first;
 *   - an inset's children follow their parent, `indent: 1`, keyed `${parentId}/${childId}`
 *     (§20.1) — never an array index.
 *
 * Names are DERIVED, never stored (AGENTS #2): a dimension is
 * `${editor.eraseNameDimension}` with the derived label interpolated, an inset is
 * `inset.layersName`, the photo row is `layers.groupPhoto`. The photo row is synthetic
 * (it is the sheet's photo, not an `Annotation`) and is never deletable (§20.2).
 */
import type { Annotation } from '@/domain/types';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';
import { derivedDimensionLabel } from '@/editor/shapes/dimensionLabel';
import type { LayerGroup, LayerRow } from './LayersPanel';
import { STRINGS, t } from './strings';

/** The §9 band order (UI §9 tree; photo is the base). */
export const LAYER_GROUP_ORDER: readonly LayerGroup[] = [
  'dimensions',
  'shapes',
  'ink',
  'text',
  'insets',
  'photo',
];

/** The row key of the synthetic photo base. Never an annotation id. */
export const PHOTO_ROW_KEY = 'photo';

/** Annotation type → the panel's band (§9). */
export function layerGroupFor(type: Annotation['type']): LayerGroup {
  switch (type) {
    case 'dimension':
      return 'dimensions';
    case 'line':
    case 'arrow':
    case 'rect':
    case 'ellipse':
    case 'polygon':
    case 'angle':
      return 'shapes';
    case 'freehand':
    case 'highlight':
      return 'ink';
    case 'text':
      return 'text';
    case 'image':
      return 'insets';
  }
}

export interface LayerRowsOptions {
  /** Project label context for the derived dimension name. */
  ctx: LabelContext;
  /** True when a sheet photo is loaded — adds the synthetic, non-deletable photo row. */
  hasPhoto: boolean;
}

/** The derived display name of one annotation. Never stored. */
export function annotationName(ann: Annotation, ctx: LabelContext, insetIndex = 1): string {
  switch (ann.type) {
    case 'dimension': {
      const measurement = derivedDimensionLabel(ann.valueMm, ctx) ?? ann.enteredText ?? '';
      return t(STRINGS.editor.eraseNameDimension, { measurement });
    }
    case 'rect':
      return STRINGS.editor.eraseNameRectangle;
    case 'ellipse':
      return STRINGS.tool.ellipse;
    case 'line':
      return STRINGS.tool.line;
    case 'arrow':
      return STRINGS.tool.arrowLeader;
    case 'polygon':
      return STRINGS.tool.polygon;
    case 'angle':
      return STRINGS.tool.angle;
    case 'freehand':
      return STRINGS.editor.layersNameFreehand;
    case 'highlight':
      return STRINGS.tool.highlighter;
    case 'text':
      return STRINGS.tool.textNote;
    case 'image':
      return t(STRINGS.inset.layersName, { insetName: insetIndex });
  }
}

function rowFor(
  ann: Annotation,
  ctx: LabelContext,
  indent: number,
  insetIndex: number,
  parentId?: string,
): LayerRow {
  return {
    key: parentId ? `${parentId}/${ann.id}` : ann.id,
    name: annotationName(ann, ctx, insetIndex),
    group: layerGroupFor(ann.type),
    indent,
    locked: ann.locked === true,
    // Absent/null = visible (the additive `visible` field's contract).
    visible: ann.visible !== false,
    deletable: true,
  };
}

/** Build the panel rows for a document. */
export function buildLayerRows(annotations: readonly Annotation[], opts: LayerRowsOptions): LayerRow[] {
  const rank = new Map<LayerGroup, number>(LAYER_GROUP_ORDER.map((g, i) => [g, i]));
  const sorted = [...annotations].sort((a, b) => {
    const byGroup = (rank.get(layerGroupFor(a.type)) ?? 0) - (rank.get(layerGroupFor(b.type)) ?? 0);
    if (byGroup !== 0) return byGroup;
    return b.zIndex - a.zIndex; // front-most first ("top = front")
  });

  const rows: LayerRow[] = [];
  let insetIndex = 0;
  for (const ann of sorted) {
    const index = ann.type === 'image' ? ++insetIndex : 0;
    rows.push(rowFor(ann, opts.ctx, 0, index));
    for (const child of ann.children ?? []) {
      rows.push(rowFor(child, opts.ctx, 1, 0, ann.id));
    }
  }

  if (opts.hasPhoto) {
    rows.push({
      key: PHOTO_ROW_KEY,
      name: STRINGS.layers.groupPhoto,
      group: 'photo',
      indent: 0,
      locked: false,
      visible: true,
      deletable: false,
    });
  }

  return rows;
}
