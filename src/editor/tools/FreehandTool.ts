/**
 * `src/editor/tools/FreehandTool.ts` — freehand ink + highlighter (plan slice 1.6 build
 * order step 5).
 *
 * **Pen** strokes vary width from pressure/tilt (thinning 0.5). **Touch** strokes are
 * constant-width by design (touch model §4.2): pressure→width OFF, width floor 8 mu,
 * smoothing 60 (0.6), thinning 0 — a finger never produces a varying-pressure stroke, so
 * the renderer reads the constant `?? 0.5` fallback and never expects variation.
 *
 * **Hold-to-shape:** hold still for 400 ms / 8 px with the pen (600 ms / 16 px under
 * touch — finger jitter defeats the pen numbers) and a roughly straight stroke becomes a
 * line.
 *
 * **Highlighter:** multiply, 30 % alpha, auto z-below. Under touch its `«Straight line»`
 * lock **defaults ON**, turning it into a **tap-tap chisel bar** (24 mu) that reuses the
 * placement machine verbatim — `straightMachine` is a `ShapeTool` configured for a line.
 */
import type { AnnotationStyle, Px } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import { TOUCH_INK_FLOOR_MU } from '@/editor/shapes/svgPath';
import { ShapeTool } from './ShapeTool';
import {
  HOLD_SHAPE_PEN_MS,
  HOLD_SHAPE_PEN_PX,
  HOLD_SHAPE_TOUCH_MS,
  HOLD_SHAPE_TOUCH_PX,
  TOUCH_INK_SMOOTHING_PERCENT,
  type MarkupTool,
  type ToolSettings,
} from './toolTypes';

/** §4.2: finger freehand is gated behind the setting and off by default. */
export function isFingerInkAllowed(settings: Pick<ToolSettings, 'fingerDraws' | 'penOnly'>): boolean {
  return settings.fingerDraws && !settings.penOnly;
}

/** The width floor the CI touch-fallback gate asserts (8 mu). */
export function touchInkWidthMu(style: AnnotationStyle): number {
  return Math.max(style.strokeWidthMu, TOUCH_INK_FLOOR_MU);
}

export interface FreehandParams {
  widthMu: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  /** No pressure source: the renderer must use the constant fallback. */
  constantWidth: boolean;
}

/** The renderer params for a stroke by pointer type (pure; the renderer consumes them). */
export function freehandParamsFor(
  pointerType: string,
  style: AnnotationStyle,
): FreehandParams {
  if (pointerType === 'touch') {
    return {
      widthMu: touchInkWidthMu(style),
      thinning: 0,
      smoothing: TOUCH_INK_SMOOTHING_PERCENT / 100,
      streamline: 0.5,
      constantWidth: true,
    };
  }
  return {
    widthMu: style.strokeWidthMu,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    constantWidth: false,
  };
}

/**
 * The pressure a stroke point carries. A non-pen source supplies the constant 0.5, which
 * is exactly what the renderer's `?? 0.5` fallback expects — no per-point width is read
 * from a non-pen source.
 */
export function pressureForSource(pointerType: string, reportedPressure: number): number {
  if (pointerType !== 'pen') return 0.5;
  return Number.isFinite(reportedPressure) && reportedPressure > 0 ? reportedPressure : 0.5;
}

/** Hold-to-shape fires when the contact barely moved for the pointer's hold window. */
export function shouldPerfectShape(
  durationMs: number,
  travelPx: number,
  pointerType: string,
): boolean {
  return pointerType === 'touch'
    ? durationMs >= HOLD_SHAPE_TOUCH_MS && travelPx <= HOLD_SHAPE_TOUCH_PX
    : durationMs >= HOLD_SHAPE_PEN_MS && travelPx <= HOLD_SHAPE_PEN_PX;
}

/** Is a sampled stroke approximately straight (max deviation ≤ `tolPx` from a→b)? */
export function strokeIsStraight(points: readonly Px[], tolPx: number): boolean {
  if (points.length < 2) return false;
  const a = points[0];
  const b = points[points.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return false;
  for (const p of points) {
    const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    if (cross > tolPx) return false;
  }
  return true;
}

export interface FreehandToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  getSettings: () => ToolSettings;
  onSnapshot: (pending: boolean) => void;
  labels: { add: string; delete: string };
  /** Chisel style for the highlighter (multiply handled by the renderer). */
  highlightStyle?: () => AnnotationStyle;
  /** The `«Straight line»` lock; defaults ON under touch (touch model §4.3). */
  straightLineLock?: (pointerType: string) => boolean;
  newId?: () => string;
}

/**
 * Freehand has its own entry points (it needs raw pressure), so it does not implement
 * `MarkupTool`; it exposes `begin/extend/end/cancel`.
 */
