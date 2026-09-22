/**
 * `src/ui/insetWiring.ts` — slice 1.7 (Wave B integration lane): the two pieces of
 * shell-side machinery the engine and the picker sheet could not own.
 *
 * 1. **The content-addressed asset registry.** Assets are the second photos an inset
 *    references (`assets/<sha256hex>.jpg`, §19.3). Nothing here writes: the store is
 *    `src/editor/inset/insetAssets.ts` → `projectStore.writeAtomic` (AGENTS #3).
 *    This class only holds the session's `assetId → decoded bitmap` cache, reads an
 *    asset back for the renderer, and (cheaply) tracks the session's recents list the
 *    picker shows. There is no index file (§19.3), so recents are session-only — a
 *    reload honestly shows an empty grid.
 *
 * 2. **The Focus-aware scene facade.** Other tools emit SHEET-space points and call
 *    `scene.addDimension` / `scene.addMarkup`. Inside Focus those must become CHILDREN
 *    of the focused inset, stored in the inset's ASSET px (§8.5). Rather than teach
 *    every tool about Focus, the shell hands them this `MarkupScene` proxy: while Focus
 *    is open it converts sheet↔asset with `scene.assetPointAt`/`assetToSheet` and nests
 *    creations with `addChildDimension` / `addChildMarkup` (both refuse a nested inset);
 *    when Focus is closed it is transparent. Bare child ids (`id`) are always resolved
 *    to their `insetId/id` path, so a tool that captured a child id can still undo it
 *    after Focus closes.
 *
 * Nothing here imports Konva directly; the proxy delegates to the real scene.
 */
import type { Annotation, Geometry, Px } from '@/domain/types';
import type { MarkupScene, NewAnnotation } from '@/editor/shapes/scene';
import {
  assetToSheet,
  type AssetSize,
  type InsetImageGeometry,
  type Rect,
} from '@/editor/inset/insetGeometry';
import { assetFileName } from '@/editor/inset/insetAssets';
import { decodeInWorker } from '@/media/thumbnails';
import { resolveAssetsDir } from '@/fs/projectStore';

/* ------------------------------------------------------------------ *
 * 1. Asset registry
 * ------------------------------------------------------------------ */

/** A decoded asset the renderer can draw, plus its working-image dimensions. */
export interface InsetAssetEntry {
  assetId: string;
  image: CanvasImageSource;
  width: number;
  height: number;
  /** `blob:` URL of the stored JPEG — the picker's thumbnail, revoked on dispose. */
  thumbUrl: string;
  /** Display name (the picked file's name, else a short hash). Never invented copy. */
  name: string;
}

export interface InsetRecent {
  assetId: string;
  thumbUrl: string;
  name: string;
}

/** §9:614 — the Recents grid is a 4×2 grid of the last 8. */
export const INSET_RECENTS_MAX = 8;

/**
 * The session's decoded-asset cache. `provider` is the exact signature
 * `MarkupSceneOptions.assetProvider` expects.
 */
export class InsetAssetRegistry {
  private readonly entries = new Map<string, InsetAssetEntry>();
  private readonly loading = new Set<string>();
  /** Most-recent-first, capped at 8; session-only by design (§19.3 — no index file). */
  private recents: InsetRecent[] = [];

  /** The renderer's resolver. `null` renders the "Loading photo…" placeholder. */
  provider = (assetId: string): { image: CanvasImageSource; width: number; height: number } | null => {
    const entry = this.entries.get(assetId);
    if (!entry) return null;
    return { image: entry.image, width: entry.width, height: entry.height };
  };

  get(assetId: string): InsetAssetEntry | undefined {
    return this.entries.get(assetId);
  }

  sizeOf(assetId: string): AssetSize | null {
    const entry = this.entries.get(assetId);
    return entry ? { width: entry.width, height: entry.height } : null;
  }

  has(assetId: string): boolean {
    return this.entries.has(assetId);
  }

  recentsList(): InsetRecent[] {
    return this.recents;
  }

  /**
   * Read `assets/<assetId>.jpg` from the project and decode it off the main thread
   * (the shipped `decodeWorker.ts` path). Deduped: a concurrent call for the same id
   * returns `null` rather than reading twice. A miss/corrupt file is swallowed — the
   * inset keeps its placeholder (UI §9:611's error state is owed, reported).
   */
  async load(
    projectDir: FileSystemDirectoryHandle,
    assetId: string,
    name?: string,
  ): Promise<InsetAssetEntry | null> {
    const existing = this.entries.get(assetId);
    if (existing) return existing;
    if (this.loading.has(assetId)) return null;
    this.loading.add(assetId);
    try {
      const dir = await resolveAssetsDir(projectDir, { create: false });
      const handle = await dir.getFileHandle(assetFileName(assetId), { create: false });
      const blob = await handle.getFile();
      const decoded = await decodeInWorker(blob);
      return this.register({
        assetId,
        image: decoded.bitmap,
        width: decoded.width,
        height: decoded.height,
        thumbUrl: URL.createObjectURL(blob),
        name: name && name.trim() !== '' ? name : assetId.slice(0, 8),
      });
    } catch {
      return null;
    } finally {
      this.loading.delete(assetId);
    }
  }

