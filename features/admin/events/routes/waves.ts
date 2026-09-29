// features/admin/events/routes/waves.ts — /api/admin/events/[runId]/waves
// GET : vagues du run (ord asc) ; POST : création (ord absent = queue).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateWaveDoc, RunIdQuery } from '../schemas';
import { createWave, listWaves } from '../service/wavesStations';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-waves',
  guard: EVENTS_GUARD,
  GET: read({
    query: RunIdQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => listWaves(ctx, query.runId),
  }),
  POST: mutate({
    query: RunIdQuery,
    body: CreateWaveDoc,
    rateLimit: PER_MIN_60,
    status: 201,
    audit: 'event_wave_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createWave(ctx, query.runId, body)),
  }),
});
