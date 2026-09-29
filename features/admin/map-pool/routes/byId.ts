// features/admin/map-pool/routes/byId.ts — /api/admin/map-pool/[mapId]
// PATCH mise à jour partielle, DELETE suppression (404 hors tenant actif).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MapPoolIdQuery, MapPoolPatchDoc } from '../schemas';
import { deleteMapPoolEntry, updateMapPoolEntry } from '../service';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'map-pool-item',
  guard: { permission: 'manage_tournaments' },
  PATCH: mutate({
    query: MapPoolIdQuery,
    body: MapPoolPatchDoc,
    rateLimit: LIMIT,
    audit: 'update_map_pool_entry',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateMapPoolEntry(ctx, query.mapId, body)),
  }),
  DELETE: mutate({
    query: MapPoolIdQuery,
    rateLimit: LIMIT,
    audit: 'delete_map_pool_entry',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteMapPoolEntry(ctx, query.mapId)),
  }),
});
