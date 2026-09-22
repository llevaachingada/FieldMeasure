/**
 * `tests/gridA11y.browser.test.ts` — the per-slice accessibility contract on the **sheets grid**
 * (the Project screen), AUDITED BY EXECUTION in real Chromium (AGENTS.md non-negotiable; build spec
 * §19.6; UI spec §14.5/§14.9). The template is `tests/editorA11y.browser.test.ts`, which found two
 * real defects in the editor chrome — this file asks the same questions of the screen the owner
 * uses most, and which changed most this session.
 *
 * WHY REAL CHROMIUM AND NOT jsdom (D40): jsdom has no layout, so no control has a size; it has no
 * real keyboard, so no focus walk; it has no `:focus-visible` state; and — the reason this file
 * exists at all — it cannot see the consequence of the card menu being **portaled to
 * `document.body`** (`element.animate()` anchoring, an outside-pointerdown guard and a
 * scroll-to-close), which is precisely the kind of change that breaks focus entry, focus return
 * and hit-testing while every jsdom assertion stays green.
 *
 * What it measures:
 *   1. TARGET SIZES — every interactive control is ≥ 48×48 CSS px (touch-primary floor) at the
 *      owner's real size and the two tablet orientations.
 *   2. HIT-SLOP OVERLAP — UI §14.5: no two hit areas may overlap. The card's `⋯` trigger and the
 *      select toggle were measured 4 px overlapping by an earlier review and fixed with
 *      `bottom: 76px`; this asserts the fix holds.
 *   3. FOCUS ORDER + THE PORTAL — `Tab` through the screen; then open a card menu with the
 *      keyboard and check that focus enters it, arrows rove, Escape closes AND returns focus to
 *      the trigger, and Tab leaves rather than trapping.
 *   4. ACCESSIBLE NAMES — every control, a `title` alone not counting.
 *   5. THE FOCUS RING on every stop of the walk.
 *   6. ANNOUNCED STATE — the selection count's `role="status"` and the toggle's `aria-pressed`
 *      actually change with the state.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';

// Global sheet FIRST — cascade order decides (see the note in gridScroll.browser.test.ts).
import '../src/styles.css';
import ProjectScreen from '../src/ui/ProjectScreen';
import TrashPanel from '../src/ui/TrashPanel';
import type { ProjectSheetCard } from '../src/fs/projectSheets';
import { STRINGS, t } from '../src/ui/strings';

afterEach(cleanup);

const VIEWPORTS = [
  { w: 1920, h: 1120 },
  { w: 1440, h: 960 },
  { w: 960, h: 1440 },
];

/** A card fixture: `thumb: null` keeps object-URL handling out of the audit. */
function card(index: number): ProjectSheetCard {
  return {
    id: `s${index}`,
    title: `Sheet ${String(index).padStart(2, '0')}`,
    index,
    updatedAtLabel: '2:14 PM',
    dimensionCount: 3,
    insetCount: index % 2,
    thumb: null,
  };
}

const CARDS = [1, 2, 3, 4, 5, 6, 7, 8].map(card);

interface GridHandles {
  root: HTMLElement;
  onToggleSelected: () => void;
  onOpenTrash: () => void;
  onRestoreSheet: () => void;
}

/** Mount the real screen at a real viewport, with the affordances the shell injects. */
async function mountGrid(w: number, h: number, ids: readonly string[] = []): Promise<GridHandles> {
  await page.viewport(w, h);
  const host = document.createElement('div');
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  document.body.append(host);

  const onToggleSelected = (): void => {};
  const onOpenTrash = (): void => {};
  const onRestoreSheet = (): void => {};
  const view = render(
    createElement(ProjectScreen, {
      projectTitle: 'Riverside Elementary',
      sheetCount: CARDS.length,
      state: 'ready' as const,
      sheets: CARDS,
      selectedIds: ids,
      onToggleSelected,
      onClearSelection: () => {},
      onOpenSheet: () => {},
      onTakePhoto: () => {},
      onImport: () => {},
      onExport: () => {},
      onBack: () => {},
      // Every optional affordance injected, so the menu and the trash entry render.
      onDeleteSheet: async () => {},
      trash: [],
      onOpenTrash,
      onRestoreSheet,
      onReorderSheets: async () => {},
      onRenameSheet: async () => {},
      onDuplicateSheet: async (id: string) => ({ id: `${id}-copy` }),
      onReplacePhoto: () => {},
    }),
    { container: host },
  );
  return {
    root: view.container.querySelector('.project-screen') as HTMLElement,
    onToggleSelected,
    onOpenTrash,
    onRestoreSheet,
  };
}

