// features/player/matches/client.ts — appels typés des matchs de la joueuse
// (lot P12). La portée sujet (`?as=`, `&act=1`) est posée par `playerRequest`
// à partir du `scope` : les routes de lecture sont `subject: 'follow'`.
//
// Le check-in N'EST PAS ici : il passe par la route PUBLIQUE à jeton
// (`/api/checkin/{token}`, features/player/checkin/client.ts), la même que le
// lien envoyé par le bot — une personne sans compte doit pouvoir s'en servir.

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type { PlayerMatchDetail, PlayerMatchesPayload } from './schemas';

export const matchesUrls = {
  list: '/api/player/matches',
  detail: (matchId: string) =>
    `/api/player/matches/${encodeURIComponent(matchId)}`,
  reportScore: (matchId: string) =>
    `/api/player/matches/${encodeURIComponent(matchId)}/report-score`,
};

export const matchesClient = {
  /** Sans redirection sur 401 : l'écran propose lui-même la reconnexion. */
  list: (scope: PlayerScope) =>
    playerRequest<PlayerMatchesPayload>(matchesUrls.list, {
      scope,
      skipAuthRedirect: true,
    }),
  /**
   * Le fil ignore l'équipe active (le côté se déduit des appartenances) :
   * seule la portée SUJET est posée, comme avant.
   */
  detail: (scope: PlayerScope, matchId: string) =>
    playerRequest<PlayerMatchDetail>(matchesUrls.detail(matchId), {
      scope: { ...scope, teamId: null },
      skipAuthRedirect: true,
    }),
};
