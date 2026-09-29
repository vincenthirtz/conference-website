// features/admin/events/routes/runs.ts — /api/admin/events
// GET : liste paginée des runs du tenant (filtre `status`) ; POST : création
// d'un run `draft` sans segment.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CreateRunDoc, RunListQuery } from '../schemas';
import { createRun, listRuns } from '../service/runs';
import { EVENTS_GUARD, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events',
  guard: EVENTS_GUARD,
  GET: read({
    query: RunListQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => listRuns(ctx, query),
  }),
  POST: mutate({
    body: CreateRunDoc,
    rateLimit: PER_MIN_60,
    status: 201,
    audit: 'event_run_manage',
    handler: ({ body, ctx }) => audited(ctx, createRun(ctx, body)),
  }),
});
