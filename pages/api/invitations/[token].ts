// pages/api/invitations/[token].ts
//
// LA route publique d'un jeton d'invitation, quelle que soit sa famille.
//
// GET  : ce que dit l'invitation, sans la consommer. C'est ce que la page
//        affiche AVANT de demander quoi que ce soit — on ne fait pas cliquer à
//        l'aveugle.
// POST : accepte (ou refuse, pour une invitation d'équipe) pour l'utilisateur
//        CONNECTÉ.
//
// WHY cette route est un aiguillage, et non « la route des invitations
// d'espace » : trois familles de jetons coexistent (cf.
// utils/invitations/resolveToken.ts) et deux d'entre elles produisent la même
// URL publique `/invitation/<token>`. Tant que cette route n'interrogeait
// qu'une table, tous les liens de l'autre famille répondaient « Invitation
// introuvable » — un lien parfaitement valide, refusé parce qu'il était arrivé
// par la bonne porte au mauvais guichet. On résout donc d'abord la FAMILLE,
// puis on applique ses règles.
//
// Un jeton de la famille `join-link` (lien d'équipe partageable) n'est pas
// refusé non plus : il est renvoyé vers la page qui sait le servir. Un lien
// collé à la main dans la mauvaise barre d'adresse doit atterrir, pas mourir.
//
// Route publique (pas `withStaffRoute`) : l'invité n'est, par construction, pas
// encore membre du staff.
//
// Le jeton est comparé par empreinte : la base ne contient jamais sa valeur en
// clair, et une lecture de la table ne donne donc aucun accès.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveUserFromToken } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  resolveInvitationToken,
  hashInvitationToken,
  isPlausibleInvitationToken,
  redirectPathForKind,
} from '@/utils/invitations/resolveToken';
import {
  getTeamInvitationView,
  actOnTeamInvitation,
  type TeamInviteAction,
} from '@/utils/teams/inviteByToken';

type TenantInvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

/** Un seul vocabulaire d'état pour l'invitation d'espace. */
function statusOf(inv: TenantInvitationRow, nowMs: number) {
  if (inv.accepted_at) return 'accepted' as const;
  if (inv.revoked_at) return 'revoked' as const;
  if (Date.parse(inv.expires_at) <= nowMs) return 'expired' as const;
  return 'pending' as const;
}

/**
 * Session de l'appelant, cookie OU Bearer.
 *
 * Les deux parcours qui mènent ici n'utilisent pas la même mécanique : l'espace
 * joueur porte un Bearer (`useSession`), le parcours staff un cookie Supabase.
 * N'en accepter qu'une rendait le 401 dépendant de la page d'origine.
 *
 * Le COOKIE l'emporte quand les deux sont présents : c'est la session du
 * navigateur qui a ouvert le lien, donc l'identité que la personne voit dans
 * l'interface. Faire gagner l'en-tête laisserait un `Authorization` résiduel —
 * celui d'un autre onglet, d'un client qui le pose systématiquement — décider à
 * la place de l'utilisateur, et produire un « cette invitation vise quelqu'un
 * d'autre » parfaitement incompréhensible.
 */
