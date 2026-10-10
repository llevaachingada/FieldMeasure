/**
 * tests/sheetEditor.dimension.browser.test.ts — the integrated dimension flow through
 * the real `SheetEditor` (plan slice 1.5).
 *
 * Proves the WIRING the plan's gates name, end to end:
 *   - tap-tap A→B opens the keypad after the 450 ms settle;
 *   - a canvas contact cancels the auto-open permanently, the geometry survives, and the
 *     `✓ Value` HUD re-opens the keypad;
 *   - the placement state is announced (`aria-live`);
 *   - the keypad is mounted and focus is returned to the canvas on close;
 *   - **D63**: a second finger during an object drag restores the pre-drag position.
 *
 * Browser project only (real Konva.Stage → D40). Storage is mocked; no photo is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import EditorLayout from '../src/ui/EditorLayout';
import { editorSession } from '../src/editor/session';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { STRINGS } from '../src/ui/strings';

vi.mock('@/fs/projectStore', async (importOriginal) => ({
  // Spread the REAL module first (session 15, D90 follow-up): presets.ts resolves its
  // projectStore bindings at use time from this namespace (D84/D91), so any binding the
  // factory omits arrives as `undefined` and loadPresets throws PresetsBindingError at
  // use time. The explicit vi.fn() overrides below replace only what this suite drives;
  // everything else stays real so an incomplete factory can never silently re-create
  // the missing-export failure mode.
  ...(await importOriginal<typeof import('@/fs/projectStore')>()),
  registerOpenProject: vi.fn(),
  // This suite does not exercise presets: report `.fieldmeasure/` as absent so
  // loadPresets resolves to { ok: true, presets: empty } (a fresh project),
  // never a PresetsBindingError from the real resolver spread in above.
  resolveFieldMeasureDir: vi.fn(async () => {
    throw new DOMException('no .fieldmeasure dir in this suite', 'NotFoundError');
  }),
  clearOpenProject: vi.fn(),
  acquireWriterLease: vi.fn(async () => ({ held: true, release: vi.fn() })),
  openProjectChannel: vi.fn(() => null),
  resolveOpenProjectDir: vi.fn(async () => ({ kind: 'directory', name: 'f' })),
  cleanStaleTmp: vi.fn(async () => undefined),
  readProjectFile: vi.fn(async () => ({
    schemaVersion: 1,
    project: {
      id: 'p',
      title: 'P',
      unitSystem: 'imperial',
      unitFormat: 'ft-in',
      precisionDenominator: 16,
    },
    sheets: [],
  })),
  isPhotoDamaged: vi.fn(async () => false),
  resolveSheetDir: vi.fn(async () => ({ kind: 'directory', name: 'sheet' })),
  resolveAssetsDir: vi.fn(async () => ({ kind: 'directory', name: 'assets' })),
  writeAtomic: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined),
  readSheetMarkup: vi.fn(async () => ({ schemaVersion: 1, sheetId: 's', objects: [] })),
  // persistQueue (imported by SheetEditor since slice 1.6) classifies failures with
  // this class and calls the write helpers above.
  StorageWriteError: class StorageWriteError extends Error {
    kind: string;
    constructor(kind: string, cause?: unknown) {
      super('write failed');
      this.kind = kind;
      this.cause = cause;
    }
  },
}));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a REAL condition instead of a fixed sleep. Every `sleep(10) // React flush` and
 * `sleep(520)` that used to sit here raced the machine: React's scheduler and the 450 ms settle
 * timer are both late when the CPU is saturated, and a fixed budget can only be right on an idle
 * box. The expectation passed in is the very thing the test goes on to rely on.
 */
const until = (check: () => void): Promise<void> =>
  vi.waitFor(check, { timeout: 5000, interval: 10 }) as Promise<void>;

/** Flush React effects/state after a synchronous act that has no observable DOM signal. */
const flush = (): Promise<void> => act(async () => {});

/**
 * Wait until `ms` of REAL time have passed since `t0`, for the negative assertions («the settle
 * timer must NOT fire», «the coalescing window has closed»). Time genuinely has to pass there, but
 * the amount is measured on the same clock the app uses, not assumed from a `sleep` that a stalled
 * event loop can stretch or (for the window) an early timer can undercut. Take `t0` AFTER the
 * event that started the timer, so the timer's deadline is always <= t0 + its length.
 */
