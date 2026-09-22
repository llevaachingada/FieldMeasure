/**
 * Minimal ambient shims for the Node-side config files.
 *
 * The runtime + dev dependency list is closed (§2.2) and does not include
 * `@types/node`, yet `vite.config.ts` / `playwright.config.ts` / `vitest.config.ts`
 * run in Node and reference `process.env` and `node:url`. These declarations cover
 * exactly what those files use — nothing more. Remove them if `@types/node` is ever
 * added to the pinned dev deps.
 */
/// <reference types="vite/client" />

declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

/**
 * Build identifier injected at build time by Vite `define` (`vite.config.ts`, §19.2):
 * `'<version>+<ISO timestamp>'`, e.g. `'0.1.0+2026-09-22T14:03:00.000Z'`. Rendered in
 * Settings so a field bug report can name the running build.
 */
declare const __BUILD_ID__: string;

/**
 * `vite-plugin-pwa`'s React registration entry (slice 1.11). Declared here rather than
 * pulling the plugin's client types into `tsconfig.types`: the runtime resolves the
 * virtual module through the plugin; this shim gives `tsc` just the surface we use.
 */
declare module 'virtual:pwa-register/react' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onRegisteredSW?(swUrl: string, registration?: ServiceWorkerRegistration): void;
    onRegisterError?(error: unknown): void;
    onNeedRefresh?(): void;
    onOfflineReady?(): void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, (value: boolean) => void];
    offlineReady: [boolean, (value: boolean) => void];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
