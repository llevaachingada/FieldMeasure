/**
 * `src/ui/TopBarLogo.tsx`: the small VANGARDE mark centred in every top bar (owner request,
 * session 29, D157). Decorative only: `aria-hidden`, `pointer-events: none`, and hidden on a
 * narrow bar where it would crowd the breadcrumb (`styles.css`).
 */
import type { JSX } from 'react';

export const VANGARDE_MARK_SRC = `${import.meta.env.BASE_URL}branding/vangarde-mark-light.png`;

export default function TopBarLogo(): JSX.Element {
  return <img className="topbar-logo" src={VANGARDE_MARK_SRC} alt="" aria-hidden="true" />;
}
