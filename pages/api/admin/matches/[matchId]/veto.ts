// pages/api/admin/matches/[matchId]/veto.ts
// Map veto/ban/pick system for a match
// - GET:    Fetch current veto state
// - POST:   Record a veto step (ban/pick/decider)
// - DELETE: Reset all veto steps for the match

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  AuthenticatedStaffContext,
  hasAtLeastRole,
} from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import type { VetoStep, VetoStepInput, VetoAction } from '@/types/veto';
import { VETO_FLOWS } from '@/types/veto';
import { isValidUUID } from '@/utils/apiHelpers';
import { notifyVetoStep } from '@/utils/discord';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(handler, { permission: 'arbitrate_matches' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(matchId, res, ctx);
      case 'POST':
        return await handlePost(matchId, req, res, ctx);
      case 'PATCH':
        return await handlePatch(matchId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(matchId, res, ctx);
      default:
        res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/matches/[matchId]/veto] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * Fetch match info incl. veto_locked_at (utilisé par POST/DELETE/PATCH)
 * ---------------------------------------------------------*/

type MatchForVeto = {
  id: string;
  tournament_id: string | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  veto_locked_at: string | null;
};

async function fetchMatchForVeto(
  matchId: string,
  tenantId: string
): Promise<MatchForVeto | null> {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, match_format, team1_id, team2_id, veto_locked_at'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as MatchForVeto;
}

/* -----------------------------------------------------------
 * GET : fetch veto state for a match
 * ---------------------------------------------------------*/

async function handleGet(
  matchId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // Fetch match info
  const match = await fetchMatchForVeto(matchId, ctx.tenantId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Fetch existing veto steps
  const { data: steps, error: sErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId)
    .order('step_number', { ascending: true });

  if (sErr) {
    logger.error('GET veto steps error:', sErr);
    return res.status(500).json({ error: 'Failed to fetch veto steps' });
  }

  // Fetch team names
  const teamIds = [match.team1_id, match.team2_id].filter(Boolean);
  let teamNames: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId)
      .in('id', teamIds);
    for (const t of teams || []) {
      teamNames[t.id] = t.name;
    }
  }

  const format = match.match_format || 'bo3';
  const flow = VETO_FLOWS[format] || VETO_FLOWS['bo3'];
  const vetoSteps = (steps || []) as VetoStep[];

  const pickedMaps = vetoSteps
    .filter((s) => s.action === 'pick' || s.action === 'decider')
    .map((s) => ({
      map_name: s.map_name,
      map_type: s.map_type,
      picked_by: s.team_id,
    }));

  return res.status(200).json({
    matchId,
    format,
    team1Id: match.team1_id,
    team2Id: match.team2_id,
    team1Name: match.team1_id ? teamNames[match.team1_id] || null : null,
    team2Name: match.team2_id ? teamNames[match.team2_id] || null : null,
    flow,
    steps: vetoSteps,
    currentStepIndex: vetoSteps.length,
    isComplete: vetoSteps.length >= flow.length,
    pickedMaps,
    vetoLockedAt: match.veto_locked_at,
  });
}

/* -----------------------------------------------------------
 * POST : record a veto step
 * body: VetoStepInput
 * ---------------------------------------------------------*/

async function handlePost(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = req.body as VetoStepInput;

  if (!body || !body.map_name) {
    return res.status(400).json({ error: 'map_name is required' });
  }

  const validActions: VetoAction[] = ['ban', 'pick', 'decider'];
  if (!validActions.includes(body.action)) {
    return res
      .status(400)
      .json({ error: 'action must be ban, pick, or decider' });
  }

  // Fetch match to validate
  const match = await fetchMatchForVeto(matchId, ctx.tenantId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Verrou : impossible de modifier le veto une fois le match commence.
  // Un admin peut deverrouiller via PATCH /veto { unlock: true }.
  if (match.veto_locked_at) {
    return res.status(409).json({
      error:
        'Le veto est verrouille (match commence ou termine). Un admin peut deverrouiller via PATCH /veto { unlock: true }.',
      code: 'VETO_LOCKED',
      vetoLockedAt: match.veto_locked_at,
    });
  }

  // Get current step count
  const { count, error: cErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId);

  if (cErr) {
    return res.status(500).json({ error: 'Failed to count veto steps' });
  }

  const currentStep = (count ?? 0) + 1;
  const format = match.match_format || 'bo3';
  const flow = VETO_FLOWS[format] || VETO_FLOWS['bo3'];

  if (currentStep > flow.length) {
    return res.status(400).json({ error: 'Veto is already complete' });
  }

  // Validate that this map hasn't already been used in this veto
  const { data: existing } = await supabaseAdmin
    .from('match_map_vetos')
    .select('map_name')
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId);

  const usedMaps = new Set((existing || []).map((e: any) => e.map_name));
  if (usedMaps.has(body.map_name)) {
    return res
      .status(400)
      .json({ error: 'This map has already been used in this veto' });
  }

  const payload = {
    tenant_id: ctx.tenantId,
    match_id: matchId,
    step_number: currentStep,
    action: body.action,
    team_id: body.team_id ?? null,
    map_name: body.map_name,
    map_type: body.map_type ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('match_map_vetos')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('POST veto step error:', error);
    return res.status(500).json({ error: 'Failed to record veto step' });
  }

  // If veto is now complete, auto-create games from picked maps
  const isNowComplete = currentStep >= flow.length;
  let gamesCreated = false;

  if (isNowComplete) {
    const { data: allSteps } = await supabaseAdmin
      .from('match_map_vetos')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('match_id', matchId)
      .order('step_number', { ascending: true });

    const pickedSteps = (allSteps || []).filter(
      (s: any) => s.action === 'pick' || s.action === 'decider'
    );

    if (pickedSteps.length > 0) {
      const gamesPayload = pickedSteps.map((s: any, idx: number) => ({
        tenant_id: ctx.tenantId,
        match_id: matchId,
        map_name: s.map_name,
        map_order: idx,
        team1_score: 0,
        team2_score: 0,
        is_tiebreaker: s.action === 'decider',
        went_overtime: false,
      }));

      const { error: gErr } = await supabaseAdmin
        .from('games')
        .insert(gamesPayload);

      if (gErr) {
        logger.error('Auto-create games from veto error:', gErr);
      } else {
        gamesCreated = true;
      }
    }
  }

  // Log staff action
  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'map_veto',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id,
      payload: {
        step_number: currentStep,
        veto_action: body.action,
        map_name: body.map_name,
        team_id: body.team_id,
        is_complete: isNowComplete,
        games_created: gamesCreated,
      },
    });
  }

  // Discord notification: veto step (fire-and-forget)
  void sendVetoStepDiscord({
    tenantId: ctx.tenantId,
    matchId,
    tournamentId: match.tournament_id ?? null,
    team1Id: match.team1_id ?? null,
    team2Id: match.team2_id ?? null,
    stepNumber: currentStep,
    totalSteps: flow.length,
    action: body.action,
    mapName: body.map_name,
    byTeamId: body.team_id ?? null,
    isComplete: isNowComplete,
  }).catch((e) => logger.error('[discord] notifyVetoStep error:', e));

  return res.status(201).json({
    step: data as VetoStep,
    isComplete: isNowComplete,
    gamesCreated,
  });
}

