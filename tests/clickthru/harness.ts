/**
 * `tests/clickthru/harness.ts` — the clickthru harness helpers.
 *
 * WHAT THIS IS
 *   The login-free, server-free scaffolding a single Playwright test uses to drive the BUILT
 *   app end to end while capturing a screenshot per step: the OPFS/`showDirectoryPicker`
 *   init shim, a step runner that never hard-fails the run, a per-step evidence observer (the
 *   sheet-directory listing), OPFS read-out helpers, and the `run.json` + contact-sheet writers.
 *
 * IT IS AN INSPECTION TOOL, NOT A GATE. It never asserts a `[Surface]` result and never
 *   weakens an existing test. See `README.md` for the honest caveats.
 *
 * THE SHIM (background proof 2 + 4, do not re-derive)
 *   `showDirectoryPicker` is read at CALL time (`src/settings/projectsRoot.ts:54`), so
 *   overriding it before the first click is enough. The projects root is persisted with
 *   `idb-keyval`; storing the OPFS root handle and reading it back KILLS the renderer on
 *   deserialisation (the D81 crash, reproduced in both headless shell and headed Chrome).
 *   So the shim stores a SENTINEL string in IndexedDB and synthesises the OPFS root back on
 *   read. `idb-keyval` v6's real contract is `request.onsuccess = () => resolve(request.result)`,
 *   which a synthetic request object satisfies.
 */
import { type Locator, type Page } from '@playwright/test';

// `node:fs` / `node:path` have no bundled types in this repo (`types: ["vite/client"]`).
// Same `@ts-expect-error` pattern as `tests/theme.test.ts` and `tests/stylePanel.test.tsx`.
// @ts-expect-error -- node:fs types are not part of this repo's `types` array.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
// @ts-expect-error -- node:path types are not part of this repo's `types` array.
import { join } from 'node:path';

/** `process` is declared for `env` only (`src/env.d.ts`), so `cwd` needs a narrow cast. */
const cwd = (): string => (process as unknown as { cwd(): string }).cwd();

export const ARTIFACTS_DIR = join(cwd(), 'test-results', 'clickthru', 'latest');
export const EXPORTED_DIR = join(ARTIFACTS_DIR, 'exported');

/**
 * Printed into `run.json` and the contact sheet, and spelled out in `README.md`. These are
 * things this harness and its **emulation** can NEVER prove — they are `[Surface]` rows and
 * must not be inferred from a green clickthru run.
 */
export const SURFACE_CAVEATS = [
  'A green run NEVER promotes a [Surface] row.',
  'Pen pressure, tilt and hover are emulated with a fixed CDP `force` — the real digitiser curve is NOT exercised.',
  'A finger’s systematic contact-centroid offset is NOT reproduced — a synthetic touch point is exactly where we put it.',
  'Real palm physics are NOT reproduced; the palm step is a stationary extra touch point (H1b shape), not a resting heel.',
  'Windows’ ~250 ms pinch delay on inking surfaces (H15) is NOT reproduced.',
  'Coalescing / `getCoalescedEvents()` sample rates (H16) are NOT reproduced — every CDP move is one discrete event.',
  'The Ink API (H17) is NOT exercised.',
  'Thermal / sustained DPR-2 frame rate (H18) is NOT measured.',
  'Real camera optics and resolution (C3/H10) are NOT exercised — Chromium’s fake device supplies a synthetic stream.',
  'Sunlight / Dim legibility on real glass (H3) is NOT exercised.',
  'The 14-day trash clock and the service-worker update lifecycle are NOT exercised.',
  'File System Access on a real disk is NOT exercised — the root and destination are OPFS via the handle shim.',
  'A desktop Chrome UA is used (a Windows tablet target, not a phone); the fidelity axis is the browser channel, not the UA.',
];

/* ---------------------------------------------------------------------------
 * The init shim — verbatim from the validated background proof (4), do not re-derive.
 * ------------------------------------------------------------------------- */

