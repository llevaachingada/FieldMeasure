/**
 * Vitest stand-in for `vite-plugin-pwa`'s virtual React entry
 * (`virtual:pwa-register/react`), aliased in `vitest.config.ts`.
 *
 * jsdom has no service worker, and the app's component tests render the real `App`
 * (which mounts `PWAUpdate`). This stub keeps that mount harmless: there is never a
 * waiting worker, so the update prompt renders nothing. The prompt itself is exercised
 * directly in `tests/updateToast.test.tsx`.
 */
import { useState } from 'react';

export interface RegisterSWOptions {
  immediate?: boolean;
  onRegisteredSW?(swUrl: string, registration?: ServiceWorkerRegistration): void;
  onRegisterError?(error: unknown): void;
  onNeedRefresh?(): void;
  onOfflineReady?(): void;
}

export function useRegisterSW(_options?: RegisterSWOptions): {
  needRefresh: [boolean, (value: boolean) => void];
  offlineReady: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const [needRefresh] = useState(false);
  const [offlineReady] = useState(false);
  return {
    needRefresh: [needRefresh, () => {}],
    offlineReady: [offlineReady, () => {}],
    updateServiceWorker: async () => {},
  };
}
