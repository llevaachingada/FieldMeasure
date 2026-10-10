/**
 * `tests/e2e/layersReorderTouch.spec.ts` — D77/F1 real-input regression gate.
 *
 * WHY THIS EXISTS
 *   The machine half of this gate was green while the feature was dead. The prior tests
 *   drove a synthetic `pointerover` on the target row — an event real touch never delivers,
 *   because Chromium **implicitly captures** the pointer to the grip (the `pointerdown`
 *   target). `Input.dispatchTouchEvent` is a genuine touch, so it reproduces the capture
 *   faithfully and would have failed before the fix (the drop was a silent no-op).
 *
 * WHAT IT DOES
 *   Seeds a real project in OPFS (a decodable 800x600 JPEG + `markup.json` with two dimensions),
 *   drives first-run once through the journey spec's folder shim, opens the project, then the
 *   sheet, opens Layers, holds the grip and drags it over the OTHER row with CDP touch, and
 *   asserts the two rows swap order.
 *
 * HISTORY OF THE OLD `fixme` (both causes fixed in the test, not in the app):
 *   1. The old harness stubbed `showDirectoryPicker` to return the OPFS root, so the app persisted
 *      a real OPFS `FileSystemDirectoryHandle` under `fm:projects-root`, and the NEXT page load
 *      died in this Chromium (renderer gone, "Target page, context or browser has been closed").
 *      `clickthruInitScript` (shared with `journey.spec.ts`) stores a string sentinel there and
 *      turns it back into the OPFS root on read, so no handle is ever deserialised at boot.
 *      (Still unverified, and still worth a hardware look: whether a REAL on-disk handle behaves
 *      the same on a Surface; OPFS handles are all a headless run can test.)
 *   2. Two stale assumptions: Home now opens the project's sheets grid, so the sheet card has to
 *      be tapped to reach the editor; and the 1x1 PNG stub is judged «Photo damaged» by the
 *      loader, so the seed writes a real JPEG (which also made the Layers panel stay empty).
 *   F1's mechanism is also covered by `tests/layersPanel.test.tsx` (pure `dropKeyAtPoint` /
 *   `rowKeyFromElement`) and `tests/layersReorder.browser.test.ts` (real `elementFromPoint`
 *   against laid-out rows); this spec is the one with a real touch.
 */
import { expect, test, type Page } from '@playwright/test';
import { clickthruInitScript } from '../clickthru/harness';

// Touch-primary: real touch input and a tablet-ish viewport (the reorder grip is 56 px).
test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

/** Working-image size of the seeded photo (geometry below is in these pixels, never normalised). */
const PHOTO_W = 800;
const PHOTO_H = 600;

const STYLE = {
  strokeColor: '#FF3B30',
  strokeWidthMu: 3,
  fillColor: null,
  fillAlpha: 1,
  lineStyle: 'solid',
  arrowheads: 'both',
  fontSizeMu: 24,
  bold: false,
};

const PROJECT_ID = 'seed-project';
const FOLDER = 'SiteA';
const SHEET_ID = 'sheet-1';

