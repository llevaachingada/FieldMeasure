/**
 * Density setting (build spec §10; UI §3.5). Default `'field'` (56px controls).
 *
 * The auto-select rule (mouse-primary / no pen for 5 min → Desk, UI §3.5) needs
 * pointer telemetry that arrives with the editor; 0.3 persists the user choice
 * and defaults to Field.
 */
import { get, set } from 'idb-keyval';

export type Density = 'field' | 'desk';

export const DEFAULT_DENSITY: Density = 'field';

export const DENSITY_KEY = 'fm:settings:density';

export async function getDensity(): Promise<Density> {
  const stored = await get<Density>(DENSITY_KEY);
  return stored === 'desk' || stored === 'field' ? stored : DEFAULT_DENSITY;
}

export async function setDensity(value: Density): Promise<void> {
  await set(DENSITY_KEY, value);
}
