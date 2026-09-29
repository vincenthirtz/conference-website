// GET/POST /api/teams/scrim-requests — négociation multi-créneaux des scrims
// (proposition / contre-proposition), côté capitaine / manager d'une des DEUX
// équipes participantes.
//
// GET  : scrims EN ATTENTE DE MON GESTE dans les deux sens (inspection staff
//        suivie, journal `view_captain_data`).
// POST : accept / counter / reject / report / approve — cœur partagé avec la
//        route bot. Écriture sous `?as=` refusée (`subject_read_only`) : le
//        geste porte le nom de l'actrice, il n'a pas de sens en act-as.
//
// Double plafond, comme avant : par IP (20/min, noyau) ET par acteur
// (5/min, clé = l'appelant — une inspection ne brûle pas le quota de la
// capitaine inspectée).

import type { NextApiResponse } from 'next';
import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
  RESPONSE_SENT,
} from '@/utils/player/defineSubjectRoute';
import { applyActorRateLimit } from '@/utils/rateLimit';
import { ScrimRequestDecisionBody } from '../schemas';
import {
  decideScrimRequest,
  listPendingScrimRequests,
} from '../service/requests';

const TEAM = { permission: 'manage_scrims' } as const;
const IP_LIMIT = { max: 20, windowMs: 60_000 };

/** Refuse le spam accept/reject (chaque accept crée un scrim draft). */
const actorLimited = (res: NextApiResponse, callerId: string) =>
  applyActorRateLimit(
    res,
    callerId,
    { max: 5, windowMs: 60_000 },
    'scrim-requests'
  );

export default defineSubjectRoute({
  key: 'scrim-requests',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    team: TEAM,
    rateLimit: IP_LIMIT,
    handler: ({ ctx, res }) => {
      if (actorLimited(res, ctx.user.id)) return RESPONSE_SENT;
      return listPendingScrimRequests({ ...ctx, userId: ctx.subject.userId });
    },
  }),
  POST: mutateSubject({
    subject: 'follow',
    team: TEAM,
    body: ScrimRequestDecisionBody,
    rateLimit: IP_LIMIT,
    handler: ({ ctx, body, res }) => {
      if (actorLimited(res, ctx.user.id)) return RESPONSE_SENT;
      const meta = ctx.user.user_metadata ?? {};
      return decideScrimRequest({ ...ctx, userId: ctx.subject.userId }, body, {
        displayName:
          (meta.display_name as string | null) ||
          (meta.full_name as string | null) ||
          (ctx.user.email as string | null) ||
          null,
      });
    },
  }),
});
