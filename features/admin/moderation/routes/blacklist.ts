// features/admin/moderation/routes/blacklist.ts — /api/admin/moderation/blacklist
// GET : entrées du tenant (recherche battle_tag / display_name / discord_user_id,
// filtre `active`) ; POST : ajout (au moins un identifiant).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { BlacklistCreateDoc, BlacklistListQuery } from '../schemas';
import { addPlayerToBlacklist, listPlayerBlacklist } from '../service';

// 60/min comme avant la migration (le seau était partagé lecture/écriture).
const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-blacklist',
  guard: { permission: 'moderate_support' },
  GET: read({
    query: BlacklistListQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx, req }) =>
      listPlayerBlacklist(ctx, query, parsePagination(req, { limit: 50 })),
  }),
  POST: mutate({
    body: BlacklistCreateDoc,
    rateLimit: LIMIT,
    status: 201,
    audit: 'blacklist_add',
    // Corps BRUT au service : ses 400 gardent leur forme historique.
    handler: ({ ctx, req }) =>
      audited(ctx, addPlayerToBlacklist(ctx, req.body)),
  }),
});
