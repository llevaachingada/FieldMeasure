/**
 * `src/editor/tools/ShapeTool.ts` — Line / Arrow / Rectangle / Ellipse / Polygon
 * (plan slice 1.6 build order step 2).
 *
 * **One machine, tap-tap and drag.** Tap 1 authors A; tap 2 authors B and commits. A
 * pen drag (A on down, B on up) is the same machine and remains supported. Rectangle /
 * Ellipse are corner-to-corner by default and centre-out when the project setting says
 * so. Polygon is the sanctioned tap-by-tap precedent (touch model §1.2): a node hit of
 * 56 px, a 56 px `«--sel»` close ring at 32 px proximity, `✓ Done` and `«Undo point»`
 * replacing Enter/Backspace.
 *
 * The pure decisions live at the top of the file and are unit-tested in
 * `tests/markupTools.test.ts`; the class only consumes them.
 */
import Konva from 'konva';
import type { Annotation, AnnotationStyle, Px } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { Geometry } from '@/domain/types';
import { formatLength } from '@/domain/units';
import { angleDeg } from '@/domain/geometry';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { Command, History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import { buildShapeGroup } from '@/editor/shapes/renderShape';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';
import {
  POLYGON_CLOSE_PROXIMITY_PX,
  POLYGON_MIN_POINTS,
  HOLD_SHAPE_PEN_MS,
  HOLD_SHAPE_PEN_PX,
  HOLD_SHAPE_TOUCH_MS,
  HOLD_SHAPE_TOUCH_PX,
  labelContextFrom,
  type ContactAction,
  type MarkupTool,
  type ToolSettings,
} from './toolTypes';

export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon';

/* ------------------------------------------------------------------ *
 * Pure decisions
 * ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Corner-to-corner rectangle from two drag endpoints. */
export function rectFromCorners(a: Px, b: Px): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Centre-out rectangle: `a` is the centre, `b` the dragged corner. */
export function rectFromCentre(centre: Px, corner: Px): Rect {
  const halfW = Math.abs(corner.x - centre.x);
  const halfH = Math.abs(corner.y - centre.y);
  return { x: centre.x - halfW, y: centre.y - halfH, width: halfW * 2, height: halfH * 2 };
}

/** Hold-to-constrain: a square (the larger side wins, anchored at the min corner). */
export function constrainSquare(rect: Rect): Rect {
  const side = Math.max(rect.width, rect.height);
  return { x: rect.x, y: rect.y, width: side, height: side };
}

/** Snap `b` to the nearest 45° ray from `a` when the hold-to-shape gesture is active. */
export function snapTo45(a: Px, b: Px): Px {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...b };
  const step = Math.PI / 4;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
}

/** Should the 400 ms / 600 ms hold-to-constrain gesture fire? */
export function shouldConstrainShape(
  durationMs: number,
  travelPx: number,
  pointerType: string,
): boolean {
  if (pointerType === 'touch') {
    return durationMs >= HOLD_SHAPE_TOUCH_MS && travelPx <= HOLD_SHAPE_TOUCH_PX;
  }
  return durationMs >= HOLD_SHAPE_PEN_MS && travelPx <= HOLD_SHAPE_PEN_PX;
}

/** A degenerate shape (A≈B) is a mis-tap, not markup. */
export function isDegenerateShape(a: Px, b: Px, minScreenPx: number, scale: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale < minScreenPx;
}
export const SHAPE_MIN_PX = 4;

/** A polygon tap within `proximityPx` (screen) of its start point closes the shape. */
export function shouldClosePolygon(start: Px, point: Px, scale: number): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) * scale <= POLYGON_CLOSE_PROXIMITY_PX;
}

export function polygonCanClose(points: readonly Px[]): boolean {
  return points.length >= POLYGON_MIN_POINTS;
}

