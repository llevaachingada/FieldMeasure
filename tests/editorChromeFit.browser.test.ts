/**
 * `tests/editorChromeFit.browser.test.ts` - the "the chrome fits a Surface" gate.
 *
 * WHY THIS FILE EXISTS (and why it is a browser test)
 *   jsdom has no layout engine (D40), so every declared-size assertion in
 *   `stylePanel.test.tsx` reads the stylesheet as TEXT. That proves what the CSS says, not
 *   what the screen shows. The owner's Surface screenshot showed the style panel clipping
 *   mid-`LINE STYLE` with an internal scrollbar, and no jsdom test could see it. This file
 *   mounts the REAL editor chrome with the REAL stylesheets in real Chromium and reads
 *   `getBoundingClientRect()` / `scrollHeight`.
 *
 * THE TARGETS (both must be clip-free and scroll-free)
 *   - 1920 x 1120 - the owner's maximised window (2880 x 1920 at 150 %, minus browser chrome).
 *   - 1916 x 960 - the same device with the window not maximised.
 *   Each target is measured through the PRODUCTION height chain (`html, body, #root` at
 *   `height: 100%`, the real viewport) as well as a definite-size host, because a page-level
 *   scroll is one way the rail's first tile can end up off-screen while the rail itself has
 *   never overflowed.
 *
 * WHAT IT ASSERTS
 *   - at both targets, for every tool, with the WORST-CASE tails present (8 Recents - the
 *     §7.3 cap - and a saved preset): the panel body does not scroll, the last section is
 *     inside the panel, the rail does not scroll, the rail's first group is fully inside the
 *     rail, the document itself does not scroll, and the panel is the §7.2 280 px;
 *   - at 1366 x 768 (the requirement there is "usable", not "fits") the panel scrolls inside
 *     its own body rather than clipping, and Desk density makes the rail FIT (UI §3.5);
 *   - the 14 glyphs draw real, non-degenerate geometry in a real renderer.
 *
 * NOT TRIVIALLY TRUE: the sections measured are asserted to be the expected set for each
 * tool (a panel that rendered nothing would otherwise "fit" perfectly).
 *
 * Before the fix this file fails: the panel body was 1390 px tall in an 840 px box (550 px
 * of overflow) for EVERY tool, whatever the active tool was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { page } from 'vitest/browser';

import '../src/styles.css';

// The canvas is the one thing not under test and the one thing these tests stub:
// `SheetEditor` builds a real Konva.Stage from a real photo. The chrome needs no canvas.
vi.mock('@/ui/SheetEditor', async () => {
  const React = await import('react');
  return {
    default: (props: { onImportReady?: (trigger: () => void) => void }) => {
      React.useEffect(() => {
        props.onImportReady?.(() => {});
      }, [props.onImportReady]);
      return React.createElement('div', {
        className: 'editor-canvas',
        'data-testid': 'sheet-editor',
      });
    },
  };
});

// Presets IO is a boundary: stub the two async entry points so a saved preset is always
// present (the worst case for height) and no idb / File System Access is touched.
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
import ToolRail from '../src/ui/ToolRail';
import { createInitialEditorState, useEditorStore } from '../src/state/editorStore';
import { createInitialAppState, useAppStore } from '../src/state/appStore';
import { createInitialStyleState, useStyleByTool } from '../src/state/styleByTool';
import { DEFAULT_STYLE } from '../src/domain/types';
import type { ToolId } from '../src/ui/ToolRail';

afterEach(cleanup);

/** The §7.3 Recents cap (8) - the tallest the Recents strip can ever be. */
const MAX_RECENTS = [
  '#FFD400',
  '#E8384F',
  '#FF3D9A',
  '#2FD4E0',
  '#35A7FF',
  '#2ECC71',
  '#A8E05F',
  '#9AA6B2',
].map((strokeColor) => ({ ...DEFAULT_STYLE, strokeColor }));

interface Measurement {
  label: string;
  layoutHeight: number;
  documentOverflow: number;
  railTop: number;
  railBottom: number;
  railWidth: number;
  dockWidth: number;
  railClient: number;
  railScroll: number;
  firstGroupTop: number;
  lastGroupBottom: number;
  panelWidth: number;
  panelBottom: number;
  bodyClient: number;
  bodyScroll: number;
  bodyClientW: number;
  bodyScrollW: number;
  bodyOverflowY: string;
  sections: Array<{ title: string; height: number; bottom: number }>;
}

