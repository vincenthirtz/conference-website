// features/admin/tournaments/routes/teamEntry.ts — …/[id]/teams/[teamId]
// `teamId` est l'id de l'INSCRIPTION (tournament_teams). GET, PATCH
// (seed / statut), DELETE (retrait du tournoi).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TournamentTeamEntryQuery, TournamentTeamPatchBody } from '../schemas';
import { deleteEntry, getEntry, patchEntry } from '../service/teams';

export default defineAdminRoute({
  key: 'admin-tournament-team-entry',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentTeamEntryQuery,
    handler: ({ query, ctx }) => getEntry(ctx, query.teamId),
  }),
  PATCH: mutate({
    query: TournamentTeamEntryQuery,
    body: TournamentTeamPatchBody,
    audit: 'manage_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, patchEntry(ctx, query.id, query.teamId, body)),
  }),
  DELETE: mutate({
    query: TournamentTeamEntryQuery,
    audit: 'manage_team',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteEntry(ctx, query.id, query.teamId)),
  }),
});
