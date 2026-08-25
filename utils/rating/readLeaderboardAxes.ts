// utils/rating/readLeaderboardAxes.ts
//
// Axes SECONDAIRES du classement public des joueuses, à côté du rating brut
// servi par `readLeaderboard` :
//   - « progression » : variation de rating sur les 30 derniers jours ;
//   - « saison »      : variation de rating sur les tournois d'une league.
//
// WHY : le rating Glicko-2 est stable par construction, donc le haut du
// classement bouge à peine — les mêmes joueuses y restent des mois. Ces deux
// axes font tourner la mise en avant sans changer le classement de référence :
// une joueuse arrivée le mois dernier peut être 1re en progression.
//
// Les deux axes partagent le même pipeline : lire `player_rating_history`,
// agréger par joueuse (réducteur pur `aggregateRatingDeltas`), puis hydrater
// les identités depuis `player_ratings`.

import { maskBattleTag } from '../battleTag';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  aggregateRatingDeltas,
  type RatingHistoryRow,
} from './aggregateRatingDeltas';
import { readPlayerTeamBadges } from '@/utils/teams/readPlayerTeamBadges';
import type { LeaderboardMover, LeaderboardSeason } from '@/types/rating';

/**
 * Plafond de lignes d'historique lues pour un axe.
 *
 * L'agrégation se fait en mémoire : sans plafond, une saison très longue
 * ferait grossir la requête sans borne. 20 000 lignes couvrent très largement
 * une saison de ce circuit (une joueuse génère une ligne par match noté) ; si
 * le plafond est atteint on le journalise, parce que le classement affiché
 * serait alors tronqué en silence.
 */
const HISTORY_ROW_CAP = 20000;

const HISTORY_COLUMNS = 'user_id, rating_before, rating_after, result';

/** Fenêtre par défaut de l'axe « progression », en jours. */
export const MOVERS_WINDOW_DAYS = 30;

/**
 * Hydrate des deltas agrégés en entrées affichables (pseudo, avatar, rating
 * courant), puis coupe à `limit` et attribue les rangs.
 *
 * Les joueuses absentes de `player_ratings` (rating purgé, compte supprimé)
 * sont écartées : sans identité, une ligne de classement n'a rien à montrer.
 */
