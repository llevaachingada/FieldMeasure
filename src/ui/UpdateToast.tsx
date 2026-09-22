/**
 * `src/ui/UpdateToast.tsx` — slice 1.11: the service-worker update prompt
 * (build spec §19.2, UI §13).
 *
 * **There is no `autoUpdate`.** An automatic reload mid-measurement is both a data risk
 * and a trust risk, so the app registers with `registerType: 'prompt'` and this is the
 * prompt. It is **not** the §13.4 single-instance toast: that surface is auto-dismissing
 * (8 s / 10 s) with at most one action, while this one must persist until the user
 * chooses Reload or Later and carries two actions. It shares the toast's visual language
 * (bottom-centre, `hit-slop` buttons) but not its timer — hence its own component.
 *
 * **It never interrupts a measurement.** The prompt is suppressed entirely while:
 *   - a write is queued or in flight (`persistQueue.inFlight`, mirrored on the session's
 *     busy signal — a reload here would race the write it is waiting for);
 *   - a placement op is pending (`editorStore.pendingOp !== 'none'`);
 *   - the keypad sheet is open (`editorStore.keypadOpen`).
 * All three are reactive: when they clear, the prompt re-evaluates and appears.
 *
 * **Reload is flush-first and honest about failure.** Tapping Reload calls `onReload`,
 * which the shell wires to `reloadAfterFlush(...)`. If the flush fails (disk full, a
 * locked file) the promise rejects: the prompt stays and says so — it never pretends to
 * have reloaded. When the reload does happen the page unloads, so the prompt goes with it.
 *
 * **a11y (§19.6):** polite live region, keyboard reachable, focus is never moved, both
 * actions are real buttons at ≥48 px with 16 px hit slop (`.hit-slop`).
 */
import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { persistenceBusy, subscribePersistenceBusy } from '@/editor/session';
import { useEditorStore } from '@/state/editorStore';
import { STRINGS } from './strings';

export interface UpdateToastProps {
  /** True while a new service worker is waiting to take control. */
  needRefresh: boolean;
  /** Flush-first reload; rejects when the autosave queue could not be flushed. */
  onReload: () => Promise<void>;
}

export function UpdateToast({ needRefresh, onReload }: UpdateToastProps): JSX.Element | null {
  const pendingOp = useEditorStore((s) => s.pendingOp);
  const keypadOpen = useEditorStore((s) => s.keypadOpen);
  const saving = useSyncExternalStore(subscribePersistenceBusy, persistenceBusy, () => false);

  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [failed, setFailed] = useState(false);

  // A fresh offer re-arms the prompt after an earlier `Later` (and after the previous
  // update was taken). `Later` itself does not clear `needRefresh`.
  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh || dismissed || saving || pendingOp !== 'none' || keypadOpen) return null;

  async function reload(): Promise<void> {
    if (reloading) return;
    setFailed(false);
    setReloading(true);
    try {
      await onReload();
    } catch {
      // The queue could not be flushed — keep the prompt and say so rather than
      // reloading over the edit. `Couldn't save` is the storage section's approved
      // wording for exactly this outcome; no new copy is invented.
      setFailed(true);
    } finally {
      setReloading(false);
    }
  }

  return (
    <div
      className="update-toast"
      role="status"
      aria-live="polite"
      data-testid="update-toast"
    >
      <span className="update-toast-text">{STRINGS.toasts.updateReady}</span>
      {failed ? (
        <span className="update-toast-failed" role="alert">
          {STRINGS.storage.couldntSave}
        </span>
      ) : null}
      <button
        type="button"
        className="update-toast-action hit-slop"
        data-testid="update-reload"
        disabled={reloading}
        onClick={() => void reload()}
      >
        {STRINGS.toasts.updateReload}
      </button>
      <button
        type="button"
        className="update-toast-later hit-slop"
        data-testid="update-later"
        onClick={() => setDismissed(true)}
      >
        {STRINGS.toasts.updateLater}
      </button>
    </div>
  );
}

export default UpdateToast;
