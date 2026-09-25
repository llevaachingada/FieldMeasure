/**
 * The editor's pointer gesture engine: tap versus drag, long-press, the second finger, and the
 * dispatch into the markup tools. Moved out of `SheetEditor`'s mount effect (beta-readiness plan R1)
 * with no behaviour change. The handler bodies are the old closures verbatim; every free variable
 * of that closure now arrives through `GestureDeps` (refs are passed as the ref objects themselves,
 * so a read still sees the live `.current`).
 */
import type { Geometry, Px } from '@/domain/types';
import {
  EditorCanvas,
  LONG_PRESS_MS,
  TAP_SLOP,
  decideDragTarget,
  isTap,
  onSecondFinger,
  type DragSession,
  type ScreenPoint,
} from '@/editor/EditorCanvas';
import type { InputIntent, createInputRouter } from '@/editor/inputRouter';
import type { History } from '@/editor/history';
import { translateGeometry, type MarkupScene } from '@/editor/shapes/scene';
import type { ShapeKind, ShapeTool } from '@/editor/tools/ShapeTool';
import type { AngleTool } from '@/editor/tools/AngleTool';
import { isFingerInkAllowed, type FreehandTool } from '@/editor/tools/FreehandTool';
import type { TextTool } from '@/editor/tools/TextTool';
import { effectiveEraseMode, isErasePreview, type EraseTool } from '@/editor/tools/EraseTool';
import type { SelectTool } from '@/editor/tools/SelectTool';
import type { DimensionTool } from '@/editor/tools/DimensionTool';
import type { InsetTool } from '@/editor/tools/InsetTool';
import { emitToast } from '@/editor/session';
import { useEditorStore } from '@/state/editorStore';
import { STRINGS } from '@/ui/strings';
import { labelLayout, perpendicularOffset } from '@/editor/shapes/dimensionLabel';

/** D151: how close (screen px) a press must land to a selected dimension's text to drag it.
 *  28 px is the select tool's touch handle visual size (touch model §3.3). */
const LABEL_GRAB_PX = 28;

/** Double-tap window for fit↔100%: 320 ms, 24 px (UI §5.4 "double tap"). */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 24;

/** A React-style ref: the arbiter reads `.current` at event time, exactly as the closure did. */
interface Ref<T> {
  readonly current: T;
}

/** `SheetEditor`'s coarse tool mode (see its `EditorTool`). */
export type ArbiterEditorTool = 'select' | 'pan' | 'place';

export interface GestureDeps {
  readonly host: HTMLElement;
  readonly canvas: EditorCanvas;
  readonly scene: MarkupScene;
  readonly router: ReturnType<typeof createInputRouter>;
  readonly tool: DimensionTool;
  readonly history: History;
  readonly activeToolRef: Ref<ArbiterEditorTool>;
  readonly placementPendingRef: Ref<boolean>;
  readonly toolIdRef: Ref<string>;
  readonly sceneRef: Ref<MarkupScene | null>;
  readonly shapeToolsRef: Ref<Map<ShapeKind, ShapeTool>>;
  readonly angleRef: Ref<AngleTool | null>;
  readonly freehandRef: Ref<FreehandTool | null>;
  readonly highlightRef: Ref<FreehandTool | null>;
  readonly textRef: Ref<TextTool | null>;
  readonly eraseRef: Ref<EraseTool | null>;
  readonly selectRef: Ref<SelectTool | null>;
  readonly insetRef: Ref<InsetTool | null>;
  readonly mkSettings: () => Parameters<typeof isFingerInkAllowed>[0];
  readonly cancelActiveMarkup: () => void;
  readonly setPinnedToolbar: (pinned: boolean) => void;
  readonly setInputKind: (kind: string | null) => void;
}

