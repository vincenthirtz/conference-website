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
import { logStaffAction } from '@/utils/staffLogs';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { computeBattleTagMismatch } from '@/utils/auth/battleTagMismatch';
import {
  validateBattleTagForRole,
  roleRequiresBattleTag,
} from '@/utils/teams/addMember';

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  is_substitute: boolean;
  created_at: string;
  /** Horodatage de vérif OAuth Battle.net (NULL = non vérifié → source du badge). */
  battle_tag_verified_at?: string | null;
  /** Flag anti-smurf : compte Blizzard vérifié ≠ tag roster (calculé au GET). */
  battle_tag_mismatch?: boolean;
};

const MEMBER_SELECT =
  'id, team_id, user_id, role, battle_tag, is_substitute, created_at, battle_tag_verified_at, verified_battle_net_id';

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

export default withStaffRoute(handler, 'admin');

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

    const rawMembers = (data || []) as (TeamMemberRow & {
      verified_battle_net_id?: string | null;
    })[];

    // Lien identité Battle.net vérifié des membres (service-role) pour détecter
    // un mismatch « compte vérifié ≠ tag roster ». Best-effort : en cas d'erreur
    // on renvoie les membres sans le flag plutôt que d'échouer la liste.
    const memberUserIds = Array.from(
      new Set(rawMembers.map((m) => m.user_id).filter(Boolean))
    );
    const linkedTagByUser = new Map<string, string>();
    if (memberUserIds.length) {
      const { data: bnetLinks } = await supabaseAdmin
        .from('user_battlenet_links')
        .select('auth_user_id, battle_tag')
        .in('auth_user_id', memberUserIds);
      (bnetLinks ?? []).forEach((row: any) => {
        if (row?.auth_user_id && row?.battle_tag) {
          linkedTagByUser.set(row.auth_user_id, String(row.battle_tag));
        }
      });
    }

    const members: TeamMemberRow[] = rawMembers.map((m) => {
      const { verified_battle_net_id, ...rest } = m;
      return {
        ...rest,
        battle_tag_verified_at: m.battle_tag_verified_at ?? null,
        battle_tag_mismatch: computeBattleTagMismatch({
          battleTag: m.battle_tag ?? null,
          verifiedAt: m.battle_tag_verified_at ?? null,
          verifiedBattleNetId: verified_battle_net_id ?? null,
          linkedTag: linkedTagByUser.get(m.user_id) ?? null,
        }),
      };
    });

    return res.status(200).json({
      members,
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

    // BattleTag : exigé des rôles jouants, facultatif pour l'encadrement
    // (coach / manager). Validation déléguée au helper partagé pour que les
    // trois chemins d'ajout appliquent la même règle.
    const resolvedRole =
      typeof role === 'string' && role.trim() ? role.trim() : 'player';
    let battleTagValue: string | null;
    try {
      battleTagValue = validateBattleTagForRole(battleTag, resolvedRole);
    } catch {
      return res.status(400).json({
        error: roleRequiresBattleTag(resolvedRole)
          ? 'BattleTag is required to join a team (format Name#0000)'
          : 'Invalid BattleTag (format Name#0000)',
      });
    }

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

      // Insérer dans team_members. `tenant_id` est NOT NULL sans default depuis
      // enforce_tenant_id_not_null_and_fk.sql : l'omettre fait échouer l'insert
      // (23502) quel que soit le rôle. Tous les autres chemins d'ajout
      // (utils/teams/addMember, teams/create-with-member, bot, import) le posent.
      const memberPayload = {
        tenant_id: ctx.tenantId,
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
        logger.error('[members POST] insert error:', insertErr);
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

      if (ctx?.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'add_team_member',
            entity_type: 'team',
            entity_id: String(teamId),
            tenant_id: ctx.tenantId,
            payload: {
              memberUserId: resolvedUserId,
              role: memberPayload.role,
              isSubstitute: memberPayload.is_substitute,
              setCaptain: setCaptain === true,
            },
          });
          if (setCaptain) {
            await logStaffAction({
              staff_id: ctx.staff.id,
              action: 'reassign_captain',
              entity_type: 'team',
              entity_id: String(teamId),
              tenant_id: ctx.tenantId,
              payload: { captainUserId: resolvedUserId },
            });
          }
        } catch (logErr) {
          logger.error('logStaffAction(add_team_member) error:', logErr);
        }
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

        if (ctx?.staff?.id) {
          try {
            await logStaffAction({
              staff_id: ctx.staff.id,
              action: 'update_team_member',
              entity_type: 'team',
              entity_id: String(teamId),
              tenant_id: ctx.tenantId,
              payload: {
                op: 'swap',
                memberId: memberA.id,
                swapWithMemberId: memberB.id,
              },
            });
          } catch (logErr) {
            logger.error(
              'logStaffAction(update_team_member swap) error:',
              logErr
            );
          }
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

      if (ctx?.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'update_team_member',
            entity_type: 'team',
            entity_id: String(teamId),
            tenant_id: ctx.tenantId,
            payload: {
              memberId,
              memberUserId: member.user_id,
              fields: Object.keys(updatePayload),
            },
          });
        } catch (logErr) {
          logger.error('logStaffAction(update_team_member) error:', logErr);
        }
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
      const wasCaptain = team?.captain_id === member.user_id;
      if (wasCaptain) {
        await supabaseAdmin
          .from('teams')
          .update({ captain_id: null })
          .eq('id', teamId);
      }

      if (ctx?.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'remove_team_member',
            entity_type: 'team',
            entity_id: String(teamId),
            tenant_id: ctx.tenantId,
            payload: {
              memberId,
              memberUserId: member.user_id,
              wasCaptain,
            },
          });
        } catch (logErr) {
          logger.error('logStaffAction(remove_team_member) error:', logErr);
        }
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
