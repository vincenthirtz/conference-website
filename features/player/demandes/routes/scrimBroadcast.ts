// GET/POST /api/demandes/scrim-broadcast — demande de scrim GROUPÉE
// (utils/teams/scrimBroadcast.ts).
//
// Sujet `self`, équipe gérée par `?teamId=`, droit `manage_scrims` vérifié par
// le service. GET = aperçu des destinataires (qui recevrait la demande) ;
// POST = l'envoi, limité à 5 par heure : une demande groupée touche jusqu'à
// 40 équipes, la relancer en boucle serait du spam.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { ScrimBroadcastPreviewQuery } from '../schemas';
import {
  previewScrimBroadcast,
  submitScrimBroadcast,
} from '../service/scrimBroadcast';

export default defineSubjectRoute({
  key: 'demandes-scrim-broadcast',
  tenantResolution: 'async',
  GET: readSubject({
    query: ScrimBroadcastPreviewQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, query, req }) =>
      previewScrimBroadcast(
        { ...ctx, userId: ctx.subject.userId },
        query,
        readRequestedTeamId(req)
      ),
  }),
  POST: mutateSubject({
    rateLimit: { max: 5, windowMs: 60 * 60_000 },
    status: 201,
    handler: ({ ctx, req }) =>
      submitScrimBroadcast(
        { ...ctx, userId: ctx.subject.userId },
        req.body,
        readRequestedTeamId(req)
      ),
  }),
});
