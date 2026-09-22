/**
 * `tests/clickthru/betaPath.spec.ts` — the beta-critical path, walked once against the BUILT
 * app on the **Surface target profile**, screenshotting every step and recording the observed
 * effect of every gesture.
 *
 * Path (docs/handoff-session-21.md §3) + the amendment's gesture/rotation lab:
 *   first-run → Home → New project → camera → shutter → review → Use photo → sheets grid →
 *   open sheet → canvas dimension tap-tap → keypad → label → touch gestures → rotation gate →
 *   pen gestures → export wizard → reload persists → read the artifact out of OPFS.
 *
 * RESILIENCE: every step is wrapped by `ClickthruRun.step`, which records PASS/FAIL/UNREACHED,
 * takes a screenshot even on failure, and NEVER aborts the walk. A gesture that does nothing is
 * recorded as doing nothing — intent is never reported as result. The test only reports the
 * outcome at the very end (so a non-zero exit is honest), after the contact sheet is written.
 *
 * This file is an INSPECTION TOOL. It is not a gate and it never asserts a `[Surface]` result.
 */
import { test, type Locator, type Page } from '@playwright/test';

import {
  ClickthruRun,
  EXPORTED_DIR,
  StepFailure,
  Unreachable,
  clickthruInitScript,
  copyNewestVideo,
  opfsFirstMarkup,
  opfsList,
  opfsReadBase64,
  opfsSheetEvidence,
  waitHidden,
  waitSaved,
  waitVisible,
  writeBase64ToFile,
  writeContactSheet,
  type MarkupObjectSummary,
  type WalkStep,
} from './harness';
import { Gestures, TSettle, type Point } from './gestures';

// @ts-expect-error -- node:path types are not part of this repo's `types` array.
import { join } from 'node:path';

test.setTimeout(15 * 60 * 1000);

/** A canvas-relative fraction → a viewport point. */
function atCanvas(
  box: { x: number; y: number; width: number; height: number },
  fx: number,
  fy: number,
): Point {
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function canvasBox(page: Page) {
  const box = await page.locator('.editor-canvas').boundingBox({ timeout: 5_000 });
  if (!box) throw new Unreachable('the editor canvas has no bounding box');
  return box;
}

/** Absence-tolerant text read — short timeout so a missing element is `null`, not a 30 s wait. */
async function textOrNull(locator: Locator): Promise<string | null> {
  try {
    return await locator.first().textContent({ timeout: 1_000 });
  } catch {
    return null;
  }
}

async function activeTool(page: Page): Promise<string | null> {
  try {
    return await page.locator('[data-tool][aria-pressed="true"]').first().getAttribute('data-tool');
  } catch {
    return null;
  }
}

async function zoomText(page: Page): Promise<string | null> {
  return textOrNull(page.locator('.zoom-pill-value'));
}

async function selectionHeader(page: Page): Promise<string | null> {
  return textOrNull(page.locator('[data-testid="style-selection-header"]'));
}

async function toolbarBox(page: Page) {
  return page.locator('[data-testid="mini-toolbar"]').boundingBox({ timeout: 1_000 }).catch(() => null);
}

function sameGeometry(a: readonly MarkupObjectSummary[], b: readonly MarkupObjectSummary[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((object, index) => {
    const other = b[index]!;
    const close = (p: { x: number; y: number } | null, q: { x: number; y: number } | null): boolean =>
      p === null || q === null ? p === q : Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01;
    return object.id === other.id && object.type === other.type && close(object.a, other.a) && close(object.b, other.b);
  });
}

/** Read the markup, polling until the predicate holds (or the timeout). */
async function waitForMarkup(
  page: Page,
  predicate: (markup: readonly MarkupObjectSummary[]) => boolean,
  timeout = 6_000,
): Promise<readonly MarkupObjectSummary[]> {
  const deadline = Date.now() + timeout;
  let latest: readonly MarkupObjectSummary[] = await opfsFirstMarkup(page);
  while (Date.now() < deadline) {
    if (predicate(latest)) return latest;
    await page.waitForTimeout(250);
    latest = await opfsFirstMarkup(page);
  }
  return latest;
}

/** A cheap FNV hash of the canvas pixels — evidence that a pan moved the view. */
async function canvasSignature(page: Page): Promise<number> {
  const box = await canvasBox(page);
  const buffer = await page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: Math.round(box.height * 0.7) },
    animations: 'disabled',
  });
  let hash = 2166136261;
  for (let i = 0; i < buffer.length; i += 61) hash = ((hash ^ buffer[i]!) * 16777619) >>> 0;
  return hash;
}

