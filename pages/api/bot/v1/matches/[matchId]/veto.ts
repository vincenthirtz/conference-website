// /api/bot/v1/matches/[matchId]/veto
//
// Map veto state machine pour un match. Trois operations :
//
//  GET    : lire l'etat courant (flow attendu + steps deja joues + maps picked).
//           Public (x-api-key) — sert au bot pour afficher dans Discord ce qui
//           reste a banner/picker.
//  POST   : enregistrer un step (action: ban|pick|decider, map_name, team_id?).
//           Auth staff admin/owner.
//  DELETE : reset tous les steps (et les games auto-creees a l'issue du veto).
//           Auth staff admin/owner.
//
// La logique metier (validation step_number, ordre, generation games) est
// mirror exact du admin route /api/admin/matches/[matchId]/veto.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { uuidSchema } from '@/utils/botValidation';
import { VETO_FLOWS } from '@/types/veto';
import type { VetoStep, VetoAction } from '@/types/veto';
import { logger } from '@/utils/logger';

// Multi-méthode aux bodies divergents : POST = { actorDiscordUserId, mapName,
// action, teamId?, mapType? } avec normalisation (action.toLowerCase(), trims),
// DELETE = { actorDiscordUserId } seul. Un z.union ne discrimine pas proprement
// (pas de champ discriminant) et perdrait la normalisation casse de `action`.
// On valide donc seulement la query ici et on conserve la validation body inline
// dans handlePost/handleDelete. actorDiscordUserId reste validé par requireBotStaff.
const vetoQuerySchema = z.object({ matchId: uuidSchema });

async function handleGet(
  res: NextApiResponse,
  matchId: string,
  tenantId: string
) {
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, match_format, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr || !match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  const { data: stepsRaw, error: sErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId)
    .order('step_number', { ascending: true });
  if (sErr) {
    logger.error('[bot/veto] steps error', sErr);
    return res.status(500).json({ error: 'Erreur de lecture du veto' });
  }

  const teamIds = [match.team1_id, match.team2_id].filter(
    (id): id is string => !!id
  );
  const teamNames: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', teamIds);
    for (const t of teams ?? []) teamNames[(t as any).id] = (t as any).name;
  }

  const format = match.match_format || 'bo3';
  const flow = VETO_FLOWS[format] || VETO_FLOWS['bo3'];
  const steps = (stepsRaw ?? []) as VetoStep[];

  return res.status(200).json({
    matchId,
    format,
    team1Id: match.team1_id,
    team2Id: match.team2_id,
    team1Name: match.team1_id ? (teamNames[match.team1_id] ?? null) : null,
    team2Name: match.team2_id ? (teamNames[match.team2_id] ?? null) : null,
    flow,
    steps,
    currentStepIndex: steps.length,
    isComplete: steps.length >= flow.length,
    pickedMaps: steps
      .filter((s) => s.action === 'pick' || s.action === 'decider')
      .map((s) => ({
        mapName: s.map_name,
        mapType: s.map_type,
        pickedByTeamId: s.team_id,
      })),
  });
}

