/**
 * tests/presets.test.ts — slice 1.8 lane C1 preset IO gates (§7.3, §7.5).
 *
 * Everything runs against the REAL `src/fs/projectStore.ts` write path with the in-memory
 * FSA fake (`tests/fakes/fsa.ts`): atomic tmp → close → move, under the per-project Web
 * Lock. It proves by execution:
 *   - write → reload → restore round-trips `.fieldmeasure/presets.json`;
 *   - the file travels as `.fieldmeasure/presets.json` inside the project folder;
 *   - no `*.tmp` survives an atomic write;
 *   - a missing file is a fresh project; a corrupt file and an unavailable folder produce
 *     the error states the shell's warn strip + Retry consume.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_STYLE, type AnnotationStyle } from '../src/domain/types';
import { clearOpenProject, initStore, registerOpenProject } from '../src/fs/projectStore';
import {
  emptyPresets,
  findPreset,
  loadPresets,
  parsePresets,
  presetsForTool,
  readPresetsFromDir,
  removePreset,
  savePresets,
  upsertPreset,
  type PresetsFile,
} from '../src/fs/presets';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
  clearOpenProject('p1');
  clearOpenProject('p2');
  clearOpenProject('p3');
});

async function installRoot(root: FakeDir): Promise<ReturnType<typeof createFakeLocks>> {
  const locks = createFakeLocks();
  restoreNavigator = installFakeNavigator({
    locks,
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  return locks;
}

const withStyle = (patch: Partial<AnnotationStyle>): AnnotationStyle => ({
  ...DEFAULT_STYLE,
  ...patch,
});

function sampleFile(): PresetsFile {
  let file = emptyPresets();
  file = upsertPreset(file, 'dimension', {
    name: 'Red footing',
    style: withStyle({ strokeColor: '#E8384F', strokeWidthMu: 6 }),
  });
  file = upsertPreset(file, 'text', {
    name: 'Field note',
    style: withStyle({ bold: true, fontSizeMu: 30 }),
  });
  return file;
}

describe('presets round-trip through projectStore (§7.3)', () => {
  it('write → reload → restore, at <project>/.fieldmeasure/presets.json', async () => {
    const root = new FakeDir('root');
    root.mkdir('Riverside');
    const locks = await installRoot(root);
    registerOpenProject('p1', 'Riverside');

    const file = sampleFile();
    await savePresets('p1', file);

    expect(root.has('Riverside/.fieldmeasure/presets.json')).toBe(true);
    expect(root.tmpPaths()).toEqual([]); // atomic write left no tmp survivor
    expect(locks.requested).toContain('fm:project:p1:write'); // under the per-write mutex (D121)

    // "Reload": a fresh read from disk through the same public loader.
    const loaded = await loadPresets('p1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.presets).toEqual(file);

    const dimension = presetsForTool(loaded.presets, 'dimension');
    expect(dimension).toHaveLength(1);
    expect(dimension[0].name).toBe('Red footing');
    expect(dimension[0].style.strokeColor).toBe('#E8384F');
    expect(presetsForTool(loaded.presets, 'line')).toEqual([]);
  });

  it('a missing file is a fresh project (empty, not an error)', async () => {
    const root = new FakeDir('root');
    root.mkdir('Riverside');
    await installRoot(root);
    registerOpenProject('p1', 'Riverside');

    expect(await readPresetsFromDir(asDir(root.childDir('Riverside')))).toEqual({ kind: 'missing' });
    const loaded = await loadPresets('p1');
    expect(loaded).toEqual({ ok: true, presets: emptyPresets() });
  });

  it('an unavailable folder reports folder-unavailable, and Retry succeeds once registered', async () => {
    const root = new FakeDir('root');
    root.mkdir('Riverside');
    await installRoot(root);

    // Not registered yet → the folder cannot be resolved.
    const failed = await loadPresets('p3');
    expect(failed).toEqual({ ok: false, error: 'folder-unavailable' });

    // Retry path: the shell re-resolves the folder (project open) and calls again.
    registerOpenProject('p3', 'Riverside');
    const retried = await loadPresets('p3');
    expect(retried.ok).toBe(true);
  });

  it('a corrupt file reports corrupt and never throws', async () => {
    const root = new FakeDir('root');
    root.putFile('Riverside/.fieldmeasure/presets.json', '{ not json');
    await installRoot(root);
    registerOpenProject('p1', 'Riverside');

    expect(await readPresetsFromDir(asDir(root.childDir('Riverside')))).toEqual({ kind: 'corrupt' });
    expect(await loadPresets('p1')).toEqual({ ok: false, error: 'corrupt' });
  });

  it('a structurally invalid preset is rejected (a wrong style never reaches the UI)', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      byTool: { dimension: [{ name: 'bad', style: { strokeColor: 123 } }] },
    });
    expect(parsePresets(raw)).toBeNull();
    expect(parsePresets('not json')).toBeNull();
    expect(parsePresets('[]')).toBeNull();
  });
});

describe('preset pure helpers', () => {
  it('upsert replaces a preset of the same name IN PLACE', () => {
    let file = emptyPresets();
    file = upsertPreset(file, 'line', { name: 'A', style: withStyle({ strokeColor: '#FFFFFF' }) });
    file = upsertPreset(file, 'line', { name: 'B', style: withStyle({ strokeColor: '#000000' }) });
    file = upsertPreset(file, 'line', { name: 'A', style: withStyle({ strokeColor: '#FF7A18' }) });

    const list = presetsForTool(file, 'line');
    expect(list.map((preset) => preset.name)).toEqual(['A', 'B']); // A kept its slot
    expect(list[0].style.strokeColor).toBe('#FF7A18');
  });

  it('remove deletes by name and drops an emptied tool', () => {
    let file = sampleFile();
    file = removePreset(file, 'text', 'Field note');
    expect(file.byTool.text).toBeUndefined();
    expect(findPreset(file, 'text', 'Field note')).toBeUndefined();
    expect(findPreset(file, 'dimension', 'Red footing')?.name).toBe('Red footing');
  });

  it('presetsForTool returns copies a caller cannot use to mutate the file', () => {
    const file = sampleFile();
    const list = presetsForTool(file, 'dimension');
    list[0].style.strokeColor = '#000000';
    expect(file.byTool.dimension?.[0].style.strokeColor).toBe('#E8384F');
  });

  it('parse preserves an unknown tool key (forward compatibility)', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      byTool: { futureTool: [{ name: 'x', style: DEFAULT_STYLE }] },
    });
    const parsed = parsePresets(raw);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(parsed.byTool['futureTool' as keyof typeof parsed.byTool]).toBeDefined();
  });
});
