/**
 * `src/editor/tools/AngleTool.ts` — the Angle tool (plan slice 1.6 build order step 3;
 * build spec §8.5 Angle; UI §8.2).
 *
 * **Vertex-first, 3 taps:** tap the vertex → ray-1 tip → ray-2 tip. The arc renders live
 * from tap 1, and a drag path (down at the vertex, up at each tip) remains supported.
 * After tap 3 the Angle sheet opens on the **same 450 ms settle rule** as the Dimension
 * keypad (§1.4). A tap within 44 px of the vertex cancels the placement.
 *
 * **The degenerate-ray refusal is load-bearing (§19.5).** `angleDeg(v, v, c)` silently
 * returns `0`, so a zero-length ray would commit a bogus `0°` angle. `angleCommitGate`
 * refuses any ray shorter than 8 screen px; the sheet is never opened for it.
 */
import Konva from 'konva';
import type { AnnotationStyle, Px } from '@/domain/types';
import { DEFAULT_STYLE } from '@/domain/types';
import { angleDeg, pixelDistance } from '@/domain/geometry';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { Command, History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import { buildShapeGroup } from '@/editor/shapes/renderShape';
import {
  ANGLE_RAY_MIN_PX,
  ANGLE_SETTLE_MS,
  ANGLE_VERTEX_CANCEL_PX,
  withinScreenPx,
  type ContactAction,
  type MarkupTool,
} from './toolTypes';

/* ------------------------------------------------------------------ *
 * Pure decisions
 * ------------------------------------------------------------------ */

export type AngleRefusal = 'rayTooShort' | 'cancelled';

export type AngleCommitGate =
  | { ok: true; degrees: number; complement: number; supplement: number }
  | { ok: false; reason: AngleRefusal };

/** A ray shorter than the 8 screen px floor is refused. */
export function rayTooShort(vertex: Px, tip: Px, scale: number): boolean {
  return pixelDistance(vertex, tip) * scale < ANGLE_RAY_MIN_PX;
}

/** A contact within 44 px of the vertex cancels the in-progress angle. */
export function isVertexCancel(point: Px, vertex: Px, scale: number): boolean {
  return withinScreenPx(point, vertex, ANGLE_VERTEX_CANCEL_PX, scale);
}

/**
 * The commit gate for a completed 3-tap angle. Refuses a degenerate ray rather than
 * committing the `0°` `angleDeg` returns for coincident points.
 */
export function angleCommitGate(vertex: Px, a: Px, c: Px, scale: number): AngleCommitGate {
  if (rayTooShort(vertex, a, scale) || rayTooShort(vertex, c, scale)) {
    return { ok: false, reason: 'rayTooShort' };
  }
  const degrees = angleDeg(a, vertex, c);
  return {
    ok: true,
    degrees,
    complement: 90 - degrees,
    supplement: 180 - degrees,
  };
}

/** The honest angle readout convention: `≈ 43.2°` (gap §22, `dimension.angleReadout`). */
export function formatAngleReadout(degrees: number, decimals: 0 | 1 | 3 = 1): string {
  return `≈ ${degrees.toFixed(decimals)}°`;
}

/** Complement / supplement chips for the sheet (short form; appendix `dimension.complement`). */
export function angleChips(degrees: number): { complement: number; supplement: number } {
  return { complement: 90 - degrees, supplement: 180 - degrees };
}

/* ------------------------------------------------------------------ *
 * The tool
 * ------------------------------------------------------------------ */

export interface AngleSheetRequest {
  key: string;
  degrees: number;
  complement: number;
  supplement: number;
  initialText: string | null;
}

export type AnglePhase = 'idle' | 'vertex' | 'ray1' | 'ray2' | 'committed';

export interface AngleToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  onSheetOpen: (request: AngleSheetRequest | null) => void;
  onSnapshot: (phase: AnglePhase) => void;
  labels: { add: string; delete: string; setValue: string };
  newId?: () => string;
}

