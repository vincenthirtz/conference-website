// features/admin/caster/routes/recentMatches.ts
// GET /api/admin/caster/recent-matches — sélecteur de match du vote MVP.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listRecentPlayedMatches } from '../service';

export default defineAdminRoute({
  key: 'caster-recent-matches',
  guard: 'caster',
  GET: read({ handler: ({ ctx }) => listRecentPlayedMatches(ctx) }),
});