export const PROJECTS_ROOT_KEY = 'fm:projects-root';
export const OPFS_SENTINEL = '__fm_opfs_root__';

/**
 * Passed to `page.addInitScript`. Must be fully self-contained (Playwright serialises the
 * function source), so it closes over nothing.
 */
export function clickthruInitScript(): void {
  const KEY = 'fm:projects-root';
  const SENTINEL = '__fm_opfs_root__';

  Object.defineProperty(window, 'showDirectoryPicker', {
    configurable: true,
    writable: true,
    value: () => navigator.storage.getDirectory(),
  });

  const proto = IDBObjectStore.prototype;
  const origGet = proto.get;
  const origPut = proto.put;

  proto.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
    if (key !== KEY) return origGet.call(this, key);
    const native = origGet.call(this, key);
    const req: {
      result: unknown;
      error: DOMException | null;
      onsuccess: null | (() => void);
      oncomplete: null | (() => void);
      onerror: null | (() => void);
      onabort: null | (() => void);
    } = {
      result: undefined,
      error: null,
      onsuccess: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
    };
    native.onsuccess = () => {
      const finish = (root: unknown) => {
        req.result = root;
        queueMicrotask(() => {
          req.onsuccess?.();
          req.oncomplete?.();
        });
      };
      if (native.result === SENTINEL) navigator.storage.getDirectory().then(finish, finish);
      else finish(undefined);
    };
    native.onerror = () => {
      req.error = native.error;
      queueMicrotask(() => {
        req.onerror?.();
        req.onabort?.();
      });
    };
    return req as unknown as IDBRequest;
  } as typeof proto.get;

  proto.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (key !== KEY) return origPut.call(this, value as never, key);
    return origPut.call(this, SENTINEL as never, key);
  } as typeof proto.put;
}

/* ---------------------------------------------------------------------------
 * Step model
 * ------------------------------------------------------------------------- */

export type StepStatus = 'PASS' | 'FAIL' | 'UNREACHED';

export interface StepRecord {
  index: number;
  name: string;
  status: StepStatus;
  screenshot: string | null;
  durationMs: number;
  /** Short human evidence returned by the step (e.g. a read summary). */
  note?: string;
  /** The exact error text when the step did not pass. */
  error?: string;
  /** The per-step evidence observer's result (the sheet-directory listing). */
  evidence?: unknown;
}

export interface RunMeta {
  command: string;
  baseURL: string;
  channel: string | undefined;
  headed: boolean;
  startedAt: string;
  /** The device profile the path ran on (`surfaceLandscape`, …). */
  profile?: string;
  viewport?: { width: number; height: number };
  hasTouch?: boolean;
  userAgent?: string;
  devicePixelRatio?: number;
}

/** A precondition was not present (element/page/capability) — the step was not reachable. */
export class Unreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Unreachable';
  }
}

/** The step ran, but a checked expectation was false. */
export class StepFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepFailure';
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Unreachable(`${message} (timed out after ${ms} ms)`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Best-effort visibility wait that raises `Unreachable` with one clean line. */
export async function waitVisible(locator: Locator, what: string, timeout = 15_000): Promise<void> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch (error) {
    const first = errorText(error).split('\n')[0];
    throw new Unreachable(`${what} did not appear — ${first}`);
  }
}

/** Best-effort hidden wait that raises `Unreachable` with one clean line. */
export async function waitHidden(locator: Locator, what: string, timeout = 15_000): Promise<void> {
  try {
    await locator.first().waitFor({ state: 'hidden', timeout });
  } catch (error) {
    const first = errorText(error).split('\n')[0];
    throw new Unreachable(`${what} did not go away — ${first}`);
  }
}

/**
 * A run's step log + artifacts. Steps are run in order; a failure is recorded and the walk
 * CONTINUES, so one broken step never hides the rest of the path and never hard-fails the
 * test. Each step leaves a numbered screenshot.
 */
