/**
 * `src/editor/shapes/scene.ts` — the in-memory markup document for one sheet, and its
 * imperative Konva sync (plan slice 1.5 build order step 2/5; extended for every markup
 * kind in slice 1.6).
 *
 * The document is exactly the §3.3 `Annotation[]`. Labels are never part of it
 * (AGENTS #2 / §20): `serialize()` carries no `label` key. In slice 1.6 the document is
 * also **persisted** to the sheet's `markup.json` through `src/state/persistQueue.ts`
 * (`markupFile()` / `load()`), closing the gap D70 recorded.
 *
 * **Addressing is `AnnotationPath` keys, never array indices** (§8.3/§20.1). Every
 * mutator takes a `pathKey`; the scene never exposes an index-addressed write, so undo
 * cannot corrupt a sheet after a reorder.
 *
 * **zIndex bands (§20.2).** Highlighter sits BELOW all other markup and above the photo
 * (`Z_HIGHLIGHT_BASE`), every other kind above it (`Z_MAIN_BASE`). Insertion re-sorts the
 * layer children by `zIndex`, so a new highlighter is always drawn under existing markup.
 *
 * Geometry is working-image px (§4.1); Konva node sync is imperative and rebuilds the
 * group on change.
 */
import Konva from 'konva';
import type { Annotation, AnnotationStyle, Geometry, Px, UUID } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { LabelContext } from './dimensionLabel';
import { applyDimensionLabel, buildDimensionGroup } from './renderDimension';
import { buildShapeGroup, shapeBounds } from './renderShape';
import { buildInkGroup } from './renderInk';
import { buildTextGroup } from './renderText';

/* ------------------------------------------------------------------ *
 * §20.1 AnnotationPath — the address of an annotation
 * ------------------------------------------------------------------ */

/** The address of one annotation within a sheet. Stable across reorders (ids, never indices). */
export type AnnotationPath =
  | { kind: 'top'; annotationId: UUID }
  | { kind: 'child'; insetId: UUID; annotationId: UUID };

/** Canonical string form — used as a Set/Map key and as the `selection[]` element (§20.1). */
export function pathToKey(p: AnnotationPath): string {
  return p.kind === 'top' ? p.annotationId : `${p.insetId}/${p.annotationId}`;
}

export function keyToPath(key: string): AnnotationPath {
  const i = key.indexOf('/');
  return i < 0
    ? { kind: 'top', annotationId: key }
    : { kind: 'child', insetId: key.slice(0, i), annotationId: key.slice(i + 1) };
}

/* ------------------------------------------------------------------ *
 * zIndex bands (§20.2)
 * ------------------------------------------------------------------ */

/** Highlighter band: below all other markup, above the photo. */
export const Z_HIGHLIGHT_BASE = 0;
/** Every other markup kind. */
export const Z_MAIN_BASE = 1000;
const Z_STEP = 10;

/** The highlighter is the only kind that lives in the lower band. */
export function isLowerBand(kind: Annotation['type']): boolean {
  return kind === 'highlight';
}

/* ------------------------------------------------------------------ *
 * Geometry translation (pure)
 * ------------------------------------------------------------------ */

