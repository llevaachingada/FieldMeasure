/**
 * `src/editor/inset/insetGeometry.ts` — the §8.5 inset **coordinate model**, pure.
 *
 * This is the module the whole slice exists for. If it is flattened, measurements land
 * on the wrong part of the photo — silently. Nothing here imports Konva or touches the
 * DOM (D40: it is node-testable), and nothing here stores screen pixels (AGENTS #1).
 *
 * THE MODEL (build spec §8.5, DECISIONS D12 session-3 hardening)
 *   `geometry` (the `image` kind) is in SHEET working-image px:
 *     `x, y`      — the placed rect's top-left
 *     `width,height` — the placed size
 *     `rotation`  — degrees about the PLACED RECT CENTRE
 *     `crop`      — a rect in ASSET px; defaults to the full asset
 *   `children` are `Annotation`s whose geometry is in ASSET px — identical semantics to
 *   a top-level sheet, one level deep. They are NEVER rewritten when the inset moves,
 *   scales, rotates or crops; only the window over them moves.
 *
 * The Konva group (see `renderInset.ts`) is:
 *   offset   = (crop.width / 2, crop.height / 2)          ← LOCAL crop-window units
 *   position = (geometry.x + width / 2, geometry.y + height / 2)
 *   scale    = (width / crop.width, height / crop.height)
 *   clipFunc = ctx.rect(0, 0, crop.width, crop.height)
 *   asset    = position (-crop.x, -crop.y)                 (drawn at asset px size)
 *   every child = the SAME -crop offset
 *
 * Konva's node transform is `T(position) · R(rotation) · S(scale) · T(-offset)`, i.e.
 *     sheet = position + R(rotation) · (scale ⊙ (local − offset))
 * `insetLocalToSheet` / `sheetToInsetLocal` below reproduce exactly that, so the pure
 * model and the rendered node cannot disagree without a test failing.
 */
import type { Geometry, Px } from '@/domain/types';

/** The `image` arm of `Geometry` — the only geometry an inset has. */
export type InsetImageGeometry = Extract<Geometry, { kind: 'image' }>;

/** A rect in ASSET px (crop window) or in any px space the caller names. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Asset working-image dimensions (fixed at insert; §7.1 / §8.5). */
export interface AssetSize {
  width: number;
  height: number;
}

/** Corner scale handles; edge handles adjust the crop window; `rotate` is the handle. */
export type InsetHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface InsetHandle {
  id: InsetHandleId;
  /** SHEET working-image px. */
  p: Px;
}

/** UI §9:618 — default placement is 40% of the sheet width, aspect preserved. */
export const DEFAULT_INSET_FRACTION = 0.4;
/** UI §9:615 — multi-select cascades each placement 24 px down-right. */
export const CASCADE_STEP_PX = 24;
/** A placed inset can never be scaled/cropped to nothing (a 0-size rect is un-hittable). */
export const MIN_INSET_SHEET_PX = 16;
/** The smallest crop window, in asset px (a 0-asset-px window has no content). */
export const MIN_CROP_ASSET_PX = 1;
/** The rotate handle's screen gap above the top edge (× 1/scale for sheet px). */
export const ROTATE_HANDLE_GAP_PX = 48;
/** §8.5 / UI §9:621 — rotate snaps to 0 / 90 / 180 (and 270). */
export const ROTATE_STOPS = [0, 90, 180, 270] as const;
export const ROTATE_SNAP_TOLERANCE_DEG = 7.5;

const DEG = Math.PI / 180;
const CORNER_VEC: Record<'nw' | 'ne' | 'se' | 'sw', Px> = {
  nw: { x: -0.5, y: -0.5 },
  ne: { x: 0.5, y: -0.5 },
  se: { x: 0.5, y: 0.5 },
  sw: { x: -0.5, y: 0.5 },
};

/* ------------------------------------------------------------------ *
 * Crop + transform
 * ------------------------------------------------------------------ */

/** The crop window in asset px. Absent `crop` means the full asset (§8.5). */
export function cropOf(geometry: InsetImageGeometry, asset: AssetSize): Rect {
  return geometry.crop
    ? { ...geometry.crop }
    : { x: 0, y: 0, width: asset.width, height: asset.height };
}

export interface InsetTransform {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  positionX: number;
  positionY: number;
  rotation: number;
}

