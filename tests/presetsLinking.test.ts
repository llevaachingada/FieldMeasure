/**
 * tests/presetsLinking.test.ts — session-14 review, finding 5.
 *
 * THE DEFECT THIS PINS. `src/fs/presets.ts` imports `projectStore` as a NAMESPACE
 * (`import * as projectStore`, DECISIONS D84). A namespace import is not link-time
 * name-checked, so a missing export is `undefined` at use time instead of a `SyntaxError`
 * at link time. Before the fix, that `undefined` was called, threw a bare `TypeError`
 * inside the IO catches, and those catches classified anything that was not a
 * `NotFoundError` as a DATA error:
 *
 *   resolveFieldMeasureDir missing → readPresetsFromDir → { kind: 'corrupt' }
 *                                  → loadPresets       → { ok:false, error:'corrupt' }
 *   resolveOpenProjectDir  missing → loadPresets       → { ok:false, error:'folder-unavailable' }
 *
 * i.e. the user is told their presets file is corrupt, or their folder is gone, when the
 * real fault is OURS and their file is untouched. The §7.5 warn strip offers Retry, which
 * can never succeed for a linking bug.
 *
 * THE SIMULATION IS THE REAL FAILURE MODE, not a stand-in: the module-level mock hides the
 * binding from the namespace object exactly the way a failed link does, and the production
 * code path is otherwise completely unmocked.
 *
 * The rest of the IO contract (missing file is fresh, folder-unavailable + Retry, corrupt
 * never throws) is `tests/presets.test.ts` and stays exactly as it was — this file proves
 * only that a PROGRAMMING error is never laundered into one of those DATA errors.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hidden = vi.hoisted(() => new Set<string>());

// Hide a binding from the namespace object the way a failed module link does.
vi.mock('../src/fs/projectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/fs/projectStore')>();
  return {
    ...actual,
    get resolveFieldMeasureDir() {
      return hidden.has('resolveFieldMeasureDir') ? undefined : actual.resolveFieldMeasureDir;
    },
    get resolveOpenProjectDir() {
      return hidden.has('resolveOpenProjectDir') ? undefined : actual.resolveOpenProjectDir;
    },
    get writePresetsFile() {
      return hidden.has('writePresetsFile') ? undefined : actual.writePresetsFile;
    },
  };
});

const { clearOpenProject, initStore, registerOpenProject } = await import(
  '../src/fs/projectStore'
);
const {
  PresetsBindingError,
  emptyPresets,
  loadPresets,
  readPresetsFromDir,
  savePresets,
} = await import('../src/fs/presets');
const { FakeDir, asDir, createFakeLocks, installFakeNavigator } = await import('./fakes/fsa');

let restoreNavigator: (() => void) | null = null;

async function installRoot(): Promise<InstanceType<typeof FakeDir>> {
  const root = new FakeDir('root');
  root.mkdir('Riverside');
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  registerOpenProject('p1', 'Riverside');
  return root;
}

beforeEach(() => {
  hidden.clear();
});

afterEach(() => {
  hidden.clear();
  restoreNavigator?.();
  restoreNavigator = null;
  clearOpenProject('p1');
});

describe('the mock reproduces a missing export (control)', () => {
  it('hides only the named binding, and only while it is hidden', async () => {
    const store = await import('../src/fs/projectStore');
    expect(typeof store.resolveFieldMeasureDir).toBe('function');
    hidden.add('resolveFieldMeasureDir');
    expect(store.resolveFieldMeasureDir).toBeUndefined();
    expect(typeof store.resolveOpenProjectDir).toBe('function'); // siblings unaffected
    hidden.delete('resolveFieldMeasureDir');
    expect(typeof store.resolveFieldMeasureDir).toBe('function');
  });

  it('the same calls succeed normally while nothing is hidden', async () => {
    await installRoot();
    await savePresets('p1', emptyPresets());
    expect(await loadPresets('p1')).toEqual({ ok: true, presets: emptyPresets() });
  });
});

describe('a missing projectStore binding is never reported as a data error (finding 5)', () => {
  it('resolveFieldMeasureDir missing → NOT `corrupt`; it throws PresetsBindingError', async () => {
    const root = await installRoot();
    hidden.add('resolveFieldMeasureDir');

    const dir = asDir(root.childDir('Riverside'));
    await expect(readPresetsFromDir(dir)).rejects.toBeInstanceOf(PresetsBindingError);
    await expect(readPresetsFromDir(dir)).rejects.toThrow(/resolveFieldMeasureDir/);

    // The behaviour this test exists for: the old code RETURNED `{ kind: 'corrupt' }` here.
    const settled = await readPresetsFromDir(dir).then(
      (value) => ({ returned: value }),
      (error: unknown) => ({ threw: error }),
    );
    expect(settled).not.toEqual({ returned: { kind: 'corrupt' } });
    expect('threw' in settled).toBe(true);
  });

  it('resolveFieldMeasureDir missing → loadPresets does NOT return `corrupt`', async () => {
    await installRoot();
    hidden.add('resolveFieldMeasureDir');

    const settled = await loadPresets('p1').then(
      (value) => ({ returned: value }),
      (error: unknown) => ({ threw: error }),
    );
    expect(settled).not.toEqual({ returned: { ok: false, error: 'corrupt' } });
    expect(settled).toEqual({ threw: expect.any(PresetsBindingError) });
  });

  it('resolveOpenProjectDir missing → loadPresets does NOT return `folder-unavailable`', async () => {
    await installRoot();
    hidden.add('resolveOpenProjectDir');

    const settled = await loadPresets('p1').then(
      (value) => ({ returned: value }),
      (error: unknown) => ({ threw: error }),
    );
    expect(settled).not.toEqual({ returned: { ok: false, error: 'folder-unavailable' } });
    expect(settled).toEqual({ threw: expect.any(PresetsBindingError) });
  });

  it('writePresetsFile missing → savePresets throws a NAMED error, not a bare TypeError', async () => {
    await installRoot();
    hidden.add('writePresetsFile');
    await expect(savePresets('p1', emptyPresets())).rejects.toThrow(/writePresetsFile/);
  });

  it('a genuine storage failure is still a data error (the fix narrowed nothing away)', async () => {
    await installRoot();
    // Never registered → resolveOpenProjectDir throws a plain Error, which is NOT a
    // programming error, so the folder-unavailable classification must survive.
    expect(await loadPresets('p-not-open')).toEqual({ ok: false, error: 'folder-unavailable' });
  });
});
