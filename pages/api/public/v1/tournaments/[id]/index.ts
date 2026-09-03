// pages/api/public/v1/tournaments/[id]/index.ts
// GET /api/public/v1/tournaments/{id}  ({id} = id OU slug)
// Détail tournoi public + résumé des stages. Enveloppe { data }. 404 si inconnu.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import {
  readPublicTournamentDetail,
  type PublicTournamentDetail,
} from '@/utils/public/readTournaments';

export default withPublicApi<PublicTournamentDetail>(
  async ({ req }) => {
    const idOrSlug = firstQuery(req.query.id);
    if (!idOrSlug) {
      throw PublicApiError.badRequest('Missing tournament id');
    }
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const detail = await readPublicTournamentDetail(idOrSlug, tenantId);
    if (!detail) {
      throw PublicApiError.notFound('Tournament not found');
    }
    return single(detail);
  },
  {
    rateLimitBucket: 'public-v1-tournament-detail',
    maxPerMin: 120,
    cacheSeconds: 60,
  }
);
