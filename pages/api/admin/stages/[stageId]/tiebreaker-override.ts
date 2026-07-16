// pages/api/admin/stages/[stageId]/tiebreaker-override.ts
//
// CRUD des overrides de tie-break d'un stage. Chaque override = "winner
// passe devant loser au cas de score égal dans le classement final".
//
// - GET    : liste les overrides du stage
// - POST   : { winnerTeamId, loserTeamId, reason? } → ajoute un override
// - DELETE : { id } → retire un override
//
// Appliqué automatiquement par computeStageStandings (post-sort swap).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { invalidateStandingsCache } from '@/utils/stages/standingsCache';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-tiebreaker-override' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }
  const stageIdStr = String(stageId);

  // Vérifier que le stage existe + récupérer tournament_id pour les logs.
  const { data: stage } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageIdStr)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!stage) {
    return res.status(404).json({ error: 'Stage introuvable.' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, stageIdStr, ctx);
    case 'POST':
      return handlePost(req, res, stageIdStr, stage.tournament_id, ctx);
    case 'DELETE':
      return handleDelete(req, res, stageIdStr, stage.tournament_id, ctx);
    default:
      res.setHeader('Allow', 'GET,POST,DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  res: NextApiResponse,
  stageId: string,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin!
    .from('stage_tiebreaker_overrides')
    .select(
      `id, winner_team_id, loser_team_id, reason, set_by_staff_id, set_at,
       winner:teams!stage_tiebreaker_overrides_winner_team_id_fkey(id, name),
       loser:teams!stage_tiebreaker_overrides_loser_team_id_fkey(id, name)`
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .order('set_at', { ascending: false });
  if (error) {
    logger.error('[tiebreaker-override] list error', error);
    return res
      .status(500)
      .json({ error: 'Erreur lors du chargement des overrides.' });
  }
  return res.status(200).json({ overrides: data ?? [] });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  stageId: string,
  tournamentId: string | null,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as {
    winnerTeamId?: unknown;
    loserTeamId?: unknown;
    reason?: unknown;
  };
  const winnerTeamId =
    typeof body.winnerTeamId === 'string' ? body.winnerTeamId : '';
  const loserTeamId =
    typeof body.loserTeamId === 'string' ? body.loserTeamId : '';

  if (!isValidUUID(winnerTeamId) || !isValidUUID(loserTeamId)) {
    return res
      .status(400)
      .json({ error: 'winnerTeamId et loserTeamId UUID requis.' });
  }
  if (winnerTeamId === loserTeamId) {
    return res
      .status(400)
      .json({ error: 'winner et loser doivent être différents.' });
  }

  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;

  // Vérifier que les 2 teams existent et sont inscrites au stage.
  const { data: stageTeams } = await supabaseAdmin!
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .in('team_id', [winnerTeamId, loserTeamId]);
  const foundIds = new Set(
    (stageTeams ?? []).map((r: { team_id: string }) => r.team_id)
  );
  if (!foundIds.has(winnerTeamId) || !foundIds.has(loserTeamId)) {
    return res.status(400).json({
      error: 'Les deux équipes doivent être inscrites au stage.',
    });
  }

  const { data, error } = await supabaseAdmin!
    .from('stage_tiebreaker_overrides')
    .insert({
      tenant_id: ctx.tenantId,
      stage_id: stageId,
      winner_team_id: winnerTeamId,
      loser_team_id: loserTeamId,
      reason,
      set_by_staff_id: ctx.staff.id,
    })
    .select('*')
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'Cet override existe déjà.',
        code: 'OVERRIDE_EXISTS',
      });
    }
    logger.error('[tiebreaker-override] insert error', error);
    return res
      .status(500)
      .json({ error: "Échec de l'insertion de l'override." });
  }

  // Invalide le cache standings pour que la prochaine lecture applique
  // l'override immédiatement.
  invalidateStandingsCache(stageId);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'stage',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload: {
      subject: 'tiebreaker_override_set',
      winner_team_id: winnerTeamId,
      loser_team_id: loserTeamId,
      reason,
    },
  });

  return res.status(201).json({ override: data });
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  stageId: string,
  tournamentId: string | null,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as { id?: unknown };
  const overrideId =
    typeof body.id === 'number' && Number.isInteger(body.id) ? body.id : null;
  if (!overrideId || overrideId <= 0) {
    return res.status(400).json({ error: 'id (integer) requis.' });
  }

  const { data: before } = await supabaseAdmin!
    .from('stage_tiebreaker_overrides')
    .select('id, winner_team_id, loser_team_id')
    .eq('id', overrideId)
    .eq('stage_id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!before) {
    return res.status(404).json({ error: 'Override introuvable.' });
  }

  const { error } = await supabaseAdmin!
    .from('stage_tiebreaker_overrides')
    .delete()
    .eq('id', overrideId)
    .eq('stage_id', stageId)
    .eq('tenant_id', ctx.tenantId);
  if (error) {
    logger.error('[tiebreaker-override] delete error', error);
    return res
      .status(500)
      .json({ error: "Échec de la suppression de l'override." });
  }

  invalidateStandingsCache(stageId);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'stage',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload: {
      subject: 'tiebreaker_override_removed',
      override_id: overrideId,
      winner_team_id: before.winner_team_id,
      loser_team_id: before.loser_team_id,
    },
  });

  return res.status(200).json({ success: true });
}
