// pages/api/admin/teams/[teamId]/members.ts
// Gestion des membres d'une équipe (admin): GET, POST, PATCH, DELETE

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { findOrCreateUserByEmail } from '@/utils/find-or-create-user';
import { sendTeamJoinEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, validateRole } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  is_substitute: boolean;
  created_at: string;
};

const MEMBER_SELECT =
  'id, team_id, user_id, role, battle_tag, is_substitute, created_at';

type MembersResponse =
  | {
      members: TeamMemberRow[];
      total: number | null;
    }
  | {
      member: TeamMemberRow;
      info?: string;
    }
  | { success: boolean; info?: string }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembersResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-team-members'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Supabase service role not configured' });
  }

  const { teamId } = req.query;
  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  // GET - Liste des membres
  if (req.method === 'GET') {
    const { data, error, count } = await supabaseAdmin
      .from('team_members')
      .select(MEMBER_SELECT, { count: 'exact' })
      .eq('team_id', teamId)
      .order('is_substitute', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('admin GET team members error:', error);
      return res.status(500).json({ error: 'Failed to fetch team members' });
    }

    return res.status(200).json({
      members: (data || []) as TeamMemberRow[],
      total: typeof count === 'number' ? count : null,
    });
  }

  // POST - Ajouter un membre
  if (req.method === 'POST') {
    const { userId, email, role, battleTag, setCaptain, isSubstitute, force } =
      req.body || {};

    // Garde roster lock : refus si l'equipe est inscrite a un tournoi avec
    // roster_locked_at <= now() (sauf flag force=true).
    if (force !== true) {
      const lockStatus = await isTeamRosterLocked(ctx.tenantId, String(teamId));
      if (lockStatus.locked) {
        return res.status(409).json({
          error: rosterLockErrorMessage(lockStatus),
          code: 'ROSTER_LOCKED',
        } as any);
      }
    }

    let resolvedUserId =
      typeof userId === 'string' && userId.trim().length > 0
        ? userId.trim()
        : '';

    // BattleTag est obligatoire pour rejoindre une équipe
    if (!battleTag || typeof battleTag !== 'string' || !battleTag.trim()) {
      return res.status(400).json({
        error: 'BattleTag is required to join a team',
      });
    }

    // Valider le format du BattleTag
    const trimmedBattleTag = battleTag.trim();
    const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
    if (!re.test(trimmedBattleTag)) {
      return res.status(400).json({
        error: 'Invalid BattleTag (format Name#0000)',
      });
    }
    const battleTagValue = trimmedBattleTag;

    try {
      // Vérifier l'équipe
      const { data: team, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('id', teamId)
        .maybeSingle();
      if (teamErr || !team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Résoudre l'utilisateur par email (ou le créer s'il n'existe pas)
      if (!resolvedUserId) {
        if (!email || typeof email !== 'string') {
          return res
            .status(400)
            .json({ error: 'Provide userId or email to find the user' });
        }

        try {
          const { userId, created } = await findOrCreateUserByEmail(
            email,
            validateRole(role)
          );
          resolvedUserId = userId;
          if (created) {
            logger.info(`[members POST] auto-created user for ${email}`);
          }
        } catch (err: unknown) {
          logger.error('[members POST] findOrCreateUser error:', err);
          return res.status(500).json({
            error: (err as Error)?.message || 'Failed to find or create user',
          });
        }
      }

      // Insérer dans team_members (battle_tag est toujours requis)
      const memberPayload = {
        team_id: teamId,
        user_id: resolvedUserId,
        role: validateRole(role),
        battle_tag: battleTagValue,
        is_substitute: isSubstitute === true,
      };

      const { data: member, error: insertErr } = await supabaseAdmin
        .from('team_members')
        .insert(memberPayload)
        .select(MEMBER_SELECT)
        .maybeSingle();

      if (insertErr) {
        const msg =
          insertErr.message?.includes('duplicate') ||
          insertErr.message?.includes('unique')
            ? 'User already in this team'
            : 'Failed to add member';
        return res.status(400).json({ error: msg });
      }

      // Définir comme capitaine si demandé
      if (setCaptain) {
        await supabaseAdmin
          .from('teams')
          .update({ captain_id: resolvedUserId })
          .eq('id', teamId);
      }

      // Send team join email (non-blocking)
      const memberEmail =
        typeof email === 'string' ? email.trim().toLowerCase() : null;
      if (memberEmail) {
        sendTeamJoinEmail(memberEmail, team.name, memberPayload.role).catch(
          (err) => {
            logger.error('[members POST] team join email error:', err);
          }
        );
      } else {
        // Resolve email from auth if userId was provided directly
        supabaseAdmin.auth.admin
          .getUserById(resolvedUserId)
          .then(({ data }) => {
            if (data?.user?.email) {
              sendTeamJoinEmail(
                data.user.email,
                team.name,
                memberPayload.role
              ).catch((err) => {
                logger.error('[members POST] team join email error:', err);
              });
            }
          })
          .catch(() => {});
      }

      return res.status(201).json({
        member: member as TeamMemberRow,
        info: setCaptain ? 'Member added and set as captain' : 'Member added',
      });
    } catch (err: unknown) {
      logger.error('[members POST] error:', err);
      return res.status(500).json({
        error: (err as Error)?.message || 'Internal server error',
      });
    }
  }

  // PATCH - Modifier un membre ou échanger deux membres (swap)
  if (req.method === 'PATCH') {
    const { memberId, role, battleTag, isSubstitute, swapWithMemberId, force } =
      req.body || {};

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ error: 'memberId is required' });
    }

    // Garde roster lock : on bloque toute mutation (sauf force=true). On laisse
    // passer un PATCH qui ne change que le BattleTag : c'est une correction de typo,
    // pas un mouvement de roster. battleTag != reorganisation d'effectif.
    const onlyBattleTagChange =
      typeof battleTag === 'string' &&
      role === undefined &&
      isSubstitute === undefined &&
      !swapWithMemberId;
    if (force !== true && !onlyBattleTagChange) {
      const lockStatus = await isTeamRosterLocked(ctx.tenantId, String(teamId));
      if (lockStatus.locked) {
        return res.status(409).json({
          error: rosterLockErrorMessage(lockStatus),
          code: 'ROSTER_LOCKED',
        } as any);
      }
    }

    // Swap: exchange is_substitute between two members
    if (typeof swapWithMemberId === 'string' && swapWithMemberId.trim()) {
      try {
        // Fetch both members
        const { data: memberA, error: errA } = await supabaseAdmin
          .from('team_members')
          .select(MEMBER_SELECT)
          .eq('id', memberId)
          .eq('team_id', teamId)
          .maybeSingle();

        const { data: memberB, error: errB } = await supabaseAdmin
          .from('team_members')
          .select(MEMBER_SELECT)
          .eq('id', swapWithMemberId.trim())
          .eq('team_id', teamId)
          .maybeSingle();

        if (errA || errB || !memberA || !memberB) {
          return res
            .status(404)
            .json({ error: 'One or both members not found' });
        }

        // Swap is_substitute values
        const { error: upA } = await supabaseAdmin
          .from('team_members')
          .update({ is_substitute: memberB.is_substitute })
          .eq('id', memberA.id)
          .eq('team_id', teamId);

        const { error: upB } = await supabaseAdmin
          .from('team_members')
          .update({ is_substitute: memberA.is_substitute })
          .eq('id', memberB.id)
          .eq('team_id', teamId);

        if (upA || upB) {
          logger.error('[members PATCH swap] error:', upA, upB);
          return res.status(500).json({ error: 'Failed to swap members' });
        }

        return res.status(200).json({
          success: true,
          info: `Swapped ${memberA.battle_tag} and ${memberB.battle_tag}`,
        });
      } catch (err: unknown) {
        logger.error('[members PATCH swap] error:', err);
        return res.status(500).json({
          error: (err as Error)?.message || 'Internal server error',
        });
      }
    }

    // Standard update
    const updatePayload: any = {};
    if (typeof role === 'string') {
      updatePayload.role = validateRole(role);
    }
    if (typeof battleTag === 'string') {
      if (battleTag.trim()) {
        const trimmed = battleTag.trim();
        const re = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
        if (!re.test(trimmed)) {
          return res.status(400).json({
            error: 'Invalid BattleTag (format Name#0000)',
          });
        }
        updatePayload.battle_tag = trimmed;
      } else {
        updatePayload.battle_tag = null;
      }
    }
    if (typeof isSubstitute === 'boolean') {
      updatePayload.is_substitute = isSubstitute;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    try {
      const { data: member, error: updateErr } = await supabaseAdmin
        .from('team_members')
        .update(updatePayload)
        .eq('id', memberId)
        .eq('team_id', teamId)
        .select(MEMBER_SELECT)
        .maybeSingle();

      if (updateErr) {
        logger.error('[members PATCH] error:', updateErr);
        return res.status(500).json({ error: 'Failed to update member' });
      }

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      return res.status(200).json({
        member: member as TeamMemberRow,
        info: 'Member updated',
      });
    } catch (err: unknown) {
      logger.error('[members PATCH] error:', err);
      return res.status(500).json({
        error: (err as Error)?.message || 'Internal server error',
      });
    }
  }

  // DELETE - Supprimer un membre
  if (req.method === 'DELETE') {
    const { memberId, force } = req.body || {};

    if (!memberId || typeof memberId !== 'string') {
      return res.status(400).json({ error: 'memberId is required' });
    }

    if (force !== true) {
      const lockStatus = await isTeamRosterLocked(ctx.tenantId, String(teamId));
      if (lockStatus.locked) {
        return res.status(409).json({
          error: rosterLockErrorMessage(lockStatus),
          code: 'ROSTER_LOCKED',
        } as any);
      }
    }

    try {
      // Récupérer le membre pour vérifier s'il est capitaine
      const { data: member, error: fetchErr } = await supabaseAdmin
        .from('team_members')
        .select('id, user_id')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle();

      if (fetchErr || !member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Vérifier si ce membre est le capitaine
      const { data: team } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .maybeSingle();

      // Supprimer le membre
      const { error: deleteErr } = await supabaseAdmin
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('team_id', teamId);

      if (deleteErr) {
        logger.error('[members DELETE] error:', deleteErr);
        return res.status(500).json({ error: 'Failed to delete member' });
      }

      // Si c'était le capitaine, retirer le captain_id
      if (team?.captain_id === member.user_id) {
        await supabaseAdmin
          .from('teams')
          .update({ captain_id: null })
          .eq('id', teamId);
      }

      return res.status(200).json({
        success: true,
        info: 'Member removed from team',
      });
    } catch (err: unknown) {
      logger.error('[members DELETE] error:', err);
      return res.status(500).json({
        error: (err as Error)?.message || 'Internal server error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
