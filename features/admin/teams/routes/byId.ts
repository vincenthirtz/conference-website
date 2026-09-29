// features/admin/teams/routes/byId.ts — /api/admin/teams/[teamId]
// GET : fiche (`?withMembers=1` joint le roster) ; PUT / PATCH : champs de
// l'équipe ; DELETE : désactivation + corbeille (`?hard=1` : suppression).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import {
  TeamDeleteQuery,
  TeamDetailQuery,
  TeamIdQuery,
  TeamPatchBody,
} from '../schemas';
import { isTruthyFlag } from '../service/common';
import { deleteTeam, getTeam, updateTeam } from '../service/teams';

const update = mutate({
  query: TeamIdQuery,
  body: TeamPatchBody,
  audit: 'update_team',
  handler: ({ query, body, ctx }) =>
    audited(ctx, updateTeam(ctx, query.teamId, body)),
});

export default defineAdminRoute({
  key: 'admin-team-id',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamDetailQuery,
    handler: ({ query, ctx }) =>
      getTeam(ctx, query.teamId, isTruthyFlag(query.withMembers)),
  }),
  PUT: update,
  PATCH: update,
  // Slug déclaré `delete_team` (suppression définitive) ; la désactivation
  // journalise `update_team`, comme la route d'origine.
  DELETE: mutate({
    query: TeamDeleteQuery,
    audit: 'delete_team',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteTeam(ctx, query.teamId, isTruthyFlag(query.hard))),
  }),
});
