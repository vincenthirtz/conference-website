// POST /api/bot/v1/tournaments/[tournamentId]/teams
//
// Registers an existing team in a tournament (inserts into stage_teams).
//
// Deux modes d'acteur :
//  - staff (admin/owner) : inscrit n'importe quelle equipe (commande
//    /inscrire-equipe).
//  - capitaine : auto-inscription de sa propre equipe (commande
//    /inscrire-mon-equipe). Le teamId fourni doit correspondre a une equipe
//    dont l'acteur est captain_id.
//
// Mirrors the validation of the human-staff route
// (/api/admin/teams/[teamId]/tournaments): tournament must be 'published',
// max_teams not exceeded, team has enough members, no double registration.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import {
  logBotStaffAction,
  resolveActorPlayer,
  resolveActorStaff,
} from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const STAFF_PRIVILEGED = new Set(['admin', 'owner']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  if (!DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }

  const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
  if (!isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  // Resolve actor : staff (admin/owner) OR captain of the target team.
  // Captain self-registration (/inscrire-mon-equipe) limits the action to
  // their own team; staff (/inscrire-equipe) can register any team.
  const staffActor = await resolveActorStaff(actorDiscordUserId);
  const isStaff =
    !!staffActor.role && STAFF_PRIVILEGED.has(staffActor.role);

  let isCaptain = false;
  let captainAuthUserId: string | null = null;
  if (!isStaff) {
    const playerActor = await resolveActorPlayer(actorDiscordUserId);
    if (playerActor) {
      const { data: teamCaptainRow } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .maybeSingle();
      if (teamCaptainRow?.captain_id === playerActor.authUserId) {
        isCaptain = true;
        captainAuthUserId = playerActor.authUserId;
      }
    }
  }

  if (!isStaff && !isCaptain) {
    return res.status(403).json({
      error:
        "Action réservée aux admins/owners ou au capitaine de l'équipe ciblée.",
    });
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
      error:
        'Le tournoi doit être en status "published" pour accueillir une équipe.',
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
      return res
        .status(404)
        .json({ error: 'Phase introuvable pour ce tournoi' });
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

  // Audit log : only when a staff is the actor. Captain self-registration is
  // already covered by the stage_teams row + logger.info below.
  if (isStaff && staffActor.staffId) {
    await logBotStaffAction({
      staffId: staffActor.staffId,
      action: 'update_team',
      entity_type: 'team',
      entity_id: teamId,
      tournament_id: tournamentId,
      payload: {
        action_type: 'tournament_registration',
        team_name: team.name,
        tournament_name: tournament.name,
        stage_ids: targetStageIds,
      },
    });
  } else if (isCaptain) {
    logger.info('[bot/tournaments/teams] captain self-registration', {
      teamId,
      tournamentId,
      captainAuthUserId,
      actorDiscordUserId,
    });
  }

  return res.status(201).json({
    success: true,
    teamId,
    tournamentId,
    stageIds: targetStageIds,
    registrations: inserted,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-tournament-teams' },
  idempotent: true,
});
