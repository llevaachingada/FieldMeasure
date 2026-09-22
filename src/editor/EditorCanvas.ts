/**
 * `src/editor/EditorCanvas.ts` — imperative Konva canvas (build spec §8.1 + §4.2).
 *
 * AGENTS non-negotiable #4: **imperative Konva only.** React renders the chrome; this
 * class owns the stage and every layer. Never introduce react-konva.
 *
 * The five layers (§8.1), painted bottom→top:
 *   photoLayer  — the base image, `listening: false` (nothing to hit-test)
 *   insetLayer  — one Konva.Group per inset (later slice)
 *   markupLayer — z-banded shapes / ink / text
 *   overlayLayer— loupe, draw preview, selection handles
 *   dragLayer   — a node is reparented here while it is being dragged
 *
 * Pixel ratio (§8.1.1) is NOT a blanket 1:
 *   photoLayer                                 → 1 (a bitmap gains nothing)
 *   inset / markup / overlay / drag            → min(devicePixelRatio, 2)
 * The drag layer is not named in §8.1.1's two-row table; it carries the same crisp
 * markup content as `markupLayer`, so it takes the same ratio. Recorded in DECISIONS.
 *
 * §4.2 SCREEN SCALING — the load-bearing, easily-inverted rules:
 *   strokes : `strokeScaleEnabled: false` + `strokeWidth = strokeWidthMu`  → constant
 *   text    : `fontSize = fontSizeMu / s`, reset on EVERY zoom change
 *   ink     : `getStroke(points, { size: strokeWidthMu / s })`, regenerated on zoomend
 * The export rules are the exact opposite (§4.2) and live in the export slice. Nothing
 * here may flatten, pre-multiply or "simplify" them.
 *
 * Pinch-zoom is hand-rolled in `touchmove` on `stage.container()` (Konva has none),
 * with the pivot at the pinch midpoint (§5.4 / build order step 2).
 */

import Konva from 'konva';
import { getStroke } from 'perfect-freehand';
import type { InputIntent } from './inputRouter';
import { regenerateInkNode } from './shapes/renderInk';

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Zoom range 0.25×–8× (UI §5.4). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

/** Tap classification (touch model §3.1): slop 8 px, ceiling 400 ms, long-press 600 ms. */
export const TAP_SLOP = 8;
export const TAP_MAX_MS = 400;
export const LONG_PRESS_MS = 600;

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/* ------------------------------------------------------------------ *
 * §3.1 object-first drag predicate (pure — testable in Node)
 * ------------------------------------------------------------------ */

export type DragTarget = 'object' | 'pan';

export interface HitTarget {
  id: string;
  locked: boolean;
}

export interface DragDecisionInput {
  /** The Pan tool overrides object-first unconditionally. */
  panTool: boolean;
  /** Router intent at `pointerdown` (sticky for the contact). */
  intent: InputIntent;
  /** The grabbable node under the contact, if any. */
  hit: HitTarget | null;
}

/**
 * One-finger drag is object-first: a grabbable, unlocked object under the finger moves;
 * anything else pans. A locked object pans (and is named in a toast by the tool slice).
 */
export function decideDragTarget({ panTool, intent, hit }: DragDecisionInput): DragTarget {
  if (panTool) return 'pan';
  if (intent !== 'draw') return 'pan';
  if (hit && !hit.locked) return 'object';
  return 'pan';
}

/**
 * A one-finger contact that lifts within `TAP_SLOP` px of travel AND within
 * `TAP_MAX_MS` is a tap, never a drag. NOTE: the UI spec §5.4 phrasing reads
 * "(or ≤400ms)"; a plain OR would classify a fast 200 px pan in 150 ms as a tap.
 * AND is the plan's test and the only self-consistent reading — see DECISIONS.
 */
export function isTap(dx: number, dy: number, durationMs: number): boolean {
  return Math.hypot(dx, dy) <= TAP_SLOP && durationMs <= TAP_MAX_MS;
}

export interface DragSession {
  target: DragTarget;
  /** The object's position recorded at dragstart, for a second-finger restore. */
  preDragPosition: ScreenPoint | null;
}

export interface SecondFingerResult {
  cancelled: boolean;
  /** Where the object must be put back. `null` when no object drag was in progress. */
  restoreTo: ScreenPoint | null;
}

