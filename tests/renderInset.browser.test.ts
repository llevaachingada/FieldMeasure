/**
 * `tests/renderInset.browser.test.ts` — D133 (UI/GUI handoff pass): the three
 * previously-data-channel-less inset controls (`insetBorder`/`insetRadius`/
 * `insetShadow`). Browser project because `Konva.Group.clipFunc` needs a real
 * `CanvasRenderingContext2D` (`ctx.roundRect`) to construct without throwing — `node`/
 * `jsdom` have no canvas (D40).
 *
 * This exercises `buildInsetGroup` directly (not through the scene): it is a pure
 * builder from `RenderInsetInput` to a `Konva.Group`, so the node tree itself is the
 * thing under test, not pixels.
 */
import { describe, expect, it } from 'vitest';
import Konva from 'konva';
import { DEFAULT_STYLE } from '../src/domain/types';
import { buildInsetGroup, type RenderInsetInput } from '../src/editor/inset/renderInset';

const GEOMETRY = { kind: 'image' as const, x: 0, y: 0, width: 200, height: 100, rotation: 0 };
const CROP = { x: 0, y: 0, width: 200, height: 100 };

function baseInput(overrides: Partial<RenderInsetInput> = {}): RenderInsetInput {
  return {
    id: 'inset-1',
    geometry: GEOMETRY,
    crop: CROP,
    asset: null,
    children: [],
    renderChild: () => new Konva.Group(),
    ...overrides,
  };
}

describe('buildInsetGroup — D133 border/radius/shadow', () => {
  it('with no style keys set, adds neither a border nor a shadow rect (the pre-D133 shape)', () => {
    const group = buildInsetGroup(baseInput());
    // Placeholder only (no asset) — exactly one child.
    expect(group.getChildren().length).toBe(1);
    expect(group.getChildren()[0]!.getClassName()).toBe('Rect'); // the placeholder
  });

  it('insetBorder adds a stroke-only Rect LAST (on top of the placeholder/image)', () => {
    const group = buildInsetGroup(baseInput({ style: { ...DEFAULT_STYLE, insetBorder: true } }));
    const children = group.getChildren();
    expect(children.length).toBe(2);
    const border = children[1] as Konva.Rect;
    expect(border.getClassName()).toBe('Rect');
    expect(border.stroke()).toBeTruthy();
    expect(border.fill()).toBeFalsy();
    // Inset by half the 2px stroke width on every side, so the WHOLE stroke stays
    // inside the clip (a centred Konva stroke would otherwise lose its outer half).
    expect(border.x()).toBe(1);
    expect(border.y()).toBe(1);
    expect(border.width()).toBe(CROP.width - 2);
    expect(border.height()).toBe(CROP.height - 2);
  });

  it('insetShadow adds a gradient-filled Rect FIRST (behind the placeholder/image)', () => {
    const group = buildInsetGroup(baseInput({ style: { ...DEFAULT_STYLE, insetShadow: true } }));
    const children = group.getChildren();
    expect(children.length).toBe(2);
    const shadow = children[0] as Konva.Rect;
    expect(shadow.getClassName()).toBe('Rect');
    expect(shadow.fillRadialGradientColorStops()).toBeTruthy();
    // Covers the full crop rect (the vignette needs to reach every edge).
    expect(shadow.width()).toBe(CROP.width);
    expect(shadow.height()).toBe(CROP.height);
  });

  it('both together: shadow first, [image/placeholder], border last', () => {
    const group = buildInsetGroup(
      baseInput({ style: { ...DEFAULT_STYLE, insetBorder: true, insetShadow: true } }),
    );
    const children = group.getChildren();
    expect(children.length).toBe(3);
    expect((children[0] as Konva.Rect).fillRadialGradientColorStops()).toBeTruthy(); // shadow
    expect(children[1]!.getClassName()).toBe('Rect'); // placeholder
    expect((children[2] as Konva.Rect).stroke()).toBeTruthy(); // border
  });

  it('insetRadius clamps to half the shorter crop edge (never a self-intersecting round-rect)', () => {
    // crop is 200x100 — half the shorter edge (height) is 50.
    const group = buildInsetGroup(
      baseInput({ style: { ...DEFAULT_STYLE, insetBorder: true, insetRadius: 9999 } }),
    );
    const border = group.getChildren()[1] as Konva.Rect;
    // Border radius is the clamped 50, minus the half-stroke inset (1) applied to it too.
    expect(border.cornerRadius()).toBeCloseTo(49, 5);
  });

  it('a negative/zero insetRadius is treated as no rounding (radius 0)', () => {
    for (const insetRadius of [0, -5]) {
      const group = buildInsetGroup(baseInput({ style: { ...DEFAULT_STYLE, insetBorder: true, insetRadius } }));
      const border = group.getChildren()[1] as Konva.Rect;
      expect(border.cornerRadius()).toBe(0);
    }
  });

  it('constructs without throwing even at a 1×1 crop (roundRect degenerate case)', () => {
    expect(() =>
      buildInsetGroup(
        baseInput({
          crop: { x: 0, y: 0, width: 1, height: 1 },
          style: { ...DEFAULT_STYLE, insetBorder: true, insetShadow: true, insetRadius: 10 },
        }),
      ),
    ).not.toThrow();
  });
});
