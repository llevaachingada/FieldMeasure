/**
 * `tests/gridReorder.browser.test.ts` — the sheets grid's long-press drag-reorder, driven
 * through REAL layout and REAL `PointerEvent`s (UI §11.2:719; D115).
 *
 * WHY THIS FILE EXISTS. The reorder is the one thing this wave ships that jsdom
 * structurally cannot prove (D40): jsdom has no layout engine (every
 * `getBoundingClientRect()` is 320 × 0-ish and identical), no `PointerEvent`,
 * no `element.animate`, and its `fireEvent.pointer*` silently drops `clientX`/`clientY`.
 * The jsdom suite therefore drives *stubbed* rectangles — it proves the state machine, not
 * the geometry. The two claims only a real browser can settle are:
 *   1. the DROP TARGET is resolved from the real card rectangles against the real pointer
 *      coordinates (D77/F1: Chromium implicitly captures the pointer to the pressed card,
 *      so `pointerover` never fires on the others — the drop must be geometric); and
 *   2. the «Drop to move» chip's positioning path runs at all — `element.animate()` is the
 *      CSP-safe way to move it (no `[style]` attribute), and it does not exist in jsdom.
 *
 * The assertions are layout-agnostic on purpose: the column count is CSS (1/2/3/4 across at
 * 0/960/1200/1440 px), so the test reads the REAL rects and computes what it expects from
 * them rather than hard-coding a grid shape. What it refuses to accept is a vacuous pass —
 * if the cards have no real layout, the first test fails instead of silently proving nothing.
 *
 * Browser project only (`*.browser.test.ts` → real Chromium via `@vitest/browser-playwright`).
 * No storage is touched: `projectId` is deliberately absent, so the storage chip (the one
 * child that would read the disk) never mounts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import ProjectScreen from '../src/ui/ProjectScreen';
import type { ProjectSheetCard } from '../src/fs/projectSheets';
import { STRINGS } from '../src/ui/strings';

/** The component's 400 ms lift. */
const LONG_PRESS_MS = 400;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for a real condition instead of a fixed sleep. The old helpers slept 460 ms for the lift,
 * 20 ms for «React to commit», 40 ms for «the persist callback»: all of which are budgets that
 * only hold on an idle machine. Under load the lift state, the document-level move/up listeners
 * (attached in a passive effect AFTER the lift commits) or the renumber could land late, and a
 * pointer event dispatched in the gap was silently lost.
 */
const until = (check: () => void): Promise<void> =>
  vi.waitFor(check, { timeout: 5000, interval: 10 }) as Promise<void>;
/** Drain React's pending (incl. passive) effects. */
const flush = (): Promise<void> => act(async () => {});
const chipEl = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="sheet-reorder-chip"]');

/**
 * Press and wait until the card is REALLY lifted: the chip is mounted (it only renders in the
 * dragging phase) and the effects that attach the drag's document listeners have run. The
 * 400 ms timer is the app's own; we wait for its outcome rather than racing it.
 */
async function pressAndLift(m: Mounted, id: string): Promise<{ x: number; y: number }> {
  const from = m.centre(id);
  pev('pointerdown', m.item(id), from.x, from.y);
  await until(() => expect(chipEl()).not.toBeNull());
  await flush();
  return from;
}

/** A real `PointerEvent` at viewport coordinates — jsdom cannot do this (D40). */
function pev(
  type: string,
  target: EventTarget,
  x: number,
  y: number,
  opts: { pointerId?: number; pointerType?: string } = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: opts.pointerId ?? 1,
      pointerType: opts.pointerType ?? 'touch',
      isPrimary: (opts.pointerId ?? 1) === 1,
      buttons: 1,
      clientX: x,
      clientY: y,
    }),
  );
}

function card(id: string, title: string, index: number): ProjectSheetCard {
  return { id, title, index, updatedAtLabel: '2:14 PM', dimensionCount: 3, insetCount: 0, thumb: null };
}

interface Mounted {
  onOpenSheet: ReturnType<typeof vi.fn>;
  onReorderSheets: ReturnType<typeof vi.fn>;
  /** The 1-based rendered order, read from the DOM (the «04» badges). */
  order(): string[];
  /** A card element by sheet id. */
  item(id: string): HTMLElement;
  /** A card's real centre in viewport coordinates. */
  centre(id: string): { x: number; y: number };
}

