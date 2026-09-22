/**
 * `src/editor/tools/SelectTool.ts` — selection, handles, rotate, marquee, groups, lock
 * and the mini-toolbar (plan slice 1.6 build order step 7; touch model §3.3).
 *
 * Pure geometry lives at the top (`handlePositions`, `nearestHandle`, `rotateSnapDeg`,
 * `axisLockDelta`, `visibleHandles`) and is unit-tested. Touch numbers: handles are
 * **28 px visual / 72 px hit** (pen 24/56), the nearest handle within 56 px gets a
 * proximity halo on contact, a second tap on an already-selected object triggers the
 * tool's action, long-press (600 ms) selects and pins the 64 px mini-toolbar, and the
 * **0 px-overlap invariant** suppresses edge handles below 96 screen px (corners only).
 */
import Konva from 'konva';
import type { Geometry, Px } from '@/domain/types';
import { rotatePoint } from '@/domain/geometry';
import type { Command, History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import {
  AXIS_LOCK_DEG,
  AXIS_LOCK_PX,
  MINI_TOOLBAR_H,
  ROTATE_SNAPS,
  SELECT_EDGE_SUPPRESS_PX,
  SELECT_HANDLE_HIT_PEN,
  SELECT_HANDLE_HIT_TOUCH,
  SELECT_HANDLE_VISUAL_PEN,
  SELECT_HANDLE_VISUAL_TOUCH,
  type MarkupTool,
} from './toolTypes';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface Handle {
  id: HandleId;
  /** Image-space point. */
  p: Px;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The 8 handle ids in painter order. */
export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Visual / hit handle sizes by pointer type (touch model §3.3). */
export function handleVisualPx(pointerType: string): number {
  return pointerType === 'touch' ? SELECT_HANDLE_VISUAL_TOUCH : SELECT_HANDLE_VISUAL_PEN;
}
export function handleHitPx(pointerType: string): number {
  return pointerType === 'touch' ? SELECT_HANDLE_HIT_TOUCH : SELECT_HANDLE_HIT_PEN;
}

/**
 * The 8 handles of a bounds, in image space. `suppressEdges` (bounds narrower than
 * 96 screen px) returns the 4 corners only — the 0 px-overlap invariant.
 */
export function handlePositions(bounds: Bounds, suppressEdges = false): Handle[] {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const all: Handle[] = [
    { id: 'nw', p: { x, y } },
    { id: 'n', p: { x: midX, y } },
    { id: 'ne', p: { x: x + width, y } },
    { id: 'e', p: { x: x + width, y: midY } },
    { id: 'se', p: { x: x + width, y: y + height } },
    { id: 's', p: { x: midX, y: y + height } },
    { id: 'sw', p: { x, y: y + height } },
    { id: 'w', p: { x, y: midY } },
  ];
  return suppressEdges ? all.filter((h) => h.id.length === 2) : all;
}

/** Suppress edge handles when the selection is under 96 screen px wide. */
export function visibleHandles(bounds: Bounds, scale: number): Handle[] {
  return handlePositions(bounds, bounds.width * scale < SELECT_EDGE_SUPPRESS_PX);
}

/** The nearest handle whose screen distance is within `hitPx`, or `null`. */
export function nearestHandle(
  handles: readonly Handle[],
  point: Px,
  hitPx: number,
  scale: number,
): HandleId | null {
  let best: HandleId | null = null;
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

/** Rotate snaps to the allowed set (all multiples of 15 — 0/15/30/45/90 included). */
export function rotateSnapDeg(deg: number, toleranceDeg = 7.5): number {
  const snapped = Math.round(deg / 15) * 15;
  const diff = Math.abs(((deg - snapped + 540) % 360) - 180);
  return diff <= toleranceDeg ? snapped : deg;
}

/** The allowed rotate stops, exposed for the HUD chips. */
export const ROTATE_STOPS = ROTATE_SNAPS;

/**
 * The handle's natural RESIZE axis (UI §8.6): an `n`/`s` handle moves vertically
 * (stretch along **y**), an `e`/`w` handle moves horizontally (stretch along **x**),
 * corners are free. (`n`/`s` were previously mapped to `x`, the translate-era
 * reading; a handle now resizes, so the natural movement axis is its own.)
 */
export function handleAxis(handle: HandleId): 'x' | 'y' | 'both' {
  if (handle === 'n' || handle === 's') return 'y';
  if (handle === 'e' || handle === 'w') return 'x';
  return 'both';
}

/**
 * Axis lock after 8 px of movement within 20° of the handle's natural axis. Returns the
 * possibly-constrained delta. Pure; `movedPx` is the screen-space travel so far.
 * Corners are `'both'` and never lock (`handleAxis` doc), so a corner drag always
 * reaches the aspect-locked scale with both components intact.
 */
export function axisLockDelta(
  handle: HandleId,
  dx: number,
  dy: number,
  movedPx: number,
  scale: number,
): { dx: number; dy: number; locked: boolean } {
  if (movedPx * scale < AXIS_LOCK_PX) return { dx, dy, locked: false };
  const axis = handleAxis(handle);
  if (axis === 'both') return { dx, dy, locked: false };
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const offAxis = axis === 'x' ? Math.abs(angle) : Math.abs(Math.abs(angle) - 90);
  if (offAxis <= AXIS_LOCK_DEG) {
    return axis === 'x' ? { dx, dy: 0, locked: true } : { dx: 0, dy, locked: true };
  }
  return { dx, dy, locked: false };
}

/** Marquee selection: which object bounds intersect the marquee rect. */
export function marqueeRect(a: Px, b: Px): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Mini-toolbar anchor: centred above the selection, pinned under the top edge. */
export function miniToolbarPosition(
  bounds: Bounds,
  viewport: { x: number; y: number; scale: number; height: number },
): Px {
  const topScreen = viewport.y + bounds.y * viewport.scale;
  const centreScreen = viewport.x + (bounds.x + bounds.width / 2) * viewport.scale;
  const y = Math.max(MINI_TOOLBAR_H / 2 + 8, topScreen - 48);
  return { x: (centreScreen - viewport.x) / viewport.scale, y: (y - viewport.y) / viewport.scale };
}

/** Rotate a geometry about a pivot by `deg` (image space). */
export function rotateGeometry(geometry: Geometry, pivot: Px, deg: number): Geometry {
  const r = (p: Px): Px => rotatePoint(p, pivot, deg);
  switch (geometry.kind) {
    case 'dimension':
    case 'line':
    case 'arrow':
      return { ...geometry, a: r(geometry.a), b: r(geometry.b) };
    case 'angle':
      return { ...geometry, a: r(geometry.a), vertex: r(geometry.vertex), c: r(geometry.c) };
    case 'rect': {
      // Rotating a rect about its centre keeps the axis-aligned box (v1 rects are axis-aligned).
      return geometry;
    }
    case 'ellipse':
      return geometry;
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return { ...geometry, points: geometry.points.map(r) };
    case 'text':
      return { ...geometry, at: r(geometry.at) };
    case 'image':
      return geometry;
  }
}

export interface SelectToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  getSelection: () => string[];
  setSelection: (keys: string[]) => void;
  onSelectionChange: (keys: string[]) => void;
  onPinnedToolbar: (pinned: boolean) => void;
  labels: { move: string; rotate: string; delete: string; locked: string };
  onLockedToast?: () => void;
}

interface TransformDrag {
  handle: HandleId;
  /** The contact's image-space position at pointer-down. */
  start: Px;
  /** The dragged handle's original image-space position (resize target base). */
  handlePos: Px;
  /** The captured pre-drag geometry (the single history step's `undo` snapshot). */
  geometry: Geometry;
  /** The pre-drag selection bounds — the fixed pivot is the opposite corner/edge. */
  bounds: Bounds;
}

export class SelectTool implements MarkupTool {
  private readonly deps: SelectToolDeps;
  private handles: Handle[] = [];
  private hoverHalo: HandleId | null = null;
  private handleGroup: Konva.Group | null = null;
  private marqueeGroup: Konva.Group | null = null;
  private marqueeStart: Px | null = null;
  private transform: TransformDrag | null = null;
  private pointerType = 'touch';

  constructor(deps: SelectToolDeps) {
    this.deps = deps;
  }

  get pending(): boolean {
    return this.transform !== null || this.marqueeStart !== null;
  }

  /** Redraw handles for the current selection (called after any selection change). */
  refresh(): void {
    this.clearHandles();
    const keys = this.deps.getSelection();
    if (keys.length === 0) return;
    const bounds = this.selectionBounds(keys);
    if (!bounds) return;
    this.handles = visibleHandles(bounds, this.deps.canvas.scale);
    this.drawHandles(this.handles);
  }

  selectionBounds(keys: readonly string[]): Bounds | null {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let any = false;
    for (const key of keys) {
      const b = this.deps.scene.boundsAt(key);
      if (!b) continue;
      any = true;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    if (!any) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  onPointerDown(point: Px, pointerType: string): 'consume' | 'pan' {
    this.pointerType = pointerType;
    const hit = this.hitHandle(point, pointerType);
    if (hit) {
      this.beginTransform(hit, point);
      return 'consume';
    }
    this.marqueeStart = { ...point };
    return 'consume';
  }

  onPointerMove(point: Px, movedBeyondSlop: boolean): 'consume' | 'pan' {
    if (this.transform) {
      this.updateTransform(point);
      return 'consume';
    }
    if (this.marqueeStart && movedBeyondSlop) {
      this.drawMarquee(marqueeRect(this.marqueeStart, point));
      return 'consume';
    }
    return this.marqueeStart ? 'consume' : 'pan';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    void pointerType;
    if (this.transform) {
      this.endTransform();
      return;
    }
    if (this.marqueeStart) {
      const start = this.marqueeStart;
      this.marqueeStart = null;
      this.clearMarquee();
      if (!tapped) {
        const keys = this.deps.scene.keysInRect(marqueeRect(start, point));
        if (keys.length > 0) this.applySelection(keys);
      }
    }
  }

  onPointerCancel(): void {
    this.transform = null;
    this.marqueeStart = null;
    this.clearMarquee();
  }

  /** A tap on an object: select it, or re-trigger the tool's action on a second tap. */
  tapObject(key: string): 'selected' | 'action' {
    const current = this.deps.getSelection();
    if (current.length === 1 && current[0] === key) return 'action';
    this.applySelection([key]);
    return 'selected';
  }

  /** Long-press: select and pin the mini-toolbar. */
  longPress(key: string): void {
    this.applySelection([key]);
    this.deps.onPinnedToolbar(true);
  }

  /** The nearest handle within 56 px gets a proximity halo on contact (touch). */
  proximityHalo(point: Px, pointerType: string): HandleId | null {
    const id = this.hitHandle(point, pointerType);
    if (id === this.hoverHalo) return id;
    this.hoverHalo = id;
    this.refresh();
    return id;
  }

  /** Public read for the shell's dispatch: is a handle under this contact? */
  hitHandleAt(point: Px, pointerType: string): HandleId | null {
    return this.hitHandle(point, pointerType);
  }

  private applySelection(keys: string[]): void {
    this.deps.setSelection(keys);
    this.deps.onSelectionChange(keys);
    this.refresh();
  }

  private hitHandle(point: Px, pointerType: string): HandleId | null {
    return nearestHandle(this.handles, point, handleHitPx(pointerType), this.deps.canvas.scale);
  }

  private beginTransform(handle: HandleId, point: Px): void {
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const geometry = this.deps.scene.geometryCopy(keys[0]);
    const bounds = this.selectionBounds(keys);
    if (!geometry || !bounds) return;
    const handlePos = handlePositions(bounds).find((h) => h.id === handle)?.p;
    if (!handlePos) return;
    this.transform = {
      handle,
      start: { ...point },
      handlePos: { ...handlePos },
      geometry,
      bounds,
    };
  }

  private updateTransform(point: Px): void {
    const drag = this.transform;
    if (!drag) return;
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const locked = axisLockDelta(drag.handle, dx, dy, Math.hypot(dx, dy), this.deps.canvas.scale);
    // Move the dragged handle by the (possibly axis-locked) delta; the opposite
    // corner/edge is the fixed pivot and never moves (F9).
    const target = { x: drag.handlePos.x + locked.dx, y: drag.handlePos.y + locked.dy };
    const next = scaleGeometryLocal(drag.geometry, drag.bounds, drag.handle, target);
    this.deps.scene.setGeometry(keys[0], next);
    this.refresh();
  }

  private endTransform(): void {
    const drag = this.transform;
    this.transform = null;
    if (!drag) return;
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const from = drag.geometry;
    const to = this.deps.scene.geometryCopy(keys[0]);
    if (!to) return;
    // The invariant (D77/F6): geometry never changes without exactly one matching
    // history step, and no step without a change. Compare against the captured
    // pre-drag geometry — not a movement threshold — so a sub-slop drag is undoable
    // and a press that never moved records nothing.
    if (JSON.stringify(to) === JSON.stringify(from)) return;
    this.deps.history.exec({
      label: this.deps.labels.move,
      do: () => this.deps.scene.setGeometry(keys[0], to),
      undo: () => this.deps.scene.setGeometry(keys[0], from),
    } as Command);
  }

  /** Rotate the current selection by `deg` (one undo step). */
  rotateBy(deg: number): void {
    const keys = this.deps.getSelection();
    if (keys.length === 0) return;
    const bounds = this.selectionBounds(keys);
    if (!bounds) return;
    const pivot = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const snap = rotateSnapDeg(deg);
    const before = keys.map((k) => ({ k, g: this.deps.scene.geometryCopy(k)! }));
    const after = before.map(({ k, g }) => ({ k, g: rotateGeometry(g, pivot, snap) }));
    this.deps.history.exec({
      label: this.deps.labels.rotate,
      do: () => after.forEach(({ k, g }) => this.deps.scene.setGeometry(k, g)),
      undo: () => before.forEach(({ k, g }) => this.deps.scene.setGeometry(k, g)),
    } as Command);
    this.refresh();
  }

  /** Delete the selection (one undo step; re-insert restores the captured objects). */
  deleteSelection(): { label: string } | null {
    const keys = this.deps.getSelection();
    if (keys.length === 0) return null;
    const snapshots = keys
      .map((k) => this.deps.scene.get(k))
      .filter((a): a is NonNullable<typeof a> => Boolean(a))
      .map((a) => JSON.parse(JSON.stringify(a)) as typeof a);
    this.deps.history.exec({
      label: this.deps.labels.delete,
      do: () => snapshots.forEach((a) => this.deps.scene.removeObject(a.id)),
      undo: () => snapshots.forEach((a) => this.deps.scene.addAnnotation(a)),
    } as Command);
    this.deps.setSelection([]);
    this.deps.onSelectionChange([]);
    this.refresh();
    return { label: this.deps.labels.delete };
  }

  onToolChange(): void {
    this.clearHandles();
    this.clearMarquee();
    this.handles = [];
  }

  dispose(): void {
    this.onToolChange();
  }

  /* ---- overlay drawing ---- */

  private clearHandles(): void {
    this.handleGroup?.destroy();
    this.handleGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private drawHandles(handles: readonly Handle[]): void {
    this.clearHandles();
    if (handles.length === 0) return;
    const group = new Konva.Group({ listening: false });
    const size = handleVisualPx(this.pointerType) / this.deps.canvas.scale;
    for (const h of handles) {
      const halo = this.hoverHalo === h.id;
      const rect = new Konva.Rect({
        x: h.p.x - size / 2,
        y: h.p.y - size / 2,
        width: size,
        height: size,
        offsetX: 0,
        offsetY: 0,
        fill: '#FFFFFF',
        stroke: '#2FD4E0',
        strokeWidth: halo ? 3 : 2,
        strokeScaleEnabled: false,
        cornerRadius: 2 / this.deps.canvas.scale,
      });
      rect.setAttr('strokeWidthMu', halo ? 3 : 2);
      group.add(rect);
    }
    this.handleGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private clearMarquee(): void {
    this.marqueeGroup?.destroy();
    this.marqueeGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private drawMarquee(rect: Bounds): void {
    this.clearMarquee();
    const group = new Konva.Group({ listening: false });
    const node = new Konva.Rect({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      stroke: '#2FD4E0',
      strokeWidth: 1,
      strokeScaleEnabled: false,
      dash: [6, 4],
      fill: 'rgba(47,212,224,0.08)',
    });
    node.setAttr('strokeWidthMu', 1);
    group.add(node);
    this.marqueeGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }
}

/** Local translate (avoids a scene import cycle on the scene's own helper). */
function translateGeometryLocal(geometry: Geometry, dx: number, dy: number): Geometry {
  const t = (p: Px): Px => ({ x: p.x + dx, y: p.y + dy });
  switch (geometry.kind) {
    case 'dimension':
    case 'line':
    case 'arrow':
      return { ...geometry, a: t(geometry.a), b: t(geometry.b) };
    case 'angle':
      return { ...geometry, a: t(geometry.a), vertex: t(geometry.vertex), c: t(geometry.c) };
    case 'rect':
    case 'ellipse':
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return { ...geometry, points: geometry.points.map(t) };
    case 'text':
      return { ...geometry, at: t(geometry.at) };
    case 'image':
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
  }
}

/** The smallest image-space box edge a resize may produce (no zero/negative box). */
const MIN_RESIZE_PX = 1;

/** The image-space point of one handle of `bounds` (all 8, even suppressed edges). */
function handlePosition(bounds: Bounds, handle: HandleId): Px {
  const found = handlePositions(bounds).find((h) => h.id === handle);
  return found ? { ...found.p } : { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Index of the vertex nearest a handle, or `-1` for an empty set. */
function nearestVertexIndex(points: readonly Px[], at: Px): number {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Resize by dragging `handle` to `target` (image space) — UI §8.6:
 * **corner handle = scale with aspect locked; edge handle = free stretch**, the handle
 * opposite the dragged one being the fixed pivot (so the opposite corner never moves).
 *
 * Local to this tool: `src/domain/**` is the frozen geometry layer (AGENTS non-negotiable
 * #3), and a new module is not warranted for one caller.
 *
 * - Box kinds (`rect`/`ellipse`/`image`) own `x,y,width,height`.
 * - Linear/point kinds (`dimension`/`line`/`arrow`/`angle`/`polygon`/`freehand`/
 *   `highlight`) have no box channel: the handle nearest a vertex moves that vertex and
 *   every other vertex stays fixed.
 * - `text` carries only `at`; a box scale has no data channel, so it degrades to a
 *   translate (text box scaling is recorded owed, not silently dropped).
 */
function scaleGeometryLocal(
  geometry: Geometry,
  bounds: Bounds,
  handle: HandleId,
  target: Px,
): Geometry {
  if (geometry.kind === 'rect' || geometry.kind === 'ellipse' || geometry.kind === 'image') {
    const { x, y, width, height } = bounds;
    if (handle.length === 2) {
      // Corner: pivot is the OPPOSITE corner. For `nw` the pivot is SE (right, bottom).
      const pivotX = handle.includes('w') ? x + width : x;
      const pivotY = handle.includes('n') ? y + height : y;
      const hx = handle.includes('w') ? x : x + width;
      const hy = handle.includes('n') ? y : y + height;
      // One documented uniform factor = distance(pivot → pointer) / distance(pivot →
      // original handle). Arithmetic example, 120×80 `nw` dragged (100,100)→(70,70),
      // pivot (220,180): base = hypot(120,80) = 144.222; target = hypot(150,110) =
      // 186.010; factor = 1.2897; new size = 154.76×103.17 (120×80 × 1.2897). A distance
      // ratio is never negative, so a corner can never flip through the pivot.
      const baseDist = Math.hypot(hx - pivotX, hy - pivotY) || 1;
      // Keep both edges ≥ MIN_RESIZE_PX while locked; never a zero/negative box.
      const minScale = Math.max(
        width > 0 ? MIN_RESIZE_PX / width : 1,
        height > 0 ? MIN_RESIZE_PX / height : 1,
      );
      const factor = Math.max(
        minScale,
        Math.hypot(target.x - pivotX, target.y - pivotY) / baseDist,
      );
      const nextWidth = Math.abs(hx - pivotX) * factor;
      const nextHeight = Math.abs(hy - pivotY) * factor;
      // An already-degenerate box cannot be scaled into a positive one; leave it as is
      // rather than emitting a zero/negative edge.
      if (nextWidth < MIN_RESIZE_PX || nextHeight < MIN_RESIZE_PX) return geometry;
      return {
        ...geometry,
        x: Math.min(pivotX, pivotX + (hx - pivotX) * factor),
        y: Math.min(pivotY, pivotY + (hy - pivotY) * factor),
        width: nextWidth,
        height: nextHeight,
      };
    }
    // Edge: single-axis stretch. The opposite edge is the pivot; the cross axis is
    // copied through untouched.
    if (handle === 'n' || handle === 's') {
      const pivotY = handle === 'n' ? y + height : y;
      const nextHeight = Math.max(MIN_RESIZE_PX, Math.abs(target.y - pivotY));
      return { ...geometry, x, y: Math.min(pivotY, target.y), width, height: nextHeight };
    }
    const pivotX = handle === 'w' ? x + width : x;
    const nextWidth = Math.max(MIN_RESIZE_PX, Math.abs(target.x - pivotX));
    return { ...geometry, x: Math.min(pivotX, target.x), y, width: nextWidth, height };
  }

  const at = handlePosition(bounds, handle);
  switch (geometry.kind) {
    case 'dimension':
    case 'line':
    case 'arrow': {
      const points = [geometry.a, geometry.b];
      const i = nearestVertexIndex(points, at);
      return {
        ...geometry,
        a: i === 0 ? { ...target } : points[0],
        b: i === 1 ? { ...target } : points[1],
      };
    }
    case 'angle': {
      const points = [geometry.a, geometry.vertex, geometry.c];
      const i = nearestVertexIndex(points, at);
      return {
        ...geometry,
        a: i === 0 ? { ...target } : points[0],
        vertex: i === 1 ? { ...target } : points[1],
        c: i === 2 ? { ...target } : points[2],
      };
    }
    case 'polygon':
    case 'freehand':
    case 'highlight': {
      if (geometry.points.length === 0) return geometry;
      const i = nearestVertexIndex(geometry.points, at);
      return {
        ...geometry,
        points: geometry.points.map((p, j) => (j === i ? { ...target } : p)),
      };
    }
    case 'text':
      // No size channel: degrade to the handle delta (box scaling owed).
      return translateGeometryLocal(geometry, target.x - at.x, target.y - at.y);
    default:
      return geometry;
  }
}
