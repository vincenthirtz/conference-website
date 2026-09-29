// POST /api/teams/create-with-member — création d'équipe ANONYME depuis le
// wizard public /team/create (lot P11, garde `definePublicRoute`).
//
// Route PUBLIQUE qui crée des comptes (e-mails du roster) et envoie des
// e-mails : la garde applique, AVANT tout, les deux plafonds historiques
// (anti-rafale 3/5 min, puis 5/h — le premier atteint répond 429), puis le
// honeypot et le captcha HMAC. Corps : schéma de structure zod ; les règles
// et leurs codes (`NAME_REQUIRED`…) sont au service.

import {
  definePublicRoute,
  publicMethod,
} from '@/utils/player/definePublicRoute';
import { CreateTeamBody } from '../schemas';
import { createTeam } from '../service/createTeam';

export default definePublicRoute({
  key: 'create-team',
  rateLimits: [
    { max: 3, windowMs: 5 * 60 * 1000, key: 'create-team-burst' },
    { max: 5, windowMs: 60 * 60 * 1000, key: 'create-team' },
  ],
  antiBot: true,
  POST: publicMethod({
    body: CreateTeamBody,
    status: 201,
    handler: ({ ctx, body }) => createTeam(ctx, body),
  }),
});
