// pages/api/admin/teams/add-member.ts
// Ajout d'un membre à une équipe (option: le définir capitaine)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  validateBattleTagForRole,
  resolveUserIdByEmail,
  insertTeamMember,
  setTeamCaptain,
} from '@/utils/teams/addMember';
import { logStaffAction } from '@/utils/staffLogs';
import { loadTeamInTenant } from '@/utils/teams/loadTeamInTenant';
import { sendTeamJoinEmail } from '@/utils/email';
import {
  createStaffInvitation,
  parseStaffAddMode,
  resolveMemberEmail,
} from '@/utils/teams/staffInvitation';

import { logger } from '../../../../utils/logger';
type AddMemberResponse =
  | {
      teamMemberId?: string;
      teamId: string;
      userId: string;
      role: string;
      battle_tag?: string | null;
      captainSet: boolean;
      info?: string;
      /** Ajout direct : l'email d'information est-il parti ? */
      emailSent?: boolean;
    }
  | {
      /** Mode par défaut : rien n'est ajouté tant que la personne n'accepte pas. */
      invited: true;
      invitationId: string;
      teamId: string;
      userId: string;
      role: string;
      captainSet: false;
      expiresAt: string | null;
      inviteUrl: string;
      emailSent: boolean;
    }
  | { error: string; code?: string };

