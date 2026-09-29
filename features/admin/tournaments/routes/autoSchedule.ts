// features/admin/tournaments/routes/autoSchedule.ts — POST …/[id]/auto-schedule
// Planifie les matchs sans créneau ; `dryRun` simule sans écrire ; des
// conflits d'équipe refusent l'écriture (409) sauf `acceptConflicts`.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { AutoScheduleBody, TournamentIdLowerQuery } from '../schemas';
import { autoSchedule } from '../service/schedule';

export default defineAdminRoute({
  key: 'tournament-auto-schedule',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdLowerQuery,
    body: AutoScheduleBody,
    audit: 'staff_batch_action',
    handler: ({ query, body, ctx }) =>
      audited(ctx, autoSchedule(ctx, query.id, body)),
  }),
});
