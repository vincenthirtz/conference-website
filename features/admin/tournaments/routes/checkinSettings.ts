// features/admin/tournaments/routes/checkinSettings.ts — …/[id]/checkin-settings
// GET : délai de grâce + motifs de no-show (lecture défensive) ;
// PATCH : délai de grâce (0..120), 503 explicite si la migration manque.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CheckinSettingsBody, TournamentIdQuery } from '../schemas';
import { checkinSettings, updateCheckinSettings } from '../service/ops';

export default defineAdminRoute({
  key: 'admin-tournament-checkin-settings',
  guard: { permission: 'run_checkin' },
  GET: read({
    query: TournamentIdQuery,
    handler: ({ query, ctx }) => checkinSettings(ctx, query.id),
  }),
  PATCH: mutate({
    query: TournamentIdQuery,
    body: CheckinSettingsBody,
    audit: 'update_tournament',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateCheckinSettings(ctx, query.id, body)),
  }),
});
