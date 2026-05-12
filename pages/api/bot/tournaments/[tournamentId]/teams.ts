// POST /api/bot/tournaments/[tournamentId]/teams
//
// Registers an existing team in a tournament (inserts into stage_teams).
// Admin-only: actorDiscordUserId must map (via user_discord_links → staff)
// to a staff row with role 'admin' or 'owner'.
//
// Mirrors the validation of the human-staff route
// (/api/admin/teams/[teamId]/tournaments): tournament must be 'published',
// max_teams not exceeded, team has enough members, no double registration.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function resolveActorStaff(
  discordUserId: string
): Promise<{ staffId: string | null; role: string | null }> {
  if (!supabaseAdmin) return { staffId: null, role: null };
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (!link) return { staffId: null, role: null };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', link.auth_user_id)
    .maybeSingle();
  return { staffId: staff?.id ?? null, role: staff?.role ?? null };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'bot-tournament-teams'
    )
  )
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/tournaments/teams] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const { tournamentId } = req.query;
  if (
    !tournamentId ||
    Array.isArray(tournamentId) ||
    !isValidUUID(tournamentId)
  ) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!/^[0-9]{15,25}$/.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }
  const actor = await resolveActorStaff(actorDiscordUserId);
  if (!actor.role || (actor.role !== 'admin' && actor.role !== 'owner')) {
    return res.status(403).json({
      error:
        "Action réservée aux admins/owners. Ton compte Discord n'est pas lié à un staff de ce niveau.",
    });
  }

  const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
  if (!isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }
  const stageId =
    typeof body.stageId === 'string' && body.stageId.trim()
      ? body.stageId.trim()
      : null;
  if (stageId && !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'stageId invalide' });
  }

  // Tournament + status + max_teams
  const { data: tournament, error: tourErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, status, max_teams, min_players')
    .eq('id', tournamentId)
    .single();
  if (tourErr || !tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  if (tournament.status !== 'published') {
    return res.status(400).json({
      error: 'Le tournoi doit être en status "published" pour accueillir une équipe.',
    });
  }

  // Team exists
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr || !team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }

  // min_players
  if (tournament.min_players) {
    const { count: playerCount, error: countErr } = await supabaseAdmin
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);
    if (countErr) {
      logger.error('[bot/tournaments/teams] count members error', countErr);
      return res.status(500).json({ error: 'Erreur de vérification effectif' });
    }
    if ((playerCount || 0) < tournament.min_players) {
      return res.status(400).json({
        error: `L'équipe doit avoir au moins ${tournament.min_players} joueur(s) (actuellement ${playerCount || 0}).`,
      });
    }
  }

  // max_teams
  if (tournament.max_teams) {
    const { data: existingTeams, error: maxErr } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id, tournament_stages!inner(tournament_id)')
      .eq('tournament_stages.tournament_id', tournamentId);
    if (maxErr) {
      logger.error('[bot/tournaments/teams] max_teams check error', maxErr);
      return res
        .status(500)
        .json({ error: 'Erreur de vérification du nombre d’équipes' });
    }
    const uniqueTeams = new Set((existingTeams ?? []).map((t) => t.team_id));
    if (uniqueTeams.size >= tournament.max_teams) {
      return res.status(400).json({
        error: `Le tournoi a atteint sa limite de ${tournament.max_teams} équipes.`,
      });
    }
  }

  // Resolve target stages
  let targetStageIds: string[] = [];
  if (stageId) {
    const { data: stage, error: stErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('id', stageId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (stErr || !stage) {
      return res.status(404).json({ error: 'Phase introuvable pour ce tournoi' });
    }
    targetStageIds = [stageId];
  } else {
    const { data: stages, error: stagesErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id')
      .eq('tournament_id', tournamentId);
    if (stagesErr) {
      logger.error('[bot/tournaments/teams] stages list error', stagesErr);
      return res.status(500).json({ error: 'Erreur de chargement des phases' });
    }
    if (!stages || stages.length === 0) {
      return res.status(400).json({
        error: 'Le tournoi n’a aucune phase. Créez une phase d’abord.',
      });
    }
    targetStageIds = stages.map((s) => s.id);
  }

  // Already-registered check
  const { data: existingRegs, error: existsErr } = await supabaseAdmin
    .from('stage_teams')
    .select('stage_id')
    .eq('team_id', teamId)
    .in('stage_id', targetStageIds);
  if (existsErr) {
    logger.error('[bot/tournaments/teams] existing reg check error', existsErr);
    return res.status(500).json({ error: 'Erreur de vérification' });
  }
  if (existingRegs && existingRegs.length > 0) {
    return res.status(409).json({
      error: 'Équipe déjà inscrite à ce tournoi.',
    });
  }

  // Insert
  const insertRows = targetStageIds.map((stgId) => ({
    stage_id: stgId,
    team_id: teamId,
  }));
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('stage_teams')
    .insert(insertRows)
    .select();
  if (insertErr) {
    logger.error('[bot/tournaments/teams] insert error', insertErr);
    return res.status(500).json({ error: 'Échec de l’inscription' });
  }

  if (actor.staffId) {
    try {
      await logStaffAction({
        staff_id: actor.staffId,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_registration',
          team_name: team.name,
          tournament_name: tournament.name,
          stage_ids: targetStageIds,
          via: 'discord_bot',
        },
      });
    } catch (e) {
      logger.error('[bot/tournaments/teams] log error', e);
    }
  }

  return res.status(201).json({
    success: true,
    teamId,
    tournamentId,
    stageIds: targetStageIds,
    registrations: inserted,
  });
}
