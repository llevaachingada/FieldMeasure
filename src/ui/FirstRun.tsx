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
import { SUGGESTED_PROJECTS_PATH, pickProjectsFolder } from '@/settings/projectsRoot';

export interface FirstRunProps {
  /** Called once step 2 has persisted a projects folder. */
  onDone: () => void;
}

export default function FirstRun({ onDone }: FirstRunProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [hand, setHand] = useState<Handedness>(DEFAULT_HANDEDNESS);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseHand(next: Handedness): Promise<void> {
    setHand(next);
    try {
      await setHandedness(next);
    } catch {
      // Settings are best-effort: never block first run on a storage failure.
    }
    setStep(2);
  }

  async function chooseFolder(): Promise<void> {
    setBusy(true);
    try {
      const handle = await pickProjectsFolder();
      if (handle) {
        setFolderName(handle.name);
        onDone();
      }
    } catch {
      // Picker failure/cancel leaves the user on step 2 to retry.
    } finally {
      setBusy(false);
    }
  }

  const displayPath = `\u2026\\${folderName ?? SUGGESTED_PROJECTS_PATH}`;

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
          <div className="first-run-actions">
            <button
              type="button"
              className="btn btn-primary hit-slop"
              aria-label={STRINGS.firstRun.useDocumentsFolder}
              onClick={() => void chooseFolder()}
              disabled={busy}
            >
              {STRINGS.firstRun.useDocumentsFolder}
            </button>
            <button
              type="button"
              className="btn btn-secondary hit-slop"
              aria-label={STRINGS.firstRun.chooseFolder}
              onClick={() => void chooseFolder()}
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
