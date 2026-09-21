/**
 * Unit settings (implementation plan slice 0.3 step 1; build spec §6.1, §10).
 *
 * `unitSystem` and `unitFormat` are app-level defaults persisted here; the
 * AUTHORITATIVE values for a measurement live in the project file
 * (`Project.unitSystem` / `unitFormat` / `precisionDenominator` — §3.3), which is
 * why Settings shows precision as per-project (P §20.5(b)). Metric is deferred
 * in v1 (§2.4 / §21.3) — the seam is kept, no metric keypad UI.
 *
 * Defaults: imperial · ft-in · 16 (§19.5).
 */
import { get, set } from 'idb-keyval';
import type { UnitFormat } from '@/domain/types';

export type { UnitFormat };
export type UnitSystem = 'imperial' | 'metric';

export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'imperial';
export const DEFAULT_UNIT_FORMAT: UnitFormat = 'ft-in';
export const DEFAULT_PRECISION_DENOMINATOR = 16;

export const UNIT_SYSTEM_KEY = 'fm:settings:unitSystem';
export const UNIT_FORMAT_KEY = 'fm:settings:unitFormat';
export const PRECISION_DENOMINATOR_KEY = 'fm:settings:precisionDenominator';

export async function getUnitSystem(): Promise<UnitSystem> {
  const stored = await get<UnitSystem>(UNIT_SYSTEM_KEY);
  return stored === 'imperial' || stored === 'metric' ? stored : DEFAULT_UNIT_SYSTEM;
}

export async function setUnitSystem(value: UnitSystem): Promise<void> {
  await set(UNIT_SYSTEM_KEY, value);
}

export async function getUnitFormat(): Promise<UnitFormat> {
  const stored = await get<UnitFormat>(UNIT_FORMAT_KEY);
  return stored === 'ft-in' || stored === 'in' || stored === 'ft-decimal'
    ? stored
    : DEFAULT_UNIT_FORMAT;
}

export async function setUnitFormat(value: UnitFormat): Promise<void> {
  await set(UNIT_FORMAT_KEY, value);
}

export async function getPrecisionDenominator(): Promise<number> {
  const stored = await get<number>(PRECISION_DENOMINATOR_KEY);
  return typeof stored === 'number' && stored > 0 ? stored : DEFAULT_PRECISION_DENOMINATOR;
}

export async function setPrecisionDenominator(value: number): Promise<void> {
  await set(PRECISION_DENOMINATOR_KEY, value);
}
