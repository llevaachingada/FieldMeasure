/**
 * Settings (build spec P §20.5(b); implementation plan slice 0.3 step 5).
 *
 * A single scrolling column, max-width 720px, of labelled groups in this order:
 * Input (handedness · the five touch toggles · palm-rejection window) · Units
 * (unit system · unit format · per-project-precision note) · Display (theme ·
 * density) · Storage (projects folder · persistent storage · Trash…) · About
 * (build version + date · third-party notices).
 *
 * Rows are 56px, label left / control right, 1.5px dividers, group headers 13px
 * uppercase `--g400`. No search, no tabs, no icons. Toggle state is announced
 * (`role="switch"` + `aria-checked`), never colour-only.
 */
import { useEffect, useState } from 'react';
import { STRINGS, fractionLabel, t } from './strings';
import { useAppStore } from '@/state/appStore';
import { getHandedness, setHandedness, type Handedness } from '@/settings/handedness';
import { getInputToggles, setInputToggle, type InputToggleKey } from '@/settings/input';
import {
  getUnitFormat,
  getUnitSystem,
  setUnitFormat,
  setUnitSystem,
  type UnitFormat,
  type UnitSystem,
} from '@/settings/units';
import { getTheme, setTheme, type Theme } from '@/settings/theme';
import { getDensity, setDensity, type Density } from '@/settings/density';
import { getWatermarkEnabled, setWatermarkEnabled } from '@/settings/watermark';
import { getProjectsRoot, pickProjectsFolder, SUGGESTED_PROJECTS_PATH } from '@/settings/projectsRoot';

export interface SettingsProps {
  onBack?: () => void;
}

// §19.2 build version + date, injected at build time by Vite `define` (`__BUILD_ID__`,
// vite.config.ts) as `<version>+<ISO timestamp>`. Outside Vite (a bare unit test) the
// identifier is absent, so the row degrades to `dev`/`unknown` rather than throwing.
const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev+';

/** `'0.1.0+2026-09-22T14:03:00.000Z'` → `{ version: '0.1.0', date: '2026-09-22 14:03Z' }`. */
export function buildParts(id: string = BUILD_ID): { version: string; date: string } {
  const [version, stamp] = id.split('+');
  return { version: version || 'dev', date: formatBuildDate(stamp) };
}

