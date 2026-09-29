// features/admin/notifications/routes/unsubscribe.ts
// DELETE /api/admin/notifications/unsubscribe { endpoint } → 204.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { unsubscribe } from '../service';

export default defineAdminRoute({
  key: 'notifications-unsubscribe',
  guard: 'caster',
  DELETE: mutate({
    rateLimit: { max: 20, windowMs: 60_000 },
    status: 204,
    audit: false,
    handler: ({ req, ctx }) => unsubscribe(ctx, req.body),
  }),
});
