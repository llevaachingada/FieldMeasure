// tests/schema.test.ts — §3.4 schemas, §3.5/§3.6 example round-trips, v0.2 tolerance.
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseJson, parseProjectFile, parseMarkupFile } from '../src/domain/schema';
import v02Project from './fixtures/v02-project.json';
import v02Markup from './fixtures/v02-markup.json';
import corruptMarkup from './fixtures/corrupt-markup.json';

// §3.5 example project.json, verbatim.
const PROJECT_EXAMPLE = {
  schemaVersion: 1,
  project: {
    id: '0199b0c3-7a1e-7c2b-9d0e-3f4a5b6c7d8e',
    title: 'Riverside Elementary',
    jobNumber: '1204',
    locationLabel: '1204 Oak St, Suite A',
    unitSystem: 'imperial' as const,
    unitFormat: 'ft-in' as const,
    precisionDenominator: 16 as const,
  },
  sheets: [
    {
      id: '0199b0c4-1111-7c2b-9d0e-3f4a5b6c7d8e',
      title: 'Kitchen existing',
      sortIndex: 0,
      imageWidth: 4096,
      imageHeight: 3072,
      calibrationPxPerFoot: null,
      createdAt: '2026-09-21T14:12:03.000Z',
      updatedAt: '2026-09-21T14:18:22.000Z',
      deletedAt: null,
    },
  ],
};

// §3.6 example markup.json, verbatim (includes a nested image inset child).
const MARKUP_EXAMPLE = {
  schemaVersion: 1,
  sheetId: '0199b0c4-1111-7c2b-9d0e-3f4a5b6c7d8e',
  objects: [
    {
      id: '0199b0c5-2222-7c2b-9d0e-3f4a5b6c7d8e',
      type: 'dimension',
      geometry: { kind: 'dimension', a: { x: 820, y: 1280 }, b: { x: 2920, y: 1290 } },
      valueMm: 3162.3,
      enteredText: '10\'-4 1/2"',
      style: { strokeColor: '#FF7A18', strokeWidthMu: 4, fillColor: null, fillAlpha: 1, lineStyle: 'solid', arrowheads: 'both', fontSizeMu: 18, bold: true },
      zIndex: 0,
      source: 'manual',
      assetId: null,
      groupId: null,
      locked: false,
    },
    {
      id: '0199b0c6-3333-7c2b-9d0e-3f4a5b6c7d8e',
      type: 'image',
      geometry: { kind: 'image', x: 2600, y: 900, width: 900, height: 675, rotation: 0,
        crop: { x: 0, y: 0, width: 2400, height: 1800 } },
      valueMm: null, enteredText: null,
      style: { strokeColor: '#2FD4E0', strokeWidthMu: 2, fillColor: null, fillAlpha: 1, lineStyle: 'solid', arrowheads: 'none', fontSizeMu: 18, bold: false },
      zIndex: 10,
      source: 'manual',
      assetId: '0199b0c7-4444-7c2b-9d0e-3f4a5b6c7d8e',
      groupId: null,
      locked: false,
      children: [
        {
          id: '0199b0c8-5555-7c2b-9d0e-3f4a5b6c7d8e',
          type: 'dimension',
          geometry: { kind: 'dimension', a: { x: 120, y: 200 }, b: { x: 600, y: 210 } },
          valueMm: 914.4, enteredText: '3\'-0"',
          style: { strokeColor: '#FF7A18', strokeWidthMu: 4, fillColor: null, fillAlpha: 1, lineStyle: 'solid', arrowheads: 'both', fontSizeMu: 18, bold: true },
          zIndex: 0, source: 'manual', assetId: null, groupId: null, locked: false,
        },
      ],
    },
  ],
};

describe('parseJson', () => {
  const schema = z.object({ a: z.number() });
  it('returns data on success', () => {
    expect(parseJson(schema, '{"a":1}')).toEqual({ success: true, data: { a: 1 } });
  });
  it('returns {success:false} for a schema violation, without throwing', () => {
    const res = parseJson(schema, '{"a":"x"}');
    expect(res.success).toBe(false);
  });
  it('returns {success:false} for malformed JSON, without throwing', () => {
    expect(() => parseJson(schema, '{ not json')).not.toThrow();
    expect(parseJson(schema, '{ not json').success).toBe(false);
    expect(parseJson(schema, '').success).toBe(false);
  });
});

