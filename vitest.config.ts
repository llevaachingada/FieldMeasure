import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
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
export default defineConfig({
  resolve: { alias },
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
