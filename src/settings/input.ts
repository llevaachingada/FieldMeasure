/**
 * Touch-first input toggles (implementation plan slice 0.3 step 1; build spec
 * §11.1 / §20.5(b); touch-first model §7.7).
 *
 * Five toggles, not one:
 *   - touchPlaces    «Touch places and moves»        default ON   (the F1/F2 capability)
 *   - fingerDraws    «Finger draws (freehand)»       default OFF  (finger ink only; pen always draws)
 *   - penOnly        «Pen only»                      default OFF  (input filter)
 *   - magnifierOnTap «Magnifier when you tap»        default ON
 *   - glovedTouch    «Gloved touch»                  default OFF
 *
 * `penOnly` is no longer the only input filter (§20.5(b)); finger freehand is
 * opt-in, touch placement is the default.
 */
import { get, set } from 'idb-keyval';

export const INPUT_KEYS = {
  touchPlaces: 'fm:settings:input:touchPlaces',
  fingerDraws: 'fm:settings:input:fingerDraws',
  penOnly: 'fm:settings:input:penOnly',
  magnifierOnTap: 'fm:settings:input:magnifierOnTap',
  glovedTouch: 'fm:settings:input:glovedTouch',
} as const;

export type InputToggleKey = keyof typeof INPUT_KEYS;

export type InputToggles = Record<InputToggleKey, boolean>;

export const INPUT_DEFAULTS = {
  touchPlaces: true,
  fingerDraws: false,
  penOnly: false,
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

/** Read all five at once (Settings hydration). */
export async function getInputToggles(): Promise<InputToggles> {
  const keys = Object.keys(INPUT_KEYS) as InputToggleKey[];
  const values = await Promise.all(keys.map((key) => getInputToggle(key)));
  return keys.reduce((acc, key, i) => {
    acc[key] = values[i];
    return acc;
  }, {} as InputToggles);
}
