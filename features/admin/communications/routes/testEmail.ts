// features/admin/communications/routes/testEmail.ts
// POST /api/admin/test-email — envoie l'email de test de la plateforme.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { TestEmailDoc } from '../schemas';
import { sendTestEmail } from '../service/email';

export default defineAdminRoute({
  key: 'test-email',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  POST: mutate({
    body: TestEmailDoc,
    // Pas de journal avant la migration : un envoi de test n'écrit rien.
    audit: false,
    handler: ({ body }) => sendTestEmail(body),
  }),
});
