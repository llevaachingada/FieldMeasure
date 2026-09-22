/**
 * `tests/exportWiring.test.tsx` — slice 1.9's shell wiring (jsdom).
 *
 * The engine is proved in `tests/runExport.browser.test.ts` (real canvas + a fake
 * File System Access layer) and the wizard's own behaviour in
 * `tests/exportWizard.test.tsx`. THIS file proves the shell is actually reachable:
 *
 *   - `TopBar`'s Export button is ENABLED and opens the wizard (it was hard-coded
 *     `disabled` before this slice — a review caught exactly that class of dead wire);
 *   - `Ctrl+E` opens it (UI §12:740);
 *   - `⋯ → Export` opens it;
 *   - the wizard receives the sheet list and the current sheet from the `SheetEditor`
 *     seam, so the default scope and the listed sheets are the REAL document’s;
 *   - closing restores focus to the invoker (§19.6);
 *   - the wizard is the ONLY `role="dialog"` on screen (no second dialog wrapper).
 *
 * `SheetEditor` is mocked: it builds a real `Konva.Stage` and jsdom has no canvas (D40).
 * The mock emits the ADDITIVE `onExportSource` seam the same way the real sheet does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';

// Konva must not load in jsdom (D40).
vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  const sheets = [
    { id: 's1', title: 'North wall', imageWidthPx: 4096, imageHeightPx: 3072 },
    { id: 's2', title: 'East footing', imageWidthPx: 4096, imageHeightPx: 3072 },
    { id: 's3', title: 'Slab edge', imageWidthPx: 4096, imageHeightPx: 3072 },
  ];
  return {
    default: (props: { onExportSource?: (source: unknown) => void }) => {
      React.useEffect(() => {
        props.onExportSource?.({
          sheets,
          currentSheetId: 's2',
          currentAnnotations: () => [],
          assetProvider: () => null,
          flush: async () => {},
        });
        return () => props.onExportSource?.(null);
      }, [props.onExportSource]);
      return React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' });
    },
  };
});

// Presets IO is the one boundary mocked (the real helpers load through projectStore/idb).
vi.mock('@/fs/presets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/presets')>();
  return {
    ...actual,
    loadPresets: vi.fn(async () => ({ ok: true as const, presets: actual.emptyPresets() })),
    savePresets: vi.fn(async () => {}),
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import TopBar from '../src/ui/TopBar';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { createInitialStyleState, useStyleByTool } from '../src/state/styleByTool';
import { setEditorSession } from '../src/editor/session';
import { STRINGS } from '../src/ui/strings';

function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

function renderLayout(): ReturnType<typeof render> {
  return render(
    createElement(EditorLayout, {
      projectId: 'p:Riverside',
      folderName: 'Riverside',
      onExit: () => {},
    }),
  );
}

const exportButton = (): HTMLButtonElement =>
  screen.getByRole('button', { name: STRINGS.a11y.export }) as HTMLButtonElement;

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  useStyleByTool.setState(createInitialStyleState());
  setViewport(1240, 908);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setEditorSession(null);
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

describe('TopBar — the Export entry point is real when the shell supplies one', () => {
  it('is a labelled disabled no-op with no handler (never a lie)', () => {
    render(createElement(TopBar, {}));
    expect(exportButton().disabled).toBe(true);
  });

  it('is enabled and calls the handler when one is supplied', () => {
    const onExport = vi.fn();
    render(createElement(TopBar, { onExport }));
    const button = exportButton();
    expect(button.disabled).toBe(false);
    act(() => {
      button.click();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('carries a `⋯ → Export` row', () => {
    const onExport = vi.fn();
    render(createElement(TopBar, { onExport }));
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    const menu = screen.getByRole('menu');
    const item = within(menu).getByRole('menuitem', { name: STRINGS.a11y.export });
    act(() => {
      item.click();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('EditorLayout — the wizard is reachable and gets the document seam', () => {
  it('the Export button opens the wizard, which is the only dialog', () => {
    renderLayout();
    expect(screen.queryByTestId('export-wizard')).toBeNull();

    act(() => {
      exportButton().click();
    });
    expect(screen.getByTestId('export-wizard')).toBeTruthy();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('`Ctrl+E` opens the wizard', () => {
    renderLayout();
    act(() => {
      fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    });
    expect(screen.getByTestId('export-wizard')).toBeTruthy();
  });

  it('`⋯ → Export` opens the wizard', () => {
    renderLayout();
    act(() => {
      screen.getByRole('button', { name: STRINGS.a11y.moreActions }).click();
    });
    const item = within(screen.getByRole('menu')).getByRole('menuitem', {
      name: STRINGS.a11y.export,
    });
    act(() => {
      item.click();
    });
    expect(screen.getByTestId('export-wizard')).toBeTruthy();
  });

  it('passes the sheet list and the current sheet through to the wizard', () => {
    renderLayout();
    act(() => {
      exportButton().click();
    });

    // `currentSheetId = s2` makes `This sheet` the default scope (UI §12:712), so the
    // list starts as that one sheet…
    expect(screen.getByTestId('export-wizard-scope-sheet').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('export-wizard-sheet-s2')).toBeTruthy();
    expect(screen.queryByTestId('export-wizard-sheet-s1')).toBeNull();

    // …and `All sheets (3)` proves the whole seam list arrived, not just the open sheet.
    act(() => {
      screen.getByTestId('export-wizard-scope-all').click();
    });
    expect(screen.getByTestId('export-wizard-scope-all').textContent).toBe('All sheets (3)');
    for (const id of ['s1', 's2', 's3']) {
      expect(screen.getByTestId(`export-wizard-sheet-${id}`)).toBeTruthy();
    }
  });

  it('closing the wizard returns focus to the invoker (§19.6)', () => {
    renderLayout();
    const button = exportButton();
    // A real tap focuses before it activates; jsdom’s `click()` does not.
    button.focus();
    act(() => {
      button.click();
    });
    expect(screen.getByTestId('export-wizard')).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByTestId('export-wizard')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
