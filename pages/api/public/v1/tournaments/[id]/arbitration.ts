// pages/api/public/v1/tournaments/{id}/arbitration
// GET → métriques d'arbitrage AGRÉGÉES (non-nominatives) d'un tournoi public.
// Enveloppe { data }. {id} accepte id OU slug. 404 si le tournoi n'est pas
// public (draft / archived / inconnu). ZÉRO PII : uniquement des compteurs,
// durées et taux — jamais team / reason / joueur.

import {
  withPublicApi,
  single,
  firstQuery,
  PublicApiError,
} from '@/utils/publicApi';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { readPublicTournamentDetail } from '@/utils/public/readTournaments';
import { readTournamentArbitrationMetrics } from '@/utils/public/readArbitration';
import type { ArbitrationMetrics } from '@/utils/disputes/arbitrationMetrics';

export type PublicArbitrationResponse = {
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string | null;
  metrics: ArbitrationMetrics;
};

export default withPublicApi<PublicArbitrationResponse>(
  async ({ req }) => {
    const idOrSlug = firstQuery(req.query.id);
    if (!idOrSlug) {
      throw PublicApiError.badRequest('Missing tournament id');
    }
    const tenantId = await resolveTenantIdForPublicRequestAsync(req);

    // Gating : ne répond QUE pour un tournoi publiquement visible
    // (published / running / completed). Draft / archived / inconnu → 404.
    const tournament = await readPublicTournamentDetail(idOrSlug, tenantId);
    if (!tournament) {
      throw PublicApiError.notFound('Tournament not found');
    }

    const metrics = await readTournamentArbitrationMetrics(
      tournament.id,
      tenantId
    );

    return single({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentSlug: tournament.slug,
      metrics,
    });
  },
  {
    rateLimitBucket: 'public-v1-tournament-arbitration',
    maxPerMin: 120,
    cacheSeconds: 60,
  }
);
