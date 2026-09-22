/**
 * `src/editor/tools/toolTypes.ts` — the shared contract every slice-1.6 markup tool
 * implements, plus the touch-model constants the tools share (plan slice 1.6).
 *
 * The placement tools reuse the §1 machine shape established by `DimensionTool`
 * (touch model §1.1: one machine, per-tool config): `onPointerDown` returns
 * `'consume'` when the tool owns the contact or `'pan'` when the canvas may pan;
 * `onPointerUp` receives the shared tap predicate.
 */
import type { Px } from '@/domain/types';
import type { LabelContext } from '@/editor/shapes/dimensionLabel';

export type ContactAction = 'consume' | 'pan';

export interface MarkupTool {
  /** True while the tool owns an in-progress op (the Escape ladder / update gate read it). */
  readonly pending: boolean;
  onPointerDown(point: Px, pointerType: string): ContactAction;
  onPointerMove(point: Px, movedBeyondSlop: boolean): ContactAction;
  onPointerUp(point: Px, tapped: boolean, pointerType: string): void;
  onPointerCancel(pointerType: string): void;
  /** Switch-tool safety (touch model §1.5 #6). */
  onToolChange(): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ *
 * §4.2 / touch-model constants (all quoted with their arithmetic)
 * ------------------------------------------------------------------ */

/** §4.2: finger ink floor is 8 mu. */
export const TOUCH_INK_FLOOR_MU = 8;
/** §4.3: highlighter chisel width default under touch. */
export const HIGHLIGHT_CHISEL_TOUCH_MU = 24;
/** §4.2: finger ink smoothing (60% ⇒ 0.6) and thinning 0; see svgPath.ts. */
export const TOUCH_INK_SMOOTHING_PERCENT = 60;

/** §3.1: tap slop 8 px, tap ceiling 400 ms; long-press 600 ms. */
export const TAP_SLOP_PX = 8;
export const TAP_MAX_MS = 400;
export const LONG_PRESS_MS = 600;

/** Freehand hold-to-shape: 400 ms / 8 px pen (plan step 5). */
export const HOLD_SHAPE_PEN_MS = 400;
export const HOLD_SHAPE_PEN_PX = 8;
/** Touch model §4.2: 600 ms / 16 px under touch (finger jitter defeats 400/8). */
export const HOLD_SHAPE_TOUCH_MS = 600;
export const HOLD_SHAPE_TOUCH_PX = 16;

/** Erase §4.1: long-press reveals the `--err` outline without deleting. */
export const ERASE_PREVIEW_MS = 600;

/** Polygon step 2: nodes 56 px hit, close ring 56 px, 32 px proximity to close. */
export const POLYGON_NODE_HIT_PX = 56;
export const POLYGON_CLOSE_RING_PX = 56;
export const POLYGON_CLOSE_PROXIMITY_PX = 32;
/** Polygon needs at least a triangle. */
export const POLYGON_MIN_POINTS = 3;

/** Angle step 3: a ray shorter than 8 screen px is refused (`angleDeg(v,v,c)` is 0). */
export const ANGLE_RAY_MIN_PX = 8;
/** Angle step 3: a tap within 44 px of the vertex cancels. */
export const ANGLE_VERTEX_CANCEL_PX = 44;
/** The same 450 ms settle rule as the Dimension keypad (§1.4). */
export const ANGLE_SETTLE_MS = 450;

/** Select ±3.3: 28 px visual / 72 px hit under touch; 24/56 with the pen. */
export const SELECT_HANDLE_VISUAL_TOUCH = 28;
export const SELECT_HANDLE_HIT_TOUCH = 72;
export const SELECT_HANDLE_VISUAL_PEN = 24;
export const SELECT_HANDLE_HIT_PEN = 56;
/** §3.3: handles are suppressed when the selection is under 96 screen px wide. */
export const SELECT_EDGE_SUPPRESS_PX = 96;
/** §3.3: axis lock after 8 px of movement within 20° of the handle's natural axis. */
export const AXIS_LOCK_PX = 8;
export const AXIS_LOCK_DEG = 20;
/** §3.3: the mini-toolbar is 64 px tall and pinned by a 600 ms long-press. */
export const MINI_TOOLBAR_H = 64;

/** §3.3 rotate snaps. */
export const ROTATE_SNAPS = [0, 15, 30, 45, 90] as const;

/* ------------------------------------------------------------------ *
 * Shared pure helpers
 * ------------------------------------------------------------------ */

/** Screen px → image px at `scale`. */
export function toImagePx(screenPx: number, scale: number): number {
  return screenPx / scale;
}

/** Does a contact within `screenPx` of `point` hit it? Distance is screen-space. */
export function withinScreenPx(a: Px, b: Px, screenPx: number, scale: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) * scale <= screenPx;
}

/** The shared label context read. */
export interface ToolSettings {
  precisionDenominator: number;
  unitSystem: 'imperial' | 'metric';
  unitFormat: 'ft-in' | 'in' | 'ft-decimal';
  glovedTouch: boolean;
  fingerDraws: boolean;
  touchPlaces: boolean;
  penOnly: boolean;
}

export function labelContextFrom(settings: ToolSettings): LabelContext {
  return {
    unitSystem: settings.unitSystem,
    unitFormat: settings.unitFormat,
    precisionDenominator: settings.precisionDenominator,
  };
}