/** The exact Konva node parameters for a placed inset (§8.5). */
export function insetTransform(geometry: InsetImageGeometry, crop: Rect): InsetTransform {
  return {
    offsetX: crop.width / 2,
    offsetY: crop.height / 2,
    scaleX: geometry.width / crop.width,
    scaleY: geometry.height / crop.height,
    positionX: geometry.x + geometry.width / 2,
    positionY: geometry.y + geometry.height / 2,
    rotation: geometry.rotation,
  };
}

/* ------------------------------------------------------------------ *
 * Point mapping — group-local (crop-window) ⇄ sheet ⇄ asset
 * ------------------------------------------------------------------ */

/** Group-local (crop-window) px → sheet px (replicates the Konva node transform). */
export function insetLocalToSheet(local: Px, geometry: InsetImageGeometry, crop: Rect): Px {
  const t = insetTransform(geometry, crop);
  const dx = t.scaleX * (local.x - t.offsetX);
  const dy = t.scaleY * (local.y - t.offsetY);
  const c = Math.cos(t.rotation * DEG);
  const s = Math.sin(t.rotation * DEG);
  return { x: t.positionX + dx * c - dy * s, y: t.positionY + dx * s + dy * c };
}

/**
 * Sheet px → group-local (crop-window) px. This is the inverse transform; note it lands
 * in **crop-window space, not asset space** (§8.5 hit-testing).
 */
export function sheetToInsetLocal(sheet: Px, geometry: InsetImageGeometry, crop: Rect): Px {
  const t = insetTransform(geometry, crop);
  const vx = sheet.x - t.positionX;
  const vy = sheet.y - t.positionY;
  const c = Math.cos(t.rotation * DEG);
  const s = Math.sin(t.rotation * DEG);
  const dx = vx * c + vy * s;
  const dy = -vx * s + vy * c;
  return { x: t.offsetX + dx / t.scaleX, y: t.offsetY + dy / t.scaleY };
}

/** Group-local (crop-window) px → asset px: `asset = local + crop` (§8.5, D12). */
export function insetLocalToAsset(local: Px, crop: Rect): Px {
  return { x: local.x + crop.x, y: local.y + crop.y };
}

/** Asset px → group-local (crop-window) px: the shared `-crop` offset (§8.5, D12). */
export function assetToInsetLocal(asset: Px, crop: Rect): Px {
  return { x: asset.x - crop.x, y: asset.y - crop.y };
}

/** Sheet px → asset px (hit-test / child creation path). */
export function sheetToAsset(sheet: Px, geometry: InsetImageGeometry, crop: Rect): Px {
  return insetLocalToAsset(sheetToInsetLocal(sheet, geometry, crop), crop);
}

/** Asset px → sheet px (where a child stored at this asset point renders). */
export function assetToSheet(asset: Px, geometry: InsetImageGeometry, crop: Rect): Px {
  return insetLocalToSheet(assetToInsetLocal(asset, crop), geometry, crop);
}

/** Is a group-local point inside the crop window? (clip includes the boundary) */
export function localInsideCrop(local: Px, crop: Rect): boolean {
  return local.x >= 0 && local.x <= crop.width && local.y >= 0 && local.y <= crop.height;
}

/** Hit-test: is a sheet point inside the placed, clipped inset? */
export function insetContains(sheet: Px, geometry: InsetImageGeometry, crop: Rect): boolean {
  return localInsideCrop(sheetToInsetLocal(sheet, geometry, crop), crop);
}

