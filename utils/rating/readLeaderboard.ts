// utils/rating/readLeaderboard.ts
//
// Lecture partagée du classement public des joueuses par rating Glicko-2
// persistant : tri rating desc (tie-break user_id asc), filtre
// `games_played > 0`, pagination DB via `.range(offset, offset+limit-1)` et
// rank global (offset + i + 1). On ne charge QUE la page, jamais toute la table.
//
// Extrait depuis `pages/api/players/leaderboard.ts` afin d'être réutilisable
// côté ISR (`getStaticProps` de `pages/leaderboard.tsx`) SANS appel HTTP au
// build. Le handler API délègue désormais ici et renvoie exactement la même
// shape / pagination.

import { maskBattleTag } from '../battleTag';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { readPlayerTeamBadges } from '@/utils/teams/readPlayerTeamBadges';
import type {
  LeaderboardPlayer,
  LeaderboardResponse,
  PlayerRatingRow,
} from '@/types/rating';

/**
 * Lit une page du classement public des joueuses pour un tenant donné.
 *
 * Le rank est la position globale (offset + i + 1) parmi les joueuses notées.
 * La pagination est déléguée à la DB via `.range()` sur la requête triée
 * (`rating DESC`, tie-break `user_id ASC`) : on ne transfère QUE la page
 * demandée, jamais toute la table `player_ratings`. L'ordre DB EST l'ordre
 * logique, donc `rank = offset + i + 1`.
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
    .order('rating', { ascending: false })
    .order('user_id', { ascending: true })
    .range(offset, offset + limit - 1);

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

  // Tri défensif de la SEULE page (l'ordre DB est la source de vérité ; ce tri
  // ne couvre que le cas où le mock de test ne réordonne pas). Même clé que la
  // requête : rating desc, puis user_id asc.
  rows.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });

  // Repli d'avatar : le logo de l'équipe pour les joueuses sans photo. Une
  // seule requête pour toute la page ; en cas d'échec, la Map est vide et les
  // vues retombent sur les initiales.
  const badges = await readPlayerTeamBadges(
    tenantId,
    rows.map((r) => r.user_id)
  );

  const players: LeaderboardPlayer[] = rows.map((r, i) => {
    const badge = badges.get(r.user_id);
    return {
      userId: r.user_id,
      displayName: r.display_name ?? null,
      // Anonymat public (cf. utils/battleTag.ts) : le classement est une
      // surface PUBLIQUE, on n'y sérialise jamais l'identifiant numérique —
      // sinon n'importe qui peut ajouter la joueuse en jeu depuis le
      // classement.
      battleTag: maskBattleTag(r.battle_tag ?? null),
      avatarUrl: r.avatar_url ?? null,
      teamName: badge?.teamName ?? null,
      teamSlug: badge?.teamSlug ?? null,
      teamLogoUrl: badge?.logoUrl ?? null,
      rating: r.rating,
      rd: r.rd,
      gamesPlayed: r.games_played,
      wins: r.wins,
      losses: r.losses,
      rank: offset + i + 1,
    };
  });

  return { players };
}
