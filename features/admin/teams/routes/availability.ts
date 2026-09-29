// features/admin/teams/routes/availability.ts — /api/admin/teams/[teamId]/availability
// Contraintes de disponibilité d'une équipe : GET liste, POST (201), PATCH
// `?id=`, DELETE `?id=` (204).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamAvailabilityBody, TeamAvailabilityQuery } from '../schemas';
import {
  createTeamAvailability,
  deleteTeamAvailability,
  listTeamAvailability,
  updateTeamAvailability,
} from '../service/availability';

export default defineAdminRoute({
  key: 'admin-team-availability',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamAvailabilityQuery,
    handler: ({ query, ctx }) => listTeamAvailability(ctx, query),
  }),
  // Corps validé par le service (400 historique `INVALID_BODY` + `fields`) :
  // on lui passe le corps BRUT, pas la version nommée par `looseBody`.
  POST: mutate({
    query: TeamAvailabilityQuery,
    body: TeamAvailabilityBody,
    status: 201,
    audit: 'team_availability_add',
    handler: ({ query, ctx, req }) =>
      audited(ctx, createTeamAvailability(ctx, query, req.body)),
  }),
  PATCH: mutate({
    query: TeamAvailabilityQuery,
    body: TeamAvailabilityBody,
    audit: 'team_availability_update',
    handler: ({ query, ctx, req }) =>
      audited(ctx, updateTeamAvailability(ctx, query, req.body)),
  }),
  DELETE: mutate({
    query: TeamAvailabilityQuery,
    status: 204,
    audit: 'team_availability_delete',
    handler: ({ query, ctx }) =>
      audited(ctx, deleteTeamAvailability(ctx, query)),
  }),
});
