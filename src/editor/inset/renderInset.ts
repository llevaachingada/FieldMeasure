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
import type { Annotation } from '@/domain/types';
import type { AssetSize, Rect } from './insetGeometry';
import type { InsetImageGeometry } from './insetGeometry';
import { insetTransform } from './insetGeometry';

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
}

/**
 * Build the inset's Konva group. Node attrs (`annotationId`, `kind`, `locked`) are the
 * same contract every other renderer follows, so `EditorCanvas.hitObject` resolves an
 * inset the same way it resolves a shape, and a child resolves to the child id.
 */
export function buildInsetGroup(input: RenderInsetInput): Konva.Group {
  const { geometry, crop } = input;
  const t = insetTransform(geometry, crop);
  const group = new Konva.Group({ listening: true });
  group.setAttr('annotationId', input.id);
  group.setAttr('kind', 'image');
  group.setAttr('locked', input.locked ?? false);

  group.offset({ x: t.offsetX, y: t.offsetY });
  group.position({ x: t.positionX, y: t.positionY });
  group.scale({ x: t.scaleX, y: t.scaleY });
  group.rotation(t.rotation);
  group.clipFunc((ctx) => {
    ctx.rect(0, 0, crop.width, crop.height);
  });

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

  if (geometry.opacity !== undefined && geometry.opacity !== null) {
    group.opacity(geometry.opacity);
  }
  return group;
}
