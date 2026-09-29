// features/admin/notifications/routes/sendTest.ts
// POST /api/admin/notifications/test → { sent, expired_removed, failed }.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { sendTest } from '../service';

export default defineAdminRoute({
  key: 'notifications-test',
  guard: 'caster',
  POST: mutate({
    // 5/min : chaque appel pousse sur TOUS les appareils du compte.
    rateLimit: { max: 5, windowMs: 60_000 },
    audit: false,
    handler: ({ ctx }) => sendTest(ctx),
  }),
});