/** The four placed-rect corners in sheet px, rotation applied (clockwise from nw). */
export function insetCorners(geometry: InsetImageGeometry): [Px, Px, Px, Px] {
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const hw = geometry.width / 2;
  const hh = geometry.height / 2;
  const c = Math.cos(geometry.rotation * DEG);
  const s = Math.sin(geometry.rotation * DEG);
  const corner = (lx: number, ly: number): Px => ({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
  return [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
}

/* ------------------------------------------------------------------ *
 * Handles (§9:621 — corners scale, edges crop, one rotate)
 * ------------------------------------------------------------------ */

export const INSET_HANDLE_IDS: readonly InsetHandleId[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'rotate',
];

/** All 9 handle positions in sheet px. `rotateGapSheetPx` is the rotate arm length. */
export function insetHandlePositions(
  geometry: InsetImageGeometry,
  rotateGapSheetPx = ROTATE_HANDLE_GAP_PX,
): InsetHandle[] {
  const corners = insetCorners(geometry);
  const [nw, ne, se, sw] = corners;
  const mid = (a: Px, b: Px): Px => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // The rotate handle sits on the local −y axis, so it must follow rotation.
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const c = Math.cos(geometry.rotation * DEG);
  const s = Math.sin(geometry.rotation * DEG);
  const arm = geometry.height / 2 + rotateGapSheetPx;
  const rotate: Px = { x: cx - arm * s, y: cy - arm * c };
  return [
    { id: 'nw', p: nw },
    { id: 'n', p: mid(nw, ne) },
    { id: 'ne', p: ne },
    { id: 'e', p: mid(ne, se) },
    { id: 'se', p: se },
    { id: 's', p: mid(se, sw) },
    { id: 'sw', p: sw },
    { id: 'w', p: mid(sw, nw) },
    { id: 'rotate', p: rotate },
  ];
}

/** The nearest handle within `hitPx` SCREEN px, or `null`. */
export function nearestInsetHandle(
  handles: readonly InsetHandle[],
  point: Px,
  hitPx: number,
  scale: number,
): InsetHandleId | null {
  let best: InsetHandleId | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const h of handles) {
    const d = Math.hypot(h.p.x - point.x, h.p.y - point.y) * scale;
    if (d <= hitPx && d < bestDist) {
      bestDist = d;
      best = h.id;
    }
  }
  return best;
}

export function isCornerHandle(id: InsetHandleId): id is 'nw' | 'ne' | 'se' | 'sw' {
  return id === 'nw' || id === 'ne' || id === 'se' || id === 'sw';
}

export function isEdgeHandle(id: InsetHandleId): id is 'n' | 'e' | 's' | 'w' {
  return id === 'n' || id === 'e' || id === 's' || id === 'w';
}

/* ------------------------------------------------------------------ *
 * Insert flow (§9:615–618)
 * ------------------------------------------------------------------ */

/**
 * Default placement: **40% of the sheet width**, aspect preserved, centred on the tap,
 * rotation 0, crop omitted (full asset). UI §9:618.
 */
export function defaultInsetPlacement(
  tap: Px,
  sheet: AssetSize,
  asset: AssetSize,
): InsetImageGeometry {
  const width = Math.max(MIN_INSET_SHEET_PX, sheet.width * DEFAULT_INSET_FRACTION);
  const aspect = asset.width > 0 ? asset.height / asset.width : 1;
  const height = Math.max(MIN_INSET_SHEET_PX, width * aspect);
  return {
    kind: 'image',
    x: tap.x - width / 2,
    y: tap.y - height / 2,
    width,
    height,
    rotation: 0,
  };
}

/** Placement `n` of a multi-select batch: `n` × 24 px down-right (UI §9:615). */
export function cascadeTap(tap: Px, index: number): Px {
  return { x: tap.x + CASCADE_STEP_PX * index, y: tap.y + CASCADE_STEP_PX * index };
}

/* ------------------------------------------------------------------ *
 * Corner scale (aspect-locked by default)
 * ------------------------------------------------------------------ */

/**
 * Scale by dragging a corner handle. The OPPOSITE corner stays fixed (in sheet space,
 * rotation included). `aspectLock` is on by default (UI §9:621).
 */
export function scaleInset(
  geometry: InsetImageGeometry,
  handle: 'nw' | 'ne' | 'se' | 'sw',
  pointer: Px,
  aspectLock = true,
): InsetImageGeometry {
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const c = Math.cos(geometry.rotation * DEG);
  const s = Math.sin(geometry.rotation * DEG);
  const hv = CORNER_VEC[handle];

  // Pointer in the rect's UNROTATED frame, relative to the old centre.
  const vx = pointer.x - cx;
  const vy = pointer.y - cy;
  const px = vx * c + vy * s;
  const py = -vx * s + vy * c;

  // The fixed (opposite) corner, relative to the old centre, in the unrotated frame.
  const fx = -hv.x * geometry.width;
  const fy = -hv.y * geometry.height;

  const rawW = Math.abs(px - fx);
  const rawH = Math.abs(py - fy);
  let newW = Math.max(MIN_INSET_SHEET_PX, rawW);
  let newH = Math.max(MIN_INSET_SHEET_PX, rawH);
  if (aspectLock) {
    // Grow to the axis that travelled furthest, then re-derive the other from the
    // ORIGINAL aspect (a uniform scale keeps the photo undistorted).
    const sx = rawW / geometry.width;
    const sy = rawH / geometry.height;
    const k = Math.max(sx, sy);
    newW = Math.max(MIN_INSET_SHEET_PX, geometry.width * k);
    newH = newW / (geometry.width / geometry.height);
  }

  // The fixed corner's sheet position (unchanged).
  const fixedSheet: Px = { x: cx + fx * c - fy * s, y: cy + fx * s + fy * c };
  // The fixed corner relative to the NEW centre is `(-hv.x·newW, -hv.y·newH)`.
  const relX = -hv.x * newW;
  const relY = -hv.y * newH;
  const ncx = fixedSheet.x - (relX * c - relY * s);
  const ncy = fixedSheet.y - (relX * s + relY * c);
  return { ...geometry, x: ncx - newW / 2, y: ncy - newH / 2, width: newW, height: newH };
}

/** Uniform scale about the centre (two-finger pinch; UI §9:623). */
export function scaleInsetBy(geometry: InsetImageGeometry, factor: number): InsetImageGeometry {
  const k = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const width = Math.max(MIN_INSET_SHEET_PX, geometry.width * k);
  const height = Math.max(MIN_INSET_SHEET_PX, geometry.height * k);
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  return { ...geometry, x: cx - width / 2, y: cy - height / 2, width, height };
}

/* ------------------------------------------------------------------ *
 * Edge handles → crop window (NOT a stretch) — §8.5 / UI §9:621
 * ------------------------------------------------------------------ */

export interface CropResult {
  geometry: InsetImageGeometry;
  crop: Rect;
}

/**
 * Drag an edge handle. The OPPOSITE edge stays fixed in sheet space and the crop window
 * shrinks/grows so the photo content under the fixed edge does not move. This is how
 * "edges adjust the visible crop window — not stretch" is realised: the group scale
 * changes with the crop, so the visible content stays registered.
 *
 * Derivation (east edge): `crop.width` and `geometry.width` change by the same ratio,
 * and `crop.x` is fixed, so asset x = crop.x + crop.width·(local.x/crop.width) keeps
 * the same sheet position for a fixed local fraction.
 */
export function cropInsetEdge(
  geometry: InsetImageGeometry,
  asset: AssetSize,
  edge: 'n' | 'e' | 's' | 'w',
  pointer: Px,
): CropResult {
  const crop = cropOf(geometry, asset);
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const c = Math.cos(geometry.rotation * DEG);
  const s = Math.sin(geometry.rotation * DEG);
  const vx = pointer.x - cx;
  const vy = pointer.y - cy;
  const px = vx * c + vy * s; // unrotated frame, relative to centre
  const py = -vx * s + vy * c;

  const w = geometry.width;
  const h = geometry.height;
  const nextCrop: Rect = { ...crop };
  let newW = w;
  let newH = h;

  if (edge === 'e') {
    // max placed width before the crop window runs off the asset's right edge.
    const maxCropW = asset.width - crop.x;
    const maxW = (maxCropW / crop.width) * w;
    newW = clamp(px + w / 2, MIN_INSET_SHEET_PX, maxW);
    nextCrop.width = clamp((newW / w) * crop.width, MIN_CROP_ASSET_PX, maxCropW);
    newW = (nextCrop.width / crop.width) * w; // re-derive after the crop clamp
  } else if (edge === 'w') {
    // max placed width before the crop window runs off the asset's left edge (crop.x→0).
    const maxW = ((crop.x + crop.width) / crop.width) * w;
    newW = clamp(w / 2 - px, MIN_INSET_SHEET_PX, maxW);
    nextCrop.width = clamp((newW / w) * crop.width, MIN_CROP_ASSET_PX, crop.x + crop.width);
    newW = (nextCrop.width / crop.width) * w;
    nextCrop.x = crop.x + (crop.width - nextCrop.width); // right edge fixed in asset
  } else if (edge === 's') {
    const maxCropH = asset.height - crop.y;
    const maxH = (maxCropH / crop.height) * h;
    newH = clamp(py + h / 2, MIN_INSET_SHEET_PX, maxH);
    nextCrop.height = clamp((newH / h) * crop.height, MIN_CROP_ASSET_PX, maxCropH);
    newH = (nextCrop.height / crop.height) * h;
  } else {
    const maxH = ((crop.y + crop.height) / crop.height) * h;
    newH = clamp(h / 2 - py, MIN_INSET_SHEET_PX, maxH);
    nextCrop.height = clamp((newH / h) * crop.height, MIN_CROP_ASSET_PX, crop.y + crop.height);
    newH = (nextCrop.height / crop.height) * h;
    nextCrop.y = crop.y + (crop.height - nextCrop.height);
  }

  // Keep the OPPOSITE edge fixed in sheet space.
  let fixedLocal: Px;
  let centreFromFixed: Px;
  if (edge === 'e') {
    fixedLocal = { x: -w / 2, y: 0 };
    centreFromFixed = { x: newW / 2, y: 0 };
  } else if (edge === 'w') {
    fixedLocal = { x: w / 2, y: 0 };
    centreFromFixed = { x: -newW / 2, y: 0 };
  } else if (edge === 's') {
    fixedLocal = { x: 0, y: -h / 2 };
    centreFromFixed = { x: 0, y: newH / 2 };
  } else {
    fixedLocal = { x: 0, y: h / 2 };
    centreFromFixed = { x: 0, y: -newH / 2 };
  }
  const fixedSheet: Px = { x: cx + fixedLocal.x * c - fixedLocal.y * s, y: cy + fixedLocal.x * s + fixedLocal.y * c };
  const ncx = fixedSheet.x + centreFromFixed.x * c - centreFromFixed.y * s;
  const ncy = fixedSheet.y + centreFromFixed.x * s + centreFromFixed.y * c;

  return {
    geometry: { ...geometry, x: ncx - newW / 2, y: ncy - newH / 2, width: newW, height: newH, crop: nextCrop },
    crop: nextCrop,
  };
}

/* ------------------------------------------------------------------ *
 * Rotation (§9:621 — 0/90/180 snapping)
 * ------------------------------------------------------------------ */

/** Snap a free angle to the nearest stop within tolerance, else return it unchanged. */
export function snapRotation(
  deg: number,
  stops: readonly number[] = ROTATE_STOPS,
  toleranceDeg = ROTATE_SNAP_TOLERANCE_DEG,
): number {
  const normalized = ((deg % 360) + 360) % 360;
  let best = normalized;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const stop of stops) {
    const s = ((stop % 360) + 360) % 360;
    let diff = Math.abs(normalized - s);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return bestDiff <= toleranceDeg ? best : normalized;
}

/** Rotate by dragging the rotate handle: the angle from the centre to the pointer, +90°. */
export function rotateInset(
  geometry: InsetImageGeometry,
  pointer: Px,
  snap = true,
): InsetImageGeometry {
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const raw = (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI + 90;
  return { ...geometry, rotation: snap ? snapRotation(raw) : ((raw % 360) + 360) % 360 };
}

/** Relative rotation (two-finger twist; UI §9:623). */
export function rotateInsetBy(geometry: InsetImageGeometry, deltaDeg: number): InsetImageGeometry {
  return { ...geometry, rotation: (((geometry.rotation + deltaDeg) % 360) + 360) % 360 };
}

/* ------------------------------------------------------------------ *
 * Replace photo (§8.5:1799 / M7 / `project.replacePhoto*`)
 * ------------------------------------------------------------------ */

export type ReplacePhotoChoice = 'keep' | 'remove';
export type ReplacePhotoDecision = 'swap' | 'warn';

/** Identical working-image dimensions → silent swap. Different → the warned dialog. */
export function replacePhotoDecision(oldAsset: AssetSize, newAsset: AssetSize): ReplacePhotoDecision {
  return oldAsset.width === newAsset.width && oldAsset.height === newAsset.height ? 'swap' : 'warn';
}

export interface ReplacePhotoResult {
  geometry: InsetImageGeometry;
  /** Children are preserved unless the user explicitly chose `Remove markup`. */
  keepChildren: boolean;
}

/**
 * Apply a replace. Same dims: the asset reference swaps and nothing else changes, so
 * children and crop keep their meaning. Different dims: the old crop is meaningless in
 * the new asset's px space, so it resets to the full new asset — and the children only
 * survive when the user explicitly chose `keep` (the warned path).
 */
export function applyPhotoReplace(
  geometry: InsetImageGeometry,
  oldAsset: AssetSize,
  newAsset: AssetSize,
  choice: ReplacePhotoChoice,
): ReplacePhotoResult {
  const same = replacePhotoDecision(oldAsset, newAsset) === 'swap';
  if (same) return { geometry: { ...geometry }, keepChildren: true };
  const { crop: _drop, ...rest } = geometry;
  void _drop;
  return { geometry: { ...rest }, keepChildren: choice === 'keep' };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
