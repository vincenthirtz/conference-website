// features/admin/matches/routes/mvpPublic.ts — /api/admin/matches/[matchId]/mvp-public
// GET : état du scrutin du public ; POST : `open` | `vote` (lot) | `close`.
// Règles : service/mvpPublic.ts.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { MatchIdFrQuery, MvpPublicLooseBody } from '../schemas';
import { actOnPublicMvp, getPublicMvp } from '../service/mvpPublic';

export default defineAdminRoute({
  key: 'mvp-public',
  guard: 'caster',
  GET: read({
    query: MatchIdFrQuery,
    handler: ({ query, ctx }) => getPublicMvp(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchIdFrQuery,
    // Corps lu par le service : un échec rend le 400 historique « Corps invalide ».
    body: MvpPublicLooseBody,
    // Le cockpit publie ~toutes les 1,5 s pendant un scrutin : 120/min laisse
    // de la marge à deux onglets sans ouvrir la porte à un martèlement.
    rateLimit: { max: 120, windowMs: 60_000 },
    // Journal staff et événement bot écrits par utils/mvp/publicVoteActions
    // (ouverture / clôture) ; un lot de voix n'est pas un geste de staff.
    audit: false,
    handler: ({ query, body, ctx }) =>
      actOnPublicMvp(ctx, ctx.staff.staff.id ?? null, query.matchId, body),
  }),
});