/** Writes the seeded project into the origin's OPFS root (a real FSA directory handle). */
async function seedProject(page: Page): Promise<void> {
  await page.evaluate(
    async ({ width, height, style, projectId, folder, sheetId }) => {
      const root = await navigator.storage.getDirectory();
      const projectDir = await root.getDirectoryHandle(folder, { create: true });
      const sheetsDir = await projectDir.getDirectoryHandle('sheets', { create: true });
      const sheetDir = await sheetsDir.getDirectoryHandle(sheetId, { create: true });

      const writeText = async (dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> => {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      };

      // A real, decodable JPEG: the editor's loader treats a 1x1 stub as a damaged photo.
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#556677';
      ctx.fillRect(0, 0, width, height);
      const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      const photo = await sheetDir.getFileHandle('photo.jpg', { create: true });
      const photoWriter = await photo.createWritable();
      await photoWriter.write(jpeg);
      await photoWriter.close();

      const now = new Date().toISOString();
      await writeText(
        projectDir,
        'project.json',
        JSON.stringify({
          schemaVersion: 1,
          project: {
            id: projectId,
            title: 'Seeded Site',
            unitSystem: 'imperial',
            unitFormat: 'ft-in',
            precisionDenominator: 16,
          },
          sheets: [
            {
              id: sheetId,
              title: 'Sheet 01',
              sortIndex: 0,
              imageWidth: width,
              imageHeight: height,
              calibrationPxPerFoot: null,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }),
      );

      // Two dimensions → two draggable rows in the Dimensions band. zIndex 1010 is the
      // front-most row; 1000 is behind it.
      await writeText(
        sheetDir,
        'markup.json',
        JSON.stringify({
          schemaVersion: 1,
          sheetId,
          objects: [
            {
              id: 'dim-front',
              type: 'dimension',
              geometry: { kind: 'dimension', a: { x: width * 0.1, y: height * 0.1 }, b: { x: width * 0.9, y: height * 0.1 } },
              valueMm: null,
              enteredText: null,
              style,
              zIndex: 1010,
              source: 'manual',
              assetId: null,
              groupId: null,
              locked: false,
            },
            {
              id: 'dim-back',
              type: 'dimension',
              geometry: { kind: 'dimension', a: { x: width * 0.1, y: height * 0.5 }, b: { x: width * 0.9, y: height * 0.5 } },
              valueMm: null,
              enteredText: null,
              style,
              zIndex: 1000,
              source: 'manual',
              assetId: null,
              groupId: null,
              locked: false,
            },
          ],
        }),
      );
    },
    { width: PHOTO_W, height: PHOTO_H, style: STYLE, projectId: PROJECT_ID, folder: FOLDER, sheetId: SHEET_ID },
  );
}

/** First-run once: stub the folder picker to the OPFS root, choose a hand. */
async function completeFirstRun(page: Page): Promise<void> {
  // The clickthru/journey shim: `showDirectoryPicker` returns the OPFS root, and the root-handle
  // key in IndexedDB holds a STRING sentinel that is turned back into the OPFS root on read.
  // Storing a real OPFS `FileSystemDirectoryHandle` under that key kills the renderer on the NEXT
  // load in this Chromium (the old blocker), so the handle itself is never persisted.
  await page.addInitScript(clickthruInitScript);
  await page.goto('/');
  await page.getByRole('radio').first().click();
  await page.locator('.first-run-actions .btn-primary').click();
  // Home is reached once the root handle is persisted; it may start empty.
  await expect(page.locator('h1.home-mark')).toBeVisible();
}

async function dimensionRowKeys(page: Page): Promise<string[]> {
  return page
    .locator('[data-layer-row][data-layer-group="dimensions"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-layer-row') ?? ''));
}

test('a real touch drag of the grip reorders the row (D77/F1)', async ({ page, context }) => {
  await completeFirstRun(page);

  // Seed AFTER first-run (the handle is now persisted), then reload so Home rescans.
  await seedProject(page);
  await page.reload();

  await page.getByRole('button', { name: 'Seeded Site' }).click();
  // Home opens the project's sheets grid (UI §11.2); the editor is one more tap away.
  await page.getByRole('button', { name: /^Sheet 01/ }).first().click();

  // The editor mounts, loads photo + markup, and offers Layers in the top bar.
  const layersButton = page.getByRole('button', { name: 'Layers' });
  await expect(layersButton).toBeEnabled({ timeout: 15_000 });
  await layersButton.click();

  const rows = page.locator('[data-layer-row][data-layer-group="dimensions"]');
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  const before = await dimensionRowKeys(page);
  expect(before).toHaveLength(2);
  const [frontKey, backKey] = before;

  const grip = page.locator(`[data-layer-grip="${backKey}"]`);
  const target = page.locator(`[data-layer-row="${frontKey}"]`);
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  expect(gripBox, 'grip is laid out').not.toBeNull();
  expect(targetBox, 'target row is laid out').not.toBeNull();
  if (!gripBox || !targetBox) return;

  const from = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
  const to = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  // Hold the grip past the 400 ms long-press, then move over the other row: this is a real
  // touch, so Chromium captures the pointer to the grip — the case the old `pointerover`
  // mechanism could never see.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  // The hold IS the gesture (400 ms lift): holding longer is always safe, so 550 ms has no upper
  // race, unlike an assertion that something has NOT happened yet.
  await page.waitForTimeout(550);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // The back row moved in front of the front row: their order swapped.
  await expect
    .poll(() => dimensionRowKeys(page), { timeout: 5000 })
    .toEqual([backKey, frontKey]);
});
