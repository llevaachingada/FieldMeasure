/**
 * `src/editor/inset/renderInset.ts` — the imperative Konva group for one inset (§8.5).
 *
 * THE MODEL — do not flatten any of it:
 *   group.clipFunc(ctx => ctx.rect(0, 0, crop.width, crop.height))
 *   group.offset    = (crop.width / 2, crop.height / 2)   ← LOCAL crop-window units
 *   group.position  = (x + width / 2, y + height / 2)     ← rotation pivots on the centre
 *   group.scale     = (width / crop.width, height / crop.height)
 *   asset.position  = (-crop.x, -crop.y)
 *   every child     = the SAME (-crop.x, -crop.y) offset
 *
 * Group-local origin = the crop window's top-left, so an asset point `(ax, ay)` renders
 * at group-local `(ax - crop.x, ay - crop.y)` — and so does a child stored at asset px.
 * Without the child offset, moving the crop window detaches children from the photo.
 *
 * The children are built by the CALLER (`renderChild`) with the same renderers a
 * top-level annotation uses, so a child dimension gets the identical §4.2 screen rules.
 * The child's own nodes stay at their asset coordinates; only the wrapper moves.
 *
 * Verified against Konva 10.6: `Container._drawChildren` applies the node's own absolute
 * transform *before* calling `clipFunc`, so the clip rect really is in node-local
 * (crop-window) units and the parent scale maps it to the placed rect.
 */
import Konva from 'konva';
import type { Annotation, AnnotationStyle } from '@/domain/types';
import type { AssetSize, Rect } from './insetGeometry';
import type { InsetImageGeometry } from './insetGeometry';
import { insetTransform } from './insetGeometry';

/** D133: `--g700`/Site Slate hairline, reused rather than inventing a new inset-only token. */
const INSET_BORDER_COLOR = '#2B3540';
const INSET_BORDER_WIDTH = 2;

