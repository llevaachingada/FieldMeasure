/**
 * `tests/imageInsetPickerSheet.test.tsx` — slice 1.7 (lane B2) machine gates for the
 * image-inset picker sheet (UI spec §9 insert flow; implementation plan §1.7 step 1).
 *
 * The point of these tests: the sheet is props-driven, so every assertion drives the REAL
 * component through the REAL DOM — a tap on the real control, a real `Escape`, a real `Tab` —
 * and checks the callback it fired or where focus went. The copy assertions pin the rendered
 * labels to the approved appendix wording BYTE-EXACT (`'Take a photo'` etc.), which is the
 * copy contract at the UI layer; the literals are kept here (not imported from
 * `src/ui/insetCopy.ts`) so this file survives folding the staging module into `strings.ts`.
 *
 * What is proved:
 *   - all three sections render (Take a photo / Choose from device / Recent photos);
 *   - each source fires its OWN callback, and only that one;
 *   - a thumbnail fires `onPickRecent(assetId)` — the ID, never the array index;
 *   - the grid is capped at the last 8 (`RECENTS_MAX`) and 4 columns wide
 *     (`RECENTS_COLUMNS` — the 4×2 shape);
 *   - an empty list renders the honest empty state, with no phantom tiles;
 *   - `Esc` and the ✕ both call `onCancel`;
 *   - focus enters the sheet on open and RETURNS to the trigger on close (§19.6);
 *   - `Tab` / `Shift+Tab` are trapped and wrap both ways; `Tab` from the dialog root moves
 *     INTO the sheet (focus cannot escape on open);
 *   - every control carries an accessible name;
 *   - there is no inline `style=""` anywhere (the CSP-as-a-test gate).
 *
 * NOT tested here, and why: pixel sizes (64 px rows, 96 px thumbnails, the 48 px floor), the
 * 4-column grid tracks and the 180 ms slide are CSS — jsdom has no layout, so a number read
 * out of it would prove nothing (D40). The sheet contains no `Konva.Stage`, so jsdom is the
 * honest environment. Those CSS declarations are the slice's `[Surface]` walk.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type JSX } from 'react';

import ImageInsetPickerSheet, {
  RECENTS_COLUMNS,
  RECENTS_MAX,
  type ImageInsetPickerSheetProps,
} from '../src/ui/ImageInsetPickerSheet';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Pinned copy — the rendered labels, byte-exact (see the header note on folding).
// ---------------------------------------------------------------------------

const LABEL = {
  title: 'Image inset',                 // STRINGS.tool.imageInset (appendix-strings-gaps.md §11)
  cancel: 'Cancel',                     // editor.cancel (APPROVED inventory)
  camera: 'Take a photo',               // inset.takePhoto (APPROVED, appendix-strings.md:181)
  device: 'Choose from device',         // inset.chooseFromDevice (APPROVED, :182)
  recents: 'Recent photos',             // inset.recentPhotos (APPROVED, :183)
  recentsEmpty: 'No recent photos yet', // inset.recentsEmpty (⚠ PROPOSED (C14), in neither appendix)
} as const;

// ---------------------------------------------------------------------------
// Fixture + harness
// ---------------------------------------------------------------------------

type Recent = { assetId: string; thumbUrl: string; name: string };

/** Distinct ids AND names so an index-vs-id bug cannot hide behind a coincidence. */
function fixtureRecents(count = 3): Recent[] {
  return Array.from({ length: count }, (_, i) => ({
    assetId: `sha-${i + 1}`,
    thumbUrl: `blob:thumb-${i + 1}`,
    name: `IMG_000${i + 1}.jpg`,
  }));
}

function mount(overrides: Partial<ImageInsetPickerSheetProps> = {}) {
  const props: ImageInsetPickerSheetProps = {
    recents: fixtureRecents(),
    onPickCamera: vi.fn(),
    onPickDevice: vi.fn(),
    onPickRecent: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<ImageInsetPickerSheet {...props} />);
  return props;
}

const dialog = (): HTMLElement => screen.getByRole('dialog');
const thumbEls = (): NodeListOf<HTMLElement> =>
  document.querySelectorAll<HTMLElement>('[data-inset-picker-recent]');

/** A real key press targets whatever has focus (that is what the browser does). */
function press(key: string, shiftKey = false): void {
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  act(() => {
    fireEvent.keyDown(target, { key, shiftKey });
  });
}

// ---------------------------------------------------------------------------
// Three sections (UI §9 insert flow)
// ---------------------------------------------------------------------------

