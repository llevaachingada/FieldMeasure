/**
 * tests/exportMarkup.browser.test.ts — four export bugs the senior review found, each pinned
 * against the REAL export stage (`renderSheet`) rather than against a helper in isolation.
 *
 *   1. Dimension arrowheads vanished on any photo over 1280 px (`k > 1`, D154).
 *   2. Dashed / dotted strokes exported SOLID at M >= 2 or `k > 1`.
 *   3. A valueless («ghost») dimension printed the on-screen placeholder text (D173).
 *   4. A short dimension's label sat ON the line at `k > 1` instead of pushed off it with a
 *      leader, because the collision push was decided at scale 1 and `setScale` never re-ran it
 *      (the scene now re-lays labels on a scale change: tests/dimensionLabelScale.browser.test.ts).
 *
 * HOW THE EXPORT TREE IS READ. `renderSheet` destroys its Konva tree before it returns, so the
 * nodes cannot be inspected afterwards. `exportTree` wraps `Konva.Layer.prototype.drawScene`
 * and snapshots every node (class, points, dash, stroke width, text, position) at the moment
 * the layer is DRAWN. That is the state that reaches the bitmap, after `applyExportRules` and
 * every other adjustment, so a test cannot pass on a half-applied tree.
 *
 * Vocabulary (renderStage.ts): `M` is the export multiplier (the layer's `scale`), `k` is the
 * D154 markup scale `max(1, longEdge / 1280)`, and `mu` is a markup unit. Strokes land at
 * `mu × M × k` bitmap px; text and heads are `mu × k` image units that the layer then
 * magnifies by M.
 */
import { describe, expect, it } from 'vitest';
import Konva from 'konva';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import {
  applyExportRules,
  exportMarkupScale,
  renderSheet,
  type ExportMultiplier,
  type ExportSheetInput,
} from '../src/export/renderStage';
import { derivedDimensionLabel, labelLayout } from '../src/editor/shapes/dimensionLabel';
import { MarkupScene } from '../src/editor/shapes/scene';

const CTX = { unitSystem: 'imperial', unitFormat: 'ft-in', precisionDenominator: 16 } as const;
const GHOST_TEXT = 'tap to enter value';
/** The label's selection-cyan hairline / leader colour (`SEL` in renderDimension.ts). */
const SEL = '#2FD4E0';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function styleOf(overrides: Partial<Annotation['style']> = {}): Annotation['style'] {
  return { ...DEFAULT_STYLE, strokeWidthMu: 4, fontSizeMu: 18, strokeColor: '#FF7A18', ...overrides };
}

function annotation(
  id: string,
  geometry: Annotation['geometry'],
  style: Annotation['style'],
  valueMm: number | null = null,
  extra: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    type: geometry.kind,
    geometry,
    valueMm,
    enteredText: null,
    style,
    zIndex: 1000,
    source: 'manual',
    assetId: null,
    groupId: null,
    locked: false,
    ...extra,
  };
}

function blackPhoto(w: number, h: number): HTMLCanvasElement {
  const photo = document.createElement('canvas');
  photo.width = w;
  photo.height = h;
  const ctx = photo.getContext('2d');
  if (!ctx) throw new Error('no 2D context for the fake photo');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  return photo;
}

function sheetInput(
  w: number,
  h: number,
  annotations: Annotation[],
  photo: CanvasImageSource | null = null,
): ExportSheetInput {
  return {
    sheetId: 'sheet-1',
    imageWidthPx: w,
    imageHeightPx: h,
    annotations,
    ctx: CTX,
    ghostText: GHOST_TEXT,
    photo,
  };
}

/* ------------------------------------------------------------------ *
 * Reading the export tree at draw time
 * ------------------------------------------------------------------ */

interface NodeSnap {
  cls: string;
  annotationId?: string;
  x: number;
  y: number;
  rotation: number;
  points?: number[];
  closed?: boolean;
  dash?: number[];
  strokeWidth?: number;
  stroke?: string;
  fontSize?: number;
  text?: string;
  outerRadius?: number;
  children: NodeSnap[];
}

