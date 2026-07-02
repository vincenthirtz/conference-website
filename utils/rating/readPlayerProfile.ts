// utils/rating/readPlayerProfile.ts
//
// Lecture partagée du profil public complet d'une joueuse : rating actuel +
// rang, courbe d'history, matches récents et head-to-head.
//
// Extrait depuis `pages/api/players/[userId]/profile.ts` afin d'être
// réutilisable côté ISR (`getStaticProps` de `pages/player/[userId].tsx`)
// SANS appel HTTP au build. Le handler API délègue désormais ici et renvoie
// exactement la même shape.
//
// Convention de retour : `null` = joueuse introuvable (aucune ligne
// `player_ratings`) → 404 côté handler / `notFound: true` côté page.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type {
  PlayerProfileResponse,
  PlayerProfileCore,
  PlayerProfileHistoryPoint,
  PlayerProfileRecentMatch,
  PlayerProfileH2H,
  PlayerRatingRow,
} from '@/types/rating';

const RECENT_MATCHES_LIMIT = 20;
const H2H_TOP_LIMIT = 10;

type HistoryRow = {
  match_id: string;
  tournament_id: string | null;
  occurred_at: string;
  rating_before: number;
  rating_after: number;
  result: 'win' | 'loss' | 'draw';
  opponent_avg_rating: number | null;
};

type ParticipantRow = {
  match_id: string;
  team_id: string;
  user_id: string;
  battle_tag: string | null;
  is_substitute: boolean | null;
};

type MatchRow = {
  id: string;
  tournament_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
};

/**
 * Lit le profil public d'une joueuse pour un tenant donné.
 *
 * @returns la réponse `PlayerProfileResponse` ou `null` si la joueuse n'a
 *   aucune ligne `player_ratings` (= introuvable).
 * @throws en cas d'erreur DB non récupérable (le handler / getStaticProps
 *   décide comment la traiter).
 */
