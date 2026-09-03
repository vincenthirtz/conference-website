// pages/api/invitations/[token].ts
//
// GET  : ce que dit une invitation, sans la consommer (nom de l'espace, rôle,
//        état). C'est ce que la page d'acceptation affiche AVANT de demander
//        quoi que ce soit — on ne fait pas cliquer à l'aveugle.
// POST : accepte l'invitation, pour l'utilisateur CONNECTÉ.
//
// Route publique (pas `withStaffRoute`) : l'invité n'est, par construction, pas
// encore membre du staff. C'est tout l'objet du lot — jusqu'ici on ne pouvait
// rattacher qu'un compte déjà existant (`404 STAFF_NOT_FOUND`).
//
// Le jeton est comparé par empreinte : la base ne contient jamais sa valeur en
// clair, et une lecture de la table ne donne donc aucun accès.
//
// L'acceptation crée le compte staff s'il n'existe pas, puis le rattache — dans
// cet ordre, et une seule fois : un jeton est à usage unique.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

type InvitationRow = {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

/** Un seul vocabulaire d'état, partagé par le GET et le POST. */
function statusOf(inv: InvitationRow, nowMs: number) {
  if (inv.accepted_at) return 'accepted' as const;
  if (inv.revoked_at) return 'revoked' as const;
  if (Date.parse(inv.expires_at) <= nowMs) return 'expired' as const;
  return 'pending' as const;
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
  if (!token || typeof token !== 'string' || token.length < 32) {
    return res
      .status(400)
      .json({ error: 'Invalid token.', code: 'INVALID_TOKEN' });
  }

  const { data, error } = await supabaseAdmin
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at, revoked_at')
    .eq('token_hash', sha256(token))
    .maybeSingle();

  if (error) {
    logger.error('[invitations] lookup error', error);
    return res.status(500).json({ error: 'Server error.' });
  }
  // Jeton inconnu : 404 sec. Ne pas distinguer « inconnu » de « expiré » ici
  // n'apporterait rien à un attaquant, mais distinguer aiderait à balayer.
  if (!data) {
    return res
      .status(404)
      .json({ error: 'Invitation introuvable.', code: 'UNKNOWN_INVITATION' });
  }

  const inv = data as InvitationRow;
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, slug')
    .eq('id', inv.tenant_id)
    .maybeSingle();
  const tenantName = (tenant as { name?: string } | null)?.name ?? '';
  const status = statusOf(inv, Date.now());

  if (req.method === 'GET') {
    return res.status(200).json({
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

  // Il faut être connecté : c'est le compte connecté qui reçoit l'accès. La
  // session vient du cookie Supabase, comme partout ailleurs sur le site.
  const {
    data: { user },
  } = await getServerClient(req, res).auth.getUser();
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

  // Compte staff : réutilisé s'il existe, créé sinon. C'est le cœur du lot —
  // jusqu'ici il fallait qu'il existe DÉJÀ.
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
    status: 'accepted',
    tenantName,
    role: inv.role,
  });
}
