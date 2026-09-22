import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // `vite-plugin-pwa`'s virtual React entry is resolved by the plugin at build time;
  // vitest has no plugin, so alias it to a no-worker stub (slice 1.11). Without this,
  // every component test that renders `App` (which mounts `PWAUpdate`) fails to resolve.
  'virtual:pwa-register/react': fileURLToPath(
    new URL('./tests/fakes/pwaRegisterReact.ts', import.meta.url),
  ),
};

/**
 * Three projects in one config (implementation plan slice 0.1 step 9):
 *   - node    : pure domain tests            — tests/**\/*.test.ts
 *   - jsdom   : component tests              — tests/**\/*.test.tsx
 *   - browser : real canvas / Konva.Stage    — tests/**\/*.browser.test.ts
 *
 * Convention: `.test.ts` = pure/node, `.test.tsx` = component/jsdom,
 * `.browser.test.ts` = real browser. jsdom has no canvas, so anything touching
 * a `Konva.Stage` must live in the browser project (design handoff §7.1).
 */
/**
 * Mirrors the production Vite `define` (`vite.config.ts`) so the Settings build-id row
 * can be asserted against a real injected value rather than the `dev` fallback.
 * `<version>+<ISO timestamp>` is the same shape the real build emits.
 */
const TEST_BUILD_ID = '0.1.0+2026-09-22T14:03:00.000Z';

export default defineConfig({
  resolve: { alias },
  define: { __BUILD_ID__: JSON.stringify(TEST_BUILD_ID) },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          // The browser project's specs match `*.test.ts` too; keep them out of node.
          exclude: ['tests/**/*.browser.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        resolve: { alias },
        // D84's watch item, re-triggered by slice 1.9 (handoff-14 §3 trap 5): `runExport`
        // dynamically `import()`s `./pdf` (pdf-lib) and `./png` (fflate) so neither lands
        // in the main chunk. In the browser project that dynamic edge is only discovered
        // MID-RUN, so Vite re-optimizes and reloads the test iframe — which killed a
        // sibling suite on the first run. Pre-bundling the two engine deps here is the
        // D90 step-2 lever ("a build/tooling defect … a one-line `vitest.config.ts`
        // change, not another source edit").
        optimizeDeps: { include: ['@cantoo/pdf-lib', 'fflate'] },
        test: {
          name: 'browser',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          include: ['tests/**/*.browser.test.ts'],
        },
      },
    ],
  },
});
