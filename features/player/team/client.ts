// features/player/team/client.ts — appels typés de « Gérer mon équipe »
// (lot P10) : tranche équipe, identité, roster, capitanat, invitations,
// demandes reçues.
//
// Toutes les routes sont `subject: 'follow'` ; `playerRequest` pose la portée
// (`?as=` + `&act=1` en act-as, puis `?teamId=` de l'équipe active). Avant P10
// les écritures ne portaient que `?teamId=` : en act-as depuis la vue
// capitaine, elles partaient donc au nom du STAFF (et échouaient en 403).
// Mutations : `Idempotency-Key` fraîche.

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  InvitationSentDto,
  InviteRoleChoice,
  SentInvitationDto,
  TeamMemberRightChange,
  TeamMemberRightsResponse,
  TeamInfoPatchInput,
  TeamPageEditorPayload,
  TeamJoinRequestDto,
  TeamSpecialty,
} from './schemas';

export const teamUrls = {
  myTeam: '/api/player/team',
  invitations: '/api/teams/invitations',
  invitation: (id: string) =>
    `/api/teams/invitations/${encodeURIComponent(id)}`,
  joinRequests: '/api/teams/join-requests',
  members: (teamId: string) =>
    `/api/teams/${encodeURIComponent(teamId)}/members`,
  updateMemberRole: '/api/teams/update-member-role',
  updateMemberSpecialty: '/api/teams/update-member-specialty',
  updateMember: '/api/teams/update-member',
  transferCaptain: '/api/teams/transfer-captain',
  memberPermissions: '/api/teams/member-permissions',
  publicPage: (teamId: string) =>
    `/api/teams/${encodeURIComponent(teamId)}/public-page`,
  uploadImage: (teamId: string) =>
    `/api/teams/${encodeURIComponent(teamId)}/upload-image`,
};

const mutate = <T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  scope: PlayerScope,
  json?: unknown
) =>
  playerRequest<T>(url, {
    method,
    ...(json === undefined ? {} : { json }),
    idempotent: true,
    scope,
  });

export const teamClient = {
  patchInfo: (scope: PlayerScope, body: TeamInfoPatchInput) =>
    mutate<{ team: unknown; isCaptain: boolean; isManager: boolean }>(
      teamUrls.myTeam,
      'PATCH',
      scope,
      body
    ),

  listInvitations: async (scope: PlayerScope) =>
    (
      await playerRequest<{ invitations?: SentInvitationDto[] }>(
        teamUrls.invitations,
        { scope }
      )
    ).invitations ?? [],
  invite: (
    scope: PlayerScope,
    body: { email: string; role: InviteRoleChoice }
  ) => {
    const asCaptain = body.role === 'captain';
    return mutate<InvitationSentDto>(teamUrls.invitations, 'POST', scope, {
      email: body.email,
      role: asCaptain ? 'player' : body.role,
      set_captain: asCaptain,
    });
  },
  resendInvitation: (scope: PlayerScope, id: string) =>
    mutate<InvitationSentDto>(teamUrls.invitation(id), 'POST', scope),
  cancelInvitation: (scope: PlayerScope, id: string) =>
    mutate<unknown>(teamUrls.invitation(id), 'DELETE', scope),

  listJoinRequests: async (scope: PlayerScope) =>
    (
      await playerRequest<{ demandes?: TeamJoinRequestDto[] }>(
        teamUrls.joinRequests,
        { scope }
      )
    ).demandes ?? [],
  decideJoinRequest: (
    scope: PlayerScope,
    body: {
      demandeId: string;
      action: 'approve' | 'reject';
      battleTag?: string;
    }
  ) => mutate<unknown>(teamUrls.joinRequests, 'POST', scope, body),

  /** L'équipe est dans le CHEMIN : pas de `?teamId=` concurrent. */
  removeMember: (scope: PlayerScope, teamId: string, memberId: string) =>
    mutate<unknown>(
      teamUrls.members(teamId),
      'DELETE',
      { ...scope, teamId: null },
      { memberId }
    ),
  updateMemberRole: (scope: PlayerScope, memberId: string, role: string) =>
    mutate<{ newRole: string | null; isSubstitute: boolean }>(
      teamUrls.updateMemberRole,
      'PATCH',
      scope,
      { memberId, role }
    ),
  updateMemberSpecialty: (
    scope: PlayerScope,
    memberId: string,
    specialty: TeamSpecialty
  ) =>
    mutate<unknown>(teamUrls.updateMemberSpecialty, 'PATCH', scope, {
      memberId,
      specialty,
    }),
  updateMember: (
    scope: PlayerScope,
    body: {
      memberId: string;
      battle_tag?: string | null;
      skill_rating?: number | null;
    }
  ) => mutate<unknown>(teamUrls.updateMember, 'PATCH', scope, body),
  transferCaptain: (scope: PlayerScope, newCaptainUserId: string) =>
    mutate<unknown>(teamUrls.transferCaptain, 'PATCH', scope, {
      newCaptainUserId,
    }),

  /** Droits délégués (J3) de l'équipe active, par membre et par source. */
  memberRights: (scope: PlayerScope) =>
    playerRequest<TeamMemberRightsResponse>(teamUrls.memberPermissions, {
      scope,
    }),
  setMemberRight: (
    scope: PlayerScope,
    body: { userId: string; permission: string; grant: boolean }
  ) =>
    mutate<TeamMemberRightChange>(
      teamUrls.memberPermissions,
      body.grant ? 'POST' : 'DELETE',
      scope,
      { userId: body.userId, permission: body.permission }
    ),

  /**
   * Page publique (`team/[slug]/edit`). L'équipe est dans le CHEMIN : pas de
   * `?teamId=` concurrent ; `?as=…&act=1` suit la portée (act-as staff).
   */
  patchPublicPage: (
    scope: PlayerScope,
    teamId: string,
    body: TeamPageEditorPayload
  ) =>
    mutate<{ updatedFields?: unknown[] }>(
      teamUrls.publicPage(teamId),
      'PATCH',
      { ...scope, teamId: null },
      body
    ),
};