export interface Contact {
  intent: InputIntent;
  session: DragSession;
  start: ScreenPoint;
  /** The contact's start in image space (the marquee anchor). */
  startImage: Px;
  startAt: number;
  last: ScreenPoint;
  /** The tool owns this contact's movement (rubber-band / refine). */
  toolAction: 'consume' | 'pan' | 'none';
  /** Pan even while a placement is pending (settle-time contact → pan, §1.4). */
  forcePan: boolean;
  objectKey: string | null;
  /** Set while a freehand/highlighter ink stroke is being sampled. */
  freehandKind: 'freehand' | 'highlight' | null;
  /** Which machine owns this contact's lift: the dimension tool or a 1.6 markup tool. */
  owner: 'dimension' | 'markup' | null;
  /** Raw `PointerEvent.pressure` for the ink path (pen-only signal; touch is 0.5). */
  pressure: number;
  /** Select tool: this contact may become a marquee if it moves beyond the slop. */
  marqueeCandidate: boolean;
  /** Select tool: the 600 ms long-press-to-pin timer. */
  longPressTimer: number | null;
  /** Erase tool (object mode): preview is deferred to the 600 ms timer. */
  eraseObject: boolean;
  /** Erase: the contact moved beyond the slop, which cancels the preview/delete. */
  eraseMoved: boolean;
  /** Erase: the 600 ms `--err` preview timer. */
  eraseTimer: number | null;
}

export interface ObjectDrag {
  key: string;
  /** Geometry captured at drag start (any kind). */
  geometry: Geometry;
  startImage: Px;
}

export function isAtEdge(point: ScreenPoint, host: HTMLElement): boolean {
  return point.x < 24 || point.y < 24 || point.x > host.clientWidth - 24 || point.y > host.clientHeight - 24;
}

type Handlers = ReturnType<typeof buildHandlers>;

export class GestureArbiter {
  private readonly h: Handlers;

  constructor(deps: GestureDeps) {
    this.h = buildHandlers(deps);
  }

  onPointerDown(e: PointerEvent): void {
    this.h.onPointerDown(e);
  }

  onPointerMove(e: PointerEvent): void {
    this.h.onPointerMove(e);
  }

  onPointerUp(e: PointerEvent): void {
    this.h.endContact(e);
  }

  onPointerCancel(e: PointerEvent): void {
    this.h.cancelContact(e);
  }

  /** True while any markup tool holds an unfinished operation (Escape and tool switches ask). */
  markupToolPending(): boolean {
    return this.h.markupToolPending();
  }

  /**
   * Nothing to release: the listeners belong to the caller, and the old effect cleanup never
   * cleared in-flight contacts either (kept identical on purpose; R1 is behaviour-preserving).
   */
  dispose(): void {}
}

