// features/admin/map-pool/routes/index.ts — /api/admin/map-pool
// GET liste (groupée par jeu, ou `?game=` liste plate), POST création.
// Auth `manage_tournaments` sur le tenant actif.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MapPoolCreateDoc, MapPoolListQuery } from '../schemas';
import { createMapPoolEntry, listMapPool } from '../service';

export default defineAdminRoute({
  key: 'map-pool',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: MapPoolListQuery,
    handler: ({ query, ctx }) => listMapPool(ctx, query.game),
  }),
  POST: mutate({
    body: MapPoolCreateDoc,
    status: 201,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'create_map_pool_entry',
    handler: ({ body, ctx }) => audited(ctx, createMapPoolEntry(ctx, body)),
  }),
});
