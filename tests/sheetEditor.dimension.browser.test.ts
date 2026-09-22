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
import { cleanup, render, screen } from '@testing-library/react';
import Konva from 'konva';
import SheetEditor from '../src/ui/SheetEditor';
import EditorLayout from '../src/ui/EditorLayout';
import { editorSession } from '../src/editor/session';
import { useEditorStore, createInitialEditorState } from '../src/state/editorStore';
import { useAppStore, createInitialAppState } from '../src/state/appStore';
import { STRINGS } from '../src/ui/strings';

vi.mock('@/fs/projectStore', () => ({
  registerOpenProject: vi.fn(),
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

    await sleep(10); // React flush (the phase attribute is rendered from state)
    expect(host.dataset.placementPhase).toBe('anchorB');
    expect(useEditorStore.getState().pendingOp).toBe('dimension');
    // Placement state announced (a11y). The empty-state panel is also role=status, so
    // target the live region by its own attribute.
    const live = view.container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(STRINGS.placement.adjusting);
    // Geometry committed but the keypad is not open yet.
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);

    await sleep(520);
    expect(useEditorStore.getState().keypadOpen).toBe(true);
    expect(screen.getByTestId('keypad-sheet')).toBeTruthy();
  });

  it('a contact cancels the auto-open permanently; geometry survives; ✓ Value re-opens it', async () => {
    const { host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });

    // Contact far from both anchors, before the 450 ms timer fires.
    pointer('pointerdown', host, at.x + 600, at.y + 400);
    pointer('pointerup', host, at.x + 600, at.y + 400);

    await sleep(520);
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    // Geometry survived.
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);
    expect(host.dataset.placementPhase).toBe('anchorB');

    // The HUD's ✓ Value is the explicit re-entry.
    const valueButton = screen.getByText(STRINGS.keypad.useThisValue);
    valueButton.click();
    await sleep(10);
    expect(useEditorStore.getState().keypadOpen).toBe(true);
    expect(screen.getByTestId('keypad-sheet')).toBeTruthy();
  });

  it('Escape in the keypad keeps the geometry and returns focus to the canvas', async () => {
    const { host, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    await sleep(520);
    expect(screen.getByTestId('keypad-sheet')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // React state flush.
    await sleep(10);
    expect(useEditorStore.getState().keypadOpen).toBe(false);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(document.activeElement).toBe(host);
  });
});

describe('D63 — a second finger restores the pre-drag object position', () => {
  it('cancels the object drag and puts the dimension back', async () => {
    const { view, host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    // Cancel the keypad so the placement finishes (geometry kept, phase idle).
    await sleep(520);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);

    // Re-mount as the Select tool so a one-finger drag is object-first.
    view.rerender(
      createElement(SheetEditor, {
        projectId: 'p:f',
        folderName: 'f',
        onExit: () => {},
        activeTool: 'select',
      }),
    );
    await sleep(10);

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
    await sleep(10);
    expect(host.dataset.placementPhase).toBe('anchorA');
    expect(useEditorStore.getState().pendingOp).toBe('dimension');
    expect(hasProvisional(stage)).toBe(true);

    // Rung 1 must CANCEL the pending dimension, not merely clear the store flag.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);
    expect(useEditorStore.getState().pendingOp).toBe('none');
    expect(host.dataset.placementPhase).toBe('idle');
    expect(hasProvisional(stage)).toBe(false);

    // The next tap begins a NEW placement (A) — it must not commit from the stale A.
    pointer('pointerdown', host, at.x + 200, at.y);
    pointer('pointerup', host, at.x + 200, at.y);
    await sleep(10);
    expect(host.dataset.placementPhase).toBe('anchorA');
    expect(stage.getLayers()[2].getChildren()).toHaveLength(0); // nothing committed
  });
});

describe('F5 — a tool switch inside the settle window cancels the dimension settle', () => {
  it('does not open the dimension keypad over the newly selected placement tool', async () => {
    // The REAL tool id drives the switch (the coarse `activeTool` prop stays 'place').
    useEditorStore.getState().setActiveTool('dimension');
    const { host, stage, at } = await mountEditor('place');
    tapTap(host, at, { x: at.x + 200, y: at.y });
    await sleep(10); // committed geometry, 450 ms settle running
    expect(host.dataset.placementPhase).toBe('anchorB');
    expect(useEditorStore.getState().keypadOpen).toBe(false);

    // Switch to the rectangle tool INSIDE the settle window. dimension → rect keeps the
    // coarse prop at 'place', so the OLD wiring never reached `dimRef.onToolChange()`.
    useEditorStore.getState().setActiveTool('rect');
    await sleep(600);

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
    // Cancel the keypad so the placement finishes (geometry kept, phase idle).
    await sleep(520);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(10);

    // Select tool so a one-finger drag is object-first.
    view.rerender(
      createElement(SheetEditor, {
        projectId: 'p:f',
        folderName: 'f',
        onExit: () => {},
        activeTool: 'select',
      }),
    );
    await sleep(10);

    const before = linePoints(markupGroup(stage));
    expect(before).toHaveLength(4);
    const mid = { x: at.x + 100, y: at.y }; // segment midpoint

    // Drag BELOW the 8 px tap slop: 3 px. The move still mutates the geometry, but the
    // old path only recorded a history step once `drag.moved` (≥ slop) became true.
    pointer('pointerdown', host, mid.x, mid.y, 1);
    pointer('pointermove', host, mid.x + 3, mid.y, 1);
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0] + 3, 3);
    pointer('pointerup', host, mid.x + 3, mid.y, 1);
    await sleep(10);

    const undone = editorSession()?.undo() ?? null;
    expect(undone).not.toBeNull();
    // Undo restored the pre-drag position…
    expect(linePoints(markupGroup(stage))[0]).toBeCloseTo(before[0], 3);
    // …and the dimension still EXISTS (undo did not delete it as "Add dimension").
    expect(stage.getLayers()[2].getChildren()).toHaveLength(1);
  });
});