export class AngleTool implements MarkupTool {
  private readonly deps: AngleToolDeps;
  private phase: AnglePhase = 'idle';
  private vertex: Px | null = null;
  private ray1: Px | null = null;
  private ray2: Px | null = null;
  private provisional: Px | null = null;
  private pendingKey: string | null = null;
  private autoOpenCancelled = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private provisionalGroup: Konva.Group | null = null;
  private contactRole: 'none' | 'vertex' | 'ray1' | 'ray2' = 'none';
  private readonly newId: () => string;

  constructor(deps: AngleToolDeps) {
    this.deps = deps;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  get pending(): boolean {
    return this.phase !== 'idle';
  }

  get state(): { phase: AnglePhase; key: string | null } {
    return { phase: this.phase, key: this.pendingKey };
  }

  onPointerDown(point: Px, pointerType: string): ContactAction {
    void pointerType;
    if (this.phase === 'committed') {
      this.cancelAutoOpen();
      return 'pan';
    }
    if (this.phase !== 'idle' && this.vertex && isVertexCancel(point, this.vertex, this.deps.canvas.scale)) {
      this.discard();
      return 'consume';
    }
    if (this.phase === 'idle') {
      this.vertex = { ...point };
      this.provisional = { ...point };
      this.phase = 'vertex';
      this.contactRole = 'vertex';
    } else if (this.phase === 'vertex') {
      this.provisional = { ...point };
      this.contactRole = 'ray1';
    } else if (this.phase === 'ray1') {
      this.provisional = { ...point };
      this.contactRole = 'ray2';
    }
    this.renderProvisional();
    this.snapshot();
    return 'consume';
  }

  onPointerMove(point: Px): ContactAction {
    if (this.contactRole === 'none') return 'pan';
    this.provisional = { ...point };
    this.renderProvisional();
    return 'consume';
  }

  onPointerUp(point: Px, tapped: boolean, pointerType: string): void {
    void tapped;
    void pointerType;
    const role = this.contactRole;
    this.contactRole = 'none';
    if (role === 'vertex') {
      this.vertex = { ...point };
      this.phase = 'vertex';
    } else if (role === 'ray1') {
      if (this.vertex && rayTooShort(this.vertex, point, this.deps.canvas.scale)) {
        // Refuse the tap: stay on ray-1, do not commit a 0° ray.
        this.provisional = { ...point };
        this.renderProvisional();
        return;
      }
      this.ray1 = { ...point };
      this.phase = 'ray1';
    } else if (role === 'ray2') {
      this.ray2 = { ...point };
      this.finish();
      return;
    }
    this.provisional = { ...point };
    this.renderProvisional();
    this.snapshot();
  }

  onPointerCancel(): void {
    this.contactRole = 'none';
    if (this.phase === 'vertex' && !this.pendingKey) this.discard();
  }

  /** The commit gate result for the in-progress placement, or `null`. */
  gate(): AngleCommitGate | null {
    if (!this.vertex || !this.ray1 || !this.ray2) return null;
    return angleCommitGate(this.vertex, this.ray1, this.ray2, this.deps.canvas.scale);
  }

  private finish(): void {
    const gate = this.gate();
    if (!gate || !gate.ok) {
      this.discard();
      return;
    }
    const vertex = this.vertex!;
    const ray1 = this.ray1!;
    const ray2 = this.ray2!;
    const geometry = { kind: 'angle' as const, a: { ...ray1 }, vertex: { ...vertex }, c: { ...ray2 } };
    const id = this.newId();
    this.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) this.deps.scene.addMarkup({ type: 'angle', geometry }, id);
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.pendingKey = id;
    this.phase = 'committed';
    this.provisional = null;
    this.clearProvisional();
    this.autoOpenCancelled = false;
    this.snapshot();
    this.startSettleTimer(gate.degrees);
  }

