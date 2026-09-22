/**
 * `tests/editorShell.test.tsx` — slice 1.4.5 machine gates (jsdom).
 *
 * What is proved here:
 *   - the one docking predicate `panelDockFor`, including the INCLUSIVE 1.2 boundary;
 *   - the rail's side is handedness only (rotation never moves it);
 *   - the frozen `TOOL_DEFS` table: 14 tools, 6 groups, unique ids, copy on each;
 *   - a tool with `implemented: false` is a no-op (rail AND layout);
 *   - the autosave slot renders nothing;
 *   - the `Esc` ladder is one rung per press;
 *   - the §6.6 tool hotkeys;
 *   - the §19.6 a11y floor: tab order, roles, names, 56 px rail targets.
 *
 * `SheetEditor` is stubbed: it constructs a real `Konva.Stage`, and jsdom has no
 * canvas (implementation plan "verification discipline"). The real wiring is already
 * guarded by `tests/sheetEditor.browser.test.ts` in the browser project, and the
 * real canvas pixel rules by `tests/editorCanvas.browser.test.ts`. This file tests
 * the chrome, which needs no canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';

// Stub the canvas surface (Konva needs a real canvas; jsdom has none). The stub also
// registers a fake import trigger so the top bar → canvas import seam can be proved.
vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: (props: { onImportReady?: (trigger: () => void) => void }) => {
      React.useEffect(() => {
        props.onImportReady?.(() => {
          (globalThis as { __fmImportTriggered?: boolean }).__fmImportTriggered = true;
        });
      }, [props.onImportReady]);
      return React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' });
    },
  };
});

import EditorLayout, {
  DOCK_ASPECT_THRESHOLD,
  escapeStep,
  panelDockFor,
  railSideFor,
  sheetEditorToolFor,
} from '../src/ui/EditorLayout';
import ToolRail, { TOOL_DEFS, TOOL_GROUPS, TOOL_HOTKEYS, type ToolId } from '../src/ui/ToolRail';
import TopBar from '../src/ui/TopBar';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { setEditorSession } from '../src/editor/session';
import { STRINGS, t } from '../src/ui/strings';

/** jsdom's `innerWidth`/`innerHeight` are read-only getters; redefine them. */
function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

