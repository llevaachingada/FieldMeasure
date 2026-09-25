/**
 * The Layers panel's and the select mini-toolbar's scene actions (visibility, lock, reorder,
 * rename, delete, rotate, duplicate, z-order, copy/paste style), moved verbatim out of
 * `SheetEditor` (beta-readiness plan R6). Rebuilt every render exactly as the closures were;
 * their free variables arrive through `SceneActionDeps`.
 */
import type { Annotation, AnnotationStyle } from '@/domain/types';
import { EditorCanvas } from '@/editor/EditorCanvas';
import { styleCoalesceKey } from '@/editor/editorController';
export { styleCoalesceKey };
import { History } from '@/editor/history';
import { MarkupScene, translateGeometry } from '@/editor/shapes/scene';
import { SelectTool } from '@/editor/tools/SelectTool';
import { emitToast } from '@/editor/session';
import LayersPanel, { blockFor } from '@/ui/LayersPanel';
import { annotationName, buildLayerRows, PHOTO_ROW_KEY } from '@/ui/layersRows';
import { useEditorStore } from '@/state/editorStore';
import { STRINGS } from '@/ui/strings';

import type { Dispatch, SetStateAction } from 'react';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';

/** D133 (§4.2): nudge a Duplicate off its source so the two are visibly distinct — the
 *  same order of magnitude as the width ladder's largest stroke, small enough to stay
 *  near the original at any reasonable zoom. */
const DUPLICATE_OFFSET_PX = 24;

type Ref<T> = { current: T };

export interface SceneActionDeps {
  sceneRef: Ref<MarkupScene | null>;
  historyRef: Ref<History | null>;
  canvasRef: Ref<EditorCanvas | null>;
  selectRef: Ref<SelectTool | null>;
  labelCtx: LabelContext;
  layerRows: ReturnType<typeof buildLayerRows>;
  styleClipboard: AnnotationStyle | null;
  setStyleClipboard: Dispatch<SetStateAction<AnnotationStyle | null>>;
  setPinnedToolbar: Dispatch<SetStateAction<boolean>>;
  setSceneTick: Dispatch<SetStateAction<number>>;
}