  /** Insert a decoded entry (the picked-file path already has the decode). */
  register(entry: InsetAssetEntry): InsetAssetEntry {
    this.entries.set(entry.assetId, entry);
    this.recents = [
      { assetId: entry.assetId, thumbUrl: entry.thumbUrl, name: entry.name },
      ...this.recents.filter((r) => r.assetId !== entry.assetId),
    ].slice(0, INSET_RECENTS_MAX);
    return entry;
  }

  /** Revoke every thumbnail URL and drop the cache (unmount). */
  dispose(): void {
    for (const entry of this.entries.values()) {
      const bitmap = entry.image as { close?: () => void };
      bitmap.close?.();
      if (entry.thumbUrl.startsWith('blob:')) URL.revokeObjectURL(entry.thumbUrl);
    }
    this.entries.clear();
    this.loading.clear();
    this.recents = [];
  }
}

/* ------------------------------------------------------------------ *
 * 2. Focus-aware scene facade
 * ------------------------------------------------------------------ */

export interface FocusSceneOptions {
  /** The focused inset id, or `null`. Read live (the store is the mirror). */
  getFocusId: () => string | null;
  /** Working-image dimensions of an asset, or `null` while undecoded. */
  getAssetSize: (assetId: string) => AssetSize | null;
}

const FALLBACK_ASSET: AssetSize = { width: 1, height: 1 };

function cloneAnnotation(ann: Annotation): Annotation {
  const clone: Annotation = {
    ...ann,
    geometry: JSON.parse(JSON.stringify(ann.geometry)) as Geometry,
  };
  if (ann.children) clone.children = ann.children.map(cloneAnnotation);
  return clone;
}

function mapGeometry(
  geometry: Geometry,
  mapPoint: (p: Px) => Px,
): Geometry {
  switch (geometry.kind) {
    case 'dimension':
    case 'line':
    case 'arrow':
      return { ...geometry, a: mapPoint(geometry.a), b: mapPoint(geometry.b) };
    case 'angle':
      return {
        ...geometry,
        a: mapPoint(geometry.a),
        vertex: mapPoint(geometry.vertex),
        c: mapPoint(geometry.c),
      };
    case 'rect':
    case 'ellipse': {
      const p1 = mapPoint({ x: geometry.x, y: geometry.y });
      const p2 = mapPoint({ x: geometry.x + geometry.width, y: geometry.y + geometry.height });
      return {
        ...geometry,
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
      };
    }
    case 'polygon':
    case 'freehand':
    case 'highlight':
      return { ...geometry, points: geometry.points.map(mapPoint) };
    case 'text':
      return { ...geometry, at: mapPoint(geometry.at) };
    case 'image':
      return geometry;
  }
}

/**
 * Wrap a `MarkupScene` so tools drawing inside Focus create CHILD annotations in the
 * inset's asset px (§8.5). Transparent when Focus is closed.
 */
