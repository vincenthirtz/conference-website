// features/admin/teams/routes/tournaments.ts — /api/admin/teams/[teamId]/tournaments
// GET : inscrite / disponibles ; POST : inscription (201) ; DELETE :
// désinscription. 60 req/min pour les trois méthodes.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamTournamentBody, TeamTournamentsQuery } from '../schemas';
import {
  getTeamTournaments,
  registerTeamToTournament,
  unregisterTeamFromTournament,
} from '../service/tournaments';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-team-tournaments',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamTournamentsQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getTeamTournaments(ctx, query.teamId),
  }),
  POST: mutate({
    query: TeamTournamentsQuery,
    body: TeamTournamentBody,
    rateLimit: LIMIT,
    status: 201,
    audit: 'update_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, registerTeamToTournament(ctx, query.teamId, body)),
  }),
  DELETE: mutate({
    query: TeamTournamentsQuery,
    body: TeamTournamentBody,
    rateLimit: LIMIT,
    audit: 'update_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, unregisterTeamFromTournament(ctx, query.teamId, body)),
  }),
});
