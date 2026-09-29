// /api/player/tcg/trades/settings — lot P14. `subject: 'self'`.
//   GET → préférence, éligibilité, plafonds, compteurs ;
//   PUT → activer / désactiver (désactiver annule tout ce qui attend).

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import {
  readTradeSettingsView,
  writeTradeSettings,
} from '../service/tradeSettings';

export default defineSubjectRoute({
  key: 'player-tcg-trade-settings',
  GET: readSubject({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) =>
      readTradeSettingsView({ ...ctx, userId: ctx.subject.userId }),
  }),
  PUT: mutateSubject({
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ ctx, req }) =>
      writeTradeSettings({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
});
