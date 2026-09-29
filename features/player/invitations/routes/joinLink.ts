// GET/POST /api/teams/invite-links/by-token — le « lien d'équipe » côté
// visiteur (lot P11, garde `defineTokenRoute` ; la création des liens reste
// à ./index.ts, côté capitaine).
//
//   GET  ?token=…   → public : de quoi présenter l'équipe AVANT de demander
//                     à quelqu'un de se connecter (/rejoindre/[token]).
//   POST { token }  → INSCRIT l'appelante ; session Bearer OBLIGATOIRE — le
//                     seul endroit où le lien agit.
//
// Plafond historique 30/min, bucket `join-link-token`.

import {
  defineTokenRoute,
  RESPONSE_SENT,
  tokenMethod,
} from '@/utils/player/defineTokenRoute';
import { isValidInviteToken } from '@/utils/teams/inviteLinks';
import { joinByLink, viewJoinLink } from '../service/joinLink';

export default defineTokenRoute({
  key: 'join-link-token',
  rateLimit: { max: 30, windowMs: 60_000 },
  token: {
    from: 'query',
    isPlausible: isValidInviteToken,
    invalid: { status: 404, error: 'Ce lien est invalide ou expiré.' },
  },
  GET: tokenMethod({
    session: 'none',
    handler: async ({ ctx, res }) => {
      const { status, body } = await viewJoinLink(ctx);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
  POST: tokenMethod({
    session: 'required',
    tokenFrom: 'body',
    handler: async ({ ctx, req, res }) => {
      const { status, body } = await joinByLink(ctx, req.body);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
});