  private startSettleTimer(degrees: number): void {
    this.clearSettleTimer();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.autoOpenCancelled || !this.pendingKey || this.phase !== 'committed') return;
      const chips = angleChips(degrees);
      this.deps.onSheetOpen({
        key: this.pendingKey,
        degrees,
        complement: chips.complement,
        supplement: chips.supplement,
        initialText: this.deps.scene.get(this.pendingKey)?.enteredText ?? null,
      });
    }, ANGLE_SETTLE_MS);
  }

  /** `✓ Value` HUD: re-open the sheet when the auto-open was cancelled. */
  requestSheet(): void {
    if (!this.pendingKey) return;
    const gate = this.gate();
    const degrees = gate?.ok ? gate.degrees : this.deps.scene.get(this.pendingKey)?.valueDeg ?? 0;
    const chips = angleChips(degrees);
    this.deps.onSheetOpen({
      key: this.pendingKey,
      degrees,
      complement: chips.complement,
      supplement: chips.supplement,
      initialText: this.deps.scene.get(this.pendingKey)?.enteredText ?? null,
    });
  }

  /** Sheet commit: store the derived `valueDeg` and the raw readout text, then chain. */
  commitValue(result: { valueDeg: number; enteredText: string | null; chain: boolean }): void {
    const key = this.pendingKey;
    if (!key) return;
    const prev = this.deps.scene.get(key);
    const prevDeg = prev?.valueDeg ?? null;
    const prevText = prev?.enteredText ?? null;
    const lastTip = this.ray2 ? { ...this.ray2 } : null;
    this.exec({
      label: this.deps.labels.setValue,
      do: () => this.deps.scene.setAngleValue(key, result.valueDeg, result.enteredText),
      undo: () => this.deps.scene.setAngleValue(key, prevDeg, prevText),
    });
    this.closeSheet();
    if (result.chain && lastTip) this.startNextFrom(lastTip);
    else this.reset();
  }

  cancelValue(): void {
    this.closeSheet();
    this.reset();
  }

  private startNextFrom(tip: Px): void {
    this.vertex = { ...tip };
    this.ray1 = null;
    this.ray2 = null;
    this.provisional = { ...tip };
    this.pendingKey = null;
    this.phase = 'vertex';
    this.autoOpenCancelled = false;
    this.renderProvisional();
    this.snapshot();
  }

  cancelPending(): 'kept' | 'discarded' | 'none' {
    if (this.pendingKey) {
      this.closeSheet();
      this.reset();
      return 'kept';
    }
    if (this.phase === 'idle') return 'none';
    this.discard();
    return 'discarded';
  }

  onToolChange(): void {
    this.cancelPending();
  }

  dispose(): void {
    this.clearSettleTimer();
    this.clearProvisional();
  }

  private reset(): void {
    this.clearSettleTimer();
    this.phase = 'idle';
    this.vertex = null;
    this.ray1 = null;
    this.ray2 = null;
    this.provisional = null;
    this.pendingKey = null;
    this.contactRole = 'none';
    this.clearProvisional();
    this.snapshot();
  }

  private discard(): void {
    this.reset();
  }

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

  private closeSheet(): void {
    this.deps.onSheetOpen(null);
  }

  private exec(command: Command): void {
    this.deps.history.exec(command);
  }

  private snapshot(): void {
    this.deps.onSnapshot(this.phase);
  }

  /* ---- provisional rendering ---- */

  private clearProvisional(): void {
    this.provisionalGroup?.destroy();
    this.provisionalGroup = null;
    this.deps.canvas.overlayLayer.batchDraw();
  }

  private renderProvisional(): void {
    this.clearProvisional();
    if (!this.vertex) return;
    const a = this.phase === 'vertex' ? this.provisional : this.ray1;
    const c = this.phase === 'ray2' || this.phase === 'committed' ? this.provisional : null;
    if (!a) return;
    const group = buildShapeGroup({
      id: '__provisional__',
      kind: 'angle',
      geometry: {
        kind: 'angle',
        a: { ...a },
        vertex: { ...this.vertex },
        c: c ? { ...c } : { ...a },
      },
      style: { ...DEFAULT_STYLE, strokeColor: '#2FD4E0' } as AnnotationStyle,
      ctx: { scale: this.deps.canvas.scale },
      locked: true,
    });
    group.listening(false);
    this.provisionalGroup = group;
    this.deps.canvas.overlayLayer.add(group);
    this.deps.canvas.overlayLayer.batchDraw();
  }
}
