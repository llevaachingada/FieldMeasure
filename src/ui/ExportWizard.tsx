/**
 * `src/ui/ExportWizard.tsx` — slice 1.9 (lane C) the export wizard.
 * Build spec §11.10; UI spec §12; implementation plan §1.9 build-order step 5.
 *
 * WHAT THIS IS
 *   D147 (owner request, session 28): a ONE-PAGE modal — Scope, Format and Destination all
 *   show together as three stacked, scrollable sections, each with its own heading, with
 *   the export action at the bottom. There is no step rail and no step-by-step navigation
 *   any more (the previous four-view wizard — Scope → Format → Destination → Result — is
 *   gone; `running` and `result` are still separate views, since there is nothing to show
 *   underneath them). It owns NO engine work. It never imports `src/export/**`: rendering,
 *   PDF/PNG building, filename conflicts, the §19.4b memory budget and the destination
 *   handle all arrive as injected props, so this file stays testable in jsdom and the
 *   export lanes can move underneath it.
 *
 * PINNED INTERFACE — `ExportWizardProps` below is verbatim from the lane brief. Do not
 *   rename a prop; the orchestrator wires the real implementations against exactly this
 *   shape.
 *
 * v1 SCOPE (build spec §2.4 — the authority over everything else)
 *   - markup is ALWAYS flattened: there is no `Flatten markup` checkbox and no
 *     `dimensions summary page` checkbox, and their strings are not staged;
 *   - `Open folder` is impossible from a PWA and is NEVER rendered — the result view
 *     offers `Reveal folder` (`showDirectoryPicker({ startIn })`) and `Copy path`.
 *
 * THE §19.4b GUARD IS A REFUSAL, NOT A WARNING
 *   `checkMultiplier` is consulted for all three multipliers on every plan change. A
 *   refused multiplier is disabled, selecting it blocks `Next` AND the primary button, and
 *   `runExport` is never called. The distinct `3×` *warning* (`Slow on this device — expect
 *   a wait`) is a different thing and does not block anything.
 *
 * ACCESSIBILITY (§19.6, a per-slice gate row — not a final pass)
 *   `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; focus moves into the dialog
 *   on open and RETURNS to the invoker on close; `Esc` always closes (so the Tab cycle is
 *   never a keyboard trap); every control carries an accessible name; each step change and
 *   the export progress are announced through one `aria-live="polite"` region; the result
 *   path is selectable text in a `<code>`, never an image. 48 px minimum targets with 16 px
 *   of hit slop are declared in `exportWizard.css`.
 *
 * CSP: there is no inline `style=""` anywhere in this file. Every piece of state is a
 *   `data-` attribute dressed in `exportWizard.css` (the e2e suite asserts `[style]` === 0,
 *   and `tests/exportWizard.test.tsx` asserts it again at the unit level).
 *
 * COPY: folded into `src/ui/strings.ts` at integration; `C` is the local view of
 *   folds it into `strings.ts` and deletes it. Rows that already exist in `strings.ts`
 *   (`errors.retry`, `editor.cancel`, `editor.done`) are imported from there, not restaged.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from 'react';
import { X } from 'lucide-react';

import { STRINGS, t } from './strings';
import './exportWizard.css';

/**
 * Local view of this screen's copy. Every row lives in `src/ui/strings.ts` (the single
 * string table); this alias only spares the component a `STRINGS.export.` prefix on every
 * label, and folds the per-file error rows in under `C.errors` where the wizard reads them.
 */
const C = { ...STRINGS.export, errors: STRINGS.errors };

// ---------------------------------------------------------------------------
// Pinned interface — do not rename (lane brief, verbatim)
// ---------------------------------------------------------------------------

export type ExportFormat = 'pdf' | 'png';
export type ExportMultiplier = 1 | 2 | 3;
export type ConflictPolicy = 'add' | 'overwrite' | 'skip';
export type ExportScope = 'sheet' | 'selected' | 'all';

export interface ExportSheetRef {
  id: string;
  title: string;
  imageWidthPx: number;
  imageHeightPx: number;
}

export interface ExportPlan {
  scope: ExportScope;
  sheetIds: string[];
  format: ExportFormat;
  multiplier: ExportMultiplier;
  zip: boolean; // PNG only
  includeSheetNames: boolean; // PDF only
  conflictPolicy: ConflictPolicy;
  rememberDestination: boolean;
}

export interface ExportProgress {
  done: number;
  total: number;
  currentName: string;
}

export interface ExportFileResult {
  name: string;
  bytes: number;
  error?: { kind: 'permission' | 'locked' | 'disk-full' | 'unknown'; shortfallBytes?: number };
  /**
   * The plan's `Skip` conflict policy left the destination's existing file in place, so
   * nothing was written. Reported as a row (never silently omitted) so «Exported N files»
   * cannot hide a skip — see the export-wave review F4. A skipped row is neither a success
   * nor a failure: it has no `error` and does not count toward the written-file total.
   */
  skipped?: true;
}

