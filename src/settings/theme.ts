/**
 * Theme setting (build spec §10; UI §14.2). Default `'standard'`.
 *
 * Sunlight/Dim are first-class themes, not filters (UI §14.2): the tokens that
 * make them real live in `src/styles.css` under `:root[data-theme='…']`, and
 * `applyThemeAttribute()` below writes the choice to the document root. `standard`
 * matches no override block, so the shipped look is unchanged.
 */
import { get, set } from 'idb-keyval';

export type Theme = 'standard' | 'sunlight' | 'dim';

export const DEFAULT_THEME: Theme = 'standard';

export const THEME_KEY = 'fm:settings:theme';

/** The document-root attribute the theme blocks in `styles.css` are scoped to. */
export const THEME_ATTRIBUTE = 'data-theme';

/** Minimal structural target so the helper is testable without a real DOM. */
export interface ThemeRoot {
  setAttribute(name: string, value: string): void;
}

/**
 * Write the active theme onto the document root (`<html data-theme="…">`).
 *
 * `styles.css` keys the Sunlight/Dim token remaps off this attribute. `standard`
 * is written too (rather than removed) so the three states are symmetric and the
 * control's selected value always matches the DOM; no rule targets `standard`,
 * so its look is byte-identical to the pre-theme stylesheet.
 */
export function applyThemeAttribute(
  theme: Theme,
  root: ThemeRoot | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  root?.setAttribute(THEME_ATTRIBUTE, theme);
}

const THEMES: readonly Theme[] = ['standard', 'sunlight', 'dim'];

export async function getTheme(): Promise<Theme> {
  const stored = await get<Theme>(THEME_KEY);
  return stored !== undefined && THEMES.includes(stored) ? stored : DEFAULT_THEME;
}

export async function setTheme(value: Theme): Promise<void> {
  await set(THEME_KEY, value);
}
