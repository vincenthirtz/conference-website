// /api/player/tcg/trades/{tradeId} — POST { action } : accepter, refuser,
// annuler (lot P14). `subject: 'self'`. Une acceptation régénère les fiches
// publiques des deux joueuses (vitrines) avant de répondre.

import {
  defineSubjectRoute,
  mutateSubject,
} from '@/utils/player/defineSubjectRoute';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import { actOnTrade } from '../service/tradeAction';

export default defineSubjectRoute({
  key: 'player-tcg-trade-action',
  POST: mutateSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx, req, res }) =>
      actOnTrade(
        {
          ...ctx,
          userId: ctx.subject.userId,
          revalidateCard: (userId) => revalidatePlayerCard(res, userId),
        },
        req.query.tradeId,
        req.body
      ),
  }),
});
