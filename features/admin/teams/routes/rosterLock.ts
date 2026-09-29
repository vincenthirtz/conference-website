// features/admin/teams/routes/rosterLock.ts — /api/admin/teams/[teamId]/roster-lock
// GET : verrou par tournoi d'inscription ; POST : ouvre une fenêtre POUR
// CETTE ÉQUIPE ; DELETE : la referme. 60 req/min pour les trois méthodes.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TeamRosterLockBody, TeamRosterLockQuery } from '../schemas';
import {
  getTeamRosterLock,
  relockTeamRoster,
  unlockTeamRoster,
} from '../service/rosterLock';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-team-roster-lock',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: TeamRosterLockQuery,
    rateLimit: LIMIT,
    handler: ({ query, ctx }) => getTeamRosterLock(ctx, query.teamId),
  }),
  POST: mutate({
    query: TeamRosterLockQuery,
    body: TeamRosterLockBody,
    rateLimit: LIMIT,
    audit: 'update_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, unlockTeamRoster(ctx, query.teamId, body)),
  }),
  DELETE: mutate({
    query: TeamRosterLockQuery,
    body: TeamRosterLockBody,
    rateLimit: LIMIT,
    audit: 'update_team',
    handler: ({ query, body, ctx }) =>
      audited(ctx, relockTeamRoster(ctx, query.teamId, body)),
  }),
});
