// features/admin/events/routes/cues.ts — /api/admin/events/[runId]/cues
// GET : cues du run + acks (Live Director) ; POST : cue diffusé aux casters.
//
// POST exige `Idempotency-Key` (pas de no-op naturel côté base) et répond
// 201 à la création, 200 `dedupReplayed` quand un autre writer a déjà posé
// la même `dedup_key` : statut variable, d'où la réponse écrite ici.

import {
  defineAdminRoute,
  mutate,
  read,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { LegacyAdminError } from '@/utils/admin/errors';
import { CreateCueDoc, CueListQuery, RunIdQuery } from '../schemas';
import { createCue, listCues } from '../service/cues';
import { EVENTS_GUARD, PER_MIN_30, PER_MIN_60 } from './limits';

export default defineAdminRoute({
  key: 'admin-events-cues',
  guard: EVENTS_GUARD,
  GET: read({
    query: CueListQuery,
    rateLimit: PER_MIN_60,
    handler: ({ query, ctx }) => listCues(ctx, query.runId, query.limit),
  }),
  POST: mutate({
    query: RunIdQuery,
    body: CreateCueDoc,
    rateLimit: PER_MIN_30,
    audit: 'event_cue_manage',
    handler: async ({ query, body, req, res, ctx }) => {
      const key = req.headers['idempotency-key'];
      if (!key || (Array.isArray(key) && key.length === 0)) {
        throw new LegacyAdminError(400, 'Idempotency-Key header required.', {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
      }
      const out = await createCue(ctx, query.runId, body);
      ctx.audit(out.audit);
      res.status(out.status).json(out.body);
      return RESPONSE_SENT;
    },
  }),
});
