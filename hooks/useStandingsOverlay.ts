// hooks/useStandingsOverlay.ts
//
// Alimente la source « classement » (`/overlay/standings`) depuis
// `GET /api/overlay/standings`. La boucle et son contrat de robustesse vivent
// dans `useOverlayPoll` ; 30 s, comme le cache CDN de la route — un classement
// ne bouge qu'à la fin d'un match.

import type { OverlayStandingsResponse } from '@/utils/overlay/standingsOverlay';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';

export const STANDINGS_OVERLAY_POLL_MS = 30_000;

type Options = {
  tournament: string | null;
  tenant?: string | null;
  enabled?: boolean;
};

export function useStandingsOverlay({
  tournament,
  tenant,
  enabled = true,
}: Options): { data: OverlayStandingsResponse | null; fatal: string | null } {
  let url: string | null = null;
  if (tournament) {
    const params = new URLSearchParams({ tournament });
    if (tenant) params.set('tenant', tenant);
    url = `/api/overlay/standings?${params.toString()}`;
  }
  return useOverlayPoll<OverlayStandingsResponse>(url, {
    enabled,
    intervalMs: STANDINGS_OVERLAY_POLL_MS,
  });
}