async function waitElapsed(t0: number, ms: number): Promise<void> {
  while (performance.now() - t0 < ms) await sleep(10);
  await sleep(0); // let any timer due at this instant run before the caller asserts
}

/**
 * Wait until the open keypad is really ready for keys. The sheet's DOM appears in the render
 * commit, but SheetEditor's Escape listener is attached in a passive effect that runs AFTER it
 * (the same effect first moves focus into the sheet, immediately before `addEventListener`).
 * An Escape dispatched in that gap is lost, so "focus is inside the keypad" is the observable
 * signal that the listener is live.
 */
async function keypadReady(): Promise<HTMLElement> {
  await until(() => expect(useEditorStore.getState().keypadOpen).toBe(true));
  const sheet = await screen.findByTestId('keypad-sheet');
  await until(() => expect(sheet.contains(document.activeElement)).toBe(true));
  return sheet;
}

/** Escape the auto-opened keypad (geometry kept, phase idle), then switch to the Select tool. */
async function closeKeypadAndSelectTool(
  view: ReturnType<typeof render>,
): Promise<void> {
  await keypadReady();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await until(() => expect(useEditorStore.getState().keypadOpen).toBe(false));
  // Select tool so a one-finger drag is object-first. `rerender` is act-wrapped, so the tool
  // change has been applied when it returns; `flush` drains any effect it queued.
  view.rerender(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool: 'select',
    }),
  );
  await flush();
}

function pointer(type: string, target: Element, x: number, y: number, pointerId = 1): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 1,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

async function mountEditor(activeTool: 'select' | 'pan' | 'place' = 'place') {
  const view = render(
    createElement(SheetEditor, {
      projectId: 'p:f',
      folderName: 'f',
      onExit: () => {},
      activeTool,
    }),
  );
  await screen.findByText(STRINGS.project.noSheetsEmpty);
  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  host.style.width = '800px';
  host.style.height = '600px';
  const rect = host.getBoundingClientRect();
  const stage = Konva.stages[Konva.stages.length - 1];
  const at = { x: rect.left + 300, y: rect.top + 200 };
  return { view, host, stage, at };
}

function markupGroup(stage: Konva.Stage): Konva.Group {
  // Re-fetch every time: `scene` rebuilds the group on each mutation, so a cached
  // reference goes stale (that is exactly what the D63 test must not fall for).
  // Layer order: photo(0), inset(1), markup(2), overlay(3), drag(4) — §8.1.
  return stage.getLayers()[2].getChildren()[0] as Konva.Group;
}

/**
 * Mount the real shell (`EditorLayout`), which owns the `Esc` ladder. The F3 finding
 * lives in the SEAM between the ladder (shell) and the placement machine (canvas), so
 * the guard has to mount both — mounting `SheetEditor` alone cannot reach it.
 */
async function mountLayout() {
  useEditorStore.getState().setActiveTool('dimension');
  const view = render(
    createElement(EditorLayout, { projectId: 'p:f', folderName: 'f', onExit: () => {} }),
  );
  await screen.findByText(STRINGS.project.noSheetsEmpty);
  const host = view.container.querySelector('.editor-canvas') as HTMLDivElement;
  host.style.width = '800px';
  host.style.height = '600px';
  const rect = host.getBoundingClientRect();
  const stage = Konva.stages[Konva.stages.length - 1];
  const at = { x: rect.left + 300, y: rect.top + 200 };
  return { view, host, stage, at };
}

/** Is the live provisional overlay present on the overlay layer (photo/inset/markup/overlay/drag)? */
function hasProvisional(stage: Konva.Stage): boolean {
  return stage
    .getLayers()[3]
    .getChildren()
    .some((node) => (node as Konva.Node).getAttr('annotationId') === '__provisional__');
}

function linePoints(group: Konva.Group): number[] {
  return (group.find('Line')[0] as Konva.Line).points();
}

