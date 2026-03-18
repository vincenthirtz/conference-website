// pages/api/admin/matches/[matchId]/veto.ts
// Map veto/ban/pick system for a match
// - GET:    Fetch current veto state
// - POST:   Record a veto step (ban/pick/decider)
// - DELETE: Reset all veto steps for the match

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import type { VetoStep, VetoStepInput, VetoAction } from '@/types/veto';
import { VETO_FLOWS } from '@/types/veto';

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(matchId, res);
      case 'POST':
        return await handlePost(matchId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(matchId, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    console.error('[/api/admin/matches/[matchId]/veto] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : fetch veto state for a match
 * ---------------------------------------------------------*/

async function handleGet(matchId: string, res: NextApiResponse) {
  // Fetch match info
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, match_format, team1_id, team2_id')
    .eq('id', matchId)
    .maybeSingle();

  if (mErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Fetch existing veto steps
  const { data: steps, error: sErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('*')
    .eq('match_id', matchId)
    .order('step_number', { ascending: true });

  if (sErr) {
    console.error('GET veto steps error:', sErr);
    return res.status(500).json({ error: 'Failed to fetch veto steps' });
  }

  // Fetch team names
  const teamIds = [match.team1_id, match.team2_id].filter(Boolean);
  let teamNames: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name')
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
    team1Name: match.team1_id ? (teamNames[match.team1_id] || null) : null,
    team2Name: match.team2_id ? (teamNames[match.team2_id] || null) : null,
    flow,
    steps: vetoSteps,
    currentStepIndex: vetoSteps.length,
    isComplete: vetoSteps.length >= flow.length,
    pickedMaps,
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
  ctx: any
) {
  const body = req.body as VetoStepInput;

  if (!body || !body.map_name) {
    return res.status(400).json({ error: 'map_name is required' });
  }

  const validActions: VetoAction[] = ['ban', 'pick', 'decider'];
  if (!validActions.includes(body.action)) {
    return res.status(400).json({ error: 'action must be ban, pick, or decider' });
  }

  // Fetch match to validate
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, match_format, team1_id, team2_id')
    .eq('id', matchId)
    .maybeSingle();

  if (mErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Get current step count
  const { count, error: cErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('id', { count: 'exact', head: true })
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
    .eq('match_id', matchId);

  const usedMaps = new Set((existing || []).map((e: any) => e.map_name));
  if (usedMaps.has(body.map_name)) {
    return res.status(400).json({ error: 'This map has already been used in this veto' });
  }

  const payload = {
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
    console.error('POST veto step error:', error);
    return res.status(500).json({ error: 'Failed to record veto step' });
  }

  // If veto is now complete, auto-create games from picked maps
  const isNowComplete = currentStep >= flow.length;
  let gamesCreated = false;

  if (isNowComplete) {
    const { data: allSteps } = await supabaseAdmin
      .from('match_map_vetos')
      .select('*')
      .eq('match_id', matchId)
      .order('step_number', { ascending: true });

    const pickedSteps = (allSteps || []).filter(
      (s: any) => s.action === 'pick' || s.action === 'decider'
    );

    if (pickedSteps.length > 0) {
      const gamesPayload = pickedSteps.map((s: any, idx: number) => ({
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
        console.error('Auto-create games from veto error:', gErr);
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

  return res.status(201).json({
    step: data as VetoStep,
    isComplete: isNowComplete,
    gamesCreated,
  });
}

/* -----------------------------------------------------------
 * DELETE : reset all veto steps for a match
 * ---------------------------------------------------------*/

async function handleDelete(matchId: string, res: NextApiResponse, ctx: any) {
  // Also delete auto-created games to stay in sync
  const { data: vetoSteps } = await supabaseAdmin
    .from('match_map_vetos')
    .select('map_name, action')
    .eq('match_id', matchId);

  const { error } = await supabaseAdmin
    .from('match_map_vetos')
    .delete()
    .eq('match_id', matchId);

  if (error) {
    console.error('DELETE veto steps error:', error);
    return res.status(500).json({ error: 'Failed to reset veto' });
  }

  // Fetch match tournament_id for logging
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('tournament_id')
    .eq('id', matchId)
    .maybeSingle();

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'map_veto',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match?.tournament_id ?? null,
      payload: {
        reset: true,
        steps_deleted: (vetoSteps || []).length,
      },
    });
  }

  return res.status(200).json({ success: true });
}
