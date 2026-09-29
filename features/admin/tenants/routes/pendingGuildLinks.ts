// features/admin/tenants/routes/pendingGuildLinks.ts
// GET /api/admin/pending-guild-links — guilds Discord en attente de liaison
// (remplie par `POST /api/bot/v1/tenants/link-guild`).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { listPendingGuildLinks } from '../service/access';

export default defineAdminRoute({
  key: 'pending-guild-links',
  // Portée PLATEFORME : depuis que `tenant_staff.role` élève le rôle effectif,
  // le propriétaire d'un espace porte `manage_tenant` chez lui. Sans cette
  // portée, il lirait la file d'onboarding de TOUS les espaces.
  guard: { permission: 'manage_tenant', scope: 'platform' },
  GET: read({ handler: ({ ctx }) => listPendingGuildLinks(ctx) }),
});
