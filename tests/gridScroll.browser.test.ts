/**
 * `tests/gridScroll.browser.test.ts` — the Project screen's two layout defects from the
 * D118 UI review, pinned in REAL layout (D118 H2 + M8).
 *
 * WHY THIS FILE EXISTS. jsdom has no layout engine (D40): every `getBoundingClientRect()`
 * is degenerate, `scrollHeight === clientHeight` always, and `element.animate` does not
 * exist. Neither defect can be seen there:
 *   1. **H2 — the grid's scroll container was inert.** `.project-screen { min-height: 100% }`
 *      let the screen grow with the grid, `html, body, #root { height: 100% }` handed the
 *      content height to `<body>`, and the DOCUMENT became the scroller. The 66 px
 *      `.project-bar` scrolled away: measured at 1440×960, `.project-body`'s
 *      `scrollHeight === clientHeight` (its `overflow-y: auto` never engaged) and
 *      `.project-screen` was 1378 px tall. The fix is a bounded height, so `.project-body`
 *      really scrolls and the bar stays put.
 *   2. **The coupling the fix introduces.** Once `.project-body` is a scroll container, an
 *      absolutely positioned popup inside it is CLIPPED by that scroller — the card `⋯` menu
 *      (finding 1 of the session-22 UI review) would lose «Delete» at the bottom row again.
 *      The menu is therefore portaled to `document.body` and anchored with `element.animate()`
 *      (CSP-safe: no `[style]` attribute).
 *
 * The first assertion is also the premise guard: if the grid does not overflow the panel at
 * this viewport, the test fails instead of silently proving nothing.
 *
 * Browser project only (`*.browser.test.ts` → real Chromium via `@vitest/browser-playwright`).
 * No storage is touched: `projectId` is deliberately absent, so the storage chip (the one
 * child that would read the disk) never mounts.
 *
 * Pre-fix evidence for these pins (a standalone Playwright fixture with the repo's own
 * stylesheets, 1440×960 — the vitest browser project is contended during a lane wave):
 *   `.project-body` scrollHeight === clientHeight === 1628, `panel.scrollTop = 99999` stayed
 *   0, `window.scrollTo(0, 99999)` → `window.scrollY 734` with `.project-bar` at y −734.
 *   With only `.project-screen { height: 100% }` applied (the half fix), the last-row menu's
 *   bottom sat 42 px past the scroller's bottom edge — the clip this portal removes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { page } from 'vitest/browser';
// GLOBAL SHEET FIRST — before the component that imports its own sheet. ESM evaluates imports in
// source order, and cascade ORDER decides a real conflict here: `.hit-slop
// { position: relative }` (styles.css:109) has the same single-class specificity as
// `.sheet-card-menu-button { position: absolute }`. With the component's sheet injected first, the
// ⋯ laid out `relative` in flow — 18 px past its card's bottom — so the geometry assertions
// measured a trigger the app never renders. (Re-importing the component sheet below does NOT fix
// it: Vite does not re-inject a stylesheet already in the graph.) Found by logging the computed
// style after this file's first failing run: a HARNESS bug, never a product one.
import '../src/styles.css';
import ProjectScreen from '../src/ui/ProjectScreen';
import type { ProjectSheetCard } from '../src/fs/projectSheets';
import { STRINGS } from '../src/ui/strings';

/** 18 grid items (2 add tiles + 16 cards): 5 rows of 4 at 1440 — taller than any tablet. */
const SHEET_COUNT = 16;

/** The overhang, in CSS px, is DERIVED in the test from the ⋯ trigger's own inset (below):
 *  the row is pushed past the scroller's bottom edge far enough to reproduce the clip a naive
 *  half fix leaves, but never so far that the trigger the test is about to click leaves the
 *  screen. The first draft used a fixture-tuned constant (110 px) and, on the real component at
 *  this viewport, pushed the trigger 128 px below the fold — failing its own precondition. The
 *  product was never at fault: only the test drives the row into that position. */

const containers: HTMLDivElement[] = [];

function card(index: number): ProjectSheetCard {
  const n = String(index).padStart(2, '0');
  return {
    id: `s${index}`,
    title: `Sheet ${n}`,
    index,
    updatedAtLabel: '2:14 PM',
    dimensionCount: 3,
    insetCount: 0,
    thumb: null,
  };
}

/** Render the real screen into a fixed-size box so `.project-screen { height: 100% }` resolves.
 *  ANCHORED TO THE VIEWPORT (`position: fixed; inset: 0`), not merely sized to it: an in-flow
 *  box inherits the test page's body offset, so its bottom sat at 1054 while the "stays on
 *  screen" assertions compared against `window.innerHeight` (960) — the harness measured in two
 *  coordinate spaces at once. */
