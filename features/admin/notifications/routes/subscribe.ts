// features/admin/notifications/routes/subscribe.ts
// POST /api/admin/notifications/subscribe — enregistre l'abonnement Web Push
// de l'appareil courant (200 mis à jour, 201 créé, 409 endpoint d'un autre
// compte).

import {
  defineAdminRoute,
  mutate,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { subscribe } from '../service';

// `caster` est le minimum : tout staff doit pouvoir s'abonner depuis sa PWA.
export default defineAdminRoute({
  key: 'notifications-subscribe',
  guard: 'caster',
  POST: mutate({
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: false,
    handler: async ({ req, res, ctx }) => {
      // Statut ET corps décidés par la règle partagée avec l'espace joueur
      // (200 / 201 / 409 à code métier) : relayés tels quels.
      const result = await subscribe(ctx, req.body);
      res.status(result.status).json(result.body);
      return RESPONSE_SENT;
    },
  }),
});
