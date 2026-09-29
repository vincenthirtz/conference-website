// features/admin/tournaments/routes/rosterUnlock.ts — …/[id]/roster-unlock
// POST : ouvre une fenêtre de déverrouillage temporaire du roster (5 min à
// 24 h) ; DELETE : la referme. L'admin ouvre, le capitaine travaille.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { CodedTournamentIdQuery, RosterUnlockBody } from '../schemas';
import { codedTournamentId } from '../service/common';
import { closeRosterUnlock, openRosterUnlock } from '../service/structure';

const RATE = { max: 20, windowMs: 60_000 };
const idOf = (raw: unknown) =>
  codedTournamentId(raw, 'Invalid tournament id.', 'INVALID_TOURNAMENT_ID');

export default defineAdminRoute({
  key: 'admin-roster-unlock',
  guard: { permission: 'manage_tournaments' },
  POST: mutate({
    query: CodedTournamentIdQuery,
    body: RosterUnlockBody,
    rateLimit: RATE,
    audit: 'update_tournament',
    handler: ({ query, body, ctx }) =>
      audited(ctx, openRosterUnlock(ctx, idOf(query.id), body)),
  }),
  DELETE: mutate({
    query: CodedTournamentIdQuery,
    rateLimit: RATE,
    audit: 'update_tournament',
    handler: ({ query, ctx }) =>
      audited(ctx, closeRosterUnlock(ctx, idOf(query.id))),
  }),
});
