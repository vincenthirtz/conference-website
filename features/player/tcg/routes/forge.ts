// /api/player/tcg/forge — POST : forger une carte (lot P14), 201.
// `subject: 'self'`. La transaction `tcg_forge_card` porte l'invariant ;
// l'Idempotency-Key s'y AJOUTE.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { forgeCard } from '../service/forge';

export default defineSubjectRoute({
  key: 'player-tcg-forge',
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    status: 201,
    handler: ({ ctx, req }) =>
      forgeCard({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
