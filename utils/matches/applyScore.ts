// lib/matches/applyScore.ts
// Helper serveur pour appliquer un score à un match,
// calculer le vainqueur et propager dans le bracket.
// @ts-nocheck
import { supabaseAdmin } from '../supabase';
import {
  resetPropagationForMatch,
  propagateBracketForMatch,
} from '../bracket/propagate';
import { logStaffAction } from '../staffLogs';
import type {
  ApplyMatchScoreInput,
  ApplyMatchScoreResult,
  MatchStatus,
} from '../../types/matches';

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Applique un score à un match :
 * - met à jour team1_score / team2_score
 * - calcule le winner_team_id (si non reçu en entrée)
 * - optionnellement marque le match comme "finished"
 * - met à jour completed_at si terminé
 * - reset puis propage la progression dans le bracket
 * - log l'action staff dans staff_logs
 */
export async function applyMatchScore(
  input: ApplyMatchScoreInput
): Promise<ApplyMatchScoreResult> {
  const {
    matchId,
    team1Score,
    team2Score,
    status,
    winnerTeamId,
    markFinished = true,
    completedAt,
    staffId,
    propagateBracket = true,
  } = input;

  // 1) Récupérer le match actuel
  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      status,
      is_bye,
      team1_id,
      team2_id,
      team1_score,
      team2_score,
      winner_team_id,
      completed_at,
      next_match_win_id,
      next_match_win_slot,
      next_match_lose_id,
      next_match_lose_slot
    `
    )
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    console.error('applyMatchScore: fetch match error', fetchErr);
    throw new Error('Match introuvable');
  }

  const currentStatus: MatchStatus = match.status;

  // 2) Déterminer le status cible
  let newStatus: MatchStatus = currentStatus;

  if (status) {
    newStatus = status;
  } else if (markFinished) {
    newStatus = 'finished';
  }

  // 3) Calculer le vainqueur si besoin
  let newWinnerTeamId: string | null =
    typeof winnerTeamId !== 'undefined'
      ? winnerTeamId
      : computeWinnerFromScores(
          match.team1_id,
          match.team2_id,
          team1Score,
          team2Score,
          match.is_bye
        );

  // 4) Déterminer completed_at
  let newCompletedAt: string | null = match.completed_at;
  if (newStatus === 'finished') {
    newCompletedAt = completedAt || new Date().toISOString();
  }

  // 5) Préparer la payload d'update
  const updatePayload: Record<string, any> = {
    team1_score: team1Score,
    team2_score: team2Score,
    winner_team_id: newWinnerTeamId,
  };

  if (newStatus !== currentStatus) {
    updatePayload.status = newStatus;
  }

  if (newStatus === 'finished') {
    updatePayload.completed_at = newCompletedAt;
  }

  // 6) Reset propagation avant de changer les équipes
  if (propagateBracket) {
    await resetPropagationForMatch(matchId);
  }

  // 7) Update du match
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('applyMatchScore: update match error', updateErr);
    throw new Error('Erreur lors de la mise à jour du match');
  }

  // 8) Propagation du vainqueur/perdant dans le bracket
  if (propagateBracket && newStatus === 'finished') {
    try {
      await propagateBracketForMatch(matchId);
    } catch (e) {
      console.error('applyMatchScore: propagateBracketForMatch error', e);
      // on n'échoue pas forcément l'API pour ça, mais on log
    }
  }

  // 9) Log staff
  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'update_match',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id || null,
        payload: {
          prev_status: currentStatus,
          new_status: newStatus,
          prev_team1_score: match.team1_score,
          prev_team2_score: match.team2_score,
          new_team1_score: team1Score,
          new_team2_score: team2Score,
          prev_winner_team_id: match.winner_team_id,
          new_winner_team_id: newWinnerTeamId,
        },
      });
    } catch (e) {
      console.error('applyMatchScore: logStaffAction error', e);
    }
  }

  return {
    matchId,
    updated: true,
    match: updated,
    winnerTeamId: newWinnerTeamId,
  };
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

/**
 * Calcule le vainqueur à partir des scores et des IDs d'équipes.
 * - en cas de bye : l'équipe présente gagne automatiquement
 * - en cas d'égalité : pas de vainqueur (null)
 */
function computeWinnerFromScores(
  team1Id: string | null,
  team2Id: string | null,
  team1Score: number,
  team2Score: number,
  isBye: boolean | null
): string | null {
  if (isBye) {
    return team1Id || team2Id || null;
  }

  if (!team1Id || !team2Id) {
    // match mal configuré, on ne déduit rien
    return null;
  }

  if (team1Score > team2Score) {
    return team1Id;
  }
  if (team2Score > team1Score) {
    return team2Id;
  }

  // égalité → aucun vainqueur défini par défaut
  return null;
}
