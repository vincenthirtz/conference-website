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

type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

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
};

type GeneratedSwissMatch = {
  id: string;
  team1_id: string | null;
  team2_id: string | null;
  is_bye: boolean;
  round_number: number;
  status: MatchStatus;
};

type GenerateSwissRoundResponse = {
  stageId: string;
  tournamentId: string;
  roundNumber: number;
  hasRematches: boolean;
  createdMatches: GeneratedSwissMatch[];
  byeMatchId?: string | null;
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

  if (!stageId || Array.isArray(stageId)) {
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

    // 7) Construire la liste des participants pour le pairing
    const swissParticipantsForPairing: PairingParticipant[] =
      participantsRows.map((p, idx) => {
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
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error(
      '[/api/admin/stages/[stageId]/generate-swiss-round] error:',
      err
    );
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
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
