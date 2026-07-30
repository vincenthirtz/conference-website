// pages/api/teams/invitations/by-token.ts
//
// Le « lien privé » d'invitation (cf. utils/teams/inviteLinks.ts), côté API.
//
//   GET  ?token=…  → métadonnées PUBLIQUES minimales (équipe, rôle proposé,
//                    email masqué, expiration). Sert à afficher la page
//                    /invitation/[token] à quelqu'un qui n'est pas encore
//                    connecté. On n'expose ni l'id de la demande, ni l'email en
//                    clair, ni l'identité de l'inviteuse.
//   POST { token, action } → accepte / refuse. Passe par `withAuthRoute` : une
//                    session est OBLIGATOIRE, et elle doit être celle de la
//                    personne invitée.
//
// Sécurité : le lien n'authentifie jamais (≠ magic-link). Un lien qui fuite ne
// permet ni de se connecter, ni de rejoindre l'équipe à la place de l'invitée.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  acceptInvitation,
  rejectInvitation,
  findInvitationByTokenHash,
  type InvitationRow,
} from '@/utils/teams/invitations';
import { hashInviteToken, isValidInviteToken } from '@/utils/teams/inviteLinks';
import { logger } from '@/utils/logger';

/** "alice@domain.com" -> "a***@domain.com" (même convention que create-with-member). */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

const postSchema = z.object({
  token: z.string(),
  action: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(['accept', 'reject'])),
});

/**
 * Résout le jeton → invitation pending. Répond directement (404/409/410) et
 * renvoie `null` quand il n'y a rien d'exploitable.
 */
async function resolveInvitation(
  res: NextApiResponse,
  rawToken: unknown
): Promise<(InvitationRow & { tenant_id: string }) | null> {
  if (!isValidInviteToken(rawToken)) {
    res.status(404).json({ error: 'Invitation introuvable.' });
    return null;
  }
  const found = await findInvitationByTokenHash(hashInviteToken(rawToken));
  if (!found.ok) {
    res.status(found.status).json({ error: found.error });
    return null;
  }
  return found.data;
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const rawToken = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;

  const invitation = await resolveInvitation(res, rawToken);
  if (!invitation) return;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, slug, logo_url')
    .eq('id', invitation.team_id)
    .maybeSingle();

  return res.status(200).json({
    invitation: {
      team_name: team?.name ?? null,
      team_slug: team?.slug ?? null,
      team_logo_url: team?.logo_url ?? null,
      role: invitation.payload?.desired_role ?? 'player',
      as_captain: !!invitation.payload?.set_captain,
      battle_tag: invitation.payload?.battle_tag ?? null,
      specialty: invitation.payload?.specialty ?? null,
      invited_email: invitation.payload?.invite_email
        ? maskEmail(invitation.payload.invite_email)
        : null,
      expires_at: invitation.payload?.expires_at ?? null,
    },
  });
}

const handlePost = withAuthRoute(async function post(req, res, { user }) {
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Action invalide : 'accept' ou 'reject' attendu." });
  }

  const invitation = await resolveInvitation(res, parsed.data.token);
  if (!invitation) return;

  // L'appelante est-elle bien la destinataire ? Le lien seul ne suffit jamais.
  const sameUser = invitation.user_id === user.id;
  const invitedEmail = invitation.payload?.invite_email?.toLowerCase() ?? null;
  const sessionEmail = user.email?.toLowerCase() ?? null;
  const sameEmail =
    !!invitedEmail && !!sessionEmail && invitedEmail === sessionEmail;

  if (!sameUser && !sameEmail) {
    return res.status(403).json({
      error: 'Cette invitation ne t’est pas destinée.',
      code: 'NOT_INVITEE',
    });
  }

  // Correspondance par email mais sur un AUTRE compte auth : on ne bascule pas
  // l'invitation en douce vers ce compte — c'est une anomalie à trancher
  // humainement (comptes dupliqués sur la même adresse).
  if (!sameUser) {
    logger.error('[invite-by-token] email match on a different auth user', {
      invitationUserId: invitation.user_id,
      sessionUserId: user.id,
    });
    return res.status(409).json({
      error:
        'Cette invitation vise un autre compte lié à la même adresse. Contacte l’équipe qui t’a invitée.',
      code: 'ACCOUNT_MISMATCH',
    });
  }

  const tenantId = invitation.tenant_id;

  if (parsed.data.action === 'reject') {
    const result = await rejectInvitation(tenantId, invitation.id, user.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(200).json({ success: true, action: 'reject' });
  }

  const result = await acceptInvitation(tenantId, invitation.id, user.id);
  if (!result.ok) {
    // Même convention que /api/player/invitations/[demandeId] : le conflit
    // « déjà dans une équipe » est un 409 sur la surface web.
    const status =
      result.status === 400 && /déjà partie d'une équipe/i.test(result.error)
        ? 409
        : result.status;
    return res.status(status).json({ error: result.error });
  }

  return res.status(200).json({
    success: true,
    action: 'accept',
    teamId: result.data.teamId,
    promotedToCaptain: !!result.data.promotedToCaptain,
  });
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
