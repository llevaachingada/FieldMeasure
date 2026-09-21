import { expect, test } from '@playwright/test';

/**
 * CSP-as-a-test (implementation plan slice 0.1 step 11; design handoff §7.2).
 *
 * `style-src 'self'` forbids inline `style=""` attributes and blocks
 * `setAttribute('style', …)` / `el.style.cssText = …`. Konva is safe because it
 * assigns CSSOM properties (`el.style.x = …`), which the directive permits — this
 * spec proves it mechanically rather than assuming it.
 *
 * Runs at both real viewports with deviceScaleFactor 2.
 */
const viewports = [
  { name: 'landscape', width: 1440, height: 960 },
  { name: 'portrait', width: 960, height: 1440 },
] as const;

for (const viewport of viewports) {
  test.describe(`CSP (${viewport.name})`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });

    test('no inline style attributes and zero CSP violations', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));

      await page.addInitScript(() => {
        const w = window as unknown as { __cspViolations: string[] };
        w.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          w.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });

      await page.goto('/');
      await expect(page.locator('#root')).toContainText('Field Measure');

      // A non-zero count means an inline `style=""` attribute reached the DOM.
      expect(await page.locator('[style]').count()).toBe(0);

      const violations = await page.evaluate(
        () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
      );
      expect(violations).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  });
}
