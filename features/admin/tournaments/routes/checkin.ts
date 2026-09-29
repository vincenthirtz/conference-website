// features/admin/tournaments/routes/checkin.ts — …/[id]/checkin
// GET : état du check-in match par match ; POST : relance manuelle du
// processeur (même logique que le cron, limitée au tournoi).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TournamentIdQuery } from '../schemas';
import { checkinStatus, runCheckin } from '../service/ops';

export default defineAdminRoute({
  key: 'admin-tournament-checkin',
  guard: { permission: 'run_checkin' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => checkinStatus(ctx, query.id),
  }),
  POST: mutate({
    query: TournamentIdQuery,
    // Slug typé (lot A6) : ce geste EST une relance manuelle du processeur.
    audit: 'checkin_manual_nudge',
    handler: ({ query, ctx }) => audited(ctx, runCheckin(ctx, query.id)),
  }),
});
