// features/admin/site-settings/routes/byKey.ts
// /api/admin/site-settings/[key] — GET, PATCH (valeur / description), DELETE.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { SiteSettingKeyQuery } from '../schemas';
import {
  deleteSettingByKey,
  getSettingByKey,
  updateSettingByKey,
} from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'site-settings-key',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: SiteSettingKeyQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getSettingByKey(ctx, query.key),
  }),
  PATCH: mutate({
    query: SiteSettingKeyQuery,
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ query, req, ctx }) => {
      const { row, value } = await updateSettingByKey(ctx, query.key, req.body);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: query.key,
        payload: { value },
      });
      return row;
    },
  }),
  DELETE: mutate({
    query: SiteSettingKeyQuery,
    rateLimit: LIMIT,
    status: 204,
    audit: 'settings_update',
    handler: async ({ query, ctx }) => {
      await deleteSettingByKey(ctx, query.key);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: query.key,
        payload: { deleted: true },
      });
    },
  }),
});
