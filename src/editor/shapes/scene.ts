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
import { buildInsetGroup, type InsetAssetImage } from '@/editor/inset/renderInset';
import { sheetToAsset, type InsetImageGeometry } from '@/editor/inset/insetGeometry';
import type { Command } from '@/editor/history';
import {
  createPatchStyleCommand,
  createReplaceStyleCommand,
  type StyleTarget,
} from './styleCommand';

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
  /**
   * Slice 1.7: the layer image insets render into. Per §8.1/§20.2 insets sit BELOW the
   * markup layer, so every object created outside Focus renders above all insets.
   * Defaults to `layer` (single-layer callers/tests), but the shell MUST pass
   * `canvas.insetLayer` for the layering rule to hold.
   */
  insetLayer?: Konva.Layer;
  ctx: LabelContext;
  /** `dimension.ghostLabel` — owned by the caller (strings.ts), never copy here. */
  ghostText: string;
  style?: AnnotationStyle;
  /** Injected so tests are deterministic; `crypto.randomUUID` in the app (§2.2). */
  newId?: () => string;
  /** §8.5 text auto-contrast: mean luminance of a 48×48 region under a point. */
  sampleLuminance?: (at: Px) => number | null;
  /**
   * Resolve an inset asset id to a decoded bitmap + its working-image dimensions.
   * Injected so `scene.ts` stays free of the decode/storage layers; returns `null`
   * while the asset is still loading, which renders the inset's placeholder.
   */
  assetProvider?: (assetId: string) => InsetAssetImage | null;
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
  /** Insets render here when supplied; otherwise they share `layer`. */
  private readonly insetLayer: Konva.Layer;
  private readonly style: AnnotationStyle;
  private readonly newId: () => string;
  private luminanceSampler: (at: Px) => number | null;
  private assetProvider: (assetId: string) => InsetAssetImage | null;
  private ctx: LabelContext;
  private ghostText: string;
  private scale = 1;
  private objects: Annotation[] = [];
  private groups = new Map<string, Konva.Group>();
  /** Fired after every document mutation (the persistence seam). */
  onChange: (() => void) | null = null;

  constructor(options: MarkupSceneOptions) {
    this.layer = options.layer;
    this.insetLayer = options.insetLayer ?? options.layer;
    this.ctx = options.ctx;
    this.ghostText = options.ghostText;
    this.style = options.style ?? DEFAULT_STYLE;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.luminanceSampler = options.sampleLuminance ?? (() => null);
    this.assetProvider = options.assetProvider ?? (() => null);
  }

  /** Read-only view of the document (the §3.3 `Annotation[]`). */
  list(): readonly Annotation[] {
    return this.objects;
  }

  /**
   * Slice 1.7: an annotation by path key, **top-level or child** (`insetId/childId`).
   * The child lookup is what lets Focus-mode tools address inside an inset.
   */
  get(pathKey: string): Annotation | undefined {
    return this.locate(pathKey)?.ann;
  }

  getNode(pathKey: string): Konva.Group | undefined {
    return this.groups.get(pathKey);
  }

  /** Resolve a hit-test `annotationId` to a path key (top-level OR a child). */
  keyForAnnotationId(id: string): string | null {
    for (const o of this.objects) {
      if (o.id === id) return id;
      const child = (o.children ?? []).find((c) => c.id === id);
      if (child) return pathToKey({ kind: 'child', insetId: o.id, annotationId: child.id });
    }
    return null;
  }

  /**
   * Locate a path key in the document. `owner` is the parent inset for a child, and
   * `null` for a top-level annotation — the single place child addressing is resolved.
   */
  private locate(pathKey: string): { ann: Annotation; owner: Annotation | null } | null {
    const slash = pathKey.indexOf('/');
    if (slash < 0) {
      const ann = this.objects.find((o) => o.id === pathKey);
      return ann ? { ann, owner: null } : null;
    }
    const insetId = pathKey.slice(0, slash);
    const childId = pathKey.slice(slash + 1);
    const owner = this.objects.find((o) => o.id === insetId);
    if (!owner) return null;
    const ann = (owner.children ?? []).find((c) => c.id === childId);
    return ann ? { ann, owner } : null;
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

  /**
   * Insert an image inset (§8.5). `geometry` is in SHEET px with `crop` in ASSET px.
   * `id` may be supplied so a cascaded multi-select is one idempotent redo step.
   */
  addInset(assetId: string, geometry: InsetImageGeometry, id?: string): Annotation {
    return this.addAnnotation({
      id: id ?? this.newId(),
      type: 'image',
      geometry: { ...geometry },
      valueMm: null,
      enteredText: null,
      style: { ...this.style },
      zIndex: this.nextZIndex('image'),
      source: 'manual',
      assetId,
      groupId: null,
      locked: false,
    });
  }

  /** Add any markup kind. `id` may be supplied for idempotent redo. */
  addMarkup(input: NewAnnotation, id?: string): Annotation {    const annotation: Annotation = {
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
    const loc = this.locate(pathKey);
    if (!loc) return;
    if (loc.owner) {
      // A child lives inside its inset's group: splice it from the inset's `children`
      // and rebuild the inset. It never touches the sheet's z-bands (§20.2).
      const children = loc.owner.children;
      if (!children) return;
      const index = children.indexOf(loc.ann);
      if (index >= 0) children.splice(index, 1);
      if (children.length === 0) delete loc.owner.children;
      this.groups.get(pathKey)?.destroy();
      this.groups.delete(pathKey);
      this.sync(loc.owner.id);
      this.notify();
      return;
    }
    const index = this.objects.findIndex((o) => o.id === pathKey);
    if (index < 0) return;
    this.objects.splice(index, 1);
    this.destroyChildNodes(pathKey);
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
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Angle commit: the typed derivation (`valueDeg`) plus its `enteredText`. */
  setAngleValue(pathKey: string, valueDeg: number | null, enteredText: string | null): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.valueDeg = valueDeg;
    ann.enteredText = enteredText;
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /**
   * Slice 1.6 wiring — the Layers panel's eye toggle. `visible === false` hides the
   * object; absent/null is visible. Emits `onChange` (the persistence seam).
   */
  setVisible(pathKey: string, visible: boolean): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.visible = visible;
    this.groups.get(pathKey)?.visible(visible);
    this.layer.batchDraw();
    this.notify();
  }

  /**
   * Slice 1.6 wiring — the Layers panel's lock toggle. Uses the EXISTING `locked`
   * field; re-syncs so the renderer's locked treatment updates. Emits `onChange`.
   */
  setLocked(pathKey: string, locked: boolean): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.locked = locked;
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /**
   * Slice 1.8 (lane C1) — apply ONE style to a selection as a single undo step (§7.4
   * #2/#3). Returns the `Command`; the shell runs it with `history.exec(...)` so a
   * multi-object style change is exactly one undo step, and `execCoalesced` can fold a
   * held scrubber into that one step. Addressing is by path key (child keys included).
   *
   * After it runs, every selected object shares `style`, so `selectionStyleState` over
   * them reports `'single'` — the observable that the panel's indeterminate state cleared.
   */
  styleCommand(pathKeys: readonly string[], style: AnnotationStyle, label: string): Command {
    return createReplaceStyleCommand(this.styleTarget(), pathKeys, style, label);
  }

  /**
   * Slice 1.8 (lane C1) — merge a `Partial<AnnotationStyle>` into a selection as one undo
   * step. Keys the patch does not name are left as each object had them (so a patched key
   * clears its indeterminate state; a full replace converges the whole style).
   */
  patchStyleCommand(
    pathKeys: readonly string[],
    patch: Partial<AnnotationStyle>,
    label: string,
  ): Command {
    return createPatchStyleCommand(this.styleTarget(), pathKeys, patch, label);
  }

  /**
   * Low-level style write, the shared path for both commands (and for a single tool-style
   * change the shell applies directly). Rebuilds the node and fires `onChange` — the
   * persistence seam — exactly like every other mutator. Unknown keys are a no-op.
   */
  setStyle(pathKey: string, style: AnnotationStyle): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.style = { ...style };
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** The read/write adapter the style commands operate on. */
  private styleTarget(): StyleTarget {
    return {
      getStyle: (pathKey) => this.get(pathKey)?.style,
      setStyle: (pathKey, style) => this.setStyle(pathKey, style),
    };
  }

  /**
   * Slice 1.6 wiring — the Layers panel's rename channel. Annotations carry **no name
   * field** (names are DERIVED at render time, AGENTS #2); the editable title lives on
   * `SheetFile.title`, not on an annotation. This is therefore a documented no-op: it
   * exists so the shell has one honest place to route the panel's `onRename`, and so
   * no stored name can ever go stale. It deliberately does NOT emit `onChange`.
   */
  rename(pathKey: string, name: string): void {
    void pathKey;
    void name;
  }

  /**
   * Slice 1.6 reorder (anchor-based — the fix for the group-index vs band-index mismatch).
   *
   * Place `pathKey` immediately IN FRONT of `anchorKey` in painter order: `pathKey` takes
   * `anchorKey`'s zIndex slot and `anchorKey` (with everything behind it **in the same
   * band**) shifts one slot toward the back. `anchorKey === null` means the FRONT of
   * `pathKey`'s own §20.2 band. Both the moved object and the anchor are filtered to the
   * SAME band, so the caller cannot express a cross-band move — §20.2 is inviolable by
   * construction.
   *
   * Returns `false` and changes NOTHING when `pathKey` is unknown, the anchor is unknown,
   * the anchor is `pathKey` itself, or the anchor lives in the other §20.2 band. The shell
   * surfaces `editor.highlighterBandMessage` on `false`: a single Layers `ink` block holds
   * both `freehand` (main band) and `highlight` (lower band), so the panel's own same-block
   * test cannot distinguish them.
   */
  moveInBandBefore(pathKey: string, anchorKey: string | null): boolean {
    // A child is not a member of any sheet band (§20.2) — its order lives inside its
    // inset's group, so a reorder of it is unexpressible here.
    if (pathKey.includes('/') || (anchorKey ?? '').includes('/')) return false;
    const ann = this.get(pathKey);
    if (!ann) return false;
    const lower = isLowerBand(ann.type);
    // Band members, front-first (highest zIndex first).
    const members = this.objects
      .filter((o) => isLowerBand(o.type) === lower)
      .sort((a, b) => b.zIndex - a.zIndex);
    const reduced = members.filter((o) => o.id !== ann.id);
    let insertAt: number;
    if (anchorKey === null) {
      insertAt = 0;
    } else {
      const anchor = this.get(anchorKey);
      if (!anchor || anchor.id === ann.id) return false;
      if (isLowerBand(anchor.type) !== lower) return false;
      const ai = reduced.findIndex((o) => o.id === anchor.id);
      if (ai < 0) return false;
      insertAt = ai; // immediately in front of the anchor == the anchor's own slot
    }
    const clamped = Math.max(0, Math.min(insertAt, reduced.length));
    const ordered = [...reduced];
    ordered.splice(clamped, 0, ann);
    // `ordered` is front-first; painter order is back-first, so assign the band's ascending
    // zIndex slots in reverse. Reusing the band's slots keeps it inside its floor/ceiling.
    const slots = members.map((o) => o.zIndex).sort((a, b) => a - b);
    [...ordered].reverse().forEach((o, i) => {
      o.zIndex = slots[i];
    });
    this.resort();
    this.notify();
    return true;
  }

  /**
   * Move `pathKey` to the BACK of its own §20.2 band (its lowest zIndex slot). Used for a
   * reorder whose rest index is at/after the end of the row's group block. Returns `false`
   * when `pathKey` is unknown; a no-op when it is already back-most.
   */
  moveInBandToBack(pathKey: string): boolean {
    if (pathKey.includes('/')) return false;
    const ann = this.get(pathKey);
    if (!ann) return false;
    const lower = isLowerBand(ann.type);
    const members = this.objects
      .filter((o) => isLowerBand(o.type) === lower)
      .sort((a, b) => b.zIndex - a.zIndex);
    if (members[members.length - 1]?.id === ann.id) return true; // already back-most
    const ordered = [...members.filter((o) => o.id !== ann.id), ann];
    const slots = members.map((o) => o.zIndex).sort((a, b) => a - b);
    [...ordered].reverse().forEach((o, i) => {
      o.zIndex = slots[i];
    });
    this.resort();
    this.notify();
    return true;
  }

  /** Move one endpoint (post-place refinement / the Nudge Pad). */
  setAnchor(pathKey: string, which: 'a' | 'b', p: Px): void {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return;
    ann.geometry.a = which === 'a' ? { ...p } : ann.geometry.a;
    ann.geometry.b = which === 'b' ? { ...p } : ann.geometry.b;
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Replace a whole geometry (generic drag/transform). Child keys rebuild the inset. */
  setGeometry(pathKey: string, geometry: Geometry): void {
    const ann = this.get(pathKey);
    if (!ann) return;
    ann.geometry = geometry;
    this.syncOwner(pathKey);
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
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** The two anchors of a dimension, or `null`. */
  geometryAt(pathKey: string): { a: Px; b: Px } | null {
    const ann = this.get(pathKey);
    if (!ann || ann.geometry.kind !== 'dimension') return null;
    return { a: { ...ann.geometry.a }, b: { ...ann.geometry.b } };
  }

  /**
   * Axis-aligned bounds of an object (selection frame base). **A child key returns its
   * bounds in its INSET's asset px**, because that is the space a child's geometry is
   * stored in (§8.5); for a top-level key it is sheet px as before.
   */
  boundsAt(pathKey: string): { x: number; y: number; width: number; height: number } | null {
    const ann = this.get(pathKey);
    return ann ? geometryBounds(ann.geometry) : null;
  }

  /**
   * Sheet-space marquee. Only top-level objects participate: a child is not a member of
   * any sheet band (§20.2), so a sheet marquee must never select it. Pass
   * `{ insetId }` to query ONE inset's children in that inset's ASSET space instead
   * (the Focus-mode marquee); the returned keys are full `insetId/childId` paths.
   */
  keysInRect(
    rect: { x: number; y: number; width: number; height: number },
    opts?: { insetId?: string },
  ): string[] {
    const intersects = (b: { x: number; y: number; width: number; height: number }): boolean =>
      b.x <= rect.x + rect.width &&
      b.x + b.width >= rect.x &&
      b.y <= rect.y + rect.height &&
      b.y + b.height >= rect.y;
    if (opts?.insetId) {
      const inset = this.objects.find((o) => o.id === opts.insetId);
      if (!inset) return [];
      const keys: string[] = [];
      for (const child of inset.children ?? []) {
        if (child.locked) continue;
        if (intersects(geometryBounds(child.geometry))) {
          keys.push(pathToKey({ kind: 'child', insetId: inset.id, annotationId: child.id }));
        }
      }
      return keys;
    }
    const keys: string[] = [];
    for (const o of this.objects) {
      if (o.locked) continue;
      if (intersects(geometryBounds(o.geometry))) keys.push(o.id);
    }
    return keys;
  }

  /** Re-derive every label at a new precision/unit context (no re-render of geometry). */
  setContext(ctx: LabelContext): void {
    this.ctx = ctx;
    for (const ann of this.objects) this.refreshLabels(ann, this.scale, ctx);
    this.layer.batchDraw();
  }

  setScale(scale: number): void {
    this.scale = scale;
    for (const ann of this.objects) this.refreshLabels(ann, scale);
    this.layer.batchDraw();
  }

  /**
   * Re-derive the labels of one annotation AND its inset children. Child labels live in
   * the child's own group, so a top-level-only walk would leave them stale on a
   * precision/unit change (a wrong-measurement bug).
   */
  private refreshLabels(ann: Annotation, scale: number, ctx: LabelContext = this.ctx): void {
    const group = this.groups.get(ann.id);
    if (group) applyDimensionLabel(group, { ...this.labelInput(ann), ctx, scale });
    for (const child of ann.children ?? []) {
      const childGroup = this.groups.get(`${ann.id}/${child.id}`);
      if (childGroup) applyDimensionLabel(childGroup, { ...this.labelInput(child), ctx, scale });
    }
  }

  /** Update the text auto-contrast sampler (the canvas supplies the bitmap). */
  setLuminanceSampler(fn: ((at: Px) => number | null) | null): void {
    this.luminanceSampler = fn ?? (() => null);
  }

  /**
   * Slice 1.7: swap the asset resolver after an async decode completes (then re-sync
   * every inset so the placeholder is replaced by the photo). Also used by tests.
   */
  setAssetProvider(fn: ((assetId: string) => InsetAssetImage | null) | null): void {
    this.assetProvider = fn ?? (() => null);
  }

  /** Rebuild every inset (e.g. after assets finish decoding). */
  refreshInsets(): void {
    for (const ann of this.objects) {
      if (ann.type === 'image') this.sync(ann.id);
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

  /**
   * Rebuild one annotation's Konva group in place.
   *
   * For a **child** key this rebuilds the owning inset (a child node lives inside the
   * inset group and only makes sense with it). For a top-level key it rebuilds that
   * object; when it is an inset its children are rebuilt too.
   */
  private sync(pathKey: string): void {
    const loc = this.locate(pathKey);
    if (!loc) return;
    if (loc.owner) {
      this.sync(loc.owner.id);
      return;
    }
    const ann = loc.ann;
    this.destroyChildNodes(ann.id);
    this.groups.get(pathKey)?.destroy();
    const group = this.buildNode(ann);
    this.groups.set(pathKey, group);
    this.layerFor(ann).add(group);
    this.layer.batchDraw();
    this.insetLayer.batchDraw();
  }

  /** The layer an object paints into (§8.1: insets below markup). */
  private layerFor(ann: Annotation): Konva.Layer {
    return ann.type === 'image' ? this.insetLayer : this.layer;
  }

  /** Re-sync whichever node owns `pathKey` (the inset for a child). */
  private syncOwner(pathKey: string): void {
    const loc = this.locate(pathKey);
    if (!loc) return;
    this.sync(loc.owner ? loc.owner.id : pathKey);
  }

  /** Destroy and forget every registered child node of one inset. */
  private destroyChildNodes(insetId: string): void {
    const prefix = `${insetId}/`;
    for (const key of [...this.groups.keys()]) {
      if (key.startsWith(prefix)) {
        this.groups.get(key)?.destroy();
        this.groups.delete(key);
      }
    }
  }

  /** Build one annotation's group. Child inset groups are registered as they build. */
  private buildNode(ann: Annotation): Konva.Group {
    let group: Konva.Group;
    switch (ann.geometry.kind) {
      case 'dimension':
        group = buildDimensionGroup({
          id: ann.id,
          a: ann.geometry.a,
          b: ann.geometry.b,
          labelOffset: ann.geometry.labelOffset,
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
      case 'image': {
        // §8.5: the clip/scale/offset model, and every child offset by the SAME -crop.
        // `renderChild` reuses this exact builder, so a child dimension gets the same
        // §4.2 screen rules as a top-level one; the wrapper is positioned by
        // `buildInsetGroup` at `-crop` while the child's own nodes stay at asset px.
        const asset = ann.assetId ? this.assetProvider(ann.assetId) : null;
        group = buildInsetGroup({
          id: ann.id,
          geometry: ann.geometry,
          crop: this.cropFor(ann),
          asset,
          children: ann.children ?? [],
          locked: ann.locked,
          style: ann.style,
          renderChild: (child) => {
            const childGroup = this.buildNode(child);
            this.groups.set(pathToKey({ kind: 'child', insetId: ann.id, annotationId: child.id }), childGroup);
            return childGroup;
          },
        });
        break;
      }
    }

    // Restore the persisted eye state on every (re)build/reload.
    group.visible(ann.visible !== false);
    return group;
  }

  /**
   * The crop window in asset px. Persisted `crop` wins; otherwise it is the full asset
   * when the bitmap is known, or a unit window (which still places/clips the rect at the
   * right size) while the asset is loading. Never persisted from the fallback path.
   */
  private cropFor(ann: Annotation): { x: number; y: number; width: number; height: number } {
    const geometry = ann.geometry as InsetImageGeometry;
    if (geometry.crop) return { ...geometry.crop };
    const asset = ann.assetId ? this.assetProvider(ann.assetId) : null;
    if (asset) return { x: 0, y: 0, width: asset.width, height: asset.height };
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  /** Re-sort each layer's children by the document's zIndex (bands preserved). */
  private resort(): void {
    // Insets and markup live on separate layers (§8.1); zIndex is per-layer painter order.
    const perLayer = new Map<Konva.Layer, Annotation[]>();
    for (const ann of [...this.objects].sort((a, b) => a.zIndex - b.zIndex)) {
      const target = this.layerFor(ann);
      const list = perLayer.get(target) ?? [];
      list.push(ann);
      perLayer.set(target, list);
    }
    for (const [target, anns] of perLayer) {
      anns.forEach((ann, index) => {
        const group = this.groups.get(ann.id);
        if (group?.getParent()) group.zIndex(index);
      });
    }
    this.layer.batchDraw();
    this.insetLayer.batchDraw();
  }

  /** Fire the persistence seam after a mutation. */
  private notify(): void {
    this.onChange?.();
  }

  /** Deep-clone one annotation (children included), never sharing a live reference. */
  private cloneAnnotation(a: Annotation): Annotation {
    const clone: Annotation = {
      ...a,
      geometry: JSON.parse(JSON.stringify(a.geometry)) as Geometry,
      style: { ...a.style },
    };
    if (a.children) clone.children = a.children.map((c) => this.cloneAnnotation(c));
    return clone;
  }

  /**
   * The serialized document. This is the artefact the "no stored label" gate scans:
   * every annotation must be the §3.3 shape and carry no `label` key. Children are deep
   * cloned and round-trip inside their parent (§20.1: children belong to the annotation).
   */
  serialize(): Annotation[] {
    return this.objects.map((o) => this.cloneAnnotation(o));
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
    for (const group of [...this.groups.values()]) group.destroy();
    this.groups.clear();
    this.objects = annotations.map((a) => this.cloneAnnotation(a));
    for (const ann of this.objects) this.sync(ann.id);
    this.resort();
    this.notify();
  }

  /* ------------------------------------------------------------------ *
   * Slice 1.7 — inset children (§8.5 / §20.1)
   * ------------------------------------------------------------------ */

  /** The children of one inset (asset-px annotations), in stored order. */
  childrenOf(insetId: string): readonly Annotation[] {
    return this.objects.find((o) => o.id === insetId)?.children ?? [];
  }

  /**
   * Add a child inside an inset. **Nesting is exactly one level** (§8.5 / UI §9:632):
   * an `image` child is refused, so an inset can never contain an inset. The child's
   * geometry must already be in the inset's ASSET px (Focus mode's coordinate space).
   * Returns the added annotation, or `null` when the call is invalid.
   */
  addChildAnnotation(insetId: string, annotation: Annotation): Annotation | null {
    const inset = this.objects.find((o) => o.id === insetId);
    if (!inset || inset.type !== 'image') return null;
    if (annotation.type === 'image') return null;
    const children = inset.children ?? (inset.children = []);
    if (children.some((c) => c.id === annotation.id)) return annotation;
    annotation.zIndex = this.nextChildZIndex(inset);
    children.push(annotation);
    this.sync(insetId);
    this.notify();
    return annotation;
  }

  /** The next z-order slot WITHIN an inset. Children form their own private ordering. */
  private nextChildZIndex(inset: Annotation): number {
    let max = -Z_STEP;
    for (const child of inset.children ?? []) max = Math.max(max, child.zIndex);
    return max + Z_STEP;
  }

  /**
   * Build and add a child from a `NewAnnotation` (the Focus-mode tools' shape). The
   * geometry must already be in the inset's ASSET px — convert a canvas point with
   * `assetPointAt`. Returns `null` for an unknown inset or a nested inset.
   */
  addChildMarkup(insetId: string, input: NewAnnotation, id?: string): Annotation | null {
    const annotation: Annotation = {
      id: id ?? this.newId(),
      type: input.type,
      geometry: input.geometry,
      valueMm: input.valueMm ?? null,
      ...(input.type === 'angle' ? { valueDeg: input.valueDeg ?? null } : {}),
      enteredText: input.enteredText ?? null,
      style: input.style ?? { ...this.style },
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    };
    return this.addChildAnnotation(insetId, annotation);
  }

  /** Convenience for the Focus dimension machine. */
  addChildDimension(insetId: string, a: Px, b: Px, id?: string): Annotation | null {
    return this.addChildMarkup(
      insetId,
      { type: 'dimension', geometry: { kind: 'dimension', a: { ...a }, b: { ...b } }, valueMm: null, enteredText: null },
      id,
    );
  }

  /**
   * Convert a sheet-space point to an inset's ASSET px (`sheetToAsset`). The Focus-mode
   * tools draw in sheet px and must store asset px; this is the single conversion.
   */
  assetPointAt(insetId: string, sheet: Px): Px | null {
    const ann = this.get(insetId);
    if (!ann || ann.type !== 'image') return null;
    return sheetToAsset(sheet, ann.geometry as InsetImageGeometry, this.cropFor(ann));
  }

  /** Repoint an inset at a (possibly new) asset. `children` are the caller's decision. */
  setAssetId(pathKey: string, assetId: string): void {
    const ann = this.get(pathKey);
    if (!ann || ann.type !== 'image') return;
    ann.assetId = assetId;
    this.syncOwner(pathKey);
    this.layer.batchDraw();
    this.notify();
  }

  /** Drop every child of an inset (the Replace-photo `Remove markup` path). */
  clearChildren(insetId: string): void {
    const inset = this.objects.find((o) => o.id === insetId);
    if (!inset?.children) return;
    delete inset.children;
    this.sync(insetId);
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
