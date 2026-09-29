// GET/POST /api/demandes/scrim — demandes de SCRIM (lot P11).
//
// Sujet `self`. POST exige `manage_scrims` sur l'équipe gérée (`?teamId=`),
// vérifié par le service APRÈS le corps (400 avant 403, ordre historique) ;
// corps validé par le service (erreur historique avec `field`). 30/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { listScrimDemandes, submitScrimDemande } from '../service/scrim';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'demandes-scrim',
  tenantResolution: 'async',
  GET: readSubject({
    rateLimit: LIMIT,
    handler: ({ ctx }) =>
      listScrimDemandes({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, req }) =>
      submitScrimDemande(
        { ...ctx, userId: ctx.subject.userId },
        req.body,
        readRequestedTeamId(req)
      ),
  }),
});
