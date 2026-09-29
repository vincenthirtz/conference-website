// features/admin/events/routes/waveById.ts — /api/admin/events/[runId]/waves/[waveId]
// PATCH/PUT : mise à jour partielle (transitions auto-datées) ; DELETE.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { UpdateWaveDoc, WaveIdQuery } from '../schemas';
import { deleteWave, updateWave } from '../service/wavesStations';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

const update = mutate({
  query: WaveIdQuery,
  body: UpdateWaveDoc,
  rateLimit: PER_MIN_60,
  audit: 'event_wave_manage',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateWave(ctx, query.runId, query.waveId, body)),
});

export default defineAdminRoute({
  key: 'admin-events-wave-id',
  guard: EVENTS_GUARD,
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: WaveIdQuery,
    rateLimit: PER_MIN_60,
    audit: 'event_wave_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteWave(ctx, query.runId, query.waveId)),
  }),
});
