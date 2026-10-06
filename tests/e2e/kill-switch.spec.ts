/**
 * tests/e2e/kill-switch.spec.ts — slice 1.2 gate: "power-loss mid-write → reload: previous
 * file intact, no corruption" (implementation plan §1.2, build order step 11).
 *
 * WHY THIS IS A REAL HARNESS, NOT A STUB
 * The invariants this slice owns are properties of the WRITE PRIMITIVE, and the primitive
 * does not need the app UI: OPFS is real in Chromium, and `Page.crash` (CDP) is a genuine
 * renderer crash — not a polite `page.close()`. So these tests build the same
 * tmp→`createWritable()`→`close()`→`move()` sequence the app uses, kill the renderer at each
 * window, reopen the origin, and assert the TARGET still holds the last valid bytes.
 *
 * They also discharge §5.3's build-order obligation to "verify on the target build" that
 * `FileSystemFileHandle.move()` exists and overwrites in place — no copy+delete fallback is
 * permitted (§5.6), so if this test fails, the app must NOT be "fixed" by copying files.
 *
 * HUMAN PROCEDURE for the [Surface] half of the gate (cannot be automated: it needs the real
 * app + Edge on a Surface, which lands with the project UI in later slices). Run it manually
 * against the target build and log the result in docs/archive/HARDWARE-TEST-CHECKLIST.md:
 *   1. Create a project, add a sheet, draw a dimension, let the chip reach «Saved».
 *   2. Kill the power (or Task Manager → End task) while the chip reads «Saving…»:
 *      2a. during a markup.json write, 2b. during the first photo.jpg write, 2c. as a
 *      rename is happening (force it by editing while Dropbox/antivirus touches the folder).
 *   3. Reload. Assert: the previous markup.json parses and shows the pre-kill annotations; the
 *      sheet opens; the chip returns to «Saved»; and a full-tree search for `*.tmp` under the
 *      project folder (including sheets/<n>/ and assets/) finds none AFTER the 5-minute age
 *      window (cleanStaleTmp keeps a fresher tmp on purpose — it may belong to another tab).
 */
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { clickthruInitScript } from '../clickthru/harness';
import { Gestures } from '../clickthru/gestures';

// The in-app test below needs a touch viewport and the fake camera; the other tests ignore both.
test.use({
  viewport: { width: 1440, height: 960 },
  hasTouch: true,
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
  },
});

/** Helpers installed before every navigation, on both sides of the crash. */
const OPFS_HELPERS = `
(() => {
  const DIR = 'fm-killswitch';
  const getDir = async (create) => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: !!create });
  };
  const read = async (name) => {
    try {
      const dir = await getDir(false);
      const fh = await dir.getFileHandle(name, { create: false });
      return await (await fh.getFile()).text();
    } catch { return null; }
  };
  const names = async () => {
    try {
      const dir = await getDir(false);
      const out = [];
      for await (const [n] of dir.entries()) out.push(n);
      return out.sort();
    } catch { return []; }
  };
  // The app's atomic write (§5.3): tmp → write → close → move over the target.
  const writeAtomic = async (name, text) => {
    const dir = await getDir(true);
    const tmp = await dir.getFileHandle(name + '.tmp', { create: true });
    const stream = await tmp.createWritable();
    await stream.write(text);
    await stream.close();
    await tmp.move(name);
  };
  // Crash window 1: the process dies while writing the TMP (before close()).
  const crashDuringWrite = async (name, text) => {
    const dir = await getDir(true);
    const tmp = await dir.getFileHandle(name + '.tmp', { create: true });
    const stream = await tmp.createWritable();
    await stream.write(text);
    window.__fmArmed = true;        // the write window is open: the caller may crash now
    await new Promise(() => {});   // caller crashes the renderer
  };
  // Crash window 2: the tmp is closed and valid, but move() has not run yet.
  const crashBeforeMove = async (name, text) => {
    const dir = await getDir(true);
    const tmp = await dir.getFileHandle(name + '.tmp', { create: true });
    const stream = await tmp.createWritable();
    await stream.write(text);
    await stream.close();
    window.__fmArmed = true;        // closed, not yet moved: the caller may crash now
    await new Promise(() => {});   // caller crashes the renderer
  };
  window.__fm = { read, names, writeAtomic, crashDuringWrite, crashBeforeMove };
})();
`;

interface FmHelpers {
  read(name: string): Promise<string | null>;
  names(): Promise<string[]>;
  writeAtomic(name: string, text: string): Promise<void>;
  crashDuringWrite(name: string, text: string): Promise<void>;
  crashBeforeMove(name: string, text: string): Promise<void>;
}

const readTarget = async (
  page: Page,
): Promise<{ content: string | null; names: string[] }> =>
  page.evaluate(async () => {
    const helper = (window as unknown as { __fm: FmHelpers }).__fm;
    return { content: await helper.read('markup.json'), names: await helper.names() };
  });

