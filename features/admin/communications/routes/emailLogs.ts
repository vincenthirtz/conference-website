// features/admin/communications/routes/emailLogs.ts
// GET /api/admin/email-logs — événements transactionnels Brevo (relais).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { EmailLogsQuery } from '../schemas';
import { listEmailLogs } from '../service/email';

export default defineAdminRoute({
  key: 'email-logs',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    query: EmailLogsQuery,
    handler: ({ query, ctx }) => listEmailLogs(ctx, query),
  }),
});
