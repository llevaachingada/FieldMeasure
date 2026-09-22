/**
 * `tests/insetGeometry.test.ts` — the §8.5 inset coordinate model (node project).
 *
 * These are the arithmetic gates for the one model that, if flattened, silently
 * misplaces measurements. They execute the pure functions; the Konva renderer is proven
 * separately in `tests/insetScene.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  assetToInsetLocal,
  assetToSheet,
  cascadeTap,
  cropInsetEdge,
  cropOf,
  defaultInsetPlacement,
  insetContains,
  insetCorners,
  insetHandlePositions,
  insetLocalToAsset,
  insetLocalToSheet,
  insetTransform,
  applyPhotoReplace,
  replacePhotoDecision,
  rotateInset,
  scaleInset,
  scaleInsetBy,
  sheetToAsset,
  sheetToInsetLocal,
  snapRotation,
  type InsetImageGeometry,
} from '../src/editor/inset/insetGeometry';

const ASSET = { width: 2400, height: 1800 };
const full: InsetImageGeometry = { kind: 'image', x: 100, y: 50, width: 400, height: 300, rotation: 0 };
const fullCrop = { x: 0, y: 0, width: 2400, height: 1800 };

const close = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('default placement (UI §9:618)', () => {
  it('is 40% of the sheet width, aspect preserved, centred on the tap, rotation 0', () => {
    const g = defaultInsetPlacement({ x: 500, y: 400 }, { width: 1000, height: 800 }, ASSET);
    expect(g.width).toBeCloseTo(400, 9); // 1000 × 0.40
    expect(g.height).toBeCloseTo(300, 9); // 400 × (1800/2400) = 400 × 0.75
    expect(g.x).toBeCloseTo(300, 9); // 500 − 400/2
    expect(g.y).toBeCloseTo(250, 9); // 400 − 300/2
    expect(g.rotation).toBe(0);
    expect(g.crop).toBeUndefined(); // full asset
  });

  it('cascades multi-select 24 px down-right per placement', () => {
    expect(cascadeTap({ x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
    expect(cascadeTap({ x: 10, y: 20 }, 2)).toEqual({ x: 58, y: 68 }); // +48 = 2 × 24
  });
});

describe('crop + transform (§8.5)', () => {
  it('scale maps the crop window to the placed size; pivot is the placed centre', () => {
    const crop = { x: 0, y: 0, width: 2400, height: 1800 };
    const t = insetTransform(full, crop);
    expect(t.scaleX).toBeCloseTo(400 / 2400, 12);
    expect(t.scaleY).toBeCloseTo(300 / 1800, 12);
    expect(t.offsetX).toBeCloseTo(1200, 12); // crop.width / 2 — LOCAL units
    expect(t.offsetY).toBeCloseTo(900, 12);
    expect(t.positionX).toBeCloseTo(300, 12); // x + width/2
    expect(t.positionY).toBeCloseTo(200, 12);
  });

  it('a missing crop defaults to the full asset', () => {
    expect(cropOf(full, ASSET)).toEqual(fullCrop);
    const cropped: InsetImageGeometry = { ...full, crop: { x: 10, y: 20, width: 30, height: 40 } };
    expect(cropOf(cropped, ASSET)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('a non-zero crop.x/y offsets the asset and children by −crop (D12)', () => {
    const crop = { x: 600, y: 0, width: 1200, height: 900 };
    // The packet trace: a child at asset (120, 200) renders at group-local (120−600, 200−0).
    expect(assetToInsetLocal({ x: 120, y: 200 }, crop)).toEqual({ x: -480, y: 200 });
    expect(insetLocalToAsset({ x: -480, y: 200 }, crop)).toEqual({ x: 120, y: 200 });
  });

  it('sheet ⇄ asset round-trips through an arbitrary scale + rotation', () => {
    const geom: InsetImageGeometry = { ...full, rotation: 30 };
    const crop = { x: 600, y: 0, width: 1200, height: 900 };
    const asset = { x: 120, y: 200 };
    const sheet = assetToSheet(asset, geom, crop);
    const back = sheetToAsset(sheet, geom, crop);
    close(back.x, asset.x, 1e-9);
    close(back.y, asset.y, 1e-9);
  });

  it('the placed-rect centre maps to the crop window centre', () => {
    const geom: InsetImageGeometry = { ...full, rotation: 37 };
    const crop = { x: 600, y: 300, width: 1200, height: 900 };
    const local = sheetToInsetLocal({ x: 300, y: 200 }, geom, crop); // position = centre
    close(local.x, crop.width / 2, 1e-9);
    close(local.y, crop.height / 2, 1e-9);
    // …and rotation does not move the centre about itself.
    const centreSheet = insetLocalToSheet({ x: crop.width / 2, y: crop.height / 2 }, geom, crop);
    close(centreSheet.x, 300, 1e-9);
    close(centreSheet.y, 200, 1e-9);
  });

  it('insetContains is true inside the placed, clipped rect and false outside', () => {
    expect(insetContains({ x: 300, y: 200 }, full, fullCrop)).toBe(true);
    expect(insetContains({ x: 99, y: 200 }, full, fullCrop)).toBe(false);
    expect(insetContains({ x: 500, y: 350 }, full, fullCrop)).toBe(true); // boundary is inclusive
    expect(insetContains({ x: 501, y: 350 }, full, fullCrop)).toBe(false);
  });
});

describe('manipulation grammar (UI §9:621)', () => {
  it('corner scale with aspect lock keeps the photo undistorted and the far corner fixed', () => {
    // Fixed nw corner is (100, 50). Dragging se to (900, 650) is a clean ×2.
    const g = scaleInset(full, 'se', { x: 900, y: 650 }, true);
    expect(g.x).toBeCloseTo(100, 9); // nw corner fixed
    expect(g.y).toBeCloseTo(50, 9);
    expect(g.width).toBeCloseTo(800, 9);
    expect(g.height).toBeCloseTo(600, 9); // 800 × 0.75
  });

  it('corner scale without the lock stretches the rect only', () => {
    const g = scaleInset(full, 'se', { x: 900, y: 650 }, false);
    expect(g.width).toBeCloseTo(800, 9);
    expect(g.height).toBeCloseTo(600, 9);
    const g2 = scaleInset(full, 'se', { x: 900, y: 450 }, false);
    expect(g2.width).toBeCloseTo(800, 9);
    expect(g2.height).toBeCloseTo(400, 9);
  });

  it('east edge shrinks the crop window without moving the west edge', () => {
    // Old rect x: 100→500. Drag the east edge to x=400 (one quarter in).
    const { geometry, crop } = cropInsetEdge(full, ASSET, 'e', { x: 400, y: 200 });
    expect(geometry.x).toBeCloseTo(100, 9); // west edge fixed
    expect(geometry.width).toBeCloseTo(300, 9);
    expect(crop.x).toBeCloseTo(0, 9);
    expect(crop.width).toBeCloseTo(1800, 9); // 2400 × (300/400)
    expect(crop.height).toBeCloseTo(1800, 9); // untouched
  });

  it('west edge moves crop.x so the visible content stays registered', () => {
    // Old rect x: 100→500. Drag the west edge to x=200.
    const { geometry, crop } = cropInsetEdge(full, ASSET, 'w', { x: 200, y: 200 });
    expect(geometry.x).toBeCloseTo(200, 9); // new west edge
    expect(geometry.width).toBeCloseTo(300, 9);
    expect(crop.x).toBeCloseTo(600, 9); // 0 + (2400 − 1800)
    expect(crop.width).toBeCloseTo(1800, 9);
  });

  it('south edge shrinks crop.height and keeps the north edge fixed', () => {
    // Old rect y: 50→350. Drag the south edge to y=300.
    const { geometry, crop } = cropInsetEdge(full, ASSET, 's', { x: 300, y: 300 });
    expect(geometry.y).toBeCloseTo(50, 9);
    expect(geometry.height).toBeCloseTo(250, 9);
    expect(crop.y).toBeCloseTo(0, 9);
    expect(crop.height).toBeCloseTo(1500, 9); // 1800 × (250/300)
  });

  it('never crops past the asset edge', () => {
    const { crop } = cropInsetEdge(full, ASSET, 'e', { x: 5000, y: 200 });
    expect(crop.width).toBeLessThanOrEqual(ASSET.width);
    expect(crop.x + crop.width).toBeLessThanOrEqual(ASSET.width + 1e-9);
  });

  it('rotate snaps to 0/90/180, and pivot stays the placed centre', () => {
    expect(rotateInset(full, { x: 300, y: 50 }, true).rotation).toBeCloseTo(0, 9); // above centre
    expect(rotateInset(full, { x: 500, y: 200 }, true).rotation).toBeCloseTo(90, 9); // right
    expect(rotateInset(full, { x: 300, y: 400 }, true).rotation).toBeCloseTo(180, 9); // below
    expect(snapRotation(87)).toBe(90);
    expect(snapRotation(80)).toBe(80); // 10° away — outside the 7.5° tolerance
  });

  it('uniform scale about the centre preserves the centre', () => {
    const g = scaleInsetBy(full, 2);
    expect(g.x).toBeCloseTo(-100, 9); // centre 300 − 800/2
    expect(g.y).toBeCloseTo(-100, 9); // centre 200 − 600/2
    expect(g.width).toBeCloseTo(800, 9);
    expect(g.height).toBeCloseTo(600, 9);
  });

  it('exposes 8 transform handles plus the rotate arm, rotation-aware', () => {
    const handles = insetHandlePositions(full, 48);
    expect(handles.map((h) => h.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']);
    const se = handles.find((h) => h.id === 'se')!;
    expect(se.p).toEqual({ x: 500, y: 350 });
    const rotate = handles.find((h) => h.id === 'rotate')!;
    expect(rotate.p).toEqual({ x: 300, y: 50 - 48 });
    // Rotated 90°: the same corners turn with the rect.
    const rotated = insetHandlePositions({ ...full, rotation: 90 }, 0);
    const nw = rotated.find((h) => h.id === 'nw')!;
    close(nw.p.x, 300 + 150, 9); // centre + R90(−200,−150) = (300+150, 200−200)
    close(nw.p.y, 200 - 200, 9);
    expect(insetCorners(full)).toEqual([
      { x: 100, y: 50 },
      { x: 500, y: 50 },
      { x: 500, y: 350 },
      { x: 100, y: 350 },
    ]);
  });
});

describe('replace photo (M7 / P §8.5:1799)', () => {
  it('identical dimensions swap silently', () => {
    expect(replacePhotoDecision(ASSET, ASSET)).toBe('swap');
    const geom: InsetImageGeometry = { ...full, crop: { x: 100, y: 100, width: 500, height: 500 } };
    const result = applyPhotoReplace(geom, ASSET, ASSET, 'remove');
    expect(result.keepChildren).toBe(true);
    expect(result.geometry.crop).toEqual({ x: 100, y: 100, width: 500, height: 500 });
  });

  it('different dimensions keep children only on an explicit `keep`', () => {
    expect(replacePhotoDecision(ASSET, { width: 1200, height: 900 })).toBe('warn');
    const geom: InsetImageGeometry = { ...full, crop: { x: 100, y: 100, width: 500, height: 500 } };
    const keep = applyPhotoReplace(geom, ASSET, { width: 1200, height: 900 }, 'keep');
    expect(keep.keepChildren).toBe(true);
    expect(keep.geometry.crop).toBeUndefined(); // the old crop is meaningless in the new px space
    const remove = applyPhotoReplace(geom, ASSET, { width: 1200, height: 900 }, 'remove');
    expect(remove.keepChildren).toBe(false);
    expect(remove.geometry.crop).toBeUndefined();
  });
});
