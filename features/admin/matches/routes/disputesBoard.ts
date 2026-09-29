// features/admin/matches/routes/disputesBoard.ts
// GET /api/admin/disputes — tableau transverse des litiges ouverts
// (classification SLA, pagination, comptes).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { DisputeBoardQuery } from '../schemas';
import { getDisputeBoard } from '../service/disputesBoard';

export default defineAdminRoute({
  key: 'admin-disputes',
  guard: 'caster',
  GET: read({
    query: DisputeBoardQuery,
    handler: ({ query, ctx, req }) =>
      getDisputeBoard(ctx, query, parsePagination(req, { limit: 50 })),
  }),
});
