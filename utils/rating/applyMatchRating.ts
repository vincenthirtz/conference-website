// utils/rating/applyMatchRating.ts
//
// Couche I/O du rating joueur persistant. La LOGIQUE reste dans les moteurs
// PURS (glicko2 / computePlayerRatings / deriveTeamRatings) ; ce fichier ne
// fait que lire/écrire la base autour d'eux.
//
// Trois entrées :
//   - snapshotMatchParticipants : fige le roster courant d'un match dans
//     match_participants (base de l'attribution des ratings + du H2H).
//   - applyMatchRatingIncremental : applique UN match fraîchement terminé,
//     de façon idempotente (hook depuis applyMatchScore).
//   - rebuildRatings : replay complet (backfill + recalcul from scratch).
//
// Toutes ces fonctions sont ROBUSTES : elles loggent les erreurs et ne
// throw JAMAIS vers l'appelant (les hooks side-effect ne doivent pas casser
// l'application du score).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { DEFAULT_RATING, DEFAULT_RD, DEFAULT_VOLATILITY } from './glicko2';
import {
  applyMatchToStates,
  computePlayerRatings,
  type RatingMatch,
  type RatingParticipant,
  type PlayerRatingState,
} from './computePlayerRatings';
import { deriveTeamRatings } from './deriveTeamRatings';

const SCORED_STATUSES = new Set(['finished', 'walkover']);

/** Colonnes lues sur `matches` pour construire un RatingMatch. */
const MATCH_COLUMNS =
  'id, tournament_id, team1_id, team2_id, winner_team_id, completed_at, status, is_bye, forfeit_team_id';

type MatchRow = {
  id: string;
  tournament_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
  status: string;
  is_bye: boolean | null;
  forfeit_team_id: string | null;
};

function toRatingMatch(m: MatchRow): RatingMatch {
  return {
    id: m.id,
    tournamentId: m.tournament_id,
    team1Id: m.team1_id,
    team2Id: m.team2_id,
    winnerTeamId: m.winner_team_id,
    completedAt: m.completed_at,
    status: m.status,
    isBye: m.is_bye,
    forfeitTeamId: m.forfeit_team_id,
  };
}

type TeamMemberRow = {
  team_id: string;
  user_id: string | null;
  battle_tag: string | null;
  role: string | null;
  is_substitute: boolean | null;
};

/* ---------------------------------------------------------------------------
 * snapshotMatchParticipants
 * ------------------------------------------------------------------------- */

/**
 * Fige le roster COURANT (team_members) des deux équipes d'un match dans
 * match_participants. Remplace proprement : on supprime les lignes existantes
 * du match puis on ré-insère depuis le roster actuel.
 *
 * L'attribution historique utilise le roster ACTUEL (le seul disponible côté
 * DB), ce qui est une approximation assumée pour les matches déjà joués.
 */
export async function snapshotMatchParticipants(
  tenantId: string,
  match: {
    id: string;
    tournament_id: string | null;
    team1_id: string | null;
    team2_id: string | null;
  }
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const allTeamIds = [match.team1_id, match.team2_id].filter(
      (t): t is string => !!t
    );
    if (allTeamIds.length === 0) return;

    // Une équipe qui a VALIDÉ sa feuille de match a déclaré elle-même qui
    // jouait — c'est plus juste que ce repli, et surtout ça l'engage. On ne
    // touche donc pas à ses lignes : les écraser avec le roster courant
    // annulerait la déclaration, et attribuerait le match à des personnes que
    // l'équipe avait explicitement laissées hors de la feuille.
    //
    // Le repli reste entier pour les équipes SANS feuille validée — matches
    // anciens, équipes qui n'ont pas composé, backfill.
    const { data: validatedRows, error: lineupErr } = await supabaseAdmin
      .from('match_lineups')
      .select('team_id')
      .eq('match_id', match.id)
      .eq('status', 'validated');
    if (lineupErr) {
      // Dégradation : sans cette lecture on ne sait pas qui a déclaré. Écraser
      // serait destructeur, donc on s'abstient plutôt que de deviner.
      logger.error('[rating] snapshot: lineups read error', lineupErr);
      return;
    }
    const validatedTeamIds = new Set(
      ((validatedRows || []) as { team_id?: string | null }[])
        .map((r) => r.team_id)
        .filter((id): id is string => !!id)
    );

    const teamIds = allTeamIds.filter((id) => !validatedTeamIds.has(id));
    if (teamIds.length === 0) return;

    const { data: members, error: mErr } = await supabaseAdmin
      .from('team_members')
      .select('team_id, user_id, battle_tag, role, is_substitute')
      .eq('tenant_id', tenantId)
      .in('team_id', teamIds);

    if (mErr) {
      logger.error('[rating] snapshot: team_members read error', mErr);
      return;
    }

    const rows = ((members || []) as TeamMemberRow[])
      .filter((m) => !!m.user_id)
      .map((m) => ({
        tenant_id: tenantId,
        match_id: match.id,
        tournament_id: match.tournament_id,
        team_id: m.team_id,
        user_id: m.user_id as string,
        battle_tag: m.battle_tag ?? null,
        role: m.role ?? null,
        is_substitute: m.is_substitute ?? false,
      }));

    // Remplacement propre : delete existing du match puis insert — mais
    // SEULEMENT pour les équipes qu'on refait. Un `delete` sur tout le match
    // emporterait la feuille validée de l'autre équipe.
    const { error: delErr } = await supabaseAdmin
      .from('match_participants')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('match_id', match.id)
      .in('team_id', teamIds);
    if (delErr) {
      logger.error('[rating] snapshot: delete existing error', delErr);
      return;
    }

    if (rows.length === 0) return;

    const { error: insErr } = await supabaseAdmin
      .from('match_participants')
      .insert(rows);
    if (insErr) {
      logger.error('[rating] snapshot: insert error', insErr);
    }
  } catch (err) {
    logger.error('[rating] snapshotMatchParticipants exception', err);
  }
}