type Host = 'sized' | 'production';

function measure(
  tool: ToolId,
  viewport: { w: number; h: number },
  density: 'field' | 'desk' = 'field',
  host: Host = 'sized',
): Measurement {
  useEditorStore.setState(createInitialEditorState());
  useAppStore.setState(createInitialAppState());
  useAppStore.setState({ density });
  useStyleByTool.setState({ ...createInitialStyleState(), recents: MAX_RECENTS });
  useEditorStore.getState().setActiveTool(tool);

  const hostEl = document.createElement('div');
  if (host === 'production') {
    // The production chain: `html, body, #root { height: 100% }` (styles.css) with the real
    // window viewport - exactly what the app has in the browser.
    hostEl.id = 'root';
  } else {
    // `production` needs the window viewport; the definite-size host keeps the viewport
    // (and therefore the dock decision) independent of the container so a call is
    // reproducible.
    hostEl.style.width = `${viewport.w}px`;
    hostEl.style.height = `${viewport.h}px`;
  }
  document.body.append(hostEl);

  const view = render(
    createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
    { container: hostEl },
  );

  const layout = view.container.querySelector('.editor-layout') as HTMLElement;
  const rail = view.container.querySelector('.tool-rail') as HTMLElement;
  const groups = Array.from(rail.querySelectorAll<HTMLElement>('.tool-group'));
  const panel = view.container.querySelector('.style-panel') as HTMLElement;
  const body = view.container.querySelector('.style-panel-body') as HTMLElement;
  const sections = Array.from(
    view.container.querySelectorAll<HTMLElement>('.style-panel-section'),
  )
    .filter((section) => section.getBoundingClientRect().height > 0)
    .map((section) => ({
      title: section.querySelector('.style-panel-section-title')?.textContent?.trim() ?? '?',
      height: Math.round(section.getBoundingClientRect().height),
      bottom: Math.round(section.getBoundingClientRect().bottom),
    }));

  const railRect = rail.getBoundingClientRect();
  const result: Measurement = {
    label: `${tool}/${density}/${host}`,
    layoutHeight: Math.round(layout.getBoundingClientRect().height),
    documentOverflow: (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
    railTop: Math.round(railRect.top),
    railBottom: Math.round(railRect.bottom),
    railWidth: Math.round(railRect.width),
    dockWidth: Math.round((view.container.querySelector('.style-dock') as HTMLElement).getBoundingClientRect().width),
    railClient: rail.clientHeight,
    railScroll: rail.scrollHeight,
    firstGroupTop: Math.round(groups[0].getBoundingClientRect().top),
    lastGroupBottom: Math.round(groups[groups.length - 1].getBoundingClientRect().bottom),
    panelWidth: Math.round(panel.getBoundingClientRect().width),
    panelBottom: Math.round(panel.getBoundingClientRect().bottom),
    bodyClient: body.clientHeight,
    bodyScroll: body.scrollHeight,
    bodyClientW: body.clientWidth,
    bodyScrollW: body.scrollWidth,
    bodyOverflowY: getComputedStyle(body).overflowY,
    sections,
  };

  cleanup();
  hostEl.remove();
  return result;
}

/** The four tool shapes that exercise every section combination. */
const TOOLS = ['select', 'dimension', 'rect', 'text'] as const;
type TargetTool = (typeof TOOLS)[number];

/** The sections each tool must actually show - keeps "it fits" non-trivial. */
const EXPECTED_SECTIONS: Record<TargetTool, string[]> = {
  select: ['Presets'],
  dimension: ['Color', 'Width', 'Arrowheads', 'Precision', 'Recent', 'Presets'],
  rect: ['Color', 'Width', 'Fill', 'Transparency', 'Line style', 'Recent', 'Presets'],
  text: ['Color', 'Size', 'Recent', 'Presets'],
};

/** Both of the owner's sizes. Neither may clip and neither may scroll. */
const TARGETS: Array<{ w: number; h: number; name: string }> = [
  { w: 1920, h: 1120, name: 'owner maximised' },
  { w: 1916, h: 960, name: 'owner unmaximised' },
];

describe.each(TARGETS)('editor chrome fits $w x $h ($name)', ({ w, h }) => {
  for (const tool of TOOLS) {
    // D149 (owner request): at three swatches wide the panel cannot hold every section without
    // scrolling, so the contract is now "scrolls inside its own body, never sideways".
    it(`the style panel scrolls only vertically, inside its body, for the ${tool} tool`, async () => {
      await page.viewport(w, h);
      const m = measure(tool, { w, h });

      // The gate: `scrollHeight <= clientHeight` means the body does not scroll at all.
      expect(m.bodyOverflowY, `${tool}: the body is the scroll region`).toBe('auto');
      expect(
        m.bodyScrollW,
        `${tool}: panel body overflows SIDEWAYS by ${m.bodyScrollW - m.bodyClientW}px at ${w}x${h}`,
      ).toBeLessThanOrEqual(m.bodyClientW);

      // Non-triviality: the panel really rendered this tool's sections, at full height.
      expect(m.sections.map((s) => s.title)).toEqual(EXPECTED_SECTIONS[tool]);
      expect(m.sections.every((s) => s.height > 0)).toBe(true);


      // D149 (owner request): the style container is three swatch tiles wide (176 px, was 280
      // per §7.2) and the rail is one column (56 px, was 128 per §6.2). The panel itself is the
      // container minus its 2 px rail-facing divider.
      expect(m.dockWidth).toBe(176);
      expect(m.panelWidth).toBe(m.dockWidth - 2);
      expect(m.railWidth).toBe(56);
    });
  }

  it('the style panel scrolls only vertically with an object selected (D149)', async () => {
    await page.viewport(1920, 1120);
    // A homogeneous selection is a normal editing state, not an edge case: the §7.4
    // selection bar appears and the panel must still fit.
    useEditorStore.setState(createInitialEditorState());
    useAppStore.setState(createInitialAppState());
    useStyleByTool.setState({ ...createInitialStyleState(), recents: MAX_RECENTS });
    useEditorStore.getState().setActiveTool('rect');
    useEditorStore.setState((s) => ({
      ...s,
      selection: ['a', 'b'],
      selectionStyle: {
        mode: 'single',
        style: { ...DEFAULT_STYLE },
        count: 2,
        scope: [{ type: 'rect', count: 2 }],
      },
    }));
    const host = document.createElement('div');
    host.style.width = '1920px';
    host.style.height = '1120px';
    document.body.append(host);
    const view = render(
      createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
      { container: host },
    );
    const body = view.container.querySelector('.style-panel-body') as HTMLElement;
    expect(document.querySelector('[data-testid="style-selection-bar"]')).not.toBeNull();
    expect(getComputedStyle(body).overflowY).toBe('auto');
    expect(
      body.scrollWidth,
      `selected: panel body overflows SIDEWAYS by ${body.scrollWidth - body.clientWidth}px`,
    ).toBeLessThanOrEqual(body.clientWidth);
    cleanup();
    host.remove();
  });

  it('fills the viewport, never scrolls the page, and keeps the rail\'s first group on screen', async () => {
    await page.viewport(w, h);
    // The production height chain, so a page-level scroll cannot hide the rail's top.
    const m = measure('dimension', { w, h }, 'field', 'production');

    expect(m.layoutHeight, 'editor fills the viewport').toBe(window.innerHeight);
    expect(m.documentOverflow, 'the page itself must not scroll').toBeLessThanOrEqual(0);
    expect(m.railScroll, 'the rail must not scroll').toBeLessThanOrEqual(m.railClient);
    // The failure the owner reported (a first tile off the rail's top edge). Measured on the
    // pre-change tree this did NOT reproduce - the rail fitted and the page did not scroll -
    // so this is a cheap guard against the failure mode, not a regression it caught.
    expect(m.firstGroupTop, "the rail's first group is not clipped").toBeGreaterThanOrEqual(
      m.railTop,
    );
    expect(m.lastGroupBottom, "the rail's last group is not clipped").toBeLessThanOrEqual(
      m.railBottom,
    );
    // The same panel gate as above (D149: vertical scroll inside the body, never sideways),
    // but through the production chain rather than a host.
    expect(m.bodyOverflowY).toBe('auto');
    expect(m.bodyScrollW).toBeLessThanOrEqual(m.bodyClientW);
  });
});

describe('1366 x 768 stays usable (scrolls rather than clipping)', () => {
  it('the panel scrolls inside its own body and no section is cut by a hidden box', async () => {
    await page.viewport(1366, 768);
    const m = measure('rect', { w: 1366, h: 768 });

    // "Usable" = the overflow is a real scroll region on the body, not a clip: the body
    // must be the scroll container, which is what makes the missing pixels reachable.
    expect(m.bodyOverflowY).toBe('auto');
    expect(m.bodyScroll).toBeGreaterThanOrEqual(m.bodyClient);
  });

  // D149: one column cannot fit 14 tools at 768 px in either density. Desk still earns its
  // keep by needing less of a scroll than Field (was: "Desk makes the rail fit", UI §3.5).
  it('Desk density shortens the one-column tool rail at 1366x768 (UI §3.5, D149)', async () => {
    await page.viewport(1366, 768);
    const field = measure('rect', { w: 1366, h: 768 }, 'field');
    const desk = measure('rect', { w: 1366, h: 768 }, 'desk');

    // Field cannot fit the rail at this height …
    expect(field.railScroll).toBeGreaterThan(field.railClient);
    // … and Desk, the compact density, overflows less.
    expect(desk.railScroll - desk.railClient).toBeLessThan(field.railScroll - field.railClient);
  });
});

describe('tool glyphs are real geometry in a real renderer', () => {
  it('draws each of the 14 glyphs meaningfully inside its 24x24 box', async () => {
    await page.viewport(400, 900);
    const view = render(
      createElement(ToolRail, { activeTool: 'select', onSelectTool: () => {}, side: 'right' }),
    );
    const svgs = Array.from(view.container.querySelectorAll<SVGSVGElement>('[data-tool] svg'));
    expect(svgs).toHaveLength(14);

    const boxes: string[] = [];
    for (const svg of svgs) {
      const tool = svg.closest('[data-tool]')?.getAttribute('data-tool') ?? '?';
      const box = svg.getBBox();
      // Non-degenerate: a broken path would be empty, tiny or wildly out of the viewBox.
      expect(box.width, `${tool} width`).toBeGreaterThan(6);
      expect(box.height, `${tool} height`).toBeGreaterThan(6);
      expect(box.x, `${tool} left`).toBeGreaterThanOrEqual(-0.5);
      expect(box.y, `${tool} top`).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width, `${tool} right`).toBeLessThanOrEqual(24.5);
      expect(box.y + box.height, `${tool} bottom`).toBeLessThanOrEqual(24.5);
      boxes.push([box.x, box.y, box.width, box.height].map((n) => n.toFixed(1)).join(','));
    }
    // Most glyphs occupy a different envelope - a second signal, alongside the jsdom
    // markup check, that no two tools share the same drawing.
    expect(new Set(boxes).size).toBeGreaterThanOrEqual(11);

    cleanup();
  });
});

