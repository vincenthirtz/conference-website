// pages/api/public/v1/tournaments/index.ts
// GET /api/public/v1/tournaments?status=&game=&limit=&offset=
// Liste des tournois publics (published/running/completed). Enveloppe
// { data, pagination }. Voir utils/publicApi.ts + docs/openapi.yaml (public/v1).

import { withPublicApi, list, firstQuery } from '@/utils/publicApi';
import { parsePagination } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import {
  readPublicTournaments,
  type PublicTournamentSummary,
} from '@/utils/public/readTournaments';

export default withPublicApi<PublicTournamentSummary>(
  async ({ req }) => {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const { limit, offset } = parsePagination(req, {
      limit: 50,
      maxLimit: 100,
    });
    const status = firstQuery(req.query.status);
    const game = firstQuery(req.query.game);

    const { items, count } = await readPublicTournaments(tenantId, {
      status,
      game,
      limit,
      offset,
    });

    return list(items, { count, limit, offset });
  },
  { rateLimitBucket: 'public-v1-tournaments', maxPerMin: 120, cacheSeconds: 60 }
);
