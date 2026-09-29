// features/admin/events/routes/segmentsFromTournament.ts — POST /api/admin/events/[runId]/segments/from-tournament
// Un segment `match` par match de un tournoi, à la queue du run, sans doublon.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { FromTournamentDoc, RunIdQuery } from '../schemas';
import { prefillFromTournament } from '../service/prefill';
import { EVENTS_GUARD, PER_MIN_20 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-seg-from-tournament',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    body: FromTournamentDoc,
    rateLimit: PER_MIN_20,
    audit: 'event_segment_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, prefillFromTournament(ctx, query.runId, body)),
  }),
});