/** Wait until the page says the crash window is open (replaces a fixed 300 ms sleep). */
const waitArmed = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => (window as unknown as { __fmArmed?: boolean }).__fmArmed === true);

async function crash(page: Page, context: BrowserContext): Promise<void> {
  const session = await context.newCDPSession(page);
  // `Page.crash` never answers: the renderer that would reply is the thing it kills, so
  // `await session.send(...)` hangs until the test timeout (this was the old "CDP crash flow
  // times out" FIXME). Fire it, and wait for Playwright's own `crash` event instead — that is the
  // real signal that the renderer is gone, so no fixed sleep is needed either.
  const crashed = new Promise<void>((resolve) => page.once('crash', () => resolve()));
  void session.send('Page.crash').catch(() => undefined);
  await crashed;
}

/** A fresh page on the same origin/context: OPFS survives the renderer crash. */
async function reopen(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(OPFS_HELPERS);
  await page.goto('/');
  return page;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(OPFS_HELPERS);
  await page.goto('/');
});

test('FileSystemFileHandle.move() exists and overwrites the target in place (§5.3)', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const helper = (window as unknown as { __fm: FmHelpers }).__fm;
    await helper.writeAtomic('markup.json', '{"v":1}');
    await helper.writeAtomic('markup.json', '{"v":2}');
    return { content: await helper.read('markup.json'), names: await helper.names() };
  });

  // If either assertion fails on the target Edge build, record it in DECISIONS and gate the
  // rename — NEVER replace it with copy+delete (§5.6 forbids that data-loss path).
  expect(result.content).toBe('{"v":2}');
  expect(result.names).toEqual(['markup.json']); // the rename consumed the tmp
});

// These three drive a REAL renderer crash (CDP `Page.crash`) inside each write window, reopen the
// origin in a fresh page, and assert the target kept its last valid bytes. They were `fixme`
// because the crash flow timed out: the cause was `crash()` awaiting `Page.crash`'s reply, which
// can never arrive (see `crash()` above), not Chromium/Playwright. The tmp-write sequence is the
// app's own (§5.3); the real power-loss half stays the [Surface] gate (docs/FIELD-TEST.md 11-13).
test('kill-switch: crash mid-write leaves the previous file intact', async ({ page, context }) => {
  await page.evaluate(async () => {
    await (window as unknown as { __fm: FmHelpers }).__fm.writeAtomic('markup.json', '{"good":1}');
  });
  // Start a second write and crash the renderer inside it (before close()).
  await page.evaluate(() => {
    void (window as unknown as { __fm: FmHelpers }).__fm.crashDuringWrite('markup.json', '{"partial":');
  });
  await waitArmed(page);
  await crash(page, context);

  const check = await reopen(context);
  const after = await readTarget(check);

  expect(after.content).toBe('{"good":1}'); // the previous valid file, byte for byte
  // A surviving tmp is legal (an in-flight write in another tab looks identical); what is
  // NOT legal is the target holding a truncated or partial value.
  expect(after.content).not.toContain('partial');
  await check.close();
});

test('kill-switch: crash between close() and move() still leaves the target valid', async ({ page, context }) => {
  await page.evaluate(async () => {
    await (window as unknown as { __fm: FmHelpers }).__fm.writeAtomic('markup.json', '{"good":2}');
  });
  await page.evaluate(() => {
    void (window as unknown as { __fm: FmHelpers }).__fm.crashBeforeMove('markup.json', '{"closed-not-moved":1}');
  });
  await waitArmed(page);
  await crash(page, context);

  const check = await reopen(context);
  const after = await readTarget(check);

  expect(after.content).toBe('{"good":2}'); // close() alone never publishes; only move() does
  expect(after.content).not.toContain('closed-not-moved');
  await check.close();
});

test('kill-switch: a photo (Blob) write is atomic on the same pattern (§5.3)', async ({ page, context }) => {
  const photo = async (marker: string): Promise<void> => {
    await page.evaluate(async (bytes) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('fm-killswitch-photo', { create: true });
      const tmp = await dir.getFileHandle('photo.jpg.tmp', { create: true });
      const stream = await tmp.createWritable();
      await stream.write(new Uint8Array(bytes));
      await stream.close();
      await (tmp as unknown as { move(name: string): Promise<void> }).move('photo.jpg');
    }, Array.from(new TextEncoder().encode(marker)));
  };

  await photo('GOODPHOTO');
  await page.evaluate(() => {
    void (async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('fm-killswitch-photo', { create: true });
      const tmp = await dir.getFileHandle('photo.jpg.tmp', { create: true });
      const stream = await tmp.createWritable();
      await stream.write(new Uint8Array([80, 65, 82, 84])); // "PART", never closed
      (window as unknown as { __fmArmed: boolean }).__fmArmed = true;
      await new Promise(() => {});
    })();
  });
  await waitArmed(page);
  await crash(page, context);

  const check = await reopen(context);
  const sizeAfter = await check.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('fm-killswitch-photo', { create: false });
    const fh = await dir.getFileHandle('photo.jpg', { create: false });
    const file = await fh.getFile();
    return { size: file.size, text: await file.text() };
  });

  expect(sizeAfter.text).toBe('GOODPHOTO'); // the photo is never truncated by a crash
  expect(sizeAfter.size).toBe('GOODPHOTO'.length);
  await check.close();
});

