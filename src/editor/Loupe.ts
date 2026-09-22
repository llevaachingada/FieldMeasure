/**
 * `src/editor/Loupe.ts` — the magnifier (build spec §8.4; UI §8.1; touch model §2.1).
 *
 * **Two loupes, one class.** The pen loupe (160 px by default, **3.5×**, 112 px offset)
 * and the touch loupe (200 px, **4×**, 136 px offset, contact disc, dashed leader,
 * freeze-on-lift) differ only by the numbers in their spec.
 *
 * **The derived-number rule (D65 / §19.5, twice-bitten).** Never state a loupe's window,
 * magnification and source as three independent numbers. Magnification is FIXED and the
 * source is DERIVED:
 *
 *     sourcePx = diameterPx / magnification
 *
 *   Pen:    112 / 3.5 = 32 px          (arithmetic: 112 ÷ 3.5 = 32)
 *           160 / 3.5 = 45.714… px     (160 ÷ 3.5 = 45.7142857…)
 *           200 / 3.5 = 57.142… px     (200 ÷ 3.5 = 57.1428571…)
 *   Touch:  200 / 4   = 50 px          (200 ÷ 4   = 50)
 *
 * Fixing magnification (not the source size) keeps endpoint precision constant when the
 * user changes the loupe size, which is the point of the loupe.
 *
 * **Placement (`loupeQuadrant`, pure):** up-and-away from the hand — up-left for a
 * right-handed user, up-right for left-handed — at a radial distance of `offsetPx` from
 * the contact. Edge-aware: if the circle would come within `edgePx = 24` of any viewport
 * edge it flips (opposite x → opposite y → opposite both). Never under the hand or the
 * point; never a hit target; never animated.
 *
 * The Konva half draws into `overlayLayer`, counter-scaled by `1 / stageScale` so the
 * loupe is screen-fixed, and magnifies by drawing a `sourcePx` crop of the photo into an
 * offscreen `diameterPx²` canvas — so the magnification is exactly `diameterPx / sourcePx`
 * and is independent of the stage zoom.
 */
import Konva from 'konva';
import type { Px } from '@/domain/types';
import type { ScreenPoint } from './EditorCanvas';

/* ------------------------------------------------------------------ *
 * Specs
 * ------------------------------------------------------------------ */

export const PEN_LOUPE_MAGNIFICATION = 3.5;
/** UI §8.1 setting values (Off / 112 / 160 / 200). */
export const PEN_LOUPE_SIZES = [112, 160, 200] as const;
export const PEN_LOUPE_OFFSET_PX = 112;
export const LOUPE_EDGE_PX = 24; // §8.4 "flips quadrant within 24 px of a viewport edge"
export const CROSSHAIR_GAP_PX = 12; // §8.4 crosshair centre gap

export const TOUCH_LOUPE_DIAMETER_PX = 200;
export const TOUCH_LOUPE_MAGNIFICATION = 4;
export const TOUCH_LOUPE_OFFSET_PX = 136;
export const TOUCH_CONTACT_DISC_PX = 44;
export const TOUCH_FREEZE_MS = 700;
export const TOUCH_FADE_OPACITY = 0.4;

/** The derived source region. Always `diameter / magnification`. */
export function loupeSourcePx(diameterPx: number, magnification: number): number {
  return diameterPx / magnification;
}

export interface LoupeSpec {
  mode: 'pen' | 'touch';
  diameterPx: number;
  magnification: number;
  /** Derived: `diameterPx / magnification`. */
  sourcePx: number;
  offsetPx: number;
  crosshairGapPx: number;
  edgePx: number;
  /** Touch only: the translucent disc showing the finger's footprint. */
  contactDiscPx: number;
  /** Touch only: the dashed leader to the anchor. */
  leader: boolean;
  /** Touch only: freeze-on-lift duration; pen has none. */
  freezeMs: number;
  fadeOpacity: number;
}