/* ---------------------------------------------------------------------------
 * Helpers de lecture / conversion d'états
 * ------------------------------------------------------------------------- */

type PlayerRatingDbRow = {
  user_id: string;
  rating: number;
  rd: number;
  volatility: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  peak_rating: number;
  last_match_at: string | null;
  display_name: string | null;
  battle_tag: string | null;
  avatar_url: string | null;
};

function dbRowToState(row: PlayerRatingDbRow): PlayerRatingState {
  return {
    userId: row.user_id,
    rating: row.rating ?? DEFAULT_RATING,
    rd: row.rd ?? DEFAULT_RD,
    volatility: row.volatility ?? DEFAULT_VOLATILITY,
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    peakRating: row.peak_rating ?? DEFAULT_RATING,
    lastMatchAt: row.last_match_at ?? null,
  };
}

function freshState(userId: string): PlayerRatingState {
  return {
    userId,
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    volatility: DEFAULT_VOLATILITY,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    peakRating: DEFAULT_RATING,
    lastMatchAt: null,
  };
}

/* ---------------------------------------------------------------------------
 * applyMatchRatingIncremental
 * ------------------------------------------------------------------------- */

/**
 * Applique le rating d'UN match fraîchement terminé, de façon incrémentale et
 * idempotente. Appelé en best-effort depuis applyMatchScore (ne throw pas).
 */