async function hydrateMovers(
  tenantId: string,
  deltas: ReturnType<typeof aggregateRatingDeltas>,
  limit: number
): Promise<LeaderboardMover[]> {
  if (deltas.length === 0) return [];

  // On hydrate un peu plus large que `limit` : quelques joueuses peuvent ne
  // plus avoir de ligne `player_ratings` et disparaître à l'hydratation.
  const candidates = deltas.slice(0, limit * 2);
  const { data, error } = await supabaseAdmin
    .from('player_ratings')
    .select('user_id, rating, display_name, battle_tag, avatar_url')
    .eq('tenant_id', tenantId)
    .in(
      'user_id',
      candidates.map((d) => d.userId)
    );

  if (error) {
    logger.error('[readLeaderboardAxes] hydrate error', error);
    return [];
  }

  const byUser = new Map(
    (data ?? []).map((row: any) => [row.user_id as string, row])
  );

  // Repli d'avatar : logo d'équipe pour les joueuses sans photo de profil.
  const badges = await readPlayerTeamBadges(
    tenantId,
    candidates.map((d) => d.userId)
  );

  return candidates
    .map((d) => {
      const identity = byUser.get(d.userId);
      if (!identity) return null;
      const badge = badges.get(d.userId);
      return {
        userId: d.userId,
        displayName: identity.display_name ?? null,
        battleTag: maskBattleTag(identity.battle_tag ?? null),
        avatarUrl: identity.avatar_url ?? null,
        teamName: badge?.teamName ?? null,
        teamSlug: badge?.teamSlug ?? null,
        teamLogoUrl: badge?.logoUrl ?? null,
        rating: Number(identity.rating) || 0,
        delta: d.delta,
        matches: d.matches,
        wins: d.wins,
        losses: d.losses,
        rank: 0,
      } satisfies LeaderboardMover;
    })
    .filter((m): m is LeaderboardMover => m !== null)
    .slice(0, limit)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

/** Journalise une lecture tronquée : le classement affiché serait partiel. */
function warnIfCapped(axis: string, count: number): void {
  if (count >= HISTORY_ROW_CAP) {
    logger.error(
      `[readLeaderboardAxes] ${axis}: plafond de ${HISTORY_ROW_CAP} lignes atteint, classement potentiellement tronqué`
    );
  }
}

/**
 * Axe « progression » : plus fortes variations de rating sur les N derniers
 * jours. Best-effort — renvoie une liste vide en cas d'erreur DB.
 *
 * @param now instant de référence (injecté pour rester testable).
 */
export async function readMonthlyMovers(
  tenantId: string,
  limit: number,
  now: Date = new Date(),
  windowDays: number = MOVERS_WINDOW_DAYS
): Promise<LeaderboardMover[]> {
  if (!supabaseAdmin) return [];

  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const { data, error } = await supabaseAdmin
    .from('player_rating_history')
    .select(HISTORY_COLUMNS)
    .eq('tenant_id', tenantId)
    .gte('occurred_at', since.toISOString())
    .limit(HISTORY_ROW_CAP);

  if (error) {
    logger.error('[readMonthlyMovers] read error', error);
    return [];
  }

  const rows = (data ?? []) as RatingHistoryRow[];
  warnIfCapped('movers', rows.length);
  return hydrateMovers(tenantId, aggregateRatingDeltas(rows), limit);
}

/**
 * Saison mise en avant sur le classement : la league publique en cours, sinon
 * la plus récemment terminée. `null` si le tenant n'a aucune league publique.
 */
export async function readFeaturedSeason(
  tenantId: string
): Promise<LeaderboardSeason | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('id, name, slug, status, start_date, end_date')
    .eq('tenant_id', tenantId)
    .eq('is_public', true)
    .in('status', ['active', 'finished'])
    // 'active' avant 'finished' : la saison en cours prime sur les archives.
    // Postgres trie les textes, et 'active' < 'finished' en ordre alphabétique.
    .order('status', { ascending: true })
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    logger.error('[readFeaturedSeason] read error', error);
    return null;
  }

  const league = (data ?? [])[0] as any;
  if (!league) return null;

  return {
    leagueId: league.id,
    name: league.name,
    slug: league.slug,
    status: league.status,
    startDate: league.start_date ?? null,
    endDate: league.end_date ?? null,
  };
}

/**
 * Axe « saison » : variation de rating cumulée sur les tournois rattachés à
 * une league. Best-effort — liste vide si la saison n'a aucun tournoi ou en
 * cas d'erreur DB.
 */
export async function readSeasonMovers(
  tenantId: string,
  leagueId: string,
  limit: number
): Promise<LeaderboardMover[]> {
  if (!supabaseAdmin) return [];

  const { data: links, error: linkError } = await supabaseAdmin
    .from('league_tournaments')
    .select('tournament_id')
    .eq('tenant_id', tenantId)
    .eq('league_id', leagueId);

  if (linkError) {
    logger.error('[readSeasonMovers] tournaments error', linkError);
    return [];
  }

  const tournamentIds = (links ?? [])
    .map((l: any) => l.tournament_id)
    .filter((id: unknown): id is string => typeof id === 'string');
  if (tournamentIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('player_rating_history')
    .select(HISTORY_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('tournament_id', tournamentIds)
    .limit(HISTORY_ROW_CAP);

  if (error) {
    logger.error('[readSeasonMovers] read error', error);
    return [];
  }

  const rows = (data ?? []) as RatingHistoryRow[];
  warnIfCapped('season', rows.length);
  return hydrateMovers(tenantId, aggregateRatingDeltas(rows), limit);
}
