// features/admin/matches/routes/dispute.ts — /api/admin/matches/[matchId]/dispute
// POST : ouvre un litige ; PATCH : le résout (avec ou sans score) ;
// DELETE : l'annule (`?resumeStatus=`). Règles : service/dispute.ts.
// Idempotency-Key honoré : un rejeu ne ré-ouvre / ne re-résout pas (ce qui
// relancerait applyMatchScore et la propagation bracket).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  DisputeOpenBody,
  DisputeResolveBody,
  MatchDisputeQuery,
  MatchIdQuery,
} from '../schemas';
import { cancelDispute, openDispute, resolveDispute } from '../service/dispute';

export default defineAdminRoute({
  key: 'admin-match-dispute',
  guard: { permission: 'arbitrate_matches' },
  POST: mutate({
    query: MatchIdQuery,
    body: DisputeOpenBody,
    audit: 'open_match_dispute',
    handler: ({ query, body, ctx }) =>
      audited(ctx, openDispute(ctx, query.matchId, body)),
  }),
  PATCH: mutate({
    query: MatchIdQuery,
    body: DisputeResolveBody,
    audit: 'resolve_match_dispute',
    handler: ({ query, body, ctx }) =>
      audited(ctx, resolveDispute(ctx, query.matchId, body)),
  }),
  DELETE: mutate({
    query: MatchDisputeQuery,
    audit: 'cancel_match_dispute',
    handler: ({ query, ctx }) =>
      audited(ctx, cancelDispute(ctx, query.matchId, query.resumeStatus)),
  }),
});