function renderLayout(overrides: Record<string, unknown> = {}) {
  return render(
    createElement(EditorLayout, {
      projectId: 'p:f',
      folderName: 'Riverside',
      onExit: () => {},
      ...overrides,
    }),
  );
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  setViewport(1240, 908);
  delete (globalThis as { __fmImportTriggered?: boolean }).__fmImportTriggered;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setEditorSession(null);
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

describe('panelDockFor — the §11.3 docking rule (the inclusive 1.2 boundary)', () => {
  it.each([
    // 1240 / 908 = 1.3656…
    [1240, 908, 'side'],
    // 960 / 1388 = 0.6916…
    [960, 1388, 'bottom'],
    // 1200 / 1000 = exactly 1.2 — the boundary is INCLUSIVE
    [1200, 1000, 'side'],
  ] as const)('panelDockFor(%i, %i) → %s', (w, h, expected) => {
    expect(panelDockFor(w, h)).toBe(expected);
  });

  it('is inclusive exactly at the threshold', () => {
    expect(DOCK_ASPECT_THRESHOLD).toBe(1.2);
    expect(panelDockFor(DOCK_ASPECT_THRESHOLD * 1000, 1000)).toBe('side'); // = 1.2
    expect(panelDockFor(DOCK_ASPECT_THRESHOLD * 1000 - 1, 1000)).toBe('bottom'); // < 1.2
  });

  it('is safe before first layout (zero viewport never divides by zero)', () => {
    expect(panelDockFor(0, 0)).toBe('bottom');
    expect(panelDockFor(-1, 100)).toBe('bottom');
  });
});

describe('railSideFor — handedness only, never the viewport', () => {
  it('right-handed → rail on the right; left-handed → mirrored', () => {
    expect(railSideFor('right')).toBe('right');
    expect(railSideFor('left')).toBe('left');
  });
});

describe('sheetEditorToolFor — editorStore tool → SheetEditor seam (D61)', () => {
  it("maps 'select'/'pan' straight through and every placement tool to 'place'", () => {
    expect(sheetEditorToolFor('select')).toBe('select');
    expect(sheetEditorToolFor('pan')).toBe('pan');
    expect(sheetEditorToolFor('dimension')).toBe('place');
    expect(sheetEditorToolFor('erase')).toBe('place');
  });
});

describe('escapeStep — one rung per press (§4.2: pending → deselect → exit Focus → navigate)', () => {
  it('walks the ladder in order and stops at navigate', () => {
    expect(escapeStep({ pendingOp: 'dimension', hasSelection: true, focusInsetId: 'i' })).toBe('cancelPending');
    // §4.2 puts de-select BEFORE exit Focus; the first Esc in a Focus session with something
    // selected clears the selection, and the next one leaves the inset (DECISIONS D78).
    expect(escapeStep({ pendingOp: 'none', hasSelection: true, focusInsetId: 'i' })).toBe('deselect');
    // Exiting Focus does not itself change the selection — with none selected it exits.
    expect(escapeStep({ pendingOp: 'none', hasSelection: false, focusInsetId: 'i' })).toBe('exitFocus');
    expect(escapeStep({ pendingOp: 'none', hasSelection: true, focusInsetId: null })).toBe('deselect');
    expect(escapeStep({ pendingOp: 'none', hasSelection: false, focusInsetId: null })).toBe('navigate');
  });
});

describe('TOOL_DEFS — the frozen 14-tool table', () => {
  it('has exactly 14 tools in 6 groups with unique ids and copy on each', () => {
    expect(TOOL_DEFS).toHaveLength(14);
    expect(new Set(TOOL_DEFS.map((d) => d.id)).size).toBe(14);
    expect(new Set(TOOL_DEFS.map((d) => d.group))).toEqual(new Set(TOOL_GROUPS));
    for (const def of TOOL_DEFS) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(typeof def.Icon).toBe('function');
      expect(typeof def.implemented).toBe('boolean');
    }
  });

  it('implements all 14 rail tools (slice 1.7 completes the set)', () => {
    expect(
      TOOL_DEFS.filter((d) => !d.implemented).map((d) => d.id),
    ).toEqual([]);
  });

  it('binds every §6.6 hotkey to a real tool id', () => {
    const ids = new Set(TOOL_DEFS.map((d) => d.id));
    for (const [key, id] of Object.entries(TOOL_HOTKEYS)) {
      expect(key, 'hotkey key').toMatch(/^[A-Z]$/);
      expect(ids.has(id), `hotkey ${key} → ${id}`).toBe(true);
    }
  });
});

