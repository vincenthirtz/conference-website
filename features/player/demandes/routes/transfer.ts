// GET/POST /api/demandes/transfer — demandes de TRANSFERT (lot P11).
//
// Sujet `self`. La proposition par une capitaine (`targetPlayerId`) exige
// `manage_roster` sur l'équipe désignée par `?teamId=` : vérifié par le
// service, car le transfert « pour soi » n'en exige aucune. 30/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readRequestedTeamId } from '@/utils/teams/teamScope';
import { TransferDemandeBody } from '../schemas';
import {
  listTransferDemandes,
  submitTransferDemande,
} from '../service/transfer';

const LIMIT = { max: 30, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'demandes-transfer',
  tenantResolution: 'async',
  GET: readSubject({
    rateLimit: LIMIT,
    handler: ({ ctx }) =>
      listTransferDemandes({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    body: TransferDemandeBody,
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, body, req }) =>
      submitTransferDemande(
        { ...ctx, userId: ctx.subject.userId },
        body,
        readRequestedTeamId(req)
      ),
  }),
});
