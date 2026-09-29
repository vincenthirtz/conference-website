// /api/player/tcg/trades — lot P14. `subject: 'self'`.
//   GET  → ma boîte (reçues / envoyées, ouvertes / closes), paginée ;
//   POST → proposer (201). `tcg_propose_trade` porte les règles ; le
//          rate-limit et l'Idempotency-Key ne sont que des amortisseurs.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { listTrades, proposeTrade } from '../service/trades';

export default defineSubjectRoute({
  key: 'player-tcg-trades',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      listTrades(
        { ...ctx, userId: ctx.subject.userId },
        {
          box: req.query.box,
          state: req.query.state,
          limit: req.query.limit,
          cursor: req.query.cursor,
        }
      ),
  }),
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    status: 201,
    handler: ({ ctx, req }) =>
      proposeTrade({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
