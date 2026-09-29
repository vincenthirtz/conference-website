// features/admin/notifications/routes/ackAll.ts
// POST /api/admin/notifications/ack-all → { count_cleared } : remet le badge
// à zéro sur tous les appareils du staff.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { ackAll } from '../service';

export default defineAdminRoute({
  key: 'notifications-ack-all',
  guard: 'caster',
  POST: mutate({
    rateLimit: { max: 30, windowMs: 60_000 },
    // Geste sur ses propres notifications : jamais journalisé.
    audit: false,
    handler: ({ ctx }) => ackAll(ctx),
  }),
});
