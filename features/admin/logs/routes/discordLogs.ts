// features/admin/logs/routes/discordLogs.ts
// GET /api/admin/discord-logs — journal du bot Discord (onglet « Discord » de
// /admin/logs) : `source=player` (actions via le bot) ou `source=event`
// (outbox site → bot). JSON paginé ou `format=csv`.

import {
  RESPONSE_SENT,
  defineAdminRoute,
  read,
} from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { DiscordLogsQuery } from '../schemas';
import { readDiscordLogs } from '../service';
import { sendCsv } from './sendCsv';

export default defineAdminRoute({
  key: 'admin-discord-logs',
  // Le journal expose des identifiants Discord de joueuses.
  guard: { permission: 'manage_settings' },
  GET: read({
    query: DiscordLogsQuery,
    handler: async ({ query, ctx, req, res }) => {
      const out = await readDiscordLogs(
        ctx,
        query,
        parsePagination(req, { limit: 100 })
      );
      if (out.kind === 'json') return out.body;
      sendCsv(res, out.file);
      return RESPONSE_SENT;
    },
  }),
});
