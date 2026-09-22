/**
 * Watermark runtime (UI/GUI handoff pass, 2026-09-22). Mirrors `themeRuntime.ts`:
 * hydrate the persisted choice into the store once at boot, for every route, so
 * `WatermarkOverlay` (mounted once at the `App` shell root) reflects it immediately
 * rather than only after a visit to Settings.
 *
 * Nothing here touches the DOM directly — `WatermarkOverlay` reads the store value
 * and renders (or doesn't); this hook only owns the idb-keyval read.
 */
import { useEffect } from 'react';
import { getWatermarkEnabled } from '@/settings/watermark';
import { useAppStore } from '@/state/appStore';

export function useWatermarkRuntime(): void {
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const stored = await getWatermarkEnabled();
        if (alive) useAppStore.getState().applySettings({ watermarkEnabled: stored });
      } catch {
        // Defaults are already in the store; a storage failure must not blank the app.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