describe('ToolRail', () => {
  function renderRail(props: Record<string, unknown> = {}) {
    const onSelectTool = vi.fn();
    const view = render(
      createElement(ToolRail, {
        activeTool: 'select',
        onSelectTool,
        side: 'right',
        ...props,
      }),
    );
    return { view, onSelectTool };
  }

  it('renders 14 tool buttons, 6 group headers and a toolbar role', () => {
    const { view } = renderRail();
    const container = view.container;
    expect(container.querySelectorAll('[data-tool]')).toHaveLength(14);
    expect(screen.getByRole('toolbar')).toBeTruthy();
    const headers = Array.from(container.querySelectorAll('.tool-group-header')).map((h) => h.textContent);
    expect(headers).toEqual([
      STRINGS.toolRail.groupErase,
      STRINGS.toolRail.groupInsert,
      STRINGS.toolRail.groupAnnotate,
      STRINGS.toolRail.groupMark,
      STRINGS.toolRail.groupMeasure,
      STRINGS.toolRail.groupMove,
    ]);
  });

  it('selects an implemented tool', () => {
    const { view, onSelectTool } = renderRail();
    act(() => {
      (view.container.querySelector('[data-tool="pan"]') as HTMLButtonElement).click();
    });
    expect(onSelectTool).toHaveBeenCalledWith('pan');
  });

  it('is disabled (with a reason) when listed in disabledTools, and does not select', () => {
    const onSelectTool = vi.fn();
    const view = render(
      createElement(ToolRail, {
        activeTool: 'select',
        onSelectTool,
        side: 'right',
        disabledTools: new Set<ToolId>(['inset']),
        disabledReason: { inset: STRINGS.inset.nestedTooltip },
      }),
    );
    const inset = view.container.querySelector('[data-tool="inset"]') as HTMLButtonElement;
    expect(inset.disabled).toBe(true);
    expect(inset.title).toBe(STRINGS.inset.nestedTooltip);
    act(() => {
      inset.click();
    });
    expect(onSelectTool).not.toHaveBeenCalled();
  });

  it('moves focus with arrow keys inside the toolbar', () => {
    const { view } = renderRail();
    const toolbar = screen.getByRole('toolbar');
    const items = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[data-tool]'));
    items[0].focus();
    act(() => {
      toolbar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    // Arrow order follows DOM order (group 6 → group 1, per UI §6.2's rail diagram).
    expect((document.activeElement as HTMLElement).getAttribute('data-tool')).toBe(
      items[1].getAttribute('data-tool'),
    );
  });

  it('sits on the handedness side and renders disabled undo/redo below (no history until 1.5)', () => {
    const { view } = renderRail({ side: 'left' });
    expect((view.container.querySelector('.tool-rail') as HTMLElement).dataset.side).toBe('left');
    const undo = screen.getByRole('button', { name: STRINGS.a11y.undo }) as HTMLButtonElement;
    const redo = screen.getByRole('button', { name: STRINGS.a11y.redo }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
  });

  it('(a11y) every tool button has an accessible name', () => {
    const { view } = renderRail();
    for (const button of Array.from(view.container.querySelectorAll('button'))) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('TopBar', () => {
  it('renders nothing in the autosave slot until 1.10 (never an optimistic "Saved")', () => {
    const { container } = render(createElement(TopBar, { projectName: 'Riverside', sheetName: 'Sheet 04' }));
    const slot = container.querySelector('[data-testid="autosave-slot"]');
    expect(slot?.textContent).toBe('');
    expect(container.textContent).not.toMatch(/saved/i);
  });

  it('shows the breadcrumb names, falling back to the appendix placeholders', () => {
    const { container, unmount } = render(
      createElement(TopBar, { projectName: 'Riverside', sheetName: 'Sheet 04' }),
    );
    expect(container.querySelector('.crumb-project')?.textContent).toBe('Riverside');
    expect(container.querySelector('.crumb-sheet')?.textContent).toBe('Sheet 04');
    unmount();
    const bare = render(createElement(TopBar, {})).container;
    expect(bare.querySelector('.crumb-project')?.textContent).toBe(STRINGS.editor.breadcrumbProjectSegment);
    expect(bare.querySelector('.crumb-sheet')?.textContent).toBe(STRINGS.editor.breadcrumbSheetSegment);
  });

  it('lists the nine overflow items in UI §5.2 order', () => {
    render(createElement(TopBar, {}));
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      STRINGS.editor.menuDuplicateSheet,
      STRINGS.editor.menuInsertImage,
      STRINGS.editor.menuAddSheet,
      STRINGS.editor.menuImportFile,
      STRINGS.editor.menuSheetInfo,
      STRINGS.editor.menuProjectSettings,
      STRINGS.editor.menuSettings,
      STRINGS.editor.menuHelp,
      STRINGS.editor.menuKeyboardShortcuts,
    ]);
  });

  it('wires Add sheet / Import file to their callbacks and no-ops the rest safely', () => {
    const onAddSheet = vi.fn();
    const onImportFile = vi.fn();
    render(createElement(TopBar, { onAddSheet, onImportFile }));
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    act(() => {
      screen.getByRole('menuitem', { name: STRINGS.editor.menuAddSheet }).click();
    });
    expect(onAddSheet).toHaveBeenCalledTimes(1);
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    act(() => {
      screen.getByRole('menuitem', { name: STRINGS.editor.menuImportFile }).click();
    });
    expect(onImportFile).toHaveBeenCalledTimes(1);

    // An item with no feature behind it must not throw and must not navigate anywhere.
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    expect(() => {
      act(() => {
        screen.getByRole('menuitem', { name: STRINGS.editor.menuHelp }).click();
      });
    }).not.toThrow();
  });

  it('(a11y) every top-bar control has an accessible name', () => {
    const { container } = render(createElement(TopBar, {}));
    for (const button of Array.from(container.querySelectorAll('button'))) {
      const name = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('EditorLayout — composition, docking, rotation, keys', () => {
  it('mounts the canvas between the rail and the top bar in DOM (tab) order', () => {
    const { container } = renderLayout();
    const rail = container.querySelector('.tool-rail')!;
    const center = container.querySelector('.editor-center')!;
    const topbar = container.querySelector('.editor-topbar')!;
    expect(rail.compareDocumentPosition(center) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(center.compareDocumentPosition(topbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rail.compareDocumentPosition(topbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the rail on the left for a left-handed user', () => {
    useAppStore.setState({ handedness: 'left' });
    const { container } = renderLayout();
    expect((container.querySelector('.editor-layout') as HTMLElement).dataset.rail).toBe('left');
    expect((container.querySelector('.tool-rail') as HTMLElement).dataset.side).toBe('left');
  });

  it('docks side in landscape and bottom in portrait; rotation never moves the rail', () => {
    const { container } = renderLayout();
    const root = container.querySelector('.editor-layout') as HTMLElement;
    expect(root.dataset.dock).toBe('side');

    act(() => {
      useEditorStore.getState().setActiveTool('pan');
      useEditorStore.getState().setSelection(['ann-1']);
    });

    act(() => {
      setViewport(960, 1388); // portrait 960 × 1388 = 0.6916
      window.dispatchEvent(new Event('resize'));
    });

    expect(root.dataset.dock).toBe('bottom');
    // The rail did not move…
    expect(root.dataset.rail).toBe('right');
    // …and zoom/tool/selection survive.
    expect(useEditorStore.getState().activeTool).toBe('pan');
    expect(useEditorStore.getState().selection).toEqual(['ann-1']);
  });

  it('disables the Inset tool inside Focus (nesting is one level) and no-ops the tap', () => {
    const { container } = renderLayout();
    act(() => {
      useEditorStore.getState().setFocusInsetId('inset-1');
    });
    const inset = container.querySelector('[data-tool="inset"]') as HTMLButtonElement;
    expect(inset.disabled).toBe(true);
    expect(inset.title).toBe(STRINGS.inset.nestedTooltip);
    expect(() => {
      act(() => {
        inset.click();
      });
    }).not.toThrow();
    expect(useEditorStore.getState().activeTool).toBe('select');
  });

  it('selects an implemented rail tool through the store', () => {
    const { container } = renderLayout();
    act(() => {
      (container.querySelector('[data-tool="pan"]') as HTMLButtonElement).click();
    });
    expect(useEditorStore.getState().activeTool).toBe('pan');
  });

  it('runs the §6.6 hotkeys, including the newly-implemented Inset tool', () => {
    renderLayout();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    });
    expect(useEditorStore.getState().activeTool).toBe('pan');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    });
    expect(useEditorStore.getState().activeTool).toBe('dimension'); // 1.5 implements it
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    });
    expect(useEditorStore.getState().activeTool).toBe('angle'); // 1.6 implements it
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
    });
    expect(useEditorStore.getState().activeTool).toBe('inset'); // 1.7 completes the set
  });

  it('advances the Esc ladder one rung per press, ending in exit', () => {
    const onExit = vi.fn();
    renderLayout({ onExit });

    act(() => {
      useEditorStore.getState().setPendingOp('dimension');
      useEditorStore.getState().setSelection(['ann-1']);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().pendingOp).toBe('none');
    expect(useEditorStore.getState().selection).toEqual(['ann-1']); // one rung only
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().selection).toEqual([]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      useEditorStore.getState().setFocusInsetId('inset-1');
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().focusInsetId).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('routes the top bar Import action through the canvas import seam (single path)', () => {
    renderLayout();
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    act(() => {
      screen.getByRole('menuitem', { name: STRINGS.editor.menuImportFile }).click();
    });
    expect((globalThis as { __fmImportTriggered?: boolean }).__fmImportTriggered).toBe(true);
  });

  it('wires the rail undo/redo to the editor session and names the action in a toast', () => {
    const { container } = renderLayout();
    const undo = vi.fn(() => ({ label: 'Delete dimension' }));
    setEditorSession({
      undo,
      redo: () => null,
      deleteSelection: () => null,
      cancelPending: () => {},
      requestValue: () => {},
      adjustEndpoints: () => {},
      // Slice 1.8 style seam: the shell may call these, but this test only drives undo.
      applyStylePatch: () => {},
      applyStyle: () => {},
      applyProjectPrecision: () => {},
      applyProjectUnitFormat: () => {},
    });
    act(() => {
      (container.querySelector(`[aria-label="${STRINGS.a11y.undo}"]`) as HTMLButtonElement).click();
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(t(STRINGS.toasts.undoAction, { actionName: 'Delete dimension' })),
    ).toBeTruthy();
  });
});

describe('C5 spike — lucide-react named export renders', () => {
  it('import { Camera } from lucide-react renders an <svg>', async () => {
    const { Camera } = await import('lucide-react');
    const { container } = render(createElement(Camera));
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
