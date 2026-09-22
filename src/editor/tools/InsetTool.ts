/**
 * `src/editor/tools/InsetTool.ts` — the image-inset tool: insert flow, the §8.5
 * manipulation grammar, and Focus entry/exit (UI §9; packet 1.7 steps 1, 3, 4).
 *
 * INSERT (UI §9:610–618)
 *   One tap opens the picker sheet (B2's `ImageInsetPickerSheet`, mounted by the shell)
 *   through `onRequestPicker`. A pick calls `placeFromAssets`, which inserts each asset
 *   as its own inset — default 40% of the sheet width, aspect preserved, centred on the
 *   tap — with multi-select cascading 24 px down-right. The whole batch is ONE undo step.
 *
 * MANIPULATION (UI §9:620–624; the Select grammar)
 *   4 corner handles scale (aspect-locked by default), 4 edge handles adjust the crop
 *   window (never a stretch), and a rotate handle snaps to 0/90/180. The maths lives in
 *   `insetGeometry.ts` (pure, node-tested); this class only routes pointer events and
 *   draws the handles on the overlay layer.
 *
 * FOCUS (UI §9:626–634)
 *   Owned by `InsetFocus`; the tool exposes `enterFocus`/`exitFocus`. The shell owns the
 *   breadcrumb chip, the `editorStore.focusInsetId` mirror and the Esc rung — see the
 *   lane report for the exact wiring. One level deep: `canPlaceInset()` is false inside
 *   Focus, so an inset can never contain an inset.
 */
import Konva from 'konva';
import type { Annotation, Px } from '@/domain/types';
import type { Command, History } from '@/editor/history';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { MarkupScene } from '@/editor/shapes/scene';
import {
  SELECT_HANDLE_HIT_PEN,
  SELECT_HANDLE_HIT_TOUCH,
  SELECT_HANDLE_VISUAL_PEN,
  SELECT_HANDLE_VISUAL_TOUCH,
  type ContactAction,
  type MarkupTool,
} from './toolTypes';
import {
  applyPhotoReplace,
  cascadeTap,
  cropInsetEdge,
  defaultInsetPlacement,
  insetHandlePositions,
  isCornerHandle,
  isEdgeHandle,
  nearestInsetHandle,
  rotateInset,
  scaleInset,
  type AssetSize,
  type InsetHandleId,
  type InsetImageGeometry,
  type InsetHandle,
} from '@/editor/inset/insetGeometry';
import { InsetFocus } from '@/editor/inset/InsetFocus';
import { STRINGS } from '@/ui/strings';

export { applyPhotoReplace, replacePhotoDecision } from '@/editor/inset/insetGeometry';
export type { ReplacePhotoChoice, ReplacePhotoDecision } from '@/editor/inset/insetGeometry';

/** A picked, decoded asset ready to place. */
export interface InsetAssetInput {
  assetId: string;
  width: number;
  height: number;
}

export interface InsetToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  /** The sheet's working-image size (default placement is 40% of its width). */
  getSheetSize(): AssetSize;
  getSelection(): string[];
  setSelection(keys: string[]): void;
  onSelectionChange?(keys: string[]): void;
  /** Ask the shell to open the picker sheet at this sheet-space point. */
  onRequestPicker(at: Px): void;
  /** The picker closed with no pick (cancel / Esc). */
  onPickerDismissed?(): void;
  /** The batch was committed; the shell selects / persists / reports. */
  onPlaced(keys: string[]): void;
  /** Focus mode entered or exited. The shell mirrors this into the breadcrumb. */
  onFocusChange(insetId: string | null): void;
  /** Working-image dimensions of an asset, or `null` while unknown. */
  getAssetSize(assetId: string): AssetSize | null;
  labels?: { place: string; crop: string; scale: string; rotate: string; replace: string };
}

type InsetToolLabels = {
  place: string;
  crop: string;
  scale: string;
  rotate: string;
  replace: string;
};

interface PickerState {
  at: Px;
}

interface TransformSession {
  key: string;
  handle: InsetHandleId;
  start: InsetImageGeometry;
  asset: AssetSize;
}

const DEFAULT_LABELS = {
  place: STRINGS.inset.actionPlace,
  crop: STRINGS.inset.actionCrop,
  scale: STRINGS.inset.actionScale,
  rotate: STRINGS.inset.actionRotate,
  replace: STRINGS.inset.actionReplace,
} as const;

export class InsetTool implements MarkupTool {
  private readonly deps: InsetToolDeps;
  private readonly labels: InsetToolLabels;
  private readonly focus: InsetFocus;
  private picking: PickerState | null = null;
  private session: TransformSession | null = null;
  private pointerType = 'touch';
  private handleGroup: Konva.Group | null = null;

  constructor(deps: InsetToolDeps) {
    this.deps = deps;
    this.labels = { ...DEFAULT_LABELS, ...(deps.labels ?? {}) };
    this.focus = new InsetFocus({
      canvas: deps.canvas,
      scene: deps.scene,
      onChange: (id) => deps.onFocusChange(id),
    });
  }

