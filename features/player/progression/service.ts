// features/player/progression/service.ts — progression et jalons (N8).
//
// `player_rating_history` existe depuis le début et n'était restituée nulle
// part : aucune courbe, aucun jalon. Deux échelles, dans la même réponse
// parce qu'elles se lisent ensemble :
//   - MON niveau (série, variation, meilleur atteint) ;
//   - les JALONS de mon équipe (premier affrontement, première victoire,
//     palier franchi, série en cours), qui donnent son contexte à la courbe.
//
// Aucun jalon fabriqué : chaque entrée est un fait pointable dans une table
// (cf. utils/teams/progression.ts).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { AdminError } from '@/utils/admin/errors';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import {
  buildRatingSeries,
  computeMilestones,
  peakRating,
  ratingDelta,
  type RatingHistoryRow,
} from '@/utils/teams/progression';
import { readCurrentRating, readRatingHistory } from './repository';
import type { ProgressionResponse } from './schemas';

export type ProgressionContext = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** Joueuse dont on lit la progression (sujet : elle, ou l'inspectée). */
  userId: string;
};

const EMPTY: ProgressionResponse = {
  teamId: null,
  teamName: null,
  rating: null,
  peak: null,
  delta: null,
  series: [],
  ratedGames: 0,
  milestones: [],
};

/**
 * `hasTeam` distingue les deux réponses : la route ne met en cache (60 s)
 * que celle qui porte les jalons d'équipe — comme avant migration.
 */
export async function getProgression(
  ctx: ProgressionContext,
  requestedTeamId: string | null
): Promise<{ payload: ProgressionResponse; hasTeam: boolean }> {
  const { db, tenantId, userId } = ctx;
  const [team, historyRes, rawRating] = await Promise.all([
    findMemberTeam(userId, tenantId, requestedTeamId),
    readRatingHistory(db, tenantId, userId),
    readCurrentRating(db, tenantId, userId),
  ]);

  if (historyRes.error) {
    ctx.logger.error('[progression] history error', historyRes.error);
    throw new AdminError(500, 'internal', 'Lecture du niveau impossible.');
  }

  const history: RatingHistoryRow[] = historyRes.rows.map((row) => ({
    occurredAt: row.occurred_at ?? null,
    ratingAfter:
      row.rating_after === null || row.rating_after === undefined
        ? null
        : Number(row.rating_after),
  }));

  const rating =
    typeof rawRating === 'number' && Number.isFinite(rawRating)
      ? Math.round(rawRating)
      : null;

  const series = buildRatingSeries(history);

  // Sans équipe, on rend quand même MA progression : elle m'appartient et ne
  // dépend pas d'un roster. Seuls les jalons d'équipe disparaissent.
  if (!team) {
    return {
      hasTeam: false,
      payload: {
        ...EMPTY,
        rating,
        peak: peakRating(history, rating),
        delta: ratingDelta(series),
        series,
        ratedGames: history.length,
      },
    };
  }

  const games = await loadPlayedGames(tenantId, team.id);
  return {
    hasTeam: true,
    payload: {
      teamId: team.id,
      teamName: team.name,
      rating,
      peak: peakRating(history, rating),
      delta: ratingDelta(series),
      series,
      ratedGames: history.length,
      milestones: computeMilestones({
        games,
        teamId: team.id,
        history,
        currentRating: rating,
      }),
    },
  };
}
