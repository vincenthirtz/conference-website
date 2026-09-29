// features/admin/tournaments/hooks/useTournamentRead.ts — lecture d'une
// sous-ressource d'un tournoi (stats, analytics, podium, check-in…) pour les
// panneaux du hub, lot L10.
//
// Relue au montage du panneau et sur « Rafraîchir », jamais sur un simple
// retour d'onglet — le comportement d'avant la migration. Deux panneaux qui
// lisent la même ressource partagent la requête.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export const tournamentReadKey = (id: string, part: string) =>
  tournamentKeys.part(id, part);

/** `R` : forme de la réponse ; `url` : chemin de `tournamentUrls`. */
export function useTournamentRead<R>(
  id: string,
  part: string,
  url: (id: string) => string,
  options: {
    enabled?: boolean;
    staleTime?: number;
    /**
     * Chaque lecture rend un NOUVEL objet, même identique : l'écran qui
     * réhydrate une saisie « à chaque lecture » (effet sur la donnée) le fait
     * aussi quand le serveur n'a pas changé — comme avant la migration.
     */
    rehydrate?: boolean;
  } = {}
) {
  return useQuery({
    queryKey: tournamentReadKey(id, part),
    queryFn: () => adminRequest<R>(url(id)),
    enabled: !!id && options.enabled !== false,
    ...MOUNT_ONLY,
    // Un panneau remonté relit la ressource, comme avant (défaut : 0).
    staleTime: options.staleTime ?? 0,
    ...(options.rehydrate ? { structuralSharing: false } : {}),
  });
}
