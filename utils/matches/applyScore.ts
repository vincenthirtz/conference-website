// lib/matches/applyScore.ts
// Helper serveur pour appliquer un score à un match,
// calculer le vainqueur et propager dans le bracket.
import { supabaseAdmin } from '../supabase';
import {
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
} from '../bracket/propagate';
import type { PropagationSnapshot } from '../bracket/propagate';
import { logStaffAction } from '../staffLogs';
import { computeRequiredWins } from './computeRequiredWins';
import { invalidateStandingsCache } from '../stages/standingsCache';
import type {
  ApplyMatchScoreInput,
  ApplyMatchScoreResult,
  MatchStatus,
} from '../../types/matches';

/** Statuses that trigger bracket propagation (match has a winner) */
const PROPAGATION_STATUSES: MatchStatus[] = ['finished', 'walkover'];

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Applique un score à un match :
 * - met à jour team1_score / team2_score
 * - calcule le winner_team_id (si non reçu en entrée)
 * - gère les forfeits (score automatique + winner basé sur l'équipe adverse)
 * - optionnellement marque le match comme "finished" ou "walkover"
 * - met à jour completed_at si terminé
 * - reset puis propage la progression dans le bracket
 * - log l'action staff dans staff_logs
 */
export async function applyMatchScore(
  input: ApplyMatchScoreInput
): Promise<ApplyMatchScoreResult> {
  const {
    matchId,
    status,
    winnerTeamId,
    markFinished = true,
    completedAt,
    staffId,
    propagateBracket = true,
    forfeitTeamId,
  } = input;

  let { team1Score, team2Score } = input;

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
      match_format,
      team1_id,
      team2_id,
      team1_score,
      team2_score,
      winner_team_id,
      forfeit_team_id,
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

  // 1b) Vérifier que le tournoi n'est pas terminé (completed)
  if (match.tournament_id) {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('status')
      .eq('id', match.tournament_id)
      .maybeSingle();

    if (tournament?.status === 'completed') {
      throw new Error(
        'Impossible de modifier le score : le tournoi est terminé (status=completed). Réouvrez le tournoi pour effectuer des modifications.'
      );
    }
  }

  // 1c) Gestion du forfait : auto-calcul score + winner
  let resolvedForfeitTeamId: string | null = forfeitTeamId ?? null;

  if (resolvedForfeitTeamId) {
    // Vérifier que l'équipe forfait fait partie du match
    if (
      resolvedForfeitTeamId !== match.team1_id &&
      resolvedForfeitTeamId !== match.team2_id
    ) {
      throw new Error(
        `L'équipe forfait (${resolvedForfeitTeamId}) ne fait pas partie de ce match`
      );
    }

    // Si les scores ne sont pas fournis explicitement, les calculer automatiquement
    if (team1Score === undefined && team2Score === undefined) {
      const requiredWins = computeRequiredWins(match.match_format);
      // L'équipe forfait obtient 0, l'adversaire obtient le nombre de wins requis
      if (resolvedForfeitTeamId === match.team1_id) {
        team1Score = 0;
        team2Score = requiredWins;
      } else {
        team1Score = requiredWins;
        team2Score = 0;
      }
    }
  }

  // 0) Validation des scores (après résolution forfait)
  if (
    typeof team1Score !== 'number' ||
    typeof team2Score !== 'number' ||
    !Number.isInteger(team1Score) ||
    !Number.isInteger(team2Score) ||
    team1Score < 0 ||
    team2Score < 0
  ) {
    throw new Error(
      'Scores invalides : team1Score et team2Score doivent être des entiers >= 0'
    );
  }

  const currentStatus: MatchStatus = match.status;

  // 2) Déterminer le status cible
  let newStatus: MatchStatus = currentStatus;

  if (status) {
    newStatus = status;
  } else if (resolvedForfeitTeamId) {
    newStatus = 'walkover';
  } else if (markFinished) {
    newStatus = 'finished';
  }

  // 3) Calculer le vainqueur si besoin
  let newWinnerTeamId: string | null;

  if (resolvedForfeitTeamId) {
    // En cas de forfait, le vainqueur est l'adversaire
    newWinnerTeamId =
      typeof winnerTeamId !== 'undefined'
        ? winnerTeamId
        : resolvedForfeitTeamId === match.team1_id
          ? match.team2_id
          : match.team1_id;
  } else {
    newWinnerTeamId =
      typeof winnerTeamId !== 'undefined'
        ? winnerTeamId
        : computeWinnerFromScores(
            match.team1_id,
            match.team2_id,
            team1Score,
            team2Score,
            match.is_bye
          );
  }

  // 4) Déterminer completed_at
  let newCompletedAt: string | null = match.completed_at;
  if (PROPAGATION_STATUSES.includes(newStatus)) {
    newCompletedAt = completedAt || new Date().toISOString();
  }

  // 5) Préparer la payload d'update
  const updatePayload: Record<string, any> = {
    team1_score: team1Score,
    team2_score: team2Score,
    winner_team_id: newWinnerTeamId,
  };

  if (resolvedForfeitTeamId !== undefined) {
    updatePayload.forfeit_team_id = resolvedForfeitTeamId;
  }

  if (newStatus !== currentStatus) {
    updatePayload.status = newStatus;
  }

  if (PROPAGATION_STATUSES.includes(newStatus)) {
    updatePayload.completed_at = newCompletedAt;
  }

  // 6) Sauvegarder l'état précédent pour rollback éventuel
  const previousMatchState = {
    team1_score: match.team1_score,
    team2_score: match.team2_score,
    winner_team_id: match.winner_team_id,
    forfeit_team_id: match.forfeit_team_id,
    status: match.status,
    completed_at: match.completed_at,
  };

  // Statuses qui bloquent la propagation
  const shouldPropagate =
    propagateBracket && PROPAGATION_STATUSES.includes(newStatus);

  // 7) Snapshot des slots de propagation AVANT le reset,
  //    pour pouvoir restaurer l'état complet en cas d'échec.
  let propagationSnapshot: PropagationSnapshot | null = null;
  if (propagateBracket) {
    propagationSnapshot = await snapshotPropagationSlots(matchId);
  }

  // 8) Reset propagation avant de changer les équipes
  if (propagateBracket) {
    try {
      await resetPropagationForMatch(matchId);
    } catch (e) {
      // Si le reset échoue, restaurer le snapshot et abandonner
      if (propagationSnapshot) {
        await restorePropagationSlots(propagationSnapshot).catch((re) =>
          console.error('applyMatchScore: restore after reset failure failed', re)
        );
      }
      throw new Error(
        `Reset de la propagation échoué. Aucune modification appliquée. Détail : ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // 9) Update du match
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayload)
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('applyMatchScore: update match error', updateErr);

    // Rollback : restaurer les slots de propagation vidés par le reset
    if (propagationSnapshot) {
      await restorePropagationSlots(propagationSnapshot).catch((re) =>
        console.error('applyMatchScore: restore after update failure failed', re)
      );
    }

    throw new Error('Erreur lors de la mise à jour du match');
  }

  // 9b) Invalider le cache standings si le match appartient à un stage
  if (match.stage_id) {
    invalidateStandingsCache(match.stage_id);
  }

  // 10) Propagation du vainqueur/perdant dans le bracket
  //     En cas d'échec, on rollback le match ET les slots de propagation
  //     pour éviter une incohérence bracket.
  if (shouldPropagate) {
    try {
      await propagateBracketForMatch(matchId);
    } catch (e) {
      console.error('applyMatchScore: propagateBracketForMatch error — rollback', e);

      // Rollback complet : match + slots de propagation
      const rollbackOps: Promise<any>[] = [
        Promise.resolve(
          supabaseAdmin
            .from('matches')
            .update(previousMatchState)
            .eq('id', matchId)
        ).then(({ error: rollbackErr }) => {
          if (rollbackErr) {
            console.error('applyMatchScore: match rollback failed!', rollbackErr);
          }
        }),
      ];

      if (propagationSnapshot) {
        rollbackOps.push(
          restorePropagationSlots(propagationSnapshot).catch((re) =>
            console.error('applyMatchScore: propagation slot restore failed', re)
          )
        );
      }

      await Promise.all(rollbackOps);

      throw new Error(
        `Propagation bracket échouée, match et bracket restaurés à leur état précédent. Détail : ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // 11) Log staff
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
          ...(resolvedForfeitTeamId
            ? { forfeit_team_id: resolvedForfeitTeamId }
            : {}),
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
