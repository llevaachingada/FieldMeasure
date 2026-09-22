/**
 * `tests/editorA11y.browser.test.ts` - the per-slice accessibility contract on the editor
 * chrome, AUDITED BY EXECUTION in real Chromium (AGENTS.md non-negotiable; build spec
 * §19.6; UI spec §14.9).
 *
 * jsdom cannot answer ANY of these questions: it has no layout (so no target size, no
 * `display:none` tabbability, no `offsetParent`), no real keyboard, and no
 * `:focus-visible` state. This file mounts the real chrome with the real stylesheets in
 * real Chromium and measures:
 *
 *   1. TARGET SIZES - every interactive control is >= 48x48 CSS px (UI §14.5/§19.6 under
 *      touch-primary), except the two sanctioned 44 px grids (the swatch grid and the
 *      Recents chips). MEASURED FLOOR (1920x1120 and 1440x960, 54 controls): 48x48 on the
 *      width steppers, 52x48 on the overflow trigger, 56x48 on the precision chips - so the
 *      smallest control in the chrome sits exactly ON the floor, with no exceptions beyond
 *      the two sanctioned ones.
 *   2. FOCUS ORDER - `Tab` through the whole chrome and record the accessible names; the
 *      order must be UI §14.9's (top bar -> rail -> canvas -> style panel) and every control
 *      must be reachable. PRE-FIX this was 41 stops with the top bar LAST (38-41); the fix
 *      is the DOM order in `EditorLayout`.
 *   3. ACCESSIBLE NAMES - every control has one.
 *   4. NO KEYBOARD TRAP - Tab leaves the chrome; Escape closes the top bar's menu and
 *      returns focus to its trigger.
 *   5. VISIBLE FOCUS RING - the global `:focus-visible` rule actually paints.
 *
 * The canvas's own tab stop is NOT here: `SheetEditor` is stubbed (it builds a real Konva
 * stage) and the canvas container's focusability is another lane's seam.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';

import '../src/styles.css';

vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', { className: 'editor-canvas', 'data-testid': 'sheet-editor' }),
  };
});

vi.mock('@/fs/presets', async () => {
  const { DEFAULT_STYLE } = await import('@/domain/types');
  return {
    PresetsBindingError: class PresetsBindingError extends Error {},
    emptyPresets: () => ({ schemaVersion: 1, byTool: {} }),
    findPreset: () => undefined,
    loadPresets: async () => ({ ok: true, presets: { schemaVersion: 1, byTool: {} } }),
    presetsForTool: () => [{ name: 'Riverside dim', style: { ...DEFAULT_STYLE } }],
    savePresets: async () => {},
    upsertPreset: (file: unknown) => file,
  };
});

import EditorLayout from '../src/ui/EditorLayout';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { createInitialStyleState, useStyleByTool } from '../src/state/styleByTool';
import { DEFAULT_STYLE } from '../src/domain/types';

afterEach(cleanup);

/** The two sizes the owner's Surface actually presents, plus portrait for completeness. */
const VIEWPORTS: Array<{ w: number; h: number }> = [
  { w: 1920, h: 1120 },
  { w: 1440, h: 960 },
  { w: 960, h: 1440 },
];

/** The two sanctioned sub-48 px targets (UI §14.5 / §19.6): 44 px grids, no third. */
const SANCTIONED_44 = ['style-panel-swatch', 'style-panel-recent'];

interface ControlInfo {
  tag: string;
  className: string;
  testid: string;
  label: string;
  name: string;
  hasAriaLabel: boolean;
  hasText: boolean;
  w: number;
  h: number;
  tabbable: boolean;
}

function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label && label.trim() !== '') return label.trim();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text !== '') return text;
  const title = el.getAttribute('title');
  return title ? title.trim() : '';
}