export function penLoupeSpec(diameterPx: number = 160): LoupeSpec {
  return {
    mode: 'pen',
    diameterPx,
    magnification: PEN_LOUPE_MAGNIFICATION,
    sourcePx: loupeSourcePx(diameterPx, PEN_LOUPE_MAGNIFICATION),
    offsetPx: PEN_LOUPE_OFFSET_PX,
    crosshairGapPx: CROSSHAIR_GAP_PX,
    edgePx: LOUPE_EDGE_PX,
    contactDiscPx: 0,
    leader: false,
    freezeMs: 0,
    fadeOpacity: 1,
  };
}

export function touchLoupeSpec(): LoupeSpec {
  return {
    mode: 'touch',
    diameterPx: TOUCH_LOUPE_DIAMETER_PX,
    magnification: TOUCH_LOUPE_MAGNIFICATION,
    sourcePx: loupeSourcePx(TOUCH_LOUPE_DIAMETER_PX, TOUCH_LOUPE_MAGNIFICATION),
    offsetPx: TOUCH_LOUPE_OFFSET_PX,
    crosshairGapPx: CROSSHAIR_GAP_PX,
    edgePx: LOUPE_EDGE_PX,
    contactDiscPx: TOUCH_CONTACT_DISC_PX,
    leader: true,
    freezeMs: TOUCH_FREEZE_MS,
    fadeOpacity: TOUCH_FADE_OPACITY,
  };
}

/* ------------------------------------------------------------------ *
 * Edge-aware quadrant placement (pure, testable in node)
 * ------------------------------------------------------------------ */

export type LoupeQuadrant = 'up-left' | 'up-right' | 'down-left' | 'down-right';

const SIGN: Record<LoupeQuadrant, { sx: -1 | 1; sy: -1 | 1 }> = {
  'up-left': { sx: -1, sy: -1 },
  'up-right': { sx: 1, sy: -1 },
  'down-left': { sx: -1, sy: 1 },
  'down-right': { sx: 1, sy: 1 },
};

export interface LoupePlacement {
  /** Screen-space loupe centre. */
  x: number;
  y: number;
  quadrant: LoupeQuadrant;
  /** True when the preferred quadrant did not fit and the placement flipped. */
  flipped: boolean;
}

export interface LoupePlacementOptions {
  offsetPx: number;
  radiusPx: number;
  edgePx: number;
  handedness: 'left' | 'right';
}

/**
 * Choose the loupe quadrant for a contact at `point` in a `viewport` of `{ width, height }`.
 * Candidates are tried in order: the handedness-preferred quadrant, then the x-flip, the
 * y-flip, and the diagonal flip. A candidate fits when the circle stays `edgePx` inside
 * every viewport edge. If none fit, the last (opposite-both) placement is used with its
 * centre clamped into the viewport.
 */
export function loupeQuadrant(
  point: ScreenPoint,
  viewport: { width: number; height: number },
  options: LoupePlacementOptions,
): LoupePlacement {
  const { offsetPx, radiusPx, edgePx, handedness } = options;
  // Radial distance is exactly `offsetPx`: each axis gets offsetPx/√2.
  const diag = offsetPx / Math.SQRT2;
  const preferred: LoupeQuadrant = handedness === 'left' ? 'up-right' : 'up-left';
  const order: LoupeQuadrant[] = [preferred];
  for (const q of ['up-left', 'up-right', 'down-left', 'down-right'] as LoupeQuadrant[]) {
    if (q !== preferred) order.push(q);
  }

  const fits = (x: number, y: number): boolean =>
    x - radiusPx >= edgePx &&
    x + radiusPx <= viewport.width - edgePx &&
    y - radiusPx >= edgePx &&
    y + radiusPx <= viewport.height - edgePx;

  for (let i = 0; i < order.length; i++) {
    const q = order[i];
    const { sx, sy } = SIGN[q];
    const x = point.x + sx * diag;
    const y = point.y + sy * diag;
    if (fits(x, y)) return { x, y, quadrant: q, flipped: i > 0 };
  }
  // No quadrant fits (very small viewport): keep the diagonal flip and clamp inside.
  const { sx, sy } = SIGN[order[order.length - 1]];
  const clamp = (v: number, max: number): number =>
    Math.min(Math.max(v, radiusPx + edgePx), Math.max(radiusPx + edgePx, max - radiusPx - edgePx));
  return {
    x: clamp(point.x + sx * diag, viewport.width),
    y: clamp(point.y + sy * diag, viewport.height),
    quadrant: order[order.length - 1],
    flipped: true,
  };
}

