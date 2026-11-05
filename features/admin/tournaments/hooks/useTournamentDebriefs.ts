// features/admin/tournaments/hooks/useTournamentDebriefs.ts — debriefs de fin
// de tournoi (sous-onglet « Debriefs » de Résultats,
// pages/admin/tournament/[id]/stats?tab=debriefs).
//
// Lecture : les équipes engagées et leur debrief, relues à l'ouverture du
// panneau et sur « Rafraîchir ». Les réponses arrivent du bot Discord à leur
// rythme : pas de temps réel, pas de relecture au retour d'onglet.
//
// Écriture : « Demander le debrief » — le bot poste un message dans le salon
// privé de chaque équipe engagée. La clé d'idempotence est GARDÉE jusqu'au
// succès : un nouvel essai après une erreur (la demande est peut-être partie
// quand même) rejoue la réponse du serveur au lieu de doubler le message dans
// chaque salon. Après un succès, une relance est une nouvelle intention, avec
// une nouvelle clé.

import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { tournamentsClient } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export const tournamentDebriefsKey = (id: string) =>
  tournamentKeys.part(id, 'debriefs');

export function useTournamentDebriefs(id: string) {
  return useQuery({
    queryKey: tournamentDebriefsKey(id),
    queryFn: () => tournamentsClient.debriefs(id),
    enabled: !!id,
    ...MOUNT_ONLY,
    // Un panneau rouvert relit la liste : une réponse a pu arriver entre-temps.
    staleTime: 0,
  });
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRequestTournamentDebrief(id: string) {
  const keyRef = useRef<string | null>(null);
  return useMutation({
    mutationFn: () => {
      keyRef.current ??= newIdempotencyKey();
      return tournamentsClient.requestDebrief(id, keyRef.current);
    },
    onSuccess: () => {
      keyRef.current = null;
    },
  });
}
