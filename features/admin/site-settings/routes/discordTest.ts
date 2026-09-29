// features/admin/site-settings/routes/discordTest.ts
// POST /api/admin/site-settings/discord-test — message de test sur le webhook
// *global* d'un type de salon (pendant, sans tournament_id, du test par
// tournoi).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { testGlobalWebhook } from '../service';

export default defineAdminRoute({
  key: 'site-settings-discord-test',
  guard: { permission: 'manage_settings' },
  POST: mutate({
    // Un test n'écrit rien en base : il n'y avait pas de journal.
    audit: false,
    handler: ({ req, ctx }) => testGlobalWebhook(ctx, req.body),
  }),
});