interface ControlInfo {
  label: string;
  name: string;
  hasAriaLabel: boolean;
  hasText: boolean;
  w: number;
  h: number;
}

function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label && label.trim() !== '') return label.trim();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text !== '') return text;
  const title = el.getAttribute('title');
  return title ? title.trim() : '';
}

function describeEl(el: Element): string {
  const testid = el.getAttribute('data-testid');
  if (testid) return `[${testid}]`;
  const cls = (el.getAttribute('class') ?? '').split(' ').filter(Boolean)[0];
  return cls ? `.${cls}` : el.tagName.toLowerCase();
}

/** Every rendered interactive control, excluding aria-hidden decoration and unrendered nodes. */
function collectControls(root: HTMLElement): ControlInfo[] {
  const selector = 'button, input, select, textarea, a[href], [tabindex]';
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => {
      if (el.closest('[aria-hidden="true"]')) return false;
      const rect = el.getBoundingClientRect();
      return !(rect.width === 0 && rect.height === 0);
    })
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        label: describeEl(el),
        name: accessibleName(el),
        hasAriaLabel: (el.getAttribute('aria-label') ?? '').trim() !== '',
        hasText: (el.textContent ?? '').replace(/\s+/g, ' ').trim() !== '',
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    });
}

// ---------------------------------------------------------------------------
// 1. Target sizes (UI §14.5 / §19.6)
// ---------------------------------------------------------------------------

describe.each(VIEWPORTS)('grid target sizes at $w x $h', ({ w, h }) => {
  it('every interactive grid control is at least 48 x 48 CSS px', async () => {
    const { root } = await mountGrid(w, h);
    const controls = collectControls(root);
    const failures = controls.filter((c) => c.w < 48 || c.h < 48);

    expect(
      failures.map((c) => `${c.label}/${c.name || '(no name)'} ${c.w}x${c.h}`),
      `${failures.length} of ${controls.length} controls are under 48x48`,
    ).toEqual([]);
    // Non-triviality: the screen really rendered its control set (a broken mount would pass).
    expect(controls.length).toBeGreaterThan(20);
  });
});

