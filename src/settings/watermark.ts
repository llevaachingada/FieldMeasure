/**
 * Watermark setting (UI/GUI handoff pass, 2026-09-22 — owner request, not a numbered
 * spec section). Default `true`: the app and its exports carry the VANGARDE mark
 * unless the owner turns it off.
 *
 * Same shape as `src/settings/density.ts` / `theme.ts` — idb-keyval get/set behind a
 * typed default, read by `watermarkRuntime.ts` on boot and by `runExport.ts` once per
 * export run.
 */
import { get, set } from 'idb-keyval';

export const DEFAULT_WATERMARK_ENABLED = true;

export const WATERMARK_KEY = 'fm:settings:watermark';

export async function getWatermarkEnabled(): Promise<boolean> {
  const stored = await get<boolean>(WATERMARK_KEY);
  return typeof stored === 'boolean' ? stored : DEFAULT_WATERMARK_ENABLED;
}

export async function setWatermarkEnabled(value: boolean): Promise<void> {
  await set(WATERMARK_KEY, value);
}