describe('example files round-trip (§3.5 / §3.6)', () => {
  it('parses the example project.json and preserves every field', () => {
    const res = parseProjectFile(JSON.stringify(PROJECT_EXAMPLE));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual(PROJECT_EXAMPLE);
  });
  it('parses the example markup.json including a nested image-inset child (z.lazy)', () => {
    const res = parseMarkupFile(JSON.stringify(MARKUP_EXAMPLE));
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toEqual(MARKUP_EXAMPLE);
      expect(res.data.objects[1].children).toHaveLength(1);
      expect(res.data.objects[1].children![0].enteredText).toBe('3\'-0"');
    }
  });
});

describe('rejections', () => {
  it('rejects a missing schemaVersion', () => {
    const { schemaVersion: _omitted, ...noVersion } = PROJECT_EXAMPLE;
    expect(parseProjectFile(JSON.stringify(noVersion)).success).toBe(false);
  });

  it('rejects screen-pixel data (a style with a screen `strokeWidth` and no markup-unit `strokeWidthMu`)', () => {
    const screenPx = {
      schemaVersion: 1,
      sheetId: 's1',
      objects: [{
        id: 'a1', type: 'line',
        geometry: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 10 } },
        style: { strokeColor: '#FF7A18', strokeWidth: 2, fillColor: null, fillAlpha: 1,
          lineStyle: 'solid', arrowheads: 'none', fontSizeMu: 18, bold: false },
        zIndex: 0, source: 'manual', locked: false,
      }],
    };
    expect(parseMarkupFile(JSON.stringify(screenPx)).success).toBe(false);
  });

  it('rejects a corrupt (wrong-shape) markup file without throwing', () => {
    expect(() => parseMarkupFile(JSON.stringify(corruptMarkup))).not.toThrow();
    expect(parseMarkupFile(JSON.stringify(corruptMarkup)).success).toBe(false);
  });
});

describe('v0.2 tolerance', () => {
  it('strips a stale `label` key (zod ignores unknown keys)', () => {
    const res = parseMarkupFile(JSON.stringify(v02Markup));
    expect(res.success).toBe(true);
    if (res.success) {
      expect('label' in res.data.objects[0]).toBe(false);
      expect(res.data.objects[0].enteredText).toBe('10\'-4 1/2"');
    }
  });

  it('tolerates a missing unitFormat on parse (normalized later by migrateProjectFile)', () => {
    const res = parseProjectFile(JSON.stringify(v02Project));
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.project.unitFormat == null).toBe(true);
      expect(res.data.project.precisionDenominator == null).toBe(true);
    }
  });
});

// D133 (UI/GUI handoff pass): the inset-only style keys added to `AnnotationStyleZ`.
// `.nullish()`, same translation as `Annotation.visible` — no schema version bump, so
// the § 3.6 example above (whose 'image' style predates these keys) is itself the
// "an old file still parses with the keys absent" case, already exercised by the
// round-trip test.
describe('D133 — insetBorder/insetRadius/insetShadow', () => {
  const imageAnnotation = () => MARKUP_EXAMPLE.objects[1]!;

  it('parses when present, with the correct types', () => {
    const withKeys = {
      ...MARKUP_EXAMPLE,
      objects: [
        MARKUP_EXAMPLE.objects[0],
        { ...imageAnnotation(), style: { ...imageAnnotation().style, insetBorder: true, insetRadius: 24, insetShadow: true } },
      ],
    };
    const res = parseMarkupFile(JSON.stringify(withKeys));
    expect(res.success).toBe(true);
    if (res.success) {
      const style = res.data.objects[1]!.style;
      expect(style.insetBorder).toBe(true);
      expect(style.insetRadius).toBe(24);
      expect(style.insetShadow).toBe(true);
    }
  });

  it('rejects a negative insetRadius (no visual meaning; renderInset also clamps it, but the schema should not accept it)', () => {
    const negative = {
      ...MARKUP_EXAMPLE,
      objects: [
        MARKUP_EXAMPLE.objects[0],
        { ...imageAnnotation(), style: { ...imageAnnotation().style, insetRadius: -1 } },
      ],
    };
    const res = parseMarkupFile(JSON.stringify(negative));
    expect(res.success).toBe(false);
  });
});