  get pending(): boolean {
    return this.picking !== null || this.session !== null;
  }

  /** True while the picker sheet should be mounted. */
  get pickerOpen(): boolean {
    return this.picking !== null;
  }

  /** The Focus owner, for the shell's breadcrumb / Esc ladder. */
  get focusMode(): InsetFocus {
    return this.focus;
  }

  /* ------------------------------------------------------------------ *
   * Insert flow
   * ------------------------------------------------------------------ */

  /**
   * A tap with the Inset tool armed. Returns `false` (and asks nothing) inside Focus —
   * nesting is exactly one level (UI §9:632).
   */
  requestInsert(at: Px): boolean {
    if (!this.focus.canPlaceInset()) return false;
    this.picking = { at: { ...at } };
    this.deps.onRequestPicker({ ...at });
    return true;
  }

  /** The picker was dismissed: clear the pending placement, change nothing else. */
  cancelPicker(): void {
    if (!this.picking) return;
    this.picking = null;
    this.deps.onPickerDismissed?.();
  }

  /**
   * A pick resolved to one or more assets. Inserts them as ONE undo step: the first is
   * centred on the tap, each further pick cascades 24 px down-right (UI §9:615).
   */
  placeFromAssets(assets: readonly InsetAssetInput[], at?: Px): string[] {
    const point = this.picking?.at ?? at;
    if (!point || assets.length === 0) return [];
    this.picking = null;
    const sheet = this.deps.getSheetSize();
    const ids = assets.map(() => crypto.randomUUID());
    const scene = this.deps.scene;
    this.deps.history.exec({
      label: this.labels.place,
      do: () => {
        ids.forEach((id, index) => {
          const asset = assets[index];
          scene.addInset(
            asset.assetId,
            defaultInsetPlacement(
              cascadeTap(point, index),
              sheet,
              { width: asset.width, height: asset.height },
            ),
            id,
          );
        });
      },
      undo: () => {
        ids.forEach((id) => scene.removeObject(id));
      },
    } as Command);
    this.deps.setSelection(ids);
    this.deps.onSelectionChange?.(ids);
    this.deps.onPlaced(ids);
    this.refresh();
    return ids;
  }

  /* ------------------------------------------------------------------ *
   * Focus (nesting model)
   * ------------------------------------------------------------------ */

  enterFocus(insetId: string): boolean {
    const ok = this.focus.enter(insetId);
    if (ok) this.clearHandles();
    return ok;
  }

  exitFocus(): void {
    this.focus.exit();
    this.refresh();
  }

  get focusId(): string | null {
    return this.focus.focusedId;
  }

  canPlaceInset(): boolean {
    return this.focus.canPlaceInset();
  }

  /* ------------------------------------------------------------------ *
   * Replace photo (the shell owns the dialog; this is the decision point)
   * ------------------------------------------------------------------ */

