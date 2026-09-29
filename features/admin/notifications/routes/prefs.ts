// features/admin/notifications/routes/prefs.ts
// GET / PUT /api/admin/notifications/prefs — préférences Web Push du staff
// (modèle opt-out : ligne absente = activé).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { getPrefs, putPrefs } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'notifications-prefs',
  guard: 'caster',
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getPrefs(ctx),
  }),
  PUT: mutate({
    rateLimit: LIMIT,
    audit: false,
    handler: ({ req, ctx }) => putPrefs(ctx, req.body),
  }),
});
