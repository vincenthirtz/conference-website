// /api/player/tcg/booster — POST : acheter un booster (lot P14).
// `subject: 'self'` : on n'achète jamais au nom de quelqu'un. L'Idempotency-Key
// S'AJOUTE à la protection en base (`tcg_purchase_booster`, tout ou rien).

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { buyBooster } from '../service/booster';

export default defineSubjectRoute({
  key: 'player-tcg-booster',
  POST: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: ({ ctx }) =>
      buyBooster({ tenantId: ctx.tenantId, userId: ctx.subject.userId }),
  }),
});