export function createFocusAwareScene(real: MarkupScene, opts: FocusSceneOptions): MarkupScene {
  /** Resolve a bare child id to its `insetId/id` path; other keys pass through. */
  const childPath = (key: string): string => {
    if (key.includes('/')) return key;
    if (real.list().some((o) => o.id === key)) return key;
    for (const o of real.list()) {
      if (o.children?.some((c) => c.id === key)) return `${o.id}/${key}`;
    }
    return key;
  };
  const ownerOf = (key: string): string | null => {
    const path = childPath(key);
    const slash = path.indexOf('/');
    return slash < 0 ? null : path.slice(0, slash);
  };
  /** The focused inset id when `key` addresses one of its children, else `null`. */
  const convertingOwner = (key: string): string | null => {
    const focusId = opts.getFocusId();
    if (focusId === null) return null;
    return ownerOf(key) === focusId ? focusId : null;
  };
  const cropOf = (insetId: string): Rect => {
    const ann = real.get(insetId);
    const geometry = ann?.geometry as InsetImageGeometry | undefined;
    if (geometry?.crop) return geometry.crop;
    const size = opts.getAssetSize(ann?.assetId ?? '') ?? FALLBACK_ASSET;
    return { x: 0, y: 0, width: size.width, height: size.height };
  };
  const toAsset = (insetId: string, p: Px): Px => real.assetPointAt(insetId, p) ?? { ...p };
  const toSheet = (insetId: string, p: Px): Px => {
    const ann = real.get(insetId);
    if (!ann || ann.geometry.kind !== 'image') return { ...p };
    return assetToSheet(p, ann.geometry, cropOf(insetId));
  };
  const geometryIn = (insetId: string, g: Geometry): Geometry =>
    mapGeometry(g, (p) => toAsset(insetId, p));
  const geometryOut = (insetId: string, g: Geometry): Geometry =>
    mapGeometry(g, (p) => toSheet(insetId, p));

  return new Proxy(real, {
    get(target, prop): unknown {
      if (typeof prop !== 'string') return Reflect.get(target, prop, target);
      const focusId = opts.getFocusId();
      switch (prop) {
        case 'get':
          return (key: string): Annotation | undefined => {
            const path = childPath(key);
            const ann = target.get(path);
            if (!ann) return ann;
            const owner = convertingOwner(path);
            if (owner === null) return ann;
            const copy = cloneAnnotation(ann);
            copy.geometry = geometryOut(owner, ann.geometry);
            return copy;
          };
        case 'list':
          return (): readonly Annotation[] => {
            if (focusId === null) return target.list();
            return target.childrenOf(focusId).map((child) => {
              const copy = cloneAnnotation(child);
              copy.geometry = geometryOut(focusId, child.geometry);
              return copy;
            });
          };
        case 'addDimension':
          return (a: Px, b: Px, id?: string): Annotation | null => {
            if (focusId === null) return target.addDimension(a, b, id);
            return target.addChildDimension(focusId, toAsset(focusId, a), toAsset(focusId, b), id);
          };
        case 'addMarkup':
          return (input: NewAnnotation, id?: string): Annotation | null => {
            if (focusId === null) return target.addMarkup(input, id);
            return target.addChildMarkup(
              focusId,
              { ...input, geometry: geometryIn(focusId, input.geometry) },
              id,
            );
          };
        case 'addAnnotation':
          return (ann: Annotation): Annotation => {
            if (focusId === null || ann.type === 'image') return target.addAnnotation(ann);
            const copy = cloneAnnotation(ann);
            copy.geometry = geometryIn(focusId, ann.geometry);
            return target.addChildAnnotation(focusId, copy) ?? target.addAnnotation(copy);
          };
        case 'removeObject':
          return (key: string): void => target.removeObject(childPath(key));
        case 'setValue':
          return (key: string, valueMm: number | null, enteredText: string | null): void =>
            target.setValue(childPath(key), valueMm, enteredText);
        case 'setAngleValue':
          return (key: string, valueDeg: number | null, enteredText: string | null): void =>
            target.setAngleValue(childPath(key), valueDeg, enteredText);
        case 'setAnchor':
          return (key: string, which: 'a' | 'b', p: Px): void => {
            const owner = convertingOwner(key);
            const point = owner ? toAsset(owner, p) : p;
            target.setAnchor(childPath(key), which, point);
          };
        case 'setGeometry':
          return (key: string, geometry: Geometry): void => {
            const owner = convertingOwner(key);
            target.setGeometry(
              childPath(key),
              owner ? geometryIn(owner, geometry) : geometry,
            );
          };
        case 'geometryCopy':
          return (key: string): Geometry | null => {
            const path = childPath(key);
            const geometry = target.geometryCopy(path);
            const owner = convertingOwner(path);
            return geometry && owner ? geometryOut(owner, geometry) : geometry;
          };
        case 'geometryAt':
          return (key: string): { a: Px; b: Px } | null => {
            const anchors = target.geometryAt(childPath(key));
            if (!anchors) return anchors;
            const owner = convertingOwner(key);
            if (!owner) return anchors;
            return { a: toSheet(owner, anchors.a), b: toSheet(owner, anchors.b) };
          };
        case 'boundsAt':
          return (key: string): { x: number; y: number; width: number; height: number } | null => {
            const bounds = target.boundsAt(childPath(key));
            if (!bounds) return bounds;
            const owner = convertingOwner(key);
            if (!owner) return bounds;
            const p1 = toSheet(owner, { x: bounds.x, y: bounds.y });
            const p2 = toSheet(owner, { x: bounds.x + bounds.width, y: bounds.y + bounds.height });
            return {
              x: Math.min(p1.x, p2.x),
              y: Math.min(p1.y, p2.y),
              width: Math.abs(p2.x - p1.x),
              height: Math.abs(p2.y - p1.y),
            };
          };
        default:
          return Reflect.get(target, prop, target);
      }
    },
  });
}
