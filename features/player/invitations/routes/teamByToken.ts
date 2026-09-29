// GET/POST /api/teams/invitations/by-token — façade HISTORIQUE du lien privé
// d'invitation d'équipe (lot P11, garde `defineTokenRoute`). Publiée au
// contrat OpenAPI : un client tiers peut encore la viser.
//
//   GET  ?token=…          → métadonnées publiques (équipe, rôle, e-mail masqué)
//   POST { token, action } → accepte / refuse ; session Bearer OBLIGATOIRE.
//
// Le lien n'authentifie jamais (≠ magic-link). Plafond historique 30/min,
// bucket `invite-by-token`.

import {
  defineTokenRoute,
  RESPONSE_SENT,
  tokenMethod,
} from '@/utils/player/defineTokenRoute';
import { isValidInviteToken } from '@/utils/teams/inviteLinks';
import {
  respondToTeamInvitation,
  viewTeamInvitation,
} from '../service/teamByToken';

export default defineTokenRoute({
  key: 'invite-by-token',
  rateLimit: { max: 30, windowMs: 60_000 },
  token: {
    from: 'query',
    isPlausible: isValidInviteToken,
    invalid: { status: 404, error: 'Invitation introuvable.' },
  },
  GET: tokenMethod({
    session: 'none',
    handler: async ({ ctx, res }) => {
      const { status, body } = await viewTeamInvitation(ctx);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
  POST: tokenMethod({
    session: 'required',
    tokenFrom: 'body',
    handler: async ({ ctx, req, res }) => {
      const { status, body } = await respondToTeamInvitation(ctx, req.body);
      res.status(status).json(body);
      return RESPONSE_SENT;
    },
  }),
});
