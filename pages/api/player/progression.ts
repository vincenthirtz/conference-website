// pages/api/player/progression.ts
//
// Progression et jalons (N8).
//
// `player_rating_history` existe depuis le début et n'était restituée nulle
// part : aucune courbe, aucun jalon. Le rating était un chiffre, pas un récit —
// et un chiffre ne motive personne.
//
// Deux échelles, volontairement dans la même réponse parce qu'elles se lisent
// ensemble :
//   - MON niveau (série, variation, meilleur atteint) — c'est le mien, donc
//     personne d'autre ne le voit ici ;
//   - les JALONS de mon équipe (premier affrontement, première victoire, palier
//     franchi, série en cours), qui donnent son contexte à la courbe.
//
// Aucun jalon fabriqué : pas de points, pas de badges, pas de niveaux inventés.
// Chaque entrée est un fait pointable dans une table (cf.
// utils/teams/progression.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import {
  buildRatingSeries,
  computeMilestones,
  peakRating,
  ratingDelta,
  type Milestone,
  type RatingHistoryRow,
  type RatingPoint,
} from '@/utils/teams/progression';
import { logger } from '@/utils/logger';

export type ProgressionResponse = {
  teamId: string | null;
  teamName: string | null;
  /** Mon niveau courant. `null` si jamais notée. */
  rating: number | null;
  /** Meilleur niveau atteint, courant compris. */
  peak: number | null;
  /** Variation sur la fenêtre affichée. `null` sous deux mesures. */
  delta: number | null;
  /** Série chronologique, plafonnée (sparkline de la stat tile). */
  series: RatingPoint[];
  /** Affrontements notés qui alimentent la série. */
  ratedGames: number;
  milestones: Milestone[];
};

type Row = Record<string, unknown>;

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

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'progression')) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const [team, historyRes, ratingRes] = await Promise.all([
    findMemberTeam(user.id, tenantId),
    supabaseAdmin
      .from('player_rating_history')
      .select('occurred_at, rating_after')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: true }),
    supabaseAdmin
      .from('player_ratings')
      .select('rating')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (historyRes.error) {
    logger.error('[progression] history error', historyRes.error);
    return res.status(500).json({ error: 'Lecture du niveau impossible.' });
  }

  const history: RatingHistoryRow[] = ((historyRes.data || []) as Row[]).map(
    (row) => ({
      occurredAt: (row.occurred_at as string | null) ?? null,
      ratingAfter:
        row.rating_after === null || row.rating_after === undefined
          ? null
          : Number(row.rating_after),
    })
  );

  const rawRating = (ratingRes.data as { rating?: number | null } | null)
    ?.rating;
  const rating =
    typeof rawRating === 'number' && Number.isFinite(rawRating)
      ? Math.round(rawRating)
      : null;

  const series = buildRatingSeries(history);

  // Sans équipe, on rend quand même MA progression : elle m'appartient et ne
  // dépend pas d'un roster. Seuls les jalons d'équipe disparaissent.
  if (!team) {
    return res.status(200).json({
      ...EMPTY,
      rating,
      peak: peakRating(history, rating),
      delta: ratingDelta(series),
      series,
      ratedGames: history.length,
    } satisfies ProgressionResponse);
  }

  const games = await loadPlayedGames(tenantId, team.id);

  const payload: ProgressionResponse = {
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
  };

  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json(payload);
});
