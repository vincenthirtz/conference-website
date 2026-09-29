// features/admin/notifications/routes/unreadCount.ts
// GET /api/admin/notifications/unread-count → { count }.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { unreadCount } from '../service';

// `caster` = tout staff : chacun lit ses propres notifications.
export default defineAdminRoute({
  key: 'notifications-unread-count',
  guard: 'caster',
  GET: read({
    rateLimit: { max: 60, windowMs: 60_000 },
    handler: ({ ctx }) => unreadCount(ctx),
  }),
});
