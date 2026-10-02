/**
 * `src/ui/HelpButton.tsx`: the persistent «Help» control (owner request, session 28, D152) and the
 * pop-up it opens: the user guide, workflow and troubleshooting, from `STRINGS.help`
 * (`docs/USER-GUIDE.md` mirrors it).
 *
 * A11y follows `NewProjectDialog`: `role="dialog"` + `aria-modal` + `aria-labelledby`, focus moves
 * to Close on open and back to the opener on close, Tab is trapped inside, and Esc closes. No
 * inline styles (CSP `style-src 'self'`): the look lives in `helpButton.css`.
 */
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { CircleHelp, X } from 'lucide-react';

import { STRINGS } from './strings';
import './helpButton.css';

export interface HelpButtonProps {
  /** Extra class for the trigger so each header can place it (e.g. `topbar-action`). */
  className?: string;
}

export default function HelpButton({ className }: HelpButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`help-button hit-slop${className ? ` ${className}` : ''}`}
        aria-label={STRINGS.help.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="help-button"
        onClick={() => setOpen(true)}
      >
        <CircleHelp aria-hidden="true" />
        <span className="help-button-label">{STRINGS.help.button}</span>
      </button>
      {open ? <HelpDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button, [tabindex="0"]'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="help-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <header className="help-header">
          <h2 id={titleId} className="help-title">
            {STRINGS.help.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="help-close hit-slop"
            aria-label={STRINGS.help.close}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        {/* The body scrolls; tabindex lets a keyboard user scroll it too. */}
        <div className="help-body" tabIndex={0}>
          {Object.values(STRINGS.help.sections).map((section) => (
            <section key={section.heading} className="help-section">
              <h3 className="help-section-title">{section.heading}</h3>
              <ol className="help-steps">
                {Object.values(section.steps).map((step: string) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
