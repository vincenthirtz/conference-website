// pages/api/admin/tournament/[id]/teams/[teamId].ts
// Admin: gestion d'une équipe spécifique dans un tournoi
// - GET    : récupérer une inscription
// - PATCH  : modifier le seed ou le statut
// - DELETE : retirer l'équipe du tournoi

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../../utils/logger';
type ApiResponse = { success: boolean } | { team: any } | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id, teamId } = req.query;

  if (
    !id ||
    Array.isArray(id) ||
    !teamId ||
    Array.isArray(teamId) ||
    !isValidUUID(id) ||
    !isValidUUID(teamId)
  ) {
    return res.status(400).json({ error: 'Invalid tournament or team ID' });
  }

  const tournamentId = String(id);
  const tournamentTeamId = String(teamId);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentTeamId, res, ctx);
      case 'PATCH':
        return await handlePatch(tournamentTeamId, tournamentId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(tournamentTeamId, tournamentId, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error(
      '[/api/admin/tournament/[id]/teams/[teamId]] internal error:',
      err
    );
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

async function handleGet(
  tournamentTeamId: string,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      team:teams (
        id,
        name,
        logo_url,
        is_active
      )
    `
    )
    .eq('id', tournamentTeamId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: 'Tournament team entry not found' });
  }

  return res.status(200).json({ team: data });
}

async function handlePatch(
  tournamentTeamId: string,
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { seed, status } = req.body || {};

  // Récupérer l'état actuel
  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('tournament_teams')
    .select('*, team:teams(name)')
    .eq('id', tournamentTeamId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Tournament team entry not found' });
  }

  const updatePayload: Record<string, any> = {};
  if (seed !== undefined) updatePayload.seed = seed;
  if (status !== undefined) updatePayload.status = status;

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .update(updatePayload)
    .eq('id', tournamentTeamId)
    .eq('tenant_id', ctx.tenantId)
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      team:teams (
        id,
        name,
        logo_url,
        is_active
      )
    `
    )
    .single();

  if (error || !data) {
    logger.error('admin PATCH tournament team error:', error);
    return res.status(500).json({ error: 'Failed to update tournament team' });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'manage_team',
        entity_type: 'tournament_team',
        entity_id: tournamentTeamId,
        tournament_id: tournamentId,
        payload: {
          before: { seed: before.seed, status: before.status },
          after: updatePayload,
          team_name: before.team?.name,
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  return res.status(200).json({ team: data });
}

async function handleDelete(
  tournamentTeamId: string,
  tournamentId: string,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  // Récupérer l'équipe avant suppression pour le log
  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('tournament_teams')
    .select('*, team:teams(name)')
    .eq('id', tournamentTeamId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Tournament team entry not found' });
  }

  const { error } = await supabaseAdmin
    .from('tournament_teams')
    .delete()
    .eq('id', tournamentTeamId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('admin DELETE tournament team error:', error);
    return res
      .status(500)
      .json({ error: 'Failed to remove team from tournament' });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'manage_team',
        entity_type: 'tournament_team',
        entity_id: tournamentTeamId,
        tournament_id: tournamentId,
        payload: {
          team_id: before.team_id,
          team_name: before.team?.name,
          seed: before.seed,
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  return res.status(200).json({ success: true });
}
