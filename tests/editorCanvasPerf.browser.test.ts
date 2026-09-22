/**
 * tests/editorCanvasPerf.browser.test.ts — C4's **machine half** (checkpoint measurement,
 * not a feature). See `docs/CHECKPOINTS.md` C4 and `docs/handoff-session-12.md` Part B2.
 *
 * WHAT C4 ASKS
 * ------------
 * "markup-layer redraw time while panning a 4096-px sheet carrying ~50 annotations, at
 * `pixelRatio = min(devicePixelRatio, 2)`. Report the median frame time."
 *
 * The §21.8 decision ladder (≤16 ms keep; >16 ms drop the overlay layer to 1, re-measure,
 * then markup to 1.5, then 1) is a **Surface Go** decision. This file does NOT decide it
 * and does NOT assert the 16 ms bar. It produces a **dev-machine number, recorded
 * PROVISIONAL, never a pass**. `min(dpr, 2)` ships until hardware says otherwise.
 *
 * WHY THIS FILE EXISTS IN THE SUITE, AND WHAT IT MAY ASSERT
 * ---------------------------------------------------------
 * The measurement must not become a brittle gate. The only persistent assertion here is a
 * generous, explicitly-documented **catastrophic ceiling** (`CATASTROPHIC_MEDIAN_MS`) that
 * would only trip on a hang or an accidental per-frame blow-up (e.g. ink regenerated on
 * every pan frame). It is deliberately ~25× the ladder's 16 ms bar. The failing/passing of
 * the ladder is hardware's; the reported medians/p95 are the artefact.
 *
 * HARNESS DESIGN
 * --------------
 *   - A real `EditorCanvas` (real Konva.Stage, no jsdom — D40) with a host element, and a
 *     real `MarkupScene` populated with exactly 50 annotations across the kinds the
 *     checkpoint names: dimensions, rect/ellipse, line/arrow, angle, text, and freehand +
 *     highlighter ink paths. Geometry is spread over a **4096-px working image**.
 *   - A pan loop: `canvas.panBy(2, 0)` then `canvas.markupLayer.draw()`, each frame timed
 *     with `performance.now()`. The first `WARMUP_FRAMES` (20) are discarded; the median
 *     and p95 are taken over `MEASURED_FRAMES` (100 ≥ 60) frames. The loop is synchronous,
 *     so the `requestAnimationFrame` that `panBy` schedules cannot fire between samples —
 *     the timed interval is exactly `panBy` + the forced markup-layer redraw.
 *   - View: 100 % zoom, 1024 × 768 viewport (the sheet is larger than the viewport, so
 *     panning is real). The photo layer is present but is never force-drawn in the loop.
 *
 * TWO RATIOS, HONESTLY LABELLED
 * -----------------------------
 * ⚠ The brief for this checkpoint assumed headless Chromium has `devicePixelRatio === 1`.
 * **Executed, it reports `devicePixelRatio === 2`** on this machine, so the honest real
 * path (`min(dpr, 2)`) is itself **ratio 2**, and ratio 1 can only be measured by forcing
 * the option. That flip is recorded here rather than papered over.
 *
 *   - **ratio 1** — **forced by option** `markupPixelRatio: () => 1`. This is the ladder's
 *     bottom rung (§21.8's last drop). It is NOT the real path here, because dpr is 2.
 *   - **ratio 2** — **forced by option** `markupPixelRatio: () => 2`. This is the ratio the
 *     §21.8 ladder would drop, so it is the number relevant to a Surface Go. Forced by
 *     option, not by a DPR-2 device.
 *   - A third test measures the **real unmodified path** and asserts the markup layer's
 *     actual `getPixelRatio()` equals `Math.min(window.devicePixelRatio || 1, 2)` (which is
 *     2 here, so it cross-checks the forced ratio-2 number).
 *
 * MEASURED (PROVISIONAL) — dev machine, session 12
 * -----------------------------------------------
 * Recorded numbers live in the console block emitted by `report()` and in the run's summary
 * message; they are hardware-dependent and are NOT re-asserted. Measured 2026-09-22 on
 * Intel Core Ultra 5 335, 8 cores / 8 logical, Windows 11 Pro x64, Node 24.19.0,
 * Playwright/Chromium 1.63.0 (headless, Chromium 1243 / Chrome 153.0.0.0),
 * `window.devicePixelRatio === 2`, 1024 × 768 viewport, 4096-px sheet, exactly 50
 * annotations, 20 warm-up frames discarded, 100 measured frames. Three runs:
 *
 *   ratio 1 (forced by option)          median 0.7–0.8 ms · p95 1.5–1.7 ms
 *   ratio 2 (forced by option)          median 0.8–0.9 ms · p95 1.6–1.9 ms
 *   real min(dpr, 2) = 2 (unmodified)   median 0.6–0.7 ms · p95 1.2–2.0 ms
 *
 * The §21.8 ≤16 ms bar is **not tripped on this dev machine** at either ratio — but this is
 * a dev-machine number, NOT a Surface Go result, and must never be recorded as a pass.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EditorCanvas } from '../src/editor/EditorCanvas';
import { MarkupScene } from '../src/editor/shapes/scene';
import { DEFAULT_STYLE } from '../src/domain/types';
import type { AnnotationStyle, AnnotationType, Geometry } from '../src/domain/types';

/** The sheet is 4096 px on a side; annotations are laid out on a 7 × 8 grid of 512-px cells. */
const SHEET_PX = 4096;
const CELL_PX = 512;
const GRID_COLS = 7;
const HOST_W = 1024;
const HOST_H = 768;
const ANNOTATION_COUNT = 50;
const WARMUP_FRAMES = 20;
const MEASURED_FRAMES = 100;
const PAN_STEP_PX = 2;

