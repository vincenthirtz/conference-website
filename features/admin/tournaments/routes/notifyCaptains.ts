// features/admin/tournaments/routes/notifyCaptains.ts — POST
// /api/admin/tournaments/notify-captains { tournamentId } : message interne
// + email à chaque capitaine et manager d'équipe active.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { NotifyCaptainsBody } from '../schemas';
import { notifyCaptains } from '../service/teams';

export default defineAdminRoute({
  key: 'admin-tournaments-notify-captains',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    body: NotifyCaptainsBody,
    audit: 'notify_tournament_captains',
    handler: ({ body, ctx }) => audited(ctx, notifyCaptains(ctx, body)),
  }),
});
