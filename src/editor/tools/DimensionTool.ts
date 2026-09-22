/**
 * `src/editor/tools/DimensionTool.ts` — the flagship placement machine (build spec
 * §8.5 Dimension; UI §8.1; touch model §1–§3; plan slice 1.5 build order step 3).
 *
 * **One machine, no second path for touch.** `pointerdown` places A; contact drift
 * updates a provisional B; `pointerup` places B. A pen drag is "A on down, B on up"; a
 * finger tap-tap is the same machine with the provisional never moving — the first tap
 * authors A and its lift commits nothing, the second tap authors B and its lift commits.
 *
 * **Pure decisions live at the top of this file** (`decideContact`, `shouldAutoOpenKeypad`,
 * `shouldCommitOnUp`, `chainAnchor`, `commitGate`, `snapAcquirePx`) and are unit-tested
 * in `tests/dimensionMachine.test.ts`. The class below only *consumes* them — the F1
 * review finding was a tested predicate the caller never wired, so the browser test in
 * `tests/dimensionTool.browser.test.ts` proves the wiring end to end.
 *
 * **Settle window (§1.4, locked):** `commitB` commits the geometry immediately, then
 * `settleTimer = setTimeout(openKeypad, 450)`. Any canvas `pointerdown` before it fires
 * cancels the auto-open **permanently for that placement**; within 40 px of an anchor it
 * enters `RefineEndpoint`, otherwise it pans. Refining does not re-arm. Contact never
 * discards geometry.
 */
import type Konva from 'konva';
import type { Annotation } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import { pixelDistance } from '@/domain/geometry';
import { snapAngle, snapPoint, type SnapTarget } from '@/domain/snapping';
import {
  composeEnteredText,
  isCommittableInches,
  keypadValueInches,
  MAX_LENGTH_IN,
  parseLooseToSlots,
} from '@/domain/units';
import { type EditorCanvas, type ScreenPoint } from '@/editor/EditorCanvas';
import type { Command, History } from '@/editor/history';
import {
  penLoupeSpec,
  touchLoupeSpec,
  type Loupe,
} from '@/editor/Loupe';
import type { MarkupScene } from '@/editor/shapes/scene';
import { buildDimensionGroup } from '@/editor/shapes/renderDimension';
import type { Px } from '@/domain/types';

/* ------------------------------------------------------------------ *
 * Pure decisions (the machine's whole brain — unit-tested)
 * ------------------------------------------------------------------ */

/** touch model §1.4: the settle window is 450 ms. */
export const SETTLE_MS = 450;
/** §1.4/§8.5: a contact within 40 px of an anchor enters RefineEndpoint. */
export const REFINE_RADIUS_PX = 40;
/** touch model §2.2: acquire 32 px → lock 20 px under touch; pen stays 20 px. */
export const SNAP_ACQUIRE_TOUCH_PX = 32;
export const SNAP_LOCK_TOUCH_PX = 20;
export const SNAP_PEN_PX = 20;
/** §5.4 gloved touch: hit slop +8 px, snap acquire +4 px. */
export const GLOVE_ACQUIRE_BONUS_PX = 4;

export function snapAcquirePx(pointerType: string, gloved: boolean): number {
  if (pointerType !== 'touch') return SNAP_PEN_PX;
  return SNAP_ACQUIRE_TOUCH_PX + (gloved ? GLOVE_ACQUIRE_BONUS_PX : 0);
}

/** Default snap strength under touch is Strong (touch model §2.2). */
export function defaultSnapStrength(pointerType: string): 'strong' | 'normal' {
  return pointerType === 'touch' ? 'strong' : 'normal';
}

/**
 * Tap-vs-drag for a placement contact. A contact that authored A commits B on lift only
 * when it actually dragged (a *tap* placed A alone); a contact that authored B always
 * commits B on lift (tap-tap). `isTap` is the shared 8 px / 400 ms predicate (D54).
 */
export function shouldCommitOnUp(input: {
  role: 'authoredA' | 'placingB' | 'refining';
  tapped: boolean;
}): boolean {
  // A contact that authored B across taps commits only on a *tap*; if it dragged it is
  // the "drag = pan" case (UI §8.1 AnchorA row) and the shell pans instead.
  if (input.role === 'placingB') return input.tapped;
  // A contact that authored A commits B on lift only when it actually dragged (the pen
  // A-on-down/B-on-up path); a tap placed A alone.
  if (input.role === 'authoredA') return !input.tapped;
  return false;
}

