// features/admin/events/routes/stationById.ts — /api/admin/events/[runId]/stations/[stationId]
// PATCH/PUT : mise à jour partielle ; DELETE.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StationIdQuery, UpdateStationDoc } from '../schemas';
import { deleteStation, updateStation } from '../service/wavesStations';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

const update = mutate({
  query: StationIdQuery,
  body: UpdateStationDoc,
  rateLimit: PER_MIN_60,
  audit: 'event_station_manage',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateStation(ctx, query.runId, query.stationId, body)),
});

export default defineAdminRoute({
  key: 'admin-events-station-id',
  guard: EVENTS_GUARD,
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: StationIdQuery,
    rateLimit: PER_MIN_60,
    audit: 'event_station_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteStation(ctx, query.runId, query.stationId)),
  }),
});
