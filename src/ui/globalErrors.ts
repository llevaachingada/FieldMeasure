/**
 * `src/ui/globalErrors.ts` — D138 (L2): a global `unhandledrejection` handler so a
 * rejected promise outside React's render path (an async catch that never ran) still
 * surfaces to the user instead of failing silently (fixes part of F3). Local only —
 * `console.error` plus one deduped toast, never telemetry.
 */
import { emitToast } from '@/editor/session';
import { STRINGS } from './strings';

/** One toast per burst: a failing loop must not stack toasts (5 s). */
export const GLOBAL_ERROR_DEDUPE_MS = 5000;

export function installGlobalErrorHandlers(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  now: () => number = Date.now,
): () => void {
  let lastAt = -Infinity;
  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason as { name?: unknown } | undefined;
    // A cancelled picker or an aborted fetch is the user's choice, not a failure.
    if (reason && reason.name === 'AbortError') return;
    console.error('[FieldMeasure] unhandled rejection', event.reason);
    const t = now();
    if (t - lastAt < GLOBAL_ERROR_DEDUPE_MS) return;
    lastAt = t;
    emitToast({ text: STRINGS.errorBoundary.unexpected, urgent: true });
  };
  target.addEventListener('unhandledrejection', onRejection as EventListener);
  return () => target.removeEventListener('unhandledrejection', onRejection as EventListener);
}