/** §1.4: the keypad auto-opens only if NO contact occurred during the settle window. */
export function shouldAutoOpenKeypad(autoOpenCancelled: boolean): boolean {
  return !autoOpenCancelled;
}

export type RefineDecision = 'a' | 'b' | null;

/**
 * §1.4/§8.5: a contact within `radiusPx` (screen) of an anchor refines that anchor;
 * otherwise it pans. Pure — distance is screen-space (`imageDist × scale`).
 */
export function decideContact(
  point: Px,
  anchors: { a: Px; b: Px },
  radiusPx: number,
  scale: number,
): RefineDecision {
  const da = pixelDistance(point, anchors.a) * scale;
  const db = pixelDistance(point, anchors.b) * scale;
  if (da <= radiusPx && da <= db) return 'a';
  if (db <= radiusPx) return 'b';
  return null;
}

/** §8.5: after Chain (or `✓ Value` + chain), the next dimension starts locked at B. */
export function chainAnchor(previousB: Px): Px {
  return { x: previousB.x, y: previousB.y };
}

/** The four numbers of the chain: a degenerate A≈B segment is a mis-tap, not a dimension. */
export function isDegenerateSegment(a: Px, b: Px, minScreenPx: number, scale: number): boolean {
  return pixelDistance(a, b) * scale < minScreenPx;
}
export const DEGENERATE_MIN_PX = 4;

/* ---- the commit gate (F3/F4: reasons, not a dead button) ---- */

export type RefusalReason = 'enterLength' | 'fractionTooBig' | 'tooLarge';

export type CommitGateResult =
  | { ok: true; valueInches: number; enteredText: string; valueMm: number }
  | { ok: false; reason: RefusalReason };

const MM_PER_IN = 25.4;

/**
 * The ONLY gate the commit button may use (plan build order step 4, F3/F4) — driven by
 * the real domain primitives, not a null check:
 *   - `0` → `keypadValueInches` = 0 → `isCommittableInches(0)` false → `enterLength`
 *   - `12 6 20` → `parseLooseToSlots` null (20 ≥ 16) → `fractionTooBig`
 *   - `-5` → parse null → `enterLength`
 *   - a 1001-ft value → value > `MAX_LENGTH_IN` (12000) → `tooLarge`
 */
export function commitGate(raw: string, denominator: number): CommitGateResult {
  const parsed = parseLooseToSlots(raw, denominator);
  if (!parsed) {
    const m = raw.trim().match(/^(\d+)(?:[\s-]+(\d+))?(?:[\s-]+(\d+))?"?$/);
    if (m && m[3] !== undefined && Number(m[3]) >= denominator) {
      return { ok: false, reason: 'fractionTooBig' };
    }
    return { ok: false, reason: 'enterLength' };
  }
  const valueInches = keypadValueInches(parsed.slots);
  if (!isCommittableInches(valueInches)) {
    // Distinguish "too small / empty" from "beyond 1000 ft" so the sheet can say why.
    if (valueInches !== null && valueInches > MAX_LENGTH_IN) return { ok: false, reason: 'tooLarge' };
    return { ok: false, reason: 'enterLength' };
  }
  const enteredText = parsed.rawDecimal ?? composeEnteredText(parsed.slots);
  return {
    ok: true,
    valueInches: valueInches as number,
    enteredText,
    valueMm: (valueInches as number) * MM_PER_IN,
  };
}

/* ------------------------------------------------------------------ *
 * The tool
 * ------------------------------------------------------------------ */

export type PlacementPhase = 'idle' | 'anchorA' | 'anchorB' | 'refine';
export type ContactRole = 'none' | 'authoredA' | 'placingB' | 'refining';

export interface DimensionToolSettings {
  precisionDenominator: number;
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  handedness: 'left' | 'right';
  magnifierOnTap: boolean;
  glovedTouch: boolean;
}

export interface KeypadRequest {
  /** The committed annotation's address (§20.1 key). */
  key: string;
  initialValueMm: number | null;
}

export interface DimensionSnapshot {
  phase: PlacementPhase;
  /** A dimension object exists (committed geometry). */
  hasGeometry: boolean;
  key: string | null;
}

export interface DimensionToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  loupe: Loupe;
  getSettings: () => DimensionToolSettings;
  /** `null` closes the keypad. `onCommit`/`onCancel` come back through the methods below. */
  onKeypadOpen: (request: KeypadRequest | null) => void;
  onSnapshot: (snapshot: DimensionSnapshot) => void;
  /** Action labels for undo/redo toasts (strings owner supplies them). */
  labels: {
    add: string;
    move: string;
    delete: string;
    setValue: string;
    adjust: string;
  };
  newId?: () => string;
}