function mount(sheetIds: readonly string[]): Mounted {
  const sheets = sheetIds.map((id, i) => card(id, `Sheet ${String(i + 1).padStart(2, '0')}`, i + 1));
  const onOpenSheet = vi.fn();
  const onReorderSheets = vi.fn(async (_ids: readonly string[]) => undefined);
  render(
    createElement(ProjectScreen, {
      projectTitle: 'Riverside',
      sheetCount: sheets.length,
      state: 'ready' as const,
      sheets,
      selectedIds: [],
      onToggleSelected: vi.fn(),
      onClearSelection: vi.fn(),
      onOpenSheet,
      onTakePhoto: vi.fn(),
      onImport: vi.fn(),
      onExport: vi.fn(),
      onBack: vi.fn(),
      onReorderSheets,
    }),
  );
  const item = (id: string): HTMLElement => {
    const el = document.querySelector<HTMLElement>(`.sheet-grid-item[data-sheet-id="${id}"]`);
    if (!el) throw new Error(`no card element for ${id}`);
    return el;
  };
  return {
    onOpenSheet,
    onReorderSheets,
    // The badge renumbers as the order changes, so reading it back is reading the render.
    order: () =>
      Array.from(document.querySelectorAll<HTMLElement>('.sheet-grid-item[data-sheet-id]')).map(
        (el) => el.getAttribute('data-sheet-id') ?? '',
      ),
    item,
    centre: (id: string) => {
      const rect = item(id).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
  };
}

/** Press, hold past the lift, drag onto `ontoId`'s real centre, release. */
async function dragOnto(m: Mounted, fromId: string, ontoId: string): Promise<void> {
  const startOrder = m.order();
  await pressAndLift(m, fromId);
  const onto = m.centre(ontoId);
  // `pointermove` targets the pressed card on purpose: real touch is implicitly captured
  // to it (D77/F1), so this is the input the app actually receives.
  pev('pointermove', m.item(fromId), onto.x, onto.y);
  // The live renumber: the dragged card now sits where the target was.
  await until(() => expect(m.order().indexOf(fromId)).toBe(startOrder.indexOf(ontoId)));
  pev('pointerup', document.body, onto.x, onto.y);
  // The drop ends the drag (chip gone) and hands the order to the shell.
  await until(() => expect(chipEl()).toBeNull());
  await until(() => expect(m.onReorderSheets).toHaveBeenCalledTimes(1));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('grid reorder — real geometry, real pointer events', () => {
  it('lays the cards out for real (the premise of every assertion below)', () => {
    const m = mount(['s1', 's2', 's3', 's4']);
    const rects = ['s1', 's2', 's3', 's4'].map((id) => m.item(id).getBoundingClientRect());
    for (const rect of rects) {
      // A real box, not jsdom's degenerate zero-height one (D40).
      expect(rect.width).toBeGreaterThan(100);
      expect(rect.height).toBeGreaterThan(100);
    }
    // Distinct positions: the grid actually placed them apart. Axis-agnostic on purpose — the
    // column count is CSS (1/2/3/4 across at 0/960/1200/1440 px), and a narrow browser-project
    // viewport legitimately stacks the cards. The point is that these are LAYOUT positions,
    // not jsdom's shared zeros (D40).
    const positions = new Set(rects.map((r) => `${Math.round(r.left)},${Math.round(r.top)}`));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('a long-press drag onto a later card persists that order, and the drag never opens the sheet', async () => {
    const m = mount(['s1', 's2', 's3', 's4']);

    // Capture the rects BEFORE the drag: the live renumber reflows nothing (the DOM order
    // is the order), but the assertion below is about what the shell was handed.
    await dragOnto(m, 's1', 's3');

    expect(m.onReorderSheets).toHaveBeenCalledTimes(1);
    const passed = m.onReorderSheets.mock.calls[0][0] as readonly string[];
    expect(passed).toEqual(['s2', 's3', 's1', 's4']);
    // The rendered order followed, and it is a permutation (nothing was lost or duplicated).
    expect(m.order()).toEqual(['s2', 's3', 's1', 's4']);
    expect([...passed].sort()).toEqual(['s1', 's2', 's3', 's4']);

    // The click Chromium sends after the release must not open the dragged sheet…
    m.item('s1').querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(m.onOpenSheet).not.toHaveBeenCalled();
    // …and the NEXT tap is an ordinary open again (the suppression is one-shot).
    m.item('s1').querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(m.onOpenSheet).toHaveBeenCalledWith('s1');
  });

  it('shows the «Drop to move» chip while dragging, and moves it with element.animate', async () => {
    const m = mount(['s1', 's2', 's3', 's4']);

    expect(document.querySelector('[data-testid="sheet-reorder-chip"]')).toBeNull();

    await pressAndLift(m, 's1');

    const chip = chipEl();
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe(STRINGS.project.reorderChip);
    // The chip is announced, and the CSP-as-a-test rule holds: Web Animations positions it
    // WITHOUT an inline `style` attribute (`npm run build`'s e2e asserts `[style]` === 0).
    expect(chip?.getAttribute('role')).toBe('status');
    expect(chip?.hasAttribute('style')).toBe(false);

    // Moving the pointer must not throw (the `animate()` path is real here) and must not
    // introduce an inline style either.
    const onto = m.centre('s3');
    pev('pointermove', m.item('s1'), onto.x, onto.y);
    await flush();
    expect(document.querySelector('[data-testid="sheet-reorder-chip"]')?.hasAttribute('style')).toBe(
      false,
    );

    // …and at the LAST column of the grid the chip must still be fully on screen: unclamped
    // it ran 35–75 px past the right edge and clipped its own label (finding 11 of the
    // session-22 UI review). The follow animation is 100 ms: await the animation itself (its own
    // `finished` promise) rather than guessing how long a frame takes.
    pev('pointermove', m.item('s1'), m.centre('s4').x, m.centre('s4').y);
    const landed = chipEl();
    const running = landed?.getAnimations() ?? [];
    expect(running.length).toBeGreaterThan(0); // the follow animation really exists
    await Promise.allSettled(running.map((a) => a.finished));
    const box = landed?.getBoundingClientRect();
    expect(box).toBeTruthy();
    expect(box!.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box!.left).toBeGreaterThanOrEqual(0);
    expect(box!.top).toBeGreaterThanOrEqual(0);

    pev('pointerup', document.body, onto.x, onto.y);
    await until(() => expect(chipEl()).toBeNull());
  });

  it('a short tap opens the sheet and never reorders', async () => {
    const m = mount(['s1', 's2', 's3']);
    const at = m.centre('s2');

    // Release as soon as React has armed the press (its document `pointerup` listener is attached
    // in an effect, which a real tap always gives time to run between the two events). Draining
    // effects with `act` takes microseconds, not a wall-clock budget, so nothing can stretch the
    // hold past the 400 ms lift the way the old `sleep(120)` could on a stalled machine.
    pev('pointerdown', m.item('s2'), at.x, at.y);
    await flush();
    pev('pointerup', m.item('s2'), at.x, at.y);
    m.item('s2').querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Let the lift timer's full length pass: it must have been cancelled by the release.
    const released = performance.now();
    while (performance.now() - released < LONG_PRESS_MS + 100) await sleep(20);
    expect(chipEl()).toBeNull();

    expect(m.onReorderSheets).not.toHaveBeenCalled();
    expect(m.onOpenSheet).toHaveBeenCalledWith('s2');
  });

  it('an Escape-cancelled lift restores the order and leaves the grid clickable', async () => {
    const m = mount(['s1', 's2', 's3']);

    await pressAndLift(m, 's1');
    const onto = m.centre('s3');
    pev('pointermove', m.item('s1'), onto.x, onto.y);
    await until(() => expect(m.order()).toEqual(['s2', 's3', 's1'])); // the live renumber

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => expect(m.order()).toEqual(['s1', 's2', 's3'])); // back to the pre-drag order
    await until(() => expect(chipEl()).toBeNull());

    expect(m.onReorderSheets).not.toHaveBeenCalled();
    // The cancelled gesture released its one-shot click suppression (the fix pinned in the
    // jsdom suite too): the next tap on a card still opens it.
    m.item('s1').querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(m.onOpenSheet).toHaveBeenCalledWith('s1');
  });
});
