// features/admin/events/routes/stations.ts — /api/admin/events/[runId]/stations
// GET : postes du run (ord, puis nom) ; POST : création (status `idle`).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateStationDoc, RunIdQuery } from '../schemas';
import { createStation, listStations } from '../service/wavesStations';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-stations',
  guard: EVENTS_GUARD,
  GET: read({
    query: RunIdQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => listStations(ctx, query.runId),
  }),
  POST: mutate({
    query: RunIdQuery,
    body: CreateStationDoc,
    rateLimit: PER_MIN_60,
    status: 201,
    audit: 'event_station_manage',
    handler: ({ query, body, ctx }) =>
      audited(ctx, createStation(ctx, query.runId, body)),
  }),
});
