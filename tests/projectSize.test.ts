/**
 * `tests/projectSize.test.ts` (node) — the real on-disk measurement behind the UI §11.4
 * storage chip. Executes `measureProjectSize` against the in-memory File System Access fake
 * (`tests/fakes/fsa.ts`), the same fixture style as `tests/sheetTrash.test.ts`.
 *
 * Pins:
 *   - the walk sums files at several nesting depths AND inside `.history/` and `.trash/`
 *     (the chip reports what the project really occupies), with `fileCount` matching;
 *   - `savedAt` is `project.json`'s real `lastModified` (and `null` when it is absent —
 *     never `Date.now()`);
 *   - a project that cannot be resolved rejects rather than reporting `0 B`;
 *   - an individual unreadable entry is skipped (best-effort) while the rest still count;
 *     a project folder that cannot be iterated throws;
 *   - `formatBytes` boundaries with the arithmetic shown.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { formatBytes, measureProjectSize } from '../src/fs/projectSize';
import { initStore, registerOpenProject } from '../src/fs/projectStore';
import {
  FakeDir,
  asDir,
  createFakeLocks,
  installFakeNavigator,
  type FakeHooks,
} from './fakes/fsa';

let restoreNavigator: (() => void) | null = null;

afterEach(() => {
  restoreNavigator?.();
  restoreNavigator = null;
});

/** D51 runtime key — `${id}:${folderName}`, the same key the app registers. */
const PROJECT_KEY = 'p1:Riverside';
const FOLDER = 'Riverside';

async function openProject(root: FakeDir): Promise<void> {
  restoreNavigator = installFakeNavigator({
    locks: createFakeLocks(),
    storage: { getDirectory: async () => asDir(root) },
  });
  await initStore();
  registerOpenProject(PROJECT_KEY, FOLDER);
}

/** A fixed, real epoch used for `project.json`'s `lastModified`. */
const SAVED_MS = Date.UTC(2026, 8, 21, 14, 14, 0);

/**
 * The nesting fixture. Every file is ASCII, so `FakeFile.size === content.length` exactly.
 *
 *   Riverside/project.json                    10   (lastModified = SAVED_MS)
 *   Riverside/sheets/s1/photo.jpg            100
 *   Riverside/sheets/s1/markup.json           20
 *   Riverside/assets/abc.jpg                  50
 *   Riverside/a/b/c/deep.bin                  60   (depth 3)
 *   Riverside/.history/s1/1-markup.json       30
 *   Riverside/.history/_project/1-proj.json   15
 *   Riverside/.trash/s2/photo.jpg             40
 *   ── 8 files, 10+100+20+50+60+30+15+40 = 325 bytes
 */
function putFixture(root: FakeDir): void {
  root.putFile(`${FOLDER}/project.json`, 'P'.repeat(10), SAVED_MS);
  root.putFile(`${FOLDER}/sheets/s1/photo.jpg`, 'A'.repeat(100));
  root.putFile(`${FOLDER}/sheets/s1/markup.json`, 'B'.repeat(20));
  root.putFile(`${FOLDER}/assets/abc.jpg`, 'C'.repeat(50));
  root.putFile(`${FOLDER}/a/b/c/deep.bin`, 'D'.repeat(60));
  root.putFile(`${FOLDER}/.history/s1/${SAVED_MS}-markup.json`, 'E'.repeat(30));
  root.putFile(`${FOLDER}/.history/_project/${SAVED_MS}-project.json`, 'F'.repeat(15));
  root.putFile(`${FOLDER}/.trash/s2/photo.jpg`, 'G'.repeat(40));
}

