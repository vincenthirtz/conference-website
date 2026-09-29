// features/player/scrims/client.ts — appels typés du module scrims (lot P13).
//
// Portées reprises À L'IDENTIQUE des écrans historiques :
//   * routes `follow` (mes scrims, grilles, demandes en lecture) : sujet +
//     équipe active ;
//   * routes `self` avec équipe (recherche, report, annuaire) : équipe seule
//     — un `?as=` y serait refusé (403 `subject_unsupported`) ;
//   * session de planning (détail, suggestion, peinture) : aucune portée —
//     l'appartenance se déduit de la session (`resolvePlanningParty`).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  PlanningAvailabilityInput,
  PlanningAvailabilityResponse,
  PlanningSuggestResponse,
  PlayerScrimsResponse,
  ScrimPlanningDetailResponse,
  ScrimPlanningsResponse,
  ScrimReportInput,
  ScrimReportResponse,
  ScrimRequestDecisionInput,
  ScrimSearchInput,
  ScrimSearchResponse,
  ScrimSearchSaveResponse,
  TeamsDirectoryResponse,
} from './schemas';

const teamOnly = (s: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: s.teamId,
});

const planningUrl = (id: string) =>
  `/api/teams/scrim-plannings/${encodeURIComponent(id)}`;

export const scrimsUrls = {
  myScrims: '/api/player/scrims',
  report: (scrimId: string) =>
    `/api/player/scrims/${encodeURIComponent(scrimId)}/report`,
  requests: '/api/teams/scrim-requests',
  plannings: '/api/teams/scrim-plannings',
  planning: planningUrl,
  suggest: (id: string) => `${planningUrl(id)}/suggest`,
  availability: (id: string) => `${planningUrl(id)}/availability`,
  searches: '/api/teams/scrim-searches',
  directory: '/api/player/teams-directory',
};

export const scrimsClient = {
  myScrims: (scope: PlayerScope) =>
    playerRequest<PlayerScrimsResponse>(scrimsUrls.myScrims, {
      scope,
      skipAuthRedirect: true,
    }),
  report: (scope: PlayerScope, scrimId: string, body: ScrimReportInput) =>
    playerRequest<ScrimReportResponse>(scrimsUrls.report(scrimId), {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  /**
   * Réponse à une demande reçue (accepter un créneau, contre-proposer,
   * refuser) — équipe seule : le geste est celui de la capitaine connectée.
   */
  decideRequest: (scope: PlayerScope, body: ScrimRequestDecisionInput) =>
    playerRequest<unknown>(scrimsUrls.requests, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  plannings: (scope: PlayerScope) =>
    playerRequest<ScrimPlanningsResponse>(scrimsUrls.plannings, {
      scope,
      skipAuthRedirect: true,
    }),
  planning: (planningId: string) =>
    playerRequest<ScrimPlanningDetailResponse>(scrimsUrls.planning(planningId)),
  suggest: (planningId: string) =>
    playerRequest<PlanningSuggestResponse>(scrimsUrls.suggest(planningId)),
  saveAvailability: (planningId: string, body: PlanningAvailabilityInput) =>
    playerRequest<PlanningAvailabilityResponse>(
      scrimsUrls.availability(planningId),
      { method: 'PUT', json: body }
    ),
  mySearch: (scope: PlayerScope) =>
    playerRequest<ScrimSearchResponse>(scrimsUrls.searches, {
      scope: teamOnly(scope),
    }),
  saveSearch: (scope: PlayerScope, body: ScrimSearchInput) =>
    playerRequest<ScrimSearchSaveResponse>(scrimsUrls.searches, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  closeSearch: (scope: PlayerScope) =>
    playerRequest<{ success: true; search: null }>(scrimsUrls.searches, {
      method: 'DELETE',
      scope: teamOnly(scope),
    }),
  directory: (scope: PlayerScope) =>
    playerRequest<TeamsDirectoryResponse>(scrimsUrls.directory, {
      scope: teamOnly(scope),
    }),
};
