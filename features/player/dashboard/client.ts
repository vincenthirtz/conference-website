// features/player/dashboard/client.ts — appels du tableau de bord joueuse
// (lot P12). L'URL et la portée vivent ici ; `playerRequest` pose `?as=`
// (inspection) et `?teamId=` (équipe active) depuis le `scope`.
//
// Portées reprises À L'IDENTIQUE de l'écran historique : chaque appel garde
// le suffixe qu'il avait (sujet + équipe, équipe seule, aucun). Les scrims
// (réponse à une demande, grilles de dispo) passent par `scrimsClient`, le
// cadeau d'accueil par `tcgClient`, l'état réseau par `networkClient`.

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';

const teamOnly = (s: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: s.teamId,
});

export const dashboardUrls = {
  dashboard: '/api/player/dashboard',
  cancelDemande: '/api/demandes/cancel',
  leaveTeam: '/api/teams/leave',
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
};