describe('measureProjectSize — the real folder sum', () => {
  it('sums every file at every depth, including .history/ and .trash/, and counts them', async () => {
    const root = new FakeDir('root');
    putFixture(root);
    await openProject(root);

    const size = await measureProjectSize(PROJECT_KEY);

    expect(size.bytes).toBe(325); // 10+100+20+50+60+30+15+40
    expect(size.fileCount).toBe(8);
  });

  it('reads savedAt from project.json’s real lastModified (never Date.now())', async () => {
    const root = new FakeDir('root');
    putFixture(root);
    await openProject(root);

    const size = await measureProjectSize(PROJECT_KEY);

    // lastModified is a file property; the ISO string is that property, not the clock.
    expect(size.savedAt).toBe(new Date(SAVED_MS).toISOString());
    const ageMs = Math.abs(Date.now() - Date.parse(size.savedAt as string));
    expect(ageMs).toBeGreaterThan(60_000); // a fabricated Date.now() would be ~0
  });

  it('reports savedAt null when project.json is absent (still measures the rest)', async () => {
    const root = new FakeDir('root');
    root.mkdir(FOLDER);
    root.putFile(`${FOLDER}/sheets/s1/photo.jpg`, 'A'.repeat(100));
    await openProject(root);

    const size = await measureProjectSize(PROJECT_KEY);

    expect(size.savedAt).toBeNull();
    expect(size.bytes).toBe(100);
    expect(size.fileCount).toBe(1);
  });

  it('rejects when the project folder cannot be resolved (never reports 0 B)', async () => {
    const root = new FakeDir('root');
    putFixture(root);
    await openProject(root);
    registerOpenProject('p9:Gone', 'Gone'); // registered, but the folder does not exist

    await expect(measureProjectSize('p9:Gone')).rejects.toThrow();
    // An unregistered key is the same honest failure, not an empty measurement.
    await expect(measureProjectSize('ghost:Nowhere')).rejects.toThrow();
  });

  it('skips an individual unreadable file but still counts the readable ones', async () => {
    const hooks: FakeHooks = {
      beforeGetFile: (file) => {
        if (file.name === 'locked.jpg') throw new DOMException('locked', 'NotReadableError');
      },
    };
    const root = new FakeDir('root', hooks);
    root.putFile(`${FOLDER}/project.json`, 'P'.repeat(10), SAVED_MS);
    root.putFile(`${FOLDER}/locked.jpg`, 'X'.repeat(999)); // unreadable
    root.putFile(`${FOLDER}/ok.jpg`, 'Y'.repeat(25));
    await openProject(root);

    const size = await measureProjectSize(PROJECT_KEY);

    expect(size.bytes).toBe(35); // 10 + 25, the locked file contributes nothing
    expect(size.fileCount).toBe(2);
  });

  it('throws when the project folder itself cannot be iterated', async () => {
    const root = new FakeDir('root');
    putFixture(root);
    await openProject(root);
    const projectDir = root.childDir(FOLDER);
    Object.defineProperty(projectDir, 'entries', {
      value: async function* (): AsyncIterableIterator<[string, never]> {
        throw new DOMException('unreadable', 'NotReadableError');
      },
      configurable: true,
    });

    await expect(measureProjectSize(PROJECT_KEY)).rejects.toThrow();
  });
});

describe('formatBytes — boundaries (arithmetic shown)', () => {
  it('shows whole bytes below 1 KiB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('switches at 1024 bytes', () => {
    expect(formatBytes(1024)).toBe('1 KB'); // 1024 / 1024 = 1
    expect(formatBytes(1536)).toBe('1.5 KB'); // 1536 / 1024 = 1.5
  });

  it('matches the chip example: 184549376 → 176 MB', () => {
    expect(formatBytes(184549376)).toBe('176 MB'); // 184549376 / 1048576 = 176 exactly
  });

  it('shows 1.5 MB and 1 MB', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB'); // 1572864 / 1048576 = 1.5
    expect(formatBytes(1048576)).toBe('1 MB'); // 1 × 1024²
  });

  it('reaches GB scale', () => {
    expect(formatBytes(2147483648)).toBe('2 GB'); // 2 × 1024³
    expect(formatBytes(536870912)).toBe('512 MB'); // 512 × 1024²
  });

  it('floors the decimal — never rounds up (a size that overstates disk use is a lie)', () => {
    // (184549376 + 1_000_000) / 1048576 = 176.953674… → 176.9, not 177.
    expect(formatBytes(185549376)).toBe('176.9 MB');
  });
});
