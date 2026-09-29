// GET /api/player/network-status — étapes d'onboarding réseau restantes
// (Discord, BattleTag vérifié, découverte) (lot P15). `subject: 'self'` : les
// cartes qui la lisent sont masquées en inspection.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { readNetworkStatus } from '../service';

export default defineSubjectRoute({
  key: 'player-network-status',
  tenantResolution: 'async',
  GET: readSubject({
    subject: 'self',
    rateLimit: { max: 60, windowMs: 60_000 },
    cache: false,
    handler: async ({ ctx, res }) => {
      const status = await readNetworkStatus({
        ...ctx,
        userId: ctx.subject.userId,
      });
      res.setHeader('Cache-Control', 'private, max-age=30');
      return status;
    },
  }),
});
