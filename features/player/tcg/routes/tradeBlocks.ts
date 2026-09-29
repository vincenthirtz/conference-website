// /api/player/tcg/trades/blocks — lot P14. `subject: 'self'`.
//   GET → mes blocages ; POST → bloquer (201) ; DELETE → débloquer.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  blockTrader,
  listTradeBlocks,
  unblockTrader,
} from '../service/tradeSettings';

export default defineSubjectRoute({
  key: 'player-tcg-trade-blocks',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) =>
      listTradeBlocks({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    status: 201,
    handler: ({ ctx, req }) =>
      blockTrader({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
  DELETE: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      unblockTrader({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
