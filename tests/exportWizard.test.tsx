/**
 * `tests/exportWizard.test.tsx` — slice 1.9 (lane C) machine gates for the export wizard
 * (UI spec §12; build spec §11.10; implementation plan §1.9 step 5; a11y §19.6).
 *
 * D147 (owner request, session 28): the wizard is now ONE PAGE — Scope, Format and
 * Destination render together as three stacked sections instead of three navigable
 * views behind a step rail. The tests below were rewritten for that shape: every test
 * that used to click `export-wizard-primary` to advance between Scope/Format/Destination
 * now finds all three sections already mounted. Tests renamed or restructured for the
 * behaviour change (decision D147) are marked inline.
 *
 * The point of these tests: the wizard is entirely props-driven — every unit of real work
 * (the folder picker, the estimate, the §19.4b memory budget, the run, the per-file retry)
 * is an injected spy. So each assertion drives the REAL component through the REAL DOM and
 * then checks the CALL it made, not the pixels it drew. The load-bearing ones are the two
 * that a "looks right" review cannot catch:
 *   - the §19.4b refusal asserts `runExport` was **never called**, not merely that a
 *     message appeared (a warning that still exports is the bug the gate exists for);
 *   - the happy path asserts the WHOLE `ExportPlan` object with `toEqual`, so a dropped or
 *     stale field fails instead of passing on the fields that happen to be checked.
 *
 * Copy is pinned BYTE-EXACT — mostly as literals, with the new `Skip` row read from
 * `src/ui/strings.ts` (it is a `⚠ PROPOSED` row the appendix does not key, review F4).
 * Every literal below carries its appendix line.
 *
 * NOT tested here, and why: the 48 px targets, the 16 px hit slop, the 880 × 700 box and
 * the 60 % scrim are CSS, and jsdom has no layout — a number read out of it would prove
 * nothing (D40). Those are the slice's `[Surface]` walk. The wizard contains no
 * `Konva.Stage`, so jsdom is the honest environment for everything else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';

import {
  ExportWizard,
  formatBytes,
  type ExportPlan,
  type ExportResult,
  type ExportSheetRef,
  type ExportWizardProps,
} from '../src/ui/ExportWizard';
import { STRINGS } from '../src/ui/strings';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Pinned copy — the rendered wording, byte-exact (see the header note on folding)
// ---------------------------------------------------------------------------

const COPY = {
  button: 'Export', //                                        appendix-strings.md:220
  scopeThisSheet: 'This sheet', //                            appendix-strings.md:221
  scopeSelected3: 'Selected sheets (3)', //                   appendix-strings.md:222 ({count})
  scopeAll3: 'All sheets (3)', //                             appendix-strings.md:223 ({count})
  quality3xWarning: 'Slow on this device — expect a wait', // appendix-strings.md:225
  includeSheetNames: 'Include sheet names in pages', //       appendix-strings.md:228
  zipSingle: 'Zip into a single .zip', //                     appendix-strings.md:230
  chooseFolder: 'Choose folder…', //                          appendix-strings.md:234
  rememberDestination: 'Remember this destination for this project', // :235
  selectAtLeastOne: 'Select at least one sheet', //           appendix-strings.md:244
  tooLargeFor3x: 'This sheet is too large to export at 3× on this device', // :246
  dropboxHint: "Drag this folder into Dropbox when you're back on Wi-Fi.", // :243
  fileOpenAnotherApp: 'File is open in another app', //       appendix-strings.md:356
  notEnoughDiskSpace: 'Not enough disk space', //             appendix-strings.md:358
  folderPermissionExpired: 'Folder permission expired', //    appendix-strings.md:354
  reAuthorize: 'Re-authorize', //                             appendix-strings.md:355
  retry: 'Retry', //                                          appendix-strings.md:353
  // CUT in v1 — these must NEVER appear (build spec §2.4; UI §12:727).
  cutFlatten: 'Flatten markup', //                            appendix-strings.md:226 (CUT)
  cutSummaryPage: 'dimensions summary page', //               appendix-strings.md:227 (CUT)
  cutOpenFolder: 'Open folder', //                            appendix-strings.md:241 (CUT)
} as const;

/** `Will write 3 files (18.4 MB) to:  <path>` — note the DOUBLE SPACE after `to:`
 *  (appendix-strings.md:237 says so explicitly). */
