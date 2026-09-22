/**
 * `tests/runExport.test.ts` — slice 1.9's wiring, the node-testable half.
 *
 * `src/export/runExport.ts` is the orchestration between the wizard's injected props and
 * the shipped engine. Everything that does not need a canvas or the File System Access API
 * is a pure function here and is pinned directly:
 *
 *   - plan → file names (the spec's default `{project}_{index}-{sheet}` template, the
 *     aggregate `{project}.pdf` / `{project}.zip` case, the `part-NN.pdf` split names);
 *   - the conflict policy against a REAL listing, including the intra-run duplicate a
 *     second same-titled sheet produces (`zipPngs` throws on a duplicate entry name);
 *   - the §19.4b multiplier guard across the plan's sheets, with the bitmap arithmetic in
 *     the comments (bitmaps are `w × h × M² × 4`; the boundary is INCLUSIVE, D96);
 *   - the estimate's arithmetic (bitmap px × a documented codec factor per format);
 *   - `resolvePlanSheets` order preservation.
 *
 * The render/write half needs a real browser and lives in
 * `tests/runExport.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  applyConflictPolicy,
  checkMultiplierFor,
  collectAssetIds,
  estimatePlan,
  exportTimestamp,
  ESTIMATED_JPEG_BYTES_PER_PX,
  ESTIMATED_PNG_BYTES_PER_PX,
  pad2,
  pdfFileNames,
  pdfPartName,
  planFileNames,
  resolvePlanSheets,
  sheetFileNames,
  type ExportSheetSource,
} from '../src/export/runExport';
import type { Annotation } from '../src/domain/types';

const SHEETS: ExportSheetSource[] = [
  { id: 's1', title: 'North wall', imageWidthPx: 4096, imageHeightPx: 3072 },
  { id: 's2', title: 'East footing', imageWidthPx: 4096, imageHeightPx: 3072 },
  { id: 's3', title: 'Slab edge', imageWidthPx: 4096, imageHeightPx: 3072 },
];

describe('resolvePlanSheets — order is the plan’s, not the sheet list’s', () => {
  it('maps ids in plan order and drops ids that no longer exist', () => {
    expect(resolvePlanSheets({ sheetIds: ['s3', 'missing', 's1'] }, SHEETS).map((s) => s.id)).toEqual([
      's3',
      's1',
    ]);
  });

  it('preserves a repeated id literally (the plan is not de-duplicated here)', () => {
    expect(resolvePlanSheets({ sheetIds: ['s1', 's1'] }, SHEETS).map((s) => s.id)).toEqual([
      's1',
      's1',
    ]);
  });
});

describe('planFileNames — the default template and its aggregate cases', () => {
  it('PNG without zip: one file per sheet, zero-padded index, `{project}_{index}-{sheet}`', () => {
    expect(planFileNames({ format: 'png', zip: false }, 'Riverside', SHEETS.slice(0, 2))).toEqual([
      'Riverside_01-North wall.png',
      'Riverside_02-East footing.png',
    ]);
  });

  it('PNG with zip: one aggregate `{project}.zip` (index/sheet have no per-file meaning)', () => {
    expect(planFileNames({ format: 'png', zip: true }, 'Riverside', SHEETS)).toEqual(['Riverside.zip']);
  });

  it('PDF: one aggregate `{project}.pdf` regardless of sheet count', () => {
    expect(planFileNames({ format: 'pdf', zip: false }, 'Riverside', SHEETS)).toEqual(['Riverside.pdf']);
  });

  it('sanitizes the project title through the shipped token rules', () => {
    // `:` is illegal on NTFS (filenames.ts ILLEGAL), so `Job:12` → `Job12`.
    expect(sheetFileNames('Job:12', SHEETS.slice(0, 1), 'png')).toEqual(['Job12_01-North wall.png']);
  });

  it('`{index}` pads to two digits so the folder sorts in export order', () => {
    expect(pad2(1)).toBe('01');
    expect(pad2(9)).toBe('09');
    expect(pad2(10)).toBe('10');
  });
});

describe('applyConflictPolicy — policy against the destination’s actual listing', () => {
  it('add: a taken name (case-insensitively) becomes ` (1)`', () => {
    // NTFS is case-insensitive: `riverside.PDF` and `Riverside.pdf` are ONE file.
    expect(applyConflictPolicy(['Riverside.pdf'], ['riverside.PDF'], 'add')).toEqual([
      'Riverside (1).pdf',
    ]);
  });

  it('overwrite: the name is returned unchanged', () => {
    expect(applyConflictPolicy(['Riverside.pdf'], ['Riverside.pdf'], 'overwrite')).toEqual([
      'Riverside.pdf',
    ]);
  });

  it('skip: a taken name resolves to null (the caller must not write it)', () => {
    expect(applyConflictPolicy(['Riverside.pdf'], ['Riverside.pdf'], 'skip')).toEqual([null]);
  });

  it('a free name under skip is untouched', () => {
    expect(applyConflictPolicy(['Riverside.pdf'], ['Other.pdf'], 'skip')).toEqual(['Riverside.pdf']);
  });

  it('de-duplicates WITHIN one run — two same-titled sheets must not collide', () => {
    // A duplicate entry name makes `zipPngs` throw (a silent collapse would lose a sheet).
    expect(applyConflictPolicy(['a.png', 'a.png'], [], 'add')).toEqual(['a.png', 'a (1).png']);
  });

  it('a name already written earlier in the run counts as taken', () => {
    expect(applyConflictPolicy(['a (1).png'], ['a.png'], 'add')).toEqual(['a (1).png']);
    expect(applyConflictPolicy(['a (1).png', 'a (1).png'], ['a.png'], 'add')).toEqual([
      'a (1).png',
      'a (1) (1).png',
    ]);
  });
});

describe('checkMultiplierFor — the §19.4b budget across the plan’s sheets', () => {
  it('accepts a multiplier every sheet can hold', () => {
    // 4096 × 3072 × 3² × 4 = 4096×3072×9×4 = 452,984,832 ≤ 512 MiB (536,870,912) → allowed.
    expect(checkMultiplierFor({ multiplier: 3 }, SHEETS)).toEqual({ ok: true });
  });

  it('refuses 3× on a 4096×4096 sheet and offers 2×', () => {
    // 4096 × 4096 × 9 × 4 = 603,979,776 > 536,870,912 → refused.
    // 4096 × 4096 × 4 × 4 = 268,435,456 ≤ 536,870,912 → largest allowed is 2.
    const sheet = [{ id: 'big', title: 'Big', imageWidthPx: 4096, imageHeightPx: 4096 }];
    expect(checkMultiplierFor({ multiplier: 3 }, sheet)).toEqual({ ok: false, largest: 2 });
    expect(checkMultiplierFor({ multiplier: 2 }, sheet)).toEqual({ ok: true });
  });

  it('refuses the WHOLE plan when ONE sheet is too large, and offers the min across sheets', () => {
    const sheets = [...SHEETS, { id: 'big', title: 'Big', imageWidthPx: 4096, imageHeightPx: 4096 }];
    // The good sheets allow 3, the big one allows 2 → the plan’s largest is 2.
    expect(checkMultiplierFor({ multiplier: 3 }, sheets)).toEqual({ ok: false, largest: 2 });
  });

  it('offers null when even 1× is refused for a sheet', () => {
    // 16384 × 16384 × 1 × 4 = 1,073,741,824 > 536,870,912 → refused even at 1×.
    const sheet = [{ id: 'huge', title: 'Huge', imageWidthPx: 16384, imageHeightPx: 16384 }];
    expect(checkMultiplierFor({ multiplier: 1 }, sheet)).toEqual({ ok: false, largest: null });
  });

  it('an empty plan is trivially allowed (the wizard blocks the empty scope before this)', () => {
    expect(checkMultiplierFor({ multiplier: 3 }, [])).toEqual({ ok: true });
  });
});

describe('estimatePlan — the approved `Will write …` arithmetic', () => {
  it('PNG without zip: one file per sheet, 2 B per bitmap px', () => {
    // Per sheet: 4096 × 3072 × 2² × 2 = 4096×3072×4×2 = 100,663,296 B; ×2 sheets = 201,326,592.
    const plan = { format: 'png' as const, zip: false, multiplier: 2 as const };
    expect(estimatePlan(plan, SHEETS.slice(0, 2))).toEqual({ fileCount: 2, bytes: 201_326_592 });
  });

  it('PNG with zip: one file', () => {
    const plan = { format: 'png' as const, zip: true, multiplier: 2 as const };
    expect(estimatePlan(plan, SHEETS).fileCount).toBe(1);
  });

  it('PDF: one file, 0.5 B per bitmap px (JPEG q0.92)', () => {
    // 4096 × 3072 × 2² × 0.5 = 4096×3072×4×0.5 = 25,165,824 B.
    const plan = { format: 'pdf' as const, zip: false, multiplier: 2 as const };
    expect(estimatePlan(plan, SHEETS.slice(0, 1))).toEqual({ fileCount: 1, bytes: 25_165_824 });
  });

  it('the codec factors are the documented constants, not magic numbers in the body', () => {
    expect(ESTIMATED_PNG_BYTES_PER_PX).toBe(2);
    expect(ESTIMATED_JPEG_BYTES_PER_PX).toBe(0.5);
  });
});

describe('part names and the timestamp', () => {
  it('part-NN.pdf is zero-padded, and widens past 99 rather than truncating', () => {
    expect(pdfPartName(1)).toBe('part-01.pdf');
    expect(pdfPartName(10)).toBe('part-10.pdf');
    expect(pdfPartName(100)).toBe('part-100.pdf');
  });

  it('a single part keeps the aggregate name; a split uses part-NN.pdf', () => {
    const plan = { format: 'pdf' as const, zip: false };
    // One part → the same name a non-split PDF would write.
    expect(pdfFileNames(1, plan, 'Riverside', SHEETS)).toEqual(['Riverside.pdf']);
    // Three parts → the fixed split names, in order, one per part.
    expect(pdfFileNames(3, plan, 'Riverside', SHEETS)).toEqual([
      'part-01.pdf',
      'part-02.pdf',
      'part-03.pdf',
    ]);
  });

  it('the default destination stamp matches the spec’s `YYYY-MM-DD_HHmm` example', () => {
    // Month is 0-based: 8 = September.
    expect(exportTimestamp(new Date(2026, 8, 21, 14, 12))).toBe('2026-09-21_1412');
    expect(exportTimestamp(new Date(2026, 0, 3, 9, 5))).toBe('2026-01-03_0905');
  });
});

describe('collectAssetIds — insets, including nested children', () => {
  it('collects top-level and child image asset ids, ignoring other kinds', () => {
    const image = (id: string, assetId: string | null, children?: Annotation[]): Annotation => ({
      id,
      type: 'image',
      geometry: { kind: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0 },
      style: {
        strokeColor: '#FF7A18',
        strokeWidthMu: 4,
        fillColor: null,
        fillAlpha: 1,
        lineStyle: 'solid',
        arrowheads: 'none',
        fontSizeMu: 18,
        bold: false,
      },
      zIndex: 0,
      source: 'manual',
      assetId,
      locked: false,
      children,
    });
    const line: Annotation = {
      id: 'line-1',
      type: 'line',
      geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      style: {
        strokeColor: '#FF7A18',
        strokeWidthMu: 4,
        fillColor: null,
        fillAlpha: 1,
        lineStyle: 'solid',
        arrowheads: 'none',
        fontSizeMu: 18,
        bold: false,
      },
      zIndex: 1,
      source: 'manual',
      assetId: null,
      locked: false,
    };
    const tree = [line, image('i1', 'asset-a', [image('i1c', 'asset-b')]), image('i2', null)];
    expect(collectAssetIds(tree)).toEqual(['asset-a', 'asset-b']);
  });
});
