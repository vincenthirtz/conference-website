// features/admin/events/routes/cueById.ts — DELETE /api/admin/events/[runId]/cues/[cueId]
// Rétracte (soft-delete) un cue : le caster le voit passer « Annulé ».
// Naturellement idempotent (déjà rétracté : 200 `alreadyRetracted`).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CueIdQuery } from '../schemas';
import { retractCue } from '../service/cues';
import { EVENTS_GUARD, PER_MIN_30 } from './limits';

export default defineAdminRoute({
  key: 'admin-cue-retract',
  guard: EVENTS_GUARD,
  DELETE: mutate({
    query: CueIdQuery,
    rateLimit: PER_MIN_30,
    audit: 'event_cue_manage',
    handler: ({ query, ctx }) =>
      audited(ctx, retractCue(ctx, query.runId, query.cueId)),
  }),
});