/** The live `W×H` / length readout. Pure; copy is numerals only (no stored labels). */
export function shapeReadout(
  kind: ShapeKind,
  a: Px,
  b: Px,
  ctx: LabelContext,
  scale: number,
  centreOut = false,
): string {
  if (kind === 'rect' || kind === 'ellipse') {
    const rect = centreOut ? rectFromCentre(a, b) : rectFromCorners(a, b);
    const w = formatLength(rect.width / scale, ctx.unitSystem, ctx.precisionDenominator, ctx.unitFormat);
    const h = formatLength(rect.height / scale, ctx.unitSystem, ctx.precisionDenominator, ctx.unitFormat);
    return `${w} × ${h}`;
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y) / scale;
  return formatLength(len, ctx.unitSystem, ctx.precisionDenominator, ctx.unitFormat);
}

/** The path readout is screen-relative (mm per CSS px) — informational only. */
export function shapeAngleDeg(a: Px, b: Px): number {
  return angleDeg(b, a, { x: a.x + 1, y: a.y });
}

/* ------------------------------------------------------------------ *
 * The tool
 * ------------------------------------------------------------------ */

export interface ShapeToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  getSettings: () => ToolSettings;
  onSnapshot: (pending: boolean) => void;
  labels: { add: string; move: string; delete: string };
  /** Rectangle/Ellipse centre-out (§8.5 setting). */
  centreOut?: () => boolean;
  /** Override the committed annotation type (the highlighter's chisel bar is a line). */
  annotationType?: Annotation['type'];
  /** Override the committed/provisional style (the highlighter's multiply bar). */
  styleOverride?: () => AnnotationStyle;
  newId?: () => string;
}

type Phase = 'idle' | 'anchorA' | 'polygon';

export class ShapeTool implements MarkupTool {
  private readonly deps: ShapeToolDeps;
  private readonly kind: ShapeKind;
  private phase: Phase = 'idle';
  private a: Px | null = null;
  private provisional: Px | null = null;
  private polygon: Px[] = [];
  private contactRole: 'none' | 'authoredA' | 'placingB' = 'none';
  private contactStart: Px | null = null;
  private contactStartAt = 0;
  private constrained = false;
  private provisionalGroup: Konva.Group | null = null;
  private readonly newId: () => string;

