// pages/api/public/v1/tournaments/{id}/standings
// GET → classement final depuis final_rankings (join teams). Vide si le
// tournoi n'est pas finalisé. Enveloppe { data }. {id} accepte id OU slug.

import {
  withPublicApi,
  list,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { readPublicTournamentDetail } from '@/utils/public/readTournaments';
import {
  readPublicTournamentStandings,
  type PublicStanding,
} from '@/utils/public/readStandings';

export default withPublicApi<PublicStanding>(
  async ({ req }) => {
    const idOrSlug = firstQuery(req.query.id);
    if (!idOrSlug) {
      throw PublicApiError.badRequest('Missing tournament id');
    }
    const tenantId = resolveTenantIdForPublicRequest(req);

    const tournament = await readPublicTournamentDetail(idOrSlug, tenantId);
    if (!tournament) {
      throw PublicApiError.notFound('Tournament not found');
    }

    const standings = await readPublicTournamentStandings(
      tournament.id,
      tenantId
    );
    return list(standings);
  },
  {
    rateLimitBucket: 'public-v1-tournament-standings',
    maxPerMin: 120,
    cacheSeconds: 60,
  }
);
