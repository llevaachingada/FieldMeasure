/**
 * Display-theme runtime (slice 1.10; UI §14.2, build spec §11.12).
 *
 * Two jobs, both against the existing seams — no new storage contract:
 *   1. **Apply** the selected theme as `<html data-theme="…">`, where
 *      `src/styles.css` scopes the Sunlight/Dim token remaps.
 *   2. **Hydrate** the persisted choice on boot from the idb-keyval theme helper,
 *      so a reload comes back in the theme the user picked (Settings also
 *      hydrates when it mounts; the two reads agree on the same key).
 *
 * `App` calls this once at the root. Screens never touch the DOM attribute
 * themselves — the root owns it, and a store change re-applies it automatically.
 */
import { useEffect } from 'react';
import { applyThemeAttribute, getTheme } from '@/settings/theme';
import { useAppStore } from '@/state/appStore';

export function useThemeRuntime(): void {
  const theme = useAppStore((s) => s.theme);

  // Re-apply on every change, including the hydration below and any Settings click.
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  // Boot: read the persisted choice once. Settings hydrates on mount too, but the
  // root attribute must be correct before that (Home, first-run, editor).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const stored = await getTheme();
        if (alive) useAppStore.getState().applySettings({ theme: stored });
      } catch {
        // Defaults are already in the store; a storage failure must not blank the app.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