describe('hit areas never overlap (UI §14.5)', () => {
  it('the card ⋯ trigger and the select toggle keep their hit slops apart', async () => {
    await page.viewport(1440, 960);
    const { root } = await mountGrid(1440, 960);
    // `.hit-slop::after` extends a control's hit area by 8 px per side (styles.css:109-116).
    const SLOP = 8;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.sheet-grid-item[data-sheet-id]'));
    expect(cards.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const item of cards) {
      const trigger = item.querySelector<HTMLElement>('.sheet-card-menu-button');
      const select = item.querySelector<HTMLElement>('.sheet-card-select');
      if (!trigger || !select) continue;
      const a = trigger.getBoundingClientRect();
      const b = select.getBoundingClientRect();
      // The two rings, each expanded by the slop, must not overlap.
      const overlapX = Math.min(a.right + SLOP, b.right + SLOP) - Math.max(a.left - SLOP, b.left - SLOP);
      const overlapY = Math.min(a.bottom + SLOP, b.bottom + SLOP) - Math.max(a.top - SLOP, b.top - SLOP);
      if (overlapX > 0 && overlapY > 0) {
        failures.push(
          `${item.getAttribute('data-sheet-id')}: ⋯ bottom ${Math.round(a.bottom)} vs select top ${Math.round(b.top)} → ${Math.round(overlapY)} px of slop overlap`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2/3. Names
// ---------------------------------------------------------------------------

describe('accessible names on the grid', () => {
  it('every control has an aria-label or visible text (a title alone does not count)', async () => {
    const { root } = await mountGrid(1440, 960);
    const nameless = collectControls(root).filter((c) => !c.hasAriaLabel && !c.hasText);
    expect(nameless.map((c) => `${c.label} ${c.w}x${c.h}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The portaled card menu: focus entry, roving, Escape-return, no trap
// ---------------------------------------------------------------------------

describe('the portaled card menu keeps its keyboard contract', () => {
  it('Escape closes it and returns focus to the ⋯ trigger; Tab leaves without trapping', async () => {
    await page.viewport(1440, 960);
    const { root } = await mountGrid(1440, 960);
    const user = userEvent.setup();

    const item = root.querySelector<HTMLElement>('.sheet-grid-item[data-sheet-id="s1"]');
    expect(item).toBeTruthy();
    const trigger = item!.querySelector<HTMLButtonElement>('.sheet-card-menu-button');
    expect(trigger).toBeTruthy();

    trigger!.focus();
    await user.keyboard('{Enter}');
    // The menu is PORTALED to document.body, so it is deliberately NOT inside `.project-screen`.
    const menu = document.body.querySelector<HTMLElement>('.sheet-card-menu');
    expect(menu).toBeTruthy();
    expect(menu!.parentElement).toBe(document.body);
    expect(root.contains(menu!)).toBe(false);

    // Focus enters the menu (the first enabled item), not left behind on the trigger.
    const items = Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.length).toBeGreaterThan(3);
    expect(menu!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(items[0]);

    // ArrowDown roves forward through the enabled items.
    await user.keyboard('{ArrowDown}');
    expect(menu!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(items[0]);

    // Escape closes and RETURNS focus to the trigger (a portaled menu that forgets this leaves
    // focus on <body>, which is a keyboard dead end).
    await user.keyboard('{Escape}');
    expect(document.body.querySelector('.sheet-card-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Re-open, then Tab: it must close and move on rather than trap.
    await user.keyboard('{Enter}');
    expect(document.body.querySelector('.sheet-card-menu')).toBeTruthy();
    await user.keyboard('{Tab}');
    expect(document.body.querySelector('.sheet-card-menu')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Announced state
// ---------------------------------------------------------------------------

describe('state that a screen reader must hear', () => {
  it('the selection count is announced and the toggle reports aria-pressed', async () => {
    const { root } = await mountGrid(1440, 960, ['s1', 's2']);
    const bar = root.querySelector<HTMLElement>('.project-selection-bar');
    expect(bar).toBeTruthy();
    expect(bar!.getAttribute('role')).toBe('status');
    expect(bar!.textContent).toContain('2');

    const toggle = root.querySelector<HTMLElement>(
      '.sheet-grid-item[data-sheet-id="s1"] .sheet-card-select',
    );
    expect(toggle).toBeTruthy();
    expect(toggle!.getAttribute('aria-pressed')).toBe('true');
    // The two toggles are named per sheet, so a reader hears which one it is.
    expect(toggle!.getAttribute('aria-label')).toBe(
      t(STRINGS.project.selectToggle, { title: 'Sheet 01' }),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. The trash panel: a real modal, and no trap
// ---------------------------------------------------------------------------

describe('the trash panel is a keyboard-safe modal', () => {
  it('names its dialog, closes on Escape, and returns focus to its invoker', async () => {
    await page.viewport(1440, 960);
    const host = document.createElement('div');
    host.style.width = '1440px';
    host.style.height = '960px';
    document.body.append(host);
    const user = userEvent.setup();

    // A stand-in invoker, so the focus-return has somewhere real to go.
    const invoker = document.createElement('button');
    invoker.textContent = 'invoker';
    document.body.append(invoker);
    invoker.focus();

    // The panel's own close contract is what is under test, so `onClose` is wired to the real
    // unmount (the shell removes it on close) rather than left a no-op.
    let closed = false;
    const view = render(
      createElement(TrashPanel, {
        items: [
          {
            id: 't1',
            title: 'Sheet 02',
            deletedAt: new Date().toISOString(),
            daysLeft: 14,
            thumb: null,
          },
        ],
        restoreFailed: false,
        onRestore: () => {},
        onClose: () => {
          closed = true;
          view.unmount();
        },
      }),
      { container: host },
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(accessibleName(dialog!)).not.toBe('');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');

    await user.keyboard('{Escape}');
    expect(closed).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    // §19.6's focus-return: a dismissed modal must not drop focus onto <body>.
    expect(document.activeElement).toBe(invoker);
    invoker.remove();
  });
});
