/**
 * `src/ui/Toast.tsx` — the single-instance toast surface (implementation plan slice 1.10,
 * build order step 3; UI §13.4).
 *
 * **One at a time, never stacked.** A new toast REPLACES the current one and the replaced
 * toast's undo window is closed (§13.4). The component holds exactly one message and one
 * timer, so stacking is structurally impossible.
 *
 * **Timing.** 8 s normally, 10 s when the toast carries an action (§13.4). The timer is
 * cleared on every replacement AND on unmount.
 *
 * **a11y.** The text is a live region — `role="alert"` for an error, `role="status"`
 * otherwise — and the action is a real, keyboard-reachable button (48 px, 16 px hit
 * slop). Focus is never moved by the toast, so it cannot fight the keypad sheet.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { subscribeToastMessage, type ToastMessage } from '@/editor/session';

/** UI §13.4: 8 s default, 10 s when the toast carries an undo/action. */
export const TOAST_MS = 8000;
export const TOAST_ACTION_MS = 10000;

export default function ToastHost(): JSX.Element | null {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const off = subscribeToastMessage((next) => {
      // Replace: close the previous toast's window before opening the next.
      clearTimer();
      setToast(next);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast(null);
      }, next.action ? TOAST_ACTION_MS : TOAST_MS);
    });
    return () => {
      clearTimer();
      off();
    };
  }, []);

  if (!toast) return null;

  const dismiss = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  };

  return (
    <div
      className="editor-toast"
      data-testid="toast"
      data-urgent={toast.urgent ? 'true' : 'false'}
    >
      <span role={toast.urgent ? 'alert' : 'status'} className="toast-text">
        {toast.text}
      </span>
      {toast.action ? (
        <button
          type="button"
          className="toast-action hit-slop"
          data-testid="toast-action"
          onClick={() => {
            const run = toast.action?.run;
            dismiss();
            run?.();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
