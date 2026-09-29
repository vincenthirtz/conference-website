// features/admin/stats/client.ts — appels typés des onglets statistiques (L10).
//
// Les paramètres sont passés tels quels (chaîne de requête construite par
// l'écran) : la route les valide avec `TeamStatsQuery` / `MapStatsQuery`.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { MapStatsRow, StatsPage, TeamStatsRow } from './schemas';

const TEAMS = '/api/admin/stats/teams';
const MAPS = '/api/admin/stats/maps';

export const statsClient = {
  // Le type de ligne est paramétrable : l'écran en lit une vue plus étroite.
  teams: <R = TeamStatsRow>(query: string) =>
    adminRequest<StatsPage<R>>(`${TEAMS}?${query}`),
  maps: <R = MapStatsRow>(query: string) =>
    adminRequest<StatsPage<R>>(`${MAPS}?${query}`),
  /** Export CSV : navigation directe (téléchargement), pas de fetch. */
  teamsCsvUrl: (query: string) => `${TEAMS}?${query}`,
  mapsCsvUrl: (query: string) => `${MAPS}?${query}`,
};