/**
 * §5.4 safeguard (1): "a second finger always wins — it cancels the object drag and
 * restores the object's pre-drag position, then starts pan/zoom (never silently commit
 * at the displaced position)."
 */
export function onSecondFinger(session: DragSession): SecondFingerResult {
  if (session.target === 'object') {
    return { cancelled: true, restoreTo: session.preDragPosition };
  }
  return { cancelled: false, restoreTo: null };
}

/* ------------------------------------------------------------------ *
 * §4.2 screen scaling helpers (pure where possible)
 * ------------------------------------------------------------------ */

/** Text counter-scale: glyphs rasterize at `fontSizeMu` CSS px at any zoom. */
export function screenFontSize(fontSizeMu: number, scale: number): number {
  return fontSizeMu / scale;
}

/** Freehand outline width in IMAGE units, so the rendered ink is `strokeWidthMu` CSS px. */
export function screenInkSize(strokeWidthMu: number, scale: number): number {
  return strokeWidthMu / scale;
}

export interface ScreenStrokeConfig {
  strokeWidth: number;
  strokeScaleEnabled: false;
  /** Tag read back by `applyScreenRules` on every zoom change. */
  strokeWidthMu: number;
}

/** Strokes: constant CSS px because `strokeScaleEnabled` is false (§4.2 rule 1). */
export function screenStrokeConfig(strokeWidthMu: number): ScreenStrokeConfig {
  return { strokeWidth: strokeWidthMu, strokeScaleEnabled: false, strokeWidthMu };
}

export interface ScreenTextConfig {
  fontSize: number;
  /** Tag read back by `applyScreenRules` on every zoom change. */
  fontSizeMu: number;
}

/** Text: counter-scaled at the current zoom (§4.2 rule 2). */
export function screenTextConfig(fontSizeMu: number, scale: number): ScreenTextConfig {
  return { fontSize: screenFontSize(fontSizeMu, scale), fontSizeMu };
}

/**
 * The perfect-freehand outline in image space at the current zoom. Regenerated on
 * `zoomend` (throttled during pinch) — the raw points on disk never change.
 */
export function inkOutlinePoints(
  points: ScreenPoint[],
  strokeWidthMu: number,
  scale: number,
): number[] {
  const outline = getStroke(
    points.map((p) => [p.x, p.y]),
    { size: screenInkSize(strokeWidthMu, scale), simulatePressure: false, last: true },
  );
  return outline.flatMap(([x, y]) => [x, y]);
}

export interface ScreenInkConfig {
  points: number[];
  closed: true;
  inkPoints: ScreenPoint[];
  strokeWidthMu: number;
}

/** Freehand/highlighter config: a filled outline that ignores `strokeScaleEnabled`. */
export function screenInkConfig(
  points: ScreenPoint[],
  strokeWidthMu: number,
  scale: number,
): ScreenInkConfig {
  return {
    points: inkOutlinePoints(points, strokeWidthMu, scale),
    closed: true,
    inkPoints: points.map((p) => ({ ...p })),
    strokeWidthMu,
  };
}

export interface ScreenRuleOptions {
  /**
   * `false` during a pinch: ink regeneration is the expensive part and is deferred to
   * `zoomend` (§4.2 rule 4 / build order step 4).
   */
  regenerateInk?: boolean;
}

/**
 * Walk a layer/group tree and re-apply the §4.2 screen rules at `scale`:
 * text `fontSize = fontSizeMu / s`, stroke `strokeWidth = strokeWidthMu`, ink outline
 * regenerated at `strokeWidthMu / s`.
 */
