/**
 * `tests/insetAssets.test.ts` — §19.3 content-addressed assets (node project).
 *
 * The pure storage half is sliced out of the browser decode so this gate can run in
 * node: `persistAsset` takes an already-normalized blob and dedupes it by SHA-256. The
 * real `projectStore.writeAtomic` runs here against the in-memory FSA fake, so the
 * tmp→move path and the per-project Web Lock are exercised, not stubbed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeDir, asDir, createFakeLocks, installFakeNavigator } from './fakes/fsa';
import { assetFileName, assetPath, persistAsset } from '../src/editor/inset/insetAssets';
import { sha256Hex } from '../src/media/normalizeImage';

describe('content-addressed inset assets (§19.3)', () => {
  let restore: () => void;
  let root: FakeDir;

  beforeEach(() => {
    restore = installFakeNavigator({ locks: createFakeLocks() });
    root = new FakeDir('Riverside');
  });

  afterEach(() => restore());

  it('importing the same image twice writes ONE file and both carry the same hash', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
    const normalized = { blob, width: 2400, height: 1800 };
    const expected = await sha256Hex(blob);

    const first = await persistAsset(asDir(root), 'p:Riverside', normalized);
    const second = await persistAsset(asDir(root), 'p:Riverside', normalized);

    expect(first.assetId).toBe(expected);
    expect(second.assetId).toBe(expected);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false); // the dedupe hit — no second write

    expect(root.childDir('assets').filePaths()).toEqual([`Riverside/assets/${expected}.jpg`]);
    // No stray tmp survivors (the atomic write committed and renamed).
    expect(root.tmpPaths()).toEqual([]);
  });

  it('a different image gets its own content-addressed file', async () => {
    const one = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const two = new Blob([new Uint8Array([9, 9, 9])], { type: 'image/jpeg' });
    const a = await persistAsset(asDir(root), 'p:Riverside', { blob: one, width: 100, height: 100 });
    const b = await persistAsset(asDir(root), 'p:Riverside', { blob: two, width: 100, height: 100 });

    expect(a.assetId).not.toBe(b.assetId);
    expect(root.childDir('assets').filePaths()).toHaveLength(2);
    expect(root.has(`assets/${a.assetId}.jpg`)).toBe(true);
    expect(root.has(`assets/${b.assetId}.jpg`)).toBe(true);
  });

  it('names files `<sha256hex>.jpg` under `assets/`', () => {
    expect(assetFileName('abc123')).toBe('abc123.jpg');
    expect(assetPath('abc123')).toBe('assets/abc123.jpg');
  });
});