/* ------------------------------------------------------------------ *
 * The imperative loupe
 * ------------------------------------------------------------------ */

export interface LoupeOptions {
  layer: Konva.Layer;
  /** The photo bitmap (or any drawable source) to magnify. */
  getImage: () => CanvasImageSource | null;
  /** Current stage scale — the loupe counter-scales by `1 / scale`. */
  getScale: () => number;
  /** Container-space point → image-space point (the counter-scaled group's position). */
  screenToImage: (point: ScreenPoint) => Px;
  /** Container-space point of the *anchor* (for the touch leader), or `null`. */
  getAnchorScreen?: () => ScreenPoint | null;
  getViewport: () => { width: number; height: number };
  getHandedness: () => 'left' | 'right';
}

const RING_COLOR = '#2FD4E0';

/**
 * A single loupe instance per canvas. `show` on `pointerdown`, `track` while the contact
 * moves, `lift` on a touch lift (freeze 700 ms → fade to 40%), `hide` when the placement
 * ends. Never a hit target.
 */
export class Loupe {
  private readonly layer: Konva.Layer;
  private readonly options: LoupeOptions;
  private root: Konva.Group | null = null;
  private image: Konva.Image | null = null;
  private leader: Konva.Line | null = null;
  private disc: Konva.Circle | null = null;
  private source: HTMLCanvasElement | null = null;
  private spec: LoupeSpec = penLoupeSpec();
  private point: ScreenPoint = { x: 0, y: 0 };
  private anchor: ScreenPoint | null = null;
  private visible = false;
  private frozenUntil = 0;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LoupeOptions) {
    this.layer = options.layer;
    this.options = options;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get currentSpec(): LoupeSpec {
    return this.spec;
  }

  /** True while frozen after a touch lift (before the fade completes). */
  get isFrozen(): boolean {
    return this.visible && this.frozenUntil > this.now();
  }

  show(point: ScreenPoint, spec: LoupeSpec = penLoupeSpec(), anchor: ScreenPoint | null = null): void {
    this.spec = spec;
    this.point = point;
    this.anchor = anchor;
    this.visible = true;
    this.frozenUntil = 0;
    this.clearFadeTimer();
    this.build();
    this.render();
  }

  /** Track a moving contact. Ignored while frozen (touch freeze-on-lift). */
  track(point: ScreenPoint, anchor: ScreenPoint | null = null): void {
    if (!this.visible) return;
    if (this.frozenUntil > this.now()) return;
    this.point = point;
    this.anchor = anchor;
    this.render();
  }

  /** Pen lift: the loupe disappears (the pen can hover). */
  hide(): void {
    this.visible = false;
    this.frozenUntil = 0;
    this.clearFadeTimer();
    this.destroyNodes();
  }

  /**
   * Touch lift: freeze on the last point for `freezeMs`, then fade to `fadeOpacity`
   * (the loupe stays visible at 40% until the next `show`).
   */
  lift(): void {
    if (!this.visible) return;
    this.anchor = this.anchor ?? this.point;
    if (this.spec.freezeMs > 0) {
      this.frozenUntil = this.now() + this.spec.freezeMs;
      this.clearFadeTimer();
      this.fadeTimer = setTimeout(() => {
        this.fadeTimer = null;
        if (this.root) {
          this.root.opacity(this.spec.fadeOpacity);
          this.layer.batchDraw();
        }
      }, this.spec.freezeMs);
    }
  }

  destroy(): void {
    this.clearFadeTimer();
    this.destroyNodes();
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private destroyNodes(): void {
    this.root?.destroy();
    this.root = null;
    this.image = null;
    this.leader = null;
    this.disc = null;
    this.layer.batchDraw();
  }

  private build(): void {
    this.destroyNodes();
    const { diameterPx, crosshairGapPx } = this.spec;
    const r = diameterPx / 2;

    if (!this.source) this.source = document.createElement('canvas');
    this.source.width = diameterPx;
    this.source.height = diameterPx;

    const root = new Konva.Group({ listening: false });
    root.opacity(1);

    const clip = new Konva.Group({
      clipFunc: (ctx) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.closePath();
      },
      listening: false,
    });
    const image = new Konva.Image({
      image: this.source,
      width: diameterPx,
      height: diameterPx,
      x: -r,
      y: -r,
      listening: false,
    });
    clip.add(image);
    root.add(clip);

    root.add(
      new Konva.Circle({ radius: r, stroke: RING_COLOR, strokeWidth: 1, listening: false }),
    );

    const gap = crosshairGapPx / 2;
    const crosshair = [
      [-r + 2, 0, -gap, 0],
      [gap, 0, r - 2, 0],
      [0, -r + 2, 0, -gap],
      [0, gap, 0, r - 2],
    ];
    for (const pts of crosshair) {
      root.add(
        new Konva.Line({ points: pts, stroke: RING_COLOR, strokeWidth: 1, listening: false }),
      );
    }

    if (this.spec.contactDiscPx > 0) {
      const dr = this.spec.contactDiscPx / 2;
      this.disc = new Konva.Circle({
        radius: dr,
        fill: 'rgba(47,212,224,0.22)',
        stroke: RING_COLOR,
        strokeWidth: 1,
        dash: [4, 4],
        listening: false,
      });
      root.add(this.disc);
    }

    if (this.spec.leader) {
      this.leader = new Konva.Line({
        points: [0, 0, 0, 0],
        stroke: RING_COLOR,
        strokeWidth: 1,
        dash: [4, 4],
        listening: false,
      });
      root.add(this.leader);
    }

    this.root = root;
    this.image = image;
    this.layer.add(root);
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    const scale = this.options.getScale() || 1;
    const placement = loupeQuadrant(this.point, this.options.getViewport(), {
      offsetPx: this.spec.offsetPx,
      radiusPx: this.spec.diameterPx / 2,
      edgePx: this.spec.edgePx,
      handedness: this.options.getHandedness(),
    });
    root.scale({ x: 1 / scale, y: 1 / scale });
    const centre = this.options.screenToImage({ x: placement.x, y: placement.y });
    root.position({ x: centre.x, y: centre.y });

    // Contact point in group-local (screen-px) coordinates.
    const localX = this.point.x - placement.x;
    const localY = this.point.y - placement.y;
    this.disc?.position({ x: localX, y: localY });

    const anchor = this.anchor ?? this.options.getAnchorScreen?.() ?? null;
    if (this.leader) {
      this.leader.points(
        anchor
          ? [localX, localY, anchor.x - placement.x, anchor.y - placement.y]
          : [localX, localY, 0, 0],
      );
    }

    this.drawCrop();
    this.layer.batchDraw();
  }

  /** Draw `sourcePx` image px around the contact into the `diameterPx²` offscreen canvas. */
  private drawCrop(): void {
    const image = this.options.getImage();
    const ctx = this.source?.getContext('2d');
    if (!image || !this.source || !ctx) return;
    const d = this.spec.diameterPx;
    const s = this.spec.sourcePx;
    const centre = this.options.screenToImage(this.point);
    ctx.clearRect(0, 0, d, d);
    try {
      ctx.drawImage(image, centre.x - s / 2, centre.y - s / 2, s, s, 0, 0, d, d);
    } catch {
      // A detached/closed bitmap can throw; the ring still renders.
    }
    this.image?.image(this.source);
  }
}