export class ClickthruRun {
  readonly steps: StepRecord[] = [];
  private index = 0;
  private observer: (() => Promise<unknown>) | null = null;

  constructor(
    private readonly page: Page,
    readonly meta: RunMeta,
  ) {
    // A run owns `latest/` — start clean so `NN-<step>.png` never accumulates stale steps
    // from an earlier run (the step count/names change as the path grows).
    rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    mkdirSync(EXPORTED_DIR, { recursive: true });
    this.writeLog();
  }

  get logPath(): string {
    return join(ARTIFACTS_DIR, 'run.json');
  }

  /**
   * Attach an observer run after EVERY step (pass or fail) whose result is stored on the
   * record. Used for the sheet-directory listing evidence (photo.jpg / thumb.jpg /
   * markup.json presence + sizes) at each step.
   */
  setObserver(observer: () => Promise<unknown>): void {
    this.observer = observer;
  }

  private stepFile(index: number, name: string): string {
    return `${String(index).padStart(2, '0')}-${slugify(name)}.png`;
  }

  private writeLog(): void {
    const payload = {
      ...this.meta,
      finishedAt: new Date().toISOString(),
      artifactsDir: ARTIFACTS_DIR,
      contactSheet: 'contact-sheet.html',
      caveats: SURFACE_CAVEATS,
      steps: this.steps,
    };
    writeFileSync(this.logPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  /** Run one step: screenshot, log its status, and never throw out to the caller. */
  async step(name: string, run: () => Promise<string | void>, timeoutMs = 60_000): Promise<StepRecord> {
    this.index += 1;
    const index = this.index;
    const started = Date.now();
    let status: StepStatus = 'PASS';
    let note: string | undefined;
    let error: string | undefined;

    try {
      const result = await withTimeout(Promise.resolve().then(run), timeoutMs, `step "${name}"`);
      if (typeof result === 'string') note = result;
    } catch (err) {
      error = errorText(err).split('\n').slice(0, 3).join(' | ');
      status = err instanceof Unreachable ? 'UNREACHED' : 'FAIL';
    }

    // The screenshot is taken even on failure — a failed step's pixels are the evidence.
    let screenshot: string | null = null;
    try {
      const file = this.stepFile(index, name);
      await this.page.screenshot({ path: join(ARTIFACTS_DIR, file), timeout: 15_000 });
      screenshot = file;
    } catch (err) {
      screenshot = null;
      if (error === undefined) error = `screenshot failed — ${errorText(err).split('\n')[0]}`;
    }

    // The per-step evidence observer, best-effort — it must never fail the step.
    let evidence: unknown;
    if (this.observer) {
      try {
        evidence = await this.observer();
      } catch (err) {
        evidence = { error: errorText(err).split('\n')[0] };
      }
    }

    const record: StepRecord = {
      index,
      name,
      status,
      screenshot,
      durationMs: Date.now() - started,
      ...(note !== undefined ? { note } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(evidence !== undefined ? { evidence } : {}),
    };
    this.steps.push(record);
    this.writeLog();

    const suffix = error ? ` — ${error}` : note ? ` — ${note}` : '';
    // eslint-disable-next-line no-console
    console.log(`[clickthru] ${status.padEnd(9)} ${String(index).padStart(2, '0')} ${name}${suffix}`);
    return record;
  }

  /** Run every step in order, continuing past failures. */
  async walk(steps: readonly WalkStep[]): Promise<void> {
    for (const s of steps) await this.step(s.name, s.run, s.timeoutMs);
  }

  summary(): string {
    const counts = { PASS: 0, FAIL: 0, UNREACHED: 0 } as Record<StepStatus, number>;
    for (const s of this.steps) counts[s.status] += 1;
    return `${counts.PASS} PASS / ${counts.FAIL} FAIL / ${counts.UNREACHED} UNREACHED of ${this.steps.length}`;
  }
}

export interface WalkStep {
  name: string;
  run: () => Promise<string | void>;
  /** Backstop for a step that could hang; default 60 s. */
  timeoutMs?: number;
}

/* ---------------------------------------------------------------------------
 * OPFS read-out (the destination the shim points at is the OPFS root)
 * ------------------------------------------------------------------------- */

export interface OpfsEntry {
  path: string;
  size: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Atomic writes replace files under us (tmp → move), so a list/read racing a save can see a
 * transient `NotFoundError`. Retry a few times rather than failing the step on a race.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6, delayMs = 120): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await sleep(delayMs);
    }
  }
  throw last;
}