function mount(): HTMLDivElement {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${window.innerWidth}px`;
  container.style.height = `${window.innerHeight}px`;
  document.body.append(container);
  containers.push(container);
  const sheets = Array.from({ length: SHEET_COUNT }, (_, i) => card(i + 1));
  render(
    createElement(ProjectScreen, {
      projectTitle: 'Riverside',
      sheetCount: sheets.length,
      state: 'ready' as const,
      sheets,
      selectedIds: [],
      onToggleSelected: vi.fn(),
      onClearSelection: vi.fn(),
      onOpenSheet: vi.fn(),
      onTakePhoto: vi.fn(),
      onImport: vi.fn(),
      onExport: vi.fn(),
      onBack: vi.fn(),
      // Every card-menu affordance injected so the popup is the full 7-item, 364 px box.
      onDeleteSheet: vi.fn(async () => {}),
      onRenameSheet: vi.fn(async () => {}),
      onDuplicateSheet: vi.fn(async () => ({ id: 'dup' })),
      onReplacePhoto: vi.fn(),
      onReorderSheets: vi.fn(async () => {}),
    }),
    { container },
  );
  return container;
}

/** Let React commit and an `element.animate` seed (duration 0) land. */
const settle = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

beforeEach(async () => {
  await page.viewport(1440, 960);
});

afterEach(() => {
  cleanup();
  for (const container of containers.splice(0)) container.remove();
  vi.restoreAllMocks();
});

describe('the grid body is the scroller (D118 H2)', () => {
  it('scrolls the panel to the bottom while the top bar and the document stay put', () => {
    mount();
    const panel = document.querySelector<HTMLElement>('.project-body');
    const bar = document.querySelector<HTMLElement>('.project-bar');
    expect(panel).toBeTruthy();
    expect(bar).toBeTruthy();

    // Premise: the grid really overflows the panel at this viewport, so the assertions
    // below are about a scroller that can move — not a vacuous one (D40's trap).
    expect(panel!.clientHeight).toBeGreaterThan(0);
    expect(panel!.scrollHeight).toBeGreaterThan(panel!.clientHeight);

    // The user's gesture: drag the grid up. This is the scroll that used to move the page.
    panel!.scrollTop = panel!.scrollHeight;
    expect(panel!.scrollTop).toBeGreaterThan(0);

    // The bar did NOT move, and the DOCUMENT stayed at the top — it is no longer the scroller.
    expect(Math.abs(bar!.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(window.scrollY).toBe(0);
  });
});

describe('the bottom-row card menu is not clipped by the scroller (D118 H2 coupling)', () => {
  it('keeps the popup on screen and «Delete» reachable at the scroller edge', async () => {
    mount();
    const panel = document.querySelector<HTMLElement>('.project-body')!;
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('.sheet-grid-item[data-sheet-id]'),
    );
    const lastItem = items[items.length - 1];
    expect(lastItem).toBeTruthy();

    const trigger = lastItem.querySelector<HTMLButtonElement>('.sheet-card-menu-button');
    expect(trigger).toBeTruthy();
    // Two constraints bracket the overhang, and the first draft picked a value outside both:
    //   - to reproduce the clip an in-subtree menu suffers, the row must overhang by more than
    //     the up-anchored menu's gap (`MENU_UP_GAP`, 68 px) — the menu's bottom is
    //     `item.bottom − 68`, so it is pushed past the scroller's edge only above that;
    //   - the ⋯ the test clicks sits `triggerInset` (~76 px) above the row's bottom, so the
    //     overhang must stay below it or the control leaves the screen.
    // The window is (68, triggerInset). Assert it is non-empty — a geometry change must FAIL
    // here rather than silently turn this into a test of something else.
    const MENU_UP_GAP = 68;
    const triggerInset =
      lastItem.getBoundingClientRect().bottom - trigger!.getBoundingClientRect().bottom;
    const minOverhang = MENU_UP_GAP + 2;
    const maxOverhang = triggerInset - 2;
    expect(maxOverhang).toBeGreaterThan(minOverhang);
    const overhang = Math.round((minOverhang + maxOverhang) / 2);

    // Bottom, then nudge UP so the last row overhangs the scroller's bottom edge — the one
    // position where an in-subtree popup is clipped (the coupling this portal removes).
    panel.scrollTop = panel.scrollHeight;
    const gap = panel.getBoundingClientRect().bottom - lastItem.getBoundingClientRect().bottom;
    panel.scrollTop -= gap + overhang;
    await settle();

    // The ⋯ is the handle the user actually taps; it must be on screen for this to be a real
    // reachable case rather than a drive-by of an off-screen control.
    const triggerRect = trigger!.getBoundingClientRect();
    expect(triggerRect.top).toBeGreaterThanOrEqual(0);
    expect(triggerRect.bottom).toBeLessThanOrEqual(window.innerHeight);

    trigger!.click();
    await settle();

    const menu = document.querySelector<HTMLElement>('.sheet-card-menu');
    expect(menu).toBeTruthy();
    // Portaled out of the scrolling subtree: the clip is structurally impossible.
    expect(menu!.parentElement).toBe(document.body);
    expect(document.querySelector('.project-body')?.contains(menu!)).toBe(false);
    // CSP-safe anchor: Web Animations adds no `[style]` attribute.
    expect(menu!.hasAttribute('style')).toBe(false);

    const rect = menu!.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);

    // The real invariant behind finding 1: the LAST item — «Delete» — is hittable, not just
    // present in the DOM. `elementFromPoint` accounts for clipping in a way a rect does not.
    const menuitems = Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const deleteItem = menuitems[menuitems.length - 1];
    expect(deleteItem.textContent).toBe(STRINGS.sheetMenu.delete);
    const itemRect = deleteItem.getBoundingClientRect();
    const hit = document.elementFromPoint(
      itemRect.left + itemRect.width / 2,
      itemRect.top + itemRect.height / 2,
    );
    expect(hit).not.toBeNull();
    expect(menu!.contains(hit)).toBe(true);
  });
});
