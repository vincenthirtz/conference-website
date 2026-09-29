// features/admin/tournaments/hooks/useTournamentTeams.ts — équipes inscrites
// à un tournoi, et équipes du tenant proposées à l'inscription (lot L10).
//
// Clé partagée par le hub, l'écran d'équipes d'une phase, les lobbies FFA et
// le constructeur de bracket : une inscription invalide `tournamentTeamsKey`
// et tous se mettent à jour.

import { useQuery } from '@tanstack/react-query';
import type {
  Team,
  TournamentTeam,
} from '@/components/admin/tournament/overview/types';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from '../../_shared/query';
import { tournamentsUrls, tournamentUrls } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export const tournamentTeamsKey = (id: string) =>
  tournamentKeys.part(id, 'teams');

export const fetchTournamentTeams = <T = TournamentTeam>(id: string) =>
  adminRequest<{ teams?: T[] }>(tournamentUrls.teams(id));

/** `T` : forme sous laquelle l'écran lit une inscription. */
export function useTournamentTeams<T = TournamentTeam>(
  id: string,
  enabled = true
) {
  return useQuery({
    queryKey: tournamentTeamsKey(id),
    queryFn: async () => (await fetchTournamentTeams<T>(id)).teams || [],
    enabled: !!id && enabled,
    ...MOUNT_ONLY,
  });
}

/**
 * Équipes du tenant (200 max), pour les modales « ajouter une équipe ».
 * `enabled` : chargées à l'ouverture d'une modale, pas avant.
 */
export function useTenantTeamsForEntry(enabled: boolean) {
  return useQuery({
    queryKey: adminKey('teams', 'options', 'all'),
    queryFn: async () =>
      (await adminRequest<{ teams?: Team[] }>(tournamentsUrls.teamOptions(200)))
        .teams || [],
    enabled,
    ...MOUNT_ONLY,
  });
}
