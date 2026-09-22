/**
 * `src/fs/presets.ts` — slice 1.8, lane C1: named per-tool style presets (§7.3).
 *
 * Presets live at `<projectFolder>/.fieldmeasure/presets.json` so they travel with the
 * folder when it is dragged into Dropbox and can be shared by copying the folder (§7.3).
 *
 * WRITE PATH: `writePresetsFile` in `src/fs/projectStore.ts` — the ONLY module allowed to
 * call `createWritable()`. It is atomic (tmp → close → `move()`) under the per-project Web
 * Lock, exactly like `project.json`/`markup.json`.
 *
 * FILE SHAPE (designed here; the UI lane receives `Array<{name, style}>` for the current
 * tool via `presetsForTool`):
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "byTool": {
 *     "dimension": [ { "name": "Red footing", "style": { ...8 keys... } } ],
 *     "text": [ { "name": "Note", "style": { ... } } ]
 *   }
 * }
 * ```
 * A missing file is a fresh project (empty, not an error). A corrupt file or an
 * unavailable folder is an error the shell surfaces with its Retry path (§7.5).
 *
 * Pure functions (parse, upsert, remove, find, `presetsForTool`) are Konva-free and
 * DOM-free; only the `load*`/`save*` functions touch the File System Access API.
 */
import type { AnnotationStyle } from '@/domain/types';
import type { ToolId } from '@/ui/ToolRail';
import { AnnotationStyleZ } from '@/domain/schema';
// A NAMESPACE import, deliberately — NOT a named-import list.
//
// In the Vitest **browser** project a named import from this module failed to LINK:
//   SyntaxError: The requested module '/src/fs/projectStore.ts' does not provide an export
//   named 'resolveFieldMeasureDir'
// …while the export demonstrably exists: `tsc --noEmit`, the rolldown build, node+jsdom,
// and an `import * as` namespace probe in the SAME browser context all see it. Resolving the
// bindings at use time is behaviour-identical and avoids the link-time name check.
// Recorded in DECISIONS D84.
//
// D84's *recorded root cause* is DISPROVED (session-14 review, finding 5): it blamed Vite
// discovering `zod` as a NEW bare import here because `EditorLayout` is lazy. Both halves are
// false against the import graph — `projectStore` itself reaches `zod` through
// `../domain/schema` (`src/domain/schema.ts:32`), so every failing suite already had `zod` in
// its scan; and the three failing suites import `EditorLayout` STATICALLY
// (`tests/insetWire.browser.test.ts:25`, `tests/layersWire.browser.test.ts:23`,
// `tests/sheetEditor.dimension.browser.test.ts:20`) — it is lazy only at `src/App.tsx:29`.
// The `import { z } from 'zod'` this module used to carry was moreover UNUSED, and has been
// removed. The cause is therefore still unknown, which is exactly why the namespace import is
// now GUARDED rather than trusted: `import * as` yields `undefined` for a missing export
// instead of throwing at link time, so a recurrence would otherwise surface as a `TypeError`
// inside the IO catches below and be reported to the user as a CORRUPT PRESETS FILE.
// `requireBinding` + `isProgrammingError` make that impossible; see `tests/presetsLinking.test.ts`.
import * as projectStore from './projectStore';

/** Bump when the on-disk shape changes; unknown versions parse leniently today. */
export const PRESETS_SCHEMA_VERSION = 1;

/**
 * File name below `.fieldmeasure/` in the project folder (§7.3).
 *
 * The DIRECTORY name is deliberately NOT duplicated here: `.fieldmeasure` is owned by
 * `projectStore.resolveFieldMeasureDir`, and this module reaches it only through that
 * function (AGENTS #3). The dead `PRESETS_DIR` constant that used to sit beside this one
 * was removed in the session-14 review (finding 9) — it had zero references and could only
 * ever drift from `src/fs/projectStore.ts:125`. The two remaining halves of the path are
 * pinned by EXECUTION, not by a shared literal: `tests/presets.test.ts` writes through
 * `projectStore` and asserts `Riverside/.fieldmeasure/presets.json` exists, then reads it
 * back through `readPresetsFromDir` (which uses `PRESETS_FILE`). If either literal drifted,
 * that round-trip fails.
 */
export const PRESETS_FILE = 'presets.json';

export interface StylePreset {
  name: string;
  style: AnnotationStyle;
}

/**
 * Per-tool named presets. `byTool` is keyed by `ToolId`; a tool with no presets is absent
 * (never an empty array on disk).
 */
export interface PresetsFile {
  schemaVersion: number;
  byTool: Partial<Record<ToolId, StylePreset[]>>;
}

