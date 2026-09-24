import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright harness (implementation plan slice 0.1 step 10).
 * Chromium only (the target is Edge/Chromium). Runs against `vite preview`
 * on port 4173 (build spec §21.1 part 1). This is the harness for three later
 * gates: slice 1.2's kill-switch, 1.3's zoom-constancy screenshot diff and
 * 1.9's export invariance.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // D143: a container whose Playwright build has no matching bundled browser can point at a local
    // Chromium. Unset (the Windows build machine), nothing changes.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
