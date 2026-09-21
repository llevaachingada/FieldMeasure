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
