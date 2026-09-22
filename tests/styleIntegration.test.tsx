/**
 * `tests/styleIntegration.test.tsx` — slice 1.8 integration gate (jsdom).
 *
 * This file proves the ROUTING of the real, props-driven `StylePanel` mounted inside the
 * real `EditorLayout` against the real stores. It is deliberately *not* the effect proof:
 *
 *   - the "a change applies to ALL selected objects as ONE undo step and clears the
 *     indeterminate state" EFFECT is proven by `tests/sceneStyle.test.ts` (node, the
 *     command semantics) and `tests/sceneStyleCommand.browser.test.ts` (real Konva, the
 *     `MarkupScene.styleCommand` delegation + node rebuild) — both already in the tree.
 *   - HERE, `EditorSession` is STUBBED and `SheetEditor` is mocked (jsdom has no canvas;
 *     D40 forbids constructing a Konva Stage), so this file proves that the shell calls
 *     the right session command with the right arguments, updates the right store, and
 *     reads the mirror back into the panel — i.e. the wiring exists and is reachable.
 *
 * What each assertion proves:
 *   - `selectionStyle.mode === 'mixed'` reaches the panel as `selection='mixed'` and the
 *     indeterminate state is ANNOUNCED (role=status), not merely drawn (§7.4 #2);
 *   - a swatch click routes `applyStylePatch(patch, 'Change style')` to the session,
 *     updates the tool-style store, and shows the §7.3 applied-to hint;
 *   - `✕ Deselect` clears the store selection;
 *   - with «Apply to selection» OFF the session is NOT called (tool style only);
 *   - the precision control routes `applyProjectPrecision(denominator)` (D31);
 *   - `More styles…` mounts the deep sheet and `Done` closes it (§7.5);
 *   - presets load once for the D51 runtime key and save through `savePresets` (§7.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';

// Konva must not load in jsdom (D40) — stub the canvas screen exactly like the shell tests.
vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: () =>
      React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' }),
  };
});

// Presets IO is the one boundary mocked: the pure helpers stay real, the two async FS
// entry points are stubs so the load/save routing is observable and no idb is touched.
vi.mock('@/fs/presets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/presets')>();
  return {
    ...actual,
    loadPresets: vi.fn(async () => ({ ok: true as const, presets: actual.emptyPresets() })),
    savePresets: vi.fn(async () => {}),
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import {
  createInitialEditorState,
  useEditorStore,
  type SelectionStyleMirror,
} from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { createInitialStyleState, useStyleByTool } from '../src/state/styleByTool';
import { setEditorSession, type EditorSession } from '../src/editor/session';
import { DEFAULT_STYLE } from '../src/domain/types';
import { STRINGS, t } from '../src/ui/strings';
import { loadPresets, savePresets } from '../src/fs/presets';

function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

/** A heterogeneous selection: Text (2) · Rect (1) — so `strokeColor` is the only shared key. */
const MIXED: SelectionStyleMirror = {
  mode: 'mixed',
  style: { ...DEFAULT_STYLE },
  count: 3,
  scope: [
    { type: 'text', count: 2 },
    { type: 'rect', count: 1 },
  ],
};

const SINGLE_DIMENSION: SelectionStyleMirror = {
  mode: 'single',
  style: { ...DEFAULT_STYLE },
  count: 1,
  scope: [{ type: 'dimension', count: 1 }],
};

/** Register a stubbed session and return its style spies. */
function stubSession(): {
  applyStylePatch: ReturnType<typeof vi.fn>;
  applyStyle: ReturnType<typeof vi.fn>;
  applyProjectPrecision: ReturnType<typeof vi.fn>;
  applyProjectUnitFormat: ReturnType<typeof vi.fn>;
} {
  const applyStylePatch = vi.fn();
  const applyStyle = vi.fn();
  const applyProjectPrecision = vi.fn();
  const applyProjectUnitFormat = vi.fn();
  const session: EditorSession = {
    undo: () => null,
    redo: () => null,
    deleteSelection: () => null,
    cancelPending: () => {},
    requestValue: () => {},
    adjustEndpoints: () => {},
    applyStylePatch,
    applyStyle,
    applyProjectPrecision,
    applyProjectUnitFormat,
  };
  setEditorSession(session);
  return { applyStylePatch, applyStyle, applyProjectPrecision, applyProjectUnitFormat };
}

function renderLayout(): ReturnType<typeof render> {
  return render(
    createElement(EditorLayout, {
      projectId: 'p:f',
      folderName: 'Riverside',
      onExit: () => {},
    }),
  );
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  useStyleByTool.setState(createInitialStyleState());
  setViewport(1240, 908); // landscape → side dock
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setEditorSession(null);
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  useStyleByTool.setState(createInitialStyleState());
});

describe('EditorLayout — the style panel is mounted in the dock', () => {
  it('mounts the real panel inside the docked container with the orientation attribute', () => {
    const { container } = renderLayout();
    const dock = container.querySelector('.style-dock') as HTMLElement;
    expect(dock).not.toBeNull();
    expect(dock.dataset.orientation).toBe('vertical');
    expect(screen.getByTestId('style-panel')).not.toBeNull();
  });
});

