/**
 * D143: the journey gate. Screen-to-screen transitions that no unit test covers:
 * first run → new project → capture → editor → edit → back to the grid → Home.
 * Uses the clickthru's OPFS folder shim and CDP pen helper. It is NOT the clickthru (that stays
 * an inspection tool). This is a small, headless, deterministic gate.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickthruInitScript, opfsFirstMarkup } from '../clickthru/harness';
import { Gestures } from '../clickthru/gestures';

test.use({
  viewport: { width: 1440, height: 960 },
  hasTouch: true,
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  },
});

async function toEditorWithOneSheet(page: Page, name: string): Promise<void> {
  await page.addInitScript(clickthruInitScript);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Right', exact: true }).click();
  await page.locator('.first-run-actions .btn-primary').click();
  await expect(page.locator('h1.home-mark')).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill(name);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('.camera-shutter')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // the fake camera stream needs a moment before the shutter captures a frame
  await page.locator('.camera-shutter').click();
  await page.locator('.camera-review-primary').click({ timeout: 30_000 });
  await page.locator('[data-sheet-id] .sheet-card-open').first().click({ timeout: 60_000 });
  await expect(page.locator('.editor-canvas')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(1000); // the photo decode + fit settle before input
}

async function penStrokeOnCanvas(page: Page, gestures: Gestures): Promise<void> {
  await page.locator('[data-testid="tool-rail"] [data-tool="freehand"]').click();
  const box = (await page.locator('.editor-canvas').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  await gestures.penStroke([at(0.3, 0.5), at(0.4, 0.6), at(0.5, 0.5), at(0.6, 0.6)], { force: 0.6 });
}

test('editor → Projects returns to a working grid (F2)', async ({ page }) => {
  await toEditorWithOneSheet(page, 'Journey grid');
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.project-error-line')).toHaveCount(0);
});

test('an edit made just before leaving is saved (F1)', async ({ page, context }) => {
  await toEditorWithOneSheet(page, 'Journey save');
  const gestures = await Gestures.attach(page, context);
  await penStrokeOnCanvas(page, gestures);
  // No wait: tap Projects inside the 400 ms autosave coalesce window.
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
  await expect.poll(async () => (await opfsFirstMarkup(page)).length, { timeout: 5_000 }).toBe(1);
});

test('grid → Home → reopen still loads the sheet', async ({ page }) => {
  await toEditorWithOneSheet(page, 'Journey reopen');
  await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
  await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Back to Projects' }).click();
  await expect(page.locator('h1.home-mark')).toBeVisible();
  await page.getByRole('button', { name: 'Journey reopen' }).click();
  await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
});