/**
 * A hang / per-frame blow-up ceiling, NOT the ladder bar. 16 ms is the §21.8 threshold and
 * is ~25× below this; the ladder is hardware's call and is never asserted here. This only
 * catches a catastrophic regression (e.g. outline regeneration on every pan frame), which
 * lands in the hundreds of ms.
 */
const CATASTROPHIC_MEDIAN_MS = 400;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** Build the 50-annotation document across the 4096-px sheet. */
function populate(scene: MarkupScene): void {
  // Repeating sequence: dimension ×2, then one each of the other kinds — five cycles = 50.
  const kinds: AnnotationType[] = [
    'dimension',
    'rect',
    'ellipse',
    'line',
    'arrow',
    'text',
    'freehand',
    'highlight',
    'angle',
    'dimension',
  ];

  for (let k = 0; k < ANNOTATION_COUNT; k += 1) {
    const kind = kinds[k % kinds.length];
    if (!kind) throw new Error(`no kind for annotation ${k}`);
    const col = k % GRID_COLS;
    const row = Math.floor(k / GRID_COLS);
    const cx = col * CELL_PX + 40;
    const cy = row * CELL_PX + 40;

    let style: AnnotationStyle = { ...DEFAULT_STYLE };
    let geometry: Geometry;
    let valueMm: number | null = null;
    let enteredText: string | null = null;

    switch (kind) {
      case 'dimension':
        geometry = { kind, a: { x: cx, y: cy + 240 }, b: { x: cx + 320, y: cy + 240 } };
        valueMm = 304.8 * (1 + (k % 5)); // 1 ft .. 5 ft; label is derived, never stored
        enteredText = `10'-0"`;
        break;
      case 'rect':
        geometry = { kind, x: cx, y: cy, width: 300, height: 190, cornerRadius: 8 };
        style = { ...style, fillColor: '#FF7A18', fillAlpha: 0.12 };
        break;
      case 'ellipse':
        geometry = { kind, x: cx, y: cy, width: 280, height: 170 };
        break;
      case 'line':
        geometry = { kind, a: { x: cx, y: cy }, b: { x: cx + 300, y: cy + 170 } };
        style = { ...style, lineStyle: 'dashed' };
        break;
      case 'arrow':
        geometry = { kind, a: { x: cx + 20, y: cy + 20 }, b: { x: cx + 300, y: cy + 160 } };
        style = { ...style, arrowheads: 'end' };
        break;
      case 'text':
        geometry = { kind, at: { x: cx, y: cy + 140 }, text: `Note ${k + 1}: hairline crack`, background: 'pill' };
        style = { ...style, strokeColor: '#1B6BFF', fontSizeMu: 20 };
        break;
      case 'freehand': {
        const points = Array.from({ length: 25 }, (_, i) => ({
          x: cx + i * 10,
          y: cy + 120 + Math.sin(i / 3) * 40,
        }));
        geometry = { kind, points, pressure: points.map(() => 0.5) };
        style = { ...style, strokeColor: '#1B6BFF', strokeWidthMu: 6 };
        break;
      }
      case 'highlight': {
        const points = Array.from({ length: 20 }, (_, i) => ({ x: cx + i * 15, y: cy + 220 }));
        geometry = { kind, points, pressure: points.map(() => 0.5) };
        style = { ...style, strokeColor: '#FFD400', strokeWidthMu: 24 };
        break;
      }
      case 'angle':
        geometry = {
          kind,
          a: { x: cx + 260, y: cy },
          vertex: { x: cx, y: cy },
          c: { x: cx, y: cy + 200 },
        };
        break;
      default:
        throw new Error(`unhandled kind ${kind}`);
    }

    scene.addMarkup({ type: kind, geometry, style, valueMm, enteredText });
  }
}

