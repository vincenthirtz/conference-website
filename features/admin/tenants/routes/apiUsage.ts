// features/admin/tenants/routes/apiUsage.ts
// GET /api/admin/api-usage — quota et usage de l'API de l'espace (portail
// développeur). Chiffres en direct : jamais mis en cache.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getApiUsage } from '../service/apiUsage';

export default defineAdminRoute({
  key: 'api-usage',
  guard: { permission: 'manage_settings' },
  GET: read({
    // En-tête historique, lu tel quel par les tests du portail.
    cache: 'no-store',
    handler: ({ ctx }) => getApiUsage(ctx),
  }),
});