async function resolveCaller(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<User | null> {
  const {
    data: { user },
  } = await getServerClient(req, res).auth.getUser();
  if (user) return user;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return await resolveUserFromToken(authHeader.slice('Bearer '.length));
  }
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'invitation')) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
    case 'POST':
      break;
    default:
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;
  // Garde de FORME seulement. L'ancien seuil (`length < 32`) était calibré sur
  // le seul format d'espace (64 hex) et rejetait en 400 les jetons d'équipe
  // (43 caractères base64url) : un refus de longueur sur un jeton valide.
  if (!isPlausibleInvitationToken(token)) {
    return res
      .status(400)
      .json({ error: 'Invalid token.', code: 'INVALID_TOKEN' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const resolved = await resolveInvitationToken(token);

  // Jeton inconnu des trois familles : 404 sec. Ne pas distinguer « inconnu »
  // d'« expiré » ici n'apporte rien à un attaquant, mais distinguer aiderait à
  // balayer.
  if (!resolved) {
    return res
      .status(404)
      .json({ error: 'Invitation introuvable.', code: 'UNKNOWN_INVITATION' });
  }

  // ---------- Famille « lien d'équipe partageable » ----------
  // Elle a sa propre page (auto-inscription, pas d'acceptation nominative). On
  // ne la sert pas ici, on y conduit.
  if (resolved.kind === 'join-link') {
    return res.status(200).json({
      kind: 'join-link',
      redirectTo: redirectPathForKind('join-link', token),
    });
  }

  // ---------- Famille « invitation d'équipe » ----------
  if (resolved.kind === 'team') {
    if (req.method === 'GET') {
      const { status, body } = await getTeamInvitationView(token);
      return res.status(status).json({ kind: 'team', ...body });
    }

    const user = await resolveCaller(req, res);
    if (!user) {
      return res
        .status(401)
        .json({ error: 'Connexion requise.', code: 'AUTH_REQUIRED' });
    }

    const raw = (req.body ?? {}) as { action?: unknown };
    const action: TeamInviteAction =
      raw.action === 'reject' ? 'reject' : 'accept';
    const { status, body } = await actOnTeamInvitation(token, action, user);
    return res.status(status).json({ kind: 'team', ...body });
  }

  // ---------- Famille « invitation d'espace » (staff) ----------
  const { data, error } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('token_hash', hashInvitationToken(token))
    .maybeSingle();

  if (error) {
    logger.error('[invitations] lookup error', error);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!data) {
    // Le résolveur a vu la ligne à l'instant : si elle a disparu entre-temps,
    // c'est une suppression concurrente, pas un jeton inconnu.
    return res
      .status(404)
      .json({ error: 'Invitation introuvable.', code: 'UNKNOWN_INVITATION' });
  }

  const inv = data as TenantInvitationRow;
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, slug')
    .eq('id', inv.tenant_id)
    .maybeSingle();
  const tenantName = (tenant as { name?: string } | null)?.name ?? '';
  const status = statusOf(inv, Date.now());

  if (req.method === 'GET') {
    return res.status(200).json({
      kind: 'tenant',
      status,
      tenantName,
      role: inv.role,
      // L'adresse invitée, tronquée : elle sert à comprendre « ce n'est pas mon
      // compte » sans exposer une adresse complète à qui a le lien.
      emailHint: inv.email.replace(/^(.).*(@.*)$/, '$1***$2'),
      expiresAt: inv.expires_at,
    });
  }

  // ---------- POST : accepter ----------
  if (status !== 'pending') {
    return res.status(409).json({
      error:
        status === 'accepted'
          ? 'Cette invitation a déjà été acceptée.'
          : status === 'revoked'
            ? 'Cette invitation a été annulée.'
            : 'Cette invitation a expiré.',
      code: status.toUpperCase(),
    });
  }

  // Il faut être connecté : c'est le compte connecté qui reçoit l'accès.
  const user = await resolveCaller(req, res);
  if (!user) {
    return res
      .status(401)
      .json({ error: 'Connexion requise.', code: 'AUTH_REQUIRED' });
  }

  // L'invitation est nominative : accepter avec un autre compte donnerait un
  // accès à quelqu'un que personne n'a invité.
  if ((user.email ?? '').toLowerCase() !== inv.email.toLowerCase()) {
    return res.status(403).json({
      error:
        "Cette invitation a été envoyée à une autre adresse. Connectez-vous avec l'adresse invitée.",
      code: 'EMAIL_MISMATCH',
    });
  }

  // Compte staff : réutilisé s'il existe, créé sinon.
  let staffId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existing?.id) {
    staffId = existing.id as string;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin
      .from('staff')
      .insert({
        auth_user_id: user.id,
        email: inv.email,
        // Rôle GLOBAL le plus bas : l'invitation donne un accès à UN espace,
        // pas un rôle sur la plateforme. L'élévation vient de `tenant_staff`.
        role: 'caster',
        is_active: true,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      logger.error('[invitations] staff insert error', createErr);
      return res
        .status(500)
        .json({ error: 'Impossible de créer le compte staff.' });
    }
    staffId = created.id as string;
  }

  const { error: linkErr } = await supabaseAdmin
    .from('tenant_staff')
    .upsert(
      { tenant_id: inv.tenant_id, staff_id: staffId, role: inv.role },
      { onConflict: 'tenant_id,staff_id' }
    );
  if (linkErr) {
    logger.error('[invitations] tenant_staff upsert error', linkErr);
    return res.status(500).json({ error: 'Rattachement impossible.' });
  }

  const { error: markErr } = await supabaseAdmin
    .from('tenant_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_staff_id: staffId,
    })
    .eq('id', inv.id)
    .is('accepted_at', null);
  if (markErr) {
    // Le rattachement est fait : on ne rejoue pas l'erreur à la figure de
    // l'invité pour une écriture d'état.
    logger.error('[invitations] mark accepted error', markErr);
  }

  return res.status(200).json({
    kind: 'tenant',
    status: 'accepted',
    tenantName,
    role: inv.role,
  });
}
