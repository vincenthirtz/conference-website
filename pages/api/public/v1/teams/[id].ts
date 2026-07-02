// pages/api/public/v1/teams/{id}  ({id} = id OU slug)
// GET → équipe publique + roster public (display_name, role, is_substitute).
// Aucune donnée privée (email / discord). Enveloppe { data }. 404 si inconnue.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { readPublicTeam, type PublicTeam } from '@/utils/public/readTeam';

export default withPublicApi<PublicTeam>(
  async ({ req }) => {
    const idOrSlug = firstQuery(req.query.id);
    if (!idOrSlug) {
      throw PublicApiError.badRequest('Missing team id');
    }
    const tenantId = resolveTenantIdForPublicRequest(req);
    const team = await readPublicTeam(idOrSlug, tenantId);
    if (!team) {
      throw PublicApiError.notFound('Team not found');
    }
    return single(team);
  },
  {
    rateLimitBucket: 'public-v1-team-detail',
    maxPerMin: 120,
    cacheSeconds: 120,
  }
);