interface FrameStats {
  median: number;
  p95: number;
  min: number;
  max: number;
  count: number;
}

function stats(samples: number[]): FrameStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return { median: at(0.5), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1], count: sorted.length };
}

function setup(ratio: () => number): { host: HTMLDivElement; canvas: EditorCanvas; scene: MarkupScene } {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = `${HOST_W}px`;
  host.style.height = `${HOST_H}px`;
  document.body.appendChild(host);

  const canvas = new EditorCanvas(host, { markupPixelRatio: ratio });
  // A real photo node so the sheet exists; the loop never force-draws the photo layer.
  const source = document.createElement('canvas');
  source.width = 16;
  source.height = 16;
  canvas.setPhoto(source, SHEET_PX, SHEET_PX);

  const scene = new MarkupScene({
    layer: canvas.markupLayer,
    ctx: { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 },
    ghostText: 'tap to enter value',
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  populate(scene);

  cleanups.push(() => {
    scene.load([]);
    canvas.destroy();
    host.remove();
  });
  return { host, canvas, scene };
}

/**
 * Pan the stage `PAN_STEP_PX` per frame and force the markup layer to redraw, timing each
 * frame. Synchronous by design (see the file header).
 */
function measure(canvas: EditorCanvas): FrameStats {
  const samples: number[] = [];
  for (let i = 0; i < WARMUP_FRAMES + MEASURED_FRAMES; i += 1) {
    const t0 = performance.now();
    canvas.panBy(PAN_STEP_PX, 0);
    canvas.markupLayer.draw();
    const dt = performance.now() - t0;
    if (i >= WARMUP_FRAMES) samples.push(dt);
  }
  return stats(samples);
}

function report(label: string, canvas: EditorCanvas, frame: FrameStats, scene: MarkupScene): void {
  const el = canvas.markupLayer.getNativeCanvasElement();
  // Browser forwards console output to the Vitest terminal; this is the recorded artefact.
  // eslint-disable-next-line no-console
  console.log(
    `[C4] ${JSON.stringify({
      label,
      annotations: scene.list().length,
      measuredFrames: frame.count,
      warmupFrames: WARMUP_FRAMES,
      medianMs: Number(frame.median.toFixed(3)),
      p95Ms: Number(frame.p95.toFixed(3)),
      minMs: Number(frame.min.toFixed(3)),
      maxMs: Number(frame.max.toFixed(3)),
      markupPixelRatio: canvas.markupLayer.getCanvas().getPixelRatio(),
      markupCanvas: `${el.width}x${el.height}`,
      markupChildren: canvas.markupLayer.getChildren().length,
      windowDevicePixelRatio: window.devicePixelRatio,
      expectedMinDpr2: Math.min(window.devicePixelRatio || 1, 2),
      viewport: `${HOST_W}x${HOST_H}`,
      sheetPx: SHEET_PX,
      hardCeilingMs: CATASTROPHIC_MEDIAN_MS,
      hardwareConcurrency: navigator.hardwareConcurrency,
      userAgent: navigator.userAgent,
    })}`,
  );
}

/**
 * Sanity check that the forced `markupLayer.draw()` really rasterized something — a no-op
 * draw would report a falsely excellent frame time. Samples the whole backing canvas once.
 */
function hasPaintedPixels(canvas: EditorCanvas): boolean {
  const el = canvas.markupLayer.getNativeCanvasElement();
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the markup layer');
  const { data } = ctx.getImageData(0, 0, el.width, el.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
}

describe('C4 markup-layer pan redraw (provisional dev-machine measurement, never a pass)', () => {
  it(
    'ratio 1 — forced by option (the ladder bottom rung; dpr is 2 here, so 1 is not the real path)',
    async () => {
      const { canvas, scene } = setup(() => 1);
      expect(scene.list()).toHaveLength(ANNOTATION_COUNT);
      // Every non-image annotation must actually be on the markup layer, or the timing is a lie.
      expect(canvas.markupLayer.getChildren()).toHaveLength(ANNOTATION_COUNT);
      expect(canvas.markupLayer.getCanvas().getPixelRatio()).toBe(1);

      const frame = measure(canvas);
      report('ratio-1-forced-by-option', canvas, frame, scene);
      expect(hasPaintedPixels(canvas)).toBe(true);

      expect(frame.count).toBeGreaterThanOrEqual(60);
      // Catastrophic ceiling only — NOT the §21.8 16 ms ladder (hardware's call).
      expect(frame.median).toBeLessThan(CATASTROPHIC_MEDIAN_MS);

      // Let the rAF that `panBy` scheduled flush so its draw does not outlive the test.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    },
    30_000,
  );

  it(
    'ratio 2 — forced by option (not a DPR-2 device), the ratio the §21.8 ladder would drop',
    async () => {
      const { canvas, scene } = setup(() => 2);
      expect(scene.list()).toHaveLength(ANNOTATION_COUNT);
      expect(canvas.markupLayer.getChildren()).toHaveLength(ANNOTATION_COUNT);
      expect(canvas.markupLayer.getCanvas().getPixelRatio()).toBe(2);

      const frame = measure(canvas);
      report('ratio-2-forced-by-option', canvas, frame, scene);
      expect(hasPaintedPixels(canvas)).toBe(true);

      expect(frame.count).toBeGreaterThanOrEqual(60);
      expect(frame.median).toBeLessThan(CATASTROPHIC_MEDIAN_MS);

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    },
    30_000,
  );

  it(
    'real path — the actual min(devicePixelRatio, 2) shipped ratio (cross-checks ratio 2 here)',
    async () => {
      const ratio = () => Math.min(window.devicePixelRatio || 1, 2);
      const { canvas, scene } = setup(ratio);
      expect(scene.list()).toHaveLength(ANNOTATION_COUNT);
      expect(canvas.markupLayer.getChildren()).toHaveLength(ANNOTATION_COUNT);
      // The §8.1.1 contract, asserted on the unmodified path.
      expect(canvas.markupLayer.getCanvas().getPixelRatio()).toBe(ratio());

      const frame = measure(canvas);
      report('real-min(devicePixelRatio,2)', canvas, frame, scene);
      expect(hasPaintedPixels(canvas)).toBe(true);

      expect(frame.count).toBeGreaterThanOrEqual(60);
      expect(frame.median).toBeLessThan(CATASTROPHIC_MEDIAN_MS);

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    },
    30_000,
  );
});
