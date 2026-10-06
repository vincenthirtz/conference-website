// GET / PUT / DELETE /api/teams/opening — l'annonce « cette équipe cherche
// une joueuse » de l'équipe gérée (lot P8), rattachée par `team_id`.
// `manage_join_requests` : c'est le droit du recrutement (même que la bascule
// « ouvert aux demandes »). GET suit l'inspection staff ; les écritures sont
// l'affaire de l'appelante — le contact enregistré est l'email de SA session,
// un act-as y mettrait celui du staff.

import {
  defineSubjectRoute,
  mutateSubject,
  readSubject,
} from '@/utils/player/defineSubjectRoute';
import { TeamOpeningUpsertBody } from '../opening/schemas';
import {
  closeTeamOpening,
  getTeamOpening,
  upsertTeamOpening,
} from '../service/opening';

const RATE = { max: 20, windowMs: 60_000 } as const;
const TEAM = { permission: 'manage_join_requests' } as const;

export default defineSubjectRoute({
  key: 'team-opening',
  tenantResolution: 'async',
  inspectionAudit: 'view_captain_data',
  GET: readSubject({
    subject: 'follow',
    team: TEAM,
    rateLimit: RATE,
    cache: 'private, no-store',
    handler: ({ ctx }) => getTeamOpening(ctx, ctx.user),
  }),
  PUT: mutateSubject({
    team: TEAM,
    body: TeamOpeningUpsertBody,
    rateLimit: { max: 10, windowMs: 60_000 },
    handler: ({ body, ctx }) => upsertTeamOpening(ctx, ctx.user, body),
  }),
  DELETE: mutateSubject({
    team: TEAM,
    rateLimit: RATE,
    handler: ({ ctx }) => closeTeamOpening(ctx, ctx.user),
  }),
});
