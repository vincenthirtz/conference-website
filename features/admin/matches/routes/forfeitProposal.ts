// features/admin/matches/routes/forfeitProposal.ts —
// /api/admin/matches/[matchId]/forfeit-proposal
// GET : la proposition de forfait du match (ou `null`) ; POST
// `{ decision: 'confirm' | 'decline' }` : la trancher.
// Garde `arbitrate_matches`, comme le pointage staff : appliquer ou écarter un
// forfait est une décision d'arbitrage. Idempotency-Key : un double clic ne
// tranche qu'une fois, le second reçoit 409 FORFEIT_PROPOSAL_NOT_PENDING.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { revalidateMatchPages } from '@/utils/matches/revalidateMatchPages';
import { audited } from '../../_shared/audited';
import { ForfeitProposalDecisionBody, MatchIdQuery } from '../schemas';
import {
  decideForfeitProposal,
  getForfeitProposal,
} from '../service/forfeitProposal';

export default defineAdminRoute({
  key: 'match-forfeit-proposal',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdQuery,
    handler: ({ query, ctx }) => getForfeitProposal(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchIdQuery,
    body: ForfeitProposalDecisionBody,
    audit: 'update_match',
    handler: async ({ query, body, ctx, res }) => {
      const out = await audited(
        ctx,
        decideForfeitProposal(ctx, query.matchId, body.decision)
      );
      // Forfait appliqué : les pages publiques du match doivent le montrer.
      if (out.outcome === 'confirmed') {
        await revalidateMatchPages(res, {
          tenantId: ctx.tenantId,
          matchId: query.matchId,
        });
      }
      return out;
    },
  }),
});