const writeSummary = (fileCount: number, size: string, path: string): string =>
  `Will write ${fileCount} files (${size}) to:  ${path}`;

/** `Exported 3 files (18.4 MB)` — appendix-strings.md:238. */
const resultSummary = (fileCount: number, size: string): string =>
  `Exported ${fileCount} files (${size})`;

/** `N sheets exported without their photo` — appendix-strings.md:245 ({sheetCount}). */
const damagedSummary = (sheetCount: number): string =>
  `${sheetCount} sheets exported without their photo`;

// ---------------------------------------------------------------------------
// Fixture + harness
// ---------------------------------------------------------------------------

const SHEETS: ExportSheetRef[] = [
  { id: 's1', title: 'North wall', imageWidthPx: 4096, imageHeightPx: 3072 },
  { id: 's2', title: 'East footing', imageWidthPx: 4096, imageHeightPx: 3072 },
  { id: 's3', title: 'Slab edge', imageWidthPx: 4096, imageHeightPx: 3072 },
];

const DESTINATION = { name: 'exports', path: 'C:\\Jobs\\Riverside\\exports\\2026-09-21_1412\\' };

/** 19_293_798 / 1024 / 1024 = 18.399… → `18.4 MB` (the appendix's own example size). */
const BYTES_18_4_MB = 19_293_798;

function baseProps(overrides: Partial<ExportWizardProps> = {}): ExportWizardProps {
  return {
    open: true,
    sheets: SHEETS,
    currentSheetId: 's2',
    selectedSheetIds: undefined,
    initialDestination: null,
    onClose: vi.fn(),
    chooseDestination: vi.fn().mockResolvedValue(DESTINATION),
    estimate: vi.fn().mockReturnValue({ fileCount: 3, bytes: BYTES_18_4_MB }),
    checkMultiplier: vi.fn().mockReturnValue({ ok: true }),
    runExport: vi.fn().mockResolvedValue(emptyResult()),
    retryFile: vi.fn(),
    revealFolder: vi.fn().mockResolvedValue(undefined),
    copyPath: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function emptyResult(over: Partial<ExportResult> = {}): ExportResult {
  return {
    files: [{ name: 'Riverside_01-North wall.png', bytes: BYTES_18_4_MB }],
    path: DESTINATION.path,
    totalBytes: BYTES_18_4_MB,
    sheetsWithoutPhoto: 0,
    ...over,
  };
}

/** Mounts the wizard the way a host does: a trigger opens it, `onClose` un-mounts it. */
function mountWizard(overrides: Partial<ExportWizardProps> = {}): ExportWizardProps {
  const spies = baseProps(overrides);
  function Host(): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" data-testid="open-wizard" onClick={() => setOpen(true)}>
          open
        </button>
        <ExportWizard
          {...spies}
          open={open}
          onClose={() => {
            spies.onClose();
            setOpen(false);
          }}
        />
      </div>
    );
  }
  render(<Host />);
  return spies;
}

function openWizard(overrides: Partial<ExportWizardProps> = {}): ExportWizardProps {
  const spies = mountWizard(overrides);
  const trigger = screen.getByTestId('open-wizard');
  // Focus the trigger first, the way a real tap/keypress does: the focus-RETURN contract
  // is only meaningful if something held focus before the dialog opened.
  trigger.focus();
  fireEvent.click(trigger);
  return spies;
}

