// DELETE /api/demandes/cancel — la joueuse annule sa demande en attente
// (lot P11). Sujet `self`, 10/min.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { CancelDemandeBody } from '../schemas';
import { cancelMyDemande } from '../service/cancel';

export default defineSubjectRoute({
  key: 'demandes-cancel',
  tenantResolution: 'async',
  DELETE: mutateSubject({
    body: CancelDemandeBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ ctx, body }) =>
      cancelMyDemande({ ...ctx, userId: ctx.subject.userId }, body),
  }),
});
