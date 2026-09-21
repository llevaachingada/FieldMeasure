// Migration — plan slice 1.1 (session 4, P11), §3.1/§19.5.
//
// Runs AFTER the zod parse, never before: the guarded parse (§3.4) tolerates a
// pre-v0.3 file (missing `unitFormat`/`precisionDenominator` — see schema.ts) and
// strips stale/removed keys such as the old `label`, then this normalize step fills
// the v0.3 defaults and stamps the current schema version.
//
// Both functions are IDEMPOTENT — `migrate(migrate(x))` deep-equals `migrate(x)`.
// That property is what makes it safe to run on every load. A file from a NEWER
// build (schemaVersion > CURRENT) is refused with a clear error, never mangled:
// two Surfaces on different builds must not silently downgrade each other's files
// (spec §3.1, slice 1.11).

import type { MarkupFile, ProjectFile } from './schema';

/** v0.3 on-disk schema version (the §3.5/§3.6 examples use `schemaVersion: 1`). */
export const CURRENT_SCHEMA_VERSION = 1;

/** Default `unitFormat` for a project that predates the field (§19.5 / §6.1). */
export const DEFAULT_UNIT_FORMAT = 'ft-in' as const;
/** Default `precisionDenominator` for a project that predates the field (§19.5). */
export const DEFAULT_PRECISION_DENOMINATOR = 16 as const;

function assertNotFuture(version: number, kind: string): void {
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported ${kind} schemaVersion ${version}: this build supports up to ` +
      `${CURRENT_SCHEMA_VERSION}. The file was written by a newer build; refusing to ` +
      `open it rather than risk downgrading it.`,
    );
  }
}

/**
 * Normalize a parsed project envelope: fill `unitFormat`/`precisionDenominator`
 * defaults when absent (nullish) and stamp `schemaVersion`. Idempotent.
 */
export function migrateProjectFile(parsed: ProjectFile): ProjectFile {
  assertNotFuture(parsed.schemaVersion, 'project');
  return {
    ...parsed,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      ...parsed.project,
      unitFormat: parsed.project.unitFormat ?? DEFAULT_UNIT_FORMAT,
      precisionDenominator: parsed.project.precisionDenominator ?? DEFAULT_PRECISION_DENOMINATOR,
    },
  };
}

/**
 * Normalize a parsed markup envelope. Markup has no project-level defaults — the
 * stale `label` key was already stripped by the zod parse — so this only stamps
 * `schemaVersion`. Idempotent.
 */
export function migrateMarkupFile(parsed: MarkupFile): MarkupFile {
  assertNotFuture(parsed.schemaVersion, 'markup');
  return {
    ...parsed,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
