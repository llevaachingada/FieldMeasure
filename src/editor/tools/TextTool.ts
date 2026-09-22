/**
 * `src/editor/tools/TextTool.ts` — text note (plan slice 1.6 build order step 4; UI §8.5).
 *
 * Tap-to-type: a tap on the canvas opens the text entry sheet at that point; committing
 * creates a `text` annotation. `fontSize = fontSizeMu / s` is the renderer's job
 * (`renderText.ts`). The optional leader connects the note to the point it annotates.
 *
 * The auto-contrast background is decided from a 48×48 luminance sample (renderText.ts);
 * this tool only carries the raw `background` mode from the style panel (`auto` in v1).
 */
import type { AnnotationStyle, Geometry, Px } from '@/domain/types';
import type { EditorCanvas } from '@/editor/EditorCanvas';
import type { Command, History } from '@/editor/history';
import type { MarkupScene } from '@/editor/shapes/scene';
import type { TextBackground } from '@/editor/shapes/renderText';
import type { MarkupTool } from './toolTypes';

/** A text annotation's geometry from a tap + typed string. */
export function textAnnotationGeometry(
  at: Px,
  text: string,
  background: TextBackground = 'auto',
): Extract<Geometry, { kind: 'text' }> {
  return { kind: 'text', at: { ...at }, text, background };
}

/** Does the typed text produce a note? Whitespace-only does not. */
export function isCommittableText(text: string): boolean {
  return text.trim().length > 0;
}

export interface TextToolDeps {
  canvas: EditorCanvas;
  scene: MarkupScene;
  history: History;
  onRequestEntry: (at: Px) => void;
  onSnapshot: (pending: boolean) => void;
  labels: { add: string; delete: string };
  background?: () => TextBackground;
  newId?: () => string;
}

export class TextTool implements MarkupTool {
  private readonly deps: TextToolDeps;
  private at: Px | null = null;
  private readonly newId: () => string;

  constructor(deps: TextToolDeps) {
    this.deps = deps;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  get pending(): boolean {
    return this.at !== null;
  }

  get anchor(): Px | null {
    return this.at;
  }

  onPointerDown(point: Px): 'consume' | 'pan' {
    this.at = { ...point };
    this.deps.onSnapshot(true);
    this.deps.onRequestEntry({ ...point });
    return 'consume';
  }

  onPointerMove(): 'consume' | 'pan' {
    return this.pending ? 'consume' : 'pan';
  }

  onPointerUp(): void {
    // Entry is committed through the sheet, not the lift.
  }

  onPointerCancel(): void {
    this.at = null;
    this.deps.onSnapshot(false);
  }

  /** Commit the typed note at the anchor. */
  commit(text: string, style?: AnnotationStyle): void {
    const at = this.at;
    this.at = null;
    if (!at || !isCommittableText(text)) {
      this.deps.onSnapshot(false);
      return;
    }
    const geometry = textAnnotationGeometry(at, text, this.deps.background?.() ?? 'auto');
    const id = this.newId();
    this.exec({
      label: this.deps.labels.add,
      do: () => {
        if (!this.deps.scene.get(id)) this.deps.scene.addMarkup({ type: 'text', geometry, style }, id);
      },
      undo: () => this.deps.scene.removeObject(id),
    });
    this.deps.onSnapshot(false);
  }

  cancel(): void {
    this.at = null;
    this.deps.onSnapshot(false);
  }

  onToolChange(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
  }

  private exec(command: Command): void {
    this.deps.history.exec(command);
  }
}
