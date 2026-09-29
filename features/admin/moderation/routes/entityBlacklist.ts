// features/admin/moderation/routes/entityBlacklist.ts
// /api/admin/moderation/entity-blacklist — équipes / structures blacklistées.
// GET : liste (recherche sur le nom, filtres `active` / `entity_type`) ; POST : ajout.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { EntityBlacklistCreateDoc, EntityBlacklistListQuery } from '../schemas';
import { addEntityToBlacklist, listEntityBlacklist } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-entity-blacklist',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: EntityBlacklistListQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx, req }) =>
      listEntityBlacklist(ctx, query, parsePagination(req, { limit: 50 })),
  }),
  POST: mutate({
    body: EntityBlacklistCreateDoc,
    rateLimit: LIMIT,
    status: 201,
    audit: 'entity_blacklist_add',
    // Corps BRUT au service : ses 400 gardent leur forme historique.
    handler: ({ ctx, req }) =>
      audited(ctx, addEntityToBlacklist(ctx, req.body)),
  }),
});
