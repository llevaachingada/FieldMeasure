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

/** The handle's natural axis: edge handles lock one axis, corners free. */
export function handleAxis(handle: HandleId): 'x' | 'y' | 'both' {
  if (handle === 'n' || handle === 's') return 'x';
  if (handle === 'e' || handle === 'w') return 'y';
  return 'both';
}

/**
 * Axis lock after 8 px of movement within 20° of the handle's natural axis. Returns the
 * possibly-constrained delta. Pure; `movedPx` is the screen-space travel so far.
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
  start: Px;
  geometry: Geometry;
  pivot: Px;
  rotating: boolean;
  moved: boolean;
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
    this.transform = {
      handle,
      start: { ...point },
      geometry,
      pivot: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      rotating: false,
      moved: false,
    };
  }

  private updateTransform(point: Px): void {
    const drag = this.transform;
    if (!drag) return;
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (Math.hypot(dx, dy) * this.deps.canvas.scale > AXIS_LOCK_PX) drag.moved = true;
    const locked = axisLockDelta(drag.handle, dx, dy, Math.hypot(dx, dy), this.deps.canvas.scale);
    const moved = translateGeometryLocal(drag.geometry, locked.dx, locked.dy);
    this.deps.scene.setGeometry(keys[0], moved);
    this.refresh();
  }

  private endTransform(): void {
    const drag = this.transform;
    this.transform = null;
    if (!drag || !drag.moved) return;
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const from = drag.geometry;
    const to = this.deps.scene.geometryCopy(keys[0]);
    if (!to) return;
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