export async function applyMatchRatingIncremental(
  tenantId: string,
  matchId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    // 1) Charger le match.
    const { data: matchRow, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('id', matchId)
      .maybeSingle();

    if (matchErr || !matchRow) {
      if (matchErr)
        logger.error('[rating] incremental: match read error', matchErr);
      return;
    }
    const match = matchRow as MatchRow;

    // 2) Filtres d'éligibilité.
    if (match.is_bye) return;
    if (!SCORED_STATUSES.has(match.status)) return;
    if (!match.winner_team_id || !match.team1_id || !match.team2_id) return;

    // 3) Idempotence : si des lignes history existent déjà pour ce match, on
    //    ne recompte pas (les corrections passent par le rebuild).
    const { data: existingHist, error: histErr } = await supabaseAdmin
      .from('player_rating_history')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .limit(1);
    if (histErr) {
      logger.error('[rating] incremental: history probe error', histErr);
      return;
    }
    if (existingHist && existingHist.length > 0) return;

    // 4) Garantir le snapshot des participants.
    await snapshotMatchParticipants(tenantId, {
      id: match.id,
      tournament_id: match.tournament_id,
      team1_id: match.team1_id,
      team2_id: match.team2_id,
    });

    // 5) Charger les participants du match.
    const { data: partRows, error: partErr } = await supabaseAdmin
      .from('match_participants')
      .select('match_id, team_id, user_id, battle_tag, is_substitute')
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId);
    if (partErr) {
      logger.error('[rating] incremental: participants read error', partErr);
      return;
    }

    const participants: RatingParticipant[] = (
      (partRows || []) as Array<{
        match_id: string;
        team_id: string;
        user_id: string;
        is_substitute: boolean | null;
      }>
    ).map((p) => ({
      matchId: p.match_id,
      teamId: p.team_id,
      userId: p.user_id,
      isSubstitute: p.is_substitute ?? false,
    }));

    const battleTagByUser = new Map<string, string | null>();
    for (const p of (partRows || []) as Array<{
      user_id: string;
      battle_tag: string | null;
    }>) {
      if (p.battle_tag) battleTagByUser.set(p.user_id, p.battle_tag);
    }

    const involvedUserIds = [...new Set(participants.map((p) => p.userId))];
    if (involvedUserIds.length === 0) return;

    // 6) Charger les player_ratings courants → Map<userId, state>.
    const { data: prRows, error: prErr } = await supabaseAdmin
      .from('player_ratings')
      .select(
        'user_id, rating, rd, volatility, games_played, wins, losses, draws, peak_rating, last_match_at, display_name, battle_tag, avatar_url'
      )
      .eq('tenant_id', tenantId)
      .in('user_id', involvedUserIds);
    if (prErr) {
      logger.error('[rating] incremental: player_ratings read error', prErr);
      return;
    }

    const states = new Map<string, PlayerRatingState>();
    for (const row of (prRows || []) as PlayerRatingDbRow[]) {
      states.set(row.user_id, dbRowToState(row));
    }
    for (const uid of involvedUserIds) {
      if (!states.has(uid)) states.set(uid, freshState(uid));
    }

    // 7) Appliquer le match (moteur pur).
    const historyRows = applyMatchToStates(
      states,
      toRatingMatch(match),
      participants
    );
    if (historyRows.length === 0) return;

    // 8) Upsert player_ratings pour les joueurs notés.
    const notedUserIds = new Set(historyRows.map((r) => r.userId));
    const nowIso = new Date().toISOString();
    const upserts = [...notedUserIds].map((uid) => {
      const s = states.get(uid) as PlayerRatingState;
      const bt = battleTagByUser.get(uid) ?? null;
      return {
        tenant_id: tenantId,
        user_id: uid,
        rating: s.rating,
        rd: s.rd,
        volatility: s.volatility,
        games_played: s.gamesPlayed,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        peak_rating: s.peakRating,
        last_match_at: s.lastMatchAt,
        ...(bt ? { battle_tag: bt } : {}),
        updated_at: nowIso,
      };
    });
    const { error: upErr } = await supabaseAdmin
      .from('player_ratings')
      .upsert(upserts, { onConflict: 'tenant_id,user_id' });
    if (upErr) {
      logger.error('[rating] incremental: player_ratings upsert error', upErr);
      return;
    }

    // 9) Insert history (onConflict match_id,user_id do nothing).
    const historyInsert = historyRows.map((r) => ({
      tenant_id: tenantId,
      user_id: r.userId,
      match_id: r.matchId,
      tournament_id: r.tournamentId,
      rating_before: r.ratingBefore,
      rating_after: r.ratingAfter,
      rd_before: r.rdBefore,
      rd_after: r.rdAfter,
      volatility_before: r.volatilityBefore,
      volatility_after: r.volatilityAfter,
      opponent_avg_rating: r.opponentAvgRating,
      result: r.result,
      occurred_at: r.occurredAt || nowIso,
    }));
    const { error: histInsErr } = await supabaseAdmin
      .from('player_rating_history')
      .upsert(historyInsert, { onConflict: 'match_id,user_id' });
    if (histInsErr) {
      logger.error('[rating] incremental: history insert error', histInsErr);
    }

    // 10) Recalcul team_ratings des 2 équipes.
    await recomputeTeamRatingsFor(tenantId, [match.team1_id, match.team2_id]);
  } catch (err) {
    logger.error('[rating] applyMatchRatingIncremental exception', err);
  }
}

/* ---------------------------------------------------------------------------
 * team_ratings recompute
 * ------------------------------------------------------------------------- */

/**
 * Recalcule team_ratings pour un set d'équipes à partir du roster COURANT
 * (team_members non-sub) et des player_ratings courants. games/wins/losses
 * sont conservés best-effort (dérivés du rating agrégé — on garde ce qui est
 * déjà persisté pour ces compteurs, on ne les recalcule pas ici).
 */
