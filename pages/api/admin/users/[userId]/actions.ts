// pages/api/admin/users/[userId]/actions.ts
//
// Thin staff endpoint for the per-player command center (admin "Vue player").
// Handles the two actions that CANNOT reuse an existing endpoint:
//
//   - action 'assign_captain' : promote the target user to captain of THEIR
//     current team. /api/teams/transfer-captain is requester-scoped (the staff
//     would have to BE the captain), so admins need this server-side path.
//
//   - action 'transfer_team'  : move the target user from their current team to
//     another team (remove the existing membership, then insert into the target
//     team). team_members enforces a single membership per user, so a plain
//     add-member would 400 ("already in a team").
//
// Everything else (battle_tag, display_name, role, resend_credentials, demande
// approve/reject) is handled by REUSING the existing endpoints from the client —
// this file does NOT duplicate that logic.
//
// All actions are scoped to the staff's active tenant (ctx.tenantId) and the
// TARGET userId, gated at minRole 'admin' (mirrors add-member / teams gates),
// and audited via logStaffAction with the pre-declared action strings.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { findExclusiveMembership } from '@/utils/teams/memberships';
import {
  listMemberships,
  pickExclusiveMembership,
} from '@/utils/teams/memberships';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitRoleSyncEvent } from '@/utils/botRoleSync';
import {
  validateBattleTag,
  insertTeamMember,
  setTeamCaptain,
} from '@/utils/teams/addMember';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../../utils/logger';

type ActionResponse =
  | { success: true; info?: string; teamId?: string }
  | { error: string };

export default withStaffRoute(handler, { permission: 'manage_staff' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActionResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-player-actions'
    )
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const rawUserId = req.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!userId || typeof userId !== 'string' || !isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const tenantId = ctx.tenantId;
  const action = (req.body?.action as string | undefined) ?? '';

  if (action === 'assign_captain') {
    return assignCaptain(req, res, ctx, userId, tenantId);
  }
  if (action === 'transfer_team') {
    return transferTeam(req, res, ctx, userId, tenantId);
  }

  return res.status(400).json({ error: 'Unsupported action' });
}

/* -----------------------------------------------------------
 * assign_captain — promote the target user to captain of their
 * current team (the team they're already a member of).
 * ---------------------------------------------------------*/
async function assignCaptain(
  req: NextApiRequest,
  res: NextApiResponse<ActionResponse>,
  ctx: AuthenticatedStaffContext,
  userId: string,
  tenantId: string
) {
  // The user must be a member of the team they're being made captain of.
  // Exclusive membership: a captain plays, so a manager seat is not it (and a
  // manager may hold several — reading a single row would fail).
  const membership = await findExclusiveMembership(userId, tenantId);

  const teamId = membership?.team_id ?? null;
  if (!teamId) {
    return res
      .status(400)
      .json({ error: "Ce joueur n'appartient à aucune équipe." });
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  if (team.captain_id === userId) {
    return res
      .status(400)
      .json({ error: 'Ce joueur est déjà capitaine de son équipe.' });
  }

  const previousCaptainId = (team.captain_id as string | null) ?? null;

  const result = await setTeamCaptain(teamId, userId, tenantId);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  void logStaffAction({
    staff_id: ctx.staff.id,
    action: 'assign_team_captain',
    entity_type: 'team',
    entity_id: teamId,
    tenant_id: tenantId,
    payload: {
      newCaptainUserId: userId,
      previousCaptainUserId: previousCaptainId,
      via: 'player-view',
    },
  });

  return res
    .status(200)
    .json({ success: true, info: 'Capitanat transféré.', teamId });
}

/* -----------------------------------------------------------
 * transfer_team — move the target user to another team. Removes
 * the current membership (if any), then inserts into the target
 * team. A BattleTag is required by the team_members shape; we
 * carry over the existing one (or accept an override in the body).
 * ---------------------------------------------------------*/
async function transferTeam(
  req: NextApiRequest,
  res: NextApiResponse<ActionResponse>,
  ctx: AuthenticatedStaffContext,
  userId: string,
  tenantId: string
) {
  const targetTeamId = req.body?.teamId;
  if (!targetTeamId || typeof targetTeamId !== 'string') {
    return res.status(400).json({ error: 'teamId (destination) requis.' });
  }

  // Destination team must exist in this tenant.
  const { data: destTeam } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id')
    .eq('id', targetTeamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!destTeam) {
    return res
      .status(404)
      .json({ error: 'Équipe de destination introuvable.' });
  }

  // Current membership (if any) → source team + carry-over battle_tag / role.
  // A transfer moves a PLAYER, so it starts from the exclusive membership.
  const currentRows = await listMemberships<{
    id: string;
    team_id: string;
    role: string | null;
    battle_tag: string | null;
  }>(userId, tenantId, 'id, team_id, role, battle_tag');
  const current = pickExclusiveMembership(currentRows);

  const sourceTeamId = current?.team_id ?? null;
  if (sourceTeamId === targetTeamId) {
    return res
      .status(400)
      .json({ error: 'Le joueur est déjà dans cette équipe.' });
  }

  // BattleTag: explicit override > carried-over > error (the shape requires it).
  const overrideTag =
    typeof req.body?.battleTag === 'string' ? req.body.battleTag : null;
  const carriedTag = (current?.battle_tag as string | null) ?? null;
  let battleTagValue: string;
  try {
    battleTagValue = validateBattleTag(overrideTag ?? carriedTag);
  } catch {
    return res.status(400).json({
      error:
        'BattleTag requis pour le transfert (format Name#0000). Renseignez-le avant de transférer.',
    });
  }

  const role =
    typeof current?.role === 'string' && current.role.trim()
      ? (current.role as string)
      : 'player';

  // 1. Remove the current membership so the single-team constraint is freed.
  if (current?.id) {
    const { error: delErr } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', current.id)
      .eq('tenant_id', tenantId);
    if (delErr) {
      logger.error('[admin/users/actions] transfer delete error:', delErr);
      return res
        .status(500)
        .json({ error: 'Échec du retrait de l’équipe actuelle.' });
    }
    // If the user was captain of the source team, vacate that slot.
    await supabaseAdmin
      .from('teams')
      .update({ captain_id: null })
      .eq('id', sourceTeamId)
      .eq('tenant_id', tenantId)
      .eq('captain_id', userId);

    void emitRoleSyncEvent('team.member.removed', userId, tenantId, {
      extras: { teamId: sourceTeamId },
    });
  }

  // 2. Insert into the destination team (helper handles max_players + dup).
  const insertResult = await insertTeamMember({
    tenantId,
    teamId: targetTeamId,
    userId,
    role,
    battleTag: battleTagValue,
    enforceMaxPlayersPreCheck: true,
  });

  if (!insertResult.ok) {
    // Best-effort rollback: re-insert into the source team so we don't leave
    // the player team-less after a failed transfer.
    if (current?.id && sourceTeamId) {
      await insertTeamMember({
        tenantId,
        teamId: sourceTeamId,
        userId,
        role,
        battleTag: battleTagValue,
      });
    }
    return res.status(insertResult.status).json({ error: insertResult.error });
  }

  void logStaffAction({
    staff_id: ctx.staff.id,
    action: 'transfer_player_team',
    entity_type: 'user',
    entity_id: userId,
    tenant_id: tenantId,
    payload: {
      fromTeamId: sourceTeamId,
      toTeamId: targetTeamId,
      role,
      via: 'player-view',
    },
  });

  return res
    .status(200)
    .json({ success: true, info: 'Joueur transféré.', teamId: targetTeamId });
}