export async function readPlayerProfile(
  userId: string,
  tenantId: string
): Promise<PlayerProfileResponse | null> {
  // 1) player_ratings du joueur → null si absent.
  const { data: prRow, error: prErr } = await supabaseAdmin
    .from('player_ratings')
    .select(
      'user_id, rating, rd, volatility, peak_rating, games_played, wins, losses, display_name, battle_tag, avatar_url'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (prErr) {
    logger.error('[readPlayerProfile] player_ratings read error', prErr);
    throw new Error('Failed to load player');
  }
  if (!prRow) {
    return null;
  }
  const pr = prRow as Pick<
    PlayerRatingRow,
    | 'user_id'
    | 'rating'
    | 'rd'
    | 'volatility'
    | 'peak_rating'
    | 'games_played'
    | 'wins'
    | 'losses'
    | 'display_name'
    | 'battle_tag'
    | 'avatar_url'
  >;

  // 2) Rank = position par rating desc parmi les joueurs notés.
  const { data: allRated } = await supabaseAdmin
    .from('player_ratings')
    .select('user_id, rating')
    .eq('tenant_id', tenantId)
    .gt('games_played', 0);
  const rated = (allRated || []) as Array<{
    user_id: string;
    rating: number;
  }>;
  let rank = 0;
  {
    const sorted = [...rated].sort((a, b) => b.rating - a.rating);
    const idx = sorted.findIndex((r) => r.user_id === userId);
    rank = idx >= 0 ? idx + 1 : sorted.length + 1;
  }

  const player: PlayerProfileCore = {
    userId: pr.user_id,
    displayName: pr.display_name ?? null,
    battleTag: pr.battle_tag ?? null,
    avatarUrl: pr.avatar_url ?? null,
    rating: pr.rating,
    rd: pr.rd,
    volatility: pr.volatility,
    peakRating: pr.peak_rating,
    gamesPlayed: pr.games_played,
    wins: pr.wins,
    losses: pr.losses,
    rank,
  };

  // 3) History (courbe), chrono ASC.
  const { data: histRows } = await supabaseAdmin
    .from('player_rating_history')
    .select(
      'match_id, tournament_id, occurred_at, rating_before, rating_after, result, opponent_avg_rating'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  const historyRaw = (histRows || []) as HistoryRow[];
  historyRaw.sort((a, b) =>
    (a.occurred_at || '') < (b.occurred_at || '')
      ? -1
      : (a.occurred_at || '') > (b.occurred_at || '')
        ? 1
        : 0
  );
  const history: PlayerProfileHistoryPoint[] = historyRaw.map((h) => ({
    matchId: h.match_id,
    tournamentId: h.tournament_id,
    occurredAt: h.occurred_at,
    ratingBefore: h.rating_before,
    ratingAfter: h.rating_after,
    result: h.result,
    opponentAvgRating: h.opponent_avg_rating,
  }));

  // 4) Participations du joueur (non-sub) → base des recentMatches + H2H.
  const { data: myParts } = await supabaseAdmin
    .from('match_participants')
    .select('match_id, team_id, user_id, battle_tag, is_substitute')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  const myPartsRows = ((myParts || []) as ParticipantRow[]).filter(
    (p) => !p.is_substitute
  );
  const myMatchIds = [...new Set(myPartsRows.map((p) => p.match_id))];
  const myTeamByMatch = new Map<string, string>();
  for (const p of myPartsRows) myTeamByMatch.set(p.match_id, p.team_id);

  // 5) Charger les matches concernés + tous les participants de ces matches.
  const matchById = new Map<string, MatchRow>();
  const partsByMatch = new Map<string, ParticipantRow[]>();
  if (myMatchIds.length > 0) {
    const { data: matchRows } = await supabaseAdmin
      .from('matches')
      .select(
        'id, tournament_id, team1_id, team2_id, winner_team_id, completed_at'
      )
      .eq('tenant_id', tenantId)
      .in('id', myMatchIds);
    for (const m of (matchRows || []) as MatchRow[]) matchById.set(m.id, m);

    const { data: allParts } = await supabaseAdmin
      .from('match_participants')
      .select('match_id, team_id, user_id, battle_tag, is_substitute')
      .eq('tenant_id', tenantId)
      .in('match_id', myMatchIds);
    for (const p of (allParts || []) as ParticipantRow[]) {
      const arr = partsByMatch.get(p.match_id) ?? [];
      arr.push(p);
      partsByMatch.set(p.match_id, arr);
    }
  }

  // 6) recentMatches (desc, ~20) + opponent team name.
  const recentSource = myMatchIds
    .map((id) => matchById.get(id))
    .filter((m): m is MatchRow => !!m)
    .sort((a, b) =>
      (b.completed_at || '') < (a.completed_at || '')
        ? -1
        : (b.completed_at || '') > (a.completed_at || '')
          ? 1
          : 0
    )
    .slice(0, RECENT_MATCHES_LIMIT);

  const opponentTeamIds = new Set<string>();
  for (const m of recentSource) {
    const myTeam = myTeamByMatch.get(m.id);
    const opponentTeamId = myTeam === m.team1_id ? m.team2_id : m.team1_id;
    if (opponentTeamId) opponentTeamIds.add(opponentTeamId);
  }
  const teamNames = new Map<string, string>();
  if (opponentTeamIds.size > 0) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', [...opponentTeamIds]);
    for (const t of (teamRows || []) as Array<{ id: string; name: string }>) {
      teamNames.set(t.id, t.name);
    }
  }

  const recentMatches: PlayerProfileRecentMatch[] = recentSource.map((m) => {
    const myTeam = myTeamByMatch.get(m.id) ?? null;
    const opponentTeamId = myTeam === m.team1_id ? m.team2_id : m.team1_id;
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (m.winner_team_id) {
      result = m.winner_team_id === myTeam ? 'win' : 'loss';
    }
    return {
      matchId: m.id,
      tournamentId: m.tournament_id,
      occurredAt: m.completed_at ?? '',
      result,
      opponentTeamId: opponentTeamId ?? null,
      opponentTeamName: opponentTeamId
        ? (teamNames.get(opponentTeamId) ?? null)
        : null,
    };
  });

  // 7) H2H : agrège par opponent user_id sur toutes les participations.
  type H2HAgg = {
    wins: number;
    losses: number;
    games: number;
    displayName: string | null;
    battleTag: string | null;
  };
  const h2hAgg = new Map<string, H2HAgg>();
  for (const matchId of myMatchIds) {
    const match = matchById.get(matchId);
    if (!match || !match.winner_team_id) continue;
    const myTeam = myTeamByMatch.get(matchId);
    if (!myTeam) continue;
    const won = match.winner_team_id === myTeam;
    const parts = partsByMatch.get(matchId) ?? [];
    for (const p of parts) {
      if (p.is_substitute) continue;
      if (p.team_id === myTeam) continue; // même camp
      if (p.user_id === userId) continue;
      const e =
        h2hAgg.get(p.user_id) ??
        ({
          wins: 0,
          losses: 0,
          games: 0,
          displayName: null,
          battleTag: p.battle_tag ?? null,
        } as H2HAgg);
      e.games += 1;
      if (won) e.wins += 1;
      else e.losses += 1;
      if (!e.battleTag && p.battle_tag) e.battleTag = p.battle_tag;
      h2hAgg.set(p.user_id, e);
    }
  }

  // Best-effort display_name pour les adversaires : via player_ratings.
  const oppUserIds = [...h2hAgg.keys()];
  if (oppUserIds.length > 0) {
    const { data: oppRatings } = await supabaseAdmin
      .from('player_ratings')
      .select('user_id, display_name, battle_tag')
      .eq('tenant_id', tenantId)
      .in('user_id', oppUserIds);
    for (const r of (oppRatings || []) as Array<{
      user_id: string;
      display_name: string | null;
      battle_tag: string | null;
    }>) {
      const e = h2hAgg.get(r.user_id);
      if (e) {
        if (r.display_name) e.displayName = r.display_name;
        if (!e.battleTag && r.battle_tag) e.battleTag = r.battle_tag;
      }
    }
  }

  const h2h: PlayerProfileH2H[] = [...h2hAgg.entries()]
    .map(([opponentUserId, e]) => ({
      opponentUserId,
      opponentDisplayName: e.displayName,
      opponentBattleTag: e.battleTag,
      wins: e.wins,
      losses: e.losses,
      games: e.games,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, H2H_TOP_LIMIT);

  return {
    player,
    history,
    recentMatches,
    h2h,
  };
}
