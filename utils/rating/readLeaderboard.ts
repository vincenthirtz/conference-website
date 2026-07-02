// utils/rating/readLeaderboard.ts
//
// Lecture partagée du classement public des joueuses par rating Glicko-2
// persistant : tri rating desc, filtre `games_played > 0`, calcul du rank
// global (offset + i + 1) puis tranche [offset, offset+limit).
//
// Extrait depuis `pages/api/players/leaderboard.ts` afin d'être réutilisable
// côté ISR (`getStaticProps` de `pages/leaderboard.tsx`) SANS appel HTTP au
// build. Le handler API délègue désormais ici et renvoie exactement la même
// shape / pagination.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  PlayerRatingRow,
} from '@/types/rating';

/**
 * Lit une page du classement public des joueuses pour un tenant donné.
 *
 * Le rank est la position globale (offset + i + 1) parmi les joueuses notées
 * triées par rating desc. On lit tous les joueurs notés triés puis on tranche —
 * les ensembles sont petits (dizaines à centaines de joueurs).
 *
 * @throws en cas d'erreur DB non récupérable (le handler / getStaticProps
 *   décide comment la traiter).
 */
export async function readLeaderboard(
  tenantId: string,
  limit: number,
  offset: number
): Promise<LeaderboardResponse> {
  const { data, error } = await supabaseAdmin
    .from('player_ratings')
    .select(
      'user_id, rating, rd, games_played, wins, losses, display_name, battle_tag, avatar_url'
    )
    .eq('tenant_id', tenantId)
    .gt('games_played', 0)
    .order('rating', { ascending: false });

  if (error) {
    logger.error('[readLeaderboard] read error', error);
    throw new Error('Failed to load leaderboard');
  }

  const rows = (data || []) as Array<
    Pick<
      PlayerRatingRow,
      | 'user_id'
      | 'rating'
      | 'rd'
      | 'games_played'
      | 'wins'
      | 'losses'
      | 'display_name'
      | 'battle_tag'
      | 'avatar_url'
    >
  >;

  // Tri défensif (le mock ne trie pas) : rating desc, puis user_id asc.
  rows.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });

  const sliced = rows.slice(offset, offset + limit);
  const players: LeaderboardPlayer[] = sliced.map((r, i) => ({
    userId: r.user_id,
    displayName: r.display_name ?? null,
    battleTag: r.battle_tag ?? null,
    avatarUrl: r.avatar_url ?? null,
    rating: r.rating,
    rd: r.rd,
    gamesPlayed: r.games_played,
    wins: r.wins,
    losses: r.losses,
    rank: offset + i + 1,
  }));

  return { players };
}
