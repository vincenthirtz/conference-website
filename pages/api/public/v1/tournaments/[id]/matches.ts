// pages/api/public/v1/tournaments/[id]/matches.ts
// GET /api/public/v1/tournaments/{id}/matches?stageId=&status=
// Matches d'un tournoi pour les overlays de bracket. Enveloppe { data }.
// {id} accepte id OU slug (résolu via readPublicTournamentDetail).

import {
  withPublicApi,
  list,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { readPublicTournamentDetail } from '@/utils/public/readTournaments';
import {
  readPublicTournamentMatches,
  type PublicMatch,
} from '@/utils/public/readMatches';

export default withPublicApi<PublicMatch>(
  async ({ req }) => {
    const idOrSlug = firstQuery(req.query.id);
    if (!idOrSlug) {
      throw PublicApiError.badRequest('Missing tournament id');
    }
    const tenantId = resolveTenantIdForPublicRequest(req);

    // Resolve id-or-slug → the tournament must exist and be public.
    const tournament = await readPublicTournamentDetail(idOrSlug, tenantId);
    if (!tournament) {
      throw PublicApiError.notFound('Tournament not found');
    }

    const matches = await readPublicTournamentMatches(tournament.id, tenantId, {
      stageId: firstQuery(req.query.stageId),
      status: firstQuery(req.query.status),
    });

    return list(matches);
  },
  {
    rateLimitBucket: 'public-v1-tournament-matches',
    maxPerMin: 120,
    cacheSeconds: 30,
  }
);
