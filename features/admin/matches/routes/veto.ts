// features/admin/matches/routes/veto.ts — /api/admin/matches/[matchId]/veto
// GET : état ; POST : une étape ban/pick/decider ; DELETE : réinitialise ;
// PATCH : déverrouillage (admin+). Règles : service/veto.ts.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MatchIdQuery, VetoStepBody, VetoUnlockBody } from '../schemas';
import {
  getVeto,
  recordVetoStep,
  resetVeto,
  unlockMatchVeto,
} from '../service/veto';

export default defineAdminRoute({
  key: 'admin-match-veto',
  guard: { permission: 'arbitrate_matches' },
  GET: read({
    query: MatchIdQuery,
    handler: ({ query, ctx }) => getVeto(ctx, query.matchId),
  }),
  POST: mutate({
    query: MatchIdQuery,
    body: VetoStepBody,
    status: 201,
    audit: 'map_veto',
    handler: ({ query, body, ctx }) =>
      audited(ctx, recordVetoStep(ctx, query.matchId, body)),
  }),
  // Garde de la route (arbitrate_matches) + rang admin vérifié par le
  // service APRÈS la validation du corps (ordre d'origine : 400 puis 403).
  PATCH: mutate({
    query: MatchIdQuery,
    body: VetoUnlockBody,
    audit: 'map_veto',
    handler: ({ query, body, ctx }) =>
      audited(ctx, unlockMatchVeto(ctx, ctx.staff.role, query.matchId, body)),
  }),
  DELETE: mutate({
    query: MatchIdQuery,
    audit: 'map_veto',
    handler: ({ query, ctx }) => audited(ctx, resetVeto(ctx, query.matchId)),
  }),
});
