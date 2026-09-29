// features/admin/site-settings/routes/teamRoles.ts
// /api/admin/site-settings/team-roles — GET rôles d'équipe, PUT remplacement.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { TEAM_ROLES_SETTING_KEY } from '@/utils/teamRoles';
import { getTeamRoles, saveTeamRoles } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'team-roles',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getTeamRoles(ctx),
  }),
  PUT: mutate({
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ req, ctx }) => {
      const result = await saveTeamRoles(ctx, req.body);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: TEAM_ROLES_SETTING_KEY,
        payload: { count: result.roles.length },
      });
      return result;
    },
  }),
});
