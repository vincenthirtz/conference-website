// pages/api/public/v1/leagues
// GET → liste des leagues publiques (réutilise readPublicLeagues).
// Enveloppe { data }.

import { withPublicApi, list } from '@/utils/publicApi';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { readPublicLeagues } from '@/utils/leagues/readPublicLeagues';
import type { League } from '@/types/leagues';

export default withPublicApi<League>(
  async ({ req }) => {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const { leagues } = await readPublicLeagues(tenantId);
    return list(leagues);
  },
  { rateLimitBucket: 'public-v1-leagues', maxPerMin: 120, cacheSeconds: 120 }
);
