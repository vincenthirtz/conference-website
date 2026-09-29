// GET/POST /api/demandes/captain — demandes de CAPITANAT (lot P11).
//
// GET suit `?as=` (inspection staff) ; POST est `self`. Corps validé par le
// service (`captainRequestSchema`, message historique de `formatZodError`).
// Plafond historique 10/min.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { listCaptainDemandes, submitCaptainDemande } from '../service/captain';

const LIMIT = { max: 10, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'demandes-captain',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'follow',
    rateLimit: LIMIT,
    handler: ({ ctx }) =>
      listCaptainDemandes({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, req }) =>
      submitCaptainDemande({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
