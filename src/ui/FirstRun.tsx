/**
 * First run (UI §4.4; implementation plan slice 0.3 step 3).
 *
 * Two steps only, no tutorial carousel, must complete in < 20 s:
 *   1. «Which hand do you write with?» — two big cards, Right pre-selected as a
 *      plain default (no Windows-pen-setting claim; UI §4.4:177). Auto-advance
 *      on tap/Enter, writing handedness to idb-keyval.
 *   2. «Where should your projects live?» — `showDirectoryPicker` seeded at
 *      Documents, suggested `Documents\FieldMeasure`, resolved path in mono.
 *      The handle is persisted (`fm:projects-root`) and we land on Home.
 *
 * Keyboard-completable: both steps are native buttons in logical tab order with
 * visible `:focus-visible` rings; the cards/options are radios in a labelled
 * radiogroup.
 */
import { useState } from 'react';
import { STRINGS } from './strings';
import { DEFAULT_HANDEDNESS, setHandedness, type Handedness } from '@/settings/handedness';
import {
  SUGGESTED_PROJECTS_PATH,
  PROJECTS_CHILD_FOLDER,
  pickProjectsFolder,
  supportsFolderPicker,
} from '@/settings/projectsRoot';
import { adoptProjectsRoot } from '@/fs/projectStore';
import './firstRunNotice.css';

export interface FirstRunProps {
  /** Called once step 2 has persisted a projects folder. */
  onDone: () => void;
}

export default function FirstRun({ onDone }: FirstRunProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [hand, setHand] = useState<Handedness>(DEFAULT_HANDEDNESS);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState(false);

  // Computed once per render; cheap, and File System Access support does not change mid-session.
  const supported = supportsFolderPicker();

  async function chooseHand(next: Handedness): Promise<void> {
    setHand(next);
    try {
      await setHandedness(next);
    } catch {
      // Settings are best-effort: never block first run on a storage failure.
    }
    setStep(2);
  }

  async function chooseFolder(useSuggested: boolean): Promise<void> {
    setBusy(true);
    setPickError(false);
    try {
      const handle = await pickProjectsFolder(
        useSuggested ? { ensureChild: PROJECTS_CHILD_FOLDER } : undefined,
      );
      if (handle) {
        setFolderName(handle.name);
        // Put the store on the new handle now (and ask for persistent storage) so Home reads
        // the folder with the grant the picker just gave, not a backend that cached "no root".
        try {
          await adoptProjectsRoot(handle);
        } catch {
          // The handle is already persisted; Home re-reads it lazily.
        }
        onDone();
      }
      // A cancel resolves with `null` and is not an error (F4c).
    } catch {
      // D139/F4c: a real picker failure is surfaced instead of swallowed.
      setPickError(true);
    } finally {
      setBusy(false);
    }
  }

  const displayPath = `\u2026\\${folderName ?? SUGGESTED_PROJECTS_PATH}`;

  if (!supported) {
    return (
      <main className="first-run">
        <section
          className="first-run-step first-run-unsupported"
          role="alert"
          aria-labelledby="first-run-title"
        >
          <h1 id="first-run-title" className="screen-title">
            {STRINGS.firstRun.unsupportedTitle}
          </h1>
          <p className="first-run-notice-body">{STRINGS.firstRun.unsupportedBody}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="first-run">
      {step === 1 ? (
        <section className="first-run-step" aria-labelledby="first-run-title">
          <h1 id="first-run-title" className="screen-title">
            {STRINGS.firstRun.handednessQuestion}
          </h1>
          <div
            className="choice-cards"
            role="radiogroup"
            aria-label={STRINGS.firstRun.handednessQuestion}
          >
            {/* Order is Left-then-Right, deliberately (owner decision, session 13). The card for a
                hand sits on that hand's side of the screen, so the answer mirrors the layout it
                produces (a right-handed user's tool rail docks right). DOM order IS the focus
                order, so this is done by ordering the elements — never by CSS `row-reverse`,
                which would make the focus ring travel against the reading order. */}
            <button
              type="button"
              role="radio"
              aria-checked={hand === 'left'}
              aria-label={STRINGS.firstRun.handednessLeft}
              className={`choice-card hit-slop${hand === 'left' ? ' is-selected' : ''}`}
              onClick={() => void chooseHand('left')}
            >
              {STRINGS.firstRun.handednessLeft}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={hand === 'right'}
              aria-label={STRINGS.firstRun.handednessRight}
              className={`choice-card hit-slop${hand === 'right' ? ' is-selected' : ''}`}
              onClick={() => void chooseHand('right')}
            >
              {STRINGS.firstRun.handednessRight}
            </button>
          </div>
        </section>
      ) : (
        <section className="first-run-step" aria-labelledby="first-run-title">
          <h1 id="first-run-title" className="screen-title">
            {STRINGS.firstRun.projectsFolderQuestion}
          </h1>
          <p className="path-readout mono">{displayPath}</p>
          {pickError ? (
            <p className="first-run-error" role="alert">
              {STRINGS.firstRun.pickFailed}
            </p>
          ) : null}
          <div className="first-run-actions">
            <button
              type="button"
              className="btn btn-primary hit-slop"
              aria-label={STRINGS.firstRun.useDocumentsFolder}
              onClick={() => void chooseFolder(true)}
              disabled={busy}
            >
              {STRINGS.firstRun.useDocumentsFolder}
            </button>
            <button
              type="button"
              className="btn btn-secondary hit-slop"
              aria-label={STRINGS.firstRun.chooseFolder}
              onClick={() => void chooseFolder(false)}
              disabled={busy}
            >
              {STRINGS.firstRun.chooseFolder}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