/** Every file in OPFS, recursively, with its path relative to the OPFS root. */
export async function opfsList(page: Page): Promise<OpfsEntry[]> {
  return withRetry(() =>
    page.evaluate(async () => {
      const out: Array<{ path: string; size: number }> = [];
      const walk = async (dir: any, prefix: string): Promise<void> => {
        for await (const [name, handle] of dir.entries()) {
          const path = prefix === '' ? name : `${prefix}/${name}`;
          if (handle.kind === 'directory') {
            await walk(handle, path);
          } else {
            const file = await handle.getFile();
            out.push({ path, size: file.size });
          }
        }
      };
      const root: any = await (navigator.storage as any).getDirectory();
      await walk(root, '');
      return out;
    }),
  );
}

/** Read one OPFS file's bytes back to the Node side (base64 over the CDP boundary). */
export async function opfsReadBase64(
  page: Page,
  path: string,
): Promise<{ size: number; firstBytes: number[]; base64: string }> {
  return withRetry(() =>
    page.evaluate(async (target: string) => {
      const parts = target.split('/');
      let dir: any = await (navigator.storage as any).getDirectory();
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
      const handle = await dir.getFileHandle(parts[parts.length - 1]!);
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return {
        size: bytes.length,
        firstBytes: Array.from(bytes.subarray(0, 8)),
        base64: btoa(binary),
      };
    }, path),
  );
}

export interface SheetFileInfo {
  name: string;
  size: number;
}

export interface SheetDirInfo {
  path: string;
  files: SheetFileInfo[];
}

export interface SheetEvidence {
  projectDir: string | null;
  /** One entry per `sheets/<id>/`, with each file's name and byte size. */
  sheets: SheetDirInfo[];
  /** Export destinations found under `<project>/exports/<stamp>/`. */
  exportedFiles: string[];
}

/**
 * The per-step evidence: every sheet directory's listing. This is how `thumb.jpg` presence
 * (and size) is documented at EVERY step — an observation, never a fix.
 */
export async function opfsSheetEvidence(page: Page): Promise<SheetEvidence> {
  return withRetry(() =>
    page.evaluate(async () => {
    const root: any = await (navigator.storage as any).getDirectory();
    let projectDir: any = null;
    let projectName = '';
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== 'directory') continue;
      try {
        await handle.getFileHandle('project.json');
        projectDir = handle;
        projectName = name;
        break;
      } catch {
        // not a project folder — keep looking
      }
    }
    if (!projectDir) return { projectDir: null, sheets: [], exportedFiles: [] };

    const sheets: Array<{ path: string; files: Array<{ name: string; size: number }> }> = [];
    try {
      const sheetsDir = await projectDir.getDirectoryHandle('sheets');
      for await (const [id, sheetDir] of sheetsDir.entries()) {
        if (sheetDir.kind !== 'directory') continue;
        const files: Array<{ name: string; size: number }> = [];
        for await (const [fileName, fileHandle] of sheetDir.entries()) {
          if (fileHandle.kind !== 'file') continue;
          const file = await fileHandle.getFile();
          files.push({ name: fileName, size: file.size });
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        sheets.push({ path: `${projectName}/sheets/${id}`, files });
      }
    } catch {
      // no sheets dir yet
    }

    const exportedFiles: string[] = [];
    try {
      const exportsDir = await projectDir.getDirectoryHandle('exports');
      for await (const [stamp, stampDir] of exportsDir.entries()) {
        if (stampDir.kind !== 'directory') continue;
        for await (const [fileName, fileHandle] of stampDir.entries()) {
          if (fileHandle.kind === 'file') exportedFiles.push(`${projectName}/exports/${stamp}/${fileName}`);
        }
      }
    } catch {
      // no exports yet
    }
    return { projectDir: projectName, sheets, exportedFiles };
    }),
  );
}

