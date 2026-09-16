// utils/rating/readPlayerBadges.ts
//
// Les BADGES de plusieurs joueuses, en un nombre de lectures qui ne dépend pas
// du nombre de joueuses. Seul consommateur aujourd'hui : l'ouverture d'un
// paquet TCG (`pages/api/player/tcg/packs.ts`), dont la rareté des cartes
// joueuses se déduit des badges (`cardRarity`).
//
// POURQUOI CE MODULE. La rareté appelait `readPlayerProfile` PAR CARTE, pour
// n'en garder que `achievements.badges` : ~16 requêtes base + un appel GoTrue
// par joueuse (rang, Twitch, face-à-face, noms de tournois… tout ce qu'une
// carte ignore), jusqu'à cinq fois — ~85 allers-retours au geste du soir de
// match, une ouverture de paquet par victoire. Ici : 7 lectures au plus pour
// tout le paquet (davantage seulement au-delà de 150 identifiants ou de 1 000
// lignes, cf. `readAllIn`), aucune vers GoTrue.
//
// CONTRAT : PARITÉ STRICTE avec `readPlayerProfile(id).achievements.badges`.
// Une rareté différente serait un bug d'économie visible des joueuses. Les
// règles qui décident d'un badge ne sont donc PAS recopiées : le réducteur
// (`computeAchievements`), la détection de compte supprimé
// (`isAnonymisedRating`), le périmètre palmarès/saisons (`derivePlayerScope`),
// le filtre de ligue publiée et l'ordre de l'historique viennent tous de
// `readPlayerProfile.ts`. Ce qui reste propre à ce fichier est le REGROUPEMENT :
// une lecture `.in(...)` pour toutes, puis le tri par joueuse. La parité est
// vérifiée contre une copie figée de l'ancienne lecture
// (tests/unit/playerBadgesParity.test.ts).
//
// CE QUI N'EST PAS LU, ET POURQUOI C'EST SANS EFFET SUR LES BADGES. Rang,
// Twitch, matchs récents, face-à-face, libellés des tournois, des équipes et
// des ligues : aucun n'entre dans `computeAchievements`, qui ne regarde que
// les rangs du palmarès et des saisons, le peak, le nombre de matchs et la
// suite des résultats.
//
// ERREURS — même sort que dans la lecture du profil, joueuse par joueuse :
//   - `player_ratings` illisible : LÈVE (le profil levait ; l'appelant retombe
//     sur `common`) ;
//   - historique, participations ou matchs illisibles : lus comme vides (le
//     profil ignorait ces erreurs) ;
//   - `final_rankings`, `league_standings` ou `leagues` illisibles : badges
//     VIDES, mais seulement pour les joueuses dont le profil aurait RÉELLEMENT
//     émis cette lecture (le profil sautait `final_rankings` sans tournoi, et
//     gardait alors son badge de peak). Une panne ne doit pas « contaminer »
//     une joueuse que l'ancienne lecture n'aurait pas exposée à la panne.
// Seules divergences possibles, et uniquement sur panne base : les lectures
// que ce module n'émet plus (rang, libellés) ne peuvent plus échouer, donc ne
// peuvent plus vider des badges. Voir le rapport de la vague 4c.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { computeAchievements } from '@/utils/profile/achievements';
import {
  compareOccurredAtAsc,
  derivePlayerScope,
  isAnonymisedRating,
  isPublishedLeague,
  placementPairKey,
} from '@/utils/rating/readPlayerProfile';
import type { ProfileBadge } from '@/types/rating';

/** Page de lecture : la limite par défaut de PostgREST (`max-rows`). */
const PAGE_SIZE = 1000;
/**
 * Plafond de pages par tronçon. Au-delà, on LÈVE plutôt que de décider d'une
 * rareté sur une lecture tronquée (l'appelant retombe sur `common`).
 */
const MAX_PAGES = 20;
/**
 * Identifiants par requête `.in(...)`. Cinq joueuses peuvent cumuler des
 * centaines de matchs : sans découpage, la liste d'UUID ferait une URL
 * PostgREST de plusieurs dizaines de Ko.
 */
const IN_CHUNK = 150;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Toutes les lignes d'une lecture `.in(column, ids)`, découpée en tronçons et
 * paginée. `build` reçoit un tronçon d'identifiants et doit poser un ORDRE
 * STABLE (`.order('id')`) : sans lui, deux pages pourraient se chevaucher ou
 * laisser un trou.
 *
 * Rend `{ error }` à la première page en échec plutôt que de lever : c'est à
 * l'appelant de reproduire le sort que le profil réservait à cette lecture.
 */
