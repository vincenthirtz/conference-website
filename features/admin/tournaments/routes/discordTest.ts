// features/admin/tournaments/routes/discordTest.ts — POST …/[id]/discord-test
// Envoie un message de test sur le webhook configuré (tournoi, sinon global).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { DiscordTestBody, TournamentIdQuery } from '../schemas';
import { testWebhook } from '../service/ops';

export default defineAdminRoute({
  key: 'admin-tournament-discord-test',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: TournamentIdQuery,
    body: DiscordTestBody,
    // Un message de test n'était pas journalisé : rien ne change en base.
    audit: false,
    handler: ({ query, body, ctx }) => testWebhook(ctx, query.id, body),
  }),
});
