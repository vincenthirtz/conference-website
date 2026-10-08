// features/player/dashboard/client.ts — appels du tableau de bord joueuse
// (lot P12). L'URL et la portée vivent ici ; `playerRequest` pose `?as=`
// (inspection) et `?teamId=` (équipe active) depuis le `scope`.
//
// Portées reprises À L'IDENTIQUE de l'écran historique : chaque appel garde
// le suffixe qu'il avait (sujet + équipe, équipe seule, aucun). Les scrims
// (réponse à une demande, grilles de dispo) passent par `scrimsClient`, le
// cadeau d'accueil par `tcgClient`, l'état réseau par `networkClient`.

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type { PoolStatusView } from '@/utils/tournaments/pool';

const teamOnly = (s: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: s.teamId,
});

export const dashboardUrls = {
  dashboard: '/api/player/dashboard',
  cancelDemande: '/api/demandes/cancel',
  leaveTeam: '/api/teams/leave',
  /** Inscription regroupée d'un tournoi (encart « événement du moment »). */
  eventPool: (tournamentId: string) => `/api/tournament/${tournamentId}/pool`,
};

/** Ce que l'inscription en un clic envoie (même forme que la page). */
export type EventPoolRegisterBody = {
  displayName: string;
  battleTag: string;
  originTeamId: string | null;
};

export const dashboardClient = {
  /** L'agrégat (sujet + équipe active). */
  get: <T>(scope: PlayerScope) =>
    playerRequest<T>(dashboardUrls.dashboard, { scope }),
  cancelDemande: (demandeId: string) =>
    playerRequest(dashboardUrls.cancelDemande, {
      method: 'DELETE',
      json: { demandeId },
    }),
  leaveTeam: (scope: PlayerScope) =>
    playerRequest(dashboardUrls.leaveTeam, {
      method: 'POST',
      scope: teamOnly(scope),
    }),
  // Encart « événement du moment » : sans portée (la route lit la session),
  // et sans redirection sur 401, comme l'appel direct d'origine — l'encart
  // se tait ou affiche son erreur générique.
  eventPoolStatus: (tournamentId: string) =>
    playerRequest<PoolStatusView>(dashboardUrls.eventPool(tournamentId), {
      skipAuthRedirect: true,
    }),
  eventPoolRegister: (tournamentId: string, body: EventPoolRegisterBody) =>
    playerRequest<PoolStatusView>(dashboardUrls.eventPool(tournamentId), {
      method: 'POST',
      json: body,
      skipAuthRedirect: true,
    }),
};
