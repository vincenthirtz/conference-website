// features/admin/moderation/routes/entityBlacklistById.ts
// /api/admin/moderation/entity-blacklist/[id] — PATCH (name / entity_type /
// reason / notes / active), DELETE (suppression définitive, 204).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { BlacklistEntryIdQuery, EntityBlacklistUpdateDoc } from '../schemas';
import {
  removeEntityBlacklistEntry,
  updateEntityBlacklistEntry,
} from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-entity-blacklist-id',
  guard: { permission: 'moderate_support' },
  PATCH: mutate({
    query: BlacklistEntryIdQuery,
    body: EntityBlacklistUpdateDoc,
    rateLimit: LIMIT,
    audit: 'entity_blacklist_update',
    // Corps BRUT au service : ses 400 gardent leur forme historique.
    handler: ({ query, ctx, req }) =>
      audited(ctx, updateEntityBlacklistEntry(ctx, query.id, req.body)),
  }),
  DELETE: mutate({
    query: BlacklistEntryIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'entity_blacklist_remove',
    handler: ({ query, ctx }) =>
      audited(ctx, removeEntityBlacklistEntry(ctx, query.id)),
  }),
});
