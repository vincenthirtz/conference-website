// features/admin/communications/routes/teamMessages.ts — /api/admin/team-messages
//   GET  : état roster + capacité de livraison par équipe
//   POST : aperçu (`dryRun`, défaut) ou envoi dans les salons Discord des équipes

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamMessagesDoc, TeamMessagesQuery } from '../schemas';
import {
  getTeamMessagesState,
  sendTeamMessagesFromAdmin,
} from '../service/teamMessages';

export default defineAdminRoute({
  key: 'team-messages',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamMessagesQuery,
    handler: ({ query, ctx }) => getTeamMessagesState(ctx, query),
  }),
  POST: mutate({
    body: TeamMessagesDoc,
    audit: 'send_team_message',
    // Corps BRUT : le 400 garde sa forme historique (`details`).
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        sendTeamMessagesFromAdmin(ctx, req.body, ctx.staff.staff.id)
      ),
  }),
});
