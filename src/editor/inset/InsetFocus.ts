/**
 * `src/editor/inset/InsetFocus.ts` — Focus mode (the nesting model, UI §9:626–634).
 *
 * Entering Focus dims everything OUTSIDE the inset to 35% and leaves the focused inset
 * (and its children) at full strength. The dim is applied by opacity, not by a scrim
 * node, because the focused inset's children live INSIDE the inset's clipped group: a
 * scrim above the markup layer would dim them too. Opacity on the other layers/groups is
 * the only treatment that keeps the container bright while dimming its surroundings.
 *
 * **One level deep only.** Focus has exactly two states — none, or one inset. There is
 * no stack to pop, so `Esc` cannot exit "two levels"; the shell's ladder calls `exit()`
 * once and the selection is untouched (UI §9:633).
 *
 * The shell owns the breadcrumb chip, the `focusInsetId` mirror, and the Esc rung; this
 * class owns the visual dim and the nesting guard. `onChange` is the seam it reports
 * through.
 */
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { MarkupScene } from '@/editor/shapes/scene';

/** §9:629 — "everything outside the inset dims to 35% opacity". */
export const FOCUS_OUTSIDE_OPACITY = 0.35;

export interface InsetFocusDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  /** Fired on every enter/exit with the new focused inset id (`null` = none). */
  onChange: (insetId: string | null) => void;
}

export class InsetFocus {
  private readonly deps: InsetFocusDeps;
  private focused: string | null = null;
  private saved: {
    photo: number;
    markup: number;
    insets: Map<string, number>;
  } | null = null;

  constructor(deps: InsetFocusDeps) {
    this.deps = deps;
  }

  get focusedId(): string | null {
    return this.focused;
  }

  get active(): boolean {
    return this.focused !== null;
  }

  /** Nesting guard: the Inset tool is disabled inside Focus (UI §9:632). */
  canPlaceInset(): boolean {
    return this.focused === null;
  }

  /** Can this inset be focused? Only a top-level image annotation, and only when idle. */
  canEnter(insetId: string): boolean {
    if (this.focused !== null) return false;
    const ann = this.deps.scene.get(insetId);
    return ann?.type === 'image';
  }

  /** Enter Focus. Returns `false` (changing nothing) for a child/unknown/already-focused id. */
  enter(insetId: string): boolean {
    if (!this.canEnter(insetId)) return false;
    const canvas = this.deps.canvas;
    const insets = new Map<string, number>();
    for (const ann of this.deps.scene.list()) {
      if (ann.type !== 'image') continue;
      const node = this.deps.scene.getNode(ann.id);
      if (node) insets.set(ann.id, node.opacity());
    }
    this.saved = { photo: canvas.photoLayer.opacity(), markup: canvas.markupLayer.opacity(), insets };
    this.focused = insetId;
    this.apply();
    this.deps.onChange(insetId);
    return true;
  }

  /** Exit Focus. No-op when not focused. Does not touch the selection. */
  exit(): void {
    if (this.focused === null) return;
    const saved = this.saved;
    this.focused = null;
    if (saved) {
      const canvas = this.deps.canvas;
      canvas.photoLayer.opacity(saved.photo);
      canvas.markupLayer.opacity(saved.markup);
      for (const [id, opacity] of saved.insets) {
        const node = this.deps.scene.getNode(id);
        if (node) node.opacity(opacity);
      }
      canvas.photoLayer.batchDraw();
      canvas.markupLayer.batchDraw();
      this.deps.canvas.insetLayer.batchDraw();
    }
    this.saved = null;
    this.deps.onChange(null);
  }

  private apply(): void {
    const canvas = this.deps.canvas;
    canvas.photoLayer.opacity(FOCUS_OUTSIDE_OPACITY);
    canvas.markupLayer.opacity(FOCUS_OUTSIDE_OPACITY);
    for (const ann of this.deps.scene.list()) {
      if (ann.type !== 'image') continue;
      const node = this.deps.scene.getNode(ann.id);
      if (!node) continue;
      node.opacity(ann.id === this.focused ? (this.saved?.insets.get(ann.id) ?? 1) : FOCUS_OUTSIDE_OPACITY);
    }
    canvas.photoLayer.batchDraw();
    canvas.markupLayer.batchDraw();
    canvas.insetLayer.batchDraw();
  }
}
