/**
 * tests/dimensionLabelScale.browser.test.ts — a dimension label's layout follows the ZOOM.
 *
 * The §8.1 collision rule is in SCREEN px: if the label's midpoint is within 140 screen px of the
 * dimension's end, the label is pushed 36 screen px off the line with a 1 px leader back to the
 * midpoint. In image px that is `140 / s` and `36 / s`, so whether a label is pushed, where it sits
 * and whether it has a leader all depend on the scale `s`.
 *
 * `MarkupScene.setScale` used to re-font and re-centre a label but never re-ran the layout, so a
 * sheet loaded at scale 1 and then fit-zoomed out kept every short label ON its line with no
 * leader. The export (built at 1/k, D154) and the label's drag hit region (`gestureArbiter`,
 * which calls `labelLayout` at the live scale) both used the pushed place, so the three disagreed.
 *
 * Every test compares the live scene against a FRESH scene built at the final scale: a scene that
 * is zoomed must be indistinguishable from one that was built there.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Konva from 'konva';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import { MarkupScene } from '../src/editor/shapes/scene';

const CTX = { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 } as const;
const GHOST = 'tap to enter value';
/** 3048 mm = 10 ft exactly. */
const LABEL = '10\'-0"';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function dimension(
  id: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  valueMm: number | null = 3048,
  labelOffset?: number,
): Annotation {
  return {
    id,
    type: 'dimension',
    geometry: { kind: 'dimension', a, b, ...(labelOffset === undefined ? {} : { labelOffset }) },
    valueMm,
    enteredText: null,
    style: { ...DEFAULT_STYLE, arrowheads: 'both' },
    zIndex: 1000,
    source: 'manual',
    assetId: null,
    groupId: null,
    locked: false,
  };
}

function inset(children: Annotation[]): Annotation {
  return {
    id: 'inset',
    type: 'image',
    geometry: { kind: 'image', x: 0, y: 0, width: 400, height: 300, rotation: 0 },
    valueMm: null,
    enteredText: null,
    style: { ...DEFAULT_STYLE },
    zIndex: 1000,
    source: 'manual',
    assetId: 'asset-1',
    groupId: null,
    locked: false,
    children,
  };
}

/** A scene on its own stage. `scale` is applied BEFORE the load when given (the "built there" scene). */
function makeScene(annotations: Annotation[], opts: { builtAt?: number } = {}): MarkupScene {
  const stage = new Konva.Stage({ container: document.createElement('div'), width: 800, height: 600 });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  const asset = document.createElement('canvas');
  asset.width = 400;
  asset.height = 300;
  const scene = new MarkupScene({
    layer,
    ctx: CTX,
    ghostText: GHOST,
    assetProvider: () => ({ image: asset, width: 400, height: 300 }),
  });
  cleanups.push(() => {
    scene.load([]);
    stage.destroy();
  });
  if (opts.builtAt !== undefined) scene.setScale(opts.builtAt);
  scene.load(annotations);
  return scene;
}

interface LabelState {
  x: number;
  y: number;
  rotation: number;
  text: string;
  leader: number[] | null;
  leaderTagged: boolean;
  leaderCount: number;
  childCount: number;
}

function stateOf(scene: MarkupScene, key: string): LabelState {
  const group = scene.getNode(key);
  if (!group) throw new Error(`no group for ${key}`);
  const [halo, main] = group.find('Text') as Konva.Text[];
  // halo and main are laid out together, always.
  expect([halo!.x(), halo!.y(), halo!.rotation()]).toEqual([main!.x(), main!.y(), main!.rotation()]);
  const leaders = group.getChildren((n) => n.getAttr('labelLeader') === true);
  const leader = leaders[0] as Konva.Line | undefined;
  return {
    x: main!.x(),
    y: main!.y(),
    rotation: main!.rotation(),
    text: main!.text(),
    leader: leader ? [...leader.points()] : null,
    leaderTagged: leader?.getAttr('labelLeader') === true,
    leaderCount: leaders.length,
    childCount: group.getChildren().length,
  };
}

function expectLike(actual: LabelState, expected: LabelState): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 9);
  expect(actual.text).toBe(expected.text);
  expect(actual.leaderCount).toBe(expected.leaderCount);
  expect(actual.childCount).toBe(expected.childCount);
  if (expected.leader) {
    expect(actual.leader).not.toBeNull();
    expected.leader.forEach((v, i) => expect(actual.leader![i]).toBeCloseTo(v, 9));
  } else {
    expect(actual.leader).toBeNull();
  }
}

