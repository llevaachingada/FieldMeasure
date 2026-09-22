/**
 * `src/editor/shapes/scene.ts` — the in-memory markup document for one sheet, and its
 * imperative Konva sync (plan slice 1.5 build order step 2/5).
 *
 * **In-memory only in this slice.** Persisting `markup.json` (through the slice-1.2
 * `persistQueue`) is not part of the 1.5 packet; the document shape here is exactly the
 * §3.3 `Annotation[]`, so the 1.7/1.10 slice can serialize it without a rewrite. Labels
 * are never part of it (AGENTS #2 / §20): `serialize()` is asserted to contain no
 * `label` key.
 *
 * **Addressing is `AnnotationPath` keys, never array indices** (§8.3/§20.1). Every
 * mutator takes a `pathKey`; the scene never exposes an index-addressed write, so undo
 * cannot corrupt a sheet after a reorder.
 *
 * Geometry is working-image px (§4.1); Konva node sync is imperative and rebuilds the
 * group on change (cheap at v1 counts, and it keeps the §4.2 screen rules in one place,
 * `buildDimensionGroup`).
 */
import Konva from 'konva';
import type { Annotation, AnnotationStyle, Px, UUID } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import type { LabelContext } from './dimensionLabel';
import { applyDimensionLabel, buildDimensionGroup } from './renderDimension';

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

export const Z_HIGHLIGHT_BASE = 0;
export const Z_MAIN_BASE = 1000;
const Z_STEP = 10;

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
}

export class MarkupScene {
  private readonly layer: Konva.Layer;
  private readonly style: AnnotationStyle;
  private readonly newId: () => string;
  private ctx: LabelContext;
  private ghostText: string;
  private scale = 1;
  private objects: Annotation[] = [];
  private groups = new Map<string, Konva.Group>();

  constructor(options: MarkupSceneOptions) {
    this.layer = options.layer;
    this.ctx = options.ctx;
    this.ghostText = options.ghostText;
    this.style = options.style ?? DEFAULT_STYLE;
    this.newId = options.newId ?? (() => crypto.randomUUID());
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

  private nextZIndex(): number {
    let max = Z_MAIN_BASE - Z_STEP;
    for (const o of this.objects) max = Math.max(max, o.zIndex);
    return max + Z_STEP;
  }

  /** Add a dimension at `a→b` (value pending). `id` may be supplied for idempotent redo. */
  addDimension(a: Px, b: Px, id?: string): Annotation {
    const annotation: Annotation = {
      id: id ?? this.newId(),
      type: 'dimension',
      geometry: { kind: 'dimension', a: { ...a }, b: { ...b } },
      valueMm: null,
      enteredText: null,
      style: { ...this.style },
      zIndex: this.nextZIndex(),
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
    return annotation;
  }

  removeObject(pathKey: string): void {
    const index = this.objects.findIndex((o) => o.id === pathKey);
    if (index < 0) return;
    this.objects.splice(index, 1);
    this.groups.get(pathKey)?.destroy();
    this.groups.delete(pathKey);
    this.layer.batchDraw();
  }

  setValue(pathKey: string, valueMm: number | null, enteredText: string | null): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.valueMm = valueMm;
    ann.enteredText = enteredText;
    this.sync(pathKey);
  }

  /** Move one endpoint (post-place refinement / the Nudge Pad). */
  setAnchor(pathKey: string, which: 'a' | 'b', p: Px): void {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return;
    ann.geometry.a = which === 'a' ? { ...p } : ann.geometry.a;
    ann.geometry.b = which === 'b' ? { ...p } : ann.geometry.b;
    this.sync(pathKey);
  }

  /** Translate the whole object (object-first one-finger drag). */
  moveObject(pathKey: string, dx: number, dy: number): void {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return;
    ann.geometry.a = { x: ann.geometry.a.x + dx, y: ann.geometry.a.y + dy };
    ann.geometry.b = { x: ann.geometry.b.x + dx, y: ann.geometry.b.y + dy };
    this.sync(pathKey);
  }

  /** The two anchors of a dimension, or `null`. */
  geometryAt(pathKey: string): { a: Px; b: Px } | null {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return null;
    return { a: { ...ann.geometry.a }, b: { ...ann.geometry.b } };
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
    if (!ann || ann.geometry.kind !== 'dimension') return;
    this.groups.get(pathKey)?.destroy();
    const group = buildDimensionGroup({
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
    this.groups.set(pathKey, group);
    this.layer.add(group);
    this.layer.batchDraw();
  }

  /**
   * The serialized document. This is the artefact the "no stored label" gate scans:
   * every annotation must be the §3.3 shape and carry no `label` key.
   */
  serialize(): Annotation[] {
    return this.objects.map((o) => ({
      ...o,
      geometry: { ...o.geometry },
      style: { ...o.style },
    }));
  }
}
