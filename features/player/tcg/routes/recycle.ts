// /api/player/tcg/recycle — POST : recycler un doublon (lot P14).
// `subject: 'self'`. Corps validé par le service (refus historique
// `missing_card`). L'Idempotency-Key S'AJOUTE aux deux garde-fous en base.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { recycleCard } from '../service/recycle';

export default defineSubjectRoute({
  key: 'player-tcg-recycle',
  POST: mutateSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      recycleCard({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