export interface MarkupObjectSummary {
  id: string;
  type: string;
  a: { x: number; y: number } | null;
  b: { x: number; y: number } | null;
  valueMm: number | null;
  enteredText: string | null;
  /** Freehand/highlight only: sample count. */
  pointCount: number | null;
  /** Freehand/highlight only: the largest stored pressure sample. */
  pressureMax: number | null;
}

/** The current sheet's persisted annotations (first `markup.json` found), for geometry evidence. */
export async function opfsFirstMarkup(page: Page): Promise<MarkupObjectSummary[]> {
  return withRetry(async () => {
    const entries = await opfsList(page);
    const markup = entries.find((entry) => entry.path.endsWith('markup.json'));
    if (!markup) return [];
    const data = await opfsReadBase64(page, markup.path);
    try {
      const json = JSON.parse(atob(data.base64)) as {
        objects?: Array<{
          id?: string;
          type?: string;
          geometry?: {
            a?: { x: number; y: number };
            b?: { x: number; y: number };
            points?: Array<{ x: number; y: number }>;
            pressure?: number[];
          };
          valueMm?: number | null;
          enteredText?: string | null;
        }>;
      };
      return (json.objects ?? []).map((object) => {
        const pressure = object.geometry?.pressure ?? [];
        return {
          id: String(object.id ?? ''),
          type: String(object.type ?? ''),
          a: object.geometry?.a ?? null,
          b: object.geometry?.b ?? null,
          valueMm: object.valueMm ?? null,
          enteredText: object.enteredText ?? null,
          pointCount: object.geometry?.points?.length ?? null,
          pressureMax: pressure.length > 0 ? Math.max(...pressure) : null,
        };
      });
    } catch {
      return [];
    }
  });
}

/**
 * Wait for the autosave chip to report `saved`, so an OPFS read reflects a landed write.
 * Returns false on timeout (the caller records that honestly rather than hanging).
 */
