/**
 * D173: Settings → «Third-party notices» opens the notices, online AND offline.
 *
 * The service worker's single-page-app fallback answered every navigation, including
 * `third-party-notices.txt`, with the app shell, so the row "opened" the app again. The fix
 * precaches `.txt` and keeps `.txt` out of the navigation fallback. This drives the real built
 * app with its real service worker.
 */
import { expect, test } from '@playwright/test';

test.use({
  launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
});

test('the notices open as text, online and offline, not as the app', async ({ page, context }) => {
  await page.goto('/');
  // The app registers its service worker on load; with registerType 'prompt' it does not claim
  // the page that installed it, so wait for it to activate, then reload to come under control.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const online = await page.goto('/third-party-notices.txt');
  expect(online?.headers()['content-type'] ?? '').not.toContain('text/html');
  await expect(page.locator('body')).toContainText('Third-party notices');
  await expect(page.locator('#root')).toHaveCount(0); // not the app shell

  await context.setOffline(true);
  await page.goto('/third-party-notices.txt');
  await expect(page.locator('body')).toContainText('Third-party notices');
  await expect(page.locator('body')).toContainText('SIL Open Font License');
  await expect(page.locator('#root')).toHaveCount(0);
  await context.setOffline(false);
});
