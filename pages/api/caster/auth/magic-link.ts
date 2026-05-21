// pages/api/caster/auth/magic-link.ts
//
// Feature: Run-of-show — Lot 4.
// POST public : declenche un magic-link Supabase pour le caster login.
//
// Pourquoi un endpoint dedie plutot que d'appeler supabaseClient.auth.signInWithOtp
// cote browser :
//   - Anti-enumeration : on veut renvoyer un succes generique quel que soit
//     l'etat (email existant ou non). Le browser ne doit pas savoir si l'email
//     correspond a un caster.
//   - On utilise supabaseAdmin (admin.generateLink ou auth.signInWithOtp via
//     supabaseAdmin) pour eviter de creer un compte supabase si l'email n'existe
//     pas (sinon n'importe qui pourrait pollute auth.users).
//
// SECURITE :
//   - Aucune verification de cast_members.email cote serveur : cast_members
//     n'a PAS de colonne email. Le matching se fait au callback via
//     cast_members.auth_user_id = session.user.id.
//   - Pre-condition : le caster doit deja exister dans auth.users (cree par
//     l'admin via le pattern staff classique) ET son auth_user_id doit etre
//     populated sur sa fiche cast_members (manuel ou via UI admin).
//   - shouldCreateUser=false : on ne cree pas de compte si l'email est inconnu.
//     Si l'email n'est pas dans auth.users, supabase renvoie un faux "ok" et
//     aucun mail n'est envoye — comportement attendu (anti-enumeration).
//
// Body : { email: string }
// Reponse generique (toujours 200, jamais 4xx pour enumeration) :
//   { ok: true, message: 'Si tu es caster, tu vas recevoir un lien.' }

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const Schema = z.object({
  email: z.string().trim().email().max(254),
});

const GENERIC_OK = {
  ok: true as const,
  message:
    'Si tu es caster, un lien de connexion vient de t etre envoye par email. Verifie ta boite (et tes spams).',
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Rate-limit aggressif : empeche le spam d'emails / l'enumeration brute.
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'caster-auth-magic-link'
    )
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = Schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Meme en cas de validation echouee on renvoie un OK generique apres avoir
    // bouge le pointeur (anti-enumeration et anti-error-oracle). On ne veut pas
    // que le client distingue "email invalide" de "email inconnu".
    return res.status(200).json(GENERIC_OK);
  }

  const { email } = parsed.data;

  if (!supabaseAdmin) {
    logger.error('[caster/auth/magic-link] supabaseAdmin unavailable');
    return res.status(200).json(GENERIC_OK);
  }

  // Resoudre l URL de redirection. NEXT_PUBLIC_SITE_URL est prioritaire en prod
  // (Netlify), sinon on prend l Origin du request (dev / preview).
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
    (req.headers.origin
      ? String(req.headers.origin).replace(/\/+$/, '')
      : null);
  if (!baseUrl) {
    logger.error('[caster/auth/magic-link] no base url to redirect to');
    return res.status(200).json(GENERIC_OK);
  }
  const redirectTo = `${baseUrl}/caster/login/callback`;

  // signInWithOtp avec shouldCreateUser=false : si l email n existe pas dans
  // auth.users, supabase renvoie un succes silencieux (anti-enumeration cote
  // supabase) et aucun mail n est envoye. Cest exactement ce qu on veut.
  try {
    const { error } = await supabaseAdmin.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });
    if (error) {
      // Log mais ne leak rien au client.
      logger.warn('[caster/auth/magic-link] otp error (masked):', {
        code: error.status,
        message: error.message,
      });
    }
  } catch (err) {
    logger.error('[caster/auth/magic-link] unexpected error', err);
  }

  return res.status(200).json(GENERIC_OK);
}