describe('EditorLayout — mixed selection is indeterminate and announced', () => {
  it('passes the mirror through and announces the indeterminate state', () => {
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a', 'b', 'c'],
      selectionStyle: MIXED,
    });
    renderLayout();

    const panel = screen.getByTestId('style-panel');
    expect(panel.getAttribute('data-mixed')).toBe('true');
    expect(panel.getAttribute('data-selection')).toBe('mixed');

    // Announced, not only drawn (§7.4 #2 / §19.6).
    const status = screen.getByTestId('style-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe(STRINGS.style.mixedValue);

    // No swatch claims to be the selection's value.
    expect(screen.getByTestId('style-swatch-#FF7A18').getAttribute('aria-pressed')).toBe('false');
  });

  it('narrows applicability across a heterogeneous selection, disabled not hidden (§7.4 #4)', () => {
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a', 'b', 'c'],
      selectionStyle: MIXED, // Text (2) · Rect (1)
    });
    renderLayout();

    // `strokeColor` is shared by Text and Rect → enabled.
    expect(
      (screen.getByTestId('style-swatch-#2ECC71') as HTMLButtonElement).disabled,
    ).toBe(false);
    // `fillColor` exists only on Rect → disabled (in the layout) and named with the reason.
    const noFill = screen.getByTestId('style-fill-none') as HTMLButtonElement;
    expect(noFill.disabled).toBe(true);
    expect(noFill.getAttribute('aria-label')).toBe(
      `${STRINGS.style.noFill}. ${STRINGS.style.disabledForSelection}`,
    );
  });
});

describe('EditorLayout — a style change routes to the tool store and the session', () => {
  it('updates the tool style, sends ONE patch to the session, and shows the applied-to hint', () => {
    const { applyStylePatch } = stubSession();
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a', 'b', 'c'],
      selectionStyle: MIXED,
    });
    renderLayout();

    fireEvent.click(screen.getByTestId('style-swatch-#2ECC71'));

    expect(applyStylePatch).toHaveBeenCalledTimes(1);
    expect(applyStylePatch).toHaveBeenCalledWith(
      { strokeColor: '#2ECC71' },
      STRINGS.toasts.actionChangeStyle,
    );
    // §7.4: the tool's active style is updated as well.
    expect(useStyleByTool.getState().styleByTool.dimension.strokeColor).toBe('#2ECC71');

    const hint = screen.getByTestId('style-applied-hint');
    expect(hint.textContent).toContain(
      t(STRINGS.style.appliedToSelection, { objectCount: 3 }),
    );
  });

  it('applies a recent as a FULL replace to the tool and the session (one step)', () => {
    const { applyStyle } = stubSession();
    const recent = { ...DEFAULT_STYLE, strokeColor: '#E8384F' };
    useStyleByTool.setState({ recents: [recent] });
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a'],
      selectionStyle: SINGLE_DIMENSION,
    });
    renderLayout();

    fireEvent.click(screen.getByTestId('style-recent-0'));

    expect(applyStyle).toHaveBeenCalledTimes(1);
    expect(applyStyle).toHaveBeenCalledWith(recent, STRINGS.toasts.actionChangeStyle);
    expect(useStyleByTool.getState().styleByTool.dimension.strokeColor).toBe('#E8384F');
  });

  it('✕ Deselect clears the store selection', () => {
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a', 'b', 'c'],
      selectionStyle: MIXED,
    });
    renderLayout();

    fireEvent.click(screen.getByTestId('style-deselect'));
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('with «Apply to selection» OFF a change touches only the tool style', () => {
    const { applyStylePatch } = stubSession();
    useEditorStore.setState({
      activeTool: 'dimension',
      selection: ['a'],
      selectionStyle: SINGLE_DIMENSION,
    });
    renderLayout();

    // The toggle starts ON (aria-pressed true); one click turns synchronous mode OFF.
    fireEvent.click(screen.getByTestId('style-apply-to-selection'));
    fireEvent.click(screen.getByTestId('style-swatch-#2ECC71'));

    expect(applyStylePatch).not.toHaveBeenCalled();
    expect(useStyleByTool.getState().styleByTool.dimension.strokeColor).toBe('#2ECC71');
    expect(screen.queryByTestId('style-applied-hint')).toBeNull();
  });
});

describe('EditorLayout — project precision (D31)', () => {
  it('routes the precision control to the session with the chosen denominator', () => {
    const { applyProjectPrecision } = stubSession();
    useEditorStore.setState({ activeTool: 'dimension' });
    renderLayout();

    fireEvent.click(screen.getByTestId('style-precision-8'));
    expect(applyProjectPrecision).toHaveBeenCalledWith(8);
  });
});

describe('EditorLayout — the deep style editor sheet (§7.5)', () => {
  it('opens from More styles… and closes from Done', () => {
    useEditorStore.setState({ activeTool: 'dimension' });
    renderLayout();

    expect(screen.queryByTestId('style-editor-sheet')).toBeNull();
    fireEvent.click(screen.getByTestId('style-more'));
    expect(screen.getByTestId('style-editor-sheet')).not.toBeNull();
    fireEvent.click(screen.getByTestId('style-sheet-done'));
    expect(screen.queryByTestId('style-editor-sheet')).toBeNull();
  });
});

describe('EditorLayout — presets lifecycle (§7.3)', () => {
  it('loads once for the D51 runtime key and saves a named preset through savePresets', async () => {
    useEditorStore.setState({ activeTool: 'dimension' });
    renderLayout();

    await waitFor(() => expect(loadPresets).toHaveBeenCalledWith('p:f'));

    fireEvent.click(screen.getByTestId('style-preset-save'));
    fireEvent.change(screen.getByTestId('style-preset-name'), { target: { value: 'Roof edge' } });
    fireEvent.click(screen.getByTestId('style-preset-confirm'));

    await waitFor(() => expect(savePresets).toHaveBeenCalledTimes(1));
    const [projectId, file] = vi.mocked(savePresets).mock.calls[0];
    expect(projectId).toBe('p:f');
    expect(file.byTool.dimension?.[0]).toMatchObject({ name: 'Roof edge' });
  });
});
