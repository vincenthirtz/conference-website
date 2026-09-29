// features/admin/teams/service/addMember.ts — ajout d'un membre à une équipe
// par le staff (POST /api/admin/teams/add-member).
//
// Invitation PAR DÉFAUT (202) : rien n'est ajouté tant que la personne
// n'accepte pas. Ajout direct seulement sur motif (`mode: 'direct'` +
// `reason`, cf. utils/teams/staffAddMode.ts) ou quand on s'ajoute soi-même.
// L'équipe est lue DANS l'espace du staff (404 sinon).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  insertTeamMember,
  resolveUserIdByEmail,
  setTeamCaptain,
  validateBattleTagForRole,
} from '@/utils/teams/addMember';
import { loadTeamInTenant } from '@/utils/teams/loadTeamInTenant';
import { sendTeamJoinEmail } from '@/utils/email';
import {
  createStaffInvitation,
  parseStaffAddMode,
  resolveMemberEmail,
} from '@/utils/teams/staffInvitation';
import type { Audited } from '../../_shared/audited';
import * as teams from '../repository/teams';
import { fail } from './common';

type Invited = {
  invited: true;
  invitationId: string;
  teamId: string;
  userId: string;
  role: string;
  captainSet: false;
  expiresAt: string | null;
  inviteUrl: string;
  emailSent: boolean;
};

type Added = {
  teamMemberId?: string;
  teamId: string;
  userId: string;
  role: string;
  battle_tag?: string | null;
  captainSet: boolean;
  info?: string;
  emailSent?: boolean;
};

/** Réponse + son statut (202 invitation, 200 ajout direct). */
export type AddMemberOutcome =
  | { status: 202; body: Invited }
  | { status: 200; body: Added };

