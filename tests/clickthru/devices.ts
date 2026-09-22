/**
 * `tests/clickthru/devices.ts` — the Surface target profiles the app is designed around.
 *
 * Canonical source: `docs/ui-spec-field-measure-v2-hardened.md:35-38` (the device table) and
 * `docs/gui-ux-readiness-and-design-handoff.md:459-460` (the exact canvas sizes). These are
 * Playwright `use` fragments — spread one into a `test.use(...)` or the config's `use`.
 *
 * WHY A DESKTOP UA AND `isMobile: false`
 *   This is a **Windows tablet, not a phone**. `isMobile: true` (or a mobile UA) changes the
 *   viewport-meta/visual-viewport behaviour and can disable `showDirectoryPicker`, so it would
 *   make the harness test a device the app never ships to. The UA is deliberately a desktop
 *   Chrome UA; the **fidelity** axis is the browser channel (`CLICKTHRU_CHANNEL=msedge`), not a
 *   spoofed UA string.
 */
import { devices } from '@playwright/test';

/** The desktop Chrome UA only — NOT `viewport`/`deviceScaleFactor`/`isMobile`/`hasTouch`. */
const desktopUserAgent = devices['Desktop Chrome'].userAgent;

export interface ClickthruDevice {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hasTouch: true;
  isMobile: false;
}

/** Primary: Surface Pro 9 / 8 landscape — the design canvas (UI §2). */
export const surfaceLandscape: ClickthruDevice = {
  userAgent: desktopUserAgent,
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: false,
};

/** Primary portrait: 960 × 1440 — the rotation target (UI §5.3). */
export const surfacePortrait: ClickthruDevice = {
  userAgent: desktopUserAgent,
  viewport: { width: 960, height: 1440 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: false,
};

/** Desk: Surface Laptop Studio 1200 × 800 — Compact density (UI §2). */
export const desk: ClickthruDevice = {
  userAgent: desktopUserAgent,
  viewport: { width: 1200, height: 800 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: false,
};

export const DEVICE_PROFILES = { surfaceLandscape, surfacePortrait, desk } as const;

/** The profile the whole beta path runs on. */
export const PRIMARY_PROFILE = 'surfaceLandscape' as const;