/**
 * The app-level half of the gate, driven through the REAL app (the journey spec's OPFS folder
 * shim and pen helper): draw stroke 1 and let it save (chip «Saved», `markup.json` holding 1
 * object), then arm the crash window and draw stroke 2. The app has no crash-point hook, so the
 * window is pinned from outside: `FileSystemFileHandle.prototype.move` is wrapped so that, for
 * `markup.json.tmp`, it raises `window.__fmArmed` and never returns, i.e. the power dies exactly as
 * the autosave publishes. We then crash the renderer (CDP `Page.crash`), reopen the origin and
 * assert `markup.json` is still the pre-kill document (valid JSON, exactly stroke 1, no partial
 * write) and that the project still opens to its sheet. Zero `*.tmp` is deliberately NOT asserted:
 * `cleanStaleTmp` keeps a tmp younger than 5 minutes, since it may belong to another tab.
 *
 * History: this was `fixme` because a second edit never reached disk (chip stuck on «Saving…»).
 * That was a real app bug (history-snapshot prune waited on the session lease lock), fixed in
 * `src/fs/projectStore.ts`; regression test in `tests/fileSafety.test.ts`. The real power-loss
 * half stays with docs/FIELD-TEST.md checks 11-13.
 */
test('kill-switch: power-loss mid-autosave in the running app leaves the project loadable', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const chip = (p: Page) => p.locator('[data-testid="autosave-chip"]');
  const readMarkup = (p: Page): Promise<string | null> =>
    p.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const walk = async (dir: FileSystemDirectoryHandle): Promise<string | null> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          if (handle.kind === 'file' && name === 'markup.json') {
            return (await (handle as FileSystemFileHandle).getFile()).text();
          }
          if (handle.kind === 'directory' && !name.startsWith('.')) {
            const hit = await walk(handle as FileSystemDirectoryHandle);
            if (hit !== null) return hit;
          }
        }
        return null;
      };
      return walk(root);
    });
  const objectCount = (text: string | null): number =>
    text === null ? -1 : (JSON.parse(text) as { objects: unknown[] }).objects.length;

  await page.addInitScript(clickthruInitScript);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Right', exact: true }).click();
  await page.locator('.first-run-actions .btn-primary').click();
  await expect(page.locator('h1.home-mark')).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Kill switch');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('.camera-shutter')).toBeVisible({ timeout: 30_000 });
  // The fake camera needs a first frame before the shutter can capture one.
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.readyState ?? 0), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  await page.locator('.camera-shutter').click();
  await page.locator('.camera-review-primary').click({ timeout: 30_000 });
  await expect(page.locator('.editor-canvas')).toBeVisible({ timeout: 40_000 });

  const gestures = await Gestures.attach(page, context);
  await page.locator('[data-testid="tool-rail"] [data-tool="freehand"]').click();
  const stroke = async (dy: number): Promise<void> => {
    const box = (await page.locator('.editor-canvas').boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * (fy + dy) });
    await gestures.penStroke([at(0.3, 0.3), at(0.4, 0.4), at(0.5, 0.3)], { force: 0.6 });
  };

  // 1. Stroke 1, fully saved: this is the "previous file" the crash must not damage.
  await stroke(0);
  await expect(chip(page)).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
  await expect.poll(async () => objectCount(await readMarkup(page)), { timeout: 10_000 }).toBe(1);
  const before = await readMarkup(page);

  // 2. Arm: the NEXT publish of markup.json raises the flag and never completes.
  await page.evaluate(() => {
    const proto = FileSystemFileHandle.prototype as unknown as {
      move: (this: FileSystemFileHandle, ...args: unknown[]) => Promise<void>;
    };
    const original = proto.move;
    proto.move = function (this: FileSystemFileHandle, ...args: unknown[]): Promise<void> {
      if (this.name === 'markup.json.tmp') {
        (window as unknown as { __fmArmed: boolean }).__fmArmed = true;
        return new Promise<void>(() => {}); // the "power loss": the rename never completes
      }
      return original.apply(this, args);
    };
  });
  await stroke(0.3);
  await waitArmed(page);
  await crash(page, context);

  // 3. Fresh page, same origin: the target is byte-for-byte the pre-kill document.
  const check = await context.newPage();
  await check.addInitScript(clickthruInitScript);
  await check.goto('/');
  const after = await readMarkup(check);
  expect(after).toBe(before);
  expect(objectCount(after)).toBe(1);
  await expect(check.locator('h1.home-mark')).toBeVisible({ timeout: 20_000 });
  await check.getByRole('button', { name: 'Kill switch' }).click();
  await expect(check.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 15_000 });
  await expect(check.locator('.project-error-line')).toHaveCount(0);
  await check.close();
});
