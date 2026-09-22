/**
 * tests/projectMeasure.test.ts — slice 1.8 lane C1: the PROJECT-level precision +
 * unit-format write path (§7.2 Dimension row; D31 / §21.2).
 *
 * Proves by execution:
 *   - a precision change re-derives labels (no stored label) and updates `project.json`;
 *   - the change is applied to the live scene context AND queued through the persistence
 *     callback (the existing atomic/coalesced path), exactly once;
 *   - a unit-format change does the same;
 *   - a denominator outside `VALID_DENOMINATORS` is refused (a wrong-measurement guard).
 */
import { describe, expect, it, vi } from 'vitest';

import { derivedDimensionLabel } from '../src/editor/shapes/dimensionLabel';
import {
  applyProjectPrecision,
  applyProjectUnitFormat,
  planProjectMeasureChange,
  type ProjectMeasureContext,
} from '../src/state/projectMeasure';
import { validProjectFile } from './fakes/fsa';

const MM_PER_IN = 25.4;
/** 12.3 in — rounds to 5/16 at 1/16 precision and 1/4 at 1/4 precision. */
const VALUE_MM = 12.3 * MM_PER_IN;

const ctx: ProjectMeasureContext = {
  unitSystem: 'imperial',
  unitFormat: 'ft-in',
  precisionDenominator: 16,
};

describe('planProjectMeasureChange', () => {
  it('updates the context and project.json together, preserving everything else', () => {
    const projectFile = validProjectFile();
    const planned = planProjectMeasureChange({
      projectFile,
      ctx,
      patch: { precisionDenominator: 4 },
      now: '2026-09-22T00:00:00.000Z',
    });

    expect(planned.ctx).toEqual({ ...ctx, precisionDenominator: 4 });
    expect(planned.projectFile.project.precisionDenominator).toBe(4);
    expect(planned.projectFile.project.unitFormat).toBe('ft-in'); // untouched
    expect(planned.projectFile.sheets).toEqual(projectFile.sheets); // untouched
    expect(planned.projectFile.project.id).toBe(projectFile.project.id);
  });

  it('re-derives the label from the new precision (no stored label)', () => {
    const before = derivedDimensionLabel(VALUE_MM, ctx);
    // 12.3 in at 1/16: round(12.3 × 16) = 197 ticks → 1'-0 5/16".
    expect(before).toBe(`1'-0 5/16"`);

    const planned = planProjectMeasureChange({
      projectFile: validProjectFile(),
      ctx,
      patch: { precisionDenominator: 4 },
    });
    const after = derivedDimensionLabel(VALUE_MM, planned.ctx);
    // 12.3 in at 1/4: round(12.3 × 4) = 49 ticks → 1'-0 1/4".
    expect(after).toBe(`1'-0 1/4"`);
    expect(after).not.toBe(before);
  });

  it('applies a unit-format change and re-derives to decimal feet', () => {
    const planned = planProjectMeasureChange({
      projectFile: validProjectFile(),
      ctx,
      patch: { unitFormat: 'ft-decimal' },
    });
    expect(planned.ctx.unitFormat).toBe('ft-decimal');
    expect(planned.projectFile.project.unitFormat).toBe('ft-decimal');

    const label = derivedDimensionLabel(VALUE_MM, planned.ctx);
    expect(label?.endsWith(`'`)).toBe(true);
    expect(label).not.toBe(derivedDimensionLabel(VALUE_MM, ctx));
  });

  it('refuses a denominator outside VALID_DENOMINATORS', () => {
    expect(() =>
      planProjectMeasureChange({
        projectFile: validProjectFile(),
        ctx,
        patch: { precisionDenominator: 3 },
      }),
    ).toThrow(RangeError);
  });

  it('refuses an unknown unit format', () => {
    expect(() =>
      planProjectMeasureChange({
        projectFile: validProjectFile(),
        ctx,
        patch: { unitFormat: 'furlongs' as never },
      }),
    ).toThrow(RangeError);
  });
});

describe('applyProjectPrecision / applyProjectUnitFormat — the shell seams', () => {
  it('sets the live scene context and queues exactly one project.json write', () => {
    const projectFile = validProjectFile();
    const setContext = vi.fn();
    const queueProject = vi.fn();

    const next = applyProjectPrecision({
      projectFile,
      ctx,
      denominator: 8,
      scene: { setContext },
      queueProject,
    });

    expect(next).toEqual({ ...ctx, precisionDenominator: 8 });
    expect(setContext).toHaveBeenCalledTimes(1);
    expect(setContext).toHaveBeenCalledWith({ ...ctx, precisionDenominator: 8 });
    expect(queueProject).toHaveBeenCalledTimes(1);
    const queued = queueProject.mock.calls[0][0] as ReturnType<typeof validProjectFile>;
    expect(queued.project.precisionDenominator).toBe(8);
  });

  it('applyProjectUnitFormat queues the project write too', () => {
    const setContext = vi.fn();
    const queueProject = vi.fn();
    const next = applyProjectUnitFormat({
      projectFile: validProjectFile(),
      ctx,
      format: 'in',
      scene: { setContext },
      queueProject,
    });
    expect(next.unitFormat).toBe('in');
    expect(setContext).toHaveBeenCalledWith({ ...ctx, unitFormat: 'in' });
    expect(queueProject).toHaveBeenCalledTimes(1);
  });
});
