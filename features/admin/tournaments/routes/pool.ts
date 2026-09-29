// features/admin/tournaments/routes/pool.ts — …/[id]/pool
// GET : équipes, liste d'attente et proposition de répartition ; POST :
// place | place-new | unplace (invariants tenus par pool_place / pool_unplace).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { PoolLooseBody, TournamentIdQuery } from '../schemas';
import { getPool, updatePool } from '../service/pool';

const RATE = { max: 120, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tournament-pool',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentIdQuery,
    rateLimit: RATE,
    handler: ({ query, ctx }) => getPool(ctx, query.id),
  }),
  POST: mutate({
    query: TournamentIdQuery,
    // Corps validé par le service APRÈS le contrôle du tournoi (404 / 409
    // NOT_POOLED d'abord), avec l'erreur historique INVALID_BODY.
    body: PoolLooseBody,
    rateLimit: RATE,
    audit: 'register_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updatePool(ctx, query.id, body)),
  }),
});