export function applyScreenRules(
  root: Konva.Container,
  scale: number,
  options: ScreenRuleOptions = {},
): void {
  const regenerateInk = options.regenerateInk ?? true;
  for (const node of root.getChildren()) {
    if (node instanceof Konva.Text) {
      const mu = node.getAttr('fontSizeMu');
      if (typeof mu === 'number') node.fontSize(screenFontSize(mu, scale));
    }
    const strokeWidthMu = node.getAttr('strokeWidthMu');
    if (
      typeof strokeWidthMu === 'number' &&
      node instanceof Konva.Shape &&
      node.strokeScaleEnabled() === false
    ) {
      node.strokeWidth(strokeWidthMu);
    }
    if (regenerateInk && node instanceof Konva.Line) {
      const inkPoints = node.getAttr('inkPoints');
      if (Array.isArray(inkPoints) && typeof strokeWidthMu === 'number') {
        node.points(inkOutlinePoints(inkPoints as ScreenPoint[], strokeWidthMu, scale));
      }
    }
    // Freehand / highlighter ink is a FILLED `Konva.Path` (slice 1.6): a fill ignores
    // `strokeScaleEnabled`, so the outline itself is regenerated at `mu / s`.
    if (regenerateInk && node instanceof Konva.Path && typeof node.getAttr('strokeWidthMu') === 'number') {
      regenerateInkNode(node, scale);
    }
    if (node instanceof Konva.Group) applyScreenRules(node, scale, options);
  }
}

/* ------------------------------------------------------------------ *
 * EditorCanvas
 * ------------------------------------------------------------------ */

export interface EditorCanvasOptions {
  /** Pixel ratio for the crisp layers; default `Math.min(devicePixelRatio, 2)`. */
  markupPixelRatio?: () => number;
  /** Notified on every zoom change (the React zoom pill subscribes). */
  onZoom?: (scale: number) => void;
}

interface PinchState {
  startDistance: number;
  startScale: number;
  /** Image-space point under the initial pinch midpoint — held fixed. */
  imageAnchor: ScreenPoint;
}

function defaultMarkupPixelRatio(): number {
  return Math.min(globalThis.devicePixelRatio || 1, 2);
}

export class EditorCanvas {
  stage: Konva.Stage;
  /** Base photo — `listening: false` (§8.1). */
  photoLayer: Konva.Layer;
  insetLayer: Konva.Layer;
  markupLayer: Konva.Layer;
  overlayLayer: Konva.Layer;
  /** A node is reparented here while it is dragged (§8.1 performance rule). */
  dragLayer: Konva.Layer;

  private container: HTMLDivElement;
  private options: EditorCanvasOptions;
  private photo: Konva.Image | null = null;
  private photoWidth = 0;
  private photoHeight = 0;
  private pinch: PinchState | null = null;
  private wheelRegenTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(container: HTMLDivElement, options: EditorCanvasOptions = {}) {
    this.container = container;
    this.options = options;
    this.stage = new Konva.Stage({
      container,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    });
    this.photoLayer = new Konva.Layer({ listening: false });
    this.insetLayer = new Konva.Layer();
    this.markupLayer = new Konva.Layer();
    this.overlayLayer = new Konva.Layer();
    this.dragLayer = new Konva.Layer();
    this.stage.add(
      this.photoLayer,
      this.insetLayer,
      this.markupLayer,
      this.overlayLayer,
      this.dragLayer,
    );

    // §8.1.1 — photo 1; the crisp layers min(dpr, 2).
    this.photoLayer.getCanvas().setPixelRatio(1);
    const ratio = (this.options.markupPixelRatio ?? defaultMarkupPixelRatio)();
    for (const layer of [this.insetLayer, this.markupLayer, this.overlayLayer, this.dragLayer]) {
      layer.getCanvas().setPixelRatio(ratio);
    }

    this.attachGestures();
  }

  /* ---------------- photo ---------------- */

  setPhoto(source: CanvasImageSource, width: number, height: number): void {
    this.photoWidth = width;
    this.photoHeight = height;
    if (!this.photo) {
      this.photo = new Konva.Image({
        image: source,
        width,
        height,
        x: 0,
        y: 0,
        listening: false,
      });
      this.photoLayer.add(this.photo);
    } else {
      this.photo.image(source);
      this.photo.size({ width, height });
    }
    this.photoLayer.batchDraw();
  }

  /** Clear the photo (damaged / empty state). */
  clearPhoto(): void {
    this.photo?.destroy();
    this.photo = null;
    this.photoWidth = 0;
    this.photoHeight = 0;
    this.photoLayer.batchDraw();
  }

  get photoSize(): { width: number; height: number } {
    return { width: this.photoWidth, height: this.photoHeight };
  }

  /* ---------------- view ---------------- */

  get scale(): number {
    return this.stage.scaleX();
  }