/** A decoded asset ready to draw, plus its working-image dimensions. */
export interface InsetAssetImage {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface RenderInsetInput {
  id: string;
  geometry: InsetImageGeometry;
  crop: Rect;
  /** `null` renders the "Loading photo…" placeholder (UI §9:611). */
  asset: InsetAssetImage | null;
  /** Children in asset px; sorted by their own `zIndex` before rendering. */
  children: readonly Annotation[];
  /** Build a child with the scene's normal renderer (never an inset — one level). */
  renderChild: (child: Annotation) => Konva.Group;
  locked?: boolean;
  /** §8.5: a `--g750` placeholder fill while the asset decodes. */
  placeholderFill?: string;
  /** D133: border/corner-radius/shadow, the three previously data-channel-less inset
   *  controls (`AnnotationStyle.insetBorder/insetRadius/insetShadow`). */
  style?: AnnotationStyle;
}

/** The clip/border corner radius in CROP-WINDOW units, clamped so it never exceeds a
 *  half-edge (a radius bigger than that self-intersects the rounded-rect path). */
function clampedRadius(style: AnnotationStyle | undefined, crop: Rect): number {
  const requested = style?.insetRadius;
  if (typeof requested !== 'number' || requested <= 0) return 0;
  return Math.min(requested, crop.width / 2, crop.height / 2);
}

/**
 * Build the inset's Konva group. Node attrs (`annotationId`, `kind`, `locked`) are the
 * same contract every other renderer follows, so `EditorCanvas.hitObject` resolves an
 * inset the same way it resolves a shape, and a child resolves to the child id.
 */
export function buildInsetGroup(input: RenderInsetInput): Konva.Group {
  const { geometry, crop, style } = input;
  const t = insetTransform(geometry, crop);
  const radius = clampedRadius(style, crop);

  // UNCHANGED from before D133: one group, the clip stays on IT, and every child —
  // image/placeholder, the inset's own children, the new shadow/border — is a DIRECT
  // member. `tests/insetWire.browser.test.ts` pins "a child's parent is this exact
  // node" as the §8.5 containment contract, so `insetShadow`/`insetBorder` are scoped
  // to what a clipped sibling can honestly do: `insetShadow` reads as an inward vignette
  // near the edges (a real drop shadow needs to bleed OUTSIDE the clip, which nothing in
  // this group can do without breaking that contract), and the border rect is inset by
  // half its stroke width so the WHOLE stroke stays inside the clip (a centred Konva
  // stroke would otherwise lose its outer half to the clip).
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', input.id);
  group.setAttr('kind', 'image');
  group.setAttr('locked', input.locked ?? false);

  group.offset({ x: t.offsetX, y: t.offsetY });
  group.position({ x: t.positionX, y: t.positionY });
  group.scale({ x: t.scaleX, y: t.scaleY });
  group.rotation(t.rotation);
  group.clipFunc((ctx) => {
    if (radius > 0) ctx.roundRect(0, 0, crop.width, crop.height, radius);
    else ctx.rect(0, 0, crop.width, crop.height);
  });

  if (style?.insetShadow) {
    // A radial vignette, transparent in the middle and darkening toward the edges —
    // the honest version of a "shadow" a clipped sibling can draw (see the note above).
    // The outer radius reaches the corners so the dark reads on all four sides, not
    // just a fringe on the shorter axis.
    const centerX = crop.width / 2;
    const centerY = crop.height / 2;
    const outerRadius = Math.hypot(centerX, centerY);
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: crop.width,
        height: crop.height,
        cornerRadius: radius,
        fillRadialGradientStartPoint: { x: centerX, y: centerY },
        fillRadialGradientStartRadius: outerRadius * 0.55,
        fillRadialGradientEndPoint: { x: centerX, y: centerY },
        fillRadialGradientEndRadius: outerRadius,
        fillRadialGradientColorStops: [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.4)'],
        listening: false,
      }),
    );
  }

  // The asset image, drawn at its own asset px, scrolled into view by -crop.
  if (input.asset) {
    const asset: AssetSize = { width: input.asset.width, height: input.asset.height };
    // `flipX/flipY` mirror the PHOTO content, not the markup: the children are never
    // rewritten when a photo property changes (§8.5:1797).
    const flipX = geometry.flipX === true;
    const flipY = geometry.flipY === true;
    const image = new Konva.Image({
      image: input.asset.image,
      width: asset.width,
      height: asset.height,
      // With scaleX=-1 an x of `asset.width - crop.x` covers [-crop.x, asset.width-crop.x].
      x: flipX ? asset.width - crop.x : -crop.x,
      y: flipY ? asset.height - crop.y : -crop.y,
      scaleX: flipX ? -1 : 1,
      scaleY: flipY ? -1 : 1,
      listening: false,
    });
    group.add(image);
  } else {
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: crop.width,
        height: crop.height,
        fill: input.placeholderFill ?? '#3A3F46',
        listening: false,
      }),
    );
  }

  // Children: same -crop offset as the asset; own z-order inside the group (never the
  // sheet's §20.2 z-bands — a child is not a sheet-band member).
  const ordered = [...input.children].sort((a, b) => a.zIndex - b.zIndex);
  for (const child of ordered) {
    const childGroup = input.renderChild(child);
    childGroup.position({ x: -crop.x, y: -crop.y });
    group.add(childGroup);
  }

  // D133: drawn LAST (on top of the image/children) and inset by half its own stroke
  // width on every side — a Konva stroke is CENTRED on the path, so an un-inset border
  // at the crop bounds would have its outer half clipped away by `clipFunc` above.
  if (style?.insetBorder) {
    const half = INSET_BORDER_WIDTH / 2;
    group.add(
      new Konva.Rect({
        x: half,
        y: half,
        width: Math.max(0, crop.width - INSET_BORDER_WIDTH),
        height: Math.max(0, crop.height - INSET_BORDER_WIDTH),
        cornerRadius: Math.max(0, radius - half),
        stroke: INSET_BORDER_COLOR,
        strokeWidth: INSET_BORDER_WIDTH,
        listening: false,
      }),
    );
  }

  if (geometry.opacity !== undefined && geometry.opacity !== null) {
    group.opacity(geometry.opacity);
  }
  return group;
}
