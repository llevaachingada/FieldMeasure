/**
 * `src/editor/shapes/styleCommand.ts` — slice 1.8, lane C1.
 *
 * The pure builder for "apply a style to a selection as ONE undo step" (§7.4 #2/#3).
 *
 * It lives beside `scene.ts` and imports **no Konva**, so a node test can execute the
 * command semantics (apply-all / undo-restores / redo) against a tiny fake target without
 * a Stage. `MarkupScene` composes it: `scene.styleCommand(...)` delegates here with
 * `this` as the target, so the document stays the single source of truth and the Konva
 * sync/notify path is shared with every other scene mutator.
 *
 * Why a target interface instead of a bare array of annotations: a style write must go
 * through `MarkupScene.setStyle` (or an equivalent) so the node is rebuilt and `onChange`
 * fires (the persistence seam). The command captures the *previous* styles and restores
 * them on undo, addressing by stable path key (`insetId/childId` included, §20.1) — never
 * by array index.
 *
 * The `Command` type is a type-only import: no runtime dependency on `History`.
 */
import type { AnnotationStyle } from '@/domain/types';
import type { Command } from '@/editor/history';

/** The minimal surface the commands need — `MarkupScene` satisfies it. */
export interface StyleTarget {
  /** The current style of one path key, or `undefined` when the key is unknown. */
  getStyle(pathKey: string): AnnotationStyle | undefined;
  /** Write one key's style. The implementation re-renders and fires `onChange`. */
  setStyle(pathKey: string, style: AnnotationStyle): void;
}

interface Capture {
  key: string;
  style: AnnotationStyle;
}

function capture(target: StyleTarget, pathKeys: readonly string[]): Capture[] {
  const captures: Capture[] = [];
  for (const key of pathKeys) {
    const style = target.getStyle(key);
    if (style) captures.push({ key, style: { ...style } });
  }
  return captures;
}

/**
 * Replace every captured key's style with `style` (one History command).
 *
 * After `do()` all keys share exactly `style`, so `selectionStyleState` over them reports
 * `'single'` — that is the observable that the panel's indeterminate state has cleared.
 * `undo()` restores each key's own previous style.
 */
export function createReplaceStyleCommand(
  target: StyleTarget,
  pathKeys: readonly string[],
  style: AnnotationStyle,
  label: string,
): Command {
  const captures = capture(target, pathKeys);
  const next: AnnotationStyle = { ...style };
  return {
    label,
    do: () => {
      for (const { key } of captures) target.setStyle(key, { ...next });
    },
    undo: () => {
      for (const { key, style: before } of captures) target.setStyle(key, { ...before });
    },
  };
}

/**
 * Merge `patch` into every captured key's style (one History command). Non-selected keys
 * are left untouched, so keys the patch does not name can stay mixed; use
 * `createReplaceStyleCommand` when the whole style must converge.
 */
export function createPatchStyleCommand(
  target: StyleTarget,
  pathKeys: readonly string[],
  patch: Partial<AnnotationStyle>,
  label: string,
): Command {
  const captures = capture(target, pathKeys);
  return {
    label,
    do: () => {
      for (const { key } of captures) {
        const current = target.getStyle(key);
        if (current) target.setStyle(key, { ...current, ...patch });
      }
    },
    undo: () => {
      for (const { key, style: before } of captures) target.setStyle(key, { ...before });
    },
  };
}