export default withStaffRoute(handler, { permission: 'manage_teams' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AddMemberResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  const { teamId, userId, email, role, setCaptain, battleTag, isSubstitute } =
    req.body || {};

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'teamId is required' });
  }

  // Invitation par défaut ; ajout direct seulement sur motif (cf.
  // utils/teams/staffInvitation.ts).
  const addMode = parseStaffAddMode(req.body);
  if (!addMode.ok) {
    return res
      .status(addMode.status)
      .json({ error: addMode.error, code: addMode.code });
  }

  const resolvedRole =
    typeof role === 'string' && role.trim() ? role.trim() : 'player';

  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  // BattleTag exigé des rôles jouants uniquement (cf. utils/teams/addMember).
  let battleTagValue: string | null;
  try {
    battleTagValue = validateBattleTagForRole(battleTag, resolvedRole);
  } catch (err: unknown) {
    return res
      .status(400)
      .json({ error: (err as Error)?.message ?? 'Invalid BattleTag' });
  }

  try {
    // Vérifier l'équipe
    // Bornée à l'espace : ajouter un compte au roster d'une équipe d'un AUTRE
    // espace le rattachait à celui de la personne qui agit (l'insertion porte
    // `ctx.tenantId`), ce qui ouvrait ensuite correction de solde et rattrapage.
    const teamRead = await loadTeamInTenant<{
      id: string;
      name: string;
      logo_url: string | null;
      captain_id: string | null;
    }>(teamId, ctx.tenantId, 'id, name, logo_url, captain_id');
    if (!teamRead.ok) {
      return res.status(teamRead.status).json({ error: teamRead.error });
    }
    const team = teamRead.team;

    // Résoudre l'utilisateur par email si nécessaire (pas de creation cote admin)
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        return res
          .status(400)
          .json({ error: 'Provide userId or email to find the user' });
      }
      const resolved = await resolveUserIdByEmail({ email, create: false });
      if (!resolved.ok) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      resolvedUserId = resolved.userId;
    }

    const memberEmail = await resolveMemberEmail(resolvedUserId, email);
    // S'ajouter soi-même, c'est consentir : ni invitation ni motif.
    const selfAdd = resolvedUserId === ctx.user.id;

    if (addMode.mode === 'invite' && !selfAdd) {
      const invite = await createStaffInvitation({
        tenantId: ctx.tenantId,
        teamId,
        teamName: team.name,
        teamHasCaptain: Boolean(team.captain_id),
        staffUserId: ctx.user.id,
        inviteeUserId: resolvedUserId,
        inviteeEmail: memberEmail,
        role: resolvedRole,
        isSubstitute: isSubstitute === true,
        battleTag: battleTagValue,
        setCaptain: setCaptain === true,
      });
      if (!invite.ok) {
        return res
          .status(invite.status)
          .json({ error: invite.error, code: invite.code });
      }
      if (ctx?.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'invite_team_member',
            entity_type: 'team',
            entity_id: teamId,
            tenant_id: ctx.tenantId,
            payload: {
              memberUserId: resolvedUserId,
              invitationId: invite.invitationId,
              role: invite.desiredRole,
              setCaptain: setCaptain === true,
            },
          });
        } catch (logErr) {
          logger.error('logStaffAction(invite_team_member) error:', logErr);
        }
      }
      return res.status(202).json({
        invited: true,
        invitationId: invite.invitationId,
        teamId,
        userId: resolvedUserId,
        role: invite.desiredRole,
        captainSet: false,
        expiresAt: invite.expiresAt,
        inviteUrl: invite.inviteUrl,
        emailSent: invite.emailSent,
      });
    }

    // Insert (le helper traduit les erreurs trigger/duplicate en messages metier)
    const insertResult = await insertTeamMember({
      tenantId: ctx.tenantId,
      teamId,
      userId: resolvedUserId,
      role: resolvedRole,
      battleTag: battleTagValue,
      enforceMaxPlayersPreCheck: true,
      // Ajout direct par un tiers : pas d'accord de la personne, donc
      // `accepted_at` reste NULL (aucun rattachement TCG).
      acceptedAt: selfAdd ? new Date().toISOString() : null,
    });
    if (!insertResult.ok) {
      return res
        .status(insertResult.status)
        .json({ error: insertResult.error });
    }

    let captainSet = false;
    if (setCaptain) {
      const captainResult = await setTeamCaptain(
        teamId,
        resolvedUserId,
        ctx.tenantId
      );
      if (!captainResult.ok) {
        return res
          .status(captainResult.status)
          .json({ error: captainResult.error });
      }
      captainSet = true;
    }

    // Créer une news auto
    try {
      // Sans BattleTag (coach / manager), on retombe sur la partie locale de
      // l'email puis sur un libellé neutre : la news ne doit pas afficher
      // "undefined rejoint …".
      const playerName =
        battleTagValue?.split('#')[0] ||
        (typeof email === 'string' && email.includes('@')
          ? email.split('@')[0]
          : 'Un nouveau membre');
      const teamName = team?.name || 'une equipe';
      const newsSlug = `team-${teamId}-member-${Date.now().toString(36)}`;
      await supabaseAdmin.from('news').insert({
        tenant_id: ctx.tenantId,
        title: `${playerName} rejoint ${teamName}`,
        slug: newsSlug,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${teamName} en tant que ${resolvedRole}.`,
        content: `${playerName} a rejoint ${teamName} en tant que ${resolvedRole}. Bienvenue !`,
        image_url: team?.logo_url ?? null,
        team_id: teamId,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      logger.error('[/api/admin/teams/add-member] create news error:', newsErr);
    }

    // La personne est prévenue même sans invitation : elle doit savoir qu'elle
    // figure sur ce roster, et pouvoir le quitter depuis son espace.
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
        logger.error(
          '[/api/admin/teams/add-member] join email error:',
          mailErr
        );
      }
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'add_team_member',
          entity_type: 'team',
          entity_id: teamId,
          tenant_id: ctx.tenantId,
          payload: {
            memberUserId: resolvedUserId,
            role: resolvedRole,
            setCaptain: captainSet,
            mode: selfAdd ? 'self' : 'direct',
            reason: addMode.reason,
          },
        });
      } catch (logErr) {
        logger.error('logStaffAction(add_team_member) error:', logErr);
      }
    }

    return res.status(200).json({
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
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/add-member] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Internal server error',
    });
  }
}
