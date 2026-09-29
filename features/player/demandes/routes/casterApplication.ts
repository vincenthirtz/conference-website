// GET/POST /api/demandes/caster-application — candidature caster (lot P11).
//
// Sujet `self`, pas de garde staff. Corps validé par le service (erreur
// historique `Invalid body.` + `fieldErrors`). Plafond historique 5/heure.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  readMyCasterApplication,
  submitCasterApplication,
} from '../service/casterApplication';

const LIMIT = { max: 5, windowMs: 60 * 60_000 };

export default defineSubjectRoute({
  key: 'caster-application',
  tenantResolution: 'async',
  GET: readSubject({
    rateLimit: LIMIT,
    handler: ({ ctx }) =>
      readMyCasterApplication({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, req }) =>
      submitCasterApplication({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
