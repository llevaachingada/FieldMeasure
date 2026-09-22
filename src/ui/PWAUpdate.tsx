/**
 * `src/ui/PWAUpdate.tsx` — slice 1.11: the service-worker registration + update prompt
 * wiring (build spec §19.2).
 *
 * `useRegisterSW` is `vite-plugin-pwa`'s prompt-mode entry. Importing it also tells the
 * plugin this app registers the worker itself (`injectRegister: 'auto'` then injects no
 * script), so there is exactly one registration.
 *
 * The one non-default behaviour is `onReload`: Reload must **flush the autosave queue
 * first** and must **not reload if the flush fails**. `updateServiceWorker(true)` posts
 * `SKIP_WAITING` to the waiting worker and reloads on `controllerchange` — it is the
 * last step, never the first.
 */
import { useCallback, type JSX } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { editorSession } from '@/editor/session';
import { useAppStore, type StorageStatus } from '@/state/appStore';
import { UpdateToast } from './UpdateToast';
import { reloadAfterFlush } from './updateReload';

/** A settled status that still means "a write did not land" — reloading would lose it. */
function isFailure(status: StorageStatus): boolean {
  return status === 'full' || status === 'pending' || status === 'error';
}

/**
 * Resolve once the autosave status is no longer `saving`. Resolves immediately when the
 * app is already settled; rejects if it settles into a failure state (so a reload can
 * never proceed over an unwritten edit). Exported for the wiring test.
 */
export function waitForStorageSettled(): Promise<void> {
  const settle = (status: StorageStatus): void => {
    if (isFailure(status)) {
      throw new Error(`autosave did not settle cleanly (${status})`);
    }
  };

  const current = useAppStore.getState().storageStatus;
  if (current !== 'saving') {
    try {
      settle(current);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return new Promise<void>((resolve, reject) => {
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.storageStatus === 'saving') return;
      unsubscribe();
      try {
        settle(state.storageStatus);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

export default function PWAUpdate(): JSX.Element | null {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const onReload = useCallback(async (): Promise<void> => {
    await reloadAfterFlush({
      flush: async () => {
        const session = editorSession();
        if (session?.flush) await session.flush();
      },
      waitSettled: waitForStorageSettled,
      activate: () => updateServiceWorker(true),
    });
  }, [updateServiceWorker]);

  return <UpdateToast needRefresh={needRefresh} onReload={onReload} />;
}
