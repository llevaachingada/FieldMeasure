import { expect, test } from '@playwright/test';

// Proves the Playwright harness runs against `vite preview` (build spec §21.1 part 1).
test('app loads and mounts #root', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Field Measure');
  await expect(page.locator('#root')).toContainText('Field Measure');
});