/** A point a fraction `t` along the line a→b, in IMAGE coordinates. */
function alongImage(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The canvas transform is affine (pan + uniform zoom, no rotation). Two placed anchors give
 * two screen↔image correspondences, which recover it — so an object's exact current screen
 * position can be derived from its stored geometry even after snapping moved an anchor.
 * Requires the two anchors to differ on BOTH axes (the placement taps do).
 */
function imageToScreen(
  point: { x: number; y: number },
  anchorImage: { a: { x: number; y: number }; b: { x: number; y: number } },
  anchorScreen: { a: Point; b: Point },
): Point {
  const sx = (anchorScreen.b.x - anchorScreen.a.x) / (anchorImage.b.x - anchorImage.a.x);
  const sy = (anchorScreen.b.y - anchorScreen.a.y) / (anchorImage.b.y - anchorImage.a.y);
  return {
    x: anchorScreen.a.x + (point.x - anchorImage.a.x) * sx,
    y: anchorScreen.a.y + (point.y - anchorImage.a.y) * sy,
  };
}

test('beta-critical path + gesture lab on the Surface profile', async ({ page, context }) => {
  // The OPFS/`showDirectoryPicker` shim, BEFORE the first navigation (read at call time).
  await page.addInitScript(clickthruInitScript);

  // Boot once so the run can record the REAL environment it is emulating.
  await page.goto('/').catch(() => undefined);
  const env = await page
    .evaluate(() => ({
      ua: navigator.userAgent,
      dpr: window.devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
    }))
    .catch(() => ({ ua: '?', dpr: 0, touchPoints: 0 }));

  const run = new ClickthruRun(page, {
    command: 'npm run clickthru',
    baseURL: 'http://localhost:4173',
    channel: process.env.__CLICKTHRU_RESOLVED_CHANNEL,
    headed: true,
    startedAt: new Date().toISOString(),
    profile: process.env.__CLICKTHRU_PROFILE ?? 'surfaceLandscape',
    viewport: page.viewportSize() ?? undefined,
    hasTouch: env.touchPoints > 0,
    userAgent: env.ua,
    devicePixelRatio: env.dpr,
  });

  // Evidence at EVERY step: the sheet-directory listing (photo.jpg / thumb.jpg / markup.json
  // presence + sizes). Observation only — never a fix.
  run.setObserver(() => opfsSheetEvidence(page));

  // Filled in by step 5 (placement), consumed by the object gestures.
  let anchorScreen: { a: Point; b: Point } = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  let anchorImage: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
  // Filled in by the two rotation steps.
  interface RotationState {
    rail: string | null;
    dock: string | null;
    tool: string | null;
    zoom: string | null;
    selection: string | null;
  }
  let rotationBefore: RotationState | null = null;
  let rotationPortrait: RotationState | null = null;
  const gestures = await Gestures.attach(page, context);

  /** The current screen position of the dimension's 25 % point (on the body, clear of handles). */
  async function objectScreenPoint(t: number): Promise<Point> {
    const markup = await opfsFirstMarkup(page);
    const dimension = markup.find((object) => object.type === 'dimension');
    if (!dimension?.a || !dimension.b || !anchorImage) {
      throw new Unreachable('no dimension geometry / placement anchors to locate the object');
    }
    return imageToScreen(alongImage(dimension.a, dimension.b, t), anchorImage, anchorScreen);
  }

  const steps: WalkStep[] = [
    {
      name: 'first-run: hand + projects folder -> Home',
      run: async () => {
        await page.goto('/');
        await waitVisible(page.locator('h1.screen-title'), 'first-run heading', 20_000);
        await page.getByRole('radio', { name: 'Right', exact: true }).click();
        const folderButton = page.locator('.first-run-actions .btn-primary');
        await waitVisible(folderButton, 'first-run step 2 «Use Documents\\FieldMeasure» button');
        await folderButton.click();
        await waitVisible(page.locator('h1.home-mark'), 'Home heading (h1.home-mark)', 20_000);
        return 'first-run step 1 -> step 2 -> Home (h1.home-mark)';
      },
    },
    {
      name: 'New project -> capture overlay with live camera',
      run: async () => {
        await page.getByRole('button', { name: 'New project', exact: true }).click();
        await waitVisible(page.locator('.camera-shutter'), 'camera shutter (.camera-shutter)', 30_000);
        await waitVisible(
          page.locator('[data-testid="camera-resolution"]'),
          'live camera resolution readout (fake device)',
          30_000,
        );
        const resolution = await page.locator('[data-testid="camera-resolution"]').textContent();
        return `capture overlay open; live camera reports ${resolution ?? 'unknown'}`;
      },
    },
    {
      name: 'shutter -> review -> Use photo -> sheet on grid',
      run: async () => {
        await page.locator('.camera-shutter').click();
        await waitVisible(
          page.locator('.camera-review-primary'),
          'review screen «Use photo» (.camera-review-primary)',
          30_000,
        );
        await page.locator('.camera-review-primary').click();
        await waitHidden(page.locator('.camera-shutter'), 'capture overlay after «Use photo»', 60_000);
        await waitVisible(
          page.locator('[data-sheet-id] .sheet-card-open'),
          'new sheet card on the sheets grid',
          60_000,
        );
        await page.waitForTimeout(3000);
        const title = await page.locator('[data-sheet-id] .sheet-card-open').first().getAttribute('aria-label');
        const thumbRendered = await page.locator('[data-sheet-id] .sheet-card-image').count();
        return `photo saved; sheet "${title ?? '?'}" shown on the grid; card thumbnail rendered: ${
          thumbRendered > 0
        }`;
      },
    },
    {
      name: 'sheets grid -> open sheet -> editor',
      run: async () => {
        await page.locator('[data-sheet-id] .sheet-card-open').first().click();
        await waitVisible(page.locator('.editor-canvas'), 'editor canvas (.editor-canvas)', 40_000);
        await waitVisible(page.locator('[data-testid="tool-rail"]'), 'editor tool rail', 20_000);
        await waitVisible(
          page.locator('[data-testid="tool-rail"] [data-tool="dimension"]'),
          'dimension tool in the rail',
        );
        return 'editor mounted with the sheet photo canvas';
      },
    },
    {
      name: 'canvas: real touch tap-tap -> keypad -> type 12 -> commit',
      run: async () => {
        await page.locator('[data-testid="tool-rail"] [data-tool="dimension"]').click();
        const box = await canvasBox(page);
        // A DIAGONAL placement: the anchors differ on both axes, which is what lets the
        // image→screen affine map be recovered for the later object gestures.
        anchorScreen = { a: atCanvas(box, 0.35, 0.4), b: atCanvas(box, 0.65, 0.6) };

        // REAL touch via the CDP gesture library. NEVER a synthetic dispatchEvent (D77/F1).
        await gestures.tapTap(anchorScreen.a, anchorScreen.b, 300);

        // The dimension tool auto-opens the keypad after the 450 ms settle window.
        await waitVisible(
          page.locator('.keypad-sheet'),
          `dimension keypad after tap-tap + ${TSettle.SETTLE_MS} ms settle`,
          10_000,
        );
        await page.locator('[data-keypad-key="digit-1"]').click();
        await page.locator('[data-keypad-key="digit-2"]').click();
        const preview = await page.locator('.keypad-preview-value').textContent().catch(() => null);
        await page.locator('[data-keypad-key="commit"]').click();
        await waitHidden(page.locator('.keypad-sheet'), 'keypad after commit', 10_000);

        await waitSaved(page);
        const markup = await opfsFirstMarkup(page);
        const dimension = markup.find((object) => object.type === 'dimension');
        if (dimension?.a && dimension.b) anchorImage = { a: dimension.a, b: dimension.b };
        return `two real touch taps placed a diagonal dimension; keypad preview ${
          preview ?? '?'
        } committed; persisted valueMm=${String(dimension?.valueMm ?? '?')} enteredText=${JSON.stringify(
          dimension?.enteredText ?? null,
        )}`;
      },
    },

    /* ---- touch gesture lab (object gestures first, before any pan/zoom) ---- */

    {
      name: `touch: long-press ${TSettle.LONG_PRESS_MS} ms selects + pins the mini-toolbar`,
      run: async () => {
        await page.locator('[data-testid="tool-rail"] [data-tool="select"]').click();
        const mid = await objectScreenPoint(0.5);
        await gestures.longPress(mid, TSettle.LONG_PRESS_MS + 80);
        await waitVisible(
          page.locator('[data-testid="mini-toolbar"]'),
          'mini-toolbar after a 600 ms object long-press',
          8_000,
        );
        const header = await selectionHeader(page);
        const box = await toolbarBox(page);
        return `long-press selected the dimension and pinned the mini-toolbar (box x≈${Math.round(
          box?.x ?? -1,
        )},y≈${Math.round(box?.y ?? -1)}); style panel selection header: ${header ?? '?'}`;
      },
    },
    {
      name: 'touch: one-finger drag on the object moves it',
      run: async () => {
        const before = await opfsFirstMarkup(page);
        const beforeDim = before.find((object) => object.type === 'dimension');
        if (!beforeDim?.a || !beforeDim.b) throw new Unreachable('no dimension object persisted to drag');

        // Start at 25 % along the body — clear of the A/mid/B handles (which would start a
        // resize, not a move) and clear of the label.
        const from = await objectScreenPoint(0.25);
        const to: Point = { x: from.x + 140, y: from.y + 60 };
        await gestures.drag(from, to, { steps: 10 });

        const after = await waitForMarkup(page, (markup) => {
          const dim = markup.find((object) => object.type === 'dimension');
          return !dim?.a || Math.abs(dim.a.x - beforeDim.a!.x) > 0.5 || Math.abs(dim.a.y - beforeDim.a!.y) > 0.5;
        });
        const afterDim = after.find((object) => object.type === 'dimension');
        if (!afterDim?.a) throw new Unreachable('the dimension vanished during the drag');
        const dx = afterDim.a.x - beforeDim.a.x;
        const dy = afterDim.a.y - beforeDim.a.y;
        if (Math.hypot(dx, dy) < 0.5) {
          throw new StepFailure(`the one-finger drag did NOT move the object (Δ=${dx.toFixed(2)},${dy.toFixed(2)} image px)`);
        }
        return `object moved by (${dx.toFixed(2)}, ${dy.toFixed(2)}) image px — a real object-first drag on the body (not a handle)`;
      },
    },
    {
      name: 'touch: second finger mid-drag cancels and restores the object',
      run: async () => {
        const before = await opfsFirstMarkup(page);
        let midDrag: readonly MarkupObjectSummary[] = [];
        const start = await objectScreenPoint(0.25);
        const firstMove: Point = { x: start.x + 90, y: start.y };
        const second: Point = { x: start.x + 40, y: start.y + 220 };
        const finalFirst: Point = { x: start.x + 220, y: start.y };
        const finalSecond: Point = { x: start.x + 170, y: start.y + 220 };
        await gestures.secondFingerCancel(
          start,
          firstMove,
          second,
          finalFirst,
          finalSecond,
          // Pause mid-drag long enough for the autosave to land, so the displaced position is
          // observable — that proves the first finger actually grabbed the object.
          400,
          async () => {
            const beforeDim = before.find((object) => object.type === 'dimension');
            midDrag = await waitForMarkup(
              page,
              (markup) => {
                const dim = markup.find((object) => object.type === 'dimension');
                if (!dim?.a || !beforeDim?.a) return false;
                return Math.abs(dim.a.x - beforeDim.a.x) > 0.5 || Math.abs(dim.a.y - beforeDim.a.y) > 0.5;
              },
              3_000,
            );
          },
        );
        const after = await waitForMarkup(page, (markup) => sameGeometry(before, markup), 5_000);
        const grabbed = !sameGeometry(before, midDrag);
        const restored = sameGeometry(before, after);
        if (!grabbed) {
          throw new StepFailure(
            'the first finger never displaced the object, so the restore is not evidence — the drag missed the object',
          );
        }
        if (!restored) {
          throw new StepFailure(
            `the second finger did NOT restore the object: before=${JSON.stringify(
              before.find((o) => o.type === 'dimension')?.a ?? null,
            )} after=${JSON.stringify(after.find((o) => o.type === 'dimension')?.a ?? null)}`,
          );
        }
        return 'mid-drag the object was displaced (grabbed); after the second finger landed its geometry equals the pre-drag pair — drag cancelled, no commit at the displaced position';
      },
    },

    /* ---- rotation gate (UI §5.3) — while the object is still at a known position ---- */

    {
      name: 'rotation -> portrait 960×1440: dock flips to bottom, rail fixed, state survives',
      run: async () => {
        // (Re)select the object at its known screen position, then set a non-default zoom.
        const mid = await objectScreenPoint(0.5);
        await page.locator('[data-testid="tool-rail"] [data-tool="select"]').click({ timeout: 5_000 });
        await gestures.longPress(mid, TSettle.LONG_PRESS_MS + 80);
        await waitVisible(
          page.locator('[data-testid="style-selection-header"]'),
          'selection after the rotation-prep long-press',
          6_000,
        );
        let headerBefore = await selectionHeader(page);
        if (headerBefore === null) {
          await gestures.tap(mid);
          await page.waitForTimeout(300);
          headerBefore = await selectionHeader(page);
        }

        // `.zoom-pill-button` order is [zoom out, zoom in, fit]; nth(1) is zoom in.
        await page.locator('.zoom-pill .zoom-pill-button').nth(1).click({ timeout: 5_000 });
        await page.waitForTimeout(200);

        const layout = page.locator('.editor-layout');
        rotationBefore = {
          rail: await layout.getAttribute('data-rail'),
          dock: await layout.getAttribute('data-dock'),
          tool: await activeTool(page),
          zoom: await zoomText(page),
          selection: headerBefore,
        };

        await page.setViewportSize({ width: 960, height: 1440 });
        await page.waitForTimeout(700);

        const problems: string[] = [];
        if (rotationBefore.dock !== 'side') {
          problems.push(`expected dock 'side' at 1440×960, got ${rotationBefore.dock}`);
        }
        const rail = await layout.getAttribute('data-rail');
        const dock = await layout.getAttribute('data-dock');
        const tool = await activeTool(page);
        const zoom = await zoomText(page);
        const selection = await selectionHeader(page);
        rotationPortrait = { rail, dock, tool, zoom, selection };
        if (rail !== rotationBefore.rail) problems.push(`rail moved: ${rotationBefore.rail} -> ${rail}`);
        if (dock !== 'bottom') problems.push(`expected dock 'bottom' at 960×1440, got ${dock}`);
        if (tool !== rotationBefore.tool) problems.push(`tool changed: ${rotationBefore.tool} -> ${tool}`);
        if (zoom !== rotationBefore.zoom) problems.push(`zoom changed: ${rotationBefore.zoom} -> ${zoom}`);
        if (selection !== rotationBefore.selection) {
          problems.push(`selection changed: ${JSON.stringify(rotationBefore.selection)} -> ${JSON.stringify(selection)}`);
        }
        const detail = `portrait: rail ${rotationBefore.rail}->${rail}; dock ${rotationBefore.dock}->${dock}; tool ${rotationBefore.tool}->${tool}; zoom ${rotationBefore.zoom}->${zoom}; selection ${JSON.stringify(
          rotationBefore.selection,
        )}->${JSON.stringify(selection)}`;
        if (problems.length > 0) throw new StepFailure(`${problems.join(' | ')} || ${detail}`);
        return detail;
      },
    },
    {
      name: 'rotation -> landscape 1440×960: dock returns to side, state still survives',
      run: async () => {
        if (!rotationBefore || !rotationPortrait) {
          throw new Unreachable('the portrait rotation state was not captured');
        }
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.waitForTimeout(700);
        const layout = page.locator('.editor-layout');
        const rail = await layout.getAttribute('data-rail');
        const dock = await layout.getAttribute('data-dock');
        const tool = await activeTool(page);
        const zoom = await zoomText(page);
        const selection = await selectionHeader(page);

        const problems: string[] = [];
        if (dock !== 'side') problems.push(`expected dock 'side' at 1440×960, got ${dock}`);
        if (rail !== rotationBefore.rail) problems.push(`rail moved: ${rotationBefore.rail} -> ${rail}`);
        if (tool !== rotationBefore.tool) problems.push(`tool changed: ${rotationBefore.tool} -> ${tool}`);
        if (zoom !== rotationBefore.zoom) problems.push(`zoom changed: ${rotationBefore.zoom} -> ${zoom}`);
        if (selection !== rotationBefore.selection) {
          problems.push(`selection changed: ${JSON.stringify(rotationBefore.selection)} -> ${JSON.stringify(selection)}`);
        }
        const detail = `back to landscape: rail ${rotationBefore.rail}->${rail}; dock ${rotationBefore.dock}->${dock}; tool ${rotationBefore.tool}->${tool}; zoom ${rotationBefore.zoom}->${zoom}; selection ${JSON.stringify(
          rotationBefore.selection,
        )}->${JSON.stringify(selection)}`;
        if (problems.length > 0) throw new StepFailure(`${problems.join(' | ')} || ${detail}`);
        return detail;
      },
    },

    /* ---- pan / zoom gestures (no object coordinates needed) ---- */

    {
      name: 'touch: one-finger drag on empty canvas pans (geometry unchanged)',
      run: async () => {
        const box = await canvasBox(page);
        const before = await settleRead();
        const signatureBefore = await canvasSignature(page);
        const from = atCanvas(box, 0.16, 0.22);
        const to: Point = { x: from.x - 90, y: from.y + 70 };
        await gestures.drag(from, to, { steps: 10 });
        await page.waitForTimeout(700);
        const after = await settleRead();
        const signatureAfter = await canvasSignature(page);
        if (!sameGeometry(before, after)) {
          throw new StepFailure('a one-finger drag on empty canvas changed the object geometry');
        }
        if (signatureBefore === signatureAfter) {
          throw new StepFailure(
            'the canvas pixels are byte-identical after the empty-canvas drag — it did not pan',
          );
        }
        return `geometry unchanged; canvas pixels changed (signature ${signatureBefore} -> ${signatureAfter}) — a pan, not a move`;
      },
    },
    {
      name: 'touch: two-finger drag always pans',
      run: async () => {
        const box = await canvasBox(page);
        const before = await settleRead();
        const zoomBefore = await zoomText(page);
        const signatureBefore = await canvasSignature(page);
        const a = atCanvas(box, 0.2, 0.3);
        const b = atCanvas(box, 0.3, 0.35);
        await gestures.twoFingerDrag(a, b, 120, -60, { steps: 10 });
        await page.waitForTimeout(700);
        const after = await settleRead();
        const zoomAfter = await zoomText(page);
        const signatureAfter = await canvasSignature(page);
        if (!sameGeometry(before, after)) {
          throw new StepFailure('two-finger drag changed the object geometry');
        }
        if (signatureBefore === signatureAfter) {
          throw new StepFailure('the canvas pixels are byte-identical after the two-finger drag — it did not pan');
        }
        return `geometry unchanged; zoom ${zoomBefore} -> ${zoomAfter}; canvas pixels changed (signature ${signatureBefore} -> ${signatureAfter}) — the always-pan safety gesture works`;
      },
    },
    {
      name: 'touch: two-finger pinch zooms',
      run: async () => {
        const box = await canvasBox(page);
        const zoomBefore = await zoomText(page);
        const center = atCanvas(box, 0.5, 0.45);
        await gestures.pinch(center, 160, 420, { steps: 12 });
        await page.waitForTimeout(300);
        const zoomAfter = await zoomText(page);
        if (zoomBefore === zoomAfter) {
          throw new StepFailure(`pinch did not change the zoom pill (stayed ${zoomBefore ?? '?'})`);
        }
        return `zoom pill ${zoomBefore ?? '?'} -> ${zoomAfter ?? '?'}`;
      },
    },
    {
      name: 'touch: palm + finger tap (H1b shape)',
      run: async () => {
        const box = await canvasBox(page);
        const before = await settleRead();
        const zoomBefore = await zoomText(page);
        // A stationary extra touch point where a resting heel would sit, plus a finger tap in
        // the middle of the canvas. Real palm physics are NOT reproduced (see caveats).
        const palm = atCanvas(box, 0.12, 0.8);
        const finger = atCanvas(box, 0.5, 0.5);
        await gestures.palmThenTap(palm, finger);
        await page.waitForTimeout(700);
        const after = await settleRead();
        const zoomAfter = await zoomText(page);
        return `after palm+tap: objects ${before.length} -> ${after.length} (geometry ${
          sameGeometry(before, after) ? 'unchanged' : 'CHANGED'
        }), zoom ${zoomBefore} -> ${zoomAfter}`;
      },
    },

    /* ---- pen gestures (real `pointerType: 'pen'` over CDP) ---- */

    {
      name: 'pen: pressure stroke draws (freehand)',
      run: async () => {
        await page.locator('[data-testid="tool-rail"] [data-tool="freehand"]').click({ timeout: 5_000 });
        const box = await canvasBox(page);
        const before = await opfsFirstMarkup(page);
        const points = [
          atCanvas(box, 0.25, 0.72),
          atCanvas(box, 0.32, 0.78),
          atCanvas(box, 0.4, 0.7),
          atCanvas(box, 0.48, 0.8),
          atCanvas(box, 0.56, 0.72),
        ];
        await gestures.penStroke(points, { force: 0.65 });
        const after = await waitForMarkup(page, (markup) => markup.length > before.length, 6_000);
        const added = after.find((object) => !before.some((old) => old.id === object.id));
        if (!added) throw new StepFailure('the pen stroke did not create an object');
        return `pen stroke created a ${added.type} object with ${String(
          added.pointCount ?? '?',
        )} points; max pressure ${String(added.pressureMax ?? '?')} (CDP force was 0.65)`;
      },
    },
    {
      name: 'pen: hover (buttons: 0) changes nothing',
      run: async () => {
        const box = await canvasBox(page);
        const before = await opfsFirstMarkup(page);
        await gestures.penHover(atCanvas(box, 0.45, 0.4));
        await page.waitForTimeout(300);
        const after = await opfsFirstMarkup(page);
        return `pen hover delivered; objects ${before.length} -> ${after.length} (a hover commits nothing observable in the DOM or the markup)`;
      },
    },
    {
      name: 'pen: barrel button (buttons: 2)',
      run: async () => {
        // Deliberately exercised with the freehand tool still active: that is where a barrel
        // press diverging from the tip would matter.
        const box = await canvasBox(page);
        const before = await opfsFirstMarkup(page);
        await gestures.penBarrelClick(atCanvas(box, 0.5, 0.45));
        await page.waitForTimeout(500);
        const after = await waitForMarkup(page, (markup) => !sameGeometry(before, markup), 3_000);
        const created = after.length - before.length;
        return `pen barrel press (buttons: 2) with the freehand tool active: objects ${before.length} -> ${after.length} — ${
          created > 0
            ? 'the barrel press was treated as a pen contact and drew'
            : 'no object was created'
        } (the barrel is not distinguished from the tip in this build)`;
      },
    },

    /* ---- export / reload / read-out ---- */

    {
      name: 'export wizard: Scope -> Format -> Destination -> Result',
      run: async () => {
        await page.locator('[data-testid="editor-topbar"] button[aria-label="Export"]').click({ timeout: 5_000 });
        await waitVisible(page.locator('[data-testid="export-wizard"]'), 'export wizard dialog', 10_000);

        await waitVisible(page.locator('[data-testid="export-wizard-step-scope"]'), 'wizard Scope step');
        await page.locator('[data-testid="export-wizard-primary"]').click();

        await waitVisible(page.locator('[data-testid="export-wizard-step-format"]'), 'wizard Format step');
        await page.locator('[data-testid="export-wizard-format-pdf"]').click();
        await page.locator('[data-testid="export-wizard-primary"]').click();

        await waitVisible(
          page.locator('[data-testid="export-wizard-step-destination"]'),
          'wizard Destination step',
        );
        const destination = await page
          .locator('[data-testid="export-wizard-destination-path"]')
          .textContent()
          .catch(() => null);
        await page.locator('[data-testid="export-wizard-primary"]').click();

        await waitVisible(
          page.locator('[data-testid="export-wizard-step-result"]'),
          'wizard Result step (export finished)',
          180_000,
        );
        const summary = await page.locator('[data-testid="export-wizard-result-summary"]').textContent();
        return `Scope -> Format(PDF) -> Destination(${destination ?? '?'}) -> Result: ${summary ?? '?'}`;
      },
    },
    {
      name: 'reload -> project and sheet persist',
      run: async () => {
        await page.reload();
        await waitVisible(page.locator('h1.home-mark'), 'Home after reload', 30_000);
        await waitVisible(
          page.locator('.project-card-open'),
          'project card after reload (projects root persisted via the shim)',
          30_000,
        );
        const projectTitle = await page.locator('.project-card-title').first().textContent();
        await page.locator('.project-card-open').first().click();
        await waitVisible(
          page.locator('[data-sheet-id] .sheet-card-open'),
          'sheet card after reopening the project',
          40_000,
        );
        await page.waitForTimeout(3000);
        const sheetName = await page.locator('.sheet-card-name').first().textContent();
        const sheetMeta = await page.locator('.sheet-card-meta').first().textContent();
        const thumbRendered = await page.locator('[data-sheet-id] .sheet-card-image').count();
        return `reload -> Home -> project "${projectTitle ?? '?'}" -> sheet "${sheetName ?? '?'}" (${
          sheetMeta ?? '?'
        }); card thumbnail rendered: ${thumbRendered > 0}`;
      },
    },
    {
      name: 'read exported PDF (+ markup + thumb) out of OPFS',
      run: async () => {
        const entries = await opfsList(page);
        const pdfs = entries.filter((entry) => entry.path.toLowerCase().endsWith('.pdf'));
        if (pdfs.length === 0) {
          throw new Unreachable(
            `no exported PDF in OPFS. Tree: ${entries.map((entry) => entry.path).join(', ') || '(empty)'}`,
          );
        }

        let firstBytes: number[] = [];
        const written: string[] = [];
        for (const pdf of pdfs) {
          const data = await opfsReadBase64(page, pdf.path);
          const name = pdf.path.split('/').pop() ?? 'export.pdf';
          const size = writeBase64ToFile(data.base64, join(EXPORTED_DIR, name));
          firstBytes = data.firstBytes;
          written.push(`${name} (${size} B)`);
        }
        const isPdf =
          firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && firstBytes[2] === 0x44 && firstBytes[3] === 0x46;
        if (!isPdf) {
          throw new StepFailure(`exported file magic was ${JSON.stringify(firstBytes)} — expected %PDF`);
        }

        const markup = await opfsFirstMarkup(page);
        const byType = markup.reduce<Record<string, number>>((acc, object) => {
          acc[object.type] = (acc[object.type] ?? 0) + 1;
          return acc;
        }, {});
        const dimension = markup.find((object) => object.type === 'dimension');
        const markupNote = `markup: ${markup.length} object(s) ${JSON.stringify(byType)}; dimension valueMm=${String(
          dimension?.valueMm ?? '?',
        )} enteredText=${JSON.stringify(dimension?.enteredText ?? null)}`;

        const thumbs = entries.filter((entry) => entry.path.toLowerCase().endsWith('thumb.jpg'));
        const thumbNote =
          thumbs.length > 0
            ? `thumb.jpg present [${thumbs.map((entry) => `${entry.path}:${entry.size}B`).join(', ')}]`
            : 'thumb.jpg ABSENT (grid card can only show its placeholder)';
        return `${written.join(', ')}; magic=%PDF; ${markupNote}; ${thumbNote}`;
      },
    },
  ];

  /** Let any pending write land, then read the markup (for "unchanged" comparisons). */
  async function settleRead(): Promise<readonly MarkupObjectSummary[]> {
    await page.waitForTimeout(700);
    await waitSaved(page);
    return opfsFirstMarkup(page);
  }

  let contactSheet = '';
  try {
    await run.walk(steps);
  } finally {
    contactSheet = writeContactSheet(run);
  }

  // eslint-disable-next-line no-console
  console.log(`[clickthru] RESULT ${run.summary()}`);
  // eslint-disable-next-line no-console
  console.log(`[clickthru] run.json:     ${run.logPath}`);
  // eslint-disable-next-line no-console
  console.log(`[clickthru] contact sheet: ${contactSheet}`);
  // eslint-disable-next-line no-console
  console.log(`[clickthru] artifacts:    ${EXPORTED_DIR.replace(/\\exported$/, '')}`);

  const failed = run.steps.filter((step) => step.status !== 'PASS');
  if (failed.length > 0) {
    // The walk already continued past every failure and the artifacts are written; this is
    // only the honest exit code so the owner notices without opening the sheet.
    throw new Error(
      `clickthru had ${failed.length} non-PASS step(s): ${failed
        .map((step) => `${step.index} ${step.status}`)
        .join(', ')}. Open the contact sheet.`,
    );
  }
});

test.afterAll(async () => {
  const cwd = (process as unknown as { cwd(): string }).cwd();
  const video = copyNewestVideo(join(cwd, 'test-results', 'clickthru', 'playwright'));
  // eslint-disable-next-line no-console
  console.log(video ? `[clickthru] video:        ${video}` : '[clickthru] video:        none recorded');
});
