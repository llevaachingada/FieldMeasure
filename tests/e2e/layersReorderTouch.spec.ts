/**
 * `tests/e2e/layersReorderTouch.spec.ts` — D77/F1 real-input regression gate.
 *
 * ⚠ WRITTEN HERE, DELIBERATELY NOT RUN by the remediation lane: the lane protocol forbids
 * Playwright (`dist/` and the preview port are shared). The orchestrator runs it.
 *
 * WHY THIS EXISTS
 *   The machine half of this gate was green while the feature was dead. The prior tests
 *   drove a synthetic `pointerover` on the target row — an event real touch never delivers,
 *   because Chromium **implicitly captures** the pointer to the grip (the `pointerdown`
 *   target). `Input.dispatchTouchEvent` is a genuine touch, so it reproduces the capture
 *   faithfully and would have failed before the fix (the drop was a silent no-op).
 *
 * WHAT IT DOES
 *   Seeds a real project in OPFS (a 1×1 PNG + `markup.json` with two dimensions), drives
 *   first-run once (a stubbed `showDirectoryPicker` returns the OPFS root, a real handle),
 *   opens the sheet, opens Layers, then holds the grip and drags it over the OTHER row with
 *   CDP touch, asserting the two rows swap order.
 *
 * ⚠ OBSERVED BLOCKER — `fixme`, NOT a pass. Root cause EXECUTED in session 13 (three probes,
 *   deleted once the finding was recorded); this CORRECTS the session-12 diagnosis.
 *   The blocker is NOT "`disabled={busy}` never clears". **A page that LOADS with an OPFS
 *   `FileSystemDirectoryHandle` stored under the app's root key (`fm:projects-root`,
 *   idb-keyval) kills the renderer** in this Chromium build (Playwright 1.63 / Chrome 153,
 *   headless) — Playwright reports `Target page, context or browser has been closed` and
 *   cannot even snapshot the page.
 *   Measured, in order:
 *     A (control) `navigator.storage.getDirectory()` + a plain-object IndexedDB write → fine,
 *       page alive; `structuredClone(opfsHandle)` also succeeds.
 *     B (control) a bare `page.reload()` → fine (a service worker is registered, not
 *       controlling).
 *     C  `structuredClone(opfsHandle)` OK → `put(handle, 'fm:projects-root')` OK → page STILL
 *       ALIVE → the NEXT page load dies. So the crash is on deserialising the stored handle at
 *       boot, not on the write and not on reload itself.
 *   `FirstRun`'s only completion path persists the picked handle, so this harness cannot reach
 *   the editor at all. (The original report's "both buttons `[disabled]`" was a misreading of
 *   an ambiguous failure and is withdrawn.)
 *   ⚠ UNVERIFIED, AND IT MATTERS: whether a REAL on-disk directory handle — what a user
 *   actually picks — behaves the same is NOT established; only OPFS handles were testable
 *   headlessly. If real handles also kill the next load, this is a **product** defect in
 *   `src/settings/projectsRoot.ts`, not a harness limitation. Logged as a hardware check
 *   (`docs/HARDWARE-TEST-CHECKLIST.md`) — do not claim the product is exonerated.
 *   The real-touch proof therefore remains **OWED** (D78). F1's *mechanism* is covered by
 *   `tests/layersPanel.test.tsx` (pure `dropKeyAtPoint`/`rowKeyFromElement`) and
 *   `tests/layersReorder.browser.test.ts` (real `elementFromPoint` against laid-out rows) —
 *   but neither is a real touch, which is precisely what made F1 invisible before.
 *   Do not delete this spec: seeding the root handle is the shortest path to the gate once
 *   the handle-storage behaviour is understood.
 */
import { expect, test, type Page } from '@playwright/test';

// Touch-primary: real touch input and a tablet-ish viewport (the reorder grip is 56 px).
test.use({ hasTouch: true, viewport: { width: 1280, height: 900 } });

/** 1×1 PNG — enough for `createImageBitmap` and `isPhotoDamaged` (size > 0). */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
    async ({ png, style, projectId, folder, sheetId }) => {
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

      const binary = atob(png);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const photo = await sheetDir.getFileHandle('photo.jpg', { create: true });
      const photoWriter = await photo.createWritable();
      await photoWriter.write(bytes);
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
              imageWidth: 1,
              imageHeight: 1,
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
              geometry: { kind: 'dimension', a: { x: 0.1, y: 0.1 }, b: { x: 0.9, y: 0.1 } },
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
              geometry: { kind: 'dimension', a: { x: 0.1, y: 0.5 }, b: { x: 0.9, y: 0.5 } },
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
    { png: PNG_1X1_BASE64, style: STYLE, projectId: PROJECT_ID, folder: FOLDER, sheetId: SHEET_ID },
  );
}

/** First-run once: stub the folder picker to the OPFS root, choose a hand. */
async function completeFirstRun(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: () => navigator.storage.getDirectory(),
    });
  });
  await page.goto('/');
  await page.getByRole('radio').first().click();
  await page.locator('.first-run-actions .btn-primary').click();
  // Home is reached once the root handle is persisted; it may start empty.
  await expect(page.getByRole('heading', { level: 1, name: 'FieldMeasure' })).toBeVisible();
}

async function dimensionRowKeys(page: Page): Promise<string[]> {
  return page
    .locator('[data-layer-row][data-layer-group="dimensions"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-layer-row') ?? ''));
}

// `fixme` = written and wired, but its harness cannot yet reach the editor (see the header).
// It is a DEFERRED gate, never a pass, and it must not be deleted.
test.fixme('a real touch drag of the grip reorders the row (D77/F1)', async ({ page, context }) => {
  await completeFirstRun(page);

  // Seed AFTER first-run (the handle is now persisted), then reload so Home rescans.
  await seedProject(page);
  await page.reload();

  await page.getByRole('button', { name: 'Seeded Site' }).click();

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