export class DimensionTool {
  private readonly deps: DimensionToolDeps;
  private phase: PlacementPhase = 'idle';
  private a: Px | null = null;
  private b: Px | null = null;
  private provisional: Px | null = null;
  private pendingKey: string | null = null;
  private chainFrom: Px | null = null;
  private contactRole: ContactRole = 'none';
  private lastPointerType = 'touch';
  private autoOpenCancelled = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private provisionalGroup: Konva.Group | null = null;
  private refineStartGeometry: { a: Px; b: Px } | null = null;
  private refineWhich: 'a' | 'b' | null = null;
  private snappedAngle: number | null = null;
  private readonly newId: () => string;

  constructor(deps: DimensionToolDeps) {
    this.deps = deps;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /* ---- introspection (browser test + HUD) ---- */

  get state(): DimensionSnapshot {
    return { phase: this.phase, hasGeometry: this.pendingKey !== null, key: this.pendingKey };
  }

  get provisionalPoint(): Px | null {
    return this.provisional;
  }

  get snappedAngleDeg(): number | null {
    return this.snappedAngle;
  }

  private snapshot(): void {
    this.deps.onSnapshot(this.state);
  }

  /* ---- pointer entry points (called by SheetEditor) ---- */

  /**
   * Returns what the shell should do with the contact: `'consume'` (the tool owns it),
   * or `'pan'` (the canvas may pan).
   */
  onPointerDown(point: Px, pointerType: string): 'consume' | 'pan' {
    this.lastPointerType = pointerType;
    const settings = this.deps.getSettings();
    this.showLoupe(point, pointerType, settings);

    // A contact during/after the settle window cancels the auto-open permanently and
    // either refines an anchor or pans. Refining does not re-arm.
    if (this.phase === 'anchorB' && this.pendingKey) {
      this.cancelAutoOpen();
      const anchors = this.committedAnchors();
      const decision = anchors
        ? decideContact(point, anchors, REFINE_RADIUS_PX, this.deps.canvas.scale)
        : null;
      if (decision) {
        this.beginRefine(decision);
        return 'consume';
      }
      return 'pan';
    }

    if (this.phase === 'refine') return 'consume';

    // Post-place refinement: a selected dimension's anchors are permanently grabbable.
    if (this.phase === 'idle') {
      const decision = this.hitSelectedAnchor(point);
      if (decision) {
        this.beginRefine(decision);
        return 'consume';
      }
    }

    if (this.phase === 'idle' || (this.phase === 'anchorA' && this.a === null)) {
      const snapped = this.snap(point);
      this.a = this.chainFrom ? chainAnchor(this.chainFrom) : snapped;
      this.provisional = this.a;
      this.phase = 'anchorA';
      this.contactRole = 'authoredA';
      this.autoOpenCancelled = false;
      this.renderProvisional();
      this.snapshot();
      return 'consume';
    }

    if (this.phase === 'anchorA' && this.a) {
      this.contactRole = 'placingB';
      this.provisional = this.snap(point);
      this.renderProvisional();
      return 'consume';
    }

    return 'pan';
  }

  /**
   * Returns `'consume'` while the tool owns the moving contact (rubber-band), `'pan'`
   * once a `placingB` contact has dragged past the tap slop — the UI §8.1 AnchorA rule
   * is "tap = place B · drag = pan".
   */
  onPointerMove(point: Px, movedBeyondSlop: boolean): 'consume' | 'pan' {
    if (this.contactRole === 'authoredA' || this.contactRole === 'placingB') {
      if (this.contactRole === 'placingB' && movedBeyondSlop) {
        this.contactRole = 'none';
        this.provisional = null;
        this.snappedAngle = null;
        this.clearProvisional();
        this.deps.loupe.track(this.toScreen(point), this.toScreen(this.a ?? point));
        return 'pan';
      }
      this.provisional = this.snap(point);
      this.renderProvisional();
      this.deps.loupe.track(this.toScreen(point), this.toScreen(this.a ?? point));
      return 'consume';
    }
    if (this.contactRole === 'refining' && this.refineWhich && this.pendingKey) {
      this.deps.scene.setAnchor(this.pendingKey, this.refineWhich, this.snap(point));
      this.deps.loupe.track(this.toScreen(point), this.toScreen(this.a ?? point));
      return 'consume';
    }
    return 'pan';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    const role = this.contactRole;
    this.contactRole = 'none';
    this.liftLoupe(pointerType);

    if (role === 'refining') {
      this.endRefine();
      return;
    }
    if (role !== 'authoredA' && role !== 'placingB') return;
    if (!shouldCommitOnUp({ role, tapped })) {
      return;
    }
    this.commitB(this.snap(point));
  }

  onPointerCancel(pointerType: string): void {
    this.contactRole = 'none';
    this.liftLoupe(pointerType);
    // §1.5 #8: pointercancel DISCARDS a still-pending touch placement (B was never chosen).
    if (this.phase === 'anchorA' && this.pendingKey === null) this.discardPendingA();
    else if (this.phase === 'refine') this.endRefine();
  }

  /* ---- keypad round-trips ---- */

  /** `✓ Use this value`. */
  commitValue(result: { valueMm: number; enteredText: string; chain: boolean }): void {
    const key = this.pendingKey;
    if (!key) return;
    const prev = this.deps.scene.get(key);
    const prevValue = prev?.valueMm ?? null;
    const prevText = prev?.enteredText ?? null;
    // D77/F4: read the LIVE anchor from the scene. A refine drag moves the geometry via
    // `scene.setAnchor` and never updates `this.b`, so chaining from the stale field locked
    // the next dimension at the pre-refine B (the typed value was unaffected).
    const committedB = this.deps.scene.geometryAt(key)?.b ?? this.b;
    this.exec({
      label: this.deps.labels.setValue,
      do: () => this.deps.scene.setValue(key, result.valueMm, result.enteredText),
      undo: () => this.deps.scene.setValue(key, prevValue, prevText),
    });
    this.closeKeypad();
    if (result.chain && committedB) this.startNextFrom(committedB);
    else this.finishPlacement();
  }

  /** `Esc` / `✕` — keep the geometry (it becomes the `Valueless` ghost state). */
  cancelValue(): void {
    this.closeKeypad();
    this.finishPlacement();
  }

  /** `✓ Value` HUD button when the auto-open was cancelled. */
  requestKeypad(): void {
    if (!this.pendingKey) return;
    this.deps.onKeypadOpen({
      key: this.pendingKey,
      initialValueMm: this.deps.scene.get(this.pendingKey)?.valueMm ?? null,
    });
  }

  /** `Adjust endpoints` HUD button — enters refine for the last anchor (B). */
  adjustEndpoints(): void {
    if (!this.pendingKey) return;
    this.cancelAutoOpen();
    this.closeKeypad();
    // Enter the SAME refine state the 40 px-contact path enters (D77/F2). The old body set
    // `phase='refine'` but left `contactRole='none'`, so the next drag returned `'pan'` and
    // panned the canvas — the button was dead. `beginRefine` arms `contactRole='refining'`
    // (and records the start geometry for the one-step undo).
    this.beginRefine('b');
  }

  /** Esc / ✕ / tool change. Returns `'kept'` when committed geometry was retained. */
  cancelPending(): 'kept' | 'discarded' | 'none' {
    if (this.phase === 'anchorA' && this.pendingKey === null) {
      this.discardPendingA();
      return 'discarded';
    }
    if (this.pendingKey) {
      // Geometry was committed: keep it (Valueless if no value), close the keypad.
      this.closeKeypad();
      this.finishPlacement();
      return 'kept';
    }
    if (this.phase === 'refine') {
      this.endRefine();
      return 'none';
    }
    return 'none';
  }

  /** Delete a committed dimension (selection Delete). */
  deleteDimension(key: string): void {
    const ann = this.deps.scene.get(key);
    if (!ann) return;
    this.exec({
      label: this.deps.labels.delete,
      do: () => this.deps.scene.removeObject(key),
      undo: () => this.deps.scene.addAnnotation({ ...ann, geometry: { ...ann.geometry } } as Annotation),
    });
  }

  /** Object-first one-finger move (undoable). `start` is captured at dragstart. */
  moveDimension(key: string, from: { a: Px; b: Px }, dx: number, dy: number): void {
    const to = {
      a: { x: from.a.x + dx, y: from.a.y + dy },
      b: { x: from.b.x + dx, y: from.b.y + dy },
    };
    this.exec({
      label: this.deps.labels.move,
      do: () => {
        this.deps.scene.setAnchor(key, 'a', to.a);
        this.deps.scene.setAnchor(key, 'b', to.b);
      },
      undo: () => {
        this.deps.scene.setAnchor(key, 'a', from.a);
        this.deps.scene.setAnchor(key, 'b', from.b);
      },
    });
  }

  /** Switch-tool safety: A is discarded, B is kept (touch model §1.5 #6). */
  onToolChange(): void {
    if (this.pendingKey) this.finishPlacement();
    else this.discardPendingA();
  }

  /** Unmount: drop timers and provisional nodes. */
  dispose(): void {
    this.contactRole = 'none';
    this.clearSettleTimer();
    this.clearProvisional();
  }

  get pendingAnnotationKey(): string | null {
    return this.pendingKey;
  }

  /* ---- internals ---- */

  private committedAnchors(): { a: Px; b: Px } | null {
    if (!this.pendingKey) return null;
    const ann = this.deps.scene.get(this.pendingKey);
    if (!ann || ann.geometry.kind !== 'dimension') return null;
    return { a: { ...ann.geometry.a }, b: { ...ann.geometry.b } };
  }

  private hitSelectedAnchor(point: Px): RefineDecision {
    const selected = this.selectedKeys();
    for (const key of selected) {
      const ann = this.deps.scene.get(key);
      if (!ann || ann.geometry.kind !== 'dimension') continue;
      const decision = decideContact(
        point,
        { a: ann.geometry.a, b: ann.geometry.b },
        REFINE_RADIUS_PX,
        this.deps.canvas.scale,
      );
      if (decision) {
        this.pendingKey = key;
        return decision;
      }
    }
    return null;
  }

  /** Overridable seam: the shell injects the selection read. */
  selectedKeys: () => string[] = () => [];

  private beginRefine(which: 'a' | 'b'): void {
    if (!this.pendingKey) return;
    this.refineWhich = which;
    this.refineStartGeometry = this.committedAnchors();
    this.phase = 'refine';
    this.contactRole = 'refining';
    this.snapshot();
  }

  private endRefine(): void {
    const key = this.pendingKey;
    const start = this.refineStartGeometry;
    const which = this.refineWhich;
    this.refineWhich = null;
    this.refineStartGeometry = null;
    // A refine armed by the HUD button (D77/F2) has no pointer-up to clear the role; drop
    // it here so no stale `refining` survives into the next contact.
    this.contactRole = 'none';
    if (key && start && which) {
      const end = this.committedAnchors();
      if (end && (end[which].x !== start[which].x || end[which].y !== start[which].y)) {
        // The live drag already moved the anchor; record one undo step for the whole drag.
        this.exec({
          label: this.deps.labels.adjust,
          do: () => this.deps.scene.setAnchor(key, which, end[which]),
          undo: () => this.deps.scene.setAnchor(key, which, start[which]),
        });
      }
    }
    this.phase = this.pendingKey ? 'anchorB' : 'idle';
    this.snapshot();
  }

  private commitB(b: Px): void {
    const a = this.a;
    if (!a) return;
    if (isDegenerateSegment(a, b, DEGENERATE_MIN_PX, this.deps.canvas.scale)) {
      // Degenerate-segment guard (§1.5 #4): cancel silently, keep nothing.
      this.discardPendingA();
      return;
    }
    const id = this.newId();
    this.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) this.deps.scene.addDimension(a, b, id);
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.pendingKey = id;
    this.b = b;
    this.provisional = null;
    this.clearProvisional();
    this.phase = 'anchorB';
    this.autoOpenCancelled = false;
    this.snapshot();
    this.startSettleTimer();
  }

