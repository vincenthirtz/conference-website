// features/admin/events/routes/runById.ts — /api/admin/events/[runId]
// GET : run + segments + vagues + postes ; PATCH/PUT : métadonnées (le statut
// passe par /start et /end) ; DELETE : suppression, refusée sur un run live.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { RunIdQuery, UpdateRunDoc } from '../schemas';
import { deleteRun, getRun, updateRun } from '../service/runs';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

const update = mutate({
  query: RunIdQuery,
  body: UpdateRunDoc,
  rateLimit: PER_MIN_60,
  audit: 'event_run_manage',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateRun(ctx, query.runId, body)),
});

export default defineAdminRoute({
  key: 'admin-events-id',
  guard: EVENTS_GUARD,
  GET: read({
    query: RunIdQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => getRun(ctx, query.runId),
  }),
  PATCH: update,
  PUT: update,
  DELETE: mutate({
    query: RunIdQuery,
    rateLimit: PER_MIN_60,
    audit: 'event_run_manage',
    handler: ({ query, ctx }) => audited(ctx, deleteRun(ctx, query.runId)),
  }),
});
