// pages/api/admin/stages/[stageId]/generate-swiss-round.ts
// Génère automatiquement la prochaine ronde Swiss pour une phase donnée.
//
// POST : crée les matchs du prochain round pour le stage "swiss"
// - calcule les standings actuels
// - génère les pairings Swiss (en évitant les rematches autant que possible)
// - insère les nouveaux matchs dans `matches`
// - crée un match BYE terminé si nécessaire
//
// Body (optionnel) :
// {
//   "roundNumber": 3,                       // sinon = max(round_number existant) + 1
//   "scoreConfig": { "win": 3, "draw": 1 }, // override partiel du système de points
//   "allowRematchesFallback": true          // autoriser rematches si aucune solution parfaite
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

import { generateSwissPairings } from '@/utils/swiss/pairing';

import { computeSwissStandings } from '@/utils/swiss/standings';

import {
  defaultSwissScoreConfig,
  resultsToPastMatches,
} from '@/utils/swiss/utils';
import type {
  SwissMatchResult,
  SwissParticipant as PairingParticipant,
  SwissScoreConfig,
  SwissStandingParticipant,
} from '@/types/swiss';
import type { MatchStatus } from '@/types/admin';
import { isValidUUID } from '@/utils/apiHelpers';

type StageRow = {
  id: string;
  tournament_id: string;
  stage_type: string | null;
  name: string;
  settings: any | null;
};

type StageTeamRow = {
  stage_id: string;
  team_id: string;
  seed: number | null;
};

type DbMatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type GenerateSwissRoundBody = {
  roundNumber?: number;
  scoreConfig?: Partial<SwissScoreConfig>;
  allowRematchesFallback?: boolean;
  dryRun?: boolean;
};

type GeneratedSwissMatch = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  is_bye: boolean;
  round_number: number;
  status: MatchStatus;
};

type DryRunPairing = {
  team1_id: string;
  team1_name: string | null;
  team2_id: string | null;
  team2_name: string | null;
  is_bye: boolean;
  team1_score: number;
  team2_score: number;
};

type EliminatedTeam = {
  teamId: string;
  reason: 'win_threshold' | 'loss_threshold';
  wins: number;
  losses: number;
};

type GenerateSwissRoundResponse = {
  stageId: string;
  tournamentId: string;
  roundNumber: number;
  hasRematches: boolean;
  dryRun?: boolean;
  preview?: DryRunPairing[];
  createdMatches?: GeneratedSwissMatch[];
  byeMatchId?: string | null;
  eliminatedTeams?: EliminatedTeam[];
  stageCompleted?: boolean;
};

