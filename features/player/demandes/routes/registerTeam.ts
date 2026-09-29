// GET/POST /api/demandes/register-team — candidature d'équipe à un tournoi
// (lot P11). Sujet `self`. L'équipe gérée vient de `?teamId=` ; le POST
// vérifie au service qu'elle est bien celle du corps (message historique).
// 10/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { RegisterTeamDemandeBody } from '../schemas';
import {
  listRegistrationDemandes,
  submitRegistrationDemande,
} from '../service/registerTeam';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'demandes-register',
  tenantResolution: 'async',
  GET: readSubject({
    rateLimit: LIMIT,
    handler: ({ ctx, req }) =>
      listRegistrationDemandes(
        { ...ctx, userId: ctx.subject.userId },
        readRequestedTeamId(req)
      ),
  }),
  POST: mutateSubject({
    body: RegisterTeamDemandeBody,
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, body, req }) =>
      submitRegistrationDemande(
        { ...ctx, userId: ctx.subject.userId },
        body,
        readRequestedTeamId(req)
      ),
  }),
});
