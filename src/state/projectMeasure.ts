/**
 * `src/state/projectMeasure.ts` — slice 1.8, lane C1: the PROJECT-level measurement write
 * path for precision + unit format (UI §7.2 Dimension row; D31 / build spec §21.2).
 *
 * Precision and unit format are PROJECT values (`project.json`'s `precisionDenominator` /
 * `unitFormat`), one source of truth. The style panel's Precision/Unit-format controls are
 * the only place they are edited (the keypad's fraction chip is entry-scoped — D31), and
 * every label re-derives because there is no stored label.
 *
 * The shell wires these two entry points to the panel's props:
 *
 * ```ts
 * const onPrecisionChange = (denominator: number) => {
 *   const ctx = applyProjectPrecision({
 *     projectFile, ctx: currentCtx, denominator,
 *     scene,                                  // MarkupScene (has setContext)
 *     queueProject: (file) => persist.queueProject(projectId, file), // the existing path
 *   });
 *   useAppStore.getState().setPrecisionDenominator(ctx.precisionDenominator);
 * };
 * const onUnitFormatChange = (format) => { applyProjectUnitFormat({ ...same seams, format }); ... };
 * ```
 *
 * `queueProject` is deliberately a callback: the atomic/coalesced write stays owned by the
 * existing `persistQueue` (§5.4), and this module never touches the File System API.
 * Pure planning (`planProjectMeasureChange`) is separated from the two side effects so a
 * node test can assert the persisted shape and the re-derived label without a canvas.
 */
import type { ProjectFile } from '@/domain/schema';
import type { UnitFormat } from '@/domain/types';
import { VALID_DENOMINATORS } from '@/domain/units';

export interface ProjectMeasureContext {
  unitSystem: 'imperial' | 'metric';
  unitFormat: UnitFormat;
  precisionDenominator: number;
}

export interface ProjectMeasurePatch {
  precisionDenominator?: number;
  unitFormat?: UnitFormat;
}

export interface PlanProjectMeasureInput {
  /** The loaded `project.json` (the source of truth). */
  projectFile: ProjectFile;
  /** The current project measurement context (whatever the canvas is rendered with). */
  ctx: ProjectMeasureContext;
  patch: ProjectMeasurePatch;
  /** Injected for deterministic tests; defaults to `new Date().toISOString()`. */
  now?: string;
}

export interface PlannedProjectMeasure {
  /** The next label context — hand it to `MarkupScene.setContext`. */
  ctx: ProjectMeasureContext;
  /** The next `project.json` body — hand it to `persistQueue.queueProject`. */
  projectFile: ProjectFile;
}

type ValidDenominator = (typeof VALID_DENOMINATORS)[number];
const UNIT_FORMATS: readonly UnitFormat[] = ['ft-in', 'in', 'ft-decimal'];

function isValidDenominator(value: number): value is ValidDenominator {
  return (VALID_DENOMINATORS as readonly number[]).includes(value);
}

function isValidUnitFormat(value: string): value is UnitFormat {
  return (UNIT_FORMATS as readonly string[]).includes(value);
}

/**
 * Pure plan for a project precision/unit-format change. Throws `RangeError` for a
 * denominator outside `VALID_DENOMINATORS` or an unknown unit format — a bad value must
 * never reach `project.json` (a wrong-measurement path).
 */
export function planProjectMeasureChange(input: PlanProjectMeasureInput): PlannedProjectMeasure {
  const { projectFile, ctx, patch } = input;
  const nextDenominator = patch.precisionDenominator ?? ctx.precisionDenominator;
  if (!isValidDenominator(nextDenominator)) {
    throw new RangeError(`invalid precision denominator: ${String(patch.precisionDenominator)}`);
  }
  const nextFormat = patch.unitFormat ?? ctx.unitFormat;
  if (!isValidUnitFormat(nextFormat)) {
    throw new RangeError(`invalid unit format: ${String(patch.unitFormat)}`);
  }

  const nextCtx: ProjectMeasureContext = {
    unitSystem: ctx.unitSystem,
    unitFormat: nextFormat,
    precisionDenominator: nextDenominator,
  };
  const nextFile: ProjectFile = {
    ...projectFile,
    project: {
      ...projectFile.project,
      precisionDenominator: nextDenominator,
      unitFormat: nextFormat,
    },
  };
  return { ctx: nextCtx, projectFile: nextFile };
}

export interface ApplyProjectMeasureInput extends PlanProjectMeasureInput {
  /** The live `MarkupScene` (or anything exposing its `setContext`). */
  scene: { setContext(ctx: ProjectMeasureContext): void };
  /** Queue the atomic `project.json` write — e.g. `(file) => persist.queueProject(projectId, file)`. */
  queueProject: (file: ProjectFile) => void;
}

/**
 * Apply a project measurement change: re-derive every label on the live scene and queue the
 * `project.json` write through the existing persistence path. Returns the next context so
 * the caller can mirror it into the app store (`setPrecisionDenominator`/`setUnitFormat`).
 */
export function applyProjectMeasureChange(input: ApplyProjectMeasureInput): ProjectMeasureContext {
  const planned = planProjectMeasureChange(input);
  input.scene.setContext(planned.ctx);
  input.queueProject(planned.projectFile);
  return planned.ctx;
}

/** The §7.2 Precision control's handler (project-level; D31). */
export function applyProjectPrecision(
  input: Omit<ApplyProjectMeasureInput, 'patch'> & { denominator: number },
): ProjectMeasureContext {
  return applyProjectMeasureChange({ ...input, patch: { precisionDenominator: input.denominator } });
}

/** The §7.2 Unit-format control's handler (project-level; one source of truth). */
export function applyProjectUnitFormat(
  input: Omit<ApplyProjectMeasureInput, 'patch'> & { format: UnitFormat },
): ProjectMeasureContext {
  return applyProjectMeasureChange({ ...input, patch: { unitFormat: input.format } });
}
