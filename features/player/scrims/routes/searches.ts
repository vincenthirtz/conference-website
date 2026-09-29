// GET/POST/DELETE /api/teams/scrim-searches — recherche de scrim de MON
// équipe (R5) + alerte d'adversaire (R6). Droit : `manage_scrims`.
//
// Sujet `self` (comme avant la migration) : pas d'inspection ici.
// POST : corps validé par le service (message et code `INVALID_BODY`
// historiques) ; 201 à la création comme à la relance.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { closeMySearch, readMySearch, saveMySearch } from '../service/searches';

const TEAM = { permission: 'manage_scrims' } as const;
/** Plafond partagé par les trois méthodes, comme avant (30/min). */
const LIMIT = { max: 30, windowMs: 60_000 };

export default defineSubjectRoute({
  key: 'team-scrim-search',
  tenantResolution: 'async',
  GET: readSubject({
    team: TEAM,
    rateLimit: LIMIT,
    handler: ({ ctx }) => readMySearch({ ...ctx, userId: ctx.subject.userId }),
  }),
  POST: mutateSubject({
    team: TEAM,
    rateLimit: LIMIT,
    status: 201,
    handler: ({ ctx, req }) =>
      saveMySearch({ ...ctx, userId: ctx.subject.userId }, req.body),
  }),
  DELETE: mutateSubject({
    team: TEAM,
    rateLimit: LIMIT,
    handler: ({ ctx }) => closeMySearch({ ...ctx, userId: ctx.subject.userId }),
  }),
});
