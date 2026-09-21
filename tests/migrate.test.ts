// tests/migrate.test.ts — slice 1.1 (session 4, P11).
// Migration runs AFTER the zod parse. Both functions must be idempotent, and a
// future schemaVersion must be refused, never mangled.
import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migrateProjectFile,
  migrateMarkupFile,
} from '../src/domain/migrate';
import {
  parseProjectFile,
  parseMarkupFile,
  type ProjectFile,
  type MarkupFile,
} from '../src/domain/schema';
import v02Project from './fixtures/v02-project.json';
import v02Markup from './fixtures/v02-markup.json';

const projectFrom = (raw: unknown): ProjectFile => {
  const res = parseProjectFile(JSON.stringify(raw));
  if (!res.success) throw new Error(`fixture failed to parse: ${res.error}`);
  return res.data;
};
const markupFrom = (raw: unknown): MarkupFile => {
  const res = parseMarkupFile(JSON.stringify(raw));
  if (!res.success) throw new Error(`fixture failed to parse: ${res.error}`);
  return res.data;
};

describe('migrateProjectFile', () => {
  it('is idempotent — migrate(migrate(x)) deep-equals migrate(x)', () => {
    const parsed = projectFrom(v02Project);
    const once = migrateProjectFile(parsed);
    const twice = migrateProjectFile(once);
    expect(twice).toEqual(once);
  });

  it('v02 project gains unitFormat: ft-in and precisionDenominator: 16', () => {
    const migrated = migrateProjectFile(projectFrom(v02Project));
    expect(migrated.project.unitFormat).toBe('ft-in');
    expect(migrated.project.precisionDenominator).toBe(16);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does not overwrite an explicitly-set unitFormat / precisionDenominator', () => {
    const explicit = { ...v02Project, project: { ...v02Project.project, unitFormat: 'in', precisionDenominator: 64 } };
    const migrated = migrateProjectFile(projectFrom(explicit));
    expect(migrated.project.unitFormat).toBe('in');
    expect(migrated.project.precisionDenominator).toBe(64);
  });

  it('bumps an older schemaVersion up to CURRENT', () => {
    const older: ProjectFile = { ...projectFrom(v02Project), schemaVersion: 0 };
    const migrated = migrateProjectFile(older);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('refuses a future schemaVersion with a clear error instead of mangling it', () => {
    const future: ProjectFile = { ...migrateProjectFile(projectFrom(v02Project)), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateProjectFile(future)).toThrow(/newer build/);
  });
});

describe('migrateMarkupFile', () => {
  it('is idempotent — migrate(migrate(x)) deep-equals migrate(x)', () => {
    const parsed = markupFrom(v02Markup);
    const once = migrateMarkupFile(parsed);
    const twice = migrateMarkupFile(once);
    expect(twice).toEqual(once);
  });

  it('v02 markup: `label` is absent and schemaVersion is CURRENT', () => {
    const migrated = migrateMarkupFile(markupFrom(v02Markup));
    expect('label' in migrated.objects[0]).toBe(false);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.objects[0].enteredText).toBe('10\'-4 1/2"');
  });

  it('bumps an older schemaVersion up to CURRENT', () => {
    const older: MarkupFile = { ...markupFrom(v02Markup), schemaVersion: 0 };
    const migrated = migrateMarkupFile(older);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('refuses a future schemaVersion with a clear error instead of mangling it', () => {
    const future: MarkupFile = { ...migrateMarkupFile(markupFrom(v02Markup)), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateMarkupFile(future)).toThrow(/newer build/);
  });
});
