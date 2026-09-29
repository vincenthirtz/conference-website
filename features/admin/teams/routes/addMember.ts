// features/admin/teams/routes/addMember.ts — POST /api/admin/teams/add-member
// Invitation par défaut (202, journal `invite_team_member`) ; ajout direct
// sur motif (200, journal `add_team_member`). Le statut varie : la route
// écrit la réponse elle-même.

import {
  defineAdminRoute,
  mutate,
  RESPONSE_SENT,
} from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamAddMemberBody } from '../schemas';
import { addTeamMember } from '../service/addMember';

export default defineAdminRoute({
  key: 'admin-teams-add-member',
  guard: { permission: 'manage_teams' },
  POST: mutate({
    body: TeamAddMemberBody,
    audit: 'add_team_member',
    handler: async ({ body, ctx, res }) => {
      const out = await audited(
        ctx,
        addTeamMember(ctx, ctx.staff.user.id, body)
      );
      res.status(out.status).json(out.body);
      return RESPONSE_SENT;
    },
  }),
});
