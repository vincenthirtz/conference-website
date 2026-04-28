// lib/bracket/propagate.ts
// Logique de propagation des équipes dans le bracket
// à partir d'un match terminé (winner / loser → prochains matchs).
import { supabaseAdmin } from '../supabase';
import type { MatchRow, PropagationResult } from '@/types/bracket';
import type { TiebreakerPolicy } from '@/types/admin';

export type { MatchStatus } from '@/types/admin';
export type { BracketSide } from '@/types/admin';
export type { MatchRow, PropagationResult } from '@/types/bracket';

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

  // Si match en dispute, on ne propage rien tant que la dispute n'est pas tranchee.
  // C'est la garantie que le bracket aval ne sera pas pollue par un score conteste.
  if (match.status === 'disputed') {
    return {
      matchId,
      winnerTeamId: null,
      loserTeamId: null,
    };
  }

  // Calcul du winner/loser (synchrone, sans tiebreaker)
  let { winnerTeamId, loserTeamId } = computeWinnerLoserFromMatch(match);

  let tiebreakerApplied: PropagationResult['tiebreakerApplied'] = null;
  let tiebreakerMatchId: string | null = null;

  // En cas d'égalité, tenter de résoudre via le tiebreaker du stage
  if (
    !winnerTeamId &&
    match.team1_id &&
    match.team2_id &&
    match.team1_score !== null &&
    match.team2_score !== null &&
    match.team1_score === match.team2_score &&
    match.stage_id
  ) {
    const tiebreaker = await resolveTiebreaker(match);

    if (tiebreaker.policy === 'extra_round') {
      // Créer un match de barrage au lieu de propager
      tiebreakerMatchId = await createTiebreakerMatch(match);
      tiebreakerApplied = 'extra_round';

      return {
        matchId,
        winnerTeamId: null,
        loserTeamId: null,
        tiebreakerApplied,
        tiebreakerMatchId,
      };
    }

    if (tiebreaker.winnerTeamId) {
      winnerTeamId = tiebreaker.winnerTeamId;
      loserTeamId =
        winnerTeamId === match.team1_id ? match.team2_id : match.team1_id;
      tiebreakerApplied = tiebreaker.policy as 'map_diff' | 'seed';

      // Mettre à jour le winner_team_id sur le match
      await supabaseAdmin
        .from('matches')
        .update({ winner_team_id: winnerTeamId })
        .eq('id', matchId);
    }
  }

  let updatedWinMatchId: string | null | undefined = null;
  let updatedLoseMatchId: string | null | undefined = null;

  // Vérifier la cohérence des liens bracket
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

  // Snapshot des slots avant propagation pour rollback atomique
  const snapshot = await snapshotPropagationSlots(matchId);

  try {
    // Propage le vainqueur et le perdant en parallèle
    // (les deux updates sont indépendants — matchs cibles différents)
    const propagationOps: Promise<string | null>[] = [];

    const hasWin = !!(match.next_match_win_id && match.next_match_win_slot);
    const hasLose = !!(match.next_match_lose_id && match.next_match_lose_slot);

    if (hasWin) {
      propagationOps.push(
        applyTeamToNextMatchSlot(
          match.tournament_id,
          match.next_match_win_id!,
          match.next_match_win_slot!,
          winnerTeamId
        )
      );
    }

    if (hasLose) {
      propagationOps.push(
        applyTeamToNextMatchSlot(
          match.tournament_id,
          match.next_match_lose_id!,
          match.next_match_lose_slot!,
          loserTeamId
        )
      );
    }

    if (propagationOps.length > 0) {
      const results = await Promise.all(propagationOps);
      if (hasWin) updatedWinMatchId = results[0];
      if (hasLose) updatedLoseMatchId = results[hasWin ? 1 : 0];
    }
  } catch (err) {
    // Rollback : restaurer les slots à leur état d'avant propagation
    console.error(`Propagation failed for match ${matchId}, rolling back:`, err);
    await restorePropagationSlots(snapshot);
    throw err;
  }

  return {
    matchId,
    winnerTeamId,
    loserTeamId,
    updatedWinMatchId,
    updatedLoseMatchId,
    tiebreakerApplied,
    tiebreakerMatchId,
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

  // Vérifier que l'équipe est bien inscrite au tournoi avant de propager
  if (teamId) {
    const { data: registration } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!registration) {
      throw new Error(
        `Équipe ${teamId} non inscrite au tournoi ${tournamentId}. Propagation annulée.`
      );
    }
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
 * Snapshot des slots de propagation (pour rollback)
 * ---------------------------------------------------------*/

export type PropagationSnapshot = {
  winMatchId: string | null;
  winSlotField: 'team1_id' | 'team2_id' | null;
  winSlotValue: string | null;
  loseMatchId: string | null;
  loseSlotField: 'team1_id' | 'team2_id' | null;
  loseSlotValue: string | null;
};

/**
 * Capture l'état actuel des slots de propagation
 * (les team_id dans les matchs suivants) avant de les modifier.
 * Permet un rollback précis en cas d'échec ultérieur.
 */
export async function snapshotPropagationSlots(
  matchId: string
): Promise<PropagationSnapshot> {
  const snapshot: PropagationSnapshot = {
    winMatchId: null,
    winSlotField: null,
    winSlotValue: null,
    loseMatchId: null,
    loseSlotField: null,
    loseSlotValue: null,
  };

  const match = await fetchMatchWithLinks(matchId);
  if (!match) return snapshot;

  if (match.next_match_win_id && match.next_match_win_slot) {
    const field =
      match.next_match_win_slot === 1 ? 'team1_id' : 'team2_id';
    snapshot.winMatchId = match.next_match_win_id;
    snapshot.winSlotField = field;

    const { data } = await supabaseAdmin
      .from('matches')
      .select('team1_id, team2_id')
      .eq('id', match.next_match_win_id)
      .maybeSingle();
    snapshot.winSlotValue = (data as Record<string, any>)?.[field] ?? null;
  }

  if (match.next_match_lose_id && match.next_match_lose_slot) {
    const field =
      match.next_match_lose_slot === 1 ? 'team1_id' : 'team2_id';
    snapshot.loseMatchId = match.next_match_lose_id;
    snapshot.loseSlotField = field;

    const { data } = await supabaseAdmin
      .from('matches')
      .select('team1_id, team2_id')
      .eq('id', match.next_match_lose_id)
      .maybeSingle();
    snapshot.loseSlotValue = (data as Record<string, any>)?.[field] ?? null;
  }

  return snapshot;
}

/**
 * Restaure les slots de propagation à leur état capturé par un snapshot.
 */
export async function restorePropagationSlots(
  snapshot: PropagationSnapshot
): Promise<void> {
  const updates: Promise<any>[] = [];

  if (snapshot.winMatchId && snapshot.winSlotField) {
    updates.push(
      Promise.resolve(
        supabaseAdmin
          .from('matches')
          .update({ [snapshot.winSlotField]: snapshot.winSlotValue })
          .eq('id', snapshot.winMatchId)
      )
    );
  }

  if (snapshot.loseMatchId && snapshot.loseSlotField) {
    updates.push(
      Promise.resolve(
        supabaseAdmin
          .from('matches')
          .update({ [snapshot.loseSlotField]: snapshot.loseSlotValue })
          .eq('id', snapshot.loseMatchId)
      )
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

/* -----------------------------------------------------------
 * Tiebreaker resolution
 * ---------------------------------------------------------*/

type TiebreakerResult = {
  policy: TiebreakerPolicy;
  winnerTeamId: string | null;
};

/**
 * Récupère la politique de tiebreaker du stage et tente de résoudre l'égalité.
 */
async function resolveTiebreaker(match: MatchRow): Promise<TiebreakerResult> {
  if (!match.stage_id) {
    return { policy: 'manual', winnerTeamId: null };
  }

  const { data: stage } = await supabaseAdmin
    .from('tournament_stages')
    .select('tiebreaker_policy')
    .eq('id', match.stage_id)
    .maybeSingle();

  const policy: TiebreakerPolicy = stage?.tiebreaker_policy || 'manual';

  if (policy === 'manual') {
    return { policy, winnerTeamId: null };
  }

  if (policy === 'extra_round') {
    return { policy, winnerTeamId: null };
  }

  if (policy === 'map_diff') {
    const winner = await resolveByMapDiff(match);
    if (winner) {
      return { policy, winnerTeamId: winner };
    }
    // Différentiel identique → fallback vers match supplémentaire
    return { policy: 'extra_round', winnerTeamId: null };
  }

  if (policy === 'seed') {
    const winner = await resolveBySeed(match);
    if (winner) {
      return { policy, winnerTeamId: winner };
    }
    // Seeds égaux → fallback vers match supplémentaire
    return { policy: 'extra_round', winnerTeamId: null };
  }

  return { policy: 'manual', winnerTeamId: null };
}

/**
 * Départage par différence de score sur les games (maps) individuelles.
 * Le team ayant le meilleur différentiel de score total l'emporte.
 * En cas d'égalité de différentiel, retourne null (fallback manual).
 */
async function resolveByMapDiff(match: MatchRow): Promise<string | null> {
  const { data: games } = await supabaseAdmin
    .from('games')
    .select('team1_score, team2_score')
    .eq('match_id', match.id);

  if (!games || games.length === 0) return null;

  let team1Total = 0;
  let team2Total = 0;

  for (const g of games) {
    team1Total += g.team1_score ?? 0;
    team2Total += g.team2_score ?? 0;
  }

  if (team1Total > team2Total) return match.team1_id;
  if (team2Total > team1Total) return match.team2_id;

  return null; // Différentiel identique → pas de résolution
}

/**
 * Départage par seed : le mieux seedé (seed le plus bas) l'emporte.
 * Cherche les seeds dans stage_teams pour le stage du match.
 */
async function resolveBySeed(match: MatchRow): Promise<string | null> {
  if (!match.stage_id || !match.team1_id || !match.team2_id) return null;

  const { data: stageTeams } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id, seed')
    .eq('stage_id', match.stage_id)
    .in('team_id', [match.team1_id, match.team2_id]);

  if (!stageTeams || stageTeams.length < 2) return null;

  const t1 = stageTeams.find((st: any) => st.team_id === match.team1_id);
  const t2 = stageTeams.find((st: any) => st.team_id === match.team2_id);

  if (!t1?.seed && !t2?.seed) return null; // Aucun seed défini
  if (!t1?.seed) return match.team2_id; // Seul team2 a un seed
  if (!t2?.seed) return match.team1_id; // Seul team1 a un seed

  if (t1.seed < t2.seed) return match.team1_id;
  if (t2.seed < t1.seed) return match.team2_id;

  return null; // Même seed → pas de résolution
}

/**
 * Crée un match de barrage (extra round) lié au match à égalité.
 * Le barrage reprend les mêmes équipes et les mêmes liens de propagation.
 * Le match original perd ses liens de propagation (le barrage les reprend).
 */
async function createTiebreakerMatch(match: MatchRow): Promise<string> {
  // 1) Créer le match de barrage avec les liens de propagation du match original
  const { data: tbMatch, error: insertErr } = await supabaseAdmin
    .from('matches')
    .insert({
      tournament_id: match.tournament_id,
      stage_id: match.stage_id,
      team1_id: match.team1_id,
      team2_id: match.team2_id,
      status: 'pending',
      is_bye: false,
      round_number: match.round_number,
      bracket_side: match.bracket_side,
      group_key: match.group_key,
      round_name: 'Tiebreaker',
      notes: `Barrage suite à égalité sur le match ${match.id}`,
      // Le barrage hérite des liens de propagation
      next_match_win_id: match.next_match_win_id,
      next_match_win_slot: match.next_match_win_slot,
      next_match_lose_id: match.next_match_lose_id,
      next_match_lose_slot: match.next_match_lose_slot,
    })
    .select('id')
    .single();

  if (insertErr || !tbMatch) {
    throw new Error(
      `Échec de création du match de barrage : ${insertErr?.message || 'unknown'}`
    );
  }

  // 2) Retirer les liens de propagation du match original
  //    (c'est le barrage qui propagera maintenant)
  await supabaseAdmin
    .from('matches')
    .update({
      next_match_win_id: tbMatch.id,
      next_match_win_slot: null,
      next_match_lose_id: null,
      next_match_lose_slot: null,
    })
    .eq('id', match.id);

  return tbMatch.id;
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

  const updates: Promise<any>[] = [];

  if (match.next_match_win_id && match.next_match_win_slot) {
    const field = match.next_match_win_slot === 1 ? 'team1_id' : 'team2_id';

    updates.push(
      Promise.resolve(
        supabaseAdmin
          .from('matches')
          .update({ [field]: null })
          .eq('id', match.next_match_win_id)
          .eq('tournament_id', match.tournament_id)
      )
    );
  }

  if (match.next_match_lose_id && match.next_match_lose_slot) {
    const field = match.next_match_lose_slot === 1 ? 'team1_id' : 'team2_id';

    updates.push(
      Promise.resolve(
        supabaseAdmin
          .from('matches')
          .update({ [field]: null })
          .eq('id', match.next_match_lose_id)
          .eq('tournament_id', match.tournament_id)
      )
    );
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}