function snap(node: Konva.Node): NodeSnap {
  const points = node.getAttr('points') as number[] | undefined;
  const dash = node.getAttr('dash') as number[] | undefined;
  const out: NodeSnap = {
    cls: node.getClassName(),
    annotationId: node.getAttr('annotationId') as string | undefined,
    x: node.x(),
    y: node.y(),
    rotation: node.rotation(),
    points: points ? [...points] : undefined,
    closed: node.getAttr('closed') as boolean | undefined,
    dash: dash ? [...dash] : undefined,
    strokeWidth: node.getAttr('strokeWidth') as number | undefined,
    stroke: node.getAttr('stroke') as string | undefined,
    fontSize: node.getAttr('fontSize') as number | undefined,
    text: node.getAttr('text') as string | undefined,
    outerRadius: node.getAttr('outerRadius') as number | undefined,
    children: [],
  };
  if (node instanceof Konva.Container) out.children = node.getChildren().map((c) => snap(c));
  return out;
}

function walk(root: NodeSnap, visit: (n: NodeSnap) => void): void {
  visit(root);
  for (const c of root.children) walk(c, visit);
}

function findAll(roots: NodeSnap[], pred: (n: NodeSnap) => boolean): NodeSnap[] {
  const hits: NodeSnap[] = [];
  for (const r of roots) walk(r, (n) => { if (pred(n)) hits.push(n); });
  return hits;
}

/** The top-level group of one annotation, as drawn. */
function groupOf(layers: NodeSnap[], id: string): NodeSnap {
  const hit = findAll(layers, (n) => n.cls === 'Group' && n.annotationId === id)[0];
  if (!hit) throw new Error(`no group for annotation ${id} in the export tree`);
  return hit;
}

/** Render a sheet through the real `renderSheet`, snapshotting the layers as they are drawn. */
async function exportTree(
  input: ExportSheetInput,
  m: ExportMultiplier,
  read: (canvas: HTMLCanvasElement) => void = () => {},
): Promise<NodeSnap[]> {
  const proto = Konva.Layer.prototype as unknown as { drawScene: (...args: unknown[]) => unknown };
  const original = proto.drawScene;
  const layers: NodeSnap[] = [];
  proto.drawScene = function patched(this: Konva.Layer, ...args: unknown[]) {
    layers.push(snap(this));
    return original.apply(this, args);
  };
  try {
    const rendered = await renderSheet(input, m);
    try {
      read(rendered.canvas);
    } finally {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  } finally {
    proto.drawScene = original;
  }
  expect(layers.length).toBeGreaterThan(0); // the spy really saw the export layer
  return layers;
}

/** `exportTree` plus a pixel reader that runs before the bitmap is freed. */
async function exportWithPixels<T>(
  input: ExportSheetInput,
  m: ExportMultiplier,
  measure: (canvas: HTMLCanvasElement) => T,
): Promise<{ layers: NodeSnap[]; value: T }> {
  let value: T | undefined;
  const layers = await exportTree(input, m, (canvas) => {
    value = measure(canvas);
  });
  return { layers, value: value as T };
}

function pixels(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D context on the rendered canvas');
  return ctx.getImageData(x, y, w, h);
}

type Rgba = [number, number, number, number];
function px(img: ImageData, x: number, y: number): Rgba {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!];
}

