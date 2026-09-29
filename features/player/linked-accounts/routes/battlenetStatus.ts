// GET /api/player/battlenet-status — lien Battle.net (BattleTag vérifié par
// OAuth Blizzard) de la personne connectée, et la récompense offerte (lot P9).
//
// `subject: 'self'`. Le rattachement passe par /api/auth/battlenet/start et
// son callback, inchangés.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readBattlenetLink } from '../service';

export default defineSubjectRoute({
  key: 'battlenet-status',
  GET: readSubject({
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => readBattlenetLink(ctx.user.id),
  }),
});