async function handlePost(
  req: BotTenantRequest,
  res: NextApiResponse,
  matchId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const mapName = typeof body.mapName === 'string' ? body.mapName.trim() : '';
  if (!mapName) {
    return res.status(400).json({ error: 'mapName requis' });
  }

  const action =
    typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const validActions: VetoAction[] = ['ban', 'pick', 'decider'];
  if (!validActions.includes(action as VetoAction)) {
    return res.status(400).json({
      error: `action invalide. Valeurs : ${validActions.join(', ')}.`,
    });
  }

  const teamId =
    typeof body.teamId === 'string' && body.teamId.trim()
      ? body.teamId.trim()
      : null;
  if (teamId && !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  const mapType =
    typeof body.mapType === 'string' && body.mapType.trim()
      ? body.mapType.trim()
      : null;

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, match_format, team1_id, team2_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr || !match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }
  if (teamId && teamId !== match.team1_id && teamId !== match.team2_id) {
    return res
      .status(400)
      .json({ error: "teamId n'appartient pas à ce match." });
  }

  const { count, error: cErr } = await supabaseAdmin
    .from('match_map_vetos')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);
  if (cErr) {
    logger.error('[bot/veto] count error', cErr);
    return res.status(500).json({ error: 'Erreur de comptage des steps' });
  }

  const currentStep = (count ?? 0) + 1;
  const format = match.match_format || 'bo3';
  const flow = VETO_FLOWS[format] || VETO_FLOWS['bo3'];
  if (currentStep > flow.length) {
    return res
      .status(400)
      .json({ error: 'Veto déjà complet.', code: 'ALREADY_COMPLETE' });
  }

  const { data: existing } = await supabaseAdmin
    .from('match_map_vetos')
    .select('map_name')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);
  if ((existing ?? []).some((e) => (e as any).map_name === mapName)) {
    return res
      .status(400)
      .json({ error: 'Cette map a déjà été utilisée dans ce veto.' });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('match_map_vetos')
    .insert({
      tenant_id: req.botContext.tenantId,
      match_id: matchId,
      step_number: currentStep,
      action,
      team_id: teamId,
      map_name: mapName,
      map_type: mapType,
    })
    .select('*')
    .maybeSingle();
  if (insErr || !inserted) {
    logger.error('[bot/veto] insert error', insErr);
    return res.status(500).json({ error: "Échec de l'enregistrement du step" });
  }

  const isComplete = currentStep >= flow.length;
  let gamesCreated = false;

  if (isComplete) {
    const { data: allSteps } = await supabaseAdmin
      .from('match_map_vetos')
      .select('*')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('match_id', matchId)
      .order('step_number', { ascending: true });
    const picked = (allSteps ?? []).filter(
      (s) => (s as any).action === 'pick' || (s as any).action === 'decider'
    );
    if (picked.length > 0) {
      const gamePayloads = picked.map((s, idx) => ({
        tenant_id: req.botContext.tenantId,
        match_id: matchId,
        map_name: (s as any).map_name,
        map_order: idx,
        team1_score: 0,
        team2_score: 0,
        is_tiebreaker: (s as any).action === 'decider',
        went_overtime: false,
      }));
      const { error: gErr } = await supabaseAdmin
        .from('games')
        .insert(gamePayloads);
      if (gErr) {
        logger.error('[bot/veto] games create error', gErr);
      } else {
        gamesCreated = true;
      }
    }
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'map_veto',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id ?? null,
    payload: {
      step_number: currentStep,
      veto_action: action,
      map_name: mapName,
      team_id: teamId,
      is_complete: isComplete,
      games_created: gamesCreated,
    },
  });

  return res.status(201).json({ step: inserted, isComplete, gamesCreated });
}

async function handleDelete(
  req: BotTenantRequest,
  res: NextApiResponse,
  matchId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const { data: stepsBefore } = await supabaseAdmin
    .from('match_map_vetos')
    .select('id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);

  const { error } = await supabaseAdmin
    .from('match_map_vetos')
    .delete()
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);
  if (error) {
    logger.error('[bot/veto] reset error', error);
    return res.status(500).json({ error: 'Échec du reset' });
  }

  // Reset games auto-creees si on est dans un cas full reset
  await supabaseAdmin
    .from('games')
    .delete()
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('tournament_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .maybeSingle();

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'map_veto',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match?.tournament_id ?? null,
    payload: { reset: true, steps_deleted: (stepsBefore ?? []).length },
  });

  return res.status(200).json({
    success: true,
    stepsDeleted: (stepsBefore ?? []).length,
  });
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof vetoQuerySchema>;

  if (req.method === 'GET')
    return handleGet(res, matchId, req.botContext.tenantId);
  if (req.method === 'POST') return handlePost(req, res, matchId);
  if (req.method === 'DELETE') return handleDelete(req, res, matchId);

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST', 'DELETE'],
  rateLimit: {
    max: 30,
    key: 'bot-match-veto',
    // Mutation staff (POST/DELETE via requireBotStaff, actorDiscordUserId dans
    // le body) : aligné sur resolve-dispute/reset. N'affecte pas le GET (pas
    // d'actorDiscordUserId fourni en lecture).
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
  querySchema: vetoQuerySchema,
});
