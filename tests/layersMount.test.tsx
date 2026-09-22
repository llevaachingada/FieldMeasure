/**
 * `tests/layersMount.test.tsx` — slice 1.6 wiring A1 shell gates (jsdom).
 *
 * `SheetEditor` is stubbed (it builds a real Konva.Stage; jsdom has no canvas — D40);
 * the real panel mount is proved in `tests/layersWire.browser.test.ts`. This file
 * proves the SHELL half:
 *   - the store's `layersOpen` / `setLayersOpen` mirror `keypadOpen` exactly;
 *   - the TopBar Layers button is a labelled disabled no-op without a toggle, and a
 *     real `aria-expanded` toggle with one (Export stays disabled — 1.9 owns it);
 *   - `EditorLayout` reflects the state on `data-layers-open`;
 *   - Escape closes the flyout instead of advancing a rung.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';

vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: () =>
      React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' }),
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import TopBar from '../src/ui/TopBar';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { setEditorSession } from '../src/editor/session';
import { STRINGS } from '../src/ui/strings';

function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
}

beforeEach(() => {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  setViewport(1240, 908);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setEditorSession(null);
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
});

describe('editorStore.layersOpen — the keypad mirror', () => {
  it('defaults to false and toggles through the action', () => {
    expect(useEditorStore.getState().layersOpen).toBe(false);
    act(() => {
      useEditorStore.getState().setLayersOpen(true);
    });
    expect(useEditorStore.getState().layersOpen).toBe(true);
    act(() => {
      useEditorStore.getState().resetEditorState();
    });
    expect(useEditorStore.getState().layersOpen).toBe(false);
  });
});

describe('TopBar — the Layers button is a labelled no-op or a real toggle', () => {
  const layersButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: STRINGS.a11y.layers }) as HTMLButtonElement;

  it('stays disabled with no toggle supplied (never a lie)', () => {
    render(createElement(TopBar, {}));
    expect(layersButton().disabled).toBe(true);
    expect(layersButton().getAttribute('aria-expanded')).toBeNull();
  });

  it('is enabled, reflects the open state and calls the toggle', () => {
    const onToggleLayers = vi.fn();
    render(createElement(TopBar, { onToggleLayers, layersOpen: true }));
    const button = layersButton();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    act(() => {
      button.click();
    });
    expect(onToggleLayers).toHaveBeenCalledTimes(1);
  });

  it('leaves the Export button disabled (slice 1.9 owns it)', () => {
    render(createElement(TopBar, { onToggleLayers: () => {} }));
    expect((screen.getByRole('button', { name: STRINGS.a11y.export }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('EditorLayout — data-layers-open and the Escape ladder', () => {
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

  it('reflects the store on data-layers-open and toggles it from the top bar', () => {
    const { container } = renderLayout();
    const root = container.querySelector('.editor-layout') as HTMLElement;
    expect(root.dataset.layersOpen).toBe('false');
    expect(root.dataset.keypadOpen).toBe('false');

    act(() => {
      (screen.getByRole('button', { name: STRINGS.a11y.layers }) as HTMLButtonElement).click();
    });
    expect(useEditorStore.getState().layersOpen).toBe(true);
    expect(root.dataset.layersOpen).toBe('true');
  });

  it('Escape closes the flyout instead of advancing a rung or exiting', () => {
    const onExit = vi.fn();
    renderLayout({ onExit });
    act(() => {
      useEditorStore.getState().setLayersOpen(true);
      useEditorStore.getState().setSelection(['ann-1']);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().layersOpen).toBe(false);
    // One rung only: the selection survived and the editor did not exit.
    expect(useEditorStore.getState().selection).toEqual(['ann-1']);
    expect(onExit).not.toHaveBeenCalled();

    // The ladder resumes normally on the next press.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('the keypad still wins Escape when both are open (keypad first)', () => {
    renderLayout();
    act(() => {
      useEditorStore.getState().setKeypadOpen(true);
      useEditorStore.getState().setLayersOpen(true);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(useEditorStore.getState().layersOpen).toBe(true); // untouched
  });
});
