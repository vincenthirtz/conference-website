// features/player/demandes/client.ts — appels typés des demandes émises par
// la joueuse (lot P11).
//
// Portée : les routes de demandes sont `self` en écriture — un `?as=` y serait
// refusé (403 `subject_unsupported`). On ne porte donc que l'ÉQUIPE active
// (`?teamId=`), exactement ce que faisait l'écran historique (`withTeam`).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type { TransferDemandeInput } from './schemas';

/** Équipe de l'annuaire public (`GET /api/teams`) proposée comme cible. */
export type RequestTargetTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
  is_joinable?: boolean;
  /** L'équipe se déclare disponible pour un scrim. */
  open_for_scrim?: boolean;
};

export type ScrimDemandeRequest = {
  teamId: string;
  message?: string;
  proposedSlots: string[];
};

type DemandeCreated = { success: true; message: string };

/** Audience d'une demande de scrim groupée (utils/teams/scrimBroadcast.ts). */
export type ScrimBroadcastAudience = 'all' | 'level' | 'searching';

export type ScrimBroadcastRequest = {
  audience: ScrimBroadcastAudience;
  proposedSlots: string[];
  message?: string;
  announcedSr: number | null;
};

export type ScrimBroadcastPreview = {
  audience: ScrimBroadcastAudience;
  /** SR de l'équipe (préremplit le niveau annoncé), ou null. */
  teamSkillRating: number | null;
  count: number;
  alreadyPending: number;
  teams: {
    id: string;
    name: string;
    skillRating: number | null;
    searching: boolean;
  }[];
};

export type ScrimBroadcastCreated = {
  success: true;
  broadcastId: string;
  sent: number;
  alreadyPending: number;
  teams: string[];
  message: string;
};

const teamOnly = (s: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: s.teamId,
});

export const demandesUrls = {
  transfer: '/api/demandes/transfer',
  scrim: '/api/demandes/scrim',
  scrimBroadcast: '/api/demandes/scrim-broadcast',
  teams: '/api/teams',
};

export const demandesClient = {
  transfer: (body: TransferDemandeInput, scope: PlayerScope) =>
    playerRequest<DemandeCreated>(demandesUrls.transfer, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  scrim: (body: ScrimDemandeRequest, scope: PlayerScope) =>
    playerRequest<DemandeCreated>(demandesUrls.scrim, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  /** Aperçu d'un envoi groupé : destinataires de l'audience. */
  scrimBroadcastPreview: (
    audience: ScrimBroadcastAudience,
    announcedSr: number | null,
    scope: PlayerScope
  ) => {
    const params = new URLSearchParams({ audience });
    if (announcedSr !== null) params.set('announcedSr', String(announcedSr));
    return playerRequest<ScrimBroadcastPreview>(
      `${demandesUrls.scrimBroadcast}?${params.toString()}`,
      { scope: teamOnly(scope) }
    );
  },
  scrimBroadcast: (body: ScrimBroadcastRequest, scope: PlayerScope) =>
    playerRequest<ScrimBroadcastCreated>(demandesUrls.scrimBroadcast, {
      method: 'POST',
      json: body,
      idempotent: true,
      scope: teamOnly(scope),
    }),
  /** Annuaire public : 50 équipes au plus, filtrées par nom. */
  targetTeams: async (search: string): Promise<RequestTargetTeam[]> => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', '50');
    const data = await playerRequest<{ teams?: RequestTargetTeam[] }>(
      `${demandesUrls.teams}?${params.toString()}`,
      { skipAuthRedirect: true }
    );
    return data.teams ?? [];
  },
};