// Rôle minimum : manager
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GenerateSwissRoundResponse | { error: string; detail?: string }
  >,
  ctx: any
) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = String(stageId);

  try {
    const body = (req.body || {}) as GenerateSwissRoundBody;

    // 1) Vérifier le stage
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id, stage_type, name, settings')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stage) {
      return res.status(404).json({
        error: 'Stage not found',
      });
    }

    const typedStage = stage as StageRow;

    if (typedStage.stage_type !== 'swiss') {
      return res.status(400).json({
        error:
          "Stage is not of type 'swiss'. This endpoint only works for swiss stages.",
      });
    }

    const tournamentId = typedStage.tournament_id;

    // 2) Récupérer les participants du stage
    const { data: stageTeams, error: teamErr } = await supabaseAdmin
      .from('stage_teams')
      .select('stage_id, team_id, seed')
      .eq('stage_id', id);

    if (teamErr) {
      console.error('generate-swiss-round stage_teams error:', teamErr);
      return res.status(500).json({
        error: 'Failed to fetch stage participants',
      });
    }

    const participantsRows = (stageTeams || []) as StageTeamRow[];

    if (participantsRows.length === 0) {
      return res.status(400).json({
        error: 'No participants found for this stage',
      });
    }

    // 3) Récupérer les matchs existants du stage (toutes rondes)
    const { data: matchesData, error: matchesErr } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        tournament_id,
        stage_id,
        status,
        is_bye,
        round_number,
        team1_id,
        team2_id,
        winner_team_id,
        team1_score,
        team2_score
      `
      )
      .eq('stage_id', id)
      .neq('status', 'cancelled');

    if (matchesErr) {
      console.error('generate-swiss-round matches error:', matchesErr);
      return res.status(500).json({
        error: 'Failed to fetch stage matches',
      });
    }

    const allMatches = (matchesData || []) as DbMatchRow[];

    // Round ciblé
    const maxExistingRound = allMatches.reduce(
      (acc, m) => Math.max(acc, m.round_number ?? 0),
      0
    );
    const nextRound =
      typeof body.roundNumber === 'number'
        ? body.roundNumber
        : maxExistingRound + 1;

    if (nextRound <= maxExistingRound) {
      return res.status(400).json({
        error: 'roundNumber must be greater than existing rounds',
      });
    }

    // Enforce total_rounds limit from settings
    const totalRounds = typedStage.settings?.total_rounds;
    if (typeof totalRounds === 'number' && totalRounds > 0 && nextRound > totalRounds) {
      return res.status(400).json({
        error: `Impossible de generer le round ${nextRound} : le nombre maximum de rounds est ${totalRounds}. Modifiez les settings du stage pour augmenter total_rounds.`,
      });
    }

    // Check that all matches in the current round are finished before generating the next
    if (maxExistingRound > 0) {
      const currentRoundMatches = allMatches.filter(
        (m) => m.round_number === maxExistingRound
      );
      const unfinished = currentRoundMatches.filter(
        (m) => m.status !== 'finished'
      );
      if (unfinished.length > 0) {
        return res.status(400).json({
          error: `${unfinished.length} match(s) du round ${maxExistingRound} ne sont pas termines. Terminez-les avant de generer le round suivant.`,
        });
      }
    }

    // 4) Construire les résultats Swiss à partir des matchs terminés
    const mergedScoreConfig: SwissScoreConfig = {
      ...defaultSwissScoreConfig,
      ...(body.scoreConfig || {}),
    };

    const pastMatches = allMatches.filter(
      (m) =>
        (m.round_number ?? 0) > 0 &&
        (m.round_number ?? 0) < nextRound &&
        m.status === 'finished'
    );

    const swissResults = buildSwissResultsFromMatches(
      pastMatches,
      mergedScoreConfig
    );

    // 5) Construire la liste des participants pour standings
    const swissParticipantsForStandings: SwissStandingParticipant[] =
      participantsRows.map((p, idx) => ({
        id: p.team_id,
        name: undefined,
        seed: typeof p.seed === 'number' ? p.seed : idx + 1,
      }));

    // 6) Calculer les standings Swiss (score total par équipe)
    const standings = computeSwissStandings({
      participants: swissParticipantsForStandings,
      results: swissResults,
    });

    // Map id -> score / seed / hadBye
    const scoreByTeam = new Map<string, number>();
    const hadByeSet = new Set<string>();

    for (const s of standings) {
      scoreByTeam.set(s.id, s.score);
      if (s.hadBye) {
        hadByeSet.add(s.id);
      }
    }

    // Ajout : hadBye à partir de matchs BYE existants (sécurité)
    for (const m of allMatches) {
      if (m.is_bye && m.team1_id && m.status === 'finished') {
        hadByeSet.add(m.team1_id);
      }
    }

    // 6b) Élimination par seuils win/loss
    const winThreshold: number | null =
      typeof typedStage.settings?.win_threshold === 'number'
        ? typedStage.settings.win_threshold
        : null;
    const lossThreshold: number | null =
      typeof typedStage.settings?.loss_threshold === 'number'
        ? typedStage.settings.loss_threshold
        : null;

    // Calculer les W/L par équipe à partir des matchs terminés
    const winsMap = new Map<string, number>();
    const lossesMap = new Map<string, number>();
    for (const m of pastMatches) {
      if (!m.team1_id) continue;
      if (m.is_bye) {
        winsMap.set(m.team1_id, (winsMap.get(m.team1_id) ?? 0) + 1);
        continue;
      }
      if (!m.team2_id) continue;
      if (m.winner_team_id === m.team1_id) {
        winsMap.set(m.team1_id, (winsMap.get(m.team1_id) ?? 0) + 1);
        lossesMap.set(m.team2_id, (lossesMap.get(m.team2_id) ?? 0) + 1);
      } else if (m.winner_team_id === m.team2_id) {
        winsMap.set(m.team2_id, (winsMap.get(m.team2_id) ?? 0) + 1);
        lossesMap.set(m.team1_id, (lossesMap.get(m.team1_id) ?? 0) + 1);
      }
    }

    const eliminatedTeams: EliminatedTeam[] = [];
    const eliminatedIds = new Set<string>();

    for (const p of participantsRows) {
      const tid = p.team_id;
      const wins = winsMap.get(tid) ?? 0;
      const losses = lossesMap.get(tid) ?? 0;

      if (winThreshold !== null && wins >= winThreshold) {
        eliminatedTeams.push({ teamId: tid, reason: 'win_threshold', wins, losses });
        eliminatedIds.add(tid);
      } else if (lossThreshold !== null && losses >= lossThreshold) {
        eliminatedTeams.push({ teamId: tid, reason: 'loss_threshold', wins, losses });
        eliminatedIds.add(tid);
      }
    }

    // Filtrer les participants actifs (non éliminés)
    const activeParticipants = participantsRows.filter(
      (p) => !eliminatedIds.has(p.team_id)
    );

    // Vérifier si le stage est terminé (tous éliminés ou ≤ 1 restant)
    if (activeParticipants.length <= 1) {
      // Marquer le stage comme completed si possible
      await supabaseAdmin
        .from('tournament_stages')
        .update({ is_active: false })
        .eq('id', id);

      return res.status(200).json({
        stageId: id,
        tournamentId,
        roundNumber: nextRound,
        hasRematches: false,
        eliminatedTeams,
        stageCompleted: true,
      });
    }

    // 7) Construire la liste des participants pour le pairing (actifs uniquement)
    const swissParticipantsForPairing: PairingParticipant[] =
      activeParticipants.map((p, idx) => {
        const id = p.team_id;
        const seed = typeof p.seed === 'number' ? p.seed : idx + 1;
        const score = scoreByTeam.get(id) ?? 0;

        return {
          id,
          score,
          seed,
          hadBye: hadByeSet.has(id),
        };
      });

    // 8) Construire la liste des rencontres passées pour éviter rematches
    const swissPastMatches = resultsToPastMatches(swissResults);

    // 9) Générer les pairings Swiss
    const { pairings, hasRematches } = generateSwissPairings({
      participants: swissParticipantsForPairing,
      pastMatches: swissPastMatches,
      allowRematchesFallback: body.allowRematchesFallback ?? true,
    });

    if (pairings.length === 0) {
      return res.status(400).json({
        error: 'Swiss pairing produced no matches',
      });
    }

    // 9b) Dry run: return preview without inserting
    if (body.dryRun) {
      // Fetch team names for preview
      const teamIds = participantsRows.map((p) => p.team_id);
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name, short_name')
        .in('id', teamIds);

      const teamNameMap = new Map<string, string | null>();
      for (const t of teamsData || []) {
        teamNameMap.set(t.id, t.name ?? t.short_name ?? null);
      }

      const preview: DryRunPairing[] = pairings.map((p) => ({
        team1_id: p.player1Id,
        team1_name: teamNameMap.get(p.player1Id) ?? null,
        team2_id: p.player2Id ?? null,
        team2_name: p.player2Id ? (teamNameMap.get(p.player2Id) ?? null) : null,
        is_bye: p.isBye,
        team1_score: p.isBye ? (mergedScoreConfig.bye ?? 1) : 0,
        team2_score: 0,
      }));

      return res.status(200).json({
        stageId: id,
        tournamentId,
        roundNumber: nextRound,
        hasRematches,
        dryRun: true,
        preview,
        ...(eliminatedTeams.length > 0 ? { eliminatedTeams } : {}),
      });
    }

    // 10) Insérer les matchs du nouveau round
    const nowIso = new Date().toISOString();
    const matchInserts = pairings.map((p) => {
      if (p.isBye) {
        // Match BYE : terminé immédiatement
        return {
          tournament_id: tournamentId,
          stage_id: id,
          status: 'finished' as MatchStatus,
          is_bye: true,
          match_format: typedStage.settings?.match_format ?? 'bo3',
          round_name: `Round ${nextRound}`,
          round_number: nextRound,
          bracket_side: 'none',
          group_key: null,
          team1_id: p.player1Id,
          team2_id: null,
          team1_score: mergedScoreConfig.bye ?? 1,
          team2_score: 0,
          winner_team_id: p.player1Id,
          scheduled_at: null,
          completed_at: nowIso,
          stream_url: null,
          lobby_code: null,
          notes: null,
          next_match_win_id: null,
          next_match_win_slot: null,
          next_match_lose_id: null,
          next_match_lose_slot: null,
          created_at: nowIso,
          updated_at: null,
        };
      }

      // Match normal, à jouer
      return {
        tournament_id: tournamentId,
        stage_id: id,
        status: 'pending' as MatchStatus,
        is_bye: false,
        match_format: typedStage.settings?.match_format ?? 'bo3',
        round_name: `Round ${nextRound}`,
        round_number: nextRound,
        bracket_side: 'none',
        group_key: null,
        team1_id: p.player1Id,
        team2_id: p.player2Id,
        team1_score: null,
        team2_score: null,
        winner_team_id: null,
        scheduled_at: null,
        completed_at: null,
        stream_url: null,
        lobby_code: null,
        notes: null,
        next_match_win_id: null,
        next_match_win_slot: null,
        next_match_lose_id: null,
        next_match_lose_slot: null,
        created_at: nowIso,
        updated_at: null,
      };
    });

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('matches')
      .insert(matchInserts)
      .select('id, team1_id, team2_id, is_bye, round_number, status');

    if (insertErr || !inserted) {
      console.error('generate-swiss-round insert matches error:', insertErr);
      return res.status(500).json({
        error: 'Failed to insert swiss matches',
      });
    }

    const createdMatches = inserted as GeneratedSwissMatch[];

    const byeMatch = createdMatches.find((m) => m.is_bye) ?? null;

    // 11) Log staff
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_swiss_round',
          entity_type: 'stage',
          entity_id: id,
          tournament_id: tournamentId,
          payload: {
            stage_id: id,
            round_number: nextRound,
            created_match_ids: createdMatches.map((m) => m.id),
            has_rematches: hasRematches,
          },
        });
      } catch (e) {
        console.error('generate-swiss-round logStaffAction error:', e);
      }
    }

    const response: GenerateSwissRoundResponse = {
      stageId: id,
      tournamentId,
      roundNumber: nextRound,
      hasRematches,
      createdMatches,
      byeMatchId: byeMatch?.id ?? null,
      ...(eliminatedTeams.length > 0 ? { eliminatedTeams } : {}),
    };

    return res.status(200).json(response);
  } catch (err: unknown) {
    console.error(
      '[/api/admin/stages/[stageId]/generate-swiss-round] error:',
      err
    );
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

/**
 * Convertit les matchs DB terminés en SwissMatchResult[]
 * en utilisant une config de points custom.
 */
function buildSwissResultsFromMatches(
  matches: DbMatchRow[],
  config: SwissScoreConfig
): SwissMatchResult[] {
  const results: SwissMatchResult[] = [];

  for (const m of matches) {
    if (m.status !== 'finished') continue;
    if (!m.team1_id) continue;

    const round = m.round_number ?? 0;

    // BYE
    if (m.is_bye || (!m.team2_id && m.team1_id)) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: null,
        player1Score: config.bye,
        player2Score: 0,
      });
      continue;
    }

    if (!m.team2_id) continue;

    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;

    // Victoire team1 / team2 / nul
    if (m.winner_team_id === m.team1_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.win,
        player2Score: config.loss,
      });
    } else if (m.winner_team_id === m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.loss,
        player2Score: config.win,
      });
    } else if (s1 === s2) {
      // draw
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.draw,
        player2Score: config.draw,
      });
    } else {
      // match bizarre : on ne donne aucun point
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: 0,
        player2Score: 0,
      });
    }
  }

  return results;
}
