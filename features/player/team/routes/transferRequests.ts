// GET / POST /api/teams/transfer-requests — demandes de transfert reçues par
// l'équipe gérée (lot P10, même contrat). `manage_roster`, sujet = appelant
// (pas d'inspection : la route ne l'a jamais suivie). Quota par acteur 5/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
  RESPONSE_SENT,
} from '@/utils/player/defineSubjectRoute';
import { applyActorRateLimit } from '@/utils/rateLimit';
import { TransferRequestDecisionBody } from '../schemas';
import {
  decideTransferRequest,
  listIncomingDemandes,
} from '../service/demandes';

const RATE = { max: 20, windowMs: 60_000 };
const ACTOR = { max: 5, windowMs: 60_000 };
const TEAM = { permission: 'manage_roster' } as const;

export default defineSubjectRoute({
  key: 'transfer-requests',
  tenantResolution: 'async',
  GET: readSubject({
    team: TEAM,
    rateLimit: RATE,
    handler: ({ ctx, req, res }) =>
      applyActorRateLimit(res, ctx.user.id, ACTOR, 'transfer-requests')
        ? RESPONSE_SENT
        : listIncomingDemandes(ctx, 'transfer', req.query.status),
  }),
  POST: mutateSubject({
    team: TEAM,
    body: TransferRequestDecisionBody,
    rateLimit: RATE,
    handler: ({ body, ctx, res }) =>
      applyActorRateLimit(res, ctx.user.id, ACTOR, 'transfer-requests')
        ? RESPONSE_SENT
        : decideTransferRequest(ctx, body),
  }),
});
