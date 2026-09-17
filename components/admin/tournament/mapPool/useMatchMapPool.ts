// components/admin/tournament/mapPool/useMatchMapPool.ts
//
// Pool EFFECTIF d'un match (date de jeu > journée > pool du tournoi), lu sur
// `/api/admin/matches/[matchId]/map-pool` — le même résolveur que l'écran
// d'arbitrage et la normalisation des scores.
//
// POURQUOI : le panneau de veto lisait le pool PAR DÉFAUT du tournoi. Un veto
// du 30/09 doit se jouer sur le pool annoncé pour le 30/09.
//
// Rend `null` tant que rien n'est chargé, sans match, ou en cas d'échec : le
// panneau garde alors le pool du tournoi et reste utilisable.

import { useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';

export type MatchPoolRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
};

type PoolResponse = {
  maps?: { name: string; type: string | null; image: string | null }[];
};

export function useMatchMapPool(
  matchId: string | null | undefined,
  tournamentId: string | null | undefined
): MatchPoolRow[] | null {
  const { adminFetch } = useAdminFetch();
  const [rows, setRows] = useState<MatchPoolRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    if (!matchId) return;
    let cancelled = false;
    adminFetch(`/api/admin/matches/${matchId}/map-pool`)
      .then((res) => (res.ok ? (res.json() as Promise<PoolResponse>) : null))
      .then((json) => {
        if (cancelled || !json?.maps?.length) return;
        setRows(
          json.maps.map((m, i) => ({
            id: `${matchId}:${m.name}`,
            tournament_id: tournamentId ?? '',
            map_name: m.name,
            map_slug: null,
            map_type: m.type,
            image_url: m.image,
            enabled: true,
            order_index: i,
          }))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [matchId, tournamentId, adminFetch]);

  return rows;
}
