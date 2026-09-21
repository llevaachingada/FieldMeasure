/**
 * Stub decode worker (implementation plan slice 0.1 step — "prove the Vite worker
 * build now, not in 1.3"). It echoes the message it receives so a test can prove
 * the worker bundles and runs.
 *
 * Runtime wiring (slice 1.3 replaces the body, not the convention):
 *   new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' })
 *
 * Note: this file is compiled with the DOM lib, not WebWorker, so `self` is widened
 * to the Worker global just for the reply. `postMessage` on a dedicated worker takes
 * one argument; the DOM Window overload does not.
 */
self.onmessage = (event: MessageEvent) => {
  const worker = self as unknown as { postMessage: (message: unknown) => void };
  worker.postMessage(event.data);
};