/** Tap-tap A→B through the real DOM, leaving the settle window running. */
function tapTap(host: HTMLDivElement, a: { x: number; y: number }, b: { x: number; y: number }): void {
  pointer('pointerdown', host, a.x, a.y);
  pointer('pointerup', host, a.x, a.y);
  pointer('pointerdown', host, b.x, b.y);
  pointer('pointerup', host, b.x, b.y);
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

describe('tap-tap through SheetEditor', () => {
  it('commits at tap B, announces placement, and auto-opens the keypad after 450 ms', async () => {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });

    // The phase attribute and the live region are rendered from state, so wait for them.
    await until(() => expect(host.dataset.placementPhase).toBe('anchorB'));
    expect(useEditorStore.getState().pendingOp).toBe('dimension');
    // Placement state announced (a11y). The empty-state panel is also role=status, so
    // target the live region by its own attribute.
    const live = view.container.querySelector('[aria-live="polite"]');
    await until(() => expect(live?.textContent).toBe(STRINGS.placement.adjusting));
    // Geometry committed but the keypad is not open yet.
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);

    // The 450 ms settle timer opens it; wait for the open, not for 520 ms to elapse.
    await until(() => expect(useEditorStore.getState().keypadOpen).toBe(true));
    expect(await screen.findByTestId('keypad-sheet')).toBeTruthy();
  });

  it('a contact cancels the auto-open permanently; geometry survives; ✓ Value re-opens it', async () => {
    const { host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    const settleStart = performance.now(); // after the commit that armed the 450 ms timer

    // Contact far from both anchors, before the 450 ms timer fires.
    pointer('pointerdown', host, at.x + 600, at.y + 400);
    pointer('pointerup', host, at.x + 600, at.y + 400);

    // Negative assertion: the 450 ms settle window must really have elapsed before we check.
    await waitElapsed(settleStart, 520);
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    // Geometry survived.
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);
    expect(host.dataset.placementPhase).toBe('anchorB');

    // The HUD's ✓ Value is the explicit re-entry.
    const valueButton = screen.getByText(STRINGS.keypad.useThisValue);
    valueButton.click();
    await until(() => expect(useEditorStore.getState().keypadOpen).toBe(true));
    expect(await screen.findByTestId('keypad-sheet')).toBeTruthy();
  });

  it('Escape in the keypad keeps the geometry and returns focus to the canvas', async () => {
    const { host, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    await keypadReady();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => expect(useEditorStore.getState().keypadOpen).toBe(false));
    await until(() => expect(screen.queryByTestId('keypad-sheet')).toBeNull());
    await until(() => expect(document.activeElement).toBe(host));
  });
});

describe('D63 — a second finger restores the pre-drag object position', () => {
  it('cancels the object drag and puts the dimension back', async () => {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    // Cancel the keypad so the placement finishes (geometry kept, phase idle), then re-mount
    // as the Select tool so a one-finger drag is object-first.
    await closeKeypadAndSelectTool(view);

    const group = markupGroup(stage);
    const before = linePoints(group);
    expect(before).toHaveLength(4);

    const mid = { x: at.x + 100, y: at.y }; // segment midpoint
    // One-finger drag: grab the object and move it 120 px right.
    pointer('pointerdown', host, mid.x, mid.y, 1);
    pointer('pointermove', host, mid.x + 120, mid.y, 1);
    const during = linePoints(markupGroup(stage));
    expect(during[0]).toBeCloseTo(before[0] + 120, 3);

    // A second finger lands → cancel + restore the pre-drag position.
    pointer('pointerdown', host, mid.x + 40, mid.y, 2);
    const after = linePoints(markupGroup(stage));
    expect(after[0]).toBeCloseTo(before[0], 3);
    expect(after[2]).toBeCloseTo(before[2], 3);

    pointer('pointerup', host, mid.x + 40, mid.y, 2);
    pointer('pointerup', host, mid.x + 120, mid.y, 1);
    // No commit at the displaced position: still exactly the original geometry.
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0], 3);
  });
});

describe('F3 — Escape cancels a pending dimension through the shell ladder', () => {
  it('clears the provisional and the next tap starts a fresh placement', async () => {
    const { host, stage, at } = await mountLayout();

    // First tap authors A only — an uncommitted pending placement.
    pointer('pointerdown', host, at.x, at.y);
    pointer('pointerup', host, at.x, at.y);
    await until(() => expect(host.dataset.placementPhase).toBe('anchorA'));
    expect(useEditorStore.getState().pendingOp).toBe('dimension');
    expect(hasProvisional(stage)).toBe(true);

    // Rung 1 must CANCEL the pending dimension, not merely clear the store flag.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => expect(useEditorStore.getState().pendingOp).toBe('none'));
    await until(() => expect(host.dataset.placementPhase).toBe('idle'));
    expect(hasProvisional(stage)).toBe(false);

    // The next tap begins a NEW placement (A) — it must not commit from the stale A.
    pointer('pointerdown', host, at.x + 200, at.y);
    pointer('pointerup', host, at.x + 200, at.y);
    await until(() => expect(host.dataset.placementPhase).toBe('anchorA'));
    expect(stage.getLayers()[2].getChildren()).toHaveLength(0); // nothing committed
  });
});

