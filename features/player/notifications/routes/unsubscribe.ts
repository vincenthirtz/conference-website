// DELETE /api/player/push/unsubscribe — révoque l'abonnement Web Push d'un
// endpoint de l'appelante (204 ; 404 s'il n'est pas à elle) (lot P15).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { unsubscribeDevice } from '../service';

export default defineSubjectRoute({
  key: 'player-push-unsubscribe',
  DELETE: mutateSubject({
    subject: 'self',
    rateLimit: { max: 20, windowMs: 60_000 },
    status: 204,
    handler: ({ ctx, req }) =>
      unsubscribeDevice({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