function buildHandlers(deps: GestureDeps) {
  const {
    host, canvas, scene, router, tool, history, activeToolRef, placementPendingRef, toolIdRef, sceneRef,
    shapeToolsRef, angleRef, freehandRef, highlightRef, textRef, eraseRef, selectRef, insetRef,
    mkSettings, cancelActiveMarkup, setPinnedToolbar, setInputKind,
  } = deps;

  const contacts = new Map<number, Contact>();
  /** D151: pointerId → the dimension whose label this contact is dragging. */
  const labelDrags = new Map<number, { key: string; before: Geometry }>();

  /** The selected dimension whose label sits under `point` (screen), or null. */
  const labelUnder = (point: ScreenPoint): { key: string; geometry: Geometry } | null => {
    const keys = useEditorStore.getState().selection;
    if (keys.length !== 1) return null;
    const key = keys[0];
    const ann = scene.get(key);
    if (!ann || ann.locked || ann.geometry.kind !== 'dimension') return null;
    const g = ann.geometry;
    const at = labelLayout(g.a, g.b, g.b, canvas.scale, g.labelOffset ?? 0).at;
    const s = canvas.imageToScreen(at);
    if (Math.hypot(s.x - point.x, s.y - point.y) > LABEL_GRAB_PX) return null;
    return { key, geometry: { ...g } };
  };
  const objectDrags = new Map<number, ObjectDrag>();
  let lastTap: { point: ScreenPoint; at: number } | null = null;

  const placementArmed = (): boolean =>
    activeToolRef.current !== 'select' && activeToolRef.current !== 'pan';

  /**
   * Slice 1.6 dispatch. The coarse `activeTool` prop says "some placement tool"; the
   * store's real `activeTool` says which. Returns `'none'` when the contact is not the
   * markup layer's (the dimension machine and the object-first drag keep their paths).
   */
  const markupPointerDown = (
    imagePoint: Px,
    pointerType: string,
    pressure: number,
    contact: Contact,
  ): 'consume' | 'pan' | 'none' => {
    const id = toolIdRef.current;
    if (id === 'select') {
      // Only handle drags are routed here; taps/marquee keep the existing path.
      return selectRef.current?.hitHandleAt(imagePoint, pointerType)
        ? selectRef.current!.onPointerDown(imagePoint, pointerType)
        : 'none';
    }
    const shape = shapeToolsRef.current.get(id as ShapeKind);
    if (shape) return shape.onPointerDown(imagePoint, pointerType);
    if (id === 'angle') return angleRef.current!.onPointerDown(imagePoint, pointerType);
    if (id === 'text') return textRef.current!.onPointerDown(imagePoint);
    if (id === 'erase') {
      const erase = eraseRef.current!;
      // Object mode (the only mode touch gets): the `--err` preview is driven by the
      // shell's 600 ms timer (A3), not shown eagerly. Stroke mode (pen) is unchanged.
      if (effectiveEraseMode(erase.eraseMode, pointerType) === 'object') {
        contact.eraseObject = true;
        return 'consume';
      }
      return erase.onPointerDown(imagePoint, pointerType);
    }
    if (id === 'inset') {
      // The tool returns `'pan'` for a non-handle contact, but its TAP must still reach
      // `onPointerUp` (the one-tap insert). Take the contact; a real drag is released
      // back to the pan path by `onPointerMove` returning `'pan'`.
      insetRef.current!.onPointerDown(imagePoint, pointerType);
      return 'consume';
    }
    if (id === 'freehand' || id === 'highlight') {
      const ink = id === 'freehand' ? freehandRef.current! : highlightRef.current!;
      if (id === 'freehand' && pointerType === 'touch' && !isFingerInkAllowed(mkSettings())) {
        return 'pan';
      }
      if (ink.usePlacementMachine(pointerType)) {
        return ink.placement().onPointerDown(imagePoint, pointerType);
      }
      ink.begin(imagePoint, pressure, pointerType);
      contact.freehandKind = id;
      return 'consume';
    }
    return 'none';
  };

  const markupPointerMove = (imagePoint: Px, moved: boolean): 'consume' | 'pan' | null => {
    const id = toolIdRef.current;
    const shape = shapeToolsRef.current.get(id as ShapeKind);
    if (shape) return shape.onPointerMove(imagePoint, moved);
    if (id === 'angle') return angleRef.current!.onPointerMove(imagePoint);
    if (id === 'erase') return eraseRef.current!.onPointerMove();
    if (id === 'select') return selectRef.current!.onPointerMove(imagePoint, moved);
    if (id === 'inset') return insetRef.current!.onPointerMove(imagePoint, moved);
    if (id === 'text') return textRef.current!.onPointerMove();
    return null;
  };

  const markupPointerUp = (imagePoint: Px, tapped: boolean, pointerType: string): void => {
    const id = toolIdRef.current;
    const shape = shapeToolsRef.current.get(id as ShapeKind);
    if (shape) {
      shape.onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'angle') {
      angleRef.current!.onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'erase') {
      eraseRef.current!.onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'select') {
      selectRef.current!.onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'inset') {
      insetRef.current!.onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'freehand' || id === 'highlight') {
      const ink = id === 'freehand' ? freehandRef.current! : highlightRef.current!;
      if (ink.usePlacementMachine(pointerType)) ink.placement().onPointerUp(imagePoint, tapped, pointerType);
      return;
    }
    if (id === 'text') textRef.current!.onPointerUp();
  };

  const onPointerDown = (e: PointerEvent): void => {
    const point = canvas.pointerPosition(e);
    setInputKind(e.pointerType);
    if (e.pointerType === 'pen') router.notePenEvent();
    if (e.pointerType === 'touch') {
      router.noteTouchDown(e.pointerId, isAtEdge(point, host));
    }
    const intent = router.classify(e);
    // §8.2/§11.4: a pen contact that is not the tip (`button === 2` = the barrel
    // button) is the radial quick-menu's *optional accelerator*. The radial is not
    // built, so the documented degrade is a no-op — register no contact at all, so
    // the barrel produces no geometry, no ink and no pan (not even the ignored-contact
    // pan path). The tip (`button === 0`) is unaffected and still draws.
    if (e.pointerType === 'pen' && intent === 'ignore') return;
    const panTool = activeToolRef.current === 'pan';
    const hit = canvas.hitObject(point);
    const dragSession: DragSession = {
      target: decideDragTarget({ panTool, intent, hit }),
      preDragPosition: null,
    };
    const contact: Contact = {
      intent,
      session: dragSession,
      start: point,
      startImage: { x: 0, y: 0 },
      startAt: performance.now(),
      last: point,
      toolAction: 'none',
      forcePan: false,
      objectKey: null,
      freehandKind: null,
      owner: null,
      pressure: e.pressure,
      marqueeCandidate: false,
      longPressTimer: null,
      eraseObject: false,
      eraseMoved: false,
      eraseTimer: null,
    };
    contacts.set(e.pointerId, contact);

    const imagePoint = canvas.screenToImage(point);
    contact.startImage = { ...imagePoint };
    const keypadOpen = useEditorStore.getState().keypadOpen;

    // Select + a real object + long press (600 ms) → select and pin the mini-toolbar
    // (touch model §3.3). Locked objects only shake + toast; they never pin.
    if (intent !== 'ignore' && !keypadOpen && toolIdRef.current === 'select' && hit) {
      const key = scene.keyForAnnotationId(hit.id);
      if (key && hit.locked) {
        emitToast(STRINGS.editor.lockedToast);
      } else if (key) {
        contact.longPressTimer = window.setTimeout(() => {
          contact.longPressTimer = null;
          selectRef.current?.longPress(key);
        }, LONG_PRESS_MS);
      }
    }

    // Select on EMPTY canvas with a non-touch pointer (pen/mouse) is a marquee
    // candidate; touch keeps one-finger pan (tests/sheetEditor.browser F1). It only
    // becomes a marquee once the contact actually moves (so taps still clear/double-tap).
    if (
      intent !== 'ignore' &&
      !keypadOpen &&
      toolIdRef.current === 'select' &&
      !hit &&
      e.pointerType !== 'touch'
    ) {
      contact.marqueeCandidate = true;
    }

    // D151: select tool + a press on the selected dimension's text drags the text only.
    const label = intent !== 'ignore' && !keypadOpen && toolIdRef.current === 'select' ? labelUnder(point) : null;
    if (label) {
      labelDrags.set(e.pointerId, { key: label.key, before: label.geometry });
      window.clearTimeout(contact.longPressTimer ?? undefined);
      contact.longPressTimer = null;
      contact.marqueeCandidate = false;
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is a nicety; the handlers still work without it.
      }
      return;
    }

    // Keypad-open (touch model §5.1): pan + pinch only; taps do nothing.
    if (keypadOpen) {
      contact.forcePan = true;
      contact.session.target = 'pan';
    } else if (
      intent !== 'ignore' &&
      toolIdRef.current === 'select' &&
      selectRef.current?.hitHandleAt(imagePoint, e.pointerType)
    ) {
      selectRef.current.onPointerDown(imagePoint, e.pointerType);
      contact.toolAction = 'consume';
      contact.forcePan = true;
      contact.owner = 'markup';
    } else if (intent !== 'ignore' && placementArmed()) {
      const dispatched = markupPointerDown(imagePoint, e.pointerType, e.pressure, contact);
      if (dispatched !== 'none') {
        contact.toolAction = dispatched;
        contact.forcePan = true;
        contact.owner = 'markup';
        if (dispatched === 'pan') contact.session.target = 'pan';
      } else {
        // The dimension machine (the coarse `'place'` prop's original owner).
        const action = tool.onPointerDown(imagePoint, e.pointerType);
        contact.toolAction = action;
        contact.forcePan = true;
        contact.owner = 'dimension';
        if (action === 'pan') contact.session.target = 'pan';
      }
    } else if (intent !== 'ignore' && tool.state.phase !== 'idle') {
      const action = tool.onPointerDown(imagePoint, e.pointerType);
      contact.toolAction = action;
      contact.forcePan = true;
      contact.owner = 'dimension';
      if (action === 'pan') contact.session.target = 'pan';
    } else if (contact.session.target === 'object' && hit) {
      const key = scene.keyForAnnotationId(hit.id);
      const geometry = key ? scene.geometryCopy(key) : null;
      const bounds = key ? scene.boundsAt(key) : null;
      if (key && geometry && bounds) {
        contact.objectKey = key;
        objectDrags.set(e.pointerId, {
          key,
          geometry,
          startImage: imagePoint,
        });
        // D63: record the pre-drag position for the second-finger restore.
        contact.session.preDragPosition = canvas.imageToScreen({ x: bounds.x, y: bounds.y });
      }
    }

    // Erase object mode (A3): reveal the `--err` outline only after a 600 ms hold.
    if (contact.eraseObject) {
      contact.eraseTimer = window.setTimeout(() => {
        contact.eraseTimer = null;
        eraseRef.current?.beginPreview(imagePoint);
      }, LONG_PRESS_MS);
    }

    if (contacts.size >= 2) {
      for (const [pointerId, other] of contacts) {
        const resolution = onSecondFinger(other.session);
        if (!resolution.cancelled) continue;
        // D63 — restore the object's pre-drag position; never commit at the displaced spot.
        const drag = objectDrags.get(pointerId);
        if (drag) {
          scene.setGeometry(drag.key, drag.geometry);
          objectDrags.delete(pointerId);
        }
        other.session.target = 'pan';
        other.forcePan = true;
        other.toolAction = 'none';
      }
    }
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is a nicety; the handlers still work without it.
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const contact = contacts.get(e.pointerId);
    if (!contact) return;
    const point = canvas.pointerPosition(e);
    const imagePoint = canvas.screenToImage(point);
    const moved = Math.hypot(point.x - contact.start.x, point.y - contact.start.y) > TAP_SLOP;

    const labelDrag = labelDrags.get(e.pointerId);
    if (labelDrag) {
      const g = labelDrag.before;
      if (g.kind === 'dimension') {
        scene.setGeometry(labelDrag.key, { ...g, labelOffset: perpendicularOffset(g.a, g.b, imagePoint) });
      }
      contact.last = point;
      return;
    }

    if (contact.freehandKind) {
      const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
      ink.extend(imagePoint, e.pressure);
      contact.last = point;
      return;
    }

    // Any real movement cancels a pending select long-press (A2).
    if (contact.longPressTimer !== null && moved) {
      window.clearTimeout(contact.longPressTimer);
      contact.longPressTimer = null;
    }

    // Erase object mode (A3): moving beyond the slop cancels the preview and the delete.
    if (contact.eraseObject) {
      if (moved && !contact.eraseMoved) {
        contact.eraseMoved = true;
        if (contact.eraseTimer !== null) {
          window.clearTimeout(contact.eraseTimer);
          contact.eraseTimer = null;
        }
        eraseRef.current?.onPointerCancel();
      }
      contact.last = point;
      return;
    }

    if (contact.toolAction !== 'none') {
      const markupAction =
        contact.owner === 'markup' ? markupPointerMove(imagePoint, moved) : null;
      const action = markupAction ?? tool.onPointerMove(imagePoint, moved);
      if (action === 'consume') {
        contact.last = point;
        return;
      }
      contact.toolAction = 'none';
      contact.session.target = 'pan';
    }

    // Select marquee: arm the tool on the first real move across empty canvas (A2).
    // Arming on move (not down) keeps a tap's clear-selection/double-tap intact.
    if (
      contact.toolAction === 'none' &&
      contact.marqueeCandidate &&
      moved &&
      toolIdRef.current === 'select'
    ) {
      const select = selectRef.current;
      if (select) {
        select.onPointerDown(contact.startImage, e.pointerType);
        select.onPointerMove(imagePoint, true);
        contact.toolAction = 'consume';
        contact.forcePan = true;
        contact.owner = 'markup';
        contact.last = point;
        return;
      }
    }

    if (contacts.size === 1) {
      if (contact.session.target === 'pan' && (contact.forcePan || !placementPendingRef.current)) {
        canvas.panBy(point.x - contact.last.x, point.y - contact.last.y);
      } else if (
        contact.session.target === 'object' &&
        !placementPendingRef.current &&
        contact.objectKey
      ) {
        const drag = objectDrags.get(e.pointerId);
        if (drag) {
          const dx = imagePoint.x - drag.startImage.x;
          const dy = imagePoint.y - drag.startImage.y;
          scene.setGeometry(drag.key, translateGeometry(drag.geometry, dx, dy));
        }
      }
    }
    contact.last = point;
  };

  const endContact = (e: PointerEvent): void => {
    const contact = contacts.get(e.pointerId);
    if (!contact) return;
    const point = canvas.pointerPosition(e);
    const imagePoint = canvas.screenToImage(point);
    const duration = performance.now() - contact.startAt;
    const tapped = isTap(point.x - contact.start.x, point.y - contact.start.y, duration);
    contacts.delete(e.pointerId);
    const labelDrag = labelDrags.get(e.pointerId);
    if (labelDrag) {
      labelDrags.delete(e.pointerId);
      const after = scene.geometryCopy(labelDrag.key);
      const before = labelDrag.before;
      // One undo step per label drag; a tap on the text changes nothing and records nothing.
      if (after && JSON.stringify(after) !== JSON.stringify(before)) {
        history.exec({
          label: STRINGS.toasts.actionMoveDimension,
          do: () => scene.setGeometry(labelDrag.key, after),
          undo: () => scene.setGeometry(labelDrag.key, before),
        });
      }
      return;
    }
    if (e.pointerType === 'pen') router.penStrokeEnd();
    if (e.pointerType === 'touch') router.noteTouchUp(e.pointerId);

    // Clear any pending select long-press.
    if (contact.longPressTimer !== null) {
      window.clearTimeout(contact.longPressTimer);
      contact.longPressTimer = null;
    }

    // The tool owns this contact's lift (commit B / end refine).
    if (contact.freehandKind) {
      const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
      ink.end(tapped);
      return;
    }

    // Erase object mode (A3): a short press deletes and toasts; a 600 ms hold (preview)
    // or a move cancels. The tool's own `onPointerUp` already owns the delete + toast.
    if (contact.eraseObject) {
      if (contact.eraseTimer !== null) {
        window.clearTimeout(contact.eraseTimer);
        contact.eraseTimer = null;
      }
      const erase = eraseRef.current;
      if (erase) {
        if (!contact.eraseMoved && !isErasePreview(duration)) {
          erase.beginPreview(imagePoint);
          erase.onPointerUp(imagePoint, true, e.pointerType);
        } else {
          erase.onPointerCancel();
        }
      }
      return;
    }

    if (contact.toolAction === 'consume') {
      if (contact.owner === 'markup') markupPointerUp(imagePoint, tapped, e.pointerType);
      else tool.onPointerUp(imagePoint, tapped, e.pointerType);
      return;
    }

    // Object-first move: commit one undo step, or treat a tap as a selection.
    if (contact.objectKey) {
      const drag = objectDrags.get(e.pointerId);
      objectDrags.delete(e.pointerId);
      if (drag) {
        const dx = imagePoint.x - drag.startImage.x;
        const dy = imagePoint.y - drag.startImage.y;
        const to = translateGeometry(drag.geometry, dx, dy);
        // F6: the pointermove path already mutated the geometry on EVERY move,
        // including moves below the 8 px tap slop. Record a step whenever the geometry
        // ACTUALLY changed (pre-drag vs. current), not only once `drag.moved` cleared
        // the slop — otherwise the mutation is persisted but unreachable by history,
        // and the first undo deletes the object instead of restoring it. A contact
        // that never moved keeps the tap/selection behaviour and creates no step.
        const current = scene.geometryCopy(drag.key);
        const changed =
          current !== null && JSON.stringify(current) !== JSON.stringify(drag.geometry);
        if (changed) {
          history.exec({
            label: STRINGS.toasts.actionMoveDimension,
            do: () => scene.setGeometry(drag.key, to),
            undo: () => scene.setGeometry(drag.key, drag.geometry),
          });
        } else if (tapped) {
          // A second tap on an already-selected object opens its actions (A2). For an
          // inset it enters Focus (UI §9:588/627).
          if (selectRef.current?.tapObject(drag.key) === 'action') {
            if (sceneRef.current?.get(drag.key)?.type === 'image') insetRef.current?.enterFocus(drag.key);
            else setPinnedToolbar(true);
          }
        }
      }
    }

    if (!tapped || contact.intent === 'ignore') return;
    if (contact.toolAction !== 'none') return;
    if (placementArmed()) return; // a tap would place a point — never deferred

    // Select tool: tap an object selects it (locked objects only toast); empty clears.
    if (activeToolRef.current === 'select') {
      const hit = canvas.hitObject(point);
      const key = hit ? scene.keyForAnnotationId(hit.id) : null;
      if (key) {
        // A locked object already toasted on pointerdown (touch model §3.3 shake);
        // selecting it is still allowed so it can be unlocked in Layers.
        if (selectRef.current?.tapObject(key) === 'action') {
          if (sceneRef.current?.get(key)?.type === 'image') insetRef.current?.enterFocus(key);
          else setPinnedToolbar(true);
        }
        return;
      }
      useEditorStore.getState().clearSelection();
      setPinnedToolbar(false);
    }

    const now = performance.now();
    if (
      lastTap &&
      now - lastTap.at <= DOUBLE_TAP_MS &&
      Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) <= DOUBLE_TAP_SLOP
    ) {
      lastTap = null;
      canvas.toggleFitOrFull();
    } else {
      lastTap = { point, at: now };
    }
  };

  const cancelContact = (e: PointerEvent): void => {
    const contact = contacts.get(e.pointerId);
    if (!contact) return;
    contacts.delete(e.pointerId);
    const labelDrag = labelDrags.get(e.pointerId);
    if (labelDrag) {
      // Interrupted (palm rejection, browser cancel): put the text back, as an object drag does.
      labelDrags.delete(e.pointerId);
      scene.setGeometry(labelDrag.key, labelDrag.before);
      return;
    }
    // An interrupted object-first drag RESTORES the pre-drag geometry — the same rule
    // the D63 second-finger cancel above follows. `onPointerMove` has been writing every
    // intermediate position through `scene.setGeometry` (persisted via `scene.onChange`),
    // while the only history step is recorded in `endContact`; dropping the drag record
    // alone therefore left the document mutated, saved to markup.json and unreachable by
    // undo (session-13 review F1). `pointercancel` is the palm-rejection / browser-
    // interrupt case — exactly what a gloved hand on a Surface produces.
    const cancelledDrag = objectDrags.get(e.pointerId);
    if (cancelledDrag) {
      scene.setGeometry(cancelledDrag.key, cancelledDrag.geometry);
      objectDrags.delete(e.pointerId);
    }
    if (e.pointerType === 'pen') router.penStrokeEnd();
    if (e.pointerType === 'touch') router.noteTouchUp(e.pointerId);
    if (contact.longPressTimer !== null) {
      window.clearTimeout(contact.longPressTimer);
      contact.longPressTimer = null;
    }
    if (contact.eraseTimer !== null) {
      window.clearTimeout(contact.eraseTimer);
      contact.eraseTimer = null;
    }
    if (contact.eraseObject) {
      eraseRef.current?.onPointerCancel();
      return;
    }
    if (contact.freehandKind) {
      const ink = contact.freehandKind === 'freehand' ? freehandRef.current! : highlightRef.current!;
      ink.cancel();
      return;
    }
    if (contact.toolAction !== 'none') {
      if (contact.owner === 'markup') {
        // A Select handle drag is markup-owned. Call the tool's own cancel FIRST: it
        // restores the pre-drag geometry and clears `transform` (F1). `cancelActiveMarkup`
        // then still runs for whatever else was armed — it routes through the SAME
        // restore-and-clear helper (`SelectTool.onToolChange`), so this is idempotent and
        // the shell is correct even if the two ever get out of order again.
        selectRef.current?.onPointerCancel();
        cancelActiveMarkup();
        // `onToolChange` drops the overlay; the selection itself survives an interrupted
        // contact, so put its handles back.
        if (toolIdRef.current === 'select') selectRef.current?.refresh();
      } else tool.onPointerCancel(e.pointerType);
    }
  };

  const markupToolPending = (): boolean => {
    for (const shape of shapeToolsRef.current.values()) if (shape.pending) return true;
    return Boolean(
      angleRef.current?.pending ||
        freehandRef.current?.pending ||
        highlightRef.current?.pending ||
        textRef.current?.pending ||
        eraseRef.current?.pending ||
        insetRef.current?.pending,
    );
  };


  return { onPointerDown, onPointerMove, endContact, cancelContact, markupToolPending };
}
