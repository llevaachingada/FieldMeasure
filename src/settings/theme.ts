/**
 * Theme setting (build spec §10; UI §14.2). Default `'standard'`.
 *
 * Sunlight/Dim are first-class themes, not filters (UI §14.2) — the tokens that
 * make them real land with slice 1.10; 0.3 only persists the choice.
 */
import { get, set } from 'idb-keyval';

export type Theme = 'standard' | 'sunlight' | 'dim';

export const DEFAULT_THEME: Theme = 'standard';

export const THEME_KEY = 'fm:settings:theme';

const THEMES: readonly Theme[] = ['standard', 'sunlight', 'dim'];

export async function getTheme(): Promise<Theme> {
  const stored = await get<Theme>(THEME_KEY);
  return stored !== undefined && THEMES.includes(stored) ? stored : DEFAULT_THEME;
}

export async function setTheme(value: Theme): Promise<void> {
  await set(THEME_KEY, value);
}
