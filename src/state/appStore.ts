/**
 * App state store (build spec §10; implementation plan slice 0.3 step 2).
 *
 * Zustand. Data + plain setters only — NO persistence queue and no idb writes in
 * here (the persistence queue is slice 1.2). Screens hydrate from the
 * `src/settings/*` helpers on mount and write back through those helpers.
 *
 * `ProjectSummary` is defined locally because the storage layer (slice 1.2) owns
 * the real scan; the Home shell renders placeholder data until then.
 */
import { create } from 'zustand';
import type { Handedness } from '@/settings/handedness';
import { DEFAULT_HANDEDNESS } from '@/settings/handedness';
import type { Theme } from '@/settings/theme';
import { DEFAULT_THEME } from '@/settings/theme';
import type { Density } from '@/settings/density';
import { DEFAULT_DENSITY } from '@/settings/density';
import type { UnitFormat, UnitSystem } from '@/settings/units';
import {
  DEFAULT_PRECISION_DENOMINATOR,
  DEFAULT_UNIT_FORMAT,
  DEFAULT_UNIT_SYSTEM,
} from '@/settings/units';
import type { InputToggleKey, InputToggles } from '@/settings/input';
import { INPUT_DEFAULTS } from '@/settings/input';
import { DEFAULT_WATERMARK_ENABLED } from '@/settings/watermark';

export interface ProjectSummary {
  id: string;
  title: string;
  sheetCount: number;
  thumbPath: string | null;
  path: string;
  status: 'ok' | 'missing' | 'unwritable';
}

/**
 * Canonical autosave-chip state (§10 + §5.8a + §11.4). Reconciled in the slice-1.2 review:
 * §10's `'ok'` became `'saved'` (the chip's own wording), and `'saving'` + `'full'` were added
 * because §5.8a and §11.4 require them and `src/state/persistQueue.ts` emits them. `'offline'`
 * is a UI-only one-time reassurance the queue never emits (the app sets it directly).
 */
export type StorageStatus = 'saved' | 'saving' | 'pending' | 'readonly' | 'offline' | 'full' | 'error';

export interface AppState extends InputToggles {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  currentSheetId: string | null;
  storageStatus: StorageStatus;
  theme: Theme;
  density: Density;
  handedness: Handedness;
  unitSystem: UnitSystem;
  unitFormat: UnitFormat;
  precisionDenominator: number;
  watermarkEnabled: boolean;
}

export interface AppActions {
  setProjects: (projects: ProjectSummary[]) => void;
  setCurrentProject: (id: string | null) => void;
  setCurrentSheet: (id: string | null) => void;
  setStorageStatus: (status: StorageStatus) => void;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  setHandedness: (handedness: Handedness) => void;
  setUnitSystem: (system: UnitSystem) => void;
  setUnitFormat: (format: UnitFormat) => void;
  setPrecisionDenominator: (denominator: number) => void;
  setWatermarkEnabled: (value: boolean) => void;
  setTouchPlaces: (value: boolean) => void;
  setFingerDraws: (value: boolean) => void;
  setPenOnly: (value: boolean) => void;
  setMagnifierOnTap: (value: boolean) => void;
  setGlovedTouch: (value: boolean) => void;
  setInputToggle: (key: InputToggleKey, value: boolean) => void;
  /** Bulk hydration from the `src/settings/*` helpers. */
  applySettings: (settings: Partial<AppState>) => void;
}

export type AppStore = AppState & AppActions;

/** Fresh defaults — exported so tests can reset the module-global store. */
export function createInitialAppState(): AppState {
  return {
    projects: [],
    currentProjectId: null,
    currentSheetId: null,
    storageStatus: 'saved',
    theme: DEFAULT_THEME,
    density: DEFAULT_DENSITY,
    handedness: DEFAULT_HANDEDNESS,
    unitSystem: DEFAULT_UNIT_SYSTEM,
    unitFormat: DEFAULT_UNIT_FORMAT,
    precisionDenominator: DEFAULT_PRECISION_DENOMINATOR,
    watermarkEnabled: DEFAULT_WATERMARK_ENABLED,
    ...INPUT_DEFAULTS,
  };
}

export const useAppStore = create<AppStore>((set) => ({
  ...createInitialAppState(),

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProjectId) => set({ currentProjectId }),
  setCurrentSheet: (currentSheetId) => set({ currentSheetId }),
  setStorageStatus: (storageStatus) => set({ storageStatus }),
  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setHandedness: (handedness) => set({ handedness }),
  setUnitSystem: (unitSystem) => set({ unitSystem }),
  setUnitFormat: (unitFormat) => set({ unitFormat }),
  setPrecisionDenominator: (precisionDenominator) => set({ precisionDenominator }),
  setWatermarkEnabled: (watermarkEnabled) => set({ watermarkEnabled }),
  setTouchPlaces: (touchPlaces) => set({ touchPlaces }),
  setFingerDraws: (fingerDraws) => set({ fingerDraws }),
  setPenOnly: (penOnly) => set({ penOnly }),
  setMagnifierOnTap: (magnifierOnTap) => set({ magnifierOnTap }),
  setGlovedTouch: (glovedTouch) => set({ glovedTouch }),
  setInputToggle: (key, value) => set({ [key]: value } as Pick<AppState, InputToggleKey>),
  applySettings: (settings) => set(settings),
}));