describe('a dimension label follows the scale (setScale re-lays it out)', () => {
  // A 600 px dimension A(1000,200) -> B(1600,200): midpoint (1300,200), tip = B.
  //   |mid - tip| = 300 image px, so the label is pushed exactly when 300 x s < 140, s < 0.4667.
  const A = { x: 1000, y: 200 };
  const B = { x: 1600, y: 200 };
  const dim = () => dimension('dim', A, B);

  it('scale 1 -> 1/3.2 pushes the label off the line with a leader; zooming back un-pushes it', () => {
    const scene = makeScene([dim()]);

    // Scale 1: 300 x 1 = 300 >= 140, so not pushed. The label sits on the midpoint.
    const unpushed = stateOf(scene, 'dim');
    expect([unpushed.x, unpushed.y, unpushed.rotation]).toEqual([1300, 200, 0]);
    expect(unpushed.text).toBe(LABEL);
    expect(unpushed.leaderCount).toBe(0);

    // The fitted view of a 4096 px photo: s = 1280 / 4096 = 1 / 3.2 = 0.3125.
    //   300 x 0.3125 = 93.75 < 140 -> pushed; push = 36 / 0.3125 = 115.2 along the normal (0, +1)
    //   label at (1300, 200 + 115.2) = (1300, 315.2); leader (1300,315.2) -> mid (1300,200)
    scene.setScale(1 / 3.2);
    const pushed = stateOf(scene, 'dim');
    expect(pushed.x).toBeCloseTo(1300, 9);
    expect(pushed.y).toBeCloseTo(315.2, 9);
    expect(pushed.text).toBe(LABEL); // still the derived text
    expect(pushed.leaderCount).toBe(1);
    expect(pushed.leaderTagged).toBe(true); // the export drops it for a valueless dimension (D173)
    [1300, 315.2, 1300, 200].forEach((v, i) => expect(pushed.leader![i]).toBeCloseTo(v, 9));

    // Indistinguishable from a scene BUILT at that scale.
    const fresh = makeScene([dim()], { builtAt: 1 / 3.2 });
    expectLike(pushed, stateOf(fresh, 'dim'));

    // Zoom back in: 300 x 1 >= 140 -> label back on the midpoint, leader gone.
    scene.setScale(1);
    expectLike(stateOf(scene, 'dim'), unpushed);
    expect(stateOf(scene, 'dim').leader).toBeNull();
  });

  it('a pinch re-lays the same nodes: the leader follows the label, nothing is rebuilt', () => {
    const scene = makeScene([dim()]);
    scene.setScale(0.4);
    const group = scene.getNode('dim')!;
    const leader = group.getChildren((n) => n.getAttr('labelLeader') === true)[0] as Konva.Line;
    const texts = group.find('Text');
    const childCount = group.getChildren().length;

    // s = 0.4: 300 x 0.4 = 120 < 140 -> pushed by 36 / 0.4 = 90: label (1300, 290)
    expect(stateOf(scene, 'dim').y).toBeCloseTo(290, 9);
    // s = 0.3125: push 115.2 -> y = 315.2.   s = 0.25: 300 x 0.25 = 75 < 140, push 36 / 0.25 = 144 -> y = 344
    for (const [s, y] of [[0.3125, 315.2], [0.25, 344]] as const) {
      scene.setScale(s);
      expect(scene.getNode('dim')).toBe(group); // the group is not rebuilt
      expect(group.getChildren((n) => n.getAttr('labelLeader') === true)[0]).toBe(leader); // nor the leader
      expect(group.find('Text')).toEqual(texts); // nor the text nodes
      expect(group.getChildren()).toHaveLength(childCount);
      expect(stateOf(scene, 'dim').y).toBeCloseTo(y, 9);
      leader.points().forEach((v, i) => expect(v).toBeCloseTo([1300, y, 1300, 200][i]!, 9));
    }
  });

  it('a slanted dimension is rotated and pushed along its own normal, like a fresh build', () => {
    // A(100,100) -> B(400,500): dx=300, dy=400, len=500, mid=(250,300), tip=B.
    //   s = 0.5: |mid - tip| = 250 -> 125 < 140 -> pushed by 36 / 0.5 = 72
    //   normal = (-dy/len, dx/len) = (-0.8, 0.6) -> label (250 - 0.8 x 72, 300 + 0.6 x 72) = (192.4, 343.2)
    //   rotation = atan2(400, 300) = 53.13 degrees
    const slanted = () => dimension('dim', { x: 100, y: 100 }, { x: 400, y: 500 });
    const scene = makeScene([slanted()]);
    scene.setScale(0.5);
    const got = stateOf(scene, 'dim');
    expect(got.x).toBeCloseTo(192.4, 9);
    expect(got.y).toBeCloseTo(343.2, 9);
    expect(got.rotation).toBeCloseTo(53.13, 2);
    [192.4, 343.2, 250, 300].forEach((v, i) => expect(got.leader![i]).toBeCloseTo(v, 9));
    expectLike(got, stateOf(makeScene([slanted()], { builtAt: 0.5 }), 'dim'));
  });

  it('a label the user dragged (D151) is never pushed, at any scale', () => {
    // offset 25 along the normal (0,1): label (1300, 225); the collision push does not apply.
    const dragged = () => dimension('dim', A, B, 3048, 25);
    const scene = makeScene([dragged()]);
    scene.setScale(1 / 3.2);
    const got = stateOf(scene, 'dim');
    expect([got.x, got.y]).toEqual([1300, 225]);
    expect(got.leaderCount).toBe(0);
    expectLike(got, stateOf(makeScene([dragged()], { builtAt: 1 / 3.2 }), 'dim'));
  });

  it('a valueless dimension keeps its placeholder text while it is re-laid', () => {
    const scene = makeScene([dimension('dim', A, B, null)]);
    scene.setScale(1 / 3.2);
    const got = stateOf(scene, 'dim');
    expect(got.text).toBe(GHOST);
    expect(got.y).toBeCloseTo(315.2, 9);
    expect(got.leaderCount).toBe(1);
  });

  it('an inset child dimension is re-laid too', () => {
    // Child in ASSET px: A(40,100) -> B(360,100), len 320, mid (200,100), |mid - tip| = 160.
    //   s = 1: 160 >= 140 -> on the line.   s = 0.5: 160 x 0.5 = 80 < 140 -> pushed by 36 / 0.5 = 72
    //   label (200, 100 + 72) = (200, 172); leader (200,172) -> (200,100)
    const child = () => dimension('child', { x: 40, y: 100 }, { x: 360, y: 100 });
    const scene = makeScene([inset([child()])]);
    const key = 'inset/child';
    expect(stateOf(scene, key).leaderCount).toBe(0);
    expect(stateOf(scene, key).y).toBe(100);

    scene.setScale(0.5);
    const got = stateOf(scene, key);
    expect(got.x).toBeCloseTo(200, 9);
    expect(got.y).toBeCloseTo(172, 9);
    [200, 172, 200, 100].forEach((v, i) => expect(got.leader![i]).toBeCloseTo(v, 9));
    expectLike(got, stateOf(makeScene([inset([child()])], { builtAt: 0.5 }), key));

    scene.setScale(1);
    expect(stateOf(scene, key).leaderCount).toBe(0);
    expect(stateOf(scene, key).y).toBe(100);
  });
});

