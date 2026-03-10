// lib/bracket/propagate.ts
// Logique de propagation des équipes dans le bracket
// à partir d'un match terminé (winner / loser → prochains matchs).
import { supabaseAdmin } from '../supabase';
import type { MatchStatus, BracketSide } from '@/types/admin';

/* -----------------------------------------------------------
 * Types (adaptés à ta structure existante)
 * ---------------------------------------------------------*/

export type { MatchStatus } from '@/types/admin';
export type { BracketSide } from '@/types/admin';

export type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;

  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;

  bracket_side: BracketSide;
  round_number: number | null;
  group_key: string | null;

  next_match_win_id: string | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_id: string | null;
  next_match_lose_slot: 1 | 2 | null;
};

export type PropagationResult = {
  matchId: string;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  updatedWinMatchId?: string | null;
  updatedLoseMatchId?: string | null;
};

/* -----------------------------------------------------------
 * Entrée principale : à appeler après update d'un match
 * ---------------------------------------------------------*/

/**
 * Propage le vainqueur / perdant d'un match vers les matchs suivants.
 *
 * @param matchId ID du match dont le résultat vient d'être mis à jour
 * @param chain Si true, re-propage en profondeur (utile si plusieurs rounds déjà saisis)
 */
export async function propagateBracketForMatch(
  matchId: string,
  chain: boolean = true
): Promise<PropagationResult> {
  const match = await fetchMatchWithLinks(matchId);

  if (!match) {
    throw new Error(`Match ${matchId} introuvable pour la propagation.`);
  }

  // Si match annulé, on ne propage rien
  if (match.status === 'cancelled') {
    return {
      matchId,
      winnerTeamId: null,
      loserTeamId: null,
    };
  }

  const { winnerTeamId, loserTeamId } = computeWinnerLoserFromMatch(match);

  let updatedWinMatchId: string | null | undefined = null;
  let updatedLoseMatchId: string | null | undefined = null;

  // Vérifier la cohérence des liens bracket :
  // si next_match_win_id est défini, next_match_win_slot doit l'être aussi (et inversement)
  if (match.next_match_win_id && !match.next_match_win_slot) {
    throw new Error(
      `Match ${matchId} : next_match_win_id défini (${match.next_match_win_id}) mais next_match_win_slot est null. Corrigez la structure du bracket.`
    );
  }
  if (match.next_match_lose_id && !match.next_match_lose_slot) {
    throw new Error(
      `Match ${matchId} : next_match_lose_id défini (${match.next_match_lose_id}) mais next_match_lose_slot est null. Corrigez la structure du bracket.`
    );
  }

  // Propage le vainqueur
  if (match.next_match_win_id && match.next_match_win_slot) {
    updatedWinMatchId = await applyTeamToNextMatchSlot(
      match.tournament_id,
      match.next_match_win_id,
      match.next_match_win_slot,
      winnerTeamId
    );
  }

  // Propage le perdant (loser bracket / match de classement)
  if (match.next_match_lose_id && match.next_match_lose_slot) {
    updatedLoseMatchId = await applyTeamToNextMatchSlot(
      match.tournament_id,
      match.next_match_lose_id,
      match.next_match_lose_slot,
      loserTeamId
    );
  }

  return {
    matchId,
    winnerTeamId,
    loserTeamId,
    updatedWinMatchId,
    updatedLoseMatchId,
  };
}

/* -----------------------------------------------------------
 * Fetch d'un match avec les colonnes de lien de bracket
 * ---------------------------------------------------------*/

