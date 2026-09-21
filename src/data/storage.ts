/**
 * `src/data/storage.ts` — §5.7 (verbatim).
 *
 * Ask the browser to make this origin's storage persistent so the user's projects are
 * not evicted under storage pressure. Must be called after a user action (e.g. the first
 * save); browsers deny the request without one.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist(); // call after a user action, e.g. first save
}