describe('F5 — a tool switch inside the settle window cancels the dimension settle', () => {
  it('does not open the dimension keypad over the newly selected placement tool', async () => {
    // The REAL tool id drives the switch (the coarse `activeTool` prop stays 'place').
    useEditorStore.getState().setActiveTool('dimension');
    const { host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    const settleStart = performance.now(); // the 450 ms settle was armed at or before this
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    // Precondition, observable synchronously: tap B committed the geometry (the Valueless ghost).
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);

    // Switch to the rectangle tool INSIDE the settle window, with no await in between: nothing
    // asynchronous may separate the commit from the switch, or a stalled machine could let the
    // 450 ms close first and this test would silently prove nothing. `act` applies the tool
    // change (and the effect that forwards it to the machine) before it returns.
    // dimension → rect keeps the coarse prop at 'place', so the OLD wiring never reached
    // `dimRef.onToolChange()`.
    await act(async () => {
      useEditorStore.getState().setActiveTool('rect');
    });
    await waitElapsed(settleStart, 600);

    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    // onToolChange keeps the COMMITTED B (the Valueless ghost) — the documented rule.
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);
  });
});

describe('F6 — a sub-slop object drag records exactly one history step', () => {
  it('undo restores the original position and the object still exists', async () => {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    // Cancel the keypad so the placement finishes (geometry kept, phase idle), then switch to
    // the Select tool so a one-finger drag is object-first.
    await closeKeypadAndSelectTool(view);

    const before = linePoints(markupGroup(stage));
    expect(before).toHaveLength(4);
    const mid = { x: at.x + 100, y: at.y }; // segment midpoint

    // Drag BELOW the 8 px tap slop: 3 px. The move still mutates the geometry, but the
    // old path only recorded a history step once `drag.moved` (≥ slop) became true.
    pointer('pointerdown', host, mid.x, mid.y, 1);
    pointer('pointermove', host, mid.x + 3, mid.y, 1);
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0] + 3, 3);
    pointer('pointerup', host, mid.x + 3, mid.y, 1);
    await flush();

    const undone = editorSession()?.undo() ?? null;
    expect(undone).not.toBeNull();
    // Undo restored the pre-drag position…
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0], 3);
    // …and the dimension still EXISTS (undo did not delete it as "Add dimension").
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);
  });
});

describe('F1 — a cancelled object drag restores geometry and records no history step', () => {
  /**
   * `pointercancel` is the palm-rejection / browser-interrupt case — a gloved hand on a
   * Surface. `onPointerMove` has been writing every intermediate position through
   * `scene.setGeometry` (persisted by `scene.onChange` → `persist.queueSheet`), while the
   * only history step is recorded in `endContact`. `cancelContact` used to just drop the
   * drag record, leaving a mutation saved to markup.json that undo could never reach.
   */
  it('puts the dimension back and leaves the undo stack where it was', async () => {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    await closeKeypadAndSelectTool(view);

    const before = linePoints(markupGroup(stage));
    expect(before).toHaveLength(4);
    const mid = { x: at.x + 100, y: at.y };

    pointer('pointerdown', host, mid.x, mid.y, 1);
    pointer('pointermove', host, mid.x + 120, mid.y, 1);
    // The drag really did mutate the document — otherwise this guard is vacuous.
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0] + 120, 3);

    // The browser takes the pointer away mid-drag.
    pointer('pointercancel', host, mid.x + 120, mid.y, 1);

    // Geometry is back, point for point.
    await until(() => expect(linePoints(markupGroup(stage))).toEqual(before));

    // …and NOTHING was recorded: the one step on the stack is still the placement, so a
    // single undo removes the dimension (the F6 test above proves a real drag leaves a
    // move step here instead, and the object survives its undo).
    const undone = editorSession()?.undo() ?? null;
    expect(undone).not.toBeNull();
    expect(undone?.label).not.toBe(STRINGS.toasts.actionMoveDimension);
    expect(stage.getLayers()[2].getChildren()).toHaveLength(0);
  });
});