  constructor(kind: ShapeKind, deps: ShapeToolDeps) {
    this.kind = kind;
    this.deps = deps;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  get pending(): boolean {
    return this.phase !== 'idle' || this.polygon.length > 0;
  }

  get points(): readonly Px[] {
    return this.polygon;
  }

  get state(): { phase: Phase; a: Px | null; count: number } {
    return { phase: this.phase, a: this.a, count: this.polygon.length };
  }

  onPointerDown(point: Px, pointerType: string): ContactAction {
    this.lastPointerType = pointerType;
    if (this.kind === 'polygon') return this.polygonPointerDown(point);
    if (this.phase === 'idle') {
      this.a = { ...point };
      this.provisional = { ...point };
      this.phase = 'anchorA';
      this.contactRole = 'authoredA';
      this.contactStart = { ...point };
      this.contactStartAt = performance.now();
      this.constrained = false;
      this.renderProvisional();
      this.snapshot();
      return 'consume';
    }
    if (this.phase === 'anchorA') {
      this.contactRole = 'placingB';
      this.provisional = { ...point };
      // D77/F8: re-arm the hold-to-constrain baseline for THIS contact. The baseline was
      // only set on the first contact, so `maybeConstrain` measured `travel` from A and a
      // held second contact could never satisfy the 400/600 ms + 8/16 px window when B ≠ A.
      this.contactStart = { ...point };
      this.contactStartAt = performance.now();
      this.constrained = false;
      this.renderProvisional();
      return 'consume';
    }
    return 'pan';
  }

  private polygonPointerDown(point: Px): ContactAction {
    if (this.polygon.length > 0 && shouldClosePolygon(this.polygon[0], point, this.deps.canvas.scale)) {
      this.commitPolygon(true);
      return 'consume';
    }
    this.polygon.push({ ...point });
    this.phase = 'polygon';
    this.renderProvisional();
    this.snapshot();
    return 'consume';
  }

  onPointerMove(point: Px, movedBeyondSlop: boolean): ContactAction {
    if (this.kind === 'polygon') {
      if (this.polygon.length > 0) {
        this.provisional = { ...point };
        this.renderProvisional();
      }
      return 'consume';
    }
    if (this.contactRole === 'placingB' && movedBeyondSlop) {
      // A drag from A to B is the same machine: keep consuming (unlike the dimension's
      // "drag = pan", a shape drag is the primary way to draw).
      this.provisional = this.maybeConstrain(point);
      this.renderProvisional();
      return 'consume';
    }
    if (this.contactRole === 'authoredA') {
      this.provisional = this.maybeConstrain(point);
      this.renderProvisional();
      return 'consume';
    }
    return 'pan';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    const role = this.contactRole;
    this.contactRole = 'none';
    if (this.kind === 'polygon') {
      // Polygon commits per tap; the lift does nothing (the next tap adds a node).
      this.provisional = null;
      this.renderProvisional();
      return;
    }
    if (role === 'authoredA') {
      // Tap placed A alone; a drag authored B on the way (commit on lift).
      if (tapped) {
        this.provisional = { ...point };
        this.renderProvisional();
        return;
      }
      this.commit({ ...point }, pointerType);
      return;
    }
    if (role === 'placingB' && tapped) {
      this.commit({ ...point }, pointerType);
    }
  }

  onPointerCancel(): void {
    this.contactRole = 'none';
    if (this.kind === 'polygon') {
      // Keep the in-progress polygon (a settle-time contact pans; it does not discard).
      this.provisional = null;
      this.renderProvisional();
      return;
    }
    if (this.phase === 'anchorA' && this.polygon.length === 0) this.cancelPending();
  }

  /** `✓ Done` (polygon) — commit a closed polygon. */
  done(): void {
    if (this.kind !== 'polygon') return;
    this.commitPolygon(true);
  }

  /** `«Undo point»` (polygon) — remove the last node. */
  undoPoint(): void {
    if (this.kind !== 'polygon' || this.polygon.length === 0) return;
    this.polygon.pop();
    if (this.polygon.length === 0) this.phase = 'idle';
    this.renderProvisional();
    this.snapshot();
  }

  /** Esc / ✕ / tool change. Returns what was kept. */
  cancelPending(): 'kept' | 'discarded' | 'none' {
    if (this.kind === 'polygon' && this.polygon.length >= POLYGON_MIN_POINTS) {
      // A polygon with a real area commits on switch (touch model §1.5 #6 keeps geometry).
      this.commitPolygon(true);
      return 'kept';
    }
    if (this.phase === 'idle' && this.polygon.length === 0) return 'none';
    this.clearProvisional();
    this.phase = 'idle';
    this.a = null;
    this.provisional = null;
    this.polygon = [];
    this.contactRole = 'none';
    this.snapshot();
    return 'discarded';
  }

  onToolChange(): void {
    this.cancelPending();
  }

  dispose(): void {
    this.clearProvisional();
    this.contactRole = 'none';
  }

  /* ---- internals ---- */

  private maybeConstrain(point: Px): Px {
    const elapsed = performance.now() - this.contactStartAt;
    const travel = this.contactStart
      ? Math.hypot(point.x - this.contactStart.x, point.y - this.contactStart.y)
      : 0;
    const held = shouldConstrainShape(elapsed, travel, this.lastPointerType);
    this.constrained = held;
    if (!held || !this.a) return { ...point };
    if (this.kind === 'rect' || this.kind === 'ellipse') {
      // Square constraint is applied at commit (needs the rect math).
      return { ...point };
    }
    return snapTo45(this.a, point);
  }

  private lastPointerType = 'touch';

  private commit(b: Px, pointerType: string): void {
    this.lastPointerType = pointerType;
    const a = this.a;
    if (!a) return;
    if (isDegenerateShape(a, b, SHAPE_MIN_PX, this.deps.canvas.scale)) {
      this.cancelPending();
      return;
    }
    const geometry = this.geometryFor(a, b);
    const id = this.newId();
    this.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) {
          this.deps.scene.addMarkup(
            {
              type: this.deps.annotationType ?? this.kind,
              geometry,
              style: this.deps.styleOverride?.(),
            },
            id,
          );
        }
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.phase = 'idle';
    this.a = null;
    this.provisional = null;
    this.constrained = false;
    this.clearProvisional();
    this.snapshot();
  }

