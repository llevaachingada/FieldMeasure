/**
 * `tests/updateReload.test.ts` — slice 1.11 (node project).
 *
 * The load-bearing rule of the update prompt, proved by execution: **Reload never
 * reloads over an unflushed queue.** The order is flush → settle → activate, and any
 * rejection short-circuits before `activate` (which is the skipWaiting + reload step in
 * `PWAUpdate`). A failure here is a lost measurement.
 */
import { describe, expect, it, vi } from 'vitest';
import { reloadAfterFlush } from '../src/ui/updateReload';

describe('reloadAfterFlush — flush before skipWaiting', () => {
  it('calls flush, then waits for settling, then activates — in that order', async () => {
    const calls: string[] = [];
    await reloadAfterFlush({
      flush: async () => {
        calls.push('flush');
      },
      waitSettled: async () => {
        calls.push('settled');
      },
      activate: async () => {
        calls.push('activate');
      },
    });

    expect(calls).toEqual(['flush', 'settled', 'activate']);
  });

  it('does not wait or activate when the flush rejects (disk full, locked file)', async () => {
    const waitSettled = vi.fn(async () => {});
    const activate = vi.fn(async () => {});

    await expect(
      reloadAfterFlush({
        flush: async () => {
          throw new Error('autosave did not settle cleanly (full)');
        },
        waitSettled,
        activate,
      }),
    ).rejects.toThrow('full');

    expect(waitSettled).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate when settling reveals the write never landed', async () => {
    const activate = vi.fn(async () => {});

    await expect(
      reloadAfterFlush({
        flush: async () => {},
        waitSettled: async () => {
          throw new Error('autosave did not settle cleanly (error)');
        },
        activate,
      }),
    ).rejects.toThrow('error');

    expect(activate).not.toHaveBeenCalled();
  });
});