export function emptyPresets(): PresetsFile {
  return { schemaVersion: PRESETS_SCHEMA_VERSION, byTool: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePreset(entry: unknown): StylePreset | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.name !== 'string' || entry.name.trim() === '') return null;
  const parsed = AnnotationStyleZ.safeParse(entry.style);
  if (!parsed.success) return null;
  return { name: entry.name, style: parsed.data };
}

/**
 * Parse and validate a `presets.json` body. Returns `null` for anything that is not a
 * valid file (the caller maps that to the corrupt/error state). Unknown `byTool` keys are
 * preserved as-is so a preset written by a newer build is not silently dropped.
 */
export function parsePresets(raw: string): PresetsFile | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const byTool: Partial<Record<ToolId, StylePreset[]>> = {};
  const rawByTool = data.byTool;
  if (rawByTool !== undefined) {
    if (!isRecord(rawByTool)) return null;
    for (const [tool, value] of Object.entries(rawByTool)) {
      if (!Array.isArray(value)) return null;
      const presets: StylePreset[] = [];
      for (const entry of value) {
        const preset = parsePreset(entry);
        if (!preset) return null;
        presets.push(preset);
      }
      if (presets.length > 0) byTool[tool as ToolId] = presets;
    }
  }
  const schemaVersion =
    typeof data.schemaVersion === 'number' ? data.schemaVersion : PRESETS_SCHEMA_VERSION;
  return { schemaVersion, byTool };
}

/** The presets for one tool, cloned so a caller cannot mutate the file object. */
export function presetsForTool(file: PresetsFile, tool: ToolId): StylePreset[] {
  return (file.byTool[tool] ?? []).map((preset) => ({
    name: preset.name,
    style: { ...preset.style },
  }));
}

export function findPreset(file: PresetsFile, tool: ToolId, name: string): StylePreset | undefined {
  const preset = (file.byTool[tool] ?? []).find((entry) => entry.name === name);
  return preset ? { name: preset.name, style: { ...preset.style } } : undefined;
}

/** Add a preset, or replace the one with the same name IN PLACE (name is the identity). */
export function upsertPreset(file: PresetsFile, tool: ToolId, preset: StylePreset): PresetsFile {
  const list = file.byTool[tool] ?? [];
  const next = list.slice();
  const index = next.findIndex((entry) => entry.name === preset.name);
  const copy: StylePreset = { name: preset.name, style: { ...preset.style } };
  if (index >= 0) next[index] = copy;
  else next.push(copy);
  return { ...file, byTool: { ...file.byTool, [tool]: next } };
}

/** Remove a preset by name. A no-op when it is absent. */
export function removePreset(file: PresetsFile, tool: ToolId, name: string): PresetsFile {
  const list = file.byTool[tool];
  if (!list) return file;
  const next = list.filter((entry) => entry.name !== name);
  const byTool = { ...file.byTool };
  if (next.length > 0) byTool[tool] = next;
  else delete byTool[tool];
  return { ...file, byTool };
}

/* ------------------------------------------------------------------ *
 * IO — and the guard that keeps a PROGRAMMING error out of the DATA errors
 * ------------------------------------------------------------------ */

/**
 * Thrown when a `projectStore` binding this module resolves at use time is not a function.
 *
 * Why this class exists: the namespace import above trades a link-time name check for a
 * use-time property read, so a missing export arrives as `undefined` rather than as a
 * `SyntaxError`. Calling it would throw a bare `TypeError` inside the IO catches below,
 * which classified anything that was not a `NotFoundError` as `{ kind: 'corrupt' }` — i.e.
 * the shell would tell the user «Presets file is corrupt» when the file is perfectly fine
 * and the real fault is ours. A named, non-`DOMException` error that the catches rethrow
 * makes that misreport impossible, and names the broken binding.
 *
 * It is checked at USE time, not at module load: a throw at module load would fail the whole
 * lazy editor chunk as an opaque chunk-load error, and could not be exercised by a test
 * without module-graph surgery. Use time is the moment the fault actually matters.
 */
export class PresetsBindingError extends Error {
  constructor(name: string) {
    super(
      `presets.ts: projectStore.${name} is not a function. This is a LINKING/PROGRAMMING ` +
        `error (see DECISIONS D84), not a problem with the user's presets file.`,
    );
    this.name = 'PresetsBindingError';
  }
}

/** Resolve one `projectStore` binding, or throw a `PresetsBindingError` naming it. */
function requireBinding<T>(name: string, binding: T): T {
  if (typeof binding !== 'function') throw new PresetsBindingError(name);
  return binding;
}