  private startSettleTimer(): void {
    this.clearSettleTimer();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (shouldAutoOpenKeypad(this.autoOpenCancelled) && this.pendingKey && this.phase === 'anchorB') {
        this.deps.onKeypadOpen({
          key: this.pendingKey,
          initialValueMm: this.deps.scene.get(this.pendingKey)?.valueMm ?? null,
        });
      }
    }, SETTLE_MS);
  }

  /** Any canvas contact during the settle window clears the timer PERMANENTLY. */
  private cancelAutoOpen(): void {
    this.autoOpenCancelled = true;
    this.clearSettleTimer();
  }

  private clearSettleTimer(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  private closeKeypad(): void {
    this.deps.onKeypadOpen(null);
  }

  private finishPlacement(): void {
    this.clearSettleTimer();
    this.phase = 'idle';
    this.a = null;
    this.b = null;
    this.pendingKey = null;
    this.chainFrom = null;
    this.provisional = null;
    this.snappedAngle = null;
    this.clearProvisional();
    this.snapshot();
  }

  private discardPendingA(): void {
    this.clearSettleTimer();
    this.phase = 'idle';
    this.a = null;
    this.b = null;
    this.pendingKey = null;
    this.chainFrom = null;
    this.provisional = null;
    this.snappedAngle = null;
    this.clearProvisional();
    this.snapshot();
  }

  private startNextFrom(previousB: Px): void {
    this.a = chainAnchor(previousB);
    this.chainFrom = chainAnchor(previousB);
    this.b = null;
    this.pendingKey = null;
    this.provisional = this.a;
    this.phase = 'anchorA';
    this.autoOpenCancelled = false;
    this.renderProvisional();
    this.snapshot();
  }

  private exec(command: Command): void {
    this.deps.history.exec(command);
  }

  /* ---- snapping ---- */

  private snapTargets(): SnapTarget[] {
    const targets: SnapTarget[] = [];
    for (const ann of this.deps.scene.list()) {
      if (ann.geometry.kind !== 'dimension') continue;
      targets.push({ p: ann.geometry.a, kind: 'endpoint' });
      targets.push({ p: ann.geometry.b, kind: 'endpoint' });
    }
    return targets;
  }

  private snap(point: Px): Px {
    const settings = this.deps.getSettings();
    const acquireImage = snapAcquirePx(this.lastPointerType, settings.glovedTouch) / this.deps.canvas.scale;
    const { p } = snapPoint(point, this.snapTargets(), acquireImage);
    return p;
  }

  /* ---- loupe ---- */

  private toScreen(point: Px): ScreenPoint {
    return this.deps.canvas.imageToScreen(point);
  }

  private showLoupe(point: Px, pointerType: string, settings: DimensionToolSettings): void {
    if (pointerType === 'touch' && !settings.magnifierOnTap) return;
    const spec = pointerType === 'touch' ? touchLoupeSpec() : penLoupeSpec();
    this.deps.loupe.show(this.toScreen(point), spec, this.toScreen(this.a ?? point));
  }

  private liftLoupe(pointerType: string): void {
    if (pointerType === 'touch') this.deps.loupe.lift();
    else this.deps.loupe.hide();
  }

  /* ---- provisional drawing ---- */

  private renderProvisional(): void {
    if (!this.a || !this.provisional) {
      this.clearProvisional();
      return;
    }
    this.clearProvisional();
    const settings = this.deps.getSettings();
    const group = buildDimensionGroup({
      id: '__provisional__',
      a: this.a,
      b: this.provisional,
      valueMm: null,
      style: DEFAULT_STYLE,
      ctx: {
        unitSystem: settings.unitSystem,
        unitFormat: settings.unitFormat,
        precisionDenominator: settings.precisionDenominator,
      },
      scale: this.deps.canvas.scale,
      // During drawing there is no value yet; v1 is typed-only, so the drawn length is
      // never rendered as a number (§8.5 #6). The committed ghost label appears later.
      ghostText: '',
      locked: true,
    });
    group.listening(false);
    this.provisionalGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();

    // Angle-snap chip near 0/45/90 (§8.5 step 1). Pure `snapAngle` drives it.
    const deg = (Math.atan2(this.provisional.y - this.a.y, this.provisional.x - this.a.x) * 180) / Math.PI;
    const snapped = snapAngle(deg);
    this.snappedAngle = snapped === deg ? null : snapped;
  }

  private clearProvisional(): void {
    this.provisionalGroup?.destroy();
    this.provisionalGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }
}