describe('F4 — §8.3: style edits coalesce within 600 ms into ONE undo step', () => {
  /**
   * `History.execCoalesced` had no production caller: every style path ran `history.exec`,
   * so one drag of `StyleEditorSheet`'s transparency scrubber (an `input type="range"`
   * firing `onChange` on every tick) pushed ~100 steps onto the 100-step stack and erased
   * the session's history. This drives the same seam the shell's style panel uses,
   * `editorSession().applyStylePatch`.
   */
  async function selectedDimension() {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    await closeKeypadAndSelectTool(view);
    // Tap the segment midpoint to select it (Select tool, tap = select).
    const mid = { x: at.x + 100, y: at.y };
    pointer('pointerdown', host, mid.x, mid.y, 1);
    pointer('pointerup', host, mid.x, mid.y, 1);
    await until(() => expect(useEditorStore.getState().selection).toHaveLength(1));
    return { view, host, stage, at };
  }

  const widthNow = (): number => useEditorStore.getState().selectionStyle.style.strokeWidthMu;

  it('four scrubber ticks on one key are one step; one undo restores the original', async () => {
    await selectedDimension();
    const session = editorSession()!;
    const original = widthNow(); // DEFAULT_STYLE.strokeWidthMu = 4
    expect(original).toBe(4);

    // Four ticks of the same control, well inside the 600 ms window.
    for (const mu of [5, 6, 7, 8]) {
      session.applyStylePatch({ strokeWidthMu: mu }, STRINGS.toasts.actionChangeStyle);
    }
    expect(widthNow()).toBe(8);

    // ONE undo returns the whole drag to where it started (pre-fix: 7, the previous tick).
    expect(session.undo()).not.toBeNull();
    expect(widthNow()).toBe(original);
    // …and there is no second style step hiding underneath: the next undo is the
    // placement, which removes the object rather than changing its width.
    expect(session.undo()).not.toBeNull();
    expect(useEditorStore.getState().selectionStyle.count).toBe(0);
  });

  it('a redo replays the whole coalesced batch', async () => {
    await selectedDimension();
    const session = editorSession()!;
    for (const mu of [5, 6, 7, 8]) {
      session.applyStylePatch({ strokeWidthMu: mu }, STRINGS.toasts.actionChangeStyle);
    }
    session.undo();
    expect(widthNow()).toBe(4);
    session.redo();
    expect(widthNow()).toBe(8);
  });

  it('a DIFFERENT style key starts a new step', async () => {
    await selectedDimension();
    const session = editorSession()!;
    session.applyStylePatch({ strokeWidthMu: 9 }, STRINGS.toasts.actionChangeStyle);
    session.applyStylePatch({ strokeWidthMu: 10 }, STRINGS.toasts.actionChangeStyle);
    // A different control, inside the same window: its own step (history.test.ts:93).
    session.applyStylePatch({ bold: true }, STRINGS.toasts.actionChangeStyle);
    expect(useEditorStore.getState().selectionStyle.style.bold).toBe(true);

    session.undo(); // undoes the bold only
    expect(useEditorStore.getState().selectionStyle.style.bold).toBe(false);
    expect(widthNow()).toBe(10);

    session.undo(); // undoes the coalesced width batch
    expect(widthNow()).toBe(4);
  });

  it('a tick after the 600 ms window starts a new step', async () => {
    await selectedDimension();
    const session = editorSession()!;
    session.applyStylePatch({ strokeWidthMu: 5 }, STRINGS.toasts.actionChangeStyle);
    session.applyStylePatch({ strokeWidthMu: 6 }, STRINGS.toasts.actionChangeStyle);
    const lastTick = performance.now(); // history's clock is performance.now() too
    // STYLE_COALESCE_MS = 600; wait past it with real time, as a paused scrubber would.
    await waitElapsed(lastTick, 650);
    session.applyStylePatch({ strokeWidthMu: 7 }, STRINGS.toasts.actionChangeStyle);

    session.undo();
    expect(widthNow()).toBe(6); // the late tick is its own step…
    session.undo();
    expect(widthNow()).toBe(4); // …and the first two coalesced into one
  });
});