async function recomputeTeamRatingsFor(
  tenantId: string,
  teamIds: (string | null)[]
): Promise<void> {
  if (!supabaseAdmin) return;
  const ids = [...new Set(teamIds.filter((t): t is string => !!t))];
  if (ids.length === 0) return;

  const { data: members, error: mErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id, user_id, is_substitute')
    .eq('tenant_id', tenantId)
    .in('team_id', ids);
  if (mErr) {
    logger.error('[rating] team recompute: members read error', mErr);
    return;
  }

  const rostersByTeam = new Map<string, string[]>();
  for (const id of ids) rostersByTeam.set(id, []);
  const allUserIds = new Set<string>();
  for (const m of (members || []) as Array<{
    team_id: string;
    user_id: string | null;
    is_substitute: boolean | null;
  }>) {
    if (m.is_substitute) continue;
    if (!m.user_id) continue;
    const arr = rostersByTeam.get(m.team_id);
    if (arr) arr.push(m.user_id);
    allUserIds.add(m.user_id);
  }

  const playerRatings = new Map<string, { rating: number; rd: number }>();
  if (allUserIds.size > 0) {
    const { data: prRows, error: prErr } = await supabaseAdmin
      .from('player_ratings')
      .select('user_id, rating, rd')
      .eq('tenant_id', tenantId)
      .in('user_id', [...allUserIds]);
    if (prErr) {
      logger.error('[rating] team recompute: player_ratings read error', prErr);
    } else {
      for (const r of (prRows || []) as Array<{
        user_id: string;
        rating: number;
        rd: number;
      }>) {
        playerRatings.set(r.user_id, { rating: r.rating, rd: r.rd });
      }
    }
  }

  const derived = deriveTeamRatings({ rostersByTeam, playerRatings });
  const nowIso = new Date().toISOString();
  const upserts = [...derived.entries()].map(([teamId, tr]) => ({
    tenant_id: tenantId,
    team_id: teamId,
    rating: tr.rating,
    rd: tr.rd,
    roster_size: tr.rosterSize,
    updated_at: nowIso,
  }));
  if (upserts.length === 0) return;
  const { error: upErr } = await supabaseAdmin
    .from('team_ratings')
    .upsert(upserts, { onConflict: 'tenant_id,team_id' });
  if (upErr) {
    logger.error('[rating] team recompute: upsert error', upErr);
  }
}

/* ---------------------------------------------------------------------------
 * rebuildRatings — replay complet
 * ------------------------------------------------------------------------- */

/**
 * Recalcule TOUT le rating du tenant from scratch :
 *   1. Backfill des snapshots manquants (roster courant).
 *   2. computePlayerRatings (replay chronologique complet).
 *   3. DELETE puis INSERT frais de player_rating_history + player_ratings.
 *   4. Recalcul team_ratings pour toutes les équipes.
 *   5. display_name / avatar best-effort via auth.admin.getUserById.
 *
 * Ne throw pas ; renvoie { players, matches } (0/0 si supabase indisponible).
 */
export async function rebuildRatings(
  tenantId: string
): Promise<{ players: number; matches: number }> {
  if (!supabaseAdmin) return { players: 0, matches: 0 };
  try {
    // 0) Charger tous les matches notables du tenant.
    const { data: matchRows, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select(MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .in('status', ['finished', 'walkover']);
    if (matchErr) {
      logger.error('[rating] rebuild: matches read error', matchErr);
      return { players: 0, matches: 0 };
    }

    const notableMatches = ((matchRows || []) as MatchRow[]).filter(
      (m) => !m.is_bye && !!m.winner_team_id && !!m.team1_id && !!m.team2_id
    );

    // 1) Backfill : matches sans aucun snapshot dans match_participants.
    const matchIds = notableMatches.map((m) => m.id);
    const snapshotted = new Set<string>();
    if (matchIds.length > 0) {
      const { data: existingParts, error: epErr } = await supabaseAdmin
        .from('match_participants')
        .select('match_id')
        .eq('tenant_id', tenantId)
        .in('match_id', matchIds);
      if (epErr) {
        logger.error('[rating] rebuild: participants probe error', epErr);
      } else {
        for (const p of (existingParts || []) as Array<{ match_id: string }>) {
          snapshotted.add(p.match_id);
        }
      }
    }
    for (const m of notableMatches) {
      if (snapshotted.has(m.id)) continue;
      await snapshotMatchParticipants(tenantId, {
        id: m.id,
        tournament_id: m.tournament_id,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
      });
    }

    // 2) Recharger TOUS les participants (post-backfill).
    const participantsByMatch = new Map<string, RatingParticipant[]>();
    const battleTagByUser = new Map<string, string | null>();
    if (matchIds.length > 0) {
      const { data: allParts, error: apErr } = await supabaseAdmin
        .from('match_participants')
        .select('match_id, team_id, user_id, battle_tag, is_substitute')
        .eq('tenant_id', tenantId)
        .in('match_id', matchIds);
      if (apErr) {
        logger.error('[rating] rebuild: participants read error', apErr);
        return { players: 0, matches: 0 };
      }
      for (const p of (allParts || []) as Array<{
        match_id: string;
        team_id: string;
        user_id: string;
        battle_tag: string | null;
        is_substitute: boolean | null;
      }>) {
        const arr = participantsByMatch.get(p.match_id) ?? [];
        arr.push({
          matchId: p.match_id,
          teamId: p.team_id,
          userId: p.user_id,
          isSubstitute: p.is_substitute ?? false,
        });
        participantsByMatch.set(p.match_id, arr);
        if (p.battle_tag) battleTagByUser.set(p.user_id, p.battle_tag);
      }
    }

    // 3) Replay complet (moteur pur).
    const { ratings, history } = computePlayerRatings({
      matches: notableMatches.map(toRatingMatch),
      participantsByMatch,
    });

    // 4) display_name / avatar best-effort via auth.
    const displayNameByUser = new Map<string, string | null>();
    const avatarByUser = new Map<string, string | null>();
    for (const uid of ratings.keys()) {
      try {
        const { data: authData } =
          await supabaseAdmin.auth.admin.getUserById(uid);
        const meta =
          (authData?.user?.user_metadata as Record<string, unknown>) ?? {};
        const dn =
          (meta.full_name as string) ??
          (meta.name as string) ??
          (meta.display_name as string) ??
          null;
        const av =
          (meta.avatar_url as string) ?? (meta.picture as string) ?? null;
        if (dn) displayNameByUser.set(uid, dn);
        if (av) avatarByUser.set(uid, av);
      } catch {
        // best-effort — skip silencieux.
      }
    }

    // 5) Séquence de réécriture : DELETE history + player_ratings, INSERT frais.
    const { error: delHistErr } = await supabaseAdmin
      .from('player_rating_history')
      .delete()
      .eq('tenant_id', tenantId);
    if (delHistErr) {
      logger.error('[rating] rebuild: delete history error', delHistErr);
      return { players: 0, matches: 0 };
    }
    const { error: delRatErr } = await supabaseAdmin
      .from('player_ratings')
      .delete()
      .eq('tenant_id', tenantId);
    if (delRatErr) {
      logger.error('[rating] rebuild: delete ratings error', delRatErr);
      return { players: 0, matches: 0 };
    }

    const nowIso = new Date().toISOString();
    const ratingInserts = [...ratings.values()].map((s) => ({
      tenant_id: tenantId,
      user_id: s.userId,
      rating: s.rating,
      rd: s.rd,
      volatility: s.volatility,
      games_played: s.gamesPlayed,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      peak_rating: s.peakRating,
      last_match_at: s.lastMatchAt,
      battle_tag: battleTagByUser.get(s.userId) ?? null,
      display_name: displayNameByUser.get(s.userId) ?? null,
      avatar_url: avatarByUser.get(s.userId) ?? null,
      updated_at: nowIso,
    }));
    if (ratingInserts.length > 0) {
      const { error: insRatErr } = await supabaseAdmin
        .from('player_ratings')
        .insert(ratingInserts);
      if (insRatErr) {
        logger.error('[rating] rebuild: insert ratings error', insRatErr);
      }
    }

    if (history.length > 0) {
      const historyInsert = history.map((r) => ({
        tenant_id: tenantId,
        user_id: r.userId,
        match_id: r.matchId,
        tournament_id: r.tournamentId,
        rating_before: r.ratingBefore,
        rating_after: r.ratingAfter,
        rd_before: r.rdBefore,
        rd_after: r.rdAfter,
        volatility_before: r.volatilityBefore,
        volatility_after: r.volatilityAfter,
        opponent_avg_rating: r.opponentAvgRating,
        result: r.result,
        occurred_at: r.occurredAt || nowIso,
      }));
      const { error: insHistErr } = await supabaseAdmin
        .from('player_rating_history')
        .insert(historyInsert);
      if (insHistErr) {
        logger.error('[rating] rebuild: insert history error', insHistErr);
      }
    }

    // 6) Recalcul team_ratings pour toutes les équipes du tenant.
    const { data: teamRows, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('tenant_id', tenantId);
    if (teamErr) {
      logger.error('[rating] rebuild: teams read error', teamErr);
    } else {
      const teamIds = ((teamRows || []) as Array<{ id: string }>).map(
        (t) => t.id
      );
      if (teamIds.length > 0) {
        await recomputeTeamRatingsFor(tenantId, teamIds);
      }
    }

    return { players: ratings.size, matches: notableMatches.length };
  } catch (err) {
    logger.error('[rating] rebuildRatings exception', err);
    return { players: 0, matches: 0 };
  }
}
