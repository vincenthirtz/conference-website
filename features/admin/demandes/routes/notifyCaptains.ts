// features/admin/demandes/routes/notifyCaptains.ts —
// POST /api/admin/demandes/[id]/notify-captains : relance Discord des
// capitaines d'une demande de scrim (202, 20 req/min).
//
// `manage_teams` et non `manage_scrims` : cette dernière est une permission
// d'ÉQUIPE (utils/teamRoles.ts), pas de staff.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { DemandeNotifyQuery } from '../schemas';
import { notifyScrimCaptains } from '../service/demandes';

export default defineAdminRoute({
  key: 'admin-demande-notify-captains',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    query: DemandeNotifyQuery,
    rateLimit: { max: 20, windowMs: 60_000 },
    status: 202,
    audit: 'notify_scrim_captains',
    handler: ({ query, ctx }) =>
      audited(ctx, notifyScrimCaptains(ctx, query.id)),
  }),
});
