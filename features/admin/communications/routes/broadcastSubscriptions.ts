// features/admin/communications/routes/broadcastSubscriptions.ts
// GET /api/admin/broadcast/subscriptions — qui est abonné / désabonné aux
// campagnes email. L'opt-out est GLOBAL par compte, pas par campagne ; les
// compteurs ne portent que sur les comptes confirmés (l'audience réelle).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getSubscriptionStats } from '../service';

export default defineAdminRoute({
  key: 'broadcast-subscriptions',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_broadcast', scope: 'platform' },
  GET: read({
    // Agrégat sur tous les comptes : plus serré que le préréglage de lecture.
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => getSubscriptionStats(ctx),
  }),
});
