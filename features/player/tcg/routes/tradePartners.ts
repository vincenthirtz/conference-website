// /api/player/tcg/trades/partners — GET : les volontaires de MON espace
// (lot P14). `subject: 'self'` — ce n'est pas un annuaire.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readTradePartners } from '../service/tradeSettings';

export default defineSubjectRoute({
  key: 'player-tcg-trade-partners',
  GET: readSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) =>
      readTradePartners({ ...ctx, userId: ctx.subject.userId }),
  }),
});
