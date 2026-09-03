// pages/api/public/v1/leaderboard?limit=&offset=
// GET → classement Glicko-2 public (réutilise readLeaderboard). Enveloppe
// { data, pagination }.

import { withPublicApi, list } from '@/utils/publicApi';
import { parsePagination } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { readLeaderboard } from '@/utils/rating/readLeaderboard';
import type { LeaderboardPlayer } from '@/types/rating';

export default withPublicApi<LeaderboardPlayer>(
  async ({ req }) => {
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);
    const { limit, offset } = parsePagination(req, {
      limit: 50,
      maxLimit: 100,
    });
    const { players } = await readLeaderboard(tenantId, limit, offset);
    return list(players, { limit, offset, count: players.length });
  },
  { rateLimitBucket: 'public-v1-leaderboard', maxPerMin: 120, cacheSeconds: 60 }
);