async function readAllIn<T>(
  ids: readonly string[],
  build: (
    chunk: string[],
    from: number,
    to: number
  ) => PromiseLike<PageResult<T>>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await build(chunk, from, from + PAGE_SIZE - 1);
      if (error) return { rows: [], error: error.message };
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    if (!complete) {
      throw new Error(
        `[readPlayerBadges] plus de ${MAX_PAGES * PAGE_SIZE} lignes par tronçon — abandon`
      );
    }
  }
  return { rows, error: null };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const arr = map.get(k);
    if (arr) arr.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/**
 * Badges de chaque joueuse demandée, identiques à
 * `readPlayerProfile(id, tenantId)?.achievements.badges ?? []`.
 *
 * Toute joueuse demandée a une entrée — `[]` pour une joueuse sans ligne de
 * classement ou dont le compte a été supprimé (le profil rendait alors une
 * fiche non classée, ou `null` : zéro badge dans les deux cas).
 *
 * @throws si `player_ratings` est illisible (cf. l'en-tête).
 */
export async function readPlayerBadges(
  tenantId: string,
  userIds: readonly string[]
): Promise<Map<string, ProfileBadge[]>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, ProfileBadge[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return out;

  // 1) Lignes de classement. Mêmes colonnes que le profil : la détection de
  //    compte supprimé les examine, en retirer une la rendrait aveugle.
  const ratings = await readAllIn<{
    user_id: string;
    peak_rating: number;
    games_played: number;
    wins: number;
    losses: number;
  }>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from('player_ratings')
      .select(
        'user_id, rating, rd, volatility, peak_rating, games_played, wins, losses, display_name, battle_tag, avatar_url'
      )
      .eq('tenant_id', tenantId)
      .in('user_id', chunk)
      // Une ligne par (espace, joueuse) : `user_id` suffit à un ordre stable.
      .order('user_id', { ascending: true })
      .range(from, to)
  );
  if (ratings.error) {
    logger.error('[readPlayerBadges] player_ratings read error', ratings.error);
    throw new Error('Failed to load player badges');
  }
  const ratingByUser = new Map(
    ratings.rows
      .filter((r) => !isAnonymisedRating(r as Record<string, unknown>))
      .map((r) => [r.user_id, r])
  );
  const rated = [...ratingByUser.keys()];
  if (rated.length === 0) return out;

  // 2) Historique et participations : indépendants, lus ensemble. Une erreur
  //    les rend vides — le profil ignorait l'erreur de ces deux lectures.
  const [history, parts] = await Promise.all([
    readAllIn<{
      user_id: string;
      occurred_at: string;
      result: 'win' | 'loss' | 'draw';
    }>(rated, (chunk, from, to) =>
      supabaseAdmin
        .from('player_rating_history')
        .select('id, user_id, occurred_at, result')
        .eq('tenant_id', tenantId)
        .in('user_id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAllIn<{
      user_id: string;
      match_id: string;
      team_id: string;
      is_substitute: boolean | null;
    }>(rated, (chunk, from, to) =>
      supabaseAdmin
        .from('match_participants')
        .select('id, user_id, match_id, team_id, is_substitute')
        .eq('tenant_id', tenantId)
        .in('user_id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);
  const historyByUser = groupBy(history.rows, (r) => r.user_id);
  const partsByUser = groupBy(
    parts.rows.filter((p) => !p.is_substitute),
    (p) => p.user_id
  );

  // 3) Tournoi de chaque match joué — base des paires du palmarès. Erreur =
  //    aucun match connu, comme dans le profil.
  const allMatchIds = [
    ...new Set([...partsByUser.values()].flat().map((p) => p.match_id)),
  ];
  const tournamentOfMatch = new Map<string, string | null>();
  if (allMatchIds.length > 0) {
    const matches = await readAllIn<{
      id: string;
      tournament_id: string | null;
    }>(allMatchIds, (chunk, from, to) =>
      supabaseAdmin
        .from('matches')
        .select('id, tournament_id')
        .eq('tenant_id', tenantId)
        .in('id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    );
    for (const m of matches.rows) tournamentOfMatch.set(m.id, m.tournament_id);
  }

  const scopeByUser = new Map(
    rated.map((userId) => [
      userId,
      derivePlayerScope(partsByUser.get(userId) ?? [], (matchId) =>
        tournamentOfMatch.get(matchId)
      ),
    ])
  );
  const scopes = [...scopeByUser.values()];
  const allTournamentIds = [
    ...new Set(scopes.flatMap((s) => s.playerPairs.map((p) => p.tournamentId))),
  ];
  const allTeamIds = [...new Set(scopes.flatMap((s) => s.teamIds))];

  // 4) Classements finaux et standings de ligue : indépendants.
  const [rankings, standings] = await Promise.all([
    allTournamentIds.length > 0
      ? readAllIn<{ tournament_id: string; team_id: string; rank: number }>(
          allTournamentIds,
          (chunk, from, to) =>
            supabaseAdmin
              .from('final_rankings')
              .select('id, tournament_id, team_id, rank')
              .eq('tenant_id', tenantId)
              .in('tournament_id', chunk)
              .order('id', { ascending: true })
              .range(from, to)
        )
      : Promise.resolve({ rows: [], error: null }),
    allTeamIds.length > 0
      ? readAllIn<{
          league_id: string;
          team_id: string;
          rank: number | null;
          points: number | null;
        }>(allTeamIds, (chunk, from, to) =>
          supabaseAdmin
            .from('league_standings')
            .select('id, league_id, team_id, rank, points')
            .eq('tenant_id', tenantId)
            .in('team_id', chunk)
            .order('id', { ascending: true })
            .range(from, to)
        )
      : Promise.resolve({ rows: [], error: null }),
  ]);

  // 5) Ligues publiées, parmi celles des standings lus.
  const allLeagueIds = [...new Set(standings.rows.map((s) => s.league_id))];
  const published = new Set<string>();
  let leaguesError: string | null = null;
  if (allLeagueIds.length > 0) {
    const leagues = await readAllIn<{
      id: string;
      is_public: boolean | null;
      status: string | null;
    }>(allLeagueIds, (chunk, from, to) =>
      supabaseAdmin
        .from('leagues')
        .select('id, is_public, status')
        .eq('tenant_id', tenantId)
        .in('id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    );
    leaguesError = leagues.error;
    for (const l of leagues.rows) {
      if (isPublishedLeague(l)) published.add(l.id);
    }
  }

  for (const userId of rated) {
    const pr = ratingByUser.get(userId)!;
    const scope = scopeByUser.get(userId)!;
    const tournamentIds = new Set(scope.playerPairs.map((p) => p.tournamentId));
    const teamIds = new Set(scope.teamIds);
    const myStandings = standings.rows.filter((s) => teamIds.has(s.team_id));
    const myLeagueIds = new Set(myStandings.map((s) => s.league_id));

    // Échec d'une lecture de palmarès/saisons : le profil vidait TOUT le bloc,
    // mais seulement s'il avait émis la lecture — c'est-à-dire si la joueuse
    // avait un tournoi (final_rankings), une équipe (league_standings) ou un
    // standing (leagues).
    const achievementsFailed =
      (rankings.error !== null && tournamentIds.size > 0) ||
      (standings.error !== null && teamIds.size > 0) ||
      (leaguesError !== null && myLeagueIds.size > 0);
    if (achievementsFailed) {
      logger.error(
        '[readPlayerBadges] achievements aggregation error',
        rankings.error ?? standings.error ?? leaguesError
      );
      continue; // reste à []
    }

    const wantedPairs = new Set(
      scope.playerPairs.map((p) => placementPairKey(p.tournamentId, p.teamId))
    );
    // Libellés à null : `computeAchievements` ne les lit pas pour les badges.
    const placements = rankings.rows
      .filter((r) =>
        wantedPairs.has(placementPairKey(r.tournament_id, r.team_id))
      )
      .map((r) => ({
        tournamentId: r.tournament_id,
        tournamentName: null,
        tournamentSlug: null,
        teamId: r.team_id,
        teamName: null,
        rank: r.rank,
        date: null,
      }));
    const seasons = myStandings
      .filter((s) => published.has(s.league_id))
      .map((s) => ({
        leagueId: s.league_id,
        leagueName: null,
        leagueSlug: null,
        teamId: s.team_id,
        teamName: null,
        rank: s.rank ?? null,
        points: Number.isFinite(s.points) ? (s.points as number) : 0,
      }));

    const results = [...(historyByUser.get(userId) ?? [])]
      .sort(compareOccurredAtAsc)
      .map((h) => ({ result: h.result, occurredAt: h.occurred_at }));

    out.set(
      userId,
      computeAchievements({
        placements,
        stats: {
          peakRating: pr.peak_rating,
          gamesPlayed: pr.games_played,
          wins: pr.wins,
          losses: pr.losses,
        },
        results,
        seasons,
      }).badges
    );
  }

  return out;
}
