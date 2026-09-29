// features/player/dashboard/client.ts — appels du tableau de bord joueuse
// (lot P12). L'URL et la portée vivent ici ; `playerRequest` pose `?as=`
// (inspection) et `?teamId=` (équipe active) depuis le `scope`.
//
// Portées reprises À L'IDENTIQUE de l'écran historique : chaque appel garde
// le suffixe qu'il avait (sujet + équipe, sujet seul, équipe seule, aucun).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';

const subjectOnly = (s: PlayerScope): PlayerScope => ({ ...s, teamId: null });
const teamOnly = (s: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: s.teamId,
});

export const dashboardUrls = {
  dashboard: '/api/player/dashboard',
  networkStatus: '/api/player/network-status',
  welcomeGift: '/api/player/tcg/welcome-gift',
  cancelDemande: '/api/demandes/cancel',
  scrimRequests: '/api/teams/scrim-requests',
  scrimPlannings: '/api/teams/scrim-plannings',
  leaveTeam: '/api/teams/leave',
};

export const dashboardClient = {
  /** L'agrégat (sujet + équipe active). */
  get: <T>(scope: PlayerScope) =>
    playerRequest<T>(dashboardUrls.dashboard, { scope }),
  /** Route `self` : jamais de `?as=` (les cartes qui la lisent sont masquées en inspection). */
  networkStatus: <T>() =>
    playerRequest<T>(dashboardUrls.networkStatus, { skipAuthRedirect: true }),
  welcomeGift: <T>(scope: PlayerScope) =>
    playerRequest<T>(dashboardUrls.welcomeGift, {
      scope: subjectOnly(scope),
      skipAuthRedirect: true,
    }),
  scrimPlannings: <T>(scope: PlayerScope) =>
    playerRequest<T>(dashboardUrls.scrimPlannings, {
      scope,
      skipAuthRedirect: true,
    }),
  cancelDemande: (demandeId: string) =>
    playerRequest(dashboardUrls.cancelDemande, {
      method: 'DELETE',
      json: { demandeId },
    }),
  scrimAction: (scope: PlayerScope, body: Record<string, unknown>) =>
    playerRequest(dashboardUrls.scrimRequests, {
      method: 'POST',
      scope: teamOnly(scope),
      json: body,
    }),
  leaveTeam: (scope: PlayerScope) =>
    playerRequest(dashboardUrls.leaveTeam, {
      method: 'POST',
      scope: teamOnly(scope),
    }),
};
