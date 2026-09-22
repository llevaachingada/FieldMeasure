/**
 * tests/history.test.ts — the session command history (build spec §8.3; plan slice 1.5
 * build order step 1). Pure logic, node project.
 */
import { describe, expect, it } from 'vitest';
import { History, HISTORY_DEPTH, STYLE_COALESCE_MS, type Command } from '../src/editor/history';

/** A command that mutates a plain number, so do/undo are observable. */
function setTo(target: { value: number }, next: number, label = 'set'): Command {
  const prev = target.value;
  return {
    label,
    do: () => {
      target.value = next;
    },
    undo: () => {
      target.value = prev;
    },
  };
}

describe('History — the command pattern (§8.3)', () => {
  it('exec runs the command, and undo/redo walk the steps', () => {
    const state = { value: 0 };
    const history = new History();
    history.exec(setTo(state, 5), null, 0);
    expect(state.value).toBe(5);
    expect(history.canUndo).toBe(true);

    expect(history.undo()?.label).toBe('set');
    expect(state.value).toBe(0);
    expect(history.canRedo).toBe(true);

    expect(history.redo()?.label).toBe('set');
    expect(state.value).toBe(5);
    expect(history.canUndo).toBe(true);
  });

  it('undo/redo return null on an empty stack', () => {
    const history = new History();
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('caps at 100 steps in memory', () => {
    const state = { value: 0 };
    const history = new History();
    for (let i = 1; i <= 150; i++) history.exec(setTo(state, i), null, i);
    expect(history.depth).toBe(HISTORY_DEPTH);
    // The 51 oldest steps dropped: undoing exactly 100 returns to value 50.
    for (let i = 0; i < HISTORY_DEPTH; i++) history.undo();
    expect(state.value).toBe(50);
    expect(history.canUndo).toBe(false);
  });

  it('clears the redo stack on a new edit', () => {
    const state = { value: 0 };
    const history = new History();
    history.exec(setTo(state, 1), null, 0);
    history.exec(setTo(state, 2), null, 1);
    history.undo();
    expect(history.canRedo).toBe(true);
    history.exec(setTo(state, 9), null, 2);
    expect(history.canRedo).toBe(false);
  });

  it('coalesces style edits inside the 600 ms window into one step', () => {
    const state = { value: 0 };
    const history = new History();
    history.exec(setTo(state, 1, 'style'), 'style:stroke', 1000);
    // Three more edits within 600 ms of the previous one → merged, not new steps.
    expect(history.execCoalesced(setTo(state, 2, 'style'), 'style:stroke')).toBe(true);
    expect(history.execCoalesced(setTo(state, 3, 'style'), 'style:stroke')).toBe(true);
    expect(history.execCoalesced(setTo(state, 4, 'style'), 'style:stroke')).toBe(true);
    expect(history.depth).toBe(1);
    expect(state.value).toBe(4);

    // One undo reverses the whole coalesced batch.
    history.undo();
    expect(state.value).toBe(0);
    // Redo replays it to the end state.
    history.redo();
    expect(state.value).toBe(4);
  });

  it('does not coalesce across the window or across a different key', () => {
    const state = { value: 0 };
    const history = new History();
    history.exec(setTo(state, 1, 'style'), 'style:stroke', 0);
    // 601 ms later: a new step.
    expect(history.execCoalesced(setTo(state, 2, 'style'), 'style:stroke', STYLE_COALESCE_MS, 601)).toBe(false);
    // Same key, inside the window, but a different key string → new step.
    expect(history.execCoalesced(setTo(state, 3, 'style'), 'style:fill', STYLE_COALESCE_MS, 700)).toBe(false);
    expect(history.depth).toBe(3);
  });

  it('coalescing a new edit still clears the redo branch', () => {
    const state = { value: 0 };
    const history = new History();
    history.exec(setTo(state, 1), 'k', 0);
    history.exec(setTo(state, 2), 'k', 10);
    history.undo();
    expect(history.canRedo).toBe(true);
    history.execCoalesced(setTo(state, 3), 'k', STYLE_COALESCE_MS, 700);
    expect(history.canRedo).toBe(false);
  });

  it('an ink stroke is ONE command, hence one undo step (never one per point)', () => {
    // The tool issues a single command at pointerup; this pins the contract.
    const stroke = { points: 0 };
    const history = new History();
    history.exec({
      label: 'Stroke',
      do: () => {
        stroke.points = 40;
      },
      undo: () => {
        stroke.points = 0;
      },
    });
    expect(history.depth).toBe(1);
    history.undo();
    expect(stroke.points).toBe(0);
  });
});