export class FreehandTool {
  private readonly deps: FreehandToolDeps;
  private readonly kind: 'freehand' | 'highlight';
  private points: Px[] = [];
  private pressure: number[] = [];
  private pointerType = 'touch';
  private drawing = false;
  private startAt = 0;
  private startPoint: Px | null = null;
  private straightMachine: ShapeTool | null = null;
  private readonly newId: () => string;

  constructor(kind: 'freehand' | 'highlight', deps: FreehandToolDeps) {
    this.kind = kind;
    this.deps = deps;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  get pending(): boolean {
    return this.drawing;
  }

  /** The tap-tap chisel machine (highlighter straight-line mode only). */
  placement(): ShapeTool {
    if (!this.straightMachine) {
      this.straightMachine = new ShapeTool('line', {
        canvas: this.deps.canvas,
        scene: this.deps.scene,
        history: this.deps.history,
        getSettings: this.deps.getSettings,
        onSnapshot: (pending) => this.deps.onSnapshot(pending),
        labels: { add: this.deps.labels.add, move: '', delete: this.deps.labels.delete },
        annotationType: 'highlight',
        styleOverride: this.deps.highlightStyle,
        newId: this.newId,
      });
    }
    return this.straightMachine;
  }

  /** Under touch the highlighter is a tap-tap chisel bar by default. */
  straightMode(pointerType: string): boolean {
    if (this.kind !== 'highlight') return false;
    const lock = this.deps.straightLineLock;
    if (lock) return lock(pointerType);
    return pointerType === 'touch';
  }

  /** True when this contact should be handled by the placement machine, not ink. */
  usePlacementMachine(pointerType: string): boolean {
    return this.straightMode(pointerType);
  }

  begin(point: Px, reportedPressure: number, pointerType: string): void {
    this.pointerType = pointerType;
    this.drawing = true;
    this.startAt = performance.now();
    this.startPoint = { ...point };
    this.points = [{ ...point }];
    this.pressure = [pressureForSource(pointerType, reportedPressure)];
    this.deps.onSnapshot(true);
  }

  extend(point: Px, reportedPressure: number): void {
    if (!this.drawing) return;
    this.points.push({ ...point });
    this.pressure.push(pressureForSource(this.pointerType, reportedPressure));
  }

  /** Commit on lift. `tapped` (a short, still contact) commits a dot/line, never nothing. */
  end(tapped: boolean): void {
    if (!this.drawing) return;
    this.drawing = false;
    const points = this.points;
    const pressure = this.pressure;
    this.points = [];
    this.pressure = [];
    if (points.length === 0) {
      this.deps.onSnapshot(false);
      return;
    }
    const duration = performance.now() - this.startAt;
    const travel = this.startPoint
      ? Math.hypot(
          points[points.length - 1].x - this.startPoint.x,
          points[points.length - 1].y - this.startPoint.y,
        )
      : 0;

    let strokePoints = points;
    if (
      !tapped &&
      shouldPerfectShape(duration, travel * this.deps.canvas.scale, this.pointerType) &&
      strokeIsStraight(points, 12 / this.deps.canvas.scale)
    ) {
      // Perfect-shape: a straight stroke becomes a single line.
      strokePoints = [points[0], points[points.length - 1]];
    }

    const id = this.newId();
    const style = this.styleForStroke();
    this.deps.history.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) {
          this.deps.scene.addMarkup(
            {
              type: this.kind,
              geometry: { kind: this.kind, points: strokePoints.map((p) => ({ ...p })), pressure: [...pressure] },
              style,
            },
            id,
          );
        }
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.deps.onSnapshot(false);
  }

  cancel(): void {
    this.drawing = false;
    this.points = [];
    this.pressure = [];
    this.deps.onSnapshot(false);
  }

  /** Live point/params for a provisional overlay (not persisted). */
  draft(): { points: Px[]; pressure: number[]; params: FreehandParams; kind: 'freehand' | 'highlight' } | null {
    if (!this.drawing || this.points.length === 0) return null;
    return {
      points: this.points,
      pressure: this.pressure,
      params: freehandParamsFor(this.pointerType, this.styleForStroke()),
      kind: this.kind,
    };
  }

  private styleForStroke(): AnnotationStyle {
    if (this.kind === 'highlight') {
      return this.deps.highlightStyle?.() ?? { ...DEFAULT_STYLE };
    }
    return { ...DEFAULT_STYLE };
  }

  onToolChange(): void {
    this.cancel();
    this.straightMachine?.onToolChange();
  }

  dispose(): void {
    this.cancel();
    this.straightMachine?.dispose();
  }
}

/** Kept for the MarkupTool import shape in callers that expect it. */
export type FreehandMarkupTool = MarkupTool;
