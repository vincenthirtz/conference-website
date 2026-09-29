// features/admin/ratings/service.ts — rating joueur côté staff.
//
// COUVERTURE : combien de matchs terminés ont effectivement produit des
// ratings, et POURQUOI les autres n'en ont pas. Le moteur Glicko-2 a besoin
// de participants des DEUX côtés ; `match_participants` est un snapshot du
// roster : une équipe sans membre rattaché à un compte ne produit rien, en
// silence (constat prod du 2026-07-31 : 7 matchs terminés, 1 seul noté).
//   reason : 'no_participants' (aucun côté snapshotté) | 'one_side_only'
//            (un seul côté) | 'unknown' (deux côtés mais aucune ligne
//            d'historique — anomalie réelle, à investiguer).
//
// RECALCUL : rejoue tout le classement du tenant (`rebuildRatings`, util
// partagé avec l'application incrémentale des scores).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import { rebuildRatings } from '@/utils/rating/applyMatchRating';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import {
  MAX_COVERAGE_SAMPLES,
  type RatingCoverageReason,
  type RatingCoverageResponse,
  type RatingCoverageSample,
} from './schemas';

export async function getRatingCoverage(
  ctx: ServiceContext
): Promise<RatingCoverageResponse> {
  // 1) Matchs « notables » : mêmes critères que rebuildRatings (terminé ou
  //    walkover, pas un bye, vainqueur et deux équipes connus).
  const { rows: matchRows, error: matchErr } = await repo.listFinishedMatches(
    ctx.db,
    ctx.tenantId
  );
  if (matchErr) {
    ctx.logger.error('[ratings/coverage] matches read error', matchErr);
    throw new AdminError(500, 'internal', 'Lecture des matchs impossible.');
  }

  const matches = matchRows
    .map((m) => ({
      id: m.id,
      team1Id: m.team1_id ?? null,
      team2Id: m.team2_id ?? null,
      completedAt: m.completed_at ?? null,
      isBye: Boolean(m.is_bye),
      winnerTeamId: m.winner_team_id ?? null,
    }))
    .filter((m) => !m.isBye && m.winnerTeamId && m.team1Id && m.team2Id);

  if (matches.length === 0) {
    return { finished: 0, rated: 0, unrated: 0, samples: [] };
  }

  // 2) Matchs ayant produit au moins une ligne d'historique = matchs notés.
  const { history, participants, teams } = await repo.readCoverageInputs(
    ctx.db,
    ctx.tenantId,
    matches.map((m) => m.id)
  );
  if (history.error) {
    ctx.logger.error('[ratings/coverage] history read error', history.error);
    throw new AdminError(
      500,
      'internal',
      "Lecture de l'historique impossible."
    );
  }

  const ratedMatchIds = new Set<string>();
  for (const row of history.rows) {
    if (row.match_id) ratedMatchIds.add(row.match_id);
  }

  // Côtés effectivement snapshottés, par match.
  const sidesByMatch = new Map<string, Set<string>>();
  for (const row of participants) {
    if (!row.team_id || !row.match_id) continue;
    const set = sidesByMatch.get(row.match_id) ?? new Set<string>();
    set.add(row.team_id);
    sidesByMatch.set(row.match_id, set);
  }

  const teamName = new Map<string, string>();
  for (const t of teams) teamName.set(t.id, t.name);

  const samples: RatingCoverageSample[] = [];
  for (const m of matches) {
    if (ratedMatchIds.has(m.id)) continue;
    if (samples.length >= MAX_COVERAGE_SAMPLES) break;

    const sides = sidesByMatch.get(m.id);
    let reason: RatingCoverageReason;
    if (!sides || sides.size === 0) reason = 'no_participants';
    else if (sides.size < 2) reason = 'one_side_only';
    else reason = 'unknown';

    samples.push({
      matchId: m.id,
      reason,
      team1: m.team1Id ? (teamName.get(m.team1Id) ?? null) : null,
      team2: m.team2Id ? (teamName.get(m.team2Id) ?? null) : null,
      completedAt: m.completedAt,
    });
  }

  const rated = matches.filter((m) => ratedMatchIds.has(m.id)).length;
  return {
    finished: matches.length,
    rated,
    unrated: matches.length - rated,
    samples,
  };
}

export async function rebuildTenantRatings(
  ctx: ServiceContext
): Promise<Audited<{ players: number; matches: number }>> {
  const result = await rebuildRatings(ctx.tenantId);
  return {
    result,
    audit: {
      entity_type: 'player_ratings',
      entity_id: null,
      payload: {
        operation: 'rating_rebuild',
        players: result.players,
        matches: result.matches,
      },
    },
  };
}
