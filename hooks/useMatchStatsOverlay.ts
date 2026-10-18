// hooks/useMatchStatsOverlay.ts
//
// Alimente la carte « avant-match » de la source `maps` depuis
// `GET /api/overlay/match/<uuid>/stats`. La boucle et son contrat de
// robustesse vivent dans `useOverlayPoll` ; 60 s, comme le cache CDN de la
// route — ces stats ne bougent qu'à la fin d'un match.
//
// `matchId` nul = rien à lire : la page ne le renseigne que pour la source
// `maps`, et seulement tant qu'aucune map n'est choisie. Pendant le match, la
// source liste les maps et cette boucle se tait.

import type { OverlayMatchStatsResponse } from '@/utils/overlay/matchStatsOverlay';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';

export const MATCH_STATS_OVERLAY_POLL_MS = 60_000;

export function useMatchStatsOverlay({
  matchId,
  enabled = true,
}: {
  matchId: string | null;
  enabled?: boolean;
}): { data: OverlayMatchStatsResponse | null } {
  const url = matchId
    ? `/api/overlay/match/${encodeURIComponent(matchId)}/stats`
    : null;
  const { data } = useOverlayPoll<OverlayMatchStatsResponse>(url, {
    enabled,
    intervalMs: MATCH_STATS_OVERLAY_POLL_MS,
  });
  return { data };
}