/** Translate any geometry by `(dx, dy)` in image space. Returns a fresh object. */
export function translateGeometry(geometry: Geometry, dx: number, dy: number): Geometry {
  switch (geometry.kind) {
    case 'dimension':
      return { ...geometry, a: { x: geometry.a.x + dx, y: geometry.a.y + dy }, b: { x: geometry.b.x + dx, y: geometry.b.y + dy } };
    case 'angle':
      return {
        ...geometry,
        a: { x: geometry.a.x + dx, y: geometry.a.y + dy },
        vertex: { x: geometry.vertex.x + dx, y: geometry.vertex.y + dy },
        c: { x: geometry.c.x + dx, y: geometry.c.y + dy },
      };
    case 'line':
    case 'arrow':
      return { ...geometry, a: { x: geometry.a.x + dx, y: geometry.a.y + dy }, b: { x: geometry.b.x + dx, y: geometry.b.y + dy } };
    case 'rect':
    case 'ellipse':
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return { ...geometry, points: geometry.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'text':
      return { ...geometry, at: { x: geometry.at.x + dx, y: geometry.at.y + dy } };
    case 'image':
      return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
  }
}

/** Axis-aligned bounds of any geometry in image space. */
export function geometryBounds(geometry: Geometry): { x: number; y: number; width: number; height: number } {
  switch (geometry.kind) {
    case 'dimension':
    case 'line':
    case 'arrow': {
      const x = Math.min(geometry.a.x, geometry.b.x);
      const y = Math.min(geometry.a.y, geometry.b.y);
      return { x, y, width: Math.abs(geometry.b.x - geometry.a.x), height: Math.abs(geometry.b.y - geometry.a.y) };
    }
    case 'angle': {
      const xs = [geometry.a.x, geometry.vertex.x, geometry.c.x];
      const ys = [geometry.a.y, geometry.vertex.y, geometry.c.y];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case 'rect':
    case 'ellipse':
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    case 'polygon':
    case 'freehand':
    case 'highlight': {
      if (geometry.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const xs = geometry.points.map((p) => p.x);
      const ys = geometry.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
    case 'text':
      return { x: geometry.at.x, y: geometry.at.y, width: 0, height: 0 };
    case 'image':
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
  }
}

/* ------------------------------------------------------------------ *
 * MarkupScene
 * ------------------------------------------------------------------ */

export interface MarkupSceneOptions {
  layer: Konva.Layer;
  ctx: LabelContext;
  /** `dimension.ghostLabel` — owned by the caller (strings.ts), never copy here. */
  ghostText: string;
  style?: AnnotationStyle;
  /** Injected so tests are deterministic; `crypto.randomUUID` in the app (§2.2). */
  newId?: () => string;
  /** §8.5 text auto-contrast: mean luminance of a 48×48 region under a point. */
  sampleLuminance?: (at: Px) => number | null;
}

export interface NewAnnotation {
  type: Annotation['type'];
  geometry: Geometry;
  style?: AnnotationStyle;
  valueMm?: number | null;
  valueDeg?: number | null;
  enteredText?: string | null;
}

export class MarkupScene {
  private readonly layer: Konva.Layer;
  private readonly style: AnnotationStyle;
  private readonly newId: () => string;
  private luminanceSampler: (at: Px) => number | null;
  private ctx: LabelContext;
  private ghostText: string;
  private scale = 1;
  private objects: Annotation[] = [];
  private groups = new Map<string, Konva.Group>();
  /** Fired after every document mutation (the persistence seam). */
  onChange: (() => void) | null = null;

  constructor(options: MarkupSceneOptions) {
    this.layer = options.layer;
    this.ctx = options.ctx;
    this.ghostText = options.ghostText;
    this.style = options.style ?? DEFAULT_STYLE;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.luminanceSampler = options.sampleLuminance ?? (() => null);
  }

  /** Read-only view of the document (the §3.3 `Annotation[]`). */
  list(): readonly Annotation[] {
    return this.objects;
  }

  get(pathKey: string): Annotation | undefined {
    return this.objects.find((o) => o.id === pathKey);
  }

  getNode(pathKey: string): Konva.Group | undefined {
    return this.groups.get(pathKey);
  }

  /** Resolve a hit-test `annotationId` to a path key (top-level only in this slice). */
  keyForAnnotationId(id: string): string | null {
    return this.objects.some((o) => o.id === id) ? id : null;
  }

  /** The lowest available zIndex in the object's band. */
  private nextZIndex(kind: Annotation['type']): number {
    const lower = isLowerBand(kind);
    const floor = lower ? Z_HIGHLIGHT_BASE : Z_MAIN_BASE;
    const ceiling = lower ? Z_MAIN_BASE : Number.POSITIVE_INFINITY;
    let max = floor - Z_STEP;
    for (const o of this.objects) {
      if (o.zIndex >= floor && o.zIndex < ceiling) max = Math.max(max, o.zIndex);
    }
    return max + Z_STEP;
  }

  /** Add a dimension at `a→b` (value pending). `id` may be supplied for idempotent redo. */
  addDimension(a: Px, b: Px, id?: string): Annotation {
    return this.addAnnotation({
      id: id ?? this.newId(),
      type: 'dimension',
      geometry: { kind: 'dimension', a: { ...a }, b: { ...b } },
      valueMm: null,
      enteredText: null,
      style: { ...this.style },
      zIndex: this.nextZIndex('dimension'),
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    });
  }

  /** Add any markup kind. `id` may be supplied for idempotent redo. */
  addMarkup(input: NewAnnotation, id?: string): Annotation {
    const annotation: Annotation = {
      id: id ?? this.newId(),
      type: input.type,
      geometry: input.geometry,
      valueMm: input.valueMm ?? null,
      ...(input.type === 'angle' ? { valueDeg: input.valueDeg ?? null } : {}),
      enteredText: input.enteredText ?? null,
      style: input.style ?? { ...this.style },
      zIndex: this.nextZIndex(input.type),
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    };
    return this.addAnnotation(annotation);
  }

  /** Insert an existing annotation (undo of a delete re-inserts the captured object). */
  addAnnotation(annotation: Annotation): Annotation {
    if (this.objects.some((o) => o.id === annotation.id)) return annotation;
    this.objects.push(annotation);
    this.sync(annotation.id);
    this.resort();
    this.notify();
    return annotation;
  }

  removeObject(pathKey: string): void {
    const index = this.objects.findIndex((o) => o.id === pathKey);
    if (index < 0) return;
    this.objects.splice(index, 1);
    this.groups.get(pathKey)?.destroy();
    this.groups.delete(pathKey);
    this.resort();
    this.layer.batchDraw();
    this.notify();
  }

  setValue(pathKey: string, valueMm: number | null, enteredText: string | null): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.valueMm = valueMm;
    ann.enteredText = enteredText;
    this.sync(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Angle commit: the typed derivation (`valueDeg`) plus its `enteredText`. */
  setAngleValue(pathKey: string, valueDeg: number | null, enteredText: string | null): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.valueDeg = valueDeg;
    ann.enteredText = enteredText;
    this.sync(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Move one endpoint (post-place refinement / the Nudge Pad). */
  setAnchor(pathKey: string, which: 'a' | 'b', p: Px): void {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return;
    ann.geometry.a = which === 'a' ? { ...p } : ann.geometry.a;
    ann.geometry.b = which === 'b' ? { ...p } : ann.geometry.b;
    this.sync(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Replace a whole geometry (generic drag/transform). */
  setGeometry(pathKey: string, geometry: Geometry): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.geometry = geometry;
    this.sync(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Deep copy of one object's geometry, or `null`. */
  geometryCopy(pathKey: string): Geometry | null {
    const ann = this.get(pathKey);
    return ann ? (JSON.parse(JSON.stringify(ann.geometry)) as Geometry) : null;
  }

  /** Translate the whole object (object-first one-finger drag). */
  moveObject(pathKey: string, dx: number, dy: number): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.geometry = translateGeometry(ann.geometry, dx, dy);
    this.sync(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** The two anchors of a dimension, or `null`. */
  geometryAt(pathKey: string): { a: Px; b: Px } | null {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return null;
    return { a: { ...ann.geometry.a }, b: { ...ann.geometry.b } };
  }

  /** Image-space axis-aligned bounds of an object (selection frame base). */
  boundsAt(pathKey: string): { x: number; y: number; width: number; height: number } | null {
    const ann = this.get(pathKey);
    return ann ? geometryBounds(ann.geometry) : null;
  }

  /** All objects under an axis-aligned image-space rect (marquee). */
  keysInRect(rect: { x: number; y: number; width: number; height: number }): string[] {
    const keys: string[] = [];
    for (const o of this.objects) {
      if (o.locked) continue;
      const b = geometryBounds(o.geometry);
      const intersects =
        b.x <= rect.x + rect.width &&
        b.x + b.width >= rect.x &&
        b.y <= rect.y + rect.height &&
        b.y + b.height >= rect.y;
      if (intersects) keys.push(o.id);
    }
    return keys;
  }

  /** Re-derive every label at a new precision/unit context (no re-render of geometry). */
  setContext(ctx: LabelContext): void {
    this.ctx = ctx;
    for (const ann of this.objects) {
      const group = this.groups.get(ann.id);
      if (group) applyDimensionLabel(group, { ...this.labelInput(ann), ctx, scale: this.scale });
    }
    this.layer.batchDraw();
  }

  setScale(scale: number): void {
    this.scale = scale;
    for (const ann of this.objects) {
      const group = this.groups.get(ann.id);
      if (group) applyDimensionLabel(group, { ...this.labelInput(ann), scale });
    }
    this.layer.batchDraw();
  }

  /** Update the text auto-contrast sampler (the canvas supplies the bitmap). */
  setLuminanceSampler(fn: ((at: Px) => number | null) | null): void {
    this.luminanceSampler = fn ?? (() => null);
  }

  private labelInput(ann: Annotation): {
    valueMm: number | null;
    ctx: LabelContext;
    ghostText: string;
    style: AnnotationStyle;
    scale: number;
  } {
    return {
      valueMm: ann.valueMm ?? null,
      ctx: this.ctx,
      ghostText: this.ghostText,
      style: ann.style,
      scale: this.scale,
    };
  }

  /** Rebuild one annotation's Konva group in place. */
  private sync(pathKey: string): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    this.groups.get(pathKey)?.destroy();

    let group: Konva.Group;
    switch (ann.geometry.kind) {
      case 'dimension':
        group = buildDimensionGroup({
          id: ann.id,
          a: ann.geometry.a,
          b: ann.geometry.b,
          valueMm: ann.valueMm ?? null,
          enteredText: ann.enteredText ?? null,
          style: ann.style,
          ctx: this.ctx,
          scale: this.scale,
          ghostText: this.ghostText,
          locked: ann.locked,
        });
        break;
      case 'line':
      case 'arrow':
      case 'rect':
      case 'ellipse':
      case 'polygon':
      case 'angle':
        group = buildShapeGroup({
          id: ann.id,
          kind: ann.geometry.kind,
          geometry: ann.geometry,
          style: ann.style,
          ctx: { scale: this.scale },
          locked: ann.locked,
        });
        break;
      case 'freehand':
      case 'highlight':
        group = buildInkGroup({
          id: ann.id,
          kind: ann.geometry.kind,
          points: ann.geometry.points,
          pressure: ann.geometry.pressure,
          style: ann.style,
          scale: this.scale,
          locked: ann.locked,
        });
        break;
      case 'text': {
        const sampler = this.luminanceSampler;
        group = buildTextGroup({
          id: ann.id,
          at: ann.geometry.at,
          text: ann.geometry.text,
          background: ann.geometry.background,
          style: ann.style,
          scale: this.scale,
          luminance: sampler ? sampler(ann.geometry.at) : null,
          locked: ann.locked,
        });
        break;
      }
      case 'image':
        // Image insets are slice 1.7; the document supports the kind, no renderer yet.
        group = new Konva.Group({ listening: true });
        group.setAttr('annotationId', ann.id);
        group.setAttr('kind', 'image');
        group.setAttr('locked', ann.locked);
        break;
    }

    this.groups.set(pathKey, group);
    group.setAttr('zIndex', ann.zIndex);
    this.layer.add(group);
    this.layer.batchDraw();
  }

  /** Re-sort the layer's children by the document's zIndex (bands preserved). */
  private resort(): void {
    const ordered = [...this.objects].sort((a, b) => a.zIndex - b.zIndex);
    ordered.forEach((ann, index) => {
      const group = this.groups.get(ann.id);
      if (group?.getParent()) group.zIndex(index);
    });
    this.layer.batchDraw();
  }

  /** Fire the persistence seam after a mutation. */
  private notify(): void {
    this.onChange?.();
  }

  /**
   * The serialized document. This is the artefact the "no stored label" gate scans:
   * every annotation must be the §3.3 shape and carry no `label` key.
   */
  serialize(): Annotation[] {
    return this.objects.map((o) => ({
      ...o,
      geometry: JSON.parse(JSON.stringify(o.geometry)) as Geometry,
      style: { ...o.style },
    }));
  }

  /** The on-disk `markup.json` envelope (§3.4 `MarkupFileZ`). */
  markupFile(sheetId: string, schemaVersion = 1): {
    schemaVersion: number;
    sheetId: string;
    objects: Annotation[];
  } {
    return { schemaVersion, sheetId, objects: this.serialize() };
  }

  /**
   * Replace the document with a restored set (persistence load). Clears every node and
   * re-syncs; z-order is re-derived from each object's stored `zIndex`.
   */
  load(annotations: readonly Annotation[]): void {
    for (const group of this.groups.values()) group.destroy();
    this.groups.clear();
    this.objects = annotations.map((a) => ({
      ...a,
      geometry: JSON.parse(JSON.stringify(a.geometry)) as Geometry,
      style: { ...a.style },
    }));
    for (const ann of this.objects) this.sync(ann.id);
    this.resort();
    this.notify();
  }

  /** Every object's `{key, kind}` in painter order (bands included). */
  entries(): Array<{ key: string; kind: Annotation['type'] }> {
    return [...this.objects]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((o) => ({ key: o.id, kind: o.type }));
  }

  /** Bounds helper for a shape kind (re-exported for tools/tests). */
  static shapeBounds = shapeBounds;
}
