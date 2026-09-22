/**
 * `src/ui/updateReload.ts` — slice 1.11: the **flush-first** update reload.
 *
 * The one rule this file exists to enforce (build spec §19.2, plan 1.11):
 *
 *     flush the autosave queue → wait for the status to settle → only then skipWaiting
 *     and reload.
 *
 * A reload over an unflushed queue loses the edit the crew just measured, and a lost
 * measurement destroys the trust in autosave that *is* the product. So the order is not
 * a preference: `activate` is never reached when `flush` rejects, and `waitSettled`
 * turning up a failure aborts the reload too.
 *
 * Kept dependency-free (plain callbacks) so the order is provable in the node test
 * project without a browser, a service worker or the file system.
 */

export interface ReloadDeps {
  /**
   * Flush the autosave queue to disk. **Rejects** when a write could not land — the
   * caller classifies the queue's parked failure state, because `persistQueue.flush()`
   * itself resolves after a failed attempt.
   */
  flush: () => Promise<void>;
  /** Resolve once the autosave status is settled (no write queued or in flight). */
  waitSettled: () => Promise<void>;
  /** Activate the waiting service worker (`skipWaiting`) and reload the page. */
  activate: () => Promise<void>;
}

/**
 * `Reload` → `flush()` → `waitSettled()` → `activate()`. Any rejection short-circuits:
 * no `waitSettled`, no `activate`, no reload.
 */
export async function reloadAfterFlush(deps: ReloadDeps): Promise<void> {
  await deps.flush();
  await deps.waitSettled();
  await deps.activate();
}
