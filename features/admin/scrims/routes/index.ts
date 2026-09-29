// features/admin/scrims/routes/index.ts — /api/admin/scrims
// GET : liste filtrable / paginée ; POST : création d'un scrim.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { ScrimCreateBody, ScrimListQuery } from '../schemas';
import { createScrim, listScrims } from '../service/scrims';

export default defineAdminRoute({
  key: 'admin-scrims',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: ScrimListQuery,
    handler: ({ query, ctx, req }) =>
      listScrims(ctx, query, parsePagination(req, { limit: 50 })),
  }),
  POST: mutate({
    body: ScrimCreateBody,
    status: 201,
    audit: 'create_scrim',
    handler: ({ body, ctx }) => audited(ctx, createScrim(ctx, body)),
  }),
});