  /** Container size changed (ResizeObserver). Keeps the viewport centre stable. */
  resize(width: number, height: number): void {
    this.stage.size({ width: Math.max(1, width), height: Math.max(1, height) });
    this.stage.batchDraw();
  }

  /** The scale that shows the whole photo inside the viewport, clamped to 0.25–8. */
  fitScale(): number {
    if (!this.photoWidth || !this.photoHeight) return 1;
    return clampZoom(
      Math.min(this.stage.width() / this.photoWidth, this.stage.height() / this.photoHeight),
    );
  }

  fit(): void {
    if (!this.photoWidth || !this.photoHeight) return;
    const scale = this.fitScale();
    this.applyView(scale, {
      x: (this.stage.width() - this.photoWidth * scale) / 2,
      y: (this.stage.height() - this.photoHeight * scale) / 2,
    });
  }

  /** Zoom about the viewport centre (zoom pill). */
  setZoom(scale: number): void {
    const current = this.scale;
    const pos = this.stage.position();
    const cx = this.stage.width() / 2;
    const cy = this.stage.height() / 2;
    const anchor = { x: (cx - pos.x) / current, y: (cy - pos.y) / current };
    const next = clampZoom(scale);
    this.applyView(next, { x: cx - anchor.x * next, y: cy - anchor.y * next });
  }

  zoomBy(factor: number): void {
    this.setZoom(this.scale * factor);
  }

  /** Zoom so that `pivot` (container space) stays put — pinch midpoint / wheel. */
  zoomAt(scale: number, pivot: ScreenPoint, options?: ScreenRuleOptions): void {
    const current = this.scale;
    const pos = this.stage.position();
    const anchor = { x: (pivot.x - pos.x) / current, y: (pivot.y - pos.y) / current };
    const next = clampZoom(scale);
    this.applyView(next, { x: pivot.x - anchor.x * next, y: pivot.y - anchor.y * next }, options);
  }

  /** Double-tap: fit ↔ 100% (suspended by the caller while a placement tool is armed). */
  toggleFitOrFull(): void {
    if (Math.abs(this.scale - 1) < 1e-3) this.fit();
    else this.setZoom(1);
  }

  panBy(dx: number, dy: number): void {
    const pos = this.stage.position();
    this.stage.position({ x: pos.x + dx, y: pos.y + dy });
    this.stage.batchDraw();
  }

  /** Re-run the §4.2 rules at the current scale (ink regeneration on `zoomend`). */
  regenerateInk(): void {
    this.applyScreenRulesAtCurrentScale();
  }

  private applyScreenRulesAtCurrentScale(options?: ScreenRuleOptions): void {
    const scale = this.scale;
    for (const layer of [this.insetLayer, this.markupLayer, this.overlayLayer, this.dragLayer]) {
      applyScreenRules(layer, scale, options);
    }
  }

  private applyView(scale: number, position: ScreenPoint, options?: ScreenRuleOptions): void {
    const next = clampZoom(scale);
    this.stage.scale({ x: next, y: next });
    this.stage.position(position);
    this.applyScreenRulesAtCurrentScale(options);
    this.stage.batchDraw();
    this.options.onZoom?.(next);
  }

  /* ---------------- coordinates & hit-testing ---------------- */

