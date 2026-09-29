// /api/player/tcg/cosmetics — habillages de vitrine (lot P14).
//   GET  → catalogue, possédés, équipés ;
//   POST → acheter (201) — transaction `tcg_buy_cosmetic`, Idempotency-Key
//          EN PLUS ;
//   PUT  → équiper (gratuit).
// `subject: 'self'` sur les trois.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  buyCosmetic,
  equipCosmetics,
  readCosmetics,
} from '../service/cosmetics';

export default defineSubjectRoute({
  key: 'player-tcg-cosmetics',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => readCosmetics({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    status: 201,
    handler: ({ ctx, req }) =>
      buyCosmetic({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
  PUT: mutateSubject({
    rateLimit: { max: 20, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      equipCosmetics({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
