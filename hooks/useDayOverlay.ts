// hooks/useDayOverlay.ts
//
// Alimente la source « matchs du jour » (`/overlay/day`) depuis
// `GET /api/overlay/day`. La boucle et son contrat de robustesse vivent dans
// `useOverlayPoll` ; 15 s, comme le cache CDN de la route — un programme bouge
// moins qu'un tableau de score.

import type { OverlayDayResponse } from '@/pages/api/overlay/day';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';

type Options = {
  tournament: string | null;
  date?: string | null;
  tenant?: string | null;
  enabled?: boolean;
};

export function useDayOverlay({
  tournament,
  date,
  tenant,
  enabled = true,
}: Options): { data: OverlayDayResponse | null; fatal: string | null } {
  let url: string | null = null;
  if (tournament) {
    const params = new URLSearchParams({ tournament });
    if (date) params.set('date', date);
    if (tenant) params.set('tenant', tenant);
    url = `/api/overlay/day?${params.toString()}`;
  }
  return useOverlayPoll<OverlayDayResponse>(url, { enabled });
}