export function createSceneActions(deps: SceneActionDeps) {
  const {
    sceneRef, historyRef, canvasRef, selectRef, labelCtx, layerRows, styleClipboard,
    setStyleClipboard, setPinnedToolbar, setSceneTick,
  } = deps;

  const panelSelect = (key: string): void => {
    if (key === PHOTO_ROW_KEY) return;
    useEditorStore.getState().setSelection([key]);
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const bounds = scene.boundsAt(key);
    if (!bounds) return;
    const scale = canvas.scale;
    canvas.stage.position({
      x: canvas.stage.width() / 2 - (bounds.x + bounds.width / 2) * scale,
      y: canvas.stage.height() / 2 - (bounds.y + bounds.height / 2) * scale,
    });
    canvas.stage.batchDraw();
  };

  const panelToggleVisible = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const next = ann.visible === false; // hidden → show, otherwise hide
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.layers.actionToggleVisible} ${name}`.trim(),
      do: () => scene.setVisible(key, next),
      undo: () => scene.setVisible(key, !next),
    });
    setSceneTick((n) => n + 1); // refresh the row/eye regardless of the persistence seam
  };

  const panelToggleLock = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const next = !ann.locked;
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.layers.actionToggleLock} ${name}`.trim(),
      do: () => scene.setLocked(key, next),
      undo: () => scene.setLocked(key, !next),
    });
    setSceneTick((n) => n + 1);
  };

  /**
   * The Layers panel's reorder seam. `toIndex` is the panel's rest index INSIDE the row's
   * own group block (front-first, after the dragged row is removed) — the contract of
   * `LayersPanel.resolveDrop`, the row menu and `Alt`+`Arrow` (`onReorder(key, toIndex)`).
   *
   * TRANSLATION (the crux). The panel's groups (`layerGroupFor` → dimensions|shapes|ink|
   * text|insets|photo) are finer than §20.2's two z-bands, so the index cannot be handed
   * to the scene as-is. Re-express it as an ANCHOR ROW of the same block:
   *   - `toIndex < reduced.length`: anchor on the row currently at that index; the dragged
   *     row is placed immediately IN FRONT of it, so it comes to rest at `toIndex` and the
   *     anchor moves one slot back. Because the anchor is a row of the SAME group, a row
   *     dragged to the top of its group can never jump over another group's rows (the
   *     defect this replaces: the old index-based primitive read `toIndex` in band space,
   *     so with ≥2 groups in a band the row landed in the wrong slot).
   *   - `toIndex >= reduced.length`: "at/after the end of the group" → the back of it.
   * If the scene refuses (the anchor is in the other §20.2 band) nothing has changed and we
   * raise the same approved copy the panel itself uses. That path exists because a single
   * `ink` block spans `freehand` (main band) and `highlight` (lower band).
   */
  const panelReorder = (key: string, toIndex: number): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const block = blockFor(layerRows, key);
    if (!block) return;
    const reduced = block.rows.filter((r) => r.key !== key);
    if (reduced.length === 0) return; // nothing else in the group to reorder against

    // Snapshot both sides through serialize/load so undo restores the exact z-order.
    const before = scene.serialize();
    const applied =
      toIndex >= reduced.length
        ? scene.moveInBandToBack(key)
        : scene.moveInBandBefore(key, reduced[Math.max(0, toIndex)].key);
    if (!applied) {
      // §20.2: cross-band target — change nothing, say why (never apply the drop).
      emitToast(STRINGS.editor.highlighterBandMessage);
      return;
    }
    const after = scene.serialize();
    if (JSON.stringify(after) === JSON.stringify(before)) {
      // A legal but no-op reorder (e.g. dropping a row onto the row directly behind it):
      // leave the document alone and do not fabricate an undo step.
      setSceneTick((n) => n + 1);
      return;
    }
    history.exec({
      label: annotationName(ann, labelCtx),
      do: () => scene.load(after),
      undo: () => scene.load(before),
    });
    setSceneTick((n) => n + 1);
  };

  const panelRename = (key: string, name: string): void => {
    // Annotations carry no name field (AGENTS #2): a documented no-op. The editable
    // title lives on `SheetFile.title`, never on an annotation. Reported as owed.
    sceneRef.current?.rename(key, name);
  };

  const panelDelete = (key: string): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || key === PHOTO_ROW_KEY) return;
    const ann = scene.get(key);
    if (!ann) return;
    const snapshot = JSON.parse(JSON.stringify(ann)) as Annotation;
    const name = annotationName(ann, labelCtx);
    history.exec({
      label: `${STRINGS.select.delete} ${name}`.trim(),
      do: () => scene.removeObject(key),
      undo: () => scene.addAnnotation(snapshot),
    });
    setSceneTick((n) => n + 1);
  };

  const closeLayers = (): void => {
    useEditorStore.getState().setLayersOpen(false);
  };

  const toolbarRotate = (deg: number): void => {
    selectRef.current?.rotateBy(deg);
  };

  const toolbarDelete = (): void => {
    selectRef.current?.deleteSelection();
    setPinnedToolbar(false);
  };

  const toolbarToggleLock = (): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history) return;
    const keys = useEditorStore.getState().selection;
    if (keys.length === 0) return;
    const captures = keys
      .map((k) => scene.get(k))
      .filter((a): a is Annotation => Boolean(a))
      .map((a) => ({ key: a.id, locked: a.locked, name: annotationName(a, labelCtx) }));
    if (captures.length === 0) return;
    const next = !captures[0].locked;
    history.exec({
      label: `${STRINGS.layers.actionToggleLock} ${captures[0].name}`.trim(),
      do: () => captures.forEach((c) => scene.setLocked(c.key, next)),
      undo: () => captures.forEach((c) => scene.setLocked(c.key, c.locked)),
    });
  };

  /** D133 (§4.2): a fresh id for the clone AND, recursively, every child — an inset's
   *  children are addressed `${insetId}/${childId}` (scene.ts's `keyForAnnotationId`
   *  resolves a bare child id by linear scan), so two insets sharing a child id would
   *  make that lookup silently resolve to whichever inset comes first. */
  const cloneWithFreshIds = (ann: Annotation): Annotation => ({
    ...ann,
    id: crypto.randomUUID(),
    children: ann.children?.map(cloneWithFreshIds),
  });

  const toolbarDuplicate = (): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history) return;
    const keys = useEditorStore.getState().selection;
    const sources = keys.map((k) => scene.get(k)).filter((a): a is Annotation => Boolean(a));
    if (sources.length === 0) return;
    const clones = sources.map((a) => {
      const clone = cloneWithFreshIds(a);
      clone.geometry = translateGeometry(clone.geometry, DUPLICATE_OFFSET_PX, DUPLICATE_OFFSET_PX);
      clone.locked = false; // a duplicate is a new object, never inherits the source's lock
      return clone;
    });
    history.exec({
      label: STRINGS.select.duplicate,
      do: () => {
        clones.forEach((c) => scene.addAnnotation(c));
        useEditorStore.getState().setSelection(clones.map((c) => c.id));
      },
      undo: () => {
        clones.forEach((c) => scene.removeObject(c.id));
        useEditorStore.getState().setSelection(sources.map((a) => a.id));
      },
    });
  };

  /**
   * §4.2 bring-to-front / send-to-back, for a (possibly multi-object) selection.
   * `moveInBandBefore(key, null)` / `moveInBandToBack(key)` each move ONE key immediately;
   * applying them in the right order keeps the selection's own RELATIVE order intact —
   * ascending current zIndex for "front" (the item already most-front is processed last,
   * so it ends up truly frontmost), descending for "back" (mirrored). Child keys
   * (`insetId/childId`) are excluded: `moveInBandBefore`/`moveInBandToBack` refuse them
   * (a child's order lives inside its inset, not a sheet z-band), and the exclusion
   * itself is not silent — a toolbar action must not surface no error for a selection it
   * partially ignored, so it is recorded as owed in D133 rather than assumed harmless.
   */
  const reorderSelection = (direction: 'front' | 'back'): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history) return;
    const keys = useEditorStore.getState().selection.filter((k) => !k.includes('/'));
    const withZ = keys
      .map((k) => ({ key: k, ann: scene.get(k) }))
      .filter((e): e is { key: string; ann: Annotation } => Boolean(e.ann))
      .sort((a, b) => a.ann.zIndex - b.ann.zIndex);
    if (withZ.length === 0) return;
    const ordered = direction === 'back' ? [...withZ].reverse() : withZ;

    const before = scene.serialize();
    for (const { key } of ordered) {
      if (direction === 'front') scene.moveInBandBefore(key, null);
      else scene.moveInBandToBack(key);
    }
    const after = scene.serialize();
    if (JSON.stringify(after) === JSON.stringify(before)) return; // already at the target edge
    history.exec({
      label: direction === 'front' ? STRINGS.select.bringFront : STRINGS.select.sendBack,
      do: () => scene.load(after),
      undo: () => scene.load(before),
    });
    setSceneTick((n) => n + 1);
  };

  /** §4.2: the FIRST selected object's style — matches "copy style" reading as one
   *  definite thing to copy even from a heterogeneous selection, the same reading the
   *  §7.4 mixed-selection rules already use elsewhere in this panel/toolbar pairing. */
  const toolbarCopyStyle = (): void => {
    const scene = sceneRef.current;
    const keys = useEditorStore.getState().selection;
    const first = keys.map((k) => scene?.get(k)).find((a): a is Annotation => Boolean(a));
    if (!first) return;
    setStyleClipboard(first.style);
    emitToast(STRINGS.toasts.styleCopied);
  };

  const toolbarPasteStyle = (): void => {
    const scene = sceneRef.current;
    const history = historyRef.current;
    if (!scene || !history || !styleClipboard) return;
    const keys = useEditorStore.getState().selection;
    if (keys.length === 0) return;
    history.exec(scene.styleCommand(keys, styleClipboard, STRINGS.style.panelLabel));
  };


  return {
    panelSelect, panelToggleVisible, panelToggleLock, panelReorder, panelRename, panelDelete,
    closeLayers, toolbarRotate, toolbarDelete, toolbarToggleLock, toolbarDuplicate,
    reorderSelection, toolbarCopyStyle, toolbarPasteStyle,
  };
}