async function fetchMatchWithLinks(matchId: string): Promise<MatchRow | null> {
  const { data, error } = await supabaseAdmin
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
      bracket_side,
      round_number,
      group_key,
      next_match_win_id,
      next_match_win_slot,
      next_match_lose_id,
      next_match_lose_slot
    `
    )
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    console.error('fetchMatchWithLinks error:', error);
    return null;
  }

  return data as MatchRow | null;
}

/* -----------------------------------------------------------
 * Calcul winner / loser à partir du match
 * ---------------------------------------------------------*/

function computeWinnerLoserFromMatch(match: MatchRow): {
  winnerTeamId: string | null;
  loserTeamId: string | null;
} {
  // Cas BYE : une seule équipe, elle avance automatiquement
  if (match.is_bye) {
    const onlyTeam = match.team1_id || match.team2_id;
    return {
      winnerTeamId: onlyTeam ?? null,
      loserTeamId: null,
    };
  }

  // Si winner_team_id est explicitement défini, on l'utilise comme source de vérité
  if (match.winner_team_id) {
    const winnerTeamId = match.winner_team_id;
    let loserTeamId: string | null = null;

    if (match.team1_id === winnerTeamId) {
      loserTeamId = match.team2_id;
    } else if (match.team2_id === winnerTeamId) {
      loserTeamId = match.team1_id;
    }

    return { winnerTeamId, loserTeamId };
  }

  // Sinon, tenter de déduire à partir des scores
  const s1 = match.team1_score;
  const s2 = match.team2_score;

  if (s1 !== null && s2 !== null && match.team1_id && match.team2_id) {
    if (s1 > s2) {
      return {
        winnerTeamId: match.team1_id,
        loserTeamId: match.team2_id,
      };
    }
    if (s2 > s1) {
      return {
        winnerTeamId: match.team2_id,
        loserTeamId: match.team1_id,
      };
    }

    // Egalité non gérée → pas de propagation
    return {
      winnerTeamId: null,
      loserTeamId: null,
    };
  }

  // Pas assez d'infos pour décider
  return {
    winnerTeamId: null,
    loserTeamId: null,
  };
}

/* -----------------------------------------------------------
 * Appliquer une équipe dans le prochain match (slot 1 ou 2)
 * ---------------------------------------------------------*/

/**
 * Ecrit l'équipe dans le slot donné du prochain match.
 * Si teamId est null → on "libère" le slot (reset).
 *
 * @returns l'ID du match mis à jour ou null
 */
async function applyTeamToNextMatchSlot(
  tournamentId: string,
  nextMatchId: string,
  slot: 1 | 2,
  teamId: string | null
): Promise<string | null> {
  if (!nextMatchId) return null;

  // Valider le slot
  if (slot !== 1 && slot !== 2) {
    throw new Error(
      `Slot invalide (${slot}) pour le match ${nextMatchId}. Valeurs acceptées : 1, 2.`
    );
  }

  // On check que le match suivant appartient bien au même tournoi, par sécurité.
  const field = slot === 1 ? 'team1_id' : 'team2_id';

  const { data: updated, error } = await supabaseAdmin
    .from('matches')
    .update({ [field]: teamId })
    .eq('id', nextMatchId)
    .eq('tournament_id', tournamentId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Échec de propagation vers match ${nextMatchId} (slot ${slot}) : ${error.message}`
    );
  }

  if (!updated) {
    throw new Error(
      `Match cible ${nextMatchId} introuvable dans le tournoi ${tournamentId}. Lien bracket invalide.`
    );
  }

  return updated.id;
}

/* -----------------------------------------------------------
 * Helper optionnel : reset complet de la propagation
 * (par ex. si tu annules un match ou modifies son résultat)
 * ---------------------------------------------------------*/

/**
 * En cas de modification de résultat (ou annulation),
 * tu peux appeler cette fonction avant de recalculer.
 *
 * Elle supprime l'équipe propagée dans les matchs liés
 * (win & lose).
 */
export async function resetPropagationForMatch(matchId: string): Promise<void> {
  const match = await fetchMatchWithLinks(matchId);
  if (!match) return;

  const updates: PromiseLike<any>[] = [];

  if (match.next_match_win_id && match.next_match_win_slot) {
    const field = match.next_match_win_slot === 1 ? 'team1_id' : 'team2_id';

    updates.push(
      supabaseAdmin
        .from('matches')
        .update({ [field]: null })
        .eq('id', match.next_match_win_id)
        .eq('tournament_id', match.tournament_id)
        .then()
    );
  }

  if (match.next_match_lose_id && match.next_match_lose_slot) {
    const field = match.next_match_lose_slot === 1 ? 'team1_id' : 'team2_id';

    updates.push(
      supabaseAdmin
        .from('matches')
        .update({ [field]: null })
        .eq('id', match.next_match_lose_id)
        .eq('tournament_id', match.tournament_id)
        .then()
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}