/** Lets the injected promises settle without leaving React's act() boundary. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const click = (testId: string): void => {
  fireEvent.click(screen.getByTestId(testId));
};

/** D147: Scope, Format and Destination are all mounted at once — pick a folder to clear
 *  the `destination === null` gate and land on the exportable state. */
async function chooseFolder(): Promise<void> {
  click('export-wizard-choose-folder');
  await flush();
}

// ---------------------------------------------------------------------------
// The dialog contract (§19.6)
// ---------------------------------------------------------------------------

describe('ExportWizard — dialog contract', () => {
  it('renders nothing while closed', () => {
    mountWizard();
    expect(screen.queryByTestId('export-wizard')).toBeNull();
  });

  it('is a labelled modal dialog', () => {
    openWizard();
    const dialog = screen.getByTestId('export-wizard');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe(COPY.button);
  });

  it('moves focus INTO the dialog on open', () => {
    openWizard();
    const dialog = screen.getByTestId('export-wizard');
    expect(document.activeElement).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Esc closes and calls onClose (never a keyboard trap)', () => {
    const { onClose } = openWizard();
    expect(screen.getByTestId('export-wizard')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('export-wizard')).toBeNull();
  });

  it('returns focus to the invoker on close', () => {
    openWizard();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('open-wizard'));
  });

  it('cycles Tab inside the dialog', () => {
    openWizard();
    const dialog = screen.getByTestId('export-wizard');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    expect(focusables.length).toBeGreaterThan(3);

    // The dialog root holds focus on open; the first Tab must land INSIDE, not escape.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    // Shift+Tab from the first control wraps to the last, still inside.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  // D147: replaces the old "announces each step change" test — there is no step change
  // left to announce (one page, no rail). The live region still exists and still speaks
  // for the run and the result (renamed; behaviour change per D147).
  it('the one polite live region is silent on the page and speaks for the run and the result', async () => {
    openWizard();
    const live = screen.getByTestId('export-wizard-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');

    await chooseFolder();
    click('export-wizard-primary');
    await flush();
    expect(live.textContent).toBe(resultSummary(1, '18.4 MB'));
  });

  // D147: Scope, Format and Destination are all visible without any navigation.
  it('renders Scope, Format and Destination together, with no step rail', () => {
    openWizard();
    expect(screen.getByTestId('export-wizard-step-scope')).toBeTruthy();
    expect(screen.getByTestId('export-wizard-step-format')).toBeTruthy();
    expect(screen.getByTestId('export-wizard-step-destination')).toBeTruthy();
    expect(screen.queryByTestId('export-wizard-rail-scope')).toBeNull();
    expect(screen.queryByTestId('export-wizard-back')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

describe('ExportWizard — scope', () => {
  it('defaults to This sheet in the editor and to the grid selection when there is one', () => {
    openWizard();
    expect(screen.getByTestId('export-wizard-scope-sheet').getAttribute('aria-pressed')).toBe('true');
    cleanup();

    openWizard({ selectedSheetIds: ['s1', 's2', 's3'] });
    const selected = screen.getByTestId('export-wizard-scope-selected');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.textContent).toBe(COPY.scopeSelected3); // {count} interpolated
  });

  it('interpolates the all-sheets count', () => {
    openWizard();
    expect(screen.getByTestId('export-wizard-scope-all').textContent).toBe(COPY.scopeAll3);
    expect(screen.getByTestId('export-wizard-scope-sheet').textContent).toBe(COPY.scopeThisSheet);
  });

  it('empty scope shows the exact copy and disables the primary button', async () => {
    openWizard();
    await chooseFolder(); // clear the OTHER gate so this test isolates the scope one
    // Start non-empty, so this proves the DISABLING, not a component that never enables.
    expect(screen.getByTestId('export-wizard-primary').hasAttribute('disabled')).toBe(false);
    expect(screen.queryByTestId('export-wizard-empty-scope')).toBeNull();

    click('export-wizard-select-none');

    expect(screen.getByTestId('export-wizard-empty-scope').textContent).toBe(COPY.selectAtLeastOne);
    expect(screen.getByTestId('export-wizard-primary').hasAttribute('disabled')).toBe(true);
  });

  it('a project with no sheets at all is empty scope too', () => {
    openWizard({ sheets: [], currentSheetId: null });
    expect(screen.getByTestId('export-wizard-empty-scope').textContent).toBe(COPY.selectAtLeastOne);
    expect(screen.getByTestId('export-wizard-primary').hasAttribute('disabled')).toBe(true);
  });

  it('per-sheet checkboxes narrow the scope and keep the scope order', () => {
    const spies = openWizard();
    click('export-wizard-scope-all');
    const middle = screen.getByTestId('export-wizard-sheet-s2') as HTMLInputElement;
    expect(middle.checked).toBe(true);
    fireEvent.click(middle); // uncheck the middle one
    expect((screen.getByTestId('export-wizard-sheet-s2') as HTMLInputElement).checked).toBe(false);
    // Re-check it: the plan must read s1, s2, s3 — not s1, s3, s2.
    fireEvent.click(screen.getByTestId('export-wizard-sheet-s2'));
    const estimate = spies.estimate as unknown as { mock: { calls: [ExportPlan][] } };
    const last = estimate.mock.calls[estimate.mock.calls.length - 1][0];
    expect(last.sheetIds).toEqual(['s1', 's2', 's3']);
  });
});

// ---------------------------------------------------------------------------
// Format — the 2× default and the 3× warning
// ---------------------------------------------------------------------------

describe('ExportWizard — format', () => {
  it('defaults to 2×, and only 2×', () => {
    openWizard();
    expect(screen.getByTestId('export-wizard-multiplier-2').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('export-wizard-multiplier-1').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('export-wizard-multiplier-3').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the slow warning only at 3×', () => {
    openWizard();
    expect(screen.queryByTestId('export-wizard-3x-warning')).toBeNull();
    click('export-wizard-multiplier-3');
    expect(screen.getByTestId('export-wizard-3x-warning').textContent).toBe(COPY.quality3xWarning);
    click('export-wizard-multiplier-2');
    expect(screen.queryByTestId('export-wizard-3x-warning')).toBeNull();
  });

  it('offers the PDF option set by default and the PNG set on switch, with zip ON', () => {
    openWizard();
    expect(screen.getByTestId('export-wizard-include-sheet-names')).toBeTruthy();
    expect(screen.queryByTestId('export-wizard-zip')).toBeNull();

    click('export-wizard-format-png');
    const zip = screen.getByTestId('export-wizard-zip') as HTMLInputElement;
    expect(zip.checked).toBe(true); // `Zip into a single .zip` — default ON (UI §12:717)
    expect(screen.queryByTestId('export-wizard-include-sheet-names')).toBeNull();
  });

  it('«Include sheet names in pages» is disabled, never a dead live control (review F1)', () => {
    // v1 is flatten-only and nothing consumes `includeSheetNames`, so the spec's checkbox
    // is honestly disabled (the D102 beta-honesty rule) rather than looking live.
    openWizard();
    const checkbox = screen.getByTestId('export-wizard-include-sheet-names') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.getAttribute('aria-disabled')).toBe('true');
    // Copy is kept — the control is not hidden and not deleted.
    expect(checkbox.getAttribute('aria-label')).toBe(COPY.includeSheetNames);
  });

  it('never renders the v1-CUT checkboxes or the impossible Open folder action', () => {
    openWizard();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain(COPY.cutFlatten);
    expect(body).not.toContain(COPY.cutSummaryPage);
    expect(body).not.toContain(COPY.cutOpenFolder);
  });
});

// ---------------------------------------------------------------------------
// The §19.4b memory guard — a REFUSAL, not a warning
// ---------------------------------------------------------------------------

describe('ExportWizard — §19.4b multiplier refusal', () => {
  /** Refuses 3× (the 4096 × 4096 @ 3× = 604 MB row) and allows 1× / 2×. */
  const refuse3x = vi.fn((plan: ExportPlan) =>
    plan.multiplier === 3 ? { ok: false as const, largest: 2 as const } : { ok: true as const },
  );

  it('shows the device message and BLOCKS the run — runExport is never called', async () => {
    const { runExport, checkMultiplier } = openWizard({ checkMultiplier: refuse3x });
    expect(checkMultiplier).toHaveBeenCalled();

    click('export-wizard-multiplier-3');
    expect(screen.getByTestId('export-wizard-too-large').textContent).toContain(COPY.tooLargeFor3x);

    // The refusal bites on the footer's primary button…
    const primary = screen.getByTestId('export-wizard-primary');
    expect(primary.hasAttribute('disabled')).toBe(true);
    fireEvent.click(primary);

    await flush();
    // THE assertion: refused means not attempted. A message alone would not be enough.
    expect(runExport).not.toHaveBeenCalled();
  });

  it('offers the returned largest multiplier, which clears the refusal', () => {
    openWizard({ checkMultiplier: refuse3x });
    click('export-wizard-multiplier-3');

    const offer = screen.getByTestId('export-wizard-use-largest');
    expect(offer.textContent).toBe('2×'); // the `largest` the guard returned
    fireEvent.click(offer);

    expect(screen.queryByTestId('export-wizard-too-large')).toBeNull();
    expect(screen.getByTestId('export-wizard-multiplier-2').getAttribute('aria-pressed')).toBe('true');
  });

  it('a refused multiplier stays selectable so the refusal can explain itself', () => {
    openWizard({ checkMultiplier: refuse3x });
    const three = screen.getByTestId('export-wizard-multiplier-3');
    expect(three.hasAttribute('disabled')).toBe(false);
    expect(three.getAttribute('data-refused')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// The happy path — the exact ExportPlan
// ---------------------------------------------------------------------------

describe('ExportWizard — happy path', () => {
  async function runHappyPath(): Promise<ExportWizardProps> {
    const spies = openWizard();

    // Scope: all three sheets.
    click('export-wizard-scope-all');

    // Format: PNG at 3×, zip OFF (so a hard-coded default cannot pass this test).
    click('export-wizard-format-png');
    click('export-wizard-multiplier-3');
    fireEvent.click(screen.getByTestId('export-wizard-zip'));

    // Destination: pick a folder, remember it, overwrite on conflict.
    await chooseFolder();
    fireEvent.click(screen.getByTestId('export-wizard-remember'));
    click('export-wizard-conflict-overwrite');

    click('export-wizard-primary'); // Export
    await flush();
    return spies;
  }

  it('builds exactly this ExportPlan and hands it to runExport', async () => {
    const { runExport, chooseDestination } = await runHappyPath();
    expect(chooseDestination).toHaveBeenCalledTimes(1);
    expect(runExport).toHaveBeenCalledTimes(1);

    const expected: ExportPlan = {
      scope: 'all',
      sheetIds: ['s1', 's2', 's3'],
      format: 'png',
      multiplier: 3,
      zip: false,
      includeSheetNames: false, // PDF-only, normalised away on a PNG plan
      conflictPolicy: 'overwrite',
      rememberDestination: true,
    };
    const calls = (runExport as unknown as { mock: { calls: [ExportPlan, unknown][] } }).mock.calls;
    expect(calls[0][0]).toEqual(expected);
    expect(typeof calls[0][1]).toBe('function'); // the onProgress callback
  });

  it('shows the destination summary with the approved double space after `to:`', async () => {
    openWizard();
    await chooseFolder();
    expect(screen.getByTestId('export-wizard-write-summary').textContent).toBe(
      writeSummary(3, '18.4 MB', DESTINATION.path),
    );
  });

  it('cannot export before a destination is chosen', async () => {
    const { runExport } = openWizard();
    const primary = screen.getByTestId('export-wizard-primary');
    expect(primary.hasAttribute('disabled')).toBe(true);
    fireEvent.click(primary);
    await flush();
    expect(runExport).not.toHaveBeenCalled();
  });

  it('announces progress politely while the run is in flight', async () => {
    let report: ((p: { done: number; total: number; currentName: string }) => void) | null = null;
    const runExport = vi.fn(
      (_plan: ExportPlan, onProgress: (p: { done: number; total: number; currentName: string }) => void) => {
        report = onProgress;
        return new Promise<ExportResult>(() => {
          /* never settles: the wizard stays in the progress view */
        });
      },
    );
    openWizard({ runExport: runExport as unknown as ExportWizardProps['runExport'] });
    await chooseFolder();
    click('export-wizard-primary');
    await flush();

    expect(screen.getByTestId('export-wizard-step-running')).toBeTruthy();
    expect(screen.getByTestId('export-wizard-primary').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('export-wizard-primary').hasAttribute('disabled')).toBe(true);

    act(() => report?.({ done: 2, total: 3, currentName: 'East footing.pdf' }));
    expect(screen.getByTestId('export-wizard-progress').textContent).toBe('2 of 3');
    expect(screen.getByTestId('export-wizard-live').textContent).toBe('2 of 3');
  });
});

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------

/** Drives the wizard to the result view with the supplied `ExportResult`. */
async function toResult(result: ExportResult, overrides: Partial<ExportWizardProps> = {}) {
  const spies = openWizard({ runExport: vi.fn().mockResolvedValue(result), ...overrides });
  await chooseFolder();
  click('export-wizard-primary'); // Export
  await flush();
  return spies;
}

describe('ExportWizard — result view', () => {
  it('summarises the export and exposes the path as selectable TEXT, not an image', async () => {
    await toResult(emptyResult());
    expect(screen.getByTestId('export-wizard-result-summary').textContent).toBe(
      resultSummary(1, '18.4 MB'),
    );
    const path = screen.getByTestId('export-wizard-result-path');
    expect(path.textContent).toBe(DESTINATION.path);
    expect(path.tagName).toBe('CODE');
    expect(path.querySelector('img, svg')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('export-wizard-dropbox').textContent).toBe(COPY.dropboxHint);
  });

  it('wires Copy path and Reveal folder, and never offers Open folder', async () => {
    const { copyPath, revealFolder } = await toResult(emptyResult());
    click('export-wizard-copy-path');
    await flush();
    expect(copyPath).toHaveBeenCalledWith(DESTINATION.path);
    // The clipboard spy resolved, so no fallback field is needed (D147 item 3).
    expect(screen.queryByTestId('export-wizard-copy-fallback')).toBeNull();
    click('export-wizard-reveal-folder');
    expect(revealFolder).toHaveBeenCalledTimes(1);
    expect(document.body.textContent ?? '').not.toContain(COPY.cutOpenFolder);
  });

  // D147 item 3: new behaviour — a rejecting `copyPath` (clipboard unavailable or
  // refused) must never fail silently. It falls back to a selectable read-only field.
  it('falls back to a selectable read-only field when the clipboard copy fails (D147)', async () => {
    const copyPath = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    await toResult(emptyResult(), { copyPath });
    expect(screen.queryByTestId('export-wizard-copy-fallback')).toBeNull();
    click('export-wizard-copy-path');
    await flush();
    const field = screen.getByTestId('export-wizard-copy-fallback-field') as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe(DESTINATION.path);
  });

  // D147 item 3: each successfully-written row offers an `Open` button that opens the
  // file in a new tab via the injected `openFile` prop.
  it('offers Open on a written file and calls openFile with its name (D147)', async () => {
    const { openFile } = await toResult(emptyResult());
    const button = screen.getByTestId('export-wizard-open-Riverside_01-North wall.png');
    fireEvent.click(button);
    await flush();
    expect(openFile).toHaveBeenCalledWith('Riverside_01-North wall.png');
  });

  it('omits Open entirely when no openFile prop is supplied', async () => {
    await toResult(emptyResult(), { openFile: undefined });
    expect(screen.queryByTestId('export-wizard-open-Riverside_01-North wall.png')).toBeNull();
  });

  it('Export again returns to the page with the wizard reusable', async () => {
    await toResult(emptyResult());
    click('export-wizard-export-again');
    expect(screen.getByTestId('export-wizard-step-scope')).toBeTruthy();
    expect(screen.queryByTestId('export-wizard-step-result')).toBeNull();
  });

  it('counts the damaged-photo sheets with the count interpolated', async () => {
    await toResult(emptyResult({ sheetsWithoutPhoto: 2 }));
    expect(screen.getByTestId('export-wizard-damaged-photos').textContent).toBe(damagedSummary(2));
  });

  it('stays silent about damaged photos when there are none', async () => {
    await toResult(emptyResult({ sheetsWithoutPhoto: 0 }));
    expect(screen.queryByTestId('export-wizard-damaged-photos')).toBeNull();
  });

  it('states the split when the 250 MB PDF budget forced parts', async () => {
    await toResult(emptyResult({ parts: 3 }));
    expect(screen.getByTestId('export-wizard-parts').textContent).toContain('3');
    cleanup();
    await toResult(emptyResult({ parts: 1 }));
    expect(screen.queryByTestId('export-wizard-parts')).toBeNull();
  });

  it('reports a «Skip» conflict as a row and excludes it from the written-file count (review F4)', async () => {
    await toResult(
      emptyResult({
        files: [{ name: 'Riverside.zip', bytes: 0, skipped: true }],
        totalBytes: 0,
      }),
    );
    // The skip is visible…
    const row = screen.getByTestId('export-wizard-file-Riverside.zip');
    expect(row.getAttribute('data-skipped')).toBe('true');
    expect(row.getAttribute('data-failed')).toBe('false');
    expect(screen.getByTestId('export-wizard-file-skipped-Riverside.zip').textContent).toBe(
      STRINGS.export.skipped,
    );
    // …not offered a Retry (it is not a failure)…
    expect(screen.queryByTestId('export-wizard-retry-Riverside.zip')).toBeNull();
    // …not offered Open (nothing was written to open)…
    expect(screen.queryByTestId('export-wizard-open-Riverside.zip')).toBeNull();
    // …and it does not inflate «Exported {n} files» — zero files were actually written.
    expect(screen.getByTestId('export-wizard-result-summary').textContent).toBe(
      resultSummary(0, '0 B'),
    );
  });
});

// ---------------------------------------------------------------------------
// Per-file errors + retry
// ---------------------------------------------------------------------------

describe('ExportWizard — per-file errors', () => {
  const FAILED = emptyResult({
    files: [
      { name: 'a.png', bytes: 1024 },
      { name: 'b.png', bytes: 0, error: { kind: 'locked' } },
      { name: 'c.png', bytes: 0, error: { kind: 'permission' } },
      { name: 'd.png', bytes: 0, error: { kind: 'disk-full', shortfallBytes: 5 * 1024 * 1024 } },
    ],
  });

  it('names each cause in approved wording', async () => {
    await toResult(FAILED);
    expect(screen.getByTestId('export-wizard-file-cause-b.png').textContent).toBe(
      COPY.fileOpenAnotherApp,
    );
    expect(screen.getByTestId('export-wizard-file-cause-c.png').textContent).toBe(
      COPY.folderPermissionExpired,
    );
    expect(screen.getByTestId('export-wizard-file-cause-d.png').textContent).toBe(
      COPY.notEnoughDiskSpace,
    );
    // The disk-full row shows the exact shortfall: 5 × 1024 × 1024 B = `5.0 MB`.
    expect(screen.getByTestId('export-wizard-file-shortfall-d.png').textContent).toContain('5.0 MB');
    // A permission failure offers Re-authorize; the others offer Retry (UI §12:728).
    expect(screen.getByTestId('export-wizard-retry-c.png').textContent).toBe(COPY.reAuthorize);
    expect(screen.getByTestId('export-wizard-retry-b.png').textContent).toBe(COPY.retry);
    // A failed row has nothing written to open.
    expect(screen.queryByTestId('export-wizard-open-b.png')).toBeNull();
  });

  it('Retry calls retryFile with THAT file name and updates only that row', async () => {
    const retryFile = vi.fn().mockResolvedValue({ name: 'b.png', bytes: 2048 });
    await toResult(FAILED, { retryFile });

    click('export-wizard-retry-b.png');
    expect(retryFile).toHaveBeenCalledTimes(1);
    expect(retryFile).toHaveBeenCalledWith('b.png');
    await flush();

    // b.png recovered…
    expect(screen.queryByTestId('export-wizard-file-cause-b.png')).toBeNull();
    expect(screen.getByTestId('export-wizard-file-b.png').getAttribute('data-failed')).toBe('false');
    expect(screen.getByTestId('export-wizard-file-b.png').textContent).toContain('2.0 KB');
    // …and NOTHING else moved: c and d are still failed, a is still fine.
    expect(screen.getByTestId('export-wizard-file-cause-c.png').textContent).toBe(
      COPY.folderPermissionExpired,
    );
    expect(screen.getByTestId('export-wizard-file-cause-d.png').textContent).toBe(
      COPY.notEnoughDiskSpace,
    );
    expect(screen.getByTestId('export-wizard-file-a.png').getAttribute('data-failed')).toBe('false');
  });

  it('a retry that fails again leaves the row failed, with its new cause', async () => {
    const retryFile = vi
      .fn()
      .mockResolvedValue({ name: 'b.png', bytes: 0, error: { kind: 'permission' as const } });
    await toResult(FAILED, { retryFile });
    click('export-wizard-retry-b.png');
    await flush();
    expect(screen.getByTestId('export-wizard-file-b.png').getAttribute('data-failed')).toBe('true');
    expect(screen.getByTestId('export-wizard-file-cause-b.png').textContent).toBe(
      COPY.folderPermissionExpired,
    );
  });
});

// ---------------------------------------------------------------------------
// CSP + accessible names
// ---------------------------------------------------------------------------

describe('ExportWizard — CSP and accessible names', () => {
  it('carries no inline style attribute anywhere (CSP-as-a-test)', async () => {
    openWizard();
    const dialog = screen.getByTestId('export-wizard');
    expect(dialog.querySelectorAll('[style]').length).toBe(0);
    cleanup();

    await toResult(
      emptyResult({
        files: [{ name: 'b.png', bytes: 0, error: { kind: 'disk-full', shortfallBytes: 1024 } }],
        sheetsWithoutPhoto: 1,
        parts: 2,
      }),
    );
    expect(screen.getByTestId('export-wizard').querySelectorAll('[style]').length).toBe(0);
    expect(document.querySelectorAll('[style]').length).toBe(0);
  });

  // D147: every control on the ONE page must be named — there is no longer a per-step
  // loop, since there is no longer more than one reachable step before the run.
  it('names every control on the page', () => {
    openWizard();
    const dialog = screen.getByTestId('export-wizard');
    const controls = dialog.querySelectorAll<HTMLElement>('button, input, [role="group"]');
    expect(controls.length).toBeGreaterThan(3);
    for (const control of Array.from(controls)) {
      const named =
        control.getAttribute('aria-label') !== null || (control.textContent ?? '').trim() !== '';
      expect(named, `${control.tagName}.${control.className} has no accessible name`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// formatBytes — the `18.4 MB` shape the approved copy shows
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('matches the appendix example and the unit boundaries', () => {
    expect(formatBytes(BYTES_18_4_MB)).toBe('18.4 MB'); // 19_293_798 / 1048576 = 18.399…
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});