export async function addTeamMember(
  ctx: ServiceContext,
  staffUserId: string,
  body: Record<string, unknown>
): Promise<Audited<AddMemberOutcome>> {
  const { teamId, userId, email, role, setCaptain, battleTag, isSubstitute } =
    body;

  if (!teamId || typeof teamId !== 'string') {
    throw fail(400, 'teamId is required');
  }

  const addMode = parseStaffAddMode(body);
  if (!addMode.ok) throw fail(addMode.status, addMode.error, addMode.code);

  const resolvedRole =
    typeof role === 'string' && role.trim() ? role.trim() : 'player';
  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  // BattleTag exigé des rôles jouants uniquement.
  let battleTagValue: string | null;
  try {
    battleTagValue = validateBattleTagForRole(
      battleTag as string | null | undefined,
      resolvedRole
    );
  } catch (err: unknown) {
    throw fail(400, (err as Error)?.message ?? 'Invalid BattleTag');
  }

  try {
    const teamRead = await loadTeamInTenant<{
      id: string;
      name: string;
      logo_url: string | null;
      captain_id: string | null;
    }>(teamId, ctx.tenantId, 'id, name, logo_url, captain_id');
    if (!teamRead.ok) throw fail(teamRead.status, teamRead.error);
    const team = teamRead.team;

    // Résolution par email (pas de création de compte côté admin).
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        throw fail(400, 'Provide userId or email to find the user');
      }
      const resolved = await resolveUserIdByEmail({ email, create: false });
      if (!resolved.ok) throw fail(resolved.status, resolved.error);
      resolvedUserId = resolved.userId;
    }

    const memberEmail = await resolveMemberEmail(
      resolvedUserId,
      email as string | undefined
    );
    // S'ajouter soi-même, c'est consentir : ni invitation ni motif.
    const selfAdd = resolvedUserId === staffUserId;

    if (addMode.mode === 'invite' && !selfAdd) {
      const invite = await createStaffInvitation({
        tenantId: ctx.tenantId,
        teamId,
        teamName: team.name,
        teamHasCaptain: Boolean(team.captain_id),
        staffUserId,
        inviteeUserId: resolvedUserId,
        inviteeEmail: memberEmail,
        role: resolvedRole,
        isSubstitute: isSubstitute === true,
        battleTag: battleTagValue,
        setCaptain: setCaptain === true,
      });
      if (!invite.ok) throw fail(invite.status, invite.error, invite.code);

      return {
        result: {
          status: 202,
          body: {
            invited: true,
            invitationId: invite.invitationId,
            teamId,
            userId: resolvedUserId,
            role: invite.desiredRole,
            captainSet: false,
            expiresAt: invite.expiresAt,
            inviteUrl: invite.inviteUrl,
            emailSent: invite.emailSent,
          },
        },
        audit: {
          action: 'invite_team_member',
          entity_type: 'team',
          entity_id: teamId,
          payload: {
            memberUserId: resolvedUserId,
            invitationId: invite.invitationId,
            role: invite.desiredRole,
            setCaptain: setCaptain === true,
          },
        },
      };
    }

    const insertResult = await insertTeamMember({
      tenantId: ctx.tenantId,
      teamId,
      userId: resolvedUserId,
      role: resolvedRole,
      battleTag: battleTagValue,
      enforceMaxPlayersPreCheck: true,
      // Ajout direct par un tiers : pas d'accord, `accepted_at` reste NULL.
      acceptedAt: selfAdd ? new Date().toISOString() : null,
    });
    if (!insertResult.ok) throw fail(insertResult.status, insertResult.error);

    let captainSet = false;
    if (setCaptain) {
      const captainResult = await setTeamCaptain(
        teamId,
        resolvedUserId,
        ctx.tenantId
      );
      if (!captainResult.ok) {
        throw fail(captainResult.status, captainResult.error);
      }
      captainSet = true;
    }

    // Actualité automatique (best-effort).
    try {
      const playerName =
        battleTagValue?.split('#')[0] ||
        (typeof email === 'string' && email.includes('@')
          ? email.split('@')[0]
          : 'Un nouveau membre');
      const teamName = team?.name || 'une equipe';
      await teams.insertNews(ctx.db, {
        tenant_id: ctx.tenantId,
        title: `${playerName} rejoint ${teamName}`,
        slug: `team-${teamId}-member-${Date.now().toString(36)}`,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${teamName} en tant que ${resolvedRole}.`,
        content: `${playerName} a rejoint ${teamName} en tant que ${resolvedRole}. Bienvenue !`,
        image_url: team?.logo_url ?? null,
        team_id: teamId,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      ctx.logger.error(
        '[/api/admin/teams/add-member] create news error:',
        newsErr
      );
    }

    // Prévenue même sans invitation : elle figure sur ce roster.
    let emailSent = false;
    if (memberEmail && !selfAdd) {
      try {
        const sent = await sendTeamJoinEmail(
          memberEmail,
          team.name,
          resolvedRole,
          ctx.tenantId
        );
        emailSent = !!sent?.success;
      } catch (mailErr) {
        ctx.logger.error(
          '[/api/admin/teams/add-member] join email error:',
          mailErr
        );
      }
    }

    return {
      result: {
        status: 200,
        body: {
          teamMemberId: insertResult.memberId ?? undefined,
          teamId,
          userId: resolvedUserId,
          role: resolvedRole,
          battle_tag: battleTagValue,
          captainSet,
          emailSent,
          info: captainSet
            ? 'Member added and set as captain'
            : 'Member added to team',
        },
      },
      audit: {
        entity_type: 'team',
        entity_id: teamId,
        payload: {
          memberUserId: resolvedUserId,
          role: resolvedRole,
          setCaptain: captainSet,
          mode: selfAdd ? 'self' : 'direct',
          reason: addMode.reason,
        },
      },
    };
  } catch (err: unknown) {
    if (err instanceof LegacyAdminError) throw err;
    ctx.logger.error('[/api/admin/teams/add-member] error:', err);
    throw fail(500, (err as Error)?.message || 'Internal server error');
  }
}