function formatBuildDate(stamp: string | undefined): string {
  if (!stamp) return 'unknown';
  const parsed = Date.parse(stamp);
  if (!Number.isFinite(parsed)) return stamp;
  // UTC, minute precision — the value changes on every build, so "it changed after
  // the update" is answerable from a screenshot of Settings.
  return `${new Date(parsed).toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

type StorageState = 'unknown' | 'protected' | 'not-protected';

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">{label}</span>
      <div className="settings-segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.label}
            disabled={option.disabled}
            className={`settings-segment hit-slop${value === option.value ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onToggle,
  description,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  description?: string;
}) {
  return (
    <div className="settings-row">
      <span className="settings-row-label">
        {label}
        {description ? <span className="settings-row-hint">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`settings-switch hit-slop${checked ? ' is-on' : ''}`}
        onClick={onToggle}
      >
        <span className="settings-switch-knob" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Settings({ onBack }: SettingsProps) {
  const state = useAppStore();
  const [hydrated, setHydrated] = useState(false);
  const [folder, setFolder] = useState<string>(SUGGESTED_PROJECTS_PATH);
  const [storage, setStorage] = useState<StorageState>('unknown');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [handedness, input, unitSystem, unitFormat, theme, density, watermarkEnabled] =
          await Promise.all([
            getHandedness(),
            getInputToggles(),
            getUnitSystem(),
            getUnitFormat(),
            getTheme(),
            getDensity(),
            getWatermarkEnabled(),
          ]);
        if (alive) {
          useAppStore.getState().applySettings({
            handedness,
            ...input,
            unitSystem,
            unitFormat,
            theme,
            density,
            watermarkEnabled,
          });
        }
      } catch {
        // Defaults already in the store; a storage failure must not blank the screen.
      }

      try {
        const root = await getProjectsRoot();
        if (alive && root) setFolder(root.name);
      } catch {
        /* keep the suggested path */
      }

      try {
        const persisted = await navigator.storage?.persisted?.();
        if (alive) setStorage(persisted ? 'protected' : 'not-protected');
      } catch {
        if (alive) setStorage('not-protected');
      }

      if (alive) setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function changeHandedness(next: Handedness): Promise<void> {
    state.setHandedness(next);
    try {
      await setHandedness(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeToggle(key: InputToggleKey): Promise<void> {
    const next = !state[key];
    state.setInputToggle(key, next);
    try {
      await setInputToggle(key, next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeUnitSystem(next: UnitSystem): Promise<void> {
    state.setUnitSystem(next);
    try {
      await setUnitSystem(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeUnitFormat(next: UnitFormat): Promise<void> {
    state.setUnitFormat(next);
    try {
      await setUnitFormat(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeTheme(next: Theme): Promise<void> {
    state.setTheme(next);
    try {
      await setTheme(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeDensity(next: Density): Promise<void> {
    state.setDensity(next);
    try {
      await setDensity(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeWatermark(): Promise<void> {
    const next = !state.watermarkEnabled;
    state.setWatermarkEnabled(next);
    try {
      await setWatermarkEnabled(next);
    } catch {
      /* best-effort persistence */
    }
  }

  async function changeFolder(): Promise<void> {
    try {
      const handle = await pickProjectsFolder();
      if (!handle) return; // cancelled, or the browser has no File System Access API
      // The picked handle is already persisted, but the RUNNING app is still on the old one: the
      // backend, the open-project registry and every mounted route hold the handle they resolved
      // with — and the write grant is per HANDLE, so a `denied` folder stays denied until the new
      // one is adopted. Reloading is the complete, honest adoption: without it «Change folder…»
      // looks like it worked while writes keep failing against the old permission.
      window.location.reload();
    } catch {
      /* picker failure leaves the current folder */
    }
  }

  async function requestStorage(): Promise<void> {
    try {
      await navigator.storage?.persist?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorage(persisted ? 'protected' : 'not-protected');
    } catch {
      setStorage('not-protected');
    }
  }

  const toggleKeys: readonly InputToggleKey[] = [
    'touchPlaces',
    'fingerDraws',
    'magnifierOnTap',
    'glovedTouch',
    'penOnly',
  ];

  return (
    <main className="settings" data-hydrated={hydrated ? 'true' : 'false'}>
      <div className="settings-column">
        {onBack ? (
          <button type="button" className="btn btn-secondary settings-back hit-slop" onClick={onBack}>
            {STRINGS.export.back}
          </button>
        ) : null}

        <section className="settings-group" aria-labelledby="settings-input">
          <h2 id="settings-input" className="settings-group-title">
            {STRINGS.settings.headingInput}
          </h2>
          <div className="settings-rows">
            <ChoiceRow<Handedness>
              label={STRINGS.settings.rowHandedness}
              value={state.handedness}
              onChange={(next) => void changeHandedness(next)}
              options={[
                { value: 'right', label: STRINGS.firstRun.handednessRight },
                { value: 'left', label: STRINGS.firstRun.handednessLeft },
              ]}
            />
            {toggleKeys.map((key) => (
              <SwitchRow
                key={key}
                label={STRINGS.settings[key]}
                checked={state[key]}
                onToggle={() => void changeToggle(key)}
                description={key === 'penOnly' ? STRINGS.settings.penOnlyHint : undefined}
              />
            ))}
            <div className="settings-row">
              <span className="settings-row-label">{STRINGS.settings.rowPalmWindow}</span>
              <span className="settings-row-value mono">1200 ms</span>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-units">
          <h2 id="settings-units" className="settings-group-title">
            {STRINGS.settings.headingUnits}
          </h2>
          <div className="settings-rows">
            <ChoiceRow<UnitSystem>
              label={STRINGS.settings.rowUnitSystem}
              value={state.unitSystem}
              onChange={(next) => void changeUnitSystem(next)}
              options={[
                { value: 'imperial', label: STRINGS.settings.unitSystemImperial },
                { value: 'metric', label: STRINGS.settings.unitSystemMetric, disabled: true },
              ]}
            />
            <ChoiceRow<UnitFormat>
              label={STRINGS.settings.rowUnitFormat}
              value={state.unitFormat}
              onChange={(next) => void changeUnitFormat(next)}
              options={[
                { value: 'ft-in', label: STRINGS.settings.unitFormatFtIn },
                { value: 'in', label: STRINGS.settings.unitFormatIn },
                { value: 'ft-decimal', label: STRINGS.settings.unitFormatDecimalFt },
              ]}
            />
            <div className="settings-row">
              <span className="settings-row-label">
                {t(STRINGS.dimension.projectPrecision, {
                  denominator: fractionLabel(state.precisionDenominator),
                })}
              </span>
              <button type="button" className="link-button" disabled aria-label={STRINGS.editor.menuProjectSettings}>
                {STRINGS.editor.menuProjectSettings}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-display">
          <h2 id="settings-display" className="settings-group-title">
            {STRINGS.settings.headingDisplay}
          </h2>
          <div className="settings-rows">
            <ChoiceRow<Theme>
              label={STRINGS.settings.rowTheme}
              value={state.theme}
              onChange={(next) => void changeTheme(next)}
              options={[
                { value: 'standard', label: STRINGS.settings.themeStandard },
                { value: 'sunlight', label: STRINGS.settings.themeSunlight },
                { value: 'dim', label: STRINGS.settings.themeDim },
              ]}
            />
            <ChoiceRow<Density>
              label={STRINGS.settings.rowDensity}
              value={state.density}
              onChange={(next) => void changeDensity(next)}
              options={[
                { value: 'field', label: STRINGS.settings.densityField },
                { value: 'desk', label: STRINGS.settings.densityDesk },
              ]}
            />
            <SwitchRow
              label={STRINGS.settings.rowWatermark}
              checked={state.watermarkEnabled}
              onToggle={() => void changeWatermark()}
              description={STRINGS.settings.watermarkHint}
            />
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-storage">
          <h2 id="settings-storage" className="settings-group-title">
            {STRINGS.settings.headingStorage}
          </h2>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-label mono settings-path">{folder}</span>
              <button
                type="button"
                className="btn btn-secondary hit-slop"
                onClick={() => void changeFolder()}
              >
                {STRINGS.settings.changeFolder}
              </button>
            </div>
            <div className="settings-row">
              {storage === 'protected' ? (
                <span className="settings-row-value">{STRINGS.settings.storageProtected}</span>
              ) : (
                <button type="button" className="link-button" onClick={() => void requestStorage()}>
                  {STRINGS.settings.storageNotProtected}
                </button>
              )}
            </div>
            {/* Review F6: this row had NO handler — an enabled, approved-copy button that did
                nothing, in a wave that shipped a real «Trash…» entry point on the grid. Disabled
                honestly until it is wired to something true (D102). */}
            <button
              type="button"
              className="settings-row settings-row-button hit-slop"
              aria-label={STRINGS.trash.open}
              disabled
              aria-disabled="true"
            >
              <span className="settings-row-label">{STRINGS.trash.open}</span>
            </button>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-about">
          <h2 id="settings-about" className="settings-group-title">
            {STRINGS.settings.headingAbout}
          </h2>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-value mono" data-testid="build-version">
                {t(STRINGS.settings.buildVersion, buildParts())}
              </span>
            </div>
            {/* Review F6: same as the «Trash…» row — an enabled button with no handler (it
                predates this wave). Disabled honestly rather than left looking live. */}
            <button
              type="button"
              className="settings-row settings-row-button hit-slop"
              aria-label={STRINGS.settings.thirdPartyNotices}
              disabled
              aria-disabled="true"
            >
              <span className="settings-row-label">{STRINGS.settings.thirdPartyNotices}</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
