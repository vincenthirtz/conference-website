// GET / POST /api/teams/join-requests — demandes d'adhésion reçues par
// l'équipe gérée (lot P10, même contrat). `manage_join_requests` ; GET suit
// l'inspection staff (`view_captain_data`), POST l'act-as journalisé. Quota
// par ACTEUR (5/min) sur l'appelant réel : une intervention du staff ne
// consomme pas celui de la capitaine.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
  RESPONSE_SENT,
} from '@/utils/player/defineSubjectRoute';
import { applyActorRateLimit } from '@/utils/rateLimit';
import { JoinRequestDecisionBody } from '../schemas';
import { decideJoinRequest, listIncomingDemandes } from '../service/demandes';

const RATE = { max: 20, windowMs: 60_000 };
const ACTOR = { max: 5, windowMs: 60_000 };
const TEAM = { permission: 'manage_join_requests' } as const;

export default defineSubjectRoute({
  key: 'join-requests',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    team: TEAM,
    rateLimit: RATE,
    handler: ({ ctx, req, res }) =>
      applyActorRateLimit(res, ctx.user.id, ACTOR, 'join-requests')
        ? RESPONSE_SENT
        : listIncomingDemandes(ctx, 'join', req.query.status),
  }),
  POST: mutateSubject({
    subject: 'follow',
    actAs: true,
    team: TEAM,
    body: JoinRequestDecisionBody,
    rateLimit: RATE,
    handler: ({ body, ctx, res }) =>
      applyActorRateLimit(res, ctx.user.id, ACTOR, 'join-requests')
        ? RESPONSE_SENT
        : decideJoinRequest(ctx, body),
  }),
});