  /** `clientX/clientY` → container-space CSS px (§4.3). */
  pointerPosition(e: { clientX: number; clientY: number }): ScreenPoint {
    const rect = this.container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Container point → working-image px (§4.3). */
  screenToImage(point: ScreenPoint): ScreenPoint {
    const pos = this.stage.position();
    const scale = this.scale;
    return { x: (point.x - pos.x) / scale, y: (point.y - pos.y) / scale };
  }

  /** Working-image px → container point. */
  imageToScreen(point: ScreenPoint): ScreenPoint {
    const pos = this.stage.position();
    const scale = this.scale;
    return { x: pos.x + point.x * scale, y: pos.y + point.y * scale };
  }

  /**
   * The grabbable object under a container point. Resolves upward to the node tagged
   * `annotationId` (this slice has no annotations yet; the plumbing is here so 1.5+
   * only has to tag nodes).
   */
  hitObject(point: ScreenPoint): HitTarget | null {
    for (const layer of [this.markupLayer, this.insetLayer]) {
      const node = layer.getIntersection(point);
      if (!node) continue;
      let current: Konva.Node | null = node;
      while (current) {
        const id = current.getAttr('annotationId');
        if (typeof id === 'string') {
          return { id, locked: current.getAttr('locked') === true };
        }
        current = current.getParent();
      }
    }
    return null;
  }

  /* ---------------- gestures (pinch / wheel) ---------------- */

  private touchContainerPoint(touch: Touch): ScreenPoint {
    const rect = this.container.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  /** Start (or restart) a pinch from the two current touches, pivot = their midpoint. */
  private beginPinch(evt: TouchEvent): PinchState {
    const a = this.touchContainerPoint(evt.touches[0]);
    const b = this.touchContainerPoint(evt.touches[1]);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(
      1,
      Math.hypot(
        evt.touches[0].clientX - evt.touches[1].clientX,
        evt.touches[0].clientY - evt.touches[1].clientY,
      ),
    );
    const scale = this.scale;
    const pos = this.stage.position();
    const pinch: PinchState = {
      startDistance: distance,
      startScale: scale,
      imageAnchor: { x: (midpoint.x - pos.x) / scale, y: (midpoint.y - pos.y) / scale },
    };
    this.pinch = pinch;
    return pinch;
  }

  private handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>): void => {
    // Two-finger pinch/pan is ours; stop the browser's pull-to-refresh/scroll chaining.
    if (e.evt.touches.length !== 2) return;
    e.evt.preventDefault();
    // Establish the pinch HERE, not on the first move, so the first move already zooms.
    this.beginPinch(e.evt);
  };

  private handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>): void => {
    const evt = e.evt;
    if (evt.touches.length !== 2) return;
    // Konva binds stage listeners on `stage.content` with `{ passive: false }`, so this
    // preventDefault is honoured; `touch-action: none` on the container is the CSS half.
    evt.preventDefault();
    const pinch = this.pinch ?? this.beginPinch(evt);
    const a = this.touchContainerPoint(evt.touches[0]);
    const b = this.touchContainerPoint(evt.touches[1]);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.max(
      1,
      Math.hypot(
        evt.touches[0].clientX - evt.touches[1].clientX,
        evt.touches[0].clientY - evt.touches[1].clientY,
      ),
    );
    const next = clampZoom(pinch.startScale * (distance / pinch.startDistance));
    // Throttle ink regeneration during the pinch (§4.2 rule 4); midpoint movement pans.
    this.applyView(
      next,
      { x: midpoint.x - pinch.imageAnchor.x * next, y: midpoint.y - pinch.imageAnchor.y * next },
      { regenerateInk: false },
    );
  };

  private handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>): void => {
    if (this.pinch && e.evt.touches.length < 2) {
      this.pinch = null;
      this.regenerateInk(); // zoomend: ink catches up once, not every frame
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain wheel is the page's, not ours
    e.preventDefault();
    const pivot = this.pointerPosition(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.zoomAt(this.scale * factor, pivot, { regenerateInk: false });
    if (this.wheelRegenTimer !== null) clearTimeout(this.wheelRegenTimer);
    this.wheelRegenTimer = setTimeout(() => {
      this.wheelRegenTimer = null;
      this.regenerateInk();
    }, 120);
  };

  private attachGestures(): void {
    // Pinch is hand-rolled: Konva has no pinch, and stage events bubble through Konva's
    // own (non-passive) listeners on `stage.content`.
    this.stage.on('touchstart', this.handleTouchStart);
    this.stage.on('touchmove', this.handleTouchMove);
    this.stage.on('touchend', this.handleTouchEnd);
    this.stage.on('touchcancel', this.handleTouchEnd);
    this.stage.container().addEventListener('wheel', this.handleWheel, { passive: false });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.wheelRegenTimer !== null) clearTimeout(this.wheelRegenTimer);
    this.stage.off('touchstart', this.handleTouchStart);
    this.stage.off('touchmove', this.handleTouchMove);
    this.stage.off('touchend', this.handleTouchEnd);
    this.stage.off('touchcancel', this.handleTouchEnd);
    this.stage.container().removeEventListener('wheel', this.handleWheel);
    this.stage.destroy();
  }
}