/** A short, stable label for a control: testid, else class, else tag. */
function describeEl(el: Element): string {
  const testid = el.getAttribute('data-testid');
  if (testid) return `[${testid}]`;
  const tool = el.getAttribute('data-tool');
  if (tool) return `tool:${tool}`;
  const cls = (el.getAttribute('class') ?? '').split(' ').filter(Boolean)[0];
  return cls ? `.${cls}` : el.tagName.toLowerCase();
}

function mountChrome(w: number, h: number): HTMLElement {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  useStyleByTool.setState(createInitialStyleState());
  useEditorStore.getState().setActiveTool('dimension');

  const host = document.createElement('div');
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  document.body.append(host);
  const view = render(
    createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
    { container: host },
  );
  return view.container.querySelector('.editor-layout') as HTMLElement;
}

function collectControls(root: HTMLElement): ControlInfo[] {
  const selector = 'button, input, select, textarea, a[href], [tabindex]';
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => {
      // Skip anything inside an aria-hidden subtree (decorative) or a hidden one.
      if (el.closest('[aria-hidden="true"]')) return false;
      if (el.classList.contains('visually-hidden')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false; // display:none / not rendered
      return true;
    })
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        className: el.getAttribute('class') ?? '',
        testid: el.getAttribute('data-testid') ?? el.getAttribute('data-tool') ?? '',
        label: describeEl(el),
        name: accessibleName(el),
        hasAriaLabel: (el.getAttribute('aria-label') ?? '').trim() !== '',
        hasText: (el.textContent ?? '').replace(/\s+/g, ' ').trim() !== '',
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        tabbable: el.tabIndex >= 0 && !el.hasAttribute('disabled') && el.offsetParent !== null,
      };
    });
}

// ---------------------------------------------------------------------------
// 1. Target sizes (UI §14.5 / §19.6)
// ---------------------------------------------------------------------------