  private geometryFor(a: Px, b: Px): Geometry {
    const target = this.constrained ? snapTo45(a, b) : b;
    switch (this.kind) {
      case 'line':
        return { kind: 'line', a: { ...a }, b: { ...target } };
      case 'arrow':
        return { kind: 'arrow', a: { ...a }, b: { ...target } };
      case 'rect': {
        const rect = this.rectFor(a, b);
        return { kind: 'rect', ...(this.constrained ? constrainSquare(rect) : rect) };
      }
      case 'ellipse': {
        const rect = this.rectFor(a, b);
        return { kind: 'ellipse', ...(this.constrained ? constrainSquare(rect) : rect) };
      }
      case 'polygon':
        return { kind: 'polygon', points: this.polygon.map((p) => ({ ...p })), closed: true };
    }
  }

  private rectFor(a: Px, b: Px): Rect {
    return (this.deps.centreOut?.() ?? false) ? rectFromCentre(a, b) : rectFromCorners(a, b);
  }

  private commitPolygon(closed: boolean): void {
    if (!polygonCanClose(this.polygon)) {
      this.cancelPending();
      return;
    }
    const points = this.polygon.map((p) => ({ ...p }));
    const id = this.newId();
    this.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) {
          this.deps.scene.addMarkup(
            {
              type: this.deps.annotationType ?? 'polygon',
              geometry: { kind: 'polygon', points, closed },
              style: this.deps.styleOverride?.(),
            },
            id,
          );
        }
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.polygon = [];
    this.provisional = null;
    this.phase = 'idle';
    this.clearProvisional();
    this.snapshot();
  }

  private exec(command: Command): void {
    this.deps.history.exec(command);
  }

  private snapshot(): void {
    this.deps.onSnapshot(this.pending);
  }

  private settings(): ToolSettings {
    return this.deps.getSettings();
  }

  /* ---- provisional rendering ---- */

  private clearProvisional(): void {
    this.provisionalGroup?.destroy();
    this.provisionalGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private renderProvisional(): void {
    if (this.kind === 'polygon') {
      this.renderPolygonProvisional();
      return;
    }
    if (!this.a || !this.provisional) {
      this.clearProvisional();
      return;
    }
    const geometry = this.geometryFor(this.a, this.provisional);
    this.clearProvisional();
    const group = buildShapeGroup({
      id: '__provisional__',
      kind: this.kind,
      geometry: geometry as Extract<
        Geometry,
        { kind: 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'angle' }
      >,
      style: this.deps.styleOverride?.() ?? ({ ...DEFAULT_STYLE, strokeColor: '#2FD4E0' } as AnnotationStyle),
      ctx: { scale: this.deps.canvas.scale },
      locked: true,
    });
    group.listening(false);
    this.provisionalGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private renderPolygonProvisional(): void {
    this.clearProvisional();
    if (this.polygon.length === 0) return;
    const points = this.provisional ? [...this.polygon, this.provisional] : [...this.polygon];
    const group = buildShapeGroup({
      id: '__provisional__',
      kind: 'polygon',
      geometry: { kind: 'polygon', points, closed: false },
      style: this.deps.styleOverride?.() ?? ({ ...DEFAULT_STYLE, strokeColor: '#2FD4E0' } as AnnotationStyle),
      ctx: { scale: this.deps.canvas.scale },
      locked: true,
    });
    group.listening(false);
    this.provisionalGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }

  /** The derived-label context, exposed for callers that render readouts. */
  labelContext(): LabelContext {
    return labelContextFrom(this.settings());
  }
}