describe('the three sections', () => {
  it('renders Take a photo, Choose from device and Recent photos verbatim', () => {
    mount();

    expect(screen.getByRole('button', { name: LABEL.camera })).toBeTruthy();
    expect(screen.getByRole('button', { name: LABEL.device })).toBeTruthy();
    expect(screen.getByRole('heading', { name: LABEL.recents })).toBeTruthy();
    // The recents grid lives inside a group labelled by that heading.
    expect(document.querySelector('[aria-labelledby]')).toBeTruthy();
  });

  it('is a labelled, modal dialog with a named ✕', () => {
    mount();
    const el = dialog();
    expect(el.getAttribute('aria-label')).toBe(LABEL.title);
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('button', { name: LABEL.cancel })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Each source reports to its OWN callback
// ---------------------------------------------------------------------------

describe('picks report to the right callback', () => {
  it('Take a photo → onPickCamera only', async () => {
    const user = userEvent.setup();
    const props = mount();

    await user.click(screen.getByRole('button', { name: LABEL.camera }));

    expect(props.onPickCamera).toHaveBeenCalledTimes(1);
    expect(props.onPickDevice).not.toHaveBeenCalled();
    expect(props.onPickRecent).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('Choose from device → onPickDevice only', async () => {
    const user = userEvent.setup();
    const props = mount();

    await user.click(screen.getByRole('button', { name: LABEL.device }));

    expect(props.onPickDevice).toHaveBeenCalledTimes(1);
    expect(props.onPickCamera).not.toHaveBeenCalled();
    expect(props.onPickRecent).not.toHaveBeenCalled();
  });

  it('a recent thumbnail → onPickRecent(assetId) — the id, never the index', async () => {
    const user = userEvent.setup();
    const props = mount();

    // The third tile: index 2, assetId 'sha-3'.
    await user.click(screen.getByRole('button', { name: 'IMG_0003.jpg' }));

    expect(props.onPickRecent).toHaveBeenCalledTimes(1);
    expect(props.onPickRecent).toHaveBeenCalledWith('sha-3');
    expect(props.onPickRecent).not.toHaveBeenCalledWith(2);
    expect(props.onPickCamera).not.toHaveBeenCalled();
    expect(props.onPickDevice).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Recent photos grid
// ---------------------------------------------------------------------------

describe('Recent photos grid', () => {
  it('is a 4-column grid capped at the last 8', () => {
    expect(RECENTS_COLUMNS).toBe(4);
    expect(RECENTS_MAX).toBe(8);

    mount({ recents: fixtureRecents(10) });
    const thumbs = thumbEls();
    expect(thumbs).toHaveLength(RECENTS_MAX);
    // Most-recent-first: the head of the list is kept, so the 9th/10th fall off.
    expect(thumbs[0].getAttribute('data-inset-picker-recent')).toBe('sha-1');
    expect(thumbs[7].getAttribute('data-inset-picker-recent')).toBe('sha-8');
    expect(document.querySelector('[data-inset-picker-recent="sha-9"]')).toBeNull();
  });

  it('shows fewer than 8 when fewer exist, without padding', () => {
    mount({ recents: fixtureRecents(3) });
    expect(thumbEls()).toHaveLength(3);
  });

  it('an empty list renders the honest empty state, not phantom tiles', () => {
    mount({ recents: [] });

    expect(screen.getByText(LABEL.recentsEmpty)).toBeTruthy();
    expect(thumbEls()).toHaveLength(0);
    // The section stays present so the sheet still reads as three sections.
    expect(screen.getByRole('heading', { name: LABEL.recents })).toBeTruthy();
    // Only the ✕ and the two source rows remain as controls.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('a thumbnail with no name still carries an accessible name', () => {
    mount({ recents: [{ assetId: 'sha-x', thumbUrl: 'blob:thumb-x', name: '' }] });
    expect(screen.getByRole('button', { name: LABEL.recents })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('Esc calls onCancel', async () => {
    const user = userEvent.setup();
    const props = mount();

    await user.keyboard('{Escape}');

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('the ✕ calls onCancel', async () => {
    const user = userEvent.setup();
    const props = mount();

    await user.click(screen.getByRole('button', { name: LABEL.cancel }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onPickCamera).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// a11y (§19.6)
// ---------------------------------------------------------------------------

describe('accessibility floor', () => {
  it('focus enters the sheet on open and returns to the trigger on close', async () => {
    const user = userEvent.setup();
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            image inset
          </button>
          {open ? (
            <ImageInsetPickerSheet
              recents={fixtureRecents()}
              onPickCamera={() => {}}
              onPickDevice={() => {}}
              onPickRecent={() => {}}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </div>
      );
    }
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();

    const trigger = screen.getByTestId('trigger');
    await user.click(trigger); // the mount must capture the focused trigger

    const sheet = dialog();
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(sheet);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab inside the sheet, wrapping both ways', () => {
    mount();
    const sheet = dialog();
    const focusables = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    act(() => {
      last.focus();
    });
    press('Tab');
    expect(document.activeElement).toBe(first);

    act(() => {
      first.focus();
    });
    press('Tab', true); // Shift+Tab
    expect(document.activeElement).toBe(last);
  });

  it('Tab from the dialog root moves INTO the sheet (focus cannot escape on open)', () => {
    mount();
    const sheet = dialog();
    expect(document.activeElement).toBe(sheet);

    press('Tab');

    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(sheet);
    expect(document.activeElement).toBe(sheet.querySelector('button'));
  });

  it('every control carries an accessible name', () => {
    mount({ recents: fixtureRecents(2) });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const name = b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '';
      expect(name, `unlabelled control: ${b.outerHTML}`).not.toBe('');
    }
  });

  it('renders no inline style attributes (CSP-as-a-test)', () => {
    const { container } = render(
      <ImageInsetPickerSheet
        recents={fixtureRecents()}
        onPickCamera={() => {}}
        onPickDevice={() => {}}
        onPickRecent={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.querySelectorAll('[style]').length).toBe(0);
    expect(document.querySelectorAll('[style]').length).toBe(0);
  });
});
