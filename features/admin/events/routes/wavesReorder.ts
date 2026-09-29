// features/admin/events/routes/wavesReorder.ts — POST /api/admin/events/[runId]/waves/reorder
// `{ order: { id, ord }[] }` = TOUTES les vagues du run.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ReorderWavesDoc, RunIdQuery } from '../schemas';
import { reorderWaves } from '../service/wavesStations';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-waves-reorder',
  guard: EVENTS_GUARD,
  POST: mutate({
    query: RunIdQuery,
    body: ReorderWavesDoc,
    rateLimit: PER_MIN_30,
    audit: 'event_wave_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, reorderWaves(ctx, query.runId, body)),
  }),
});
