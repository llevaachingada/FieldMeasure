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
  /**
   * The path key being transformed, captured at pointer-down. Every write during the
   * drag (and the restore on cancel) addresses THIS key — never `getSelection()[0]`,
   * which can change underneath a live drag.
   */
  key: string;
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

  /**
   * A cancelled drag restores the pre-drag geometry and records NO history step. The
   * selection (and so its handles) survives — the contact was interrupted, not the
   * selection. The shell reaches this through `cancelContact`.
   */
  onPointerCancel(): void {
    this.restoreAndClearTransform();
    this.marqueeStart = null;
    this.clearMarquee();
    this.refresh();
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
      key: keys[0],
      start: { ...point },
      handlePos: { ...handlePos },
      geometry,
      bounds,
    };
  }

  private updateTransform(point: Px): void {
    const drag = this.transform;
    if (!drag) return;
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const locked = axisLockDelta(drag.handle, dx, dy, Math.hypot(dx, dy), this.deps.canvas.scale);
    // Move the dragged handle by the (possibly axis-locked) delta; the opposite
    // corner/edge is the fixed pivot and never moves (F9).
    const target = { x: drag.handlePos.x + locked.dx, y: drag.handlePos.y + locked.dy };
    const next = scaleGeometryForHandle(drag.geometry, drag.bounds, drag.handle, target);
    this.deps.scene.setGeometry(drag.key, next);
    this.refresh();
  }

  private endTransform(): void {
    const drag = this.transform;
    this.transform = null;
    if (!drag) return;
    const from = drag.geometry;
    const to = this.deps.scene.geometryCopy(drag.key);
    if (!to) return;
    // The invariant (D77/F6): geometry never changes without exactly one matching
    // history step, and no step without a change. Compare against the captured
    // pre-drag geometry — not a movement threshold — so a sub-slop drag is undoable
    // and a press that never moved records nothing.
    if (JSON.stringify(to) === JSON.stringify(from)) return;
    this.deps.history.exec({
      label: this.deps.labels.move,
      do: () => this.deps.scene.setGeometry(drag.key, to),
      undo: () => this.deps.scene.setGeometry(drag.key, from),
    } as Command);
  }

  /**
   * The ONE restore-and-clear path for an interrupted transform, shared by
   * `onPointerCancel` and `onToolChange` so the two cannot drift apart again.
   *
   * `updateTransform` writes every intermediate frame straight to the scene (which
   * persists it through `scene.onChange` → `persist.queueSheet`), while `endTransform`
   * is the only place a history step is recorded. So an interrupt — a palm rejected
   * mid-drag, the browser stealing the pointer, a tool switch — used to leave the
   * document mutated, persisted and unreachable by undo (session-13 review F1, the D77/F6
   * defect re-created on the cancel path). Worse, `onToolChange` left `this.transform`
   * set, so `pending` stayed true and the NEXT handle press captured the already-mutated
   * geometry as its undo baseline, making the orphan permanent.
   *
   * Restoring the captured pre-drag geometry (and recording nothing) is the same rule the
   * shell's D63 second-finger cancel follows: never leave a mutation the user cannot undo.
   */
  private restoreAndClearTransform(): void {
    const drag = this.transform;
    this.transform = null;
    if (!drag) return;
    const current = this.deps.scene.geometryCopy(drag.key);
    // Nothing was written yet (a press with no move) — do not touch the scene, so no
    // needless `onChange`/persist tick fires.
    if (!current || JSON.stringify(current) === JSON.stringify(drag.geometry)) return;
    this.deps.scene.setGeometry(drag.key, drag.geometry);
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

  /**
   * The tool is going away (a tool switch, the shell's blanket `cancelActiveMarkup`, or
   * `dispose`). An in-flight transform is CANCELLED, not committed: same restore-and-clear
   * helper as `onPointerCancel`, so neither path can leave an unrecorded mutation or a
   * stale `transform` behind (`pending` must read false afterwards).
   */
  onToolChange(): void {
    this.restoreAndClearTransform();
    this.marqueeStart = null;
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

/** A resize expressed as a scale about a fixed point — the one shape every kind shares. */
export interface ResizeScale {
  /** The handle OPPOSITE the dragged one; it never moves. */
  pivot: Px;
  /** Corners are aspect-locked (`sx === sy`); an edge moves one axis and leaves the other 1. */
  sx: number;
  sy: number;
}

/**
 * The scale a drag of `handle` to `target` applies to `bounds` (UI §8.6: **corner =
 * scale with aspect locked; edge = free stretch**, the opposite handle being the fixed
 * pivot). `null` means "this drag cannot be expressed as a scale" — the extent the
 * handle drives is zero (an empty/one-point selection, or an edge handle on a bounds
 * with no extent on that axis), so there is nothing to multiply.
 *
 * **The factor is a PROJECTION onto the pivot→handle ray, not a raw distance ratio.**
 * A raw ratio ignores direction, so dragging a corner *past* its pivot made the box grow
 * again (session-13 review F6): 120×80 at (100,100), `nw` → (400,400) past the SE pivot
 * (220,180) gave factor = hypot(180,220)/hypot(120,80) = 284.253/144.222 = 1.9709 — a
 * box BIGGER than it started, at x = -16.5. The projection is
 *   f = ((target − pivot) · (handle − pivot)) / |handle − pivot|²
 * which is negative on that drag (dot = 180·(−120) + 220·(−80) = −39 200) and clamps to
 * `minScale`, collapsing the box onto the pivot instead. On the in-line drag it is the
 * same number the distance ratio gave: `nw` → (70,70) is
 * ((−150)(−120) + (−110)(−80)) / 20 800 = 26 800/20 800 = 1.28846 (the distance ratio
 * read 1.28975 — they agree exactly only when the pointer stays on the ray).
 *
 * The clamp (`minScale`) keeps every non-degenerate edge ≥ `MIN_RESIZE_PX` and is what
 * a past-the-pivot drag lands on, so the pivot stays pinned to the last pixel: a factor
 * is applied to BOTH the origin and the extent, so `pivot + (v − pivot) · f` can never
 * drift the way the old `Math.min(pivot, target)` + `Math.max(MIN, |target − pivot|)`
 * pair did (`n` on 120×80 dragged to y = 179.5 put the south edge at 180.5, 1 px off its
 * own pivot).
 *
 * Edges obey the same no-flip rule as corners (F8/2): the old edge branch let `n` → 400
 * put the north edge below the old south edge, which is the opposite of the documented
 * corner rule and was neither specified nor tested.
 */
export function resizeScaleFor(bounds: Bounds, handle: HandleId, target: Px): ResizeScale | null {
  const { x, y, width, height } = bounds;
  // For `nw` the pivot is SE (right, bottom). For an edge handle the cross axis is not
  // scaled (factor 1), so its pivot coordinate is arbitrary — `x`/`y` keep it inert.
  const pivotX = handle.includes('w') ? x + width : x;
  const pivotY = handle.includes('n') ? y + height : y;
  const pivot = { x: pivotX, y: pivotY };

  if (handle.length === 2) {
    // Corner: ONE aspect-locked factor for both axes.
    const vx = (handle.includes('w') ? x : x + width) - pivotX; // ∓width
    const vy = (handle.includes('n') ? y : y + height) - pivotY; // ∓height
    const denom = vx * vx + vy * vy;
    // Pivot and handle coincide (a point selection): no ray, no scale.
    if (denom === 0) return null;
    // Only a POSITIVE extent gets a minimum; a degenerate axis contributes nothing.
    // (The old `: 1` fallback forced `factor ≥ 1` for a zero extent — dead code, since
    // `0 × f` is still 0 and the degenerate box returns unchanged below. Deleted.)
    const minScale = Math.max(
      width > 0 ? MIN_RESIZE_PX / width : 0,
      height > 0 ? MIN_RESIZE_PX / height : 0,
    );
    const projection = ((target.x - pivotX) * vx + (target.y - pivotY) * vy) / denom;
    const factor = Math.max(minScale, projection);
    return { pivot, sx: factor, sy: factor };
  }

  if (handle === 'n' || handle === 's') {
    const vy = (handle === 'n' ? y : y + height) - pivotY; // ∓height
    if (vy === 0) return null; // no height to stretch: the factor would be infinite
    const factor = Math.max(MIN_RESIZE_PX / height, (target.y - pivotY) / vy);
    return { pivot, sx: 1, sy: factor };
  }

  const vx = (handle === 'w' ? x : x + width) - pivotX; // ∓width
  if (vx === 0) return null;
  const factor = Math.max(MIN_RESIZE_PX / width, (target.x - pivotX) / vx);
  return { pivot, sx: factor, sy: 1 };
}

/**
 * Resize by dragging `handle` to `target` (image space) — UI §8.6:
 * **corner handle = scale with aspect locked; edge handle = free stretch**, the handle
 * opposite the dragged one being the fixed pivot (so the opposite corner never moves).
 *
 * Local to this tool: `src/domain/**` is the frozen geometry layer (AGENTS non-negotiable
 * #3), and a new module is not warranted for one caller. Exported so the node project can
 * pin the whole kind × handle table (`tests/selectResize.test.ts`) — the browser rig can
 * only reach it through a real Konva stage, and it exercised `rect` alone.
 *
 * **Every kind is the same scale about the same pivot** (`resizeScaleFor`):
 * - Box kinds (`rect`/`ellipse`/`image`) scale their `x,y,width,height`.
 * - Vertex kinds (`dimension`/`line`/`arrow`/`angle`/`polygon`/`freehand`/`highlight`)
 *   scale EVERY vertex about that pivot. They used to move the single vertex nearest the
 *   handle to the absolute `target` — but a handle sits on the bounding BOX, not on a
 *   vertex, so the first pixel of drag teleported that vertex onto the box (session-13
 *   review F2: 1 px of `n` drag on the dimension a(100,100) b(300,200) moved `a` to
 *   (199,99) — a 99.005 px jump). Per-vertex editing is the separate `Edit points`
 *   affordance in §8.6, not what the 8 bounding-box handles do. A pure coordinate scale
 *   also leaves `pressure[]` (a parallel array) aligned, which moving one raw ink point
 *   did not.
 * - `text` carries only `at`; a box scale has no data channel, so it degrades to a
 *   translate (text box scaling is recorded owed, not silently dropped).
 */
export function scaleGeometryForHandle(
  geometry: Geometry,
  bounds: Bounds,
  handle: HandleId,
  target: Px,
): Geometry {
  if (geometry.kind === 'text') {
    // No size channel: degrade to the handle delta (box scaling owed).
    const at = handlePosition(bounds, handle);
    return translateGeometryLocal(geometry, target.x - at.x, target.y - at.y);
  }
  const scale = resizeScaleFor(bounds, handle, target);
  if (!scale) return geometry;
  const { pivot, sx, sy } = scale;
  const p = (pt: Px): Px => ({
    x: pivot.x + (pt.x - pivot.x) * sx,
    y: pivot.y + (pt.y - pivot.y) * sy,
  });

  switch (geometry.kind) {
    case 'rect':
    case 'ellipse':
    case 'image': {
      // An already-degenerate box cannot be scaled into a positive one (`0 × f === 0`),
      // so leave it as it is rather than emit a zero/negative edge. Every other box keeps
      // both edges ≥ MIN_RESIZE_PX by the `minScale` clamp inside `resizeScaleFor`.
      if (geometry.width <= 0 || geometry.height <= 0) return geometry;
      const origin = p({ x: geometry.x, y: geometry.y });
      return {
        ...geometry,
        x: origin.x,
        y: origin.y,
        width: geometry.width * sx,
        height: geometry.height * sy,
      };
    }
    case 'dimension':
    case 'line':
    case 'arrow':
      return { ...geometry, a: p(geometry.a), b: p(geometry.b) };
    case 'angle':
      return { ...geometry, a: p(geometry.a), vertex: p(geometry.vertex), c: p(geometry.c) };
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return { ...geometry, points: geometry.points.map(p) };
    default:
      return geometry;
  }
}
