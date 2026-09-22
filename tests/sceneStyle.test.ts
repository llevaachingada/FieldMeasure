/**
 * tests/sceneStyle.test.ts — slice 1.8 lane C1: applying a style to a selection as ONE
 * undo step (§7.4 #2/#3).
 *
 * `styleCommand.ts` is deliberately Konva-free, so this node test exercises the real
 * command semantics against a tiny in-memory `StyleTarget` (no Stage). It proves:
 *   - replace converges every target on the new style (so the panel's mixed state clears);
 *   - patch touches only the named key and leaves the rest alone;
 *   - undo restores each target's OWN previous style, redo re-applies;
 *   - a multi-object change through `History` is exactly ONE undo step;
 *   - `execCoalesced` folds a held scrubber into that one step.
 *
 * NOT covered here (needs Konva): that `MarkupScene.styleCommand` delegates to this
 * factory. That seam is one line; it is covered by `tests/sceneStyleCommand.browser.test.ts`
 * in the browser project (the node project cannot import Konva and D40 forbids canvas work
 * in jsdom).
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_STYLE, type AnnotationStyle } from '../src/domain/types';
import { History } from '../src/editor/history';
import {
  createPatchStyleCommand,
  createReplaceStyleCommand,
  type StyleTarget,
} from '../src/editor/shapes/styleCommand';
import { selectionStyleState } from '../src/state/styleByTool';

const style = (patch: Partial<AnnotationStyle>): AnnotationStyle => ({ ...DEFAULT_STYLE, ...patch });

function fakeTarget(initial: Record<string, AnnotationStyle>): {
  target: StyleTarget;
  styleOf: (key: string) => AnnotationStyle;
  writes: string[];
} {
  const map = new Map(Object.entries(initial).map(([key, value]) => [key, { ...value }]));
  const writes: string[] = [];
  const target: StyleTarget = {
    getStyle: (key) => map.get(key),
    setStyle: (key, next) => {
      if (!map.has(key)) return; // an unknown key is a no-op, like MarkupScene.setStyle
      map.set(key, { ...next });
      writes.push(key);
    },
  };
  return { target, styleOf: (key) => map.get(key)!, writes };
}

describe('createReplaceStyleCommand — converge a selection (§7.4 #2)', () => {
  it('applies to every target, clears mixed, and undo restores each own style', () => {
    const a = style({ strokeColor: '#FF7A18', strokeWidthMu: 4 });
    const b = style({ strokeColor: '#2FD4E0', strokeWidthMu: 8 });
    const { target, styleOf, writes } = fakeTarget({ a, b });

    // The selection is mixed before the change is applied.
    expect(selectionStyleState([styleOf('a'), styleOf('b')]).mode).toBe('mixed');

    const cmd = createReplaceStyleCommand(target, ['a', 'b'], style({ strokeColor: '#FFFFFF' }), 'Change style');
    cmd.do();

    // Both share the new style → the derived state is now single (indeterminate cleared).
    expect(styleOf('a')).toEqual(style({ strokeColor: '#FFFFFF' }));
    expect(styleOf('b')).toEqual(style({ strokeColor: '#FFFFFF' }));
    expect(selectionStyleState([styleOf('a'), styleOf('b')]).mode).toBe('single');
    expect(writes).toEqual(['a', 'b']);

    cmd.undo();
    expect(styleOf('a')).toEqual(a);
    expect(styleOf('b')).toEqual(b);
    expect(selectionStyleState([styleOf('a'), styleOf('b')]).mode).toBe('mixed');

    cmd.do();
    expect(styleOf('a')).toEqual(style({ strokeColor: '#FFFFFF' }));
  });

  it('skips keys that do not exist (a vanished object cannot corrupt the step)', () => {
    const { target, styleOf } = fakeTarget({ a: style({}) });
    const cmd = createReplaceStyleCommand(target, ['a', 'ghost'], style({ bold: true }), 'Change style');
    cmd.do();
    expect(styleOf('a').bold).toBe(true);
    cmd.undo();
    expect(styleOf('a').bold).toBe(false);
  });
});

describe('createPatchStyleCommand — one control at a time (§7.4 #2)', () => {
  it('merges only the patched key and leaves the others as each object had them', () => {
    const a = style({ strokeColor: '#FF7A18', strokeWidthMu: 4 });
    const b = style({ strokeColor: '#2FD4E0', strokeWidthMu: 8 });
    const { target, styleOf } = fakeTarget({ a, b });

    const cmd = createPatchStyleCommand(target, ['a', 'b'], { strokeColor: '#FFFFFF' }, 'Change color');
    cmd.do();

    expect(styleOf('a')).toEqual(style({ strokeColor: '#FFFFFF', strokeWidthMu: 4 }));
    expect(styleOf('b')).toEqual(style({ strokeColor: '#FFFFFF', strokeWidthMu: 8 }));
    // The widths are still different → the overall style is still mixed (honest).
    expect(selectionStyleState([styleOf('a'), styleOf('b')]).mode).toBe('mixed');

    cmd.undo();
    expect(styleOf('a')).toEqual(a);
    expect(styleOf('b')).toEqual(b);
  });
});

describe('History integration — exactly one undo step (§7.4 #3)', () => {
  it('a 3-object style change is ONE step and one undo restores all three', () => {
    const a = style({ strokeColor: '#FF7A18' });
    const b = style({ strokeColor: '#2FD4E0' });
    const c = style({ strokeColor: '#FFD400' });
    const { target, styleOf } = fakeTarget({ a, b, c });

    const history = new History();
    history.exec(createReplaceStyleCommand(target, ['a', 'b', 'c'], style({ strokeColor: '#000000' }), 'Change style'));

    expect(history.depth).toBe(1);
    expect(styleOf('a').strokeColor).toBe('#000000');
    expect(styleOf('b').strokeColor).toBe('#000000');
    expect(styleOf('c').strokeColor).toBe('#000000');

    const undone = history.undo();
    expect(undone?.label).toBe('Change style');
    expect(history.depth).toBe(0);
    expect(styleOf('a')).toEqual(a);
    expect(styleOf('b')).toEqual(b);
    expect(styleOf('c')).toEqual(c);
  });

  it('execCoalesced folds a held scrubber into the previous step (600 ms, §8.3)', () => {
    const original = style({ strokeColor: '#FF7A18', strokeWidthMu: 4 });
    const { target, styleOf } = fakeTarget({ a: original });

    const history = new History();
    history.execCoalesced(
      createPatchStyleCommand(target, ['a'], { strokeColor: '#FFD400' }, 'Change style'),
      'style:a',
      600,
      1000,
    );
    history.execCoalesced(
      createPatchStyleCommand(target, ['a'], { strokeWidthMu: 8 }, 'Change style'),
      'style:a',
      600,
      1200,
    );

    expect(history.depth).toBe(1); // two edits, one step
    expect(styleOf('a')).toEqual(style({ strokeColor: '#FFD400', strokeWidthMu: 8 }));

    history.undo();
    expect(styleOf('a')).toEqual(original); // the whole batch is reversed
  });
});