/* -----------------------------------------------------------
 * Discord helper: build & send the veto step notification
 * ---------------------------------------------------------*/

async function sendVetoStepDiscord(params: {
  tenantId: string;
  matchId: string;
  tournamentId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  stepNumber: number;
  totalSteps: number;
  action: VetoAction;
  mapName: string;
  byTeamId: string | null;
  isComplete: boolean;
}): Promise<void> {
  const ids = [params.team1Id, params.team2Id, params.byTeamId].filter(
    (id): id is string => !!id
  );
  if (ids.length === 0) return;

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', params.tenantId)
    .in('id', ids);

  const byId = new Map<string, string>();
  for (const t of teams || []) byId.set(t.id, t.name);

  const team1Name = params.team1Id
    ? (byId.get(params.team1Id) ?? 'Équipe 1')
    : 'Équipe 1';
  const team2Name = params.team2Id
    ? (byId.get(params.team2Id) ?? 'Équipe 2')
    : 'Équipe 2';
  const byTeamName = params.byTeamId
    ? (byId.get(params.byTeamId) ?? null)
    : null;

  await notifyVetoStep({
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    team1Name,
    team2Name,
    stepNumber: params.stepNumber,
    totalSteps: params.totalSteps,
    action: params.action,
    mapName: params.mapName,
    byTeamName,
    isComplete: params.isComplete,
  });
}

/* -----------------------------------------------------------
 * DELETE : reset all veto steps for a match
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // Verrou : meme garde que POST. Le reset est aussi destructeur.
  const match = await fetchMatchForVeto(matchId, ctx.tenantId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  if (match.veto_locked_at) {
    return res.status(409).json({
      error:
        'Le veto est verrouille. Un admin peut deverrouiller via PATCH /veto { unlock: true } avant de reset.',
      code: 'VETO_LOCKED',
      vetoLockedAt: match.veto_locked_at,
    });
  }

  // Also delete auto-created games to stay in sync
  const { data: vetoSteps } = await supabaseAdmin
    .from('match_map_vetos')
    .select('map_name, action')
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId);

  const { error } = await supabaseAdmin
    .from('match_map_vetos')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId);

  if (error) {
    logger.error('DELETE veto steps error:', error);
    return res.status(500).json({ error: 'Failed to reset veto' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'map_veto',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id,
      payload: {
        reset: true,
        steps_deleted: (vetoSteps || []).length,
      },
    });
  }

  return res.status(200).json({ success: true });
}

/* -----------------------------------------------------------
 * PATCH : admin unlock du veto (cas exceptionnel)
 * body: { unlock: true }
 * ---------------------------------------------------------*/

async function handlePatch(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as { unlock?: unknown; reason?: unknown };

  if (body.unlock !== true) {
    return res
      .status(400)
      .json({ error: 'PATCH requiert { unlock: true } (admin only).' });
  }

  // Unlock = action exceptionnelle, reservee aux admins+. Manager n'a pas le
  // droit (cf. plan P0 staff escalade : actions sensibles bornees par rang).
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res
      .status(403)
      .json({ error: 'Seul un admin peut deverrouiller un veto.' });
  }

  const match = await fetchMatchForVeto(matchId, ctx.tenantId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }
  if (!match.veto_locked_at) {
    return res
      .status(200)
      .json({ success: true, vetoLockedAt: null, alreadyUnlocked: true });
  }

  const previousLockedAt = match.veto_locked_at;

  const { error } = await supabaseAdmin
    .from('matches')
    .update({ veto_locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('PATCH veto unlock error:', error);
    return res.status(500).json({ error: 'Failed to unlock veto' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'map_veto',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id,
    payload: {
      unlock: true,
      previous_locked_at: previousLockedAt,
      reason:
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 500)
          : null,
    },
  });

  return res.status(200).json({ success: true, vetoLockedAt: null });
}
