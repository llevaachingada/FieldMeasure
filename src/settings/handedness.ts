/**
 * Handedness setting (implementation plan slice 0.3 step 1; UI §4.4 / §14.8).
 *
 * A plain, persisted preference — never read from (or claim to read from) the
 * Windows pen setting; no web API exposes it (UI §4.4:177, §14.8).
 *
 * Storage: `idb-keyval` (runtime dep already pinned). Default is `'right'`.
 */
import { get, set } from 'idb-keyval';

export type Handedness = 'right' | 'left';

/** Right pre-selected as the plain default (UI §4.4). */
export const DEFAULT_HANDEDNESS: Handedness = 'right';

export const HANDEDNESS_KEY = 'fm:settings:handedness';

export async function getHandedness(): Promise<Handedness> {
  const stored = await get<Handedness>(HANDEDNESS_KEY);
  return stored === 'left' || stored === 'right' ? stored : DEFAULT_HANDEDNESS;
}

export async function setHandedness(value: Handedness): Promise<void> {
  await set(HANDEDNESS_KEY, value);
}
