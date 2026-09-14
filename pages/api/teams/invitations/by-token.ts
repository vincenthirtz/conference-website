// pages/api/teams/invitations/by-token.ts
//
// Le « lien privé » d'invitation d'équipe, côté API — façade HISTORIQUE.
//
//   GET  ?token=…            → métadonnées publiques (équipe, rôle, email masqué)
//   POST { token, action }   → accepte / refuse, session Bearer obligatoire
//
// La logique vit dans `utils/teams/inviteByToken.ts` et est partagée avec
// `/api/invitations/[token]`, la route que la page publique appelle désormais.
// Cette route-ci reste servie parce qu'elle est publiée au contrat OpenAPI et
// qu'un lien ou un client tiers peut encore la viser ; elle ne doit plus porter
// de règle qui lui soit propre, sinon les deux surfaces divergeront à nouveau.
//
// Sécurité : le lien n'authentifie jamais (≠ magic-link). Un lien qui fuite ne
// permet ni de se connecter, ni de rejoindre l'équipe à la place de l'invitée.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getTeamInvitationView,
  actOnTeamInvitation,
} from '@/utils/teams/inviteByToken';

const postSchema = z.object({
  token: z.string(),
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject'])),
});

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const rawToken = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;

  const { status, body } = await getTeamInvitationView(rawToken);
  return res.status(status).json(body);
}

const handlePost = withAuthRoute(async function post(req, res, { user }) {
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Action invalide : 'accept' ou 'reject' attendu." });
  }

  const { status, body } = await actOnTeamInvitation(
    parsed.data.token,
    parsed.data.action,
    user
  );
  return res.status(status).json(body);
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const isGet = req.method === 'GET';
  const isPost = req.method === 'POST';
  if (!isGet && !isPost) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Le jeton est un secret de 32 octets : un brute-force est hors de portée,
  // mais on plafonne quand même les sondages depuis une même IP.
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'invite-by-token')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (isGet) return handleGet(req, res);
  return handlePost(req, res);
}
