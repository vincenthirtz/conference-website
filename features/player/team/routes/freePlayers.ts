// GET /api/teams/free-players — joueuses libres du tenant, pour l'équipe
// gérée (lot P10, même contrat). `manage_roster` ; sujet = appelant.

import {
  defineSubjectRoute,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { listFreePlayers } from '../service/recruiting';

export default defineSubjectRoute({
  key: 'teams-free-players',
  tenantResolution: 'async',
  GET: readSubject({
    team: { permission: 'manage_roster' },
    rateLimit: { max: 30, windowMs: 60_000 },
    handler: ({ ctx }) => listFreePlayers(ctx),
  }),
});