describe.each(VIEWPORTS)('target sizes at $w x $h', ({ w, h }) => {
  it('every interactive chrome control is at least 48 x 48 CSS px', async () => {
    await page.viewport(w, h);
    const root = mountChrome(w, h);
    const controls = collectControls(root);

    const failures = controls.filter((c) => {
      const sanctioned = SANCTIONED_44.some((cls) => c.className.includes(cls));
      return !sanctioned && (c.w < 48 || c.h < 48);
    });

    expect(
      failures.map((c) => `${c.label}/${c.name || '(no name)'} ${c.w}x${c.h}`),
      `${failures.length} of ${controls.length} controls are under 48x48`,
    ).toEqual([]);

    // Non-triviality: the chrome really did render a substantial control set.
    expect(controls.length).toBeGreaterThan(30);
  });

  it('the two sanctioned 44 px grids are the only sub-48 targets', async () => {
    await page.viewport(w, h);
    const root = mountChrome(w, h);
    const controls = collectControls(root);
    const sub48 = controls.filter((c) => c.w < 48 || c.h < 48);
    for (const c of sub48) {
      expect(
        SANCTIONED_44.some((cls) => c.className.includes(cls)),
        `sub-48 control that is not a sanctioned grid: ${c.className} ${c.w}x${c.h}`,
      ).toBe(true);
      expect([c.w, c.h]).toContain(44);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. Focus order and accessible names
// ---------------------------------------------------------------------------

describe('focus order and names (UI spec §14.9)', () => {
  it('every interactive chrome control has a usable accessible name', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    // A `title` is not an accessible name for a control: require an aria-label or visible
    // text, so an icon-only control with neither is a failure (not masked by the helper's
    // title fallback, which is only used to label stops in the focus walk).
    const nameless = collectControls(root).filter((c) => !c.hasAriaLabel && !c.hasText);
    expect(nameless.map((c) => `${c.tag}.${c.className} ${c.w}x${c.h}`)).toEqual([]);
  });

  it('Tab reaches the top bar FIRST, then the rail, then the style panel (§14.9)', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);

    // Tab from a neutral start and record only the stops that land INSIDE the editor chrome
    // (the Vitest browser runner's own UI is also in the document and is not under test).
    const sequence: Array<{ name: string; where: 'topbar' | 'rail' | 'panel' | 'canvas'; ringed: boolean }> = [];
    (document.activeElement as HTMLElement | null)?.blur?.();

    for (let i = 0; i < 120; i += 1) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) continue;
      const where: 'topbar' | 'rail' | 'panel' | 'canvas' = active.closest('.editor-topbar')
        ? 'topbar'
        : active.closest('.tool-rail')
          ? 'rail'
          : active.closest('.style-panel')
            ? 'panel'
            : 'canvas';
      const outline = getComputedStyle(active);
      const entry = {
        name: accessibleName(active) || describeEl(active),
        where,
        // UI §14.9/§3.1 C11: every control shows the ring while focused. Measured on EVERY
        // stop of the walk, so a control family that overrides it cannot hide.
        ringed: outline.outlineStyle !== 'none' && parseFloat(outline.outlineWidth) >= 2,
      };
      // Stop when the walk has returned to its first chrome stop.
      if (sequence.length > 0 && sequence[0].name === entry.name && sequence[0].where === entry.where) {
        break;
      }
      sequence.push(entry);
    }

    const unringed = sequence.filter((s) => !s.ringed);
    expect(
      unringed.map((s) => `${s.name} (${s.where})`),
      'focused controls with no visible ring',
    ).toEqual([]);

    const firstTopBar = sequence.findIndex((s) => s.where === 'topbar');
    const firstRail = sequence.findIndex((s) => s.where === 'rail');

    // UI spec §14.9 (which outranks the implementation plan): top bar -> rail -> canvas ->
    // style panel. The failure message carries the whole walk, so a future regression says
    // exactly which stop moved.
    expect(
      sequence[0]?.where,
      `first chrome tab stop: ${JSON.stringify(sequence)}`,
    ).toBe('topbar');
    expect(firstTopBar).toBe(0);
    expect(firstRail, 'top bar before rail').toBeGreaterThan(firstTopBar);

    // Every tabbable chrome control was reached (the rail's roving tabindex means one tool
    // button is the tab stop; its 13 siblings are reached with Arrow keys).
    const reached = new Set(sequence.map((s) => s.name));
    const tabbable = collectControls(root)
      .filter((c) => c.tabbable)
      .map((c) => c.name)
      .filter((n) => n !== '');
    const unreached = tabbable.filter((n) => !reached.has(n));
    expect(unreached, 'tabbable controls Tab never reached').toEqual([]);
  });

  it('the rail reaches all 14 tools with arrow keys (ARIA toolbar roving tabindex)', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
    expect(buttons).toHaveLength(14);

    // Exactly one tool is a tab stop.
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);

    // Arrows walk every one of the 14, and the visited set is complete.
    buttons.find((b) => b.tabIndex === 0)?.focus();
    const visited = new Set<string>([accessibleName(document.activeElement as Element)]);
    for (let i = 0; i < 20; i += 1) {
      await userEvent.keyboard('{ArrowDown}');
      visited.add(accessibleName(document.activeElement as Element));
    }
    const allNames = buttons.map((b) => accessibleName(b));
    expect([...visited].sort()).toEqual([...new Set(allNames)].sort());
  });
});

// ---------------------------------------------------------------------------
// 4. No keyboard trap; Escape/close behaviour in the chrome's own popup
// ---------------------------------------------------------------------------

