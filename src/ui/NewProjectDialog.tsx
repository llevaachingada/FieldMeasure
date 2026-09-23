/**
 * `src/ui/NewProjectDialog.tsx` — the «New project» name pop-up (owner request, 2026-09-23).
 *
 * Home's «New project» used to mint «New project», «New project 2», … with no question (D87).
 * The owner wants to be asked for the project's name first. This dialog owns ONLY the asking:
 * it returns the trimmed name and the shell (`App.handleNewProject`) creates the folder.
 *
 * A11y (AGENTS: per-slice): `role="dialog"` + `aria-modal` + `aria-labelledby`; focus lands in the
 * field on open and returns to the opener on close; Tab is trapped inside; `Esc` cancels; `Enter`
 * creates. The field is named by a visible `<label>`. 48 px minimum targets (touch-primary).
 * No inline styles (CSP `style-src 'self'`): everything is in `newProjectDialog.css`.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react';

import { STRINGS } from './strings';
import './newProjectDialog.css';

/** A project title longer than this is a paste accident, not a name (the folder name is cut to 48). */
export const MAX_PROJECT_NAME_LENGTH = 80;

export interface NewProjectDialogProps {
  /** Called with the TRIMMED name. Never called with an empty string. */
  onCreate: (name: string) => void;
  onCancel: () => void;
  /** True while the folder is being created: the buttons and the field lock. */
  busy?: boolean;
}

export default function NewProjectDialog({ onCreate, onCancel, busy = false }: NewProjectDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const inputId = useId();

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !busy;

  // Focus in on open, back to where it came from on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const submit = (event?: FormEvent): void => {
    event?.preventDefault();
    if (canCreate) onCreate(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    // Trap Tab inside the dialog (no keyboard trap OUT of it: Esc and Cancel both close it).
    const root = rootRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'),
    );
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
    <div className="new-project-scrim">
      <div
        ref={rootRef}
        className="new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <form onSubmit={submit} noValidate>
          <h2 id={titleId} className="new-project-title">
            {STRINGS.home.newProjectTitle}
          </h2>
          <label className="new-project-label" htmlFor={inputId}>
            {STRINGS.home.projectNameLabel}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            className="new-project-input"
            type="text"
            value={name}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            placeholder={STRINGS.home.projectNamePlaceholder}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div className="new-project-actions">
            <button type="button" className="btn btn-secondary hit-slop" onClick={onCancel} disabled={busy}>
              {STRINGS.editor.cancel}
            </button>
            <button type="submit" className="btn btn-primary hit-slop" disabled={!canCreate}>
              {STRINGS.home.createProjectConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
