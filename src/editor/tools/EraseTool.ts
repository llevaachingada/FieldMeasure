/**
 * `src/editor/tools/EraseTool.ts` — erase (plan slice 1.6 build order step 6; UI §8.7;
 * touch model §4.1).
 *
 * Two modes:
 *   - **object** — delete a whole object. Under touch this is the only mode, and
 *     long-press (600 ms) previews the `«--err»` outline without deleting.
 *   - **stroke** — split a stroke at the **nearest RAW points**. It is a point split,
 *     NEVER a polygon boolean (the spec is explicit; a boolean would lose pressure and
 *     produce an unaddressable fragment).
 *
 * **Stroke-scope is pen-only.** Under touch the stroke-mode control is hidden and the
 * panel shows `erase.strokeNeedsPen`. `effectiveEraseMode` encodes exactly that.
 */
import Konva from 'konva';
import type { Annotation, Px } from '@/domain/types';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { Command, History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import { ERASE_PREVIEW_MS, type MarkupTool } from './toolTypes';

export type EraseMode = 'object' | 'stroke';

/** Object mode is the only mode a finger gets; stroke-scope needs the pen. */
export function effectiveEraseMode(mode: EraseMode, pointerType: string): EraseMode {
  return pointerType === 'touch' ? 'object' : mode;
}

/** The stroke-mode control is hidden (and the note shown) under touch. */
export function strokeModeAvailable(pointerType: string): boolean {
  return pointerType !== 'touch';
}

/** Long-press preview fires at 600 ms. */
export function isErasePreview(durationMs: number): boolean {
  return durationMs >= ERASE_PREVIEW_MS;
}

/** The copy key for an object's name (`editor.eraseName*` / `editor.layersName*`). */
export function eraseNameKey(annotation: Annotation): string {
  switch (annotation.type) {
    case 'dimension':
      return 'eraseNameDimension';
    case 'rect':
      return 'eraseNameRectangle';
    case 'ellipse':
      return 'eraseNameEllipse';
    case 'line':
      return 'eraseNameLine';
    case 'arrow':
      return 'eraseNameArrow';
    case 'polygon':
      return 'eraseNamePolygon';
    case 'angle':
      return 'eraseNameAngle';
    case 'freehand':
      return 'layersNameFreehand';
    case 'highlight':
      return 'layersNameHighlight';
    case 'text':
      return 'layersNameText';
    default:
      return 'eraseNameObject';
  }
}

export interface StrokeSplit {
  first: { points: Px[]; pressure: number[] };
  second: { points: Px[]; pressure: number[] };
  index: number;
}

/**
 * Split a stroke at the nearest RAW sample to `at`. Returns `null` when the nearest
 * sample is an endpoint (nothing to split) or the stroke is too short. This is a point
 * split — the two halves keep their original pressure samples.
 */
export function splitStrokeAt(
  points: readonly Px[],
  pressure: readonly number[],
  at: Px,
  radiusImage: number,
): StrokeSplit | null {
  if (points.length < 3) return null;
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const d = Math.hypot(points[i].x - at.x, points[i].y - at.y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best <= 0 || best >= points.length - 1) return null;
  if (bestDist > radiusImage) return null;
  const slice = (from: number, to: number) => ({
    points: points.slice(from, to).map((p) => ({ ...p })),
    pressure: pressure.slice(from, to),
  });
  return { first: slice(0, best + 1), second: slice(best, points.length), index: best };
}

export interface EraseToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  /** Name copy for the undo toast, keyed by `eraseNameKey`. */
  objectName: (annotation: Annotation) => string;
  /**
   * Slice 1.10: the recoverable-delete toast (§13.3). `undo` re-runs the real history
   * step that removed the object — the toast's `Undo` must actually undo it, not just
   * say so.
   */
  onDeleteToast: (name: string, undo: () => void) => void;
  onSnapshot: (pending: boolean) => void;
  labels: { delete: string; split: string };
}

export class EraseTool implements MarkupTool {
  private readonly deps: EraseToolDeps;
  private mode: EraseMode = 'object';
  private previewKey: string | null = null;
  private previewGroup: Konva.Group | null = null;

  constructor(deps: EraseToolDeps) {
    this.deps = deps;
  }

  get pending(): boolean {
    return this.previewKey !== null;
  }

  get eraseMode(): EraseMode {
    return this.mode;
  }

  setMode(mode: EraseMode): void {
    this.mode = mode;
  }

