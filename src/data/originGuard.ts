/**
 * Origin guard (build spec §21.1 part 3) — slice 0.1 scaffold.
 *
 * The origin is the identity boundary: the persisted FileSystemDirectoryHandle, all
 * settings, OPFS and the service-worker cache are scoped to it. If the app moves
 * hosts, the user would silently see first-run again and assume their work is gone.
 * This guard makes that move loud and recoverable instead.
 *
 * Intended store (idb-keyval, runtime dep already pinned):
 *   key   : `fm:origin`            (idb-keyval `get`/`set`)
 *   value : { origin: string, base: string }   // e.g. location.origin + import.meta.env.BASE_URL
 *
 * Intended state machine:
 *   - no stored value        → store the current origin+base, return 'first-run'
 *   - stored value === current → return 'ok'
 *   - stored value !== current → return 'changed'  (NEVER fall through to first-run)
 *
 * On 'changed' the app must show a BLOCKING screen:
 *   «This app moved to a new address» + `Pick my projects folder`.
 * That screen is a later slice (0.3), so slice 0.1 ships the stub below.
 *
 * TODO(slice 0.3): implement the idb-keyval read/write and wire this into
 * `src/main.tsx` before the first render.
 */
export async function checkOrigin(): Promise<'ok' | 'first-run' | 'changed'> {
  // Stub: no persisted store yet, so the app is always in the 'ok' state.
  return 'ok';
}