export interface ExportResult {
  files: ExportFileResult[];
  path: string;
  totalBytes: number;
  sheetsWithoutPhoto: number;
  parts?: number;
}

export interface ExportWizardProps {
  open: boolean;
  sheets: readonly ExportSheetRef[];
  currentSheetId: string | null;
  selectedSheetIds?: readonly string[];
  /** Previously remembered destination for this project, if any. */
  initialDestination?: { name: string; path: string } | null;
  onClose(): void;
  /** Gesture-driven `showDirectoryPicker`; resolves null if the user cancels. */
  chooseDestination(): Promise<{ name: string; path: string } | null>;
  /** File count + byte estimate for the destination summary line. */
  estimate(plan: ExportPlan): { fileCount: number; bytes: number };
  /** The §19.4b memory guard. `ok: false` → refuse that multiplier with the device message. */
  checkMultiplier(plan: ExportPlan): { ok: true } | { ok: false; largest: ExportMultiplier | null };
  runExport(plan: ExportPlan, onProgress: (p: ExportProgress) => void): Promise<ExportResult>;
  retryFile(name: string): Promise<ExportFileResult>;
  revealFolder(): Promise<void>;
  /**
   * D147 item 3: copies `path` to the clipboard. MUST REJECT (never resolve-and-swallow)
   * when the clipboard is unavailable or refuses — the result view falls back to a
   * selectable read-only field rather than claiming a copy that did not happen.
   */
  copyPath(path: string): Promise<void>;
  /**
   * D147 item 3, added by this lane (not in the original pinned shape — a browser cannot
   * open Windows Explorer, so the owner accepted this in its place): opens one exported
   * file, by name, in a new tab. Optional so an integrator wiring an older session does
   * not fail to type-check; the result row's `Open` button is omitted without it.
   */
  openFile?(name: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local model
// ---------------------------------------------------------------------------

/**
 * D147: the three views left after the step rail's removal. `form` shows Scope, Format
 * and Destination stacked in one scrollable page; `running` and `result` are unchanged.
 */
export type WizardStep = 'form' | 'running' | 'result';

const MULTIPLIERS: readonly ExportMultiplier[] = [1, 2, 3];

/** §11.10 / plan step 5: **2× is the default**, at every entry point. */
// Owner (session 29, D158): 1x by default. Was 2.
export const DEFAULT_MULTIPLIER: ExportMultiplier = 1;

const CONFLICT_POLICIES: ReadonlyArray<{ policy: ConflictPolicy; label: string }> = [
  { policy: 'add', label: C.conflictAdd },
  { policy: 'overwrite', label: C.conflictOverwrite },
  { policy: 'skip', label: C.conflictSkip },
];

/** Every focusable in the dialog is a button or an input, so this is exact — and it works
 *  in jsdom, where layout-based visibility filters do not (mirrors `StyleEditorSheet`). */
const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

/**
 * `18.4 MB` — the shape the approved `export.writeSummary` / `export.resultSummary` rows
 * show. Binary units, one decimal from KB up.
 * Arithmetic: 19_293_798 B / 1024 / 1024 = 18.399… → `18.4 MB`; 1023 B stays `1023 B`.
 */
export function formatBytes(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** The per-file failure cause, in approved wording (UI §12:728). */
function errorLabel(error: NonNullable<ExportFileResult['error']>): string {
  switch (error.kind) {
    case 'permission':
      return C.errors.folderPermissionExpired;
    case 'locked':
      return C.errors.fileOpenAnotherApp;
    case 'disk-full':
      return C.errors.notEnoughDiskSpace;
    default:
      return C.errors.unknown;
  }
}

/**
 * How many files the run actually wrote. A `Skip` conflict row reports the skip but wrote
 * nothing, so it must not inflate «Exported {fileCount} files ({size})» — the count is of
 * WRITTEN files (review F4).
 */
function writtenFileCount(files: readonly ExportFileResult[]): number {
  return files.filter((file) => file.skipped !== true).length;
}

// ---------------------------------------------------------------------------
// ExportWizard — the pinned entry point
// ---------------------------------------------------------------------------

/**
 * Closed → `null`. Open → a freshly mounted dialog, so every re-open starts from the
 * defaults and the focus-in / focus-return effects run exactly once per opening.
 */
export function ExportWizard(props: ExportWizardProps): JSX.Element | null {
  if (!props.open) return null;
  return <ExportWizardDialog {...props} />;
}

export default ExportWizard;

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

function ExportWizardDialog({
  sheets,
  currentSheetId,
  selectedSheetIds,
  initialDestination,
  onClose,
  chooseDestination,
  estimate,
  checkMultiplier,
  runExport,
  retryFile,
  revealFolder,
  copyPath,
  openFile,
}: ExportWizardProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // ---- scope ---------------------------------------------------------------
  const allIds = useMemo(() => sheets.map((s) => s.id), [sheets]);
  // D158: never default to every sheet. With no selection and no open sheet (the grid), the
  // first sheet stands in as the selection, so the default export is ONE sheet, ONE file.
  const selectedIds = useMemo(() => {
    const given = [...(selectedSheetIds ?? [])];
    if (given.length === 0 && currentSheetId === null && sheets.length > 0) return [sheets[0].id];
    return given;
  }, [selectedSheetIds, currentSheetId, sheets]);

  const idsFor = useCallback(
    (next: ExportScope): string[] => {
      if (next === 'all') return allIds;
      if (next === 'selected') return selectedIds.filter((id) => allIds.includes(id));
      return currentSheetId !== null && allIds.includes(currentSheetId) ? [currentSheetId] : [];
    },
    [allIds, selectedIds, currentSheetId],
  );

  // "default in the Editor" = `This sheet`; "default when there is a grid selection" =
  // `Selected sheets (n)` (UI §12:712). With neither, `All sheets (n)` is the only
  // non-empty choice left.
  const initialScope: ExportScope =
    selectedIds.length > 0 ? 'selected' : currentSheetId !== null ? 'sheet' : 'all';

  const [scope, setScope] = useState<ExportScope>(initialScope);
  const [sheetIds, setSheetIds] = useState<string[]>(() => idsFor(initialScope));

  const scopeIds = idsFor(scope);
  const changeScope = (next: ExportScope): void => {
    setScope(next);
    setSheetIds(idsFor(next));
  };
  // Re-derived from `scopeIds` on every add so the list keeps the scope's own order — a
  // plain `[...current, id]` would append and the plan's `sheetIds` would come out shuffled.
  const toggleSheet = (id: string): void =>
    setSheetIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : scopeIds.filter((x) => x === id || current.includes(x)),
    );

  // ---- format / options ----------------------------------------------------
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [multiplier, setMultiplier] = useState<ExportMultiplier>(DEFAULT_MULTIPLIER);
  // Owner (session 29, D158): no zip by default (was ON per UI §12:717).
  const [zip, setZip] = useState(false);
  const [includeSheetNames, setIncludeSheetNames] = useState(false);

  // ---- destination ---------------------------------------------------------
  const [destination, setDestination] = useState<{ name: string; path: string } | null>(
    initialDestination ?? null,
  );
  const [rememberDestination, setRememberDestination] = useState(initialDestination != null);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('add');

  // ---- run -----------------------------------------------------------------
  const [step, setStep] = useState<WizardStep>('form');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [files, setFiles] = useState<readonly ExportFileResult[]>([]);
  const [retrying, setRetrying] = useState<readonly string[]>([]);
  const [runFailed, setRunFailed] = useState(false);

  // ---- the plan ------------------------------------------------------------
  // Built in ONE place so the object handed to `estimate`, `checkMultiplier` and
  // `runExport` cannot drift apart. `zip` is PNG-only and `includeSheetNames` is PDF-only,
  // so the irrelevant one is normalised to `false` rather than leaking a stale checkbox.
  const plan: ExportPlan = useMemo(
    () => ({
      scope,
      sheetIds,
      format,
      multiplier,
      zip: format === 'png' ? zip : false,
      includeSheetNames: format === 'pdf' ? includeSheetNames : false,
      conflictPolicy,
      rememberDestination,
    }),
    [scope, sheetIds, format, multiplier, zip, includeSheetNames, conflictPolicy, rememberDestination],
  );

  // ---- §19.4b memory guard -------------------------------------------------
  // Consulted for ALL THREE multipliers, so a refused one can be disabled instead of
  // failing only at the last moment. This is a refusal: `blocked` gates `Next` and the
  // primary button, and `startExport` refuses again at the call site.
  const multiplierChecks = useMemo(() => {
    const out = new Map<ExportMultiplier, { ok: true } | { ok: false; largest: ExportMultiplier | null }>();
    for (const m of MULTIPLIERS) out.set(m, checkMultiplier({ ...plan, multiplier: m }));
    return out;
  }, [checkMultiplier, plan]);

  const currentCheck = multiplierChecks.get(multiplier) ?? { ok: true as const };
  const blocked = currentCheck.ok === false;
  const largestAllowed = currentCheck.ok === false ? currentCheck.largest : null;

  const emptyScope = sheetIds.length === 0;
  const estimated = useMemo(() => estimate(plan), [estimate, plan]);

  // ---- Esc closes; Tab cycles inside (§19.6) -------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // `Esc` always closes, wherever focus is — this is what keeps the Tab cycle from
      // being a keyboard trap. Capture phase: the editor's own Esc ladder must not fire
      // first (the wizard is the topmost modal).
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = rootRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // The root itself holds focus on open; excluding it is what makes the FIRST Tab land
      // on the first control instead of following the browser default out of the dialog.
      const inside = active !== null && active !== root && root.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // ---- focus in on open, back to the invoker on close (§19.6) --------------
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // ---- the run -------------------------------------------------------------
  const startExport = useCallback((): void => {
    // The guard again, at the call site: a refused multiplier NEVER reaches `runExport`,
    // even if a disabled button were somehow activated.
    if (blocked || emptyScope || destination === null) return;
    setRunFailed(false);
    setProgress({ done: 0, total: sheetIds.length, currentName: '' });
    setStep('running');
    void runExport(plan, (p) => setProgress(p))
      .then((exported) => {
        setResult(exported);
        setFiles(exported.files);
        setStep('result');
      })
      .catch(() => {
        // Nothing is faked: the wizard says the run failed and returns the user to the
        // page they can act on. Per-file causes are reported by `runExport` resolving
        // with failed rows; a REJECTION is the whole-run failure, which has no per-file
        // detail to show.
        setRunFailed(true);
        setStep('form');
      });
  }, [blocked, emptyScope, destination, plan, runExport, sheetIds.length]);

  const onRetry = (name: string): void => {
    setRetrying((current) => [...current, name]);
    void retryFile(name)
      .then((next) => {
        // Only THIS row changes — retry is per-file, never "start over" (UI §12:728).
        setFiles((current) => current.map((file) => (file.name === name ? next : file)));
      })
      .finally(() => setRetrying((current) => current.filter((x) => x !== name)));
  };

  const pickDestination = (): void => {
    void chooseDestination().then((picked) => {
      if (picked) setDestination(picked);
    });
  };

  const exportAgain = (): void => {
    setResult(null);
    setFiles([]);
    setProgress(null);
    setStep('form');
  };

  // ---- D147: one page, no step navigation -----------------------------------
  // The primary button is always the export action; it is the ONLY way forward from
  // `form`, so the guard that used to gate `Next` between steps now gates it directly.
  const primaryLabel = C.button;
  const primaryDisabled = step === 'running' || emptyScope || blocked || destination === null;

  // ---- the one polite live region -----------------------------------------
  // `form` has no per-step transition left to announce; the live region only has
  // something new to say once the run starts.
  const announcement =
    step === 'running' && progress !== null
      ? t(C.progress, { done: progress.done, total: progress.total })
      : step === 'result' && result !== null
        ? t(C.resultSummary, {
            fileCount: writtenFileCount(result.files),
            size: formatBytes(result.totalBytes),
          })
        : '';

  return (
    <div className="export-wizard-scrim">
      <div
        ref={rootRef}
        className="export-wizard"
        data-testid="export-wizard"
        data-step={step}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="export-wizard-header">
          <h2 className="export-wizard-title" id={titleId}>
            {C.button}
          </h2>
          <button
            type="button"
            className="export-wizard-close export-wizard-slop"
            data-testid="export-wizard-close"
            aria-label={STRINGS.editor.cancel}
            onClick={onClose}
          >
            <X aria-hidden="true" />
            <span className="visually-hidden">{STRINGS.editor.cancel}</span>
          </button>
        </header>

        {/* One polite region for every step change and the progress count (§19.6). */}
        <div
          className="export-wizard-live visually-hidden"
          data-testid="export-wizard-live"
          aria-live="polite"
        >
          {announcement}
        </div>

        <div className="export-wizard-body">
          <div className="export-wizard-panel">
            {step === 'form' ? (
              <>
                <ScopeStep
                  sheets={sheets}
                  scope={scope}
                  scopeIds={scopeIds}
                  sheetIds={sheetIds}
                  selectedCount={selectedIds.length}
                  allCount={allIds.length}
                  hasCurrentSheet={currentSheetId !== null}
                  onChangeScope={changeScope}
                  onToggleSheet={toggleSheet}
                  onSelectAll={() => setSheetIds(scopeIds)}
                  onSelectNone={() => setSheetIds([])}
                />

                <FormatStep
                  format={format}
                  multiplier={multiplier}
                  zip={zip}
                  includeSheetNames={includeSheetNames}
                  checks={multiplierChecks}
                  blocked={blocked}
                  largestAllowed={largestAllowed}
                  onFormat={setFormat}
                  onMultiplier={setMultiplier}
                  onZip={setZip}
                  onIncludeSheetNames={setIncludeSheetNames}
                />

                <DestinationStep
                  destination={destination}
                  remember={rememberDestination}
                  conflictPolicy={conflictPolicy}
                  fileCount={estimated.fileCount}
                  bytes={estimated.bytes}
                  runFailed={runFailed}
                  onChoose={pickDestination}
                  onRemember={setRememberDestination}
                  onConflictPolicy={setConflictPolicy}
                />
              </>
            ) : null}

            {step === 'running' ? <RunningStep progress={progress} /> : null}

            {step === 'result' && result !== null ? (
              <ResultStep
                result={result}
                files={files}
                retrying={retrying}
                onRetry={onRetry}
                copyPath={copyPath}
                onRevealFolder={() => void revealFolder()}
                onExportAgain={exportAgain}
                openFile={openFile}
              />
            ) : null}
          </div>
        </div>

        <footer className="export-wizard-footer">
          {step === 'result' ? (
            <button
              type="button"
              className="export-wizard-primary export-wizard-slop"
              data-testid="export-wizard-done"
              aria-label={STRINGS.editor.done}
              onClick={onClose}
            >
              {STRINGS.editor.done}
            </button>
          ) : (
            <button
              type="button"
              className="export-wizard-primary export-wizard-slop"
              data-testid="export-wizard-primary"
              aria-label={primaryLabel}
              aria-busy={step === 'running'}
              disabled={primaryDisabled}
              onClick={startExport}
            >
              {primaryLabel}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Scope
// ---------------------------------------------------------------------------

function ScopeStep({
  sheets,
  scope,
  scopeIds,
  sheetIds,
  selectedCount,
  allCount,
  hasCurrentSheet,
  onChangeScope,
  onToggleSheet,
  onSelectAll,
  onSelectNone,
}: {
  sheets: readonly ExportSheetRef[];
  scope: ExportScope;
  scopeIds: readonly string[];
  sheetIds: readonly string[];
  selectedCount: number;
  allCount: number;
  hasCurrentSheet: boolean;
  onChangeScope(next: ExportScope): void;
  onToggleSheet(id: string): void;
  onSelectAll(): void;
  onSelectNone(): void;
}): JSX.Element {
  const options: ReadonlyArray<{ value: ExportScope; label: string; available: boolean }> = [
    { value: 'sheet', label: C.scopeThisSheet, available: hasCurrentSheet },
    {
      value: 'selected',
      label: t(C.scopeSelected, { count: selectedCount }),
      available: selectedCount > 0,
    },
    { value: 'all', label: t(C.scopeAll, { count: allCount }), available: allCount > 0 },
  ];
  const listed = sheets.filter((sheet) => scopeIds.includes(sheet.id));

  return (
    <section className="export-wizard-step" data-testid="export-wizard-step-scope">
      <h3 className="export-wizard-step-title">{C.stepScope}</h3>

      <div className="export-wizard-segmented" role="group" aria-label={C.stepScope}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="export-wizard-segment export-wizard-slop"
            data-testid={`export-wizard-scope-${option.value}`}
            aria-label={option.label}
            aria-pressed={scope === option.value}
            data-selected={scope === option.value ? 'true' : 'false'}
            disabled={!option.available}
            onClick={() => onChangeScope(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {sheetIds.length === 0 ? (
        // "Empty scope → `Select at least one sheet`, primary disabled" (UI §12:730).
        <p className="export-wizard-empty" data-testid="export-wizard-empty-scope" role="alert">
          {C.selectAtLeastOne}
        </p>
      ) : null}

      <div className="export-wizard-select-actions">
        <button
          type="button"
          className="export-wizard-text-button export-wizard-slop"
          data-testid="export-wizard-select-all"
          aria-label={C.selectAll}
          onClick={onSelectAll}
        >
          {C.selectAll}
        </button>
        <button
          type="button"
          className="export-wizard-text-button export-wizard-slop"
          data-testid="export-wizard-select-none"
          aria-label={C.selectNone}
          onClick={onSelectNone}
        >
          {C.selectNone}
        </button>
      </div>

      <ul className="export-wizard-sheet-list" data-testid="export-wizard-sheet-list">
        {listed.map((sheet) => (
          <li className="export-wizard-sheet-row" key={sheet.id}>
            <label className="export-wizard-sheet-label">
              <input
                type="checkbox"
                className="export-wizard-checkbox"
                data-testid={`export-wizard-sheet-${sheet.id}`}
                aria-label={sheet.title}
                checked={sheetIds.includes(sheet.id)}
                onChange={() => onToggleSheet(sheet.id)}
              />
              <span className="export-wizard-sheet-title">{sheet.title}</span>
              <span className="export-wizard-sheet-dims mono" aria-hidden="true">
                {`${sheet.imageWidthPx}×${sheet.imageHeightPx}`}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Format
// ---------------------------------------------------------------------------

function FormatStep({
  format,
  multiplier,
  zip,
  includeSheetNames,
  checks,
  blocked,
  largestAllowed,
  onFormat,
  onMultiplier,
  onZip,
  onIncludeSheetNames,
}: {
  format: ExportFormat;
  multiplier: ExportMultiplier;
  zip: boolean;
  includeSheetNames: boolean;
  checks: ReadonlyMap<ExportMultiplier, { ok: true } | { ok: false; largest: ExportMultiplier | null }>;
  blocked: boolean;
  largestAllowed: ExportMultiplier | null;
  onFormat(next: ExportFormat): void;
  onMultiplier(next: ExportMultiplier): void;
  onZip(next: boolean): void;
  onIncludeSheetNames(next: boolean): void;
}): JSX.Element {
  const sizeGroupLabel = format === 'png' ? C.pngSize : C.quality;

  return (
    <section className="export-wizard-step" data-testid="export-wizard-step-format">
      <h3 className="export-wizard-step-title">{C.stepFormat}</h3>

      <div className="export-wizard-format-cards" role="group" aria-label={C.stepFormat}>
        {([
          { value: 'pdf' as const, label: C.formatPdf },
          { value: 'png' as const, label: C.formatPng },
        ]).map((card) => (
          <button
            key={card.value}
            type="button"
            className="export-wizard-format-card export-wizard-slop"
            data-testid={`export-wizard-format-${card.value}`}
            aria-label={card.label}
            aria-pressed={format === card.value}
            data-selected={format === card.value ? 'true' : 'false'}
            onClick={() => onFormat(card.value)}
          >
            {card.label}
          </button>
        ))}
      </div>

      {/* The 1×/2×/3× ladder. Shared by both formats: it is `Size` for PNG and `Quality`
          for PDF, and it feeds the one `ExportPlan.multiplier`. */}
      <div className="export-wizard-multipliers" role="group" aria-label={sizeGroupLabel}>
        <span className="export-wizard-group-label">{sizeGroupLabel}</span>
        {MULTIPLIERS.map((m) => {
          const refused = checks.get(m)?.ok === false;
          return (
            <button
              key={m}
              type="button"
              className="export-wizard-multiplier export-wizard-slop"
              data-testid={`export-wizard-multiplier-${m}`}
              aria-label={t(C.multiplierOption, { multiplier: m })}
              aria-pressed={multiplier === m}
              data-selected={multiplier === m ? 'true' : 'false'}
              // NOT `disabled`: the user must be able to choose it and be TOLD why it is
              // refused (`This sheet is too large…`). The refusal bites on `Next` / the
              // primary button and again inside `startExport`, so `runExport` is
              // unreachable — a silently dead button would teach nothing.
              data-refused={refused ? 'true' : 'false'}
              onClick={() => onMultiplier(m)}
            >
              {t(C.multiplierOption, { multiplier: m })}
            </button>
          );
        })}
      </div>

      {/* The SLOW warning — a warning, not a refusal (UI §12:716). */}
      {multiplier === 3 && !blocked ? (
        <p className="export-wizard-warning" data-testid="export-wizard-3x-warning">
          {C.quality3xWarning}
        </p>
      ) : null}

      {/* The §19.4b REFUSAL. `runExport` is unreachable while this is shown. */}
      {blocked ? (
        <div className="export-wizard-refusal" data-testid="export-wizard-too-large" role="alert">
          <p className="export-wizard-refusal-text">{C.tooLargeFor3x}</p>
          {largestAllowed !== null ? (
            <button
              type="button"
              className="export-wizard-text-button export-wizard-slop"
              data-testid="export-wizard-use-largest"
              aria-label={t(C.multiplierOption, { multiplier: largestAllowed })}
              onClick={() => onMultiplier(largestAllowed)}
            >
              {t(C.multiplierOption, { multiplier: largestAllowed })}
            </button>
          ) : null}
        </div>
      ) : null}

      {format === 'pdf' ? (
        <div className="export-wizard-options" role="group" aria-label={C.formatPdf}>
          {/* `Fit to photo` is the ONLY page size in v1 (page pt = image px × 0.75). It is
              stated, not offered: there is no paper-size choice to make. */}
          <p className="export-wizard-note" data-testid="export-wizard-page-size">
            {C.pageSizeFit}
          </p>
          <label className="export-wizard-check-row">
            <input
              type="checkbox"
              className="export-wizard-checkbox"
              data-testid="export-wizard-include-sheet-names"
              aria-label={C.includeSheetNames}
              checked={includeSheetNames}
              // DEAD CONTROL, honestly disabled (review F1 — the D77/D87 class). Nothing
              // consumes `includeSheetNames`: v1 exports are flatten-only (build spec §2.4),
              // `runExport`/`pdf.ts` never read it, and the exported PDF carries no sheet
              // captions. Rendering the spec's checkbox as if it worked is a lie, so it is
              // disabled with `disabled` + `aria-disabled="true"` and `onChange` retained
              // (the D102 beta-honesty rule) — copy kept, no new copy invented, keyboard
              // skipped. Captions are NOT implemented here: where a caption sits relative
              // to a full-bleed sheet image is a UI-spec question (un-reviewed design), not
              // a lane fix. The orchestrator records the decision this points at.
              disabled
              aria-disabled="true"
              onChange={(event) => onIncludeSheetNames(event.target.checked)}
            />
            <span className="export-wizard-check-label">{C.includeSheetNames}</span>
          </label>
        </div>
      ) : (
        <div className="export-wizard-options" role="group" aria-label={C.formatPng}>
          <label className="export-wizard-check-row">
            <input
              type="checkbox"
              className="export-wizard-checkbox"
              data-testid="export-wizard-zip"
              aria-label={C.zipSingle}
              checked={zip}
              onChange={(event) => onZip(event.target.checked)}
            />
            <span className="export-wizard-check-label">{C.zipSingle}</span>
          </label>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Destination
// ---------------------------------------------------------------------------

function DestinationStep({
  destination,
  remember,
  conflictPolicy,
  fileCount,
  bytes,
  runFailed,
  onChoose,
  onRemember,
  onConflictPolicy,
}: {
  destination: { name: string; path: string } | null;
  remember: boolean;
  conflictPolicy: ConflictPolicy;
  fileCount: number;
  bytes: number;
  runFailed: boolean;
  onChoose(): void;
  onRemember(next: boolean): void;
  onConflictPolicy(next: ConflictPolicy): void;
}): JSX.Element {
  return (
    <section className="export-wizard-step" data-testid="export-wizard-step-destination">
      <h3 className="export-wizard-step-title">{C.destination}</h3>

      <button
        type="button"
        className="export-wizard-choose export-wizard-slop"
        data-testid="export-wizard-choose-folder"
        aria-label={C.chooseFolder}
        onClick={onChoose}
      >
        {C.chooseFolder}
      </button>

      {destination !== null ? (
        <p className="export-wizard-destination-path mono" data-testid="export-wizard-destination-path">
          {destination.path}
        </p>
      ) : null}

      <label className="export-wizard-check-row">
        <input
          type="checkbox"
          className="export-wizard-checkbox"
          data-testid="export-wizard-remember"
          aria-label={C.rememberDestination}
          checked={remember}
          onChange={(event) => onRemember(event.target.checked)}
        />
        <span className="export-wizard-check-label">{C.rememberDestination}</span>
      </label>

      <div className="export-wizard-conflicts" role="group" aria-label={C.conflictHeading}>
        <span className="export-wizard-group-label">{C.conflictHeading}</span>
        {CONFLICT_POLICIES.map((option) => (
          <button
            key={option.policy}
            type="button"
            className="export-wizard-segment export-wizard-slop"
            data-testid={`export-wizard-conflict-${option.policy}`}
            aria-label={option.label}
            aria-pressed={conflictPolicy === option.policy}
            data-selected={conflictPolicy === option.policy ? 'true' : 'false'}
            onClick={() => onConflictPolicy(option.policy)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* The approved summary line. The DOUBLE SPACE after `to:` is in the approved
          string and must survive byte-for-byte (appendix-strings.md:237). */}
      {destination !== null ? (
        <p className="export-wizard-summary" data-testid="export-wizard-write-summary">
          {t(C.writeSummary, {
            fileCount,
            size: formatBytes(bytes),
            path: destination.path,
          })}
        </p>
      ) : null}

      {runFailed ? (
        <p className="export-wizard-refusal-text" data-testid="export-wizard-run-failed" role="alert">
          {C.errors.unknown}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function RunningStep({ progress }: { progress: ExportProgress | null }): JSX.Element {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  return (
    <section className="export-wizard-step" data-testid="export-wizard-step-running">
      <p className="export-wizard-progress mono" data-testid="export-wizard-progress">
        {t(C.progress, { done, total })}
      </p>
      {progress !== null && progress.currentName !== '' ? (
        <p className="export-wizard-progress-name mono">{progress.currentName}</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function ResultStep({
  result,
  files,
  retrying,
  onRetry,
  copyPath,
  onRevealFolder,
  onExportAgain,
  openFile,
}: {
  result: ExportResult;
  files: readonly ExportFileResult[];
  retrying: readonly string[];
  onRetry(name: string): void;
  copyPath(path: string): Promise<void>;
  onRevealFolder(): void;
  onExportAgain(): void;
  openFile?(name: string): Promise<void>;
}): JSX.Element {
  // D147 item 3: "Copy folder path" never fails silently. `copyPath` REJECTS when the
  // clipboard is unavailable or refuses (see `runExport.ts`'s `copyPath`); this is the
  // fallback for that case — a selectable read-only field, not a swallowed error.
  const [copyFailed, setCopyFailed] = useState(false);
  const fallbackRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (copyFailed) fallbackRef.current?.select();
  }, [copyFailed]);

  const onCopyPath = (): void => {
    void copyPath(result.path)
      .then(() => setCopyFailed(false))
      .catch(() => setCopyFailed(true));
  };

  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const onOpenFile = (name: string): void => {
    if (!openFile) return;
    setOpeningFile(name);
    void openFile(name).finally(() => setOpeningFile((current) => (current === name ? null : current)));
  };

  return (
    <section className="export-wizard-step" data-testid="export-wizard-step-result">
      <p className="export-wizard-result-summary" data-testid="export-wizard-result-summary">
        {t(C.resultSummary, {
          fileCount: writtenFileCount(files),
          size: formatBytes(result.totalBytes),
        })}
      </p>

      {/* Selectable text, never an image (§19.6 gate row). */}
      <code className="export-wizard-path mono" data-testid="export-wizard-result-path">
        {result.path}
      </code>

      <div className="export-wizard-result-actions">
        <button
          type="button"
          className="export-wizard-text-button export-wizard-slop"
          data-testid="export-wizard-copy-path"
          aria-label={C.copyPath}
          onClick={onCopyPath}
        >
          {C.copyPath}
        </button>
        {/* `Reveal folder` = `showDirectoryPicker({ startIn })`. There is deliberately NO
            `Open folder`: it is impossible from a PWA and must never ship (UI §12:727). */}
        <button
          type="button"
          className="export-wizard-text-button export-wizard-slop"
          data-testid="export-wizard-reveal-folder"
          aria-label={C.revealFolder}
          onClick={onRevealFolder}
        >
          {C.revealFolder}
        </button>
        <button
          type="button"
          className="export-wizard-text-button export-wizard-slop"
          data-testid="export-wizard-export-again"
          aria-label={C.exportAgain}
          onClick={onExportAgain}
        >
          {C.exportAgain}
        </button>
      </div>

      {copyFailed ? (
        <div className="export-wizard-copy-fallback" data-testid="export-wizard-copy-fallback">
          <p className="export-wizard-note">{STRINGS.export.copyPathFallback}</p>
          <input
            ref={fallbackRef}
            type="text"
            readOnly
            className="export-wizard-copy-fallback-field mono"
            data-testid="export-wizard-copy-fallback-field"
            aria-label={STRINGS.export.copyPathFallbackFieldLabel}
            value={result.path}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}

      {result.sheetsWithoutPhoto > 0 ? (
        // §19.4a: a damaged-photo sheet exports as markup on a white page and is COUNTED
        // here. Never skipped silently — the markup is the measurement record.
        <p className="export-wizard-note" data-testid="export-wizard-damaged-photos">
          {t(C.damagedPhotoSummary, { sheetCount: result.sheetsWithoutPhoto })}
        </p>
      ) : null}

      {result.parts !== undefined && result.parts > 1 ? (
        // Plan §1.9 step 3b: the 250 MB PDF budget split into `part-01.pdf`, `part-02.pdf`…
        <p className="export-wizard-note" data-testid="export-wizard-parts">
          {t(C.splitParts, { parts: result.parts })}
        </p>
      ) : null}

      <p className="export-wizard-dropbox" data-testid="export-wizard-dropbox">
        {C.dropboxHint}
      </p>

      <ul className="export-wizard-file-list" data-testid="export-wizard-file-list">
        {files.map((file) => (
          <li
            className="export-wizard-file-row"
            data-testid={`export-wizard-file-${file.name}`}
            data-failed={file.error ? 'true' : 'false'}
            data-skipped={file.skipped ? 'true' : 'false'}
            key={file.name}
          >
            <span className="export-wizard-file-status" aria-hidden="true">
              {retrying.includes(file.name)
                ? C.statusWorking
                : file.error
                  ? C.statusFailed
                  : file.skipped
                    ? STRINGS.export.statusSkipped
                    : C.statusDone}
            </span>
            <span className="export-wizard-file-name mono">{file.name}</span>
            {file.error ? (
              <span className="export-wizard-file-error">
                <span data-testid={`export-wizard-file-cause-${file.name}`}>
                  {errorLabel(file.error)}
                </span>
                {file.error.kind === 'disk-full' && file.error.shortfallBytes !== undefined ? (
                  <span
                    className="export-wizard-file-shortfall mono"
                    data-testid={`export-wizard-file-shortfall-${file.name}`}
                  >
                    {t(C.diskShortfall, { shortfall: formatBytes(file.error.shortfallBytes) })}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="export-wizard-text-button export-wizard-slop"
                  data-testid={`export-wizard-retry-${file.name}`}
                  aria-label={
                    file.error.kind === 'permission' ? C.errors.reAuthorize : STRINGS.errors.retry
                  }
                  disabled={retrying.includes(file.name)}
                  onClick={() => onRetry(file.name)}
                >
                  {file.error.kind === 'permission' ? C.errors.reAuthorize : STRINGS.errors.retry}
                </button>
              </span>
            ) : file.skipped ? (
              // A «Skip» conflict: nothing was written, so an honest label rather than a
              // size (review F4). Neither a success ✓ nor a failure ✕ — no Retry offered.
              // The trailing slot reuses the existing `.export-wizard-file-size` styling
              // (the muted right-hand meta slot) rather than introducing new CSS.
              <span
                className="export-wizard-file-size"
                data-testid={`export-wizard-file-skipped-${file.name}`}
              >
                {STRINGS.export.skipped}
              </span>
            ) : (
              <>
                <span className="export-wizard-file-size mono">{formatBytes(file.bytes)}</span>
                {openFile ? (
                  <button
                    type="button"
                    className="export-wizard-text-button export-wizard-slop"
                    data-testid={`export-wizard-open-${file.name}`}
                    aria-label={t(STRINGS.export.openFile, { name: file.name })}
                    disabled={openingFile === file.name}
                    onClick={() => onOpenFile(file.name)}
                  >
                    {STRINGS.export.open}
                  </button>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
