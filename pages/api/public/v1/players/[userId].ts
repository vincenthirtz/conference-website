// pages/api/public/v1/players/{userId}
// GET → profil public complet (rating, historique, H2H, achievements).
// Réutilise readPlayerProfile. Enveloppe { data }. 404 si joueur inconnu.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { readPlayerProfile } from '@/utils/rating/readPlayerProfile';
import type { PlayerProfileResponse } from '@/types/rating';

export default withPublicApi<PlayerProfileResponse>(
  async ({ req }) => {
    const userId = firstQuery(req.query.userId);
    if (!userId || !isValidUUID(userId)) {
      throw PublicApiError.badRequest('Invalid user id');
    }
    const tenantId = resolveTenantIdForPublicRequest(req);
    const profile = await readPlayerProfile(userId, tenantId);
    if (!profile) {
      throw PublicApiError.notFound('Player not found');
    }
    return single(profile);
  },
  {
    rateLimitBucket: 'public-v1-player-profile',
    maxPerMin: 120,
    cacheSeconds: 60,
  }
);
