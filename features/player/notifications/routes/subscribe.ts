// POST /api/player/push/subscribe — enregistre l'abonnement Web Push de CET
// appareil (idempotent par endpoint : 201 à la création, 200 sinon) (lot
// P15). `subject: 'self'` : un appareil est celui de l'appelante.

import {
  defineSubjectRoute,
  mutateSubject,
  RESPONSE_SENT,
} from '@/utils/player/defineSubjectRoute';
import { subscribeDevice } from '../service';

export default defineSubjectRoute({
  key: 'player-push-subscribe',
  POST: mutateSubject({
    subject: 'self',
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: async ({ ctx, req, res }) => {
      const result = await subscribeDevice(
        { ...ctx, userId: ctx.subject.userId },
        req.body
      );
      // Statut porté par le résultat (201 / 200 / 409) : réponse écrite ici.
      res.status(result.status).json(result.body);
      return RESPONSE_SENT;
    },
  }),
});
