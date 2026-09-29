// features/admin/pilotage/routes.ts — GET /api/admin/pilotage

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { loadPilotage } from './service';

export default defineAdminRoute({
  key: 'pilotage',
  // Même droit que le tableau de bord de tournoi, dont il lit les données.
  guard: { permission: 'manage_tournaments' },
  GET: read({ handler: ({ ctx }) => loadPilotage(ctx) }),
});
