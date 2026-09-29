// GET/POST /api/demandes/join — demandes pour REJOINDRE une équipe (lot P11).
//
// GET suit `?as=` (inspection staff, comme avant la migration) ;
// POST est `self` : l'écriture au nom d'une autre n'a jamais été ouverte.
// Plafond historique 10/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { JoinDemandeBody } from '../schemas';
import { listJoinDemandes, submitJoinDemande } from '../service/join';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'demandes-join',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    rateLimit: LIMIT,
    handler: ({ ctx }) =>
      listJoinDemandes({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    body: JoinDemandeBody,
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, body }) =>
      submitJoinDemande({ ...ctx, userId: ctx.subject.userId }, body),
  }),
});
