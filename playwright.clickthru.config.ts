import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

import { PRIMARY_PROFILE, surfaceLandscape } from './tests/clickthru/devices';

/**
 * `playwright.clickthru.config.ts` — the CLICKTHRU HARNESS (inspection tool, NOT a gate).
 *
 * One command: `npm run clickthru`. It builds the app, then opens a REAL Chrome window and
 * walks the beta-critical path while screenshotting every step. It is deliberately separate
 * from `playwright.config.ts` (the e2e GATE) and never touches it.
 *
 * WHY IT EXISTS (docs/handoff-session-21.md §6 item 3): the machine gate proves the wiring
 * it asserts; it has never driven the built app end to end. This harness drives the BUILT
 * app (`vite preview`, port 4173) because `npm run dev` can never render styled — the
 * shipped CSP `style-src 'self'` blocks Vite's dev-injected inline styles (D105).
 *
 * It is HEADED and it never needs focus: the run is watched in its own Chrome window while
 * the owner does other things. It must never be run headless — the point is the pixels.
 */

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    : '',
];

/**
 * Prefer the installed Chrome (the owner's real browser); fall back to Playwright's bundled
 * Chromium when Chrome is absent. Never let a missing Chrome crash the run.
 *
 * `CLICKTHRU_CHANNEL` overrides both. Set it to **`msedge`** for the **fidelity run**: a
 * Surface ships Edge, and H10/H17 reference the "target Edge build". `chrome` stays the
 * default so the owner gets a familiar, watchable window.
 */
function resolveChannel(): string | undefined {
  const override = process.env.CLICKTHRU_CHANNEL;
  if (override && override.trim() !== '') return override.trim();
  return CHROME_CANDIDATES.some((p) => p !== '' && existsSync(p)) ? 'chrome' : undefined;
}

const channel = resolveChannel();

// Expose the run's shape to the worker so `run.json` records exactly what ran.
process.env.__CLICKTHRU_RESOLVED_CHANNEL = channel ?? 'bundled-chromium';
process.env.__CLICKTHRU_PROFILE = PRIMARY_PROFILE;

export default defineConfig({
  testDir: 'tests/clickthru',
  fullyParallel: false,
  workers: 1,
  // One whole-run test: a retry would double every screenshot and confuse the log.
  retries: 0,
  forbidOnly: false,
  reporter: [['list']],
  // Playwright wipes its own output dir at run start. Keep it clear of `latest/` so the
  // curated artifacts (screenshots, run.json, contact sheet, video copy) are never deleted.
  outputDir: 'test-results/clickthru/playwright',
  timeout: 10 * 60 * 1000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: 'http://localhost:4173',
    // The Surface target profile (UI §2): 1440×960 @ DPR 2, real touch, DESKTOP UA and
    // `isMobile: false` — a Windows tablet, never a phone. See `tests/clickthru/devices.ts`.
    ...surfaceLandscape,
    // HEADED, always. The owner watches this window; the agent reviews the screenshots.
    headless: false,
    // Slow enough for a human to follow a step, fast enough to finish a run.
    slowMo: 250,
    launchOptions: {
      // Chromium's fake camera: a real MediaStream without a physical webcam, so the
      // capture overlay actually renders a live viewfinder (background proof 6).
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    // A real captured video of the whole run, kept beside the screenshots.
    video: 'on',
    // Screenshots are taken explicitly, one per step, by the harness (`step()`).
    screenshot: 'off',
    trace: 'off',
    ...(channel ? { channel } : {}),
  },

  projects: [
    {
      name: 'clickthru',
      use: {},
    },
  ],

  webServer: {
    command: 'npm run preview',
    port: 4173,
    // UNCONDITIONALLY true (AGENTS/handoff trap 5): a preview server left running from a
    // previous session is normal and expected — a run must never fail on a port collision.
    reuseExistingServer: true,
  },
});
