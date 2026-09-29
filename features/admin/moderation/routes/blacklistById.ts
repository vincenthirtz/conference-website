// features/admin/moderation/routes/blacklistById.ts
// /api/admin/moderation/blacklist/[id] — PATCH (reason / notes / active),
// DELETE (suppression définitive, 204).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { BlacklistEntryIdQuery, BlacklistUpdateDoc } from '../schemas';
import {
  removePlayerBlacklistEntry,
  updatePlayerBlacklistEntry,
} from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-blacklist-id',
  guard: { permission: 'moderate_support' },
  PATCH: mutate({
    query: BlacklistEntryIdQuery,
    body: BlacklistUpdateDoc,
    rateLimit: LIMIT,
    audit: 'blacklist_update',
    // Corps BRUT au service : ses 400 gardent leur forme historique.
    handler: ({ query, ctx, req }) =>
      audited(ctx, updatePlayerBlacklistEntry(ctx, query.id, req.body)),
  }),
  DELETE: mutate({
    query: BlacklistEntryIdQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'blacklist_remove',
    handler: ({ query, ctx }) =>
      audited(ctx, removePlayerBlacklistEntry(ctx, query.id)),
  }),
});
