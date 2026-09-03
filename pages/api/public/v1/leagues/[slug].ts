// pages/api/public/v1/leagues/{slug}
// GET → détail public d'une league (standings + tournois liés). Réutilise
// readLeagueDetail. Enveloppe { data }. 404 si inconnue / non-publique / draft.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { readLeagueDetail } from '@/utils/leagues/readLeagueDetail';
import type { LeagueDetailResponse } from '@/types/leagues';

export default withPublicApi<LeagueDetailResponse>(
  async ({ req }) => {
    const slug = firstQuery(req.query.slug);
    if (!slug) {
      throw PublicApiError.badRequest('Missing league slug');
    }
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const detail = await readLeagueDetail(slug, tenantId);
    if (!detail) {
      throw PublicApiError.notFound('League not found');
    }
    return single(detail);
  },
  {
    rateLimitBucket: 'public-v1-league-detail',
    maxPerMin: 120,
    cacheSeconds: 120,
  }
);
