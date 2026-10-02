/**
 * Default export location (owner request, session 28).
 *   - `'dated'`   → `<project>/exports/<YYYY-MM-DD_HHMM>/` (the original behaviour, the default)
 *   - `'project'` → straight into `<project>/`
 * Same shape as `watermark.ts`; read by the export session when it resolves its default folder.
 */
import { get, set } from 'idb-keyval';

export type ExportLocation = 'dated' | 'project';

export const DEFAULT_EXPORT_LOCATION: ExportLocation = 'dated';

export const EXPORT_LOCATION_KEY = 'fm:settings:exportLocation';

export async function getExportLocation(): Promise<ExportLocation> {
  const stored = await get<ExportLocation>(EXPORT_LOCATION_KEY);
  return stored === 'dated' || stored === 'project' ? stored : DEFAULT_EXPORT_LOCATION;
}

export async function setExportLocation(value: ExportLocation): Promise<void> {
  await set(EXPORT_LOCATION_KEY, value);
}
