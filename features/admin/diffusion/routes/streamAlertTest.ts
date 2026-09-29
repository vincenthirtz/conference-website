// features/admin/diffusion/routes/streamAlertTest.ts
// POST /api/admin/stream-alert-test — déclenche une alerte de TEST dans la
// boîte d'alertes : vérifier la scène avant le direct sans vrai follow.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { StreamAlertTestDoc } from '../schemas';
import { fireTestAlert } from '../service/streamAlertTest';

export default defineAdminRoute({
  key: 'stream-alert-test',
  guard: { permission: 'manage_broadcast' },
  POST: mutate({
    body: StreamAlertTestDoc,
    // Un clic répété en rafale remplirait la file d'attente de la source.
    rateLimit: { max: 20, windowMs: 60_000 },
    // Pas de journal avant la migration : une alerte de test n'est pas un geste.
    audit: false,
    // Corps BRUT : le 400 garde son message historique.
    handler: ({ ctx, req }) => fireTestAlert(ctx, req.body),
  }),
});