describe('no keyboard trap', () => {
  it('Tab leaves the chrome rather than cycling inside it forever', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    (document.activeElement as HTMLElement | null)?.blur?.();

    let left = false;
    for (let i = 0; i < 120; i += 1) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || !root.contains(active)) {
        left = true;
        break;
      }
    }
    expect(left, 'Tab never escaped the editor chrome').toBe(true);
  });

  it('Escape closes the top bar menu and returns focus to its trigger', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    const trigger = root.querySelector<HTMLButtonElement>('.topbar-overflow-trigger') as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('disclosures and the deep sheet', () => {
  it('the Fill disclosure reveals its swatches into the tab order and traps nothing', async () => {
    await page.viewport(1920, 1120);
    useEditorStore.setState(createInitialEditorState());
    useAppStore.setState(createInitialAppState());
    useStyleByTool.setState(createInitialStyleState());
    useEditorStore.getState().setActiveTool('rect'); // Rect is a Fill tool
    const host = document.createElement('div');
    host.style.width = '1920px';
    host.style.height = '1120px';
    document.body.append(host);
    const view = render(
      createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
      { container: host },
    );
    const root = view.container.querySelector('.editor-layout') as HTMLElement;

    const picker = root.querySelector<HTMLElement>('[data-testid="style-fill-picker"]')!;
    const closedSwatches = Array.from(
      root.querySelectorAll<HTMLElement>('[data-testid^="style-fill-swatch-"]'),
    );
    // Closed: the picker is `display:none`, so its swatches are not phantom tab stops.
    expect(picker.dataset.open).toBe('false');
    expect(closedSwatches.every((el) => el.getBoundingClientRect().width === 0)).toBe(true);

    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="style-fill-toggle"]')!;
    fireEvent.click(toggle);
    expect(picker.dataset.open).toBe('true');
    const openSwatches = Array.from(
      root.querySelectorAll<HTMLElement>('[data-testid^="style-fill-swatch-"]'),
    );
    expect(openSwatches).toHaveLength(12);
    expect(openSwatches.every((el) => el.getBoundingClientRect().width >= 44)).toBe(true);

    // Tabbing from the toggle walks the 12 swatches in order and then LEAVES them (no trap).
    toggle.focus();
    const walked: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement;
      walked.push(active.getAttribute('data-testid') ?? accessibleName(active));
    }
    expect(walked.slice(0, 12)).toEqual(
      openSwatches.map((el) => el.getAttribute('data-testid')),
    );
    expect(walked[12]).toBe('style-transparency-range');

    cleanup();
    host.remove();
  });

  it('the More styles… sheet contains Tab and Escape closes it, returning focus', async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    const more = root.querySelector<HTMLButtonElement>('[data-testid="style-more"]') as HTMLButtonElement;
    // Focus first, as a keyboard user (and Chromium pointer input) does: the sheet returns
    // focus to whatever held it when it opened.
    more.focus();
    fireEvent.click(more);

    const sheet = document.querySelector('[data-testid="style-editor-sheet"]') as HTMLElement;
    expect(sheet, 'the deep sheet opened').not.toBeNull();
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    // Focus starts INSIDE the modal.
    expect(sheet.contains(document.activeElement)).toBe(true);

    // Tabbing is contained by the modal's own trap (correct for a modal), never leaking to
    // the chrome behind it.
    for (let i = 0; i < 40; i += 1) {
      await userEvent.tab();
      expect(sheet.contains(document.activeElement), `focus leaked at tab ${i}`).toBe(true);
    }

    // …and Escape always gets you out, back to the control that opened it.
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('[data-testid="style-editor-sheet"]')).toBeNull();
    expect(document.activeElement).toBe(more);
  });
});

// ---------------------------------------------------------------------------
// 5. Visible focus ring (UI §14.9 / §3.1 C11)
// ---------------------------------------------------------------------------

describe('visible focus ring', () => {
  it("paints a >= 2px --sel ring on a tabbed-to control", async () => {
    await page.viewport(1920, 1120);
    const root = mountChrome(1920, 1120);
    (document.activeElement as HTMLElement | null)?.blur?.();
    await userEvent.tab();

    const active = document.activeElement as HTMLElement;
    expect(root.contains(active)).toBe(true);
    const style = getComputedStyle(active);
    expect(parseFloat(style.outlineWidth), `outline on ${describeEl(active)}`).toBeGreaterThanOrEqual(2);
    expect(style.outlineStyle).not.toBe('none');
  });
});