export async function waitSaved(page: Page, timeout = 8_000): Promise<boolean> {
  const chip = page.locator('[data-testid="autosave-chip"]');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await chip.getAttribute('data-state').catch(() => null);
    if (state === 'saved') return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** Decode base64 without `Buffer` (not typed here) and write it to disk. */
export function writeBase64ToFile(base64: string, outPath: string): number {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  writeFileSync(outPath, bytes);
  return bytes.length;
}

/* ---------------------------------------------------------------------------
 * Contact sheet + video
 * ------------------------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_COLOR: Record<StepStatus, string> = {
  PASS: '#137333',
  FAIL: '#b3261e',
  UNREACHED: '#8a6d00',
};

/**
 * A single self-contained HTML file (screenshots inlined as base64) showing every step in
 * order with its status. The owner opens exactly this one file.
 */
export function writeContactSheet(run: ClickthruRun): string {
  const cards = run.steps
    .map((s) => {
      let image = '<p class="nopic">(no screenshot)</p>';
      if (s.screenshot) {
        const file = join(ARTIFACTS_DIR, s.screenshot);
        if (existsSync(file)) {
          const b64 = readFileSync(file).toString('base64');
          image = `<img alt="${escapeHtml(s.name)}" src="data:image/png;base64,${b64}">`;
        }
      }
      const note = s.note ? `<p class="note">${escapeHtml(s.note)}</p>` : '';
      const error = s.error ? `<p class="error">${escapeHtml(s.error)}</p>` : '';
      const evidence =
        s.evidence !== undefined
          ? `<details><summary>step evidence</summary><pre>${escapeHtml(
              JSON.stringify(s.evidence, null, 2),
            )}</pre></details>`
          : '';
      return `<section class="step">
  <h2><span class="badge" style="background:${STATUS_COLOR[s.status]}">${s.status}</span>
      ${String(s.index).padStart(2, '0')}. ${escapeHtml(s.name)}
      <span class="ms">${s.durationMs} ms</span></h2>
  ${image}${note}${error}${evidence}
  <p class="file mono">${escapeHtml(s.screenshot ?? '')}</p>
</section>`;
    })
    .join('\n');

  const caveats = SURFACE_CAVEATS.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Field Measure — clickthru ${escapeHtml(run.meta.startedAt)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; font: 14px/1.5 system-ui, sans-serif; background: #f6f7f8; color: #1c1f22; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #5b6470; margin: 0 0 18px; }
  .summary { font-weight: 600; margin: 0 0 18px; }
  .caveats { background: #fff8e6; border: 1px solid #e6d49a; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px; }
  .caveats h2 { margin: 0 0 6px; font-size: 14px; }
  .caveats li { margin: 2px 0; }
  .step { background: #fff; border: 1px solid #dfe3e8; border-radius: 8px; padding: 14px; margin: 0 0 20px; }
  .step h2 { margin: 0 0 10px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .badge { color: #fff; border-radius: 4px; padding: 1px 8px; font-size: 12px; letter-spacing: .04em; }
  .ms { color: #8a929c; font-weight: 400; margin-left: auto; font-size: 12px; }
  img { max-width: 100%; height: auto; border: 1px solid #e3e6ea; border-radius: 6px; display: block; }
  .note { color: #2b5d2b; }
  .error { color: #b3261e; white-space: pre-wrap; }
  .file { color: #8a929c; font-size: 12px; }
  details { margin: 6px 0 0; }
  summary { cursor: pointer; color: #5b6470; font-size: 12px; }
  pre { background: #f2f4f6; border-radius: 6px; padding: 10px; overflow: auto; font-size: 12px; }
  .mono { font-family: ui-monospace, Consolas, monospace; }
  .nopic { color: #8a929c; }
</style>
</head>
<body>
  <h1>Field Measure — beta-path clickthru</h1>
  <p class="sub mono">${escapeHtml(run.meta.command)} · ${escapeHtml(run.meta.baseURL)} · channel ${escapeHtml(run.meta.channel ?? 'bundled-chromium')} · profile ${escapeHtml(run.meta.profile ?? '?')} · viewport ${escapeHtml(
    run.meta.viewport ? `${run.meta.viewport.width}×${run.meta.viewport.height}` : '?',
  )} @${String(run.meta.devicePixelRatio ?? '?')} · headed ${String(run.meta.headed)} · started ${escapeHtml(run.meta.startedAt)}</p>
  <p class="summary">${escapeHtml(run.summary())}</p>
  <div class="caveats">
    <h2>What this run can never prove ([Surface] / emulation limits)</h2>
    <ul>${caveats}</ul>
  </div>
${cards}
</body>
</html>
`;

  const out = join(ARTIFACTS_DIR, 'contact-sheet.html');
  writeFileSync(out, html, 'utf8');
  return out;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

/** Copy the newest Playwright-recorded `.webm` into `latest/run.webm`. Returns its path or null. */
export function copyNewestVideo(fromDir: string): string | null {
  const videos = filesUnder(fromDir).filter((f) => f.toLowerCase().endsWith('.webm'));
  if (videos.length === 0) return null;
  videos.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const target = join(ARTIFACTS_DIR, 'run.webm');
  copyFileSync(videos[0]!, target);
  return target;
}
