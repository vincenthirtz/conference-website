// features/admin/matches/routes/checkinNudge.ts — POST /api/admin/matches/[matchId]/checkin-nudge
// `{ teamSide: 1 | 2 | 'both' }` : relance le check-in par DM (via le bot).
// Idempotency-Key : un double-clic n'envoie qu'un DM ; au-delà des 5 min du
// cache, un nouveau clic relance (voulu).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CheckinNudgeBody, MatchIdQuery } from '../schemas';
import { nudgeCheckin } from '../service/checkinNudge';

export default defineAdminRoute({
  key: 'match-checkin-nudge',
  guard: { permission: 'run_checkin' },
  POST: mutate({
    query: MatchIdQuery,
    body: CheckinNudgeBody,
    audit: 'checkin_manual_nudge',
    handler: ({ query, body, ctx }) =>
      audited(ctx, nudgeCheckin(ctx, query.matchId, body)),
  }),
});