  /**
   * Apply a Replace-photo choice. Identical asset dimensions swap silently and keep
   * children and crop; different dimensions keep the children only when `choice` is
   * `'keep'`. One undo step; the shell runs the warned dialog and passes the choice.
   */
  replacePhoto(pathKey: string, newAsset: InsetAssetInput, choice: 'keep' | 'remove'): boolean {
    const ann = this.deps.scene.get(pathKey);
    if (!ann || ann.type !== 'image') return false;
    const oldAsset = this.deps.getAssetSize(ann.assetId ?? '') ?? { width: 0, height: 0 };
    const oldGeometry = ann.geometry as InsetImageGeometry;
    // Same-dimension swap is not a "choice": the asset reference alone changes.
    const same =
      oldAsset.width === newAsset.width && oldAsset.height === newAsset.height;
    const result = applyPhotoReplace(oldGeometry, oldAsset, newAsset, choice);
    const before = cloneAnnotation(ann);
    const after: Annotation = {
      ...cloneAnnotation(ann),
      assetId: newAsset.assetId,
      geometry: result.geometry,
    };
    if (!result.keepChildren && !same) delete after.children;
    if (same) after.geometry = { ...oldGeometry };
    const scene = this.deps.scene;
    this.deps.history.exec({
      label: this.labels.replace,
      do: () => {
        scene.removeObject(pathKey);
        scene.addAnnotation(cloneAnnotation(after));
      },
      undo: () => {
        scene.removeObject(pathKey);
        scene.addAnnotation(cloneAnnotation(before));
      },
    } as Command);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * MarkupTool contract
   * ------------------------------------------------------------------ */

  onPointerDown(point: Px, pointerType: string): ContactAction {
    this.pointerType = pointerType;
    const hit = this.hitHandle(point);
    if (hit) {
      const session = this.beginSession(hit);
      if (session) return 'consume';
    }
    return 'pan';
  }

  onPointerMove(point: Px, movedBeyondSlop: boolean): ContactAction {
    void movedBeyondSlop;
    if (!this.session) return 'pan';
    this.updateSession(point);
    return 'consume';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    this.pointerType = pointerType;
    if (this.session) {
      this.endSession();
      return;
    }
    if (tapped) this.requestInsert(point);
  }

  onPointerCancel(): void {
    if (this.session) {
      // Discard the live drag: restore the captured geometry.
      this.deps.scene.setGeometry(this.session.key, this.session.start);
    }
    this.session = null;
  }

  onToolChange(): void {
    this.session = null;
    this.picking = null;
    this.clearHandles();
  }

  dispose(): void {
    this.onToolChange();
  }

  /** Redraw handles for the current single-inset selection. */
  refresh(): void {
    this.clearHandles();
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return;
    const ann = this.deps.scene.get(keys[0]);
    if (!ann || ann.type !== 'image') return;
    const geometry = ann.geometry as InsetImageGeometry;
    const handles = insetHandlePositions(geometry, ROTATE_GAP_PX / this.deps.canvas.scale);
    this.drawHandles(handles);
  }

  /** The nearest handle under a sheet-space point, or `null`. */
  hitHandle(point: Px): InsetHandleId | null {
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return null;
    const ann = this.deps.scene.get(keys[0]);
    if (!ann || ann.type !== 'image') return null;
    const geometry = ann.geometry as InsetImageGeometry;
    const handles = insetHandlePositions(geometry, ROTATE_GAP_PX / this.deps.canvas.scale);
    return nearestInsetHandle(handles, point, this.hitPx(), this.deps.canvas.scale);
  }

  /* ------------------------------------------------------------------ *
   * Transforms
   * ------------------------------------------------------------------ */

  private beginSession(handle: InsetHandleId): TransformSession | null {
    const keys = this.deps.getSelection();
    if (keys.length !== 1) return null;
    const ann = this.deps.scene.get(keys[0]);
    if (!ann || ann.type !== 'image' || ann.locked) return null;
    const geometry = JSON.parse(JSON.stringify(ann.geometry)) as InsetImageGeometry;
    this.session = {
      key: keys[0],
      handle,
      start: geometry,
      asset: this.deps.getAssetSize(ann.assetId ?? '') ?? { width: 0, height: 0 },
    };
    return this.session;
  }

  private updateSession(point: Px): void {
    const session = this.session;
    if (!session) return;
    let next: InsetImageGeometry;
    if (session.handle === 'rotate') {
      next = rotateInset(session.start, point, true);
    } else if (isCornerHandle(session.handle)) {
      next = scaleInset(session.start, session.handle, point, true);
    } else if (isEdgeHandle(session.handle)) {
      next = cropInsetEdge(session.start, session.asset, session.handle, point).geometry;
    } else {
      return;
    }
    this.deps.scene.setGeometry(session.key, next);
  }

  private endSession(): void {
    const session = this.session;
    this.session = null;
    if (!session) return;
    const after = this.deps.scene.geometryCopy(session.key);
    if (!after) return;
    const same = JSON.stringify(after) === JSON.stringify(session.start);
    if (same) return;
    const label = this.labelFor(session.handle);
    const key = session.key;
    const scene = this.deps.scene;
    this.deps.history.exec({
      label,
      do: () => scene.setGeometry(key, after),
      undo: () => scene.setGeometry(key, session.start),
    } as Command);
    this.refresh();
  }

  private labelFor(handle: InsetHandleId): string {
    if (handle === 'rotate') return this.labels.rotate;
    if (isEdgeHandle(handle)) return this.labels.crop;
    return this.labels.scale;
  }

  private hitPx(): number {
    return this.pointerType === 'touch' ? SELECT_HANDLE_HIT_TOUCH : SELECT_HANDLE_HIT_PEN;
  }

  private visualPx(): number {
    return this.pointerType === 'touch' ? SELECT_HANDLE_VISUAL_TOUCH : SELECT_HANDLE_VISUAL_PEN;
  }

  /* ---- overlay drawing ---- */

  private clearHandles(): void {
    this.handleGroup?.destroy();
    this.handleGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private drawHandles(handles: readonly InsetHandle[]): void {
    this.clearHandles();
    if (handles.length === 0) return;
    const scale = this.deps.canvas.scale;
    const size = this.visualPx() / scale;
    const group = new Konva.Group({ listening: false });
    for (const handle of handles) {
      const isRotate = handle.id === 'rotate';
      const node = new Konva.Rect({
        x: handle.p.x - size / 2,
        y: handle.p.y - size / 2,
        width: size,
        height: size,
        fill: isRotate ? '#2FD4E0' : '#FFFFFF',
        stroke: '#2FD4E0',
        strokeWidth: 2,
        strokeScaleEnabled: false,
        cornerRadius: isRotate ? size / 2 : 2 / scale,
      });
      node.setAttr('strokeWidthMu', 2);
      group.add(node);
    }
    this.handleGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }
}

/** The rotate handle's screen gap above the placed rect's top edge (UI §9:621). */
export const ROTATE_GAP_PX = 48;

/** Local clone — avoids importing the singleton object graph from the scene. */
function cloneAnnotation(ann: Annotation): Annotation {
  return JSON.parse(JSON.stringify(ann)) as Annotation;
}