/**
 * `true` for errors that are OUR bug, never the storage layer's.
 *
 * The IO catches below may only classify a caught error as `missing`/`corrupt`/
 * `folder-unavailable` when this is `false`. A genuine storage failure is a `DOMException`
 * (`NotFoundError`, `NotReadableError`, `NoModificationAllowedError`, …) or a plain `Error`
 * (`projectStore.resolveOpenProjectDir` throws `new Error('project … is not open in this
 * tab')` for the folder-unavailable path, which `tests/presets.test.ts` covers) — never a
 * `TypeError`, and never a `PresetsBindingError`.
 */
function isProgrammingError(e: unknown): boolean {
  return (
    e instanceof PresetsBindingError ||
    e instanceof TypeError ||
    e instanceof ReferenceError ||
    e instanceof RangeError ||
    e instanceof SyntaxError
  );
}

export type PresetsRead =
  | { kind: 'ok'; file: PresetsFile }
  | { kind: 'missing' }
  | { kind: 'corrupt' };

/** Read `.fieldmeasure/presets.json` from a resolved project directory. */
export async function readPresetsFromDir(
  projectDir: unknown,
): Promise<PresetsRead> {
  const dir = projectDir as FileSystemDirectoryHandle;
  let fieldDir: FileSystemDirectoryHandle;
  try {
    const resolveFieldMeasureDir = requireBinding(
      'resolveFieldMeasureDir',
      projectStore.resolveFieldMeasureDir,
    );
    fieldDir = await resolveFieldMeasureDir(dir, { create: false });
  } catch (e) {
    if (isProgrammingError(e)) throw e; // our bug — never «your presets file is corrupt»
    return (e as DOMException)?.name === 'NotFoundError' ? { kind: 'missing' } : { kind: 'corrupt' };
  }
  let raw: string;
  try {
    const handle = await fieldDir.getFileHandle(PRESETS_FILE, { create: false });
    raw = await (await handle.getFile()).text();
  } catch (e) {
    if (isProgrammingError(e)) throw e;
    return (e as DOMException)?.name === 'NotFoundError' ? { kind: 'missing' } : { kind: 'corrupt' };
  }
  const file = parsePresets(raw);
  return file ? { kind: 'ok', file } : { kind: 'corrupt' };
}

export type PresetsLoadResult =
  | { ok: true; presets: PresetsFile }
  | { ok: false; error: 'folder-unavailable' | 'corrupt' };

/**
 * Load an OPEN project's presets by id. Never throws **for a storage failure**: the shell
 * maps `{ ok: false, error: 'folder-unavailable' }` to the §7.5 warn strip
 * («Presets couldn't be loaded — changes will apply to this session only.») and can retry
 * by calling this again (e.g. after the folder is re-picked). A missing file is a fresh
 * project, not an error.
 *
 * It DOES propagate a programming error (`PresetsBindingError`, `TypeError`, …). That is
 * deliberate and is the finding-5 fix: silently degrading our own bug into a user-facing
 * data error («corrupt», «folder unavailable») hides it behind a Retry button the user can
 * press forever. A bug must be loud.
 */
export async function loadPresets(projectId: string): Promise<PresetsLoadResult> {
  let projectDir: FileSystemDirectoryHandle;
  try {
    const resolveOpenProjectDir = requireBinding(
      'resolveOpenProjectDir',
      projectStore.resolveOpenProjectDir,
    );
    projectDir = await resolveOpenProjectDir(projectId);
  } catch (e) {
    if (isProgrammingError(e)) throw e;
    return { ok: false, error: 'folder-unavailable' };
  }
  const read = await readPresetsFromDir(projectDir);
  if (read.kind === 'ok') return { ok: true, presets: read.file };
  if (read.kind === 'missing') return { ok: true, presets: emptyPresets() };
  return { ok: false, error: 'corrupt' };
}

/** Write presets for an OPEN project (atomic, lock-guarded). Throws on write failure. */
export async function savePresets(projectId: string, file: PresetsFile): Promise<void> {
  const resolveOpenProjectDir = requireBinding(
    'resolveOpenProjectDir',
    projectStore.resolveOpenProjectDir,
  );
  const writePresetsFile = requireBinding('writePresetsFile', projectStore.writePresetsFile);
  const projectDir = await resolveOpenProjectDir(projectId);
  await writePresetsFile(projectDir, file, projectId);
}

/** Write presets to an already-resolved project directory (used by tests and callers that hold the dir). */
export async function savePresetsToDir(
  projectDir: unknown,
  file: PresetsFile,
  projectId: string,
): Promise<void> {
  const writePresetsFile = requireBinding('writePresetsFile', projectStore.writePresetsFile);
  await writePresetsFile(projectDir as FileSystemDirectoryHandle, file, projectId);
}
