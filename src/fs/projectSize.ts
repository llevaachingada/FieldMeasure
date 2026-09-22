/**
 * `src/fs/projectSize.ts` — the *real* on-disk size of one project folder, for the UI
 * §11.4 storage chip (`Local · 48 MB · Saved 2:14 PM`).
 *
 * WHAT COUNTS — **everything under the project folder**: `project.json`, `sheets/`,
 * `assets/`, `.fieldmeasure/`, and the `.history/` and `.trash/` folders too. Those two
 * folders are part of what this project actually occupies on the user's disk, so they are
 * summed like any other file. Excluding them would report a number smaller than the space
 * the project really uses — a quiet lie of the same family as D110/D114 (the interface
 * claiming something the system had not done). Nothing is hidden here.
 *
 * WHAT IS NEVER DONE — no estimate, no `localStorage`, no rounding **up**, and above all no
 * fabricated time. `bytes` is the exact sum of the `File.size` values the File System Access
 * API reports for the files it can read; `savedAt` is a real file property,
 * `project.json`'s `lastModified`, converted with `toISOString()`. When `project.json` is
 * missing or unreadable, `savedAt` is `null` — **never** `Date.now()`, which would claim a
 * save that did not happen. The caller decides how to stay honest about a `null`.
 *
 * BEST-EFFORT WALK — an individual unreadable entry (a permission error, a file removed
 * mid-walk) is skipped and the walk continues: one bad file must not blank the chip. But if
 * the project **directory itself** cannot be resolved or iterated, this **throws**: the
 * caller must be able to tell «0 bytes — an empty project» from «could not measure».
 */
import { entriesOf, resolveOpenProjectDir } from '@/fs/projectStore';

export interface ProjectSize {
  /** Exact sum of every readable file's `size` under the project folder. */
  bytes: number;
  /** `project.json`'s `lastModified` as an ISO string, or `null` when it is missing/unreadable. */
  savedAt: string | null;
  /** Number of files whose `size` was actually summed (so `bytes` and this always agree). */
  fileCount: number;
}

interface Accumulator {
  bytes: number;
  fileCount: number;
}

/**
 * Recursively sum every readable file below `dir`.
 *
 * The `for await` iteration over `dir` is deliberately OUTSIDE the `try`: if THIS directory
 * cannot be iterated the failure propagates (the caller asked to measure a folder and we
 * could not). A nested directory, by contrast, is entered from inside the `try`, so a
 * subtree that fails to iterate is skipped without taking the whole measurement down.
 */
async function sumDirectory(dir: FileSystemDirectoryHandle, acc: Accumulator): Promise<void> {
  for await (const [, handle] of entriesOf(dir)) {
    try {
      if (handle.kind === 'directory') {
        await sumDirectory(handle as FileSystemDirectoryHandle, acc);
        continue;
      }
      const file = await (handle as FileSystemFileHandle).getFile();
      acc.bytes += file.size;
      acc.fileCount += 1;
    } catch {
      // Best-effort: one unreadable entry is skipped, never fatal.
    }
  }
}

/**
 * Measure the project folder registered for the D51 runtime key `${id}:${folderName}`.
 *
 * Rejects when the project directory cannot be resolved or read (no root, project not open,
 * folder gone, iteration refused) — never returns `0`.
 */
export async function measureProjectSize(projectId: string): Promise<ProjectSize> {
  const projectDir = await resolveOpenProjectDir(projectId); // throws when unresolvable

  const acc: Accumulator = { bytes: 0, fileCount: 0 };
  await sumDirectory(projectDir, acc); // root read/iteration failure propagates

  let savedAt: string | null = null;
  try {
    const fileHandle = await projectDir.getFileHandle('project.json', { create: false });
    const file = await fileHandle.getFile();
    savedAt = new Date(file.lastModified).toISOString();
  } catch {
    savedAt = null; // missing/unreadable — NOT Date.now()
  }

  return { bytes: acc.bytes, savedAt, fileCount: acc.fileCount };
}

const KIB = 1024;
const MIB = KIB * 1024;
const GIB = MIB * 1024;
const TIB = GIB * 1024;

/**
 * One decimal place, **floored** (never rounded up).
 *
 * 185549376 / 1048576 = 176.953674… → ×10 = 1769.53674 → floor = 1769 → 176.9 → `'176.9 MB'`.
 * Rounding would print `'177 MB'`, overstating the project's disk use — the one direction
 * this project must never round.
 */
function formatUnit(bytes: number, divisor: number, suffix: string): string {
  const value = Math.floor((bytes / divisor) * 10) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${suffix}`;
}

/** `184549376` → `'176 MB'` — the chip's `{size}` (UI §11.4). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < KIB) return `${Math.floor(bytes)} B`; // 999 → '999 B'
  if (bytes < MIB) return formatUnit(bytes, KIB, 'KB'); // 1024 / 1024 = 1 → '1 KB'
  if (bytes < GIB) return formatUnit(bytes, MIB, 'MB'); // 1572864 / 1048576 = 1.5 → '1.5 MB'
  if (bytes < TIB) return formatUnit(bytes, GIB, 'GB'); // 2 × 1024³ = 2147483648 → '2 GB'
  return formatUnit(bytes, TIB, 'TB');
}