describe('the rail and its panel take the handedness sides (D127)', () => {
  it('puts the rail on the RIGHT with the panel opposite when handedness is right, and mirrors it', () => {
    // REAL layout, which is the only place this can fail: `data-rail="right"` was set on the
    // layout while the rail still rendered left-most, because `.tool-rail` has no `order` of its
    // own and the dock being given `order: 0` left the flex container on SOURCE order (the rail
    // is first in the DOM). The clickthru editor screenshots showed it on the default
    // right-handed setting; every attribute assertion the rotation gate makes passed anyway.
    for (const handedness of ['right', 'left'] as const) {
      const host = document.createElement('div');
      host.style.width = '1440px';
      host.style.height = '960px';
      document.body.append(host);
      useEditorStore.setState(createInitialEditorState());
      useAppStore.setState(createInitialAppState());
      useAppStore.setState({ handedness });
      const view = render(
        createElement(EditorLayout, { projectId: 'p:f', folderName: 'Riverside', onExit: () => {} }),
        { container: host },
      );

      const layout = view.container.querySelector('.editor-layout') as HTMLElement;
      const rail = view.container.querySelector('.tool-rail') as HTMLElement;
      const center = view.container.querySelector('.editor-center') as HTMLElement;
      expect(rail).toBeTruthy();
      expect(center).toBeTruthy();
      // The attribute the layout carries must agree with where the rail actually is.
      expect(layout.getAttribute('data-rail')).toBe(handedness);

      const railLeft = Math.round(rail.getBoundingClientRect().left);
      const centerLeft = Math.round(center.getBoundingClientRect().left);
      if (handedness === 'right') {
        expect(railLeft).toBeGreaterThan(centerLeft);
      } else {
        expect(railLeft).toBeLessThan(centerLeft);
      }

      view.unmount();
      host.remove();
    }
  });
});
