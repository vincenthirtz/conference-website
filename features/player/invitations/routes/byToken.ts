// GET/POST /api/invitations/[token] — LA route publique d'un jeton
// d'invitation, toutes familles (lot P11, garde `defineTokenRoute`).
//
// GET  : lecture publique, sans session, sans consommer le jeton.
// POST : session cookie OU Bearer (le cookie du navigateur qui a ouvert le
//        lien l'emporte). Session `optional` : le 401 `AUTH_REQUIRED` est
//        rendu par le service APRÈS la résolution de la famille, comme avant
//        (un jeton inconnu répond 404, un jeton consommé 409, même sans
//        session).
// Plafond historique : 20/min sur le bucket `invitation`, avant tout.

import {
  defineTokenRoute,
  RESPONSE_SENT,
  tokenMethod,
} from '@/utils/player/defineTokenRoute';
import { isPlausibleInvitationToken } from '@/utils/invitations/resolveToken';
import { respondToInvitation, viewInvitation } from '../service/byToken';

export default defineTokenRoute({
  key: 'invitation',
  rateLimit: { max: 20, windowMs: 60_000 },
  token: {
    from: 'query',
    isPlausible: isPlausibleInvitationToken,
    invalid: { status: 400, error: 'Invalid token.', code: 'INVALID_TOKEN' },
  },
  GET: tokenMethod({
    session: 'none',
    handler: async ({ ctx, res }) => {
      const { status, body } = await viewInvitation(ctx);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
  POST: tokenMethod({
    session: 'optional',
    sessionSource: 'cookie-or-bearer',
    handler: async ({ ctx, req, res }) => {
      const { status, body } = await respondToInvitation(ctx, req.body);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
});