  onPointerDown(point: Px, pointerType: string): 'consume' | 'pan' {
    const mode = effectiveEraseMode(this.mode, pointerType);
    if (mode === 'object') {
      const hit = this.hit(point);
      if (!hit) return 'pan';
      // Preview only; the lift deletes (so a drag-off can cancel).
      this.preview(hit);
      return 'consume';
    }
    return 'consume';
  }

  onPointerMove(): 'consume' | 'pan' {
    return this.previewKey ? 'consume' : 'pan';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    const mode = effectiveEraseMode(this.mode, pointerType);
    if (mode === 'object') {
      const key = this.previewKey;
      this.clearPreview();
      if (!key || !tapped) return;
      this.deleteObject(key);
      return;
    }
    if (tapped) this.splitAt(point, pointerType);
  }

  onPointerCancel(): void {
    this.clearPreview();
  }

  /** Long-press: show the `«--err»` outline + name, commit nothing. */
  beginPreview(point: Px): void {
    const hit = this.hit(point);
    if (hit) this.preview(hit);
  }

  /** The name of the object currently previewed (for the chip), or `null`. */
  previewName(): string | null {
    if (!this.previewKey) return null;
    const ann = this.deps.scene.get(this.previewKey);
    return ann ? this.deps.objectName(ann) : null;
  }

  private hit(point: Px): string | null {
    const screen = this.deps.canvas.imageToScreen(point);
    const target = this.deps.canvas.hitObject(screen);
    return target ? this.deps.scene.keyForAnnotationId(target.id) : null;
  }

  private deleteObject(key: string): void {
    const ann = this.deps.scene.get(key);
    if (!ann) return;
    const name = this.deps.objectName(ann);
    const snapshot = JSON.parse(JSON.stringify(ann)) as Annotation;
    this.deps.history.exec({
      label: `${this.deps.labels.delete} ${name}`.trim(),
      do: () => this.deps.scene.removeObject(key),
      undo: () => this.deps.scene.addAnnotation(snapshot),
    });
    this.deps.onDeleteToast(name, () => this.deps.history.undo());
  }

  /** Pen stroke-scope: split the nearest stroke under the contact. */
  private splitAt(point: Px, pointerType: string): void {
    if (!strokeModeAvailable(pointerType)) return;
    const key = this.hit(point);
    if (!key) return;
    const ann = this.deps.scene.get(key);
    if (!ann || (ann.geometry.kind !== 'freehand' && ann.geometry.kind !== 'highlight')) return;
    const radiusImage = 24 / this.deps.canvas.scale;
    const split = splitStrokeAt(ann.geometry.points, ann.geometry.pressure, point, radiusImage);
    if (!split) return;
    const original = JSON.parse(JSON.stringify(ann)) as Annotation;
    const firstId = ann.id;
    const secondId = (crypto.randomUUID as () => string)();
    const second: Annotation = {
      ...original,
      id: secondId,
      geometry: { kind: ann.geometry.kind, points: split.second.points, pressure: split.second.pressure },
      // The fragment sits just above its parent in the same band.
      zIndex: ann.zIndex + 1,
    } as Annotation;
    this.deps.history.exec({
      label: this.deps.labels.split,
      do: () => {
        this.deps.scene.setGeometry(firstId, {
          kind: ann.geometry.kind,
          points: split.first.points,
          pressure: split.first.pressure,
        } as Annotation['geometry']);
        if (!this.deps.scene.get(secondId)) this.deps.scene.addAnnotation(second);
      },
      undo: () => {
        this.deps.scene.removeObject(secondId);
        this.deps.scene.setGeometry(firstId, original.geometry);
      },
    } as Command);
  }

  private preview(key: string): void {
    this.clearPreview();
    const ann = this.deps.scene.get(key);
    const bounds = this.deps.scene.boundsAt(key);
    if (!ann || !bounds) return;
    const pad = 6 / this.deps.canvas.scale;
    const group = new Konva.Group({ listening: false });
    const rect = new Konva.Rect({
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
      stroke: '#FF5A5F',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: [6, 4],
    });
    rect.setAttr('strokeWidthMu', 2);
    group.add(rect);
    this.previewGroup = group;
    this.previewKey = key;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private clearPreview(): void {
    this.previewGroup?.destroy();
    this.previewGroup = null;
    this.previewKey = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  onToolChange(): void {
    this.clearPreview();
  }

  dispose(): void {
    this.clearPreview();
  }
}

/** The `--err` token used by the preview outline (Site Slate §3.1). */
export const ERR_COLOR = '#FF5A5F';
