/**
 * `src/editor/history.ts` — session undo/redo (build spec §8.3; plan slice 1.5
 * build order step 1).
 *
 * The **command pattern**. One mechanism for session undo, one for persisted
 * recovery (§8.3): this file is the session one. Persisted undo is the `.history/`
 * snapshot flyout (§5.5) — there is no persisted command journal in v1.
 *
 * Rules this file enforces:
 *   - **100 steps in memory.** Older entries drop off the bottom of the stack.
 *   - **Redo clears on a new edit** (standard).
 *   - **Ink is one step per stroke** — the tool issues ONE command at `pointerup`,
 *     never one per sampled point. `exec()` is the path for that.
 *   - **Style edits coalesce within 600 ms** into one step — that is `execCoalesced`.
 *     Consecutive edits carrying the same `coalesceKey` inside the window merge
 *     into the previous step instead of pushing a new one.
 *   - **Undo addresses annotations by `(sheetId, annotationPath)`** (§8.3/§20.1),
 *     never by array index. That address lives inside the `Command` implementations
 *     (`src/editor/shapes/scene.ts`); this class never sees or reorders objects, so
 *     it cannot accidentally address them positionally.
 *
 * `performance.now()` is used for the coalescing clock (available in node and the
 * browser); tests pass an explicit `now` so the window is deterministic.
 */

export interface Command {
  do(): void;
  undo(): void;
  /** Human-readable action name; the undo toast renders `Undid: {actionName}`. */
  label: string;
}

export interface HistoryEntry {
  cmd: Command;
  /** Same key + inside the window ⇒ merge into the previous step. */
  coalesceKey: string | null;
  /** Clock reading at the last (re)execution, for the coalescing window. */
  at: number;
}

/** §8.3: 100 steps in memory. */
export const HISTORY_DEPTH = 100;

/** §8.3: a style change to a selection coalesces within 600 ms into one step. */
export const STYLE_COALESCE_MS = 600;

const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth: number = HISTORY_DEPTH) {
    this.maxDepth = maxDepth;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of undoable steps currently held (never exceeds `maxDepth`). */
  get depth(): number {
    return this.undoStack.length;
  }

  /**
   * Run a command and push it as a new undo step. The redo stack is cleared: a
   * new edit invalidates the redo branch (§8.3).
   */
  exec(cmd: Command, coalesceKey: string | null = null, now: number = clock()): void {
    cmd.do();
    this.undoStack.push({ cmd, coalesceKey, at: now });
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
  }

  /**
   * Run a command, merging it into the previous step when the previous step has the
   * same `coalesceKey` and was executed within `windowMs`. Used for style edits
   * (600 ms) where a slider or chip held down must not become 40 undo steps.
   *
   * Returns `true` when the command was merged (no new step).
   */
  execCoalesced(
    cmd: Command,
    coalesceKey: string,
    windowMs: number = STYLE_COALESCE_MS,
    now: number = clock(),
  ): boolean {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.coalesceKey === coalesceKey && now - top.at <= windowMs) {
      const prev = top.cmd;
      // Apply the new edit, then fold it into the top step. `prev` is already applied;
      // the composite re-derives the whole batch on redo (oldest first) and reverses it
      // on undo (newest first).
      cmd.do();
      top.cmd = {
        label: cmd.label,
        do: () => {
          prev.do();
          cmd.do();
        },
        undo: () => {
          cmd.undo();
          prev.undo();
        },
      };
      top.at = now;
      // A new edit still clears redo, even when it coalesces.
      this.redoStack = [];
      return true;
    }
    this.exec(cmd, coalesceKey, now);
    return false;
  }

  /** Undo the newest step. Returns the command (for the toast), or `null` if empty. */
  undo(): Command | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    entry.cmd.undo();
    this.redoStack.push(entry);
    return entry.cmd;
  }

  /** Redo the newest undone step. Returns the command, or `null` if the branch is empty. */
  redo(): Command | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    entry.cmd.do();
    this.undoStack.push(entry);
    return entry.cmd;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
