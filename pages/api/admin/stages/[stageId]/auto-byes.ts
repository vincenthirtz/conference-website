// pages/api/admin/stages/[stageId]/auto-byes.ts
// Admin: auto-traitement des matchs "incomplets" d'un stage en BYE.
//
// POST :
//   - détecte tous les matchs du stage (et éventuellement d'un round donné)
//     où une seule équipe est définie (team1_id XOR team2_id)
//   - marque ces matchs comme BYE, les termine avec un score par défaut
//   - propage le vainqueur dans le bracket (optionnel)
//   - log l'action dans staff_logs
//
// Body optionnel :
// {
//   "roundNumber": 1,          // si fourni, ne traite que ce round
//   "scoreForBye": 1,          // score attribué à l'équipe présente (défaut: 1)
//   "propagate": true          // propage dans le bracket (défaut: true)
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  resetPropagationForMatch,
  propagateBracketForMatch,
} from '@/utils/bracket/propagate';
import type { MatchStatus } from '@/types/admin';

type DbMatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type AutoByesBody = {
  roundNumber?: number;
  scoreForBye?: number;
  propagate?: boolean;
};

type AutoByesResult = {
  stageId: string;
  tournamentId: string | null;
  roundNumber?: number | null;
  updatedMatchIds: string[];
  failed: { matchId: string; reason: string }[];
};

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AutoByesResult | { error: string; detail?: string }>,
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
    const body = (req.body || {}) as AutoByesBody;
    const roundFilter =
      typeof body.roundNumber === 'number' ? body.roundNumber : undefined;
    const scoreForBye =
      typeof body.scoreForBye === 'number' ? body.scoreForBye : 1;
    const propagate = body.propagate !== false; // défaut true

    // 1) Récupérer le stage pour le tournament_id
    const { data: stageRow, error: stageErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('id', id)
      .maybeSingle();

    if (stageErr || !stageRow) {
      return res.status(404).json({
        error: 'Stage not found',
      });
    }

    const tournamentId: string | null = stageRow.tournament_id ?? null;

    // 2) Récupérer les matchs du stage (optionnellement filtrés par round)
    let query = supabaseAdmin
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
        team1_score,
        team2_score,
        winner_team_id
      `
      )
      .eq('stage_id', id)
      .neq('status', 'cancelled');

    if (roundFilter !== undefined) {
      query = query.eq('round_number', roundFilter);
    }

    const { data: matchesData, error: mErr } = await query;

    if (mErr) {
      console.error('auto-byes: fetch matches error', mErr);
      return res.status(500).json({
        error: 'Failed to fetch stage matches',
      });
    }

    const allMatches = (matchesData || []) as DbMatchRow[];

    // 3) Filtrer les matchs "éligibles BYE" :
    //    - pas déjà is_bye
    //    - status != cancelled (déjà filtré)
    //    - exactement une team définie (team1 XOR team2)
    const candidates = allMatches.filter((m) => {
      if (m.is_bye) return false;
      const hasT1 = !!m.team1_id;
      const hasT2 = !!m.team2_id;
      return hasT1 !== hasT2; // XOR
    });

    if (candidates.length === 0) {
      const emptyResult: AutoByesResult = {
        stageId: id,
        tournamentId,
        roundNumber: roundFilter ?? null,
        updatedMatchIds: [],
        failed: [],
      };
      return res.status(200).json(emptyResult);
    }

    const updatedMatchIds: string[] = [];
    const failed: { matchId: string; reason: string }[] = [];

    // 4) Appliquer le BYE à chaque match
    for (const m of candidates) {
      const matchId = m.id;
      try {
        const winnerTeamId = m.team1_id || m.team2_id;

        if (!winnerTeamId) {
          throw new Error('Match has no team to receive BYE');
        }

        const nowIso = new Date().toISOString();

        // calcul des scores : on donne scoreForBye à la team présente, 0 à l'autre (même si null)
        const team1_score = m.team1_id === winnerTeamId ? scoreForBye : 0;
        const team2_score = m.team2_id === winnerTeamId ? scoreForBye : 0;

        // Reset propagation avant de figer un vainqueur
        await resetPropagationForMatch(matchId);

        const { error: updErr } = await supabaseAdmin
          .from('matches')
          .update({
            is_bye: true,
            status: 'finished',
            winner_team_id: winnerTeamId,
            team1_score,
            team2_score,
            completed_at: nowIso,
          })
          .eq('id', matchId);

        if (updErr) {
          throw updErr;
        }

        // Propage dans le bracket
        if (propagate) {
          try {
            await propagateBracketForMatch(matchId);
          } catch (e: any) {
            console.error(
              'auto-byes: propagateBracketForMatch error',
              matchId,
              e
            );
            // on ne fait pas échouer l'update pour ça, mais on log dans failed + continue
          }
        }

        updatedMatchIds.push(matchId);
      } catch (err: any) {
        console.error('auto-byes: error processing match', matchId, err);
        failed.push({
          matchId,
          reason: err?.message ?? 'unknown',
        });
      }
    }

    // 5) Log staff (batch)
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'staff_batch_action',
          entity_type: 'match_auto_byes',
          entity_id: null,
          tournament_id: tournamentId,
          payload: {
            stage_id: id,
            round_number: roundFilter ?? null,
            score_for_bye: scoreForBye,
            propagate,
            updated_match_ids: updatedMatchIds,
            failed,
          },
        });
      } catch (e) {
        console.error('auto-byes: logStaffAction error', e);
      }
    }

    const result: AutoByesResult = {
      stageId: id,
      tournamentId,
      roundNumber: roundFilter ?? null,
      updatedMatchIds,
      failed,
    };

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/auto-byes] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}
