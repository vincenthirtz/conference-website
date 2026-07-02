// pages/api/public/v1/matches/{id}
// GET → détail match + games (map par map). Enveloppe { data }. 404 si inconnu
// ou non publiquement visible.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import {
  readPublicMatchDetail,
  type PublicMatchDetail,
} from '@/utils/public/readMatches';

export default withPublicApi<PublicMatchDetail>(
  async ({ req }) => {
    const id = firstQuery(req.query.id);
    if (!id || !isValidUUID(id)) {
      throw PublicApiError.badRequest('Invalid match id');
    }
    const tenantId = resolveTenantIdForPublicRequest(req);
    const match = await readPublicMatchDetail(id, tenantId);
    if (!match) {
      throw PublicApiError.notFound('Match not found');
    }
    return single(match);
  },
  {
    rateLimitBucket: 'public-v1-match-detail',
    maxPerMin: 120,
    cacheSeconds: 30,
  }
);
