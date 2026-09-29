// features/admin/site-settings/routes/index.ts
// /api/admin/site-settings — GET liste des réglages du tenant, POST upsert
// d'une clé.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { listSettings, upsertSetting } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'site-settings',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => listSettings(ctx),
  }),
  POST: mutate({
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ req, ctx }) => {
      const { row, key, value } = await upsertSetting(ctx, req.body);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: key,
        payload: { value },
      });
      return row;
    },
  }),
});
