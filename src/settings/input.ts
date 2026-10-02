/**
 * Touch-first input toggles (implementation plan slice 0.3 step 1; build spec
 * §11.1 / §20.5(b); touch-first model §7.7).
 *
 * Four toggles:
 *   - touchPlaces    «Touch places and moves»        default ON   (the F1/F2 capability)
 *   - fingerDraws    «Finger draws (freehand)»       default OFF  (finger ink only; pen always draws)
 *   - magnifierOnTap «Magnifier when you tap»        default ON
 *   - glovedTouch    «Gloved touch»                  default OFF
 *
 * D167: the «Pen only» toggle (`penOnly`) was removed — the crews use only the touchscreen.
 * Finger freehand is opt-in, touch placement is the default. A `fm:settings:input:penOnly`
 * key left in IndexedDB by an earlier build is simply never read (no migration needed).
 */
import { get, set } from 'idb-keyval';

export const INPUT_KEYS = {
  touchPlaces: 'fm:settings:input:touchPlaces',
  fingerDraws: 'fm:settings:input:fingerDraws',
  magnifierOnTap: 'fm:settings:input:magnifierOnTap',
  glovedTouch: 'fm:settings:input:glovedTouch',
} as const;

export type InputToggleKey = keyof typeof INPUT_KEYS;

export type InputToggles = Record<InputToggleKey, boolean>;

export const INPUT_DEFAULTS = {
  touchPlaces: true,
  fingerDraws: true, // D167: touch-only shop, so the Freehand tool draws with a finger out of the box
  magnifierOnTap: true,
  glovedTouch: false,
} as const satisfies InputToggles;

/** Read one toggle, falling back to its documented default when unset. */
export async function getInputToggle(key: InputToggleKey): Promise<boolean> {
  const stored = await get<boolean>(INPUT_KEYS[key]);
  return typeof stored === 'boolean' ? stored : INPUT_DEFAULTS[key];
}

export async function setInputToggle(key: InputToggleKey, value: boolean): Promise<void> {
  await set(INPUT_KEYS[key], value);
}

/** Read all four at once (Settings hydration). */
export async function getInputToggles(): Promise<InputToggles> {
  const keys = Object.keys(INPUT_KEYS) as InputToggleKey[];
  const values = await Promise.all(keys.map((key) => getInputToggle(key)));
  return keys.reduce((acc, key, i) => {
    acc[key] = values[i];
    return acc;
  }, {} as InputToggles);
}