describe('measurement labels have a monospace fallback (no serif if the font fails to load)', () => {
  // The family used to be the bare 'JetBrains Mono'. If its @font-face does not load, a Konva Text
  // with one unlisted family draws in the browser default, Times New Roman on Windows.
  const FAMILY = "'JetBrains Mono', ui-monospace, monospace";

  it('dimension label halo and main use the full family list', () => {
    const scene = makeScene([dimension('dim', { x: 100, y: 100 }, { x: 500, y: 100 })]);
    const texts = scene.getNode('dim')!.find('Text') as Konva.Text[];
    expect(texts).toHaveLength(2);
    for (const t of texts) expect(t.fontFamily()).toBe(FAMILY);
  });

  it('the angle readout uses it as well', () => {
    const angle: Annotation = {
      ...dimension('angle', { x: 0, y: 0 }, { x: 0, y: 0 }),
      type: 'angle',
      geometry: { kind: 'angle', a: { x: 100, y: 40 }, vertex: { x: 100, y: 140 }, c: { x: 260, y: 140 } },
      valueMm: null,
    };
    const scene = makeScene([angle]);
    const texts = scene.getNode('angle')!.find('Text') as Konva.Text[];
    expect(texts).toHaveLength(1);
    expect(texts[0]!.fontFamily()).toBe(FAMILY);
  });
});
