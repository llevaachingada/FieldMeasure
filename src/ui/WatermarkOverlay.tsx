/**
 * `src/ui/WatermarkOverlay.tsx` — the in-app VANGARDE mark (UI/GUI handoff pass,
 * 2026-09-22, owner request). Mounted once at the `App` shell root, exactly like
 * `ToastHost`/`PWAUpdate`, so it is consistent across Home, the Project screen,
 * Settings and the editor rather than re-implemented per screen.
 *
 * Purely decorative: `aria-hidden`, `pointer-events: none`, and a low z-index so it
 * never sits above real chrome (every panel/rail/dock already paints its own
 * `--g800`/`--g900` background over it — the mark only shows through in open canvas
 * mat / empty screen background, exactly where a print watermark would sit). It must
 * never intercept a touch or pen event (AGENTS: touch-first, no dead zones).
 *
 * `Settings › Display › Watermark` is the on/off switch (`useAppStore.watermarkEnabled`,
 * hydrated app-wide by `useWatermarkRuntime`). No state, no fetch — this component
 * only renders or doesn't.
 */
import type { JSX } from 'react';
import { useAppStore } from '@/state/appStore';
import { VANGARDE_MARK_SRC } from './TopBarLogo';

export default function WatermarkOverlay(): JSX.Element | null {
  const enabled = useAppStore((s) => s.watermarkEnabled);
  if (!enabled) return null;

  return (
    <div className="watermark-overlay" aria-hidden="true">
      <img className="watermark-overlay-mark" src={VANGARDE_MARK_SRC} alt="" />
    </div>
  );
}
