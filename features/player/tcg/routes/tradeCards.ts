// /api/player/tcg/trades/cards — GET : mes cartes, ou les DOUBLES
// échangeables d'une partenaire (`?userId=`) (lot P14). `subject: 'self'`.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readTradeCards } from '../service/tradeCards';

export default defineSubjectRoute({
  key: 'player-tcg-trade-cards',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      readTradeCards({ ...ctx, userId: ctx.subject.userId }, req.query.userId),
  }),
});
