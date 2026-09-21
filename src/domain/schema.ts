// Validation schemas — §3.4 of docs/preflight-handoff-v0.3-hardened.md.
//
// SPEC CORRECTION (session 4 / slice 1.1, recorded in DECISIONS):
// §3.4 declares `ProjectFileZ.project.unitFormat` (required z.enum) and
// `precisionDenominator` (required z.union of literals). Taken literally, a v0.2
// project file that predates those fields FAILS parse — contradicting §3.4's own
// migration note, §19.5, and the plan's rule "migration runs AFTER the zod parse,
// never before". The reconcile step therefore makes these two fields `.nullish()`
// (tolerate `undefined | null`) so the guarded parse succeeds, and then
// `migrateProjectFile` (src/domain/migrate.ts) fills the v0.3 defaults
// (`unitFormat: 'ft-in'`, `precisionDenominator: 16`). The wrong-measurement
// guards in units.ts (`isCommittableInches`, `VALID_DENOMINATORS`, numerator <
// denominator) are untouched.
//
// SECOND SPEC CORRECTION (same slice): §3.4 applies `.nullish()` to every
// optional/nullable annotation field, but §3.3 declares `AnnotationStyle.fillColor`
// as REQUIRED-nullable (`string | null`) and `Annotation.children` as optional
// WITHOUT null (`children?: Annotation[]`). A `.nullish()` output is
// `| null | undefined`, which cannot satisfy `AnnotationZ: z.ZodType<Annotation>`
// under `strict`. Executed `tsc --noEmit` fails on it. The exact translations are
// `.nullable()` for `fillColor` and `.optional()` for `children`; the remaining
// `?: X | null` fields keep `.nullish()` as the spec note instructs. No valid
// §3.5/§3.6 object is rejected (verified by the round-trip tests).
//
// zod 4 ≠ zod 3: `safeParse` returns a discriminated union (does not throw); the
// error param is a single `error` (not `message`/`invalid_type_error`); string
// formats are top-level (`z.email()`); apply defaults in code (the normalize step),
// not via `.default()`. Self-referential inset `children[]` uses `z.lazy()`.
// Optional-with-null fields use `.nullish()` — plain `.nullable()` rejects
// `undefined` and fails validation on objects built from the TS types in §3.3.

import { z } from 'zod';
import type { Annotation } from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;
const Px = z.object({ x: z.number(), y: z.number() });

export const AnnotationStyleZ = z.object({
  strokeColor: z.string().regex(HEX),
  strokeWidthMu: z.number().positive(),
  // SPEC CORRECTION (session 4 / slice 1.1): §3.3 types `fillColor` as REQUIRED-nullable
  // (`string | null`), so `.nullish()` (which outputs `string | null | undefined`) is not
  // assignable to it under `AnnotationZ: z.ZodType<Annotation>` + `strict`. `.nullable()`
  // is the exact translation; the field is always present (null = no fill), so no valid
  // object is rejected. See the note atop schema.ts.
  fillColor: z.string().regex(HEX).nullable(),
  fillAlpha: z.number().min(0).max(1),
  lineStyle: z.enum(['solid', 'dashed', 'dotted']),
  arrowheads: z.enum(['none', 'start', 'end', 'both']),
  fontSizeMu: z.number().positive(),
  bold: z.boolean(),
});

export const GeometryZ = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dimension'), a: Px, b: Px, labelOffset: z.number().optional() }),
  z.object({ kind: z.literal('angle'), a: Px, vertex: Px, c: Px }),
  z.object({ kind: z.literal('line'), a: Px, b: Px }),
  z.object({ kind: z.literal('arrow'), a: Px, b: Px, elbow: z.enum(['straight', 'right', 'curved']).optional() }),
  z.object({ kind: z.literal('rect'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), cornerRadius: z.number().optional() }),
  z.object({ kind: z.literal('ellipse'), x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  z.object({ kind: z.literal('polygon'), points: z.array(Px), closed: z.boolean() }),
  z.object({ kind: z.literal('freehand'), points: z.array(Px), pressure: z.array(z.number()) }),
  z.object({ kind: z.literal('highlight'), points: z.array(Px), pressure: z.array(z.number()) }),
  z.object({ kind: z.literal('text'), at: Px, text: z.string(), background: z.enum(['none', 'pill', 'solid', 'auto']) }),
  z.object({ kind: z.literal('image'), x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotation: z.number(),
    crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
    flipX: z.boolean().optional(), flipY: z.boolean().optional(), opacity: z.number().optional() }),
]);

export const AnnotationZ: z.ZodType<Annotation> = z.object({
  id: z.string(),
  type: z.enum(['dimension', 'angle', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'freehand', 'highlight', 'text', 'image']),
  geometry: GeometryZ,
  valueMm: z.number().nullish(),
  valueDeg: z.number().nullish(),
  enteredText: z.string().nullish(),
  style: AnnotationStyleZ,
  zIndex: z.number(),
  source: z.enum(['manual', 'laser', 'calibrated']),
  assetId: z.string().nullish(),
  groupId: z.string().nullish(),
  locked: z.boolean(),
  // SPEC CORRECTION (session 4 / slice 1.1): §3.3 types `children` as optional WITHOUT
  // null (`children?: Annotation[]`), so `.optional()` — not `.nullish()` — is the exact
  // translation. `.nullish()` outputs `Annotation[] | null | undefined`, which is not
  // assignable to the domain type. See the note atop schema.ts.
  children: z.array(z.lazy(() => AnnotationZ)).optional(),
});

export const MarkupFileZ = z.object({
  schemaVersion: z.number(),
  sheetId: z.string(),
  objects: z.array(AnnotationZ),
});

export const ProjectFileZ = z.object({
  schemaVersion: z.number(),
  project: z.object({
    id: z.string(),
    title: z.string(),
    jobNumber: z.string().optional(),
    locationLabel: z.string().optional(),
    unitSystem: z.enum(['imperial', 'metric']),
    // v0.3 added these two; `.nullish()` so a pre-v0.3 file parses and is normalized
    // by migrateProjectFile (see the SPEC CORRECTION note above).
    unitFormat: z.enum(['ft-in', 'in', 'ft-decimal']).nullish(),
    precisionDenominator: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16), z.literal(32), z.literal(64)]).nullish(),
  }),
  sheets: z.array(z.object({
    id: z.string(), title: z.string(), sortIndex: z.number(),
    imageWidth: z.number(), imageHeight: z.number(),
    calibrationPxPerFoot: z.number().nullish(),
    createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullish(),
  })),
});

// On-disk ENVELOPE types. NOTE: `ProjectFile` (the on-disk envelope) is a DIFFERENT
// shape from `Project` (§3.3 domain type) — do not conflate them. Migration operates
// on these `*File` envelopes.
export type ProjectFile = z.infer<typeof ProjectFileZ>;
export type MarkupFile = z.infer<typeof MarkupFileZ>;

/** Guarded parse: corrupt JSON must return { success: false }, NEVER throw —
 *  readJsonValidated (§5.3) relies on this to reach the .history recovery path.
 *  Synchronous (zod is sync); readJsonValidated's `parse` param may be sync or
 *  async — `await` on a plain value is fine either way. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string):
  { success: true; data: T } | { success: false; error: string } {
  try {
    const res = schema.safeParse(JSON.parse(raw));
    return res.success
      ? { success: true as const, data: res.data }
      : { success: false as const, error: JSON.stringify(res.error.issues) };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
}

export const parseProjectFile = (raw: string) => parseJson(ProjectFileZ, raw);
export const parseMarkupFile  = (raw: string) => parseJson(MarkupFileZ, raw);