/** Longest contiguous run of pixels matching `pred` down a 1-px-wide column image. */
function longestRun(img: ImageData, pred: (p: Rgba) => boolean): number {
  let best = 0;
  let run = 0;
  for (let y = 0; y < img.height; y += 1) {
    if (pred(px(img, 0, y))) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** Number of separate runs of pixels matching `pred` along a 1-px-tall row image. */
function countRuns(img: ImageData, pred: (p: Rgba) => boolean): number {
  let runs = 0;
  let inRun = false;
  for (let x = 0; x < img.width; x += 1) {
    const on = pred(px(img, x, 0));
    if (on && !inRun) runs += 1;
    inRun = on;
  }
  return runs;
}

/** Orange ink (#FF7A18) over a black photo: the red channel is the clean detector. */
const isOrange = (p: Rgba): boolean => p[0] > 128;

/** The dimension label's dark halo (#0B0E12) over a black photo: blue-dominant, never orange. */
function isLabelHalo(p: Rgba): boolean {
  const [r, g, b] = p;
  if (r === 0 && g === 0 && b === 0) return false; // the photo
  if (r > 40) return false; // orange ink and the cyan hairline
  return b >= r && g >= r;
}

function countPixels(img: ImageData, pred: (p: Rgba) => boolean): number {
  let n = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) if (pred(px(img, x, y))) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * The sheets under test. k is written as a literal and checked against
 * `exportMarkupScale`, so a wrong k in this table cannot hide a wrong k in the code.
 * ------------------------------------------------------------------ */

interface Case {
  w: number;
  h: number;
  m: ExportMultiplier;
  /** D154: max(1, longEdge / 1280). */
  k: number;
}
const CASES: Case[] = [
  { w: 1024, h: 768, m: 1, k: 1 }, //   1024 <= 1280                 -> k = 1
  { w: 2560, h: 240, m: 1, k: 2 }, //   2560 / 1280 = 2
  { w: 2560, h: 240, m: 3, k: 2 }, //   same k at M = 3: k never depends on M
  { w: 4096, h: 240, m: 2, k: 3.2 }, // 4096 / 1280 = 3.2
];

describe('the table of k values is the D154 formula', () => {
  it.each(CASES)('$w x $h -> k = $k', ({ w, h, k }) => {
    expect(exportMarkupScale(w, h)).toBeCloseTo(k, 12);
  });
});

/* ------------------------------------------------------------------ *
 * 1. Arrowheads at k > 1
 * ------------------------------------------------------------------ */

describe('1. dimension arrowheads scale with k exactly like the stroke width', () => {
  // A horizontal dimension, 4 mu, both arrowheads (the Dimension tool's default).
  //   arrowHeadSpec: lenMu = max(10, 4 * 4) = 16, halfMu = max(4, 4 * 1.1) = 4.4
  const A = { x: 200, y: 100 };
  const B = { x: 900, y: 100 };
  const LEN_MU = 16;
  const HALF_MU = 4.4;
  const STROKE_MU = 4;

  const dimension = (): Annotation =>
    annotation('dim', { kind: 'dimension', a: A, b: B }, styleOf({ arrowheads: 'both' }), 3048);

  it.each(CASES)(
    'M=$m k=$k: heads are 16k long and 4.4k half-wide in image units; head : stroke is constant',
    async ({ w, h, m, k }) => {
      const layers = await exportTree(sheetInput(w, h, [dimension()]), m);
      const lines = groupOf(layers, 'dim').children.filter((n) => n.cls === 'Line');
      const heads = lines.filter((n) => n.closed === true);
      expect(heads).toHaveLength(2);

      // Head at A (tip A, pointing from B): the unit vector tip - from is (-1, 0), so the base
      // sits at x = A.x + len and the wings at y = A.y -/+ half.
      //   len  = 16  * k   (k=1: 16     k=2: 32     k=3.2: 51.2)
      //   half = 4.4 * k   (k=1: 4.4    k=2: 8.8    k=3.2: 14.08)
      const len = LEN_MU * k;
      const half = HALF_MU * k;
      const wantA = [A.x, A.y, A.x + len, A.y - half, A.x + len, A.y + half];
      // Head at B (tip B, pointing from A): unit vector (+1, 0); base at x = B.x - len.
      const wantB = [B.x, B.y, B.x - len, B.y + half, B.x - len, B.y - half];
      heads[0]!.points!.forEach((v, i) => expect(v).toBeCloseTo(wantA[i]!, 6));
      heads[1]!.points!.forEach((v, i) => expect(v).toBeCloseTo(wantB[i]!, 6));

      // The head is magnified by the layer (x M) and the stroke is written straight into the
      // bitmap (mu x M x k). Their ratio is the D150 design ratio, 16 / 4 = 4, at EVERY (M, k):
      //   head length in bitmap px = 16k x M;  stroke width in bitmap px = 4 x M x k
      const strokeBitmapPx = lines.find((n) => n.closed !== true)!.strokeWidth!;
      expect(strokeBitmapPx).toBeCloseTo(STROKE_MU * m * k, 9);
      const headBitmapPx = (heads[0]!.points![2]! - A.x) * m;
      expect(headBitmapPx / strokeBitmapPx).toBeCloseTo(LEN_MU / STROKE_MU, 9);
    },
  );

  it('4096 px photo (k = 3.2): the arrowheads are visible ink, not hidden under the line', async () => {
    // 4096 x 3072 at M = 1, black photo. The dimension runs A(600,1500) -> B(1400,1500).
    //   head length   = 16 x 3.2   = 51.2 px;  head half-width = 4.4 x 3.2 = 14.08 px
    //   line stroke   = 4  x 3.2   = 12.8 px
    // At 80 % of the way from the tip to the base (x = 600 + 0.8 x 51.2 = 640.96 -> column 641)
    // the head is 2 x 14.08 x 0.8 = 22.5 px tall, against the line's 12.8 px, so the tallest
    // orange run in that column must be well over 12.8 px. The pre-fix head was
    // 16 / 3.2 = 5 px long, so column 641 was past it and held only the 12.8 px line.
    const W = 4096;
    const H = 3072;
    const a = { x: 600, y: 1500 };
    const b = { x: 1400, y: 1500 };
    const withHeads = annotation('d', { kind: 'dimension', a, b }, styleOf({ arrowheads: 'both' }), 3048);
    const noHeads = annotation('d', { kind: 'dimension', a, b }, styleOf({ arrowheads: 'none' }), 3048);

    const tallest = async (ann: Annotation) =>
      (
        await exportWithPixels(sheetInput(W, H, [ann], blackPhoto(W, H)), 1, (canvas) => ({
          column: longestRun(pixels(canvas, 641, 1400, 1, 200), isOrange),
          // The same 160 x 120 window around A, to diff the two renders (the review's evidence).
          window: pixels(canvas, 560, 1440, 160, 120),
        }))
      ).value;

    const heads = await tallest(withHeads);
    const plain = await tallest(noHeads);

    expect(plain.column).toBeLessThanOrEqual(14); // 12.8 px line (+ antialiasing)
    expect(heads.column).toBeGreaterThanOrEqual(21); // 22.5 px head, minus antialiasing
    let extraInk = 0;
    for (let i = 0; i < heads.window.data.length; i += 4) {
      if (heads.window.data[i]! > 128 !== plain.window.data[i]! > 128) extraInk += 1;
    }
    // Triangle area = len x half = 51.2 x 14.08 = 721 px^2, of which the part outside the
    // 12.8-px line band is about 214 px^2. Pre-fix the diff was 0.
    expect(extraInk).toBeGreaterThanOrEqual(100);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Dashes
 * ------------------------------------------------------------------ */

describe('2. dashed and dotted strokes keep their pattern in the export', () => {
  const DASH_CASES: Case[] = [
    { w: 1024, h: 768, m: 1, k: 1 },
    { w: 1024, h: 768, m: 2, k: 1 },
    { w: 1024, h: 768, m: 3, k: 1 },
    { w: 2560, h: 240, m: 1, k: 2 },
    { w: 2560, h: 240, m: 3, k: 2 },
    { w: 4096, h: 240, m: 1, k: 3.2 },
  ];

  /** One of every kind that takes a line style. Ids are the keys of `PER_ANNOTATION`. */
  function dashedSheet(lineStyle: 'dashed' | 'dotted' | 'solid'): Annotation[] {
    const st = styleOf({ lineStyle });
    return [
      annotation('line', { kind: 'line', a: { x: 50, y: 30 }, b: { x: 500, y: 30 } }, st),
      annotation('arrow', { kind: 'arrow', a: { x: 50, y: 60 }, b: { x: 500, y: 60 } }, st),
      annotation('rect', { kind: 'rect', x: 50, y: 80, width: 200, height: 40 }, st),
      annotation('ellipse', { kind: 'ellipse', x: 300, y: 80, width: 200, height: 40 }, st),
      annotation(
        'polygon',
        {
          kind: 'polygon',
          closed: false,
          points: [{ x: 50, y: 150 }, { x: 150, y: 200 }, { x: 250, y: 150 }, { x: 350, y: 200 }],
        },
        st,
      ),
      annotation(
        'angle',
        { kind: 'angle', a: { x: 600, y: 100 }, vertex: { x: 600, y: 200 }, c: { x: 800, y: 200 } },
        st,
      ),
      annotation('dim', { kind: 'dimension', a: { x: 600, y: 40 }, b: { x: 1000, y: 40 } }, st, 3048),
    ];
  }

  /** How many nodes of each annotation carry a dash: the angle has two rays (the arc does not),
   *  the dimension has the main line only (its two ticks are solid). */
  const PER_ANNOTATION: Record<string, number> = {
    line: 1, arrow: 1, rect: 1, ellipse: 1, polygon: 1, angle: 2, dim: 1,
  };

  const PATTERNS = [
    { lineStyle: 'dashed' as const, mu: [8, 6] },
    { lineStyle: 'dotted' as const, mu: [1, 5] },
  ];

  for (const { lineStyle, mu } of PATTERNS) {
    it.each(DASH_CASES)(
      `${lineStyle}: the dash array carried is [${mu.join(',')}] x M x k at M=$m k=$k`,
      async ({ w, h, m, k }) => {
        const layers = await exportTree(sheetInput(w, h, dashedSheet(lineStyle)), m);
        // dash = mu x M x k, the factor the stroke width gets. For dashed [8,6]:
        //   M=1,k=1 -> [8,6]    M=2,k=1 -> [16,12]    M=3,k=1 -> [24,18]
        //   M=1,k=2 -> [16,12]  M=3,k=2 -> [48,36]    M=1,k=3.2 -> [25.6,19.2]
        // and for dotted [1,5]: M=2,k=3.2 -> [6.4,32], etc.
        const want = mu.map((d) => d * m * k);
        for (const [id, count] of Object.entries(PER_ANNOTATION)) {
          const dashed = findAll([groupOf(layers, id)], (n) => Array.isArray(n.dash) && n.dash.length > 0);
          expect(dashed, `${id} dashed nodes`).toHaveLength(count);
          for (const node of dashed) {
            expect(node.dash).toHaveLength(2);
            node.dash!.forEach((v, i) => expect(v, `${id} dash[${i}]`).toBeCloseTo(want[i]!, 9));
          }
        }
      },
    );
  }

  it('solid strokes carry no dash at all (the fix must not invent one)', async () => {
    const layers = await exportTree(sheetInput(1024, 768, dashedSheet('solid')), 2);
    expect(findAll(layers, (n) => Array.isArray(n.dash) && n.dash.length > 0)).toHaveLength(0);
  });

  it('applying the export rules twice does not compound the dash (the original is kept)', () => {
    const div = document.createElement('div');
    const stage = new Konva.Stage({ container: div, width: 200, height: 200 });
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    const scene = new MarkupScene({ layer, ctx: CTX, ghostText: GHOST_TEXT });
    try {
      scene.load([annotation('line', { kind: 'line', a: { x: 10, y: 10 }, b: { x: 90, y: 10 } }, styleOf({ lineStyle: 'dashed' }))]);
      const line = layer.find('Line')[0]!;
      applyExportRules(layer, 2, 1.5);
      // [8,6] x 2 x 1.5 = [24,18]
      expect(line.getAttr('dash')).toEqual([24, 18]);
      applyExportRules(layer, 3, 2);
      // From the ORIGINAL [8,6]: x 3 x 2 = [48,36]. Compounded on [24,18] it would be [144,108].
      expect(line.getAttr('dash')).toEqual([48, 36]);
      applyExportRules(layer, 1, 1);
      // Back to the on-screen pattern, [8,6].
      expect(line.getAttr('dash')).toEqual([8, 6]);
    } finally {
      scene.load([]);
      stage.destroy();
    }
  });

  it('in real pixels: a dashed line keeps its dashes at M = 1, 2 and 3 (it did not at M >= 2)', async () => {
    // A 4-mu dashed line from x = 40 to x = 360 on a 400 x 300 black photo, round caps.
    //   dash [8,6] + the two half-caps (4 mu wide -> 2 each end) -> 12 px lit, 2 px gap, period 14
    //   period 14 mu -> 320 / 14 = 22.9 dashes, whatever M is (every length scales by M).
    // Pre-fix the dash stayed [8,6] bitmap px while the stroke grew to 4M: at M = 2 the 8-px
    // caps (4 each end) cover the whole 6-px gap, so the line was one solid run.
    const line = annotation('l', { kind: 'line', a: { x: 40, y: 60 }, b: { x: 360, y: 60 } }, styleOf({ lineStyle: 'dashed' }));
    const runs: number[] = [];
    for (const m of [1, 2, 3] as ExportMultiplier[]) {
      const { value } = await exportWithPixels(sheetInput(400, 300, [line], blackPhoto(400, 300)), m, (canvas) =>
        countRuns(pixels(canvas, 60 * m, 60 * m, 300 * m, 1), isOrange),
      );
      runs.push(value);
      // The scan covers x = 60..360 (300 mu): 300 / 14 = 21.4 periods; require at least 19.
      expect(value, `runs at M=${m}`).toBeGreaterThanOrEqual(19);
    }
    expect(Math.abs(runs[1]! - runs[0]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(runs[2]! - runs[0]!)).toBeLessThanOrEqual(1);
  });

  it('in real pixels: a dashed line keeps its dashes on a 2560 px photo (k = 2)', async () => {
    // k = 2 -> the stroke is 8 px wide and the period 28 px; the line is 2360 px long from
    // x = 100. Scan x = 200..2460 (2260 px): 2260 / 28 = 80.7 periods. Pre-fix: solid.
    const W = 2560;
    const H = 240;
    const line = annotation('l', { kind: 'line', a: { x: 100, y: 60 }, b: { x: 2460, y: 60 } }, styleOf({ lineStyle: 'dashed' }));
    const { value } = await exportWithPixels(sheetInput(W, H, [line], blackPhoto(W, H)), 1, (canvas) =>
      countRuns(pixels(canvas, 200, 60, 2260, 1), isOrange),
    );
    expect(value).toBeGreaterThanOrEqual(76);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Ghost (valueless) dimensions
 * ------------------------------------------------------------------ */

describe('3. a valueless dimension exports its line and NO label text (D173)', () => {
  const ghostLong = () =>
    annotation('ghost', { kind: 'dimension', a: { x: 100, y: 100 }, b: { x: 500, y: 100 } }, styleOf({ arrowheads: 'both' }), null);
  // 100 px long: |mid -> b| = 50 < the 140 px collision radius, so a label WOULD be pushed
  // off the line and joined to it by a leader. A leader to no label must not be drawn either.
  const ghostShort = () =>
    annotation('ghostShort', { kind: 'dimension', a: { x: 100, y: 300 }, b: { x: 200, y: 300 } }, styleOf({ arrowheads: 'both' }), null);
  const valued = () =>
    annotation('valued', { kind: 'dimension', a: { x: 100, y: 500 }, b: { x: 500, y: 500 } }, styleOf({ arrowheads: 'both' }), 3048);

  it.each([1, 2] as ExportMultiplier[])('M=%i: no Text and no leader in a ghost group; the line is still drawn', async (m) => {
    const layers = await exportTree(sheetInput(1024, 768, [ghostLong(), ghostShort(), valued()]), m);

    for (const id of ['ghost', 'ghostShort']) {
      const g = groupOf(layers, id);
      expect(findAll([g], (n) => n.cls === 'Text'), `${id}: Text nodes`).toHaveLength(0);
      expect(findAll([g], (n) => n.cls === 'Line' && n.stroke === SEL), `${id}: leader`).toHaveLength(0);
      // 1 main line + 2 ticks + 2 arrowheads = 5 Lines: the dimension itself is intact.
      expect(findAll([g], (n) => n.cls === 'Line'), `${id}: Lines`).toHaveLength(5);
    }
    const main = findAll([groupOf(layers, 'ghost')], (n) => n.cls === 'Line' && n.closed !== true)[0]!;
    expect(main.points).toEqual([100, 100, 500, 100]);
    expect(main.strokeWidth).toBe(4 * m); // 4 mu x M x k (k = 1 at 1024 px)

    // No placeholder text anywhere on the page, and the valued dimension still gets its label.
    const texts = findAll(layers, (n) => n.cls === 'Text').map((n) => n.text);
    expect(texts).not.toContain(GHOST_TEXT);
    const label = derivedDimensionLabel(3048, CTX)!; // 3048 mm = 10 ft exactly
    expect(label).toBe('10\'-0"');
    expect(findAll([groupOf(layers, 'valued')], (n) => n.cls === 'Text').map((n) => n.text)).toEqual([label, label]);
    expect(texts).toEqual([label, label]); // halo + main, and nothing else
  });

  it('in real pixels: no label ink where the placeholder would have been; the valued label is there', async () => {
    // Black photo; the label halo (#0B0E12) exists only where a label is drawn. The ghost
    // placeholder («tap to enter value», 18 chars x ~11 px) is centred on the line midpoint
    // (300, 100): the strips below cover it. Pre-fix those strips held halo ink.
    const { value } = await exportWithPixels(
      sheetInput(1024, 768, [ghostLong(), ghostShort(), valued()], blackPhoto(1024, 768)),
      1,
      (canvas) => ({
        ghostLong: countPixels(pixels(canvas, 150, 70, 300, 60), isLabelHalo),
        ghostShort: countPixels(pixels(canvas, 0, 230, 400, 140), isLabelHalo),
        valued: countPixels(pixels(canvas, 150, 470, 300, 60), isLabelHalo),
      }),
    );
    expect(value.ghostLong).toBe(0);
    expect(value.ghostShort).toBe(0);
    expect(value.valued).toBeGreaterThan(0);
  });

  it('a valueless dimension INSIDE an image inset is treated the same', async () => {
    const asset = document.createElement('canvas');
    asset.width = 400;
    asset.height = 300;
    const actx = asset.getContext('2d')!;
    actx.fillStyle = '#00CC00';
    actx.fillRect(0, 0, 400, 300);
    const inset = annotation(
      'inset',
      { kind: 'image', x: 0, y: 0, width: 400, height: 300, rotation: 0 },
      styleOf(),
      null,
      {
        assetId: 'asset-1',
        children: [
          annotation('childGhost', { kind: 'dimension', a: { x: 40, y: 100 }, b: { x: 360, y: 100 } }, styleOf({ arrowheads: 'both' }), null),
          annotation('childValued', { kind: 'dimension', a: { x: 40, y: 200 }, b: { x: 360, y: 200 } }, styleOf({ arrowheads: 'both' }), 3048, { zIndex: 1 }),
        ],
      },
    );
    const input = { ...sheetInput(1024, 768, [inset]), assetProvider: () => ({ image: asset, width: 400, height: 300 }) };
    const layers = await exportTree(input, 1);
    const texts = findAll(layers, (n) => n.cls === 'Text').map((n) => n.text);
    const label = derivedDimensionLabel(3048, CTX)!;
    expect(texts).toEqual([label, label]); // the valued child's halo + main; no placeholder
    expect(findAll([groupOf(layers, 'childGhost')], (n) => n.cls === 'Line').length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Short-dimension label layout at k > 1
 * ------------------------------------------------------------------ */

describe('4. a short dimension on a large photo lays its label out like the screen', () => {
  // 4096 x 400 (k = 4096 / 1280 = 3.2), a 600 px dimension A(1000,200) -> B(1600,200).
  const W = 4096;
  const H = 400;
  const K = 3.2;
  const A = { x: 1000, y: 200 };
  const B = { x: 1600, y: 200 };
  const dimension = (a = A, b = B) =>
    annotation('dim', { kind: 'dimension', a, b }, styleOf({ arrowheads: 'both' }), 3048);

  it.each([1, 2] as ExportMultiplier[])('M=%i: the label is pushed 36k px off the line with a leader', async (m) => {
    const layers = await exportTree(sheetInput(W, H, [dimension()]), m);
    const group = groupOf(layers, 'dim');
    const texts = findAll([group], (n) => n.cls === 'Text');
    expect(texts).toHaveLength(2);

    // The screen at the fitted view of this photo has scale s = 1280 / 4096 = 1 / 3.2 = 0.3125.
    //   mid           = (1300, 200);  tip = B = (1600, 200)
    //   |mid - tip| x s = 300 x 0.3125 = 93.75 < 140  -> too close, the label is pushed
    //   push          = 36 / s = 36 x 3.2 = 115.2 image px along the normal (0, +1)
    //   label at      = (1300, 200 + 115.2) = (1300, 315.2)
    // Positions are in image units (the layer then multiplies by M), so M does not matter.
    for (const t of texts) {
      expect(t.x).toBeCloseTo(1300, 9);
      expect(t.y).toBeCloseTo(315.2, 9);
      // D154: the glyphs are mu x k = 18 x 3.2 = 57.6 image units at every M.
      expect(t.fontSize).toBeCloseTo(57.6, 9);
    }
    // The leader joins the label back to the line's midpoint: (1300,315.2) -> (1300,200).
    const leaders = findAll([group], (n) => n.cls === 'Line' && n.stroke === SEL);
    expect(leaders).toHaveLength(1);
    leaders[0]!.points!.forEach((v, i) => expect(v).toBeCloseTo([1300, 315.2, 1300, 200][i]!, 9));
    expect(leaders[0]!.strokeWidth).toBeCloseTo(1 * m * K, 9); // 1 mu x M x k, like every stroke

    // Cross-check against the pure layout the screen itself uses.
    const screen = labelLayout(A, B, B, 1 / K);
    expect(screen.pushed).toBe(true);
    expect(texts[0]!.x).toBeCloseTo(screen.at.x, 9);
    expect(texts[0]!.y).toBeCloseTo(screen.at.y, 9);
  });

  it('a long dimension on the same photo is NOT pushed (the label stays on the midpoint)', async () => {
    // 2900 px: |mid - tip| x s = 1450 x 0.3125 = 453 >= 140.
    const layers = await exportTree(sheetInput(W, H, [dimension({ x: 100, y: 200 }, { x: 3000, y: 200 })]), 1);
    const group = groupOf(layers, 'dim');
    for (const t of findAll([group], (n) => n.cls === 'Text')) {
      expect(t.x).toBeCloseTo(1550, 9); // (100 + 3000) / 2
      expect(t.y).toBeCloseTo(200, 9);
    }
    expect(findAll([group], (n) => n.cls === 'Line' && n.stroke === SEL)).toHaveLength(0); // no leader
  });

  it('on a photo at or under 1280 px (k = 1) the push is still 36 px — nothing moved', async () => {
    // 200 px dimension: |mid - tip| = 100 < 140 -> pushed by 36 / 1 = 36 px: y = 100 + 36 = 136.
    const layers = await exportTree(sheetInput(1024, 768, [dimension({ x: 100, y: 100 }, { x: 300, y: 100 })]), 1);
    for (const t of findAll([groupOf(layers, 'dim')], (n) => n.cls === 'Text')) {
      expect(t.x).toBeCloseTo(200, 9);
      expect(t.y).toBeCloseTo(136, 9);
    }
  });

  it('every other mark is built at the screen scale too: a small angle keeps its 12-screen-px arc', async () => {
    // Side effect of laying the scene out at scale 1/k before it is loaded (not only
    // dimensions): the angle arc's minimum radius is 12 SCREEN px = 12 / s image px.
    //   k = 2 (2560 px), s = 0.5: radius = max(12 / 0.5, 0.4 x min(20, 20)) = max(24, 8) = 24
    // Pre-fix the arc was built at s = 1: max(12, 8) = 12 — half the on-screen size.
    const angle = annotation(
      'angle',
      { kind: 'angle', a: { x: 100, y: 100 }, vertex: { x: 100, y: 120 }, c: { x: 120, y: 120 } },
      styleOf(),
    );
    const layers = await exportTree(sheetInput(2560, 240, [angle]), 1);
    const arc = findAll([groupOf(layers, 'angle')], (n) => n.cls === 'Arc')[0]!;
    expect(arc.outerRadius).toBeCloseTo(24, 9);
  });
});
