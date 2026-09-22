/**
 * `src/editor/inset/insetAssets.ts` — the §19.3 **content-addressed asset store**.
 *
 * Assets are the second photos an inset references. They are stored at
 * `assets/<sha256hex>.jpg` and deduped by content hash — there is **no index file**
 * to write, so there is no index file to corrupt (packet lines 1196–1198).
 *
 * A picked file is normalized exactly like a sheet photo (§7.1: EXIF baked in, long
 * edge ≤ 4096, re-encoded JPEG) and hashed **after** normalization, so two imports of
 * the same source file produce the same bytes and therefore one file. Both annotations
 * carry that hash as `assetId`.
 *
 * Children belong to the ANNOTATION, not the asset (§8.5:1800): two insets sharing one
 * asset file have independent children. Nothing in this module touches children.
 *
 * AGENTS #3: the only write is `projectStore.writeAtomic` (tmp → close → `move()`,
 * under the per-project Web Lock). `projectId` is the D51 runtime key
 * `${id}:${folderName}` everywhere.
 */
import { normalizeImage, sha256Hex } from '@/media/normalizeImage';
import { resolveAssetsDir, writeAtomic } from '@/fs/projectStore';

/** A decoded, normalized asset — what the engine renders and what gets stored. */
export interface NormalizedAsset {
  blob: Blob;
  width: number;
  height: number;
}

export interface StoredAsset {
  assetId: string;
  width: number;
  height: number;
  /** False when the file already existed — the dedupe hit (§19.3). */
  created: boolean;
}

/** `assets/<sha256hex>.jpg` (§19.3). The extension is always `.jpg` (JPEG re-encode). */
export function assetFileName(assetId: string): string {
  return `${assetId}.jpg`;
}

/** The project-relative path, for display/reporting only. */
export function assetPath(assetId: string): string {
  return `assets/${assetFileName(assetId)}`;
}

/**
 * Store an already-normalized asset, deduping by content hash.
 *
 * The existence check is a `getFileHandle({ create: false })` probe — a miss throws
 * `NotFoundError`, which is the only signal that the file is absent. Nothing is read
 * back; content addressing makes a byte comparison unnecessary.
 */
export async function persistAsset(
  projectDir: FileSystemDirectoryHandle,
  projectId: string,
  normalized: NormalizedAsset,
): Promise<StoredAsset> {
  const assetId = await sha256Hex(normalized.blob);
  const dir = await resolveAssetsDir(projectDir, { create: true });
  const name = assetFileName(assetId);
  let exists = true;
  try {
    await dir.getFileHandle(name, { create: false });
  } catch {
    exists = false;
  }
  if (!exists) await writeAtomic(dir, name, normalized.blob, projectId);
  return { assetId, width: normalized.width, height: normalized.height, created: !exists };
}

/** Normalize a picked file, then store it content-addressed. */
export async function storeInsetAsset(
  projectDir: FileSystemDirectoryHandle,
  projectId: string,
  file: Blob,
): Promise<StoredAsset> {
  const normalized = await normalizeImage(file);
  return persistAsset(projectDir, projectId, normalized);
}
